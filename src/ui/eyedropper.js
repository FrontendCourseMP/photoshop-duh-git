/**
 * Инструмент «Пипетка».
 *
 * Логика:
 *   - пока инструмент не активен — обработчик клика ничего не делает;
 *   - при клике левой кнопкой по холсту:
 *       * координаты курсора переводятся из CSS-пикселей в пиксели буфера
 *         (учитывая возможный CSS-масштаб canvas);
 *       * читается пиксель из ОРИГИНАЛЬНОГО ImageData (rawData), а не из
 *         холста — иначе на результат влияли бы выключенные каналы;
 *       * вызывается callback onPick.
 *
 * Обратите внимание: координаты должны попадать в диапазон [0, width) × [0, height).
 */

let canvasEl = null;
let areaEl = null;
let getRaw = null;
let onPickCb = null;
let isActiveFn = null;

/**
 * @param {{
 *   canvas: HTMLCanvasElement,
 *   area: HTMLElement,
 *   getRawImageData: () => ImageData|null,
 *   isActive: () => boolean,
 *   onPick: (result: {
 *     x: number, y: number,
 *     r: number, g: number, b: number, a: number,
 *   }) => void
 * }} opts
 */
export function initEyedropper({ canvas, area, getRawImageData, isActive, onPick }) {
  canvasEl = canvas;
  areaEl = area;
  getRaw = getRawImageData;
  isActiveFn = isActive;
  onPickCb = onPick;

  canvasEl.addEventListener('click', handleClick);
}

function handleClick(e) {
  if (!isActiveFn || !isActiveFn()) return;

  const raw = getRaw?.();
  if (!raw) return;

  const hit = mapClientToPixel(e.clientX, e.clientY, canvasEl, raw.width, raw.height);
  if (!hit) return;

  const { x, y } = hit;
  const o = (y * raw.width + x) * 4;
  const r = raw.data[o];
  const g = raw.data[o + 1];
  const b = raw.data[o + 2];
  const a = raw.data[o + 3];

  onPickCb?.({ x, y, r, g, b, a });
}

/**
 * Переводит координаты клика (clientX/clientY) в координаты пикселя на буфере.
 * Учитывает CSS-масштаб и возможный сдвиг канвы внутри viewport.
 *
 * @returns {{ x: number, y: number } | null}
 */
function mapClientToPixel(clientX, clientY, canvas, bufW, bufH) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  // Пиксель относительно левого-верхнего угла видимой области canvas.
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;

  // Отсекаем клики за пределами видимой области (на всякий случай).
  if (localX < 0 || localY < 0 || localX >= rect.width || localY >= rect.height) {
    return null;
  }

  // Масштаб: сколько CSS-пикселей приходится на 1 пиксель буфера.
  const scaleX = rect.width / bufW;
  const scaleY = rect.height / bufH;

  const x = Math.floor(localX / scaleX);
  const y = Math.floor(localY / scaleY);

  // На всякий случай — clamp (float-ошибки могут дать x === bufW).
  return {
    x: Math.min(bufW - 1, Math.max(0, x)),
    y: Math.min(bufH - 1, Math.max(0, y)),
  };
}