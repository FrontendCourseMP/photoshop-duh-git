/**
 * Окно инструмента «Уровни».
 *
 * Предпросмотр, Reset, Cancel, Apply.
 *
 * Схема:
 *   - при открытии окна делаем снимок оригинала (baseImageData);
 *   - при изменении слайдеров, если Preview включён, пересчитываем
 *     preview = applyLevels(baseImageData, params) и показываем на холсте;
 *   - Preview off → холст показывает оригинал (discardPreview);
 *   - Reset → параметры к дефолту (0/255/1) + пересчёт;
 *   - Cancel / закрытие окна крестиком → discardPreview;
 *   - Apply → commitPreview (preview становится новым оригиналом),
 *     markDirty в documentState, закрытие окна.
 */

import { createFloatingWindow } from './floatingWindow.js';
import {
  computeAllHistograms,
  normalizeHistogram,
  getHistogramChannelList,
  HISTOGRAM_CHANNELS,
} from '../core/histogram.js';
import { drawHistogram } from './histogramView.js';
import {
  initLevelsSliders,
  setLevelsParams,
  getLevelsParams,
  resetLevelsParams,
} from './levelsSliders.js';
import {
  defaultLevelsParams,
  applyLevels,
  isIdentity,
} from '../core/levels.js';
import {
  setPreview,
  discardPreview,
  commitPreview,
  getRawImageData,
  hasContent,
} from './canvasView.js';
import { markDirty } from '../core/documentState.js';

let win = null;
let canvasEl = null;
let selectEl = null;
let logCheckbox = null;
let previewCheckbox = null;
let resetBtn = null;
let cancelBtn = null;
let applyBtn = null;

let rafPending = false;

/** Текущий документ и его гистограммы. */
let currentDoc = null;
let currentImageData = null;
let histograms = null;

/** Активный канал гистограммы. */
let currentChannel = 'master';

/**
 * Параметры Input Levels по каналам.
 * Ключи: 'master', 'r', 'g', 'b', 'gray', 'a'.
 */
const channelParams = new Map();

/** Снимок оригинала на момент открытия окна. */
let baseImageData = null;

/** Признак, что preview сейчас показывается на холсте. */
let previewActive = false;

/** Инициализированы ли слайдеры (один раз). */
let slidersInited = false;

/** Инициализированы ли кнопки (один раз). */
let buttonsInited = false;

// ——— Публичный API окна ———

export function getLevelsWindow() {
  if (win) return win;

  const body = buildBody();
  win = createFloatingWindow({
    id: 'levels',
    title: 'Уровни',
    body,
    onOpen: () => openLevelsInternal(),
    onClose: () => closeLevelsInternal(),
  });

  canvasEl = body.querySelector('#levelsHistogram');
  selectEl = body.querySelector('#levelsChannel');
  logCheckbox = body.querySelector('#levelsLog');
  previewCheckbox = body.querySelector('#levelsPreview');
  resetBtn = body.querySelector('#levelsResetBtn');
  cancelBtn = body.querySelector('#levelsCancelBtn');
  applyBtn = body.querySelector('#levelsApplyBtn');

  selectEl.addEventListener('change', () => {
    currentChannel = selectEl.value;
    loadParamsForCurrentChannel();
    redraw();
  });

  logCheckbox.addEventListener('change', () => redraw());

  previewCheckbox.addEventListener('change', () => {
    if (previewCheckbox.checked) {
      applyPreviewFromState();
    } else {
      discardPreview();
      previewActive = false;
    }
  });

  resetBtn.addEventListener('click', () => {
    channelParams.clear();
    resetLevelsParams();     // эмитит onChange → applyPreviewFromState
    updateResetState();
  });

  cancelBtn.addEventListener('click', () => {
    win.close();             // onClose → closeLevelsInternal
  });

  applyBtn.addEventListener('click', () => {
    applyAndClose();
  });

  return win;
}

export function openLevelsDialog() {
  const w = getLevelsWindow();
  w.open();
}

export function closeLevelsDialog() {
  if (win) win.close();
}

/**
 * Сообщает окну, что документ сменился (или загружен впервые).
 * Сбрасывает параметры и базовый снимок.
 */
export function setLevelsSource(imageData, doc) {
  currentImageData = imageData;
  currentDoc = doc;

  channelParams.clear();
  baseImageData = null;
  previewActive = false;

  rebuildChannelOptions();
  loadParamsForCurrentChannel();

  if (win && win.isOpen()) {
    refreshHistograms();
  }
}

