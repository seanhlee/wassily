# Editable Extraction Markers

> Status: research/spec proposal
> Goal: make image extraction steerable by linking extracted swatches back to sample points on the source image.

## Why This Matters

Wassily already has a strong image extraction engine: dropped or pasted images can produce 3-7 adaptive OKLCH colors, using k-means, peak-chroma representatives, chroma normalization, and distinctiveness culling.

The missing product loop is correction. Today, extraction is a one-shot command:

1. User right-clicks a reference image.
2. `extractColors(imageData)` returns colors.
3. Wassily creates swatches to the right of the image.
4. The relationship between image, sampled pixels, and swatches is lost.

Editable extraction markers add the missing loop:

1. Wassily extracts colors and creates swatches.
2. The reference image shows markers at the sampled source points.
3. Each marker is linked to one extracted swatch.
4. Dragging a marker samples a new pixel and updates the linked swatch.
5. The user can keep machine-suggested colors, but steer the palette by eye.

This fits Wassily's product arc: moodboard -> color exploration -> UI implementation. It keeps the source image alive as a color instrument, not just raw material.

## Research Notes

RYBitten's live extraction flow is the clearest reference pattern. Its page lets users upload, drop, or paste an image, derives an eight-corner `ColorCube`, then displays draggable markers on the source image. Dragging a marker resamples that pixel and updates the generated color model.

Useful ideas from RYBitten:

- Show extraction markers directly on the image, not in a separate panel.
- Treat automatic extraction as a starting suggestion.
- Use a loupe/magnified pixel preview while dragging.
- Keep marker color equal to the sampled color.
- Persist normalized marker positions as image-relative values, not screen pixels.
- Update the generated output live as markers move.

Important difference for Wassily:

- RYBitten extracts fixed semantic cube anchors: white, red, yellow, orange, blue, violet, green, black.
- Wassily extracts adaptive dominant colors in OKLCH, so markers should represent cluster representatives, not fixed named anchors.

Sources:

- RYBitten live app: https://rybitten.space/
- RYBitten repo: https://github.com/meodai/RYBitten
- Wassily current extraction engine: `src/engine/extract.ts`
- Wassily current image node: `src/components/RefImageNode.tsx`
- Wassily current extraction command: `src/canvas/Canvas.tsx`

## Product Goals

- Make extraction editable without adding a permanent inspector.
- Preserve Wassily's spatial canvas model: the image remains the control surface.
- Keep the extracted swatches as ordinary swatches, so existing edit, harmonize, promote, connect, and export flows still work.
- Allow a user to correct one extracted color without re-running the whole extraction.
- Make the sampled origin visible enough to trust, but quiet enough to preserve the image.

## Non-Goals

- Do not replace the existing k-means extraction algorithm.
- Do not turn reference images into a full masking/selection tool.
- Do not make extraction markers required for every image.
- Do not add a sidebar or persistent properties panel.
- Do not bind markers to ramps in the first version. Markers update swatches only.

## Design Language

High-level description for design engineering:

> Build editable extraction as a spatial color instrument: a warm, editorial canvas where palettes are edited through diagrams, markers, curves, and direct manipulation rather than panels and forms.

The style should feel like a quiet color laboratory: part artist's notebook, part scientific instrument, part editorial diagram. The interface is sparse, tactile, and precise. Color remains the main material; UI chrome recedes into thin strokes, plotted geometry, and calm typographic labels.

### Visual Principles

- Diagram-first: controls should read as plotted relationships, not generic form controls.
- Instrumental: users manipulate markers, paths, grids, and handles directly on the canvas.
- Editorial calm: use generous negative space, warm paper-like neutrals, quiet labels, and restrained contrast.
- Visible color mechanics: show sampling, lightness, saturation, links, and palette relationships spatially.
- Tactile precision: prefer fine graphite strokes, rings, dotted paths, small switches, and crisp selected states.
- Color as subject: extracted swatches and sampled colors carry the visual energy; the surrounding UI stays neutral.

