// =====================
// StudySync – timetable-ocr.js
// OCR pipeline: image → raw text → structured classes
// Uses Tesseract.js (loaded via CDN in index.html)
// =====================

// ── Subject colour palette ─────────────────────────────────────────────────
const SUBJECT_COLOURS = [
  '#7c3aed','#0d9488','#d97706','#dc2626','#2563eb',
  '#db2777','#16a34a','#ea580c','#7c3aed','#0891b2',
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

// ── Normalisation helpers ──────────────────────────────────────────────────

function normaliseSubject(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function titleCase(s) {
  return s.trim().replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

// Parse "8:30am", "08:30", "8.30", "830" → minutes since midnight
function parseTimeToMins(s) {
  s = s.trim().toLowerCase().replace(/\./g, ':');
  const ampm = s.includes('am') || s.includes('pm');
  const isPm  = s.includes('pm');
  s = s.replace(/[apm]/g, '');
  let h, m;
  if (s.includes(':')) {
    [h, m] = s.split(':').map(Number);
  } else if (s.length <= 2) {
    h = Number(s); m = 0;
  } else {
    h = Number(s.slice(0, -2)); m = Number(s.slice(-2));
  }
  if (ampm && isPm && h !== 12) h += 12;
  if (ampm && !isPm && h === 12) h = 0;
  return h * 60 + (m || 0);
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatTimeRange(startMins, endMins) {
  return `${minsToTime(startMins)} - ${minsToTime(endMins)}`;
}

// ── Day detection ──────────────────────────────────────────────────────────

const DAY_PATTERNS = {
  Monday:    /\b(mon(day)?)\b/i,
  Tuesday:   /\b(tue(sday)?|tues)\b/i,
  Wednesday: /\b(wed(nesday)?)\b/i,
  Thursday:  /\b(thu(rsday)?|thur|thurs)\b/i,
  Friday:    /\b(fri(day)?)\b/i,
};

function detectDay(text) {
  for (const [day, pat] of Object.entries(DAY_PATTERNS)) {
    if (pat.test(text)) return day;
  }
  return null;
}

// ── Time range detection ───────────────────────────────────────────────────

// Matches patterns like: 08:30-09:25, 8:30am-9:25am, 8.30-9.25, 0830-0925
const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*[-–—to]+\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/gi;
const SINGLE_TIME_RE = /\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\b/gi;

function extractTimeRanges(text) {
  const ranges = [];
  let m;
  TIME_RANGE_RE.lastIndex = 0;
  while ((m = TIME_RANGE_RE.exec(text)) !== null) {
    const start = parseTimeToMins(m[1]);
    const end   = parseTimeToMins(m[2]);
    if (start < end && start >= 6*60 && end <= 22*60) {
      ranges.push({ start, end, raw: m[0], index: m.index });
    }
  }
  return ranges;
}

// ── Known subjects for fuzzy matching ─────────────────────────────────────

const COMMON_SUBJECTS = [
  'maths','mathematics','math','english','science','biology','chemistry','physics',
  'history','geography','art','pe','physical education','music','drama','french',
  'spanish','german','mandarin','chinese','japanese','latin','religious education',
  're','computing','computer science','ict','technology','dt','design technology',
  'food technology','business','economics','psychology','sociology','philosophy',
  'media','film','photography','textiles','engineering','further maths',
];

function matchKnownSubject(word) {
  const w = word.toLowerCase().trim();
  // exact
  if (COMMON_SUBJECTS.includes(w)) return titleCase(w);
  // prefix match (min 4 chars)
  if (w.length >= 4) {
    const match = COMMON_SUBJECTS.find(s => s.startsWith(w) || w.startsWith(s.slice(0,4)));
    if (match) return titleCase(match);
  }
  return null;
}

// ── Room detection ─────────────────────────────────────────────────────────

const ROOM_RE = /\b(room\s*)?([a-z]?\d{1,3}[a-z]?|gym|hall|lab\s*\d*|library|sports\s*hall|theatre|studio)\b/gi;

function extractRoom(text) {
  const m = ROOM_RE.exec(text);
  return m ? m[0].trim() : '';
}

// ── Teacher detection ──────────────────────────────────────────────────────

const TEACHER_RE = /\b(mr|mrs|ms|miss|dr|prof)\.?\s+([a-z]+)\b/gi;

function extractTeacher(text) {
  const m = TEACHER_RE.exec(text);
  return m ? titleCase(m[0]) : '';
}

// ── Main OCR pipeline ──────────────────────────────────────────────────────

// State for the setup wizard
let ocrWizardState = {
  step: 'upload',   // upload | scanning | review | done
  rawText: '',
  parsedClasses: [],
  imageDataUrl: null,
};

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
    }).then(result => resolve(result.data.text))
      .catch(reject);
  });
}

