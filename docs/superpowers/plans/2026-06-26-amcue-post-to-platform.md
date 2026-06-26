# AMcue Post-to-Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose a platform and post an approved feed item to it — real OAuth + real publishing for X, mock-post (database record only) for Instagram/TikTok/YouTube.

**Architecture:** New `User` fields hold real X OAuth tokens; a new `ContentItemPost` table records every post (platform, optional real URL) per content item. A dedicated `x` service module handles PKCE OAuth and the X API calls. The existing Connect and Feed pages get small, targeted additions rather than new pages.

**Tech Stack:** Same as the rest of the project — Express, Prisma/Postgres (Neon), plain `fetch` for the X API, Next.js (JS, App Router), Jest + Supertest with X API calls mocked in tests.

---

## File Structure

```
backend/
  .env.example                          # MODIFY: add X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI, FRONTEND_URL
  prisma/
    schema.prisma                        # MODIFY: User x* fields, ContentItemPost model
  src/
    services/
      x/
        xAuth.js                          # NEW: PKCE state, authorize URL, token exchange
        xApi.js                           # NEW: media upload, tweet creation
    routes/
      xAuth.js                            # NEW: GET /login, GET /callback
      projects.js                         # MODIFY: connect routes special-case X
      content.js                          # MODIFY: add POST /:id/post, GET /:id/posts
    server.js                             # MODIFY: mount /auth/x router
  tests/
    postToPlatform.test.js                # NEW: 6 tests, X API mocked
frontend/
  app/
    projects/[id]/
      connect/
        page.js                           # MODIFY: X gets a real OAuth link instead of a toggle button
      feed/
        page.js                           # MODIFY: platform picker + Post button + posted-platforms list
```

---

### Task 1: Schema changes

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the new User fields and ContentItemPost model**

Edit `backend/prisma/schema.prisma`. Add four fields to the existing `User` model (after
`mockConnections`):

```prisma
model User {
  id              String       @id @default(uuid())
  email           String       @unique
  passwordHash    String
  mockConnections Json         @default("{\"instagram\": false, \"tiktok\": false, \"youtube\": false, \"x\": false}")
  xAccessToken    String?
  xRefreshToken   String?
  xTokenExpiresAt DateTime?
  xUsername       String?
  createdAt       DateTime     @default(now())
  appProjects     AppProject[]
}
```

Add `posts ContentItemPost[]` to the existing `ContentItem` model:

```prisma
model ContentItem {
  id            String           @id @default(uuid())
  appProjectId  String
  appProject    AppProject       @relation(fields: [appProjectId], references: [id])
  caption       String?
  imagePrompt   String?
  imageUrl      String?
  status        String           @default("pending")
  createdAt     DateTime         @default(now())
  messages      ContentMessage[]
  posts         ContentItemPost[]
}
```

Add this new model at the end of the file:

```prisma
model ContentItemPost {
  id            String      @id @default(uuid())
  contentItemId String
  contentItem   ContentItem @relation(fields: [contentItemId], references: [id])
  platform      String
  externalUrl   String?
  postedAt      DateTime    @default(now())
}
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npx prisma migrate dev --name add_x_oauth_and_content_posts`
Expected: "Your database is now in sync with your schema." and a new migration folder.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add X OAuth fields and ContentItemPost table"
```

---

### Task 2: X OAuth service (PKCE, token exchange)

**Files:**
- Modify: `backend/.env.example`
- Create: `backend/src/services/x/xAuth.js`

- [ ] **Step 1: Add the new env var placeholders**

Edit `backend/.env.example`, add:

```
X_CLIENT_ID=""
X_CLIENT_SECRET=""
X_REDIRECT_URI=""
FRONTEND_URL=""
```

`X_REDIRECT_URI` must exactly match a callback URL registered in the X developer app's
"User authentication settings" (e.g. `http://127.0.0.1:4000/auth/x/callback` for local
dev, or the deployed backend's `/auth/x/callback` URL in production — X supports
registering multiple callback URLs via "Add another", so both can be registered at
once). `FRONTEND_URL` is where the user gets redirected back to after authorizing
(e.g. `http://localhost:3000` locally).

