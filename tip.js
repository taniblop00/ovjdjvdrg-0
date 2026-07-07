/**
 * BetOz - AI TIP Feature
 * Model: perplexity/sonar — real-time web search, cheap, accurate
 */

// Key stored as base64 to avoid plain-text exposure in source
const _TK = atob('c2stb3ItdjEtMTNmN2FkZTllOGVhYjRiMTAyNWFhYzUzMmNmNTMwNmRhZjNiOWI1YzJmMDViYzA0YTBmNzBmOWFhOWU1YTE4Yw==');

const TIP_CONFIG = {
  OPENROUTER_KEY: (window.BETOZ_CONFIG || {}).OPENROUTER_KEY || _TK,
  // perplexity/sonar: real-time web search, $1/1M tokens, best for live sports data
  MODEL: 'perplexity/sonar',
  API_URL: 'https://openrouter.ai/api/v1/chat/completions',
};

// Cache tips for 15 minutes to avoid re-fetching
const tipCache = {};
const TIP_CACHE_TTL = 15 * 60 * 1000;

async function fetchAITip(match) {
  const cacheKey = String(match.id);
  if (tipCache[cacheKey] && (Date.now() - tipCache[cacheKey].fetchedAt) < TIP_CACHE_TTL) {
    return tipCache[cacheKey];
  }

  const homeName = match.home_team_name || match.home_team_label || 'TBD';
  const awayName = match.away_team_name || match.away_team_label || 'TBD';
  const stageLabel = match.stageLabel || 'Knockout';
  const matchDate  = match.dateInfo?.date ? `${match.dateInfo.date} ${match.dateInfo.time || ''}` : match.local_date || 'בקרוב';

  const prompt = `You are an elite football analyst for FIFA World Cup 2026. Search the web RIGHT NOW for the latest data about this match.

MATCH TO ANALYZE:
Stage: ${stageLabel}
Date: ${matchDate}
Home: ${homeName}
Away: ${awayName}

SEARCH AND FIND:
1. Both teams' last 5 World Cup 2026 matches — exact scores and results
2. Any injured or suspended key players for THIS specific match
3. Head-to-head history between ${homeName} and ${awayName}
4. Current World Cup 2026 stats: goals scored, conceded, clean sheets
5. Which players are in best form right now at this tournament
6. Tactical analysis — how each team plays and their weaknesses
7. Expert predictions and betting odds from major sites

Based on all this real data, give the MOST ACCURATE possible score prediction.

Respond ONLY with this exact JSON (no markdown, no text outside JSON):
{"home_score":<integer>,"away_score":<integer>,"confidence":"<low|medium|high>","winner":"<home|away|draw>","reasoning":["<Hebrew fact 1>","<Hebrew fact 2>","<Hebrew fact 3>","<Hebrew fact 4>"],"home_form":"<e.g. WWDWW>","away_form":"<e.g. WDWLW>","key_insight":"<most important Hebrew insight>","danger_player_home":"<name>","danger_player_away":"<name>"}`;

  let response;
  try {
    response = await fetch(TIP_CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TIP_CONFIG.OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://betoz.app',
        'X-Title': 'BetOz World Cup Predictor',
      },
      body: JSON.stringify({
        model: TIP_CONFIG.MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });
  } catch (networkErr) {
    throw new Error(`שגיאת רשת: ${networkErr.message}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('OpenRouter error:', response.status, errText);
    throw new Error(`שגיאת AI (${response.status}) — בדוק את המפתח`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '';

  if (!content) throw new Error('תגובה ריקה מה-AI');

  // Parse JSON — extract from markdown if needed
  let parsed;
  try {
    const jsonStr = content.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr);
  } catch (parseErr) {
    console.warn('JSON parse failed, content was:', content);
    throw new Error('לא ניתן לנתח את תגובת ה-AI');
  }

  // Validate required fields
  if (parsed.home_score === undefined || parsed.away_score === undefined) {
    throw new Error('AI לא החזיר תחזית תקינה');
  }

  const result = {
    home_score:         Number(parsed.home_score) || 0,
    away_score:         Number(parsed.away_score) || 0,
    confidence:         parsed.confidence || 'low',
    winner:             parsed.winner || 'draw',
    reasoning:          Array.isArray(parsed.reasoning) ? parsed.reasoning.filter(Boolean) : [],
    home_form:          parsed.home_form || '',
    away_form:          parsed.away_form || '',
    key_insight:        parsed.key_insight || '',
    danger_player_home: parsed.danger_player_home || '',
    danger_player_away: parsed.danger_player_away || '',
    matchId:            match.id,
    homeName,
    awayName,
    homeFlag:           match.home_flag || '🏳️',
    awayFlag:           match.away_flag || '🏳️',
    fetchedAt:          Date.now(),
  };

  tipCache[cacheKey] = result;
  return result;
}
