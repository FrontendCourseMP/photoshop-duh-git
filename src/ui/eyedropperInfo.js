/**
 * Отображение результатов пипетки в правой панели.
 *
 * Не считает ничего сам — только форматирует и показывает данные,
 * полученные из eyedropper.js (через main.js).
 */

const els = {
  state: null,
  coords: null,
  swatch: null,
  rgb: null,
  alpha: null,
  lab: null,
};

export function initEyedropperInfo() {
  els.state = document.getElementById('eyedropperState');
  els.coords = document.getElementById('edCoords');
  els.swatch = document.getElementById('edSwatch');
  els.rgb = document.getElementById('edRGB');
  els.alpha = document.getElementById('edAlpha');
  els.lab = document.getElementById('edLab');

  resetEyedropperInfo();
}

/** Сброс в исходное «пустое» состояние. */
export function resetEyedropperInfo() {
  if (!els.state) return;
  els.state.textContent = 'ожидание';
  els.coords.textContent = '—, —';
  els.rgb.textContent = '—, —, —';
  els.alpha.textContent = '—';
  els.lab.textContent = '—';
  setSwatch(null);
}

/**
 * Обновление по результату клика.
 * @param {{
 *   x: number, y: number,
 *   r: number, g: number, b: number, a: number,
 *   lab?: { L: number, a: number, b: number } | null  // опционально
 * }} pick
 */
export function showEyedropperInfo(pick) {
  if (!els.state) return;
  const { x, y, r, g, b, a, lab } = pick;

  els.state.textContent = 'выбрано';
  els.coords.textContent = `${x}, ${y}`;
  els.rgb.textContent = `${r}, ${g}, ${b}`;
  els.alpha.textContent = String(a);
  els.lab.textContent = lab
    ? `L* ${lab.L.toFixed(1)} · a* ${lab.a.toFixed(1)} · b* ${lab.b.toFixed(1)}`
    : '—';

  setSwatch({ r, g, b, a });
}

/**
 * @param {{r:number,g:number,b:number,a:number}|null} rgba
 */
function setSwatch(rgba) {
  if (!els.swatch) return;

  // Внутренний элемент создаём один раз.
  let inner = els.swatch.querySelector('.eyedropper-swatch-inner');
  if (!inner) {
    inner = document.createElement('span');
    inner.className = 'eyedropper-swatch-inner';
    els.swatch.innerHTML = '';
    els.swatch.appendChild(inner);
  }

  if (!rgba) {
    inner.style.background = '';
    return;
  }

  // RGB-цвет + alpha в отдельности:
  // фон свотча — шахматка (см. CSS), а внутренний слой — сам цвет с alpha.
  inner.style.background = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a / 255})`;
}