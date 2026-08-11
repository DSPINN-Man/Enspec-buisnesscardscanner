export interface CaptureCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CoverCropInput {
  sourceWidth: number;
  sourceHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  inset?: number;
}

/**
 * Maps a CSS `object-fit: cover` viewport back to the camera's native pixels.
 * The optional inset matches the visible framing guide inside the preview.
 */
export function getCoverCaptureCrop({
  sourceWidth,
  sourceHeight,
  viewportWidth,
  viewportHeight,
  inset = 0,
}: CoverCropInput): CaptureCrop {
  if (
    sourceWidth <= 0 || sourceHeight <= 0 ||
    viewportWidth <= 0 || viewportHeight <= 0
  ) {
    throw new RangeError('capture dimensions must be positive');
  }

  const safeInset = Math.max(0, Math.min(inset, Math.min(viewportWidth, viewportHeight) / 2 - 1));
  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const hiddenLeft = (renderedWidth - viewportWidth) / 2;
  const hiddenTop = (renderedHeight - viewportHeight) / 2;

  return {
    x: (hiddenLeft + safeInset) / scale,
    y: (hiddenTop + safeInset) / scale,
    width: (viewportWidth - safeInset * 2) / scale,
    height: (viewportHeight - safeInset * 2) / scale,
  };
}
