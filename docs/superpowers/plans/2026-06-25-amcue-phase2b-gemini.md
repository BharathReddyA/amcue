# AMcue Phase 2b — Real Gemini AI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 2a stub content generator with real Gemini API calls (caption + image prompt via text generation, then a real AI-generated image), uploaded through the existing Cloudinary service — same route/frontend contract, just real content.

**Architecture:** A new `geminiProvider.js` implements the same single-function shape as the stub it replaces. The `/generate` route swaps its import, adds `try/catch` since this is now a real network call that can fail, and starts populating the previously-unused `ContentItem.imagePrompt` column. The stub provider and its hardcoded test assertions are removed.

**Tech Stack:** Same as Phase 1/2a — Express, Prisma/Postgres (Neon), plain `fetch` for the Gemini REST API (no new SDK dependency), Jest + Supertest with the provider mocked in tests (same pattern already used for Cloudinary in `projects.test.js`).

---

## File Structure

```
backend/
  .env.example                              # MODIFY: add GEMINI_API_KEY placeholder
  src/
    services/
      ai/
        geminiProvider.js                    # NEW: generateGeminiContent(project)
        stubProvider.js                       # DELETE: dead code once route swaps import
    routes/
      projects.js                            # MODIFY: swap import, add try/catch, add imagePrompt
  tests/
    content.test.js                          # MODIFY: mock geminiProvider, add failure-path test
```

---

### Task 1: Gemini provider and secrets

**Files:**
- Modify: `backend/.env.example`
- Create: `backend/src/services/ai/geminiProvider.js`

- [ ] **Step 1: Add the GEMINI_API_KEY placeholder**

Edit `backend/.env.example`, add this line:

```
GEMINI_API_KEY=""
```

- [ ] **Step 2: Set the real key in backend/.env**

Edit `backend/.env` (the real, gitignored file — never commit it), add:

```
GEMINI_API_KEY="<the real key — ask the controller/user for it, do not invent one>"
```

- [ ] **Step 3: Write the Gemini provider**

`backend/src/services/ai/geminiProvider.js`:

```js
const { uploadImageBuffer } = require('../cloudinary');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

async function generateCaptionAndPrompt(project) {
  const prompt = `You are a marketing assistant for an indie app called "${project.name}". App description: "${project.description}".
Return ONLY raw JSON (no markdown fences, no extra text) in this exact shape: {"caption": "...", "imagePrompt": "..."}.
"caption" is a short, friendly social media caption promoting the app (max 2 sentences, can include relevant emoji).
"imagePrompt" is a vivid, detailed prompt for an AI image generator to create a promotional image for this app (describe subject, style, and mood; do not request any text or words to appear in the image).`;

  const res = await fetch(
    `${API_BASE}/${TEXT_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini text generation failed with status ${res.status}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini text generation returned no content');
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  if (!parsed.caption || !parsed.imagePrompt) {
    throw new Error('Gemini text generation returned malformed JSON');
  }

  return { caption: parsed.caption, imagePrompt: parsed.imagePrompt };
}

