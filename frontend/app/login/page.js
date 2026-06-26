'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, setToken } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';
import ThemeToggle from '@/components/ThemeToggle';
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
      <div className={styles.themeToggle}>
        <ThemeToggle />
      </div>
      <Card className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>A</span>
          <span className={styles.brandName}>AMcue</span>
        </div>
        <h1 className={styles.heading}>Welcome back</h1>
        <p className={styles.subheading}>Log in to keep your marketing on autopilot.</p>
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
