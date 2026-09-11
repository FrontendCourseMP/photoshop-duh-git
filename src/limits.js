export const LIMITS = {
  LARGE_PIXELS: 16_000_000,   // 16 Мпикс
  MAX_PIXELS: 64_000_000,   // 64 Мпикс
  LARGE_FILE_BYTES: 20 * 1024 * 1024, // 20 МБайт
};

/** Возвращает 'ok' | 'large' | 'too-large'. */
export function checkPixelBudget(pixels) {
  if (pixels >= LIMITS.MAX_PIXELS) return 'too-large';
  if (pixels >= LIMITS.LARGE_PIXELS) return 'large';
  return 'ok';
}

export function checkFileBudget(bytes) {
  return bytes >= LIMITS.LARGE_FILE_BYTES ? 'large' : 'ok';
}