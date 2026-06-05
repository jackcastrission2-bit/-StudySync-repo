// =====================
// StudySync – settings.js
// A/B week detection, holidays, settings page
// =====================

// ── A/B Week logic ────────────────────────────────────────────────────────

// Returns 'A' or 'B' for a given date based on term start config
function getWeekForDate(date) {
  if (!state.abWeekEnabled || !state.termStartDate) return 'A';

  const termStart = new Date(state.termStartDate);
  termStart.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  // Get Monday of the term start week
  const termMonday = getMondayOf(termStart);
  const targetMonday = getMondayOf(target);

  const weeksDiff = Math.round((targetMonday - termMonday) / (7 * 24 * 60 * 60 * 1000));

  // If negative (before term start), return A
  if (weeksDiff < 0) return state.termStartWeek || 'A';

  // Alternate: even weeks = termStartWeek, odd weeks = other
  const isEven = weeksDiff % 2 === 0;
  const startIsA = (state.termStartWeek || 'A') === 'A';
  if (isEven) return startIsA ? 'A' : 'B';
  return startIsA ? 'B' : 'A';
}

function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Returns the current week letter ('A' or 'B') based on today
function getCurrentWeekLetter() {
  if (!state.abWeekEnabled) return null;
  if (!state.termStartDate) return state.currentWeek || 'A';
  return getWeekForDate(new Date());
}

// Returns classes for a given day, respecting A/B week
function getClassesForDay(day, date) {
  if (!state.abWeekEnabled) {
    // Single timetable mode — use state.classes (or classesA if migrated)
    const classes = state.classesA && state.classesA.length > 0 ? state.classesA : state.classes;
    return classes.filter(c => c.day === day);
  }
  const week = date ? getWeekForDate(date) : getCurrentWeekLetter();
  const pool = week === 'B' ? (state.classesB || []) : (state.classesA && state.classesA.length > 0 ? state.classesA : state.classes);
  return pool.filter(c => c.day === day);
}

// ── Holiday logic ─────────────────────────────────────────────────────────

function isHoliday(date) {
  if (!state.holidays || state.holidays.length === 0) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  for (const h of state.holidays) {
    const start = new Date(h.start);
    const end   = new Date(h.end);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (d >= start && d <= end) return h;
  }
  return null;
}

function isDueDuringHoliday(dueDate) {
  return isHoliday(dueDate);
}

function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Settings page render ──────────────────────────────────────────────────

