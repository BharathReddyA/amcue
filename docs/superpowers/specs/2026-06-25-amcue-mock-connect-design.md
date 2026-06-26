# AMcue — Mock Social-Connect Screen

Date: 2026-06-25
Status: Approved

## Purpose

The original Phase 1 design called for a mock "Connect Instagram / Connect TikTok"
screen — a realistic-looking but entirely fake connect flow (no real OAuth, no business
verification needed). The `User.mockConnections` JSON field has existed unused in the
schema since Phase 1. This adds the actual routes and UI to read/toggle it.

## Scope boundaries

- No real OAuth to Instagram or TikTok, ever. Connecting is a database write, nothing
  else.
- Connection state is account-wide (`User.mockConnections`), not per-project — this was
  already decided in the Phase 1 schema design. The connect screen is reachable from a
  project's page (per the original design), but connecting/disconnecting on one
  project's Connect tab affects the same account-wide state visible from any other
  project's Connect tab.
- Connecting is a toggle (connect ↔ disconnect), not one-way. Both directions are
  equally fake — there is no real "revoke" happening anywhere.
- No new database migration — `User.mockConnections` already exists from Phase 1.

## API routes

Both new routes nest under `/projects/:id`, consistent with the existing `generate` and
`content` routes, and both require `requireAuth` + the same project-ownership check
already used elsewhere (`prisma.appProject.findFirst({ id, userId })` → 404 if not
found/not owned) — even though the data they touch (`User.mockConnections`) isn't
itself scoped to the project, this keeps the URL shape and auth pattern consistent with
every other route in `projects.js`.

- `GET /projects/:id/connect`
  - Ownership check on the project (404 if not found/not owned).
  - Returns the requesting user's `mockConnections`: `{ instagram: bool, tiktok: bool }`.

- `POST /projects/:id/connect/:platform`
  - Ownership check on the project (404 if not found/not owned).
  - `:platform` must be `instagram` or `tiktok` (400 otherwise).
  - Toggles that key in the user's `mockConnections` (connected → disconnected,
    disconnected → connected) and persists it via `prisma.user.update`.
  - Returns the updated `mockConnections` object.

## Frontend

- `frontend/components/TopTabs.js` gains a 4th tab: `Connect`, linking to
  `/projects/:id/connect`, following the same `active` prop pattern as the existing
  three tabs.
- New page `frontend/app/projects/[id]/connect/page.js`:
  - Fetches `GET /projects/:id/connect` on load.
  - Renders two `Card`s, one for Instagram and one for TikTok, each showing the
    platform name, a status line ("Connected ✓" or "Not connected"), and a `Button`
    that calls `POST /projects/:id/connect/:platform` and updates the displayed status
    from the response (no full page reload).
  - Same `isLoggedIn()` redirect guard and `apiFetch` error-display pattern as every
    other project sub-page.

## Testing

`backend/tests/connect.test.js`, same real-DB integration pattern as `content.test.js`:
- Connecting a previously-disconnected platform returns `{ instagram: true, ... }` (or
  the equivalent for tiktok).
- Connecting again (toggle) returns it back to `false`.
- An invalid platform (e.g. `facebook`) returns 400.
- `GET /projects/:id/connect` reflects whatever state the POSTs left it in.

No frontend test suite, consistent with the project's existing scope decision.

## Out of scope

- Real OAuth integration with any platform
- Per-project (rather than account-wide) connection state
- Any UI elsewhere referencing connection state (e.g. showing a "connected" badge on
  the project list) — this screen is self-contained
