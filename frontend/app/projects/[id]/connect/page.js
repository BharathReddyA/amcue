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

    function loadConnections() {
      apiFetch(`/projects/${id}/connect`)
        .then(setConnections)
        .catch((err) => setError(err.message));
    }

    loadConnections();

    // ponytail: the browser's back/forward cache (bfcache) can restore this
    // page from a frozen snapshot instead of re-running on mount - refetch
    // whenever that happens so connection state never looks stale.
    function handlePageShow(event) {
      if (event.persisted) {
        loadConnections();
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [id, router]);

  async function handleToggle(platform) {
    try {
      const updated = await apiFetch(`/projects/${id}/connect/${platform}`, { method: 'POST' });
      setConnections(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConnectX() {
    try {
      const { ticket } = await apiFetch('/auth/x/prepare', { method: 'POST' });
      window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/x/login?projectId=${id}&ticket=${ticket}`;
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
              onClick={() =>
                platform.key === 'x' && !connections?.x
                  ? handleConnectX()
                  : handleToggle(platform.key)
              }
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
