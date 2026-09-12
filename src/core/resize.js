/**
 * Масштабирование изображений.
 *
 * Два сценария:
 *   1) Обычный ImageData (raster): интерполируем RGBA-каналы.
 *   2) GB7: интерполируем «сырые» 7-битные pixels и бинарную маску
 *      отдельно. Маску после интерполяции бинаризуем (<0.5 → 0, ≥0.5 → 1).
 *
 * Оригинал никогда не мутируется — всегда возвращается новый объект.
 */

import {
  getInterpolationMethod,
  DEFAULT_INTERPOLATION_ID,
} from './interpolation.js';
import { LIMITS, checkPixelBudget } from './limits.js';
import { gb7ToImageData } from './gb7.js';

/**
 * @typedef {Object} ResizeResult
 * @property {ImageData} imageData  — новый ImageData
 * @property {number} width
 * @property {number} height
 */

/**
 * Масштабирует ImageData.
 *
 * @param {ImageData} src
 * @param {number} newW
 * @param {number} newH
 * @param {string} [methodId]
 * @returns {ResizeResult}
 */
export function resizeImageData(src, newW, newH, methodId = DEFAULT_INTERPOLATION_ID) {
  assertValidSize(newW, newH, src.width * src.height);

  const method = getInterpolationMethod(methodId);
  if (!method) {
    throw new Error(`resize: неизвестный метод интерполяции «${methodId}»`);
  }

  // Fast path: без изменения размеров — просто копия.
  if (newW === src.width && newH === src.height) {
    const copy = new ImageData(src.width, src.height);
    copy.data.set(src.data);
    return { imageData: copy, width: src.width, height: src.height };
  }

  const dst = new ImageData(newW, newH);
  method.apply(src.data, src.width, src.height, dst.data, newW, newH);
  return { imageData: dst, width: newW, height: newH };
}

/**
 * Масштабирует GB7: отдельно 7-битные пиксели и (если есть) бинарную маску.
 *
 * Возвращает:
 *   - pixels  — Uint8Array длиной newW*newH со значениями 0..127
 *   - mask    — Uint8Array длиной newW*newH с 0/1, или null
 *   - imageData — ImageData, собранный из pixels + mask
 *                  (для отображения на холсте без потерь через gb7ToImageData)
 *
 * @param {{
 *   width: number, height: number,
 *   pixels: Uint8Array,
 *   mask: Uint8Array|null,
 * }} gb7
 * @param {number} newW
 * @param {number} newH
 * @param {string} [methodId]
 * @returns {{
 *   pixels: Uint8Array,
 *   mask: Uint8Array|null,
 *   imageData: ImageData,
 *   width: number, height: number,
 * }}
 */
export function resizeGB7(gb7, newW, newH, methodId = DEFAULT_INTERPOLATION_ID) {
  assertValidSize(newW, newH, gb7.width * gb7.height);

  const method = getInterpolationMethod(methodId);
  if (!method) {
    throw new Error(`resizeGB7: неизвестный метод интерполяции «${methodId}»`);
  }

  // Готовим «псевдо-ImageData» для интерполяции: R=G=B=gray, A=mask*255.
  // Это позволяет использовать единый apply(...) для пикселей и маски
  // за один проход (интерполируем сразу RGBA), а потом обратно
  // разложить результат в pixels/mask.
  const rgbaSrc = packGB7AsRGBA(gb7.width, gb7.height, gb7.pixels, gb7.mask);

  const rgbaDst = new Uint8ClampedArray(newW * newH * 4);
  method.apply(rgbaSrc, gb7.width, gb7.height, rgbaDst, newW, newH);

  const { pixels, mask } = unpackRGBAAsGB7(rgbaDst, newW, newH, !!gb7.mask);

  // imageData для отображения — используем gb7ToImageData через
  // промежуточный «decode-подобный» объект.
  const imageData = gb7ToImageData({
    width: newW,
    height: newH,
    pixels,
  });

  return { pixels, mask, imageData, width: newW, height: newH };
}

// ——— Внутреннее ———

/**
 * Упаковывает GB7 в RGBA для интерполяции.
 * gray (0..127) → R=G=B=(gray << 1) | (gray >> 6) — то же преобразование,
 * что и в gb7ToImageData, чтобы значения были «визуально» корректны
 * при интерполяции. mask (0/1) → A=0|255.
 */
function packGB7AsRGBA(w, h, pixels, mask) {
  const out = new Uint8ClampedArray(w * h * 4);
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const v = pixels[i];
    const g = (v << 1) | (v >> 6);
    const o = i * 4;
    out[o] = g;
    out[o + 1] = g;
    out[o + 2] = g;
    out[o + 3] = mask ? (mask[i] ? 255 : 0) : 255;
  }
  return out;
}

/**
 * Обратная операция: RGBA → 7-битные pixels + бинарная маска.
 * gray: R → 7 бит. Правило, обратное gb7ToImageData:
 *   берём верхние 7 бит: v = (g >> 1)   для g в 0..254,
 *   255 → 127.
 */
function unpackRGBAAsGB7(rgba, w, h, hasMask) {
  const n = w * h;
  const pixels = new Uint8Array(n);
  const mask = hasMask ? new Uint8Array(n) : null;

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const g = rgba[o];
    pixels[i] = g >= 254 ? 127 : (g >> 1);
    if (hasMask) {
      mask[i] = rgba[o + 3] >= 128 ? 1 : 0;
    }
  }
  return { pixels, mask };
}

/** Проверка размеров и бюджета пикселей. */
function assertValidSize(newW, newH, srcPixels) {
  if (!Number.isInteger(newW) || !Number.isInteger(newH)) {
    throw new Error('resize: ширина и высота должны быть целыми числами');
  }
  if (newW < 1 || newH < 1) {
    throw new Error(`resize: размеры должны быть ≥ 1, получено ${newW}×${newH}`);
  }
  if (newW > 0xffff || newH > 0xffff) {
    throw new Error(
      `resize: размеры ограничены 65535 (лимит формата), получено ${newW}×${newH}`
    );
  }

  const budget = checkPixelBudget(newW * newH);
  if (budget === 'too-large') {
    throw new Error(
      `resize: новый размер ${newW}×${newH} = ${(newW * newH / 1e6).toFixed(1)} Мпикс ` +
      `превышает безопасный предел (${(LIMITS.MAX_PIXELS / 1e6).toFixed(0)} Мпикс)`
    );
  }
}