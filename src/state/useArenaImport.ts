import { useCallback, useRef, useState } from "react";
import {
  importArenaImages,
  previewArenaChannel,
  type ArenaImagePreview,
  type ArenaImportedImage,
  type ArenaPreviewResult,
} from "../integrations/arena";
import type { Camera, Point, ReferenceImageSource, Size } from "../types";

const ARENA_IMPORT_COLUMNS = 4;
const ARENA_IMPORT_CELL_WIDTH = 204;
const ARENA_IMPORT_CELL_HEIGHT = 236;
const ARENA_IMPORT_MAX_WIDTH = 180;
const ARENA_IMPORT_MAX_HEIGHT = 212;

export type ArenaImportLoading = "preview" | "more" | "import" | null;

interface ArenaImportState {
  canvasPosition: Point;
  value: string;
  loading: ArenaImportLoading;
  error: string | null;
  preview: ArenaPreviewResult | null;
  selectedIds: number[];
}

interface ArenaLayoutImage {
  blob: Blob;
  dataUrl: string;
  position: Point;
  size: Size;
  source: ReferenceImageSource;
}

type AddReferenceImages = (images: ArenaLayoutImage[]) => string[];

interface UseArenaImportOptions {
  addReferenceImages: AddReferenceImages;
  containerRef: React.RefObject<HTMLDivElement | null>;
  camera: Camera;
}

export interface ArenaImportPromptBindings {
  anchor: Point;
  value: string;
  loading: ArenaImportLoading;
  error: string | null;
  preview: ArenaPreviewResult | null;
  selectedIds: number[];
  onChange: (value: string) => void;
  onSubmit: () => void;
  onLoadMore: () => void;
  onToggleImage: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onDismiss: () => void;
}

export interface UseArenaImportResult {
  open: (canvasPosition: Point) => void;
  props: ArenaImportPromptBindings | null;
}

export function useArenaImport({
  addReferenceImages,
  containerRef,
  camera,
}: UseArenaImportOptions): UseArenaImportResult {
  const [state, setState] = useState<ArenaImportState | null>(null);
  const stateRef = useRef(state);
  const operationIdRef = useRef(0);
  stateRef.current = state;

  const open = useCallback((canvasPosition: Point) => {
    operationIdRef.current++;
    setState({
      canvasPosition,
      value: "",
      loading: null,
      error: null,
      preview: null,
      selectedIds: [],
    });
  }, []);

  const submit = useCallback(async () => {
    const current = stateRef.current;
    if (!current) return;
    const operationId = ++operationIdRef.current;
    const input = current.value.trim();
    if (!input) {
      setState((prev) =>
        prev ? { ...prev, error: "Enter an Are.na channel." } : prev,
      );
      return;
    }

    try {
      if (!current.preview) {
        setState((prev) =>
          prev ? { ...prev, loading: "preview", error: null } : prev,
        );
        const preview = await previewArenaChannel(input);
        if (preview.images.length === 0) {
          throw new Error("No image blocks found.");
        }
        if (!isCurrentOperation(operationId, operationIdRef, stateRef)) return;
        setState((prev) =>
          prev
            ? {
                ...prev,
                loading: null,
                preview,
                selectedIds: preview.images.map((image) => image.id),
              }
            : prev,
        );
        return;
      }

      const selected = new Set(current.selectedIds);
      const previews = current.preview.images.filter((image) =>
        selected.has(image.id),
      );
      if (previews.length === 0) {
        throw new Error("Select at least one image.");
      }
      setState((prev) =>
        prev ? { ...prev, loading: "import", error: null } : prev,
      );
      const result = await importArenaImages(previews);
      if (result.images.length === 0) {
        throw new Error("No images could be imported.");
      }
      if (!isCurrentOperation(operationId, operationIdRef, stateRef)) return;
      addReferenceImages(layoutImported(result.images, current.canvasPosition));
      if (result.failed > 0) {
        const noun = result.failed === 1 ? "image" : "images";
        const failedIds = new Set(result.failedIds);
        setState((prev) =>
          prev
            ? {
                ...prev,
                loading: null,
                preview: filterPreviewImages(prev.preview, failedIds),
                selectedIds: prev.selectedIds.filter((id) => failedIds.has(id)),
                error: `Imported ${result.images.length}. ${result.failed} ${noun} failed to load.`,
              }
            : prev,
        );
      } else {
        setState(null);
      }
    } catch (error) {
      if (!isCurrentOperation(operationId, operationIdRef, stateRef)) return;
      setState((prev) =>
        prev ? { ...prev, loading: null, error: errorMessage(error) } : prev,
      );
    }
  }, [addReferenceImages]);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    const preview = current?.preview;
    const nextPage = preview?.pagination.nextPage;
    if (!current || !preview || !nextPage) return;
    const operationId = ++operationIdRef.current;

    setState((prev) =>
      prev ? { ...prev, loading: "more", error: null } : prev,
    );

    try {
      const next = await previewArenaChannel(current.value, {
        page: nextPage,
        per: preview.pagination.perPage,
      });
      if (!isCurrentOperation(operationId, operationIdRef, stateRef)) return;
      setState((prev) => {
        if (!prev?.preview) return prev;
        const merged = mergePreviews(prev.preview, next);
        const selected = new Set(prev.selectedIds);
        for (const image of next.images) selected.add(image.id);
        return {
          ...prev,
          loading: null,
          preview: merged,
          selectedIds: [...selected],
        };
      });
    } catch (error) {
      if (!isCurrentOperation(operationId, operationIdRef, stateRef)) return;
      setState((prev) =>
        prev ? { ...prev, loading: null, error: errorMessage(error) } : prev,
      );
    }
  }, []);

  const onChange = useCallback((value: string) => {
    setState((prev) =>
      prev
        ? {
            ...prev,
            value,
            error: null,
            preview: null,
            selectedIds: [],
          }
        : prev,
    );
  }, []);

  const onToggleImage = useCallback((id: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const selected = new Set(prev.selectedIds);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...prev, selectedIds: [...selected], error: null };
    });
  }, []);

  const onSelectAll = useCallback(() => {
    setState((prev) =>
      prev?.preview
        ? {
            ...prev,
            selectedIds: prev.preview.images.map((image) => image.id),
            error: null,
          }
        : prev,
    );
  }, []);

  const onSelectNone = useCallback(() => {
    setState((prev) =>
      prev ? { ...prev, selectedIds: [], error: null } : prev,
    );
  }, []);

  const onDismiss = useCallback(() => {
    operationIdRef.current++;
    setState(null);
  }, []);

  const props: ArenaImportPromptBindings | null = state
    ? {
        anchor: computeAnchor(state.canvasPosition, camera, containerRef),
        value: state.value,
        loading: state.loading,
        error: state.error,
        preview: state.preview,
        selectedIds: state.selectedIds,
        onChange,
        onSubmit: submit,
        onLoadMore: loadMore,
        onToggleImage,
        onSelectAll,
        onSelectNone,
        onDismiss,
      }
    : null;

  return { open, props };
}

