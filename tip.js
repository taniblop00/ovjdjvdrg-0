/**
 * BetOz - AI TIP Feature
 * Uses OpenRouter with Perplexity Sonar (live web search) to predict match results
 */

const TIP_CONFIG = {
  OPENROUTER_KEY: (window.BETOZ_CONFIG || {}).OPENROUTER_KEY || '',
  MODEL: 'perplexity/sonar',
  API_URL: 'https://openrouter.ai/api/v1/chat/completions',
};

// Cache to avoid re-fetching the same match tip
const tipCache = {};

async function fetchAITip(match) {
  const cacheKey = match.id;
  if (tipCache[cacheKey]) return tipCache[cacheKey];

  const homeName = match.home_team_name || match.home_team_label || 'Home';
  const awayName = match.away_team_name || match.away_team_label || 'Away';
  const stageLabel = match.stageLabel || 'Knockout';
  const matchDate  = match.dateInfo?.date || match.local_date || 'upcoming';

  const prompt = `You are a football/soccer expert analyst.

Analyze this FIFA World Cup 2026 match and give a score prediction:
- Home team: ${homeName}
- Away team: ${awayName}
- Stage: ${stageLabel}
- Date: ${matchDate}

Research and analyze:
1. Recent form (last 5 matches) of each team
2. Head-to-head record between these teams
3. Key players available / injuries / suspensions
4. Tactical style and strengths
5. Motivation and pressure factors at this World Cup stage

Then give your final predicted score.

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "home_score": <number>,
  "away_score": <number>,
  "confidence": "<low|medium|high>",
  "reasoning": ["<bullet 1 in Hebrew>", "<bullet 2 in Hebrew>", "<bullet 3 in Hebrew>"],
  "home_form": "<recent form string like WWDLW>",
  "away_form": "<recent form string like WLWWL>",
  "key_insight": "<one key insight in Hebrew>"
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
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse JSON from response
  let parsed;
  try {
    // Extract JSON block if surrounded by text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (e) {
    // Fallback parsing
    parsed = {
      home_score: 1,
      away_score: 1,
      confidence: 'low',
      reasoning: ['לא ניתן לנתח את המשחק כרגע', 'נסה שוב מאוחר יותר', ''],
      key_insight: 'AI לא הצליח לנתח את המשחק',
    };
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
