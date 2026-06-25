# AMcue Phase 1 (Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the AMcue skeleton — email/password auth, `AppProject` CRUD with Cloudinary screenshot upload, and a project list page — with no AI features yet.

**Architecture:** Monorepo with `frontend/` (Next.js, JS, App Router) and `backend/` (Express, JS) folders. Backend talks to Postgres (Neon) via Prisma and to Cloudinary for image storage. Frontend calls backend via a thin `lib/api.js` fetch wrapper. JWT issued on login, stored in localStorage, sent as `Authorization: Bearer <token>`.

**Tech Stack:** Next.js 14 (App Router, JavaScript), Express, Prisma + Postgres (Neon), Cloudinary SDK, bcrypt + jsonwebtoken, Jest + Supertest for backend route tests.

---

## File Structure

```
amcue/
  package.json                       # root: workspace scripts only
  backend/
    package.json
    .env.example
    prisma/
      schema.prisma
    src/
      server.js                      # Express app entry
      prismaClient.js                # Prisma client singleton
      middleware/
        auth.js                      # requireAuth JWT middleware
      services/
        cloudinary.js                # configureCloudinary, uploadImage(buffer, filename)
      routes/
        auth.js                      # POST /auth/register, /auth/login
        projects.js                  # GET/POST /projects, GET /projects/:id
    tests/
      auth.test.js
      projects.test.js
  frontend/
    package.json
    .env.local.example
    lib/
      api.js                         # apiFetch(path, options) wrapper
    app/
      layout.js
      page.js                        # redirect: token? /projects : /login
      login/
        page.js
      register/
        page.js
      projects/
        page.js                      # list page
        new/
          page.js                    # create project form
  docs/superpowers/specs/2026-06-25-amcue-design.md   (existing)
  docs/superpowers/plans/2026-06-25-amcue-phase1-skeleton.md (this file)
```

---

### Task 1: Root and backend scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `backend/package.json`
- Create: `backend/.env.example`
- Create: `backend/src/server.js`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "amcue",
  "private": true,
  "scripts": {
    "dev:backend": "npm run dev --prefix backend",
    "dev:frontend": "npm run dev --prefix frontend"
  }
}
```

- [ ] **Step 2: Init backend and install dependencies**

Run:
```bash
cd backend
npm init -y
npm install express cors dotenv bcrypt jsonwebtoken @prisma/client cloudinary multer
npm install -D prisma jest supertest nodemon
```

- [ ] **Step 3: Add backend package.json scripts**

Edit `backend/package.json`, add inside the object:

```json
"scripts": {
  "dev": "nodemon src/server.js",
  "start": "node src/server.js",
  "test": "jest --runInBand",
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate dev"
}
```

- [ ] **Step 4: Create backend/.env.example**

```
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
JWT_SECRET="replace-with-a-long-random-string"
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
PORT=4000
```

- [ ] **Step 5: Create minimal server.js so the app boots**

`backend/src/server.js`:

```js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`AMcue backend listening on ${PORT}`));
}

module.exports = app;
```

- [ ] **Step 6: Verify the server boots**

Run: `cd backend && node src/server.js`
Expected: `AMcue backend listening on 4000` printed, no errors. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add package.json backend/package.json backend/.env.example backend/src/server.js backend/package-lock.json
git commit -m "chore: scaffold backend with express skeleton"
```

---

### Task 2: Prisma schema and Neon connection

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/prismaClient.js`

- [ ] **Step 1: Init Prisma**

Run: `cd backend && npx prisma init --datasource-provider postgresql`
This creates `backend/prisma/schema.prisma` and `backend/.env` (gitignored already by prisma init's generated `.gitignore` — verify `backend/.env` is ignored, add it to a root `.gitignore` if not).

- [ ] **Step 2: Write the schema**

Replace contents of `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id              String       @id @default(uuid())
  email           String       @unique
  passwordHash    String
  mockConnections Json         @default("{\"instagram\": false, \"tiktok\": false}")
  createdAt       DateTime     @default(now())
  appProjects     AppProject[]
}

