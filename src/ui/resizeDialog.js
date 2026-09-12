/**
 * Диалог масштабирования изображения (Resize).
 *
 * Использует core/interpolation (реестр методов) и ui/modalWindow.
 *
 * Возвращает результат через колбэк onSubmit:
 *   { width: number, height: number, methodId: string }
 *
 * Внутри валидирует ввод и не даёт подтвердить некорректные значения.
 */

import { createModal } from './modalWindow.js';
import { listInterpolationMethods, DEFAULT_INTERPOLATION_ID } from '../core/interpolation.js';
import { LIMITS } from '../core/limits.js';

const MODAL_ID = 'resize-dialog';

/** Ссылки на элементы, созданные в buildBody. */
let els = null;
let win = null;

/** Состояние диалога. */
let originalW = 0;
let originalH = 0;
let sourcePixels = 0;      // общее число пикселей в оригинале
let unit = 'percent';      // 'percent' | 'pixels'
let lockAspect = true;
let methodId = DEFAULT_INTERPOLATION_ID;

/** Колбэк, который main.js передаёт при открытии. */
let onSubmit = null;

/**
 * Создаёт диалог (один раз) и возвращает его API.
 * @returns {ReturnType<typeof createModal>}
 */
export function getResizeDialog() {
  if (win) return win;

  const body = buildBody();

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'resize-btn';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', () => win.close());

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'resize-btn resize-btn--primary';
  applyBtn.textContent = 'Применить';
  applyBtn.id = 'resizeApplyBtn';
  applyBtn.addEventListener('click', () => submit());

  // Кнопки кладём прямо в body — стили .resize-actions на .resize-form.
  const actions = document.createElement('div');
  actions.className = 'resize-actions';
  actions.append(cancelBtn, applyBtn);
  body.appendChild(actions);

  win = createModal({
    id: MODAL_ID,
    title: 'Изменить размер',
    body,
    closable: true,
    closeOnBackdrop: false,
    closeOnEscape: true,
  });

  return win;
}

/**
 * Открывает диалог для конкретного изображения.
 * @param {{
 *   width: number, height: number,
 *   onSubmit: (result: { width:number, height:number, methodId:string }) => void,
 * }} opts
 */
export function openResizeDialog({ width, height, onSubmit: cb }) {
  const w = getResizeDialog();

  originalW = width;
  originalH = height;
  sourcePixels = width * height;
  onSubmit = cb;

  // Стартовое состояние: 100% / исходные размеры.
  unit = 'percent';
  lockAspect = true;
  methodId = DEFAULT_INTERPOLATION_ID;

  els.unitPercent.classList.add('active');
  els.unitPixels.classList.remove('active');
  els.lockCheckbox.checked = true;
  els.methodSelect.value = methodId;

  syncInputsFromState();
  updatePixelsInfo();
  updateMethodTooltip();

  w.open();
}

// ——— Внутреннее ———

