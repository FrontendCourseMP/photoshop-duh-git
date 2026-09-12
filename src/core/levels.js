/**
 * Градационные преобразования (Levels).
 *
 * Идея: для 8-битных изображений все вычисления сводятся к таблице
 * подстановки (LUT) длиной 256. Применение к пикселю — просто
 * out = lut[in], что даёт O(1) на пиксель и очень быстро.
 *
 * Формула Levels:
 *   x = clamp((v - black) / (white - black), 0, 1)
 *   y = x ^ (1 / gamma)
 *   out = round(y * 255)
 *
 *   gamma > 1 → средние тона светлее (в Photoshop — сдвиг ползунка влево)
 *   gamma < 1 → средние тона темнее (сдвиг ползунка вправо)
 *   gamma = 1 → линейное отображение
 *
 * ВАЖНО: значения по умолчанию — black=0, white=255, gamma=1 —
 * дают тождественное преобразование (lut[i] = i).
 */

export const GAMMA_MIN = 0.1;
export const GAMMA_MAX = 9.9;

/**
 * @typedef {Object} LevelsParams
 * @property {number} black   — 0..254
 * @property {number} white   — 1..255
 * @property {number} gamma   — GAMMA_MIN..GAMMA_MAX
 */

/** Параметры по умолчанию (тождественное преобразование). */
export function defaultLevelsParams() {
  return { black: 0, white: 255, gamma: 1 };
}

/**
 * Нормализует параметры: гарантирует корректный порядок и границы.
 * Применяем на входе в построение LUT — чтобы UI мог не заботиться.
 *
 * @param {LevelsParams} p
 * @returns {LevelsParams}
 */
export function normalizeLevelsParams(p) {
  let { black, white, gamma } = p;

  black = Math.round(clamp(black, 0, 254));
  white = Math.round(clamp(white, 1, 255));

  // Гарантируем чёрная < белая и между ними хотя бы 1 шаг.
  if (black >= white) {
    // Отдаём приоритет тому, что «тянут» в UI; здесь — сдвигаем белый.
    white = Math.min(255, black + 1);
    if (white <= black) black = white - 1;
  }

  gamma = clamp(gamma, GAMMA_MIN, GAMMA_MAX);

  return { black, white, gamma };
}

/**
 * Строит LUT длиной 256.
 * @param {LevelsParams} params
 * @returns {Uint8Array}
 */
export function buildLUT(params) {
  const { black, white, gamma } = normalizeLevelsParams(params);
  const lut = new Uint8Array(256);

  const span = white - black;
  const invGamma = 1 / gamma;

  for (let v = 0; v < 256; v++) {
    if (v <= black) {
      lut[v] = 0;
      continue;
    }
    if (v >= white) {
      lut[v] = 255;
      continue;
    }
    const x = (v - black) / span;       // 0..1
    const y = Math.pow(x, invGamma);    // 0..1
    lut[v] = Math.round(y * 255);
  }

  // Крайние случаи: black=0 → lut[0] остаётся 0; white=255 → lut[255]=255.
  lut[black] = 0;
  lut[white] = 255;

  return lut;
}

/**
 * Применяет LUT к набору каналов в ImageData.
 * Возвращает НОВЫЙ ImageData (оригинал не мутируется).
 *
 * @param {ImageData} src
 * @param {{
 *   master?: LevelsParams|null,   // применяется ко всем RGB-каналам
 *   r?: LevelsParams|null,        // индивидуально (перебивает master)
 *   g?: LevelsParams|null,
 *   b?: LevelsParams|null,
 *   a?: LevelsParams|null,        // к alpha-каналу
 *   gray?: LevelsParams|null,     // для GB7: применяется к R=G=B
 * }} byChannel
 * @param {{ format?: 'raster'|'gb7' }} [opts]
 * @returns {ImageData}
 */
export function applyLevels(src, byChannel, opts = {}) {
  const { width, height, data } = src;
  const out = new ImageData(width, height);
  const dst = out.data;

  const isGB7 = opts.format === 'gb7';

  // Готовим LUT'ы (либо identity, если параметры не заданы).
  const idLUT = identityLUT();

  const masterLUT = byChannel.master
    ? buildLUT(byChannel.master)
    : null;

  const rLUT = isGB7
    ? (byChannel.gray ? buildLUT(byChannel.gray) : (masterLUT ?? idLUT))
    : (byChannel.r ? buildLUT(byChannel.r) : (masterLUT ?? idLUT));

  const gLUT = isGB7
    ? rLUT
    : (byChannel.g ? buildLUT(byChannel.g) : (masterLUT ?? idLUT));

  const bLUT = isGB7
    ? rLUT
    : (byChannel.b ? buildLUT(byChannel.b) : (masterLUT ?? idLUT));

  const aLUT = byChannel.a ? buildLUT(byChannel.a) : idLUT;

  const n = width * height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    dst[o] = rLUT[data[o]];
    dst[o + 1] = gLUT[data[o + 1]];
    dst[o + 2] = bLUT[data[o + 2]];
    dst[o + 3] = aLUT[data[o + 3]];
  }

  return out;
}

/**
 * Быстрая проверка: является ли набор параметров «тождественным»
 * (все LUT = identity). Нужна, чтобы быстро сбросить предпросмотр.
 *
 * @param {Object} byChannel
 * @param {{ format?: 'raster'|'gb7' }} [opts]
 * @returns {boolean}
 */
export function isIdentity(byChannel, opts = {}) {
  const isGB7 = opts.format === 'gb7';

  const isId = (p) => !p || (p.black === 0 && p.white === 255 && p.gamma === 1);

  if (!isId(byChannel.master)) return false;
  if (!isId(byChannel.a)) return false;

  if (isGB7) {
    return isId(byChannel.gray);
  }
  return isId(byChannel.r) && isId(byChannel.g) && isId(byChannel.b);
}

// ——— Внутреннее ———

function identityLUT() {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = i;
  return lut;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}