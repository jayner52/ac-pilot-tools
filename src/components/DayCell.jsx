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

  const isTrip    = type === 'flying' || type === 'layover';
  const isFirst   = isTrip && dayData?.dayNum === 1;
  const isLast    = isTrip && dayData?.dayNum === dayData?.totalDays;
  const isSingle  = isFirst && isLast;
  const backToBack = pairingMeta?.backToBackBefore ?? false;

  const pairingCode = dayData?.pairingCode;
  const code     = dayData?.layoverCity || dayData?.mainDestination;
  const cityName = code ? airportToCity(code) : null;

  const resolvedType = isTrip ? 'trip' : type;

  // ── Time bar ─────────────────────────────────────────────
  // 0% = midnight, 100% = 23:59
  // First day:  bar starts at report time, extends to right cell edge (100%)
  // Middle day: bar spans full cell (0% → 100%)
  // Last day:   bar starts at left cell edge (0%), ends at release time
  // Single day: bar from report to release
  let barLeft = 0, barRight = 100, barLabel = null;
  if (isTrip) {
    if (isFirst && dayData.reportTime) {
      barLeft = Math.max(0, timeToPercent(dayData.reportTime) ?? 0);
    }
    if (isLast && dayData.releaseTime) {
      barRight = Math.min(100, timeToPercent(dayData.releaseTime) ?? 100);
    }
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
    // Extend track into the grid gap to connect adjacent pairing days
    isTrip && !isFirst && styles.trackExtLeft,
    isTrip && !isLast  && styles.trackExtRight,
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
      {/*
        .inner clips the accent bar to rounded corners via overflow:hidden.
        .cell itself uses overflow:visible so the absolute timeTrack can
        extend 2 px into the grid gap to visually link adjacent trip days.
      */}
      <div className={styles.inner}>
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

          {/* Time label (above the bar) */}
          {isTrip && barLabel && (
            <span className={styles.barLabel}>{barLabel}</span>
          )}
        </div>
      </div>

      {/* Time track: full-width at cell bottom, shows work period within 24h */}
      {isTrip && (
        <div
          className={styles.timeTrack}
          style={{
            '--bar-left':  `${barLeft.toFixed(1)}%`,
            '--bar-right': `${barRight.toFixed(1)}%`,
          }}
        />
      )}
    </div>
  );
}
