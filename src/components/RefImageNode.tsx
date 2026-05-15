import { useEffect, useRef } from "react";
import type {
  Camera,
  CanvasState,
  ExtractionMarker,
  OklchColor,
  Point,
  ReferenceImage,
  Swatch,
} from "../types";
import { useDrag } from "../hooks/useDrag";
import { SelectionBrackets } from "./SelectionBrackets";
import { ExtractionMarkerDot } from "./ExtractionMarkerDot";
import { sampleImagePixelAt } from "../hooks/useEyedropper";
import { getReferenceImageRenderUrl } from "../images/referenceImage";

export interface LoupeState {
  imageId: string;
  clientX: number;
  clientY: number;
  samplePixel: { x: number; y: number };
  color: OklchColor;
}

interface RefImageNodeProps {
  image: ReferenceImage;
  lightMode: boolean;
  eyedropperActive?: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onMoveSelected: (dx: number, dy: number) => void;
  selected: boolean;
  zoom: number;
  onSnapshot?: () => void;
  onDuplicateDrag?: () => void;
  objects: CanvasState["objects"];
  selectedIds: string[];
  sampleCache: Map<string, CanvasRenderingContext2D>;
  camera: Camera;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMoveExtractionMarker: (
    imageId: string,
    markerId: string,
    position: Point,
    color: OklchColor,
  ) => void;
  onLoupeUpdate: (state: LoupeState | null) => void;
  hoveredSwatchId: string | null;
  onHoverMarker: (swatchId: string | null) => void;
}

/** Pointer travel past this squared distance (screen px) counts as a drag. */
const MARKER_DRAG_THRESHOLD_SQ = 3 * 3;

export function RefImageNode({
  image,
  lightMode,
  eyedropperActive,
  onSelect,
  onMove,
  onMoveSelected,
  selected,
  zoom,
  onSnapshot,
  onDuplicateDrag,
  objects,
  selectedIds,
  sampleCache,
  camera,
  containerRef,
  onMoveExtractionMarker,
  onLoupeUpdate,
  hoveredSwatchId,
  onHoverMarker,
}: RefImageNodeProps) {
  // ---- Marker drag ----
  const dragRef = useRef<{
    pointerId: number;
    markerId: string;
    swatchId: string;
    originalPosition: Point;
    originalColor: OklchColor;
    startX: number;
    startY: number;
    engaged: boolean; // false until pointer travels past the click threshold
  } | null>(null);

  const endDrag = (el: Element | null) => {
    const drag = dragRef.current;
    if (!drag) return;
    try {
      if (el && "releasePointerCapture" in el) {
        (el as Element & { releasePointerCapture(id: number): void }).releasePointerCapture(drag.pointerId);
      }
    } catch {
      /* element may be gone */
    }
    dragRef.current = null;
    onLoupeUpdate(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const drag = dragRef.current;
      if (!drag) return;
      // Only revert if the user was actually dragging; a pure click that
      // hasn't yet landed doesn't need reverting.
      if (drag.engaged) {
        onMoveExtractionMarker(
          image.id,
          drag.markerId,
          drag.originalPosition,
          drag.originalColor,
        );
      }
      endDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // endDrag closes over the stable onLoupeUpdate; deps list the values the
    // listener actually reads off each keypress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id, onMoveExtractionMarker, onLoupeUpdate]);

  const handleMarkerPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    marker: ExtractionMarker,
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Capture may fail on programmatic pointer events with nonstandard ids.
      // Drag still works via the captured handlers on the marker element;
      // we simply lose capture semantics (pointermove outside the marker
      // won't propagate). Acceptable fallback.
    }
    // No snapshot, no loupe, no sample yet — this may just be a click. We
    // engage the drag on first pointermove past the threshold.
    dragRef.current = {
      pointerId: e.pointerId,
      markerId: marker.id,
      swatchId: marker.swatchId,
      originalPosition: marker.position,
      originalColor: marker.color,
      startX: e.clientX,
      startY: e.clientY,
      engaged: false,
    };
  };

  const handleMarkerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (!drag.engaged) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (dx * dx + dy * dy <= MARKER_DRAG_THRESHOLD_SQ) return;
      drag.engaged = true;
      onSnapshot?.();
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sampled = sampleImagePixelAt(
      e.clientX,
      e.clientY,
      image,
      rect,
      camera,
      sampleCache,
    );
    if (!sampled) return;

    const normalized = {
      x: sampled.local.x / image.size.width,
      y: sampled.local.y / image.size.height,
    };
    onMoveExtractionMarker(image.id, drag.markerId, normalized, sampled.color);
    onLoupeUpdate({
      imageId: image.id,
      clientX: e.clientX,
      clientY: e.clientY,
      samplePixel: sampled.local,
      color: sampled.color,
    });
  };

  const handleMarkerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.engaged) {
      // Pure click (no drag engaged) — select the linked swatch.
      onSelect(drag.swatchId, e.metaKey || e.shiftKey);
    }
    endDrag(e.currentTarget);
  };

  const handleMarkerPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.engaged) {
      onMoveExtractionMarker(
        image.id,
        drag.markerId,
        drag.originalPosition,
        drag.originalColor,
      );
    }
    endDrag(e.currentTarget);
  };

  const handleMouseDown = useDrag(
    image.id,
    image.position,
    zoom,
    selected,
    onSelect,
    onMove,
    onMoveSelected,
    onSnapshot,
    onDuplicateDrag,
  );

  const outlineColor = lightMode ? "#000" : "#fff";
  const renderUrl = getReferenceImageRenderUrl(image);

  // Markers render when the image is selected, or when any linked swatch is
  // selected or hovered.
  const markers = image.extraction?.markers ?? [];
  const selectedSet = new Set(selectedIds);
  const markersVisible =
    markers.length > 0 &&
    (selected ||
      markers.some(
        (m) =>
          selectedSet.has(m.swatchId) || hoveredSwatchId === m.swatchId,
      ));

  return (
    <div
      className="ref-image-node"
      data-object-id={image.id}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: image.position.x,
        top: image.position.y,
        width: image.size.width,
        height: image.size.height,
        cursor: "default",
        opacity: 1,
        pointerEvents: eyedropperActive ? "none" : undefined,
      }}
    >
      {selected && (
        <SelectionBrackets
          width={image.size.width}
          height={image.size.height}
          color={outlineColor}
        />
      )}
      {renderUrl && <img
        src={renderUrl}
        alt=""
        draggable={false}
        crossOrigin="anonymous"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />}
      {markersVisible &&
        markers.map((m, i) => {
          const linked = objects[m.swatchId];
          const fill =
            linked?.type === "swatch" ? (linked as Swatch).color : m.color;
          const isActive =
            selectedIds.includes(m.swatchId) || hoveredSwatchId === m.swatchId;
          return (
            <div
              key={m.id}
              aria-label={`Extraction sample ${i + 1}`}
              onPointerDown={(e) => handleMarkerPointerDown(e, m)}
              onPointerMove={handleMarkerPointerMove}
              onPointerUp={handleMarkerPointerUp}
              onPointerCancel={handleMarkerPointerCancel}
              onPointerEnter={() => onHoverMarker(m.swatchId)}
              onPointerLeave={() => onHoverMarker(null)}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: m.position.x * image.size.width,
                top: m.position.y * image.size.height,
                transform: "translate(-50%, -50%)",
                cursor: "crosshair",
                touchAction: "none",
                // Center a 17px hit target (matches the SVG box from ExtractionMarkerDot).
                width: 17,
                height: 17,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ExtractionMarkerDot color={fill} active={isActive} />
            </div>
          );
        })}
    </div>
  );
}
