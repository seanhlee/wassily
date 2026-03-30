/**
 * Harmonization.
 *
 * Nudges hues toward the nearest pleasing geometric relationship.
 * Minimizes total displacement — the smallest collective hue adjustment.
 */

import type { HarmonicRelationship, HarmonizationResult } from "../types";

/** Harmonic relationships and their target angles */
const HARMONIC_TARGETS: {
  relationship: HarmonicRelationship;
  angle: number;
}[] = [
  { relationship: "analogous", angle: 30 },
  { relationship: "tetradic", angle: 90 },
  { relationship: "triadic", angle: 120 },
  { relationship: "split-complementary", angle: 150 },
  { relationship: "complementary", angle: 180 },
];

/** Normalize a hue to 0-360 */
function normalizeHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Shortest angular distance between two hues (signed) */
export function angularDistance(a: number, b: number): number {
  const diff = normalizeHue(b - a);
  return diff > 180 ? diff - 360 : diff;
}

/**
 * Harmonize two hues. Finds the nearest harmonic relationship and returns
 * the minimum adjustment to reach it.
 *
 * If startFromRelationship is provided, starts searching from the next
 * relationship after that one (for cycling with repeated H presses).
 */
export function harmonizePair(
  hueA: number,
  hueB: number,
  lockedId?: "a" | "b",
  startAfter?: HarmonicRelationship,
): HarmonizationResult {
  const currentAngle = Math.abs(angularDistance(hueA, hueB));

  // Sort targets by proximity to current angle
  let targets = [...HARMONIC_TARGETS].sort(
    (a, b) =>
      Math.abs(a.angle - currentAngle) - Math.abs(b.angle - currentAngle),
  );

  // If cycling, skip to the next one after startAfter
  if (startAfter) {
    const idx = targets.findIndex((t) => t.relationship === startAfter);
    if (idx !== -1) {
      targets = [...targets.slice(idx + 1), ...targets.slice(0, idx + 1)];
    }
  }

  const best = targets[0];
  const targetAngle = best.angle;

  // Calculate how much to adjust each hue
  const currentSigned = angularDistance(hueA, hueB);
  const direction = currentSigned >= 0 ? 1 : -1;
  const delta = targetAngle * direction - currentSigned;

  let adjustA: number;
  let adjustB: number;

  if (lockedId === "a") {
    // A is locked — only adjust B
    adjustA = 0;
    adjustB = delta;
  } else if (lockedId === "b") {
    // B is locked — only adjust A
    adjustA = -delta;
    adjustB = 0;
  } else {
    // Split the adjustment evenly
    adjustA = -delta / 2;
    adjustB = delta / 2;
  }

  return {
    relationship: best.relationship,
    angle: targetAngle,
    adjustments: [
      { id: "a", originalHue: hueA, newHue: normalizeHue(hueA + adjustA) },
      { id: "b", originalHue: hueB, newHue: normalizeHue(hueB + adjustB) },
    ],
    totalDisplacement: Math.abs(adjustA) + Math.abs(adjustB),
  };
}

/**
 * Compute the smallest arc (in degrees) that contains all hues.
 * Returns 0 for a single hue, up to ~360 for hues covering the full circle.
 */
function hueSpread(hues: number[]): number {
  if (hues.length <= 1) return 0;
  const sorted = [...hues].map(normalizeHue).sort((a, b) => a - b);
  let largestGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    largestGap = Math.max(largestGap, sorted[i] - sorted[i - 1]);
  }
  // Wrap-around gap
  largestGap = Math.max(largestGap, 360 - sorted[sorted.length - 1] + sorted[0]);
  return 360 - largestGap;
}

/**
 * Harmonize multiple hues. Finds the best-fit geometry for all simultaneously.
 * For 2: uses harmonizePair. For 3+: spread-aware geometry selection.
 * Minimizes total hue displacement via optimal cyclic assignment.
 */
