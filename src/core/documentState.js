/**
 * Глобальное состояние документа.
 */

let current = null;
let dirty = false;

/**
 * @typedef {Object} DocumentImage
 * @property {number} width
 * @property {number} height
 * @property {'raster'|'gb7'} format
 * @property {number} depth           — бит на пиксель (8 для raster, 7 для gb7)
 * @property {boolean} hasMask        — для gb7
 * @property {boolean} [hasAlpha]     — есть ли альфа-канал
 * @property {ImageData} displayData  — то, что показываем на canvas
 * @property {Uint8Array} [pixels]    — «сырые» 7-битные значения (только gb7)
 * @property {Uint8Array|null} [mask] — маска 0/1 (только gb7)
 * @property {string} [fileName]      — имя исходного файла
 */


export function setCurrentImage(image) {
  current = image;
}

export function getCurrentImage() {
  return current;
}

export function clearCurrentImage() {
  current = null;
}

/** Пометить документ как изменённый (после любой операции редактирования). */
export function markDirty() {
  dirty = true;
}

export function isDirty() {
  return dirty;
}