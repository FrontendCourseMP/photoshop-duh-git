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
export function setImage(imageData, mask = null) {
  rawData = imageData;
  rawMask = mask;
  repaint({ showMask: true });
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