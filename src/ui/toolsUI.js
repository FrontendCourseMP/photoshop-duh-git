/**
 * Управление активным инструментом в левой панели.
 *
 * На этом этапе инструмент влияет только на:
 *   - визуальное выделение кнопки в панели;
 *   - CSS-класс на .canvas-area (для смены курсора);
 *   - уведомление подписчиков (onChange) — те могут включать/выключать
 *     свои обработчики событий мыши.
 *
 * Активный инструмент по умолчанию — 'move' (заглушка, ничего не делает).
 */

let current = 'move';
let onChange = null;
let areaEl = null;

/** Все известные инструменты: id → DOM-элемент. */
const toolEls = new Map();

/**
 * @param {{
 *   toolElements: HTMLElement[],   // все .tool-item с data-tool
 *   areaEl: HTMLElement,           // .canvas-area
 *   defaultTool?: string,          // по умолчанию 'move'
 *   onChange?: (toolId: string) => void
 * }} opts
 */
export function initToolsUI({ toolElements, areaEl: area, defaultTool = 'move', onChange: cb }) {
  areaEl = area;
  onChange = cb ?? null;

  for (const el of toolElements) {
    const id = el.dataset.tool;
    if (!id) continue;
    toolEls.set(id, el);
    el.addEventListener('click', () => setActiveTool(id));
  }

  setActiveTool(defaultTool);
}

/** Возвращает id текущего инструмента. */
export function getActiveTool() {
  return current;
}

/** Программно выбрать инструмент. */
export function setActiveTool(id) {
  if (!toolEls.has(id)) return;
  if (current === id) return;

  // Снять выделение с прежнего, поставить на новый.
  toolEls.get(current)?.classList.remove('active');
  toolEls.get(id).classList.add('active');

  // Обновить класс на .canvas-area: снять старый tool-*, поставить новый.
  for (const cls of [...areaEl.classList]) {
    if (cls.startsWith('tool-')) areaEl.classList.remove(cls);
  }
  areaEl.classList.add(`tool-${id}`);

  current = id;
  onChange?.(id);
}