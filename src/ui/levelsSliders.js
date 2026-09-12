/**
 * Слайдеры Input Levels (чёрная точка, гамма, белая точка)
 * и синхронизированные с ними числовые поля.
 *
 * ВАЖНО: сам модуль НЕ применяет коррекцию к изображению —
 * он только управляет значениями и уведомляет подписчиков
 * (колбэк onChange). Применение — задача levelsDialog/main.
 *
 * Соглашения:
 *   black  ∈ [0, 254]
 *   white  ∈ [1, 255]
 *   gamma  ∈ [0.1, 9.9]
 *   black < white; gamma всегда между ними логически (не имеет смысла
 *   гамму выносить за пределы чёрной/белой точки, но технически
 *   gamma может быть любой в диапазоне).
 *
 * Значение gamma: > 1 — светлее средние тона, < 1 — темнее.
 * Это «визуальное» значение, совпадающее с интерфейсом Photoshop.
 * В формуле LUT используется 1/gamma.
 */

import { defaultLevelsParams, GAMMA_MIN, GAMMA_MAX } from '../core/levels.js';

let markersEl = null;
let wrapEl = null;
let blackInput = null;
let gammaInput = null;
let whiteInput = null;

let onChange = null;

/** Текущие значения. */
let black = 0;
let white = 255;
let gamma = 1;

/** Активный drag: 'black' | 'gamma' | 'white' | null. */
let dragging = null;
let pointerId = null;

/** Кэш DOM-элементов маркеров. */
const markerEls = new Map();

/**
 * @param {{
 *   wrapEl: HTMLElement,         // .levels-histogram (для геометрии)
 *   markersEl: HTMLElement,      // .levels-markers (контейнер маркеров)
 *   blackInput: HTMLInputElement,
 *   gammaInput: HTMLInputElement,
 *   whiteInput: HTMLInputElement,
 *   onChange?: (params: {black:number, white:number, gamma:number}) => void
 * }} opts
 */
export function initLevelsSliders({
  wrapEl: wrap,
  markersEl: markers,
  blackInput: bi,
  gammaInput: gi,
  whiteInput: wi,
  onChange: cb,
}) {
  wrapEl = wrap;
  markersEl = markers;
  blackInput = bi;
  gammaInput = gi;
  whiteInput = wi;
  onChange = cb ?? null;

  buildMarkers();

  // Слушатели числовых полей.
  blackInput.addEventListener('input', onBlackInput);
  blackInput.addEventListener('change', onBlackInput);
  gammaInput.addEventListener('input', onGammaInput);
  gammaInput.addEventListener('change', onGammaInput);
  whiteInput.addEventListener('input', onWhiteInput);
  whiteInput.addEventListener('change', onWhiteInput);
}

/**
 * Устанавливает значения слайдеров и полей (без эмита onChange).
 * @param {{black:number, white:number, gamma:number}} params
 */
export function setLevelsParams(params) {
  black = clampInt(params.black, 0, 254);
  white = clampInt(params.white, 1, 255);
  if (black >= white) {
    // Мягкая коррекция: подвинем white.
    white = Math.min(255, black + 1);
    if (white <= black) black = white - 1;
  }
  gamma = clamp(params.gamma, GAMMA_MIN, GAMMA_MAX);

  syncInputsFromState();
  layoutMarkers();
}

/** Возвращает текущие значения. */
export function getLevelsParams() {
  return { black, white, gamma };
}

/** Сбрасывает к значениям по умолчанию (тождественное преобразование). */
export function resetLevelsParams() {
  const d = defaultLevelsParams();
  setLevelsParams(d);
  // Сброс — это тоже изменение, о котором стоит уведомить.
  emitChange();
}

// ——— Внутреннее ———

function buildMarkers() {
  const defs = [
    { key: 'black', cls: 'levels-marker--black' },
    { key: 'gamma', cls: 'levels-marker--gamma' },
    { key: 'white', cls: 'levels-marker--white' },
  ];

  for (const { key, cls } of defs) {
    const m = document.createElement('div');
    m.className = `levels-marker ${cls}`;
    m.dataset.marker = key;
    m.innerHTML = `<div class="levels-marker__line"></div><div class="levels-marker__handle"></div>`;

    m.addEventListener('pointerdown', (e) => startDrag(e, key));
    markersEl.appendChild(m);
    markerEls.set(key, m);
  }

  // Общие обработчики для drag — вешаем один раз на документ.
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function startDrag(e, key) {
  if (e.button !== 0) return;
  dragging = key;
  pointerId = e.pointerId;
  markerEls.get(key).classList.add('dragging');
  e.preventDefault();
  // Начинаем сразу с пересчёта — чтобы курсор не «прыгал» при захвате.
  onPointerMove(e);
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== pointerId) return;

  const rect = wrapEl.getBoundingClientRect();
  if (rect.width === 0) return;

  const localX = e.clientX - rect.left;
  const ratio = clamp(localX / rect.width, 0, 1);
  const value = Math.round(ratio * 255);

  applyDragValue(dragging, value);
  syncInputsFromState();
  layoutMarkers();
  emitChange();
}

