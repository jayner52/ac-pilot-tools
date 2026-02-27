/**
 * Air Canada Block Report PDF Parser
 *
 * Handles the actual format observed in the PDFs:
 *  Page 1 — Horizontal calendar STRIP with rows: Act / Lay / Rpt / Rel / Cred / Qual
 *  Page 2+ — Detailed pairing sheets: Report, DAY/FLT#/From/Dep/To/Arr table,
 *             "Layover at HOTEL (PHONE)" lines, Release, summary
 */

// pdfjs-dist is loaded lazily inside parsePDF() to avoid blocking app startup.
// (pdfjs-dist 3.x is CJS-only and cannot be statically imported by Vite in dev mode)
let _pdfjsLib = null;

async function getPdfjs() {
  if (_pdfjsLib) return _pdfjsLib;
  _pdfjsLib = await import('pdfjs-dist');
  _pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  return _pdfjsLib;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_MAP = {
  JAN:1,JANUARY:1, FEB:2,FEBRUARY:2, MAR:3,MARCH:3, APR:4,APRIL:4,
  MAY:5, JUN:6,JUNE:6, JUL:7,JULY:7, AUG:8,AUGUST:8,
  SEP:9,SEPT:9,SEPTEMBER:9, OCT:10,OCTOBER:10, NOV:11,NOVEMBER:11, DEC:12,DECEMBER:12,
};

// Row label identifiers in the horizontal strip
const STRIP_ROW_LABELS = {
  act:  ['ACT','ACTIVITY'],
  lay:  ['LAY','LAYOVER','LAY.'],
  rpt:  ['RPT','REPORT','RPT.'],
  rel:  ['REL','RLS','RELEASE','REL.'],
  cred: ['CRED','CREDIT','CRED.'],
  qual: ['QUAL','QUALIFICATION'],
};

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function parsePDF(file) {
  const { pages, rawText } = await extractAllText(file);

  // Find pilot info + bid period from page 1
  const meta = parseMeta(pages[0] || []);

  if (!meta.bidPeriod) {
    return { pilotName: meta.pilotName || 'Pilot', bidPeriod: null, days: {}, pairings: [], rawText,
      error: 'Could not find bid period. Check the debug text below.' };
  }

  // Parse the horizontal strip (page 1)
  const strip = parseStrip(pages[0] || [], meta.bidPeriod);

  // Parse detailed pairing sections (pages 2+)
  const allLines = pages.flat();
  const detailedPairings = parseDetailedSections(allLines);

  // Build the final schedule
  const { days, pairings } = buildSchedule(strip, detailedPairings, meta.bidPeriod);

  return {
    pilotName: meta.pilotName || 'Pilot',
    employeeNumber: meta.employeeNumber,
    base: meta.base || 'YYZ',
    bidPeriod: meta.bidPeriod,
    days,
    pairings,
    rawText,
  };
}

// ─── Text extraction ──────────────────────────────────────────────────────────

async function extractAllText(file) {
  const pdfjsLib = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;

  const pages = [];
  const rawLines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent({ normalizeWhitespace: true });
    const vp = page.getViewport({ scale: 1 });
    const pageH = vp.height;

    // Collect items with flipped y (0 = top)
    const items = tc.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({
        str: i.str.trim(),
        x: Math.round(i.transform[4]),
        y: Math.round(pageH - i.transform[5]),
        w: Math.round(i.width),
        page: p,
      }));

    // Sort: top→bottom, left→right
    items.sort((a, b) => Math.abs(a.y - b.y) < 4 ? a.x - b.x : a.y - b.y);

    // Group into lines
    const lineMap = new Map();
    for (const item of items) {
      const bucket = [...lineMap.keys()].find(y => Math.abs(y - item.y) < 4);
      if (bucket !== undefined) {
        lineMap.get(bucket).push(item);
      } else {
        lineMap.set(item.y, [item]);
      }
    }

    const pageLines = [...lineMap.entries()]
      .sort(([ya], [yb]) => ya - yb)
      .map(([y, its]) => ({
        y,
        page: p,
        items: its.sort((a, b) => a.x - b.x),
        text: its.sort((a, b) => a.x - b.x).map(i => i.str).join(' '),
      }));

    pages.push(pageLines);
    rawLines.push(...pageLines);
  }

  return { pages, rawText: rawLines.map(l => l.text).join('\n') };
}

