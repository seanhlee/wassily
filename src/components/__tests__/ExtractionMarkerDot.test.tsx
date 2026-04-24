/**
 * Tests for ExtractionMarkerDot — adaptive ring contrast + active-state ring.
 *
 * These tests render the component and inspect the SVG output directly, so
 * they don't depend on React Testing Library. Vitest's default environment
 * provides the DOM we need via happy-dom / jsdom if configured; otherwise
 * these assertions use the renderToString path which needs neither.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ExtractionMarkerDot,
  adaptiveRingStroke,
} from "../ExtractionMarkerDot";

describe("adaptiveRingStroke", () => {
  it("returns black for bright fills (l > 0.6)", () => {
    expect(adaptiveRingStroke({ l: 0.8, c: 0.1, h: 90 })).toBe("#000");
    expect(adaptiveRingStroke({ l: 0.65, c: 0.1, h: 90 })).toBe("#000");
  });

  it("returns white for dark fills (l <= 0.6)", () => {
    expect(adaptiveRingStroke({ l: 0.5, c: 0.1, h: 90 })).toBe("#fff");
    expect(adaptiveRingStroke({ l: 0.2, c: 0.1, h: 260 })).toBe("#fff");
    // Boundary: threshold is strict >, so exactly 0.6 → light
    expect(adaptiveRingStroke({ l: 0.6, c: 0.1, h: 90 })).toBe("#fff");
  });
});

describe("ExtractionMarkerDot rendering", () => {
  it("renders two concentric circles when inactive", () => {
    const html = renderToStaticMarkup(
      <ExtractionMarkerDot color={{ l: 0.5, c: 0.2, h: 30 }} />,
    );
    const circles = html.match(/<circle/g) ?? [];
    expect(circles).toHaveLength(2); // filled dot + adaptive ring
  });

  it("renders a third concentric circle when active", () => {
    const html = renderToStaticMarkup(
      <ExtractionMarkerDot
        color={{ l: 0.5, c: 0.2, h: 30 }}
        active
      />,
    );
    const circles = html.match(/<circle/g) ?? [];
    expect(circles).toHaveLength(3); // + outer active ring
  });

  it("uses dark stroke on a bright fill", () => {
    const html = renderToStaticMarkup(
      <ExtractionMarkerDot color={{ l: 0.85, c: 0.15, h: 90 }} />,
    );
    expect(html).toContain('stroke="#000"');
    expect(html).not.toContain('stroke="#fff"');
  });

  it("uses light stroke on a dark fill", () => {
    const html = renderToStaticMarkup(
      <ExtractionMarkerDot color={{ l: 0.25, c: 0.15, h: 260 }} />,
    );
    expect(html).toContain('stroke="#fff"');
    expect(html).not.toContain('stroke="#000"');
  });
});
