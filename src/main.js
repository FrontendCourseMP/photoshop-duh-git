import { setStatus, updateImageInfo, resetImageInfo } from './ui/status.js';
import { checkPixelBudget, checkFileBudget } from './core/limits.js';
import { setCurrentImage, getCurrentImage, clearCurrentImage, markDirty } from './core/documentState.js';
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
import {
  initCanvasView, setImage, getCanvas, hasContent,
  getEnabledChannels, getRawImageData, toggleChannel
} from './ui/canvasView.js';
import { initToolsUI, getActiveTool, setActiveTool } from './ui/toolsUI.js';
import { initEyedropper } from './ui/eyedropper.js';
import { initEyedropperInfo, showEyedropperInfo, resetEyedropperInfo } from './ui/eyedropperInfo.js';
import { srgbToLab } from './core/color.js';
import {
  openLevelsDialog,
  closeLevelsDialog,
  setLevelsSource,
  clearLevelsSource,
} from './ui/levelsDialog.js';
import { initZoomUI, fitToScreen, zoomIn, zoomOut, zoom100 } from './ui/zoomUI.js';
import { initZoomPanel } from './ui/zoomPanel.js';
import { openResizeDialog } from './ui/resizeDialog.js';
import { resizeImageData, resizeGB7 } from './core/resize.js';

const canvas = document.getElementById('mainCanvas');
const canvasArea = document.querySelector('.canvas-area');
const zoomRangeEl = document.getElementById('zoomRange');
const zoomRangeValueEl = document.getElementById('zoomRangeValue');
const zoomPresetsEl = document.getElementById('zoomPresets');
const openBtn = document.getElementById('openBtn');
const fileInput = document.getElementById('fileInput');
const exportBtn = document.getElementById('exportBtn');
const exportMenu = document.getElementById('exportMenu');
const maskToggle = document.getElementById('maskToggle');
const maskHint = document.getElementById('maskHint');
const channelListEl = document.getElementById('channelList');
const channelsCountEl = document.getElementById('channelsCount');
const toolElements = Array.from(document.querySelectorAll('.tool-item[data-tool]'));
const levelsBtn = document.getElementById('levelsBtn');
const resizeBtn = document.getElementById('resizeBtn');

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
  labelEl: zoomRangeValueEl,
});

initZoomPanel({
  rangeEl: zoomRangeEl,
  valueEl: zoomRangeValueEl,
  presetsEl: zoomPresetsEl,
});

// ——— Drag & drop ———
initDropZone(canvasArea, (file) => handleFile(file));

initToolsUI({
  toolElements,
  areaEl: canvasArea,
  defaultTool: 'move',
  onChange: (id) => {
    const labels = {
      move: 'Перемещение',
      eyedropper: 'Пипетка',
    };
    const label = labels[id];
    if (label) setStatus('ok', label);
  },
});

initEyedropper({
  canvas,
  area: canvasArea,
  getRawImageData,
  isActive: () => getActiveTool() === 'eyedropper',
  onPick: ({ x, y, r, g, b, a }) => {
    const lab = srgbToLab(r, g, b);
    showEyedropperInfo({ x, y, r, g, b, a, lab });
    setStatus(
      'ok',
      `Пипетка: (${x}, ${y}) · rgb(${r}, ${g}, ${b}) · L*${lab.L.toFixed(1)} a*${lab.a.toFixed(1)} b*${lab.b.toFixed(1)}`
    );
  },
});

initEyedropperInfo();

levelsBtn.disabled = !hasContent();
resizeBtn.disabled = !hasContent();

window.addEventListener('levels:applied', () => {
  const raw = getRawImageData();
  const state = getCurrentImage();

  if (raw && state) {
    setCurrentImage({ ...state, imageData: raw });
    renderChannels({
      imageData: raw,
      doc: { format: state.format, hasMask: state.hasMask },
      mask: state.mask ?? null,
      enabled: getEnabledChannels(),
    });
  }
  resetEyedropperInfo();
  setStatus('ok', 'Уровни применены');
});

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
  selectTool: (id) => setActiveTool(id),
  levels: () => {
    if (!hasContent()) return;
    openLevelsDialog();
  },
});

levelsBtn.addEventListener('click', () => {
  if (!hasContent()) {
    setStatus('error', 'Сначала загрузите изображение');
    return;
  }
  openLevelsDialog();
});

resizeBtn.addEventListener('click', () => {
  const raw = getRawImageData();
  const state = getCurrentImage();
  if (!raw || !state) {
    setStatus('error', 'Сначала загрузите изображение');
    return;
  }

  openResizeDialog({
    width: raw.width,
    height: raw.height,
    onSubmit: (result) => applyResize(result, raw, state),
  });
});

function applyResize({ width, height, methodId }, raw, state) {
  try {
    setStatus('busy', 'Изменение размера…');

    let newRaw;         // новый ImageData
    let newPixels = null;
    let newMask = null;
    let newW = width;
    let newH = height;

    if (state.format === 'gb7' && state.pixels) {
      // Для GB7 сохраняем «сырые» 7-битные данные и маску
      const res = resizeGB7(
        {
          width: state.width,
          height: state.height,
          pixels: state.pixels,
          mask: state.mask ?? null,
        },
        width, height, methodId
      );
      newW = res.width;
      newH = res.height;
      newRaw = res.imageData;
      newPixels = res.pixels;
      newMask = res.mask;
    } else {
      const res = resizeImageData(raw, width, height, methodId);
      newW = res.width;
      newH = res.height;
      newRaw = res.imageData;
    }

    // Обновляем холст новым изображением (без preview).
    setImage(
      newRaw,
      { format: state.format, hasMask: state.hasMask },
      { mask: newMask, showMask: true }
    );

    // Обновляем documentState.
    setCurrentImage({
      ...state,
      width: newW,
      height: newH,
      imageData: newRaw,
      pixels: newPixels,
      mask: newMask,
    });

    // Обновляем панели.
    updateImageInfo({
      width: newW, height: newH,
      depth: state.format === 'gb7' ? 7 : 8,
      format: state.format,
    });

    renderChannels({
      imageData: newRaw,
      doc: { format: state.format, hasMask: state.hasMask },
      mask: newMask,
      enabled: getEnabledChannels(),
    });

    setLevelsSource(newRaw, { format: state.format, hasMask: state.hasMask });

    resetEyedropperInfo();

    // Подгоняем масштаб отображения.
    fitToScreen();

    markDirty();

    setStatus('ok', `Размер изменён: ${newW} × ${newH}`);
  } catch (err) {
    console.error(err);
    setStatus('error', `Ошибка: ${err.message}`);
  }
}

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
      closeLevelsDialog();
      levelsBtn.disabled = false;
      resizeBtn.disabled = false;
      resetEyedropperInfo();

      // Панель каналов.
      renderChannels({
        imageData: loaded.imageData,
        doc: { format: 'gb7', hasMask: loaded.hasMask },
        mask: loaded.mask,
        enabled: getEnabledChannels(),
      });
      setLevelsSource(loaded.imageData, { format: 'gb7', hasMask: loaded.hasMask });
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
      closeLevelsDialog();
      levelsBtn.disabled = false;
      resizeBtn.disabled = false;
      resetEyedropperInfo();

      // Панель каналов.
      renderChannels({
        imageData,
        doc: { format: 'raster', hasMask: false },
        mask: null,
        enabled: getEnabledChannels(),
      });
      setLevelsSource(imageData, { format: 'raster', hasMask: false });
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
    levelsBtn.disabled = true;
    resizeBtn.disabled = true;
    closeLevelsDialog();
    clearLevelsSource();
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