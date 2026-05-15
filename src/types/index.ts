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

export type ColorGamut = "srgb" | "display-p3";
export type TargetGamut = ColorGamut | "dual";
export type RampFallbackPolicy = "none" | "map-target-to-srgb";

export type RampSeedExactness =
  | "source-exact"
  | "target-exact"
  | "target-mapped"
  | "fallback-mapped"
  | "unanchored";

export interface RampSeedDelta {
  source: number;
  target: number;
  fallback?: number;
}

export interface RampSolveMetadata {
  solver: string;
  targetGamut: TargetGamut;
  fallbackGamut?: ColorGamut;
  fallbackPolicy: RampFallbackPolicy;
  seedIndex: number;
  seedLabel: string;
  seedFraction: number;
  exactness: RampSeedExactness;
  seedDelta: RampSeedDelta;
  sourceSeed: OklchColor;
  targetSeed: OklchColor;
  fallbackSeed?: OklchColor;
}

export interface RampSolveResult {
  stops: RampStop[];
  fallbackStops?: RampStop[];
  metadata: RampSolveMetadata;
}

export interface Ramp {
  id: string;
  type: "ramp";
  seedHue: number;
  stops: RampStop[];
  fallbackStops?: RampStop[];
  solveMetadata?: RampSolveMetadata;
  targetGamut?: TargetGamut;
  stopCount: number; // 3, 5, 7, 9, 11, 13, or custom
  position: Point;
  name: string; // auto-generated or custom
  customName?: boolean; // true if user renamed
  locked?: boolean;
  mode: "opinionated" | "pure";
  seedChroma?: number; // preserved from promotion for ramp regeneration fidelity
  seedLightness?: number;
}

export interface Connection {
  id: string;
  type: "connection";
  fromId: string; // swatch or ramp stop
  fromStopIndex?: number; // if connecting to a ramp stop
  toId: string;
  toStopIndex?: number;
}

export interface ExtractionMarker {
  id: string;
  swatchId: string;
  position: Point; // normalized 0..1, relative to the image
  color: OklchColor; // last sampled source-pixel color (provenance; not used for render)
}

export interface ImageExtraction {
  markers: ExtractionMarker[];
  createdAt: number;
  updatedAt: number;
}

export interface LocalImageHandle {
  kind: "local";
  blobId: string;
  renderUrl?: string;
}

export interface RemoteImageHandle {
  kind: "remote";
  assetId: string;
  renderUrl?: string;
  expiresAt?: number;
}

export type ImageHandle = LocalImageHandle | RemoteImageHandle;

export interface ReferenceImage {
  id: string;
  type: "reference-image";
  /**
   * Legacy/runtime render URL. Local boards hydrate this from IndexedDB; cloud
   * boards should prefer `imageHandle.renderUrl` from a signed asset URL.
   */
  dataUrl?: string;
  renderUrl?: string;
  assetId?: string;
  imageHandle?: ImageHandle;
  position: Point;
  size: Size;
  extraction?: ImageExtraction;
  source?: ReferenceImageSource;
}

export interface Note {
  id: string;
  type: "note";
  text: string;
  position: Point;
}

export type CanvasObject = Swatch | Ramp | Connection | ReferenceImage | Note;

export interface ReferenceImageSource {
  provider: "arena";
  blockId: number;
  channelId?: number;
  channelSlug?: string;
  channelTitle?: string;
  title?: string;
  url?: string;
  assetUrl?: string;
  importedAt: number;
}

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
  lightMode: boolean;
  showConnections: boolean;
}

// ---- Ramp Generation Config ----

export type StopPreset = 3 | 5 | 7 | 9 | 11 | 13;

