/**
 * Web Worker для фильтрации изображений свёрткой.
 *
 * Входное сообщение:
 *   {
 *     id: number,
 *     buffer: ArrayBuffer,     // RGBA-данные, transferable
 *     width: number,
 *     height: number,
 *     kernel: number[],        // 9 коэффициентов
 *     channels: string[],      // ['r','g','b','a'] или ['gray','a']
 *     edge: 'black'|'white'|'copy',
 *     format: 'raster'|'gb7',
 *   }
 *
 * Ответное сообщение:
 *   { id, buffer: ArrayBuffer }   — RGBA-данные результата
 *   или { id, error: string }
 *
 * Логика фильтрации — в core/filter.js, чтобы не дублировать код
 * между воркером и синхронным fallback.
 */

import { filterImageData } from '../src/core/filter.js';

self.onmessage = (e) => {
  const { id, buffer, width, height, kernel, channels, edge, format } = e.data;

  try {
    const src = new ImageData(
      new Uint8ClampedArray(buffer),
      width,
      height
    );

    const out = filterImageData(src, kernel, {
      channels: new Set(channels),
      edge,
      format,
    });

    // Передаём результирующий буфер как transferable.
    const outBuffer = out.data.buffer;
    self.postMessage({ id, buffer: outBuffer }, [outBuffer]);
  } catch (err) {
    self.postMessage({ id, error: err?.message ?? String(err) });
  }
};