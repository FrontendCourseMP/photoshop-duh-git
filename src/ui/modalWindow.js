/**
 * Универсальное модальное окно.
 *
 * Особенности:
 *   - полупрозрачный оверлей блокирует взаимодействие со страницей;
 *   - закрытие: крестик, Esc, клик по оверлею (опционально);
 *   - фокус-менеджмент: при открытии фокус уходит в окно, при закрытии
 *     возвращается на элемент, который открыл окно;
 *   - длинное содержимое прокручивается внутри .modal-window__body;
 *   - реестр по id — повторный createModal({id}) возвращает тот же объект.
 *
 * Не занимается логикой формы: кнопки и обработчики передаются снаружи
 * через параметр `actions` (готовые DOM-элементы).
 */

/** Реестр созданных окон: id → API. */
const registry = new Map();

/**
 * @typedef {Object} ModalWindowOptions
 * @property {string} id
 * @property {string} [title]
 * @property {HTMLElement} body           — содержимое
 * @property {HTMLElement[]} [actions]    — кнопки (будут в футере справа)
 * @property {boolean} [closable=true]    — показывать крестик
 * @property {boolean} [closeOnBackdrop=false] — закрывать по клику на оверлей
 * @property {boolean} [closeOnEscape=true]
 * @property {() => void} [onOpen]
 * @property {() => void} [onClose]
 */

/**
 * @typedef {Object} ModalWindow
 * @property {() => void} open
 * @property {() => void} close
 * @property {() => boolean} isOpen
 * @property {HTMLElement} el              — корневой .modal-window
 * @property {HTMLElement} bodyEl
 */

/**
 * Создаёт (или возвращает уже существующее) модальное окно.
 * @param {ModalWindowOptions} opts
 * @returns {ModalWindow}
 */
export function createModal(opts) {
  const {
    id, title, body, actions,
    closable = true,
    closeOnBackdrop = false,
    closeOnEscape = true,
    onOpen, onClose,
  } = opts;

  if (!id) throw new Error('createModal: нужен id');

  const existing = registry.get(id);
  if (existing) return existing;

  // ——— Разметка ———
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.dataset.modalId = id;
  overlay.style.display = 'none';

  const dialog = document.createElement('div');
  dialog.className = 'modal-window';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  if (title) dialog.setAttribute('aria-label', title);

  const header = document.createElement('div');
  header.className = 'modal-window__header';

  const titleEl = document.createElement('span');
  titleEl.className = 'modal-window__title';
  titleEl.textContent = title ?? '';
  header.append(titleEl);

  if (closable) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-window__close';
    closeBtn.title = 'Закрыть';
    closeBtn.setAttribute('aria-label', 'Закрыть');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeInternal());
    header.append(closeBtn);
  }

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-window__body';
  if (body) bodyEl.appendChild(body);

  dialog.append(header, bodyEl);

  if (actions && actions.length) {
    const footer = document.createElement('div');
    footer.className = 'modal-window__footer';
    for (const el of actions) footer.append(el);
    dialog.append(footer);
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // ——— Состояние ———
  /** Элемент, который открыл окно (для возврата фокуса). */
  let returnFocusEl = null;

  // ——— Закрытие по клику на оверлей ———
  if (closeOnBackdrop) {
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) closeInternal();
    });
  }

  // ——— Закрытие по Esc ———
  if (closeOnEscape) {
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeInternal();
      }
    });
  }

  function openInternal() {
    if (overlay.style.display !== 'none') return;

    returnFocusEl = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    overlay.style.display = '';
    // Небольшая задержка, чтобы браузер успел применить display,
    // и фокус сработал корректно.
    requestAnimationFrame(() => {
      const focusTarget = dialog.querySelector(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
      );
      (focusTarget ?? dialog).focus();
    });

    onOpen?.();
  }

  function closeInternal() {
    if (overlay.style.display === 'none') return;
    overlay.style.display = 'none';

    // Возвращаем фокус, если элемент ещё в DOM.
    if (returnFocusEl && document.body.contains(returnFocusEl)) {
      try { returnFocusEl.focus(); } catch { /* noop */ }
    }
    returnFocusEl = null;

    onClose?.();
  }

  function isOpenInternal() {
    return overlay.style.display !== 'none';
  }

  const api = {
    el: overlay,
    bodyEl,
    open: openInternal,
    close: closeInternal,
    isOpen: isOpenInternal,
  };

  registry.set(id, api);
  return api;
}

/** Получить уже созданное окно по id (без создания). */
export function getModal(id) {
  return registry.get(id) ?? null;
}