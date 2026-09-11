let ctx = null;
let canvas = null;

export function initCanvasView(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d', { willReadFrequently: true });
}

/** Рисует ImageData, подгоняя размер canvas под изображение. */
export function renderImageData(imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
}

/** Обновляет нижний status bar. */
export function updateStatus({ width, height, depth, format }) {
  document.getElementById('statusSize').textContent = `${width} × ${height} px`;
  document.getElementById('statusColor').textContent =
    format === 'gb7' ? `Gray / ${depth} бит` : `RGBA / ${depth} бит`;
}

export function setStatusText(text) {
  document.getElementById('statusText').textContent = text;
}