- [ ] **Step 2: Write the X OAuth service**

`backend/src/services/x/xAuth.js`:

```js
const crypto = require('crypto');

const AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const SCOPES = 'tweet.write tweet.read users.read offline.access';

// ponytail: in-memory state store is fine for a single-instance deployment
// with a short-lived OAuth flow - a multi-instance production deployment
// would need a shared store (DB/Redis) instead.
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function createState(userId, projectId) {
  const state = base64UrlEncode(crypto.randomBytes(16));
  const { verifier, challenge } = generatePkce();
  pendingStates.set(state, { verifier, userId, projectId, createdAt: Date.now() });
  return { state, challenge };
}

function consumeState(state) {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry;
}

function buildAuthorizeUrl(state, challenge) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: process.env.X_REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code, verifier) {
  const basicAuth = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString(
    'base64'
  );
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: process.env.X_CLIENT_ID,
      redirect_uri: process.env.X_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`X token exchange failed with status ${res.status}`);
  }

  return res.json();
}

async function fetchXUsername(accessToken) {
  const res = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`X user lookup failed with status ${res.status}`);
  }
  const data = await res.json();
  return data.data?.username || null;
}

module.exports = {
  createState,
  consumeState,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchXUsername,
};
```

No test file for this module — `createState`/`consumeState` are pure in-memory logic
exercised indirectly through the route tests in Task 4; the network calls
(`exchangeCodeForTokens`/`fetchXUsername`) have no branching logic worth unit testing
without hitting the real API, consistent with `geminiProvider.js` having no direct test.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example backend/src/services/x/xAuth.js
git commit -m "feat: add X OAuth PKCE service"
```

---

### Task 3: X posting service

**Files:**
- Create: `backend/src/services/x/xApi.js`

- [ ] **Step 1: Write the service**

`backend/src/services/x/xApi.js`:

```js
async function uploadMedia(accessToken, imageUrl) {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch content image with status ${imageRes.status}`);
  }
  const arrayBuffer = await imageRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  const res = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ media_data: base64 }),
  });

  if (!res.ok) {
    throw new Error(`X media upload failed with status ${res.status}`);
  }

  const data = await res.json();
  return data.media_id_string;
}

async function postTweet(accessToken, text, mediaId) {
  const res = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      media: { media_ids: [mediaId] },
    }),
  });

  if (!res.ok) {
    throw new Error(`X tweet creation failed with status ${res.status}`);
  }

  const data = await res.json();
  const tweetId = data.data?.id;
  return { id: tweetId, url: `https://x.com/i/web/status/${tweetId}` };
}

module.exports = { uploadMedia, postTweet };
```

No test file for this module — same rationale as Task 2's OAuth service (real network
calls, exercised via mocked route tests in Task 6).

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/x/xApi.js
git commit -m "feat: add X media upload and tweet posting service"
```

---

### Task 4: X OAuth routes

> **Amended during implementation:** the original version of this task had `/login`
> read the real session JWT from a `token` query parameter, which a safety review
> correctly flagged as credential exposure (a long-lived auth token sitting in browser
> history / server access logs). The actual implementation instead adds a
> `POST /prepare` endpoint (authenticated normally via the `Authorization` header) that
> exchanges the real JWT for a short-lived (60s), single-use ticket; `/login` consumes
> that ticket instead of a JWT. See Task 7's amendment note for the matching frontend
> change. The code below reflects the original (superseded) version — the actual
> shipped code is in `backend/src/routes/xAuth.js` and `backend/src/services/x/xAuth.js`
> (`createTicket`/`consumeTicket`).

**Files:**
- Create: `backend/src/routes/xAuth.js`
- Modify: `backend/src/server.js`

- [ ] **Step 1: Write the routes**

