/**
 * Wassily Color Engine
 *
 * Pure functions for color science. No React, no DOM, no side effects.
 */

export { purify, purifyColor, randomPurifiedColor } from "./purify";
export {
  isInGamut,
  clampToGamut,
  maxChroma,
  chromaPeakLightness,
  toHex,
  toOklchString,
  parseColor,
} from "./gamut";
export { generateRamp, nameForHue, uniqueRampName } from "./ramp";
export {
  contrastRatio,
  checkContrast,
  swatchDots,
  WHITE,
  BLACK,
} from "./contrast";
export { harmonizePair, harmonizeMultiple } from "./harmonize";
