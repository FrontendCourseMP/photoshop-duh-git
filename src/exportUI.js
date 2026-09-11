/** Вешает обработчики открытия/закрытия меню экспорта. */
export function initExportMenu({ button, menu, onSelect }) {
  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }
  function close() {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden ? open() : close();
  });

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-format]');
    if (!btn) return;
    close();
    onSelect(btn.dataset.format);
  });

  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (!menu.contains(e.target) && e.target !== button) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}