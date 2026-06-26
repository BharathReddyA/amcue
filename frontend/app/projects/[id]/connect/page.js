'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Card from '@/components/Card';
import Button from '@/components/Button';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'x', label: 'X' },
];

export default function ConnectPage() {
  const router = useRouter();
  const { id } = useParams();
  const [connections, setConnections] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}/connect`)
      .then(setConnections)
      .catch((err) => setError(err.message));
  }, [id, router]);

  async function handleToggle(platform) {
    try {
      const updated = await apiFetch(`/projects/${id}/connect/${platform}`, { method: 'POST' });
      setConnections(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <TopTabs projectId={id} active="connect" />
      <h1>Connect your accounts</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.list}>
        {PLATFORMS.map((platform) => (
          <Card key={platform.key} className={styles.item}>
            <div>
              <h3>{platform.label}</h3>
              <p className={styles.status}>
                {connections?.[platform.key] ? 'Connected ✓' : 'Not connected'}
              </p>
              {connections?.[platform.key] && (
                <a className={styles.analyticsLink} href={`/projects/${id}/connect/${platform.key}`}>
                  View analytics
                </a>
              )}
            </div>
            <Button
              variant={connections?.[platform.key] ? 'secondary' : 'primary'}
              onClick={() => handleToggle(platform.key)}
              disabled={!connections}
            >
              {connections?.[platform.key] ? 'Disconnect' : 'Connect'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