model AppProject {
  id             String        @id @default(uuid())
  userId         String
  user           User          @relation(fields: [userId], references: [id])
  name           String
  description    String
  screenshotUrls String[]      @default([])
  createdAt      DateTime      @default(now())
  contentItems   ContentItem[]
}

model ContentItem {
  id            String     @id @default(uuid())
  appProjectId  String
  appProject    AppProject @relation(fields: [appProjectId], references: [id])
  caption       String?
  imagePrompt   String?
  imageUrl      String?
  status        String     @default("pending")
  createdAt     DateTime   @default(now())
}
```

Note: `ContentItem` is included now (table only) so Phase 2 doesn't need a migration that touches `AppProject` again. `status` is a plain string (`pending`/`approved`/`rejected`) rather than a Prisma enum — simpler to read for beginners, validated in route code in Phase 3.

- [ ] **Step 3: Set DATABASE_URL**

Edit `backend/.env` (created by `prisma init`), set `DATABASE_URL` to your real Neon connection string (ask the user for it if running this step live — do not invent one).

- [ ] **Step 4: Run the migration**

Run: `cd backend && npx prisma migrate dev --name init`
Expected: Output ends with "Your database is now in sync with your schema." and a new `backend/prisma/migrations/<timestamp>_init/` folder is created.

- [ ] **Step 5: Create the Prisma client singleton**

`backend/src/prismaClient.js`:

```js
const { PrismaClient } = require('@prisma/client');

const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

module.exports = prisma;
```

- [ ] **Step 6: Commit**

```bash
git add backend/prisma backend/src/prismaClient.js backend/.gitignore
git commit -m "feat: add Prisma schema for User, AppProject, ContentItem"
```

---

### Task 3: Auth routes (register, login) and JWT middleware

**Files:**
- Create: `backend/src/routes/auth.js`
- Create: `backend/src/middleware/auth.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/auth.test.js`

- [ ] **Step 1: Write the failing test**

`backend/tests/auth.test.js`:

```js
const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'test@amcue.dev' } });
  await prisma.$disconnect();
});

describe('auth routes', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@amcue.dev', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  it('logs in with correct credentials and returns a token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@amcue.dev', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects login with wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@amcue.dev', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- auth.test.js`
Expected: FAIL — `Cannot find module '../src/routes/auth'` or 404s, since the route doesn't exist yet.

- [ ] **Step 3: Write the auth middleware**

`backend/src/middleware/auth.js`:

```js
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
```

- [ ] **Step 4: Write the auth routes**

`backend/src/routes/auth.js`:

```js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });

  res.status(201).json({ token: signToken(user.id) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({ token: signToken(user.id) });
});

module.exports = router;
```

- [ ] **Step 5: Wire the route into server.js**

Edit `backend/src/server.js`, add after `app.use(express.json());`:

```js
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npm test -- auth.test.js`
Expected: PASS, 3 tests passing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.js backend/src/middleware/auth.js backend/src/server.js backend/tests/auth.test.js
git commit -m "feat: add register/login routes and JWT auth middleware"
```

---

### Task 4: Cloudinary service

**Files:**
- Create: `backend/src/services/cloudinary.js`

- [ ] **Step 1: Write the service**

`backend/src/services/cloudinary.js`:

```js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadImageBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadImageBuffer };
```

No test for this file — it's a thin wrapper around the Cloudinary SDK with no branching
logic; it's exercised indirectly by the projects route test in Task 5 (mocked there).

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/cloudinary.js
git commit -m "feat: add Cloudinary upload service"
```

---

### Task 5: Project routes (create with screenshots, list, get one)

**Files:**
- Create: `backend/src/routes/projects.js`
- Modify: `backend/src/server.js`
- Test: `backend/tests/projects.test.js`

- [ ] **Step 1: Write the failing test (with Cloudinary mocked)**

`backend/tests/projects.test.js`:

```js
jest.mock('../src/services/cloudinary', () => ({
  uploadImageBuffer: jest.fn().mockResolvedValue('https://res.cloudinary.com/fake/image.png'),
}));

const request = require('supertest');
const app = require('../src/server');
const prisma = require('../src/prismaClient');

let token;
let userId;

