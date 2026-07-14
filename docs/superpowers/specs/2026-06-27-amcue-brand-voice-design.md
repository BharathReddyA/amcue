# AMcue — Self-Improving Brand Voice

Date: 2026-06-27
Status: Approved

## Purpose

Market research (Jan 2026) shows AI social tools converging on scheduling, multi-platform
publishing, and one-shot brand-voice extraction. AMcue's unique asset is editorial
behavior data nobody else collects or uses: every approve/reject decision and every
chat-edit conversation is already persisted. This feature turns that data into a brand
voice that improves generation quality the more the user reviews — the core
differentiator: *the product learns from how you edit, not from a one-time website scan*.

## Scope boundaries

- No new learning infrastructure: no embeddings, no vector DB, no background jobs, no
  fine-tuning. "Learning" is retrieval of existing DB rows + prompt injection.
- Voice is per-project (`AppProject`), not per-user or cross-project.
- The distilled summary is read-only in v1 (no user editing of the summary text).
- Screenshot-grounded image generation is a separate, later spec.

## Core mechanism: generation-time voice context (automatic)

A new service `backend/src/services/ai/brandVoice.js` exports:

```js
async function getVoiceContext(projectId) // -> { approved: string[], rejected: string[], edits: string[], summary: string|null }
```

It fetches, for the given project:
- Up to 5 most recent `ContentItem` captions with `status: 'approved'` (newest first)
- Up to 5 most recent `ContentItem` captions with `status: 'rejected'`
- Up to 10 most recent `ContentMessage` rows with `role: 'user'` belonging to the
  project's content items (the user's actual edit instructions)
- The stored `brandVoiceSummary` (may be null)

`generateGeminiContent(project)` in `geminiProvider.js` accepts this context and, when
any of it is non-empty, appends a clearly-delimited section to the text-generation
prompt:

- Approved captions → "Match the style, tone, and voice of these captions the user
  approved: …"
- Rejected captions → "Avoid the style/content patterns of these captions the user
  rejected: …"
- Edit instructions → "The user has previously given these standing preferences when
  editing content — respect them: …"
- Summary (if present) → "Brand voice summary: …"

With no history, the prompt is byte-identical to today's behavior.

`chatEditProvider.js`'s `decideChatAction` receives the same summary (only the summary,
not the full example lists — the chat already has its own conversation context) so
refinements stay on-brand.

## Visible surface: Brand Voice card

On the project detail page (`frontend/app/projects/[id]/page.js`), a "Brand Voice" card:

- Stats line: "Learning from N approved · N rejected · N edit instructions" (live
  counts from the API).
- The distilled summary text, or an empty-state ("Review a few posts and AMcue will
  learn your voice") when there's no history and no summary.
- A "Refresh voice" button that triggers distillation.

## Distillation

`brandVoice.js` also exports:

```js
async function distillVoice(projectId) // -> summary string
```

One Gemini text call (`gemini-2.5-flash`): given the same retrieved signals, produce a
concise (≤80 words) human-readable description of the brand voice: tone, style, dos and
don'ts. Stored on the project.

Staleness: `AppProject.brandVoiceSignals` records the total signal count
(approved + rejected + edit messages) at last distillation. The GET route reports
`stale: currentCount !== brandVoiceSignals`, and the frontend shows the Refresh button
prominently when stale. Distillation only ever runs on explicit request (the button) —
no automatic API spend.

## Data model

```prisma
model AppProject {
  // ...existing fields...
  brandVoiceSummary String?
  brandVoiceSignals Int     @default(0)
}
```

One migration, no new tables.

## API routes (both under the existing projects router, requireAuth + ownership check)

- `GET /projects/:id/brand-voice` → `{ summary, counts: { approved, rejected, edits },
  stale }`
- `POST /projects/:id/brand-voice/refresh` → runs `distillVoice`, stores summary +
  signal count, returns the same shape as GET (fresh). 502 with a clear message if the
  Gemini call fails; nothing is overwritten on failure.

## Testing

Mocked-Gemini route tests (same patterns as existing suites):
- `getVoiceContext` returns correct rows for a project with mixed-status items and
  chat messages, scoped to that project only.
- Generation with history: the (mocked) provider receives the voice context; with no
  history, receives empty context (behavior unchanged).
- GET brand-voice returns counts and staleness correctly.
- POST refresh stores summary and signal count (distill call mocked); failure path
  leaves prior summary intact and returns 502.
- Ownership: 404 for another user's project.

## Out of scope

- Cross-project or per-user voice profiles
- User-editable summary text
- Embeddings/semantic retrieval
- Automatic (non-button) distillation
- Screenshot-grounded image generation (next spec)
