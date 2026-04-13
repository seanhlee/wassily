import type { HarmonicRelationship, Camera, Point } from "../types";

export interface HarmonizeFeedback {
  relationship: HarmonicRelationship;
  angle: number;
  count: number;
  alreadyHarmonized: boolean;
  placement?: Point;
  camera?: Camera;
}

const listeners: Set<(feedback: HarmonizeFeedback) => void> = new Set();

export function showHarmonizeFeedback(feedback: HarmonizeFeedback) {
  listeners.forEach((listener) => listener(feedback));
}

export function subscribeToHarmonizeFeedback(
  listener: (feedback: HarmonizeFeedback) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
