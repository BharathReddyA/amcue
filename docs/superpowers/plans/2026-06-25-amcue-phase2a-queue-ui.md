# AMcue Phase 2a — Functional Queue/Feed UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real Generate → Queue → Approve/Reject → Feed loop end-to-end, using a stub content generator so the team can click through the actual UI today, with zero UI changes needed when Phase 2b swaps in real AI.

**Architecture:** Backend adds a stub AI provider module, two new routes on the existing `projects` router (`generate`, `content` list), and a new `content` router for approve/reject (`PATCH /content/:id`). Frontend adds three pages under `/projects/[id]/` (detail, queue, feed) following the existing client-component + `apiFetch` pattern from Phase 1.

**Tech Stack:** Same as Phase 1 — Express, Prisma/Postgres (Neon), Next.js (JS, App Router), Jest + Supertest.

---

## File Structure

```
backend/
  src/
    services/
      ai/
        stubProvider.js          # NEW: generateStubContent(project)
    routes/
      projects.js                 # MODIFY: add POST /:id/generate, GET /:id/content
      content.js                  # NEW: PATCH /:id (approve/reject)
    server.js                     # MODIFY: mount /content router
  tests/
    content.test.js               # NEW: generate, list-by-status, approve/reject, cross-user 404
frontend/
  app/
    projects/
      page.js                     # MODIFY: link each project to its detail page
      [id]/
        page.js                   # NEW: project detail + Generate button
        queue/
          page.js                 # NEW: pending items + approve/reject
        feed/
          page.js                 # NEW: approved items, read-only
```

---

### Task 1: Stub AI provider

**Files:**
- Create: `backend/src/services/ai/stubProvider.js`

- [ ] **Step 1: Write the stub provider**

`backend/src/services/ai/stubProvider.js`:

```js
function generateStubContent(project) {
  return {
    caption: `Check out ${project.name} — ${project.description}!`,
    imageUrl: `https://picsum.photos/seed/${project.id}/600/400`,
  };
}

module.exports = { generateStubContent };
```

No test for this file — pure function, no branching, no I/O. It's exercised by
`content.test.js` in Task 2 via the real `/generate` route.

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/ai/stubProvider.js
git commit -m "feat: add stub AI content provider for Phase 2a"
```

---

### Task 2: Backend generate, list-by-status, and approve/reject routes

