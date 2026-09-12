/**
 * Реестр преднастроенных ядер свёртки 3×3.
 *
 * Расширяемая архитектура: чтобы добавить пресет, достаточно вызвать
 * registerKernelPreset с новым объектом. UI (диалог фильтра) строит
 * список вариантов автоматически из listKernelPresets().
 *
 * Формат ядра — массив из 9 чисел (Float32Array или обычный).
 * Порядок: [0..2] — верхняя строка, [3..5] — средняя, [6..8] — нижняя.
 * Это соответствует тому, как ядра читаются «слева-вправо, сверху-вниз»
 * и как они выглядят в Photoshop Custom.
 *
 * Значения ядра НЕ нормируются автоматически — если сумма не равна 1,
 * яркость «уедет». Пресеты размытия уже нормированы; Прюитт имеет
 * сумму 0 (это нормально — результат показывает градиент).
 */

/**
 * @typedef {Object} KernelPreset
 * @property {string} id
 * @property {string} label
 * @property {string} [description]
 * @property {number[]} kernel   — 9 коэффициентов
 * @property {boolean} [isEdgeDetector] — подсказка для UI/интерпретации
 */

/** @type {Map<string, KernelPreset>} */
const presets = new Map();

/** Порядок отображения в списке. */
const order = [];

/**
 * Регистрирует пресет. Если с таким id уже есть — заменяет.
 * @param {KernelPreset} preset
 */
export function registerKernelPreset(preset) {
  if (!preset?.id) throw new Error('kernels: у пресета должен быть id');
  if (!Array.isArray(preset.kernel) && !(preset.kernel instanceof Float32Array)) {
    throw new Error('kernels: kernel должен быть массивом');
  }
  if (preset.kernel.length !== 9) {
    throw new Error('kernels: kernel должен содержать 9 чисел');
  }
  if (!presets.has(preset.id)) order.push(preset.id);
  presets.set(preset.id, {
    ...preset,
    kernel: [...preset.kernel],
  });
}

/** Возвращает пресет по id или null. */
export function getKernelPreset(id) {
  return presets.get(id) ?? null;
}

/** Список всех пресетов в порядке регистрации. */
export function listKernelPresets() {
  return order.map((id) => presets.get(id));
}

/** id пресета по умолчанию. */
export const DEFAULT_KERNEL_ID = 'identity';

// ——— Встроенные пресеты ———

registerKernelPreset({
  id: 'identity',
  label: 'Тождественное отображение',
  description:
    'Оставляет изображение без изменений: центральный коэффициент 1, ' +
    'остальные 0. Используется как «нулевая» точка отсчёта.',
  kernel: [
    0, 0, 0,
    0, 1, 0,
    0, 0, 0,
  ],
});

registerKernelPreset({
  id: 'sharpen',
  label: 'Повышение резкости',
  description:
    'Классический sharpen: усиливает контраст на границах, ' +
    'подчёркивает детали. Сумма коэффициентов = 1, яркость сохраняется.',
  kernel: [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0,
  ],
});

registerKernelPreset({
  id: 'gaussian3',
  label: 'Гаусс 3×3',
  description:
    'Дискретное приближение гаусса 3×3: сглаживает изображение, ' +
    'вес центрального пикселя выше, чем у соседей. ' +
    'Хорошо подавляет шум, сохраняя структуру лучше box-фильтра.',
  kernel: [
    1 / 16, 2 / 16, 1 / 16,
    2 / 16, 4 / 16, 2 / 16,
    1 / 16, 2 / 16, 1 / 16,
  ],
});

registerKernelPreset({
  id: 'box',
  label: 'Прямоугольное размытие',
  description:
    'Box blur 3×3: усредняет пиксель по всем девяти соседям с ' +
    'одинаковым весом. Простое и быстрое размытие, даёт ' +
    'характерные «квадратные» артефакты.',
  kernel: [
    1 / 9, 1 / 9, 1 / 9,
    1 / 9, 1 / 9, 1 / 9,
    1 / 9, 1 / 9, 1 / 9,
  ],
});

registerKernelPreset({
  id: 'prewitt-x',
  label: 'Прюитт X (горизонтальный градиент)',
  description:
    'Ядро Прюитта для выделения вертикальных границ: считает разность ' +
    'соседей слева и справа. Сумма коэффициентов = 0, ' +
    'на однородных участках результат чёрный.',
  kernel: [
    -1, 0, 1,
    -1, 0, 1,
    -1, 0, 1,
  ],
  isEdgeDetector: true,
});

registerKernelPreset({
  id: 'prewitt-y',
  label: 'Прюитт Y (вертикальный градиент)',
  description:
    'Ядро Прюитта для выделения горизонтальных границ: считает разность ' +
    'соседей сверху и снизу. Сумма коэффициентов = 0, ' +
    'на однородных участках результат чёрный.',
  kernel: [
    -1, -1, -1,
    0, 0, 0,
    1, 1, 1,
  ],
  isEdgeDetector: true,
});