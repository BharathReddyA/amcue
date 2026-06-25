import Sidebar from '@/components/Sidebar';
import styles from './layout.module.css';

export default function ProjectsLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