beforeAll(async () => {
  const res = await request(app)
    .post('/auth/register')
    .send({ email: 'projects-test@amcue.dev', password: 'password123' });
  token = res.body.token;
  const user = await prisma.user.findUnique({ where: { email: 'projects-test@amcue.dev' } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.appProject.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('project routes', () => {
  it('rejects requests with no auth token', async () => {
    const res = await request(app).get('/projects');
    expect(res.status).toBe(401);
  });

  it('creates a project with a screenshot upload', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Test App')
      .field('description', 'An app for testing')
      .attach('screenshots', Buffer.from('fake-image-bytes'), 'screenshot.png');

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test App');
    expect(res.body.screenshotUrls).toEqual(['https://res.cloudinary.com/fake/image.png']);
  });

  it('lists only the current user\'s projects', async () => {
    const res = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Test App');
  });

  it('gets a single project by id', async () => {
    const list = await request(app)
      .get('/projects')
      .set('Authorization', `Bearer ${token}`);
    const projectId = list.body[0].id;

    const res = await request(app)
      .get(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(projectId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- projects.test.js`
Expected: FAIL — route module doesn't exist / 404s.

- [ ] **Step 3: Write the projects route**

`backend/src/routes/projects.js`:

```js
const express = require('express');
const multer = require('multer');
const prisma = require('../prismaClient');
const { requireAuth } = require('../middleware/auth');
const { uploadImageBuffer } = require('../services/cloudinary');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);

router.post('/', upload.array('screenshots', 6), async (req, res) => {
  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'name and description are required' });
  }

  try {
    const files = req.files || [];
    const screenshotUrls = await Promise.all(
      files.map((file) => uploadImageBuffer(file.buffer, 'amcue/screenshots'))
    );

    const project = await prisma.appProject.create({
      data: {
        userId: req.userId,
        name,
        description,
        screenshotUrls,
      },
    });

    res.status(201).json(project);
  } catch (err) {
    res.status(502).json({ error: 'Failed to upload screenshots or save project' });
  }
});

router.get('/', async (req, res) => {
  const projects = await prisma.appProject.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(projects);
});

router.get('/:id', async (req, res) => {
  const project = await prisma.appProject.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

module.exports = router;
```

- [ ] **Step 4: Wire the route into server.js**

Edit `backend/src/server.js`, add below the auth route registration:

```js
const projectRoutes = require('./routes/projects');
app.use('/projects', projectRoutes);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npm test -- projects.test.js`
Expected: PASS, 4 tests passing.

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: All 7 tests (auth + projects) pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/projects.js backend/src/server.js backend/tests/projects.test.js
git commit -m "feat: add project CRUD routes with Cloudinary screenshot upload"
```

---

### Task 6: Frontend scaffolding and API client

**Files:**
- Create: `frontend/` (via `create-next-app`)
- Create: `frontend/.env.local.example`
- Create: `frontend/lib/api.js`

- [ ] **Step 1: Scaffold the Next.js app**

Run from repo root:
```bash
npx create-next-app@latest frontend --js --eslint --app --no-tailwind --no-src-dir --import-alias "@/*"
```
Answer prompts with defaults if asked anything not covered by flags.

- [ ] **Step 2: Verify it boots**

Run: `cd frontend && npm run dev`
Expected: Dev server starts on `http://localhost:3000`, default Next.js page loads in a browser. Stop with Ctrl+C.

- [ ] **Step 3: Create frontend/.env.local.example**

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Also create `frontend/.env.local` (gitignored by default by create-next-app) with the same content for local dev.

- [ ] **Step 4: Write the API client wrapper**

`frontend/lib/api.js`:

```js
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('amcue_token');
}

export async function apiFetch(path, { method = 'GET', body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

export function setToken(token) {
  localStorage.setItem('amcue_token', token);
}

export function clearToken() {
  localStorage.removeItem('amcue_token');
}

export function isLoggedIn() {
  return Boolean(getToken());
}
```

- [ ] **Step 5: Commit**

```bash
cd frontend && git add -A
cd .. && git add frontend
git commit -m "chore: scaffold Next.js frontend and API client wrapper"
```

---

### Task 7: Login and register pages

**Files:**
- Create: `frontend/app/login/page.js`
- Create: `frontend/app/register/page.js`

- [ ] **Step 1: Write the register page**

`frontend/app/register/page.js`:

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: { email, password },
      });
      setToken(data.token);
      router.push('/projects');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main>
      <h1>Register</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Create account</button>
      </form>
      {error && <p>{error}</p>}
      <p>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Write the login page**

`frontend/app/login/page.js`:

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setToken(data.token);
      router.push('/projects');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Log in</button>
      </form>
      {error && <p>{error}</p>}
      <p>
        No account? <a href="/register">Register</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Manually verify**

With the backend running (`npm run dev --prefix backend`) and frontend running
(`npm run dev --prefix frontend`):
1. Visit `http://localhost:3000/register`, create an account.
2. Expected: redirected to `/projects` (will 404 until Task 8 — that's expected here).
3. Visit `http://localhost:3000/login`, log in with the same credentials.
4. Expected: redirected to `/projects` again.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/login/page.js frontend/app/register/page.js
git commit -m "feat: add login and register pages"
```

---

### Task 8: Project list page and create-project form

**Files:**
- Create: `frontend/app/projects/page.js`
- Create: `frontend/app/projects/new/page.js`
- Modify: `frontend/app/page.js`

- [ ] **Step 1: Write the project list page**

`frontend/app/projects/page.js`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn, clearToken } from '@/lib/api';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch('/projects')
      .then(setProjects)
      .catch((err) => setError(err.message));
  }, [router]);

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <main>
      <h1>Your app projects</h1>
      <button onClick={handleLogout}>Log out</button>
      <a href="/projects/new">+ New project</a>
      {error && <p>{error}</p>}
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong> — {p.description}
          </li>
        ))}
      </ul>
      {projects.length === 0 && !error && <p>No projects yet. Create one!</p>}
    </main>
  );
}
```

- [ ] **Step 2: Write the create-project page**

`frontend/app/projects/new/page.js`:

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      files.forEach((file) => formData.append('screenshots', file));

      await apiFetch('/projects', {
        method: 'POST',
        body: formData,
        isFormData: true,
      });
      router.push('/projects');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main>
      <h1>New app project</h1>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="App name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <textarea
          placeholder="Describe your app"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files))}
        />
        <button type="submit">Create project</button>
      </form>
      {error && <p>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 3: Update the home page to redirect based on auth state**

`frontend/app/page.js`:

```jsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/api';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.push(isLoggedIn() ? '/projects' : '/login');
  }, [router]);

  return null;
}
```

- [ ] **Step 4: Manually verify the full Phase 1 flow**

With both servers running:
1. Visit `http://localhost:3000` → redirected to `/login`.
2. Register a new account → redirected to `/projects`, "No projects yet" shown.
3. Click "+ New project", fill in name/description, attach a screenshot, submit.
4. Expected: redirected to `/projects`, the new project appears in the list.
5. Refresh the page → project still listed (confirms it's persisted, not just local state).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/projects frontend/app/page.js
git commit -m "feat: add project list and create-project pages"
```

---

### Task 9: Root README for the team

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write setup instructions**

`README.md`:

```markdown
# AMcue

Practice project: automate marketing content for indie app developers. See
`docs/superpowers/specs/2026-06-25-amcue-design.md` for the full design.

## Setup

### Backend

\`\`\`bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL (Neon), JWT_SECRET, Cloudinary keys
npx prisma migrate dev
npm run dev             # http://localhost:4000
\`\`\`

### Frontend

\`\`\`bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev              # http://localhost:3000
\`\`\`

### Tests

\`\`\`bash
cd backend
npm test
\`\`\`

## Project layout

- `backend/` — Express API, Prisma/Postgres, Cloudinary uploads
- `frontend/` — Next.js app
- `docs/superpowers/specs/` — design docs
- `docs/superpowers/plans/` — implementation plans
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup README for the team"
```

---

## Out of scope for this plan (later phases)

- AI caption/image generation (`AiProvider`, Gemini) — Phase 2
- Mock connect screen, content queue, approve/reject, feed — Phase 3
- Styling pass, "generate today's content" button — Phase 4
