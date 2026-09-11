import { getChannelList, buildVisibleImageData, allChannelsEnabled } from '../core/channels.js';

let canvas = null;
let ctx = null;

/** Оригинал изображения. */
let rawData = null;
/** Метаданные документа (format, hasMask). */
let docMeta = null;
/** Маска для gb7 (0/1) или null. */
let rawMask = null;

/** Множество включённых каналов. */
let enabledChannels = new Set();

export function initCanvasView(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d', { willReadFrequently: true });
  rawData = null;
  docMeta = null;
  rawMask = null;
  enabledChannels = new Set();
}

/**
 * Устанавливает новое изображение и метаданные.
 * @param {ImageData} imageData — оригинал
 * @param {{ format: 'raster'|'gb7', hasMask?: boolean }} docMeta
 * @param {{ mask?: Uint8Array|null, showMask?: boolean }} [opts]
 *   showMask — стартовое состояние канала 'a' (для совместимости с maskUI).
 *              Если false — альфа-канал выключен при загрузке.
 */
export function setImage(imageData, docMetaIn, opts = {}) {
  rawData = imageData;
  docMeta = docMetaIn;
  rawMask = opts.mask ?? null;

  enabledChannels = allChannelsEnabled(docMeta);
  // Совместимость с прежним maskUI: при showMask=false отключаем alpha.
  if (opts.showMask === false) {
    enabledChannels.delete('a');
  }

  repaint();
  canvas.style.width = '';
  canvas.style.height = '';
}

/** Перерисовывает холст с учётом текущего набора каналов. */
export function repaint() {
  if (!rawData) return;

  const visible = buildVisibleImageData(
    rawData,
    docMeta,
    enabledChannels,
    { mask: rawMask }
  );

  canvas.width = visible.width;
  canvas.height = visible.height;
  ctx.putImageData(visible, 0, 0);
}

/** Возвращает список каналов, применимых к текущему документу. */
export function getChannels() {
  return getChannelList(docMeta);
}

/** Возвращает Set включённых каналов (копию). */
export function getEnabledChannels() {
  return new Set(enabledChannels);
}

/** Полностью заменяет набор включённых каналов и перерисовывает. */
export function setEnabledChannels(set) {
  enabledChannels = new Set(set);
  repaint();
}

/** Включает/выключает конкретный канал. */
export function toggleChannel(id) {
  if (enabledChannels.has(id)) enabledChannels.delete(id);
  else enabledChannels.add(id);
  repaint();
  return enabledChannels.has(id);
}

/**
 * Устанавливает CSS-масштаб отображения canvas.
 * @param {number} scale — 1.0 = 100%
 */
export function setDisplayScale(scale) {
  if (!canvas || !rawData) return;
  const w = Math.max(1, Math.round(rawData.width * scale));
  const h = Math.max(1, Math.round(rawData.height * scale));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

/** Размеры оригинала в пикселях. */
export function getImageSize() {
  if (!rawData) return null;
  return { width: rawData.width, height: rawData.height };
}

/** Оригинальные данные (для пипетки). Не мутировать! */
export function getRawImageData() {
  return rawData;
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