export function clearLevelsSource() {
  currentImageData = null;
  currentDoc = null;
  histograms = null;
  baseImageData = null;
  previewActive = false;
  channelParams.clear();
}

// ——— Внутреннее ———

function buildBody() {
  const root = document.createElement('div');
  root.className = 'levels-body';

  root.innerHTML = `
    <div class="levels-histogram-controls">
      <label class="levels-field">
        <span class="levels-field__label">Канал</span>
        <select id="levelsChannel" class="levels-select"></select>
      </label>
      <label class="levels-checkbox">
        <input type="checkbox" id="levelsLog">
        <span class="levels-checkbox__box"></span>
        <span class="levels-checkbox__text">Логарифм. шкала</span>
      </label>
    </div>

    <div class="levels-histogram" id="levelsHistogramWrap">
      <canvas id="levelsHistogram" width="360" height="140"></canvas>
      <div class="levels-markers" id="levelsMarkers"></div>
    </div>

    <div class="levels-inputs">
      <label class="levels-input">
        <span class="levels-input__label">Чёрная</span>
        <input type="number" id="levelsBlack" min="0" max="254" step="1" value="0">
      </label>
      <label class="levels-input">
        <span class="levels-input__label">Гамма</span>
        <input type="number" id="levelsGamma" min="0.1" max="9.9" step="0.1" value="1">
      </label>
      <label class="levels-input">
        <span class="levels-input__label">Белая</span>
        <input type="number" id="levelsWhite" min="1" max="255" step="1" value="255">
      </label>
    </div>

    <div class="levels-actions" id="levelsActions">
      <label class="levels-checkbox">
        <input type="checkbox" id="levelsPreview" checked>
        <span class="levels-checkbox__box"></span>
        <span class="levels-checkbox__text">Предпросмотр</span>
      </label>
      <div class="levels-actions__spacer"></div>
      <button type="button" class="levels-btn" id="levelsResetBtn">Сброс</button>
      <button type="button" class="levels-btn" id="levelsCancelBtn">Отмена</button>
      <button type="button" class="levels-btn levels-btn--primary" id="levelsApplyBtn">Применить</button>
    </div>
  `;

  return root;
}

function openLevelsInternal() {
  if (!hasContent()) return;

  // Снимок оригинала.
  baseImageData = cloneImageData(getRawImageData());

  // Принудительно сбрасываем возможный прошлый предпросмотр.
  discardPreview();
  previewActive = false;
  previewCheckbox.checked = true;

  ensureSlidersInitialized();
  ensureButtonsState();

  rebuildChannelOptions();
  loadParamsForCurrentChannel();

  refreshHistograms();
}

/** Вызывается при закрытии окна — и по крестику, и программно. */
function closeLevelsInternal() {
  // Отменяем предпросмотр (если был).
  if (previewActive) {
    discardPreview();
    previewActive = false;
  }
}

function ensureSlidersInitialized() {
  if (slidersInited) return;
  const body = win.bodyEl;

  const wrapEl = body.querySelector('#levelsHistogramWrap');
  const markersEl = body.querySelector('#levelsMarkers');
  const blackInput = body.querySelector('#levelsBlack');
  const gammaInput = body.querySelector('#levelsGamma');
  const whiteInput = body.querySelector('#levelsWhite');

  initLevelsSliders({
    wrapEl,
    markersEl,
    blackInput,
    gammaInput,
    whiteInput,
    onChange: (params) => {
      channelParams.set(currentChannel, { ...params });
      updateResetState();
      if (previewCheckbox?.checked) {
        // Небольшая задержка между изменениями значений
        // Для больших изображений
        schedulePreview();

        // applyPreviewFromState();
      }
    },
  });

  slidersInited = true;
  loadParamsForCurrentChannel();

  window.addEventListener('resize', () => {
    setLevelsParams(getLevelsParams());
  });
}

function ensureButtonsState() {
  if (buttonsInited) return;
  buttonsInited = true;
  updateResetState();
}

/** Обновляет активность кнопки «Сброс». */
function updateResetState() {
  if (!resetBtn) return;
  const anyChannelModified = [...channelParams.values()].some(
    (p) => !isIdentityParams(p)
  );
  resetBtn.disabled = !anyChannelModified;
}

function schedulePreview() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    applyPreviewFromState();
  });
}

