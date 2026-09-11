import { loadRasterImage, detectFormat, assertSupported } from './imageIO.js';
import { initCanvasView, renderImageData, updateStatus, setStatusText } from './canvasView.js';

const canvas = document.getElementById('mainCanvas');
const openBtn = document.getElementById('openBtn');
const fileInput = document.getElementById('fileInput');

initCanvasView(canvas);

openBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  await handleFile(file);
  fileInput.value = ''; // чтобы можно было открыть тот же файл повторно
});

async function handleFile(file) {
  try {
    assertSupported(file);
    setStatusText('Загрузка…');

    const format = await detectFormat(file);

    if (format === 'gb7') {
      // TODO: реализуем на шаге 3–5
      throw new Error('Формат GB7 пока не поддерживается');
    }

    const { width, height, imageData, depth } = await loadRasterImage(file);
    renderImageData(imageData);
    updateStatus({ width, height, depth, format: 'raster' });
    setStatusText('Готово');
  } catch (err) {
    console.error(err);
    setStatusText(`Ошибка: ${err.message}`);
  }
}