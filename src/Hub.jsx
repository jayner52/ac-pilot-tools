import { Link } from 'react-router-dom';
import styles from './Hub.module.css';

const tools = [
  {
    id: 'aircal',
    name: 'AirCal',
    tagline: 'Block schedule viewer',
    description: 'Upload your PDF block report and get a clean interactive calendar with flight details, layover hotels, and calendar export.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <circle cx="8" cy="15" r="1" fill="currentColor"/>
        <circle cx="12" cy="15" r="1" fill="currentColor"/>
        <circle cx="16" cy="15" r="1" fill="currentColor"/>
      </svg>
    ),
    accent: '#60a5fa',
    accentBg: 'rgba(59, 130, 246, 0.08)',
    accentBorder: 'rgba(59, 130, 246, 0.18)',
    href: '/scheduler',
    internal: true,
    badge: 'New',
  },
  {
    id: 'clearedtolog',
    name: 'Cleared to Log',
    tagline: 'Logbook converter',
    description: 'Convert your Air Canada PQRM export into a MyFlightBook-compatible CSV. Fix the pain of manually re-entering your hours.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    accent: '#4ade80',
    accentBg: 'rgba(34, 197, 94, 0.08)',
    accentBorder: 'rgba(34, 197, 94, 0.18)',
    href: 'https://clearedtolog.com',
    internal: false,
  },
];

export default function Hub() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 7.2l-2 2.8 4.5 1.5-1 2.5-2-.5L4 15l3 1 1 3 2.5-1.5 1.5 4.5 2.8-2"/>
            </svg>
          </span>
          <span className={styles.brandName}>AC Pilot Tools</span>
        </div>
        <p className={styles.brandTagline}>Built by pilots, for pilots — because Air Canada's systems shouldn't be this painful.</p>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>
          {tools.map(tool => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
          <ComingSoonCard />
        </div>
      </main>

      <footer className={styles.footer}>
        <p>Free, private, client-side. Your data never leaves your browser.</p>
      </footer>
    </div>
  );
}

function ToolCard({ tool }) {
  const content = (
    <div className={styles.card} style={{ '--accent': tool.accent, '--accent-bg': tool.accentBg, '--accent-border': tool.accentBorder }}>
      <div className={styles.cardIcon}>{tool.icon}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardTitleRow}>
          <h2 className={styles.cardName}>{tool.name}</h2>
          {tool.badge && <span className={styles.badge}>{tool.badge}</span>}
          {!tool.internal && (
            <span className={styles.externalIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </span>
          )}
        </div>
        <p className={styles.cardTagline}>{tool.tagline}</p>
        <p className={styles.cardDesc}>{tool.description}</p>
      </div>
      <div className={styles.cardArrow}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <line x1="5" y1="12" x2="19" y2="12"/>
          <polyline points="12 5 19 12 12 19"/>
        </svg>
      </div>
    </div>
  );

  if (tool.internal) {
    return <Link to={tool.href} className={styles.cardLink}>{content}</Link>;
  }
  return (
    <a href={tool.href} target="_blank" rel="noopener noreferrer" className={styles.cardLink}>
      {content}
    </a>
  );
}

function ComingSoonCard() {
  return (
    <div className={styles.comingSoon}>
      <div className={styles.comingSoonIcon}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p className={styles.comingSoonText}>More tools coming soon</p>
      <p className={styles.comingSoonSub}>Got an idea? We're building this together.</p>
    </div>
  );
}
