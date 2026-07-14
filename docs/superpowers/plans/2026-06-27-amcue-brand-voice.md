# AMcue Self-Improving Brand Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make content generation learn from the user's editorial behavior — approved/rejected captions and chat-edit instructions are injected into every Gemini generation, with a visible, distillable "Brand Voice" card on the project detail page.

**Architecture:** A new `brandVoice.js` service retrieves existing DB signals (`getVoiceContext`) and distills a human-readable summary via one Gemini call (`distillVoice`). The generate route passes the context to `generateGeminiContent`, which appends it to the prompt; the chat-edit provider receives the summary. Two nullable fields on `AppProject` store the summary and a staleness counter. No new tables, no background jobs.

**Tech Stack:** Same as the rest of the project — Express, Prisma/Postgres (Neon), plain `fetch` for Gemini, Next.js (JS, App Router), Jest + Supertest with Gemini mocked in tests.

---

## File Structure

```
backend/
  prisma/
    schema.prisma                        # MODIFY: AppProject.brandVoiceSummary/-Signals
  src/
    services/
      ai/
        brandVoice.js                     # NEW: getVoiceContext, distillVoice
        geminiProvider.js                 # MODIFY: prompt accepts voice context
        chatEditProvider.js               # MODIFY: decideChatAction accepts voiceSummary
    routes/
      projects.js                         # MODIFY: generate passes context; GET/POST brand-voice
      content.js                          # MODIFY: chat route passes voiceSummary
  tests/
    brandVoice.test.js                    # NEW: 6 tests
frontend/
  app/projects/[id]/
    page.js                               # MODIFY: Brand Voice card
    page.module.css                       # MODIFY: card styles
```

---

### Task 1: Schema fields

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the fields to AppProject**

Edit `backend/prisma/schema.prisma` — add two fields to the existing `AppProject` model
(after `screenshotUrls`):

```prisma
model AppProject {
  id                String            @id @default(uuid())
  userId            String
  user              User              @relation(fields: [userId], references: [id])
  name              String
  description       String
  screenshotUrls    String[]          @default([])
  brandVoiceSummary String?
  brandVoiceSignals Int               @default(0)
  createdAt         DateTime          @default(now())
  contentItems      ContentItem[]
}
```

