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
