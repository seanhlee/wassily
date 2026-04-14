/**
 * Wassily Color Engine
 *
 * Pure functions for color science. No React, no DOM, no side effects.
 */

export { purify, purifyColor } from "./purify";
export {
  isInGamut,
  toHex,
  parseColor,
} from "./gamut";
export { generateRamp, nameForHue } from "./ramp";
export {
  CURATED_FAMILY_PROFILE_FITS,
  CURATED_REFERENCE_CORPUS,
  FAMILY_PROFILES,
} from "./familyProfiles";
export {
  RESEARCH_SEEDS,
  analyzeRamp,
  evaluateSeed,
  evaluateSeedSuite,
  researchSeedToRampConfig,
} from "./research";
export {
  checkContrast,
  contrastRatio,
  WHITE,
  BLACK,
} from "./contrast";
export { harmonizePair, harmonizeMultiple } from "./harmonize";
