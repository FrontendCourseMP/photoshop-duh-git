/**
 * Окно инструмента «Уровни».
 *
 * Шаг 5: добавлены слайдеры Input Levels (black/gamma/white) и
 * синхронизированные с ними числовые поля.
 * Применение к холсту пока НЕ выполняется — событие onChange
 * логируется в консоль (шаг 6).
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
import { defaultLevelsParams } from '../core/levels.js';

let win = null;
let canvasEl = null;
let selectEl = null;
let logCheckbox = null;

/** Текущий документ и его гистограммы. */
let currentDoc = null;
let currentImageData = null;
let histograms = null;

/** Активный канал гистограммы. */
let currentChannel = 'master';

/**
 * Параметры Input Levels по каналам.
 * Ключи: 'master', 'r', 'g', 'b', 'gray', 'a'.
 * Значение — { black, white, gamma }.
 *
 * При смене канала в селекторе состояние каждого канала сохраняется
 * в этом объекте и восстанавливается при возврате.
 */
const channelParams = new Map();

/** Ссылки на элементы окна. */
let slidersInited = false;

/** Создаёт окно (если ещё не создано) и возвращает его API. */
export function getLevelsWindow() {
  if (win) return win;

  const body = buildBody();
  win = createFloatingWindow({
    id: 'levels',
    title: 'Уровни',
    body,
    onOpen: () => {
      refreshHistograms();
      ensureSlidersInitialized();
    },
    onClose: () => {
      // TODO (шаг 6): отменить предпросмотр, если был.
    },
  });

  canvasEl = body.querySelector('#levelsHistogram');
  selectEl = body.querySelector('#levelsChannel');
  logCheckbox = body.querySelector('#levelsLog');

  selectEl.addEventListener('change', () => {
    currentChannel = selectEl.value;
    loadParamsForCurrentChannel();
    redraw();
  });

  logCheckbox.addEventListener('change', () => {
    redraw();
  });

  return win;
}

/** Открывает окно «Уровни». */
export function openLevelsDialog() {
  const w = getLevelsWindow();
  w.open();
}

/** Закрывает окно «Уровни». */
export function closeLevelsDialog() {
  if (win) win.close();
}

/**
 * Сообщает окну, что документ сменился (или загружен впервые).
 */
export function setLevelsSource(imageData, doc) {
  currentImageData = imageData;
  currentDoc = doc;

  // Сбрасываем параметры всех каналов на «тождественные».
  channelParams.clear();

  rebuildChannelOptions();
  loadParamsForCurrentChannel();

  if (win && win.isOpen()) {
    refreshHistograms();
  }
}

/** Сброс источника (например, при ошибке загрузки). */
export function clearLevelsSource() {
  currentImageData = null;
  currentDoc = null;
  histograms = null;
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

/** Инициализирует слайдеры (один раз). */
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
      // Сохраняем для текущего канала.
      channelParams.set(currentChannel, { ...params });

      // Пока только логируем — шаг 6.
      // console.log('[levels] change', currentChannel, params);
    },
  });

  slidersInited = true;

  // Синхронизируем текущие значения.
  loadParamsForCurrentChannel();

  // Перераскладка маркеров при ресайзе окна браузера (canvas — CSS-адаптивный).
  window.addEventListener('resize', () => {
    // Просто ещё раз применяем параметры — layoutMarkers пересчитает позиции.
    setLevelsParams(getLevelsParams());
  });
}

/**
 * Пересобирает <option> в селекторе канала под текущий документ.
 */
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

/** Загружает параметры для текущего канала в слайдеры. */
function loadParamsForCurrentChannel() {
  if (!slidersInited) return;
  const params = channelParams.get(currentChannel) ?? defaultLevelsParams();
  setLevelsParams(params);
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

/** Перерисовывает canvas с учётом выбранного канала и шкалы. */
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