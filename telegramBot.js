const { TelegramBot } = require('node-telegram-bot-api');
const { pdfToImages } = require('./pdfToImages');
const { logAnalysis } = require('./db');

const MAX_HISTORY = 16;
const TELEGRAM_MSG_LIMIT = 4000;
const MEDIA_GROUP_DEBOUNCE_MS = 1500;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

const WELCOME_TEXT =
  "👋 I'm PlacardBot, your DOT/PHMSA HAZMAT placarding assistant.\n\n" +
  "Send me a Bill of Lading photo or PDF (or a few, for the same shipment), " +
  "or just type the UN number/quantity, and I'll tell you exactly which " +
  "placards are required under 49 CFR Part 172.";

function chunkText(text, size = TELEGRAM_MSG_LIMIT) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [text];
}

function startTelegramBot({ genAI, model, systemPrompt }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const bot = new TelegramBot(token, { polling: true });
  const histories = new Map();
  const mediaGroups = new Map();

  function getHistory(chatId) {
    if (!histories.has(chatId)) histories.set(chatId, []);
    return histories.get(chatId);
  }

  async function downloadFileAsBuffer(fileId) {
    const url = await bot.getFileLink(fileId);
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  }

  async function respond(chatId, googleContent, meta = {}) {
    const history = getHistory(chatId);
    const msgModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
    const chatHistory = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: msg.parts,
    }));

    const messageText = googleContent.filter((p) => p.text).map((p) => p.text).join(' ');

    try {
      await bot.sendChatAction(chatId, 'typing');
      const chat = msgModel.startChat({ history: chatHistory });
      const response = await chat.sendMessage(googleContent);
      const reply = response.response.text();

      history.push({ role: 'user', parts: googleContent });
      history.push({ role: 'model', parts: [{ text: reply }] });

      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }

      for (const chunk of chunkText(reply)) {
        await bot.sendMessage(chatId, chunk);
      }

      logAnalysis({
        source: 'telegram',
        sessionId: String(chatId),
        message: messageText,
        fileCount: meta.fileCount || 0,
        fileTypes: meta.fileTypes || null,
        reply,
      });
    } catch (err) {
      console.error('Telegram bot error:', err);
      await bot.sendMessage(chatId, '⚠️ Something went wrong analyzing that. Please try again.');
      logAnalysis({
        source: 'telegram',
        sessionId: String(chatId),
        message: messageText,
        fileCount: meta.fileCount || 0,
        fileTypes: meta.fileTypes || null,
        error: err.message,
      });
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
      const buffer = await downloadFileAsBuffer(largest.file_id);
      const image = { mimeType: 'image/jpeg', data: buffer.toString('base64') };
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
          if (group.caption) content.push({ text: group.caption });
          for (const photo of group.photos) {
            content.push({ inlineData: photo });
          }
          respond(group.chatId, content, { fileCount: group.photos.length, fileTypes: 'image/jpeg' });
        }, MEDIA_GROUP_DEBOUNCE_MS);
      } else {
        const content = [];
        if (caption) content.push({ text: caption });
        content.push({ inlineData: image });
        await respond(chatId, content, { fileCount: 1, fileTypes: 'image/jpeg' });
      }
    } catch (err) {
      console.error('Telegram photo handling error:', err);
      await bot.sendMessage(msg.chat.id, '⚠️ Could not download that photo. Please try sending it again.');
    }
  });

  bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const doc = msg.document;
    const caption = msg.caption || '';

    try {
      if (doc.file_size && doc.file_size > MAX_PDF_BYTES) {
        await bot.sendMessage(chatId, '⚠️ That file is too large (max 15MB).');
        return;
      }

      const buffer = await downloadFileAsBuffer(doc.file_id);
      const content = [];
      let fileTypes;

      if (doc.mime_type === 'application/pdf') {
        const pages = await pdfToImages(buffer);
        if (caption) content.push({ text: caption });
        for (const page of pages) content.push({ inlineData: page });
        fileTypes = `pdf(${pages.length}p)`;
      } else if (doc.mime_type && doc.mime_type.startsWith('image/')) {
        if (caption) content.push({ text: caption });
        content.push({ inlineData: { mimeType: doc.mime_type, data: buffer.toString('base64') } });
        fileTypes = doc.mime_type;
      } else {
        await bot.sendMessage(chatId, '⚠️ Unsupported file type. Please send a photo or PDF of the BOL.');
        return;
      }

      await respond(chatId, content, { fileCount: 1, fileTypes });
    } catch (err) {
      console.error('Telegram document handling error:', err);
      await bot.sendMessage(chatId, '⚠️ Could not process that file. Please try again.');
    }
  });

  bot.on('message', async (msg) => {
    if (msg.photo || msg.document || !msg.text || msg.text.startsWith('/')) return;
    await respond(msg.chat.id, [{ text: msg.text }]);
  });

  bot.on('polling_error', (err) => console.error('Telegram polling error:', err.message));

  console.log('Telegram bot started (polling mode)');
  return bot;
}

module.exports = { startTelegramBot };
