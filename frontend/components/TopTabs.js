import styles from './TopTabs.module.css';

export default function TopTabs({ projectId, active }) {
  const tabs = [
    { key: 'detail', label: 'Detail', href: `/projects/${projectId}` },
    { key: 'queue', label: 'Queue', href: `/projects/${projectId}/queue` },
    { key: 'feed', label: 'Feed', href: `/projects/${projectId}/feed` },
  ];

  return (
    <nav className={styles.tabs}>
      {tabs.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          className={tab.key === active ? styles.activeTab : styles.tab}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
