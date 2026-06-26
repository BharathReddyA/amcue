'use client';

import { useRouter, usePathname } from 'next/navigation';
import { clearToken } from '@/lib/api';
import ThemeToggle from './ThemeToggle';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  const isProjects = pathname === '/projects';
  const isNew = pathname === '/projects/new';

  return (
    <nav className={styles.sidebar}>
      <a href="/projects" className={styles.brand}>
        <span className={styles.brandMark}>A</span>
        <span className={styles.brandName}>AMcue</span>
      </a>

      <div className={styles.nav}>
        <a className={`${styles.link} ${isProjects ? styles.active : ''}`} href="/projects">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
          Projects
        </a>
        <a className={`${styles.link} ${isNew ? styles.active : ''}`} href="/projects/new">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Project
        </a>
      </div>

      <div className={styles.footer}>
        <ThemeToggle />
        <button className={styles.logout} onClick={handleLogout}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Log out
        </button>
      </div>
    </nav>
  );
}
