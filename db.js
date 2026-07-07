/**
 * BetOz - Supabase Client & Database Layer
 * Replaces db.js localStorage with persistent cloud storage
 * Config: fill in SUPABASE_URL and SUPABASE_ANON_KEY below
 */

// ═══════════════════════════════════════════
// CONFIG — Fill these in!
// ═══════════════════════════════════════════
// Keys loaded from config.js (not committed to git)
const SUPABASE_URL      = (window.BETOZ_CONFIG || {}).SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = (window.BETOZ_CONFIG || {}).SUPABASE_ANON_KEY || '';

// ═══════════════════════════════════════════
// SCORING (unchanged from db.js)
// ═══════════════════════════════════════════
const SCORING = {
  r32:   { exact: 5,  direction: 2 },
  r16:   { exact: 5,  direction: 2 },
  qf:    { exact: 8,  direction: 3 },
  sf:    { exact: 10, direction: 4 },
  final: { exact: 15, direction: 5 },
};

function getStageFromType(type) {
  if (type === 'r32' || type === 'r16') return 'r32';
  if (type === 'qf')    return 'qf';
  if (type === 'sf')    return 'sf';
  if (type === 'final') return 'final';
  return 'r32';
}

function calculatePoints(prediction, result, type) {
  if (!prediction || result.home === null || result.away === null) return { points: 0, type: 'miss' };
  const pts = SCORING[getStageFromType(type)] || SCORING.r32;
  const predHome   = parseInt(prediction.home);
  const predAway   = parseInt(prediction.away);
  const actualHome = parseInt(result.home);
  const actualAway = parseInt(result.away);
  if (predHome === actualHome && predAway === actualAway)
    return { points: pts.exact, type: 'exact' };
  const predWinner   = predHome > predAway ? 'home' : predHome < predAway ? 'away' : 'draw';
  const actualWinner = actualHome > actualAway ? 'home' : actualHome < actualAway ? 'away' : 'draw';
  if (predWinner === actualWinner)
    return { points: pts.direction, type: 'direction' };
  return { points: 0, type: 'miss' };
}

// ═══════════════════════════════════════════
// SUPABASE REST CLIENT (no npm, pure fetch)
// ═══════════════════════════════════════════
const SB = {
  headers() {
    return {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    };
  },

  async select(table, query = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: this.headers()
    });
    if (!r.ok) throw new Error(`SB select ${table}: ${r.status}`);
    return r.json();
  },

  async upsert(table, body, onConflict = '') {
    const headers = this.headers();
    if (onConflict) headers['Prefer'] = `resolution=merge-duplicates,return=representation`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`SB upsert ${table}: ${r.status} ${err}`);
    }
    return r.json();
  },

  async patch(table, query, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`SB patch ${table}: ${r.status} ${err}`);
    }
    return r.json();
  },

  // Realtime subscription via Supabase websocket (postgres_changes)
  realtimeChannel: null,
  realtimeWS: null,
  realtimeCallbacks: [],

  subscribeToTable(table, callback) {
    this.realtimeCallbacks.push(callback);
    if (this.realtimeWS && this.realtimeWS.readyState === WebSocket.OPEN) return;

    const wsUrl = SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPABASE_ANON_KEY + '&vsn=1.0.0';
    const ws = new WebSocket(wsUrl);
    this.realtimeWS = ws;
    let heartbeat;

    ws.onopen = () => {
      // Join channel
      ws.send(JSON.stringify({
        topic: `realtime:public:${table}`,
        event: 'phx_join',
        payload: { config: { broadcast: { self: false }, presence: {}, postgres_changes: [{ event: '*', schema: 'public', table }] } },
        ref: '1',
      }));
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
        }
      }, 30000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === 'postgres_changes' || (msg.payload && msg.payload.data)) {
          this.realtimeCallbacks.forEach(cb => cb(msg));
        }
      } catch {}
    };

    ws.onclose = () => {
      clearInterval(heartbeat);
      // Reconnect after 5s
      setTimeout(() => this.subscribeToTable(table, () => {}), 5000);
    };
  },
};

// ═══════════════════════════════════════════
// CURRENT USER (still localStorage — just session)
// ═══════════════════════════════════════════
const SESSION_KEY = 'betoz_user';

function getCurrentUser()    { return localStorage.getItem(SESSION_KEY) || null; }
function setCurrentUser(name) { localStorage.setItem(SESSION_KEY, name); }
function clearCurrentUser()   { localStorage.removeItem(SESSION_KEY); }

// ═══════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════
async function getUsers() {
  return SB.select('users', 'select=name,avatar,bonus_points&order=created_at.asc');
}

async function addUser(name) {
  try {
    await SB.upsert('users', { name, bonus_points: 0 }, 'name');
  } catch (e) {
    console.warn('addUser:', e);
  }
}

// ═══════════════════════════════════════════
// PREDICTIONS
// ═══════════════════════════════════════════
async function setPrediction(matchId, userName, homeScore, awayScore) {
  return SB.upsert('predictions', {
    match_id: String(matchId),
    user_name: userName,
    home_score: parseInt(homeScore),
    away_score: parseInt(awayScore),
    saved_at: new Date().toISOString(),
  }, 'match_id,user_name');
}

