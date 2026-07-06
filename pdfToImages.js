const path = require('path');
const { createCanvas, DOMMatrix, Path2D } = require('@napi-rs/canvas');

if (typeof global.DOMMatrix === 'undefined') global.DOMMatrix = DOMMatrix;
if (typeof global.Path2D === 'undefined') global.Path2D = Path2D;

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const STANDARD_FONT_DATA_URL = path.join(
  path.dirname(require.resolve('pdfjs-dist/package.json')),
  'standard_fonts/'
) + '/';

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function pdfToText(buffer, maxPages = 5) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  let text = '';

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items) {
      line += item.str;
      line += item.hasEOL ? '\n' : ' ';
    }
    text += line + '\n';
    page.cleanup();
  }

  await pdf.destroy();
  return { text, numPages: pdf.numPages, pagesRead: pageCount };
}

async function pdfToImages(buffer, maxPages = 3) {
  const canvasFactory = new NodeCanvasFactory();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    canvasFactory,
    disableFontFace: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  });
  const pdf = await loadingTask.promise;
  const images = [];
  const pageCount = Math.min(pdf.numPages, maxPages);

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

    await page.render({ canvasContext: context, viewport, canvasFactory }).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    images.push({ mimeType: 'image/png', data: pngBuffer.toString('base64') });

    page.cleanup();
  }

  await pdf.destroy();
  return images;
}

module.exports = { pdfToImages, pdfToText };
