# Collaboration Backend V1 Spec

Status: active implementation, updated 2026-05-15  
Scope: partner-ready cloud persistence, sharing, and realtime collaboration  
Naming note: Wassily is a working repo name. Product naming is intentionally TBD.

## Product Intent

The goal is to make the current single-user color studio usable with partners
without weakening its core identity.

This is not a pivot into a general whiteboard, design tool, asset manager, or
chat product. The cloud layer should make boards durable, shareable, and
collaborative while preserving the existing instrument model:

```text
moodboard -> color exploration -> UI implementation
```

The canvas remains the product surface. The backend exists to keep that canvas
available to the right people, in the right state, at the right time.

Cloud boards are multiplayer rooms. Local boards remain private single-user
documents stored in the browser.

The collaborative product can start fresh. V1 does not need to migrate existing
local boards into the cloud system. The cloud implementation should be
first-class from the start, not a compatibility layer wrapped around
localStorage.

The app shell should remain local-first and accessible without signing in.
Authentication gates cloud state, not the act of opening the instrument.

## Recommendation

Use:

- Clerk for authentication, users, organizations, invitations, and roles.
- Convex for realtime board state, permissions, mutations, action logs,
  snapshots, and presence metadata.
- Cloudflare for hosting, custom domain, previews, and future edge glue.
- Cloudflare R2 for compressed reference image blobs.

Privacy posture:

- App shell: public.
- Local boards: private to the current browser profile.
- Cloud boards: private by default.
- Cloud board access: authenticated and workspace-scoped.
- Shared board URLs: require sign-in, then return directly to the board.
- R2 images: private, signed URLs only.

Do not support public boards or anonymous "anyone with the link" access in V1.

Architecture:

```text
React / Vite app
  hosted on Cloudflare
        |
        v
Clerk auth and organizations
        |
        v
Convex realtime app backend
  workspaces
  members
  boards
  canvas objects
  actions
  snapshots
  presence
  asset metadata
        |
        v
Cloudflare R2
  compressed reference images
  optional thumbnails
```

## Why This Stack

### Convex

Convex matches the shape of the product better than a generic SQL backend for
V1. The app already has a reducer-shaped object model in
`src/state/canvas.ts`, and Convex is strongest when the client subscribes to
live query results and commits changes through server mutations.

Use Convex as the collaborative state authority, not just as a persistence
bucket.

### Clerk

Clerk should own identity and access. The immediate product need is partner
access: sign-in, invitations, organizations, and basic roles. Clerk also keeps
auth work away from the color/canvas code.

Use Clerk organizations for the workspace layer unless a future product reason
requires a fully custom organization model.

### Cloudflare

Cloudflare should host the app and hold image bytes, but it should not be the
primary collaboration database in V1.

Avoid building realtime sync on Workers, Durable Objects, D1, or R2 metadata
unless Convex proves insufficient. That path is powerful, but it spends product
energy on infrastructure that Convex already gives us.

### R2

Reference images are not archival assets. They are source material for taste,
extraction, and spatial thinking. This means they can and should be resized and
compressed aggressively before upload.

Store image bytes in R2, and store only metadata plus R2 object keys in Convex.

## Free-Tier Guardrails

The beta should be designed to live comfortably on free tiers for as long as
possible.

Current planning assumptions as of 2026-05-15:

- Clerk free tier should be enough for partner beta auth and organizations.
- Convex free tier should be enough for board state, metadata, and low-volume
  action logs, but image storage and egress should be treated as constrained.
- Cloudflare static hosting should be effectively free for this app shape.
- R2 is the safest free-tier place for compressed reference images.

Guardrails:

- Never persist base64 image data in Convex.
- Never persist base64 image data in localStorage.
- Compress and resize every imported image before remote upload.
- Store only committed canvas actions, not drag ticks.
- Throttle presence updates.
- Cap action logs and compact into snapshots.
- Keep generated previews and thumbnails small.
- Treat original image quality as non-goal for V1.

Beta budget targets:

- Max 5 active workspaces.
- Max 20 cloud boards per workspace.
- Max 150 canvas objects per board for the partner beta.
- Max 10 reference image imports per board by default.
- Max 1 MB compressed image blob per import, with a soft target under 400 KB.
- Max 2 MB total compressed image storage per board before warning.
- Max 500 retained action records per board before snapshot compaction.
- Snapshot every 100 committed actions or when a board crosses 250 KB of object
  JSON, whichever comes first.
