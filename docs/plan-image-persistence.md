# Plan: Reference Image Persistence

## Problem

Reference images dropped/pasted onto the canvas are session-only. Reload the page and they're gone — only the extracted color swatches survive. The `dataUrl` (base64) is too large for localStorage's 5MB cap, so `saveToStorage` explicitly filters them out.

## Approach

**IndexedDB for blobs, localStorage for metadata.**

Store the raw image `Blob` in IndexedDB (keyed by object ID). Continue using localStorage for everything else — including reference image metadata (position, size) with the image data stripped. On page load, read blobs from IndexedDB, create object URLs, and merge them into the restored state.

No new dependencies. No backend. No external services. IndexedDB is browser-native, stores blobs without base64 overhead, and has generous limits (Chrome: 60% of disk, Firefox: 10GB, Safari: ~1GB for engaged sites).

## Files Changed

### New: `src/state/imageStore.ts`

Thin IndexedDB wrapper (~50 lines). One database (`wassily`), one object store (`images`).

```
initImageStore() → Promise<void>
  Opens/creates the database. Called once on app mount.

storeImageBlob(id: string, blob: Blob) → Promise<void>
  Stores a blob keyed by the canvas object ID.

loadAllImageBlobs() → Promise<Array<{ id: string, blob: Blob }>>
  Returns all stored blobs. Used on page load.

deleteImageBlob(id: string) → Promise<void>
  Deletes a single blob by ID.

cleanOrphanedBlobs(activeIds: Set<string>) → Promise<void>
  Deletes all blobs whose IDs are NOT in the active set.
  Called during the debounced save cycle to garbage-collect.
```

Also calls `navigator.storage.persist()` on first blob store to protect against Safari's 7-day ITP eviction.

### Changed: `src/state/canvas.ts`

**Action change:**

`ADD_REFERENCE_IMAGE` gains an optional `id` field. When provided, the reducer uses it instead of `genId()`. This lets the caller generate the ID before dispatch so the blob can be stored in IndexedDB first.

```ts
| {
    type: "ADD_REFERENCE_IMAGE";
    id?: string;        // ← new: caller-provided ID
    dataUrl: string;
    position: Point;
    size: { width: number; height: number };
  }
```

**New action:**

`RESTORE_IMAGE_URLS` — patches `dataUrl` on reference image objects after async blob load. Added to `SKIP_HISTORY` (loading blobs is not an undoable user action).

```ts
| {
    type: "RESTORE_IMAGE_URLS";
    urls: Record<string, string>;  // id → objectUrl
  }
```

**`saveToStorage` change (line 477-483):**

Instead of filtering out reference images entirely, include them with `dataUrl` stripped:

```ts
for (const [id, obj] of Object.entries(state.objects)) {
  if (obj.type === "reference-image") {
    // Include metadata (position, size) but strip image data
    filteredObjects[id] = { ...obj, dataUrl: "" };
  } else {
    filteredObjects[id] = obj;
  }
}
```

Position and size now persist in localStorage. Image data lives only in IndexedDB.

**Debounced save — orphan cleanup:**

After writing to localStorage, call `cleanOrphanedBlobs()` with the set of reference image IDs currently in state. This garbage-collects blobs for deleted images.

Because cleanup is debounced (300ms after last state change), undo within that window preserves the blob. Even after cleanup, the undo state contains `dataUrl: ""` for the restored object — the image just won't render. This is an acceptable edge case (undo a delete after the blob is cleaned up = image placeholder without content). If this matters, the cleanup delay can be increased to e.g. 2 seconds.

**`useCanvasState` — async blob restore on mount:**

```ts
useEffect(() => {
  (async () => {
    await initImageStore();
    const blobs = await loadAllImageBlobs();
    const urls: Record<string, string> = {};
    for (const { id, blob } of blobs) {
      urls[id] = URL.createObjectURL(blob);
    }
    if (Object.keys(urls).length > 0) {
      dispatch({ type: "RESTORE_IMAGE_URLS", urls });
    }
  })();
}, []);
```

On mount: open IndexedDB, load all blobs, create object URLs, patch state. Reference images appear once the blobs load (typically <50ms — imperceptible).

**`addReferenceImage` callback change:**

Becomes async. Generates a stable ID, stores the blob, then dispatches:

```ts
const addReferenceImage = useCallback(
  async (
    blob: Blob,
    dataUrl: string,
    position: Point,
    size: { width: number; height: number },
  ) => {
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await storeImageBlob(id, blob);
    dispatch({ type: "ADD_REFERENCE_IMAGE", id, dataUrl, position, size });
  },
  [],
);
```

The `img_` prefix is cosmetic — IDs are opaque strings. The blob is stored before the state update so it's always available for persistence.