`backend/src/routes/xAuth.js`:

A full-page `<a>` navigation to kick off OAuth can't carry an `Authorization` header
the way every other route in this app expects, since the JWT lives in
`localStorage`, not a cookie. So `/login` reads the token from a query parameter
instead of using the `requireAuth` middleware:

```js
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const {
  createState,
  consumeState,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchXUsername,
} = require('../services/x/xAuth');

const router = express.Router();

router.get('/login', (req, res) => {
  if (!process.env.X_CLIENT_ID || !process.env.X_CLIENT_SECRET) {
    return res.status(500).json({ error: 'X integration is not configured yet' });
  }

  const { token, projectId } = req.query;
  let userId;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    userId = payload.userId;
  } catch (err) {
    return res.status(401).send('Your session expired. Please log in again and retry connecting X.');
  }

  const { state, challenge } = createState(userId, projectId);
  const url = buildAuthorizeUrl(state, challenge);
  res.redirect(url);
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const entry = consumeState(state);
  if (!entry) {
    return res.status(400).send('Invalid or expired X login attempt. Please try connecting again.');
  }

  try {
    const tokens = await exchangeCodeForTokens(code, entry.verifier);
    const username = await fetchXUsername(tokens.access_token);

    await prisma.user.update({
      where: { id: entry.userId },
      data: {
        xAccessToken: tokens.access_token,
        xRefreshToken: tokens.refresh_token || null,
        xTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        xUsername: username,
      },
    });

    res.redirect(`${process.env.FRONTEND_URL}/projects/${entry.projectId}/connect`);
  } catch (err) {
    console.error('X OAuth callback failed:', err);
    res.status(502).send('Connecting to X failed. Please try again.');
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount the router**

Edit `backend/src/server.js`, add below the existing route registrations:

```js
const xAuthRoutes = require('./routes/xAuth');
app.use('/auth/x', xAuthRoutes);
```

- [ ] **Step 3: Verify the server still boots**

Run: `cd backend && node src/server.js`
Expected: `AMcue backend listening on 4000` with no errors (the new routes only fail at
request time if `X_CLIENT_ID`/`X_CLIENT_SECRET` are missing — they don't crash startup).
Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/xAuth.js backend/src/server.js
git commit -m "feat: add X OAuth login and callback routes"
```

---

### Task 5: Special-case X in the connect routes

**Files:**
- Modify: `backend/src/routes/projects.js`

- [ ] **Step 1: Update GET /:id/connect to report real X status**

Edit `backend/src/routes/projects.js`. Replace the existing `router.get('/:id/connect',
...)` handler:

```js
router.get('/:id/connect', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const connections = withConnectionDefaults(user.mockConnections);
  connections.x = Boolean(user.xAccessToken);
  res.json(connections);
});
```

- [ ] **Step 2: Update POST /:id/connect/:platform to special-case X**

Replace the existing `router.post('/:id/connect/:platform', ...)` handler:

```js
router.post('/:id/connect/:platform', async (req, res) => {
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

  if (platform === 'x') {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user.xAccessToken) {
      return res.status(400).json({ error: 'X is not connected. Use the Connect link instead.' });
    }
    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { xAccessToken: null, xRefreshToken: null, xTokenExpiresAt: null, xUsername: null },
    });
    const connections = withConnectionDefaults(updated.mockConnections);
    connections.x = false;
    return res.json(connections);
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const current = withConnectionDefaults(user.mockConnections);
  const mockConnections = {
    ...current,
    [platform]: !current[platform],
  };

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { mockConnections },
  });

  const connections = withConnectionDefaults(updated.mockConnections);
  connections.x = Boolean(updated.xAccessToken);
  res.json(connections);
});
```

- [ ] **Step 3: Run the existing connect test suite to confirm no regression**

