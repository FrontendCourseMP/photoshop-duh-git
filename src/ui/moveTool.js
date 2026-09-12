/**
 * Инструмент «Перемещение».
 *
 * Панорамирование видимой области: таскаем содержимое .canvas-area
 * зажатой левой кнопкой мыши. Реализовано через изменение scrollLeft
 * и scrollTop — не трогаем сам холст.
 *
 * Активируется через isActive(), чтобы не мешать другим инструментам.
 * При перетаскивании на корневой элемент вешается класс `dragging`,
 * который переключает курсор на `grabbing` (см. CSS).
 */

let areaEl = null;
let isActiveFn = null;
let onDragStart = null;
let onDragEnd = null;

let dragging = false;
let pointerId = null;
let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let startScrollTop = 0;

/**
 * @param {{
 *   area: HTMLElement,
 *   isActive: () => boolean,
 *   onDragStart?: () => void,
 *   onDragEnd?: () => void,
 * }} opts
 */
export function initMoveTool({ area, isActive, onDragStart: ds, onDragEnd: de }) {
  areaEl = area;
  isActiveFn = isActive;
  onDragStart = ds ?? null;
  onDragEnd = de ?? null;

  areaEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}

function onPointerDown(e) {
  if (!isActiveFn || !isActiveFn()) return;
  if (e.button !== 0) return;
  // Игнорируем клики по элементам интерфейса внутри canvas-area —
  // сейчас таких нет, но на будущее.
  if (e.target.closest('button, input, select, textarea, a')) return;

  dragging = true;
  pointerId = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  startScrollLeft = areaEl.scrollLeft;
  startScrollTop = areaEl.scrollTop;

  areaEl.classList.add('dragging');
  // Захватываем указатель — так pointermove продолжит приходить,
  // даже если курсор выйдет за пределы area во время drag.
  try { areaEl.setPointerCapture(pointerId); } catch { /* noop */ }

  e.preventDefault();
  onDragStart?.();
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== pointerId) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  areaEl.scrollLeft = startScrollLeft - dx;
  areaEl.scrollTop = startScrollTop - dy;
}

function onPointerUp(e) {
  if (!dragging || e.pointerId !== pointerId) return;

  dragging = false;
  try { areaEl.releasePointerCapture(pointerId); } catch { /* noop */ }
  pointerId = null;

  areaEl.classList.remove('dragging');
  onDragEnd?.();
}