import { repaint } from './canvasView.js';

let checkbox = null;
let hint = null;
let onChange = null;

/** Инициализация. onChange(showMask) вызывается после перерисовки. */
export function initMaskUI({ checkboxEl, hintEl, onToggle }) {
  checkbox = checkboxEl;
  hint = hintEl;
  onChange = onToggle;

  checkbox.addEventListener('change', () => {
    repaint({ showMask: checkbox.checked });
    onChange?.(checkbox.checked);
  });
}

/**
 * Синхронизирует UI с текущим состоянием документа.
 * @param {{ hasMask: boolean, hasImage: boolean }} state
 */
export function syncMaskUI({ hasMask: imageHasMask, hasImage }) {
  if (!checkbox) return;

  if (!hasImage) {
    checkbox.checked = true;
    checkbox.disabled = true;
    hint.textContent = 'Маска отсутствует';
    return;
  }

  if (!imageHasMask) {
    checkbox.checked = true;
    checkbox.disabled = true;
    hint.textContent = 'Маска отсутствует';
    return;
  }

  checkbox.disabled = false;
  hint.textContent = checkbox.checked ? 'Пиксели маски прозрачны' : 'Маска отключена';
}

export function isMaskVisible() {
  return checkbox ? checkbox.checked : true;
}