# AMcue Conversational Post Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user chat with an assistant to revise a pending post's caption and/or image (via a true image edit, not a fresh regeneration) before approving it, with the conversation persisted per content item.

**Architecture:** A new `ContentMessage` table holds chat history. A new `chatEditProvider` service makes one Gemini text call per message to decide what (if anything) to change and drafts a reply, then performs a real image edit (existing image bytes + instruction in, edited image out) via Gemini's image model when needed, reusing the existing Cloudinary upload service. Two new routes on the existing `content.js` router expose this. The frontend gets a `ChatModal` component opened by clicking a queue item.

**Tech Stack:** Same as the rest of the project — Express, Prisma/Postgres (Neon), plain `fetch` for Gemini, Next.js (JS, App Router), Jest + Supertest with the provider mocked in tests.

---

## File Structure

```
backend/
  prisma/
    schema.prisma                          # MODIFY: add ContentMessage model + relation
  src/
    services/
      ai/
        chatEditProvider.js                # NEW: decideChatAction, editImage, applyChatMessage
    routes/
      content.js                            # MODIFY: add GET/POST /:id/messages
  tests/
    chatEdit.test.js                        # NEW: 6 tests
frontend/
  components/
    ChatModal.js                            # NEW
    ChatModal.module.css                    # NEW
  app/
    projects/[id]/
      queue/
        page.js                             # MODIFY: clickable items open ChatModal
        page.module.css                      # MODIFY: restructure for clickable area
```

---

### Task 1: ContentMessage schema and migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the ContentMessage model and relation**

Edit `backend/prisma/schema.prisma`. Add `messages ContentMessage[]` to the existing
`ContentItem` model (after the `status` field, before `createdAt` or anywhere in the
model body — exact position doesn't matter to Prisma):

```prisma
model ContentItem {
  id            String     @id @default(uuid())
  appProjectId  String
  appProject    AppProject @relation(fields: [appProjectId], references: [id])
  caption       String?
  imagePrompt   String?
  imageUrl      String?
  status        String     @default("pending")
  createdAt     DateTime   @default(now())
  messages      ContentMessage[]
}
```

Add this new model at the end of the file:

```prisma
model ContentMessage {
  id            String      @id @default(uuid())
  contentItemId String
  contentItem   ContentItem @relation(fields: [contentItemId], references: [id])
  role          String
  text          String
  createdAt     DateTime    @default(now())
}
```

- [ ] **Step 2: Run the migration**

Run: `cd backend && npx prisma migrate dev --name add_content_messages`
Expected: "Your database is now in sync with your schema." and a new migration folder
created under `backend/prisma/migrations/`.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add ContentMessage table for conversational post editing"
```

---

### Task 2: Chat edit provider

**Files:**
- Create: `backend/src/services/ai/chatEditProvider.js`

- [ ] **Step 1: Write the provider**

`backend/src/services/ai/chatEditProvider.js`:

```js
const { uploadImageBuffer } = require('../cloudinary');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

async function decideChatAction({ caption, imagePrompt, history, userText }) {
  const historyText = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const prompt = `You are an assistant helping someone refine a piece of marketing content before they approve it.

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

  const res = await fetch(
    `${API_BASE}/${TEXT_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini chat decision failed with status ${res.status}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini chat decision returned no content');
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.reply !== 'string') {
    throw new Error('Gemini chat decision returned malformed JSON');
  }

  return parsed;
}

async function editImage(currentImageUrl, instruction) {
  const imageRes = await fetch(currentImageUrl);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch current image with status ${imageRes.status}`);
  }
  const arrayBuffer = await imageRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = imageRes.headers.get('content-type') || 'image/png';

  // ponytail: same no-image-in-response retry as generateImageBuffer in
  // geminiProvider.js - the image model occasionally returns text-only with
  // no deterministic cause, one retry is the standard mitigation.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await fetch(
      `${API_BASE}/${IMAGE_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: instruction }, { inlineData: { mimeType, data: base64 } }],
            },
          ],
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini image edit failed with status ${res.status}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inlineData);
    if (imagePart) {
      return Buffer.from(imagePart.inlineData.data, 'base64');
    }
  }

  throw new Error('Gemini image edit returned no image data after retry');
}

