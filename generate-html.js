// generate-html.js
// Reads data.json (produced by fetch-data.js) and rewrites index.html.
// Keeps the original hand-built CSS/shell exactly as-is. Team cards and
// standings tables are rendered from a simplified template (Option B):
// no division sub-headers, no playoff/champion banners, no player leaders.
// Just: badge, record, last game, next game, last-5 form, flat standings.
//
// Run with: node generate-html.js
// Requires data.json to exist in the same folder (fetch-data.js produces it).

const fs = require('fs');

const COLORS = {
  sharks: { css: 'var(--sj)', bg: 'rgba(0,194,206,.12)', abbr: 'SJ' },
  cowboys: { css: 'var(--dal)', bg: 'rgba(154,175,183,.12)', abbr: 'DAL' },
  warriors: { css: 'var(--gsw)', bg: 'rgba(255,199,44,.12)', abbr: 'GS' },
  athletics: { css: 'var(--ath)', bg: 'rgba(239,178,30,.12)', abbr: 'ATH' },
};

const ORDER = ['sharks', 'cowboys', 'warriors', 'athletics'];

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formRow(recentForm) {
  if (!recentForm || !recentForm.length) {
    return '<div class="frow"><span class="flbl">No recent games</span></div>';
  }
  // recentForm is newest-first; display oldest-to-newest like the original
  const chron = [...recentForm].reverse();
  const dots = chron
    .map((g) => `<div class="fd ${g.result === 'W' ? 'W' : 'L'}">${esc(g.result)}</div>`)
    .join('');
  return `<div class="frow">${dots}<span class="flbl">Last ${chron.length}</span></div>`;
}

function lastGameBlock(recentForm) {
  const last = recentForm && recentForm[0];
  if (!last) {
    return '<div class="sb off"><div class="sb-left"><div class="sb-st">NO RECENT GAMES</div><div class="sb-dt">Check back after the next game</div></div></div>';
  }
  const dt = new Date(last.date);
  const dateStr = isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const cls = last.result === 'W' ? '' : 'loss';
  return `<div class="sb off"><div class="sb-left"><div class="sb-st">FINAL · ${esc(dateStr)}</div><div class="sb-dt">vs ${esc(last.opponent)}</div></div><div class="sb-box muted ${cls}"><span class="sb-val sm">${esc(last.selfScore)}–${esc(last.oppScore)}</span><span class="sb-sub">${esc(last.result)} · Final</span></div></div>`;
}

function nextGameRow(nextGame) {
  if (!nextGame) return '<div class="nxtrow">→ Next game not yet scheduled</div>';
  const dt = new Date(nextGame.date);
  const dateStr = isNaN(dt)
    ? nextGame.date
    : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' +
      dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `<div class="nxtrow">→ Next: <strong>${esc(nextGame.shortName || nextGame.name)}</strong> · ${esc(dateStr)}</div>`;
}

// Flatten ESPN's raw standings payload into a simple array of {team, record, pct, isSelf}
function flattenStandings(standingsRaw, teamAbbr) {
  const rows = [];
  try {
    const groups = standingsRaw?.children || standingsRaw?.standings?.entries ? [standingsRaw] : standingsRaw?.children || [];
    const walk = (node) => {
      const entries = node?.standings?.entries;
      if (entries) {
        entries.forEach((e) => {
          const stats = e.stats || [];
          const find = (name) => stats.find((s) => s.name === name || s.type === name)?.displayValue;
          rows.push({
            team: e.team?.displayName || e.team?.shortDisplayName || 'Unknown',
            abbr: e.team?.abbreviation || '',
            record: find('overall') || `${find('wins') || '-'}-${find('losses') || '-'}`,
            pct: find('winPercent') || '',
            isSelf: e.team?.abbreviation === teamAbbr,
          });
        });
      }
      (node?.children || []).forEach(walk);
    };
    walk(standingsRaw);
  } catch (e) {
    console.error('Standings parse issue:', e.message);
  }
  return rows;
}

function standingsTable(standingsRaw, teamAbbr, accentCss) {
  const rows = flattenStandings(standingsRaw, teamAbbr);
  if (!rows.length) {
    return '<div class="glist"><div class="strow"><span class="sttm">Standings unavailable this update</span></div></div>';
  }
  const body = rows
    .map((r, i) => {
      const meCls = r.isSelf ? 'me' : '';
      const meStyle = r.isSelf ? `style="border-left:2px solid ${accentCss}"` : '';
      const nameStyle = r.isSelf ? `style="color:${accentCss}"` : '';
      const label = r.isSelf ? `◀ ${r.team}` : r.team;
      return `<div class="strow ${meCls}" ${meStyle}><span class="stnum" ${nameStyle}>${i + 1}</span><span class="sttm" ${nameStyle}>${esc(label)}</span><span class="strec">${esc(r.record)}</span><span class="stpct">${esc(r.pct)}</span></div>`;
    })
    .join('\n');
  return `<div class="glist">
    <div class="chdr"><span style="min-width:22px"></span><span style="flex:1">Team</span><span style="min-width:36px;text-align:right">W-L</span><span style="min-width:40px;text-align:right">PCT</span></div>
    ${body}
  </div>`;
}