function buildBody() {
  const body = document.createElement('div');
  body.className = 'resize-form';
  body.innerHTML = `
    <div class="resize-row">
      <span class="resize-row__label">Единицы</span>
      <div class="resize-units">
        <button type="button" data-unit="percent" class="active">Проценты</button>
        <button type="button" data-unit="pixels">Пиксели</button>
      </div>
    </div>

    <div class="resize-dims">
      <label class="resize-dim">
        <span class="resize-dim__label">Ширина</span>
        <input type="number" id="resizeWidth" min="1" max="65535" step="1" inputmode="numeric">
      </label>
      <label class="resize-dim">
        <span class="resize-dim__label">Высота</span>
        <input type="number" id="resizeHeight" min="1" max="65535" step="1" inputmode="numeric">
      </label>
    </div>

    <label class="resize-lock">
      <input type="checkbox" id="resizeLock" checked>
      <span class="resize-lock__box"></span>
      <span class="resize-lock__text">Сохранять пропорции</span>
    </label>

    <div class="resize-method">
      <span class="resize-row__label">Алгоритм интерполяции</span>
      <select id="resizeMethod"></select>
      <div class="resize-tooltip" id="resizeTooltip"></div>
    </div>

    <div class="resize-pixels">
      <span>Пиксели:</span>
      <span>
        <span class="resize-pixels__value" id="resizePixelsBefore">—</span>
        <span class="resize-pixels__arrow">→</span>
        <span class="resize-pixels__value" id="resizePixelsAfter">—</span>
      </span>
    </div>

    <div class="resize-error" id="resizeError"></div>
  `;

  els = {
    unitPercent: body.querySelector('[data-unit="percent"]'),
    unitPixels: body.querySelector('[data-unit="pixels"]'),
    widthInput: body.querySelector('#resizeWidth'),
    heightInput: body.querySelector('#resizeHeight'),
    lockCheckbox: body.querySelector('#resizeLock'),
    methodSelect: body.querySelector('#resizeMethod'),
    tooltip: body.querySelector('#resizeTooltip'),
    pixelsBefore: body.querySelector('#resizePixelsBefore'),
    pixelsAfter: body.querySelector('#resizePixelsAfter'),
    error: body.querySelector('#resizeError'),
    applyBtn: null, // проставим ниже
  };

  // Заполняем селект методов.
  for (const m of listInterpolationMethods()) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    els.methodSelect.appendChild(opt);
  }

  // Обработчики.
  els.unitPercent.addEventListener('click', () => setUnit('percent'));
  els.unitPixels.addEventListener('click', () => setUnit('pixels'));

  els.widthInput.addEventListener('input', onWidthInput);
  els.heightInput.addEventListener('input', onHeightInput);
  els.lockCheckbox.addEventListener('change', () => {
    lockAspect = els.lockCheckbox.checked;
  });

  els.methodSelect.addEventListener('change', () => {
    methodId = els.methodSelect.value;
    updateMethodTooltip();
  });

  return body;
}

/** Переключение единиц: пересчитываем значения в полях. */
function setUnit(next) {
  if (unit === next) return;
  unit = next;

  els.unitPercent.classList.toggle('active', unit === 'percent');
  els.unitPixels.classList.toggle('active', unit === 'pixels');

  // Переводим текущие значения W/H в новые единицы.
  const target = readTargetSize();
  if (unit === 'percent') {
    const pw = Math.round((target.w / originalW) * 100);
    const ph = Math.round((target.h / originalH) * 100);
    els.widthInput.value = String(pw);
    els.heightInput.value = String(ph);
  } else {
    els.widthInput.value = String(target.w);
    els.heightInput.value = String(target.h);
  }

  validateAndUpdate();
}

/** Первичная синхронизация при открытии. */
function syncInputsFromState() {
  els.widthInput.value = '100';
  els.heightInput.value = '100';
  els.error.textContent = '';
  validateAndUpdate();
}

function onWidthInput() {
  if (lockAspect) {
    const w = parseFloat(els.widthInput.value);
    if (Number.isFinite(w) && w > 0) {
      if (unit === 'percent') {
        els.heightInput.value = String(w);
      } else {
        const h = Math.round((w / originalW) * originalH);
        els.heightInput.value = String(h);
      }
    }
  }
  validateAndUpdate();
}

function onHeightInput() {
  if (lockAspect) {
    const h = parseFloat(els.heightInput.value);
    if (Number.isFinite(h) && h > 0) {
      if (unit === 'percent') {
        els.widthInput.value = String(h);
      } else {
        const w = Math.round((h / originalH) * originalW);
        els.widthInput.value = String(w);
      }
    }
  }
  validateAndUpdate();
}

/**
 * Читает текущее целевое значение из полей и переводит в пиксели.
 * Возвращает { w, h } — целые, клампленные, но БЕЗ проверки на ошибки.
 */
