# AMcue — Platform Analytics Dashboard

Date: 2026-06-26
Status: Approved

## Purpose

Give each connected platform on the Connect tab a place to show "performance" —
mock views/likes/comments per post and in total. This is purely a UI/mock-data feature;
no real social API calls happen anywhere in this scope (that's explicitly a later,
separate piece of work the user wants to tackle after this and the conversational post
editor).

## Scope boundaries

- No real analytics API integration with any platform.
- No new database columns/migration — metrics are computed on the fly from each
  `ContentItem`'s id, deterministically, so the same item always shows the same numbers
  without persisting anything fake to the database.
- Covers all of a project's content items regardless of status (pending or approved),
  per explicit decision — not just approved/feed items.
- The analytics page is only ever linked to from a *connected* platform's card on the
  Connect page. The route itself doesn't enforce connection state server-side (no
  meaningful harm in it being reachable directly by URL — this is an internal practice
  app, not a security boundary), but the UI never surfaces a link to it for a
  disconnected platform.
- No charts, no time-series, no graphing library — the chosen layout (totals + a
  per-post list) was picked specifically to avoid that complexity.

## Mock metrics generation

A pure function, given a `ContentItem`'s `id`, deterministically derives
`{ views, likes, comments }`. Same approach as the existing
`https://picsum.photos/seed/<id>/...` pattern already used for stub/Gemini images —
seed a value from the id string, derive plausible-looking numbers from it. No
randomness across calls; the same item always returns the same numbers.

## Backend

New route: `GET /projects/:id/connect/:platform/analytics`

- `requireAuth` + the existing project-ownership check (`appProject.findFirst({ id,
  userId })`, 404 if not found/not owned) — same pattern as every other project route.
- `:platform` validated against the same 4-platform list used by the connect toggle
  route (`instagram`, `tiktok`, `youtube`, `x`); 400 on anything else.
- Fetches all `ContentItem`s for the project (no status filter).
- For each item, computes mock `{ views, likes, comments }` via the function above.
- Returns:
  ```json
  {
    "totals": { "views": 0, "likes": 0, "comments": 0 },
    "posts": [
      {
        "id": "...",
        "caption": "...",
        "imageUrl": "...",
        "status": "pending|approved|rejected",
        "views": 0,
        "likes": 0,
        "comments": 0
      }
    ]
  }
  ```
  `totals` is the sum across all returned posts.

## Frontend

- Connect page (`frontend/app/projects/[id]/connect/page.js`): when a platform's
  `connections[platform]` is `true`, its card's existing label/status area also renders
  a link to `/projects/:id/connect/:platform` (the new analytics page). Disconnected
  platforms show no such link.
- New page `frontend/app/projects/[id]/connect/[platform]/page.js`:
  - `TopTabs` with `active="connect"` (still part of the Connect tab's territory).
  - Fetches `GET /projects/:id/connect/:platform/analytics` on load.
  - Renders three small summary cards across the top (Views / Likes / Comments
    totals).
  - Below that, every post as a `Card`: thumbnail (`imageUrl`), caption, and its own
    views/likes/comments line.
  - Same `isLoggedIn()` redirect guard and `apiFetch` error-display pattern as every
    other project sub-page.

## Testing

`backend/tests/analytics.test.js`, same real-DB integration pattern as the rest of the
suite:
- Returns totals and a per-post breakdown for a project with multiple content items
  (mix of pending/approved) — confirms both statuses are included.
- The same project/platform combination returns identical numbers on a second call —
  confirms determinism.
- Two different content items return different (or at least independently-seeded, not
  hardcoded-identical) numbers — confirms the seed actually varies by id, not a static
  fixture.
- Invalid platform returns 400.
- Cross-user 404 (existing ownership pattern, same as every other route).

No frontend test suite, consistent with the project's existing scope decision.

## Out of scope

- Real social platform API integration (separate, later work)
- Conversational post editor (separate spec, not yet written)
- Charts, graphs, time-series data
- Per-platform variation in mock numbers (e.g. TikTok views skewing higher than
  Instagram) — all platforms use the same generation function for this pass
