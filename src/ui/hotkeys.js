/**
 * Глобальные горячие клавиши.
 * @param {{
 *   open: () => void,
 *   exportDefault: () => void,
 *   fit: () => void,
 *   zoom100: () => void,
 *   zoomIn: () => void,
 *   zoomOut: () => void,
 *   selectTool?: (id: string) => void,
 *   levels?: () => void,
 * }} handlers
 */
export function initHotkeys(handlers) {
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;

    const mod = e.ctrlKey || e.metaKey;

    // ---- Клавиши с модификатором ----
    if (mod) {
      switch (e.key) {
        case 'o': case 'O': case 'о': case 'О':
          e.preventDefault(); handlers.open(); return;
        case 's': case 'S': case 'ы': case 'Ы':
          e.preventDefault(); handlers.exportDefault(); return;
        case 'l': case 'L': case 'д': case 'Д':
          e.preventDefault(); handlers.levels?.(); return;
        case '0':
          e.preventDefault(); handlers.fit(); return;
        case '1':
          e.preventDefault(); handlers.zoom100(); return;
        case '=': case '+':
          e.preventDefault(); handlers.zoomIn(); return;
        case '-': case '_':
          e.preventDefault(); handlers.zoomOut(); return;
      }
      return;
    }

    // ---- Одиночные клавиши выбора инструментов ----
    // Не мешаем, если пользователь что-то печатает в input (проверено выше)
    // и если он нажимает Shift/Ctrl/Alt — это не горячие клавиши инструментов.
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!handlers.selectTool) return;

    switch (e.key.toLowerCase()) {
      case 'v': case 'м':
        e.preventDefault(); handlers.selectTool('move'); return;
      case 'i': case 'ш':
        e.preventDefault(); handlers.selectTool('eyedropper'); return;
    }
  });
}

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}