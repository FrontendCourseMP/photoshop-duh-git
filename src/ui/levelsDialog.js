/**
 * Окно инструмента «Уровни».
 *
 * Пока — только каркас: создаёт плавающее окно и наполняет его
 * разметкой (без обработчиков). Логика гистограммы, слайдеров и
 * кнопок — на следующих шагах.
 */

import { createFloatingWindow } from './floatingWindow.js';

let win = null;

/** Создаёт окно (если ещё не создано) и возвращает его API. */
export function getLevelsWindow() {
  if (win) return win;

  const body = buildBody();
  win = createFloatingWindow({
    id: 'levels',
    title: 'Уровни',
    body,
    onOpen: () => {
      // TODO (шаг 4-6): пересчитать гистограммы, отрисовать их,
      // синхронизировать слайдеры.
    },
    onClose: () => {
      // TODO (шаг 6): отменить предпросмотр (если был).
    },
  });

  return win;
}

/** Открывает окно «Уровни». */
export function openLevelsDialog() {
  const w = getLevelsWindow();
  w.open();
}

/** Закрывает окно «Уровни». */
export function closeLevelsDialog() {
  if (win) win.close();
}

// ——— Разметка ———

function buildBody() {
  const root = document.createElement('div');
  root.className = 'levels-body';

  root.innerHTML = `
    <div class="levels-placeholder">
      Здесь будет интерфейс «Уровней»: гистограмма, каналы, слайдеры.
    </div>
  `;

  return root;
}