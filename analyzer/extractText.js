const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const { pdfToImages, pdfToText } = require('../pdfToImages');

// Tesseract downloads eng.traineddata (~11MB) on first use and caches it here.
const TESSDATA_DIR = path.join(__dirname, '..', '.tessdata');

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    fs.mkdirSync(TESSDATA_DIR, { recursive: true });
    workerPromise = createWorker('eng', 1, { cachePath: TESSDATA_DIR });
    workerPromise.catch((err) => {
      console.error('Failed to start OCR worker:', err.message);
      workerPromise = null;
    });
  }
  return workerPromise;
}

// Warm up the OCR worker at server start so the first request isn't slow.
function preloadOcr() {
  getWorker().catch(() => {});
}

async function ocrImage(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  return data.text || '';
}

// A digital PDF's text layer is preferred; if it's a scan (little/no text),
// render pages to images and OCR them instead.
const MIN_TEXT_PER_PAGE = 40;

async function extractFromPdf(buffer) {
  const { text, pagesRead } = await pdfToText(buffer);
  if (text.replace(/\s+/g, '').length >= MIN_TEXT_PER_PAGE * pagesRead) {
    return { text, method: 'pdf-text' };
  }
  const pages = await pdfToImages(buffer);
  let ocrText = '';
  for (const page of pages) {
    ocrText += (await ocrImage(Buffer.from(page.data, 'base64'))) + '\n';
  }
  return { text: ocrText, method: 'pdf-ocr' };
}

// files: [{ mimetype, buffer }] (multer-style). Returns combined text + methods used.
async function extractText(files) {
  let combined = '';
  const methods = [];

  for (const file of files) {
    if (file.mimetype === 'application/pdf') {
      const { text, method } = await extractFromPdf(file.buffer);
      combined += text + '\n';
      methods.push(method);
    } else if (file.mimetype.startsWith('image/')) {
      combined += (await ocrImage(file.buffer)) + '\n';
      methods.push('ocr');
    }
  }

  return { text: combined, methods };
}

module.exports = { extractText, preloadOcr };