### Marker-Specific Style

- Markers should feel drawn onto the image, not pasted on top as app chrome.
- Use a filled color dot with a thin adaptive ring and a larger invisible hit target.
- Active markers can use a second ring, small corner brackets, or a plotted crosshair treatment.
- Hover links should be subtle: a dotted line, ghost connector, or temporary highlight, never a heavy callout.
- The loupe should feel like an inspection instrument: crisp, minimal, and close to the pointer without becoming a panel.
- Avoid labels by default. Use text only when it resolves ambiguity, such as a temporary index or sampled value on hover.

### Do / Avoid

Do:

- Use thin black, graphite, or off-white strokes.
- Use cream, paper, ivory, and soft neutral surfaces.
- Let controls be geometric: dots, rings, curves, grids, handles.
- Prefer direct manipulation over persistent panels.
- Make selected states feel plotted, bracketed, or diagrammed.

Avoid:

- SaaS dashboard density.
- Heavy cards, panels, shadows, or glossy controls.
- Decorative gradients.
- Generic component-library controls where a diagrammatic control can carry the interaction.
- Explanatory UI copy when the control shape can reveal the interaction.

## Proposed UX

### Entry Points

Primary:

- Right-click reference image -> `Extract colors`
- Wassily creates swatches beside the image and enters `extraction edit` state for that image.

Secondary:

- When an image with an extraction exists, right-click -> `Edit extraction`
- When an extracted swatch is selected, context menu can include `Show source marker`.

Later:

- Keyboard shortcut on selected image, e.g. `X`, could toggle marker visibility.

### Visual Model

On the reference image:

- A small circular marker for each extracted color.
- Marker fill is the current sampled color.
- Marker outline adapts to image/color contrast.
- Active marker shows corner brackets or a slightly larger ring.
- Markers render only when:
  - the image is selected,
  - extraction edit mode is active,
  - or the linked swatch is selected/hovered.

Next to the image:

- Created swatches remain in a vertical strip, same as today.
- Optional subtle line/ghost link from marker to swatch during hover/drag.
- The swatch updates live while marker is dragged.

During drag:

- Cursor changes to crosshair.
- A loupe appears near the pointer, showing a pixelated 20x20 source crop scaled to ~120-160 px.
- The center sample square is outlined in black/white.
- The swatch color updates live.
- On pointer up, one undo snapshot is committed.

### Interaction Details

Marker hover:

- Highlight linked swatch.
- Show marker index or swatch hex only if needed; default should stay visual.

Marker drag:

- Pointer down on marker captures pointer.
- Movement is clamped to the image bounds.
- Position is stored normalized: `{ x: 0..1, y: 0..1 }`.
- New color comes from the corresponding source pixel in the reference image's offscreen sampling canvas.
- Update linked swatch with `preserveColors` semantics: do not purify, because this is an explicit sampled color.

Image move:

- Markers move with the image because they are rendered inside `RefImageNode`.

Delete swatch:

- Linked marker should be removed or orphaned. Preferred v1 behavior: remove marker when linked swatch no longer exists.

Delete image:

- Swatches remain ordinary swatches, but extraction metadata is removed with the image.

Duplicate image:

- v1 can duplicate image without extraction markers.
- Later, duplicate extraction links only if linked swatches are duplicated too.

Undo:

- Drag start calls `snapshot()`.
- Live drag dispatches update actions without additional snapshots.
- Pointer up ends the gesture.

## Data Model

### Option A: Store Extraction Data On ReferenceImage

```ts
export interface ExtractionMarker {
  id: string;
  swatchId: string;
  position: Point; // normalized image-space: 0..1
  color: OklchColor; // last sampled color, source-preserved
}

export interface ReferenceImage {
  id: string;
  type: "reference-image";
  dataUrl: string;
  position: Point;
  size: Size;
  extraction?: {
    markers: ExtractionMarker[];
    createdAt: number;
    updatedAt: number;
  };
}
```

Pros:

