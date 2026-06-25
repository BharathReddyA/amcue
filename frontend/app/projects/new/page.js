'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

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
    <main>
      <h1>New app project</h1>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="App name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <textarea
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
        <button type="submit">Create project</button>
      </form>
      {error && <p>{error}</p>}
    </main>
  );
}
