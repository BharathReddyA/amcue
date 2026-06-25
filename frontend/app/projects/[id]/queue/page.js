'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

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
    <div>
      <TopTabs projectId={id} active="queue" />
      <h1>Pending review</h1>
      {error && <p className={styles.error}>{error}</p>}
      {items.length === 0 && !error && <p>Nothing pending. Generate some content!</p>}
      <div className={styles.list}>
        {items.map((item) => (
          <Card key={item.id} className={styles.item}>
            <img src={item.imageUrl} alt="Generated" width={120} />
            <div className={styles.itemBody}>
              <p>{item.caption}</p>
              <div className={styles.actions}>
                <Button onClick={() => handleReview(item.id, 'approved')}>Approve</Button>
                <Button variant="secondary" onClick={() => handleReview(item.id, 'rejected')}>
                  Reject
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
