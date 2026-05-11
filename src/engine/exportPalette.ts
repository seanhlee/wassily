import type { OklchColor, Ramp, RampStop } from "../types";
import { clampToGamut, toHex, toOklchString } from "./gamut";

export type PaletteExportFormat = "tailwind" | "css" | "tokens" | "figma";
export type RampVariant = "light" | "dark";

export interface ColorProperty {
  rampName: string;
  stopLabel: string;
  lightOklch: string;
  darkOklch: string;
  lightHex: string;
  darkHex: string;
}

export interface RampStopExportRow {
  label: string;
  canonicalOklch: string;
  srgbHex: string;
  fallbackOklch: string;
  canonicalColor: OklchColor;
  fallbackColor: OklchColor;
}

export function colorForSrgbExport(color: OklchColor): OklchColor {
  return clampToGamut(color, "srgb");
}

export function hexForSrgbExport(color: OklchColor): string {
  return toHex(colorForSrgbExport(color));
}

export function fallbackStopForRamp(
  ramp: Ramp,
  stop: RampStop,
): RampStop | undefined {
  return ramp.fallbackStops?.[stop.index];
}

export function rampStopColor(
  stop: RampStop,
  variant: RampVariant = "light",
): OklchColor {
  return variant === "dark" ? stop.darkColor : stop.color;
}

export function rampStopFallbackColor(
  stop: RampStop,
  fallbackStop?: RampStop,
  variant: RampVariant = "light",
): OklchColor {
  return fallbackStop
    ? rampStopColor(fallbackStop, variant)
    : colorForSrgbExport(rampStopColor(stop, variant));
}

export function getRampStopExportRows(
  ramp: Ramp,
  variant: RampVariant = "light",
): RampStopExportRow[] {
  return ramp.stops.map((stop) => {
    const canonicalColor = rampStopColor(stop, variant);
    const fallbackColor = rampStopFallbackColor(
      stop,
      fallbackStopForRamp(ramp, stop),
      variant,
    );

    return {
      label: stop.label,
      canonicalColor,
      fallbackColor,
      canonicalOklch: toOklchString(canonicalColor),
      fallbackOklch: toOklchString(fallbackColor),
      srgbHex: toHex(fallbackColor),
    };
  });
}

export function formatRampOklchList(
  ramp: Ramp,
  variant: RampVariant = "light",
): string {
  return getRampStopExportRows(ramp, variant)
    .map((row) => row.canonicalOklch)
    .join("\n");
}

export function formatRampSrgbHexList(
  ramp: Ramp,
  variant: RampVariant = "light",
): string {
  return getRampStopExportRows(ramp, variant)
    .map((row) => row.srgbHex)
    .join("\n");
}

export function normalizeRampName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

export function generateRampColorProperties(ramps: readonly Ramp[]): ColorProperty[] {
  const props: ColorProperty[] = [];
  for (const ramp of ramps) {
    for (const stop of ramp.stops) {
      const fallbackStop = fallbackStopForRamp(ramp, stop);
      const lightFallback = rampStopFallbackColor(stop, fallbackStop, "light");
      const darkFallback = rampStopFallbackColor(stop, fallbackStop, "dark");

      props.push({
        rampName: normalizeRampName(ramp.name),
        stopLabel: stop.label,
        lightOklch: toOklchString(stop.color),
        darkOklch: toOklchString(stop.darkColor),
        lightHex: toHex(lightFallback),
        darkHex: toHex(darkFallback),
      });
    }
  }
  return props;
}

export function formatTailwindTheme(
  props: readonly ColorProperty[],
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

export function formatCssVariables(
  props: readonly ColorProperty[],
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

export function formatDesignTokens(props: readonly ColorProperty[]): object {
  const tokens: Record<string, Record<string, unknown>> = {};
  for (const p of props) {
    tokens[p.rampName] ??= {};
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

export function formatFigmaVariables(ramps: readonly Ramp[]): object {
  const collections = ramps.map((ramp) => {
    const name = ramp.name;
    return {
      name,
      modes: [
        { name: "Light", modeId: "light" },
        { name: "Dark", modeId: "dark" },
      ],
      variables: ramp.stops.map((stop) => {
        const fallbackStop = fallbackStopForRamp(ramp, stop);
        const lightRgb = hexToRgbFloat(
          toHex(rampStopFallbackColor(stop, fallbackStop, "light")),
        );
        const darkRgb = hexToRgbFloat(
          toHex(rampStopFallbackColor(stop, fallbackStop, "dark")),
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
    _note:
      "Figma Variables REST API requires Enterprise plan. Use Tokens Studio plugin with 'tokens' format for free Figma import.",
    collections,
  };
}

export function exportRamps(
  ramps: readonly Ramp[],
  format: PaletteExportFormat,
  aliases?: Record<string, string>,
): string | object {
  const props = generateRampColorProperties(ramps);
  switch (format) {
    case "tailwind":
      return formatTailwindTheme(props, aliases);
    case "css":
      return formatCssVariables(props, aliases);
    case "tokens":
      return formatDesignTokens(props);
    case "figma":
      return formatFigmaVariables(ramps);
  }
}

export function serializePaletteExport(
  ramps: readonly Ramp[],
  format: PaletteExportFormat,
  aliases?: Record<string, string>,
): string {
  const output = exportRamps(ramps, format, aliases);
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

function hexToRgbFloat(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