function onPointerUp(e) {
  if (!dragging || e.pointerId !== pointerId) return;
  markerEls.get(dragging).classList.remove('dragging');
  dragging = null;
  pointerId = null;
}

/**
 * Ограничения при drag:
 *   - black не может стать >= white;
 *   - white не может стать <= black;
 *   - gamma всегда между black и white (иначе логически бессмысленно).
 */
function applyDragValue(key, value) {
  if (key === 'black') {
    black = Math.min(value, white - 1);
    if (black < 0) black = 0;
  } else if (key === 'white') {
    white = Math.max(value, black + 1);
    if (white > 255) white = 255;
  } else if (key === 'gamma') {
    // Позиция гаммы на оси — величина в диапазоне [black, white];
    // переводим в значение gamma по экспоненциальной шкале.
    const clamped = clamp(value, black, white);
    const t = (clamped - black) / Math.max(1, white - black); // 0..1
    // t=0.5 => gamma=1; t=0 => gamma=GAMMA_MAX (светлее);
    // t=1 => gamma=GAMMA_MIN (темнее).
    //
    // Формула: gamma = 10 ^ ((0.5 - t) * log10(GAMMA_MAX)).
    // Проверка: t=0.5 → 10^0 = 1;  t=0 → 10^(0.5·log10(9.9)) ≈ 3.15;
    //           t=1 → 10^(-0.5·log10(9.9)) ≈ 0.317.
    //
    // Этот диапазон намеренно уже [0.1, 9.9], чтобы UX был комфортным
    // (в Photoshop ползунок гаммы ходит примерно в 0.1..9.9,
    //  но крайние значения достигаются за счёт других диапазонов).
    const half = Math.log10(GAMMA_MAX);
    gamma = Math.pow(10, (0.5 - t) * half);
    gamma = clamp(gamma, GAMMA_MIN, GAMMA_MAX);
  }
}

function onBlackInput() {
  const v = parseInt(blackInput.value, 10);
  if (Number.isNaN(v)) return;
  applyDragValue('black', clampInt(v, 0, 254));
  syncInputsFromState();
  layoutMarkers();
  emitChange();
}

function onWhiteInput() {
  const v = parseInt(whiteInput.value, 10);
  if (Number.isNaN(v)) return;
  applyDragValue('white', clampInt(v, 1, 255));
  syncInputsFromState();
  layoutMarkers();
  emitChange();
}

function onGammaInput() {
  const v = parseFloat(gammaInput.value);
  if (Number.isNaN(v)) return;
  gamma = clamp(v, GAMMA_MIN, GAMMA_MAX);
  syncInputsFromState();
  layoutMarkers();
  emitChange();
}

/** Обновляет поля ввода из текущих значений. */
function syncInputsFromState() {
  if (document.activeElement !== blackInput) blackInput.value = String(black);
  if (document.activeElement !== gammaInput) gammaInput.value = gamma.toFixed(2);
  if (document.activeElement !== whiteInput) whiteInput.value = String(white);
}

/** Позиционирует маркеры на .levels-histogram. */
function layoutMarkers() {
  const w = wrapEl.clientWidth;
  if (w === 0) return;

  positionMarker('black', black / 255, w);
  positionMarker('white', white / 255, w);

  // Гамма — позиция по t (не по значению gamma), обратная к формуле
  // из applyDragValue:  t = 0.5 - log10(gamma) / log10(GAMMA_MAX)
  const half = Math.log10(GAMMA_MAX);
  let t;
  if (gamma === 1) {
    t = 0.5;
  } else {
    t = 0.5 - Math.log10(gamma) / half;
  }
  t = clamp(t, 0, 1);
  // Ограничим позицию гаммы между black и white.
  const tBetween = black / 255 + t * (white - black) / 255;
  positionMarker('gamma', tBetween, w);

  const mBlack = markerEls.get('black');
  const mGamma = markerEls.get('gamma');
  const mWhite = markerEls.get('white');
  if (mBlack) mBlack.title = `Чёрная: ${black}`;
  if (mGamma) mGamma.title = `Гамма: ${gamma.toFixed(2)}`;
  if (mWhite) mWhite.title = `Белая: ${white}`;
}

function positionMarker(key, ratio, wrapWidth) {
  const el = markerEls.get(key);
  if (!el) return;
  el.style.left = `${ratio * wrapWidth}px`;
}

function emitChange() {
  onChange?.({ black, white, gamma });
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function clampInt(v, lo, hi) {
  return Math.round(clamp(v, lo, hi));
}