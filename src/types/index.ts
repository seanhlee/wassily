// ---- Canvas Object Types ----

export interface OklchColor {
  l: number; // 0-1
  c: number; // 0-~0.4
  h: number; // 0-360
}

export interface Swatch {
  id: string;
  type: "swatch";
  color: OklchColor; // purified color
  originalColor?: OklchColor; // pre-purification (for visual beat)
  position: Point;
  name?: string; // custom override
  locked?: boolean; // hue locked for harmonization
}

export interface RampStop {
  index: number; // 0-based
  label: string; // "50", "100", ..., "950"
  color: OklchColor;
  darkColor: OklchColor; // dark mode variant
}

export interface Ramp {
  id: string;
  type: "ramp";
  seedHue: number;
  stops: RampStop[];
  stopCount: number; // 3, 5, 7, 9, 11, or custom
  position: Point;
  name: string; // auto-generated or custom
  customName?: boolean; // true if user renamed
  locked?: boolean;
  mode: "opinionated" | "pure";
}

export interface Connection {
  id: string;
  type: "connection";
  fromId: string; // swatch or ramp stop
  fromStopIndex?: number; // if connecting to a ramp stop
  toId: string;
  toStopIndex?: number;
}

export interface ReferenceImage {
  id: string;
  type: "reference-image";
  dataUrl: string; // base64
  position: Point;
  size: Size;
}

export type CanvasObject = Swatch | Ramp | Connection | ReferenceImage;

// ---- Geometry ----

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

// ---- Canvas State ----

export interface CanvasState {
  objects: Record<string, CanvasObject>;
  selectedIds: string[];
  camera: Camera;
  darkMode: boolean;
}

// ---- Ramp Generation Config ----

export type StopPreset = 3 | 5 | 7 | 9 | 11;

export interface RampConfig {
  hue: number;
  stopCount: StopPreset | number;
  mode: "opinionated" | "pure";
  /** Seed chroma level (0-1 scale of gamut max). If < 0.05, generates a neutral ramp. */
  seedChroma?: number;
}

// ---- Harmonization ----

export type HarmonicRelationship =
  | "analogous" // 30°
  | "tetradic" // 90°
  | "triadic" // 120°
  | "split-complementary" // 150°
  | "complementary"; // 180°

export interface HarmonizationResult {
  relationship: HarmonicRelationship;
  angle: number;
  adjustments: { id: string; originalHue: number; newHue: number }[];
  totalDisplacement: number;
}

// ---- Export ----

export type ExportFormat = "css" | "css-dark" | "tailwind" | "hex" | "json";

// ---- Contrast ----

export interface ContrastResult {
  ratio: number;
  passesAA: boolean; // >= 4.5:1
  passesAALarge: boolean; // >= 3:1
}