### Changed: `src/canvas/Canvas.tsx`

**Drop handler (~line 389):** Pass the `File` object (which is a `Blob`) to `addReferenceImage` alongside the existing `dataUrl`:

```ts
// Before:
addReferenceImage(dataUrl, { x: dropX, y: dropY }, { width, height });

// After:
addReferenceImage(file, dataUrl, { x: dropX, y: dropY }, { width, height });
```

Same change in the paste handler (~line 460).

**No other changes to Canvas.tsx.** The `<RefImageNode>` component already renders `<img src={image.dataUrl}>` — both data URLs and object URLs work as `src` values.

### Unchanged

- `src/types/index.ts` — `ReferenceImage.dataUrl: string` stays as-is. At runtime it holds either a data URL (from drop/paste) or an object URL (from IndexedDB reload). Both are valid `<img src>` values.
- `src/components/SwatchNode.tsx` — `RefImageNode` renders unchanged.
- No new dependencies in `package.json`.

## Data Flow

### Adding an image (drop/paste)

```
User drops file
  → Canvas gets File object
  → Generate stable ID
  → Store blob in IndexedDB (async, ~5ms)
  → Dispatch ADD_REFERENCE_IMAGE with dataUrl + pre-generated ID
  → State has reference image with full dataUrl
  → Renders immediately
  → Debounced save writes metadata (position, size) to localStorage
```

### Page reload

```
loadFromStorage() runs synchronously
  → Reference images load with dataUrl: "" (stripped)
  → They exist in state but can't render (no image source)

useEffect runs on mount
  → initImageStore() opens IndexedDB
  → loadAllImageBlobs() reads all stored blobs
  → Create objectUrl for each via URL.createObjectURL()
  → Dispatch RESTORE_IMAGE_URLS to patch dataUrl fields
  → Images render (<50ms after mount — imperceptible)
```

### Deleting an image

```
User selects image, presses Delete
  → DELETE_SELECTED removes from state
  → Undo checkpoint is created (image is in undo history)
  → Debounced save runs after 300ms:
    - Writes state (without the image) to localStorage
    - Calls cleanOrphanedBlobs() — deletes blob from IndexedDB

If user undoes within 300ms:
  → Image is restored to state with its dataUrl intact (still a valid objectUrl)
  → Debounced save sees the image in state — blob is NOT orphaned — no cleanup

If user undoes after cleanup:
  → Image is restored to state but dataUrl points to revoked/cleaned objectUrl
  → Image renders as broken (acceptable edge case for undo-after-gc)
  → Could be improved later with a re-fetch from IndexedDB on undo
```

## Edge Cases

### Safari 7-day eviction
Safari's ITP deletes all script-writable storage (including IndexedDB) after 7 days without a visit. Mitigated by calling `navigator.storage.persist()` on first blob store. Safari 17+ respects this for engaged sites. Older Safari: images may be lost after 7 days of inactivity, which matches the session-only behavior users already experience.

### Private/incognito mode
IndexedDB is severely limited or disabled. The app gracefully degrades — `storeImageBlob` catches and silently ignores errors, images work in-session but don't persist. Same as current behavior.

### Large images
A 10MP photo as JPEG is ~3-5MB as a blob (much less than the ~6MB base64 data URL). IndexedDB can handle hundreds of these within browser quotas. No special handling needed.

### Blob/objectUrl lifecycle
Object URLs created via `URL.createObjectURL()` hold a reference to the blob in memory. They must be revoked when no longer needed. Cleanup happens during `cleanOrphanedBlobs()` — before deleting a blob, the corresponding objectUrl is revoked. Tab close/reload automatically cleans up all object URLs.

### IndexedDB unavailable
If IndexedDB fails to open (rare — browser bug, permissions), all image operations fall back to session-only behavior. `initImageStore` catches errors and sets a flag; `storeImageBlob` becomes a no-op. No user-visible error.

## Verification

1. `npm run dev` — start dev server
2. Drop an image onto canvas — verify it appears with extracted swatches
3. Reload the page — **image persists** with correct position and size
4. Move the image, reload — position is preserved
5. Delete the image, reload — image is gone (cleaned up from IndexedDB)
6. Drop image, Cmd+Z (undo) — image disappears. Cmd+Shift+Z (redo) — image reappears
7. Private/incognito window — images work in-session but don't persist on reload
8. `npm run build` — no type errors

## Not In Scope

- Thumbnail previews during blob load (images appear once blobs load — fast enough)
- Storage quota UI (showing remaining space)
- Image compression/resize before storing (images are already compressed as JPEG/PNG)
- Migration from old sessions (no old blobs to migrate — this is purely additive)
