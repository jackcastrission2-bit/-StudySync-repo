// =====================
// StudySync – app.js
// Main application logic
// =====================

// ── Supabase ───────────────────────────────────────────────────────────────

const { createClient } = supabase;
const sb = createClient(
  'https://ulsostfiffgcqjzfpzat.supabase.co',
  'sb_publishable_D2d6OqxbxMQQ-Qd-SGGZeQ_EUxNzIvA',
  { auth: { flowType: 'implicit' } }
);

let currentUser = null;

// ── Auth ───────────────────────────────────────────────────────────────────

let authMode = 'signin';

function showScreen(id) {
  ['loginScreen', 'loadingScreen', 'appScreen'].forEach(s => {
    const el = document.getElementById(s);
    if (!el) return;
    el.style.display = s === id ? 'flex' : 'none';
  });
}

function setLoadingMsg(msg) {
  document.getElementById('loadingMsg').textContent = msg;
}

function toggleAuthMode() {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  const isSignup = authMode === 'signup';
  document.getElementById('loginBtn').textContent = isSignup ? 'Sign up' : 'Sign in';
  document.getElementById('authToggle').textContent = isSignup
    ? 'Already have an account? Sign in'
    : "Don't have an account? Sign up";
  document.getElementById('loginSub').textContent = isSignup
    ? 'Create your StudySync account'
    : 'Sign in to your student diary';
  document.getElementById('loginError').style.display = 'none';
}

async function submitAuth() {
  const btn    = document.getElementById('loginBtn');
  const errEl  = document.getElementById('loginError');
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.style.display = 'block';
    return;
  }
  if (authMode === 'signup' && password.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = authMode === 'signup' ? 'Creating account...' : 'Signing in...';

  if (authMode === 'signup') {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) {
      errEl.textContent = error.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign up';
      return;
    }
    if (data.session) {
      currentUser = data.user;
      setupUserUI();
      loadState();
      render();
      showScreen('appScreen');
      if (!state.hasCompletedSetup) showSetupWizard();
    } else {
      errEl.style.background = '#e8f5e9';
      errEl.style.borderColor = '#a5d6a7';
      errEl.style.color = '#2e7d32';
      errEl.textContent = 'Account created! Check your email to confirm before signing in.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign in';
      authMode = 'signin';
      document.getElementById('loginBtn').textContent = 'Sign in';
      document.getElementById('authToggle').textContent = "Don't have an account? Sign up";
    }
  } else {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed') || error.message.toLowerCase().includes('not confirmed')) {
        // Show resend option
        errEl.style.background = '#fff8e1';
        errEl.style.borderColor = '#ffe082';
        errEl.style.color = '#7b5a00';
        errEl.innerHTML = 'Your email isn\'t confirmed yet. <button onclick="resendConfirmation()" style="background:none;border:none;color:#7b5a00;text-decoration:underline;cursor:pointer;font-size:13px;padding:0;">Resend confirmation email</button>';
        errEl.style.display = 'block';
      } else {
        errEl.style.background = '';
        errEl.style.borderColor = '';
        errEl.style.color = '#c0392b';
        errEl.textContent = error.message;
        errEl.style.display = 'block';
      }
      btn.disabled = false;
      btn.textContent = 'Sign in';
      return;
    }
    currentUser = data.user;
    setupUserUI();
    loadState();
    render();
    showScreen('appScreen');
    if (!state.hasCompletedSetup) showSetupWizard();
  }
}

async function resendConfirmation() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    alert('Please enter your email address first.');
    return;
  }
  const { error } = await sb.auth.resend({ type: 'signup', email });
  const errEl = document.getElementById('loginError');
  errEl.style.background = '#e8f5e9';
  errEl.style.borderColor = '#a5d6a7';
  errEl.style.color = '#2e7d32';
  errEl.textContent = error ? error.message : '✓ Confirmation email sent! Check your inbox then sign in.';
  errEl.style.display = 'block';
}

async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  state = null;
  showScreen('loginScreen');
}

async function checkUser() {
  showScreen('loadingScreen');
  setLoadingMsg('Checking session...');
  const { data: { session } } = await sb.auth.getSession().catch(() => ({ data: { session: null } }));
  if (session) {
    currentUser = session.user;
    setupUserUI();
    loadState();
    render();
    showScreen('appScreen');
    if (!state.hasCompletedSetup) showSetupWizard();
  } else {
    showScreen('loginScreen');
  }
}

function setupUserUI() {
  const name     = currentUser.user_metadata?.full_name || currentUser.email || 'Student';
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('userAvatar').textContent      = initials;
  document.getElementById('userDisplayName').textContent = name.split('@')[0];
  document.getElementById('userDisplayEmail').textContent = currentUser.email || '';
}

// ── State ──────────────────────────────────────────────────────────────────

let state = null;

