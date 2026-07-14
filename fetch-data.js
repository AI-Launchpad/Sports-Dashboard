// fetch-data.js
// Pulls current scores, records, and standings for Jeff's 4 teams from ESPN's
// public (unofficial) endpoints, and writes the result to data.json.
//
// Run with: node fetch-data.js
// Requires Node 18+ (built-in fetch). No API key needed.

const fs = require('fs');

// ---- Team config -----------------------------------------------------
// espnId = ESPN's internal team id, found via the .../teams endpoint for each league.
const TEAMS = {
  sharks: {
    label: 'San Jose Sharks',
    league: 'NHL',
    sport: 'hockey',
    slug: 'nhl',
    espnId: '19',
  },
  cowboys: {
    label: 'Dallas Cowboys',
    league: 'NFL',
    sport: 'football',
    slug: 'nfl',
    espnId: '6',
  },
  warriors: {
    label: 'Golden State Warriors',
    league: 'NBA',
    sport: 'basketball',
    slug: 'nba',
    espnId: '9',
  },
  athletics: {
    label: 'Oakland Athletics',
    league: 'MLB',
    sport: 'baseball',
    slug: 'mlb',
    espnId: '11',
  },
};

const BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const STANDINGS_BASE = 'https://site.api.espn.com/apis/v2/sports'; // note: different path

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jeffs-sports-dashboard/1.0)' },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${url} -> ${res.status}`);
  }
  return res.json();
}

// Pull the specific team's record/schedule info out of ESPN's team endpoint.
async function fetchTeamCore(team) {
  const url = `${BASE}/${team.sport}/${team.slug}/teams/${team.espnId}`;
  const data = await getJson(url);
  const t = data.team;

  const record = t.record?.items?.find((r) => r.type === 'total');
  const nextEvent = t.nextEvent?.[0];

  return {
    displayName: t.displayName,
    abbreviation: t.abbreviation,
    logo: t.logos?.[0]?.href || null,
    record: record?.summary || null,
    standingSummary: t.standingSummary || null,
    nextGame: nextEvent
      ? {
          name: nextEvent.name,
          date: nextEvent.date,
          shortName: nextEvent.shortName,
        }
      : null,
  };
}

// Pull last-5 results + most recent final score from the league scoreboard.
// (Scoreboard only covers "today" by default — for a real recent-results feed
// we ask for a date range covering the last ~10 days.)
async function fetchRecentForm(team) {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - 10);

  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const range = `${fmt(past)}-${fmt(today)}`;

  const url = `${BASE}/${team.sport}/${team.slug}/scoreboard?dates=${range}`;
  const data = await getJson(url);

  const games = (data.events || [])
    .filter((ev) =>
      ev.competitions?.[0]?.competitors?.some(
        (c) => c.team.id === team.espnId
      )
    )
    .filter((ev) => ev.status?.type?.completed)
    .map((ev) => {
      const comp = ev.competitions[0];
      const self = comp.competitors.find((c) => c.team.id === team.espnId);
      const opp = comp.competitors.find((c) => c.team.id !== team.espnId);
      return {
        date: ev.date,
        opponent: opp?.team?.displayName,
        selfScore: self?.score,
        oppScore: opp?.score,
        result: self?.winner === true ? 'W' : self?.winner === false ? 'L' : '—',
      };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return games.slice(0, 5);
}

// Division/conference standings for the team's league.
async function fetchStandings(team) {
  try {
    const url = `${STANDINGS_BASE}/${team.sport}/${team.slug}/standings`;
    const data = await getJson(url);
    return data; // raw — dashboard can pick out relevant groups; large payload
  } catch (err) {
    console.error(`Standings fetch failed for ${team.label}:`, err.message);
    return null;
  }
}

async function buildTeamData(key, team) {
  console.log(`Fetching ${team.label}...`);
  const [core, recentForm, standings] = await Promise.all([
    fetchTeamCore(team).catch((err) => {
      console.error(`Core fetch failed for ${team.label}:`, err.message);
      return null;
    }),
    fetchRecentForm(team).catch((err) => {
      console.error(`Recent form fetch failed for ${team.label}:`, err.message);
      return [];
    }),
    fetchStandings(team),
  ]);

  return {
    key,
    league: team.league,
    ...core,
    recentForm,
    standings,
  };
}

async function main() {
  const results = {};
  for (const [key, team] of Object.entries(TEAMS)) {
    results[key] = await buildTeamData(key, team);
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    teams: results,
  };

  fs.writeFileSync('data.json', JSON.stringify(output, null, 2));
  console.log('\nWrote data.json —', new Date().toISOString());
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
