let ctx = null;
let canvas = null;
let hasImage = false;

export function initCanvasView(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  hasImage = false;
}

export function renderImageData(imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
  hasImage = true;
}

export function getCanvas() {
  return canvas;
}

export function hasContent() {
  return hasImage;
}