- Presence cursor updates at most 1 Hz per user by default.
- Selection/tool presence can send immediately, then coalesce within 500 ms.
- Presence records expire after 30 seconds without heartbeat.

Kill switches:

- Disable cloud image import when R2 upload/signing fails or budget limits are
  reached; local image import may continue.
- Disable presence when Convex function call or document write volume becomes
  noisy.
- If Convex is unavailable during early beta, show cloud unavailable state and
  allow a local dev/fallback board only if local mode is still retained.

These limits must be enforced by backend mutations and upload signing, not only
by UI controls. Backend mutations should derive object/image deltas from the
normalized patch result rather than trusting client-supplied budget deltas. A
malformed client should not be able to exceed object count, image count,
compressed byte, action retention, or presence-write budgets.

## Non-Goals

Do not build these in V1:

- CRDT engine.
- Multiplayer text editing.
- Full branching/version history.
- Asset library or DAM behavior.
- Public gallery.
- Comments and threads.
- Fine-grained object-level permissions.
- Offline-first conflict resolution.
- Local-to-cloud board migration.
- End-to-end encrypted boards.
- Direct Figma integration.
- Server-side ramp solving as the only path.
- Production MCP/agent room participation.
- Public/anonymous board sharing.
- Anonymous multiplayer sessions.

The V1 collaboration model should be simple, durable, and legible.

## Existing Repo Fit

The current architecture has good seams for this work:

- `src/types/index.ts` contains the shared domain model.
- `src/state/canvas.ts` already centralizes mutations through reducer actions.
- `src/state/boardStore.ts` isolates local board persistence.
- `src/state/useBoardManager.ts` owns board lifecycle behavior.
- `src/state/imageStore.ts` isolates local IndexedDB image blobs.
- `src/hooks/usePasteAndDrop.ts` is the right entry point for image compression.
- `src/canvas/Canvas.tsx` coordinates interaction without owning color science.
- `src/engine/*` remains pure and should not learn about Convex, Clerk, or R2.

The cloud implementation should preserve these boundaries.

## Implementation Status

Completed before provider account setup:

- Durable cloud object/action contract in `src/cloud/types.ts`.
- Field-scoped cloud action normalization in `src/cloud/normalize.ts`.
- Reference image handle abstraction for local and remote render URLs.
- Browser-side reference image compression for paste, drop, and Are.na imports.
- Cloud asset metadata, R2 key, signed upload request, and budget helpers.
- Board budget limits, action compaction thresholds, and snapshot helpers.
- Presence throttling and stale-presence filtering helpers.
- Explicit local/cloud board location model.
- Environment/config readiness checks and an unconfigured backend port that
  fails clearly until Clerk and Convex are set up.

Account setup boundary:

- Create Clerk application and publishable key.
- Create Convex project and URL.
- Create Cloudflare account/project plus private R2 bucket.
- Decide whether R2 signed URLs are issued directly from Convex or through a
  small Cloudflare Worker.
- Expose R2 readiness through backend signer capability, not browser env.

## Data Ownership

### Client

The client owns:

- gesture state
- drag previews
- local camera
- temporary object URLs
- local optimistic state
- IndexedDB image cache
- pure engine execution for immediate feedback

### Convex

Convex owns:

- workspace membership
- board records
- durable canvas objects
- committed action records
- snapshots
- asset metadata
- permission checks
- presence records or presence coordination

### R2

R2 owns:

- compressed reference image blobs
- optional thumbnail blobs

## Proposed Convex Schema

Names are directional. Exact Convex schema syntax should be authored during
implementation.

### workspaces

```ts
{
  schemaVersion: 1;
  clerkOrgId: string;
  name: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
```

### workspaceMembers

```ts
{
  schemaVersion: 1;
  workspaceId: Id<"workspaces">;
  clerkUserId: string;
  role: "owner" | "editor" | "viewer";
  createdAt: number;
}
```

Decision for V1: keep a minimal Convex membership mirror keyed by Clerk org ID
and Clerk user ID. Clerk remains the identity source of truth, but Convex uses
the mirror for cheap, auditable authorization in every mutation/query. The
mirror can be updated by Clerk webhooks and reconciled on first access.

