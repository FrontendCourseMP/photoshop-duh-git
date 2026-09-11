/**
 * Drag & drop файла на указанный элемент.
 * @param {HTMLElement} el
 * @param {(file: File) => void} onFile
 */
export function initDropZone(el, onFile) {
  let depth = 0;

  el.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    el.classList.add('drop-active');
  });

  el.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  el.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) el.classList.remove('drop-active');
  });

  el.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    el.classList.remove('drop-active');
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  });
}

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}