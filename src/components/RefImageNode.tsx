import type { ReferenceImage } from "../types";
import { useDrag } from "../hooks/useDrag";
import { SelectionBrackets } from "./SelectionBrackets";

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
}

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
}: RefImageNodeProps) {
  const handleMouseDown = useDrag(
    image.id,
    image.position,
    zoom,
    selected,
    onSelect,
    onMove,
    onMoveSelected,
    onSnapshot,
  );

  const outlineColor = lightMode ? "#000" : "#fff";

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
      {image.dataUrl && <img
        src={image.dataUrl}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />}
    </div>
  );
}
