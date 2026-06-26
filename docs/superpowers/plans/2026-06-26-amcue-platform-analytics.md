# AMcue Platform Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mock per-platform analytics view — totals + per-post views/likes/comments, deterministically generated from each content item's id, no database changes.

**Architecture:** A pure mock-metrics generator function, one new backend route that fetches all of a project's content items and attaches generated metrics, a small link added to the existing Connect page for connected platforms, and a new analytics page rendering totals + a post list.

**Tech Stack:** Same as the rest of the project — Express, Prisma/Postgres (Neon), Next.js (JS, App Router), Jest + Supertest.

---

## File Structure

```
backend/
  src/
    services/
      mockAnalytics.js                                  # NEW: getMockAnalytics(contentItemId)
    routes/
      projects.js                                         # MODIFY: add GET .../analytics route
  tests/
    analytics.test.js                                     # NEW: 5 tests
frontend/
  app/
    projects/[id]/
      connect/
        page.js                                           # MODIFY: link connected platforms to analytics
        page.module.css                                    # MODIFY: add link style
        [platform]/
          page.js                                          # NEW
          page.module.css                                  # NEW
```

---

### Task 1: Mock analytics generator and backend route

**Files:**
- Create: `backend/src/services/mockAnalytics.js`
- Modify: `backend/src/routes/projects.js`
- Test: `backend/tests/analytics.test.js`

- [ ] **Step 1: Write the mock metrics generator**

`backend/src/services/mockAnalytics.js`:

```js
// ponytail: deterministic mock metrics seeded from the content item id, same
// pattern as the picsum.photos seed already used for stub/Gemini images - no
// real analytics, no persistence, just a stable-looking number per item.
function seedFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1000000;
  }
  return hash;
}

function getMockAnalytics(contentItemId) {
  const seed = seedFromId(contentItemId);
  return {
    views: 100 + (seed % 5000),
    likes: 10 + (seed % 500),
    comments: seed % 50,
  };
}

module.exports = { getMockAnalytics };
```

No test file for this module alone — it's exercised through the route test below,
consistent with how `stubProvider`/`cloudinary` had no direct unit test.

- [ ] **Step 2: Write the failing test**

`backend/tests/analytics.test.js`:

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
    .send({ email: 'analytics-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'analytics-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Analytics Test App')
    .field('description', 'An app for analytics tests');
  projectId = projectRes.body.id;

  await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Post one',
      imageUrl: 'https://res.cloudinary.com/fake/one.png',
      status: 'pending',
    },
  });
  await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Post two',
      imageUrl: 'https://res.cloudinary.com/fake/two.png',
      status: 'approved',
    },
  });
});

afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['analytics-test@amcue.dev', 'analytics-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('platform analytics route', () => {
  it('returns totals and a per-post breakdown including both pending and approved items', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.posts.length).toBe(2);
    const statuses = res.body.posts.map((p) => p.status).sort();
    expect(statuses).toEqual(['approved', 'pending']);
    expect(res.body.totals.views).toBe(res.body.posts.reduce((sum, p) => sum + p.views, 0));
  });

  it('returns identical numbers on a second call (deterministic)', async () => {
    const first = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(first.body).toEqual(second.body);
  });

  it('seeds different posts with different metrics', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    const [postA, postB] = res.body.posts;
    const identical =
      postA.views === postB.views && postA.likes === postB.likes && postA.comments === postB.comments;
    expect(identical).toBe(false);
  });

  it('rejects an invalid platform', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/facebook/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('returns 404 for a project owned by another user', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'analytics-test-other@amcue.dev', password: 'password123' });
    const otherToken = otherRes.body.token;

    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npm test -- analytics.test.js`
Expected: FAIL — `GET /projects/:id/connect/:platform/analytics` 404s, route doesn't
exist yet.

- [ ] **Step 4: Add the analytics route**

Edit `backend/src/routes/projects.js`. Add this import near the other service
imports at the top:

```js
const { getMockAnalytics } = require('../services/mockAnalytics');
```

Add this route after the existing `router.post('/:id/connect/:platform', ...)` handler,
before `module.exports = router;`:

```js
router.get('/:id/connect/:platform/analytics', async (req, res) => {
  const { platform } = req.params;
  if (!CONNECT_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of: ${CONNECT_PLATFORMS.join(', ')}` });
  }

  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const items = await prisma.contentItem.findMany({
    where: { appProjectId: project.id },
    orderBy: { createdAt: 'desc' },
  });

  const posts = items.map((item) => ({
    id: item.id,
    caption: item.caption,
    imageUrl: item.imageUrl,
    status: item.status,
    ...getMockAnalytics(item.id),
  }));

  const totals = posts.reduce(
    (acc, post) => ({
      views: acc.views + post.views,
      likes: acc.likes + post.likes,
      comments: acc.comments + post.comments,
    }),
    { views: 0, likes: 0, comments: 0 }
  );

  res.json({ totals, posts });
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- analytics.test.js`
Expected: PASS, 5 tests passing.

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 26 tests pass (21 existing + 5 new).

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/mockAnalytics.js backend/src/routes/projects.js backend/tests/analytics.test.js
git commit -m "feat: add mock platform analytics route"
```

---

### Task 2: Link connected platforms to their analytics page

**Files:**
- Modify: `frontend/app/projects/[id]/connect/page.js`
- Modify: `frontend/app/projects/[id]/connect/page.module.css`

- [ ] **Step 1: Add the analytics link**

Edit `frontend/app/projects/[id]/connect/page.js`. Find this block:

```jsx
            <div>
              <h3>{platform.label}</h3>
              <p className={styles.status}>
                {connections?.[platform.key] ? 'Connected ✓' : 'Not connected'}
              </p>
            </div>
```

Replace it with:

```jsx
            <div>
              <h3>{platform.label}</h3>
              <p className={styles.status}>
                {connections?.[platform.key] ? 'Connected ✓' : 'Not connected'}
              </p>
              {connections?.[platform.key] && (
                <a className={styles.analyticsLink} href={`/projects/${id}/connect/${platform.key}`}>
                  View analytics
                </a>
              )}
            </div>
```

- [ ] **Step 2: Add the link style**

Edit `frontend/app/projects/[id]/connect/page.module.css`, add at the end:

```css
.analyticsLink {
  display: inline-block;
  margin-top: 4px;
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 600;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/projects/[id]/connect/page.js frontend/app/projects/[id]/connect/page.module.css
git commit -m "feat: link connected platforms to their analytics page"
```

---

### Task 3: Platform analytics page

**Files:**
- Create: `frontend/app/projects/[id]/connect/[platform]/page.js`
- Create: `frontend/app/projects/[id]/connect/[platform]/page.module.css`

- [ ] **Step 1: Write the analytics page**

`frontend/app/projects/[id]/connect/[platform]/page.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

export default function PlatformAnalyticsPage() {
  const router = useRouter();
  const { id, platform } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/connect/${platform}/analytics`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id, platform, router]);

  if (error) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!data) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <TopTabs projectId={id} active="connect" />
      <h1>{platform.charAt(0).toUpperCase() + platform.slice(1)} analytics</h1>
      <div className={styles.totals}>
        <Card className={styles.totalCard}>
          <p className={styles.totalLabel}>Views</p>
          <p className={styles.totalValue}>{data.totals.views}</p>
        </Card>
        <Card className={styles.totalCard}>
          <p className={styles.totalLabel}>Likes</p>
          <p className={styles.totalValue}>{data.totals.likes}</p>
        </Card>
        <Card className={styles.totalCard}>
          <p className={styles.totalLabel}>Comments</p>
          <p className={styles.totalValue}>{data.totals.comments}</p>
        </Card>
      </div>
      <div className={styles.list}>
        {data.posts.map((post) => (
          <Card key={post.id} className={styles.post}>
            <img src={post.imageUrl} alt="Post" width={64} height={64} />
            <div className={styles.postBody}>
              <p className={styles.caption}>{post.caption}</p>
              <p className={styles.postStats}>
                {post.views} views · {post.likes} likes · {post.comments} comments
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

`frontend/app/projects/[id]/connect/[platform]/page.module.css`:

```css
.error {
  color: #dc2626;
  font-size: 13px;
}

.totals {
  display: flex;
  gap: 12px;
  margin: 16px 0;
}

.totalCard {
  flex: 1;
  text-align: center;
}

.totalLabel {
  color: var(--color-text-muted);
  font-size: 13px;
  margin-bottom: 4px;
}

.totalValue {
  font-size: 24px;
  font-weight: 700;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.post {
  display: flex;
  gap: 16px;
  align-items: center;
}

.postBody {
  flex: 1;
}

.caption {
  margin-bottom: 4px;
}

.postStats {
  color: var(--color-text-muted);
  font-size: 13px;
}
```

- [ ] **Step 2: Verify the full flow end-to-end**

Via curl against the real backend (register/login → create project → generate content
a couple times to get a few `ContentItem`s, or insert them directly via Prisma):

```bash
curl -s http://localhost:4000/projects/PROJECT_ID/connect/instagram/analytics -H "Authorization: Bearer TOKEN"
```

Expected: a `totals` object and a `posts` array, each post carrying real
`caption`/`imageUrl`/`status` plus generated `views`/`likes`/`comments`. If a browser is
available: connect Instagram on the Connect tab, confirm a "View analytics" link
appears, click it, confirm the totals cards and per-post list render with the real
caption/image and mock numbers.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/projects/[id]/connect/[platform]/page.js frontend/app/projects/[id]/connect/[platform]/page.module.css
git commit -m "feat: add platform analytics page"
```

---

## Out of scope for this plan

- Real social platform API integration
- Conversational post editor
- Charts, graphs, time-series data
