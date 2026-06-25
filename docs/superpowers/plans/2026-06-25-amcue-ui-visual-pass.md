# AMcue Visual UI Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a cohesive "Clean Light SaaS" visual design across a new landing page, restyled login/signup (with placeholder Google/Apple buttons), and a dashboard shell (left sidebar + tabs) wrapping the existing project pages — no backend or logic changes.

**Architecture:** A small set of shared, reusable components (`Button`, `Input`, `Card`, `Sidebar`, `TopTabs`) under `frontend/components/`, driven by CSS custom properties added to `globals.css`. Each existing page swaps its bare-HTML markup for these components; a new `projects/layout.js` adds the persistent sidebar; the landing page (`app/page.js`) is rewritten from an auth-redirect into real marketing content.

**Tech Stack:** Next.js (JS, App Router) — same as Phase 1/2a. CSS Modules (already present via `create-next-app`), no new dependencies.

---

## File Structure

```
frontend/
  app/
    globals.css                          # MODIFY: add design tokens, remove dark-mode override
    page.js                              # MODIFY: landing page content
    page.module.css                      # MODIFY: landing page styles
    auth.module.css                      # NEW: shared login/register styles
    login/page.js                        # MODIFY: restyle + OAuth placeholders
    register/page.js                     # MODIFY: restyle + OAuth placeholders
    projects/
      layout.js                          # NEW: dashboard shell (Sidebar + content area)
      layout.module.css                  # NEW
      page.js                            # MODIFY: restyle, remove inline logout (now in Sidebar)
      page.module.css                    # NEW
      new/
        page.js                          # MODIFY: restyle
        page.module.css                  # NEW
      [id]/
        page.js                          # MODIFY: restyle + TopTabs
        page.module.css                  # NEW
        queue/
          page.js                        # MODIFY: restyle + TopTabs
          page.module.css                # NEW
        feed/
          page.js                        # MODIFY: restyle + TopTabs
          page.module.css                # NEW
  components/
    Button.js / Button.module.css        # NEW
    Input.js / Input.module.css           # NEW
    Card.js / Card.module.css             # NEW
    Sidebar.js / Sidebar.module.css       # NEW
    TopTabs.js / TopTabs.module.css       # NEW
```

---

### Task 1: Design tokens, Button, and Input components

**Files:**
- Modify: `frontend/app/globals.css`
- Create: `frontend/components/Button.js`
- Create: `frontend/components/Button.module.css`
- Create: `frontend/components/Input.js`
- Create: `frontend/components/Input.module.css`

- [ ] **Step 1: Replace globals.css with light-only design tokens**

Replace the full contents of `frontend/app/globals.css`:

```css
:root {
  --background: #ffffff;
  --foreground: #1a1a2e;
  --color-accent: #4f46e5;
  --color-accent-hover: #4338ca;
  --color-text: #1a1a2e;
  --color-text-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-bg-subtle: #f9fafb;
  --radius: 8px;
}

html {
  height: 100%;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
}

body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--foreground);
  background: var(--background);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

a {
  color: inherit;
  text-decoration: none;
}
```

This removes the `prefers-color-scheme: dark` override (the design spec calls for light
mode only, regardless of system theme) and adds the indigo-accent design tokens used by
every component in this plan.

- [ ] **Step 2: Create the Button component**

`frontend/components/Button.js`:

```jsx
import styles from './Button.module.css';

export default function Button({ variant = 'primary', children, ...props }) {
  const className = variant === 'secondary' ? styles.secondary : styles.primary;
  return (
    <button className={className} {...props}>
      {children}
    </button>
  );
}
```

`frontend/components/Button.module.css`:

```css
.primary {
  background: var(--color-accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.primary:hover {
  background: var(--color-accent-hover);
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondary {
  background: #fff;
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.secondary:hover {
  background: var(--color-bg-subtle);
}
```

- [ ] **Step 3: Create the Input component**

`frontend/components/Input.js`:

```jsx
import styles from './Input.module.css';

export default function Input(props) {
  return <input className={styles.input} {...props} />;
}
```

`frontend/components/Input.module.css`:

```css
.input {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  color: var(--color-text);
}

.input:focus {
  outline: none;
  border-color: var(--color-accent);
}
```

- [ ] **Step 4: Verify nothing broke**

