// Load a File/Blob or data URL into an HTMLImageElement
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Read a photo from the camera/file input, fix EXIF orientation (browsers do this
 * automatically with createImageBitmap when imageOrientation is set), downscale
 * to maxSide, and return a JPEG data URL small enough to live in Firestore.
 */
// Firestore documents max out at 1 MB, so every image is capped well under that.
export const MAX_IMAGE_BYTES = 650 * 1024;

/** Encode a canvas as JPEG, stepping quality down until it fits under maxBytes. */
export function canvasToJpeg(canvas, maxBytes = MAX_IMAGE_BYTES, quality = 0.8) {
  let q = quality;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > maxBytes && q > 0.4) {
    q -= 0.1;
    out = canvas.toDataURL('image/jpeg', q);
  }
  if (out.length > maxBytes) {
    // still too big: shrink the pixels and try again
    const c2 = document.createElement('canvas');
    c2.width = Math.round(canvas.width * 0.8);
    c2.height = Math.round(canvas.height * 0.8);
    c2.getContext('2d').drawImage(canvas, 0, 0, c2.width, c2.height);
    return canvasToJpeg(c2, maxBytes, 0.7);
  }
  return out;
}

export async function fileToDataUrl(file, maxSide = 1280, quality = 0.8) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await loadImage(URL.createObjectURL(file));
  }
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return canvasToJpeg(canvas, MAX_IMAGE_BYTES, quality);
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
