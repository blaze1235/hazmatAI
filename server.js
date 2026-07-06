const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const SYSTEM_PROMPT = require('./systemPrompt');
const { startTelegramBot } = require('./telegramBot');
const { pdfToImages } = require('./pdfToImages');
const { initDb, logAnalysis } = require('./db');
const { basicAuth, renderAdminPage } = require('./admin');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 6 },
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      return cb(null, true);
    }
    cb(new Error('Only image files and PDFs are supported.'));
  },
});

const PORT = process.env.PORT || 3000;
const MODEL = 'gemini-2.0-flash';

const genAI = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

app.get('/admin', basicAuth, renderAdminPage);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: Boolean(genAI) });
});

async function filesToParts(files) {
  const parts = [];
  const types = [];

  for (const file of files) {
    if (file.mimetype.startsWith('image/')) {
      parts.push({ inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } });
      types.push(file.mimetype);
    } else if (file.mimetype === 'application/pdf') {
      const pages = await pdfToImages(file.buffer);
      for (const page of pages) {
        parts.push({ inlineData: page });
      }
      types.push(`pdf(${pages.length}p)`);
    }
  }

  return { parts, types };
}

app.post('/api/chat', upload.array('files', 6), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({
      error: 'GOOGLE_API_KEY is not configured on the server.',
    });
  }

  const message = req.body.message || '';
  const sessionId = req.body.sessionId || null;
  const files = req.files || [];

  try {
    const history = req.body.history ? JSON.parse(req.body.history) : [];
    const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: SYSTEM_PROMPT });
    const content = [];

    if (message.trim()) {
      content.push({ text: message });
    }

    const { parts, types } = await filesToParts(files);
    content.push(...parts);

    if (content.length === 0) {
      return res.status(400).json({ error: 'Send a message and/or at least one BOL photo or PDF.' });
    }

    const chat = model.startChat({ history });
    const response = await chat.sendMessage(content);
    const reply = response.response.text();

    res.json({ reply });
    logAnalysis({
      source: 'web',
      sessionId,
      message,
      fileCount: files.length,
      fileTypes: types.join(', '),
      reply,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
    logAnalysis({
      source: 'web',
      sessionId,
      message,
      fileCount: files.length,
      error: err.message,
    });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

initDb().finally(() => {
  app.listen(PORT, () => {
    console.log(`PlacardBot listening on port ${PORT}`);
  });

  if (process.env.TELEGRAM_BOT_TOKEN) {
    if (genAI) {
      startTelegramBot({ genAI, model: MODEL, systemPrompt: SYSTEM_PROMPT });
    } else {
      console.warn('TELEGRAM_BOT_TOKEN is set but GOOGLE_API_KEY is missing; Telegram bot not started.');
    }
  }
});
