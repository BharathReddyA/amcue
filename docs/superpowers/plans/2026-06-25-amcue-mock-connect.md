# AMcue Mock Social-Connect Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the mock Instagram/TikTok connect screen — toggle routes on the existing `User.mockConnections` field, a 4th dashboard tab, and the connect page itself.

**Architecture:** Two new routes nested under `/projects/:id` (matching the existing `generate`/`content` URL pattern), operating on the already-existing `User.mockConnections` JSON column. `TopTabs` gains a 4th entry; a new page renders two toggleable cards.

**Tech Stack:** Same as the rest of the project — Express, Prisma/Postgres (Neon), Next.js (JS, App Router), Jest + Supertest.

---

## File Structure

```
backend/
  src/
    routes/
      projects.js                          # MODIFY: add GET/POST connect routes
  tests/
    connect.test.js                        # NEW: 4 tests
frontend/
  components/
    TopTabs.js                              # MODIFY: add 4th "Connect" tab
  app/
    projects/[id]/
      connect/
        page.js                             # NEW
        page.module.css                     # NEW
```

---

### Task 1: Backend connect routes

**Files:**
- Modify: `backend/src/routes/projects.js`
- Test: `backend/tests/connect.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/connect.test.js`:

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
    .send({ email: 'connect-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'connect-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Connect Test App')
    .field('description', 'An app for connect tests');
  projectId = projectRes.body.id;
});

afterAll(async () => {
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('mock social-connect routes', () => {
  it('starts disconnected for both platforms', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ instagram: false, tiktok: false });
  });

  it('rejects an invalid platform', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/connect/facebook`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('toggles instagram on, then off again', async () => {
    const connectRes = await request(app)
      .post(`/projects/${projectId}/connect/instagram`)
      .set('Authorization', `Bearer ${token}`);

    expect(connectRes.status).toBe(200);
    expect(connectRes.body).toEqual({ instagram: true, tiktok: false });

    const disconnectRes = await request(app)
      .post(`/projects/${projectId}/connect/instagram`)
      .set('Authorization', `Bearer ${token}`);

    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body).toEqual({ instagram: false, tiktok: false });
  });

  it('GET reflects the current toggled state', async () => {
    await request(app)
      .post(`/projects/${projectId}/connect/tiktok`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/projects/${projectId}/connect`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ instagram: false, tiktok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- connect.test.js`
Expected: FAIL — `GET /projects/:id/connect` and `POST /projects/:id/connect/:platform`
both 404, since the routes don't exist yet.

- [ ] **Step 3: Add the connect routes**

Edit `backend/src/routes/projects.js`, add these two routes after the existing
`router.get('/:id/content', ...)` handler, before `module.exports = router;`:

```js
router.get('/:id/connect', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json(user.mockConnections);
});

router.post('/:id/connect/:platform', async (req, res) => {
  const { platform } = req.params;
  if (!['instagram', 'tiktok'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be "instagram" or "tiktok"' });
  }

  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const mockConnections = {
    ...user.mockConnections,
    [platform]: !user.mockConnections[platform],
  };

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { mockConnections },
  });

  res.json(updated.mockConnections);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- connect.test.js`
Expected: PASS, 4 tests passing.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 20 tests pass (16 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/projects.js backend/tests/connect.test.js
git commit -m "feat: add mock social-connect toggle routes"
```

---

### Task 2: Add the Connect tab to TopTabs

**Files:**
- Modify: `frontend/components/TopTabs.js`

- [ ] **Step 1: Add the 4th tab**

Edit `frontend/components/TopTabs.js`. Replace the `tabs` array:

```js
  const tabs = [
    { key: 'detail', label: 'Detail', href: `/projects/${projectId}` },
    { key: 'queue', label: 'Queue', href: `/projects/${projectId}/queue` },
    { key: 'feed', label: 'Feed', href: `/projects/${projectId}/feed` },
    { key: 'connect', label: 'Connect', href: `/projects/${projectId}/connect` },
  ];
```

No CSS changes needed — `TopTabs.module.css` already styles tabs generically by class,
not by count.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/TopTabs.js
git commit -m "feat: add Connect tab to TopTabs"
```

---

### Task 3: Connect page

**Files:**
- Create: `frontend/app/projects/[id]/connect/page.js`
- Create: `frontend/app/projects/[id]/connect/page.module.css`

- [ ] **Step 1: Write the connect page**

`frontend/app/projects/[id]/connect/page.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
];

export default function ConnectPage() {
  const router = useRouter();
  const { id } = useParams();
  const [connections, setConnections] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/connect`)
      .then(setConnections)
      .catch((err) => setError(err.message));
  }, [id, router]);

  async function handleToggle(platform) {
    try {
      const updated = await apiFetch(`/projects/${id}/connect/${platform}`, { method: 'POST' });
      setConnections(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <TopTabs projectId={id} active="connect" />
      <h1>Connect your accounts</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.list}>
        {PLATFORMS.map((platform) => (
          <Card key={platform.key} className={styles.item}>
            <div>
              <h3>{platform.label}</h3>
              <p className={styles.status}>
                {connections?.[platform.key] ? 'Connected ✓' : 'Not connected'}
              </p>
            </div>
            <Button
              variant={connections?.[platform.key] ? 'secondary' : 'primary'}
              onClick={() => handleToggle(platform.key)}
              disabled={!connections}
            >
              {connections?.[platform.key] ? 'Disconnect' : 'Connect'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

`frontend/app/projects/[id]/connect/page.module.css`:

```css
.error {
  color: #dc2626;
  font-size: 13px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status {
  color: var(--color-text-muted);
  font-size: 14px;
  margin-top: 4px;
}
```

- [ ] **Step 2: Verify the full flow end-to-end**

Via curl against the real backend (register/login → create project, no files):

```bash
curl -s http://localhost:4000/projects/PROJECT_ID/connect -H "Authorization: Bearer TOKEN"
# expect: {"instagram":false,"tiktok":false}
curl -s -X POST http://localhost:4000/projects/PROJECT_ID/connect/instagram -H "Authorization: Bearer TOKEN"
# expect: {"instagram":true,"tiktok":false}
```

If a browser is available, visit `/projects/PROJECT_ID/connect`, confirm both platforms
show "Not connected", click "Connect" on Instagram, confirm it flips to "Connected ✓"
and the button becomes "Disconnect", click it again, confirm it flips back. Confirm the
"Connect" tab in the top nav is highlighted while on this page.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/projects/[id]/connect/page.js frontend/app/projects/[id]/connect/page.module.css
git commit -m "feat: add mock social-connect page"
```

---

## Out of scope for this plan

- Real OAuth integration with any platform
- Per-project (rather than account-wide) connection state
- Any UI elsewhere referencing connection state (e.g. a "connected" badge on the
  project list)