// ─── Meta parsing ─────────────────────────────────────────────────────────────

function parseMeta(pageLines) {
  let bidPeriod = null;
  let pilotName = null;
  let employeeNumber = null;
  let base = 'YYZ';

  for (const line of pageLines) {
    const t = line.text;

    // "Bid period: 2026-01-31 - 2026-03-01"
    let m = t.match(/Bid\s+period[:\s]+(\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})/i);
    if (m && !bidPeriod) {
      const [, startStr, endStr] = m;
      const [sy, sm, sd] = startStr.split('-').map(Number);
      const [ey, em, ed] = endStr.split('-').map(Number);
      bidPeriod = {
        startDate: new Date(sy, sm - 1, sd),
        endDate: new Date(ey, em - 1, ed), // day after last day (em is 1-indexed, JS months are 0-indexed)
        year: sm === 12 ? ey : (sm === 1 ? sy : sm === 2 ? sy : sy), // primary month year
        month: sm === 12 ? 1 : sm + 1, // main month (Feb for Jan31–Mar01)
        // Find the month that has the most days in the bid period
      };
      // Determine primary display month (the one with most days)
      const midDate = new Date((bidPeriod.startDate.getTime() + bidPeriod.endDate.getTime()) / 2);
      bidPeriod.month = midDate.getMonth() + 1;
      bidPeriod.year = midDate.getFullYear();
    }

    // Classic format: "BID PERIOD: OCT 01, 2025 - OCT 31, 2025"
    if (!bidPeriod) {
      m = t.match(/BID\s+PERIOD[:\s]+([A-Z]{3,9})\s+(\d{1,2})[\s,]+(\d{4})/i);
      if (m) {
        const month = MONTH_MAP[m[1].toUpperCase()];
        if (month) bidPeriod = {
          startDate: new Date(+m[3], month - 1, +m[2]),
          endDate: new Date(+m[3], month, 0),
          year: +m[3], month,
        };
      }
    }

    // Employee# and name: "214466  Roberts James (Ian)  CR: ..."
    if (!pilotName) {
      // Format: NUM  LastName FirstName (Nickname)
      m = t.match(/^(\d{5,8})\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+\([^)]+\))?)/);
      if (m) {
        employeeNumber = m[1];
        pilotName = formatPilotName(m[2]);
      }
    }

    // "PILOT: SMITH, JOHN" or "NAME: JOHN SMITH"
    if (!pilotName) {
      m = t.match(/(?:PILOT|NAME)[:\s]+([A-Za-z,\s\/()-]+?)(?:\s+(?:CR:|BLK:|BASE:|EMP))/i);
      if (m) pilotName = formatPilotName(m[1]);
    }

    // Base
    m = t.match(/BASE[:\s]+([A-Z]{3})/i);
    if (m) base = m[1].toUpperCase();
  }

  return { bidPeriod, pilotName, employeeNumber, base };
}

function formatPilotName(raw) {
  // "Roberts James (Ian)" → "James Roberts"
  const noNickname = raw.replace(/\s*\([^)]*\)/g, '').trim();
  const parts = noNickname.split(/[\s,\/]+/).filter(Boolean);
  if (parts.length >= 2) {
    // Check if first token looks like a surname (all caps or typical surname position)
    // Air Canada format: Lastname Firstname
    return `${titleCase(parts[1])} ${titleCase(parts[0])}`;
  }
  return titleCase(noNickname);
}

// ─── Horizontal strip parser ──────────────────────────────────────────────────