### boards

```ts
{
  schemaVersion: 1;
  workspaceId: Id<"workspaces">;
  name: string;
  settings: {
    lightMode: boolean;
    showConnections: boolean;
  };
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}
```

### canvasObjects

```ts
{
  schemaVersion: 1;
  boardId: Id<"boards">;
  objectId: string;
  type: "swatch" | "ramp" | "reference-image" | "connection" | "note";
  data: PersistedCanvasObjectData;
  revision: number;
  order?: number;
  updatedBy: string;
  updatedAt: number;
}
```

`data` should be the existing object shape, minus transient fields such as
`ReferenceImage.dataUrl`.

Do not allow arbitrary writes to `data`. Every object row must pass a
type-specific validator before it is written. Ramp rows must preserve the gamut
contract fields:

- `stops`
- `fallbackStops`
- `solveMetadata`
- `targetGamut`
- `seedHue`
- `seedChroma`
- `seedLightness`
- `mode`
- `stopCount`

Invalid ramp metadata is a data corruption bug, not a harmless display issue.

### boardActions

```ts
{
  schemaVersion: 1;
  boardId: Id<"boards">;
  actionId: string;
  actorId: string;
  actionType: CloudAction["type"];
  payload: CloudAction;
  createdAt: number;
}
```

Action records are for auditability, recovery, and future time travel. They are
not the primary read path for the live board.

### boardSnapshots

```ts
{
  schemaVersion: 1;
  boardId: Id<"boards">;
  snapshotId: string;
  state: PersistedCanvasSnapshot;
  actionCursor?: string;
  createdAt: number;
  createdBy: string;
}
```

Snapshots let us cap action log size and recover quickly.

### assets

```ts
{
  schemaVersion: 1;
  boardId: Id<"boards">;
  assetId: string;
  kind: "reference-image" | "thumbnail";
  r2Key: string;
  mimeType: "image/webp" | "image/avif" | "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
  status: "pending" | "ready" | "deleted";
  createdBy: string;
  createdAt: number;
  contentHash?: string;
  deletedAt?: number;
}
```

Asset authorization requirements:

- R2 buckets are private.
- Upload and download URLs are created only after Convex permission checks.
- The backend derives `r2Key` from an authorized asset row; clients never ask a
  signer to sign an arbitrary R2 key.
- Signed URL TTL should be short, around 5-15 minutes.
- R2 keys are random and workspace/board-scoped:
  `workspaces/{workspaceId}/boards/{boardId}/images/{assetId}.webp`.
- Uploads enforce MIME type, byte size, and image dimension limits.
- CORS allows only the deployed app origins.
- Deleting a reference image marks the asset deleted in Convex and schedules R2
  deletion. Hard deletion can be delayed for recovery, but deleted assets must
  stop receiving new signed URLs.

Upload state machine:

```text
compress locally
  -> request pending asset + signed upload URL
  -> backend checks role, board budgets, MIME, bytes, and dimensions
  -> backend creates pending asset row and derives R2 key
  -> browser uploads compressed blob to signed URL
  -> browser finalizes upload with byte size and hash/ETag evidence
  -> backend marks asset ready
  -> browser commits addReferenceImage cloud action
```

Abandoned pending uploads should be cleaned up opportunistically. Failed uploads
must not leave visible board objects that point at unavailable assets.

### presence

```ts
{
  schemaVersion: 1;
  boardId: Id<"boards">;
  userId: string;
  cursor?: { x: number; y: number };
  selectedObjectIds?: string[];
  activeTool?: string;
  updatedAt: number;
}
```

Presence should be ephemeral:

- Cursor writes are throttled to 1 Hz per user by default for beta cost control.
- Selection/tool changes can send immediately, then coalesce within 500 ms.
- Records older than 30 seconds are ignored by queries.
- Cleanup may delete stale records opportunistically.
- Presence must have a runtime kill switch for beta cost control.
- Backend mutations derive `userId` from auth, not from client payload.

## Sharing Scope

V1 shares at the workspace level.

If a partner belongs to a workspace, they can see that workspace's cloud boards
according to their workspace role. Board-level grants are deferred. This is
intentionally simpler than per-board sharing and fits the immediate partner beta
use case.

