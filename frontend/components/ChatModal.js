'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Button from './Button';
import Input from './Input';
import styles from './ChatModal.module.css';

export default function ChatModal({ item, onClose, onUpdated }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(item);

  useEffect(() => {
    apiFetch(`/content/${item.id}/messages`)
      .then(setMessages)
      .catch((err) => setError(err.message));
  }, [item.id]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    const userText = text;
    setText('');
    setMessages((prev) => [...prev, { id: `temp-${Date.now()}`, role: 'user', text: userText }]);
    try {
      const res = await apiFetch(`/content/${item.id}/messages`, {
        method: 'POST',
        body: { text: userText },
      });
      setMessages((prev) => [...prev, res.message]);
      setCurrent(res.contentItem);
      onUpdated(res.contentItem);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}>
          ×
        </button>
        <img src={current.imageUrl} alt="Post" className={styles.image} />
        <p className={styles.caption}>{current.caption}</p>
        <div className={styles.thread}>
          {messages.map((m) => (
            <p key={m.id} className={m.role === 'user' ? styles.userMsg : styles.assistantMsg}>
              {m.text}
            </p>
          ))}
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <form className={styles.form} onSubmit={handleSend}>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask for a change..."
            disabled={sending}
          />
          <Button type="submit" disabled={sending}>
            {sending ? 'Sending...' : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  );
}