- Local to the image.
- Easy to render inside `RefImageNode`.
- Deletes naturally with the image.
- Works with board persistence.

Cons:

- Links from image -> swatch need cleanup when swatches are deleted.

### Option B: Separate Extraction Object Type

```ts
export interface ExtractionGroup {
  id: string;
  type: "extraction-group";
  imageId: string;
  markers: ExtractionMarker[];
}
```

Pros:

- More explicit object model.
- Could support future extraction groups, variants, and comparisons.

Cons:

- More canvas object complexity.
- More selection/deletion behavior to define.
- Not needed for v1.

Recommendation: choose Option A for v1. Store markers on `ReferenceImage`.

## Code Validation Notes

Validated against the current codebase on 2026-04-24.

### What Already Fits

- `Canvas.tsx` already has the right entry point: `handleExtractColors(imageId)` loads image data, calls `extractColors`, and creates a vertical strip of swatches beside the image.
- `RefImageNode` is already a positioned wrapper around the image, so rendering markers inside it will naturally make markers move with the image.
- The existing eyedropper code already proves the offscreen-canvas sampling path: `Canvas.tsx` primes reference-image canvases and `useEyedropper.ts` converts pointer coordinates into image-local sampling.
- Board persistence should accept `ReferenceImage.extraction` without a migration. `saveBoardState` preserves all reference-image fields except `dataUrl`, and blob persistence is keyed separately by image id.
- `CREATE_SWATCHES` already supports caller-provided swatch ids at the reducer/action level, and reducer tests cover that behavior.

### Spec Adjustments From The Code

- The `createSwatches` hook wrapper currently narrows its input type to swatches without `id`, even though the action type and reducer support `id`. If we do not add `CREATE_EXTRACTION` immediately, widen this wrapper before generating marker-linked swatches from `Canvas.tsx`.
- The extraction engine currently loses source coordinates very early because `samplePixels` returns `OklchColor[]`. Phase 1 should introduce `SampledPixel` and keep the existing `colors` result for compatibility with current UI and tests.
- Current image sampling is partly display-size based. `primeImageCanvas` draws to `image.size`, while `dataUrlToImageData` downscales to max 200px. Marker positions should therefore be normalized, and drag sampling should use a clearly chosen coordinate space. Preferred: a dedicated sampling helper that draws the source image to its natural dimensions when possible, falling back to the displayed canvas.
- The reducer's history model skips granular swatch color updates. Any live drag action such as `UPDATE_EXTRACTION_MARKER_AND_SWATCH` must also be included in `SKIP_HISTORY`, with `snapshot()` called once at drag start.
- Current deletion cleanup only removes connections. Marker cleanup needs to be added anywhere linked swatches can disappear or stop being swatches: `DELETE_SELECTED`, `DELETE_OBJECTS`, and `PROMOTE_TO_RAMP`.
- Current duplication is shallow. If `ReferenceImage.extraction` is added, `DUPLICATE_SELECTED` would copy markers that still point to the original swatches unless we explicitly clear or remap extraction metadata.

### Validated Implementation Preference

The single `CREATE_EXTRACTION` action still looks like the cleanest v1 path. It can create linked swatches, attach image markers, select the created swatches or source image, and avoid transient half-linked state. Directly dispatching `CREATE_SWATCHES` plus `SET_IMAGE_EXTRACTION` is workable, but more fragile around undo, selection, and future external actions.

## Engine Changes

The current `extractColors(imageData)` returns only colors:

```ts
interface ExtractionResult {
  colors: OklchColor[];
  isSingleColor: boolean;
}
```

Editable markers need source positions. Add a new extraction shape:

```ts
interface ExtractedColor {
  color: OklchColor;
  source: {
    x: number; // normalized 0..1
    y: number; // normalized 0..1
  };
}

interface ExtractionResult {
  colors: OklchColor[];
  samples?: ExtractedColor[];
  isSingleColor: boolean;
}
```

Better v1 API:

