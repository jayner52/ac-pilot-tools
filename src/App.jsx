import { useState } from 'react';
import { Link } from 'react-router-dom';
import UploadPage from './components/UploadPage.jsx';
import CalendarView from './components/CalendarView.jsx';
import DayDetailPanel from './components/DayDetailPanel.jsx';
import { exportScheduleToICS } from './utils/icsExport.js';
import styles from './App.module.css';

export default function App() {
  const [schedule, setSchedule] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(null);

  const handleScheduleLoad = (parsed) => {
    setSchedule(parsed);
    setCurrentMonth({ year: parsed.bidPeriod.year, month: parsed.bidPeriod.month });
    setSelectedDay(null);
  };

  const handleReset = () => {
    setSchedule(null);
    setSelectedDay(null);
    setCurrentMonth(null);
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
