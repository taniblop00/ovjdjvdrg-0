/**
 * OzBet - API Module
 * Fetches live World Cup 2026 data from worldcup26.ir (free, no API key needed)
 * Falls back to cached/static data if API is unavailable
 */

const API = (() => {
  const BASE_URL = 'https://worldcup26.ir';
  const CACHE_KEY = 'ozbet_api_cache';
  const CACHE_TTL = 30000; // 30 seconds - fast refresh for live matches

  // Complete flag emoji mapping for all WC 2026 teams
  const FLAGS = {
    // Group A
    'Mexico': '🇲🇽', 'South Korea': '🇰🇷', 'Czech Republic': '🇨🇿', 'South Africa': '🇿🇦',
    // Group B
    'Canada': '🇨🇦', 'Switzerland': '🇨🇭', 'Bosnia and Herzegovina': '🇧🇦', 'Qatar': '🇶🇦',
    // Group C
    'Brazil': '🇧🇷', 'Morocco': '🇲🇦', 'Haiti': '🇭🇹', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    // Group D
    'United States': '🇺🇸', 'USA': '🇺🇸', 'Paraguay': '🇵🇾', 'Australia': '🇦🇺', 'Turkey': '🇹🇷',
    // Group E
    'Germany': '🇩🇪', 'Ivory Coast': '🇨🇮', 'Ecuador': '🇪🇨', 'Curaçao': '🇨🇼',
    // Group F
    'Netherlands': '🇳🇱', 'Japan': '🇯🇵', 'Sweden': '🇸🇪', 'Tunisia': '🇹🇳',
    // Group G
    'Belgium': '🇧🇪', 'Egypt': '🇪🇬', 'Iran': '🇮🇷', 'New Zealand': '🇳🇿',
    // Group H
    'Spain': '🇪🇸', 'Uruguay': '🇺🇾', 'Saudi Arabia': '🇸🇦', 'Cape Verde': '🇨🇻',
    // Group I
    'France': '🇫🇷', 'Norway': '🇳🇴', 'Senegal': '🇸🇳', 'Iraq': '🇮🇶',
    // Group J
    'Argentina': '🇦🇷', 'Algeria': '🇩🇿', 'Austria': '🇦🇹', 'Jordan': '🇯🇴',
    // Group K
    'Portugal': '🇵🇹', 'Colombia': '🇨🇴', 'Democratic Republic of the Congo': '🇨🇩', 'Uzbekistan': '🇺🇿',
    // Group L
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatia': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
  };

  function getFlag(teamName) {
    if (!teamName) return '🏳️';
    return FLAGS[teamName] || '🏳️';
  }


  // Stage display labels
  const STAGE_LABELS = {
    'group': 'שלב הבתים',
    'r32': 'שמינית גמר',
    'r16': 'שמינית גמר',
    'qf': 'רבע גמר',
    'sf': 'חצי גמר',
    'final': '🏆 גמר',
  };

  // Match type to internal type
  function normalizeType(game) {
    const t = (game.type || '').toLowerCase().trim();
    // The API uses 'r32' for Round of 16 (32 teams -> 16)
    if (t === 'r32' || t === 'r16') return 'r32';
    if (t === 'qf') return 'qf';
    if (t === 'sf') return 'sf';
    if (t === 'final') return 'final';
    if (t === 'group') return 'group';
    return 'group';
  }

  // Format match date in Israeli time format
  function formatMatchDate(localDate) {
    if (!localDate) return '';
    try {
      // localDate format: "MM/DD/YYYY HH:MM"
      const parts = localDate.split(' ');
      const dateParts = parts[0].split('/');
      const timeParts = parts[1] ? parts[1].split(':') : ['00','00'];
      const d = new Date(
        parseInt(dateParts[2]),
        parseInt(dateParts[0]) - 1,
        parseInt(dateParts[1]),
        parseInt(timeParts[0]),
        parseInt(timeParts[1])
      );
      const dayNames = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
      const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
      return {
        day: dayNames[d.getDay()],
        date: `${d.getDate()} ב${monthNames[d.getMonth()]}`,
        time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
        timestamp: d.getTime(),
        dateObj: d
      };
    } catch (e) {
      return { day: '', date: '', time: localDate, timestamp: 0, dateObj: null };
    }
  }

  // Parse scorers string from API
  function parseScorers(scorersStr) {
    if (!scorersStr || scorersStr === 'null') return [];
    try {
      // Remove outer braces and split
      const cleaned = scorersStr.replace(/^\{/, '').replace(/\}$/, '');
      const parts = cleaned.split('","');
      return parts.map(s => s.replace(/^"/, '').replace(/"$/, '').trim()).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  // Get cached data
  function getCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) return data;
    } catch (e) {}
    return null;
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {}
  }

  // Process raw API games into our format
  function processGames(games) {
    return games.map(game => {
      const type = normalizeType(game);
      const isFinished = game.finished === 'TRUE' || game.finished === true;
      const timeElapsed = game.time_elapsed || '';
      const isLive = !isFinished && (
        timeElapsed !== '' &&
        timeElapsed !== 'finished' &&
        timeElapsed !== 'upcoming' &&
        timeElapsed !== null &&
        timeElapsed !== 'null'
      );
      const dateInfo = formatMatchDate(game.local_date);
      const homeScore = isFinished || isLive ? game.home_score : null;
      const awayScore = isFinished || isLive ? game.away_score : null;

      return {
        id: game.id,
        type,
        stageLabel: STAGE_LABELS[type] || STAGE_LABELS[game.type] || 'מחזור',
        home_team_name: game.home_team_name_en,
        away_team_name: game.away_team_name_en,
        home_flag: getFlag(game.home_team_name_en),
        away_flag: getFlag(game.away_team_name_en),
        home_team_label: game.home_team_label || game.home_team_name_en,
        away_team_label: game.away_team_label || game.away_team_name_en,
        home_score: homeScore,
        away_score: awayScore,
        home_penalty_score: game.home_penalty_score || null,
        away_penalty_score: game.away_penalty_score || null,
        home_scorers: parseScorers(game.home_scorers),
        away_scorers: parseScorers(game.away_scorers),
        finished: isFinished,
        is_live: isLive,
        time_elapsed: timeElapsed,
        local_date: game.local_date,
        dateInfo,
        group: game.group,
        matchday: game.matchday,
        stadium_id: game.stadium_id,
      };
    });
  }

  // Main fetch function
  async function fetchMatches(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCache();
      if (cached) return cached;
    }

    try {
      const response = await fetch(`${BASE_URL}/get/games`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (!data.games || !Array.isArray(data.games)) throw new Error('Invalid API response');

      const processed = processGames(data.games);
      setCache(processed);
      return processed;

    } catch (err) {
      console.warn('API fetch failed, using cache:', err.message);
      // Try cache even if expired
      try {
        const stale = localStorage.getItem(CACHE_KEY);
        if (stale) {
          const { data } = JSON.parse(stale);
          return data;
        }
      } catch (e) {}
      return [];
    }
  }

  // Filter matches to knockout stages only (what we care about)
  function getKnockoutMatches(matches) {
    return matches.filter(m => m.type !== 'group');
  }

  // Get matches by stage
  function getMatchesByStage(matches, stage) {
    return matches.filter(m => m.type === stage || (stage === 'r16' && m.type === 'r32'));
  }

  // Get currently live matches
  function getLiveMatches(matches) {
    const now = Date.now();
    return matches.filter(m => {
      if (m.is_live) return true;
      // Also include matches that started in the last 120 minutes
      if (!m.finished && m.dateInfo && m.dateInfo.timestamp) {
        const elapsed = (now - m.dateInfo.timestamp) / 60000;
        return elapsed >= 0 && elapsed <= 120;
      }
      return false;
    });
  }

  // Format ticker text from finished/live matches
  function buildTickerText(matches) {
    const relevant = matches
      .filter(m => m.type !== 'group' && (m.finished || m.is_live))
      .sort((a,b) => (b.dateInfo.timestamp || 0) - (a.dateInfo.timestamp || 0))
      .slice(0, 20);

    if (relevant.length === 0) return 'מחכים לתחילת שלב הנוק-אאוט...';

    return relevant.map(m => {
      const status = m.is_live ? `⚡ ${m.time_elapsed}'` : '✅';
      const score = (m.home_score !== null && m.away_score !== null)
        ? `${m.home_score} - ${m.away_score}`
        : 'לא הוחל';
      return `${m.home_flag} ${m.home_team_name} ${score} ${m.away_team_name} ${m.away_flag} ${status}`;
    }).join('   •   ');
  }

  return {
    fetchMatches,
    getKnockoutMatches,
    getMatchesByStage,
    getLiveMatches,
    buildTickerText,
    getFlag,
    STAGE_LABELS,
    normalizeType,
  };
})();