async function applyChatMessage({ contentItem, history, userText }) {
  const decision = await decideChatAction({
    caption: contentItem.caption,
    imagePrompt: contentItem.imagePrompt,
    history,
    userText,
  });

  const updates = {};
  if (decision.updateCaption && decision.newCaption) {
    updates.caption = decision.newCaption;
  }
  if (decision.updateImage && decision.imageEditInstruction) {
    const editedBuffer = await editImage(contentItem.imageUrl, decision.imageEditInstruction);
    updates.imageUrl = await uploadImageBuffer(editedBuffer, 'amcue/generated');
    updates.imagePrompt = decision.imageEditInstruction;
  }

  return { reply: decision.reply, updates };
}

module.exports = { applyChatMessage, decideChatAction, editImage };
```

No test file for this module alone — it's exercised through the mocked route tests in
Task 3, consistent with how `geminiProvider`/`stubProvider` had no direct unit test.

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/ai/chatEditProvider.js
git commit -m "feat: add conversational chat-edit provider"
```

---

### Task 3: Chat routes

**Files:**
- Modify: `backend/src/routes/content.js`
- Test: `backend/tests/chatEdit.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/chatEdit.test.js`:

```js
jest.mock('../src/services/ai/chatEditProvider', () => ({
  applyChatMessage: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');
const { applyChatMessage } = require('../src/services/ai/chatEditProvider');

let token;
let userId;
let projectId;
let contentItemId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'chat-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'chat-test@amcue.dev' } });
  userId = user.id;

  const projectRes = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${token}`)
    .field('name', 'Chat Test App')
    .field('description', 'An app for chat edit tests');
  projectId = projectRes.body.id;

  const item = await prisma.contentItem.create({
    data: {
      appProjectId: projectId,
      caption: 'Original caption',
      imagePrompt: 'Original image prompt',
      imageUrl: 'https://res.cloudinary.com/fake/original.png',
      status: 'pending',
    },
  });
  contentItemId = item.id;
});

afterEach(() => {
  applyChatMessage.mockClear();
});

afterAll(async () => {
  await prisma.contentMessage.deleteMany({ where: { contentItemId } });
  await prisma.contentItem.deleteMany({ where: { appProjectId: projectId } });
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({
    where: { email: { in: ['chat-test@amcue.dev', 'chat-test-other@amcue.dev'] } },
  });
  await prisma.$disconnect();
});