async function getPrediction(matchId, userName) {
  const rows = await SB.select('predictions', `match_id=eq.${matchId}&user_name=eq.${encodeURIComponent(userName)}&select=home_score,away_score,saved_at`);
  if (!rows || !rows.length) return null;
  return { home: rows[0].home_score, away: rows[0].away_score, savedAt: rows[0].saved_at };
}

async function getUserPredictions(userName) {
  const rows = await SB.select('predictions', `user_name=eq.${encodeURIComponent(userName)}&select=match_id,home_score,away_score,saved_at`);
  const result = {};
  for (const r of (rows || [])) {
    result[r.match_id] = { home: r.home_score, away: r.away_score, savedAt: r.saved_at };
  }
  return result;
}

async function getAllPredictions() {
  return SB.select('predictions', 'select=match_id,user_name,home_score,away_score,saved_at');
}

// ═══════════════════════════════════════════
// ADMIN FUNCTIONS
// ═══════════════════════════════════════════
async function setUserBonusPoints(userName, bonus) {
  // Try patch first (user exists), then upsert
  try {
    await SB.patch('users', `name=eq.${encodeURIComponent(userName)}`, { bonus_points: parseInt(bonus) });
  } catch {
    await SB.upsert('users', { name: userName, bonus_points: parseInt(bonus) }, 'name');
  }
}

async function setMatchOverride(matchId, homeScore, awayScore) {
  return SB.upsert('match_overrides', {
    match_id: String(matchId),
    home_score: parseInt(homeScore),
    away_score: parseInt(awayScore),
    set_at: new Date().toISOString(),
  }, 'match_id');
}

async function getMatchOverrides() {
  try {
    const rows = await SB.select('match_overrides', 'select=match_id,home_score,away_score');
    const map = {};
    for (const r of (rows || [])) map[r.match_id] = { home: r.home_score, away: r.away_score };
    return map;
  } catch (e) {
    // Table might not exist yet - return empty silently
    console.warn('match_overrides table not ready:', e.message);
    return {};
  }
}

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
async function computeLeaderboard(matches) {
  const [users, allPreds, overrides] = await Promise.all([
    getUsers(), getAllPredictions(), getMatchOverrides()
  ]);
  // Index predictions by matchId → userName
  const predsMap = {};
  for (const p of (allPreds || [])) {
    if (!predsMap[p.match_id]) predsMap[p.match_id] = {};
    predsMap[p.match_id][p.user_name] = { home: p.home_score, away: p.away_score };
  }

  const board = [];
  for (const user of (users || [])) {
    let totalPoints = user.bonus_points || 0;
    let exactCount = 0, dirCount = 0, missCount = 0;

    for (const matchId in predsMap) {
      const pred = predsMap[matchId][user.name];
      if (!pred) continue;
      const match = matches.find(m => m.id == matchId);
      if (!match) continue;

      // Use admin override if available, else API result
      const override = overrides[String(matchId)];
      let hs, as_;
      if (override) {
        hs  = override.home;
        as_ = override.away;
      } else {
        if (!match.finished) continue;
        hs  = match.home_score;
        as_ = match.away_score;
      }
      if (hs === null || hs === undefined || as_ === null || as_ === undefined) continue;

      const r = calculatePoints(pred, { home: hs, away: as_ }, match.type);
      totalPoints += r.points;
      if (r.type === 'exact') exactCount++;
      else if (r.type === 'direction') dirCount++;
      else missCount++;
    }

    board.push({
      name:      user.name,
      avatar:    user.avatar || user.name.charAt(0).toUpperCase(),
      points:    totalPoints,
      exact:     exactCount,
      direction: dirCount,
      miss:      missCount,
      bonus:     user.bonus_points || 0,
    });
  }

  board.sort((a, b) => b.points - a.points || b.exact - a.exact);

  // Trends (localStorage for speed)
  const prevKey  = 'betoz_lb_prev';
  const prevData = JSON.parse(localStorage.getItem(prevKey) || '{}');
  const result   = board.map((e, i) => {
    const prev = prevData[e.name];
    const trend = prev === undefined ? 'same' : e.points > prev ? 'up' : e.points < prev ? 'down' : 'same';
    return { ...e, rank: i + 1, trend };
  });
  const newPrev = {};
  for (const e of result) newPrev[e.name] = e.points;
  localStorage.setItem(prevKey, JSON.stringify(newPrev));
  return result;
}

// ═══════════════════════════════════════════
// REALTIME SUBSCRIPTION
// ═══════════════════════════════════════════
function subscribeLeaderboard(onUpdate) {
  SB.subscribeToTable('predictions', onUpdate);
}

// ═══════════════════════════════════════════
// EXPORT — global DB object (matches old db.js API surface)
// ═══════════════════════════════════════════
const DB = {
  getCurrentUser,
  setCurrentUser,
  clearCurrentUser,
  getUsers,
  addUser,
  getPrediction,
  setPrediction,
  getUserPredictions,
  getAllPredictions,
  computeLeaderboard,
  subscribeLeaderboard,
  calculatePoints,
  SCORING,
  getStageFromType,
  // admin
  setUserBonusPoints,
  setMatchOverride,
  getMatchOverrides,
};
