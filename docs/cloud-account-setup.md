# Cloud Account Setup Handoff

Status: blocked on account creation  
Updated: 2026-05-15

This repo is prepared for first-class cloud collaboration up to the point where
real provider projects and credentials are required.

## What Exists Locally

- Cloud document/action contracts in `src/cloud/types.ts`.
- Server-safe action normalization in `src/cloud/normalize.ts`.
- Cloud budget, snapshot, presence, asset upload-intent, and server metadata
  helpers.
- Explicit local/cloud board location model so cloud IDs do not flow through
  local board persistence.
- Reference image compression before paste, drop, and Are.na import storage.
- Local/remote image handle support so future signed URLs do not become durable
  board state.
- Environment readiness checks in `src/cloud/config.ts`.
- An unconfigured backend port in `src/cloud/client.ts` that fails clearly until
  the real providers exist.

## Accounts Needed

Create these when ready:

- Clerk application for auth, organizations, invitations, and roles.
- Convex project for realtime board state, mutations, snapshots, and presence.
- Cloudflare project for hosting.
- Private Cloudflare R2 bucket for compressed reference image blobs.

Stay on free plans where possible. Before inviting partners broadly, verify the
current limits in each provider dashboard because free-tier limits can change.

## Environment Values

Copy `.env.example` to `.env.local` and fill these once the projects exist:

```bash
VITE_WASSILY_CLOUD_ENABLED=true
VITE_CLERK_PUBLISHABLE_KEY=
VITE_CONVEX_URL=
CLOUDFLARE_ACCOUNT_ID=
R2_BUCKET_NAME=
```

Keep secret keys out of Vite client env values. `CLOUDFLARE_ACCOUNT_ID` and
`R2_BUCKET_NAME` are shown here as server-side setup reminders; the browser does
not read them. Any R2 secret, API token, or Clerk webhook secret belongs in
Convex/Cloudflare server-side configuration, not in `VITE_*`.

## Setup Decisions

Decide during provider wiring:

- Whether R2 signed upload/download URLs are issued directly by Convex functions
  or through a small Cloudflare Worker.
- Which deployed origins are allowed by R2 CORS.
- The upload finalization proof: R2 ETag, SHA-256 hash, byte size, or a
  combination.
- Whether local-only boards remain visible in the production cloud build or move
  behind a development fallback.

Recommended default: keep the app shell public and local-capable, gate only
cloud boards and cloud workspace state behind sign-in.

## Next Implementation Step

After account setup, wire the providers in this order:

1. Install and initialize Clerk and Convex providers around the app without
   blocking the local canvas when env values are missing.
2. Add Convex schema, auth config, membership mirror, and role checks.
3. Create a realtime cloud-board vertical slice: create board, create swatch,
   move swatch, subscribe from two browser sessions, reject viewer writes.
4. Add R2 pending asset creation, signed upload/render URL issuance, upload
   finalization, and CORS configuration.
5. Expand cloud mutations across the rest of the durable canvas action set.
