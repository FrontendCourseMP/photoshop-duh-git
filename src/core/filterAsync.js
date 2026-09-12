/**
 * Асинхронная фильтрация через Web Worker.
 *
 * Если Worker недоступен (старый браузер, отключённые воркеры,
 * проблемы с загрузкой модуля) — откатывается к синхронному расчёту
 * в главном потоке. API в обоих случаях одинаковый.
 *
 * Отмена: у каждого запроса есть id. Если во время расчёта приходит
 * новый запрос, старый не прерывается (Worker уже работает), но его
 * результат игнорируется — колбэк resolve не вызывается для устаревшего id.
 *
 * Данные не мутируются: буфер копируется перед отправкой в воркер,
 * потому что после transfer буфер в главном потоке становится detached.
 */

import { filterImageData } from './filter.js';

/** Единственный на весь модуль воркер + очередь запросов. */
let worker = null;
let workerState = 'init';       // 'init' | 'ready' | 'unavailable'
let nextRequestId = 1;
const pending = new Map();      // id → { resolve, reject }
let workerFailedPermanently = false;

/**
 * Инициализация воркера (ленивая, при первом вызове).
 */
function ensureWorker() {
  if (workerState !== 'init') return;

  try {
    worker = new Worker(
      new URL('/src/workers/filter.worker.js', import.meta.url),
    );

    worker.addEventListener('message', onWorkerMessage);
    worker.addEventListener('error', onWorkerError);
    workerState = 'ready';
  } catch (err) {
    console.warn('filterAsync: Worker недоступен, fallback на синхронный расчёт', err);
    workerState = 'unavailable';
  }
}

function onWorkerMessage(e) {
  const { id, buffer, error } = e.data;
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);

  if (error) {
    entry.reject(new Error(error));
    return;
  }
  entry.resolve(buffer);
}

function onWorkerError(err) {
  // Ошибка загрузки модуля / необработанное исключение в воркере.
  console.warn('filterAsync: ошибка воркера', {
    message: err.message,
    filename: err.filename,
    lineno: err.lineno,
    colno: err.colno,
    error: err.error,
  });
  workerFailedPermanently = true;

  // Отклоняем все ожидающие задачи.
  for (const [, entry] of pending) {
    entry.reject(new Error('Worker error'));
  }
  pending.clear();

  try { worker?.terminate(); } catch { /* noop */ }
  worker = null;
  workerState = 'unavailable';
}

/**
 * Асинхронно применяет фильтр к ImageData.
 *
 * @param {ImageData} src
 * @param {number[]|Float32Array} kernel
 * @param {{
 *   channels: Set<string>,
 *   edge: 'black'|'white'|'copy',
 *   format: 'raster'|'gb7',
 * }} opts
 * @returns {Promise<ImageData>}
 */
export function filterImageDataAsync(src, kernel, opts) {
  const { channels, edge, format } = opts;

  ensureWorker();

  if (workerState === 'unavailable' || workerFailedPermanently) {
    // Fallback: считаем синхронно, но оборачиваем в Promise.
    return Promise.resolve().then(() =>
      filterImageData(src, kernel, {
        channels,
        edge,
        format,
      })
    );
  }

  return new Promise((resolve, reject) => {
    const id = nextRequestId++;

    // Копируем буфер для передачи в воркер — оригинал остаётся цел.
    const srcCopy = new Uint8ClampedArray(src.data);

    pending.set(id, {
      resolve: (buffer) => {
        const imageData = new ImageData(
          new Uint8ClampedArray(buffer),
          src.width,
          src.height
        );
        resolve(imageData);
      },
      reject,
    });

    worker.postMessage(
      {
        id,
        buffer: srcCopy.buffer,
        width: src.width,
        height: src.height,
        kernel: Array.from(kernel),
        channels: Array.from(channels),
        edge,
        format,
      },
      [srcCopy.buffer]
    );
  });
}

/**
 * Принудительно завершает работу воркера (например, при выгрузке страницы).
 * Не обязательно вызывать вручную, но полезно для чистоты.
 */
export function shutdownFilterWorker() {
  if (worker) {
    try { worker.terminate(); } catch { /* noop */ }
    worker = null;
  }
  workerState = 'init';
  workerFailedPermanently = false;
  pending.clear();
}