function readTargetSize() {
  const rawW = parseFloat(els.widthInput.value);
  const rawH = parseFloat(els.heightInput.value);

  let w, h;
  if (unit === 'percent') {
    const pw = Number.isFinite(rawW) && rawW > 0 ? rawW : 100;
    const ph = Number.isFinite(rawH) && rawH > 0 ? rawH : 100;
    w = Math.max(1, Math.round((originalW * pw) / 100));
    h = Math.max(1, Math.round((originalH * ph) / 100));
  } else {
    w = Math.max(1, Math.round(Number.isFinite(rawW) && rawW > 0 ? rawW : originalW));
    h = Math.max(1, Math.round(Number.isFinite(rawH) && rawH > 0 ? rawH : originalH));
  }
  return { w, h };
}

/**
 * Валидирует текущее состояние и обновляет UI:
 *   - info «Пиксели: X MP → Y MP»;
 *   - сообщение об ошибке;
 *   - активность кнопки «Применить».
 */
function validateAndUpdate() {
  const errs = [];

  const rawW = els.widthInput.value.trim();
  const rawH = els.heightInput.value.trim();

  const numW = parseFloat(rawW);
  const numH = parseFloat(rawH);

  if (rawW === '' || !Number.isFinite(numW)) errs.push('Введите ширину');
  if (rawH === '' || !Number.isFinite(numH)) errs.push('Введите высоту');

  if (!errs.length) {
    if (unit === 'percent') {
      if (numW <= 0 || numH <= 0) errs.push('Проценты должны быть > 0');
      if (numW > 10000 || numH > 10000) errs.push('Слишком большой процент (>10000%)');
    } else {
      if (numW < 1 || numH < 1) errs.push('Размеры должны быть ≥ 1 px');
      if (numW > 65535 || numH > 65535) errs.push('Размеры ограничены 65535 px');
    }
  }

  const { w, h } = readTargetSize();

  // Проверка на бюджет пикселей (для «слишком большой» цели — предупреждение).
  // Для «too-large» — блокируем кнопку. Для «large» — предупреждаем, но пускаем.
  const px = w * h;
  if (px >= LIMITS.MAX_PIXELS) {
    errs.push(
      `Новый размер ${w}×${h} (${(px / 1e6).toFixed(1)} Мпикс) превышает безопасный предел`
    );
  }

  els.error.textContent = errs[0] ?? '';

  // Визуальная инвалидация полей
  els.widthInput.classList.toggle('invalid', errs.length > 0);
  els.heightInput.classList.toggle('invalid', errs.length > 0);

  // Обновляем info о пикселях
  updatePixelsInfo(w, h);

  // Кнопка Apply
  const applyBtn = win.bodyEl.querySelector('#resizeApplyBtn');
  if (applyBtn) applyBtn.disabled = errs.length > 0;
}

function updatePixelsInfo(w, h) {
  const { w: ww, h: hh } = (w && h) ? { w, h } : readTargetSize();
  const before = sourcePixels / 1e6;
  const after = (ww * hh) / 1e6;
  els.pixelsBefore.textContent = formatMP(before);
  els.pixelsAfter.textContent = formatMP(after);
}

function formatMP(mp) {
  if (mp < 0.01) return `${(mp * 1000).toFixed(1)} Кпикс`;
  if (mp < 1) return `${(mp * 1000).toFixed(0)} Кпикс`;
  return `${mp.toFixed(2)} Мпикс`;
}

function updateMethodTooltip() {
  const methods = listInterpolationMethods();
  const m = methods.find((x) => x.id === methodId) ?? methods[0];
  els.tooltip.textContent = m?.description ?? '';
}

function submit() {
  const { w, h } = readTargetSize();
  const errs = els.error.textContent;
  if (errs) return;

  const cb = onSubmit;
  win.close();
  cb?.({ width: w, height: h, methodId });
}