**Files:**
- Modify: `backend/src/routes/projects.js`
- Create: `backend/src/routes/content.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/content.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/content.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'content-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'content-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Content Test App')
    .field('description', 'An app for content tests');
  projectId = projectRes.body.id;
});

afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['content-test@amcue.dev', 'content-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('content generation and review routes', () => {
  it('generates a pending content item using project name/description', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.caption).toContain('Content Test App');
    expect(res.body.imageUrl).toContain(projectId);
  });

  it('lists only pending items for the project', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/content?status=pending`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].status).toBe('pending');
  });

  it('rejects an invalid status query param', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/content?status=bogus`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('approves a pending item and moves it from pending to approved', async () => {
    const list = await request(app)
      .get(`/projects/${projectId}/content?status=pending`)
      .set('Authorization', `Bearer ${token}`);
    const itemId = list.body[0].id;

    const patchRes = await request(app)
      .patch(`/content/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('approved');

    const pendingAfter = await request(app)
      .get(`/projects/${projectId}/content?status=pending`)
      .set('Authorization', `Bearer ${token}`);
    expect(pendingAfter.body.length).toBe(0);

    const approvedAfter = await request(app)
      .get(`/projects/${projectId}/content?status=approved`)
      .set('Authorization', `Bearer ${token}`);
    expect(approvedAfter.body.length).toBe(1);
  });

  it('returns 404 when patching another user\'s content item', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'content-test-other@amcue.dev', password: 'password123' });
    const otherToken = otherRes.body.token;

    const list = await request(app)
      .get(`/projects/${projectId}/content?status=approved`)
      .set('Authorization', `Bearer ${token}`);
    const itemId = list.body[0].id;

    const res = await request(app)
      .patch(`/content/${itemId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'rejected' });

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- content.test.js`
Expected: FAIL — `/projects/:id/generate`, `/projects/:id/content`, and `/content/:id`
all 404 since the routes don't exist yet.

- [ ] **Step 3: Add generate and list-by-status routes to projects.js**

Edit `backend/src/routes/projects.js` — add this import near the top, alongside the
existing `uploadImageBuffer` import:

```js
const { generateStubContent } = require('../services/ai/stubProvider');
```

Add these two routes after the existing `router.get('/:id', ...)` handler, before
`module.exports = router;`:

```js
router.post('/:id/generate', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const { caption, imageUrl } = generateStubContent(project);
  const contentItem = await prisma.contentItem.create({
    data: {
      appProjectId: project.id,
      caption,
      imageUrl,
      status: 'pending',
    },
  });

  res.status(201).json(contentItem);
});

router.get('/:id/content', async (req, res) => {
  const { status } = req.query;
  if (!status || !['pending', 'approved'].includes(status)) {
    return res.status(400).json({ error: 'status query param must be "pending" or "approved"' });
  }

  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const items = await prisma.contentItem.findMany({
    where: { appProjectId: project.id, status },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
});
```

- [ ] **Step 4: Create the content router**

`backend/src/routes/content.js`:

```js
const express = require('express');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
  }

  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  const updated = await prisma.contentItem.update({
    where: { id: item.id },
    data: { status },
  });
  res.json(updated);
});

module.exports = router;
```

- [ ] **Step 5: Wire the content router into server.js**

Edit `backend/src/server.js`, add below the existing project route registration:

```js
const contentRoutes = require('./routes/content');
app.use('/content', contentRoutes);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test -- content.test.js`
Expected: PASS, 5 tests passing.

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 12 tests (3 auth + 4 projects + 5 content) pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/projects.js backend/src/routes/content.js backend/src/server.js backend/tests/content.test.js
git commit -m "feat: add generate, content-list, and approve/reject routes"
```

---

### Task 3: Project detail page with Generate button

**Files:**
- Create: `frontend/app/projects/[id]/page.js`
- Modify: `frontend/app/projects/page.js`

- [ ] **Step 1: Write the project detail page**

`frontend/app/projects/[id]/page.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}`)
      .then(setProject)
      .catch((err) => setError(err.message));
  }, [id, router]);

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      await apiFetch(`/projects/${id}/generate`, { method: 'POST' });
      router.push(`/projects/${id}/queue`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  if (error) {
    return (
      <main>
        <p>{error}</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{project.name}</h1>
      <p>{project.description}</p>
      {project.screenshotUrls.length > 0 && (
        <div>
          {project.screenshotUrls.map((url) => (
            <img key={url} src={url} alt="Screenshot" width={120} />
          ))}
        </div>
      )}
      <button onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating...' : 'Generate content'}
      </button>
      <p>
        <a href={`/projects/${id}/queue`}>View queue</a>{' '}
        <a href={`/projects/${id}/feed`}>View feed</a>
      </p>
      <p>
        <a href="/projects">Back to projects</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Link each project in the list to its detail page**

Edit `frontend/app/projects/page.js`. Find this block:

```jsx
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> — {p.description}
          </li>
        ))}
      </ul>
```

Replace it with:

```jsx
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <a href={`/projects/${p.id}`}>
              <strong>{p.name}</strong> — {p.description}
            </a>
          </li>
        ))}
      </ul>
