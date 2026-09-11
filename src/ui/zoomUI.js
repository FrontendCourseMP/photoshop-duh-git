import { setDisplayScale, getImageSize } from './canvasView.js';

const STEPS = [0.125, 0.25, 0.33, 0.5, 0.66, 1, 1.5, 2, 3, 4, 6, 8];
const MIN_SCALE = 0.05;
const MAX_SCALE = 16;

let canvasArea = null;   // .canvas-area — родитель, в котором центрируется canvas
let label = null;
let currentScale = 1;
let mode = 'auto';        // 'auto' | 'manual'

export function initZoomUI({ canvasAreaEl, labelEl, inBtn, outBtn, resetBtn }) {
  canvasArea = canvasAreaEl;
  label = labelEl;

  inBtn.addEventListener('click', () => stepZoom(+1));
  outBtn.addEventListener('click', () => stepZoom(-1));
  resetBtn.addEventListener('click', () => setManual(1));

  // Ctrl+wheel над областью canvas
  canvasArea.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    stepZoom(e.deltaY < 0 ? +1 : -1);
  }, { passive: false });

  // Ресайз окна: если режим auto — пересчитать fit
  window.addEventListener('resize', () => {
    if (mode === 'auto') fitToScreen();
  });

  syncLabel();
}

/** Помещает изображение целиком в canvas-area (с отступом). */
export function fitToScreen() {
  const size = getImageSize();
  if (!size) return;

  const pad = 40;
  const availW = canvasArea.clientWidth - pad;
  const availH = canvasArea.clientHeight - pad;
  if (availW <= 0 || availH <= 0) return;

  const scale = Math.min(availW / size.width, availH / size.height, 1);
  currentScale = clamp(scale, MIN_SCALE, MAX_SCALE);
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
}

function syncLabel() {
  if (!label) return;
  const pct = currentScale * 100;
  label.textContent =
    pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
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