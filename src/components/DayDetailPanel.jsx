import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { airportToCity } from '../utils/airportMap.js';
import { exportPairingToICS } from '../utils/icsExport.js';
import styles from './DayDetailPanel.module.css';

const TYPE_LABELS = {
  off: 'Day Off',
  flying: 'Flying',
  layover: 'Layover Away',
  training: 'Training',
  unknown: '',
};

const TYPE_COLORS = {
  off: 'off',
  flying: 'trip',
  layover: 'trip',
  training: 'training',
  unknown: 'trip',
};

export default function DayDetailPanel({ day, dayData, onClose, schedule }) {
  const panelRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Trap focus inside panel
  useEffect(() => {
    panelRef.current?.focus();
  }, [day]);

  if (!dayData || !day) return null;

  const date = new Date(day + 'T12:00:00');
  const formattedDate = format(date, 'EEEE, MMMM d, yyyy');
  const type = dayData.type || 'unknown';
  const colorKey = TYPE_COLORS[type];

  // Find the full pairing from schedule.pairings
  const pairing = schedule.pairings?.find(p =>
    p.code === dayData.pairingCode &&
    p.days?.some(d => d.date === day)
  );

  const hasLegs = dayData.legs && dayData.legs.length > 0;
  const hasHotel = !!dayData.hotel;

  const handleExport = () => {
    if (!pairing) {
      alert('No pairing details available to export.');
      return;
    }
    exportPairingToICS(pairing, schedule);
  };

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-label={`Details for ${formattedDate}`}
        tabIndex={-1}
      >
        {/* Header */}
        <div className={`${styles.header} ${styles[`header_${colorKey}`]}`}>
          <div className={styles.headerContent}>
            <div className={styles.dateLine}>{formattedDate}</div>
            <div className={styles.typeBadge}>
              <span className={`${styles.typeIndicator} ${styles[`ind_${colorKey}`]}`} />
              {TYPE_LABELS[type]}
            </div>
            {dayData.pairingCode && (
              <div className={styles.pairingCode}>{dayData.pairingCode}</div>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {type === 'off' && (
            <div className={styles.offMessage}>
              <span className={styles.offIcon}>✓</span>
              <span>Rest day</span>
            </div>
          )}

          {type === 'training' && (
            <div className={styles.trainingMessage}>
              <span className={styles.trainingIcon}>📋</span>
              <span>Training — {dayData.code || 'Ground School'}</span>
            </div>
          )}

          {(type === 'flying' || type === 'layover') && (
            <>
              {/* Report / Release */}
              <div className={styles.timingRow}>
                {dayData.reportTime && (
                  <div className={styles.timingItem}>
                    <span className={styles.timingLabel}>Report</span>
                    <span className={styles.timingValue}>{dayData.reportTime}</span>
                  </div>
                )}
                {dayData.releaseTime && (
                  <div className={styles.timingItem}>
                    <span className={styles.timingLabel}>Release</span>
                    <span className={styles.timingValue}>{dayData.releaseTime}</span>
                  </div>
                )}
                {dayData.creditHours && (
                  <div className={styles.timingItem}>
                    <span className={styles.timingLabel}>Credit</span>
                    <span className={styles.timingValue}>{dayData.creditHours}</span>
                  </div>
                )}
                {dayData.totalDays && (
                  <div className={styles.timingItem}>
                    <span className={styles.timingLabel}>Day</span>
                    <span className={styles.timingValue}>{dayData.dayNum} of {dayData.totalDays}</span>
                  </div>
                )}
              </div>

              {/* Flight legs */}
              {hasLegs ? (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                    Flight Legs
                  </div>
                  <div className={styles.legsTable}>
                    {dayData.legs.map((leg, idx) => (
                      <div key={idx} className={styles.legRow}>
                        <div className={styles.legFlt}>AC{leg.fltNum}</div>
                        <div className={styles.legRoute}>
                          <div className={styles.legOrigin}>
                            <span className={styles.legCode}>{leg.from}</span>
                            <span className={styles.legCity}>{airportToCity(leg.from)}</span>
                          </div>
                          <div className={styles.legArrow}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="5" y1="12" x2="19" y2="12"/>
                              <polyline points="12 5 19 12 12 19"/>
                            </svg>
                          </div>
                          <div className={styles.legDest}>
                            <span className={styles.legCode}>{leg.to}</span>
                            <span className={styles.legCity}>{airportToCity(leg.to)}</span>
                          </div>
                        </div>
                        <div className={styles.legTimes}>
                          <span>{leg.depTime}</span>
                          <span className={styles.legTimeSep}>→</span>
                          <span>{leg.arrTime}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.noLegsNote}>
                  {type === 'layover' ? 'Rest day at layover city' : 'Flight details not available in this PDF format'}
                </div>
              )}

              {/* Hotel */}
              {hasHotel && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    Layover Hotel
                  </div>
                  <div className={styles.hotelCard}>
                    <div className={styles.hotelName}>{dayData.hotel.name}</div>
                    {dayData.hotel.phone && (
                      <a
                        href={`tel:${dayData.hotel.phone.replace(/[^\d+]/g, '')}`}
                        className={styles.hotelPhone}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.07 13.93a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3 3.05h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 10.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 18l.04.04-.04-.12z"/>
                        </svg>
                        {dayData.hotel.phone}
                      </a>
                    )}
                    {dayData.layoverCity && (
                      <div className={styles.hotelCity}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        {airportToCity(dayData.layoverCity)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pairing summary (shown on last day) */}
              {dayData.releaseTime && pairing && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    Pairing Summary
                  </div>
                  <div className={styles.summaryGrid}>
                    {pairing.reportTime && (
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Report</span>
                        <span className={styles.summaryValue}>{pairing.reportTime}</span>
                      </div>
                    )}
                    {pairing.releaseTime && (
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Release</span>
                        <span className={styles.summaryValue}>{pairing.releaseTime}</span>
                      </div>
                    )}
                    {pairing.creditHours && (
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Credit</span>
                        <span className={styles.summaryValue}>{pairing.creditHours}</span>
                      </div>
                    )}
                    {pairing.lengthDays && (
                      <div className={styles.summaryItem}>
                        <span className={styles.summaryLabel}>Length</span>
                        <span className={styles.summaryValue}>{pairing.lengthDays} day{pairing.lengthDays > 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {(type === 'flying' || type === 'layover') && (
          <div className={styles.footer}>
            <button className={styles.exportBtn} onClick={handleExport}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Add {dayData.pairingCode || 'Pairing'} to Calendar
            </button>
          </div>
        )}
      </div>
    </>
  );
}
