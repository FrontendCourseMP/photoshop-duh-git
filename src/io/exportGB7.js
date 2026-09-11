import { encodeGB7, imageDataToGB7 } from '../core/gb7.js';
import { getCurrentImage, isDirty } from '../core/documentState.js';

export async function canvasToGB7Blob(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const state = getCurrentImage();
  const canReuseRaw =
    state &&
    state.format === 'gb7' &&
    state.pixels &&
    state.width === canvas.width &&
    state.height === canvas.height &&
    !isDirty();

  let pixels, mask;
  if (canReuseRaw) {
    pixels = state.pixels;
    mask = state.mask ?? null;
  } else {
    ({ pixels, mask } = imageDataToGB7(imageData, { buildMask: true }));
  }

  const buffer = encodeGB7({
    width: canvas.width,
    height: canvas.height,
    pixels,
    mask,
  });

  return new Blob([buffer], { type: 'application/x-gb7' });
}