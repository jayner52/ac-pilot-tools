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

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (line.page === 1) continue; // strip is on page 1; pairing sections are always pages 2+

    // Anchor on the column header row — the unambiguous start of a leg table
    if (!/\bDAY\b.*\bFLT#?\b/i.test(line.text)) continue;

    // Look backward on the SAME page for the pairing T-code and report time.
    // Use item-level detection so multi-T-code mini-calendar lines (cross-refs) are skipped.
    // Only a line with exactly ONE unique T-code item is the standalone heading.
    let code = null;
    let reportTime = null;
    for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
      if (allLines[j].page !== line.page) break; // don't cross page boundaries
      const jl = allLines[j];
      const jt = jl.text;

      // T-code: accept only lines whose items contain exactly one unique T-code.
      // Lines with 2+ T-code items are mini-calendar cross-refs — skip them.
      const tCodeItems = jl.items.filter(it => /^T\d{3,5}[A-Z]?$/.test(it.str));
      const uniqueCodes = [...new Set(tCodeItems.map(it => it.str))];
      if (uniqueCodes.length === 1) {
        code = uniqueCodes[0]; // overwrite — loop finishes so topmost single-code line wins
      }

      // Report time: first match (nearest to column header) is correct
      if (!reportTime) {
        const rm = jt.match(/\bReport\b.*?(\d{2}:\d{2}|\d{4})/i);
        if (rm) reportTime = formatTime(rm[1]);
      }
    }

    // DEBUG: log what T-code items were seen in the backward scan
    { const dbg = []; for (let j2 = i - 1; j2 >= Math.max(0, i - 30); j2--) { if (allLines[j2].page !== line.page) break; const tc = allLines[j2].items.filter(it => /^T\d{3,5}[A-Z]?$/.test(it.str)); if (tc.length) dbg.push(`  y=${allLines[j2].y} items=[${allLines[j2].items.map(it=>it.str+'@x'+it.x).join(' | ')}]`); } console.log(`[PDF] page=${line.page} anchor="${line.text.slice(0,40)}" → code=${code}\n${dbg.join('\n')}`); }

    if (!code) continue; // no unambiguous heading found — skip section

    // Collect legs, hotels, release, and summary going forward
    const legs = [];
    const hotels = [];
    let releaseTime = null;
    let creditHours = null;
    let lengthDays = null;
    let lastDayNum = null;
    let released = false;

    for (let j = i + 1; j < Math.min(i + 100, allLines.length); j++) {
      const jl = allLines[j];
      const jt = jl.text;

      // Summary data — collect regardless of released state
      const lenM = jt.match(/Length\s*\(days\)[:\s]+(\d+)/i);
      if (lenM) lengthDays = +lenM[1];
      const credM = jt.match(/Credit[:\s]+([\dh:]+)/i);
      if (credM) creditHours = credM[1];

      if (released) {
        // After release: stop when hitting next section's column header
        if (/\bDAY\b.*\bFLT#?\b/i.test(jt)) break;
        continue;
      }

      // Leg row
      const legRow = parseLegRow(jl);
      if (legRow) { legs.push(legRow); lastDayNum = legRow.dayNum; continue; }

      // Hotel/layover line
      if (/\bLayover\b/i.test(jt) && /-{3,}/.test(jt)) {
        const nameMatch = jt.match(/Layover\s+at\s+(.+?)(?=\s*\(\d|\s*-{3,})/i);
        let phoneM = jt.match(/\((\d[\d\s.\-()+]{7,14})\)/);
        if (!phoneM && j + 1 < allLines.length) {
          phoneM = allLines[j + 1].text.match(/^\s*\((\d[\d\s.\-()+]{7,14})\)/);
        }
        const durationMatch = jt.match(/\b(\d+h\d+)\b/);
        hotels.push({
          afterDayNum: lastDayNum,
          name: nameMatch ? nameMatch[1].trim() : null,
          phone: phoneM ? phoneM[1] : null,
          duration: durationMatch ? durationMatch[1] : null,
        });
        continue;
      }

      // Release line
      if (/\bRelease\b/i.test(jt)) {
        const m = jt.match(/(\d{2}:\d{2}|\d{4})/);
        if (m) releaseTime = formatTime(m[1]);
        released = true;
        continue;
      }

      // Safeguard: new column header before release → next section starting, stop
      if (/\bDAY\b.*\bFLT#?\b/i.test(jt)) break;
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

  // Find flight# (3-4 digits, or DH_XXXX deadhead)
  const fltItem = items.find(it => /^\d{3,4}$|^DH_\d+$/i.test(it.str) && it.x > dayItem.x);
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
    deadhead: /^DH_/i.test(fltItem.str),
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
    const rawCode = actByDate[dk];
    if (!rawCode || rawCode === '-' || rawCode === '—') continue;
    const code = rawCode.replace(/^>/, ''); // strip carryover '>' prefix
    pairingStarts.push({ code, startDateKey: dk });
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
    // Numeric-only codes (341, 259, …) = AVO/VO vacation days in Air Canada schedules.
    // Propagate through consecutive dash-continuation days (e.g. 341 then - - -).
    if (/^\d+$/.test(code)) {
      const sd = parseKey(startDateKey);
      let numVacDays = 1;
      for (let d = 1; d <= 60; d++) {
        const nx = new Date(sd);
        nx.setDate(nx.getDate() + d);
        const nk = fmtDateKey(nx);
        if (actByDate[nk] === '-' || actByDate[nk] === '—') numVacDays++;
        else break;
      }
      for (let d = 0; d < numVacDays; d++) {
        const dt = new Date(sd);
        dt.setDate(dt.getDate() + d);
        days[fmtDateKey(dt)] = { type: 'vacation' };
      }
      continue;
    }
    // PBS_* codes = Preferential Bidding System vacation allocation — mark as vacation
    if (/^PBS/i.test(code)) { days[startDateKey] = { type: 'vacation' }; continue; }
    // SDO = Scheduled Day Off — leave as 'off'
    if (/^SDO$/i.test(code)) continue;

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
        layoverCity: (type !== 'flying') ? (strip.lay?.[dk] || null) : null,
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
  if (legs && legs.length > 0) {
    if (hotel) {
      // Layover night: last leg puts us at the overnight city
      return legs[legs.length - 1].to;
    }
    // Flying day (no overnight): show the last place visited before heading home.
    // For a 2-leg day trip [A→B, B→A]: legs[last].from = B (turnaround).
    // For a single outbound leg: legs[0].to.
    return legs.length >= 2 ? legs[legs.length - 1].from : legs[0].to;
  }
  // No leg data (strip-only fallback): use the Lay strip value
  if (layAirport) return layAirport;
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
