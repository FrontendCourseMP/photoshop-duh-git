/**
 * Загрузка изображения из File (png/jpg) и получение ImageData.
 * Возвращает { width, height, imageData, depth }.
 */
export async function loadRasterImage(file) {
  const bitmap = await createImageBitmap(file);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();

  return {
    width: bitmap.width,
    height: bitmap.height,
    imageData,
    depth: 8, // для png/jpg считаем 8 бит на канал
  };
}

/**
 * Определение формата по расширению/сигнатуре.
 * Пока различает только gb7 и «всё остальное».
 */
export async function detectFormat(file) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isGB7 =
    head[0] === 0x47 && head[1] === 0x42 && head[2] === 0x37 && head[3] === 0x1d;
  return isGB7 ? 'gb7' : 'raster';
}

/** Бросает ошибку, если файл не поддерживается. */
export function assertSupported(file) {
  const ok = /image\/(png|jpeg)/.test(file.type) || file.name.toLowerCase().endsWith('.gb7');
  if (!ok) throw new Error(`Неподдерживаемый формат: ${file.type || file.name}`);
}