'use client';

import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <nav className={styles.sidebar}>
      <div className={styles.logo}>AMcue</div>
      <a className={styles.link} href="/projects">
        Projects
      </a>
      <a className={styles.link} href="/projects/new">
        + New Project
      </a>
      <button className={styles.logout} onClick={handleLogout}>
        Log out
      </button>
    </nav>
  );
}
