import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import UploadPage from './components/UploadPage.jsx';
import CalendarView from './components/CalendarView.jsx';
import DayDetailPanel from './components/DayDetailPanel.jsx';
import { exportScheduleToICS } from './utils/icsExport.js';
import styles from './App.module.css';

const SESSION_KEY = 'aircal_schedule';

function loadSaved() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function App() {
  const [schedule, setSchedule] = useState(loadSaved);
  const [selectedDay, setSelectedDay] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const s = loadSaved();
    return s ? { year: s.bidPeriod.year, month: s.bidPeriod.month } : null;
  });
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = saved === 'light' ? 'light' : '';
    return saved;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const handleScheduleLoad = (parsed) => {
    setSchedule(parsed);
    setCurrentMonth({ year: parsed.bidPeriod.year, month: parsed.bidPeriod.month });
    setSelectedDay(null);
    try {
      const { rawText: _omit, ...toStore } = parsed;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(toStore));
    } catch { /* storage unavailable or full */ }
  };

  const handleReset = () => {
    setSchedule(null);
    setSelectedDay(null);
    setCurrentMonth(null);
    sessionStorage.removeItem(SESSION_KEY);
  };

  const handleDaySelect = (dateKey) => {
    setSelectedDay(prev => (prev === dateKey ? null : dateKey));
  };

  return (
    <div className={styles.app}>
      {!schedule ? (
        <UploadPage onScheduleLoad={handleScheduleLoad} />
      ) : (
        <>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <Link to="/" className={styles.backLink} title="All tools">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
              </Link>
              <div className={styles.logo}>
                <span className={styles.logoIcon}>✈</span>
                <span className={styles.logoText}>AirCal</span>
              </div>
              {schedule.pilotName && (
                <span className={styles.pilotName}>{schedule.pilotName}</span>
              )}
            </div>

            <div className={styles.headerRight}>
              <button
                className={styles.themeBtn}
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
              <button
                className={styles.exportAllBtn}
                onClick={() => exportScheduleToICS(schedule)}
                title="Download full schedule as .ics"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export .ics
              </button>
              <button className={styles.resetBtn} onClick={handleReset}>
                Upload New PDF
              </button>
            </div>
          </header>

          <main className={styles.main}>
            <CalendarView
              schedule={schedule}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              selectedDay={selectedDay}
              onDaySelect={handleDaySelect}
            />

            {selectedDay && schedule.days[selectedDay] && (
              <DayDetailPanel
                day={selectedDay}
                dayData={schedule.days[selectedDay]}
                onClose={() => setSelectedDay(null)}
                schedule={schedule}
              />
            )}
          </main>
        </>
      )}
    </div>
  );
}
