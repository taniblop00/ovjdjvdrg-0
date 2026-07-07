/**
 * BetOz - AI TIP Feature
 * Uses OpenRouter with Perplexity Sonar Pro (live web search) to predict match results
 */

const TIP_CONFIG = {
  OPENROUTER_KEY: (window.BETOZ_CONFIG || {}).OPENROUTER_KEY || '',

  // perplexity/sonar-pro: searches the real-time web, best accuracy for sports predictions
  MODEL: 'perplexity/sonar-pro',
  API_URL: 'https://openrouter.ai/api/v1/chat/completions',
};

// Cache to avoid re-fetching the same match tip (valid for 10 minutes)
const tipCache = {};
const TIP_CACHE_TTL = 10 * 60 * 1000;

async function fetchAITip(match) {
  const cacheKey = match.id;
  if (tipCache[cacheKey] && (Date.now() - tipCache[cacheKey].fetchedAt) < TIP_CACHE_TTL) {
    return tipCache[cacheKey];
  }

  const homeName = match.home_team_name || match.home_team_label || 'Home';
  const awayName = match.away_team_name || match.away_team_label || 'Away';
  const stageLabel = match.stageLabel || 'Knockout';
  const matchDate  = match.dateInfo?.date || match.local_date || 'upcoming';

  const prompt = `You are a world-class football analyst and prediction expert with access to the latest data.

FIFA World Cup 2026 match to predict:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏟️ Stage: ${stageLabel}
📅 Date: ${matchDate}
🏠 Home: ${homeName}
✈️  Away: ${awayName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SEARCH AND ANALYZE THE FOLLOWING RIGHT NOW:
1. 📊 RECENT FORM: Last 5 official matches for EACH team at this World Cup and recent friendlies
2. 🏥 INJURIES & SUSPENSIONS: Any key players missing for this specific match
3. 🔢 HEAD-TO-HEAD: Historical record between ${homeName} and ${awayName}
4. 📈 CURRENT WORLD CUP STATS: Goals scored/conceded, clean sheets, biggest threats
5. 🎯 TACTICAL: Playing style, formation, strengths & weaknesses of each team
6. 💪 MOMENTUM: Confidence levels, how they got to this stage
7. 🌡️ PRESSURE: What is at stake, which team handles big games better

After your thorough research, give the MOST ACCURATE possible scoreline prediction.
Be specific and data-driven. Do NOT guess - base it on the actual current data you find.

IMPORTANT: Respond ONLY in this exact JSON format (pure JSON, no markdown, no text before or after):
{
  "home_score": <integer>,
  "away_score": <integer>,
  "confidence": "<low|medium|high>",
  "winner": "<home|away|draw>",
  "reasoning": ["<key fact 1 in Hebrew>", "<key fact 2 in Hebrew>", "<key fact 3 in Hebrew>", "<key fact 4 in Hebrew>"],
  "home_form": "<W/D/L letters for last 5 matches e.g. WWDWL>",
  "away_form": "<W/D/L letters for last 5 matches e.g. WLWWL>",
  "key_insight": "<single most important insight in Hebrew that determines this prediction>",
  "danger_player_home": "<most dangerous home player name>",
  "danger_player_away": "<most dangerous away player name>"
}`;

  const response = await fetch(TIP_CONFIG.API_URL, {
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
      temperature: 0.2,   // Low temp = more deterministic, factual
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    // Fallback to sonar if sonar-pro fails
    if (response.status === 404 || response.status === 400) {
      return fetchAITipFallback(match);
    }
    throw new Error(`OpenRouter error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response
  let parsed;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (e) {
    // Try fallback
    return fetchAITipFallback(match);
  }

  const result = {
    ...parsed,
    matchId: match.id,
    homeName,
    awayName,
    homeFlag: match.home_flag || '🏳️',
    awayFlag: match.away_flag || '🏳️',
    fetchedAt: Date.now(),
  };

  tipCache[cacheKey] = result;
  return result;
}

// Fallback to cheaper model if sonar-pro is unavailable
async function fetchAITipFallback(match) {
  const homeName = match.home_team_name || match.home_team_label || 'Home';
  const awayName = match.away_team_name || match.away_team_label || 'Away';

  const prompt = `You are a football expert. Predict the score for FIFA World Cup 2026: ${homeName} vs ${awayName} (${match.stageLabel || 'knockout'}).
Search for their recent form, injuries, and World Cup performance.
Respond ONLY in JSON: {"home_score":<int>,"away_score":<int>,"confidence":"<low|medium|high>","reasoning":["<hebrew>","<hebrew>","<hebrew>"],"home_form":"<WWDLW>","away_form":"<WLWDW>","key_insight":"<hebrew>","danger_player_home":"<name>","danger_player_away":"<name>"}`;

  const response = await fetch(TIP_CONFIG.API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TIP_CONFIG.OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://betoz.app',
      'X-Title': 'BetOz',
    },
    body: JSON.stringify({
      model: 'perplexity/sonar',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  let parsed;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (e) {
    parsed = {
      home_score: 1, away_score: 1, confidence: 'low',
      reasoning: ['לא ניתן לנתח כרגע', 'נסה שוב מאוחר יותר', ''],
      key_insight: 'AI לא הצליח לאחזר נתונים מספיקים',
    };
  }

  return {
    ...parsed,
    matchId: match.id,
    homeName,
    awayName,
    homeFlag: match.home_flag || '🏳️',
    awayFlag: match.away_flag || '🏳️',
    fetchedAt: Date.now(),
  };
}
