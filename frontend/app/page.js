'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/api';
import Button from '@/components/Button';
import ThemeToggle from '@/components/ThemeToggle';
import styles from './page.module.css';

const FEATURES = [
  {
    title: 'Describe your app',
    body: 'Tell AMcue about your app and upload a few screenshots — that becomes its context.',
    icon: (
      <path d="M4 5h16M4 12h16M4 19h10" />
    ),
  },
  {
    title: 'AI generates content',
    body: 'Gemini writes the caption and generates a matching image, on demand.',
    icon: (
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    ),
  },
  {
    title: 'Review & refine',
    body: 'Approve, reject, or chat with the editor to tweak the caption or image.',
    icon: (
      <path d="M20 6L9 17l-5-5" />
    ),
  },
  {
    title: 'Publish for real',
    body: 'Post approved content straight to X — with more platforms on the way.',
    icon: (
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    ),
  },
];

const FAQS = [
  {
    q: 'Does this post to my real social accounts?',
    a: 'Yes — connect your X account and AMcue publishes approved posts to it. Instagram, TikTok, and YouTube are coming next.',
  },
  {
    q: 'What AI does AMcue use?',
    a: 'Google Gemini generates both the marketing caption and a matching promotional image for each piece of content.',
  },
  {
    q: 'Do I stay in control of what goes out?',
    a: 'Always. Nothing is published until you approve it — and you can chat with the editor to refine any post first.',
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
      <header className={styles.nav}>
        <a href="/" className={styles.brand}>
          <span className={styles.brandMark}>A</span>
          <span>AMcue</span>
        </a>
        <div className={styles.navActions}>
          <ThemeToggle />
          <button className={styles.navLogin} onClick={() => router.push('/login')}>
            Log in
          </button>
          <Button onClick={() => router.push('/register')}>Get started</Button>
        </div>
      </header>

      <section className={styles.hero}>
        <span className={styles.badge}>AI-powered marketing for indie apps</span>
        <h1 className={styles.tagline}>
          Automate your app&apos;s marketing,
          <span className={styles.gradientText}> end to end.</span>
        </h1>
        <p className={styles.subtitle}>
          Describe your app once. AMcue generates captions and images, lets you review and
          refine them, then publishes the winners — so growth runs while you build.
        </p>
        <div className={styles.heroActions}>
          <Button onClick={() => router.push('/register')}>Start free</Button>
          <Button variant="secondary" onClick={() => router.push('/login')}>
            Log in
          </Button>
        </div>
      </section>

      <section className={styles.preview}>
        <div className={styles.previewPanel}>
          <div className={styles.previewBar}>
            <span />
            <span />
            <span />
          </div>
          <div className={styles.previewBody}>
            <div className={styles.previewSidebar} />
            <div className={styles.previewMain}>
              <div className={styles.previewCardRow}>
                <div className={styles.previewCard} />
                <div className={styles.previewCard} />
                <div className={styles.previewCard} />
              </div>
              <div className={styles.previewWide} />
              <div className={styles.previewWide} />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.features}>
        {FEATURES.map((f) => (
          <div key={f.title} className={styles.feature}>
            <span className={styles.featureIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {f.icon}
              </svg>
            </span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.faq}>
        <h2>Frequently asked</h2>
        <div className={styles.faqList}>
          {FAQS.map((item) => (
            <div key={item.q} className={styles.faqItem}>
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>A</span>
          <span>AMcue</span>
        </div>
        <p>&copy; {new Date().getFullYear()} AMcue. Built for indie makers.</p>
      </footer>
    </main>
  );
}