// ── Parse raw OCR text into class objects ──────────────────────────────────

function parseOCRText(rawText) {
  const lines  = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
  const classes = [];
  let currentDay = null;
  let nextId = 1000;

  // Strategy 1: line-by-line structural parsing
  // Look for day headers, then class rows beneath them
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect day header
    const day = detectDay(line);
    if (day) { currentDay = day; continue; }

    if (!currentDay) continue;

    // Detect time ranges in this line
    const timeRanges = extractTimeRanges(line);
    if (timeRanges.length === 0) continue;

    // Look ahead up to 3 lines for subject info if this line is just a time
    const context = lines.slice(i, i + 4).join(' ');

    // Extract subject - look for capitalised words that aren't times/rooms/teachers
    const subjectCandidates = extractSubjectCandidates(context);
    const subject = subjectCandidates[0] || 'Unknown';

    const room    = extractRoom(context);
    const teacher = extractTeacher(context);

    for (const tr of timeRanges) {
      classes.push({
        id:      nextId++,
        subject: subject,
        day:     currentDay,
        time:    formatTimeRange(tr.start, tr.end),
        startMins: tr.start,
        endMins:   tr.end,
        room:    room,
        teacher: teacher,
        colour:  getSubjectColour(subject),
        confidence: subjectCandidates.length > 0 ? 'high' : 'low',
      });
    }
  }

  // Strategy 2: if strategy 1 found nothing, try horizontal table parsing
  // (timetables often have days as columns)
  if (classes.length === 0) {
    return parseHorizontalTable(lines);
  }

  return deduplicateAndSort(classes);
}

function extractSubjectCandidates(text) {
  const candidates = [];

  // First try known subject list
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    // Try 1-word match
    const match1 = matchKnownSubject(words[i]);
    if (match1) { candidates.push(match1); continue; }
    // Try 2-word match
    if (i + 1 < words.length) {
      const match2 = matchKnownSubject(words[i] + ' ' + words[i+1]);
      if (match2) { candidates.push(match2); i++; continue; }
    }
  }

  if (candidates.length > 0) return [...new Set(candidates)];

  // Fallback: any capitalised word 4+ chars that isn't a time/day/room/teacher
  const CAP_RE = /\b([A-Z][a-z]{3,})\b/g;
  const SKIP = new Set(['Monday','Tuesday','Wednesday','Thursday','Friday','Room','Miss','Mrs','Mr','Ms','Dr','Prof','Free','Break','Lunch','Period','Class','Year','Form','Group','Set']);
  let m;
  while ((m = CAP_RE.exec(text)) !== null) {
    if (!SKIP.has(m[1])) candidates.push(m[1]);
  }

  return [...new Set(candidates)];
}

// Horizontal table parser: days as columns, times as rows
function parseHorizontalTable(lines) {
  const classes = [];
  const days    = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  let dayColumns = {}; // day → column index
  let nextId = 1000;

  // Find the header row
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    let found = 0;
    for (const day of days) {
      if (DAY_PATTERNS[day].test(line)) {
        // Approximate column by character position - split by 2+ spaces or tabs
        const parts = line.split(/\s{2,}|\t/);
        parts.forEach((p, idx) => {
          const d = detectDay(p);
          if (d) { dayColumns[d] = idx; found++; }
        });
      }
    }
    if (found >= 2) break;
  }

  // No clear column structure - return empty, wizard will handle it
  if (Object.keys(dayColumns).length === 0) return [];

  // Parse subsequent rows as time slots
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(/\s{2,}|\t/);
    const timeRanges = extractTimeRanges(parts[0] || '');
    if (timeRanges.length === 0) continue;

    const tr = timeRanges[0];
    for (const [day, colIdx] of Object.entries(dayColumns)) {
      const cell = parts[colIdx] || '';
      if (!cell || cell.length < 2) continue;
      const subject = extractSubjectCandidates(cell)[0] || titleCase(cell.split(/\s/)[0]);
      if (!subject || subject.length < 2) continue;

      classes.push({
        id: nextId++,
        subject,
        day,
        time: formatTimeRange(tr.start, tr.end),
        startMins: tr.start,
        endMins:   tr.end,
        room:    extractRoom(cell),
        teacher: extractTeacher(cell),
        colour:  getSubjectColour(subject),
        confidence: 'medium',
      });
    }
  }

  return deduplicateAndSort(classes);
}

