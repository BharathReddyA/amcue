'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

export default function PlatformAnalyticsPage() {
  const router = useRouter();
  const { id, platform } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/connect/${platform}/analytics`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id, platform, router]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await apiFetch(`/projects/${id}/connect/${platform}`, { method: 'POST' });
      router.push(`/projects/${id}/connect`);
    } catch (err) {
      setError(err.message);
      setDisconnecting(false);
    }
  }

  if (error) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!data) {
    return <p>Loading...</p>;
  }

  return (
    <div>
      <TopTabs projectId={id} active="connect" />
      <h1>{platform.charAt(0).toUpperCase() + platform.slice(1)} analytics</h1>
      {data.account && (
        <Card className={styles.accountCard}>
          <div>
            <p className={styles.accountLabel}>Connected as</p>
            <p className={styles.accountUsername}>@{data.account.username}</p>
          </div>
          <div className={styles.accountActions}>
            <a href={data.account.profileUrl} target="_blank" rel="noreferrer">
              View profile
            </a>
            <Button variant="secondary" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        </Card>
      )}
      <div className={styles.totals}>
        <Card className={styles.totalCard}>
          <p className={styles.totalLabel}>Views</p>
          <p className={styles.totalValue}>{data.totals.views}</p>
        </Card>
        <Card className={styles.totalCard}>
          <p className={styles.totalLabel}>Likes</p>
          <p className={styles.totalValue}>{data.totals.likes}</p>
        </Card>
        <Card className={styles.totalCard}>
          <p className={styles.totalLabel}>Comments</p>
          <p className={styles.totalValue}>{data.totals.comments}</p>
        </Card>
      </div>
      <div className={styles.list}>
        {data.posts.map((post) => (
          <Card key={post.id} className={styles.post}>
            <img src={post.imageUrl} alt="Post" width={64} height={64} />
            <div className={styles.postBody}>
              <p className={styles.caption}>{post.caption}</p>
              <p className={styles.postStats}>
                {post.views} views · {post.likes} likes · {post.comments} comments
              </p>
            </div>
          </Card>
        ))}
      </div>
      {data.timeline.length > 0 && (
        <div className={styles.timelineSection}>
          <h2>Recent posts</h2>
          <div className={styles.list}>
            {data.timeline.map((tweet) => (
              <Card key={tweet.id} className={styles.timelineItem}>
                <p>{tweet.text}</p>
                <a href={tweet.url} target="_blank" rel="noreferrer">
                  View ↗
                </a>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
