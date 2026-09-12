/**
 * Диалог фильтрации изображения ядром 3×3.
 *
 * Использует:
 *   - core/kernels — реестр пресетов;
 *   - core/filter — resolveUiChannels + фильтрация;
 *   - core/filterAsync — асинхронный расчёт через Web Worker;
 *   - ui/modalWindow — модальное окно;
 *   - ui/canvasView — preview/commit/discard.
 *
 * Схема как в диалоге уровней:
 *   - при открытии снимок оригинала (baseImageData);
 *   - при изменениях, если preview включён — дебаунс → пересчёт preview;
 *   - Apply → commitPreview + markDirty + событие filter:applied;
 *   - Cancel / закрытие → discardPreview.
 */

import { createModal } from './modalWindow.js';
import {
  listKernelPresets,
  getKernelPreset,
  DEFAULT_KERNEL_ID,
} from '../core/kernels.js';
import { resolveUiChannels } from '../core/filter.js';
import { filterImageDataAsync } from '../core/filterAsync.js';
import { EDGE_HANDLING, DEFAULT_EDGE_HANDLING } from '../core/convolution.js';
import {
  setPreview,
  discardPreview,
  commitPreview,
  getRawImageData,
  hasContent,
} from './canvasView.js';
import { markDirty } from '../core/documentState.js';

const MODAL_ID = 'filter-dialog';
const DEBOUNCE_MS = 120;

let win = null;
let els = null;

/** Текущий документ / оригинал. */
let currentImageData = null;
let currentFormat = 'raster';

/** Снимок оригинала на момент открытия. */
let baseImageData = null;

/** Колбэк наружу (для main.js — обновить панели). */
let onApplied = null;

/** Состояние UI. */
const state = {
  kernel: new Array(9).fill(0),
  presetId: DEFAULT_KERNEL_ID,
  edge: DEFAULT_EDGE_HANDLING,
  channels: {
    master: true,
    r: false, g: false, b: false, a: false,
    gray: false,
  },
  preview: true,
};

/** Управление debounce и актуальностью async-результатов. */
let debounceTimer = null;
let previewSeq = 0;
let previewBusy = false;
let previewActive = false;

/** Ссылки на кнопки (создаются в buildBody). */
let applyBtnEl = null;
let resetBtnEl = null;

/**
 * Открывает диалог для текущего изображения.
 * @param {{
 *   imageData: ImageData,
 *   format: 'raster'|'gb7',
 *   hasMask?: boolean,
 *   onApplied?: () => void,
 * }} opts
 */
export function openFilterDialog({ imageData, format, hasMask = false, onApplied: cb }) {
  const w = getFilterDialog();

  currentImageData = imageData;
  currentFormat = format;
  hasMask; // не используется, но документируем параметр
  onApplied = cb ?? null;

  // Снимок оригинала.
  baseImageData = cloneImageData(imageData);

  // Сбрасываем состояние к дефолту.
  resetState();

  // Обновляем UI под текущий формат (показываем/прячем каналы).
  applyFormatToUI();

  // Стартовое состояние полей.
  applyPresetToKernelInputs(state.presetId);
  syncChannelCheckboxes();
  syncEdgeButtons();
  setPreviewCheckbox(true);
  clearError();

  // Стартовый превью от базового изображения (identity — покажет оригинал).
  previewActive = false;
  discardPreview();

  w.open();
}

/** Создаёт диалог (один раз). */
export function getFilterDialog() {
  if (win) return win;

  const body = buildBody();
  win = createModal({
    id: MODAL_ID,
    title: 'Фильтр',
    body,
    closable: true,
    closeOnBackdrop: false,
    closeOnEscape: true,
    onClose: onCloseInternal,
  });

  return win;
}

// ——— Внутреннее ———