Run: `cd backend && npm test`
Expected: 12/12 pass (this task touches no backend code — confirms the baseline is
unaffected before frontend changes accumulate further).

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css frontend/components/Button.js frontend/components/Button.module.css frontend/components/Input.js frontend/components/Input.module.css
git commit -m "feat: add design tokens, Button, and Input components"
```

---

### Task 2: Card component

**Files:**
- Create: `frontend/components/Card.js`
- Create: `frontend/components/Card.module.css`

- [ ] **Step 1: Create the Card component**

`frontend/components/Card.js`:

```jsx
import styles from './Card.module.css';

export default function Card({ children, className = '' }) {
  return <div className={`${styles.card} ${className}`}>{children}</div>;
}
```

`frontend/components/Card.module.css`:

```css
.card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/Card.js frontend/components/Card.module.css
git commit -m "feat: add Card component"
```

---

### Task 3: Sidebar and TopTabs components

**Files:**
- Create: `frontend/components/Sidebar.js`
- Create: `frontend/components/Sidebar.module.css`
- Create: `frontend/components/TopTabs.js`
- Create: `frontend/components/TopTabs.module.css`

- [ ] **Step 1: Create the Sidebar component**

`frontend/components/Sidebar.js`:

```jsx
'use client';

import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>AMcue</div>
      <a className={styles.link} href="/projects">
        Projects
      </a>
      <a className={styles.link} href="/projects/new">
        + New Project
      </a>
      <button className={styles.logout} onClick={handleLogout}>
        Log out
      </button>
    </nav>
  );
}
```

`frontend/components/Sidebar.module.css`:

```css
.sidebar {
  width: 220px;
  flex-shrink: 0;
  min-height: 100vh;
  border-right: 1px solid var(--color-border);
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-accent);
  margin-bottom: 16px;
}

.link {
  padding: 8px 12px;
  border-radius: var(--radius);
  color: var(--color-text);
  font-size: 14px;
}

.link:hover {
  background: var(--color-bg-subtle);
}

.logout {
  margin-top: auto;
  background: none;
  border: none;
  text-align: left;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius);
}

.logout:hover {
  background: var(--color-bg-subtle);
}
```

- [ ] **Step 2: Create the TopTabs component**

`frontend/components/TopTabs.js`:

```jsx
import styles from './TopTabs.module.css';

export default function TopTabs({ projectId, active }) {
  const tabs = [
    { key: 'detail', label: 'Detail', href: `/projects/${projectId}` },
    { key: 'queue', label: 'Queue', href: `/projects/${projectId}/queue` },
    { key: 'feed', label: 'Feed', href: `/projects/${projectId}/feed` },
  ];

  return (
    <nav className={styles.tabs}>
      {tabs.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          className={tab.key === active ? styles.activeTab : styles.tab}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
```

`frontend/components/TopTabs.module.css`:

```css
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 20px;
}

.tab,
.activeTab {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-muted);
  border-bottom: 2px solid transparent;
}

.activeTab {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/Sidebar.js frontend/components/Sidebar.module.css frontend/components/TopTabs.js frontend/components/TopTabs.module.css
git commit -m "feat: add Sidebar and TopTabs components"
```

---

### Task 4: Dashboard layout shell

**Files:**
- Create: `frontend/app/projects/layout.js`
- Create: `frontend/app/projects/layout.module.css`

- [ ] **Step 1: Create the layout**

`frontend/app/projects/layout.js`:

```jsx
import Sidebar from '@/components/Sidebar';
import styles from './layout.module.css';

export default function ProjectsLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

`frontend/app/projects/layout.module.css`:

```css
.shell {
  display: flex;
  min-height: 100vh;
}

.content {
  flex: 1;
  padding: 32px 40px;
}
```

This is a Next.js route-group layout — it automatically wraps every page under
`frontend/app/projects/` (the list, new-project form, and every `[id]/...` page),
without each page needing its own sidebar code.

- [ ] **Step 2: Verify the dev server still boots**

Run: `cd frontend && npm run dev`, then in another terminal `curl -s -o /dev/null -w
"%{http_code}" http://localhost:3000/projects` (after logging in via curl against the
real backend to get a valid token isn't required for this check — even an unauthenticated
request to `/projects` should return 200 for the page shell itself, since the redirect
logic runs client-side in `useEffect`, not as a server redirect).
Expected: `200`. Stop the dev server with Ctrl+C when done.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/projects/layout.js frontend/app/projects/layout.module.css
git commit -m "feat: add dashboard shell layout with sidebar"
```

---

### Task 5: Restyle login and register pages with OAuth placeholders

**Files:**
- Create: `frontend/app/auth.module.css`
- Modify: `frontend/app/login/page.js`
- Modify: `frontend/app/register/page.js`

- [ ] **Step 1: Create the shared auth page styles**

`frontend/app/auth.module.css`:

```css
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-subtle);
}

