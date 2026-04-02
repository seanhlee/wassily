import { useCallback, useRef } from "react";

/**
 * Shared drag logic for canvas objects.
 *
 * Handles click-vs-drag detection, single or multi-select drag,
 * and undo snapshots at drag boundaries.
 */
export function useDrag(
  id: string,
  position: { x: number; y: number },
  zoom: number,
  selected: boolean,
  onSelect: (id: string, additive: boolean) => void,
  onMove: (id: string, x: number, y: number) => void,
  onMoveSelected: (dx: number, dy: number) => void,
  onDragSnapshot?: () => void,
) {
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastDelta = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey) return; // ignore right-click and Ctrl+click (macOS right-click)
      e.stopPropagation();
      isDragging.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      lastDelta.current = { x: 0, y: 0 };
      // Capture shiftKey now — React's SyntheticEvent gets nullified after this handler returns
      const shiftKey = e.shiftKey;

      const handleMove = (me: MouseEvent) => {
        const dx = (me.clientX - dragStart.current.x) / zoom;
        const dy = (me.clientY - dragStart.current.y) / zoom;
        if (!isDragging.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
          isDragging.current = true;
          onDragSnapshot?.(); // undo checkpoint before drag
        }
        if (isDragging.current) {
          const incDx = dx - lastDelta.current.x;
          const incDy = dy - lastDelta.current.y;
          lastDelta.current = { x: dx, y: dy };

          if (selected) {
            onMoveSelected(incDx, incDy);
          } else {
            onMove(id, position.x + dx, position.y + dy);
          }
        }
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
        if (!isDragging.current) {
          onSelect(id, shiftKey);
        }
        setTimeout(() => {
          isDragging.current = false;
        }, 0);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [id, position, zoom, selected, onSelect, onMove, onMoveSelected, onDragSnapshot],
  );

  return handleMouseDown;
}