// ── Conflict detector ──────────────────────────────────────────────────────

function detectConflicts(classes) {
  const conflicts = [];
  const byDay = {};
  for (const c of classes) {
    if (!byDay[c.day]) byDay[c.day] = [];
    byDay[c.day].push(c);
  }
  for (const [day, dayClasses] of Object.entries(byDay)) {
    for (let i = 0; i < dayClasses.length; i++) {
      for (let j = i + 1; j < dayClasses.length; j++) {
        const a = dayClasses[i], b = dayClasses[j];
        if (a.startMins < b.endMins && b.startMins < a.endMins) {
          conflicts.push({ day, a: a.subject, b: b.subject });
        }
      }
    }
  }
  return conflicts;
}

function deduplicateAndSort(classes) {
  // Remove exact duplicates (same day + time + subject)
  const seen = new Set();
  const unique = classes.filter(c => {
    const key = `${c.day}|${c.time}|${normaliseSubject(c.subject)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort each day by start time
  return unique.sort((a, b) => {
    const dayOrder = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
    const dDiff = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    if (dDiff !== 0) return dDiff;
    return a.startMins - b.startMins;
  });
}

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
    content.innerHTML = `
      <div class="wiz-icon">📅</div>
      <div class="wiz-title">Set up your timetable${weekLabel}</div>
      <div class="wiz-sub">Upload a photo or screenshot of your school timetable.<br>The app will read it and build your schedule automatically.</div>
      <label class="upload-zone" id="uploadZone">
        <i class="ti ti-upload"></i>
        <span>Click to upload or drag & drop</span>
        <span class="upload-hint">JPG, PNG, WebP, PDF supported</span>
        <input type="file" id="ttFile" accept="image/*,.pdf" style="display:none" onchange="handleTTUpload(this.files[0])">
      </label>
      <div class="wiz-skip">
        <button class="wiz-skip-btn" onclick="skipToManual()">Set up manually instead →</button>
      </div>`;

    // Drag and drop
    setTimeout(() => {
      const zone = document.getElementById('uploadZone');
      if (!zone) return;
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
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
      <div class="wiz-sub">Scanning the image for classes, times, rooms and teachers.</div>
      <div class="ocr-progress-wrap">
        <div class="ocr-progress-track">
          <div class="ocr-progress-bar" id="ocr-progress-bar"></div>
        </div>
        <div class="ocr-progress-label" id="ocr-progress-label">Starting…</div>
      </div>`;
  }

  else if (step === 'review') {
    const classes  = ocrWizardState.parsedClasses;
    const conflicts = detectConflicts(classes);
    const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];

    content.innerHTML = `
      <div class="wiz-title">Review your timetable</div>
      <div class="wiz-sub">We found <strong>${classes.length}</strong> classes. Fix anything that looks wrong, then confirm.</div>
      ${conflicts.length > 0 ? `<div class="wiz-warning">⚠️ ${conflicts.length} time conflict${conflicts.length > 1 ? 's' : ''} detected — check highlighted rows</div>` : ''}
      <div class="review-days" id="reviewDays">
        ${days.map(day => {
          const dc = classes.filter(c => c.day === day);
          return `
            <div class="review-day">
              <div class="review-day-head">${day} <span class="review-day-count">${dc.length} classes</span>
                <button class="review-add-btn" onclick="addReviewClass('${day}')"><i class="ti ti-plus"></i> Add</button>
              </div>
              ${dc.length === 0 ? '<div class="review-empty">No classes — <button class="link-btn" onclick="addReviewClass(\''+day+'\')">add one</button></div>' : ''}
              ${dc.map(c => renderReviewClass(c, conflicts)).join('')}
            </div>`;
        }).join('')}
      </div>
      <div class="wiz-actions">
        <button class="btn btn-ghost" onclick="renderWizardStep(\'upload\')">← Re-upload</button>
        <button class="btn btn-primary" onclick="confirmTimetable()">Confirm timetable ✓</button>
      </div>`;
  }
}

