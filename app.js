/**
 * BetOz - Main Application Logic (v2 - Supabase + AI Tips + Premium Home)
 */

const App = {
  currentUser: null,
  allMatches: [],
  knockoutMatches: [],
  currentSection: 'home',
  currentStageFilter: 'r16',
  refreshInterval: null,
  countdownInterval: null,
  modalMatchId: null,
  tipModalMatchId: null,
  leaderboardCache: [],
};

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initParticles();

  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  document.getElementById('prediction-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('prediction-modal')) closePredictionModal();
  });

  document.getElementById('tip-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('tip-modal')) closeTipModal();
  });

  document.getElementById('pred-home-score').addEventListener('input', clampScore);
  document.getElementById('pred-away-score').addEventListener('input', clampScore);

  setTimeout(initApp, 2400);
});

function clampScore(e) {
  let v = parseInt(e.target.value);
  if (isNaN(v) || v < 0) v = 0;
  if (v > 20) v = 20;
  e.target.value = v;
}

async function initApp() {
  hideLoadingScreen();
  const saved = DB.getCurrentUser();
  if (saved) {
    App.currentUser = saved;
    await loadAndShowApp();
  } else {
    showLoginScreen();
    await loadExistingUsers();
  }
}

// ═══════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════
function initParticles() {
  const c = document.getElementById('particles-container');
  for (let i = 0; i < 25; i++) {
    const p = document.createElement('div');
    p.classList.add('particle');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.width = p.style.height = (Math.random() * 2.5 + 1) + 'px';
    p.style.animationDuration = (Math.random() * 14 + 10) + 's';
    p.style.animationDelay = (Math.random() * 14) + 's';
    c.appendChild(p);
  }
}

// ═══════════════════════════════════════════
// LOADING / LOGIN
// ═══════════════════════════════════════════
function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  el.style.transition = 'opacity .5s ease';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 500);
}

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
}

function hideLoginScreen() {
  const el = document.getElementById('login-screen');
  el.style.transition = 'opacity .3s ease';
  el.style.opacity = '0';
  setTimeout(() => el.classList.add('hidden'), 300);
}

async function loadExistingUsers() {
  try {
    const users = await DB.getUsers();
    const section = document.getElementById('existing-users-section');
    const list = document.getElementById('existing-users-list');
    if (!users || !users.length) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    list.innerHTML = users.map(u =>
      `<button class="eu-chip" onclick="quickLogin('${esc(u.name)}')">${esc(u.name)}</button>`
    ).join('');
  } catch (e) {
    console.warn('loadExistingUsers:', e);
  }
}

function quickLogin(name) {
  document.getElementById('username-input').value = name;
  handleLogin();
}

async function handleLogin() {
  const name = document.getElementById('username-input').value.trim();
  if (!name || name.length < 2) {
    showToast('הזן שם של לפחות 2 תווים', 'error');
    return;
  }
  App.currentUser = name;
  DB.setCurrentUser(name);

  // Show loading state on button
  const btn = document.getElementById('login-btn');
  btn.textContent = 'מתחבר...';
  btn.disabled = true;

  try {
    await DB.addUser(name);
  } catch (e) {
    console.warn('addUser failed (may already exist):', e);
  }

  btn.textContent = 'כניסה לליגה →';
  btn.disabled = false;

  hideLoginScreen();
  await loadAndShowApp();
}

function handleLogout() {
  DB.clearCurrentUser();
  App.currentUser = null;
  clearInterval(App.refreshInterval);
  clearInterval(App.countdownInterval);
  document.getElementById('app').classList.add('hidden');
  const ls = document.getElementById('login-screen');
  ls.classList.remove('hidden');
  ls.style.opacity = '1';
  document.getElementById('username-input').value = '';
  loadExistingUsers();
}

// ═══════════════════════════════════════════
// APP LOAD
// ═══════════════════════════════════════════
async function loadAndShowApp() {
  document.getElementById('header-avatar').textContent = App.currentUser.charAt(0).toUpperCase();
  document.getElementById('app').classList.remove('hidden');

  await refreshData(true);

  // Subscribe to realtime leaderboard updates
  DB.subscribeLeaderboard(async () => {
    if (App.currentSection === 'leaderboard' || App.currentSection === 'home') {
      App.leaderboardCache = await DB.computeLeaderboard(App.allMatches);
      if (App.currentSection === 'leaderboard') renderLeaderboard();
      if (App.currentSection === 'home') renderHome();
    }
  });

  App.refreshInterval = setInterval(() => refreshData(false), 60000);

  // Countdown ticker
  App.countdownInterval = setInterval(updateCountdown, 1000);
}

