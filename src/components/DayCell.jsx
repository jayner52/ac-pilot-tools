import { airportToCity } from '../utils/airportMap.js';
import styles from './DayCell.module.css';

function timeToPercent(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return ((h * 60 + m) / 1440) * 100;
}

export default function DayCell({ date, dayData, isSelected, isToday, isCurrentMonth, onClick, pairingMeta }) {
  if (!isCurrentMonth) {
    return <div className={`${styles.cell} ${styles.outside}`} />;
  }

  const dayNum = date.getDate();
  const type = dayData?.type || 'unknown';

  const isTrip   = type === 'flying' || type === 'layover';
  const isFirst  = isTrip && dayData?.dayNum === 1;
  const isLast   = isTrip && dayData?.dayNum === dayData?.totalDays;
  const isSingle = isFirst && isLast;
  const backToBack = pairingMeta?.backToBackBefore ?? false;

  const pairingCode = dayData?.pairingCode;
  const code     = dayData?.layoverCity || dayData?.mainDestination;
  const cityName = code ? airportToCity(code) : null;

  const resolvedType = isTrip ? 'trip' : type;

  // ── Time bar ────────────────────────────────────────────
  let barLeft = 0, barRight = 100, barLabel = null;
  if (isTrip) {
    if (isFirst && dayData.reportTime) {
      barLeft = Math.max(0, timeToPercent(dayData.reportTime) ?? 0);
    }
    if (isLast && dayData.releaseTime) {
      barRight = Math.min(100, timeToPercent(dayData.releaseTime) ?? 100);
    }
    // Guarantee at least 1 % width so the bar is always visible
    if (barRight <= barLeft) barRight = Math.min(100, barLeft + 1);

    if (isSingle && dayData.reportTime && dayData.releaseTime) {
      barLabel = `${dayData.reportTime}–${dayData.releaseTime}`;
    } else if (isFirst && dayData.reportTime) {
      barLabel = `Rpt ${dayData.reportTime}`;
    } else if (isLast && dayData.releaseTime) {
      barLabel = `Rel ${dayData.releaseTime}`;
    }
  }

  const cellClass = [
    styles.cell,
    styles[`type_${resolvedType}`],
    isSelected && styles.selected,
    isToday && styles.today,
    backToBack && styles.backToBack,
    pairingMeta?.isFirst && styles.pairingStart,
    pairingMeta?.isLast  && styles.pairingEnd,
  ].filter(Boolean).join(' ');

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
      {isTrip && <span className={styles.accentBar} aria-hidden="true" />}

      <div className={styles.body}>
        {/* Top row: pairing code + day number */}
        <div className={styles.topRow}>
          {isTrip && pairingCode && <span className={styles.pairingCode}>{pairingCode}</span>}
          <span className={styles.dayNum}>
            {dayNum}
            {isToday && <span className={styles.todayDot} aria-hidden="true" />}
          </span>
        </div>

        {/* Middle: city / OFF / TRN / — */}
        <div className={styles.middle}>
          {type === 'off'      && <span className={styles.offLabel}>OFF</span>}
          {isTrip && cityName  && <span className={styles.cityName}>{cityName}</span>}
          {type === 'training' && <span className={styles.trainingLabel}>TRN</span>}
          {type === 'unknown'  && <span className={styles.unknownLabel}>—</span>}
        </div>

        {/* Time bar — trip days only */}
        {isTrip && (
          <div className={styles.timeBarSection}>
            <div
              className={styles.timeTrack}
              style={{
                '--bar-left':  `${barLeft.toFixed(1)}%`,
                '--bar-right': `${barRight.toFixed(1)}%`,
              }}
            />
            {barLabel && <span className={styles.barLabel}>{barLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
