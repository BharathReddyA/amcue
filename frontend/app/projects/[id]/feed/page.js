'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
};

export default function FeedPage() {
  const router = useRouter();
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [postsByItem, setPostsByItem] = useState({});
  const [selectedPlatform, setSelectedPlatform] = useState({});
  const [posting, setPosting] = useState({});

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/content?status=approved`)
      .then((data) => {
        setItems(data);
        data.forEach((item) => {
          apiFetch(`/content/${item.id}/posts`)
            .then((posts) => setPostsByItem((prev) => ({ ...prev, [item.id]: posts })))
            .catch(() => {});
        });
      })
      .catch((err) => setError(err.message));
  }, [id, router]);

  async function handlePost(itemId) {
    const platform = selectedPlatform[itemId] || 'instagram';
    setPosting((prev) => ({ ...prev, [itemId]: true }));
    setError('');
    try {
      const post = await apiFetch(`/content/${itemId}/post`, {
        method: 'POST',
        body: { platform },
      });
      setPostsByItem((prev) => ({ ...prev, [itemId]: [post, ...(prev[itemId] || [])] }));
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting((prev) => ({ ...prev, [itemId]: false }));
    }
  }

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
            <div className={styles.itemBody}>
              <p>{item.caption}</p>
              <div className={styles.postedList}>
                {(postsByItem[item.id] || []).map((post) => (
                  <span key={post.id} className={styles.postedBadge}>
                    {post.externalUrl ? (
                      <a href={post.externalUrl} target="_blank" rel="noreferrer">
                        Posted to {PLATFORM_LABELS[post.platform]} ↗
                      </a>
                    ) : (
                      `Posted to ${PLATFORM_LABELS[post.platform]}`
                    )}
                  </span>
                ))}
              </div>
              <div className={styles.postControls}>
                <select
                  className={styles.platformSelect}
                  value={selectedPlatform[item.id] || 'instagram'}
                  onChange={(e) =>
                    setSelectedPlatform((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                >
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                  <option value="x">X</option>
                </select>
                <Button onClick={() => handlePost(item.id)} disabled={posting[item.id]}>
                  {posting[item.id] ? 'Posting...' : 'Post'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