If this becomes too broad, add `boardMembers` later rather than complicating V1.

UI copy should make the boundary explicit: everyone in the workspace can see
the workspace's cloud boards according to their role. Do not imply a board is
private to its creator once it has been created inside a shared workspace.

## Reference Image Contract

Current type:

```ts
ReferenceImage {
  dataUrl: string;
  position: Point;
  size: Size;
  extraction?: ImageExtraction;
  source?: ReferenceImageSource;
}
```

V1 cloud shape:

```ts
ReferenceImage {
  id: string;
  type: "reference-image";
  dataUrl?: string; // legacy/local transient render URL
  renderUrl?: string; // cloud/local transient object URL or signed URL
  assetId?: string;
  imageHandle?: ImageHandle;
  position: Point;
  size: Size;
  extraction?: ImageExtraction;
  source?: ReferenceImageSource;
}
```

Persistence rule:

```text
Convex stores assetId and metadata.
R2 stores compressed bytes.
The browser creates renderUrl/dataUrl/object URLs for rendering.
```

The extraction model remains source-aware. Markers are normalized to the image,
so resized/compressed images do not break marker geometry.

`dataUrl` should be treated as a legacy/local rendering field, not durable
state. New cloud code should prefer `renderUrl` for session-only display and
should be able to render after fetching a fresh signed URL from asset metadata.

Before R2 integration, introduce an image handle abstraction:

```ts
type ImageHandle =
  | { kind: "local"; blobId: string; renderUrl?: string }
  | { kind: "remote"; assetId: string; renderUrl?: string; expiresAt?: number };
```

All rendering, extraction, eyedropper sampling, and marker editing should ask a
single helper for the current renderable URL. That helper is responsible for
refreshing signed URLs, handling missing/expired assets, and returning explicit
failure states.

R2 image display requirements:

- Use signed URLs only.
- Set image `crossOrigin` and R2 CORS so images can render and be sampled into
  canvas without tainting extraction/eyedropper canvases. Signed URL access is
  not sufficient by itself; the response must also allow the deployed app
  origin.
- When a signed URL expires, refresh it before extraction or sampling.
- If refresh fails, keep the reference object visible as unavailable rather than
  deleting board state.

## Image Compression Pipeline

On paste, drop, or Are.na import:

```text
1. Decode image in browser.
2. Resize to max long edge.
3. Convert to WebP by default.
4. Use compressed blob for canvas display.
5. Request a pending asset row and signed upload URL.
6. Upload compressed blob to R2.
7. Finalize upload so Convex marks the asset ready.
8. Commit the reference-image action.
9. Cache compressed blob in IndexedDB for local speed.
```

Recommended defaults:

- Max long edge: 1200 px for normal imports.
- Thumbnail long edge: 320 px if thumbnails become useful.
- Format: WebP first.
- Quality: 0.72 to 0.82.
- Preserve alpha only when input has meaningful alpha.

If a browser cannot encode WebP through canvas APIs, fall back to JPEG or PNG.
If browser decode fails or the compressor returns an unsupported MIME type, do
not create a cloud upload intent or mislabeled asset row.

Important: extraction should sample the same compressed/displayed image the user
sees. The tool is for reference color, not forensic image fidelity.

Color-space note: browser canvas encoding may collapse or normalize wide-gamut
image data. That is acceptable for reference images in V1. Canonical ramp color
truth remains OKLCH / Display P3, but compressed reference images are visual
source material, not color-managed proof assets. If a future workflow needs
P3-preserving reference sampling, it should be introduced as a separate image
pipeline and not block partner collaboration.

## Sync Model

Use server-authoritative committed mutations with optimistic local UI.

For cloud boards, realtime multiplayer is part of the V1 product contract, not
an optional later sync layer. Users in the same cloud board should see committed
object changes, presence, and selections update live.

Cloud boards must be routed through an explicit cloud document source. A cloud
board ID must not be treated as a local board ID, saved through localStorage, or
rehydrated from all local IndexedDB image blobs. Local boards and cloud boards
can share visual canvas components, but their document state paths are separate.

Cloud mutations must preserve reducer invariants. They should operate on a
typed subset of the existing `Action` model or a shared normalizer that mirrors
the reducer behavior in `src/state/canvas.ts`.

