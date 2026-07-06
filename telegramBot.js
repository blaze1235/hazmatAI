const TelegramBot = require('node-telegram-bot-api');

const MAX_HISTORY = 16;
const TELEGRAM_MSG_LIMIT = 4000;
const MEDIA_GROUP_DEBOUNCE_MS = 1500;

const WELCOME_TEXT =
  "👋 I'm PlacardBot, your DOT/PHMSA HAZMAT placarding assistant.\n\n" +
  "Send me a Bill of Lading photo (or a few photos of the same shipment), " +
  "or just type the UN number/quantity, and I'll tell you exactly which " +
  "placards are required under 49 CFR Part 172.";

function chunkText(text, size = TELEGRAM_MSG_LIMIT) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [text];
}

function startTelegramBot({ anthropic, model, systemPrompt }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const bot = new TelegramBot(token, { polling: true });
  const histories = new Map();
  const mediaGroups = new Map();

  function getHistory(chatId) {
    if (!histories.has(chatId)) histories.set(chatId, []);
    return histories.get(chatId);
  }

  async function downloadPhotoAsBase64(fileId) {
    const url = await bot.getFileLink(fileId);
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    return { media_type: 'image/jpeg', data: buffer.toString('base64') };
  }

  async function respond(chatId, content) {
    const history = getHistory(chatId);
    history.push({ role: 'user', content });

    try {
      await bot.sendChatAction(chatId, 'typing');
      const response = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: history,
      });

      const reply = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      history.push({ role: 'assistant', content: [{ type: 'text', text: reply }] });
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }

      for (const chunk of chunkText(reply)) {
        await bot.sendMessage(chatId, chunk);
      }
    } catch (err) {
      console.error('Telegram bot error:', err);
      history.pop();
      await bot.sendMessage(chatId, '⚠️ Something went wrong analyzing that. Please try again.');
    }
  }

  bot.onText(/^\/start$/, (msg) => {
    bot.sendMessage(msg.chat.id, WELCOME_TEXT);
  });

  bot.on('photo', async (msg) => {
    try {
      const chatId = msg.chat.id;
      const caption = msg.caption || '';
      const largest = msg.photo[msg.photo.length - 1];
      const image = await downloadPhotoAsBase64(largest.file_id);
      const groupId = msg.media_group_id;

      if (groupId) {
        if (!mediaGroups.has(groupId)) {
          mediaGroups.set(groupId, { chatId, caption: '', photos: [] });
        }
        const group = mediaGroups.get(groupId);
        group.photos.push(image);
        if (caption) group.caption = caption;

        clearTimeout(group.timer);
        group.timer = setTimeout(() => {
          mediaGroups.delete(groupId);
          const content = [];
          if (group.caption) content.push({ type: 'text', text: group.caption });
          for (const photo of group.photos) {
            content.push({ type: 'image', source: { type: 'base64', ...photo } });
          }
          respond(group.chatId, content);
        }, MEDIA_GROUP_DEBOUNCE_MS);
      } else {
        const content = [];
        if (caption) content.push({ type: 'text', text: caption });
        content.push({ type: 'image', source: { type: 'base64', ...image } });
        await respond(chatId, content);
      }
    } catch (err) {
      console.error('Telegram photo handling error:', err);
      await bot.sendMessage(msg.chat.id, '⚠️ Could not download that photo. Please try sending it again.');
    }
  });

  bot.on('message', async (msg) => {
    if (msg.photo || !msg.text || msg.text.startsWith('/')) return;
    await respond(msg.chat.id, [{ type: 'text', text: msg.text }]);
  });

  bot.on('polling_error', (err) => console.error('Telegram polling error:', err.message));

  console.log('Telegram bot started (polling mode)');
  return bot;
}

module.exports = { startTelegramBot };