function recentGamesList(recentForm) {
  if (!recentForm || !recentForm.length) {
    return '<div class="glist"><div class="grow"><div><div class="gopp">No recent games</div></div></div></div>';
  }
  const rows = recentForm
    .map((g) => {
      const dt = new Date(g.date);
      const dateStr = isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `<div class="grow"><div><div class="gopp">vs ${esc(g.opponent)}</div><div class="gdt">${esc(dateStr)}</div></div><div class="grgt"><span class="gsc">${esc(g.selfScore)}-${esc(g.oppScore)}</span><span class="rp ${g.result}">${esc(g.result)}</span></div></div>`;
    })
    .join('\n');
  return `<div class="glist">${rows}</div>`;
}

function teamCard(key, team) {
  const c = COLORS[key];
  const record = team.record || '—';
  const standing = team.standingSummary || '';

  return `
<div class="tc">
  <span class="tbar" style="background:linear-gradient(90deg,${c.bg},${c.css})"></span>
  <button class="thead" onclick="goTab('${key}')">
    <div class="ttop">
      <div class="bdg" style="background:${c.bg};color:${c.css}">${c.abbr}</div>
      <div class="tinfo"><div class="tnm" style="color:${c.css}">${esc(team.displayName)}</div><div class="tlg">${esc(team.league)} · ${esc(standing)}</div></div>
      <div class="rpill">${esc(record)}</div>
    </div>
    ${lastGameBlock(team.recentForm)}
    ${formRow(team.recentForm)}
    ${nextGameRow(team.nextGame)}
  </button>
  <button class="expbtn" onclick="toggleDrawer('${key}')"><span class="earr" id="earr-${key}">&#9660;</span><span id="elbl-${key}">Games &amp; Standings</span></button>
  <div class="drw" id="drw-${key}">
    <div class="stabs">
      <button class="stab on" onclick="openSub('${key}','games',this)">Games</button>
      <button class="stab" onclick="openSub('${key}','standings',this)">Standings</button>
    </div>
    <div class="spnl on" id="${key}-games">
      <div class="seclbl">Recent Results</div>
      ${recentGamesList(team.recentForm)}
    </div>
    <div class="spnl" id="${key}-standings">
      ${standingsTable(team.standings, team.abbreviation, c.css)}
    </div>
  </div>
</div>`;
}

function teamDetailPanel(key, team) {
  const c = COLORS[key];
  const record = team.record || '—';
  const standing = team.standingSummary || '';
  return `
<div class="panel" id="panel-${key}">
  <div class="dhero"><div class="dbdg" style="background:${c.bg};color:${c.css}">${c.abbr}</div><div><div class="dnm" style="color:${c.css}">${esc(team.displayName)}</div><div class="dsb">${esc(team.league)} · ${esc(standing)}</div><div class="drec">${esc(record)}</div></div></div>
  ${lastGameBlock(team.recentForm)}
  ${nextGameRow(team.nextGame)}
  <div class="sectitle" style="color:${c.css}">Recent Results</div>
  ${recentGamesList(team.recentForm)}
  <div class="sectitle" style="color:${c.css}">Standings</div>
  ${standingsTable(team.standings, team.abbreviation, c.css)}
</div>`;
}

function main() {
  if (!fs.existsSync('data.json')) {
    console.error('data.json not found — run fetch-data.js first.');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
  const headShell = fs.readFileSync('head_shell.html', 'utf8');

  const dateStr = new Date(data.lastUpdated).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = new Date(data.lastUpdated).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Patch the date stamp inside the copied shell, then open the panel-all
  // div and status row (the shell cuts off right before these).
  let head = headShell.replace('Jul 8, 2026</div>', `${dateStr}</div>`);
  head += `<div class="panel on" id="panel-all">
<div class="statusrow"><span class="sdot"></span>Data as of ${esc(dateStr)}, ${esc(timeStr)}</div>`;

  const allCards = ORDER.map((k) => teamCard(k, data.teams[k])).join('\n');
  const detailPanels = ORDER.map((k) => teamDetailPanel(k, data.teams[k])).join('\n');

  const script = `
<script>
function goTab(t){
  document.querySelectorAll('.tab').forEach(e=>e.classList.remove('on'));
  document.querySelectorAll('.panel').forEach(e=>e.classList.remove('on'));
  var tab=document.querySelector('[data-t="'+t+'"]'),pan=document.getElementById('panel-'+t);
  if(tab)tab.classList.add('on');
  if(pan){pan.classList.add('on');window.scrollTo(0,0);}
}
function toggleDrawer(t){
  var d=document.getElementById('drw-'+t),a=document.getElementById('earr-'+t),l=document.getElementById('elbl-'+t);
  if(!d)return;
  var open=d.style.display==='block';
  d.style.display=open?'none':'block';
  if(a)a.style.transform=open?'':'rotate(180deg)';
  if(l)l.textContent=open?'Games & Standings':'Hide';
}
function openSub(t,s,btn){
  var d=document.getElementById('drw-'+t);
  if(!d)return;
  d.querySelectorAll('.stab').forEach(e=>e.classList.remove('on'));
  d.querySelectorAll('.spnl').forEach(e=>e.classList.remove('on'));
  btn.classList.add('on');
  var p=document.getElementById(t+'-'+s);
  if(p)p.classList.add('on');
}
</script>
</body>
</html>`;

  const finalHtml = `${head}
${allCards}
</div><!-- end panel-all -->

<!-- TEAM DETAIL PANELS -->
${detailPanels}
${script}`;

  fs.writeFileSync('index.html', finalHtml);
  console.log('Wrote index.html from data.json (updated ' + data.lastUpdated + ')');
}

main();