Forbidden:

- writing arbitrary `canvasObjects.data` from the client
- bypassing marker cleanup when linked swatches are deleted or promoted
- bypassing connection cleanup when referenced objects are deleted
- regenerating ramps without persisting `fallbackStops` and `solveMetadata`
- accepting actions that cannot be replayed or normalized deterministically

### Cloud action contract

Define a narrow `CloudAction` union instead of sending arbitrary reducer
actions over the network.

The first version should include only durable board operations:

```ts
type CloudAction =
  | CreateSwatchCloudAction
  | UpdateSwatchColorCloudAction
  | PromoteToRampCloudAction
  | ChangeStopCountCloudAction
  | CreateExtractionCloudAction
  | MoveExtractionMarkerCloudAction
  | AddReferenceImageCloudAction
  | DeleteObjectsCloudAction
  | CreateConnectionsCloudAction
  | CreateNoteCloudAction
  | UpdateNoteTextCloudAction
  | RenameBoardCloudAction;
```

Do not include UI-only actions such as selection, hover, context menu state,
camera movement, inspector position, or help overlay visibility. Selection can
appear in presence, not in durable board history.

The first implementation task is to define:

- `CloudPersistedCanvasObject`
- `CloudAction`
- server-safe validators
- server-safe normalization helpers
- field-scoped patch output

Do this before provider plumbing. The goal is to prove the document contract
before the app grows cloud UI around it.

### Cloud operation coverage matrix

Before wiring UI to cloud boards, every local canvas command must be assigned
one of these statuses:

- V1 cloud mutation: durable, realtime, optimistic, committed through Convex.
- Local preview then V1 commit: high-frequency gesture state stays local, final
  operation commits once.
- Disabled on cloud boards in V1: visible but intentionally unavailable.
- Local-only: never sent to cloud, such as camera and hover state.

Initial V1 mutation set:

- create/update/move/delete swatch
- promote/change ramp stop count
- create/move/clear extraction
- add reference image after finalized upload
- create/delete connection
- create/update note
- board settings
- board rename

Potentially deferred until after the vertical slice:

- duplicate
- harmonize
- ramp rename/custom name
- lock/unlock
- rotate hue and fine color adjustment variants
- remove individual ramp stop

### Committed object mutations

Examples:

- create swatch
- update swatch color
- promote to ramp
- change stop count
- create extraction
- move extraction marker
- add reference image
- delete objects
- create connections
- create or edit note
- rename board

These should be Convex mutations. Each mutation should:

1. Check membership and role.
2. Validate payload.
3. Load the affected current object revisions.
4. Normalize through the action/reducer compatibility layer.
5. Update only the fields touched by the operation.
6. Append a compact action record.
7. Touch board `updatedAt`.

Authoritative ramp generation happens in Convex mutations for operations that
create or regenerate ramps. The client may compute optimistic previews with the
same pure engine, but the stored ramp row should be produced or verified by the
server-side engine path so `stops`, `fallbackStops`, `solveMetadata`, and
`targetGamut` cannot be forged or drift from the gamut contract.

### Local-only or ephemeral state

Keep these local or presence-only:

- camera position
- in-progress drag preview
- in-progress color field drag
- eyedropper preview
- extraction marker drag preview
- hover state
- context menus
- inspector position
- help overlay
- note edit focus

Camera should stay local by default. Shared camera is a future presentation
feature, not collaboration V1.

Cloud gesture rule: high-frequency edits preview locally and commit once at the
gesture boundary. Moving objects, dragging extraction markers, eyedropper hover
updates, color-field drags, and note editing must not write every pointer/key
tick to Convex. If remote users need awareness during a gesture, send throttled
presence, not durable object mutations.

### Conflict behavior

Use operation-scoped last-write-wins for V1.

This is acceptable because the main collaborative unit is spatial objects, not
long-form text. If two users edit the same swatch at once, the later committed
mutation wins. Presence should make this rare and visible.

Do not write a full stale object over unrelated newer fields. Examples:

- A move operation updates `position` and revision metadata, not swatch color.
- A color operation updates `color`, ramp-derived fields when applicable, and
  revision metadata, not position.
- A note text operation updates `text`, not position.

Each `canvasObjects` row carries a `revision`. Mutations should either check the
revision for the fields they depend on or be explicitly field-scoped so stale
clients cannot erase unrelated edits.