function buildBody() {
  const body = document.createElement('div');
  body.className = 'filter-form';

  // ——— Пресет ———
  const presetRow = document.createElement('div');
  presetRow.className = 'filter-row';
  presetRow.innerHTML = `
    <span class="filter-row__label">Пресет</span>
    <select class="filter-preset-select" id="filterPreset"></select>
    <div class="filter-tooltip" id="filterTooltip"></div>
  `;
  body.appendChild(presetRow);

  // ——— Ядро 3×3 ———
  const kernelRow = document.createElement('div');
  kernelRow.className = 'filter-row';
  kernelRow.innerHTML = `
    <span class="filter-row__label">Ядро свёртки 3×3</span>
  `;
  const kernelGrid = document.createElement('div');
  kernelGrid.className = 'filter-kernel';
  for (let i = 0; i < 9; i++) {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '0.01';
    inp.inputMode = 'decimal';
    inp.dataset.index = String(i);
    kernelGrid.appendChild(inp);
  }
  kernelRow.appendChild(kernelGrid);
  body.appendChild(kernelRow);

  // ——— Каналы ———
  const channelsRow = document.createElement('div');
  channelsRow.className = 'filter-row';
  channelsRow.innerHTML = `
    <span class="filter-row__label">Каналы</span>
  `;
  const channelsBox = document.createElement('div');
  channelsBox.className = 'filter-channels';
  channelsBox.id = 'filterChannels';
  channelsRow.appendChild(channelsBox);
  body.appendChild(channelsRow);

  // ——— Edge handling ———
  const edgeRow = document.createElement('div');
  edgeRow.className = 'filter-row';
  edgeRow.innerHTML = `
    <span class="filter-row__label">Обработка края</span>
    <div class="filter-edge" id="filterEdge"></div>
  `;
  body.appendChild(edgeRow);

  // ——— Ошибка ———
  const errRow = document.createElement('div');
  errRow.className = 'filter-error';
  errRow.id = 'filterError';
  body.appendChild(errRow);

  // ——— Футер: preview + кнопки ———
  const footer = document.createElement('div');
  footer.className = 'filter-actions';

  const previewLabel = document.createElement('label');
  previewLabel.className = 'filter-channel';
  previewLabel.innerHTML = `
    <input type="checkbox" id="filterPreview" checked>
    <span class="filter-channel__box"></span>
    <span>Предпросмотр</span>
  `;
  footer.appendChild(previewLabel);

  const right = document.createElement('div');
  right.className = 'filter-actions__right';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'filter-btn';
  resetBtn.textContent = 'Сбросить';
  resetBtn.id = 'filterResetBtn';
  resetBtn.addEventListener('click', onResetClick);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'filter-btn';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', () => win.close());

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'filter-btn filter-btn--primary';
  applyBtn.textContent = 'Применить';
  applyBtn.id = 'filterApplyBtn';
  applyBtn.addEventListener('click', onApplyClick);

  right.append(resetBtn, cancelBtn, applyBtn);
  footer.appendChild(right);
  body.appendChild(footer);

  // ——— Кэш элементов ———
  els = {
    presetSelect: body.querySelector('#filterPreset'),
    tooltip: body.querySelector('#filterTooltip'),
    kernelInputs: [...body.querySelectorAll('.filter-kernel input')],
    channelsBox: body.querySelector('#filterChannels'),
    edgeBox: body.querySelector('#filterEdge'),
    error: body.querySelector('#filterError'),
    previewCheckbox: body.querySelector('#filterPreview'),
  };
  applyBtnEl = applyBtn;
  resetBtnEl = resetBtn;

  // ——— Наполняем UI ———
  fillPresetOptions();
  fillChannels();

  // ——— Обработчики ———
  els.presetSelect.addEventListener('change', onPresetChange);
  els.kernelInputs.forEach((inp, i) => {
    inp.addEventListener('input', () => onKernelInput(i, inp));
  });
  els.previewCheckbox.addEventListener('change', onPreviewChange);

  return body;
}

// ——— Пресеты ———

function fillPresetOptions() {
  const sel = els.presetSelect;
  sel.innerHTML = '';
  for (const p of listKernelPresets()) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
}

