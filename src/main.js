import { initCanvasView, setImage, getCanvas, hasContent } from './canvasView.js';
import { setStatus, updateImageInfo, resetImageInfo } from './status.js';
import { initExportMenu } from './exportUI.js';
import { setCurrentImage } from './documentState.js';
import { canvasToGB7Blob } from './exportGB7.js';
import { initMaskUI, syncMaskUI, isMaskVisible } from './maskUI.js';
import {
  loadRasterImage, loadGB7Image, detectFormat, assertSupported,
  canvasToBlob, downloadBlob,
} from './imageIO.js';

const canvas = document.getElementById('mainCanvas');
const openBtn = document.getElementById('openBtn');
const fileInput = document.getElementById('fileInput');
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');
const maskToggle = document.getElementById('maskToggle');
const maskHint = document.getElementById('maskHint');

initCanvasView(canvas);
initMaskUI({
  checkboxEl: maskToggle,
  hintEl: maskHint,
  onToggle: (showMask) => {
    // обновить подсказку
    syncMaskUI({ hasImage: hasContent(), hasMask: currentHasMask });
  },
});
syncMaskUI({ hasImage: false, hasMask: false });

// сохраняем последнее «есть ли маска у текущего изображения»,
// чтобы syncMaskUI работал из onToggle
let currentHasMask = false;

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
      // ImageData без применения маски; маска отдельно
      setImage(loaded.imageData, loaded.mask);
      currentHasMask = loaded.hasMask;
      updateImageInfo({ width: loaded.width, height: loaded.height, depth: 7, format: 'gb7' });
      setCurrentImage({ ...loaded, fileName: file.name });
      syncMaskUI({ hasImage: true, hasMask: loaded.hasMask });
      // ставим галку «показывать маску» по умолчанию
      maskToggle.checked = true;
      setStatus('ok', loaded.hasMask ? 'Готово (с маской)' : 'Готово');
      return;
    }

    if (format === 'raster') {
      const { width, height, imageData, depth } = await loadRasterImage(file);
      setImage(imageData, null);
      currentHasMask = false;
      updateImageInfo({ width, height, depth, format: 'raster' });
      setCurrentImage({ width, height, imageData, depth, format: 'raster', hasMask: false, mask: null, pixels: null, fileName: file.name });
      syncMaskUI({ hasImage: true, hasMask: false });
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

    let blob, filename;
    if (format === 'gb7') {
      blob = await canvasToGB7Blob(c);
      filename = 'image.gb7';
    } else {
      blob = await canvasToBlob(c, format);
      filename = format === 'jpeg' ? 'image.jpg' : 'image.png';
    }

    downloadBlob(blob, filename);
    setStatus('ok', 'Готово');
  } catch (err) {
    console.error(err);
    setStatus('error', `Ошибка: ${err.message}`);
  }
}