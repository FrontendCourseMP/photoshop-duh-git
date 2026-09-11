/**
 * Модуль описания цветовых каналов изображения и сборки видимого ImageData.
 *
 * Ключевые правила:
 *   1. Оригинальный ImageData (rawData) НИКОГДА не мутируется.
 *   2. Состав каналов зависит от формата:
 *        - 'raster' (PNG/JPG): ['r','g','b','a']
 *        - 'gb7' с маской:     ['gray','a']
 *        - 'gb7' без маски:    ['gray']
 *   3. Видимый ImageData собирается с нуля на основе rawData и
 *      текущего набора включённых каналов.
 *
 * Для GB7 «серая» составляющая хранится как R=G=B=gray, альфа — из маски.
 * Для raster — как обычно.
 */

/**
 * @typedef {'r'|'g'|'b'|'a'|'gray'} ChannelId
 */

/**
 * @typedef {Object} ChannelInfo
 * @property {ChannelId} id
 * @property {string} label       — короткое имя для UI («Red», «Alpha», …)
 * @property {string} cssColor    — цвет метки/индикатора (для UI)
 */

/** Все каналы, которые умеет показывать панель. */
export const ALL_CHANNELS = {
  r: { id: 'r', label: 'Red', cssColor: '#e05252' },
  g: { id: 'g', label: 'Green', cssColor: '#57b45a' },
  b: { id: 'b', label: 'Blue', cssColor: '#4a7fe0' },
  gray: { id: 'gray', label: 'Gray', cssColor: '#b0b0b0' },
  a: { id: 'a', label: 'Alpha', cssColor: '#8a8a8a' },
};

/**
 * Возвращает список каналов, применимых к данному изображению,
 * в порядке отображения в панели.
 *
 * @param {{ format: 'raster'|'gb7', hasMask?: boolean }} doc
 * @returns {ChannelId[]}
 */
export function getChannelList(doc) {
  if (!doc) return [];
  if (doc.format === 'gb7') {
    return doc.hasMask ? ['gray', 'a'] : ['gray'];
  }
  // raster (PNG/JPG) — у нас всегда RGBA в ImageData,
  // даже если по факту альфа везде 255. Показываем все 4 канала.
  return ['r', 'g', 'b', 'a'];
}

/**
 * Строит видимое изображение по оригиналу и набору включённых каналов.
 *
 * @param {ImageData} rawData        — оригинал (не мутируется)
 * @param {{ format: 'raster'|'gb7', hasMask?: boolean }} doc
 * @param {Set<ChannelId>} enabled   — какие каналы сейчас включены
 * @param {{ mask?: Uint8Array|null }} [opts] — маска для gb7 (0/1)
 * @returns {ImageData}              — новый ImageData для отрисовки
 */
export function buildVisibleImageData(rawData, doc, enabled, opts = {}) {
  const { width, height, data } = rawData;
  const out = new ImageData(width, height);
  const dst = out.data;

  const isGB7 = doc?.format === 'gb7';
  const mask = opts.mask ?? null;

  // Для GB7 источник «серого» — R-канал ImageData (после gb7ToImageData R=G=B).
  // Для raster каждый канал берётся из своего места.

  const enableR = isGB7 ? enabled.has('gray') : enabled.has('r');
  const enableG = isGB7 ? enabled.has('gray') : enabled.has('g');
  const enableB = isGB7 ? enabled.has('gray') : enabled.has('b');

  // Альфа: для raster берём из rawData A-канала; для gb7 — из маски.
  // Если alpha-канал выключен — считаем alpha = 255 (непрозрачно).
  const enableA = enabled.has('a');

  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;

    dst[o] = enableR ? data[o] : 0;
    dst[o + 1] = enableG ? data[o + 1] : 0;
    dst[o + 2] = enableB ? data[o + 2] : 0;

    let a;
    if (isGB7) {
      // если маски нет — всё непрозрачно
      const maskBit = mask ? mask[i] : 1;
      a = maskBit === 0 ? 0 : 255;
    } else {
      a = data[o + 3];
    }
    dst[o + 3] = enableA ? a : 255;
  }

  return out;
}

/**
 * Проверяет, что набор включённых каналов осмыслен
 * (не пустой — иначе холст станет полностью чёрным).
 * Пустой набор трактуем как «всё включено» на уровне UI.
 *
 * @param {Set<ChannelId>} enabled
 * @returns {boolean}
 */
export function isEnabledSetValid(enabled) {
  return enabled.size > 0;
}

/**
 * Возвращает Set со всеми каналами для данного документа.
 * @param {{ format: 'raster'|'gb7', hasMask?: boolean }} doc
 * @returns {Set<ChannelId>}
 */
export function allChannelsEnabled(doc) {
  return new Set(getChannelList(doc));
}