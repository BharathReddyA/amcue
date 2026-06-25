# AMcue — Visual UI Pass (Landing + Auth + Dashboard)

Date: 2026-06-25
Status: Approved

## Purpose

The team has a working but completely unstyled Phase 1 + Phase 2a skeleton (auth,
project CRUD, generate/queue/feed loop). Before continuing into Phase 2b (real AI), the
team wants a real, demoable visual pass — a landing page, styled login/signup, and a
proper dashboard shell — so the project looks and feels like a real product when shown
to the team. This pulls forward part of the original Phase 4 ("Polish") scope, by
explicit team decision (see `docs/superpowers/specs/2026-06-25-amcue-design.md` for the
original phase plan).

This is a frontend-only visual/structural pass. No backend routes, data model, or AI
behavior change. Existing page logic (data fetching, form handling, auth checks) is
preserved — only markup/styling and one new route (the landing page) change.

## Scope boundaries

- No new backend routes or schema changes.
- No real AI work (Phase 2b stays untouched, still using the stub provider).
- No real Google/Apple OAuth — login/signup get placeholder "Continue with Google" /
  "Continue with Apple" buttons that are visually real but functionally inert (same
  "looks real, mocked underneath" pattern as the existing mock Instagram/TikTok connect
  screen design). Clicking them does nothing for now (no fake state, no navigation —
  simplest possible placeholder; can be wired to a real provider in a future phase).
- No real dashboard screenshot on the landing page — a stylized placeholder panel
  stands in for it, swapped out once the dashboard has real content worth showing.
- No animation/motion polish, no dark mode.

## Design system

- **Style direction:** Clean Light SaaS — white background, generous whitespace,
  indigo accent color (`#4f46e5`), consistent with Linear/Notion's light mode.
- **Typography:** Reuse the already-installed Geist Sans (`next/font/google`, already
  wired in `frontend/app/layout.js`) — no new font dependency. Bold weights for
  headings, regular for body text.
- **Styling mechanism:** CSS Modules (already present in the project via
  `page.module.css` from `create-next-app`) — one `.module.css` per component/page. No
  new CSS framework or dependency; Tailwind was explicitly declined during Phase 1
  scaffolding and that decision stands.
- **Shared components** (new directory `frontend/components/`):
  - `Button` — primary/secondary variants, used everywhere a `<button>` currently
    appears
  - `Input` — text/email/password styled input, used in all forms
  - `Card` — white rounded panel with subtle border/shadow, used for auth forms and
    content items
  - `Sidebar` — persistent left navigation for the dashboard shell
  - `TopTabs` — horizontal tab nav (Detail | Queue | Feed) for a project's sub-pages

Each component is a `.js` file + matching `.module.css`, default-exported, taking plain
props (no new state-management dependency, no component library).

## Pages

### Landing page (`/`)

Currently `/` immediately redirects to `/login` or `/projects` based on auth state
(`frontend/app/page.js`). This changes: `/` becomes a real public landing page.
Logged-in users still get redirected to `/projects` (preserve that one behavior);
logged-out users see the landing page instead of being bounced to `/login`.

Sections, top to bottom:
1. **Hero** — "AMcue" wordmark/logo placeholder, one-line tagline (e.g. "Automate your
   indie app's marketing"), "Log in" and "Sign up" CTA buttons (`Button` component).
2. **Feature highlights** — 3-4 short blurbs matching the actual product flow:
   describe your app → AI generates content → review & approve → it's in your feed.
3. **Product preview** — a stylized placeholder panel (not a real screenshot) styled
   to match the design system, representing "this is what the dashboard looks like."
4. **FAQ** — a short list of question/answer pairs addressing likely indie-dev
   questions (e.g. "Does this post to my real social accounts?" → "Not yet — AMcue
   currently shows approved content in your own feed; direct publishing is a future
   feature.").
5. **Footer** — AMcue name/copyright line, no real links needed yet (this is an
   internal practice project, not a public launch).

### Login / Register (`/login`, `/register`)

Same routes, same `apiFetch`/`setToken` logic from Phase 1 — only the markup/styling
changes. Each becomes a centered `Card` containing:
- The existing email/password `Input` fields and submit `Button`
- Below the form: a divider ("or") and two placeholder buttons, "Continue with Google"
  and "Continue with Apple" — visually styled like real OAuth buttons, with `onClick`
  set to a no-op (no `disabled` attribute, no fake loading state — clicking simply does
  nothing, the simplest possible placeholder)
- The existing "No account? Register" / "Already have an account? Log in" link

### Dashboard shell

A new layout wrapping `/projects` and everything under `/projects/[id]/...`
(`frontend/app/projects/layout.js`, a Next.js route-group layout): persistent left
`Sidebar` (AMcue logo, "Projects" link, "+ New Project" link, "Log out" button) plus a
main content area where the existing pages render.

Inside a project (`/projects/[id]`, `/projects/[id]/queue`, `/projects/[id]/feed`), each
page additionally renders `TopTabs` (Detail | Queue | Feed, with the current page
highlighted) directly under the page's own heading.

### Existing pages restyled in place

`frontend/app/projects/page.js`, `frontend/app/projects/new/page.js`,
`frontend/app/projects/[id]/page.js`, `frontend/app/projects/[id]/queue/page.js`,
`frontend/app/projects/[id]/feed/page.js` — same data fetching, same `apiFetch` calls,
same conditional logic (loading/error/empty states) as already implemented. Only the
returned JSX/markup changes to use the new shared components instead of bare HTML
elements, and each picks up the dashboard shell's `Sidebar` automatically via the new
layout file (no per-page sidebar code).

## Testing approach

This is a styling/markup pass over already-tested logic — no new backend behavior, so
no new backend tests. No frontend test suite exists or is being added (consistent with
the existing project-wide scope decision). Verification is manual: click through every
page after the pass and confirm the existing functionality (login, register, create
project, generate, approve/reject, logout) still works, then confirm the redirect
behavior on `/` is exactly preserved for logged-in users and changed (no redirect, real
content) for logged-out users.

## Out of scope for this pass

- Real Google/Apple OAuth integration
- Real dashboard screenshot on the landing page
- Phase 2b (real Gemini AI integration) — entirely separate, untouched by this pass
- Dark mode, animation/motion, responsive/mobile-specific layout polish