async function generateImageBuffer(imagePrompt) {
  const res = await fetch(
    `${API_BASE}/${IMAGE_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: imagePrompt }] }] }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini image generation failed with status ${res.status}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((part) => part.inlineData);
  if (!imagePart) {
    throw new Error('Gemini image generation returned no image data');
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function generateGeminiContent(project) {
  const { caption, imagePrompt } = await generateCaptionAndPrompt(project);
  const imageBuffer = await generateImageBuffer(imagePrompt);
  const imageUrl = await uploadImageBuffer(imageBuffer, 'amcue/generated');
  return { caption, imagePrompt, imageUrl };
}

module.exports = { generateGeminiContent };
```

No test file for this module — it makes real network calls with no branching logic
that's meaningfully unit-testable without hitting the real API. It's exercised via the
mocked route tests in Task 2, consistent with how `cloudinary.js` has no direct test.

- [ ] **Step 4: Sanity-check the provider works against the real API**

Run this one-off script to confirm the full chain works before wiring it into a route:

```bash
cd backend && node -e "
require('dotenv').config();
const { generateGeminiContent } = require('./src/services/ai/geminiProvider');
generateGeminiContent({ id: 'test-id', name: 'Test App', description: 'A test app for AMcue' })
  .then((result) => {
    console.log('caption:', result.caption);
    console.log('imagePrompt:', result.imagePrompt);
    console.log('imageUrl:', result.imageUrl);
  })
  .catch((err) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  });
"
```

Expected: prints a real caption, a real image prompt, and a real `https://res.cloudinary.com/...`
URL. This requires `GEMINI_API_KEY` and the real `CLOUDINARY_*` variables to already be
set in `backend/.env` — set the Cloudinary ones now too if they're still placeholders
(ask the controller/user for the real cloud name / API key / API secret if running this
live; do not invent them).

- [ ] **Step 5: Commit**

```bash
git add backend/.env.example backend/src/services/ai/geminiProvider.js
git commit -m "feat: add real Gemini content provider"
```

---

### Task 2: Wire the provider into the route, update tests, remove the stub

**Files:**
- Modify: `backend/src/routes/projects.js`
- Modify: `backend/tests/content.test.js`
- Delete: `backend/src/services/ai/stubProvider.js`

- [ ] **Step 1: Update the failing/changing tests first**

Replace `backend/tests/content.test.js` entirely:

```js
jest.mock('../src/services/ai/geminiProvider', () => ({
  generateGeminiContent: jest.fn().mockResolvedValue({
    caption: 'Mock caption for Content Test App',
    imagePrompt: 'mock image prompt',
    imageUrl: 'https://res.cloudinary.com/fake/mock.png',
  }),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { generateGeminiContent } = require('../src/services/ai/geminiProvider');

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

afterEach(() => {
  generateGeminiContent.mockClear();
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
  it('generates a pending content item using the AI provider', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.caption).toBe('Mock caption for Content Test App');
    expect(res.body.imagePrompt).toBe('mock image prompt');
    expect(res.body.imageUrl).toBe('https://res.cloudinary.com/fake/mock.png');
  });

  it('returns 502 and creates no content item when the AI provider fails', async () => {
    generateGeminiContent.mockRejectedValueOnce(new Error('Gemini is down'));

    const before = await prisma.contentItem.count({ where: { appProjectId: projectId } });

    const res = await request(app)
      .post(`/projects/${projectId}/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    expect(res.body.error).toBeDefined();

    const after = await prisma.contentItem.count({ where: { appProjectId: projectId } });
    expect(after).toBe(before);
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

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- content.test.js`
Expected: FAIL — `Cannot find module '../src/services/ai/geminiProvider'` (it doesn't
exist as a route dependency yet; Task 1 created the file but `projects.js` doesn't
import it until the next step).

- [ ] **Step 3: Update the generate route**

Edit `backend/src/routes/projects.js`. Replace this line:

```js
const { generateStubContent } = require('../services/ai/stubProvider');
```

with:

```js
const { generateGeminiContent } = require('../services/ai/geminiProvider');
```

Replace the existing `router.post('/:id/generate', ...)` handler entirely:

```js
router.post('/:id/generate', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const { caption, imagePrompt, imageUrl } = await generateGeminiContent(project);
    const contentItem = await prisma.contentItem.create({
      data: {
        appProjectId: project.id,
        caption,
        imagePrompt,
        imageUrl,
        status: 'pending',
      },
    });
    res.status(201).json(contentItem);
  } catch (err) {
    res.status(502).json({ error: 'Content generation failed, please try again' });
  }
});
```

- [ ] **Step 4: Delete the stub provider**

```bash
rm backend/src/services/ai/stubProvider.js
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- content.test.js`
Expected: PASS, 6 tests passing (5 from Phase 2a plus the new failure-path test).

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 13 tests (3 auth + 4 projects + 6 content) pass.

- [ ] **Step 7: Verify the real end-to-end flow manually**

With `backend/.env` containing the real `GEMINI_API_KEY` and real `CLOUDINARY_*`
values (set in Task 1): start the real backend (`cd backend && npm run dev`) and run
this sequence via curl against it (replace `TOKEN`/`PROJECT_ID` with real values from
the responses as you go):

```bash
curl -s -X POST http://localhost:4000/auth/register -H "Content-Type: application/json" \
  -d '{"email":"phase2b-test@amcue.dev","password":"password123"}'
# copy the token from the response, then:
curl -s -X POST http://localhost:4000/projects -H "Authorization: Bearer TOKEN" \
  -F "name=Phase2b Test App" -F "description=A weather app for hikers"
# copy the id from the response, then:
curl -s -X POST http://localhost:4000/projects/PROJECT_ID/generate -H "Authorization: Bearer TOKEN"
```

Expected: the final response is a `ContentItem` with a real, non-templated `caption`
(should read like actual marketing copy, not "Check out X — Y!"), a populated
`imagePrompt`, and an `imageUrl` starting with `https://res.cloudinary.com/` — open that
URL in a browser to confirm it's a real generated image, not a 404 or placeholder.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/projects.js backend/tests/content.test.js
git commit -m "feat: swap stub content generator for real Gemini integration"
```

---

## Out of scope for this plan

- Retry/backoff on Gemini failures
- Caching generated content or de-duplicating prompts
- Rate limiting beyond the existing frontend "Generating..." button disable
- Any change to the mock social-connect screen or "generate today's content" trigger
