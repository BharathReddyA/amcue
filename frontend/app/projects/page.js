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
            <a href={`/projects/${p.id}`}>
              <strong>{p.name}</strong> — {p.description}
            </a>
          </li>
        ))}
      </ul>
      {projects.length === 0 && !error && <p>No projects yet. Create one!</p>}
    </main>
  );
}
