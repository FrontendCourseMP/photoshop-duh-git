import { initCanvasView, setImage, getCanvas, hasContent, getEnabledChannels } from './ui/canvasView.js';
import { initZoomUI, fitToScreen, zoomIn, zoomOut, zoom100 } from './ui/zoomUI.js';
import { setStatus, updateImageInfo, resetImageInfo } from './ui/status.js';
import { checkPixelBudget, checkFileBudget } from './core/limits.js';
import { setCurrentImage, getCurrentImage, clearCurrentImage } from './core/documentState.js';
import { initMaskUI, syncMaskUI, isMaskVisible, setMaskChecked } from './ui/maskUI.js';
import { canvasToGB7Blob } from './io/exportGB7.js';
import { initExportMenu } from './ui/exportUI.js';
import { initDropZone } from './ui/dropZone.js';
import { initHotkeys } from './ui/hotkeys.js';
import { readGB7Header } from './core/gb7.js';
import {
  loadRasterImage, loadGB7Image, detectFormat, assertSupported,
  canvasToBlob, downloadBlob,
} from './io/imageIO.js';
import {
  initChannelsUI,
  renderChannels,
  syncEnabled,
  setChannelEnabled,
} from './ui/channelsUI.js';
import { toggleChannel } from './ui/canvasView.js';
import { initToolsUI, getActiveTool } from './ui/toolsUI.js';
import { initEyedropper } from './ui/eyedropper.js';
import { getRawImageData } from './ui/canvasView.js';
import { initEyedropperInfo, showEyedropperInfo, resetEyedropperInfo } from './ui/eyedropperInfo.js';

const canvas = document.getElementById('mainCanvas');
const canvasArea = document.querySelector('.canvas-area');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomLabel = document.getElementById('zoomLabel');
const openBtn = document.getElementById('openBtn');
const fileInput = document.getElementById('fileInput');
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');
const maskToggle = document.getElementById('maskToggle');
const maskHint = document.getElementById('maskHint');
const channelListEl = document.getElementById('channelList');
const channelsCountEl = document.getElementById('channelsCount');
const toolElements = Array.from(document.querySelectorAll('.tool-item[data-tool]'));

initCanvasView(canvas);

// ——— Панель каналов ———
initChannelsUI({
  listEl: channelListEl,
  countEl: channelsCountEl,
  onToggle: (id, enabled) => {
    // canvasView сам обновит enabledChannels и перерисует холст.
    toggleChannel(id);

    // Если тронули Alpha — синхронизируем чекбокс «Показывать маску».
    if (id === 'a') {
      setMaskChecked(enabled);
    }
  },
});

// Стартовое пустое состояние панели каналов.
renderChannels({ imageData: null, doc: null, mask: null, enabled: new Set() });

// ——— Панель масок ———
initMaskUI({
  checkboxEl: maskToggle,
  hintEl: maskHint,
  onToggle: (checked) => {
    // maskUI уже сам вызвал setEnabledChannels + repaint.
    // Нам осталось только синхронизировать визуальное состояние Alpha
    // в панели каналов.
    setChannelEnabled('a', checked);
  },
});

syncMaskUI({ hasImage: false, hasMask: false });

// ——— Зум ———
initZoomUI({
  canvasAreaEl: canvasArea,
  labelEl: zoomLabel,
  inBtn: zoomInBtn,
  outBtn: zoomOutBtn,
  resetBtn: zoomLabel,
});

// ——— Drag & drop ———
initDropZone(canvasArea, (file) => handleFile(file));

initToolsUI({
  toolElements,
  areaEl: canvasArea,
  defaultTool: 'move',
});

initEyedropper({
  canvas,
  area: canvasArea,
  getRawImageData,
  isActive: () => getActiveTool() === 'eyedropper',
  onPick: (pick) => {
    // pick = { x, y, r, g, b, a }
    showEyedropperInfo(pick);
    setStatus('ok', `Пипетка: (${pick.x}, ${pick.y}) · rgba(${pick.r}, ${pick.g}, ${pick.b}, ${pick.a})`);
    // CIELAB пока не считаем — оставим в панели «—».
  },
});

