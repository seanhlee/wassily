/**
 * Wassily MCP Tools
 *
 * All tool definitions in one file. Each wraps pure functions from src/engine/.
 * Imports ONLY through the barrel at src/engine/index.ts (never direct files).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  purify,
  purifyColor,
  parseColor,
  toHex,
  clampToGamut,
  isInGamut,
  solveRamp,
  nameForHue,
  checkContrast,
  harmonizePair,
  harmonizeMultiple,
  WHITE,
  BLACK,
} from "../src/engine/index.js";
import { RAMP_STOP_PRESETS } from "../src/constants.js";
import type {
  OklchColor,
  Swatch,
  Ramp,
  RampStop,
  CanvasState,
  StopPreset,
  Action,
  ReferenceImage,
  TargetGamut,
} from "../src/types/index.js";

// ---- Helpers ----

const NEUTRAL_CHROMA = 0.05;

function isStopPreset(n: number): n is StopPreset {
  return (RAMP_STOP_PRESETS as readonly number[]).includes(n);
}

export function stopCountDeltaForTarget(current: number, target: StopPreset): number {
  const targetIdx = RAMP_STOP_PRESETS.indexOf(target);
  const currentIdx = RAMP_STOP_PRESETS.indexOf(current as StopPreset);
  if (currentIdx !== -1) return targetIdx - currentIdx;

  // CHANGE_STOP_COUNT snaps non-preset counts directionally. Mirror that
  // virtual index so MCP lands on, and reports, the requested preset.
  if (target > current) {
    const firstAboveIdx = RAMP_STOP_PRESETS.findIndex((preset) => preset > current);
    const reducerBaseIdx =
      firstAboveIdx === -1 ? RAMP_STOP_PRESETS.length - 1 : firstAboveIdx - 1;
    return targetIdx - reducerBaseIdx;
  }

  let lastBelowIdx = -1;
  for (let i = RAMP_STOP_PRESETS.length - 1; i >= 0; i--) {
    if (RAMP_STOP_PRESETS[i] < current) {
      lastBelowIdx = i;
      break;
    }
  }
  const reducerBaseIdx = lastBelowIdx === -1 ? 0 : lastBelowIdx + 1;
  return targetIdx - reducerBaseIdx;
}

function formatOklch(c: OklchColor): string {
  return `oklch(${c.l.toFixed(3)} ${c.c.toFixed(3)} ${c.h.toFixed(1)})`;
}

function colorForSrgbExport(color: OklchColor): OklchColor {
  return clampToGamut(color);
}

function hexForSrgbExport(color: OklchColor): string {
  return toHex(colorForSrgbExport(color));
}

function json(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function error(msg: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopToRecord(stop: RampStop, fallbackStop?: RampStop) {
  const lightSrgb = fallbackStop?.color ?? colorForSrgbExport(stop.color);
  const darkSrgb = fallbackStop?.darkColor ?? colorForSrgbExport(stop.darkColor);

  return {
    index: stop.index,
    label: stop.label,
    hex: toHex(lightSrgb),
    darkHex: toHex(darkSrgb),
    oklch: formatOklch(stop.color),
    darkOklch: formatOklch(stop.darkColor),
    ...(fallbackStop === undefined
      ? {}
      : {
          fallbackHex: toHex(fallbackStop.color),
          fallbackDarkHex: toHex(fallbackStop.darkColor),
          fallbackOklch: formatOklch(fallbackStop.color),
          fallbackDarkOklch: formatOklch(fallbackStop.darkColor),
        }),
    l: +stop.color.l.toFixed(3),
    c: +stop.color.c.toFixed(3),
    h: +stop.color.h.toFixed(1),
  };
}

// ---- State helpers ----

function parseCanvasState(stateJson: string): CanvasState | null {
  try {
    const parsed = JSON.parse(stateJson);
    if (parsed && typeof parsed === "object" && typeof parsed.objects === "object") {
      return parsed as CanvasState;
    }
    return null;
  } catch {
    return null;
  }
}

function extractRamps(state: CanvasState): Ramp[] {
  return Object.values(state.objects).filter((o): o is Ramp => o.type === "ramp");
}

function extractSwatches(state: CanvasState): Swatch[] {
  return Object.values(state.objects).filter((o): o is Swatch => o.type === "swatch");
}

// ---- Export helpers ----

interface ColorProperty {
  rampName: string;
  stopLabel: string;
  lightOklch: string;
  darkOklch: string;
  lightHex: string;
  darkHex: string;
}

function generateProperties(ramps: Ramp[]): ColorProperty[] {
  const props: ColorProperty[] = [];
  for (const ramp of ramps) {
    for (const stop of ramp.stops) {
      const fallbackStop = ramp.fallbackStops?.[stop.index];
      props.push({
        rampName: ramp.name.toLowerCase().replace(/\s+/g, "-"),
        stopLabel: stop.label,
        lightOklch: formatOklch(stop.color),
        darkOklch: formatOklch(stop.darkColor),
        lightHex: toHex(fallbackStop?.color ?? colorForSrgbExport(stop.color)),
        darkHex: toHex(fallbackStop?.darkColor ?? colorForSrgbExport(stop.darkColor)),
      });
    }
  }
  return props;
}

function formatTailwind(
  props: ColorProperty[],
  aliases?: Record<string, string>,
): string {
  const lines = ["@theme {"];
  for (const p of props) {
    lines.push(`  --color-${p.rampName}-${p.stopLabel}: ${p.lightOklch};`);
  }
  if (aliases) {
    lines.push("");
    lines.push("  /* Semantic aliases */");
    for (const [alias, value] of Object.entries(aliases)) {
      lines.push(`  --color-${alias}: var(--color-${value});`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

function formatCss(
  props: ColorProperty[],
  aliases?: Record<string, string>,
): string {
  const lines = [":root {"];
  for (const p of props) {
    lines.push(`  --${p.rampName}-${p.stopLabel}: ${p.lightOklch};`);
  }
  if (aliases) {
    lines.push("");
    for (const [alias, value] of Object.entries(aliases)) {
      lines.push(`  --${alias}: var(--${value});`);
    }
  }
  lines.push("}");
  lines.push("");
  lines.push("@media (prefers-color-scheme: dark) {");
  lines.push("  :root {");
  for (const p of props) {
    lines.push(`    --${p.rampName}-${p.stopLabel}: ${p.darkOklch};`);
  }
  lines.push("  }");
  lines.push("}");
  return lines.join("\n");
}

function formatTokens(props: ColorProperty[]): object {
  const tokens: Record<string, Record<string, unknown>> = {};
  for (const p of props) {
    if (!tokens[p.rampName]) tokens[p.rampName] = {};
    tokens[p.rampName][p.stopLabel] = {
      $value: p.lightHex,
      $type: "color",
      $extensions: {
        "com.wassily": {
          oklch: p.lightOklch,
          darkValue: p.darkHex,
          darkOklch: p.darkOklch,
        },
      },
    };
  }
  return tokens;
}

function formatFigma(ramps: Ramp[]): object {
  // Figma Variables REST API format (Enterprise only)
  const collections = ramps.map((ramp) => {
    const name = ramp.name;
    return {
      name,
      modes: [
        { name: "Light", modeId: "light" },
        { name: "Dark", modeId: "dark" },
      ],
      variables: ramp.stops.map((stop) => {
        const fallbackStop = ramp.fallbackStops?.[stop.index];
        const lightRgb = hexToRgbFloat(
          toHex(fallbackStop?.color ?? colorForSrgbExport(stop.color)),
        );
        const darkRgb = hexToRgbFloat(
          toHex(fallbackStop?.darkColor ?? colorForSrgbExport(stop.darkColor)),
        );
        return {
          name: `${name}/${stop.label}`,
          type: "COLOR",
          valuesByMode: {
            light: { r: lightRgb.r, g: lightRgb.g, b: lightRgb.b, a: 1 },
            dark: { r: darkRgb.r, g: darkRgb.g, b: darkRgb.b, a: 1 },
          },
        };
      }),
    };
  });

  return {
    _format: "figma-variables",
    _note: "Figma Variables REST API requires Enterprise plan. Use Tokens Studio plugin with 'tokens' format for free Figma import.",
    collections,
  };
}

function hexToRgbFloat(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

// ---- Bridge helpers ----

const VITE_URL = process.env.WASSILY_DEV_URL || "http://localhost:5173";

interface DispatchResult {
  success: boolean;
  created?: string[];
  deleted?: string[];
  error?: string;
}

interface BoardOpResult {
  success: boolean;
  [key: string]: unknown;
}

interface RampSuiteSeedInput {
  name: string;
  color: string;
}

interface RampSuiteSeedRecord {
  id: string;
  name: string;
  input: string;
  hex: string;
  oklch: string;
  inGamut: boolean;
  position: { x: number; y: number };
}

interface RampSuiteBuildResult {
  actions: Action[];
  created: RampSuiteSeedRecord[];
}

const TAILWIND_V4_500_SEEDS: readonly RampSuiteSeedInput[] = [
  { name: "tw-red-500", color: "oklch(63.7% 0.237 25.331)" },
  { name: "tw-orange-500", color: "oklch(70.5% 0.213 47.604)" },
  { name: "tw-amber-500", color: "oklch(76.9% 0.188 70.08)" },
  { name: "tw-yellow-500", color: "oklch(79.5% 0.184 86.047)" },
  { name: "tw-lime-500", color: "oklch(76.8% 0.233 130.85)" },
  { name: "tw-green-500", color: "oklch(72.3% 0.219 149.579)" },
  { name: "tw-emerald-500", color: "oklch(69.6% 0.17 162.48)" },
  { name: "tw-teal-500", color: "oklch(70.4% 0.14 182.503)" },
  { name: "tw-cyan-500", color: "oklch(71.5% 0.143 215.221)" },
  { name: "tw-sky-500", color: "oklch(68.5% 0.169 237.323)" },
  { name: "tw-blue-500", color: "oklch(62.3% 0.214 259.815)" },
  { name: "tw-indigo-500", color: "oklch(58.5% 0.233 277.117)" },
  { name: "tw-violet-500", color: "oklch(60.6% 0.25 292.717)" },
  { name: "tw-purple-500", color: "oklch(62.7% 0.265 303.9)" },
  { name: "tw-fuchsia-500", color: "oklch(66.7% 0.295 322.15)" },
  { name: "tw-pink-500", color: "oklch(65.6% 0.241 354.308)" },
  { name: "tw-rose-500", color: "oklch(64.5% 0.246 16.439)" },
  { name: "tw-slate-500", color: "oklch(55.4% 0.046 257.417)" },
  { name: "tw-gray-500", color: "oklch(55.1% 0.027 264.364)" },
  { name: "tw-zinc-500", color: "oklch(55.2% 0.016 285.938)" },
  { name: "tw-neutral-500", color: "oklch(55.6% 0 0)" },
  { name: "tw-stone-500", color: "oklch(55.3% 0.013 58.071)" },
  { name: "tw-mauve-500", color: "oklch(54.2% 0.034 322.5)" },
  { name: "tw-olive-500", color: "oklch(58% 0.031 107.3)" },
  { name: "tw-mist-500", color: "oklch(56% 0.021 213.5)" },
  { name: "tw-taupe-500", color: "oklch(54.7% 0.021 43.1)" },
];

export function buildRampSuiteActions(
  seeds: readonly RampSuiteSeedInput[],
  options: {
    stopCount: StopPreset;
    x: number;
    y: number;
    columns: number;
    rowGap: number;
    columnGap: number;
    preserveColors: boolean;
  },
): RampSuiteBuildResult | { error: string } {
  const parsed = seeds.map((seed) => {
    const color = parseColor(seed.color);
    return color ? { seed, color } : { seed, color: null };
  });
  const invalid = parsed.find((entry) => entry.color === null);
  if (invalid) {
    return {
      error: `Could not parse color for "${invalid.seed.name}": "${invalid.seed.color}"`,
    };
  }

  const columns = Math.max(1, Math.floor(options.columns));
  const swatches = parsed.map((entry, index) => {
    const color = entry.color!;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      id: crypto.randomUUID(),
      name: entry.seed.name,
      input: entry.seed.color,
      color,
      position: {
        x: options.x + column * options.columnGap,
        y: options.y + row * options.rowGap,
      },
    };
  });

  const createAction: Action = {
    type: "CREATE_SWATCHES",
    preserveColors: options.preserveColors,
    swatches: swatches.map((swatch) => ({
      id: swatch.id,
      color: swatch.color,
      position: swatch.position,
    })),
  };
  const promoteActions: Action[] = swatches.map((swatch) => ({
    type: "PROMOTE_TO_RAMP",
    id: swatch.id,
    stopCount: options.stopCount,
  }));
  const renameActions: Action[] = swatches.map((swatch) => ({
    type: "RENAME_RAMP",
    id: swatch.id,
    name: swatch.name,
  }));

  return {
    actions: [createAction, ...promoteActions, ...renameActions],
    created: swatches.map((swatch) => ({
      id: swatch.id,
      name: swatch.name,
      input: swatch.input,
      hex: hexForSrgbExport(swatch.color),
      oklch: formatOklch(swatch.color),
      inGamut: isInGamut(swatch.color),
      position: swatch.position,
    })),
  };
}

/** Fetch live canvas state from the Vite MCP bridge. Returns null if bridge unavailable. */
async function fetchLiveState(): Promise<CanvasState | null> {
  try {
    const res = await fetch(`${VITE_URL}/__mcp__/state`);
    if (!res.ok) return null;
    const data = (await res.json()) as { state: CanvasState };
    return data.state;
  } catch {
    return null;
  }
}

/** Fetch board list from the Vite MCP bridge. */
async function fetchBoards(): Promise<{ boards: { id: string; name: string; createdAt: number; updatedAt: number }[]; activeBoardId: string } | null> {
  try {
    const res = await fetch(`${VITE_URL}/__mcp__/boards`);
    if (!res.ok) return null;
    return (await res.json()) as { boards: { id: string; name: string; createdAt: number; updatedAt: number }[]; activeBoardId: string };
  } catch {
    return null;
  }
}

/** Dispatch actions to the canvas via the Vite MCP bridge. */
async function dispatchActions(actions: object[]): Promise<DispatchResult> {
  try {
    const res = await fetch(`${VITE_URL}/__mcp__/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    if (!res.ok) {
      const text = await res.text();
      try { return JSON.parse(text) as DispatchResult; } catch { return { success: false, error: text }; }
    }
    return (await res.json()) as DispatchResult;
  } catch (e) {
    return { success: false, error: `Bridge unavailable. Run 'npm run dev' and open Wassily in your browser. (${e})` };
  }
}

/** Send a board operation to the canvas via the Vite MCP bridge. */
async function boardOp(op: Record<string, unknown>): Promise<BoardOpResult> {
  try {
    const res = await fetch(`${VITE_URL}/__mcp__/board-op`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(op),
    });
    if (!res.ok) {
      const text = await res.text();
      try { return JSON.parse(text) as BoardOpResult; } catch { return { success: false, error: text }; }
    }
    return (await res.json()) as BoardOpResult;
  } catch (e) {
    return { success: false, error: `Bridge unavailable. (${e})` };
  }
}

/** Resolve canvas state: use live bridge state if available, fall back to provided state_json. */
async function resolveState(stateJson?: string): Promise<CanvasState | null> {
  const live = await fetchLiveState();
  if (live) return live;
  if (stateJson) return parseCanvasState(stateJson);
  return null;
}

/** Auto-place: find position for new objects, avoiding existing ones. */
function autoPlace(state: CanvasState, count: number): { x: number; y: number }[] {
  let maxRight = 0;
  let topY = 0;
  let hasObjects = false;
  for (const obj of Object.values(state.objects)) {
    if (obj.type === "connection") continue;
    const pos = (obj as Swatch | Ramp).position as { x: number; y: number };
    if (!pos) continue;
    const width =
      obj.type === "ramp"
        ? (obj as Ramp).stops.length * 48
        : obj.type === "reference-image"
          ? (obj as ReferenceImage).size.width
          : 48;
    if (pos.x + width > maxRight) {
      maxRight = pos.x + width;
      topY = pos.y;
    }
    hasObjects = true;
  }
  const startX = hasObjects ? maxRight + 80 : 100;
  const startY = hasObjects ? topY : 100;
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({ x: startX + i * 56, y: startY });
  }
  return positions;
}

async function createRampSuiteOnCanvas(
  seeds: readonly RampSuiteSeedInput[],
  options: {
    boardName?: string;
    stopCount: StopPreset;
    x?: number;
    y?: number;
    columns: number;
    rowGap: number;
    columnGap: number;
    preserveColors: boolean;
  },
) {
  let board: { id: unknown; name: string } | null = null;
  if (options.boardName) {
    const result = await boardOp({
      op: "create",
      name: options.boardName,
      andSwitch: true,
    });
    if (!result.success) return error(result.error as string);
    board = { id: result.id, name: options.boardName };
    // Let React apply the board switch before the next MCP dispatch arrives.
    await sleep(400);
  }

  const state = await fetchLiveState();
  const fallback = state ? autoPlace(state, 1)[0] : { x: 100, y: 100 };
  const built = buildRampSuiteActions(seeds, {
    stopCount: options.stopCount,
    x: options.x ?? fallback.x,
    y: options.y ?? fallback.y,
    columns: options.columns,
    rowGap: options.rowGap,
    columnGap: options.columnGap,
    preserveColors: options.preserveColors,
  });
  if ("error" in built) return error(built.error);

  const result = await dispatchActions(built.actions);
  if (!result.success) return error(result.error ?? "Failed to create ramp suite");

  const outOfGamut = built.created.filter((seed) => !seed.inGamut);
  return json({
    board,
    stopCount: options.stopCount,
    preserveColors: options.preserveColors,
    sourceSeedCount: built.created.length,
    outOfGamutSeedCount: outOfGamut.length,
    outOfGamutSeeds: outOfGamut.map((seed) => seed.name),
    createdRamps: built.created,
    caveat:
      "Source swatches are preserved exactly when preserveColors is true. The current opinionated ramp engine is sRGB-gamut-safe, so out-of-sRGB/P3 seeds may be chroma-compressed inside generated ramps.",
  });
}

// ---- Tool Registration ----

export function registerTools(server: McpServer): void {
  // 1. purify_color
  server.tool(
    "purify_color",
    "Purify any CSS color to its maximum chroma expression in OKLCH. Hue is preserved, chroma is maximized to the sRGB gamut boundary.",
    { color: z.string().describe("Any CSS color: hex (#e63946), rgb, oklch, hsl, or named color") },
    async ({ color }) => {
      const parsed = parseColor(color);
      if (!parsed) return error(`Could not parse color: "${color}"`);

      const result = purify(parsed);
      return json({
        hex: hexForSrgbExport(result.purified),
        oklch: formatOklch(result.purified),
        l: +result.purified.l.toFixed(3),
        c: +result.purified.c.toFixed(3),
        h: +result.purified.h.toFixed(1),
        chromaGain: +result.chromaGain.toFixed(3),
        lightnessShift: +result.lightnessShift.toFixed(3),
        original: {
          hex: hexForSrgbExport(result.original),
          oklch: formatOklch(result.original),
        },
      });
    },
  );

  // 2. parse_color
  server.tool(
    "parse_color",
    "Parse any CSS color string and convert to multiple formats. Returns hex, oklch, component values, gamut status, and neutral detection.",
    { color: z.string().describe("Any CSS color: hex, rgb, oklch, hsl, named, or bare hue number") },
    async ({ color }) => {
      const parsed = parseColor(color);
      if (!parsed) return error(`Could not parse color: "${color}"`);

      return json({
        hex: hexForSrgbExport(parsed),
        oklch: formatOklch(parsed),
        l: +parsed.l.toFixed(3),
        c: +parsed.c.toFixed(3),
        h: +parsed.h.toFixed(1),
        inGamut: isInGamut(parsed),
        isNeutral: parsed.c < NEUTRAL_CHROMA,
        name: nameForHue(parsed.h),
      });
    },
  );

  // 3. generate_ramp
  server.tool(
    "generate_ramp",
    "Generate a color ramp from a seed hue. Returns labeled stops (50-950) with light and dark mode variants. Uses Wassily's math-first brand-exact fairing engine with gamut-safe OKLCH output.",
    {
      hue: z.number().min(0).max(360).describe("Seed hue angle (0-360)"),
      stop_count: z
        .number()
        .refine(isStopPreset, {
          message: "Must be 3, 5, 7, 9, 11, or 13",
        })
        .describe("Number of stops: 3, 5, 7, 9, 11, or 13"),
      mode: z
        .enum(["opinionated", "pure"])
        .default("opinionated")
        .describe("'opinionated' uses math-first brand-exact fairing around the seed; 'pure' keeps hue constant"),
      seed_chroma: z
        .number()
        .min(0)
        .max(0.4)
        .optional()
        .describe("Seed chroma (0-0.4). Calibrates the ramp intensity. Omit for maximum."),
      seed_lightness: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Seed lightness (0-1). Used to calibrate chroma curve. Omit for default."),
      target_gamut: z
        .enum(["dual", "display-p3", "srgb"])
        .default("dual")
        .describe("Generation contract. 'dual' solves in Display P3 and includes sRGB fallback metadata."),
    },
    async ({ hue, stop_count, mode, seed_chroma, seed_lightness, target_gamut }) => {
      const targetGamut = target_gamut as TargetGamut;
      const solved = solveRamp({
        hue,
        stopCount: stop_count,
        mode,
        seedChroma: seed_chroma,
        seedLightness: seed_lightness,
        targetGamut,
      });

      return json({
        hue,
        name: nameForHue(hue),
        stopCount: stop_count,
        mode,
        targetGamut: solved.metadata.targetGamut,
        fallbackGamut: solved.metadata.fallbackGamut ?? null,
        fallbackPolicy: solved.metadata.fallbackPolicy,
        exactness: solved.metadata.exactness,
        seedDelta: solved.metadata.seedDelta,
        stops: solved.stops.map((stop, index) =>
          stopToRecord(stop, solved.fallbackStops?.[index]),
        ),
        fallbackStops: solved.fallbackStops?.map((stop) => stopToRecord(stop)),
      });
    },
  );

  // 4. check_contrast
  server.tool(
    "check_contrast",
    "Check WCAG 2.x contrast ratio between two colors. Also reports contrast of each color against pure white and black.",
    {
      color_a: z.string().describe("First color (any CSS format)"),
      color_b: z.string().describe("Second color (any CSS format)"),
    },
    async ({ color_a, color_b }) => {
      const a = parseColor(color_a);
      const b = parseColor(color_b);
      if (!a) return error(`Could not parse color_a: "${color_a}"`);
      if (!b) return error(`Could not parse color_b: "${color_b}"`);

      const result = checkContrast(a, b);
      const aVsWhite = checkContrast(a, WHITE);
      const aVsBlack = checkContrast(a, BLACK);
      const bVsWhite = checkContrast(b, WHITE);
      const bVsBlack = checkContrast(b, BLACK);

      return json({
        pair: {
          ratio: result.ratio,
          passesAA: result.passesAA,
          passesAALarge: result.passesAALarge,
        },
        color_a: {
          hex: hexForSrgbExport(a),
          vsWhite: aVsWhite,
          vsBlack: aVsBlack,
        },
        color_b: {
          hex: hexForSrgbExport(b),
          vsWhite: bVsWhite,
          vsBlack: bVsBlack,
        },
      });
    },
  );

  // 5. harmonize
  server.tool(
    "harmonize",
    "Find the nearest harmonic relationship for a set of hues and return the adjustments needed. Supports analogous (30°), tetradic (90°), triadic (120°), split-complementary (150°), and complementary (180°).",
    {
      hues: z
        .array(
          z.object({
            hue: z.number().min(0).max(360).describe("Hue angle"),
            locked: z.boolean().optional().describe("If true, this hue won't be adjusted"),
          }),
        )
        .min(2)
        .describe("Array of hues to harmonize (minimum 2)"),
      start_after: z
        .enum(["analogous", "tetradic", "triadic", "split-complementary", "complementary"])
        .optional()
        .describe("Start searching after this relationship (for cycling)"),
    },
    async ({ hues, start_after }) => {
      // Fabricate IDs for the engine
      const hueInputs = hues.map((h, i) => ({
        id: `h${i}`,
        hue: h.hue,
        locked: h.locked,
      }));

      const result =
        hues.length === 2
          ? harmonizePair(
              hues[0].hue,
              hues[1].hue,
              hues[0].locked ? "a" : hues[1].locked ? "b" : undefined,
              start_after,
            )
          : harmonizeMultiple(hueInputs, start_after);

      return json({
        relationship: result.relationship,
        angle: result.angle,
        totalDisplacement: +result.totalDisplacement.toFixed(1),
        adjustments: result.adjustments.map((adj, i) => ({
          index: i,
          originalHue: +adj.originalHue.toFixed(1),
          newHue: +adj.newHue.toFixed(1),
          delta: +(adj.newHue - adj.originalHue).toFixed(1),
          name: nameForHue(adj.newHue),
        })),
      });
    },
  );

  // 6. read_canvas
  server.tool(
    "read_canvas",
    "Parse Wassily canvas state and return a structured summary of all objects (swatches, ramps, connections). If state_json is omitted, reads live state from the running app.",
    {
      state_json: z.string().optional().describe("Canvas state JSON string (from localStorage or clipboard). If omitted, reads live state from the canvas."),
    },
    async ({ state_json }) => {
      const state = await resolveState(state_json);
      if (!state) return error("Canvas not connected and no state_json provided. Run 'npm run dev' and open Wassily, or pass state_json.");

      const swatches = extractSwatches(state);
      const ramps = extractRamps(state);
      const connections = Object.values(state.objects).filter(
        (o) => o.type === "connection",
      );

      return json({
        summary: {
          swatches: swatches.length,
          ramps: ramps.length,
          connections: connections.length,
          lightMode: state.lightMode,
        },
        swatches: swatches.map((s) => ({
          id: s.id,
          hex: hexForSrgbExport(s.color),
          oklch: formatOklch(s.color),
          name: s.name ?? nameForHue(s.color.h),
          locked: s.locked ?? false,
          position: s.position,
        })),
        ramps: ramps.map((r) => ({
          id: r.id,
          name: r.name,
          customName: r.customName ?? false,
          seedHue: r.seedHue,
          targetGamut: r.targetGamut,
          fallbackPolicy: r.solveMetadata?.fallbackPolicy,
          exactness: r.solveMetadata?.exactness,
          stopCount: r.stopCount,
          mode: r.mode,
          locked: r.locked ?? false,
          position: r.position,
          stops: r.stops.map((stop) => stopToRecord(stop, r.fallbackStops?.[stop.index])),
        })),
      });
    },
  );

  // 7. export_palette
  server.tool(
    "export_palette",
    "Export ramps from canvas state to production formats. Supports Tailwind v4 (@theme), CSS custom properties, W3C Design Tokens (DTCG), and Figma Variables JSON. If state_json is omitted, reads live state from the running app.",
    {
      state_json: z.string().optional().describe("Canvas state JSON string. If omitted, reads live state from the canvas."),
      format: z
        .enum(["tailwind", "css", "tokens", "figma"])
        .describe("Output format: tailwind (v4 @theme), css (:root vars), tokens (DTCG .tokens.json), figma (Variables JSON)"),
      semantic_aliases: z
        .record(z.string(), z.string())
        .optional()
        .describe('Semantic alias mapping, e.g. {"primary": "blue-500", "surface": "gray-50"}'),
    },
    async ({ state_json, format, semantic_aliases }) => {
      const state = await resolveState(state_json);
      if (!state) return error("Canvas not connected and no state_json provided. Run 'npm run dev' and open Wassily, or pass state_json.");

      const ramps = extractRamps(state);
      if (ramps.length === 0) return error("No ramps found in canvas state. Promote swatches to ramps first (R key).");

      const props = generateProperties(ramps);

      let output: string | object;
      switch (format) {
        case "tailwind":
          output = formatTailwind(props, semantic_aliases);
          break;
        case "css":
          output = formatCss(props, semantic_aliases);
          break;
        case "tokens":
          output = formatTokens(props);
          break;
        case "figma":
          output = formatFigma(ramps);
          break;
      }

      const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      return { content: [{ type: "text" as const, text }] };
    },
  );

  // 8. audit_accessibility
  server.tool(
    "audit_accessibility",
    "Audit all ramp colors in canvas state for WCAG 2.x contrast compliance against white and black backgrounds. Optionally check cross-palette contrast between all color pairs. If state_json is omitted, reads live state from the running app.",
    {
      state_json: z.string().optional().describe("Canvas state JSON string. If omitted, reads live state from the canvas."),
      include_cross_palette: z
        .boolean()
        .default(false)
        .describe("Include contrast between every pair of colors (can be large)"),
    },
    async ({ state_json, include_cross_palette }) => {
      const state = await resolveState(state_json);
      if (!state) return error("Canvas not connected and no state_json provided. Run 'npm run dev' and open Wassily, or pass state_json.");

      const ramps = extractRamps(state);
      if (ramps.length === 0) return error("No ramps found in canvas state.");

      // Collect all unique colors from ramp stops
      const colors: { hex: string; name: string; color: OklchColor }[] = [];
      for (const ramp of ramps) {
        for (const stop of ramp.stops) {
          colors.push({
            hex: hexForSrgbExport(stop.color),
            name: `${ramp.name}/${stop.label}`,
            color: stop.color,
          });
        }
      }

      // Audit each color vs white and black
      const audit = colors.map((c) => {
        const vsWhite = checkContrast(c.color, WHITE);
        const vsBlack = checkContrast(c.color, BLACK);
        return {
          name: c.name,
          hex: c.hex,
          oklch: formatOklch(c.color),
          vsWhite: { ...vsWhite },
          vsBlack: { ...vsBlack },
        };
      });

      const result: Record<string, unknown> = {
        totalColors: colors.length,
        colors: audit,
      };

      // Cross-palette comparison
      if (include_cross_palette) {
        const pairs: unknown[] = [];
        for (let i = 0; i < colors.length; i++) {
          for (let j = i + 1; j < colors.length; j++) {
            const cr = checkContrast(colors[i].color, colors[j].color);
            pairs.push({
              a: colors[i].name,
              b: colors[j].name,
              ...cr,
            });
          }
        }
        result.crossPalette = pairs;
      }

      return json(result);
    },
  );

  // ---- Board Tools ----

  // 9. list_boards
  server.tool(
    "list_boards",
    "List all boards in the Wassily workspace with their names and metadata.",
    {},
    async () => {
      const result = await fetchBoards();
      if (!result) return error("Bridge unavailable. Run 'npm run dev' and open Wassily in your browser.");
      return json(result);
    },
  );

  // 10. create_board
  server.tool(
    "create_board",
    "Create a new empty board in the Wassily workspace.",
    { name: z.string().describe("Name for the new board") },
    async ({ name }) => {
      const result = await boardOp({ op: "create", name });
      if (!result.success) return error(result.error as string);
      return json(result);
    },
  );

  // 11. switch_board
  server.tool(
    "switch_board",
    "Switch the active board in the Wassily canvas. Saves current board and loads the target.",
    { board_id: z.string().describe("ID of the board to switch to") },
    async ({ board_id }) => {
      const result = await boardOp({ op: "switch", boardId: board_id });
      if (!result.success) return error(result.error as string);
      return json(result);
    },
  );

  // 12. delete_board
  server.tool(
    "delete_board",
    "Delete a board from the Wassily workspace. If it's the active board, switches to another first.",
    { board_id: z.string().describe("ID of the board to delete") },
    async ({ board_id }) => {
      const result = await boardOp({ op: "delete", boardId: board_id });
      if (!result.success) return error(result.error as string);
      return json(result);
    },
  );

  // 13. rename_board
  server.tool(
    "rename_board",
    "Rename a board in the Wassily workspace.",
    {
      board_id: z.string().describe("ID of the board to rename"),
      name: z.string().describe("New name"),
    },
    async ({ board_id, name }) => {
      const result = await boardOp({ op: "rename", boardId: board_id, name });
      if (!result.success) return error(result.error as string);
      return json(result);
    },
  );

  // ---- Canvas Write Tools ----

  // 14. create_swatch
  server.tool(
    "create_swatch",
    "Create a color swatch on the canvas. Color is purified to max chroma. Position auto-calculated if omitted.",
    {
      color: z.string().optional().describe("CSS color (hex, rgb, oklch, hsl, named). Random if omitted."),
      x: z.number().optional().describe("Canvas X position. Auto-placed if omitted."),
      y: z.number().optional().describe("Canvas Y position. Auto-placed if omitted."),
    },
    async ({ color, x, y }) => {
      let parsedColor: OklchColor | undefined;
      if (color) {
        const c = parseColor(color);
        if (!c) return error(`Could not parse color: "${color}"`);
        parsedColor = c;
      }

      let position: { x: number; y: number };
      if (x !== undefined && y !== undefined) {
        position = { x, y };
      } else {
        const state = await fetchLiveState();
        if (state) {
          position = autoPlace(state, 1)[0];
        } else {
          position = { x: x ?? 100, y: y ?? 100 };
        }
      }

      const id = crypto.randomUUID();
      const action: Action = { type: "CREATE_SWATCH", id, position, color: parsedColor };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to create swatch");

      return json({
        id,
        hex: parsedColor ? hexForSrgbExport(parsedColor) : "(random - purified on canvas)",
        oklch: parsedColor ? formatOklch(parsedColor) : "(random)",
        position,
      });
    },
  );

  // 15. create_swatches
  server.tool(
    "create_swatches",
    "Create multiple swatches at once. Colors are purified by default unless preserve_colors is true. Auto-placed in a horizontal row if positions omitted.",
    {
      colors: z.array(z.string()).min(1).describe("Array of CSS colors"),
      x: z.number().optional().describe("Starting X position. Auto-placed if omitted."),
      y: z.number().optional().describe("Starting Y position. Auto-placed if omitted."),
      preserve_colors: z
        .boolean()
        .default(false)
        .describe("Keep parsed source colors exactly instead of purifying chromatic colors."),
    },
    async ({ colors, x, y, preserve_colors }) => {
      const parsed: OklchColor[] = [];
      for (const c of colors) {
        const p = parseColor(c);
        if (!p) return error(`Could not parse color: "${c}"`);
        parsed.push(p);
      }

      let positions: { x: number; y: number }[];
      if (x !== undefined && y !== undefined) {
        positions = parsed.map((_, i) => ({ x: x + i * 56, y }));
      } else {
        const state = await fetchLiveState();
        if (state) {
          positions = autoPlace(state, parsed.length);
        } else {
          positions = parsed.map((_, i) => ({ x: 100 + i * 56, y: 100 }));
        }
      }

      const swatches = parsed.map((color, i) => ({
        id: crypto.randomUUID(),
        position: positions[i],
        color,
      }));
      const reportedColors = parsed.map((color) =>
        preserve_colors || color.c < NEUTRAL_CHROMA ? color : purifyColor(color),
      );

      const action: Action = {
        type: "CREATE_SWATCHES",
        swatches,
        preserveColors: preserve_colors,
      };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to create swatches");

      return json({
        preserveColors: preserve_colors,
        created: swatches.map((s, index) => ({
          id: s.id,
          hex: hexForSrgbExport(reportedColors[index]),
          oklch: formatOklch(reportedColors[index]),
          inGamut: isInGamut(reportedColors[index]),
          position: s.position,
        })),
      });
    },
  );

  server.tool(
    "create_ramp_suite",
    "Create a named suite of source-exact swatches, promote each one to a ramp, and rename each ramp. Useful for visual audits and reference-corpus comparisons.",
    {
      seeds: z
        .array(
          z.object({
            name: z.string().min(1).describe("Ramp name, e.g. tw-orange-500"),
            color: z.string().min(1).describe("CSS color seed: hex, rgb, hsl, oklch, etc."),
          }),
        )
        .min(1)
        .describe("Named source colors to turn into ramps."),
      board_name: z
        .string()
        .optional()
        .describe("If provided, creates and switches to a new board before placing the suite."),
      stop_count: z
        .number()
        .refine(isStopPreset, {
          message: "Must be 3, 5, 7, 9, 11, or 13",
        })
        .default(11)
        .describe("Number of stops per ramp."),
      preserve_colors: z
        .boolean()
        .default(true)
        .describe("Keep source swatches exact before promotion. Recommended for reference audits."),
      x: z.number().optional().describe("Starting X position. Auto-placed if omitted."),
      y: z.number().optional().describe("Starting Y position. Auto-placed if omitted."),
      columns: z
        .number()
        .int()
        .min(1)
        .max(6)
        .default(1)
        .describe("Number of columns in the placed suite."),
      row_gap: z.number().min(56).default(92).describe("Vertical spacing between ramps."),
      column_gap: z.number().min(560).default(640).describe("Horizontal spacing between columns."),
    },
    async ({
      seeds,
      board_name,
      stop_count,
      preserve_colors,
      x,
      y,
      columns,
      row_gap,
      column_gap,
    }) =>
      createRampSuiteOnCanvas(seeds, {
        boardName: board_name,
        stopCount: stop_count,
        preserveColors: preserve_colors,
        x,
        y,
        columns,
        rowGap: row_gap,
        columnGap: column_gap,
      }),
  );

  server.tool(
    "create_tailwind_v4_500_suite",
    "Create a visual audit board containing ramps generated from every Tailwind CSS v4.3.0 default 500 color.",
    {
      board_name: z
        .string()
        .default("Tailwind v4 500 audit")
        .describe("New board name. Creates and switches to this board before placing the suite."),
      stop_count: z
        .number()
        .refine(isStopPreset, {
          message: "Must be 3, 5, 7, 9, 11, or 13",
        })
        .default(11)
        .describe("Number of stops per ramp."),
      preserve_colors: z
        .boolean()
        .default(true)
        .describe("Keep Tailwind source swatches exact before promotion."),
      x: z.number().default(100).describe("Starting X position."),
      y: z.number().default(100).describe("Starting Y position."),
      columns: z
        .number()
        .int()
        .min(1)
        .max(6)
        .default(1)
        .describe("Number of columns in the placed suite."),
      row_gap: z.number().min(56).default(92).describe("Vertical spacing between ramps."),
      column_gap: z.number().min(560).default(640).describe("Horizontal spacing between columns."),
    },
    async ({
      board_name,
      stop_count,
      preserve_colors,
      x,
      y,
      columns,
      row_gap,
      column_gap,
    }) =>
      createRampSuiteOnCanvas(TAILWIND_V4_500_SEEDS, {
        boardName: board_name,
        stopCount: stop_count,
        preserveColors: preserve_colors,
        x,
        y,
        columns,
        rowGap: row_gap,
        columnGap: column_gap,
      }),
  );

  // 16. delete_objects
  server.tool(
    "delete_objects",
    "Delete objects from the canvas by ID. Also removes any connections referencing deleted objects.",
    { ids: z.array(z.string()).min(1).describe("Object IDs to delete") },
    async ({ ids }) => {
      const action: Action = { type: "DELETE_OBJECTS", ids };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to delete objects");
      return json({ deleted: ids });
    },
  );

  // 17. update_swatch_color
  server.tool(
    "update_swatch_color",
    "Change a swatch's color. The new color is purified to max chroma (unless neutral).",
    {
      id: z.string().describe("Swatch ID"),
      color: z.string().describe("New CSS color"),
    },
    async ({ id, color }) => {
      const parsed = parseColor(color);
      if (!parsed) return error(`Could not parse color: "${color}"`);

      const purified = parsed.c >= NEUTRAL_CHROMA ? purifyColor(parsed) : parsed;

      // Try to get old color for reporting
      let oldInfo: { hex: string; oklch: string } | undefined;
      const state = await fetchLiveState();
      if (state && state.objects[id] && state.objects[id].type === "swatch") {
        const old = (state.objects[id] as Swatch).color;
        oldInfo = { hex: hexForSrgbExport(old), oklch: formatOklch(old) };
      }

      const action: Action = { type: "UPDATE_SWATCH_COLOR", id, color: purified };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to update swatch color");

      return json({
        id,
        old: oldInfo ?? null,
        new: { hex: hexForSrgbExport(purified), oklch: formatOklch(purified) },
      });
    },
  );

  // 18. promote_to_ramp
  server.tool(
    "promote_to_ramp",
    "Promote a swatch to a full color ramp. Generates stops from 50-950.",
    {
      id: z.string().describe("Swatch ID to promote"),
      stop_count: z
        .number()
        .refine(isStopPreset, {
          message: "Must be 3, 5, 7, 9, 11, or 13",
        })
        .default(11)
        .describe("Number of stops (3, 5, 7, 9, 11, or 13). Default 11."),
    },
    async ({ id, stop_count }) => {
      const action: Action = { type: "PROMOTE_TO_RAMP", id, stopCount: stop_count };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to promote to ramp");
      return json({ id, promoted: true, stopCount: stop_count });
    },
  );

  // 19. set_stop_count
  server.tool(
    "set_stop_count",
    "Set the number of stops on a ramp.",
    {
      id: z.string().describe("Ramp ID"),
      stop_count: z
        .number()
        .refine(isStopPreset, {
          message: "Must be 3, 5, 7, 9, 11, or 13",
        })
        .describe("Target number of stops (3, 5, 7, 9, 11, or 13)"),
    },
    async ({ id, stop_count }) => {
      const state = await fetchLiveState();
      if (!state) return error("Bridge unavailable. Run 'npm run dev' and open Wassily in your browser.");
      const obj = state.objects[id];
      if (!obj || obj.type !== "ramp") return error(`Object "${id}" is not a ramp`);
      const current = (obj as Ramp).stopCount;
      if (current === stop_count) return json({ id, stopCount: current, message: "Already at requested stop count" });
      const delta = stopCountDeltaForTarget(current, stop_count);

      const action: Action = { type: "CHANGE_STOP_COUNT", id, delta };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to change stop count");

      const nextState = await fetchLiveState();
      const nextObj = nextState?.objects[id];
      const appliedStopCount =
        nextObj?.type === "ramp" ? (nextObj as Ramp).stopCount : stop_count;
      if (appliedStopCount !== stop_count) {
        return error(`Failed to change stop count to ${stop_count}; applied ${appliedStopCount}`);
      }
      return json({ id, previous: current, stopCount: appliedStopCount });
    },
  );

  // 20. rename_ramp
  server.tool(
    "rename_ramp",
    "Set a custom name for a ramp.",
    {
      id: z.string().describe("Ramp ID"),
      name: z.string().describe("New name for the ramp"),
    },
    async ({ id, name }) => {
      const action: Action = { type: "RENAME_RAMP", id, name };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to rename ramp");
      return json({ id, name });
    },
  );

  // 21. harmonize_objects
  server.tool(
    "harmonize_objects",
    "Harmonize selected objects to the nearest harmonic relationship. Adjusts hues of referenced objects in place.",
    {
      ids: z.array(z.string()).min(2).describe("Object IDs to harmonize (swatches or ramps)"),
      start_after: z
        .enum(["analogous", "tetradic", "triadic", "split-complementary", "complementary"])
        .optional()
        .describe("Start searching after this relationship (for cycling)"),
    },
    async ({ ids, start_after }) => {
      const state = await fetchLiveState();
      if (!state) return error("Bridge unavailable. Run 'npm run dev' and open Wassily in your browser.");

      // Extract hues from referenced objects
      const hueInputs: { id: string; hue: number; locked?: boolean }[] = [];
      for (const id of ids) {
        const obj = state.objects[id];
        if (!obj) return error(`Object "${id}" not found`);
        if (obj.type === "swatch") {
          hueInputs.push({ id, hue: (obj as Swatch).color.h, locked: (obj as Swatch).locked });
        } else if (obj.type === "ramp") {
          hueInputs.push({ id, hue: (obj as Ramp).seedHue, locked: (obj as Ramp).locked });
        } else {
          return error(`Object "${id}" is not a swatch or ramp`);
        }
      }

      // Compute harmonization
      const result =
        hueInputs.length === 2
          ? harmonizePair(
              hueInputs[0].hue,
              hueInputs[1].hue,
              hueInputs[0].locked ? "a" : hueInputs[1].locked ? "b" : undefined,
              start_after,
            )
          : harmonizeMultiple(hueInputs, start_after);

      // Build adjustments with IDs mapped
      const adjustments = result.adjustments.map((adj, i) => ({
        id: ids[i],
        newHue: adj.newHue,
      }));

      // Find placement to the right of all referenced objects
      let maxX = 0;
      let baseY = 0;
      for (const id of ids) {
        const obj = state.objects[id];
        if (obj && obj.type !== "connection") {
          const pos = (obj as Swatch | Ramp).position;
          if (pos && pos.x > maxX) {
            maxX = pos.x;
            baseY = pos.y;
          }
        }
      }
      const placement = { x: maxX + 120, y: baseY };

      const action: Action = { type: "HARMONIZE_SELECTED", adjustments, placement };
      const dispatchResult = await dispatchActions([action]);
      if (!dispatchResult.success) return error(dispatchResult.error ?? "Failed to harmonize");

      return json({
        relationship: result.relationship,
        angle: result.angle,
        totalDisplacement: +result.totalDisplacement.toFixed(1),
        adjustments: result.adjustments.map((adj, i) => ({
          id: ids[i],
          originalHue: +adj.originalHue.toFixed(1),
          newHue: +adj.newHue.toFixed(1),
          delta: +(adj.newHue - adj.originalHue).toFixed(1),
          name: nameForHue(adj.newHue),
        })),
      });
    },
  );

  // 22. create_connections
  server.tool(
    "create_connections",
    "Create connection lines between objects, showing contrast and hue relationships.",
    { ids: z.array(z.string()).min(2).describe("Object IDs to connect (chain-connected)") },
    async ({ ids }) => {
      const action: Action = { type: "CONNECT_OBJECTS", ids };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to create connections");
      return json({ connected: ids });
    },
  );

  // 23. move_object
  server.tool(
    "move_object",
    "Move an object to a new position on the canvas.",
    {
      id: z.string().describe("Object ID"),
      x: z.number().describe("New X position"),
      y: z.number().describe("New Y position"),
    },
    async ({ id, x, y }) => {
      const action: Action = { type: "MOVE_OBJECT", id, position: { x, y } };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to move object");
      return json({ id, position: { x, y } });
    },
  );

  // 24. toggle_dark_mode
  server.tool(
    "toggle_dark_mode",
    "Toggle the canvas between light and dark mode.",
    {},
    async () => {
      const action: Action = { type: "TOGGLE_LIGHT_MODE" };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to toggle dark mode");

      // Fetch state after toggle to report current mode
      const state = await fetchLiveState();
      const mode = state ? (state.lightMode ? "light" : "dark") : "toggled";
      return json({ mode });
    },
  );

  // 25. set_lock
  server.tool(
    "set_lock",
    "Lock or unlock objects for harmonization. Locked objects keep their hue when harmonizing.",
    {
      ids: z.array(z.string()).min(1).describe("Object IDs to lock/unlock"),
      locked: z.boolean().describe("true to lock, false to unlock"),
    },
    async ({ ids, locked }) => {
      const action: Action = { type: "SET_LOCK", ids, locked };
      const result = await dispatchActions([action]);
      if (!result.success) return error(result.error ?? "Failed to set lock");
      return json({ ids, locked });
    },
  );
}