## Fresh-Start Cloud V1

The collaborative V1 can start with new cloud boards only.

Do not spend V1 complexity on importing existing local boards, preserving legacy
localStorage board lists, or reconciling IndexedDB image blobs with R2 assets.
Those are migration features, not collaboration foundations.

Implementation posture:

- Cloud boards are the first-class product path.
- Local board code may remain temporarily for development fallback, but cloud
  board behavior should not be shaped around local persistence constraints.
- New cloud boards are created in Convex from the beginning.
- Reference images on cloud boards go through the compression/R2 pipeline from
  the beginning.
- Existing local boards can remain untouched in the user's browser.
- A future import/migration tool can be added after the multiplayer document
  model proves itself.

This keeps the core architecture clean: Convex owns durable collaborative board
state; R2 owns compressed image bytes; localStorage/IndexedDB are not the source
of truth for cloud documents.

## Permissions

Start with three roles:

- owner: manage workspace, invite, delete, edit
- editor: create and edit boards
- viewer: read-only board access

Permission checks must live in Convex functions. UI affordances are helpful but
not sufficient.

Cloud boards are private by default. A signed-in user can access a cloud board
only through workspace membership in V1. Shared board links are deep links into
private state: unauthenticated users sign in first, then land back on the board
if they are authorized.

Viewer behavior:

- Can load board.
- Can see presence if allowed.
- Cannot commit mutations.
- Can use local inspection tools that do not mutate state.

## UI Requirements

Cloud UI must stay quiet and instrument-shaped.

V1 remains local-first. The app should not show an auth gate before the canvas.
Cloud features are opt-in from the board/workspace surface: sign in, create a
cloud board, or accept an invitation.

Here, local-first means the instrument can open without identity. It does not
mean local persistence is the primary V1 document architecture.

Do not route first-time local users into a dashboard before they can create or
touch color. The cloud path can ask for identity; the blank local canvas should
not.

Acceptable V1 chrome:

- Small board location/status indicator in the board bar.
- Sign-in/account affordance outside the canvas focus area.
- Invite/share action in board menu.
- Subtle presence cursors or selection marks.
- Minimal sync status: saving, saved, offline, error.

Avoid:

- dashboards inside the canvas
- noisy collaboration sidebars
- toast-heavy state reporting
- persistent chat panel
- large onboarding banners

The color remains the loudest thing on screen.

## File-Level Implementation Plan

### Phase 1: Cloud document contract

Likely files:

- `src/types/index.ts`
- new `src/cloud/types.ts`
- new `src/cloud/normalize.ts`
- new Convex validators/helpers

Tasks:

- Define `CloudPersistedCanvasObject`.
- Define the first `CloudAction` union.
- Define field-scoped patch output.
- Extract or mirror server-safe domain normalization.
- Prove reducer invariants without React, localStorage, or IndexedDB imports.
- Add tests for delete/promote marker cleanup, connection cleanup, and ramp
  metadata preservation.

### Phase 2: Providers and auth

Likely files:

- `package.json`
- `src/main.tsx`
- new `src/cloud/*`
- new Convex directory and generated client files

Tasks:

- Add Convex and Clerk.
- Add provider wrappers.
- Add environment variable docs.
- Keep app usable without signed-in state.
- Set up minimal Clerk -> Convex membership mirror.
- Keep R2 account/bucket values server-side; client learns upload readiness from
  the signer/backend capability.

### Phase 3: Realtime room vertical slice

Likely files:

- `convex/schema.ts`
- `convex/auth.config.ts`
- `convex/workspaces.ts`
- `convex/boards.ts`
- `convex/canvasObjects.ts`
- new `src/state/useCloudCanvasState.ts`
- `src/canvas/Canvas.tsx`

Tasks:

- Define schema.
- Wire Clerk auth.
- Add role checks.
- Add explicit local/cloud document source routing.
- Create first workspace/board flow.
- Create a cloud board.
- Create one swatch through a Convex mutation.
- Move that swatch with local preview and one commit mutation.
- Subscribe through a Convex live query.
- Verify the update appears in two browser sessions.
- Verify viewer write rejection.

This phase proves the board is a realtime room before broadening the feature
surface.