describe('conversational post editor routes', () => {
  it('saves a user message and an assistant reply, updating the caption', async () => {
    applyChatMessage.mockResolvedValue({
      reply: 'Updated the caption for you!',
      updates: { caption: 'A punchier caption' },
    });

    const res = await request(app)
      .post(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Make the caption punchier' });

    expect(res.status).toBe(201);
    expect(res.body.message.role).toBe('assistant');
    expect(res.body.message.text).toBe('Updated the caption for you!');
    expect(res.body.contentItem.caption).toBe('A punchier caption');
  });

  it('saves messages with no field changes when no update is decided', async () => {
    applyChatMessage.mockResolvedValue({ reply: 'Sounds good!', updates: {} });

    const res = await request(app)
      .post(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Thanks, looks good' });

    expect(res.status).toBe(201);
    expect(res.body.contentItem.caption).toBe('A punchier caption');
  });

  it('returns the full message history in order', async () => {
    const res = await request(app)
      .get(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4);
    expect(res.body[0].role).toBe('user');
    expect(res.body[0].text).toBe('Make the caption punchier');
  });

  it('returns 400 when text is missing', async () => {
    const res = await request(app)
      .post(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when the content item is not pending', async () => {
    const approvedItem = await prisma.contentItem.create({
      data: {
        appProjectId: projectId,
        caption: 'Already approved',
        imageUrl: 'https://res.cloudinary.com/fake/approved.png',
        status: 'approved',
      },
    });

    const res = await request(app)
      .post(`/content/${approvedItem.id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'change something' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a content item not owned by the requesting user', async () => {
    const otherRes = await request(app)
      .post('/auth/register')
      .send({ email: 'chat-test-other@amcue.dev', password: 'password123' });
    const otherToken = otherRes.body.token;

    const res = await request(app)
      .get(`/content/${contentItemId}/messages`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- chatEdit.test.js`
Expected: FAIL — `GET/POST /content/:id/messages` both 404, routes don't exist yet.

- [ ] **Step 3: Add the chat routes**

Edit `backend/src/routes/content.js`. Add this import near the top:

```js
const { applyChatMessage } = require('../services/ai/chatEditProvider');
```

Add these two routes after the existing `router.patch('/:id', ...)` handler, before
`module.exports = router;`:

```js
router.get('/:id/messages', async (req, res) => {
  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  const messages = await prisma.contentMessage.findMany({
    where: { contentItemId: item.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
});

router.post('/:id/messages', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  const item = await prisma.contentItem.findFirst({
    where: { id: req.params.id, appProject: { userId: req.userId } },
  });
  if (!item) {
    return res.status(404).json({ error: 'Content item not found' });
  }
  if (item.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending content items can be edited via chat' });
  }

  const userMessage = await prisma.contentMessage.create({
    data: { contentItemId: item.id, role: 'user', text },
  });

  const priorHistory = await prisma.contentMessage.findMany({
    where: { contentItemId: item.id },
    orderBy: { createdAt: 'asc' },
  });

  try {
    const { reply, updates } = await applyChatMessage({
      contentItem: item,
      history: priorHistory.filter((m) => m.id !== userMessage.id),
      userText: text,
    });

    const updatedItem =
      Object.keys(updates).length > 0
        ? await prisma.contentItem.update({ where: { id: item.id }, data: updates })
        : item;

    const assistantMessage = await prisma.contentMessage.create({
      data: { contentItemId: item.id, role: 'assistant', text: reply },
    });

    res.status(201).json({ message: assistantMessage, contentItem: updatedItem });
  } catch (err) {
    console.error('Chat edit failed:', err);
    res.status(502).json({ error: 'Chat edit failed, please try again' });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- chatEdit.test.js`
Expected: PASS, 6 tests passing.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 33 tests pass (27 existing + 6 new).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/content.js backend/tests/chatEdit.test.js
git commit -m "feat: add conversational post editor routes"
```

---

### Task 4: ChatModal component

**Files:**
- Create: `frontend/components/ChatModal.js`
- Create: `frontend/components/ChatModal.module.css`

- [ ] **Step 1: Write the component**

`frontend/components/ChatModal.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Button from './Button';
import Input from './Input';
import styles from './ChatModal.module.css';

export default function ChatModal({ item, onClose, onUpdated }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(item);

  useEffect(() => {
    apiFetch(`/content/${item.id}/messages`)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [item.id]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    const userText = text;
    setText('');
    setMessages((prev) => [...prev, { id: `temp-${Date.now()}`, role: 'user', text: userText }]);
    try {
      const res = await apiFetch(`/content/${item.id}/messages`, {
        method: 'POST',
        body: { text: userText },
      });
      setMessages((prev) => [...prev, res.message]);
      setCurrent(res.contentItem);
      onUpdated(res.contentItem);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>
        <img src={current.imageUrl} alt="Post" className={styles.image} />
        <p className={styles.caption}>{current.caption}</p>
        <div className={styles.thread}>
          {messages.map((m) => (
            <p key={m.id} className={m.role === 'user' ? styles.userMsg : styles.assistantMsg}>
              {m.text}
            </p>
          ))}
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <form className={styles.form} onSubmit={handleSend}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask for a change..."
            disabled={sending}
          />
          <Button type="submit" disabled={sending}>
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

`frontend/components/ChatModal.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.panel {
  background: #fff;
  border-radius: 12px;
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 20px;
  position: relative;
}

.close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--color-text-muted);
}

.image {
  width: 100%;
  max-height: 200px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 8px;
}

.caption {
  font-size: 14px;
  margin-bottom: 12px;
}

.thread {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  min-height: 100px;
}

.userMsg {
  align-self: flex-end;
  background: var(--color-accent);
  color: #fff;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  max-width: 80%;
}

.assistantMsg {
  align-self: flex-start;
  background: var(--color-bg-subtle);
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  max-width: 80%;
}

.error {
  color: #dc2626;
  font-size: 13px;
}

.form {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/ChatModal.js frontend/components/ChatModal.module.css
git commit -m "feat: add ChatModal component"
```

---

### Task 5: Wire ChatModal into the queue page

**Files:**
- Modify: `frontend/app/projects/[id]/queue/page.js`
- Modify: `frontend/app/projects/[id]/queue/page.module.css`

- [ ] **Step 1: Restructure the queue page to open the modal**

Replace `frontend/app/projects/[id]/queue/page.js` entirely:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import ChatModal from '@/components/ChatModal';
import styles from './page.module.css';

export default function QueuePage() {
  const router = useRouter();
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [activeItem, setActiveItem] = useState(null);

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

  function handleContentUpdated(updatedItem) {
    setItems((prev) => prev.map((i) => (i.id === updatedItem.id ? updatedItem : i)));
  }

  return (
    <div>
      <TopTabs projectId={id} active="queue" />
      <h1>Pending review</h1>
      {error && <p className={styles.error}>{error}</p>}
      {items.length === 0 && !error && <p>Nothing pending. Generate some content!</p>}
      <div className={styles.list}>
        {items.map((item) => (
          <Card key={item.id} className={styles.item}>
            <div className={styles.clickable} onClick={() => setActiveItem(item)}>
              <img src={item.imageUrl} alt="Generated" width={120} />
              <p className={styles.caption}>{item.caption}</p>
            </div>
            <div className={styles.actions}>
              <Button onClick={() => handleReview(item.id, 'approved')}>Approve</Button>
              <Button variant="secondary" onClick={() => handleReview(item.id, 'rejected')}>
                Reject
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {activeItem && (
        <ChatModal
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onUpdated={handleContentUpdated}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the queue page styles for the clickable area**

Replace `frontend/app/projects/[id]/queue/page.module.css` entirely:

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
  gap: 16px;
  align-items: center;
}

.clickable {
  display: flex;
  gap: 16px;
  align-items: center;
  flex: 1;
  cursor: pointer;
}

.caption {
  margin: 0;
}

.actions {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 3: Verify the full flow end-to-end**

Via curl against the real backend (register/login → create project → generate content
to get a real pending `ContentItem`):

```bash
curl -s -X POST http://localhost:4000/content/CONTENT_ITEM_ID/messages -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d '{"text":"Make the caption punchier"}'
```

Expected: a 201 response with `message` (assistant reply) and `contentItem` (reflecting
any real caption/image change made by the real, unmocked Gemini chat-edit provider —
this hits the live API, not a mock, since this is a manual curl check, not the test
suite). Confirm a second `GET /content/CONTENT_ITEM_ID/messages` call shows both the
user and assistant messages in order. If a browser is available: click a queue item,
confirm the modal opens showing the current image/caption, send a message asking for a
caption change, confirm the reply appears and the caption updates both in the modal and
(after closing) in the queue list. Confirm Approve/Reject buttons still work without
opening the modal (clicking them shouldn't trigger `setActiveItem`).

- [ ] **Step 4: Commit**

```bash
git add frontend/app/projects/[id]/queue/page.js frontend/app/projects/[id]/queue/page.module.css
git commit -m "feat: wire ChatModal into the queue page"
```

---

## Out of scope for this plan

- Editing approved/feed items
- Streaming chat responses
- Undo/version history
- Real social platform posting
