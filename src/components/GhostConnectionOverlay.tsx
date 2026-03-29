/**
 * Ephemeral connection lines that appear after harmonization (H press).
 *
 * Renders in screen space (fixed position) to avoid stroke-width scaling.
 * Shows metrics on hover, fades out over 5 seconds.
 * Clears automatically when state.objects changes (handles undo).
 */

import { useState, useEffect, useRef, useMemo } from "react";
import type { CanvasObject, Swatch, Ramp, OklchColor, Camera, Point } from "../types";
import { contrastRatio } from "../engine/contrast";
import { angularDistance } from "../engine/harmonize";
import { differenceEuclidean } from "culori";
import { toCulori } from "../engine/gamut";

const deltaEOklch = differenceEuclidean("oklch");

export interface GhostPair {
  fromId: string;
  toId: string;
}

interface GhostConnectionOverlayProps {
  ghostPairs: GhostPair[];
  objects: Record<string, CanvasObject>;
  camera: Camera;
  darkMode: boolean;
  /** Incremented on each state change — used to detect undo */
  stateGeneration: number;
}

function getObjColor(obj: Swatch | Ramp): OklchColor {
  if (obj.type === "swatch") return obj.color;
  const ramp = obj as Ramp;
  const anchor = ramp.stops.find((s) => s.label === "500") ||
    ramp.stops[Math.floor(ramp.stops.length / 2)];
  return anchor.color;
}

function getObjCenter(obj: Swatch | Ramp): Point {
  if (obj.type === "swatch") {
    return { x: obj.position.x + 24, y: obj.position.y + 24 };
  }
  const ramp = obj as Ramp;
  return {
    x: ramp.position.x + (ramp.stops.length * 48) / 2,
    y: ramp.position.y + 24,
  };
}

function canvasToScreen(pt: Point, camera: Camera): Point {
  return {
    x: pt.x * camera.zoom + camera.x,
    y: pt.y * camera.zoom + camera.y,
  };
}

function GhostLine({
  fromObj,
  toObj,
  camera,
  darkMode,
}: {
  fromObj: Swatch | Ramp;
  toObj: Swatch | Ramp;
  camera: Camera;
  darkMode: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  const from = canvasToScreen(getObjCenter(fromObj), camera);
  const to = canvasToScreen(getObjCenter(toObj), camera);

  const colorA = getObjColor(fromObj);
  const colorB = getObjColor(toObj);

  const metrics = useMemo(() => {
    const contrast = contrastRatio(colorA, colorB);
    const hueDist = Math.abs(angularDistance(colorA.h, colorB.h));
    const dE = deltaEOklch(toCulori(colorA), toCulori(colorB));
    return {
      contrast: Math.round(contrast * 10) / 10,
      hueDist: Math.round(hueDist),
      deltaE: Math.round((dE ?? 0) * 100) / 100,
    };
  }, [colorA.l, colorA.c, colorA.h, colorB.l, colorB.c, colorB.h]);

  const lineColor = darkMode ? "rgba(0,0,0," : "rgba(255,255,255,";
  const stroke = `${lineColor}${hovered ? 0.3 : 0.15})`;
  const labelBg = darkMode ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)";
  const labelColor = darkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)";

  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={stroke}
        strokeWidth={0.5}
        strokeDasharray="3 3"
      />
      {/* Hit target */}
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="transparent"
        strokeWidth={8}
        style={{ pointerEvents: "stroke", cursor: "default" }}
      />
      {hovered && (
        <foreignObject
          x={mx - 40}
          y={my - 28}
          width={80}
          height={56}
          style={{ pointerEvents: "none", overflow: "visible" }}
        >
          <div
            style={{
              background: labelBg,
              padding: "4px 6px",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9,
              color: labelColor,
              textTransform: "uppercase",
              letterSpacing: "0.3px",
              whiteSpace: "nowrap",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            <div>{metrics.contrast}:1</div>
            <div>{metrics.hueDist}°</div>
            <div>{metrics.deltaE} ΔE</div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export function GhostConnectionOverlay({
  ghostPairs,
  objects,
  camera,
  darkMode,
  stateGeneration,
}: GhostConnectionOverlayProps) {
  const [opacity, setOpacity] = useState(0);
  const [activePairs, setActivePairs] = useState<GhostPair[]>([]);
  const lastGenRef = useRef(stateGeneration);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // When ghost pairs change (new H press), start fade sequence
  useEffect(() => {
    if (ghostPairs.length === 0) return;
    lastGenRef.current = stateGeneration;
    setActivePairs(ghostPairs);
    setOpacity(1);

    // Clear previous timer
    clearTimeout(fadeTimerRef.current);
    // Start fade after hold period
    fadeTimerRef.current = setTimeout(() => {
      setOpacity(0);
      // Clear pairs after fade completes
      setTimeout(() => setActivePairs([]), 300);
    }, 4700); // 5s total: 4.7s hold + 0.3s fade

    return () => clearTimeout(fadeTimerRef.current);
  }, [ghostPairs]);

  // Clear on undo (state generation changed without new ghost pairs)
  useEffect(() => {
    if (stateGeneration !== lastGenRef.current && activePairs.length > 0) {
      clearTimeout(fadeTimerRef.current);
      setOpacity(0);
      setTimeout(() => setActivePairs([]), 300);
    }
    lastGenRef.current = stateGeneration;
  }, [stateGeneration, activePairs.length]);

  if (activePairs.length === 0) return null;

  // Resolve pairs to actual objects
  const validPairs = activePairs.filter((p) => {
    const from = objects[p.fromId];
    const to = objects[p.toId];
    return (
      from &&
      to &&
      (from.type === "swatch" || from.type === "ramp") &&
      (to.type === "swatch" || to.type === "ramp")
    );
  });

  if (validPairs.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9997,
        opacity,
        transition: "opacity 0.3s ease",
      }}
    >
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
        }}
      >
        {validPairs.map((pair, i) => (
          <GhostLine
            key={`${pair.fromId}-${pair.toId}-${i}`}
            fromObj={objects[pair.fromId] as Swatch | Ramp}
            toObj={objects[pair.toId] as Swatch | Ramp}
            camera={camera}
            darkMode={darkMode}
          />
        ))}
      </svg>
    </div>
  );
}
