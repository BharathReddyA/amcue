'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, isLoggedIn } from '@/lib/api';
import Button from '@/components/Button';
import Card from '@/components/Card';
import TopTabs from '@/components/TopTabs';
import styles from './page.module.css';

export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [voice, setVoice] = useState(null);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
      return;
    }
    apiFetch(`/projects/${id}`)
      .then(setProject)
      .catch((err) => setError(err.message));
    apiFetch(`/projects/${id}/brand-voice`)
      .then(setVoice)
      .catch(() => {});
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

  async function handleRefreshVoice() {
    setRefreshing(true);
    setError('');
    try {
      const updated = await apiFetch(`/projects/${id}/brand-voice/refresh`, { method: 'POST' });
      setVoice(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (error && !project) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!project) {
    return <p>Loading...</p>;
  }

  const totalSignals = voice
    ? voice.counts.approved + voice.counts.rejected + voice.counts.edits
    : 0;

  return (
    <div>
      <TopTabs projectId={id} active="detail" />
      <h1>{project.name}</h1>
      <p className={styles.description}>{project.description}</p>
      {project.screenshotUrls.length > 0 && (
        <div className={styles.screenshots}>
          {project.screenshotUrls.map((url) => (
            <img key={url} src={url} alt="Screenshot" width={120} />
          ))}
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
      <Button onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating...' : 'Generate content'}
      </Button>

      {voice && (
        <Card className={styles.voiceCard}>
          <div className={styles.voiceHeader}>
            <div>
              <h2 className={styles.voiceTitle}>Brand Voice</h2>
              <p className={styles.voiceStats}>
                Learning from {voice.counts.approved} approved · {voice.counts.rejected}{' '}
                rejected · {voice.counts.edits} edit instructions
              </p>
            </div>
            {totalSignals > 0 && (
              <Button
                variant={voice.stale ? 'primary' : 'secondary'}
                onClick={handleRefreshVoice}
                disabled={refreshing}
              >
                {refreshing ? 'Learning...' : voice.stale ? 'Refresh voice' : 'Up to date'}
              </Button>
            )}
          </div>
          {voice.summary ? (
            <p className={styles.voiceSummary}>{voice.summary}</p>
          ) : (
            <p className={styles.voiceEmpty}>
              {totalSignals === 0
                ? 'Review a few posts and AMcue will learn your voice.'
                : 'Click "Refresh voice" to distill what AMcue has learned so far.'}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
