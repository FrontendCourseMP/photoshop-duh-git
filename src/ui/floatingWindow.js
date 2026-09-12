/**
 * Универсальное плавающее окно (draggable panel).
 *
 * Особенности:
 *   - position: fixed, можно таскать за шапку по всему viewport;
 *   - при клике на окно поднимается z-index (поверх других окон);
 *   - кнопки «свернуть» и «закрыть»;
 *   - позиция и свёрнутость сохраняются в памяти модуля по id окна —
 *     при повторном открытии окно встаёт туда же, где было;
 *   - НЕ блокирует взаимодействие с остальной страницей (нет оверлея).
 */

/** Хранилище состояния по id: { x, y, collapsed }. */
const state = new Map();

/** Реестр созданных окон: id → API. */
const registry = new Map();

/** Глобальный z-index, чтобы окна перекрывали друг друга. */
let zCounter = 100;

/**
 * @typedef {Object} FloatingWindowOptions
 * @property {string} id
 * @property {string} title
 * @property {HTMLElement} body
 * @property {() => void} [onClose]
 * @property {() => void} [onOpen]
 * @property {boolean} [collapsible=true]
 * @property {boolean} [closable=true]
 */

/**
 * @typedef {Object} FloatingWindow
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => boolean} isOpen
 * @property {HTMLElement} el
 * @property {HTMLElement} bodyEl
 */

/**
 * Создаёт (или возвращает уже существующее) плавающее окно.
 * @param {FloatingWindowOptions} opts
 * @returns {FloatingWindow}
 */
export function createFloatingWindow(opts) {
  const { id, title, body, onClose, onOpen, collapsible = true, closable = true } = opts;

  if (!id) throw new Error('createFloatingWindow: нужен id');

  const existing = registry.get(id);
  if (existing) return existing;

  // ——— Разметка ———
  const root = document.createElement('div');
  root.className = 'floating-window';
  root.dataset.windowId = id;
  root.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'floating-window__header';

  const titleEl = document.createElement('span');
  titleEl.className = 'floating-window__title';
  titleEl.textContent = title;
  header.append(titleEl);

  if (collapsible) {
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'floating-window__btn';
    collapseBtn.title = 'Свернуть';
    collapseBtn.textContent = '–';
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCollapseInternal();
    });
    header.append(collapseBtn);
  }

  if (closable) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'floating-window__btn floating-window__btn--close';
    closeBtn.title = 'Закрыть';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeInternal();
    });
    header.append(closeBtn);
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'floating-window__body';
  if (body) bodyEl.appendChild(body);

  root.append(header, bodyEl);

  // Поднимаем окно при любом нажатии по нему.
  root.addEventListener('pointerdown', () => bringToFrontInternal(), true);

  document.body.appendChild(root);

  // ——— Начальная позиция ———
  const saved = state.get(id) ?? {};
  const initialPos = computeInitialPosition(root, saved);
  root.style.left = `${initialPos.x}px`;
  root.style.top = `${initialPos.y}px`;
  if (saved.collapsed) root.classList.add('collapsed');

  // ——— Drag ———
  enableDrag(header, root, id);

  // ——— Внутренние функции (используются и API, и обработчиками кнопок) ———

  function bringToFrontInternal() {
    zCounter += 1;
    root.style.zIndex = String(zCounter);
  }

  function openInternal() {
    if (root.style.display !== 'none') {
      bringToFrontInternal();
      return;
    }
    root.style.display = '';
    bringToFrontInternal();
    onOpen?.();
  }

  function closeInternal() {
    if (root.style.display === 'none') return;
    root.style.display = 'none';
    onClose?.();
  }

  function isOpenInternal() {
    return root.style.display !== 'none';
  }

  function toggleCollapseInternal() {
    const collapsed = root.classList.toggle('collapsed');
    const s = state.get(id) ?? {};
    s.collapsed = collapsed;
    state.set(id, s);

    // Если окно свернулось и его низ оказался за экраном — поджать.
    const pos = clampToViewport(
      parseFloat(root.style.left) || 0,
      parseFloat(root.style.top) || 0,
      root
    );
    root.style.left = `${pos.x}px`;
    root.style.top = `${pos.y}px`;
    s.x = pos.x;
    s.y = pos.y;
    state.set(id, s);
  }

  // ——— Публичный API ———
  const api = {
    el: root,
    bodyEl,
    open: openInternal,
    close: closeInternal,
    isOpen: isOpenInternal,
  };

  registry.set(id, api);
  return api;
}

/** Получить уже созданное окно по id (без создания). */
export function getFloatingWindow(id) {
  return registry.get(id) ?? null;
}

// ——— Служебные ———

function computeInitialPosition(root, saved) {
  if (typeof saved.x === 'number' && typeof saved.y === 'number') {
    return clampToViewport(saved.x, saved.y, root);
  }

  // Дадим окну отрисоваться «невидимо», чтобы узнать его размеры.
  root.style.visibility = 'hidden';
  root.style.display = '';
  const rect = root.getBoundingClientRect();
  root.style.display = 'none';
  root.style.visibility = '';

  const w = rect.width || 320;
  const h = rect.height || 240;

  const x = Math.max(0, Math.round((window.innerWidth - w) / 2));
  const y = Math.max(0, Math.round((window.innerHeight - h) / 2));
  return { x, y };
}

function clampToViewport(x, y, root) {
  const headerH = root.querySelector('.floating-window__header')?.offsetHeight ?? 32;
  const minX = -(root.offsetWidth - 60);
  const maxX = window.innerWidth - 60;
  const minY = 0;
  const maxY = window.innerHeight - headerH - 4;
  return {
    x: Math.min(Math.max(minX, x), maxX),
    y: Math.min(Math.max(minY, y), maxY),
  };
}

/** Перетаскивание окна за handle. */
function enableDrag(handleEl, root, id) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origX = 0;
  let origY = 0;
  let pointerId = null;

  handleEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.floating-window__btn')) return;
    if (e.button !== 0) return;

    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    origX = parseFloat(root.style.left) || 0;
    origY = parseFloat(root.style.top) || 0;

    handleEl.classList.add('dragging');
    handleEl.setPointerCapture(pointerId);
    e.preventDefault();
  });

  handleEl.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pointerId) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const { x, y } = clampToViewport(origX + dx, origY + dy, root);

    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
  });

  const endDrag = (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    handleEl.classList.remove('dragging');
    try { handleEl.releasePointerCapture(pointerId); } catch { /* noop */ }
    pointerId = null;

    const s = state.get(id) ?? {};
    s.x = parseFloat(root.style.left) || 0;
    s.y = parseFloat(root.style.top) || 0;
    state.set(id, s);
  };

  handleEl.addEventListener('pointerup', endDrag);
  handleEl.addEventListener('pointercancel', endDrag);
}