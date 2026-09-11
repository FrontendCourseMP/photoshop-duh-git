/**
 * Загрузка изображения из File (png/jpg) и получение ImageData.
 * Возвращает { width, height, imageData, depth }.
 */
export async function loadRasterImage(file) {
  const buffer = await file.arrayBuffer();
  const mime = sniffMime(buffer) || file.type || 'application/octet-stream';
  const blob = new Blob([buffer], { type: mime });
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });

  const width = bitmap.width;
  const height = bitmap.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const imageData = ctx.getImageData(0, 0, width, height);

  return { width, height, imageData, depth: 8 };
}

/** Определяет MIME по сигнатуре (первые 4 байта). Возвращает MIME или null. */
function sniffMime(buf) {
  if (buf.byteLength < 4) return null;
  const b = new Uint8Array(buf, 0, 4);
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  // GB7: 47 42 37 1D
  if (b[0] === 0x47 && b[1] === 0x42 && b[2] === 0x37 && b[3] === 0x1d) return 'application/x-gb7';
  return null;
}

/**
 * Определение формата по расширению/сигнатуре.
 */
export async function detectFormat(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mime = sniffMime(head.buffer);
  if (mime === 'application/x-gb7') return 'gb7';
  if (mime) return 'raster';
  return 'unknown';
}

/** Бросает ошибку, если файл не поддерживается. */
export function assertSupported(file) {
  const name = file.name.toLowerCase();
  const ok =
    /image\/(png|jpeg)/.test(file.type) ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.gb7');
  if (!ok) throw new Error(`Неподдерживаемый формат: ${file.type || file.name}`);
}

/**
 * Кодирует canvas в Blob выбранного формата.
 * @param {HTMLCanvasElement} canvas
 * @param {'png'|'jpeg'} format
 * @param {number} quality — только для jpeg, 0..1
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, format = 'png', quality = 0.92) {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось закодировать изображение'))),
      mime,
      quality
    );
  });
}

/** Триггерит скачивание Blob под именем filename. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Дадим браузеру время начать скачивание, потом освободим URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}