Run: `cd backend && npm test -- connect.test.js`
Expected: PASS, all existing tests still pass (they only exercise
instagram/tiktok/youtube, unaffected by the X special-casing).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/projects.js
git commit -m "feat: special-case X in connect routes for real OAuth status"
```

---

### Task 6: Post-to-platform route

**Files:**
- Modify: `backend/src/routes/content.js`
- Test: `backend/tests/postToPlatform.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/postToPlatform.test.js`:

```js
jest.mock('../src/services/x/xApi', () => ({
  uploadMedia: jest.fn(),
  postTweet: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { uploadMedia, postTweet } = require('../src/services/x/xApi');

let token;
let userId;
let projectId;
let approvedItemId;
let pendingItemId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'post-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'post-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Post Test App')
    .field('description', 'An app for post-to-platform tests');
  projectId = projectRes.body.id;

  const approvedItem = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Approved post',
      imageUrl: 'https://res.cloudinary.com/fake/approved.png',
      status: 'approved',
    },
  });
  approvedItemId = approvedItem.id;

  const pendingItem = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Pending post',
      imageUrl: 'https://res.cloudinary.com/fake/pending.png',
      status: 'pending',
    },
  });
  pendingItemId = pendingItem.id;
});

afterEach(() => {
  uploadMedia.mockClear();
  postTweet.mockClear();
});

