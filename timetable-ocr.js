// =====================
// StudySync – timetable-ocr.js
// OCR pipeline: image/PDF → raw text → structured classes
// Specialised for the Australian school timetable format:
//   Columns: Mon A, Tue A, Wed A, Thu A, Fri A, Mon B, Tue B, Wed B, Thu B, Fri B
//   Rows: Before School, Period 1, Period 2, Recess, Period 3, Period 4,
//         Lunch, Contact, Period 5, After School, Period 3 (cont)
//   Each cell: Subject name / Teacher name / Room code
// =====================

// ── Subject colour palette ────────────────────────────────────────────────
const SUBJECT_COLOURS = [
  '#7c3aed','#0d9488','#d97706','#dc2626','#2563eb',
  '#db2777','#16a34a','#ea580c','#0891b2','#65a30d',
  '#9333ea','#0369a1','#b45309','#be123c','#047857',
];
const subjectColourMap = {};
let colourIndex = 0;

function getSubjectColour(subject) {
  const key = normaliseSubject(subject);
  if (!subjectColourMap[key]) {
    subjectColourMap[key] = SUBJECT_COLOURS[colourIndex % SUBJECT_COLOURS.length];
    colourIndex++;
  }
  return subjectColourMap[key];
}

// ── Normalisation helpers ─────────────────────────────────────────────────

