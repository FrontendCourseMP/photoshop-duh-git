/**
 * GrayBit-7 — формат изображений в оттенках серого, 7 бит/пиксель.
 *
 * Структура файла:
 *   [0..3]   signature: 47 42 37 1D ('GB7' + GS)
 *   [4]      version:   0x01
 *   [5]      flag:      бит 0 = mask flag
 *   [6..7]   width:     uint16 BE
 *   [8..9]   height:    uint16 BE
 *   [10..11] reserved:  0x0000
 *   [12..]   pixel data: W*H байт
 *
 * В каждом байте пикселя:
 *   бит 7 (MSB) — маска (если flag & 1)
 *   биты 6..0   — значение серого (0..127)
 *   если маски нет, бит 7 должен быть 0.
 */

const SIGNATURE = [0x47, 0x42, 0x37, 0x1d]; // 'G' 'B' '7' 0x1D
const SUPPORTED_VERSION = 0x01;

export class GB7Error extends Error {
  constructor(message) {
    super(message);
    this.name = 'GB7Error';
  }
}

/**
 * Проверяет, похож ли буфер на GB7 по сигнатуре.
 * Не кидает исключений — безопасно для «это gb7 или нет?».
 */
export function isGB7(buffer) {
  if (buffer.byteLength < SIGNATURE.length) return false;
  const b = new Uint8Array(buffer, 0, SIGNATURE.length);
  return SIGNATURE.every((v, i) => b[i] === v);
}

/**
 * Декодирует GB7.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{
 *   version: number, flag: number, hasMask: boolean,
 *   width: number, height: number, reserved: number,
 *   pixels: Uint8Array,   // 7-битные значения 0..127
 *   mask: Uint8Array|null // 0/1, если hasMask
 * }}
 */
export function decodeGB7(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (bytes.byteLength < 12) {
    throw new GB7Error('файл слишком короткий (нужно минимум 12 байт заголовка)');
  }

  // Сигнатура
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) {
      throw new GB7Error('неверная сигнатура (ожидается "GB7\\x1D")');
    }
  }

  const version = bytes[4];
  if (version !== SUPPORTED_VERSION) {
    throw new GB7Error(`неподдерживаемая версия: 0x${version.toString(16).padStart(2, '0')}`);
  }

  const flag = bytes[5];
  const hasMask = (flag & 0x01) === 0x01;

  // Ширина/высота — big-endian uint16
  const width = (bytes[6] << 8) | bytes[7];
  const height = (bytes[8] << 8) | bytes[9];
  const reserved = (bytes[10] << 8) | bytes[11];

  if (width === 0 || height === 0) {
    throw new GB7Error(`некорректные размеры: ${width}×${height}`);
  }
  if (reserved !== 0) {
    throw new GB7Error(`зарезервированные байты должны быть 0x0000, получено 0x${reserved.toString(16).padStart(4, '0')}`);
  }

  const pixelCount = width * height;
  const dataStart = 12;
  const dataEnd = dataStart + pixelCount;

  if (bytes.byteLength < dataEnd) {
    throw new GB7Error(
      `недостаточно данных: нужно ${pixelCount} байт (${width}×${height}), получено ${bytes.byteLength - dataStart}`
    );
  }

  const pixels = new Uint8Array(pixelCount);
  const mask = hasMask ? new Uint8Array(pixelCount) : null;

  for (let i = 0; i < pixelCount; i++) {
    const byte = bytes[dataStart + i];
    pixels[i] = byte & 0x7f;             // младшие 7 бит
    if (hasMask) {
      mask[i] = (byte & 0x80) ? 1 : 0;   // старший бит
    } else if (byte & 0x80) {
      // По спецификации, если маски нет, старший бит должен быть 0.
      // throw new GB7Error(`бит маски установлен в пикселе ${i}, но маска отключена`);
    }
  }

  return { version, flag, hasMask, width, height, reserved, pixels, mask };
}

/**
 * Преобразует результат decodeGB7 в ImageData для canvas.
 *
 * Правила:
 *   - 7-битное значение 0..127 растягивается в 8-битное 0..255
 *     через `(v << 1) | (v >> 6)`. 0→0, 127→255, 64→129. 
 *     Простое `v << 1` даёт максимум 254 и теряет белый.
 *   - Если маска присутствует и включена, пиксели с mask=0 становятся
 *     полностью прозрачными (alpha=0). Цвет при этом оставляем серым —
 *     это не важно при alpha=0, но упрощает будущее переключение маски.
 *
 * @param {ReturnType<typeof decodeGB7>} decoded
 * @param {{ applyMask?: boolean }} [opts]
 * @returns {ImageData}
 */