async function refreshData(force = false) {
  try {
    const matches = await API.fetchMatches(force);
    App.allMatches = matches;
    App.knockoutMatches = API.getKnockoutMatches(matches);
    updateTicker(matches);

    // Pre-compute leaderboard
    App.leaderboardCache = await DB.computeLeaderboard(App.allMatches);

    renderCurrentSection();
    const tu = document.getElementById('live-update-time');
    if (tu) tu.textContent = `עודכן: ${new Date().toLocaleTimeString('he-IL')}`;
  } catch (err) {
    console.error('refreshData:', err);
    showToast('שגיאה בטעינת נתונים', 'error', 2000);
  }
}

function updateTicker(matches) {
  const text = API.buildTickerText(matches);
  const el = document.getElementById('ticker-text');
  if (el) el.textContent = text + '   •   ' + text;
}

function renderCurrentSection() {
  if (App.currentSection === 'home')        renderHome();
  else if (App.currentSection === 'predictions') renderPredictions();
  else if (App.currentSection === 'leaderboard') renderLeaderboard();
  else if (App.currentSection === 'live')   renderLive();
}

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
const SECTIONS = ['home', 'predictions', 'leaderboard', 'live'];
const TITLES   = { home: 'BetOz', predictions: 'ניחושים', leaderboard: 'טבלת ניקוד', live: '🔴 חי עכשיו' };

