import { airportToCity } from '../utils/airportMap.js';
import styles from './DayCell.module.css';

const DAY_TYPE_LABELS = {
  off: 'OFF',
  flying: 'FLY',
  layover: 'LAYOVER',
  training: 'TRN',
  unknown: '',
};

export default function DayCell({ date, dayData, isSelected, isToday, isCurrentMonth, onClick }) {
  if (!isCurrentMonth) {
    return <div className={`${styles.cell} ${styles.outside}`} />;
  }

  const dayNum = date.getDate();
  const type = dayData?.type || 'unknown';

  const cellClass = [
    styles.cell,
    styles[`type_${type}`],
    isSelected ? styles.selected : '',
    isToday ? styles.today : '',
  ].filter(Boolean).join(' ');

  // What to show in the cell
  const pairingCode = dayData?.pairingCode;
  const mainDest = dayData?.mainDestination
    ? airportToCity(dayData.mainDestination)
    : null;
  const trainingCode = dayData?.code;

  return (
    <div
      className={cellClass}
      onClick={() => onClick(date)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(date)}
      aria-label={`${date.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })}: ${type}`}
      aria-selected={isSelected}
    >
      <div className={styles.header}>
        <span className={styles.dayNum}>{dayNum}</span>
        {isToday && <span className={styles.todayBadge} aria-hidden="true" />}
      </div>

      <div className={styles.content}>
        {type === 'off' && (
          <span className={styles.offLabel}>OFF</span>
        )}

        {(type === 'flying' || type === 'layover') && pairingCode && (
          <>
            <span className={styles.pairingCode}>{pairingCode}</span>
            {mainDest && (
              <span className={styles.destination}>{mainDest}</span>
            )}
            {type === 'layover' && (
              <span className={styles.layoverBadge} title="Layover away from base">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              </span>
            )}
          </>
        )}

        {type === 'training' && (
          <>
            <span className={styles.trainingLabel}>TRN</span>
            {trainingCode && (
              <span className={styles.trainingCode}>{trainingCode}</span>
            )}
          </>
        )}

        {type === 'unknown' && (
          <span className={styles.unknownLabel}>—</span>
        )}
      </div>
    </div>
  );
}
