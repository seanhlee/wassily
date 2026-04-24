export const LOUPE_CROP_SIZE = 20; // source pixels
export const LOUPE_DISPLAY_SIZE = 140; // on-screen pixels
export const LOUPE_GAP = 24; // gap between pointer and loupe edge

/**
 * Default the loupe to the upper-left of the cursor. Flip to the right or
 * below if the default would clip the viewport. Finally clamp so the loupe
 * never leaves the screen when the cursor is near the far edges.
 *
 * Viewport dimensions of 0 are treated as "unknown" — the clamp pass is
 * skipped so we don't collapse to a negative position in that case.
 *
 * Pure — unit-testable.
 */
export function computeLoupeOffset(
  clientX: number,
  clientY: number,
  viewportW: number,
  viewportH: number,
  loupeSize: number,
  gap: number,
): { left: number; top: number } {
  const total = loupeSize + gap;
  let left = clientX - total;
  let top = clientY - total;
  if (left < 0) left = clientX + gap;
  if (top < 0) top = clientY + gap;
  if (viewportW > 0 && left + loupeSize > viewportW) {
    left = viewportW - loupeSize;
  }
  if (viewportH > 0 && top + loupeSize > viewportH) {
    top = viewportH - loupeSize;
  }
  return { left, top };
}
