'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Card from '@/components/Card';
import styles from './page.module.css';

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      files.forEach((file) => formData.append('screenshots', file));

      await apiFetch('/projects', {
        method: 'POST',
        body: formData,
        isFormData: true,
      });
      router.push('/projects');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className={styles.page}>
      <h1>New app project</h1>
      <Card className={styles.card}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            placeholder="App name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <textarea
            className={styles.textarea}
            placeholder="Describe your app"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files))}
          />
          <Button type="submit">Create project</Button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
      </Card>
    </div>
  );
}