initEyedropperInfo();

// ——— Горячие клавиши ———
initHotkeys({
  open: () => fileInput.click(),
  exportDefault: () => {
    const state = getCurrentImage();
    const fmt = state?.format === 'gb7' ? 'gb7' : 'png';
    exportImage(fmt);
  },
  fit: () => fitToScreen(),
  zoom100,
  zoomIn,
  zoomOut,
});

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

    if (!(await confirmBudget(file, format))) {
      setStatus('ok', 'Отменено');
      return;
    }

    if (format === 'gb7') {
      const loaded = await loadGB7Image(file);

      setImage(
        loaded.imageData,
        { format: 'gb7', hasMask: loaded.hasMask },
        { mask: loaded.mask, showMask: isMaskVisible() }
      );
      fitToScreen();
      updateImageInfo({ width: loaded.width, height: loaded.height, depth: 7, format: 'gb7' });
      setCurrentImage({ ...loaded, fileName: file.name });
      resetEyedropperInfo();

      // Панель каналов.
      renderChannels({
        imageData: loaded.imageData,
        doc: { format: 'gb7', hasMask: loaded.hasMask },
        mask: loaded.mask,
        enabled: getEnabledChannels(),
      });
      // Приводим UI к фактическому состоянию.
      syncEnabled(getEnabledChannels());
      setMaskChecked(true);

      // Панель масок.
      syncMaskUI({ hasImage: true, hasMask: loaded.hasMask });
      maskToggle.checked = true;

      setStatus('ok', loaded.hasMask ? 'Готово (с маской)' : 'Готово');
      return;
    }

    if (format === 'raster') {
      const { width, height, imageData, depth, mask } = await loadRasterImage(file);

      setImage(
        imageData,
        { format: 'raster', hasMask: false },
        { mask: null, showMask: isMaskVisible() }
      );
      fitToScreen();

      updateImageInfo({ width, height, depth, format: 'raster' });
      setCurrentImage({
        width, height, imageData, depth,
        format: 'raster',
        hasMask: false,
        mask: null,
        pixels: null,
        fileName: file.name,
      });
      resetEyedropperInfo();

      // Панель каналов.
      renderChannels({
        imageData,
        doc: { format: 'raster', hasMask: false },
        mask: null,
        enabled: getEnabledChannels(),
      });
      syncEnabled(getEnabledChannels());
      setMaskChecked(true);

      // Панель масок (для raster маски нет — чекбокс остаётся disabled).
      syncMaskUI({ hasImage: true, hasMask: false });

      setStatus('ok', 'Готово');
      return;
    }

    throw new Error('Не удалось определить формат файла');
  } catch (err) {
    console.error(err);
    resetImageInfo();
    clearCurrentImage();
    resetEyedropperInfo();

    // Очищаем панель каналов.
    renderChannels({ imageData: null, doc: null, mask: null, enabled: new Set() });

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

async function confirmBudget(file, format) {
  if (format === 'gb7') {
    const header = readGB7Header(await file.slice(0, 12).arrayBuffer());
    const budget = checkPixelBudget(header.width * header.height);
    if (budget === 'ok') return true;
    const px = `${header.width}×${header.height}`;
    if (budget === 'too-large') {
      return confirm(
        `Изображение ${px} (${(header.width * header.height / 1e6).toFixed(1)} Мпикс) слишком большое ` +
        `и может подвесить браузер. Продолжить?`
      );
    }
    return confirm(`Изображение ${px}. Загрузка может занять время. Продолжить?`);
  }

  // raster
  if (checkFileBudget(file.size) === 'large') {
    return confirm(
      `Файл ${(file.size / 1024 / 1024).toFixed(1)} МБ. Загрузка может занять время. Продолжить?`
    );
  }
  return true;
}