function showSection(name) {
  App.currentSection = name;
  SECTIONS.forEach(s => {
    document.getElementById(`section-${s}`)?.classList.toggle('hidden', s !== name);
    document.getElementById(`bn-${s}`)?.classList.toggle('active', s === name);
  });
  document.getElementById('header-title').textContent = TITLES[name] || name;
  renderCurrentSection();
  document.querySelector('.app-content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════
// COUNTDOWN
// ═══════════════════════════════════════════
function getNextMatch() {
  const now = Date.now();
  const upcoming = App.knockoutMatches
    .filter(m => !m.finished && !m.is_live && m.dateInfo?.timestamp && m.dateInfo.timestamp > now)
    .sort((a,b) => a.dateInfo.timestamp - b.dateInfo.timestamp);
  return upcoming[0] || null;
}

function updateCountdown() {
  const el = document.getElementById('countdown-timer');
  if (!el) return;
  const next = getNextMatch();
  if (!next) { el.textContent = '— : — : — : —'; return; }
  const diff = next.dateInfo.timestamp - Date.now();
  if (diff <= 0) { el.textContent = '00:00:00:00'; return; }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  el.textContent = `${String(d).padStart(2,'0')}:${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════
// HOME DASHBOARD
// ═══════════════════════════════════════════
async function renderHome() {
  const container = document.getElementById('home-content');

  // Show shimmer while loading
  container.innerHTML = `
    <div class="shimmer-card" style="height:180px;margin-bottom:16px"></div>
    <div class="shimmer-card" style="height:130px;margin-bottom:16px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div class="shimmer-card" style="height:110px"></div>
      <div class="shimmer-card" style="height:110px"></div>
      <div class="shimmer-card" style="height:110px"></div>
      <div class="shimmer-card" style="height:110px"></div>
    </div>`;

  const board = App.leaderboardCache;
  const myEntry = board.find(e => e.name === App.currentUser) || { points: 0, exact: 0, direction: 0, miss: 0 };
  const myRank  = board.findIndex(e => e.name === App.currentUser) + 1;

  // User predictions for this user
  let userPreds = {};
  try { userPreds = await DB.getUserPredictions(App.currentUser); } catch {}

  const totalPreds = Object.keys(userPreds).length;
  const totalFinished = myEntry.exact + myEntry.direction + myEntry.miss;
  const winRate = totalFinished > 0 ? Math.round((myEntry.exact + myEntry.direction) / totalFinished * 100) : 0;

  // Next match
  const nextMatch = getNextMatch();
  const hasPredOnNext = nextMatch ? !!userPreds[nextMatch.id] : false;

  // Greetings
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'בוקר טוב' : hr < 17 ? 'שלום' : hr < 21 ? 'ערב טוב' : 'לילה טוב';

  // Rank medal
  const rankMedal = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : myRank > 0 ? `#${myRank}` : '—';

  // Recent activity
  const recent = buildRecentActivity(userPreds, 3);

  container.innerHTML = `

    <!-- ═══ HERO ═══ -->
    <div class="home-hero">
      <div class="home-hero-top">
        <div>
          <div class="home-greeting">${greet} 👋</div>
          <div class="home-hero-name">${esc(App.currentUser)}</div>
        </div>
        <div class="home-rank-pill">${rankMedal} מקום ${myRank > 0 ? myRank : '—'}</div>
      </div>
      <div class="home-hero-pts-row">
        <div class="home-big-pts">
          <span class="home-pts-num" id="pts-anim">${myEntry.points}</span>
          <span class="home-pts-label">נקודות</span>
        </div>
        <div class="home-win-rate">
          <div class="hwr-ring">
            <svg viewBox="0 0 36 36">
              <path class="hwr-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="2.5"/>
              <path class="hwr-fill" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="2.5"
                stroke-dasharray="${winRate}, 100"/>
            </svg>
            <span class="hwr-num">${winRate}%</span>
          </div>
          <div class="hwr-label">אחוז פגיעה</div>
        </div>
      </div>
    </div>

    <!-- ═══ NEXT MATCH COUNTDOWN ═══ -->
    ${nextMatch ? `
    <div class="next-match-card" onclick="${!hasPredOnNext ? `showSection('predictions')` : ''}">
      <div class="nmc-header">
        <span class="nmc-label">⏱️ המשחק הבא</span>
        <span class="nmc-stage">${nextMatch.stageLabel}</span>
      </div>
      <div class="nmc-teams">
        <div class="nmc-team">
          <span class="nmc-flag">${nextMatch.home_flag}</span>
          <span class="nmc-name">${esc(nextMatch.home_team_name || nextMatch.home_team_label)}</span>
        </div>
        <div class="nmc-center">
          <div class="nmc-countdown-wrap">
            <span id="countdown-timer" class="nmc-countdown">00:00:00:00</span>
            <div class="nmc-countdown-labels">
              <span>ימים</span><span>שע'</span><span>דק'</span><span>שנ'</span>
            </div>
          </div>
          <div class="nmc-date">${nextMatch.dateInfo?.date || ''} ${nextMatch.dateInfo?.time || ''}</div>
        </div>
        <div class="nmc-team">
          <span class="nmc-flag">${nextMatch.away_flag}</span>
          <span class="nmc-name">${esc(nextMatch.away_team_name || nextMatch.away_team_label)}</span>
        </div>
      </div>
      ${!hasPredOnNext ? `
        <div class="nmc-bet-cta" onclick="event.stopPropagation();openPredictionModal('${nextMatch.id}')">
          ✏️ לחץ כדי לבצע הימור על המשחק הזה
        </div>` : `
        <div class="nmc-bet-done">
          ✅ הניחוש שלך: ${userPreds[nextMatch.id]?.home}:${userPreds[nextMatch.id]?.away}
        </div>`
      }
    </div>` : `
    <div class="next-match-card" style="text-align:center;padding:28px">
      <div style="font-size:36px;margin-bottom:8px">🏆</div>
      <div style="font-size:16px;font-weight:700">אין משחקים קרובים</div>
      <div style="font-size:13px;color:var(--w60);margin-top:4px">כל המשחקים הסתיימו או טרם נקבעו</div>
    </div>`}

    <!-- ═══ 4-STATS GRID ═══ -->
    <div class="stats-grid-2">
      <div class="stat-card stat-card--exact">
        <div class="sc-icon">🎯</div>
        <div class="sc-num">${myEntry.exact}</div>
        <div class="sc-label">מדויק</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="background:var(--gold);width:${totalFinished > 0 ? Math.round(myEntry.exact/totalFinished*100) : 0}%"></div></div>
      </div>
      <div class="stat-card stat-card--dir">
        <div class="sc-icon">✅</div>
        <div class="sc-num">${myEntry.direction}</div>
        <div class="sc-label">כיוון נכון</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="background:var(--green);width:${totalFinished > 0 ? Math.round(myEntry.direction/totalFinished*100) : 0}%"></div></div>
      </div>
      <div class="stat-card stat-card--miss">
        <div class="sc-icon">❌</div>
        <div class="sc-num">${myEntry.miss}</div>
        <div class="sc-label">פספוסים</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="background:var(--red);width:${totalFinished > 0 ? Math.round(myEntry.miss/totalFinished*100) : 0}%"></div></div>
      </div>
      <div class="stat-card stat-card--total">
        <div class="sc-icon">📊</div>
        <div class="sc-num">${totalPreds}</div>
        <div class="sc-label">ניחושים הוגשו</div>
        <div class="sc-bar"><div class="sc-bar-fill" style="background:var(--orange);width:${App.knockoutMatches.length > 0 ? Math.round(totalPreds/App.knockoutMatches.length*100) : 0}%"></div></div>
      </div>
    </div>

    <!-- ═══ MINI LIVE LEADERBOARD ═══ -->
    <div class="mini-lb">
      <div class="mini-lb-header">
        <span class="mini-lb-title">🏅 טבלת ניקוד</span>
        <span class="mini-lb-live"><span class="live-dot-sm"></span> חי</span>
        <button class="mini-lb-more" onclick="showSection('leaderboard')">הכל ←</button>
      </div>
      ${board.slice(0, 5).map((e, i) => {
        const rank = i + 1;
        const icon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        const isMe = e.name === App.currentUser;
        const trend = e.trend === 'up' ? '<span style="color:var(--green);font-size:10px">↑</span>' : e.trend === 'down' ? '<span style="color:var(--red);font-size:10px">↓</span>' : '';
        const hitRate = (e.exact + e.direction + e.miss) > 0 
          ? Math.round((e.exact + e.direction) / (e.exact + e.direction + e.miss) * 100) 
          : 0;
        return `<div class="mini-lb-row ${isMe ? 'mini-lb-me' : ''}">
          <span class="mlb-rank">${icon}</span>
          <div class="mlb-ava">${(e.avatar || e.name.charAt(0)).toUpperCase()}</div>
          <div class="mlb-info">
            <span class="mlb-name">${esc(e.name)}${isMe ? ' 👤' : ''}</span>
            <span class="mlb-sub">${hitRate}% פגיעות • ${e.exact}🎯</span>
          </div>
          <div class="mlb-right">
            <span class="mlb-pts">${e.points}</span>
            ${trend}
          </div>
        </div>`;
      }).join('')}
    </div>

    <!-- ═══ RECENT ACTIVITY ═══ -->
    ${recent.length > 0 ? `
    <div class="recent-card">
      <div class="recent-title">🕐 פעילות אחרונה</div>
      ${recent.map(r => `
        <div class="recent-row">
          <div class="rr-left">
            <span class="rr-flags">${r.homeFlag}${r.awayFlag}</span>
            <div>
              <div class="rr-match">${esc(r.homeName)} נגד ${esc(r.awayName)}</div>
              <div class="rr-pred">הניחוש: ${r.predHome}:${r.predAway}</div>
            </div>
          </div>
          <span class="rr-result rr-${r.status}">${r.statusText}</span>
        </div>`).join('')}
    </div>` : ''}

    <!-- Logout -->
    <button class="home-logout-btn" onclick="handleLogout()">🚪 יציאה מהחשבון</button>
  `;

  // Start countdown immediately
  updateCountdown();
}

function buildRecentActivity(userPreds, limit) {
  const items = [];
  for (const matchId in userPreds) {
    const match = App.allMatches.find(m => m.id == matchId);
    if (!match) continue;
    const pred = userPreds[matchId];
    let status = 'pending', statusText = 'ממתין ⏳';
    if (match.finished && match.home_score !== null) {
      const r = DB.calculatePoints(pred, { home: match.home_score, away: match.away_score }, match.type);
      status = r.type;
      statusText = r.type === 'exact' ? `🎯 +${r.points}` : r.type === 'direction' ? `✅ +${r.points}` : '❌ 0';
    }
    items.push({
      homeFlag: match.home_flag || '🏳️', awayFlag: match.away_flag || '🏳️',
      homeName: match.home_team_name || match.home_team_label || '?',
      awayName: match.away_team_name || match.away_team_label || '?',
      predHome: pred.home, predAway: pred.away,
      status, statusText, savedAt: new Date(pred.savedAt).getTime() || 0,
    });
  }
  return items.sort((a,b) => b.savedAt - a.savedAt).slice(0, limit);
}

// ═══════════════════════════════════════════
// PREDICTIONS PAGE
// ═══════════════════════════════════════════
function setStageFilter(stage) {
  App.currentStageFilter = stage;
  document.querySelectorAll('.sf-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`sf-${stage}`)?.classList.add('active');
  renderPredictions();
}

async function renderPredictions() {
  const container = document.getElementById('predictions-content');
  // Show shimmer
  container.innerHTML = Array(4).fill(`<div class="shimmer-card" style="height:140px;margin-bottom:10px"></div>`).join('');

  const typeMap = { r16: ['r32'], qf: ['qf'], sf: ['sf'], final: ['final'] };
  const types   = typeMap[App.currentStageFilter] || ['r32'];
  const matches = App.knockoutMatches
    .filter(m => types.includes(m.type))
    .sort((a,b) => (a.dateInfo?.timestamp || 0) - (b.dateInfo?.timestamp || 0));

  if (!matches.length) {
    container.innerHTML = `<div class="empty-state"><div class="es-icon">⏳</div><div class="es-title">משחקים יתפרסמו בקרוב</div></div>`;
    return;
  }

  // Load user predictions
  let userPreds = {};
  try { userPreds = await DB.getUserPredictions(App.currentUser); } catch {}

  container.innerHTML = matches.map(m => renderPredMatchCard(m, userPreds)).join('');
}

function renderPredMatchCard(match, userPreds) {
  const pred = userPreds[match.id] || userPreds[String(match.id)];
  const isClickable = !match.finished;
  const tagClass = { r32:'tag-r32', qf:'tag-qf', sf:'tag-sf', final:'tag-final' }[match.type] || 'tag-r32';
  let cardClass = 'pred-match-card';
  if (isClickable) cardClass += ' clickable';

  let scoreHTML, statusHTML;
  if (match.finished) {
    scoreHTML = `<div class="pmc-score"><span>${match.home_score}</span><span class="pmc-score-sep">:</span><span>${match.away_score}</span></div>`;
    statusHTML = `<div class="pmc-status pmc-status--fin">✅ הסתיים</div>`;
    const hp = match.home_penalty_score, ap = match.away_penalty_score;
    if (hp != null && ap != null && String(hp) !== 'null' && String(ap) !== 'null')
      statusHTML += `<div style="font-size:10px;color:var(--gold);margin-top:3px">פנדלים ${hp}:${ap}</div>`;
  } else if (match.is_live) {
    scoreHTML = `<div class="pmc-score"><span>${match.home_score ?? 0}</span><span class="pmc-score-sep">:</span><span>${match.away_score ?? 0}</span></div>`;
    statusHTML = `<div class="pmc-status pmc-status--live">🔴 חי ${match.time_elapsed ? match.time_elapsed+"'" : ''}</div>`;
  } else {
    scoreHTML = `<div class="pmc-vs">VS</div>`;
    statusHTML = `<div class="pmc-status pmc-status--up">${match.dateInfo?.time || 'בקרוב'}</div>`;
  }

  let bottomHTML = '';
  if (pred) {
    let resultBadge = '';
    if (match.finished && match.home_score !== null) {
      const r = DB.calculatePoints(pred, { home: match.home_score, away: match.away_score }, match.type);
      if (r.type === 'exact') { resultBadge = `<span class="pmc-result-badge pmc-result-badge--exact">🎯 +${r.points} נק'</span>`; cardClass += ' pred-exact'; }
      else if (r.type === 'direction') { resultBadge = `<span class="pmc-result-badge pmc-result-badge--dir">✅ +${r.points} נק'</span>`; cardClass += ' pred-correct'; }
      else { resultBadge = `<span class="pmc-result-badge pmc-result-badge--miss">❌ 0 נק'</span>`; }
    }
    cardClass += ' has-pred';
    bottomHTML = `<div class="pmc-bottom">
      <div class="pmc-your-pred">
        🗳️ ניחוש: <span class="pmc-pred-score">${pred.home}:${pred.away}</span>
        ${isClickable ? '<span style="font-size:11px;color:var(--orange);margin-right:6px">ערוך</span>' : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        ${resultBadge}
        ${isClickable ? `<button class="tip-btn" onclick="event.stopPropagation();openTipModal('${match.id}')">🔮 TIP</button>` : ''}
      </div>
    </div>`;
  } else if (isClickable) {
    bottomHTML = `<div class="pmc-bottom">
      <div class="pmc-cta"><span>✏️</span>לחץ כדי לשים תוצאה</div>
      <button class="tip-btn" onclick="event.stopPropagation();openTipModal('${match.id}')">🔮 TIP</button>
    </div>`;
  }

  const homeTeamHTML = match.home_team_name
    ? `<div class="pmc-flag">${match.home_flag}</div><div class="pmc-name">${esc(match.home_team_name)}</div>`
    : `<div class="pmc-flag">🏳️</div><div class="pmc-tbd">${esc(match.home_team_label || 'TBD')}</div>`;
  const awayTeamHTML = match.away_team_name
    ? `<div class="pmc-flag">${match.away_flag}</div><div class="pmc-name">${esc(match.away_team_name)}</div>`
    : `<div class="pmc-flag">🏳️</div><div class="pmc-tbd">${esc(match.away_team_label || 'TBD')}</div>`;

  return `
    <div class="${cardClass}" ${isClickable ? `onclick="openPredictionModal('${match.id}')"` : ''}>
      <div class="pmc-top">
        <span class="pmc-stage-tag ${tagClass}">${match.stageLabel}</span>
        <div class="pmc-time">
          ${match.is_live ? '<span style="color:var(--red);font-weight:800;font-size:11px">🔴 חי</span>' : `<span>${match.dateInfo?.time || ''}</span>`}
          <span class="pmc-date">${match.dateInfo?.date || match.local_date || ''}</span>
        </div>
      </div>
      <div class="pmc-teams">
        <div class="pmc-team">${homeTeamHTML}</div>
        <div class="pmc-score-area">${scoreHTML}${statusHTML}</div>
        <div class="pmc-team">${awayTeamHTML}</div>
      </div>
      ${bottomHTML}
    </div>`;
}

// ═══════════════════════════════════════════
// PREDICTION MODAL
// ═══════════════════════════════════════════
async function openPredictionModal(matchId) {
  const match = App.knockoutMatches.find(m => m.id == matchId);
  if (!match || match.finished) return;
  App.modalMatchId = matchId;

  document.getElementById('modal-stage-label').textContent = match.stageLabel;
  document.getElementById('mm-home-flag').textContent = match.home_flag || '🏳️';
  document.getElementById('mm-home-name').textContent  = match.home_team_name || match.home_team_label || 'בית';
  document.getElementById('mm-away-flag').textContent  = match.away_flag || '🏳️';
  document.getElementById('mm-away-name').textContent  = match.away_team_name || match.away_team_label || 'חוץ';

  const scoring = DB.SCORING[DB.getStageFromType(match.type)] || DB.SCORING.r32;
  document.getElementById('modal-pts-exact').textContent = scoring.exact;
  document.getElementById('modal-pts-dir').textContent   = scoring.direction;

  let existing = null;
  try { existing = await DB.getPrediction(matchId, App.currentUser); } catch {}

  const existRow = document.getElementById('modal-existing-row');
  if (existing) {
    existRow.style.display = 'flex';
    document.getElementById('modal-existing-val').textContent = `${existing.home}:${existing.away}`;
    document.getElementById('pred-home-score').value = existing.home;
    document.getElementById('pred-away-score').value = existing.away;
    document.getElementById('modal-submit-btn').textContent = 'עדכן ניחוש ✓';
  } else {
    existRow.style.display = 'none';
    document.getElementById('pred-home-score').value = 0;
    document.getElementById('pred-away-score').value = 0;
    document.getElementById('modal-submit-btn').textContent = 'שמור ניחוש ✓';
  }

  document.getElementById('prediction-modal').classList.remove('hidden');
}

function closePredictionModal() {
  document.getElementById('prediction-modal').classList.add('hidden');
  App.modalMatchId = null;
}

function stepScore(side, delta) {
  const id = side === 'home' ? 'pred-home-score' : 'pred-away-score';
  const input = document.getElementById(id);
  input.value = Math.max(0, Math.min(20, (parseInt(input.value) || 0) + delta));
}

async function submitPrediction() {
  const matchId = App.modalMatchId;
  if (!matchId) return;
  const homeScore = parseInt(document.getElementById('pred-home-score').value) || 0;
  const awayScore = parseInt(document.getElementById('pred-away-score').value) || 0;

  const btn = document.getElementById('modal-submit-btn');
  btn.textContent = 'שומר...';
  btn.disabled = true;

  try {
    await DB.setPrediction(matchId, App.currentUser, homeScore, awayScore);
    closePredictionModal();
    const match = App.knockoutMatches.find(m => m.id == matchId);
    showToast(`✅ נשמר! ${match?.home_team_name || 'בית'} ${homeScore}:${awayScore} ${match?.away_team_name || 'חוץ'}`, 'success');
    spawnConfetti();
    renderPredictions();
    // Refresh leaderboard cache
    App.leaderboardCache = await DB.computeLeaderboard(App.allMatches);
  } catch (e) {
    showToast('שגיאה בשמירת ניחוש', 'error');
    console.error(e);
  } finally {
    btn.textContent = 'שמור ניחוש ✓';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════
// AI TIP MODAL
// ═══════════════════════════════════════════
function openTipModal(matchId) {
  const match = App.knockoutMatches.find(m => m.id == matchId);
  if (!match) return;
  App.tipModalMatchId = matchId;

  const modal = document.getElementById('tip-modal');
  const content = document.getElementById('tip-modal-content');
  modal.classList.remove('hidden');

  // Show loading state
  content.innerHTML = `
    <div class="tip-loading">
      <div class="tip-loading-orb"></div>
      <div class="tip-loading-title">AI סורק את הנתונים...</div>
      <div class="tip-loading-steps" id="tip-steps">
        <div class="tip-step" id="step-1">🔍 מחפש נתוני קבוצות...</div>
        <div class="tip-step" id="step-2">📊 מנתח פורמה אחרונה...</div>
        <div class="tip-step" id="step-3">🏥 בודק פציעות והרכב...</div>
        <div class="tip-step" id="step-4">🤖 מחשב תחזית...</div>
      </div>
    </div>`;

  // Animate steps
  let stepIdx = 0;
  const stepInterval = setInterval(() => {
    document.querySelectorAll('.tip-step').forEach((s, i) => {
      s.classList.toggle('tip-step--active', i === stepIdx);
      s.classList.toggle('tip-step--done', i < stepIdx);
    });
    stepIdx = (stepIdx + 1) % 4;
  }, 800);

  // Fetch AI tip
  fetchAITip(match)
    .then(tip => {
      clearInterval(stepInterval);
      renderTipResult(tip, match, content);
    })
    .catch(err => {
      clearInterval(stepInterval);
      content.innerHTML = `
        <div style="text-align:center;padding:40px">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <div style="font-size:16px;font-weight:700;color:var(--w80)">שגיאת AI</div>
          <div style="font-size:13px;color:var(--w60);margin-top:8px">${err.message}</div>
          <button class="modal-cancel-btn" style="margin-top:20px" onclick="closeTipModal()">סגור</button>
        </div>`;
    });
}

function renderTipResult(tip, match, container) {
  const confColor = tip.confidence === 'high' ? 'var(--green)' : tip.confidence === 'medium' ? 'var(--gold)' : 'var(--red)';
  const confLabel = tip.confidence === 'high' ? 'ביטחון גבוה' : tip.confidence === 'medium' ? 'ביטחון בינוני' : 'ביטחון נמוך';

  container.innerHTML = `
    <div class="tip-result">
      <div class="tip-result-header">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--orange)">🔮 ניחוש AI</span>
        <span class="tip-conf-badge" style="background:${confColor}22;color:${confColor};border:1px solid ${confColor}44">${confLabel}</span>
      </div>

      <div class="tip-teams-score">
        <div class="tip-team">
          <div style="font-size:36px">${tip.homeFlag}</div>
          <div style="font-size:13px;font-weight:700;margin-top:4px">${esc(tip.homeName)}</div>
          ${tip.home_form ? `<div class="tip-form">${tip.home_form.split('').map(c => `<span class="tf-${c}">${c}</span>`).join('')}</div>` : ''}
        </div>
        <div class="tip-score-big">
          <span class="tsb-num">${tip.home_score}</span>
          <span class="tsb-sep">:</span>
          <span class="tsb-num">${tip.away_score}</span>
        </div>
        <div class="tip-team">
          <div style="font-size:36px">${tip.awayFlag}</div>
          <div style="font-size:13px;font-weight:700;margin-top:4px">${esc(tip.awayName)}</div>
          ${tip.away_form ? `<div class="tip-form">${tip.away_form.split('').map(c => `<span class="tf-${c}">${c}</span>`).join('')}</div>` : ''}
        </div>
      </div>

      ${tip.key_insight ? `<div class="tip-insight">💡 ${esc(tip.key_insight)}</div>` : ''}

      <div class="tip-reasoning">
        ${(tip.reasoning || []).filter(Boolean).map(r => `<div class="tip-reason-item">• ${esc(r)}</div>`).join('')}
      </div>

      <button class="modal-submit-btn" onclick="useTipPrediction(${tip.home_score}, ${tip.away_score}, '${match.id}')">
        ✅ השתמש בניחוש הזה
      </button>
      <button class="modal-cancel-btn" onclick="closeTipModal()">סגור</button>
    </div>`;
}

function closeTipModal() {
  document.getElementById('tip-modal').classList.add('hidden');
  App.tipModalMatchId = null;
}

function useTipPrediction(homeScore, awayScore, matchId) {
  closeTipModal();
  // Open prediction modal with pre-filled values
  openPredictionModal(matchId).then(() => {
    document.getElementById('pred-home-score').value = homeScore;
    document.getElementById('pred-away-score').value = awayScore;
  });
}

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
async function renderLeaderboard() {
  const container = document.getElementById('leaderboard-content');
  container.innerHTML = `<div class="shimmer-card" style="height:220px;margin-bottom:16px"></div>
    ${Array(4).fill(`<div class="shimmer-card" style="height:60px;margin-bottom:6px"></div>`).join('')}`;

  const board = App.leaderboardCache;

  if (!board.length) {
    container.innerHTML = `<div class="empty-state"><div class="es-icon">🏆</div><div class="es-title">אין משתמשים עדיין</div></div>`;
    return;
  }

  container.innerHTML = `
    <div class="lb-realtime-badge"><span class="live-dot-sm"></span> מתעדכן בזמן אמת</div>
    ${renderPodium(board)}
    <div class="lb-table-wrap">
      ${board.map((e, i) => {
        const rank = i + 1;
        const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        const rankCls  = rank <= 3 ? `r${rank}` : '';
        const trend    = e.trend === 'up' ? '<span style="color:var(--green)">↑</span>' : e.trend === 'down' ? '<span style="color:var(--red)">↓</span>' : '<span style="color:var(--w30)">−</span>';
        const isMe     = e.name === App.currentUser;
        const hitRate  = (e.exact + e.direction + e.miss) > 0 ? Math.round((e.exact + e.direction) / (e.exact + e.direction + e.miss) * 100) : 0;
        return `
          <div class="lb-row ${isMe ? 'lb-row--me' : ''}">
            <div class="lb-rank-col ${rankCls}">${rankIcon}</div>
            <div class="lb-ava">${(e.avatar || e.name.charAt(0)).toUpperCase()}</div>
            <div class="lb-info">
              <div class="lb-pname">${esc(e.name)}${isMe ? ' 👤' : ''}</div>
              <div class="lb-meta">${e.exact}🎯 ${e.direction}✅ • ${hitRate}% פגיעה</div>
            </div>
            <div class="lb-pts-col">${e.points}</div>
            <div class="lb-trend">${trend}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderPodium(board) {
  if (!board.length) return '';
  const order = board.length >= 3 ? [board[1], board[0], board[2]] : board.length === 2 ? [null, board[0], board[1]] : [null, board[0], null];
  const cfgs  = [{ cls:'pc-2', rank:2 }, { cls:'pc-1', rank:1 }, { cls:'pc-3', rank:3 }];
  return `<div class="podium-wrap">
    ${order.map((e, i) => {
      if (!e) return `<div class="podium-card" style="visibility:hidden"><div class="podium-ava"></div><div class="podium-block"></div></div>`;
      const c = cfgs[i];
      return `<div class="podium-card ${c.cls}">
        <div class="podium-ava">
          ${c.rank === 1 ? `<span class="pcrown">👑</span>` : ''}
          ${(e.avatar || e.name.charAt(0)).toUpperCase()}
        </div>
        <div class="podium-pname">${esc(e.name)}</div>
        <div class="podium-ppts">${e.points}נק'</div>
        <div class="podium-block">${c.rank}</div>
      </div>`;
    }).join('')}
  </div>`;
}

// ═══════════════════════════════════════════
// LIVE SECTION
// ═══════════════════════════════════════════
function renderLive() {
  const container = document.getElementById('live-content');
  const liveMatches = API.getLiveMatches(App.knockoutMatches);
  const recent = App.knockoutMatches
    .filter(m => m.finished)
    .sort((a,b) => (b.dateInfo?.timestamp || 0) - (a.dateInfo?.timestamp || 0))
    .slice(0, 8);
  const display = [...liveMatches];
  for (const m of recent) if (!display.find(x => x.id === m.id)) display.push(m);

  if (!display.length) {
    container.innerHTML = `<div class="empty-state"><div class="es-icon">📡</div><div class="es-title">אין משחקים פעילים</div></div>`;
    return;
  }

  container.innerHTML = display.map(match => {
    const isLive = match.is_live;
    const homeScorers = (match.home_scorers || []).map(s => `<span class="lc-scorer-h">⚽ ${s}</span>`).join('<br>');
    const awayScorers = (match.away_scorers || []).map(s => `<span class="lc-scorer-a">⚽ ${s}</span>`).join('<br>');
    const hp = match.home_penalty_score, ap = match.away_penalty_score;
    const penStr = (hp != null && ap != null && String(hp) !== 'null' && String(ap) !== 'null')
      ? `<div style="text-align:center;font-size:11px;color:var(--gold);margin-top:8px">🥅 פנדלים: ${hp}:${ap}</div>` : '';
    return `
      <div class="live-card ${isLive ? 'is-live' : ''}">
        <div class="lc-header">
          <span class="lc-stage">${match.stageLabel}</span>
          ${isLive ? `<span class="lc-live-tag">● ${match.time_elapsed || 'חי'}'</span>` : `<span class="lc-fin-tag">✅ הסתיים</span>`}
        </div>
        <div class="lc-teams">
          <div class="lc-team"><div class="lc-flag">${match.home_flag}</div><div class="lc-tname">${esc(match.home_team_name || match.home_team_label)}</div></div>
          <div class="lc-score"><span>${match.home_score ?? (isLive ? 0 : '?')}</span><span class="lc-score-sep">:</span><span>${match.away_score ?? (isLive ? 0 : '?')}</span></div>
          <div class="lc-team"><div class="lc-flag">${match.away_flag}</div><div class="lc-tname">${esc(match.away_team_name || match.away_team_label)}</div></div>
        </div>
        ${penStr}
        ${homeScorers || awayScorers ? `<div class="lc-scorers">${homeScorers}${homeScorers && awayScorers ? '<br>' : ''}${awayScorers}</div>` : ''}
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════
function showToast(msg, type = 'info', ms = 3200) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s ease forwards'; setTimeout(() => t.remove(), 300); }, ms);
}

// ═══════════════════════════════════════════
// CONFETTI
// ═══════════════════════════════════════════
function spawnConfetti() {
  const c = document.getElementById('confetti-container');
  const colors = ['#f97316','#fbbf24','#fff','#ef4444','#22c55e'];
  const shapes = ['●','■','▲','★'];
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.color = colors[Math.floor(Math.random() * colors.length)];
      p.style.fontSize = (Math.random() * 10 + 7) + 'px';
      p.style.animationDuration = (Math.random() * 1.8 + 1.2) + 's';
      p.style.animationDelay = Math.random() * 0.4 + 's';
      p.textContent = shapes[Math.floor(Math.random() * shapes.length)];
      c.appendChild(p);
      setTimeout(() => p.remove(), 2500);
    }, i * 18);
  }
}

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
