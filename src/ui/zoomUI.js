import { setDisplayScale, getImageSize } from './canvasView.js';

/**
 * Диапазон масштаба отображения.
 * Значения выбраны по требованиям к панели масштаба.
 */
const STEPS = [0.12, 0.25, 0.5, 0.66, 1, 1.5, 2, 3];
const MIN_SCALE = 0.12;
const MAX_SCALE = 3.0;

/**
 * Отступ при «вписать в экран», в пикселях.
 * По требованию — минимум 50 px по каждой стороне.
 */
const FIT_PADDING = 50;

let canvasArea = null;
let label = null;
let currentScale = 1;
let mode = 'auto';        // 'auto' | 'manual'

/** Подписчики на изменение масштаба (для синхронизации UI). */
const listeners = new Set();

export function initZoomUI({ canvasAreaEl, labelEl, inBtn, outBtn, resetBtn }) {
  canvasArea = canvasAreaEl;
  label = labelEl;

  inBtn?.addEventListener('click', () => stepZoom(+1));
  outBtn?.addEventListener('click', () => stepZoom(-1));
  resetBtn?.addEventListener('click', () => setManual(1));

  canvasArea.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    stepZoom(e.deltaY < 0 ? +1 : -1);
  }, { passive: false });

  window.addEventListener('resize', () => {
    if (mode === 'auto') fitToScreen();
  });

  syncLabel();
}

/**
 * Подписка на изменение масштаба.
 * @param {(scale: number, mode: 'auto'|'manual') => void} fn
 * @returns {() => void} — функция отписки
 */
export function onScaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Помещает изображение целиком в canvas-area с отступом FIT_PADDING. */
export function fitToScreen() {
  const size = getImageSize();
  if (!size) return;

  const availW = canvasArea.clientWidth - FIT_PADDING * 2;
  const availH = canvasArea.clientHeight - FIT_PADDING * 2;
  if (availW <= 0 || availH <= 0) return;

  // Естественный fit — без ограничения сверху единицей, но с клампом
  // по [MIN_SCALE, MAX_SCALE].
  const natural = Math.min(availW / size.width, availH / size.height);
  currentScale = clamp(natural, MIN_SCALE, MAX_SCALE);
  mode = 'auto';
  apply();
}

/** Ручной зум на конкретное значение. */
export function setManual(scale) {
  currentScale = clamp(scale, MIN_SCALE, MAX_SCALE);
  mode = 'manual';
  apply();
}

/** Шаг вверх/вниз по списку STEPS. */
function stepZoom(dir) {
  const base = currentScale;
  let next;
  if (dir > 0) {
    next = STEPS.find((s) => s > base + 1e-6);
    if (next === undefined) next = MAX_SCALE;
  } else {
    const smaller = STEPS.filter((s) => s < base - 1e-6);
    next = smaller.length ? smaller[smaller.length - 1] : MIN_SCALE;
  }
  setManual(next);
}

function apply() {
  setDisplayScale(currentScale);
  syncLabel();
  notify();
}

function syncLabel() {
  if (!label) return;
  const pct = currentScale * 100;
  label.textContent = pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

function notify() {
  for (const fn of listeners) fn(currentScale, mode);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function getScale() {
  return currentScale;
}

export function getMode() {
  return mode;
}

export function zoomIn() { stepZoom(+1); }
export function zoomOut() { stepZoom(-1); }
export function zoom100() { setManual(1); }

export const ZOOM_LIMITS = { MIN_SCALE, MAX_SCALE, STEPS, FIT_PADDING };