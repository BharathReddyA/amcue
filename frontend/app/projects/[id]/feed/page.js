'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';

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
    <main>
      <h1>Approved feed</h1>
      {error && <p>{error}</p>}
      {items.length === 0 && !error && <p>Nothing approved yet.</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <img src={item.imageUrl} alt="Approved content" width={120} />
            <p>{item.caption}</p>
          </li>
        ))}
      </ul>
      <p>
        <a href={`/projects/${id}`}>Back to project</a>
      </p>
    </main>
  );
}
