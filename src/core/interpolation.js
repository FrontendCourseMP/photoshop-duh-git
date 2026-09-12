/**
 * Двумерная интерполяция для масштабирования RGBA-изображений.
 *
 * Реализации — собственные, без использования canvas.drawImage
 * и createImageBitmap с изменением размера. Работаем напрямую
 * с Uint8ClampedArray в порядке [R, G, B, A, R, G, B, A, ...].
 *
 * Архитектура:
 *   - реестр методов (Map);
 *   - каждый метод — объект { id, label, description, apply(...) };
 *   - apply(src, srcW, srcH, dst, dstW, dstH) пишет результат в dst.
 *
 * Чтобы добавить новый метод (например, бикубическую интерполяцию
 * или Lanczos), достаточно вызвать registerInterpolationMethod
 * с новой реализацией apply — UI и вызывающий код подхватят её
 * автоматически.
 *
 * Договорённость по координатам:
 *   - пиксель (0,0) — центр верхнего левого пикселя;
 *   - для маппинга dst→src используем «pixel center» формулу:
 *       srcX = (dstX + 0.5) * (srcW / dstW) - 0.5
 *     Она даёт корректное поведение и для nearest, и для bilinear,
 *     и симметрична относительно центра изображения.
 *
 * Alpha:
 *   - nearest: alpha берётся из выбранного пикселя;
 *   - bilinear: alpha интерполируется как обычный канал.
 *     Премультипликация не применяется — считаем, что
 *     цвет и прозрачность интерполируются независимо.
 */

/**
 * @typedef {Object} InterpolationMethod
 * @property {string} id
 * @property {string} label         — короткое название для UI
 * @property {string} description   — краткое описание для tooltip
 * @property {(
 *   src: Uint8ClampedArray, srcW: number, srcH: number,
 *   dst: Uint8ClampedArray, dstW: number, dstH: number,
 * ) => void} apply
 */

/** @type {Map<string, InterpolationMethod>} */
const methods = new Map();

/**
 * Регистрирует метод интерполяции. Если метод с таким id уже есть —
 * заменяет его (удобно для «горячей» подмены при разработке).
 * @param {InterpolationMethod} method
 */
export function registerInterpolationMethod(method) {
  if (!method || typeof method.apply !== 'function') {
    throw new Error('interpolation: метод должен иметь apply(...)');
  }
  if (!method.id) throw new Error('interpolation: у метода должен быть id');
  methods.set(method.id, method);
}

/** Возвращает метод по id или null. */
export function getInterpolationMethod(id) {
  return methods.get(id) ?? null;
}

/** Список всех зарегистрированных методов (в порядке регистрации). */
export function listInterpolationMethods() {
  return [...methods.values()];
}

/** id метода по умолчанию (билинейная). */
export const DEFAULT_INTERPOLATION_ID = 'bilinear';

// ——— Реализация: nearest neighbor ———

/**
 * Метод ближайшего соседа.
 *
 * Для каждого целевого пикселя (dx, dy) находим соответствующий
 * исходный (sx, sy) через «pixel center» формулу и округляем.
 *
 * Преимущества: очень быстрый, сохраняет резкие границы.
 * Недостатки: ступенчатые артефакты (алиасинг) при увеличении
 * и потеря деталей при уменьшении.
 */
function applyNearest(src, srcW, srcH, dst, dstW, dstH) {
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    // координата в src по «центру пикселя»
    const sy = Math.min(srcH - 1, Math.max(0, Math.floor((dy + 0.5) * scaleY)));
    const dstRowOffset = dy * dstW * 4;
    const srcRowOffset = sy * srcW * 4;

    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.min(srcW - 1, Math.max(0, Math.floor((dx + 0.5) * scaleX)));
      const sIdx = srcRowOffset + sx * 4;
      const dIdx = dstRowOffset + dx * 4;

      dst[dIdx] = src[sIdx];
      dst[dIdx + 1] = src[sIdx + 1];
      dst[dIdx + 2] = src[sIdx + 2];
      dst[dIdx + 3] = src[sIdx + 3];
    }
  }
}

// ——— Реализация: bilinear ———

/**
 * Билинейная интерполяция.
 *
 * Для каждого целевого пикселя находим вещественные координаты
 * (sx, sy) в источнике, берём 4 соседних пикселя и смешиваем
 * по их весам (произведение линейных весов по x и y).
 *
 * Преимущества: плавные переходы, естественный вид при увеличении.
 * Недостатки: размывает резкие границы и детали при сильном
 * уменьшении; чуть медленнее nearest.
 */
function applyBilinear(src, srcW, srcH, dst, dstW, dstH) {
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  const maxX = srcW - 1;
  const maxY = srcH - 1;

  for (let dy = 0; dy < dstH; dy++) {
    const fy = (dy + 0.5) * scaleY - 0.5;
    const y0 = Math.floor(fy);
    const y1 = y0 + 1;
    const wy = fy - y0;             // 0..1
    const wy0 = 1 - wy;

    const cy0 = Math.min(maxY, Math.max(0, y0));
    const cy1 = Math.min(maxY, Math.max(0, y1));

    const rowY0 = cy0 * srcW * 4;
    const rowY1 = cy1 * srcW * 4;

    const dstRowOffset = dy * dstW * 4;

    for (let dx = 0; dx < dstW; dx++) {
      const fx = (dx + 0.5) * scaleX - 0.5;
      const x0 = Math.floor(fx);
      const x1 = x0 + 1;
      const wx = fx - x0;
      const wx0 = 1 - wx;

      const cx0 = Math.min(maxX, Math.max(0, x0));
      const cx1 = Math.min(maxX, Math.max(0, x1));

      const i00 = rowY0 + cx0 * 4;
      const i01 = rowY0 + cx1 * 4;
      const i10 = rowY1 + cx0 * 4;
      const i11 = rowY1 + cx1 * 4;

      const w00 = wx0 * wy0;
      const w01 = wx * wy0;
      const w10 = wx0 * wy;
      const w11 = wx * wy;

      const dIdx = dstRowOffset + dx * 4;

      // R, G, B, A — единообразно, без премультипликации.
      dst[dIdx] = src[i00] * w00 + src[i01] * w01
        + src[i10] * w10 + src[i11] * w11;
      dst[dIdx + 1] = src[i00 + 1] * w00 + src[i01 + 1] * w01
        + src[i10 + 1] * w10 + src[i11 + 1] * w11;
      dst[dIdx + 2] = src[i00 + 2] * w00 + src[i01 + 2] * w01
        + src[i10 + 2] * w10 + src[i11 + 2] * w11;
      dst[dIdx + 3] = src[i00 + 3] * w00 + src[i01 + 3] * w01
        + src[i10 + 3] * w10 + src[i11 + 3] * w11;
    }
  }
}

// ——— Регистрация встроенных методов ———

registerInterpolationMethod({
  id: 'nearest',
  label: 'Ближайший сосед',
  description:
    'Ближайший сосед (nearest neighbor). ' +
    'Берёт значение одного ближайшего пикселя источника. ' +
    'Самый быстрый метод, сохраняет резкие границы, ' +
    'но даёт ступенчатые артефакты при увеличении ' +
    'и теряет детали при уменьшении.',
  apply: applyNearest,
});

registerInterpolationMethod({
  id: 'bilinear',
  label: 'Билинейная',
  description:
    'Билинейная интерполяция. ' +
    'Смешивает четыре соседних пикселя источника по линейным весам. ' +
    'Даёт плавные переходы и естественный вид при увеличении, ' +
    'но размывает резкие границы и мелкие детали.',
  apply: applyBilinear,
});