export interface RampConfig {
  hue: number;
  stopCount: StopPreset | number;
  mode: "opinionated" | "pure";
  /** Target gamut for generation and exactness metadata. Defaults to dual P3 + sRGB fallback. */
  targetGamut?: TargetGamut;
  /** Seed chroma level. If < 0.05, generates a neutral ramp. */
  seedChroma?: number;
  /** Original seed color lightness — used to calibrate the chroma curve. */
  seedLightness?: number;
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

// ---- Boards ----

export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// ---- Canvas Actions ----

export type Action =
  // Object creation
  | { type: "CREATE_SWATCH"; position: Point; color?: OklchColor; id?: string }
  | {
      type: "CREATE_SWATCHES";
      swatches: { position: Point; color: OklchColor; id?: string }[];
      preserveColors?: boolean;
    }
  | {
      type: "ADD_REFERENCE_IMAGE";
      id?: string;
      dataUrl: string;
      position: Point;
      size: { width: number; height: number };
      source?: ReferenceImageSource;
    }
  | {
      type: "ADD_REFERENCE_IMAGES";
      images: {
        id?: string;
        dataUrl: string;
        position: Point;
        size: { width: number; height: number };
        source?: ReferenceImageSource;
      }[];
    }
  | { type: "CREATE_NOTE"; id?: string; position: Point; text?: string }
  | { type: "UPDATE_NOTE_TEXT"; id: string; text: string }

  // Selection
  | { type: "SELECT"; id: string; additive?: boolean }
  | { type: "SELECT_IDS"; ids: string[]; additive?: boolean }
  | { type: "SELECT_ALL" }
  | { type: "DESELECT_ALL" }

  // Deletion
  | { type: "DELETE_SELECTED" }
  | { type: "DELETE_OBJECTS"; ids: string[] }

  // Movement
  | { type: "MOVE_OBJECT"; id: string; position: Point }
  | { type: "MOVE_SELECTED"; dx: number; dy: number }

  // Color modification
  | { type: "UPDATE_SWATCH_COLOR"; id: string; color: OklchColor }
  | { type: "ADJUST_SWATCH_COLOR"; id: string; dl: number; dc: number }
  | { type: "ROTATE_HUE"; id: string; delta: number }

  // Ramp operations
  | { type: "PROMOTE_TO_RAMP"; id: string; stopCount: number }
  | { type: "CHANGE_STOP_COUNT"; id: string; delta: number }
  | { type: "RENAME_RAMP"; id: string; name: string }
  | { type: "REMOVE_RAMP_STOP"; id: string; stopIndex: number }

  // Harmonization
  | {
      type: "HARMONIZE_SELECTED";
      adjustments: { id: string; newHue: number; newId?: string }[];
      placement: Point;
      replaceIds?: string[];
    }

  // Connections
  | { type: "CREATE_CONNECTION" }
  | { type: "CONNECT_OBJECTS"; ids: string[] }
  | { type: "TOGGLE_CONNECTIONS" }

  // Lock
  | { type: "TOGGLE_LOCK_SELECTED" }
  | { type: "SET_LOCK"; ids: string[]; locked: boolean }

  // Camera & display
  | { type: "SET_CAMERA"; camera: Camera }
  | { type: "TOGGLE_LIGHT_MODE" }

  // Duplication
  | { type: "DUPLICATE_SELECTED"; idMap?: Record<string, string> }

  // Extraction markers
  | {
      type: "CREATE_EXTRACTION";
      imageId: string;
      samples: {
        id?: string;
        color: OklchColor;
        source: Point; // normalized 0..1 — marker position
        position: Point; // canvas position — swatch placement
      }[];
    }
  | {
      type: "MOVE_EXTRACTION_MARKER";
      imageId: string;
      markerId: string;
      position: Point; // normalized 0..1
      color: OklchColor;
    }
  | { type: "CLEAR_IMAGE_EXTRACTION"; imageId: string }

  // State management
  | { type: "RESTORE_IMAGE_URLS"; urls: Record<string, string> }
  | { type: "LOAD_STATE"; state: CanvasState }
  | { type: "LOAD_BOARD"; state: CanvasState }
  | { type: "SNAPSHOT" };

// ---- Contrast ----

export interface ContrastResult {
  ratio: number;
  passesAA: boolean; // >= 4.5:1
  passesAALarge: boolean; // >= 3:1
}
