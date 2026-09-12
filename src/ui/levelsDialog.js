/**
 * Окно инструмента «Уровни».
 *
 * Cелектор канала, чекбокс log/lin, рисование гистограммы.
 * Слайдеры, предпросмотр, apply/cancel/reset.
 */

import { createFloatingWindow } from './floatingWindow.js';
import {
  computeAllHistograms,
  normalizeHistogram,
  getHistogramChannelList,
  HISTOGRAM_CHANNELS,
} from '../core/histogram.js';
import { drawHistogram } from './histogramView.js';

let win = null;
let canvasEl = null;
let selectEl = null;
let logCheckbox = null;

/** Текущий документ и его гистограммы. */
let currentDoc = null;      // { format, hasMask }
let currentImageData = null;
let histograms = null;      // { master, r, g, b, gray, a }

/** Активный канал гистограммы. */
let currentChannel = 'master';

/** Создаёт окно (если ещё не создано) и возвращает его API. */
export function getLevelsWindow() {
  if (win) return win;

  const body = buildBody();
  win = createFloatingWindow({
    id: 'levels',
    title: 'Уровни',
    body,
    onOpen: () => {
      // Пересчёт гистограмм — на случай, если с момента последнего
      // открытия изменилось изображение или его каналы.
      refreshHistograms();
    },
    onClose: () => {
      // TODO (шаг 6): отменить предпросмотр, если был.
    },
  });

  // Кэшируем элементы и вешаем обработчики.
  canvasEl = body.querySelector('#levelsHistogram');
  selectEl = body.querySelector('#levelsChannel');
  logCheckbox = body.querySelector('#levelsLog');

  selectEl.addEventListener('change', () => {
    currentChannel = selectEl.value;
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
 * Вызывается из main.js при загрузке файла.
 *
 * @param {ImageData} imageData   — оригинал (не мутировать)
 * @param {{ format: 'raster'|'gb7', hasMask?: boolean }} doc
 */
export function setLevelsSource(imageData, doc) {
  currentImageData = imageData;
  currentDoc = doc;

  // Обновляем список каналов в селекторе под новый формат.
  rebuildChannelOptions();

  // Если окно открыто — сразу пересчитаем и перерисуем.
  if (win && win.isOpen()) {
    refreshHistograms();
  }
}

/**
 * Сброс источника (например, при ошибке загрузки).
 */
export function clearLevelsSource() {
  currentImageData = null;
  currentDoc = null;
  histograms = null;
  // Селект оставляем — обновится при следующем setLevelsSource.
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
    <div class="levels-histogram">
      <canvas id="levelsHistogram" width="360" height="140"></canvas>
    </div>
    <div class="levels-sliders-placeholder" id="levelsSliders"></div>
  `;

  return root;
}

/**
 * Пересобирает <option> в селекторе канала под текущий документ.
 * Сохраняет выбранный канал, если он есть в новом списке.
 */
function rebuildChannelOptions() {
  if (!selectEl) return;

  selectEl.innerHTML = '';

  if (!currentDoc) {
    return;
  }

  const ids = getHistogramChannelList(currentDoc);

  for (const id of ids) {
    const info = HISTOGRAM_CHANNELS[id];
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = info.label;
    selectEl.appendChild(opt);
  }

  // Восстанавливаем текущий выбор, если он возможен.
  if (ids.includes(currentChannel)) {
    selectEl.value = currentChannel;
  } else {
    currentChannel = ids[0];
    selectEl.value = currentChannel;
  }
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

  // Нет данных — рисуем пустую сетку.
  if (!histograms) {
    drawHistogram(canvasEl, new Float32Array(256), {
      color: '#555',
      grid: true,
    });
    return;
  }

  const hist = pickHistogram(currentChannel);
  if (!hist) {
    drawHistogram(canvasEl, new Float32Array(256), {
      color: '#555',
      grid: true,
    });
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

  // master/gray/a — прямые ключи.
  if (channel === 'master') return histograms.master;
  if (channel === 'gray') return histograms.gray ?? null;
  if (channel === 'a') return histograms.a ?? null;

  // r/g/b — только для raster.
  return histograms[channel] ?? null;
}