function computeAnchor(
  canvasPosition: Point,
  camera: Camera,
  containerRef: React.RefObject<HTMLDivElement | null>,
): Point {
  const rect = containerRef.current?.getBoundingClientRect();
  return {
    x: (rect?.left ?? 0) + canvasPosition.x * camera.zoom + camera.x,
    y: (rect?.top ?? 0) + canvasPosition.y * camera.zoom + camera.y,
  };
}

function fitImportSize(naturalSize: Size): Size {
  const naturalWidth = Math.max(1, naturalSize.width);
  const naturalHeight = Math.max(1, naturalSize.height);
  const scale = Math.min(
    ARENA_IMPORT_MAX_WIDTH / naturalWidth,
    ARENA_IMPORT_MAX_HEIGHT / naturalHeight,
  );
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function layoutImported(
  images: ArenaImportedImage[],
  origin: Point,
): ArenaLayoutImage[] {
  return images.map((image, index) => {
    const size = fitImportSize(image.naturalSize);
    const col = index % ARENA_IMPORT_COLUMNS;
    const row = Math.floor(index / ARENA_IMPORT_COLUMNS);
    return {
      blob: image.blob,
      dataUrl: image.dataUrl,
      source: image.source,
      size,
      position: {
        x: origin.x + col * ARENA_IMPORT_CELL_WIDTH,
        y: origin.y + row * ARENA_IMPORT_CELL_HEIGHT,
      },
    };
  });
}

function mergePreviews(
  existing: ArenaPreviewResult,
  next: ArenaPreviewResult,
): ArenaPreviewResult {
  const existingIds = new Set(existing.images.map((image) => image.id));
  const newImages = next.images.filter(
    (image: ArenaImagePreview) => !existingIds.has(image.id),
  );
  return {
    channel: next.channel,
    images: [...existing.images, ...newImages],
    pagination: next.pagination,
    skipped: existing.skipped + next.skipped,
  };
}

function filterPreviewImages(
  preview: ArenaPreviewResult | null,
  ids: Set<number>,
): ArenaPreviewResult | null {
  if (!preview) return null;
  return {
    ...preview,
    images: preview.images.filter((image) => ids.has(image.id)),
  };
}

function isCurrentOperation(
  operationId: number,
  operationIdRef: React.RefObject<number>,
  stateRef: React.RefObject<ArenaImportState | null>,
): boolean {
  return operationIdRef.current === operationId && stateRef.current !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Are.na import failed.";
}
