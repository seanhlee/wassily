import { afterEach, describe, expect, it, vi } from "vitest";
import {
  importArenaImages,
  parseArenaChannelInput,
  previewArenaChannel,
  selectArenaImageAsset,
  selectArenaImagePreview,
  type ArenaImagePreview,
} from "../arena";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseArenaChannelInput", () => {
  it("accepts a plain channel slug", () => {
    expect(parseArenaChannelInput("visual-identity")).toBe("visual-identity");
  });

  it("extracts the channel slug from an Are.na URL", () => {
    expect(parseArenaChannelInput("https://www.are.na/user/visual-identity")).toBe(
      "visual-identity",
    );
  });

  it("accepts an Are.na URL without a protocol", () => {
    expect(parseArenaChannelInput("www.are.na/user/visual-identity/")).toBe(
      "visual-identity",
    );
  });
});

describe("selectArenaImageAsset", () => {
  it("prefers large image versions", () => {
    expect(
      selectArenaImageAsset({
        src: "original.jpg",
        width: 2000,
        height: 1000,
        medium: { src: "medium.jpg", width: 800, height: 400 },
        large: { src: "large.jpg", width: 1200, height: 600 },
      }),
    ).toEqual({ url: "large.jpg", width: 1200, height: 600 });
  });

  it("falls back to the original image src", () => {
    expect(
      selectArenaImageAsset({
        src: "original.jpg",
        width: 2000,
        height: 1000,
      }),
    ).toEqual({ url: "original.jpg", width: 2000, height: 1000 });
  });
});

describe("selectArenaImagePreview", () => {
  it("prefers medium image versions for the preview grid", () => {
    expect(
      selectArenaImagePreview({
        src: "original.jpg",
        width: 2000,
        height: 1000,
        small: { src: "small.jpg", width: 300, height: 150 },
        medium: { src: "medium.jpg", width: 800, height: 400 },
        large: { src: "large.jpg", width: 1200, height: 600 },
      }),
    ).toEqual({ url: "medium.jpg", width: 800, height: 400 });
  });
});

describe("previewArenaChannel", () => {
  it("requests the requested page and exposes Are.na pagination", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.includes("/contents")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 1,
                type: "Image",
                title: "Reference",
                image: {
                  medium: { src: "preview.jpg", width: 800, height: 400 },
                  large: { src: "asset.jpg", width: 1200, height: 600 },
                },
              },
            ],
            meta: {
              current_page: 2,
              next_page: null,
              per_page: 24,
              total_pages: 2,
              total_count: 43,
              has_more_pages: false,
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          id: 42,
          title: "Identity References",
          slug: "identity-references",
        }),
        { status: 200 },
      );
    });

    const result = await previewArenaChannel("identity-references", {
      page: 2,
      per: 24,
    });

    expect(calls[1]).toContain("page=2");
    expect(result.images).toHaveLength(1);
    expect(result.images[0].previewUrl).toBe("preview.jpg");
    expect(result.pagination).toEqual({
      currentPage: 2,
      nextPage: null,
      perPage: 24,
      totalPages: 2,
      totalCount: 43,
      hasMorePages: false,
    });
  });
});

describe("importArenaImages", () => {
  function makePreview(id: number, assetUrl: string): ArenaImagePreview {
    return {
      id,
      title: `block ${id}`,
      previewUrl: `${assetUrl}.preview`,
      assetUrl,
      naturalSize: { width: 100, height: 50 },
      source: {
        provider: "arena",
        blockId: id,
        assetUrl,
      },
    };
  }

  // jsdom's FileReader doesn't reliably produce a data URL for stubbed Blob
  // payloads, so swap in a deterministic stub for these tests.
  class StubFileReader {
    result: string | null = null;
    onload: (() => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    readAsDataURL(blob: Blob) {
      this.result = `data:${blob.type || "application/octet-stream"};base64,AAAA`;
      queueMicrotask(() => this.onload?.());
    }
  }

  function stubFetchFromMap(
    map: Record<string, () => Response | Promise<Response>>,
  ) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      const responder = map[url];
      if (!responder) return new Response("not found", { status: 404 });
      return responder();
    });
  }

  it("reports failed downloads without dropping successful ones", async () => {
    vi.stubGlobal("FileReader", StubFileReader);
    stubFetchFromMap({
      "ok.jpg": () =>
        new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }),
      "missing.jpg": () => new Response("not found", { status: 404 }),
    });

    const result = await importArenaImages([
      makePreview(1, "ok.jpg"),
      makePreview(2, "missing.jpg"),
    ]);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].source.blockId).toBe(1);
    expect(result.images[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.images[0].source.importedAt).toBeGreaterThan(0);
    expect(result.failed).toBe(1);
    expect(result.failedIds).toEqual([2]);
  });

  it("caps in-flight downloads at the requested concurrency", async () => {
    vi.stubGlobal("FileReader", StubFileReader);
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal("fetch", async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return new Response(new Blob(["x"], { type: "image/png" }), {
        status: 200,
      });
    });

    const previews = Array.from({ length: 12 }, (_, i) =>
      makePreview(i + 1, `asset-${i}.jpg`),
    );
    const result = await importArenaImages(previews, { concurrency: 3 });

    expect(peak).toBeLessThanOrEqual(3);
    expect(result.failedIds).toEqual([]);
  });
});
