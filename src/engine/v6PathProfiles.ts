import type { OklchColor } from "../types";
import { maxChroma } from "./gamut";
import {
  buildSeedCenteredFrame,
  projectPointToSeedFrame,
  type SeedFramePointCoordinates,
} from "./pathGeometry";

const EPSILON = 1e-6;

export const PATH_SAMPLE_PROGRESS = [
  0,
  0.125,
  0.25,
  0.375,
  0.5,
  0.625,
  0.75,
  0.875,
  1,
] as const;

export interface V6PathProfileSample extends SeedFramePointCoordinates {
  progress: number;
  occupancy: number;
}

export interface V6PathProfile {
  light: V6PathProfileSample[];
  dark: V6PathProfileSample[];
}

interface ArcLengthPoint {
  color: OklchColor;
  distance: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function occupancy(color: OklchColor): number {
  const available = maxChroma(color.l, color.h);
  return available > EPSILON ? clamp(color.c / available, 0, 1.1) : 0;
}

function buildArcLengthPolyline(colors: readonly OklchColor[]): ArcLengthPoint[] {
  const points: ArcLengthPoint[] = [];
  let cumulative = 0;
  for (let index = 0; index < colors.length; index++) {
    if (index > 0) {
      const previous = colors[index - 1];
      const current = colors[index];
      const dl = current.l - previous.l;
      const dc = current.c - previous.c;
      const dh = Math.min(
        Math.abs(current.h - previous.h),
        360 - Math.abs(current.h - previous.h),
      );
      cumulative += Math.sqrt(dl ** 2 + dc ** 2 + (dh / 180) ** 2);
    }
    points.push({ color: colors[index], distance: cumulative });
  }
  return points;
}

function interpolateByArcLength(
  points: readonly ArcLengthPoint[],
  progress: number,
): OklchColor {
  if (points.length === 0) {
    throw new Error("Cannot interpolate an empty polyline");
  }
  if (progress <= 0 || points.length === 1) return points[0].color;
  const total = points[points.length - 1].distance;
  if (progress >= 1 || total <= EPSILON) return points[points.length - 1].color;

  const target = total * progress;
  for (let index = 1; index < points.length; index++) {
    if (target <= points[index].distance) {
      const start = points[index - 1];
      const end = points[index];
      const span = end.distance - start.distance;
      const mix = span > EPSILON ? (target - start.distance) / span : 0;
      return {
        l: start.color.l + (end.color.l - start.color.l) * mix,
        c: start.color.c + (end.color.c - start.color.c) * mix,
        h: start.color.h + (end.color.h - start.color.h) * mix,
      };
    }
  }

  return points[points.length - 1].color;
}

function sampleSideProfile(
  seed: OklchColor,
  lightEndpoint: OklchColor,
  darkEndpoint: OklchColor,
  colorsSeedToEndpoint: readonly OklchColor[],
): V6PathProfileSample[] {
  const frame = buildSeedCenteredFrame(lightEndpoint, seed, darkEndpoint);
  const polyline = buildArcLengthPolyline(colorsSeedToEndpoint);

  return PATH_SAMPLE_PROGRESS.map((progress) => {
    const color = interpolateByArcLength(polyline, progress);
    const coordinates = projectPointToSeedFrame(frame, color);
    return {
      progress,
      flow: coordinates.flow,
      radial: coordinates.radial,
      normal: coordinates.normal,
      occupancy: occupancy(color),
    };
  });
}

export function buildPathProfileFromSidePolylines(
  seed: OklchColor,
  lightEndpoint: OklchColor,
  darkEndpoint: OklchColor,
  lightSideColorsSeedToEndpoint: readonly OklchColor[],
  darkSideColorsSeedToEndpoint: readonly OklchColor[],
): V6PathProfile {
  return {
    light: sampleSideProfile(
      seed,
      lightEndpoint,
      darkEndpoint,
      lightSideColorsSeedToEndpoint,
    ),
    dark: sampleSideProfile(
      seed,
      lightEndpoint,
      darkEndpoint,
      darkSideColorsSeedToEndpoint,
    ),
  };
}

export function buildReferencePathProfile(
  colors: readonly OklchColor[],
  anchorIndex: number,
): V6PathProfile {
  const seed = colors[anchorIndex];
  const lightEndpoint = colors[0];
  const darkEndpoint = colors[colors.length - 1];

  return buildPathProfileFromSidePolylines(
    seed,
    lightEndpoint,
    darkEndpoint,
    colors.slice(0, anchorIndex + 1).reverse(),
    colors.slice(anchorIndex),
  );
}
