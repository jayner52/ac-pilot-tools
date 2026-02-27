import { useMemo } from 'react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, format, addMonths, subMonths, isSameDay, isSameMonth,
} from 'date-fns';
import DayCell from './DayCell.jsx';
import { exportScheduleToICS } from '../utils/icsExport.js';
import styles from './CalendarView.module.css';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dateKey(date) {
  return format(date, 'yyyy-MM-dd');
}

export default function CalendarView({
  schedule, currentMonth, onMonthChange, selectedDay, onDaySelect,
}) {
  const { month, year } = currentMonth;
  const today = new Date();

  const monthDate = useMemo(() => new Date(year, month - 1, 1), [year, month]);

  // Build the 42-cell grid (6 weeks × 7 days)
  const calendarDays = useMemo(() => {
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);
    const allDays = eachDayOfInterval({ start, end });

    const firstDow = getDay(start); // 0=Sun
    const grid = [];

    // Pad start
    for (let i = 0; i < firstDow; i++) grid.push(null);

    // Actual days
    for (const d of allDays) grid.push(d);

    // Pad end to complete row
    while (grid.length % 7 !== 0) grid.push(null);

    return grid;
  }, [monthDate]);

  // Count stats for the month
  const stats = useMemo(() => {
    let off = 0, flying = 0, layover = 0, training = 0;
    for (let d = 1; d <= new Date(year, month, 0).getDate(); d++) {
      const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const type = schedule.days[key]?.type;
      if (type === 'off') off++;
      else if (type === 'flying') flying++;
      else if (type === 'layover') layover++;
      else if (type === 'training') training++;
    }
    return { off, flying, layover, training };
  }, [schedule, year, month]);

  const handlePrevMonth = () => {
    const prev = subMonths(monthDate, 1);
    onMonthChange({ year: prev.getFullYear(), month: prev.getMonth() + 1 });
  };

  const handleNextMonth = () => {
    const next = addMonths(monthDate, 1);
    onMonthChange({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  const handleDayClick = (date) => {
    const key = dateKey(date);
    const dayData = schedule.days[key];
    if (dayData && dayData.type !== 'unknown') {
      const dateStr = dateKey(date);
      onDaySelect(selectedDay === dateStr ? null : dateStr);
    } else {
      onDaySelect(null);
    }
  };

  const handleExport = () => {
    exportScheduleToICS(schedule);
  };

  return (
    <div className={styles.container}>
      {/* Month nav bar */}
      <div className={styles.navBar}>
        <div className={styles.navLeft}>
          <button className={styles.navBtn} onClick={handlePrevMonth} aria-label="Previous month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2 className={styles.monthLabel}>
            {MONTH_NAMES[month]} {year}
          </h2>
          <button className={styles.navBtn} onClick={handleNextMonth} aria-label="Next month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div className={styles.navRight}>
          {/* Stats chips */}
          <div className={styles.statsRow}>
            {stats.flying > 0 && (
              <span className={`${styles.statChip} ${styles.chipFlying}`}>
                ✈ {stats.flying + stats.layover}d flying
              </span>
            )}
            {stats.layover > 0 && (
              <span className={`${styles.statChip} ${styles.chipLayover}`}>
                📍 {stats.layover}d away
              </span>
            )}
            {stats.off > 0 && (
              <span className={`${styles.statChip} ${styles.chipOff}`}>
                ✓ {stats.off}d off
              </span>
            )}
            {stats.training > 0 && (
              <span className={`${styles.statChip} ${styles.chipTraining}`}>
                📋 {stats.training}d training
              </span>
            )}
          </div>

          <button className={styles.exportBtn} onClick={handleExport} title="Download .ics calendar file">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Add to Calendar
          </button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className={styles.weekdayRow}>
        {WEEKDAY_LABELS.map(label => (
          <div key={label} className={styles.weekdayLabel}>{label}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={styles.grid}>
        {calendarDays.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className={styles.emptyCell} />;
          }
          const key = dateKey(date);
          const dayData = schedule.days[key];
          const isCurrentMonth = isSameMonth(date, monthDate);
          const isToday = isSameDay(date, today);

          return (
            <DayCell
              key={key}
              date={date}
              dayData={dayData}
              isSelected={selectedDay === key}
              isToday={isToday}
              isCurrentMonth={isCurrentMonth}
              onClick={handleDayClick}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <LegendItem colorClass="off" label="Day Off" />
        <LegendItem colorClass="flying" label="Flying" />
        <LegendItem colorClass="layover" label="Layover Away" />
        <LegendItem colorClass="training" label="Training" />
      </div>
    </div>
  );
}

function LegendItem({ colorClass, label }) {
  return (
    <div className={styles.legendItem}>
      <span className={`${styles.legendDot} ${styles[`dot_${colorClass}`]}`} />
      <span>{label}</span>
    </div>
  );
}