function applyPresetToKernelInputs(presetId) {
  const preset = getKernelPreset(presetId);
  if (!preset) return;
  state.presetId = presetId;
  state.kernel = [...preset.kernel];
  els.presetSelect.value = presetId;
  for (let i = 0; i < 9; i++) {
    els.kernelInputs[i].value = formatKernelValue(state.kernel[i]);
  }
  els.tooltip.textContent = preset.description ?? '';
  validate();
}

function onPresetChange() {
  applyPresetToKernelInputs(els.presetSelect.value);
  schedulePreview();
}

function onKernelInput(i, inp) {
  const v = parseFloat(inp.value.replace(',', '.'));
  if (!Number.isFinite(v)) {
    state.kernel[i] = 0;
  } else {
    state.kernel[i] = v;
  }
  // Пресет «отвязывается»: пользователь изменил ядро вручную.
  state.presetId = null;
  els.presetSelect.value = '';
  validate();
  schedulePreview();
}

function formatKernelValue(v) {
  // Округляем до 3 знаков и убираем лишние нули.
  const r = Math.round(v * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

// ——— Каналы ———

function fillChannels() {
  const box = els.channelsBox;
  box.innerHTML = '';

  const defs = getChannelDefs();
  for (const def of defs) {
    const label = document.createElement('label');
    label.className = 'filter-channel';
    label.innerHTML = `
      <input type="checkbox" data-channel="${def.id}">
      <span class="filter-channel__box"></span>
      <span>${def.label}</span>
    `;
    const cb = label.querySelector('input');
    cb.checked = !!state.channels[def.id];
    cb.addEventListener('change', () => {
      state.channels[def.id] = cb.checked;
      // Если пользователь снял Master, но хочет выбрать каналы —
      // не блокируем, просто Master больше не «главный».
      validate();
      schedulePreview();
    });
    box.appendChild(label);
  }
}

function getChannelDefs() {
  if (currentFormat === 'gb7') {
    return [
      { id: 'master', label: 'Master' },
      { id: 'gray', label: 'Gray' },
      { id: 'a', label: 'Alpha' },
    ];
  }
  return [
    { id: 'master', label: 'Master' },
    { id: 'r', label: 'Red' },
    { id: 'g', label: 'Green' },
    { id: 'b', label: 'Blue' },
    { id: 'a', label: 'Alpha' },
  ];
}

function syncChannelCheckboxes() {
  const cbs = els.channelsBox.querySelectorAll('input[data-channel]');
  cbs.forEach((cb) => {
    cb.checked = !!state.channels[cb.dataset.channel];
  });
}

function applyFormatToUI() {
  // Перестроить каналы под формат.
  fillChannels();
}

// ——— Edge handling ———

function syncEdgeButtons() {
  const box = els.edgeBox;
  box.innerHTML = '';

  for (const key of Object.keys(EDGE_HANDLING)) {
    const def = EDGE_HANDLING[key];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.edge = def.id;
    btn.textContent = def.label;
    if (def.id === state.edge) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.edge = def.id;
      box.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', b.dataset.edge === def.id);
      });
      schedulePreview();
    });
    box.appendChild(btn);
  }
}

// ——— Preview ———

function setPreviewCheckbox(checked) {
  state.preview = checked;
  els.previewCheckbox.checked = checked;
}

function onPreviewChange() {
  state.preview = els.previewCheckbox.checked;
  if (state.preview) {
    schedulePreview();
  } else {
    // Откатываем к оригиналу.
    discardPreview();
    previewActive = false;
  }
}

function schedulePreview() {
  if (!state.preview) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runPreview, DEBOUNCE_MS);
}

