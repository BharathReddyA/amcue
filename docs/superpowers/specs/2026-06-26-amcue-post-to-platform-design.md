# AMcue — Post to Platform (Real X + Mock Others)

Date: 2026-06-26
Status: Approved

## Purpose

Add a "choose platform and post" action to each approved feed item. For X
(Twitter), this is real: real OAuth login, real tweet publishing. For Instagram,
TikTok, and YouTube, posting stays mocked (consistent with how Connect already works
for them) — this explicitly diverges from the project's earlier "everything is
mocked" rule, by the user's direction, scoped to X only.

## Scope boundaries

- Real integration is X-only. Instagram/TikTok/YouTube posting records a
  `ContentItemPost` row with no external API call — same mock philosophy as the
  existing Connect toggle.
- This plan builds the full feature, including the real X OAuth routes and posting
  logic, but the real X Client ID/Secret are not yet available. `X_CLIENT_ID` /
  `X_CLIENT_SECRET` are added as empty placeholders in `.env.example`; the real values
  are added to `backend/.env` later, whenever the user finishes the X developer app's
  "User authentication settings" step. Until then, the X OAuth login route will fail
  with a clear error (missing client id) rather than silently behaving like it works —
  this is expected and acceptable for this phase.
- No token refresh automation — if an X access token expires, posting fails with a
  clear error telling the user to reconnect. No background refresh job.
- No un-posting / deleting a `ContentItemPost` record.
- A `ContentItem` can be posted to multiple platforms over time; each is a separate
  `ContentItemPost` row, not a single status field.

## Data model

```prisma
model User {
  // ...existing fields...
  xAccessToken    String?
  xRefreshToken   String?
  xTokenExpiresAt DateTime?
  xUsername       String?
}

model ContentItem {
  // ...existing fields...
  posts ContentItemPost[]
}

model ContentItemPost {
  id            String      @id @default(uuid())
  contentItemId String
  contentItem   ContentItem @relation(fields: [contentItemId], references: [id])
  platform      String      // "instagram" | "tiktok" | "youtube" | "x"
  externalUrl   String?     // real tweet URL for X, null for mock platforms
  postedAt      DateTime    @default(now())
}
```

`mockConnections.x` (the existing JSON boolean) becomes unused for X going forward —
X's connected status is now computed from `Boolean(user.xAccessToken)`.
`instagram`/`tiktok`/`youtube` keep using `mockConnections` exactly as before.

## X OAuth (real)

Standard OAuth 2.0 Authorization Code flow with PKCE, scopes
`tweet.write tweet.read users.read offline.access`.

- `GET /auth/x/login` — requires the caller to already be logged into AMcue
  (`requireAuth`). Generates a PKCE code verifier/challenge, stores the verifier
  server-side keyed by a short-lived state value (an in-memory `Map` is fine for this
  scope — no separate table, no Redis), and redirects the browser to X's
  `https://twitter.com/i/oauth2/authorize` endpoint with that `state` and the
  `code_challenge`.
- `GET /auth/x/callback` — receives `code` and `state` from X, looks up the stored PKCE
  verifier and associated AMcue user id by `state`, exchanges the code for
  access+refresh tokens at X's token endpoint, fetches the user's X username via
  `GET /2/users/me`, saves `xAccessToken`/`xRefreshToken`/`xTokenExpiresAt`/`xUsername`
  on the `User`, then redirects to the frontend Connect page
  (`/projects/:id/connect` — the project id is round-tripped through `state` too).
- If `X_CLIENT_ID`/`X_CLIENT_SECRET` aren't set, `/auth/x/login` returns a clear 500
  error rather than attempting the redirect with empty credentials.

## Posting (real for X, mock for others)

`POST /content/:id/post`, body `{ platform }`:

- Ownership + `pending`/`approved` check is **not** required to be `pending` here —
  unlike the chat editor, posting only makes sense for `approved` items, so this route
  404s unless `status === 'approved'`.
- `platform: 'x'`:
  - 400 if `user.xAccessToken` is missing ("Connect X first").
  - Uploads the item's image to X's media upload endpoint
    (`POST https://upload.twitter.com/1.1/media/upload.json`, using the stored OAuth 2.0
    access token as a Bearer token), then creates the tweet
    (`POST https://api.x.com/2/tweets`) with the caption as text and the returned
    `media_id` attached.
  - Saves a `ContentItemPost` with `externalUrl` built from the response tweet id
    (`https://x.com/i/web/status/:id` is a valid universal tweet URL not requiring the
    username).
- `platform: 'instagram' | 'tiktok' | 'youtube'`: saves a `ContentItemPost` with
  `externalUrl: null`, no external call — mock, matching the rest of the app.
- Any real X API failure (expired token, rate limit, network) returns 502 with a clear
  message; no `ContentItemPost` row is created on failure.

## Frontend

- Connect page: X's card is special-cased — "Connect" is a real `<a href="/auth/x/login">`
  link (full navigation), not the `apiFetch` toggle the other three platforms use.
  "Disconnect" for X still POSTs to the existing toggle-style endpoint, but for X that
  route now clears the four `x*` token fields instead of flipping a JSON boolean
  (implementation detail in the plan, not a new route).
- Feed page: each item gets a platform-picker control (the four platforms) and a "Post"
  button, plus a small list of platforms it's already been posted to (with a link to
  `externalUrl` when present, i.e. for X). Selecting X while not connected shows an
  inline message linking to the Connect page rather than attempting the post.

## Testing

`backend/tests/postToPlatform.test.js`, same real-DB pattern as the rest of the suite.
The X API calls (media upload, tweet creation, OAuth token exchange) are all mocked
(via `jest.mock`) — no real X API calls in the automated suite, consistent with how
Gemini and Cloudinary are already mocked in tests:
- Mock-posting to instagram/tiktok/youtube creates a `ContentItemPost` with no
  `externalUrl` and doesn't call any X-related code.
- Posting to X when not connected (`xAccessToken` is null) returns 400, no
  `ContentItemPost` created.
- Posting to X when connected (mocked token + mocked X API responses) creates a
  `ContentItemPost` with a real-shaped `externalUrl`.
- Posting to a non-`approved` item returns 404.
- A content item can have multiple `ContentItemPost` rows across platforms.

No live OAuth/X API verification is possible yet without the real Client ID/Secret —
that verification step is deferred until the credentials are added.

## Out of scope

- Real Instagram/TikTok/YouTube integration
- Token refresh automation
- Un-posting / deleting post records
- Rate limiting on the post action
