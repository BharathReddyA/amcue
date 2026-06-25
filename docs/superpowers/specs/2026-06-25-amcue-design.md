# AMcue — Design Spec

Date: 2026-06-25
Status: Approved

## Purpose

AMcue is a practice project (team of 5, mostly beginners, built over a few weeks for
learning, not a commercial launch). It helps indie app developers automate marketing:
describe an app, upload screenshots, get AI-generated captions + images on a recurring
basis, review/approve each piece, and see approved content in an in-app feed.

## Explicit scope boundaries

- Web app only (Next.js frontend + Node/Express backend). No mobile.
- No real social publishing integration. Instagram/TikTok "Connect" is a mock: a button
  flips a stored boolean, no OAuth to any external platform.
- "Posting" means an approved `ContentItem` shows in the in-app feed — nothing is
  published externally.
- "Generate today's content" is a manual button. No real cron/scheduler in this phase.

## Stack

- Frontend: Next.js (App Router)
- Backend: Node + Express
- Database: Postgres hosted on Neon, accessed via Prisma
- AI: Gemini API for both caption/prompt generation (text) and image generation,
  behind a swappable `AiProvider` interface
- Image storage: Cloudinary (screenshots + generated images)
- Auth: email/password, JWT-based sessions
- Repo: single monorepo, `frontend/` + `backend/` folders, pushed to
  `https://github.com/BharathReddyA/amcue.git`

## Repo structure

```
amcue/
  frontend/                  # Next.js app
    app/
      (auth)/login, register
      projects/               # list + create app-project form
      projects/[id]/          # project detail: queue, feed, connect screen
    components/
    lib/api.ts                # fetch wrapper to backend
  backend/
    src/
      routes/                 # auth.ts, projects.ts, content.ts, connect.ts
      services/
        ai/                    # AiProvider interface; geminiProvider.ts implements it
        cloudinary.ts
      middleware/auth.ts
      server.ts
    prisma/schema.prisma
  docs/superpowers/specs/
```

This split gives natural ownership boundaries for a 5-person team: auth/forms,
dashboard/feed UI, backend API routes, AI integration module, mock-connect flow +
polish. Each person can work in their own folder without touching shared interfaces.

## Data model (Prisma)

- `User`: id, email (unique), passwordHash, mockConnections (JSON: `{ instagram: bool,
  tiktok: bool }`)
- `AppProject`: id, userId (FK), name, description, screenshotUrls (string[])
- `ContentItem`: id, appProjectId (FK), caption, imagePrompt, imageUrl, status (enum:
  `pending` | `approved` | `rejected`), createdAt

Relations: `User 1—N AppProject`, `AppProject 1—N ContentItem`.

"Approve" sets `status = approved`; the feed query is simply `ContentItem` rows with
that status, scoped to the user's projects. No separate "feed" table.

## AI module interface

```ts
interface AiProvider {
  generateCaptionAndPrompt(project: AppProjectInput): Promise<{
    caption: string;
    imagePrompt: string;
  }>;
  generateImage(imagePrompt: string): Promise<Buffer>;
}
```

`geminiProvider.ts` implements this now. Swapping providers later means writing one new
file implementing the interface and changing one wiring point — no route or UI changes.

## Mock connect flow

No external OAuth call anywhere. The "Connect Instagram" / "Connect TikTok" buttons on
the project's connect screen call a backend route that flips
`User.mockConnections.instagram` (or `.tiktok`) to `true`. UI reflects connected state
from that field. This is intentionally fake and stays fake for the life of this project.

## API routes (backend)

- `POST /auth/register`, `POST /auth/login` → JWT
- `GET /projects`, `POST /projects`, `GET /projects/:id` (with screenshot upload via
  Cloudinary on create)
- `POST /projects/:id/generate` → calls `AiProvider`, creates a `pending` `ContentItem`
- `GET /projects/:id/content?status=pending|approved|rejected`
- `PATCH /content/:id` → set status to `approved` or `rejected`
- `POST /projects/:id/connect/:platform` → mock connect toggle

All routes except `/auth/*` require a valid JWT (Express middleware), scoped to the
requesting user's own projects.

## Error handling

- Standard JSON error shape `{ error: string }` with appropriate HTTP status codes.
- AI calls (Gemini) wrapped so a failure surfaces a clear error to the frontend rather
  than a silent failure — content generation is the core "magic" feature, so a failed
  generate must be visibly distinguishable from a pending one.
- File upload failures (Cloudinary) similarly surfaced, not swallowed.

## Testing approach

Given the team is mostly beginners on a short timeline, testing stays minimal and
practical:
- Backend: a handful of route-level tests (e.g. supertest) for the core flows —
  register/login, create project, generate content, approve/reject — to catch
  regressions as 5 people touch shared routes.
- Frontend: manual verification through the phases; no component test suite required
  for this project's scope.
- No e2e framework, no CI test gating — YAGNI for a multi-week learning project.

## Phased build plan

1. **Skeleton** — auth, `AppProject` CRUD, screenshot upload to Cloudinary, project
   list page. No AI yet.
2. **AI core** — `generate` button calls Gemini for caption + image prompt, then Gemini
   for the image, stores result as a `pending` `ContentItem`.
3. **Product feel** — mock connect screen, content queue view (pending items with
   approve/reject), feed view (approved items).
4. **Polish** — styling pass, "generate today's content" button (reuses Phase 2 logic),
   bug fixes.

Each phase should be independently runnable and demoable before moving to the next.
