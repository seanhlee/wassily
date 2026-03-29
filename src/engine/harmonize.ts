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
 * Harmonize multiple hues. Finds the best-fit geometry for all simultaneously.
 * For 2: uses harmonizePair. For 3: triadic. For 4: tetradic.
 * Minimizes total hue displacement.
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

  // For 3+ hues: distribute evenly around the circle
  const count = hues.length;
  const angleStep = 360 / count;
  const relationship: HarmonicRelationship =
    count === 3 ? "triadic" : count === 4 ? "tetradic" : "analogous";

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

  // Distribute evenly from anchor
  const sorted = [...hues].sort((a, b) => a.hue - b.hue);
  const adjustments = sorted.map((h, i) => {
    const targetHue = normalizeHue(anchor + i * angleStep);
    return {
      id: h.id,
      originalHue: h.hue,
      newHue: h.locked ? h.hue : targetHue,
    };
  });

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
