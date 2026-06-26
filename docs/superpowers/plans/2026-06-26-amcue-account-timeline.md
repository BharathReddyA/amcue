# AMcue Account Header + Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an account header (real for X, placeholder for others) and a recent-posts timeline (real X tweets via a live API call, fixed placeholder content for the other three platforms) to the existing per-platform analytics page.

**Architecture:** `User` gains `xUserId` (captured during OAuth callback alongside the existing `xUsername`). A new `fetchRecentTweets` function in the X API service fetches the connected account's real timeline. The existing analytics route gains `account`/`timeline` fields in its response, real for X and fixed-placeholder for the other three. The existing analytics page renders both new sections.

**Tech Stack:** Same as the rest of the project — Express, Prisma/Postgres (Neon), plain `fetch` for the X API, Next.js (JS, App Router), Jest + Supertest with X API calls mocked in tests.

---

## File Structure

```
backend/
  prisma/
    schema.prisma                          # MODIFY: add User.xUserId
  src/
    services/
      x/
        xAuth.js                            # MODIFY: fetchXUsername -> fetchXProfile (id + username)
        xApi.js                             # MODIFY: add fetchRecentTweets
    routes/
      xAuth.js                              # MODIFY: store xUserId from fetchXProfile
      projects.js                           # MODIFY: analytics route gains account/timeline
  tests/
    accountTimeline.test.js                 # NEW: 4 tests
frontend/
  app/
    projects/[id]/
      connect/[platform]/
        page.js                             # MODIFY: account header + timeline section
        page.module.css                      # MODIFY: new styles
```

---

### Task 1: Add User.xUserId

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the field**

Edit `backend/prisma/schema.prisma`. Add `xUserId` to the existing `User` model
(alongside `xUsername`):

```prisma
model User {
  id              String       @id @default(uuid())
  email           String       @unique
  passwordHash    String
  mockConnections Json         @default("{\"instagram\": false, \"tiktok\": false, \"youtube\": false, \"x\": false}")
  xAccessToken    String?
  xRefreshToken   String?
  xTokenExpiresAt DateTime?
  xUserId         String?
  xUsername       String?
  createdAt       DateTime     @default(now())
  appProjects     AppProject[]
}
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npx prisma migrate dev --name add_x_user_id`
Expected: "Your database is now in sync with your schema." and a new migration folder.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add User.xUserId for fetching the real X timeline"
```

---

### Task 2: Capture the X user id during OAuth callback

**Files:**
- Modify: `backend/src/services/x/xAuth.js`
- Modify: `backend/src/routes/xAuth.js`

- [ ] **Step 1: Replace fetchXUsername with fetchXProfile**

Edit `backend/src/services/x/xAuth.js`. Replace the `fetchXUsername` function:

```js
async function fetchXProfile(accessToken) {
  const res = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`X user lookup failed with status ${res.status}`);
  }
  const data = await res.json();
  return { id: data.data?.id || null, username: data.data?.username || null };
}
```

Update the `module.exports` at the bottom of the same file — replace `fetchXUsername`
with `fetchXProfile`:

```js
module.exports = {
  createState,
  consumeState,
  createTicket,
  consumeTicket,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchXProfile,
};
```

- [ ] **Step 2: Update the callback route to store the id**

Edit `backend/src/routes/xAuth.js`. Replace `fetchXUsername` with `fetchXProfile` in
the import:

```js
const {
  createState,
  consumeState,
  createTicket,
  consumeTicket,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchXProfile,
} = require('../services/x/xAuth');
```

Replace the body of the `/callback` route's try block:

```js
  try {
    const tokens = await exchangeCodeForTokens(code, entry.verifier);
    const profile = await fetchXProfile(tokens.access_token);

    await prisma.user.update({
      where: { id: entry.userId },
      data: {
        xAccessToken: tokens.access_token,
        xRefreshToken: tokens.refresh_token || null,
        xTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        xUserId: profile.id,
        xUsername: profile.username,
      },
    });

    res.redirect(`${process.env.FRONTEND_URL}/projects/${entry.projectId}/connect`);
  } catch (err) {
    console.error('X OAuth callback failed:', err);
    res.status(502).send('Connecting to X failed. Please try again.');
  }