(Keep every existing field; only `brandVoiceSummary` and `brandVoiceSignals` are new.
Realign the column padding as shown or leave alignment as-is — Prisma doesn't care.)

- [ ] **Step 2: Run the migration**

Run: `cd backend && npx prisma migrate dev --name add_brand_voice_fields`
Expected: "Your database is now in sync with your schema." and a new migration folder.

- [ ] **Step 3: Regenerate the Prisma client (known recurring step)**

Run: `cd backend && npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add brand voice fields to AppProject"
```

---

### Task 2: brandVoice service

**Files:**
- Create: `backend/src/services/ai/brandVoice.js`

- [ ] **Step 1: Write the service**

`backend/src/services/ai/brandVoice.js`:

```js
const prisma = require('../../prismaClient');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';

// ponytail: "learning" is retrieval + prompt injection over rows we already
// store - no embeddings, no background jobs. Revisit only if projects
// accumulate hundreds of signals and prompt size becomes a real problem.
async function getVoiceContext(projectId) {
  const [approvedItems, rejectedItems, editMessages, project] = await Promise.all([
    prisma.contentItem.findMany({
      where: { appProjectId: projectId, status: 'approved', caption: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { caption: true },
    }),
    prisma.contentItem.findMany({
      where: { appProjectId: projectId, status: 'rejected', caption: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { caption: true },
    }),
    prisma.contentMessage.findMany({
      where: { role: 'user', contentItem: { appProjectId: projectId } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { text: true },
    }),
    prisma.appProject.findUnique({
      where: { id: projectId },
      select: { brandVoiceSummary: true },
    }),
  ]);

  return {
    approved: approvedItems.map((i) => i.caption),
    rejected: rejectedItems.map((i) => i.caption),
    edits: editMessages.map((m) => m.text),
    summary: project?.brandVoiceSummary || null,
  };
}

async function countVoiceSignals(projectId) {
  const [approved, rejected, edits] = await Promise.all([
    prisma.contentItem.count({ where: { appProjectId: projectId, status: 'approved' } }),
    prisma.contentItem.count({ where: { appProjectId: projectId, status: 'rejected' } }),
    prisma.contentMessage.count({
      where: { role: 'user', contentItem: { appProjectId: projectId } },
    }),
  ]);
  return { approved, rejected, edits, total: approved + rejected + edits };
}

async function distillVoice(projectId) {
  const context = await getVoiceContext(projectId);

  const prompt = `You are analyzing a brand's editorial voice from real user behavior.

Captions the user APPROVED:
${context.approved.map((c) => `- ${c}`).join('\n') || '(none)'}

Captions the user REJECTED:
${context.rejected.map((c) => `- ${c}`).join('\n') || '(none)'}

Edit instructions the user gave when refining content:
${context.edits.map((e) => `- ${e}`).join('\n') || '(none)'}

Write a concise brand voice description (max 80 words, plain prose, no headings or
bullets) covering tone, style, and clear dos/don'ts inferred from the above.`;

  const res = await fetch(
    `${API_BASE}/${TEXT_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) {
    throw new Error(`Brand voice distillation failed with status ${res.status}`);
  }

  const data = await res.json();
  const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!summary) {
    throw new Error('Brand voice distillation returned no content');
  }
  return summary;
}

module.exports = { getVoiceContext, countVoiceSignals, distillVoice };
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/ai/brandVoice.js
git commit -m "feat: add brand voice retrieval and distillation service"
```

---

### Task 3: Voice-aware generation and chat editing

**Files:**
- Modify: `backend/src/services/ai/geminiProvider.js`
- Modify: `backend/src/services/ai/chatEditProvider.js`
- Modify: `backend/src/routes/projects.js` (generate route only)
- Modify: `backend/src/routes/content.js` (chat POST route only)

- [ ] **Step 1: Teach geminiProvider to accept voice context**

Edit `backend/src/services/ai/geminiProvider.js`. Replace `generateCaptionAndPrompt`:

```js
function buildVoiceSection(voice) {
  if (!voice) return '';
  const parts = [];
  if (voice.summary) {
    parts.push(`Brand voice summary: ${voice.summary}`);
  }
  if (voice.approved?.length) {
    parts.push(
      `Match the style, tone, and voice of these captions the user approved:\n${voice.approved
        .map((c) => `- ${c}`)
        .join('\n')}`
    );
  }
  if (voice.rejected?.length) {
    parts.push(
      `Avoid the style and content patterns of these captions the user rejected:\n${voice.rejected
        .map((c) => `- ${c}`)
        .join('\n')}`
    );
  }
  if (voice.edits?.length) {
    parts.push(
      `The user has given these standing preferences when editing content - respect them:\n${voice.edits
        .map((e) => `- ${e}`)
        .join('\n')}`
    );
  }
  if (parts.length === 0) return '';
  return `\n\nBRAND VOICE (learned from this user's editorial history):\n${parts.join('\n\n')}`;
}

async function generateCaptionAndPrompt(project, voice) {
  const prompt = `You are a marketing assistant for an indie app called "${project.name}". App description: "${project.description}".
Return ONLY raw JSON (no markdown fences, no extra text) in this exact shape: {"caption": "...", "imagePrompt": "..."}.
"caption" is a short, friendly social media caption promoting the app (max 2 sentences, can include relevant emoji).
"imagePrompt" is a vivid, detailed prompt for an AI image generator to create a promotional image for this app (describe subject, style, and mood; do not request any text or words to appear in the image).${buildVoiceSection(voice)}`;

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
```

And replace `generateGeminiContent`:

```js
async function generateGeminiContent(project, voice = null) {
  const { caption, imagePrompt } = await generateCaptionAndPrompt(project, voice);
  const imageBuffer = await generateImageBuffer(imagePrompt);
  const imageUrl = await uploadImageBuffer(imageBuffer, 'amcue/generated');
  return { caption, imagePrompt, imageUrl };
}
```

- [ ] **Step 2: Pass voice context from the generate route**

Edit `backend/src/routes/projects.js`. Add this import near the other ai-service
imports:

```js
const { getVoiceContext, countVoiceSignals, distillVoice } = require('../services/ai/brandVoice');
```

In the `router.post('/:id/generate', ...)` handler, replace the line

```js
    const { caption, imagePrompt, imageUrl } = await generateGeminiContent(project);
```

with

```js
    const voice = await getVoiceContext(project.id);
    const { caption, imagePrompt, imageUrl } = await generateGeminiContent(project, voice);
```

(The `try` block already wraps this; a voice-context DB failure surfaces as the
existing 502, which is acceptable.)

- [ ] **Step 3: Give the chat editor the voice summary**

Edit `backend/src/services/ai/chatEditProvider.js`. In `decideChatAction`, change the
signature and prompt:

```js
async function decideChatAction({ caption, imagePrompt, history, userText, voiceSummary }) {
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const voiceLine = voiceSummary ? `\nBrand voice to respect: ${voiceSummary}\n` : '';

  const prompt = `You are an assistant helping someone refine a piece of marketing content before they approve it.
${voiceLine}
Current caption: "${caption}"
Current image description: "${imagePrompt}"

Conversation so far:
${historyText || '(no messages yet)'}

New user message: "${userText}"

Decide what to do and respond with ONLY raw JSON (no markdown fences, no extra text) in this exact shape:
{"reply": "...", "updateCaption": false, "newCaption": null, "updateImage": false, "imageEditInstruction": null}

"reply" is a short, friendly conversational response to the user.
Set "updateCaption" to true and provide "newCaption" only if the user asked to change the caption/text.
Set "updateImage" to true and provide "imageEditInstruction" (a clear instruction for an image editor, e.g. "change the background to blue") only if the user asked to change the image.
If the message doesn't request any change, leave both update flags false and the other fields null.`;
```

(The rest of `decideChatAction` — the fetch, parsing, validation — is unchanged.)

In `applyChatMessage`, pass it through:

```js
async function applyChatMessage({ contentItem, history, userText, voiceSummary }) {
  const decision = await decideChatAction({
    caption: contentItem.caption,
    imagePrompt: contentItem.imagePrompt,
    history,
    userText,
    voiceSummary,
  });
```

(The rest of `applyChatMessage` is unchanged.)

- [ ] **Step 4: Pass the summary from the chat route**

Edit `backend/src/routes/content.js`. In `router.post('/:id/messages', ...)`, change the
item lookup to include the project:

```js
  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
    include: { appProject: { select: { brandVoiceSummary: true } } },
  });
```

and change the `applyChatMessage` call:

```js
    const { reply, updates } = await applyChatMessage({
      contentItem: item,
      history: priorHistory.filter((m) => m.id !== userMessage.id),
      userText: text,
      voiceSummary: item.appProject.brandVoiceSummary,
    });
```

(Everything else in the route is unchanged. The later `prisma.contentItem.update` uses
`item.id` only, so the added `include` is harmless.)

- [ ] **Step 5: Run the full backend test suite (regression only)**

Run: `cd backend && npm test`
Expected: All 48 tests pass — existing suites mock `generateGeminiContent` and
`applyChatMessage`, so the new optional parameters are invisible to them.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ai/geminiProvider.js backend/src/services/ai/chatEditProvider.js backend/src/routes/projects.js backend/src/routes/content.js
git commit -m "feat: inject brand voice context into generation and chat editing"
```

---

### Task 4: Brand-voice routes and tests

**Files:**
- Modify: `backend/src/routes/projects.js`
- Test: `backend/tests/brandVoice.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/brandVoice.test.js`:

```js
jest.mock('../src/services/ai/geminiProvider', () => ({
  generateGeminiContent: jest.fn().mockResolvedValue({
    caption: 'Voice test caption',
    imagePrompt: 'voice test prompt',
    imageUrl: 'https://res.cloudinary.com/fake/voice.png',
  }),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { generateGeminiContent } = require('../src/services/ai/geminiProvider');
const { getVoiceContext } = require('../src/services/ai/brandVoice');

let token;
let userId;
let projectId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'voice-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'voice-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Voice Test App')
    .field('description', 'An app for brand voice tests');
  projectId = projectRes.body.id;

  const approved = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Approved witty caption',
      imageUrl: 'https://res.cloudinary.com/fake/a.png',
      status: 'approved',
    },
  });
  await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Rejected bland caption',
      imageUrl: 'https://res.cloudinary.com/fake/r.png',
      status: 'rejected',
    },
  });
  await prisma.contentMessage.create({
    data: { contentItemId: approved.id, role: 'user', text: 'Make it punchier' },
  });
  await prisma.contentMessage.create({
    data: { contentItemId: approved.id, role: 'assistant', text: 'Done!' },
  });
});

afterEach(() => {
  generateGeminiContent.mockClear();
  if (global.fetch && global.fetch.mockRestore) {
    global.fetch.mockRestore();
  }
});

afterAll(async () => {
  await prisma.contentMessage.deleteMany({
    where: { contentItem: { appProjectId: projectId } },
  });
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['voice-test@amcue.dev', 'voice-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('brand voice', () => {
  it('getVoiceContext returns project-scoped signals (user messages only)', async () => {
    const ctx = await getVoiceContext(projectId);
    expect(ctx.approved).toEqual(['Approved witty caption']);
    expect(ctx.rejected).toEqual(['Rejected bland caption']);
    expect(ctx.edits).toEqual(['Make it punchier']);
    expect(ctx.summary).toBeNull();
  });

  it('generate passes the voice context to the provider', async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/generate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    const [, voiceArg] = generateGeminiContent.mock.calls[0];
    expect(voiceArg.approved).toContain('Approved witty caption');
    expect(voiceArg.rejected).toContain('Rejected bland caption');
    expect(voiceArg.edits).toContain('Make it punchier');
  });

  it('GET brand-voice returns counts and staleness', async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/brand-voice`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
    expect(res.body.counts.approved).toBe(1);
    expect(res.body.counts.rejected).toBe(1);
    expect(res.body.counts.edits).toBe(1);
    expect(res.body.stale).toBe(true);
  });

  it('POST refresh distills and stores the summary', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          candidates: [{ content: { parts: [{ text: 'Witty, punchy, emoji-light.' }] } }],
        }),
    });

    const res = await request(app)
      .post(`/projects/${projectId}/brand-voice/refresh`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('Witty, punchy, emoji-light.');
    expect(res.body.stale).toBe(false);

    const project = await prisma.appProject.findUnique({ where: { id: projectId } });
    expect(project.brandVoiceSummary).toBe('Witty, punchy, emoji-light.');
    expect(project.brandVoiceSignals).toBe(3);
  });

  it('POST refresh failure leaves the prior summary intact', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

    const res = await request(app)
      .post(`/projects/${projectId}/brand-voice/refresh`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(502);
    const project = await prisma.appProject.findUnique({ where: { id: projectId } });
    expect(project.brandVoiceSummary).toBe('Witty, punchy, emoji-light.');
  });

  it('returns 404 for another user\'s project', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'voice-test-other@amcue.dev', password: 'password123' });

    const res = await request(app)
      .get(`/projects/${projectId}/brand-voice`)
      .set('Authorization', `Bearer ${otherRes.body.token}`);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- brandVoice.test.js`
Expected: FAIL — the two brand-voice routes 404 (don't exist yet); the
`getVoiceContext` and generate-context tests may already pass (Tasks 2-3 built them),
which is fine.

- [ ] **Step 3: Add the routes**

Edit `backend/src/routes/projects.js`. Add these two routes after the
`router.get('/:id/connect/:platform/analytics', ...)` handler, before
`module.exports = router;`:

```js
router.get('/:id/brand-voice', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const counts = await countVoiceSignals(project.id);
  res.json({
    summary: project.brandVoiceSummary,
    counts: { approved: counts.approved, rejected: counts.rejected, edits: counts.edits },
    stale: counts.total !== project.brandVoiceSignals,
  });
});

