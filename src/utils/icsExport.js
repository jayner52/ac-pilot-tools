import { createEvents } from 'ics';
import { airportToCity, formatRoute } from './airportMap.js';

/**
 * Generate and download an ICS file for the entire schedule.
 */
export function exportScheduleToICS(schedule) {
  const events = buildEvents(schedule);
  if (events.length === 0) {
    alert('No pairing events found to export.');
    return;
  }

  const { error, value } = createEvents(events);
  if (error) {
    console.error('ICS generation error:', error);
    alert('Failed to generate calendar file: ' + error.message);
    return;
  }

  downloadICS(value, `crew-schedule-${schedule.bidPeriod?.year}-${schedule.bidPeriod?.month?.toString().padStart(2, '0')}.ics`);
}

/**
 * Generate and download an ICS file for a single pairing.
 */
export function exportPairingToICS(pairing, schedule) {
  const event = buildPairingEvent(pairing, schedule);
  if (!event) {
    alert('Could not generate calendar event — missing date information.');
    return;
  }

  const { error, value } = createEvents([event]);
  if (error) {
    console.error('ICS generation error:', error);
    alert('Failed to generate calendar file.');
    return;
  }

  downloadICS(value, `${pairing.code}.ics`);
}

// ─── Build ICS events ─────────────────────────────────────────────────────

function buildEvents(schedule) {
  const { pairings = [], days = {}, bidPeriod } = schedule;
  const events = [];

  // Build events for pairings that have date info
  for (const pairing of pairings) {
    const event = buildPairingEvent(pairing, schedule);
    if (event) events.push(event);
  }

  // Also check for training days from the days map
  if (bidPeriod) {
    for (const [dateStr, dayData] of Object.entries(days)) {
      if (dayData.type === 'training') {
        const d = parseDateString(dateStr);
        if (d) {
          events.push({
            title: `Training: ${dayData.code || 'Ground Training'}`,
            start: [d.year, d.month, d.day],
            end: [d.year, d.month, d.day],
            busyStatus: 'BUSY',
            status: 'CONFIRMED',
          });
        }
      }
    }
  }

  return events;
}

function buildPairingEvent(pairing, schedule) {
  const pairingDays = pairing.days.filter(d => d.date);
  if (pairingDays.length === 0) return null;

  const firstDay = pairingDays[0];
  const lastDay = pairingDays[pairingDays.length - 1];

  const startDate = parseDateString(firstDay.date);
  const endDate = parseDateString(lastDay.date);
  if (!startDate || !endDate) return null;

  // Build start/end with times
  const reportParts = parseTimeParts(pairing.reportTime);
  const releaseParts = parseTimeParts(pairing.releaseTime);

  const startArr = reportParts
    ? [startDate.year, startDate.month, startDate.day, reportParts.h, reportParts.m]
    : [startDate.year, startDate.month, startDate.day];

  const endArr = releaseParts
    ? [endDate.year, endDate.month, endDate.day, releaseParts.h, releaseParts.m]
    : [endDate.year, endDate.month, endDate.day];

  // Build title: "T1036: YYZ → FLL → YYZ"
  const allAirports = buildRouteAirports(pairing);
  const title = `${pairing.code}: ${allAirports.map(airportToCity).join(' → ')}`;

  // Build description
  let description = `Pairing: ${pairing.code}\n`;
  if (pairing.reportTime) description += `Report: ${pairing.reportTime}\n`;

  for (const day of pairingDays) {
    description += `\n— Day ${day.dayNum} (${day.date}) —\n`;
    for (const leg of day.legs || []) {
      const fromCity = airportToCity(leg.from);
      const toCity = airportToCity(leg.to);
      description += `  AC${leg.fltNum}  ${fromCity} (${leg.from}) ${leg.depTime} → ${toCity} (${leg.to}) ${leg.arrTime}\n`;
    }
    if (day.hotel) {
      description += `  Hotel: ${day.hotel.name}`;
      if (day.hotel.phone) description += `  📞 ${day.hotel.phone}`;
      description += '\n';
    }
  }

  if (pairing.releaseTime) description += `\nRelease: ${pairing.releaseTime}`;
  if (pairing.creditHours) description += `\nCredit: ${pairing.creditHours}`;

  // Location: first layover city or last destination
  let location = '';
  const firstLayoverDay = pairingDays.find(d => d.hotel);
  if (firstLayoverDay?.hotel) {
    location = firstLayoverDay.hotel.name;
  } else if (firstDay.legs?.length > 0) {
    const lastLeg = firstDay.legs[firstDay.legs.length - 1];
    location = airportToCity(lastLeg.to);
  }

  return {
    title,
    start: startArr,
    end: endArr,
    description,
    location,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildRouteAirports(pairing) {
  const airports = [];
  for (const day of pairing.days) {
    for (const leg of day.legs || []) {
      if (airports.length === 0) airports.push(leg.from);
      airports.push(leg.to);
    }
  }
  // Deduplicate consecutive
  return airports.filter((a, i) => i === 0 || a !== airports[i - 1]);
}

function parseDateString(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3] };
}

function parseTimeParts(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { h: +m[1], m: +m[2] };
}

function downloadICS(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
