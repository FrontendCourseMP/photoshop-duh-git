/**
 * Глобальные горячие клавиши.
 * @param {{
 *   open: () => void,
 *   exportDefault: () => void,
 *   fit: () => void,
 *   zoom100: () => void,
 *   zoomIn: () => void,
 *   zoomOut: () => void,
 * }} handlers
 */
export function initHotkeys(handlers) {
  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    switch (e.key) {
      case 'o': case 'O': case 'о': case 'О': // латинская/кириллица
        e.preventDefault(); handlers.open(); break;
      case 's': case 'S': case 'ы': case 'Ы':
        e.preventDefault(); handlers.exportDefault(); break;
      case '0':
        e.preventDefault(); handlers.fit(); break;
      case '1':
        e.preventDefault(); handlers.zoom100(); break;
      case '=': case '+':
        e.preventDefault(); handlers.zoomIn(); break;
      case '-': case '_':
        e.preventDefault(); handlers.zoomOut(); break;
    }
  });
}

function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}