/** Пересчитывает preview от baseImageData и показывает на холсте. */
function applyPreviewFromState() {
  if (!baseImageData) return;

  const params = collectAllParams();

  if (isIdentity(params, { format: currentDoc?.format })) {
    // Все параметры дефолтные — отображаем оригинал.
    discardPreview();
    previewActive = false;
    return;
  }

  const next = applyLevels(baseImageData, params, {
    format: currentDoc?.format,
  });
  setPreview(next);
  previewActive = true;
}

/** Собирает параметры по всем каналам из channelParams. */
function collectAllParams() {
  const result = {};
  for (const [channel, p] of channelParams) {
    result[channel] = p;
  }
  return result;
}

/** Фиксирует изменения: preview становится новым оригиналом. */
function applyAndClose() {
  if (!baseImageData) {
    // Нечего применять — просто закрыть.
    win.close();
    return;
  }

  const params = collectAllParams();

  if (isIdentity(params, { format: currentDoc?.format })) {
    // Пользователь не изменил ни одного параметра — ничего не делаем.
    win.close();
    return;
  }

  // Применяем окончательно: preview → rawData.
  const newRaw = applyLevels(baseImageData, params, {
    format: currentDoc?.format,
  });

  // Сначала убираем preview в canvasView, потом ставим новый оригинал.
  discardPreview();
  previewActive = false;

  // Заменяем оригинал через setPreview + commitPreview (см. canvasView API).
  // Проще: вызвать setPreview(newRaw) и сразу commitPreview().
  setPreview(newRaw);
  commitPreview();

  markDirty();

  // Обновляем внутренний currentImageData — теперь это newRaw.
  currentImageData = newRaw;

  // Сбрасываем параметры всех каналов — новое изображение уже с учётом коррекции.
  channelParams.clear();

  // Пересчитываем гистограммы от нового оригинала (на случай,
  // если пользователь снова откроет окно — увидит уже изменённую картинку).
  refreshHistograms();
  updateResetState();

  // Закрываем окно — onClose вызовет closeLevelsInternal, но preview уже неактивен.
  win.close();

  // Обновляем страницу каналов (миниатюры).
  // (вызывающий main.js не знает про это, поэтому генерируем кастомное событие,
  // которое main.js может слушать.)
  window.dispatchEvent(new CustomEvent('levels:applied'));
}

/** Пересчитывает гистограммы из текущего ImageData. */
function refreshHistograms() {
  if (!currentImageData || !currentDoc) {
    histograms = null;
    redraw();
    return;
  }

  histograms = computeAllHistograms(currentImageData, currentDoc);
  redraw();
}

/** Перерисовывает canvas гистограммы. */
function redraw() {
  if (!canvasEl) return;

  if (!histograms) {
    drawHistogram(canvasEl, new Float32Array(256), { color: '#555', grid: true });
    return;
  }

  const hist = pickHistogram(currentChannel);
  if (!hist) {
    drawHistogram(canvasEl, new Float32Array(256), { color: '#555', grid: true });
    return;
  }

  const isLog = !!logCheckbox?.checked;
  const { values } = normalizeHistogram(hist, { log: isLog });

  const info = HISTOGRAM_CHANNELS[currentChannel];
  const color = info?.cssColor ?? '#dddddd';

  drawHistogram(canvasEl, values, { color, grid: true });
}

function pickHistogram(channel) {
  if (!histograms) return null;
  if (channel === 'master') return histograms.master;
  if (channel === 'gray') return histograms.gray ?? null;
  if (channel === 'a') return histograms.a ?? null;
  return histograms[channel] ?? null;
}

function rebuildChannelOptions() {
  if (!selectEl) return;

  selectEl.innerHTML = '';
  if (!currentDoc) return;

  const ids = getHistogramChannelList(currentDoc);
  for (const id of ids) {
    const info = HISTOGRAM_CHANNELS[id];
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = info.label;
    selectEl.appendChild(opt);
  }

  if (ids.includes(currentChannel)) {
    selectEl.value = currentChannel;
  } else {
    currentChannel = ids[0];
    selectEl.value = currentChannel;
  }
}

function loadParamsForCurrentChannel() {
  if (!slidersInited) return;
  const params = channelParams.get(currentChannel) ?? defaultLevelsParams();
  setLevelsParams(params);
}

// ——— Вспомогательное ———

function cloneImageData(src) {
  if (!src) return null;
  const out = new ImageData(src.width, src.height);
  out.data.set(src.data);
  return out;
}

function isIdentityParams(p) {
  return !p || (p.black === 0 && p.white === 255 && p.gamma === 1);
}