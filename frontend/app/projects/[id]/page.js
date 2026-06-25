'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';

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
    return (
      <main>
        <p>{error}</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{project.name}</h1>
      <p>{project.description}</p>
      {project.screenshotUrls.length > 0 && (
        <div>
          {project.screenshotUrls.map((url) => (
            <img key={url} src={url} alt="Screenshot" width={120} />
          ))}
        </div>
      )}
      <button onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating...' : 'Generate content'}
      </button>
      <p>
        <a href={`/projects/${id}/queue`}>View queue</a>{' '}
        <a href={`/projects/${id}/feed`}>View feed</a>
      </p>
      <p>
        <a href="/projects">Back to projects</a>
      </p>
    </main>
  );
}