function parseStrip(pageLines, bidPeriod) {
  if (!bidPeriod) return null;

  // Find the DOW row (contains SA, SU, MO, TU, WE, TH, FR etc.)
  const DOW_SET = new Set(['SA','SU','MO','TU','WE','TH','FR','SAT','SUN','MON','TUE','WED','THU','FRI']);
  let dowRow = null;
  for (const line of pageLines) {
    const uppers = line.items.map(i => i.str.toUpperCase());
    const dowCount = uppers.filter(s => DOW_SET.has(s)).length;
    if (dowCount >= 5) { dowRow = line; break; }
  }
  if (!dowRow) return null;

  // Find the date row (just below DOW row, items are "01"–"31")
  let dateRow = null;
  for (const line of pageLines) {
    if (line.y <= dowRow.y) continue;
    if (Math.abs(line.y - dowRow.y) > 30) break;
    const nums = line.items.filter(i => /^\d{1,2}$/.test(i.str));
    if (nums.length >= 10) { dateRow = line; break; }
  }
  if (!dateRow) return null;

  // Build column map: x-position → actual Date
  // We sort date items by x and assign sequential dates from bidPeriod.startDate
  const sortedDateItems = [...dateRow.items]
    .filter(i => /^\d{1,2}$/.test(i.str))
    .sort((a, b) => a.x - b.x);

  const colMap = []; // [{x, date}]
  let cursor = new Date(bidPeriod.startDate);
  for (const item of sortedDateItems) {
    colMap.push({ x: item.x, date: new Date(cursor) });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Find named rows (Act, Lay, Rpt, Rel, Cred)
  // The row label can appear at the LEFT (February format) or RIGHT (October format)
  // of the row, so we scan all items in each line, not just the first.
  const namedRows = {};
  for (const line of pageLines) {
    if (line.y <= dateRow.y) continue;
    if (line.y > dateRow.y + 200) break;
    for (const item of line.items) {
      const label = item.str.toUpperCase().replace('.', '');
      for (const [key, aliases] of Object.entries(STRIP_ROW_LABELS)) {
        if (aliases.includes(label) && !namedRows[key]) {
          namedRows[key] = line;
        }
      }
    }
  }

  // Parse each named row into a map: date-key → value
  const act = parseStripRowToDateMap(namedRows.act, colMap, true); // keep dashes (continuation days)
  const lay = parseStripRowToDateMap(namedRows.lay, colMap);
  const rpt = parseStripRowToDateMap(namedRows.rpt, colMap);
  const rel = parseStripRowToDateMap(namedRows.rel, colMap);
  const cred = parseStripRowToDateMap(namedRows.cred, colMap);

  return { act, lay, rpt, rel, cred, colMap };
}

// Flat set of all strip row label strings for quick filtering
const ALL_STRIP_LABELS = new Set(
  Object.values(STRIP_ROW_LABELS).flat().map(s => s.toUpperCase())
);

function parseStripRowToDateMap(rowLine, colMap, includeDashes = false) {
  if (!rowLine || !colMap.length) return {};
  const result = {};
  for (const item of rowLine.items) {
    // Skip the row-label item itself (can be first OR last depending on PDF variant)
    if (ALL_STRIP_LABELS.has(item.str.toUpperCase().replace('.', ''))) continue;
    const nearest = findNearestCol(item.x, colMap);
    if (nearest) {
      const key = fmtDateKey(nearest);
      const val = item.str.trim();
      if (val && (includeDashes || (val !== '-' && val !== '—'))) {
        result[key] = val;
      }
    }
  }
  return result;
}

function findNearestCol(x, colMap) {
  let best = null, bestDist = Infinity;
  for (const col of colMap) {
    const d = Math.abs(x - col.x);
    if (d < bestDist) { bestDist = d; best = col.date; }
  }
  return bestDist < 20 ? best : null;
}

// ─── Detailed section parser ──────────────────────────────────────────────────

function parseDetailedSections(allLines) {
  const pairings = [];

  // Find pairing section starts: a line containing only a pairing code like "T1029"
  // preceded by "January"/"February" mini-calendar and DOW header
  // The pairing code label appears in the mini-calendar header area
  // Pattern from the PDF: {x:176, str:"T1029"} next to month names
  const PAIRING_CODE_RE = /^(?:T|t)(\d{3,5})$|^(\d{3,5})$/;

  // Collect all lines and look for pairing indicators
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const t = line.text.trim();

    // Look for a line that's just a pairing code, possibly combined with a month name
    // e.g. "T1029" in a line, or appearing alongside "January"/"February"
    // From our data: {"x":176,"y":498,"str":"T1029"} near {"x":30,"y":494,"str":"January"}
    const codeMatch = t.match(/\b(T\d{3,5})\b/);
    if (!codeMatch) continue;

    // Check if this looks like a pairing section header (not the summary strip)
    // Signals: nearby "Report" line, column headers (DAY, FLT#, etc.) within next 20 lines
    let hasReport = false;
    let hasColHeaders = false;
    let reportTime = null;

    for (let j = i + 1; j < Math.min(i + 25, allLines.length); j++) {
      const jt = allLines[j].text;
      if (/\bReport\b/i.test(jt)) { hasReport = true; }
      if (/\bDAY\b.*\bFLT#?\b/i.test(jt)) { hasColHeaders = true; }
      if (/\bRelease\b/i.test(jt)) break; // too far
    }

    if (!hasColHeaders) continue; // not a detailed section

    const code = codeMatch[1];

    // Find the Report time
    for (let j = i + 1; j < Math.min(i + 20, allLines.length); j++) {
      const jl = allLines[j];
      if (/\bReport\b/i.test(jl.text)) {
        const m = jl.text.match(/(\d{2}:\d{2}|\d{4})/);
        if (m) { reportTime = formatTime(m[1]); break; }
      }
    }

    // Find column header row to determine column x-positions
    let colHeaderLine = null;
    for (let j = i + 1; j < Math.min(i + 25, allLines.length); j++) {
      if (/\bDAY\b.*\bFLT#?\b/i.test(allLines[j].text)) {
        colHeaderLine = allLines[j]; break;
      }
    }

    // Parse legs + hotel until Release/summary line
    const legs = []; // { dayNum, fltNum, from, depTime, to, arrTime }
    const hotels = []; // { dayNum: (after dayNum), name, phone }
    let releaseTime = null;
    let creditHours = null;
    let lengthDays = null;
    let lastDayNum = null;
    let inLegSection = false;

    for (let j = i + 1; j < Math.min(i + 80, allLines.length); j++) {
      const jl = allLines[j];
      const jt = jl.text;

      // Column headers start the leg section
      if (/\bDAY\b.*\bFLT#?\b/i.test(jt)) { inLegSection = true; continue; }

      // Summary lines: check BEFORE the guard — they appear AFTER Release,
      // when inLegSection is already false.
      const lenM = jt.match(/Length\s*\(days\)[:\s]+(\d+)/i);
      if (lenM) lengthDays = +lenM[1];
      const credM = jt.match(/Credit[:\s]+([\dh:]+)/i);
      if (credM) creditHours = credM[1];

      // Skip content before the leg table header
      if (!inLegSection) continue;

      // Leg row: starts with day number, then flight#, from, dep, to, arr
      // From observed data: items have specific x positions (day≈213, flt≈253, from≈286, dep≈335, to≈371, arr≈420)
      const legRow = parseLegRow(jl);
      if (legRow) { legs.push(legRow); lastDayNum = legRow.dayNum; continue; }

      // Hotel line: "-------  Layover at HOTEL NAME (PHONE)  ------- 33h55 -------"
      if (/Layover\s+at\s+/i.test(jt)) {
        const nameMatch = jt.match(/Layover\s+at\s+(.+?)(?=\s*\(\d|\s*-{3,})/i);
        const phoneInline = jt.match(/\((\d[\d\s.\-()+]{7,14})\)/);
        const durationMatch = jt.match(/\b(\d+h\d+)\b/);
        if (nameMatch) {
          hotels.push({
            afterDayNum: lastDayNum,
            name: nameMatch[1].trim(),
            phone: phoneInline ? phoneInline[1] : null,
            duration: durationMatch ? durationMatch[1] : null,
          });
        }
        continue;
      }

      // Release line — stop accepting legs after this point
      if (/\bRelease\b/i.test(jt)) {
        const m = jt.match(/(\d{2}:\d{2}|\d{4})/);
        if (m) releaseTime = formatTime(m[1]);
        inLegSection = false;
        continue;
      }

      // Terminate if a new pairing section starts
      if (j > i + 5 && PAIRING_CODE_RE.test(jt.trim())) break;
    }

    if (legs.length > 0) {
      pairings.push({ code, reportTime, releaseTime, creditHours, lengthDays, legs, hotels });
    }
  }

  return pairings;
}

function parseLegRow(line) {
  // A leg row has items at specific x positions (consistent with the observed column widths)
  // Expected: day_num flt# from dep_time to arr_time [more columns]
  // From data: x≈213=dayNum, x≈253=flt, x≈286=from, x≈335=dep, x≈371=to, x≈420=arr
  const items = line.items;
  if (items.length < 5) return null;

  // Day number item (single digit at x ≈ 200-220)
  const dayItem = items.find(it => /^\d$/.test(it.str) && it.x >= 180 && it.x <= 235);
  if (!dayItem) return null;

  // Find flight# (3-4 digits)
  const fltItem = items.find(it => /^\d{3,4}$/.test(it.str) && it.x > dayItem.x);
  if (!fltItem) return null;

  // Collect remaining items after flt#
  const rest = items.filter(it => it.x > fltItem.x).sort((a, b) => a.x - b.x);

  // From airport (3 uppercase letters)
  const fromItem = rest.find(it => /^[A-Z]{3}$/.test(it.str));
  if (!fromItem) return null;

  // Times (HH:MM format)
  const timeItems = rest.filter(it => /^\d{2}:\d{2}$/.test(it.str));
  if (timeItems.length < 2) return null;

  // To airport (3 uppercase letters, after first time item)
  const toItem = rest.find(it => /^[A-Z]{3}$/.test(it.str) && it.x > fromItem.x);
  if (!toItem) return null;

  return {
    dayNum: +dayItem.str,
    fltNum: fltItem.str,
    from: fromItem.str,
    depTime: timeItems[0].str,
    to: toItem.str,
    arrTime: timeItems[1].str,
  };
}

// ─── Schedule builder ─────────────────────────────────────────────────────────

function buildSchedule(strip, detailedPairings, bidPeriod) {
  const days = {};
  const pairings = [];

  if (!bidPeriod) return { days, pairings };

  // Initialize every day in the bid period as 'off'
  const cur = new Date(bidPeriod.startDate);
  const end = new Date(bidPeriod.endDate);
  while (cur < end) {
    days[fmtDateKey(cur)] = { type: 'off' };
    cur.setDate(cur.getDate() + 1);
  }

  if (!strip) {
    // No strip — try to use detailed sections with explicit dates if available
    return { days, pairings: detailedPairings };
  }

  // ── Process Act row ────────────────────────────────────────────────────────
  // Group consecutive days by pairing code to find pairing ranges
  // Act map: dateKey → code string (or empty/'-' = off)
  const actByDate = strip.act; // { dateKey: code }

  // Find all unique pairing-code starts (in order of appearance)
  // A "start" is when a new non-dash code appears
  const pairingStarts = []; // { code, startDateKey, colIndex }
  const sortedActKeys = Object.keys(actByDate).sort();

  for (const dk of sortedActKeys) {
    const code = actByDate[dk];
    if (code && code !== '-' && code !== '—') {
      pairingStarts.push({ code, startDateKey: dk });
    }
  }

  // Track occurrences per code (for matching with detailed sections)
  const codeOccurrenceIndex = {};

  // Match each pairing start with a detailed section
  const detailedByCode = {}; // code → [pairingDetail, ...]
  for (const det of detailedPairings) {
    if (!detailedByCode[det.code]) detailedByCode[det.code] = [];
    detailedByCode[det.code].push(det);
  }

  for (const ps of pairingStarts) {
    const { code, startDateKey } = ps;

    // Off-type activities — mark explicitly then skip pairing logic
    // Numeric-only codes (341, 259, …) = AVO/VO vacation days in Air Canada schedules
    if (/^\d+$/.test(code)) {
      days[startDateKey] = { type: 'vacation' };
      continue;
    }
    // PBS_* codes = Preferential Bidding System buffer/reserve days — leave as 'off'
    if (/^PBS/i.test(code)) continue;

    // Get detailed data for this occurrence
    if (!codeOccurrenceIndex[code]) codeOccurrenceIndex[code] = 0;
    const detArr = detailedByCode[code] || [];
    const det = detArr[codeOccurrenceIndex[code]] || null;
    codeOccurrenceIndex[code]++;

    let lengthDays = det?.lengthDays || 0;
    if (!lengthDays) {
      // Fallback: count consecutive '-' entries in the Act row
      // (each '-' is a continuation day of the same pairing)
      lengthDays = 1;
      const sd = parseKey(startDateKey);
      for (let d = 1; d <= 14; d++) {
        const nx = new Date(sd);
        nx.setDate(nx.getDate() + d);
        const nk = fmtDateKey(nx);
        if (actByDate[nk] === '-' || actByDate[nk] === '—') {
          lengthDays++;
        } else {
          break;
        }
      }
    }
    const startDate = parseKey(startDateKey);

    // Build pairing days
    const pairingDays = [];
    for (let d = 0; d < lengthDays; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      const dk = fmtDateKey(dt);

      const dayLegs = det?.legs.filter(l => l.dayNum === d + 1) || [];
      const hotel = det?.hotels.find(h => h.afterDayNum === d + 1) || null;
      const isLastDay = d === lengthDays - 1;

      pairingDays.push({
        dayNum: d + 1,
        date: dk,
        legs: dayLegs,
        hotel: hotel ? { name: hotel.name, phone: hotel.phone, duration: hotel.duration || null } : null,
      });

      const mainDest = getMainDest(dayLegs, hotel, strip.lay?.[dk]);
      const isTraining = /TRNG|TRAIN|SIM|GND/i.test(code);
      const type = isTraining ? 'training' : (hotel ? 'layover' : (isLastDay ? 'flying' : 'layover'));

      days[dk] = {
        type,
        pairingCode: code,
        dayNum: d + 1,
        totalDays: lengthDays,
        legs: dayLegs,
        hotel: hotel ? { name: hotel.name, phone: hotel.phone, duration: hotel.duration || null } : null,
        reportTime: d === 0 ? (det?.reportTime || strip.rpt?.[dk] || null) : null,
        releaseTime: isLastDay ? (det?.releaseTime || strip.rel?.[dk] || null) : null,
        creditHours: isLastDay ? (det?.creditHours || strip.cred?.[startDateKey] || null) : null,
        mainDestination: mainDest,
        layoverCity: strip.lay?.[dk] || null,
      };
    }

    pairings.push({
      code,
      startDate: startDateKey,
      reportTime: det?.reportTime || null,
      releaseTime: det?.releaseTime || null,
      creditHours: det?.creditHours || null,
      lengthDays,
      days: pairingDays,
    });
  }

  return { days, pairings };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMainDest(legs, hotel, layAirport) {
  if (layAirport) return layAirport;
  if (hotel) {
    // Try to get city from hotel name (last word before phone)
    return null; // will resolve from legs
  }
  if (legs && legs.length > 0) return legs[legs.length - 1].to;
  return null;
}

function formatTime(raw) {
  if (!raw) return null;
  const s = raw.replace(/\s/g, '');
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2)}`;
  if (/^\d{3}$/.test(s)) return `0${s[0]}:${s.slice(1)}`;
  return s;
}

function fmtDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function titleCase(str) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
