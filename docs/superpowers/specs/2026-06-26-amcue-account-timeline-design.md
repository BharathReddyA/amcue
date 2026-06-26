# AMcue — Account Header + Timeline on the Analytics Page

Date: 2026-06-26
Status: Approved

## Purpose

The existing per-platform analytics page (`/projects/:id/connect/:platform`) shows mock
engagement totals and AMcue-posted items. This adds an account header (who you're
connected as, a profile link, a Disconnect button) and a recent-posts timeline — real
for X (an actual API call against your connected account), deterministic placeholder
data for Instagram/TikTok/YouTube, so all four platforms keep the same page shape.

## Scope boundaries

- Real data only for X. Instagram/TikTok/YouTube get fixed, non-functional placeholder
  account info and a small canned set of placeholder timeline entries — consistent with
  how the rest of the app treats those three platforms.
- Timeline shows the 10 most recent items, newest first, no pagination/load-more.
- No caching of the real X timeline fetch — it's re-fetched on every page load. No
  rate-limit handling beyond the existing generic error display.
- Disconnect button on this page reuses the existing toggle route
  (`POST /projects/:id/connect/:platform`) — no new disconnect endpoint.

## Data model

```prisma
model User {
  // ...existing fields...
  xUserId String?  // the X account's numeric id, needed to fetch its timeline
}
```

`xUserId` is captured during the OAuth callback (already calling `GET /2/users/me`,
which returns both `id` and `username` — previously only `username` was kept).

## Backend

`backend/src/services/x/xAuth.js`: `fetchXUsername` is replaced by `fetchXProfile`,
returning `{ id, username }` instead of just a username string. The OAuth callback
route (`backend/src/routes/xAuth.js`) stores both `xUserId` and `xUsername`.

`backend/src/services/x/xApi.js` gains `fetchRecentTweets(accessToken, userId,
maxResults = 10)`, calling `GET https://api.x.com/2/users/:id/tweets?max_results=10&tweet.fields=created_at`
with the stored OAuth2 bearer token, returning an array of `{ id, text, url, createdAt }`
(`url` built as `https://x.com/i/web/status/:id`, same pattern as the existing
post-to-platform `externalUrl`).

The existing `GET /projects/:id/connect/:platform/analytics` route (in
`backend/src/routes/projects.js`) gains two new response fields:

```json
{
  "totals": { "views": 0, "likes": 0, "comments": 0 },
  "posts": [ /* unchanged - AMcue-posted items for this platform */ ],
  "account": { "username": "...", "profileUrl": "..." },
  "timeline": [ { "id": "...", "text": "...", "url": "...", "createdAt": "..." } ]
}
```

- `platform === 'x'` and connected (`xAccessToken` set): `account` is the real
  `{ username, profileUrl: "https://x.com/" + username }`; `timeline` is the real
  result of `fetchRecentTweets`. If the fetch fails, `timeline` is an empty array (the
  rest of the response still succeeds — a timeline-fetch failure shouldn't break the
  whole analytics page) and the failure is logged server-side.
- `platform === 'x'` and not connected: `account: null`, `timeline: []`.
- `platform` is `instagram`/`tiktok`/`youtube`: `account` is a fixed placeholder
  (`{ username: "demo_<platform>_user", profileUrl: "#" }`) and `timeline` is a fixed,
  hardcoded array of 2-3 generic placeholder entries (same content regardless of
  platform — purely decorative, not meant to look platform-specific).

## Frontend

`frontend/app/projects/[id]/connect/[platform]/page.js` gains, above the existing
totals cards:
- An account header: "Connected as @{username}", a "View profile" link (`profileUrl`,
  opens in a new tab for X; for mock platforms it's present but `href="#"`), and a
  "Disconnect" button that calls the existing `POST /projects/:id/connect/:platform`
  toggle route, then redirects back to the Connect page on success.

Below the existing AMcue-posted-items list, a new "Recent posts" section renders
`timeline` entries (text + a link to `url`), real for X, the fixed placeholder set for
the other three.

## Testing

`backend/tests/accountTimeline.test.js` (or extending `analytics.test.js`), with the X
API calls mocked (same pattern as `xApi.js` is already mocked in
`postToPlatform.test.js`):
- Analytics response for a connected X user includes real-shaped `account`/`timeline`
  from the mocked `fetchRecentTweets`.
- Analytics response for a disconnected X user has `account: null`, `timeline: []`.
- Analytics response for instagram/tiktok/youtube includes the fixed placeholder
  `account`/`timeline`, regardless of connection state.
- If `fetchRecentTweets` throws, the route still returns 200 with `timeline: []` (not a
  502) — the totals/posts portion of the response isn't broken by a timeline failure.

## Out of scope

- Real Instagram/TikTok/YouTube account info or timelines
- Pagination/load-more on the timeline
- Caching the X timeline fetch
- Editing/deleting real tweets from this page