function normaliseSubject(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function titleCase(s) {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function parseTimeToMins(s) {
  if (!s) return 0;
  s = s.trim().toLowerCase().replace(/\./g, ':');
  const isPm = s.includes('pm');
  s = s.replace(/[apm\s]/g, '');
  let h, m;
  if (s.includes(':')) {
    [h, m] = s.split(':').map(Number);
  } else if (s.length <= 2) {
    h = Number(s); m = 0;
  } else {
    h = Number(s.slice(0, -2)); m = Number(s.slice(-2));
  }
  if (isPm && h !== 12) h += 12;
  return h * 60 + (m || 0);
}

function minsToTime(mins) {
  return `${Math.floor(mins/60).toString().padStart(2,'0')}:${(mins%60).toString().padStart(2,'0')}`;
}

function formatTimeRange(s, e) {
  return `${minsToTime(s)} - ${minsToTime(e)}`;
}

// ── Known time slots for this timetable format ────────────────────────────
// These are the fixed periods used in Australian school timetables like yours
const KNOWN_PERIODS = [
  { label: 'Period 1',      start: '8:25',  end: '9:25',   include: true  },
  { label: 'Period 2',      start: '9:30',  end: '10:30',  include: true  },
  { label: 'Recess',        start: '10:30', end: '10:50',  include: false },
  { label: 'Period 3',      start: '10:55', end: '11:55',  include: true  },
  { label: 'Period 4',      start: '12:00', end: '13:00',  include: true  },
  { label: 'Lunch',         start: '13:00', end: '13:30',  include: false },
  { label: 'Contact',       start: '13:05', end: '13:30',  include: false },
  { label: 'Period 5',      start: '14:15', end: '15:15',  include: true  },
];

// ── Room code detection ───────────────────────────────────────────────────
// Matches: A103, MO321, KCC207, GYM1, LG4, AGC102, JWB106, R33 etc.
const ROOM_RE = /\b([A-Z]{1,4}\d{1,4}|GYM\s*\d*|HALL|LIBRARY|THEATRE|OVAL|COURT|CANTEEN|STAFFROOM)\b/gi;

function extractRooms(text) {
  const found = [];
  let m;
  ROOM_RE.lastIndex = 0;
  while ((m = ROOM_RE.exec(text)) !== null) {
    found.push(m[0].trim().toUpperCase());
  }
  return found;
}

// ── Teacher name detection ────────────────────────────────────────────────
// Format in your timetable: "Firstname Lastname" or just a surname after subject
// Also catches "Solomonides A", "Evans G", "Raymond M" (surname + initial)
const TEACHER_SURNAME_INITIAL_RE = /\b([A-Z][a-z]{2,})\s+([A-Z])\b/g;
const TEACHER_TITLE_RE = /\b(Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+([A-Z][a-z]+)\b/gi;

function extractTeacher(lines) {
  // Try title first
  const full = lines.join(' ');
  TEACHER_TITLE_RE.lastIndex = 0;
  const t = TEACHER_TITLE_RE.exec(full);
  if (t) return titleCase(t[0]);

  // Try "Surname Initial" pattern (e.g. "Ekanayake P", "Raymond M")
  TEACHER_SURNAME_INITIAL_RE.lastIndex = 0;
  const si = TEACHER_SURNAME_INITIAL_RE.exec(full);
  if (si) return `${titleCase(si[1])} ${si[2]}`;

  return '';
}

// ── Subject name detection ────────────────────────────────────────────────
// Your timetable uses "8 SubjectName" prefix — the 8 means Year 8
// We strip year prefix and treat rest as subject
const YEAR_PREFIX_RE = /^\d+\s+/;

// Known subjects specific to your timetable
const KNOWN_SUBJECTS = [
  'English','Maths','Mathematics','Science','History','Geography',
  'Chinese','Visual Arts','Music','PDHPE','Technology','Religion',
  'Sport','Assembly','Mentor','Year Meeting',
  'JAPAC','History dV','Science dV','Maths',
];

function cleanSubjectName(raw) {
  // Strip year prefix like "8 " or "B "
  let s = raw.replace(/^[8B]\s+/, '').trim();
  // Remove room codes from subject
  s = s.replace(ROOM_RE, '').trim();
  // Trim trailing teacher initial
  s = s.replace(/\s+[A-Z]$/, '').trim();
  return s || raw;
}

// ── The core cell parser ──────────────────────────────────────────────────
// Each timetable cell contains 1–3 lines:
//   Line 1: "8 SubjectName" (subject, possibly with year prefix)
//   Line 2: Teacher name or "Surname Initial"
//   Line 3: Room code (e.g. MO321, A103)
// Sometimes lines 2+3 are merged or missing

function parseCell(cellText) {
  if (!cellText || cellText.trim().length < 2) return null;

  // Split by newlines and clean up
  const lines = cellText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return null;

  // Skip non-class slots
  const skip = /^(recess|lunch|contact|after school|before school|assembly\s*$)/i;
  if (skip.test(lines[0])) return null;

  // Extract rooms from all lines
  const rooms = extractRooms(cellText);
  const room  = rooms[0] || '';

  // Extract teacher
  const teacher = extractTeacher(lines);

  // Subject: usually first line, strip year prefix
  let subject = cleanSubjectName(lines[0]);

  // If subject looks like just a room code or initials, try line 2
  if (subject.length <= 3 || /^\d+$/.test(subject)) {
    subject = lines[1] ? cleanSubjectName(lines[1]) : subject;
  }

  // Final clean: remove room code if it crept in
  subject = subject.replace(new RegExp(room, 'gi'), '').trim();

  return {
    subject: subject || 'Unknown',
    teacher,
    room,
  };
}

// ── Main format-specific parser ───────────────────────────────────────────
// This parser is built specifically for the 10-column (5 days × 2 weeks) format

function parseAustralianTimetable(rawText) {
  const lines = rawText.split('\n').map(l => l.trim());
  const classes = [];
  let nextId = 1000;

  // Strategy: find period labels, then extract what follows for each day column
  // The OCR output from this format tends to come out column-by-column or row-by-row

  // First detect which days and weeks are present
  const weekADays = [];
  const weekBDays = [];

  for (const line of lines) {
    if (/monday\s*a/i.test(line))    weekADays[0] = 'Monday';
    if (/tuesday\s*a/i.test(line))   weekADays[1] = 'Tuesday';
    if (/wednesday\s*a/i.test(line)) weekADays[2] = 'Wednesday';
    if (/thursday\s*a/i.test(line))  weekADays[3] = 'Thursday';
    if (/friday\s*a/i.test(line))    weekADays[4] = 'Friday';
    if (/monday\s*b/i.test(line))    weekBDays[0] = 'Monday';
    if (/tuesday\s*b/i.test(line))   weekBDays[1] = 'Tuesday';
    if (/wednesday\s*b/i.test(line)) weekBDays[2] = 'Wednesday';
    if (/thursday\s*b/i.test(line))  weekBDays[3] = 'Thursday';
    if (/friday\s*b/i.test(line))    weekBDays[4] = 'Friday';
  }

  // Find period boundary lines (lines that contain a time range)
  // Build segments between period markers
  const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/;

  // Build a map: periodLabel → [cell text per column]
  const segments = []; // { periodLabel, startMins, endMins, columnTexts[] }
  let currentPeriod = null;
  let currentBuffer = [];

  const PERIOD_LABEL_RE = /^(Period\s*\d|Before School|After School|Recess|Lunch|Contact)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const periodMatch = PERIOD_LABEL_RE.exec(line);
    const timeMatch   = TIME_RANGE_RE.exec(line);

    if (periodMatch && timeMatch) {
      // Save previous segment
      if (currentPeriod) {
        segments.push({ ...currentPeriod, lines: [...currentBuffer] });
      }
      const startMins = parseTimeToMins(timeMatch[1]);
      const endMins   = parseTimeToMins(timeMatch[2]);
      currentPeriod = {
        label:     periodMatch[1],
        startMins,
        endMins,
        time:      formatTimeRange(startMins, endMins),
      };
      currentBuffer = [];
    } else if (currentPeriod) {
      currentBuffer.push(line);
    }
  }
  if (currentPeriod) {
    segments.push({ ...currentPeriod, lines: [...currentBuffer] });
  }

  // For each segment that's a real class period, parse cells
  const CLASS_PERIODS = /^Period\s*[1-5]/i;
  const allDays = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

  for (const seg of segments) {
    if (!CLASS_PERIODS.test(seg.label)) continue;

    // The lines in this segment are the cell contents for each day column
    // Try to split them into 5 (week A) or 10 (A+B) chunks
    const cellTexts = splitIntoCells(seg.lines, weekBDays.some(Boolean) ? 10 : 5);

    cellTexts.forEach((cellText, colIdx) => {
      const parsed = parseCell(cellText);
      if (!parsed) return;
      if (!parsed.subject || parsed.subject === 'Unknown') return;

      const isWeekB = colIdx >= 5;
      const dayIdx  = colIdx % 5;
      const day     = allDays[dayIdx];
      const week    = isWeekB ? 'B' : 'A';

      classes.push({
        id:        nextId++,
        subject:   parsed.subject,
        day,
        time:      seg.time,
        startMins: seg.startMins,
        endMins:   seg.endMins,
        room:      parsed.room,
        teacher:   parsed.teacher,
        colour:    getSubjectColour(parsed.subject),
        week,
        confidence: 'high',
      });
    });
  }

  // If structured parsing found nothing, fall back to the generic parser
  if (classes.length === 0) {
    return parseGenericFallback(lines);
  }

  return deduplicateAndSort(classes);
}

// Split a flat array of lines into N roughly-equal cell chunks
function splitIntoCells(lines, numCells) {
  if (lines.length === 0) return Array(numCells).fill('');
  const chunkSize = Math.max(1, Math.round(lines.length / numCells));
  const cells = [];
  for (let i = 0; i < numCells; i++) {
    const chunk = lines.slice(i * chunkSize, (i + 1) * chunkSize);
    cells.push(chunk.join('\n'));
  }
  return cells;
}

// ── Generic fallback parser ───────────────────────────────────────────────
// Used when the structured parser finds nothing
// Falls back to the original day-by-day line scanning

function parseGenericFallback(lines) {
  const classes = [];
  let nextId = 2000;
  let currentDay  = null;
  let currentWeek = 'A';

  const DAY_PATTERNS = {
    Monday:    /\b(mon(day)?)\b/i,
    Tuesday:   /\b(tue(sday)?|tues)\b/i,
    Wednesday: /\b(wed(nesday)?)\b/i,
    Thursday:  /\b(thu(rsday)?|thur|thurs)\b/i,
    Friday:    /\b(fri(day)?)\b/i,
  };

  const TIME_RANGE_RE_G = /(\d{1,2}[:.]\d{2})\s*[-–]\s*(\d{1,2}[:.]\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect week
    if (/\bweek\s*a\b|\b[A-Z]\s*week\b/i.test(line) && /a/i.test(line)) currentWeek = 'A';
    if (/\bweek\s*b\b/i.test(line)) currentWeek = 'B';

    // Detect day
    for (const [day, pat] of Object.entries(DAY_PATTERNS)) {
      if (pat.test(line)) { currentDay = day; break; }
    }

    if (!currentDay) continue;

    const timeMatch = TIME_RANGE_RE_G.exec(line);
    if (!timeMatch) continue;

    const startMins = parseTimeToMins(timeMatch[1]);
    const endMins   = parseTimeToMins(timeMatch[2]);
    if (startMins >= endMins || startMins < 6*60) continue;

    // Look ahead for subject
    const context = lines.slice(i, i + 5).join('\n');
    const cell    = parseCell(context);
    if (!cell) continue;

    classes.push({
      id:        nextId++,
      subject:   cell.subject,
      day:       currentDay,
      time:      formatTimeRange(startMins, endMins),
      startMins,
      endMins,
      room:      cell.room,
      teacher:   cell.teacher,
      colour:    getSubjectColour(cell.subject),
      week:      currentWeek,
      confidence: 'medium',
    });
  }

  return deduplicateAndSort(classes);
}

// ── Conflict detector ─────────────────────────────────────────────────────

function detectConflicts(classes) {
  const conflicts = [];
  const byDayWeek = {};
  for (const c of classes) {
    const key = `${c.week||'A'}-${c.day}`;
    if (!byDayWeek[key]) byDayWeek[key] = [];
    byDayWeek[key].push(c);
  }
  for (const dayClasses of Object.values(byDayWeek)) {
    for (let i = 0; i < dayClasses.length; i++) {
      for (let j = i + 1; j < dayClasses.length; j++) {
        const a = dayClasses[i], b = dayClasses[j];
        if (a.startMins < b.endMins && b.startMins < a.endMins) {
          conflicts.push({ day: a.day, week: a.week, a: a.subject, b: b.subject });
        }
      }
    }
  }
  return conflicts;
}

function deduplicateAndSort(classes) {
  const seen = new Set();
  const unique = classes.filter(c => {
    const key = `${c.week||'A'}|${c.day}|${c.time}|${normaliseSubject(c.subject)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  return unique.sort((a, b) => {
    const wDiff = (a.week||'A').localeCompare(b.week||'A');
    if (wDiff !== 0) return wDiff;
    const dDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    if (dDiff !== 0) return dDiff;
    return (a.startMins||0) - (b.startMins||0);
  });
}

// ── OCR runner ────────────────────────────────────────────────────────────

async function runOCR(file) {
  return new Promise((resolve, reject) => {
    if (typeof Tesseract === 'undefined') {
      reject(new Error('Tesseract not loaded'));
      return;
    }
    Tesseract.recognize(file, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          const bar = document.getElementById('ocr-progress-bar');
          const lbl = document.getElementById('ocr-progress-label');
          if (bar) bar.style.width = pct + '%';
          if (lbl) lbl.textContent = `Reading image… ${pct}%`;
        }
      }
    }).then(r => resolve(r.data.text)).catch(reject);
  });
}

// Decides which top-level parser to run
function parseOCRText(rawText) {
  // Check if this looks like the Australian A/B week column format
  const hasWeekAB = /monday\s*[ab]/i.test(rawText) || /week\s*[ab]/i.test(rawText) ||
                    (/period\s*1/i.test(rawText) && /period\s*2/i.test(rawText));

  if (hasWeekAB) {
    const result = parseAustralianTimetable(rawText);
    if (result.length > 0) return result;
  }

  // Fallback to generic
  return parseGenericFallback(rawText.split('\n'));
}

// ── Wizard state ──────────────────────────────────────────────────────────

let ocrWizardState = {
  step: 'upload',
  rawText: '',
  parsedClasses: [],
  imageDataUrl: null,
  _uploadingWeek: null,
};

// ── Wizard UI ─────────────────────────────────────────────────────────────

function showSetupWizard() {
  document.getElementById('setupWizard').style.display = 'flex';
  renderWizardStep('upload');
}

function hideSetupWizard() {
  document.getElementById('setupWizard').style.display = 'none';
}

function renderWizardStep(step) {
  ocrWizardState.step = step;
  const content = document.getElementById('wizardContent');

  if (step === 'upload') {
    const uploadingWeek = ocrWizardState._uploadingWeek;
    const weekLabel = uploadingWeek && state.abWeekEnabled ? ` — Week ${uploadingWeek}` : '';
    const showABTip = !state.abWeekEnabled;

    content.innerHTML = `
      <div class="wiz-icon">📅</div>
      <div class="wiz-title">Set up your timetable${weekLabel}</div>
      <div class="wiz-sub">
        Upload a photo or screenshot of your school timetable.<br>
        The app will read it and build your schedule automatically.
      </div>
      ${showABTip ? `<div class="wiz-tip">💡 Your timetable has A and B weeks? Enable A/B weeks in Settings first, then upload each week separately.</div>` : ''}
      <label class="upload-zone" id="uploadZone">
        <i class="ti ti-upload"></i>
        <span>Click to upload or drag & drop</span>
        <span class="upload-hint">JPG, PNG, WebP, PDF supported</span>
        <input type="file" id="ttFile" accept="image/*,.pdf" style="display:none"
          onchange="handleTTUpload(this.files[0])">
      </label>
      <div class="wiz-skip">
        <button class="wiz-skip-btn" onclick="skipToManual()">Set up manually instead →</button>
      </div>`;

    setTimeout(() => {
      const zone = document.getElementById('uploadZone');
      if (!zone) return;
      zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleTTUpload(file);
      });
    }, 50);
  }

  else if (step === 'scanning') {
    content.innerHTML = `
      <div class="wiz-icon">🔍</div>
      <div class="wiz-title">Reading your timetable…</div>
      <div class="wiz-sub">Scanning for classes, times, rooms and teachers. This takes about 20–40 seconds.</div>
      <div class="ocr-progress-wrap">
        <div class="ocr-progress-track">
          <div class="ocr-progress-bar" id="ocr-progress-bar"></div>
        </div>
        <div class="ocr-progress-label" id="ocr-progress-label">Starting…</div>
      </div>`;
  }

  else if (step === 'review') {
    const classes   = ocrWizardState.parsedClasses;
    const conflicts = detectConflicts(classes);
    const days      = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

    // Group by week
    const weeksPresent = [...new Set(classes.map(c => c.week || 'A'))].sort();
    const showWeekTabs = weeksPresent.length > 1;
    const activeTab    = ocrWizardState._reviewWeekTab || weeksPresent[0] || 'A';

    content.innerHTML = `
      <div class="wiz-title">Review your timetable</div>
      <div class="wiz-sub">We found <strong>${classes.length}</strong> classes. Fix anything wrong, then confirm.</div>
      ${conflicts.length > 0 ? `<div class="wiz-warning">⚠️ ${conflicts.length} time conflict${conflicts.length>1?'s':''} detected — check highlighted rows</div>` : ''}

      ${showWeekTabs ? `
        <div class="review-week-tabs">
          ${weeksPresent.map(w => `
            <button class="review-week-tab${w===activeTab?' active':''}" onclick="switchReviewTab('${w}')">
              Week ${w} <span class="review-tab-count">${classes.filter(c=>(c.week||'A')===w).length}</span>
            </button>`).join('')}
        </div>` : ''}

      <div class="review-days" id="reviewDays">
        ${days.map(day => {
          const dc = classes.filter(c => c.day === day && (c.week||'A') === activeTab);
          return `
            <div class="review-day">
              <div class="review-day-head">${day}
                <span class="review-day-count">${dc.length}</span>
                <button class="review-add-btn" onclick="addReviewClass('${day}','${activeTab}')">
                  <i class="ti ti-plus"></i> Add
                </button>
              </div>
              ${dc.length === 0
                ? `<div class="review-empty">No classes — <button class="link-btn" onclick="addReviewClass('${day}','${activeTab}')">add one</button></div>`
                : dc.map(c => renderReviewClass(c, conflicts)).join('')}
            </div>`;
        }).join('')}
      </div>
      <div class="wiz-actions">
        <button class="btn btn-ghost" onclick="renderWizardStep('upload')">← Re-upload</button>
        <button class="btn btn-primary" onclick="confirmTimetable()">Confirm timetable ✓</button>
      </div>`;
  }
}

function switchReviewTab(week) {
  ocrWizardState._reviewWeekTab = week;
  renderWizardStep('review');
}

function renderReviewClass(c, conflicts) {
  const hasConflict = conflicts.some(cf =>
    cf.day === c.day && cf.week === (c.week||'A') && (cf.a === c.subject || cf.b === c.subject)
  );
  const allSubjects = [...new Set(ocrWizardState.parsedClasses.map(x => x.subject))].sort();
  const subjectOpts = allSubjects.map(s =>
    `<option value="${s}" ${s===c.subject?'selected':''}>${s}</option>`
  ).join('');

  return `
    <div class="review-class${hasConflict?' conflict':''}" data-id="${c.id}">
      <div class="review-class-colour" style="background:${c.colour}"></div>
      <div class="review-class-fields">
        <div class="review-row">
          <select class="review-input review-subj"
            onchange="updateReviewClass(${c.id},'subject',this.value)">
            ${subjectOpts}
            <option value="__custom__">+ Custom subject…</option>
          </select>
          <input class="review-input review-time" value="${c.time}"
            placeholder="08:25 - 09:25"
            onchange="updateReviewClass(${c.id},'time',this.value)">
        </div>
        <div class="review-row">
          <input class="review-input" value="${c.room}" placeholder="Room (e.g. MO321)"
            onchange="updateReviewClass(${c.id},'room',this.value)">
          <input class="review-input" value="${c.teacher}" placeholder="Teacher"
            onchange="updateReviewClass(${c.id},'teacher',this.value)">
        </div>
      </div>
      <button class="review-delete" onclick="deleteReviewClass(${c.id})"
        title="Remove"><i class="ti ti-trash"></i></button>
    </div>`;
}

function updateReviewClass(id, field, value) {
  const c = ocrWizardState.parsedClasses.find(x => x.id === id);
  if (!c) return;
  if (field === 'subject' && value === '__custom__') {
    const custom = prompt('Enter subject name:');
    if (custom) { c.subject = titleCase(custom); c.colour = getSubjectColour(custom); }
  } else {
    c[field] = value;
    if (field === 'subject') c.colour = getSubjectColour(value);
    if (field === 'time') {
      const m = c.time.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (m) { c.startMins = parseTimeToMins(m[1]); c.endMins = parseTimeToMins(m[2]); }
    }
  }
  const conflicts = detectConflicts(ocrWizardState.parsedClasses);
  document.querySelectorAll('.review-class').forEach(el => {
    const cid = Number(el.dataset.id);
    const cls = ocrWizardState.parsedClasses.find(x => x.id === cid);
    if (!cls) return;
    const bad = conflicts.some(cf =>
      cf.day === cls.day && cf.week === (cls.week||'A') && (cf.a === cls.subject || cf.b === cls.subject)
    );
    el.classList.toggle('conflict', bad);
  });
}

function deleteReviewClass(id) {
  ocrWizardState.parsedClasses = ocrWizardState.parsedClasses.filter(x => x.id !== id);
  renderWizardStep('review');
}

let _addClassId = 9000;
function addReviewClass(day, week) {
  ocrWizardState.parsedClasses.push({
    id: _addClassId++,
    subject: 'New Class',
    day,
    time: '08:25 - 09:25',
    startMins: 505,
    endMins:   565,
    room: '',
    teacher: '',
    colour: getSubjectColour('New Class'),
    week: week || 'A',
    confidence: 'manual',
  });
  renderWizardStep('review');
}

async function handleTTUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    ocrWizardState.imageDataUrl = e.target.result;
    renderWizardStep('scanning');
    try {
      const rawText = await runOCR(file);
      ocrWizardState.rawText = rawText;
      const parsed = parseOCRText(rawText);
      ocrWizardState.parsedClasses = parsed;

      if (parsed.length === 0) {
        document.getElementById('wizardContent').innerHTML = `
          <div class="wiz-icon">😕</div>
          <div class="wiz-title">Couldn't read the timetable</div>
          <div class="wiz-sub">The image wasn't clear enough. Try a clearer photo or higher-resolution screenshot, or set up manually.</div>
          <div class="wiz-actions">
            <button class="btn btn-ghost" onclick="renderWizardStep('upload')">Try another image</button>
            <button class="btn btn-primary" onclick="skipToManual()">Set up manually</button>
          </div>`;
        return;
      }
      renderWizardStep('review');
    } catch (err) {
      console.error('OCR error:', err);
      renderWizardStep('upload');
    }
  };
  reader.readAsDataURL(file);
}

function skipToManual() {
  ocrWizardState.parsedClasses = [];
  renderWizardStep('review');
}

function confirmTimetable() {
  const classes = ocrWizardState.parsedClasses.map(c => ({
    id:      c.id,
    subject: c.subject,
    day:     c.day,
    time:    c.time,
    room:    c.room || '',
    teacher: c.teacher || '',
    colour:  c.colour,
    week:    c.week || 'A',
  }));

  const targetWeek = ocrWizardState._uploadingWeek;

  // If the OCR found both weeks automatically, save both at once
  const weeksFound = [...new Set(classes.map(c => c.week))];
  if (weeksFound.includes('A') && weeksFound.includes('B') && !targetWeek) {
    state.classesA     = classes.filter(c => c.week === 'A');
    state.classesB     = classes.filter(c => c.week === 'B');
    state.classes      = state.classesA;
    state.abWeekEnabled = true;
    if (!state.termStartWeek) state.termStartWeek = 'A';
    if (!state.currentWeek)   state.currentWeek   = 'A';
  } else if (targetWeek === 'B') {
    state.classesB = classes.filter(c => c.week === 'B' || c.week === targetWeek);
  } else {
    state.classesA = classes.filter(c => c.week === 'A' || !c.week);
    state.classes  = state.classesA;
  }

  state.hasCompletedSetup     = true;
  ocrWizardState._uploadingWeek  = null;
  ocrWizardState._reviewWeekTab  = null;

  saveState();
  hideSetupWizard();
  render();
  if (typeof renderSettings === 'function') renderSettings();
}
