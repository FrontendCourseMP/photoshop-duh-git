import {
  loadRasterImage, detectFormat, assertSupported,
  canvasToBlob, downloadBlob
} from './imageIO.js';
import { initCanvasView, renderImageData, getCanvas, hasContent } from './canvasView.js';
import { setStatus, updateImageInfo, resetImageInfo } from './status.js';
import { decodeGB7, gb7ToImageData } from './gb7.js';
import { initExportMenu } from './exportUI.js';
import { setCurrentImage } from "./documentState.js";

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
      const loaded = await loadGB7Image(file);
      renderImageData(loaded.imageData);
      updateImageInfo({ width: loaded.width, height: loaded.height, depth: loaded.depth, format: 'gb7' });
      setCurrentImage({ ...loaded, fileName: file.name });
      setStatus('ok', loaded.hasMask ? 'Готово (с маской)' : 'Готово');
      return;
    }

    if (format === 'raster') {
      const { width, height, imageData, depth } = await loadRasterImage(file);
      renderImageData(imageData);
      updateImageInfo({ width, height, depth, format: 'raster' });
      setCurrentImage({ width, height, imageData, depth, format: 'raster', hasMask: false, fileName: file.name });
      setStatus('ok', 'Готово');
      return;
    }

    throw new Error('Не удалось определить формат файла');
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

/**
 * Загрузка GB7-файла: декодирование и подготовка ImageData для отображения.
 * @param {File} file
 * @returns {Promise<{
 *   width: number, height: number, imageData: ImageData,
 *   depth: 7, format: 'gb7', hasMask: boolean,
 *   pixels: Uint8Array, mask: Uint8Array|null
 * }>}
 */
export async function loadGB7Image(file) {
  const buffer = await file.arrayBuffer();
  const decoded = decodeGB7(buffer);

  const imageData = gb7ToImageData(decoded, { applyMask: true });

  return {
    width: decoded.width,
    height: decoded.height,
    imageData,
    depth: 7,
    format: 'gb7',
    hasMask: decoded.hasMask,
    pixels: decoded.pixels,
    mask: decoded.mask,
  };
}