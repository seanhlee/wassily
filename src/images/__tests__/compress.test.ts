import { describe, expect, it } from "vitest";
import {
  fitImageSize,
  REFERENCE_IMAGE_COMPRESSION_DEFAULTS,
  shouldCompressReferenceImage,
} from "../compress";

describe("reference image compression policy", () => {
  it("fits oversized images to the configured longest edge", () => {
    expect(fitImageSize({ width: 3200, height: 1800 }, 1600)).toEqual({
      width: 1600,
      height: 900,
    });
    expect(fitImageSize({ width: 900, height: 1800 }, 1200)).toEqual({
      width: 600,
      height: 1200,
    });
  });

  it("leaves already-small dimensions unchanged", () => {
    expect(fitImageSize({ width: 640, height: 480 }, 1600)).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("compresses unsupported formats even when they are under the byte limit", () => {
    expect(
      shouldCompressReferenceImage(
        { size: 100_000, type: "image/png" },
        { width: 400, height: 300 },
      ),
    ).toBe(true);
  });

  it("compresses when byte or dimension budgets are exceeded", () => {
    expect(
      shouldCompressReferenceImage(
        {
          size: REFERENCE_IMAGE_COMPRESSION_DEFAULTS.maxBytes + 1,
          type: "image/webp",
        },
        { width: 400, height: 300 },
      ),
    ).toBe(true);
    expect(
      shouldCompressReferenceImage(
        { size: 100_000, type: "image/webp" },
        { width: REFERENCE_IMAGE_COMPRESSION_DEFAULTS.maxDimension + 1, height: 900 },
      ),
    ).toBe(true);
  });

  it("does not require recompression for in-budget compressed images", () => {
    expect(
      shouldCompressReferenceImage(
        { size: 100_000, type: "image/webp" },
        { width: 400, height: 300 },
      ),
    ).toBe(false);
  });
});
