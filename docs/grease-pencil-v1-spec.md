# Grease Pencil v1 Spec

Status: proposed  
Scope: deliberately constrained canvas mark-making for visual identity exploration

## Product Intent

The grease pencil is a lightweight mark-making layer for visual thinking on the Wassily canvas.

It is not a drawing system, diagramming system, annotation suite, whiteboard feature, or production asset tool. It should feel like a china marker on a design wall: quick circles, underlines, cross-outs, boundaries, and gestural marks used while thinking through references, swatches, ramps, and notes.

The feature should reinforce Wassily as a high-level color sketchbook between reference gathering and production tools. It should help users think spatially without turning the app into FigJam, Procreate, Milanote, or a general-purpose whiteboard.

## Core Principle

The pencil is for **gesture**, not authored illustration.

Text objects are for explicit notes and labels. Grease pencil strokes are for emphasis, circling, crossing out, loosely grouping, and marking attention.

## V1 Goals

- Let users draw quick freehand monochrome strokes on the canvas.
- Let users delete strokes simply.
- Persist strokes with the board.
- Keep strokes compatible with pan, zoom, undo, redo, selection, and board switching.
- Preserve Wassily’s visual austerity: color remains the loudest content on screen.

## Non-Goals

Do not add any of the following in v1:

- Color picker for strokes.
- Multiple brush styles.
- Brush-size panel.
- Pressure sensitivity.
- Fills.
- Shapes.
- Arrows.
- Frames.
- Sticky notes.
- Comments or threads.
- Collaboration cursors.
- Layers UI.
- Rich drawing toolbar.
- Partial stroke erasing.
- Lasso selection.
- Stroke smoothing controls.
- Export as a polished illustration asset.

If any of these seem necessary during implementation, pause and re-evaluate. The likely answer is to defer.

## Interaction Model

### Drawing

- Hold `P` to enter grease-pencil draw mode.
- While `P` is held, pointer-drag on the canvas creates a stroke.
- Release pointer to commit the stroke.
- Release `P` to return to normal canvas interaction.
- Drawing should not create a stroke on simple click with no meaningful movement.

This follows Wassily’s existing gesture/mode philosophy: tools appear at the point of action and disappear when no longer needed.

### Erasing / Deleting

V1 should use whole-stroke deletion, not partial erasing.

Recommended behavior:

- Click a stroke to select it.
- `Delete` / `Backspace` removes selected stroke(s).
- Optional: hold `E` while in pencil mode or normal mode to temporarily enter stroke erase mode, where clicking a stroke deletes it.

Do not implement scrub erasing in v1. It introduces stroke segmentation, path splitting, hit-area ambiguity, and too much drawing-app gravity.

### Selection

- Strokes are selectable as canvas objects.
- Selected strokes should use Wassily’s existing selection language where practical, but avoid heavy bounding boxes if they make marks feel too formal.
- If selection chrome looks awkward on freeform paths, use a subtle adaptive path highlight instead.
- Strokes should move with `MOVE_SELECTED` if selected alongside other objects.

### Undo / Redo

- Starting a stroke should snapshot once.
- Pointer movement during drawing should not create undo entries.
- Committing the stroke should be one undoable action.
- Deleting strokes should be undoable.

## Visual Design

### Stroke Style

V1 stroke style should be fixed:

- Color: adaptive black on light canvas, white on dark canvas.
- Opacity: slightly reduced, approximately `0.55` to `0.7`.
- Width: one fixed world-space width, approximately `3px` at 1x zoom.
- Line cap: round.
- Line join: round.
- No user-facing stroke controls.

The stroke should feel like a rough mark, not crisp production geometry. Avoid making it too polished.

### Layering

Recommended layering:

- Strokes sit above the canvas background.
- Strokes sit behind swatches, ramps, images, and text by default.
- Selected strokes may temporarily lift visually through highlight or opacity change.

This lets users circle or underline objects without the marks visually competing with color.

### Cursor

- In draw mode, use a minimal crosshair or pencil cursor if trivial.
- In erase mode, use a minimal eraser cursor only if trivial.
- Do not spend much time on cursor art in v1.

## Data Model

Add a new canvas object type:

```ts
export interface PencilStroke {
  id: string;
  type: "pencil-stroke";
  points: Point[]; // canvas coordinates, not screen coordinates
  strokeWidth: number; // fixed for v1, stored for future compatibility
  createdAt: number;
}

export type CanvasObject =
  | Swatch
  | Ramp
  | Connection
  | ReferenceImage
  | TextObject
  | PencilStroke;
```

If the current text object type has a different name, use the actual repo type name. The important addition is `PencilStroke`.

Store points in canvas/world coordinates so strokes naturally pan and zoom with the rest of the canvas.

## Actions

Add reducer actions similar to:

```ts
| {
    type: "CREATE_PENCIL_STROKE";
    id?: string;
    points: Point[];
    strokeWidth?: number;
  }
| {
    type: "UPDATE_PENCIL_STROKE";
    id: string;
    points: Point[];
  }
```

Prefer avoiding `UPDATE_PENCIL_STROKE` in persisted history if live preview uses local component state. The cleaner v1 approach is:

1. Keep in-progress stroke points in React local state.
2. On pointer up, dispatch `CREATE_PENCIL_STROKE` once.
3. Let undo/redo treat the committed stroke as one object creation.

Existing generic actions like `DELETE_OBJECTS`, `DELETE_SELECTED`, `MOVE_OBJECT`, and `MOVE_SELECTED` should work once `PencilStroke` is in the `CanvasObject` union and object bounds are implemented.

## Rendering Approach

Recommended rendering strategy:

- Render committed strokes inside the transformed canvas world layer, so they naturally follow camera pan/zoom.
- Use SVG paths for strokes.
- Convert `points` to a path string using simple line commands for v1.
- Optionally apply light path smoothing internally, but do not expose smoothing controls.

Example rendering shape:

```tsx
<path
  d={pointsToPath(stroke.points)}
  stroke={lightMode ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.68)"}
  strokeWidth={stroke.strokeWidth}
  strokeLinecap="round"
  strokeLinejoin="round"
  fill="none"
/>
```

For hit testing/selecting strokes, render a second invisible wider path:

```tsx
<path
  d={pointsToPath(stroke.points)}
  stroke="transparent"
  strokeWidth={Math.max(12, stroke.strokeWidth + 8)}
  fill="none"
  pointerEvents="stroke"
/>
```

This supports whole-stroke selection/deletion without implementing partial erase.

## Bounds and Movement

Implement stroke bounds from its points:

```ts
minX = Math.min(...points.map(p => p.x))
maxX = Math.max(...points.map(p => p.x))
minY = Math.min(...points.map(p => p.y))
maxY = Math.max(...points.map(p => p.y))
```

Use those bounds for selection rectangle behavior, object culling if any, and movement.

Moving a stroke should add `dx/dy` to every point. Avoid adding a separate `position` unless that better matches existing canvas helper architecture.

## Pointer Capture

Drawing should convert pointer screen coordinates into canvas coordinates using the same camera math as existing object placement.

Important behavior:

- Do not draw when starting a drag on an existing selectable object unless pencil mode is active.
- In pencil mode, drawing should win over object dragging.
- Prevent text selection or native browser drag while drawing.
- Capture pointer during stroke creation so the stroke continues even if the pointer leaves the element.

## Persistence

Because strokes are canvas objects, they should persist automatically in the existing board state if the reducer state is serializable.

No IndexedDB storage is needed. Strokes are plain JSON.

## MCP

Do not add MCP tools for grease pencil in v1 unless required by tests or architecture.

If later needed, the likely tools are:

- `create_pencil_stroke`
- `delete_objects` already covers deletion
- `read_canvas` should include stroke counts and stroke metadata automatically or with a small update

For v1, browser interaction matters more than agent-authored strokes.

## Keyboard Conflicts

Check existing shortcuts before implementation.

Expected shortcut:

- `P` = hold-to-draw grease pencil.

If `P` is already reserved, choose another hold key rather than adding a persistent toolbar.

Avoid conflicts with text editing. If a text object is actively being edited, `P`, `E`, and `Delete` should behave as normal text input/editing commands where appropriate.

## Acceptance Criteria

### Drawing

- Holding `P` and dragging on empty canvas creates a visible stroke.
- Stroke follows the pointer in canvas coordinates while drawing.
- Releasing pointer commits one stroke object.
- Releasing `P` returns to normal canvas behavior.
- A click with less than a small movement threshold does not create a meaningless dot unless product explicitly chooses to allow dots.

### Visual Behavior

- Stroke is black-ish on light canvas and white-ish on dark canvas.
- Stroke has one fixed visual style.
- Stroke does not overpower swatches, ramps, reference images, or text notes.
- Toggling light/dark mode updates stroke rendering adaptively.

### Selection / Deletion

- A committed stroke can be selected.
- `Delete` / `Backspace` removes selected stroke(s).
- Undo restores a deleted stroke.
- Redo re-deletes it.

### Persistence

- Reloading the board preserves committed strokes.
- Switching boards preserves strokes per board.
- Strokes do not interfere with reference image blob persistence.

### Movement

- Selected strokes move with existing selected-object movement behavior.
- Multi-selection can include strokes plus swatches, ramps, images, and text.

### Tests

Add tests for:

- Reducer creates a `pencil-stroke` object.
- Reducer deletes selected strokes.
- Moving a stroke offsets all points.
- Bounds helper returns correct bounds for a stroke.
- Board serialization/deserialization preserves strokes.
- Drawing gesture creates only one undoable history entry if this is straightforward to test.

## Implementation Hints

Likely files to touch:

- `src/types/index.ts`
- canvas reducer/state files
- canvas object bounds helpers
- canvas rendering components
- keyboard shortcut handling
- selection/deletion handling if type-specific assumptions exist
- tests for reducer/helpers
- docs/PRD.md and/or `CLAUDE.md` after implementation ships

Potential new files:

- `src/components/PencilStrokeNode.tsx`
- `src/hooks/useGreasePencil.ts`
- `src/canvas/pencilPath.ts`

## Product Guardrail

If implementation starts requiring a toolbar, brush settings, color controls, shape primitives, layers, or complex erasing, the feature is drifting.

The v1 should feel almost too simple:

> Hold `P`, mark the canvas, release. Select/delete if needed.

That is the whole feature.