```

- [ ] **Step 3: Manually verify**

With both servers running (`npm run dev --prefix backend`, `npm run dev --prefix
frontend`), or by curling the real backend directly: register/login, create a project
(no files, to avoid needing real Cloudinary credentials), then:
1. Visit `/projects`, click the project name → lands on `/projects/<id>`, shows name
   and description.
2. Click "Generate content" → redirected to `/projects/<id>/queue` (will 404 until
   Task 4 — that's expected here). Confirm via the backend directly
   (`GET /projects/<id>/content?status=pending` with the same token) that a
   `ContentItem` was actually created.

If you have no way to drive a real browser, do the equivalent with curl against the
real running backend (register → create project → POST generate → GET content) and
code-inspect the page rendering; say explicitly in your report which parts were real
HTTP verification vs. code inspection.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/projects/[id]/page.js frontend/app/projects/page.js
git commit -m "feat: add project detail page with generate button"
```

---

### Task 4: Queue page (pending items, approve/reject)

**Files:**
- Create: `frontend/app/projects/[id]/queue/page.js`

- [ ] **Step 1: Write the queue page**

`frontend/app/projects/[id]/queue/page.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';

export default function QueuePage() {
  const router = useRouter();
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/content?status=pending`)
      .then(setItems)
      .catch((err) => setError(err.message));
  }, [id, router]);

  async function handleReview(itemId, status) {
    try {
      await apiFetch(`/content/${itemId}`, { method: 'PATCH', body: { status } });
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main>
      <h1>Pending review</h1>
      {error && <p>{error}</p>}
      {items.length === 0 && !error && <p>Nothing pending. Generate some content!</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <img src={item.imageUrl} alt="Generated" width={120} />
            <p>{item.caption}</p>
            <button onClick={() => handleReview(item.id, 'approved')}>Approve</button>
            <button onClick={() => handleReview(item.id, 'rejected')}>Reject</button>
          </li>
        ))}
      </ul>
      <p>
        <a href={`/projects/${id}`}>Back to project</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Manually verify**

With a project that has at least one pending item (from Task 3's verification, or
generate a new one via curl): visit `/projects/<id>/queue`, confirm the item shows with
its caption/image and Approve/Reject buttons. If driving a real browser, click Approve
and confirm the item disappears from the list. If not, verify via curl: `PATCH
/content/<itemId>` with `{"status": "approved"}` against the real backend, then
`GET /projects/<id>/content?status=pending` again and confirm the list is now empty.
Be explicit in your report about which was real verification vs. code inspection.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/projects/[id]/queue/page.js
git commit -m "feat: add content queue page with approve/reject"
```

---

### Task 5: Feed page (approved items, read-only)

**Files:**
- Create: `frontend/app/projects/[id]/feed/page.js`

- [ ] **Step 1: Write the feed page**

`frontend/app/projects/[id]/feed/page.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';

export default function FeedPage() {
  const router = useRouter();
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/content?status=approved`)
      .then(setItems)
      .catch((err) => setError(err.message));
  }, [id, router]);

  return (
    <main>
      <h1>Approved feed</h1>
      {error && <p>{error}</p>}
      {items.length === 0 && !error && <p>Nothing approved yet.</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <img src={item.imageUrl} alt="Approved content" width={120} />
            <p>{item.caption}</p>
          </li>
        ))}
      </ul>
      <p>
        <a href={`/projects/${id}`}>Back to project</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Manually verify the full Phase 2a loop end-to-end**

Using a fresh project (or the one from prior tasks): register/login → create project →
visit detail page → click "Generate content" → visit `/queue`, see the pending item →
approve it → visit `/feed`, confirm the approved item now appears there and the queue
is empty. If real-browser interaction isn't available, do the equivalent sequence via
curl against the real backend (register, create project, POST generate, PATCH approve,
GET content?status=approved) and confirm the final feed list contains the item. State
explicitly in your report which steps were real HTTP/browser verification.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/projects/[id]/feed/page.js
git commit -m "feat: add approved content feed page"
```

---

## Out of scope for this plan (Phase 2b)

- Real Gemini API integration (`geminiProvider.js`)
- Swapping the route's import from `stubProvider` to `geminiProvider`
- Any error handling specific to a real third-party AI call (rate limits, timeouts,
  content-policy failures)