export function harmonizeMultiple(
  hues: { id: string; hue: number; locked?: boolean }[],
  startAfter?: HarmonicRelationship,
): HarmonizationResult {
  if (hues.length === 2) {
    const lockedId = hues[0].locked
      ? ("a" as const)
      : hues[1].locked
        ? ("b" as const)
        : undefined;
    const result = harmonizePair(
      hues[0].hue,
      hues[1].hue,
      lockedId,
      startAfter,
    );
    // Replace generic "a"/"b" ids with actual ids
    result.adjustments[0].id = hues[0].id;
    result.adjustments[1].id = hues[1].id;
    return result;
  }

  // For 3+ hues: spread-aware geometry selection
  const count = hues.length;
  const spread = hueSpread(hues.map((h) => h.hue));
  const characteristicAngle = spread / (count - 1);

  // Build candidate geometries: harmonic targets that fit this count,
  // plus the even-distribution angle (360/count)
  const evenAngle = 360 / count;
  type Candidate = { relationship: HarmonicRelationship; angle: number };
  const candidates: Candidate[] = HARMONIC_TARGETS
    .filter((t) => t.angle * (count - 1) < 360)
    .map((t) => ({ relationship: t.relationship, angle: t.angle }));

  // Add even-distribution if not already covered by a harmonic target
  if (!candidates.some((c) => Math.abs(c.angle - evenAngle) < 1)) {
    // Label: use the closest named relationship
    const closestName = HARMONIC_TARGETS.reduce((best, t) =>
      Math.abs(t.angle - evenAngle) < Math.abs(best.angle - evenAngle) ? t : best,
    ).relationship;
    candidates.push({ relationship: closestName, angle: evenAngle });
  }

  // Sort by proximity to characteristic angle
  let sorted = [...candidates].sort(
    (a, b) =>
      Math.abs(a.angle - characteristicAngle) -
      Math.abs(b.angle - characteristicAngle),
  );

  // If cycling, skip past the last-used relationship
  if (startAfter) {
    const idx = sorted.findIndex((c) => c.relationship === startAfter);
    if (idx !== -1) {
      sorted = [...sorted.slice(idx + 1), ...sorted.slice(0, idx + 1)];
    }
  }

  const best = sorted[0];
  const angleStep = best.angle;
  const relationship = best.relationship;

  // If any hue is locked, use the first locked hue as anchor
  // instead of the centroid — distribute others evenly around it
  const lockedHues = hues.filter((h) => h.locked);
  let anchor: number;

  if (lockedHues.length > 0) {
    anchor = lockedHues[0].hue;
  } else {
    // Find the centroid hue (circular mean)
    const sinSum = hues.reduce(
      (s, h) => s + Math.sin((h.hue * Math.PI) / 180),
      0,
    );
    const cosSum = hues.reduce(
      (s, h) => s + Math.cos((h.hue * Math.PI) / 180),
      0,
    );
    anchor = normalizeHue((Math.atan2(sinSum, cosSum) * 180) / Math.PI);
  }

  // Generate evenly-spaced target positions
  const targets = Array.from({ length: count }, (_, i) =>
    normalizeHue(anchor + i * angleStep),
  );

  // --- Optimal assignment with locked pre-assignment ---
  // 1. Pre-assign locked hues to their nearest available target
  const usedTargetIndices = new Set<number>();
  const lockedAssignments: { hue: typeof hues[0]; targetIdx: number }[] = [];

  for (const lh of hues.filter((h) => h.locked)) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let t = 0; t < targets.length; t++) {
      if (usedTargetIndices.has(t)) continue;
      const dist = Math.abs(angularDistance(lh.hue, targets[t]));
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = t;
      }
    }
    if (bestIdx !== -1) {
      usedTargetIndices.add(bestIdx);
      lockedAssignments.push({ hue: lh, targetIdx: bestIdx });
    }
  }

  // 2. Collect unlocked hues and remaining targets
  const unlocked = hues.filter((h) => !h.locked);
  const remainingTargetIndices = Array.from(
    { length: count },
    (_, i) => i,
  ).filter((i) => !usedTargetIndices.has(i));

  // 3. Cyclic rotation on unlocked hues + remaining targets
  const sortedUnlocked = [...unlocked].sort((a, b) => a.hue - b.hue);
  const sortedRemainingTargets = remainingTargetIndices
    .map((i) => ({ idx: i, hue: targets[i] }))
    .sort((a, b) => a.hue - b.hue);

  const m = sortedUnlocked.length;
  let bestRotation = 0;
  let bestCost = Infinity;

  for (let r = 0; r < m; r++) {
    let cost = 0;
    for (let i = 0; i < m; i++) {
      const hueIdx = (i + r) % m;
      cost += Math.abs(
        angularDistance(sortedUnlocked[hueIdx].hue, sortedRemainingTargets[i].hue),
      );
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestRotation = r;
    }
  }

  // 4. Build assignments map: hue id → target hue
  const assignmentMap = new Map<string, number>();

  // Locked: keep original hue
  for (const la of lockedAssignments) {
    assignmentMap.set(la.hue.id, la.hue.hue);
  }

  // Unlocked: use winning rotation
  for (let i = 0; i < m; i++) {
    const hueIdx = (i + bestRotation) % m;
    assignmentMap.set(
      sortedUnlocked[hueIdx].id,
      sortedRemainingTargets[i].hue,
    );
  }

  // 5. Produce adjustments in original input order
  const adjustments = hues.map((h) => ({
    id: h.id,
    originalHue: h.hue,
    newHue: assignmentMap.get(h.id) ?? h.hue,
  }));

  const totalDisplacement = adjustments.reduce(
    (sum, a) => sum + Math.abs(angularDistance(a.originalHue, a.newHue)),
    0,
  );

  return {
    relationship,
    angle: angleStep,
    adjustments,
    totalDisplacement,
  };
}