export function gb7ToImageData(decoded, { applyMask = true } = {}) {
  const { width, height, pixels, mask } = decoded;
  const imageData = new ImageData(width, height);
  const out = imageData.data;

  const useMask = applyMask && !!mask;

  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];             // 0..127
    const g = (v << 1) | (v >> 6);   // 0..255 с корректным округлением

    const o = i * 4;
    out[o] = g;
    out[o + 1] = g;
    out[o + 2] = g;
    out[o + 3] = useMask && mask[i] === 0 ? 0 : 255;
  }

  return imageData;
}

/**
 * Кодирует GB7-файл в ArrayBuffer.
 *
 * @param {{
 *   width: number,        // 1..65535
 *   height: number,       // 1..65535
 *   pixels: Uint8Array,   // W*H, значения 0..127
 *   mask: Uint8Array|null // W*H, 0 или 1; null = маска отсутствует
 * }} params
 * @returns {ArrayBuffer}
 */
export function encodeGB7({ width, height, pixels, mask }) {
  if (!Number.isInteger(width) || width < 1 || width > 0xffff) {
    throw new GB7Error(`ширина должна быть 1..65535, получено ${width}`);
  }
  if (!Number.isInteger(height) || height < 1 || height > 0xffff) {
    throw new GB7Error(`высота должна быть 1..65535, получено ${height}`);
  }
  const pixelCount = width * height;
  if (pixels.length !== pixelCount) {
    throw new GB7Error(`pixels: ожидалось ${pixelCount}, получено ${pixels.length}`);
  }
  const hasMask = mask !== null && mask !== undefined;
  if (hasMask && mask.length !== pixelCount) {
    throw new GB7Error(`mask: ожидалось ${pixelCount}, получено ${mask.length}`);
  }

  const out = new Uint8Array(12 + pixelCount);
  // signature
  out[0] = 0x47; out[1] = 0x42; out[2] = 0x37; out[3] = 0x1d;
  // version
  out[4] = SUPPORTED_VERSION;
  // flag
  out[5] = hasMask ? 0x01 : 0x00;
  // width, height (BE)
  out[6] = (width >> 8) & 0xff;
  out[7] = width & 0xff;
  out[8] = (height >> 8) & 0xff;
  out[9] = height & 0xff;
  // reserved
  out[10] = 0; out[11] = 0;

  // pixel data
  for (let i = 0; i < pixelCount; i++) {
    const g = pixels[i] & 0x7f;                // на всякий случай обрезаем
    const m = hasMask && mask[i] !== 0 ? 0x80 : 0x00;
    out[12 + i] = m | g;
  }

  return out.buffer;
}

/**
 * Извлекает 7-битные значения и (опционально) маску из ImageData.
 * Используется, когда в documentState нет «сырых» GB7-данных —
 * например, при экспорте в GB7 картинки, загруженной из PNG/JPG,
 * или после редактирования.
 *
 * @param {ImageData} imageData
 * @param {{ buildMask?: boolean }} [opts]
 * @returns {{ pixels: Uint8Array, mask: Uint8Array|null }}
 */
export function imageDataToGB7(imageData, { buildMask = true } = {}) {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const pixels = new Uint8Array(pixelCount);

  let anyTransparent = false;
  let anyOpaque = false;
  let anyPartial = false;
  if (buildMask) {
    for (let i = 0; i < pixelCount; i++) {
      const a = data[i * 4 + 3];
      if (a === 0) anyTransparent = true;
      else if (a < 255) anyPartial = true;
      else anyOpaque = true;
      if (anyTransparent && anyPartial) break;
    }
  }
  // Маску создаём, только если в изображении реально есть прозрачность.
  // Полностью непрозрачное изображение → без маски (компактнее и по спецификации).
  const hasMask = buildMask && (anyTransparent || anyPartial);
  const mask = hasMask ? new Uint8Array(pixelCount) : null;

  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];

    // Rec. 709 luma
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
    // 8 → 7 бит. Просто >> 1 даёт максимум 127 для 255, что корректно.
    pixels[i] = Math.min(127, Math.round(y) >> 1);

    if (hasMask) {
      // Полупрозрачные считаем «непрозрачными» (mask=1) — иначе потеряем много деталей.
      // Настраиваемый порог — задача будущего UI.
      mask[i] = a < 128 ? 0 : 1;
    }
  }

  return { pixels, mask };
}