```ts
export interface ExtractionSample {
  color: OklchColor;
  source: Point; // normalized
}

export interface ExtractionResult {
  samples: ExtractionSample[];
  colors: OklchColor[]; // convenience alias for samples.map(s => s.color)
  isSingleColor: boolean;
}
```

### How To Get Source Positions

Current clusters already track a `peak` color, but not the pixel coordinate. Update sampling and clustering to keep source coordinates:

```ts
interface SampledPixel {
  color: OklchColor;
  x: number; // image pixel x
  y: number; // image pixel y
}

interface Cluster {
  center: OklchColor;
  peak: SampledPixel;
  count: number;
}
```

When selecting the peak-chroma representative for a cluster, keep the pixel coordinate. Normalize with `x / imageData.width`, `y / imageData.height`.

### Color Preservation

Dragged markers should sample exact image pixels and update the linked swatch without purification.

Reason:

- Purification is right for collected colors entering as design material.
- Marker dragging is an eyedropper action. The user is explicitly asking for the source color.
- Wassily already treats eyedropper sampling this way.

## State Actions

Add reducer actions:

```ts
| {
    type: "SET_IMAGE_EXTRACTION";
    imageId: string;
    markers: ExtractionMarker[];
  }
| {
    type: "MOVE_EXTRACTION_MARKER";
    imageId: string;
    markerId: string;
    position: Point; // normalized
    color: OklchColor;
  }
| {
    type: "CLEAR_IMAGE_EXTRACTION";
    imageId: string;
  }
```

Potential helper action:

```ts
| {
    type: "UPDATE_EXTRACTION_MARKER_AND_SWATCH";
    imageId: string;
    markerId: string;
    position: Point;
    color: OklchColor;
  }
```

Recommendation:

- Use a combined action for drag updates so marker and swatch cannot drift out of sync.
- Keep `UPDATE_SWATCH_COLOR` available for ordinary swatch edits.

## Component Changes

### `RefImageNode`

Add props:

```ts
extractionEditable?: boolean;
objects: Record<string, CanvasObject>; // or linked swatch lookup
onMoveExtractionMarker: (
  imageId: string,
  markerId: string,
  position: Point,
  color: OklchColor,
) => void;
onExtractionDragStart?: () => void;
```

Responsibilities:

- Render markers if `image.extraction?.markers` exists and visibility rules pass.
- Convert pointer position to normalized image position.
- Sample from an offscreen canvas or callback sampler.
- Render loupe during drag.
- Stop event propagation so marker dragging does not move the image.

### Sampling Cache

Canvas already primes offscreen canvases for eyedropper sampling. Reuse that pattern.

Needed helper:

```ts
sampleReferenceImageAt(
  image: ReferenceImage,
  normalized: Point,
): OklchColor | null
```

Implementation detail:

- Sample against the natural image canvas, not the displayed 200px image.
- Convert normalized position to imageData pixel coordinates.
- Use existing `culori` RGB -> OKLCH conversion path.

### `Canvas.tsx`

Update `handleExtractColors`:

1. Load `ImageData`.
2. Call updated `extractColors`.
3. Create swatches with stable ids.
4. Create markers that point to those ids.
5. Dispatch `SET_IMAGE_EXTRACTION`.
6. Select image or keep image + swatches selected.

Important: if `CREATE_SWATCHES` currently generates ids internally, marker linkage needs known ids. Options:

- Generate ids in `Canvas.tsx` and pass them into `CREATE_SWATCHES`.
- Add a single reducer action that creates swatches and extraction markers together.

Recommendation: add a single action:

```ts
| {
    type: "CREATE_EXTRACTION";
    imageId: string;
    samples: { id?: string; color: OklchColor; source: Point; position: Point }[];
  }
```

Reducer creates swatches and writes image extraction in one atomic state update.

## Persistence

Reference images are persisted by board state, with image blobs handled separately. Storing marker metadata on `ReferenceImage` should persist naturally.

Need migration behavior:

