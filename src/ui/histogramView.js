/**
 * Отрисовка гистограммы на canvas.
 *
 * Не занимается вычислением — получает нормализованные значения
 * (Float32Array(256), 0..1) и цвет канала, рисует столбцы.
 *
 * Особенности:
 *   - canvas масштабируется через CSS (width: 100%), а внутренний
 *     размер буфера — фиксированный (по умолчанию 360×140).
 *     При необходимости можно поднять до devicePixelRatio.
 *   - По умолчанию фон — почти чёрный, столбцы — в цвете канала.
 *   - Опционально рисуется сетка 25/50/75% (для ориентира по вертикали).
 */

const DEFAULT_W = 360;
const DEFAULT_H = 140;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Float32Array} values — 256 значений в диапазоне 0..1
 * @param {{
 *   color?: string,        // цвет столбцов (CSS-color)
 *   grid?: boolean,        // рисовать ли сетку
 *   bg?: string,           // цвет фона
 * }} [opts]
 */
export function drawHistogram(canvas, values, opts = {}) {
  const {
    color = '#dddddd',
    grid = true,
    bg = '#1a1a1a',
  } = opts;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Фон.
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Внутренние отступы, чтобы столбцы не прилипали к рамке.
  const padTop = 6;
  const padBottom = 6;
  const innerH = h - padTop - padBottom;

  // Сетка по горизонтали (вертикальные линии 25/50/75% ширины).
  if (grid) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const x = Math.round((w * i) / 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, h - padBottom);
      ctx.stroke();
    }
  }

  // Столбцы. 256 столбцов в ширину w. Один столбец = w/256 px.
  // Округляем через дробный шаг, чтобы все значения влезли.
  const barW = w / 256;
  ctx.fillStyle = color;

  for (let i = 0; i < 256; i++) {
    const v = values[i];
    if (v <= 0) continue;
    const barH = Math.max(1, Math.round(v * innerH));
    const x = i * barW;
    // Округляем левый край и правый край столбца так, чтобы соседние
    // столбцы не имели видимых щелей — рисуем прямоугольник
    // от round(x) до round(x + barW), минимум 1px.
    const x0 = Math.round(x);
    const x1 = Math.max(x0 + 1, Math.round(x + barW));
    ctx.fillRect(x0, h - padBottom - barH, x1 - x0, barH);
  }

  // Аккуратно перерисуем верхнюю кромку — не обязательно, но иногда
  // помогает визуально при 1px-столбцах. Пропускаем для простоты.
}

/** Возвращает дефолтные размеры буфера. */
export function getDefaultHistogramSize() {
  return { width: DEFAULT_W, height: DEFAULT_H };
}