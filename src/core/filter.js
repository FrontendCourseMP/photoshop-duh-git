/**
 * Фильтрация изображения через свёртку с ядром 3×3.
 *
 * Универсальная обёртка над convolveChannel: собирает одноканальные
 * буферы из ImageData, применяет свёртку к выбранным каналам,
 * собирает результат в новый ImageData. Оригинал не мутируется.
 *
 * Форматы:
 *   - raster: каналы 'r', 'g', 'b', 'a' обрабатываются независимо;
 *   - gb7: канал 'gray' пишется в R=G=B, канал 'a' — в alpha.
 *
 * Если канал не входит в channels — он копируется без изменений.
 */

import { convolveChannel, DEFAULT_EDGE_HANDLING } from './convolution.js';

/**
 * @typedef {'r'|'g'|'b'|'a'|'gray'} FilterChannelId
 */

/**
 * @param {ImageData} src
 * @param {number[]|Float32Array} kernel   — 9 коэффициентов
 * @param {{
 *   channels: Set<FilterChannelId>,
 *   edge?: 'black'|'white'|'copy',
 *   format?: 'raster'|'gb7',
 *   onProgress?: (done: number, total: number) => void,
 * }} opts
 * @returns {ImageData}
 */
export function filterImageData(src, kernel, opts) {
  const {
    channels,
    edge = DEFAULT_EDGE_HANDLING,
    format = 'raster',
    onProgress,
  } = opts;

  const { width: w, height: h, data: srcData } = src;
  const n = w * h;

  const out = new ImageData(w, h);
  const dst = out.data;

  // Сначала копируем оригинал целиком — так «невыбранные» каналы
  // останутся без изменений, и нам не нужно обрабатывать их отдельно.
  dst.set(srcData);

  if (!channels || channels.size === 0) {
    return out;
  }

  // Определяем, какие физические каналы фильтровать.
  // - raster: r→R, g→G, b→B, a→A
  // - gb7:    gray→(R=G=B), a→A
  const doR = format === 'gb7' ? channels.has('gray') : channels.has('r');
  const doG = format === 'gb7' ? false : channels.has('g');
  const doB = format === 'gb7' ? false : channels.has('b');
  const doA = channels.has('a');

  // Считаем общее количество проходов для прогресса.
  const totalPasses =
    (doR ? 1 : 0) + (doG ? 1 : 0) + (doB ? 1 : 0) +
    // для gb7 gray считается один раз, но копируется в 3 канала —
    // в прогрессе учитываем как 1
    (doA ? 1 : 0);
  let donePasses = 0;
  const tick = () => {
    donePasses++;
    onProgress?.(donePasses, totalPasses);
  };

  // Извлекаем канал в отдельный буфер длиной n.
  const extract = (offset) => {
    const buf = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) buf[i] = srcData[i * 4 + offset];
    return buf;
  };

  // Записываем результат обратно в нужный канал (или каналы).
  const writeBack = (buf, ...offsets) => {
    for (let i = 0; i < n; i++) {
      const v = buf[i];
      const o = i * 4;
      for (const off of offsets) dst[o + off] = v;
    }
  };

  // ——— R или gray ———
  if (doR) {
    const buf = extract(0);
    const filtered = convolveChannel(buf, w, h, kernel, { edge });
    if (format === 'gb7') {
      // gray → R, G, B одновременно
      writeBack(filtered, 0, 1, 2);
    } else {
      writeBack(filtered, 0);
    }
    tick();
  }

  // ——— G ———
  if (doG) {
    const buf = extract(1);
    const filtered = convolveChannel(buf, w, h, kernel, { edge });
    writeBack(filtered, 1);
    tick();
  }

  // ——— B ———
  if (doB) {
    const buf = extract(2);
    const filtered = convolveChannel(buf, w, h, kernel, { edge });
    writeBack(filtered, 2);
    tick();
  }

  // ——— Alpha ———
  if (doA) {
    const buf = extract(3);
    const filtered = convolveChannel(buf, w, h, kernel, { edge });
    writeBack(filtered, 3);
    tick();
  }

  return out;
}

/**
 * Нормализует «пользовательский» набор каналов (как их выбирает UI)
 * в набор фильтруемых. Специальная семантика:
 *   - 'master' эквивалентен всем доступным для формата каналам.
 *
 * @param {{
 *   master: boolean,
 *   r: boolean, g: boolean, b: boolean, a: boolean,
 *   gray: boolean,
 * }} uiSelection
 * @param {'raster'|'gb7'} format
 * @returns {Set<FilterChannelId>}
 */
export function resolveUiChannels(uiSelection, format) {
  const set = new Set();
  if (format === 'gb7') {
    if (uiSelection.master || uiSelection.gray) set.add('gray');
    if (uiSelection.master || uiSelection.a) set.add('a');
  } else {
    if (uiSelection.master || uiSelection.r) set.add('r');
    if (uiSelection.master || uiSelection.g) set.add('g');
    if (uiSelection.master || uiSelection.b) set.add('b');
    if (uiSelection.master || uiSelection.a) set.add('a');
  }
  return set;
}