afterAll(async () => {
  await prisma.contentItemPost.deleteMany({
    where: { contentItem: { appProjectId: projectId } },
  });
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('post-to-platform route', () => {
  it('mock-posts to instagram with no external call', async () => {
    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'instagram' });

    expect(res.status).toBe(201);
    expect(res.body.platform).toBe('instagram');
    expect(res.body.externalUrl).toBeNull();
    expect(uploadMedia).not.toHaveBeenCalled();
    expect(postTweet).not.toHaveBeenCalled();
  });

  it('returns 400 when posting to X without being connected', async () => {
    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'x' });

    expect(res.status).toBe(400);
  });

  it('posts to X when connected, using the mocked X API', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { xAccessToken: 'fake-token', xUsername: 'faketestuser' },
    });
    uploadMedia.mockResolvedValue('media-123');
    postTweet.mockResolvedValue({ id: 'tweet-456', url: 'https://x.com/i/web/status/tweet-456' });

    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'x' });

    expect(res.status).toBe(201);
    expect(res.body.platform).toBe('x');
    expect(res.body.externalUrl).toBe('https://x.com/i/web/status/tweet-456');
    expect(uploadMedia).toHaveBeenCalledWith('fake-token', 'https://res.cloudinary.com/fake/approved.png');
  });

  it('returns 404 when posting a pending (not approved) item', async () => {
    const res = await request(app)
      .post(`/content/${pendingItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'instagram' });

    expect(res.status).toBe(404);
  });

  it('rejects an invalid platform', async () => {
    const res = await request(app)
      .post(`/content/${approvedItemId}/post`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platform: 'facebook' });

    expect(res.status).toBe(400);
  });

  it('lists all posts for a content item', async () => {
    const res = await request(app)
      .get(`/content/${approvedItemId}/posts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    const platforms = res.body.map((p) => p.platform).sort();
    expect(platforms).toEqual(['instagram', 'x']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- postToPlatform.test.js`
Expected: FAIL — `POST/GET /content/:id/post(s)` 404, routes don't exist yet.

- [ ] **Step 3: Add the routes**

Edit `backend/src/routes/content.js`. Add this import near the top:

```js
const { uploadMedia, postTweet } = require('../services/x/xApi');
```

Add these two routes after the existing chat-message routes, before
`module.exports = router;`:

```js
router.post('/:id/post', async (req, res) => {
  const { platform } = req.body;
  if (!['instagram', 'tiktok', 'youtube', 'x'].includes(platform)) {
    return res.status(400).json({ error: 'platform must be one of: instagram, tiktok, youtube, x' });
  }

  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }
  if (item.status !== 'approved') {
    return res.status(404).json({ error: 'Only approved content items can be posted' });
  }

  if (platform === 'x') {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user.xAccessToken) {
      return res.status(400).json({ error: 'Connect X first' });
    }

    try {
      const mediaId = await uploadMedia(user.xAccessToken, item.imageUrl);
      const tweet = await postTweet(user.xAccessToken, item.caption, mediaId);

      const post = await prisma.contentItemPost.create({
        data: { contentItemId: item.id, platform: 'x', externalUrl: tweet.url },
      });
      return res.status(201).json(post);
    } catch (err) {
      console.error('X posting failed:', err);
      return res.status(502).json({ error: 'Posting to X failed, please try again' });
    }
  }

  const post = await prisma.contentItemPost.create({
    data: { contentItemId: item.id, platform, externalUrl: null },
  });
  res.status(201).json(post);
});

router.get('/:id/posts', async (req, res) => {
  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  const posts = await prisma.contentItemPost.findMany({
    where: { contentItemId: item.id },
    orderBy: { postedAt: 'desc' },
  });
  res.json(posts);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- postToPlatform.test.js`
Expected: PASS, 6 tests passing.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 39 tests pass (33 existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/content.js backend/tests/postToPlatform.test.js
git commit -m "feat: add post-to-platform routes (real X, mock others)"
```

---

### Task 7: Connect page — real X login link

> **Amended during implementation:** matching Task 4's amendment, the X button does
> not build a static `<a href>` with the real JWT in it. Instead, clicking "Connect" on
> X calls `POST /auth/x/prepare` (via `apiFetch`, so the JWT goes in the
> `Authorization` header as normal) to get a one-time ticket, then sets
> `window.location.href` to the login URL with that ticket. The X card keeps using the
> same `Button` component as every other platform (no separate `xConnectLink` style
> needed) — the `onClick` handler just branches on whether the platform is X and not
> yet connected.

**Files:**
- Modify: `frontend/app/projects/[id]/connect/page.js`

- [ ] **Step 1: Special-case the X card's Connect button**

Edit `frontend/app/projects/[id]/connect/page.js`. Replace the `PLATFORMS.map(...)` body
inside the `<div className={styles.list}>` block:

```jsx
        {PLATFORMS.map((platform) => (
          <Card key={platform.key} className={styles.item}>
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
            {platform.key === 'x' && !connections?.x ? (
              <a
                className={styles.xConnectLink}
                href={`${process.env.NEXT_PUBLIC_API_URL}/auth/x/login?projectId=${id}&token=${encodeURIComponent(localStorage.getItem('amcue_token'))}`}
              >
                Connect
              </a>
            ) : (
              <Button
                variant={connections?.[platform.key] ? 'secondary' : 'primary'}
                onClick={() => handleToggle(platform.key)}
                disabled={!connections}
              >
                {connections?.[platform.key] ? 'Disconnect' : 'Connect'}
              </Button>
            )}
          </Card>
        ))}
```

This requires `NEXT_PUBLIC_API_URL` to already be set in `frontend/.env.local` — it is
(set in Phase 1). The X "Connect" link is a real `<a>` causing a full navigation to the
backend's `/auth/x/login`, which reads the token from the `token` query param (Task 4
already wrote `/login` this way specifically because a plain browser navigation can't
carry an `Authorization` header) — no backend changes needed in this task.

- [ ] **Step 2: Commit**

```bash
git add frontend/app/projects/[id]/connect/page.js
git commit -m "feat: wire real X OAuth login link into the Connect page"
```

---

### Task 8: Feed page — platform picker and Post button

**Files:**
- Modify: `frontend/app/projects/[id]/feed/page.js`
- Modify: `frontend/app/projects/[id]/feed/page.module.css`

- [ ] **Step 1: Add the platform picker and posted-platforms list**

Replace `frontend/app/projects/[id]/feed/page.js` entirely:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
};

export default function FeedPage() {
  const router = useRouter();
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [postsByItem, setPostsByItem] = useState({});
  const [selectedPlatform, setSelectedPlatform] = useState({});
  const [posting, setPosting] = useState({});

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/content?status=approved`)
      .then((data) => {
        setItems(data);
        data.forEach((item) => {
          apiFetch(`/content/${item.id}/posts`)
            .then((posts) => setPostsByItem((prev) => ({ ...prev, [item.id]: posts })))
            .catch(() => {});
        });
      })
      .catch((err) => setError(err.message));
  }, [id, router]);

  async function handlePost(itemId) {
    const platform = selectedPlatform[itemId] || 'instagram';
    setPosting((prev) => ({ ...prev, [itemId]: true }));
    setError('');
    try {
      const post = await apiFetch(`/content/${itemId}/post`, {
        method: 'POST',
        body: { platform },
      });
      setPostsByItem((prev) => ({ ...prev, [itemId]: [post, ...(prev[itemId] || [])] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting((prev) => ({ ...prev, [itemId]: false }));
    }
  }

  return (
    <div>
      <TopTabs projectId={id} active="feed" />
      <h1>Approved feed</h1>
      {error && <p className={styles.error}>{error}</p>}
      {items.length === 0 && !error && <p>Nothing approved yet.</p>}
      <div className={styles.list}>
        {items.map((item) => (
          <Card key={item.id} className={styles.item}>
            <img src={item.imageUrl} alt="Approved content" width={120} />
            <div className={styles.itemBody}>
              <p>{item.caption}</p>
              <div className={styles.postedList}>
                {(postsByItem[item.id] || []).map((post) => (
                  <span key={post.id} className={styles.postedBadge}>
                    {post.externalUrl ? (
                      <a href={post.externalUrl} target="_blank" rel="noreferrer">
                        Posted to {PLATFORM_LABELS[post.platform]} ↗
                      </a>
                    ) : (
                      `Posted to ${PLATFORM_LABELS[post.platform]}`
                    )}
                  </span>
                ))}
              </div>
              <div className={styles.postControls}>
                <select
                  className={styles.platformSelect}
                  value={selectedPlatform[item.id] || 'instagram'}
                  onChange={(e) =>
                    setSelectedPlatform((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                >
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="x">X</option>
                </select>
                <Button onClick={() => handlePost(item.id)} disabled={posting[item.id]}>
                  {posting[item.id] ? 'Posting...' : 'Post'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the new styles**

Edit `frontend/app/projects/[id]/feed/page.module.css`, add at the end:

```css
.postedList {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
}

.postedBadge {
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-bg-subtle);
  padding: 2px 8px;
  border-radius: 12px;
}

.postControls {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.platformSelect {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 8px 10px;
  font-size: 14px;
}
```

- [ ] **Step 3: Verify the mock-post flow end-to-end**

Via curl against the real backend (register/login → create project → generate content
→ approve it):

```bash
curl -s -X POST http://localhost:4000/content/CONTENT_ITEM_ID/post -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"platform":"instagram"}'
curl -s http://localhost:4000/content/CONTENT_ITEM_ID/posts -H "Authorization: Bearer TOKEN"
```

Expected: a 201 with `platform: "instagram"`, `externalUrl: null`, and the second call
shows it in the list. If a browser is available: visit the feed page, pick a platform
from the dropdown, click Post, confirm a "Posted to Instagram" badge appears. X posting
cannot be verified end-to-end yet — that requires `X_CLIENT_ID`/`X_CLIENT_SECRET` to be
set and a real OAuth connect to have happened first (out of scope for this plan's
verification step; do it manually once credentials are available).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/projects/[id]/feed/page.js frontend/app/projects/[id]/feed/page.module.css
git commit -m "feat: add platform picker and post button to the feed page"
```

---

## Out of scope for this plan

- Real Instagram/TikTok/YouTube integration (separate future plans, pending their own
  developer app approvals)
- Token refresh automation for X
- Un-posting / deleting a `ContentItemPost` record
- Live end-to-end verification of real X posting (deferred until `X_CLIENT_ID`/
  `X_CLIENT_SECRET` are available)