```

- [ ] **Step 3: Run the full backend test suite to confirm no regression**

Run: `cd backend && npm test`
Expected: All 43 tests pass (no test directly covers `fetchXProfile`'s rename since
the OAuth callback flow isn't unit-tested — this is a behavior-preserving rename plus
one new field captured, verified by the boot/syntax check below rather than a test
assertion).

- [ ] **Step 4: Verify the server boots**

Run: `cd backend && node src/server.js`
Expected: `AMcue backend listening on 4000` with no errors. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/x/xAuth.js backend/src/routes/xAuth.js
git commit -m "feat: capture real X user id during OAuth callback"
```

---

### Task 3: Fetch the real X timeline

**Files:**
- Modify: `backend/src/services/x/xApi.js`

- [ ] **Step 1: Add fetchRecentTweets**

Edit `backend/src/services/x/xApi.js`. Add this function (and export it):

```js
async function fetchRecentTweets(accessToken, userId, maxResults = 10) {
  const res = await fetch(
    `https://api.x.com/2/users/${userId}/tweets?max_results=${maxResults}&tweet.fields=created_at`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`X timeline fetch failed with status ${res.status}`);
  }
  const data = await res.json();
  return (data.data || []).map((tweet) => ({
    id: tweet.id,
    text: tweet.text,
    url: `https://x.com/i/web/status/${tweet.id}`,
    createdAt: tweet.created_at,
  }));
}
```

Update `module.exports` at the bottom of the file:

```js
module.exports = { uploadMedia, postTweet, fetchRecentTweets };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/x/xApi.js
git commit -m "feat: add fetchRecentTweets to the X API service"
```

---

### Task 4: Account header and timeline in the analytics route

**Files:**
- Modify: `backend/src/routes/projects.js`
- Test: `backend/tests/accountTimeline.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/accountTimeline.test.js`:

```js
jest.mock('../src/services/x/xApi', () => ({
  uploadMedia: jest.fn(),
  postTweet: jest.fn(),
  fetchRecentTweets: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { fetchRecentTweets } = require('../src/services/x/xApi');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'timeline-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'timeline-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Timeline Test App')
    .field('description', 'An app for account/timeline tests');
  projectId = projectRes.body.id;
});

afterEach(() => {
  fetchRecentTweets.mockClear();
});

afterAll(async () => {
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('account header and timeline on the analytics route', () => {
  it('returns null account and empty timeline for X when not connected', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/x/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toBeNull();
    expect(res.body.timeline).toEqual([]);
    expect(fetchRecentTweets).not.toHaveBeenCalled();
  });

  it('returns the real account and timeline for X when connected', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { xAccessToken: 'fake-token', xUserId: 'x-user-123', xUsername: 'faketestuser' },
    });
    fetchRecentTweets.mockResolvedValue([
      { id: 'tweet-1', text: 'Hello world', url: 'https://x.com/i/web/status/tweet-1', createdAt: '2026-01-01T00:00:00Z' },
    ]);

    const res = await request(app)
      .get(`/projects/${projectId}/connect/x/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({
      username: 'faketestuser',
      profileUrl: 'https://x.com/faketestuser',
    });
    expect(res.body.timeline.length).toBe(1);
    expect(res.body.timeline[0].text).toBe('Hello world');
    expect(fetchRecentTweets).toHaveBeenCalledWith('fake-token', 'x-user-123', 10);
  });

  it('returns 200 with an empty timeline if fetchRecentTweets throws', async () => {
    fetchRecentTweets.mockRejectedValue(new Error('X API is down'));

    const res = await request(app)
      .get(`/projects/${projectId}/connect/x/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({
      username: 'faketestuser',
      profileUrl: 'https://x.com/faketestuser',
    });
    expect(res.body.timeline).toEqual([]);
  });

  it('returns fixed placeholder account and timeline for mock platforms', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/connect/instagram/analytics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({ username: 'demo_instagram_user', profileUrl: '#' });
    expect(res.body.timeline.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- accountTimeline.test.js`
Expected: FAIL — `res.body.account`/`res.body.timeline` are `undefined`, since the route
doesn't return these fields yet.

- [ ] **Step 3: Add the account/timeline logic**

Edit `backend/src/routes/projects.js`. Add this import near the other `x` service
import (if `xApi` isn't already imported in this file, add it; if it is, just add
`fetchRecentTweets` to the existing destructured import):

```js
const { fetchRecentTweets } = require('../services/x/xApi');
```

Add this constant near the top of the file, alongside `CONNECT_PLATFORMS` and
`DEFAULT_MOCK_CONNECTIONS`:

```js
const MOCK_TIMELINE = [
  {
    id: 'mock-1',
    text: 'Just launched a new feature — check it out!',
    url: '#',
    createdAt: null,
  },
  {
    id: 'mock-2',
    text: 'Behind the scenes of our latest update.',
    url: '#',
    createdAt: null,
  },
];
```

Replace the existing `router.get('/:id/connect/:platform/analytics', ...)` handler's
final section — keep everything up through the `totals` calculation unchanged, and
replace only the final `res.json({ totals, posts });` line with:

```js
  let account = null;
  let timeline = [];

  if (platform === 'x') {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (user.xAccessToken) {
      account = { username: user.xUsername, profileUrl: `https://x.com/${user.xUsername}` };
      try {
        timeline = await fetchRecentTweets(user.xAccessToken, user.xUserId, 10);
      } catch (err) {
        console.error('X timeline fetch failed:', err);
        timeline = [];
      }
    }
  } else {
    account = { username: `demo_${platform}_user`, profileUrl: '#' };
    timeline = MOCK_TIMELINE;
  }

  res.json({ totals, posts, account, timeline });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- accountTimeline.test.js`
Expected: PASS, 4 tests passing.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 47 tests pass (43 existing + 4 new).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/projects.js backend/tests/accountTimeline.test.js
git commit -m "feat: add account header and timeline to the analytics route"
```

---

### Task 5: Account header and timeline on the analytics page

**Files:**
- Modify: `frontend/app/projects/[id]/connect/[platform]/page.js`
- Modify: `frontend/app/projects/[id]/connect/[platform]/page.module.css`

- [ ] **Step 1: Add the account header and timeline section**

Replace `frontend/app/projects/[id]/connect/[platform]/page.js` entirely:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

export default function PlatformAnalyticsPage() {
  const router = useRouter();
  const { id, platform } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/connect/${platform}/analytics`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id, platform, router]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await apiFetch(`/projects/${id}/connect/${platform}`, { method: 'POST' });
      router.push(`/projects/${id}/connect`);
    } catch (err) {
      setError(err.message);
      setDisconnecting(false);
    }
  }

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
      {data.account && (
        <Card className={styles.accountCard}>
          <div>
            <p className={styles.accountLabel}>Connected as</p>
            <p className={styles.accountUsername}>@{data.account.username}</p>
          </div>
          <div className={styles.accountActions}>
            <a href={data.account.profileUrl} target="_blank" rel="noreferrer">
              View profile
            </a>
            <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        </Card>
      )}
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
      {data.timeline.length > 0 && (
        <div className={styles.timelineSection}>
          <h2>Recent posts</h2>
          <div className={styles.list}>
            {data.timeline.map((tweet) => (
              <Card key={tweet.id} className={styles.timelineItem}>
                <p>{tweet.text}</p>
                <a href={tweet.url} target="_blank" rel="noreferrer">
                  View ↗
                </a>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the new styles**

Edit `frontend/app/projects/[id]/connect/[platform]/page.module.css`, add at the end:

```css
.accountCard {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.accountLabel {
  color: var(--color-text-muted);
  font-size: 13px;
}

.accountUsername {
  font-size: 16px;
  font-weight: 700;
}

.accountActions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.accountActions a {
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 600;
}

.timelineSection {
  margin-top: 32px;
}

.timelineSection h2 {
  font-size: 18px;
  margin-bottom: 12px;
}

.timelineItem {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timelineItem a {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 600;
  align-self: flex-start;
}
```

- [ ] **Step 3: Verify the mock-platform flow end-to-end**

Via curl against the real backend:

```bash
curl -s http://localhost:4000/projects/PROJECT_ID/connect/instagram/analytics -H "Authorization: Bearer TOKEN"
```

Expected: a response with `account: {"username":"demo_instagram_user","profileUrl":"#"}`
and a non-empty `timeline` array with the two fixed placeholder entries. If a browser
is available: visit the analytics page for a mock platform, confirm the account header
and "Recent posts" section render with the placeholder data; click Disconnect, confirm
it redirects back to the Connect page. For X: this requires a real connected account to
fully verify (real username, real profile link, real timeline) — do this manually once
you've completed the X OAuth consent flow in a browser.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/projects/[id]/connect/[platform]/page.js" "frontend/app/projects/[id]/connect/[platform]/page.module.css"
git commit -m "feat: add account header and timeline to the analytics page"
```

---

## Out of scope for this plan

- Real Instagram/TikTok/YouTube account info or timelines
- Pagination/load-more on the timeline
- Caching the X timeline fetch
- Editing/deleting real tweets from this page
