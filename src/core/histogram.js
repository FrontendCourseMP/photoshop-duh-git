/**
 * Вычисление гистограмм изображения.
 *
 * Гистограмма — массив из 256 чисел: сколько пикселей имеют
 * данную интенсивность в выбранном канале.
 *
 * Каналы:
 *   - 'master' — композитная яркость по Rec. 709 (0.2126·R + 0.7152·G + 0.0722·B);
 *   - 'r', 'g', 'b' — отдельные каналы ImageData;
 *   - 'a' — альфа-канал;
 *   - 'gray' — «серый» канал для GB7 (читаем из R, т.к. R=G=B).
 *
 * Все значения в диапазоне 0..255.
 */

/**
 * @typedef {Uint32Array} Histogram   — длина 256
 */

/**
 * Считает гистограмму указанного канала.
 *
 * @param {ImageData} imageData
 * @param {'master'|'r'|'g'|'b'|'a'|'gray'} channel
 * @returns {Histogram}
 */
export function computeHistogram(imageData, channel = 'master') {
  const hist = new Uint32Array(256);
  const { data } = imageData;
  const n = data.length;

  switch (channel) {
    case 'master': {
      for (let i = 0; i < n; i += 4) {
        const y = Math.round(
          0.2126 * data[i] +
          0.7152 * data[i + 1] +
          0.0722 * data[i + 2]
        );
        hist[y < 0 ? 0 : y > 255 ? 255 : y]++;
      }
      break;
    }
    case 'r':
    case 'gray': {
      for (let i = 0; i < n; i += 4) {
        hist[data[i]]++;
      }
      break;
    }
    case 'g': {
      for (let i = 1; i < n; i += 4) {
        hist[data[i]]++;
      }
      break;
    }
    case 'b': {
      for (let i = 2; i < n; i += 4) {
        hist[data[i]]++;
      }
      break;
    }
    case 'a': {
      for (let i = 3; i < n; i += 4) {
        hist[data[i]]++;
      }
      break;
    }
    default:
      throw new Error(`Неизвестный канал гистограммы: ${channel}`);
  }

  return hist;
}

/**
 * Возвращает все гистограммы, применимые к данному документу.
 * Полезно, когда UI нужно переключаться между каналами без повторного
 * чтения пикселей.
 *
 * @param {ImageData} imageData
 * @param {{ format: 'raster'|'gb7', hasMask?: boolean }} doc
 * @returns {{
 *   master: Histogram,
 *   r?: Histogram, g?: Histogram, b?: Histogram,
 *   gray?: Histogram,
 *   a?: Histogram
 * }}
 */
export function computeAllHistograms(imageData, doc) {
  const result = {
    master: computeHistogram(imageData, 'master'),
  };

  if (doc?.format === 'gb7') {
    result.gray = computeHistogram(imageData, 'gray');
    if (doc.hasMask) {
      result.a = computeHistogram(imageData, 'a');
    }
  } else {
    result.r = computeHistogram(imageData, 'r');
    result.g = computeHistogram(imageData, 'g');
    result.b = computeHistogram(imageData, 'b');
    if (doc?.hasAlpha) {
      result.a = computeHistogram(imageData, 'a');
    }
  }

  return result;
}

/**
 * Нормализует гистограмму к диапазону [0, 1] для отрисовки.
 *
 * @param {Histogram} hist
 * @param {{
 *   log?: boolean,      // логарифмическая шкала
 *   excludeZero?: boolean, // не учитывать bin[0] при поиске max (полезно,
 *                          // когда много «мёртвых» пикселей с v=0)
 * }} [opts]
 * @returns {{
 *   values: Float32Array, // 256 значений, 0..1
 *   max: number,          // исходный максимум (до нормализации), для подписи
 * }}
 */
export function normalizeHistogram(hist, opts = {}) {
  const { log = false, excludeZero = false } = opts;

  // Ищем максимум (по исходным или логарифмированным значениям).
  let max = 0;
  const transformed = new Float64Array(256);

  for (let i = 0; i < 256; i++) {
    const v = hist[i];
    // log(1 + v) — сглаживает «пики» на нуле и делает различимыми
    // редкие, но ненулевые значения.
    const t = log ? Math.log1p(v) : v;
    transformed[i] = t;

    if (excludeZero && i === 0) continue;
    if (t > max) max = t;
  }

  const values = new Float32Array(256);
  if (max === 0) {
    // Пустая гистограмма — все нули.
    return { values, max: 0 };
  }

  const inv = 1 / max;
  for (let i = 0; i < 256; i++) {
    values[i] = transformed[i] * inv;
  }

  return { values, max };
}

/**
 * Возвращает список «человеческих» меток каналов для UI.
 * Соответствует ALL_CHANNELS из core/channels.js + master.
 */
export const HISTOGRAM_CHANNELS = {
  master: { id: 'master', label: 'Master', cssColor: '#dddddd' },
  r: { id: 'r', label: 'Red', cssColor: '#e05252' },
  g: { id: 'g', label: 'Green', cssColor: '#57b45a' },
  b: { id: 'b', label: 'Blue', cssColor: '#4a7fe0' },
  gray: { id: 'gray', label: 'Gray', cssColor: '#b0b0b0' },
  a: { id: 'a', label: 'Alpha', cssColor: '#8a8a8a' },
};

/**
 * Возвращает список доступных для выбора каналов гистограммы
 * (в порядке отображения в выпадающем списке).
 *
 * @param {{ format: 'raster'|'gb7', hasMask?: boolean, hasAlpha?: boolean }} doc
 * @returns {string[]}
 */
export function getHistogramChannelList(doc) {
  if (!doc) return ['master'];
  if (doc.format === 'gb7') {
    return doc.hasMask ? ['master', 'gray', 'a'] : ['master', 'gray'];
  }
  const base = ['master', 'r', 'g', 'b'];
  return doc.hasAlpha ? [...base, 'a'] : base;
}