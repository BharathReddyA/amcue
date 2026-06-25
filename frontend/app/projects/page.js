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