- Existing images without `extraction` continue to work.
- If a board loads with markers whose swatches no longer exist, filter those markers during render or cleanup.

## Accessibility And Usability

- Markers should be keyboard-focusable eventually, but v1 can be pointer-first.
- Each marker should have an aria label like `Extraction sample 1`.
- Marker hit target should be at least 12-16 px even if the visible dot is smaller.
- Loupe should not obscure the marker directly under the pointer.
- Escape during drag should cancel to original marker position/color.

## Edge Cases

- Image fails to load: no markers rendered.
- Transparent pixels: ignore during auto-extraction; dragged marker on transparent pixel should either no-op or sample the composited RGB. Prefer no-op for v1.
- Image object uses `objectFit: cover`: current reference image displays the whole image at proportional size, so normalized sampling is straightforward. If cropping is added later, sampling math must account for crop.
- Re-extracting an image: replace previous extraction markers, create a new swatch strip, or update existing linked swatches? Prefer prompt-free v1 behavior: replace markers and create a new strip. Later we can support `Re-extract into existing swatches`.
- Swatch manually edited after extraction: marker still exists, but marker color may differ from swatch. Prefer marker drag overwrites swatch; manual edit does not move marker.

## Implementation Plan

### Phase 1: Engine Metadata

- Change `extractColors` internals to retain sampled pixel coordinates.
- Return `samples` with normalized source positions.
- Keep `colors` for compatibility.
- Add tests for source positions in `src/engine/__tests__/research.test.ts` or a new extraction test.

### Phase 2: Atomic Extraction State

- Add `ExtractionMarker` and `ReferenceImage.extraction` to `src/types/index.ts`.
- Add `CREATE_EXTRACTION` action to reducer.
- Update `handleExtractColors` to use `CREATE_EXTRACTION`.
- Add reducer tests for marker/swatch linkage and cleanup.

### Phase 3: Marker Rendering

- Update `RefImageNode` to render markers over selected/extraction-active images.
- Marker style:
  - filled dot,
  - adaptive ring,
  - fixed hit target,
  - no text by default.

### Phase 4: Marker Dragging

- Add pointer capture drag behavior.
- Reuse/reference offscreen image sampling.
- Dispatch combined marker+swatch update.
- Add loupe preview.
- Ensure drag does not move the image.

### Phase 5: Polish

- Link marker hover to linked swatch hover/selection.
- Add `Edit extraction` context menu item.
- Add Escape cancel.
- Add stale marker cleanup.

## Testing Plan

Unit:

- `extractColors` returns samples with normalized positions in range.
- `CREATE_EXTRACTION` creates swatches and markers with matching ids.
- `MOVE_EXTRACTION_MARKER` updates both marker and linked swatch.
- Deleting a linked swatch removes or ignores its marker.

Integration/manual:

- Drop image -> right-click -> extract colors -> markers appear.
- Drag marker -> linked swatch updates live.
- Undo after drag returns marker and swatch to previous state.
- Move image -> markers remain pinned to image-relative points.
- Switch boards -> extraction markers persist.
- Existing boards/images load without migration errors.

Visual:

- Markers visible on light and dark image regions.
- Loupe is crisp and does not flicker.
- Text/markers do not overlap selected brackets badly.

## Open Questions

1. Should extracted swatches be visually grouped with their source image?
2. Should manual swatch edits break the marker link, or keep it?
3. Should `Extract colors` on an image with existing extraction update existing swatches or create a new set?
4. Should marker colors be source-exact, normalized-to-peak, or user-toggleable?
5. Do we need a dedicated `extraction edit mode`, or should selected images always show markers?

## Recommended V1 Decisions

- Store extraction metadata on `ReferenceImage`.
- Keep swatches ordinary, but linked through marker metadata.
- Show markers when image is selected.
- Marker dragging samples source-exact color and bypasses purification.
- Re-extraction creates a new linked swatch strip and replaces image markers.
- Use a combined reducer action for marker and swatch updates.
- Add loupe if time allows; markers alone are still a coherent first cut.
