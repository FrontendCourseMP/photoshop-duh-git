/**
 * UI-панель цветовых каналов.
 *
 * Отвечает за:
 *   - генерацию списка каналов из данных документа;
 *   - построение миниатюр каждого канала (grayscale);
 *   - клик по каналу → вкл/выкл, визуальное состояние;
 *   - уведомление подписчиков (onToggle) при изменении набора.
 *
 * Не занимается перерисовкой холста напрямую — это делает вызывающий код
 * через колбэк onToggle(id, enabled).
 */

import { ALL_CHANNELS, getChannelList } from '../core/channels.js';

let listEl = null;
let countEl = null;
let onToggle = null;

/** Текущее состояние: document + enabled set. */
let docMeta = null;
let rawData = null;
let rawMask = null;
let enabledSet = new Set();

/** Кэш сгенерированных DOM-элементов по id канала. */
const itemEls = new Map();

export function initChannelsUI({ listEl: list, countEl: count, onToggle: cb }) {
  listEl = list;
  countEl = count;
  onToggle = cb ?? null;

  listEl.addEventListener('click', (e) => {
    const item = e.target.closest('.channel-item');
    if (!item) return;
    const id = item.dataset.channelId;
    if (!id) return;

    const willBeEnabled = !enabledSet.has(id);
    if (willBeEnabled) enabledSet.add(id);
    else enabledSet.delete(id);

    applyItemState(item, id);
    onToggle?.(id, willBeEnabled);
  });
}

/**
 * Полностью пересобирает панель под новый документ.
 * @param {{
 *   imageData: ImageData|null,
 *   doc: { format: 'raster'|'gb7', hasMask?: boolean }|null,
 *   mask?: Uint8Array|null,
 *   enabled: Set<string>
 * }} state
 */
export function renderChannels({ imageData, doc, mask, enabled }) {
  rawData = imageData;
  docMeta = doc;
  rawMask = mask ?? null;
  enabledSet = new Set(enabled ?? []);

  listEl.innerHTML = '';
  itemEls.clear();

  if (!rawData || !docMeta) {
    countEl.textContent = '0';
    const empty = document.createElement('div');
    empty.className = 'channel-empty';
    empty.textContent = 'Нет изображения';
    listEl.appendChild(empty);
    return;
  }

  const ids = getChannelList(docMeta);
  countEl.textContent = String(ids.length);

  for (const id of ids) {
    const info = ALL_CHANNELS[id];
    const item = buildItem(id, info);
    listEl.appendChild(item);
    itemEls.set(id, item);
  }
}

/** Перестраивает миниатюры (например, после редактирования холста). */
export function refreshThumbnails() {
  if (!rawData || !docMeta) return;
  const ids = getChannelList(docMeta);
  for (const id of ids) {
    const item = itemEls.get(id);
    if (item) drawThumb(item.querySelector('.channel-thumb'), id);
  }
}

/** Внешне обновить состояние набора (например, после toggleChannel). */
export function syncEnabled(enabled) {
  enabledSet = new Set(enabled ?? []);
  for (const [id, item] of itemEls) applyItemState(item, id);
}

// ——— Внутреннее ———

function buildItem(id, info) {
  const item = document.createElement('div');
  item.className = 'channel-item';
  item.dataset.channelId = id;

  const thumb = document.createElement('canvas');
  thumb.className = 'channel-thumb';
  thumb.width = 40;
  thumb.height = 40;

  const infoEl = document.createElement('div');
  infoEl.className = 'channel-info';

  const nameEl = document.createElement('span');
  nameEl.className = 'channel-name';

  const dot = document.createElement('span');
  dot.className = 'channel-dot';
  dot.style.background = info.cssColor;

  const nameText = document.createElement('span');
  nameText.textContent = info.label;

  nameEl.append(dot, nameText);

  const metaEl = document.createElement('span');
  metaEl.className = 'channel-meta';
  metaEl.textContent = describeChannel(id);

  infoEl.append(nameEl, metaEl);

  const vis = document.createElement('span');
  vis.className = 'channel-visibility';
  vis.textContent = '●'; // маркер «включён»

  item.append(thumb, infoEl, vis);

  // Первичная отрисовка миниатюры
  drawThumb(thumb, id);

  applyItemState(item, id);
  return item;
}

function applyItemState(item, id) {
  const on = enabledSet.has(id);
  item.classList.toggle('active', on);
  item.classList.toggle('disabled', !on);
}

function describeChannel(id) {
  switch (id) {
    case 'r': return 'Red · 8 бит';
    case 'g': return 'Green · 8 бит';
    case 'b': return 'Blue · 8 бит';
    case 'gray': return 'Gray · 7 бит';
    case 'a': return 'Alpha · маска';
    default: return '';
  }
}

/**
 * Рисует миниатюру канала в градациях серого.
 * Для 'a' — это маска прозрачности (белый = непрозрачно).
 */
function drawThumb(canvas, id) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = rawData;
  const tw = canvas.width;
  const th = canvas.height;

  // Строим маленький ImageData путём downscaling через offscreen-canvas
  // (простой nearest-sampling — этого достаточно для превью 40×40).
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const offCtx = off.getContext('2d');

  const src = rawData.data;
  const tmp = offCtx.createImageData(w, h);
  const tmpData = tmp.data;

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    let v;
    switch (id) {
      case 'r':    v = src[o];     break;
      case 'g':    v = src[o + 1]; break;
      case 'b':    v = src[o + 2]; break;
      case 'gray': v = src[o];     break; // в gb7 R=G=B
      case 'a': {
        if (docMeta.format === 'gb7') {
          const bit = rawMask ? rawMask[i] : 1;
          v = bit ? 255 : 0;
        } else {
          v = src[o + 3];
        }
        break;
      }
      default: v = 0;
    }
    tmpData[o]     = v;
    tmpData[o + 1] = v;
    tmpData[o + 2] = v;
    tmpData[o + 3] = 255;
  }
  offCtx.putImageData(tmp, 0, 0);

  ctx.clearRect(0, 0, tw, th);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, w, h, 0, 0, tw, th);
}