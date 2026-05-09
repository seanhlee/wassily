/**
 * Wassily Color Engine
 *
 * Pure functions for color science. No React, no DOM, no side effects.
 */

export { purify, purifyColor } from "./purify";
export {
  clampToGamut,
  fallbackGamutForTarget,
  isInGamut,
  maxChroma,
  solvingGamutForTarget,
  toDisplayP3String,
  toHex,
  parseColor,
} from "./gamut";
export { generateRamp, solveRamp, nameForHue } from "./ramp";
export {
  CURATED_FAMILY_PROFILE_FITS,
  CURATED_REFERENCE_CORPUS,
  FAMILY_EXEMPLARS,
  FAMILY_PROFILES,
} from "./familyProfiles";
export {
  RESEARCH_SEEDS,
  analyzeRamp,
  evaluateSeed,
  evaluateSeedRun,
  evaluateSeedSuite,
  researchSeedToRampConfig,
} from "./research";
export { buildResearchLabData } from "./researchLab";
export { solveV6ResearchRamp } from "./v6ResearchSolver";
export { solveV6ArchetypeRamp } from "./v6ResearchSolver";
export { solveBrandExactFairRamp } from "./brandExactFairingSolver";
export {
  solveContinuousCompressedRamp,
  solveContinuousCurveRamp,
} from "./continuousCurveSolver";
export { compareToV6SoftPrior } from "./v6SoftPriors";
export {
  checkContrast,
  contrastRatio,
  WHITE,
  BLACK,
} from "./contrast";
export { harmonizePair, harmonizeMultiple } from "./harmonize";