function renderReviewClass(c, conflicts) {
  const hasConflict = conflicts.some(cf => cf.day === c.day && (cf.a === c.subject || cf.b === c.subject));
  const allSubjects = [...new Set(ocrWizardState.parsedClasses.map(x => x.subject))];
  const subjectOpts = allSubjects.map(s => `<option value="${s}" ${s===c.subject?'selected':''}>${s}</option>`).join('');

  return `
    <div class="review-class${hasConflict ? ' conflict' : ''}" data-id="${c.id}">
      <div class="review-class-colour" style="background:${c.colour}"></div>
      <div class="review-class-fields">
        <div class="review-row">
          <select class="review-input review-subj" onchange="updateReviewClass(${c.id},'subject',this.value)">
            ${subjectOpts}
            <option value="__custom__">+ Custom subject…</option>
          </select>
          <input class="review-input review-time" value="${c.time}" placeholder="08:30 - 09:25"
            onchange="updateReviewClass(${c.id},'time',this.value)">
        </div>
        <div class="review-row">
          <input class="review-input" value="${c.room}" placeholder="Room (optional)"
            onchange="updateReviewClass(${c.id},'room',this.value)">
          <input class="review-input" value="${c.teacher}" placeholder="Teacher (optional)"
            onchange="updateReviewClass(${c.id},'teacher',this.value)">
        </div>
      </div>
      <button class="review-delete" onclick="deleteReviewClass(${c.id})" title="Remove"><i class="ti ti-trash"></i></button>
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
      const ranges = extractTimeRanges(value);
      if (ranges.length > 0) { c.startMins = ranges[0].start; c.endMins = ranges[0].end; }
    }
  }
  // Re-render review
  const conflicts = detectConflicts(ocrWizardState.parsedClasses);
  document.getElementById('reviewDays').querySelectorAll('.review-class').forEach(el => {
    const cid = Number(el.dataset.id);
    const cls = ocrWizardState.parsedClasses.find(x => x.id === cid);
    if (!cls) return;
    const hasConflict = conflicts.some(cf => cf.day === cls.day && (cf.a === cls.subject || cf.b === cls.subject));
    el.classList.toggle('conflict', hasConflict);
  });
}

function deleteReviewClass(id) {
  ocrWizardState.parsedClasses = ocrWizardState.parsedClasses.filter(x => x.id !== id);
  renderWizardStep('review');
}

let _addClassId = 9000;
function addReviewClass(day) {
  ocrWizardState.parsedClasses.push({
    id: _addClassId++,
    subject: 'New Class',
    day,
    time: '08:30 - 09:25',
    startMins: 510,
    endMins:   565,
    room: '',
    teacher: '',
    colour: getSubjectColour('New Class'),
    confidence: 'manual',
  });
  renderWizardStep('review');
}

async function handleTTUpload(file) {
  if (!file) return;

  // Show image preview briefly then go to scanning
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
        // OCR found nothing — fall back to manual
        const content = document.getElementById('wizardContent');
        content.innerHTML = `
          <div class="wiz-icon">😕</div>
          <div class="wiz-title">Couldn't read the timetable</div>
          <div class="wiz-sub">The image wasn't clear enough to extract classes automatically.<br>Try a clearer photo, or set up manually.</div>
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
  // Pre-populate with empty days so user can add classes manually in review
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
  }));

  const targetWeek = ocrWizardState._uploadingWeek || 'A';

  if (state.abWeekEnabled && targetWeek === 'B') {
    state.classesB = classes;
  } else {
    // Save to classesA (and legacy classes for compatibility)
    state.classesA = classes;
    state.classes  = classes;
  }

  state.hasCompletedSetup = true;
  ocrWizardState._uploadingWeek = null;
  saveState();
  hideSetupWizard();
  render();
  // If on settings page, re-render it
  if (typeof renderSettings === 'function') renderSettings();
}
