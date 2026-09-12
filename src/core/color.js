/**
 * Преобразования цвета.
 *
 * Реализованы:
 *   - sRGB (0..255) → линейный RGB (0..1);
 *   - линейный RGB → XYZ (D65);
 *   - XYZ → CIELAB (D65).
 *
 * Источники:
 *   - IEC 61966-2-1 (sRGB);
 *   - CIE 15:2004 (CIELAB), стандартный осветитель D65.
 */

const D65 = { Xn: 0.95047, Yn: 1.00000, Zn: 1.08883 };

const DELTA = 6 / 29;
const DELTA_CUBE = DELTA * DELTA * DELTA; // ≈ 0.008856
const DELTA_SQ_INV = 1 / (3 * DELTA * DELTA); // ≈ 7.787

/**
 * sRGB-канал (0..1) → линейный (0..1).
 * @param {number} c
 * @returns {number}
 */
function srgbToLinear(c) {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * f(t) из спецификации CIELAB.
 * @param {number} t
 * @returns {number}
 */
function f(t) {
  if (t > DELTA_CUBE) return Math.cbrt(t);
  return t * DELTA_SQ_INV + 4 / 29;
}

/**
 * sRGB (0..255) → CIELAB (D65).
 *
 * @param {number} r  0..255
 * @param {number} g  0..255
 * @param {number} b  0..255
 * @returns {{ L: number, a: number, b: number }}
 */
export function srgbToLab(r, g, b) {
  // 0..255 → 0..1
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  // гамма
  const rl = srgbToLinear(rn);
  const gl = srgbToLinear(gn);
  const bl = srgbToLinear(bn);

  // линейный RGB → XYZ (D65)
  const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const Y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl;
  const Z = 0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl;

  // нормировка
  const fx = f(X / D65.Xn);
  const fy = f(Y / D65.Yn);
  const fz = f(Z / D65.Zn);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);

  return { L, a, b: bLab };
}