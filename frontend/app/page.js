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