function storageKey() {
  return 'studysync-state-' + (currentUser ? currentUser.id : 'guest');
}

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      state = JSON.parse(raw);
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  } catch (e) {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save state:', e);
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

function goPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelector(`[data-page="${id}"]`).classList.add('active');
  render();
}

document.getElementById('nav').addEventListener('click', e => {
  const btn = e.target.closest('.nav-item');
  if (!btn) return;
  goPage(btn.dataset.page);
});

// ── Modals ─────────────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById('modal-' + id).classList.add('open');
}

function closeModal(id) {
  document.getElementById('modal-' + id).classList.remove('open');
}

document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => {
    if (e.target === bg) bg.classList.remove('open');
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function getDayName() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date().getDay()];
}

function fmtDate(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function daysLeft(s) {
  if (!s) return 99;
  const target = new Date(s);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

function dueDateLabel(due) {
  const dl = daysLeft(due);
  if (dl < 0)  return 'Overdue!';
  if (dl === 0) return 'Due today!';
  if (dl === 1) return 'Due tomorrow';
  return fmtDate(due);
}

function levelInfo() {
  let lvl = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (state.xp >= LEVELS[i].xp) lvl = i;
  }
  const cur  = LEVELS[lvl];
  const next = LEVELS[lvl + 1];
  const pct  = next
    ? Math.round(((state.xp - cur.xp) / (next.xp - cur.xp)) * 100)
    : 100;
  const needed = next ? next.xp - state.xp : 0;
  return { lvl: lvl + 1, name: cur.name, pct, needed, hasNext: !!next };
}

function shuffleAnswers(r) {
  const arr = r.answers.map((text, origIdx) => ({ text, origIdx }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── XP & Badges ────────────────────────────────────────────────────────────

function addXP(n) {
  state.xp += n;
  checkBadges();
}

function checkBadges() {
  BADGE_DEFS.forEach(b => {
    if (!state.earnedBadges.includes(b.id) && b.check(state)) {
      state.earnedBadges.push(b.id);
    }
  });
}

// ── Homework actions ───────────────────────────────────────────────────────

function setHWFilter(f, btn) {
  state.hwFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHW();
}

function toggleHW(id) {
  const h = state.homework.find(x => x.id === id);
  if (!h) return;
  h.done = !h.done;
  if (h.done) {
    addXP(10);
    state.hwDone++;
  } else {
    state.xp    = Math.max(0, state.xp - 10);
    state.hwDone = Math.max(0, state.hwDone - 1);
  }
  checkBadges();
  saveState();
  render();
}

// ── Assignment actions ─────────────────────────────────────────────────────

function toggleAssignStage(id) {
  const a = state.assignments.find(x => x.id === id);
  if (!a) return;
  if (a.progress < a.stages.length) {
    a.progress++;
    addXP(15);
    if (a.progress === a.stages.length) {
      state.assignDone++;
      addXP(25);
    }
  } else {
    a.progress = 0;
  }
  checkBadges();
  saveState();
  renderAssignments();
  renderRewards();
}

// ── Replay actions ─────────────────────────────────────────────────────────

function answerReplay(id, ans) {
  const r = state.replay.find(x => x.id === id);
  if (!r || r.answered !== null) return;
  r.answered = ans;
  state.replaysAnswered++;
  if (ans === r.correct) addXP(5);
  checkBadges();
  saveState();
  renderReplay();
  renderRewards();
}

function resetReplay(id) {
  const r = state.replay.find(x => x.id === id);
  if (r) r.answered = null;
  saveState();
  renderReplay();
}

// ── Save actions (modals) ──────────────────────────────────────────────────

function saveClass() {
  const subj    = document.getElementById('ac-subj').value.trim();
  const day     = document.getElementById('ac-day').value;
  const time    = document.getElementById('ac-time').value.trim();
  const room    = document.getElementById('ac-room').value.trim();
  const teacher = document.getElementById('ac-teacher').value.trim();
  if (!subj || !time) { alert('Please fill in subject and time.'); return; }
  state.classes.push({ id: ++state.nextId, subject: subj, day, time, room, teacher });
  saveState();
  closeModal('addClass');
  render();
  ['ac-subj', 'ac-time', 'ac-room', 'ac-teacher'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function saveHW() {
  const subj     = document.getElementById('hw-subj').value.trim();
  const desc     = document.getElementById('hw-desc').value.trim();
  const due      = document.getElementById('hw-due').value;
  const priority = document.getElementById('hw-pri').value;
  const time     = parseInt(document.getElementById('hw-time').value) || 0;
  if (!subj || !desc || !due) { alert('Please fill in all required fields.'); return; }
  state.homework.push({ id: ++state.nextId, subject: subj, desc, due, priority, time, done: false });
  saveState();
  closeModal('addHW');
  render();
  ['hw-subj', 'hw-desc', 'hw-due', 'hw-time'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function saveAssign() {
  const subj  = document.getElementById('as-subj').value.trim();
  const title = document.getElementById('as-title').value.trim();
  const desc  = document.getElementById('as-desc').value.trim();
  const due   = document.getElementById('as-due').value;
  if (!subj || !title || !due) { alert('Please fill in subject, title, and due date.'); return; }
  state.assignments.push({
    id: ++state.nextId,
    subject: subj, title, desc, due,
    stages: ['Research', 'Draft', 'Final Version', 'Submit'],
    progress: 0,
  });
  saveState();
  closeModal('addAssign');
  render();
  ['as-subj', 'as-title', 'as-desc', 'as-due'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function saveReplay() {
  const subj = document.getElementById('rq-subj').value.trim();
  const q    = document.getElementById('rq-q').value.trim();
  const a1   = document.getElementById('rq-a1').value.trim();
  const a2   = document.getElementById('rq-a2').value.trim();
  const a3   = document.getElementById('rq-a3').value.trim();
  if (!subj || !q || !a1 || !a2 || !a3) { alert('Please fill in all fields.'); return; }
  state.replay.push({
    id: ++state.nextId,
    subject: subj, question: q,
    answers: [a1, a2, a3], correct: 0, answered: null,
  });
  saveState();
  closeModal('addReplay');
  renderReplay();
  ['rq-subj', 'rq-q', 'rq-a1', 'rq-a2', 'rq-a3'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

// ── Render functions ───────────────────────────────────────────────────────

function render() {
  renderDashboard();
  renderTimetable();
  renderHW();
  renderAssignments();
  renderReplay();
  renderRewards();
}

function renderDashboard() {
  const today        = getDayName();
  const todayClasses = state.classes
    .filter(c => c.day === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  document.getElementById('d-classes').textContent = todayClasses.length;
  document.getElementById('d-due').textContent     = state.homework.filter(h => !h.done && daysLeft(h.due) <= 5).length;
  document.getElementById('d-assign').textContent  = state.assignments.length;
  document.getElementById('d-streak').textContent  = state.streak;

  const li = levelInfo();
  document.getElementById('xp-chip-val').textContent = `Level ${li.lvl} · ${state.xp} XP`;

  const ttl = document.getElementById('d-timetable-list');
  if (todayClasses.length === 0) {
    ttl.innerHTML = '<div class="empty-state">No classes today.</div>';
  } else {
    ttl.innerHTML = todayClasses.map(c => `
      <div class="class-item">
        <div class="class-time">${c.time.split(' - ')[0]}</div>
        <div class="class-dot"></div>
        <div>
          <div class="class-name">${c.subject}</div>
          <div class="class-room">${c.room} · ${c.teacher}</div>
        </div>
      </div>`).join('');
  }

  const active = state.homework
    .filter(h => !h.done)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, 5);

  const hwl = document.getElementById('d-hw-list');
  if (active.length === 0) {
    hwl.innerHTML = '<div class="empty-state">All caught up! 🎉</div>';
  } else {
    hwl.innerHTML = active.map(h => `
      <div class="pri-item">
        <div>
          <div class="pri-subj">${h.subject}</div>
          <div class="pri-desc">${h.desc.substring(0, 50)}${h.desc.length > 50 ? '…' : ''}</div>
        </div>
        <div class="pri-due">${dueDateLabel(h.due)}</div>
      </div>`).join('');
  }
}

function renderTimetable() {
  const today = getDayName();
  document.getElementById('tt-grid').innerHTML = DAY_ORDER.map(day => {
    const classes = state.classes
      .filter(c => c.day === day)
      .sort((a, b) => a.time.localeCompare(b.time));
    const isToday = today === day;

    return `
      <div class="tt-day">
        <div class="tt-day-head">
          ${day}
          ${isToday ? '<span class="today-badge">Today</span>' : ''}
        </div>
        ${classes.length === 0
          ? '<div class="tt-empty">No classes</div>'
          : classes.map(c => `
              <div class="tt-class">
                <div class="tt-subj">${c.subject}</div>
                <div class="tt-meta">
                  <span>🕐 ${c.time}</span>
                  <span>📍 ${c.room}</span>
                  <span>👤 ${c.teacher}</span>
                </div>
              </div>`).join('')}
      </div>`;
  }).join('');
}

function renderHW() {
  const f = state.hwFilter || 'active';
  let list = [...state.homework];
  if (f === 'active')    list = list.filter(h => !h.done);
  if (f === 'completed') list = list.filter(h => h.done);
  list.sort((a, b) => new Date(a.due) - new Date(b.due));

  const el = document.getElementById('hw-list');
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-center">${f === 'active' ? 'All homework complete! 🎉' : 'Nothing here yet.'}</div>`;
    return;
  }
  el.innerHTML = list.map(h => `
    <div class="hw-item${h.done ? ' done' : ''}">
      <div class="hw-check${h.done ? ' checked' : ''}" onclick="toggleHW(${h.id})">
        ${h.done ? '<i class="ti ti-check"></i>' : ''}
      </div>
      <div class="hw-body">
        <div class="hw-subj">${h.subject}<span class="badge ${h.priority}">${h.priority.toUpperCase()}</span></div>
        <div class="hw-desc">${h.desc}</div>
      </div>
      <div class="hw-right">
        <div class="hw-due">${dueDateLabel(h.due)}</div>
        ${h.time ? `<div class="hw-time">~${h.time} mins</div>` : ''}
      </div>
    </div>`).join('');
}

function renderAssignments() {
  const grid = document.getElementById('assign-grid');
  if (state.assignments.length === 0) {
    grid.innerHTML = '<div class="empty-state">No assignments yet. Create one to get started.</div>';
    return;
  }
  grid.innerHTML = state.assignments.map(a => {
    const pct = Math.round((a.progress / a.stages.length) * 100);
    return `
      <div class="assign-card" onclick="toggleAssignStage(${a.id})">
        <div class="assign-subj">${a.subject}</div>
        <div class="assign-title">${a.title}</div>
        <div class="assign-desc">${a.desc}</div>
        <div class="progress-label">
          <span>Progress</span>
          <span class="progress-pct">${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="stage-pills">
          ${a.stages.map((s, i) => `
            <span class="stage-pill${i < a.progress ? ' done' : ''}">${s}</span>`).join('')}
        </div>
        <div class="assign-date">
          <i class="ti ti-calendar"></i> ${fmtDate(a.due)}
        </div>
      </div>`;
  }).join('');
}

function renderReplay() {
  const el = document.getElementById('replay-content');
  if (state.replay.length === 0) {
    el.innerHTML = '<div class="empty-state">No replay questions yet. Add some to start practising!</div>';
    return;
  }

  const unanswered = state.replay.filter(r => r.answered === null);
  const answered   = state.replay.filter(r => r.answered !== null);
  let html = '';

  if (unanswered.length > 0) {
    html += '<div class="replay-section-label">📚 Questions to review</div>';
    html += unanswered.map(r => `
      <div class="replay-card">
        <div class="replay-subj">${r.subject}</div>
        <div class="replay-q">${r.question}</div>
        <div class="replay-opts">
          ${shuffleAnswers(r).map(({ text, origIdx }) => `
            <button class="replay-opt" onclick="answerReplay(${r.id}, ${origIdx})">${text}</button>`).join('')}
        </div>
      </div>`).join('');
  }

  if (answered.length > 0) {
    const correct = answered.filter(r => r.answered === r.correct).length;
    html += `<div class="replay-section-label" style="margin-top:${unanswered.length ? '20px' : '0'}">
      ✅ Answered (${correct}/${answered.length} correct)
    </div>`;
    html += answered.map(r => `
      <div class="replay-card" style="opacity:.7">
        <div class="replay-subj">${r.subject}</div>
        <div class="replay-q">${r.question}</div>
        <div class="replay-answered ${r.answered === r.correct ? 'correct' : 'wrong'}">
          ${r.answered === r.correct ? '✓' : '✗'} ${r.answers[r.answered]}
          ${r.answered !== r.correct ? `<span style="opacity:.7"> · Correct: ${r.answers[r.correct]}</span>` : ''}
        </div>
        <button class="replay-again" onclick="resetReplay(${r.id})">Practice again</button>
      </div>`).join('');
  }

  el.innerHTML = html || '<div class="empty-state">All caught up!</div>';
}

function renderRewards() {
  const li = levelInfo();
  document.getElementById('r-level-label').textContent = `Level ${li.lvl} Student`;
  document.getElementById('r-level-name').textContent  = li.name;
  document.getElementById('r-xp-bar').style.width      = li.pct + '%';
  document.getElementById('r-xp-total').textContent    = `${state.xp} Total XP`;
  document.getElementById('r-xp-needed').textContent   = li.hasNext
    ? `${li.needed} XP to level ${li.lvl + 1}`
    : 'Max level!';

  document.getElementById('r-streak').textContent     = state.streak;
  document.getElementById('r-hw-done').textContent    = state.hwDone;
  document.getElementById('r-assign-done').textContent = state.assignDone;

  const earned = BADGE_DEFS.filter(b => state.earnedBadges.includes(b.id));
  const bg = document.getElementById('badges-grid');
  if (earned.length === 0) {
    bg.innerHTML = '<div class="empty-state">No badges yet — complete homework and maintain streaks to earn them!</div>';
  } else {
    bg.innerHTML = earned.map(b => `
      <div class="badge-card">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>`).join('');
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────

checkUser();
