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
      // Мы не падаем — просто игнорируем. Раскомментируй, если хочешь строгость:
      // throw new GB7Error(`бит маски установлен в пикселе ${i}, но маска отключена`);
    }
  }

  return { version, flag, hasMask, width, height, reserved, pixels, mask };
}