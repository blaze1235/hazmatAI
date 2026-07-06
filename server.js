const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const SYSTEM_PROMPT = require('./systemPrompt');
const { startTelegramBot } = require('./telegramBot');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
});

const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, configured: Boolean(anthropic) });
});

app.post('/api/chat', upload.array('images', 6), async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({
      error: 'ANTHROPIC_API_KEY is not configured on the server.',
    });
  }

  try {
    const history = req.body.history ? JSON.parse(req.body.history) : [];
    const message = req.body.message || '';
    const files = req.files || [];

    const content = [];
    if (message.trim()) {
      content.push({ type: 'text', text: message });
    }
    for (const file of files) {
      if (!file.mimetype.startsWith('image/')) continue;
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.mimetype,
          data: file.buffer.toString('base64'),
        },
      });
    }

    if (content.length === 0) {
      return res.status(400).json({ error: 'Send a message and/or at least one BOL photo.' });
    }

    const messages = [...history, { role: 'user', content }];

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    });

    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

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
  if (anthropic) {
    startTelegramBot({ anthropic, model: MODEL, systemPrompt: SYSTEM_PROMPT });
  } else {
    console.warn('TELEGRAM_BOT_TOKEN is set but ANTHROPIC_API_KEY is missing; Telegram bot not started.');
  }
}
