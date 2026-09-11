const dot = () => document.querySelector('.status-dot');
const text = () => document.getElementById('statusText');
const size = () => document.getElementById('statusSize');
const color = () => document.getElementById('statusColor');

/** kind: 'ok' | 'error' | 'busy' */
export function setStatus(kind, message) {
  const d = dot();
  d.classList.remove('status-dot--ok', 'status-dot--error', 'status-dot--busy');
  d.classList.add(
    kind === 'error' ? 'status-dot--error'
      : kind === 'busy' ? 'status-dot--busy'
        : 'status-dot--ok'
  );
  if (message !== undefined) text().textContent = message;
}

export function updateImageInfo({ width, height, depth, format }) {
  size().textContent = `${width} × ${height} px`;
  color().textContent =
    format === 'gb7' ? `Gray / ${depth} бит` : `RGBA / ${depth} бит`;
}

export function resetImageInfo() {
  size().textContent = '— × — px';
  color().textContent = '—';
}