/**
 * Свёртка одного канала изображения с ядром 3×3.
 *
 * Работаем с одноканальным буфером (Uint8ClampedArray длиной W*H),
 * а не с RGBA — так свёртку можно применить к произвольному каналу
 * (R, G, B, A, gray) независимо.
 *
 * Стратегии обработки края (padding):
 *   - 'black' — за границей 0;
 *   - 'white' — за границей 255;
 *   - 'copy'  — за границей берётся ближайший краевой пиксель
 *     (clamp координат).
 *
 * Значения ядра НЕ нормируются автоматически: если сумма коэффициентов
 * не равна 1, яркость может «уехать» — это ожидаемое поведение
 * (используется, например, в фильтрах Прюитта с суммой 0).
 */

export const EDGE_HANDLING = {
  black: { id: 'black', label: 'Чёрный', fill: 0 },
  white: { id: 'white', label: 'Белый', fill: 255 },
  copy: { id: 'copy', label: 'Копирование', fill: null },
};

export const DEFAULT_EDGE_HANDLING = 'copy';

/**
 * Применяет ядро 3×3 к одноканальному буферу.
 *
 * @param {Uint8ClampedArray} src — входной буфер, длина w*h
 * @param {number} w
 * @param {number} h
 * @param {Float32Array|number[]} kernel — 9 коэффициентов
 * @param {{
 *   edge?: 'black'|'white'|'copy',
 *   out?: Uint8ClampedArray,       // необязательный буфер для результата
 * }} [opts]
 * @returns {Uint8ClampedArray} — новый (или переданный) буфер
 */
export function convolveChannel(src, w, h, kernel, opts = {}) {
  const { edge = DEFAULT_EDGE_HANDLING, out } = opts;

  if (kernel.length !== 9) {
    throw new Error('convolveChannel: ядро должно быть 3×3 (9 элементов)');
  }
  if (src.length !== w * h) {
    throw new Error('convolveChannel: длина буфера не соответствует размерам');
  }

  const dst = out ?? new Uint8ClampedArray(w * h);

  const k0 = kernel[0], k1 = kernel[1], k2 = kernel[2];
  const k3 = kernel[3], k4 = kernel[4], k5 = kernel[5];
  const k6 = kernel[6], k7 = kernel[7], k8 = kernel[8];

  const fill = edge === 'black' ? 0 : edge === 'white' ? 255 : null;
  const useCopy = fill === null;

  for (let y = 0; y < h; y++) {
    const yUp = y - 1;
    const yDn = y + 1;
    const rowUp = yUp * w;
    const rowMid = y * w;
    const rowDn = yDn * w;

    for (let x = 0; x < w; x++) {
      const xLf = x - 1;
      const xRt = x + 1;

      // Значения 8 соседей + центра. Для 'copy' — клампим координаты.
      // Для 'black'/'white' — берём fill.
      let v00, v01, v02;
      let v10, v11, v12;
      let v20, v21, v22;

      if (useCopy) {
        const yyU = yUp < 0 ? 0 : yUp;
        const yyD = yDn >= h ? h - 1 : yDn;
        const xxL = xLf < 0 ? 0 : xLf;
        const xxR = xRt >= w ? w - 1 : xRt;

        v00 = src[yyU * w + xxL];
        v01 = src[yyU * w + x];
        v02 = src[yyU * w + xxR];
        v10 = src[rowMid + xxL];
        v11 = src[rowMid + x];
        v12 = src[rowMid + xxR];
        v20 = src[yyD * w + xxL];
        v21 = src[yyD * w + x];
        v22 = src[yyD * w + xxR];
      } else {
        v11 = src[rowMid + x];

        v01 = (yUp < 0) ? fill : src[rowUp + x];
        v21 = (yDn >= h) ? fill : src[rowDn + x];
        v10 = (xLf < 0) ? fill : src[rowMid + xLf];
        v12 = (xRt >= w) ? fill : src[rowMid + xRt];

        v00 = (yUp < 0 || xLf < 0) ? fill : src[rowUp + xLf];
        v02 = (yUp < 0 || xRt >= w) ? fill : src[rowUp + xRt];
        v20 = (yDn >= h || xLf < 0) ? fill : src[rowDn + xLf];
        v22 = (yDn >= h || xRt >= w) ? fill : src[rowDn + xRt];
      }

      const sum =
        v00 * k0 + v01 * k1 + v02 * k2 +
        v10 * k3 + v11 * k4 + v12 * k5 +
        v20 * k6 + v21 * k7 + v22 * k8;

      dst[rowMid + x] = sum; // Uint8ClampedArray сам клампит и округляет
    }
  }

  return dst;
}