function renderSettings() {
  const weekLetter = getCurrentWeekLetter();
  const todayHol   = isHoliday(new Date());

  document.getElementById('settings-body').innerHTML = `

    <!-- ── Timetable section ── -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="ti ti-calendar"></i> Timetable</div>

      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">A/B Weeks</div>
            <div class="settings-row-sub">Two alternating timetables each week</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="abToggle" ${state.abWeekEnabled ? 'checked' : ''}
              onchange="toggleABWeek(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      ${state.abWeekEnabled ? `
      <div class="settings-card" id="abConfig">
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">Current week</div>
            <div class="settings-row-sub">
              ${weekLetter ? `Calculated as <strong>Week ${weekLetter}</strong> based on term start` : 'Set manually below'}
            </div>
          </div>
          <div class="week-toggle">
            <button class="week-btn ${(!state.termStartDate && state.currentWeek==='A') || (state.termStartDate && weekLetter==='A') ? 'active' : ''}"
              onclick="setManualWeek('A')">A</button>
            <button class="week-btn ${(!state.termStartDate && state.currentWeek==='B') || (state.termStartDate && weekLetter==='B') ? 'active' : ''}"
              onclick="setManualWeek('B')">B</button>
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">Term start date</div>
            <div class="settings-row-sub">First Monday of your school year — app auto-calculates weeks</div>
          </div>
          <input type="date" class="settings-date-input" id="termStartDate"
            value="${state.termStartDate || ''}"
            onchange="setTermStartDate(this.value)">
        </div>

        ${state.termStartDate ? `
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">Term start is Week</div>
            <div class="settings-row-sub">Was the first week of term A or B?</div>
          </div>
          <div class="week-toggle">
            <button class="week-btn ${state.termStartWeek==='A' ? 'active' : ''}" onclick="setTermStartWeek('A')">A</button>
            <button class="week-btn ${state.termStartWeek==='B' ? 'active' : ''}" onclick="setTermStartWeek('B')">B</button>
          </div>
        </div>` : ''}

        <div class="settings-divider"></div>

        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">Week A timetable</div>
            <div class="settings-row-sub">${(state.classesA||[]).length || state.classes.length} classes set up</div>
          </div>
          <button class="settings-action-btn" onclick="reuploadWeek('A')"><i class="ti ti-upload"></i> Update</button>
        </div>

        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">Week B timetable</div>
            <div class="settings-row-sub">${(state.classesB||[]).length} classes set up</div>
          </div>
          <button class="settings-action-btn" onclick="reuploadWeek('B')"><i class="ti ti-upload"></i> Update</button>
        </div>
      </div>` : `
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-info">
            <div class="settings-row-label">Your timetable</div>
            <div class="settings-row-sub">${(state.classesA||[]).length || state.classes.length} classes set up</div>
          </div>
          <button class="settings-action-btn" onclick="reuploadWeek('A')"><i class="ti ti-upload"></i> Update</button>
        </div>
      </div>`}
    </div>

    <!-- ── Holidays section ── -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="ti ti-beach"></i> Holidays & Breaks</div>

      ${todayHol ? `<div class="holiday-banner">🏖️ You're currently on <strong>${todayHol.name}</strong> (until ${fmtDateShort(todayHol.end)})</div>` : ''}

      <div class="settings-card">
        ${(state.holidays||[]).length === 0
          ? '<div class="settings-empty">No holidays added yet</div>'
          : (state.holidays||[]).map(h => `
            <div class="holiday-row">
              <div class="holiday-icon">🗓️</div>
              <div class="holiday-info">
                <div class="holiday-name">${h.name}</div>
                <div class="holiday-dates">${fmtDateShort(h.start)} – ${fmtDateShort(h.end)}</div>
              </div>
              <button class="holiday-delete" onclick="deleteHoliday(${h.id})" title="Remove"><i class="ti ti-x"></i></button>
            </div>`).join('')}

        <div class="settings-divider" style="margin:12px 0"></div>

        <div class="add-holiday-form">
          <input class="settings-input" id="hol-name" placeholder="Holiday name (e.g. Easter)" />
          <div class="add-holiday-dates">
            <input class="settings-date-input" id="hol-start" type="date" />
            <span class="hol-to">to</span>
            <input class="settings-date-input" id="hol-end" type="date" />
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="addHoliday()">
            <i class="ti ti-plus"></i> Add Holiday
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── Settings actions ──────────────────────────────────────────────────────

function toggleABWeek(enabled) {
  state.abWeekEnabled = enabled;
  if (enabled) {
    // Migrate state.classes → classesA if not already done
    if ((!state.classesA || state.classesA.length === 0) && state.classes.length > 0) {
      state.classesA = [...state.classes];
    }
    if (!state.classesB) state.classesB = [];
    if (!state.currentWeek) state.currentWeek = 'A';
    if (!state.termStartWeek) state.termStartWeek = 'A';
  }
  saveState();
  renderSettings();
}

function setManualWeek(letter) {
  state.currentWeek = letter;
  // If no term start date, this is manual override
  if (!state.termStartDate) {
    saveState();
    renderSettings();
    renderDashboard();
    renderTimetable();
  }
}

function setTermStartDate(val) {
  state.termStartDate = val;
  saveState();
  renderSettings();
  renderDashboard();
  renderTimetable();
}

function setTermStartWeek(letter) {
  state.termStartWeek = letter;
  saveState();
  renderSettings();
  renderDashboard();
  renderTimetable();
}

function reuploadWeek(week) {
  // Set which week we're uploading for, then show wizard
  ocrWizardState._uploadingWeek = week;
  showSetupWizard();
}

function addHoliday() {
  const name  = document.getElementById('hol-name').value.trim();
  const start = document.getElementById('hol-start').value;
  const end   = document.getElementById('hol-end').value;
  if (!name || !start || !end) {
    alert('Please fill in the holiday name and both dates.');
    return;
  }
  if (new Date(end) < new Date(start)) {
    alert('End date must be after start date.');
    return;
  }
  if (!state.holidays) state.holidays = [];
  state.holidays.push({ id: ++state.nextId, name, start, end });
  saveState();
  renderSettings();
  renderDashboard();
}

function deleteHoliday(id) {
  state.holidays = (state.holidays || []).filter(h => h.id !== id);
  saveState();
  renderSettings();
  renderDashboard();
}
