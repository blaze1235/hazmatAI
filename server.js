const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const SYSTEM_PROMPT = require('./systemPrompt');
const { startTelegramBot } = require('./telegramBot');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
});

const PORT = process.env.PORT || 3000;
const MODEL = 'gemini-2.0-flash';

const genAI = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY) : null;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: Boolean(genAI) });
});

app.post('/api/chat', upload.array('images', 6), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({
      error: 'GOOGLE_API_KEY is not configured on the server.',
    });
  }

  try {
    const history = req.body.history ? JSON.parse(req.body.history) : [];
    const message = req.body.message || '';
    const files = req.files || [];

    const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: SYSTEM_PROMPT });
    const content = [];

    if (message.trim()) {
      content.push({ text: message });
    }

    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) continue;
      content.push({
        inlineData: {
          mimeType: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    }

    if (content.length === 0) {
      return res.status(400).json({ error: 'Send a message and/or at least one BOL photo.' });
    }

    const chatHistory = history.map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: msg.content.map((part) => {
        if (part.type === 'text') return { text: part.text };
        if (part.type === 'image') {
          return {
            inlineData: {
              mimeType: part.source.media_type,
              data: part.source.data,
            },
          };
        }
      }),
    }));

    const chat = model.startChat({ history: chatHistory });
    const response = await chat.sendMessage(content);
    const reply = response.response.text();

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
});

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