router.post('/:id/brand-voice/refresh', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const summary = await distillVoice(project.id);
    const counts = await countVoiceSignals(project.id);
    await prisma.appProject.update({
      where: { id: project.id },
      data: { brandVoiceSummary: summary, brandVoiceSignals: counts.total },
    });
    res.json({
      summary,
      counts: { approved: counts.approved, rejected: counts.rejected, edits: counts.edits },
      stale: false,
    });
  } catch (err) {
    console.error('Brand voice refresh failed:', err);
    res.status(502).json({ error: 'Brand voice refresh failed, please try again' });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- brandVoice.test.js`
Expected: PASS, 6 tests passing.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 54 tests pass (48 existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/projects.js backend/tests/brandVoice.test.js
git commit -m "feat: add brand voice routes with distillation and staleness"
```

---

### Task 5: Brand Voice card on the project detail page

**Files:**
- Modify: `frontend/app/projects/[id]/page.js`
- Modify: `frontend/app/projects/[id]/page.module.css`

- [ ] **Step 1: Add the card to the page**

Replace `frontend/app/projects/[id]/page.js` entirely:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [voice, setVoice] = useState(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}`)
      .then(setProject)
      .catch((err) => setError(err.message));
    apiFetch(`/projects/${id}/brand-voice`)
      .then(setVoice)
      .catch(() => {});
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

  async function handleRefreshVoice() {
    setRefreshing(true);
    setError('');
    try {
      const updated = await apiFetch(`/projects/${id}/brand-voice/refresh`, { method: 'POST' });
      setVoice(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (error && !project) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!project) {
    return <p>Loading...</p>;
  }

  const totalSignals = voice
    ? voice.counts.approved + voice.counts.rejected + voice.counts.edits
    : 0;

  return (
    <div>
      <TopTabs projectId={id} active="detail" />
      <h1>{project.name}</h1>
      <p className={styles.description}>{project.description}</p>
      {project.screenshotUrls.length > 0 && (
        <div className={styles.screenshots}>
          {project.screenshotUrls.map((url) => (
            <img key={url} src={url} alt="Screenshot" width={120} />
          ))}
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <Button onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating...' : 'Generate content'}
      </Button>

      {voice && (
        <Card className={styles.voiceCard}>
          <div className={styles.voiceHeader}>
            <div>
              <h2 className={styles.voiceTitle}>Brand Voice</h2>
              <p className={styles.voiceStats}>
                Learning from {voice.counts.approved} approved · {voice.counts.rejected}{' '}
                rejected · {voice.counts.edits} edit instructions
              </p>
            </div>
            {totalSignals > 0 && (
              <Button
                variant={voice.stale ? 'primary' : 'secondary'}
                onClick={handleRefreshVoice}
                disabled={refreshing}
              >
                {refreshing ? 'Learning...' : voice.stale ? 'Refresh voice' : 'Up to date'}
              </Button>
            )}
          </div>
          {voice.summary ? (
            <p className={styles.voiceSummary}>{voice.summary}</p>
          ) : (
            <p className={styles.voiceEmpty}>
              {totalSignals === 0
                ? 'Review a few posts and AMcue will learn your voice.'
                : 'Click "Refresh voice" to distill what AMcue has learned so far.'}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the card styles**

Edit `frontend/app/projects/[id]/page.module.css`, add at the end:

```css
.voiceCard {
  margin-top: 28px;
  max-width: 640px;
}

.voiceHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
}

.voiceTitle {
  font-size: 17px;
  font-weight: 700;
}

.voiceStats {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.voiceSummary {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
}

.voiceEmpty {
  font-size: 14px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Verify end-to-end**

Run `cd frontend && npx next build` — expected: clean compile. Then via curl against
the real backend (register → create project → seed one approved item via Prisma or
approve a generated one):

```bash
curl -s http://localhost:4000/projects/PROJECT_ID/brand-voice -H "Authorization: Bearer TOKEN"
# expect counts + stale:true
curl -s -X POST http://localhost:4000/projects/PROJECT_ID/brand-voice/refresh -H "Authorization: Bearer TOKEN"
# expect a real Gemini-written summary + stale:false
```

If a browser is available: open the project detail page, confirm the Brand Voice card
shows counts, click "Refresh voice", confirm a summary appears and the button flips to
"Up to date".

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/projects/[id]/page.js" "frontend/app/projects/[id]/page.module.css"
git commit -m "feat: add Brand Voice card to project detail page"
```

---

## Out of scope for this plan

- Screenshot-grounded image generation (separate next plan)
- Cross-project voice, editable summaries, embeddings
- Automatic distillation without the button