async function runPreview() {
  if (!baseImageData) return;

  // Нечего применять — только identity.
  if (!validate()) return;

  const channels = resolveUiChannels(state.channels, currentFormat);
  if (channels.size === 0) {
    // Нет выбранных каналов — отображаем оригинал.
    discardPreview();
    previewActive = false;
    return;
  }

  // Если ядро identity — тоже показываем оригинал (экономим расчёт).
  if (isIdentityKernel(state.kernel)) {
    discardPreview();
    previewActive = false;
    return;
  }

  const seq = ++previewSeq;
  setBusy(true);

  try {
    const result = await filterImageDataAsync(baseImageData, state.kernel, {
      channels,
      edge: state.edge,
      format: currentFormat,
    });

    // Игнорируем устаревшие ответы.
    if (seq !== previewSeq) return;

    setPreview(result);
    previewActive = true;
  } catch (err) {
    console.error('filter preview error:', err);
    setError(`Ошибка фильтра: ${err.message}`);
  } finally {
    if (seq === previewSeq) setBusy(false);
  }
}

function setBusy(busy) {
  previewBusy = busy;
  if (applyBtnEl) applyBtnEl.disabled = busy || !!els.error.textContent;
}

// ——— Валидация ———

function validate() {
  // Ядро: все 9 значений — числа (мы уже гарантировали числа при вводе,
  // но пустые поля тоже нужно отловить).
  for (let i = 0; i < 9; i++) {
    if (!Number.isFinite(state.kernel[i])) {
      setError('Все 9 коэффициентов ядра должны быть числами');
      return false;
    }
  }

  // Каналы: должен быть выбран хотя бы один.
  const channels = resolveUiChannels(state.channels, currentFormat);
  if (channels.size === 0) {
    setError('Выберите хотя бы один канал');
    return false;
  }

  clearError();
  return true;
}

function setError(msg) {
  els.error.textContent = msg;
  if (applyBtnEl) applyBtnEl.disabled = true;
}

function clearError() {
  els.error.textContent = '';
  if (applyBtnEl) applyBtnEl.disabled = previewBusy;
}

// ——— Кнопки ———

function onResetClick() {
  resetState();
  applyPresetToKernelInputs(state.presetId);
  syncChannelCheckboxes();
  syncEdgeButtons();
  setPreviewCheckbox(true);
  clearError();
  schedulePreview();
}

function onApplyClick() {
  if (!validate()) return;
  if (!previewActive || !baseImageData) {
    // Нет реального превью — либо identity, либо пользователь ничего
    // не менял. Просто закрываем окно без изменений.
    win.close();
    return;
  }

  const channels = resolveUiChannels(state.channels, currentFormat);

  // На случай, если что-то поменялось — синхронно пересчитываем
  // окончательный результат и коммитим.
  (async () => {
    setBusy(true);
    try {
      const result = await filterImageDataAsync(baseImageData, state.kernel, {
        channels,
        edge: state.edge,
        format: currentFormat,
      });

      // Коммитим новый оригинал.
      discardPreview();
      previewActive = false;
      setPreview(result);
      commitPreview();
      markDirty();

      // Закрываем окно и сообщаем наружу.
      win.close();
      onApplied?.();
    } catch (err) {
      console.error(err);
      setError(`Ошибка применения: ${err.message}`);
    } finally {
      setBusy(false);
    }
  })();
}

function onCloseInternal() {
  // Отменяем предпросмотр, если был.
  if (previewActive) {
    discardPreview();
    previewActive = false;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// ——— Вспомогательное ———

function resetState() {
  state.kernel = [...getKernelPreset(DEFAULT_KERNEL_ID).kernel];
  state.presetId = DEFAULT_KERNEL_ID;
  state.edge = DEFAULT_EDGE_HANDLING;
  state.channels = {
    master: true,
    r: false, g: false, b: false, a: false,
    gray: false,
  };
  state.preview = true;
}

function cloneImageData(src) {
  const out = new ImageData(src.width, src.height);
  out.data.set(src.data);
  return out;
}

function isIdentityKernel(kernel) {
  // Проверка: ядро [0,0,0, 0,1,0, 0,0,0].
  for (let i = 0; i < 9; i++) {
    const expected = i === 4 ? 1 : 0;
    if (Math.abs(kernel[i] - expected) > 1e-9) return false;
  }
  return true;
}