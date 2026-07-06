const { TelegramBot } = require('node-telegram-bot-api');
const { analyzeShipment } = require('./analyzer');
const { logAnalysis } = require('./db');

const TELEGRAM_MSG_LIMIT = 4000;
const MEDIA_GROUP_DEBOUNCE_MS = 1500;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const WELCOME_TEXT =
  "👋 I'm PlacardBot, your DOT/PHMSA HAZMAT placarding assistant.\n\n" +
  'Send me a Bill of Lading photo or PDF (or a few, for the same shipment), ' +
  "or just type the UN number and weight (e.g. \"UN1203 8500 lbs\"), and I'll " +
  'tell you which placards are required under 49 CFR Part 172.';

function chunkText(text, size = TELEGRAM_MSG_LIMIT) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [text];
}

function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  const bot = new TelegramBot(token, { polling: true });
  const mediaGroups = new Map();

  async function downloadFileAsBuffer(fileId) {
    const url = await bot.getFileLink(fileId);
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  }

  // files: [{ mimetype, buffer }]
  async function respond(chatId, message, files, meta = {}) {
    try {
      await bot.sendChatAction(chatId, 'typing');
      const { reply } = await analyzeShipment({ message, files });

      for (const chunk of chunkText(reply)) {
        await bot.sendMessage(chatId, chunk);
      }

      logAnalysis({
        source: 'telegram',
        sessionId: String(chatId),
        message,
        fileCount: files.length,
        fileTypes: meta.fileTypes || null,
        reply,
      });
    } catch (err) {
      console.error('Telegram bot error:', err);
      await bot.sendMessage(chatId, '⚠️ Something went wrong analyzing that. Please try again.');
      logAnalysis({
        source: 'telegram',
        sessionId: String(chatId),
        message,
        fileCount: files.length,
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
      const file = { mimetype: 'image/jpeg', buffer };
      const groupId = msg.media_group_id;

      if (groupId) {
        if (!mediaGroups.has(groupId)) {
          mediaGroups.set(groupId, { chatId, caption: '', files: [] });
        }
        const group = mediaGroups.get(groupId);
        group.files.push(file);
        if (caption) group.caption = caption;

        clearTimeout(group.timer);
        group.timer = setTimeout(() => {
          mediaGroups.delete(groupId);
          respond(group.chatId, group.caption, group.files, { fileTypes: 'image/jpeg' });
        }, MEDIA_GROUP_DEBOUNCE_MS);
      } else {
        await respond(chatId, caption, [file], { fileTypes: 'image/jpeg' });
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
      if (doc.file_size && doc.file_size > MAX_FILE_BYTES) {
        await bot.sendMessage(chatId, '⚠️ That file is too large (max 15MB).');
        return;
      }

      const isPdf = doc.mime_type === 'application/pdf';
      const isImage = doc.mime_type && doc.mime_type.startsWith('image/');
      if (!isPdf && !isImage) {
        await bot.sendMessage(chatId, '⚠️ Unsupported file type. Please send a photo or PDF of the BOL.');
        return;
      }

      const buffer = await downloadFileAsBuffer(doc.file_id);
      await respond(chatId, caption, [{ mimetype: doc.mime_type, buffer }], {
        fileTypes: isPdf ? 'pdf' : doc.mime_type,
      });
    } catch (err) {
      console.error('Telegram document handling error:', err);
      await bot.sendMessage(chatId, '⚠️ Could not process that file. Please try again.');
    }
  });

  bot.on('message', async (msg) => {
    if (msg.photo || msg.document || !msg.text || msg.text.startsWith('/')) return;
    await respond(msg.chat.id, msg.text, []);
  });

  bot.on('polling_error', (err) => console.error('Telegram polling error:', err.message));

  console.log('Telegram bot started (polling mode)');
  return bot;
}

module.exports = { startTelegramBot };
