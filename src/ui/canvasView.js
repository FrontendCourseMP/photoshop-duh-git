import { isMaskVisible } from './maskUI.js';

let canvas = null;
let ctx = null;
let rawData = null;   // ImageData
let rawMask = null;   // Uint8Array | null

export function initCanvasView(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  rawData = null;
  rawMask = null;
}

/**
 * Устанавливает новое «сырое» изображение и (опционально) маску.
 * Маска — Uint8Array той же длины W*H со значениями 0/1, где 0 = прозрачный.
 */
export function setImage(imageData, mask = null, showMask = true) {
  rawData = imageData;
  rawMask = mask;
  repaint({ showMask });
  canvas.style.width = '';
  canvas.style.height = '';
}

/**
 * Устанавливает CSS-масштаб отображения canvas. Буфер canvas не трогается.
 * @param {number} scale — 1.0 = 100%
 */
export function setDisplayScale(scale) {
  if (!canvas || !rawData) return;
  const w = Math.max(1, Math.round(rawData.width * scale));
  const h = Math.max(1, Math.round(rawData.height * scale));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

/** Возвращает размеры «сырого» изображения (в пикселях буфера). */
export function getImageSize() {
  if (!rawData) return null;
  return { width: rawData.width, height: rawData.height };
}

/**
 * Перерисовывает canvas с текущим состоянием (применять маску или нет).
 * @param {{ showMask: boolean }} opts
 */
export function repaint({ showMask }) {
  if (!rawData) return;
  const { width, height } = rawData;

  canvas.width = width;
  canvas.height = height;

  if (!rawMask || !showMask) {
    // маска не нужна — пишем как есть
    ctx.putImageData(rawData, 0, 0);
    return;
  }

  // собираем копию с применением маски
  const out = new ImageData(new Uint8ClampedArray(rawData.data), width, height);
  const d = out.data;
  for (let i = 0; i < rawMask.length; i++) {
    if (rawMask[i] === 0) d[i * 4 + 3] = 0;
    // если mask[i] === 1 — оставляем alpha как есть (обычно 255)
  }
  ctx.putImageData(out, 0, 0);
}

export function getCanvas() {
  return canvas;
}

export function hasContent() {
  return rawData !== null;
}

export function hasMask() {
  return rawMask !== null;
}