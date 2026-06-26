# AMcue Phase 2b — Real Gemini AI Integration

Date: 2026-06-25
Status: Approved

## Purpose

Phase 2a built the full Generate → Queue → Approve/Reject → Feed loop using a stub
content generator so the team could click through real UI before any AI work. Phase 2b
replaces the stub with real Gemini API calls — real captions, real image prompts, and
real AI-generated images — behind the exact same interface, so no route or frontend
code other than the provider import and one extra field needs to change.

## Scope boundaries

- No changes to routes' request/response shape beyond adding `imagePrompt` to the
  `ContentItem` creation payload (the column already exists, unused, from Phase 1's
  schema).
- No changes to any frontend page — the queue/feed/detail pages already render
  `caption` and `imageUrl` from whatever the backend returns; real values flow through
  unchanged.
- No new abstraction layer beyond the existing `AiProvider`-shaped function — one new
  file (`geminiProvider.js`), one deleted file (`stubProvider.js`), one import swap.
- No retry/backoff logic, no caching, no rate limiting beyond what the frontend's
  existing "Generating..." disabled-button state already provides. If Gemini fails, the
  user just clicks Generate again.

## Confirmed model access

Verified live against the user's Gemini API key (text generation succeeded, image
generation returned real PNG bytes):
- Text: `gemini-2.5-flash`
- Image: `gemini-2.5-flash-image`

Both are called via the Gemini REST API (`generativelanguage.googleapis.com/v1beta`),
no SDK dependency needed — plain `fetch` calls, consistent with how the rest of the
backend avoids unnecessary dependencies.

## Provider interface

`backend/src/services/ai/geminiProvider.js` exports a single function:

```js
async function generateGeminiContent(project) {
  // returns { caption, imagePrompt, imageUrl }
}
```

Internally, this makes two real Gemini calls and one Cloudinary upload:

1. **Caption + image prompt (one text call):** A single prompt to `gemini-2.5-flash`
   asking for strict JSON output: `{"caption": "...", "imagePrompt": "..."}`. The
   caption is short, friendly social-media copy referencing the project's real
   `name`/`description`. The image prompt is a separate, vivid description written for
   an image model (no caption text, no UI chrome, just visual description) — kept
   distinct because captions and good image prompts read very differently, and the
   `ContentItem.imagePrompt` column already exists for exactly this.
2. **Image generation (one image call):** The `imagePrompt` from step 1 is sent to
   `gemini-2.5-flash-image`, which returns inline base64 PNG bytes.
3. **Upload:** Those bytes are passed through the existing
   `uploadImageBuffer(buffer, folder)` Cloudinary service (already used by the
   project-screenshot upload flow) to get a real hosted URL, uploaded to a new
   `amcue/generated` folder (separate from `amcue/screenshots`).

Any failure at any of these three steps (non-OK HTTP status, malformed/missing JSON,
missing image data, Cloudinary upload failure) throws — the caller (`/generate` route)
catches this.

## Route changes

`backend/src/routes/projects.js`, `POST /:id/generate`:

- Import changes from `generateStubContent` (sync, can't fail) to
  `generateGeminiContent` (async, can fail) from `../services/ai/geminiProvider`.
- The call is now `await`ed and wrapped in a `try/catch`.
- On success: `ContentItem` is created with `caption`, `imagePrompt`, and `imageUrl` —
  the new `imagePrompt` field is added to the existing `create` call's `data` object.
- On failure: respond `502` with `{ error: 'Content generation failed, please try
  again' }` — no `ContentItem` is created (no partial/incomplete content ever appears
  in the queue). This mirrors the existing error-handling pattern already used for
  Cloudinary upload failures in the create-project route.

## Removed

`backend/src/services/ai/stubProvider.js` is deleted — once the route imports
`geminiProvider`, the stub is dead code with no remaining caller.

## Testing approach

`backend/tests/content.test.js` already mocks `cloudinary` in `projects.test.js`'s
pattern; this phase adds the same treatment for the AI provider:

```js
jest.mock('../src/services/ai/geminiProvider', () => ({
  generateGeminiContent: jest.fn().mockResolvedValue({
    caption: 'Mock caption for Content Test App',
    imagePrompt: 'mock image prompt',
    imageUrl: 'https://res.cloudinary.com/fake/mock.png',
  }),
}));
```

The existing "generates a pending content item" test's assertions update to match the
mock's fixed return values instead of the stub's deterministic-by-project-id values
(`imageUrl` was previously asserted to contain the project id, which was a
stub-provider-specific guarantee, not a real requirement). A new test exercises the
error path: when `generateGeminiContent` rejects, the route returns 502 and no
`ContentItem` is persisted.

No real Gemini API calls happen in the automated test suite — it stays fast, free, and
deterministic, consistent with the project's existing approach (Cloudinary is similarly
never really called in tests).

## Secrets

New environment variable `GEMINI_API_KEY`, added as a placeholder to
`backend/.env.example`. The real key (already verified working against both required
models) and the real Cloudinary credentials (cloud name, API key, API secret — provided
by the user) are written directly into the gitignored `backend/.env` during
implementation, the same way `DATABASE_URL` and `JWT_SECRET` were handled in Phase 1.

## Manual verification

Once implemented, the full real flow is verified end-to-end against the live Neon DB,
live Gemini API, and live Cloudinary account: register → create project → generate →
confirm the `ContentItem`'s caption is real generated text (not the stub's templated
string), `imagePrompt` is populated, and `imageUrl` is a real `res.cloudinary.com` URL
pointing at an actual generated image → approve → confirm it appears in the feed with
the same real content.

## Out of scope for this phase

- Retry/backoff on Gemini failures
- Caching generated content or de-duplicating prompts
- Rate limiting beyond the existing frontend "Generating..." button disable
- Any change to the mock social-connect screen or the "generate today's content" manual
  trigger (still Phase 3/4 per the original phased plan)
