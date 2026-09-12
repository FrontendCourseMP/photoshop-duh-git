/**
 * Панель масштаба в футере: range 12–300% + dropdown с быстрыми значениями.
 *
 * Не реализует логику зума сам — только синхронизирует UI-элементы
 * с модулем zoomUI и вызывает его функции setManual/fitToScreen.
 *
 * Связь двусторонняя:
 *   - изменение range/select → zoomUI.setManual / fitToScreen;
 *   - zoomUI меняет масштаб (хоткей, Ctrl+колесо) → onScaleChange
 *     обновляет range и label.
 */

import { ZOOM_LIMITS, onScaleChange, setManual, fitToScreen } from './zoomUI.js';

let rangeEl = null;
let valueEl = null;
let presetsEl = null;

/** Внутренний флаг — не эмитить событие при программной синхронизации. */
let suppressRangeEvent = false;

export function initZoomPanel({ rangeEl: range, valueEl: value, presetsEl: presets }) {
  rangeEl = range;
  valueEl = value;
  presetsEl = presets;

  // Убедимся, что min/max у range соответствуют константам.
  rangeEl.min = String(Math.round(ZOOM_LIMITS.MIN_SCALE * 100));
  rangeEl.max = String(Math.round(ZOOM_LIMITS.MAX_SCALE * 100));

  rangeEl.addEventListener('input', () => {
    if (suppressRangeEvent) return;
    const pct = Number(rangeEl.value);
    if (!Number.isFinite(pct)) return;
    setManual(pct / 100);
  });

  presetsEl.addEventListener('change', () => {
    const v = presetsEl.value;
    if (v === 'fit') {
      fitToScreen();
    } else {
      const pct = Number(v);
      if (Number.isFinite(pct)) setManual(pct / 100);
    }
    // Сбрасываем визуальный выбор на пункт-заглушку после действия,
    // чтобы пользователь мог снова выбрать то же значение.
    presetsEl.value = '';
  });

  // Первичная синхронизация — значение 100% при отсутствии изображения.
  updateUi(1);

  // Подписка на изменения масштаба из zoomUI.
  onScaleChange((scale) => updateUi(scale));
}

/** Обновляет UI (range + label) под текущий масштаб, без эмита. */
function updateUi(scale) {
  const pct = Math.round(scale * 100);
  suppressRangeEvent = true;
  rangeEl.value = String(pct);
  suppressRangeEvent = false;

  valueEl.textContent = `${pct}%`;

  // Синхронизируем dropdown — если значение совпадает с одним
  // из пресетов, выделяем его.
  const presetValue = String(pct);
  if ([...presetsEl.options].some((o) => o.value === presetValue)) {
    presetsEl.value = presetValue;
  } else {
    presetsEl.value = '';
  }
}