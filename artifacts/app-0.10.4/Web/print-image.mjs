// Images are transported to the native print preview; no image export tool.
export function printImageBase64(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
  return canvas.toDataURL('image/png').split(',')[1];
}