### Phase 4: Image handle abstraction

Likely files:

- `src/types/index.ts`
- `src/canvas/Canvas.tsx`
- `src/components/RefImageNode.tsx`
- `src/hooks/usePasteAndDrop.ts`
- `src/hooks/useEyedropper.ts`
- `src/state/imageStore.ts`
- new `src/images/referenceImage.ts`

Tasks:

- Make image rendering go through an image handle/helper.
- Stop assuming durable `ReferenceImage.dataUrl`.
- Preserve local image behavior through the same abstraction.
- Define signed URL refresh and unavailable-image states.
- Verify extraction and eyedropper use non-tainted image sources.

### Phase 5: Image compression and upload

Likely files:

- `src/hooks/usePasteAndDrop.ts`
- `src/state/imageStore.ts`
- new `src/images/compress.ts`
- new `src/cloud/assets.ts`
- Convex asset mutations
- Cloudflare Worker or upload endpoint if direct R2 upload requires it

Tasks:

- Compress every imported image.
- Cache compressed blob locally.
- Create pending asset row and signed upload URL.
- Upload to R2.
- Finalize asset metadata in Convex.
- Render cloud images from remote/cache URL.

Local-first implementation notes:

- Import paths run through `src/images/compress.ts`.
- Default budget: 1 MB target, 1600 px longest edge, WebP first, JPEG fallback.
- Compression is best effort: browser-capable environments transcode through
  canvas; tests/non-DOM environments pass the original blob through.

### Phase 6: Full cloud board operations

Likely files:

- `src/state/canvas.ts`
- `src/canvas/Canvas.tsx`
- new `src/state/useCloudCanvasState.ts`
- new `src/components/PresenceLayer.tsx`
- Convex presence functions
- Convex canvas action functions

Tasks:

- Expand typed cloud mutations beyond swatches.
- Add authoritative server-side ramp generation.
- Add extraction marker operations with local preview and committed mutation.
- Add connection, note, delete, harmonize, and board setting operations.
- Add presence updates.
- Add read-only viewer behavior.
- Add basic conflict behavior.

### Phase 7: Hardening

Tasks:

- Compact action logs into snapshots.
- Cleanup deleted assets.
- Add fresh cloud board creation and hydration tests.
- Add permission tests.
- Add mandatory browser-level collaboration smoke test.

## Testing Strategy

Keep existing engine tests isolated from cloud concerns.

Add focused tests for:

- object normalization for cloud persistence
- reference image metadata serialization
- image compression helpers where possible
- Convex mutation authorization
- reducer/action compatibility for cloud mutations
- viewer role blocking writes
- action log compaction
- two authenticated sessions seeing the same swatch update
- stale field-scoped mutation behavior
- signed URL expiry/refresh
- R2 CORS/canvas sampling behavior
- upload limit enforcement

Do not make the slow ramp suites slower. Cloud tests should be separate and
cheap.

A browser-level collaboration smoke test is required for V1. It should prove at
least: two authenticated sessions can open the same cloud board, one session can
create/move a swatch, the other sees the update live, and a viewer session is
blocked from writing.

## Open Decisions

These can be decided during implementation:

- Exact WebP quality and max image dimension.
- Whether presence is stored in Convex documents or handled through a lighter
  heartbeat model while preserving the 1 Hz cursor / 30 second beta budget.
- Whether signed R2 URLs are issued directly by Convex-side code or through a
  small Cloudflare Worker.
- Whether to retain local-only boards in the cloud build as a fallback or move
  them behind a development flag.

## Acceptance Signals

V1 is successful when:

- A partner can sign in and access a shared board.
- Unauthenticated users can open the app shell and create local work.
- Unauthenticated and nonmember users cannot list workspaces, load board
  metadata, get signed image URLs, upload assets, or infer private board names
  from shared links.
- Two users can see the same board update in realtime.
- Cloud boards feel like shared rooms, not delayed persistence.
- Image references survive reload and board switching.
- Images are compressed before remote storage.
- Existing local boards are not migrated, and cloud V1 does not depend on them.
- The color engine remains pure and unchanged by cloud infrastructure.
- Viewer/editor permissions are enforced by the backend.
- Viewers cannot mutate objects or upload reference images.
- The UI still feels like the existing canvas, not a dashboard.
