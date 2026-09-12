/**
 * Web Worker для фильтрации изображений свёрткой.
 *
 * Полностью автономный классический воркер (без type: 'module'):
 * логика свёртки и обработки каналов скопирована из core/convolution.js
 * и core/filter.js. Это сделано намеренно, чтобы воркер не зависел
 * от загрузки ES-модулей — модульные воркеры не всегда корректно
 * работают с локальным dev-сервером (Live Server, MIME-типы).
 *
 * При изменениях в core/convolution.js или core/filter.js — не забудьте
 * синхронизировать изменения здесь.
 *
 * Протокол сообщений:
 *   IN:  { id, buffer, width, height, kernel, channels, edge, format }
 *   OUT: { id, buffer }   — RGBA-данные результата, transferable
 *        { id, error }    — при ошибке
 */

self.onmessage = (e) => {
  const { id, buffer, width, height, kernel, channels, edge, format } = e.data;

  try {
    const src = new ImageData(
      new Uint8ClampedArray(buffer),
      width,
      height
    );

    const out = filterImageDataLocal(src, kernel, {
      channels: new Set(channels),
      edge,
      format,
    });

    const outBuffer = out.data.buffer;
    self.postMessage({ id, buffer: outBuffer }, [outBuffer]);
  } catch (err) {
    self.postMessage({ id, error: (err && err.message) || String(err) });
  }
};

// ——— Локальные копии core/convolution.js и core/filter.js ———

function convolveChannel(src, w, h, kernel, opts = {}) {
  const edge = opts.edge ?? 'copy';
  const dst = new Uint8ClampedArray(w * h);

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

      let v00, v01, v02, v10, v11, v12, v20, v21, v22;

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

      dst[rowMid + x] = sum;
    }
  }

  return dst;
}

function filterImageDataLocal(src, kernel, opts) {
  const { channels, edge = 'copy', format = 'raster' } = opts;
  const { width: w, height: h, data: srcData } = src;
  const n = w * h;

  const out = new ImageData(w, h);
  const dst = out.data;
  dst.set(srcData);

  if (!channels || channels.size === 0) return out;

  const doR = format === 'gb7' ? channels.has('gray') : channels.has('r');
  const doG = format === 'gb7' ? false : channels.has('g');
  const doB = format === 'gb7' ? false : channels.has('b');
  const doA = channels.has('a');

  const extract = (offset) => {
    const buf = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) buf[i] = srcData[i * 4 + offset];
    return buf;
  };

  const writeBack = (buf, ...offsets) => {
    for (let i = 0; i < n; i++) {
      const v = buf[i];
      const o = i * 4;
      for (let j = 0; j < offsets.length; j++) dst[o + offsets[j]] = v;
    }
  };

  if (doR) {
    const filtered = convolveChannel(extract(0), w, h, kernel, { edge });
    if (format === 'gb7') writeBack(filtered, 0, 1, 2);
    else writeBack(filtered, 0);
  }
  if (doG) {
    const filtered = convolveChannel(extract(1), w, h, kernel, { edge });
    writeBack(filtered, 1);
  }
  if (doB) {
    const filtered = convolveChannel(extract(2), w, h, kernel, { edge });
    writeBack(filtered, 2);
  }
  if (doA) {
    const filtered = convolveChannel(extract(3), w, h, kernel, { edge });
    writeBack(filtered, 3);
  }

  return out;
}