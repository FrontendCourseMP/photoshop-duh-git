import {
  loadRasterImage, detectFormat, assertSupported,
  canvasToBlob, downloadBlob,
} from './imageIO.js';
import { initCanvasView, renderImageData, getCanvas, hasContent } from './canvasView.js';
import { setStatus, updateImageInfo, resetImageInfo } from './status.js';
import { initExportMenu } from './exportUI.js';

const canvas = document.getElementById('mainCanvas');
const openBtn = document.getElementById('openBtn');
const fileInput = document.getElementById('fileInput');
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');

initCanvasView(canvas);

// ——— Открытие файла ———
openBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await handleFile(file);
  fileInput.value = '';
});

async function handleFile(file) {
  try {
    assertSupported(file);
    setStatus('busy', 'Загрузка…');

    const format = await detectFormat(file);
    if (format === 'gb7') {
      throw new Error('Формат GB7 пока не поддерживается');
    }

    const { width, height, imageData, depth } = await loadRasterImage(file);
    renderImageData(imageData);
    updateImageInfo({ width, height, depth, format: 'raster' });
    setStatus('ok', 'Готово');
  } catch (err) {
    console.error(err);
    resetImageInfo();
    setStatus('error', `Ошибка: ${err.message}`);
  }
}

// ——— Экспорт ———
initExportMenu({
  button: exportBtn,
  menu: exportMenu,
  onSelect: (fmt) => exportImage(fmt),
});

async function exportImage(format) {
  const c = getCanvas();
  if (!c || !hasContent()) {
    setStatus('error', 'Нечего экспортировать');
    return;
  }
  try {
    setStatus('busy', 'Экспорт…');
    const blob = await canvasToBlob(c, format);
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    downloadBlob(blob, `image.${ext}`);
    setStatus('ok', 'Готово');
  } catch (err) {
    console.error(err);
    setStatus('error', `Ошибка: ${err.message}`);
  }
}