.card {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.heading {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.error {
  color: #dc2626;
  font-size: 13px;
}

.divider {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  margin: 4px 0;
}

.switch {
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 8px;
}

.switch a {
  color: var(--color-accent);
  font-weight: 600;
}
```

- [ ] **Step 2: Restyle the login page**

Replace `frontend/app/login/page.js` entirely:

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';
import styles from '../auth.module.css';

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
    <main className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.heading}>Log in</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit">Log in</Button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.divider}>or</div>
        <Button variant="secondary" onClick={() => {}}>
          Continue with Google
        </Button>
        <Button variant="secondary" onClick={() => {}}>
          Continue with Apple
        </Button>
        <p className={styles.switch}>
          No account? <a href="/register">Register</a>
        </p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Restyle the register page**

Replace `frontend/app/register/page.js` entirely:

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';
import styles from '../auth.module.css';

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
    <main className={styles.page}>
      <Card className={styles.card}>
        <h1 className={styles.heading}>Register</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit">Create account</Button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.divider}>or</div>
        <Button variant="secondary" onClick={() => {}}>
          Continue with Google
        </Button>
        <Button variant="secondary" onClick={() => {}}>
          Continue with Apple
        </Button>
        <p className={styles.switch}>
          Already have an account? <a href="/login">Log in</a>
        </p>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Verify login/register still work end-to-end**

With the real backend running (`npm run dev --prefix backend`) and frontend running
(`npm run dev --prefix frontend`), or via curl against the real backend directly:
register a new user via the page (or curl `/auth/register` with the same payload shape
the form sends: `{email, password}`), confirm a token comes back and the existing
redirect-to-`/projects` logic is unchanged (the only thing that changed is JSX markup —
`handleSubmit` logic is untouched). If browser interaction isn't available, confirm by
code inspection that `handleSubmit` is byte-identical in logic to the pre-existing
Phase 1 version, and confirm via curl that the backend contract still matches.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/auth.module.css frontend/app/login/page.js frontend/app/register/page.js
git commit -m "feat: restyle login and register pages with OAuth placeholders"
```

---

### Task 6: Landing page

**Files:**
- Modify: `frontend/app/page.js`
- Modify: `frontend/app/page.module.css`

- [ ] **Step 1: Rewrite the landing page**

Replace `frontend/app/page.js` entirely:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/api';
import Button from '@/components/Button';
import styles from './page.module.css';

const FEATURES = [
  { title: 'Describe your app', body: 'Tell AMcue about your app and upload a few screenshots.' },
  { title: 'AI generates content', body: 'Get a caption and image generated on a recurring basis.' },
  { title: 'Review & approve', body: 'Approve or reject each piece before it goes live.' },
  { title: "It's in your feed", body: 'Approved content lands in your in-app feed, ready to use.' },
];

const FAQS = [
  {
    q: 'Does this post to my real social accounts?',
    a: 'Not yet — AMcue currently shows approved content in your own feed; direct publishing is a future feature.',
  },
  {
    q: 'What AI does AMcue use?',
    a: 'Caption and image generation are being wired up now — today the queue shows placeholder content so you can try the full flow.',
  },
  {
    q: 'Is my data private?',
    a: 'This is an internal practice project — only your own account can see your projects and content.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      router.push('/projects');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  if (!checkedAuth) {
    return null;
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.logo}>AMcue</div>
        <h1 className={styles.tagline}>Automate your indie app&apos;s marketing</h1>
        <div className={styles.heroActions}>
          <Button onClick={() => router.push('/login')}>Log in</Button>
          <Button variant="secondary" onClick={() => router.push('/register')}>
            Sign up
          </Button>
        </div>
      </section>

      <section className={styles.features}>
        {FEATURES.map((f) => (
          <div key={f.title} className={styles.feature}>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.preview}>
        <div className={styles.previewPanel}>Product preview coming soon</div>
      </section>

      <section className={styles.faq}>
        <h2>FAQ</h2>
        {FAQS.map((item) => (
          <div key={item.q} className={styles.faqItem}>
            <h4>{item.q}</h4>
            <p>{item.a}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} AMcue. Practice project, not a real product.</p>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the landing page styles**

Replace `frontend/app/page.module.css` entirely:

```css
.page {
  display: flex;
  flex-direction: column;
}

.hero {
  text-align: center;
  padding: 100px 24px 64px;
}

.logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-accent);
  margin-bottom: 16px;
}

.tagline {
  font-size: 36px;
  font-weight: 700;
  max-width: 600px;
  margin: 0 auto 24px;
}

.heroActions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.features {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  max-width: 1000px;
  margin: 0 auto;
  padding: 48px 24px;
}

.feature h3 {
  font-size: 16px;
  margin-bottom: 8px;
}

.feature p {
  font-size: 14px;
  color: var(--color-text-muted);
}

.preview {
  display: flex;
  justify-content: center;
  padding: 24px 24px 64px;
}

.previewPanel {
  width: 100%;
  max-width: 800px;
  height: 320px;
  border-radius: 12px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 14px;
}

.faq {
  max-width: 700px;
  margin: 0 auto;
  padding: 48px 24px;
}

.faq h2 {
  font-size: 22px;
  margin-bottom: 24px;
}

.faqItem {
  margin-bottom: 20px;
}

.faqItem h4 {
  font-size: 15px;
  margin-bottom: 6px;
}

.faqItem p {
  font-size: 14px;
  color: var(--color-text-muted);
}

.footer {
  text-align: center;
  padding: 32px 24px;
  border-top: 1px solid var(--color-border);
  font-size: 13px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Verify the redirect behavior is preserved for logged-in users**

Via curl against the real backend: register/login to get a token, then (if browser
testing is available) load `/` with that token already in `localStorage` and confirm it
redirects to `/projects` exactly as before. If browser testing isn't available, confirm
by code inspection that the `useEffect` logic (`if (isLoggedIn()) router.push('/projects')`)
is unchanged from the Phase 1 version — only the logged-out branch (`setCheckedAuth(true)`
+ rendering the landing page instead of `router.push('/login')`) is new.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/page.js frontend/app/page.module.css
git commit -m "feat: add landing page with hero, features, FAQ, and footer"
```

---

### Task 7: Restyle projects list and new-project pages

**Files:**
- Modify: `frontend/app/projects/page.js`
- Create: `frontend/app/projects/page.module.css`
- Modify: `frontend/app/projects/new/page.js`
- Create: `frontend/app/projects/new/page.module.css`

- [ ] **Step 1: Restyle the projects list page**

Replace `frontend/app/projects/page.js` entirely (logout is now handled by the
`Sidebar` from Task 4, so the inline logout button and `clearToken` import are removed):

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import styles from './page.module.css';

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

  return (
    <div>
      <div className={styles.header}>
        <h1>Your app projects</h1>
        <Button onClick={() => router.push('/projects/new')}>+ New project</Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.list}>
        {projects.map((p) => (
          <a key={p.id} href={`/projects/${p.id}`} className={styles.cardLink}>
            <Card>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
            </Card>
          </a>
        ))}
      </div>
      {projects.length === 0 && !error && <p>No projects yet. Create one!</p>}
    </div>
  );
}
```

`frontend/app/projects/page.module.css`:

```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.error {
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 12px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cardLink {
  display: block;
}

.cardLink h3 {
  font-size: 16px;
  margin-bottom: 4px;
}

.cardLink p {
  font-size: 14px;
  color: var(--color-text-muted);
}
```

- [ ] **Step 2: Restyle the new-project page**

Replace `frontend/app/projects/new/page.js` entirely:

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';
import styles from './page.module.css';

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
    <div className={styles.page}>
      <h1>New app project</h1>
      <Card className={styles.card}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            placeholder="App name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <textarea
            className={styles.textarea}
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
          <Button type="submit">Create project</Button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
      </Card>
    </div>
  );
}
```

`frontend/app/projects/new/page.module.css`:

```css
.page {
  max-width: 500px;
}

.card {
  margin-top: 16px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.textarea {
  width: 100%;
  min-height: 100px;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-family: inherit;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

.error {
  color: #dc2626;
  font-size: 13px;
  margin-top: 8px;
}
```

- [ ] **Step 3: Verify the create-project flow still works**

Via curl against the real backend (register/login → create a project with no files, to
avoid needing real Cloudinary credentials): confirm `POST /projects` still succeeds with
the same `formData` shape the restyled form sends (`name`, `description`,
`screenshots[]`) — the request-building logic in `handleSubmit` is unchanged, only the
JSX around it changed. Confirm via curl that `GET /projects` then shows the created
project, proving the list page's restyled rendering still consumes the same data shape.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/projects/page.js frontend/app/projects/page.module.css frontend/app/projects/new/page.js frontend/app/projects/new/page.module.css
git commit -m "feat: restyle projects list and new-project pages"
```

---

### Task 8: Restyle project detail, queue, and feed pages with TopTabs

**Files:**
- Modify: `frontend/app/projects/[id]/page.js`
- Create: `frontend/app/projects/[id]/page.module.css`
- Modify: `frontend/app/projects/[id]/queue/page.js`
- Create: `frontend/app/projects/[id]/queue/page.module.css`
- Modify: `frontend/app/projects/[id]/feed/page.js`
- Create: `frontend/app/projects/[id]/feed/page.module.css`

- [ ] **Step 1: Restyle the project detail page**

Replace `frontend/app/projects/[id]/page.js` entirely (the old inline "View queue /
View feed / Back to projects" links are removed — that navigation is now covered by
`TopTabs` and the `Sidebar`):

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

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
    return <p className={styles.error}>{error}</p>;
  }

  if (!project) {
    return <p>Loading...</p>;
  }

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
      <Button onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating...' : 'Generate content'}
      </Button>
    </div>
  );
}
```

`frontend/app/projects/[id]/page.module.css`:

```css
.description {
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.screenshots {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.error {
  color: #dc2626;
  font-size: 13px;
}
```

- [ ] **Step 2: Restyle the queue page**

Replace `frontend/app/projects/[id]/queue/page.js` entirely:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

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
    <div>
      <TopTabs projectId={id} active="queue" />
      <h1>Pending review</h1>
      {error && <p className={styles.error}>{error}</p>}
      {items.length === 0 && !error && <p>Nothing pending. Generate some content!</p>}
      <div className={styles.list}>
        {items.map((item) => (
          <Card key={item.id} className={styles.item}>
            <img src={item.imageUrl} alt="Generated" width={120} />
            <div className={styles.itemBody}>
              <p>{item.caption}</p>
              <div className={styles.actions}>
                <Button onClick={() => handleReview(item.id, 'approved')}>Approve</Button>
                <Button variant="secondary" onClick={() => handleReview(item.id, 'rejected')}>
                  Reject
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

`frontend/app/projects/[id]/queue/page.module.css`:

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
}

.itemBody {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
}

.actions {
  display: flex;
  gap: 8px;
}
```

- [ ] **Step 3: Restyle the feed page**

Replace `frontend/app/projects/[id]/feed/page.js` entirely:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

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
    <div>
      <TopTabs projectId={id} active="feed" />
      <h1>Approved feed</h1>
      {error && <p className={styles.error}>{error}</p>}
      {items.length === 0 && !error && <p>Nothing approved yet.</p>}
      <div className={styles.list}>
        {items.map((item) => (
          <Card key={item.id} className={styles.item}>
            <img src={item.imageUrl} alt="Approved content" width={120} />
            <p>{item.caption}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

`frontend/app/projects/[id]/feed/page.module.css`:

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
```

- [ ] **Step 4: Verify the full restyled loop end-to-end**

Via curl against the real backend (register/login → create project → generate →
approve, same sequence used in the Phase 2a plan): confirm every endpoint call made by
these three restyled pages (`GET /projects/:id`, `POST /projects/:id/generate`, `GET
/projects/:id/content?status=pending`, `PATCH /content/:id`, `GET
/projects/:id/content?status=approved`) still succeeds with the exact same request
shapes as before — none of the data-fetching/mutation logic changed, only JSX/styling.
If a browser is available, click through Detail → Generate → Queue (approve one item)
→ Feed and confirm the tabs highlight correctly on each page (`active="detail"` /
`"queue"` / `"feed"`).

- [ ] **Step 5: Run the full backend test suite one final time**

Run: `cd backend && npm test`
Expected: 12/12 pass — confirms this entirely-frontend pass introduced no backend
regressions.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/projects/[id]/page.js frontend/app/projects/[id]/page.module.css frontend/app/projects/[id]/queue/page.js frontend/app/projects/[id]/queue/page.module.css frontend/app/projects/[id]/feed/page.js frontend/app/projects/[id]/feed/page.module.css
git commit -m "feat: restyle project detail, queue, and feed pages with TopTabs"
```

---

## Out of scope for this plan

- Real Google/Apple OAuth integration
- Real dashboard screenshot on the landing page (placeholder panel stands in)
- Phase 2b (real Gemini AI integration) — untouched by this pass
- Dark mode, animation/motion, responsive/mobile-specific layout polish
