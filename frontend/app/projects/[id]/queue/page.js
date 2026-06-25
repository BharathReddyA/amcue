'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';

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
    <main>
      <h1>Pending review</h1>
      {error && <p>{error}</p>}
      {items.length === 0 && !error && <p>Nothing pending. Generate some content!</p>}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <img src={item.imageUrl} alt="Generated" width={120} />
            <p>{item.caption}</p>
            <button onClick={() => handleReview(item.id, 'approved')}>Approve</button>
            <button onClick={() => handleReview(item.id, 'rejected')}>Reject</button>
          </li>
        ))}
      </ul>
      <p>
        <a href={`/projects/${id}`}>Back to project</a>
      </p>
    </main>
  );
}
