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
