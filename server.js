const express = require('express');
const multer = require('multer');
const path = require('path');
const { analyzeShipment, preloadOcr } = require('./analyzer');
const { startTelegramBot } = require('./telegramBot');
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

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

app.get('/admin', basicAuth, renderAdminPage);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, engine: 'rules' });
});

app.post('/api/chat', upload.array('files', 6), async (req, res) => {
  const message = req.body.message || '';
  const sessionId = req.body.sessionId || null;
  const files = req.files || [];

  if (!message.trim() && files.length === 0) {
    return res.status(400).json({ error: 'Send a message and/or at least one BOL photo or PDF.' });
  }

  const fileTypes = files
    .map((f) => (f.mimetype === 'application/pdf' ? 'pdf' : f.mimetype))
    .join(', ');

  try {
    const { reply } = await analyzeShipment({ message, files });

    res.json({ reply });
    logAnalysis({
      source: 'web',
      sessionId,
      message,
      fileCount: files.length,
      fileTypes,
      reply,
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Failed to process the file. Please try again.' });
    logAnalysis({
      source: 'web',
      sessionId,
      message,
      fileCount: files.length,
      fileTypes,
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
  preloadOcr();

  app.listen(PORT, () => {
    console.log(`PlacardBot listening on port ${PORT}`);
  });

  if (process.env.TELEGRAM_BOT_TOKEN) {
    startTelegramBot();
  }
});
