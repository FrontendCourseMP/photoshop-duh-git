import { setEnabledChannels, getEnabledChannels, repaint } from './canvasView.js';

let checkbox = null;
let hint = null;
let onChange = null;

export function initMaskUI({ checkboxEl, hintEl, onToggle }) {
  checkbox = checkboxEl;
  hint = hintEl;
  onChange = onToggle ?? null;

  checkbox.addEventListener('change', () => {
    const set = getEnabledChannels();
    if (checkbox.checked) set.add('a');
    else set.delete('a');
    setEnabledChannels(set);
    syncMaskUIInternal();
    onChange?.(checkbox.checked);
  });
}

export function syncMaskUI({ hasMask: imageHasMask, hasImage }) {
  if (!checkbox) return;

  if (!hasImage || !imageHasMask) {
    checkbox.checked = true;
    checkbox.disabled = true;
    hint.textContent = 'Маска отсутствует';
    return;
  }

  checkbox.disabled = false;
  syncMaskUIInternal();
}

/**
 * Программно установить состояние чекбокса «Показывать маску».
 * Не эмитит событие change (используется для синхронизации извне).
 * @param {boolean} checked
 */
export function setMaskChecked(checked) {
  if (!checkbox || checkbox.disabled) return;
  checkbox.checked = checked;
  syncMaskUIInternal();
}

function syncMaskUIInternal() {
  hint.textContent = checkbox.checked ? 'Пиксели маски прозрачны' : 'Маска отключена';
}

export function isMaskVisible() {
  return checkbox ? checkbox.checked : true;
}