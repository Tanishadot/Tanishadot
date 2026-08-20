/**
 * Renders a contribution calendar as an animated "space shooter" SVG.
 *
 * The output is a single self-contained SVG animated purely with CSS keyframes,
 * which is what GitHub allows inside <img> tags (no scripts, no external refs).
 * A deterministic timeline is computed up front: the ship flies left to right,
 * stops under every week that has contributions, and shoots each contribution
 * cell from the bottom of the column upwards. Every element gets its own
 * keyframes so the bullet impact and the cell explosion line up exactly.
 */

const CELL = 11;
const GAP = 3;
const PITCH = CELL + GAP;
const PAD = 16;
const GRID_TOP = 46;
const SHIP_GAP = 26;

// Raw timeline speeds; the whole timeline is scaled afterwards to fit TARGET.
const TRAVEL = 240; // px per second
const FIRE_GAP = 0.11; // seconds between shots in one column
const BULLET_SPEED = 300; // px per second
const AIM_PAUSE = 0.14; // settle time before the first shot of a column
const TAIL = 1.4; // seconds of "field regenerates" time at the end
const MIN_TOTAL = 14;
const MAX_TOTAL = 30;

export const THEMES = {
  dark: {
    bg: '#0d1117',
    panel: '#010409',
    border: '#21262d',
    text: '#c9d1d9',
    dim: '#7d8590',
    empty: '#161b22',
    levels: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    ship: '#58a6ff',
    shipDark: '#1f6feb',
    cockpit: '#a5d6ff',
    laser: '#7ee787',
    flame: '#ffa657',
    boom: '#ffdf5d',
    star: '#8b949e',
  },
  light: {
    bg: '#ffffff',
    panel: '#f6f8fa',
    border: '#d0d7de',
    text: '#1f2328',
    dim: '#656d76',
    empty: '#ebedf0',
    levels: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    ship: '#0969da',
    shipDark: '#0a3069',
    cockpit: '#54aeff',
    laser: '#1a7f37',
    flame: '#bc4c00',
    boom: '#bf8700',
    star: '#afb8c1',
  },
};

/** Deterministic RNG so the starfield is stable across runs (no diff churn). */
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

function buildTimeline(data, geom) {
  const { weeks } = data;
  const { bulletY, width } = geom;

  const byWeek = new Map();
  for (const cell of data.cells) {
    if (cell.level <= 0) continue;
    if (!byWeek.has(cell.week)) byWeek.set(cell.week, []);
    byWeek.get(cell.week).push(cell);
  }

  const startX = -30;
  const endX = width + 30;

  let t = 0;
  let x = startX;
  const stops = [];
  const shots = [];

  for (let w = 0; w < weeks; w++) {
    const targets = byWeek.get(w);
    if (!targets?.length) continue;
    // Shoot bottom-up: a bullet aimed high passes through cells already gone.
    targets.sort((a, b) => b.day - a.day);

    const cx = PAD + w * PITCH + CELL / 2;
    t += Math.abs(cx - x) / TRAVEL;
    x = cx;
    const arrive = t;
    t += AIM_PAUSE;

    targets.forEach((cell, i) => {
      const fire = t + i * FIRE_GAP;
      const cy = GRID_TOP + cell.day * PITCH + CELL / 2;
      const dist = bulletY - cy;
      shots.push({ cell, x: cx, fire, hit: fire + dist / BULLET_SPEED, dist });
    });
    t += (targets.length - 1) * FIRE_GAP + 0.12;

    stops.push({ x: cx, arrive, depart: t });
  }

  const lastHit = shots.length ? Math.max(...shots.map((s) => s.hit)) : t;
  t = Math.max(t, lastHit) + 0.25;
  const exitStart = t;
  t += Math.abs(endX - x) / TRAVEL;
  const exitEnd = t;

  let total = exitEnd + TAIL;

  // Uniformly scale time so short and busy years both play at a watchable pace.
  const scale = total < MIN_TOTAL ? MIN_TOTAL / total : total > MAX_TOTAL ? MAX_TOTAL / total : 1;
  if (scale !== 1) {
    for (const s of stops) {
      s.arrive *= scale;
      s.depart *= scale;
    }
    for (const s of shots) {
      s.fire *= scale;
      s.hit *= scale;
    }
    total *= scale;
  }

  return {
    total,
    stops,
    shots,
    startX,
    endX,
    exitStart: exitStart * scale,
    exitEnd: exitEnd * scale,
  };
}

function monthLabels(data) {
  const seen = new Map();
  for (const cell of data.cells) {
    const d = new Date(cell.date + 'T00:00:00Z');
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!seen.has(key)) seen.set(key, { week: cell.week, month: d.getUTCMonth() });
  }
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return [...seen.values()]
    .filter((m, i) => i > 0 || m.week === 0)
    .map((m) => ({ x: PAD + m.week * PITCH, label: names[m.month] }));
}

export function renderSvg(data, { username, theme = 'dark', auto = false } = {}) {
  const weeks = data.weeks;
  const width = PAD * 2 + weeks * PITCH - GAP;
  const gridBottom = GRID_TOP + 7 * PITCH - GAP;
  const shipY = gridBottom + SHIP_GAP;
  const bulletY = shipY - 12;
  const height = shipY + 24;

  const timeline = buildTimeline(data, { bulletY, width });
  const { total } = timeline;
  const pct = (t) => r2(Math.min(100, Math.max(0, (t / total) * 100)));

  const palette = THEMES[theme] ?? THEMES.dark;
  const vars = (p) => `
    --bg:${p.bg}; --panel:${p.panel}; --border:${p.border}; --text:${p.text}; --dim:${p.dim};
    --l0:${p.levels[0]}; --l1:${p.levels[1]}; --l2:${p.levels[2]}; --l3:${p.levels[3]}; --l4:${p.levels[4]};
    --ship:${p.ship}; --ship2:${p.shipDark}; --cockpit:${p.cockpit}; --laser:${p.laser};
    --flame:${p.flame}; --boom:${p.boom}; --star:${p.star};`;

  let themeCss = `:root{${vars(palette)}}`;
  if (auto) {
    themeCss =
      `:root{${vars(THEMES.light)}}` +
      `@media (prefers-color-scheme: dark){:root{${vars(THEMES.dark)}}}`;
  }

  // ---- cells -------------------------------------------------------------
  const hitByCell = new Map(timeline.shots.map((s) => [`${s.cell.week}:${s.cell.day}`, s]));
  const cellSvg = [];
  const cellCss = [];
  const respawn = pct(total - 1.05);

  for (const cell of data.cells) {
    const x = PAD + cell.week * PITCH;
    const y = GRID_TOP + cell.day * PITCH;
    const shot = hitByCell.get(`${cell.week}:${cell.day}`);
    const title = `<title>${cell.count} contribution${cell.count === 1 ? '' : 's'} on ${cell.date}</title>`;

    if (!shot) {
      cellSvg.push(
        `<rect class="c l${cell.level}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2">${title}</rect>`
      );
      continue;
    }

    const id = cellSvg.length;
    const hp = pct(shot.hit);
    const boomEnd = Math.min(respawn - 0.1, pct(shot.hit + 0.3));
    cellSvg.push(
      `<rect class="c l${cell.level} k${id}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2">${title}</rect>`
    );
    cellCss.push(
      `.k${id}{animation-name:k${id}}` +
        `@keyframes k${id}{` +
        `0%,${hp}%{opacity:1;transform:scale(1);fill:var(--l${cell.level})}` +
        `${Math.min(boomEnd, hp + 1.2)}%{opacity:.95;transform:scale(1.9);fill:var(--boom)}` +
        `${boomEnd}%{opacity:0;transform:scale(2.7);fill:var(--boom)}` +
        `${respawn}%{opacity:0;transform:scale(.3);fill:var(--l${cell.level})}` +
        `100%{opacity:1;transform:scale(1);fill:var(--l${cell.level})}}`
    );
  }

  // ---- bullets + impact rings -------------------------------------------
  const bulletSvg = [];
  const bulletCss = [];
  const ringSvg = [];
  const ringCss = [];
  timeline.shots.forEach((shot, i) => {
    const fp = pct(shot.fire);
    const hp = pct(shot.hit);
    const lit = Math.min(hp, fp + 0.05);
    bulletSvg.push(
      `<rect class="b b${i}" x="${r2(shot.x - 1.5)}" y="${bulletY - 12}" width="3" height="12" rx="1.5"/>`
    );
    bulletCss.push(
      `.b${i}{animation-name:b${i}}` +
        `@keyframes b${i}{` +
        `0%,${fp}%{opacity:0;transform:translateY(0)}` +
        `${lit}%{opacity:1}` +
        `${hp}%{opacity:1;transform:translateY(-${r2(shot.dist)}px)}` +
        `${Math.min(100, hp + 0.05)}%,100%{opacity:0;transform:translateY(-${r2(shot.dist)}px)}}`
    );

    const cy = bulletY - shot.dist;
    const ringEnd = Math.min(100, pct(shot.hit + 0.4));
    ringSvg.push(`<circle class="r r${i}" cx="${r2(shot.x)}" cy="${r2(cy)}" r="5"/>`);
    ringCss.push(
      `.r${i}{animation-name:r${i}}` +
        `@keyframes r${i}{` +
        `0%,${hp}%{opacity:0;transform:scale(.25)}` +
        `${Math.min(ringEnd, hp + 0.4)}%{opacity:.9;transform:scale(.9)}` +
        `${ringEnd}%,100%{opacity:0;transform:scale(2.6)}}`
    );
  });

  // ---- ship path ---------------------------------------------------------
  const shipFrames = [`0%{transform:translate(${timeline.startX}px,${shipY}px)}`];
  for (const stop of timeline.stops) {
    shipFrames.push(`${pct(stop.arrive)}%{transform:translate(${r2(stop.x)}px,${shipY}px)}`);
    shipFrames.push(`${pct(stop.depart)}%{transform:translate(${r2(stop.x)}px,${shipY}px)}`);
  }
  shipFrames.push(`${pct(timeline.exitEnd)}%{transform:translate(${timeline.endX}px,${shipY}px)}`);
  shipFrames.push(`100%{transform:translate(${timeline.endX}px,${shipY}px)}`);

  // ---- starfield ---------------------------------------------------------
  const rand = rng(username);
  const stars = [];
  for (let i = 0; i < 46; i++) {
    const sx = r2(rand() * width);
    const sy = r2(rand() * height);
    const rr = r2(0.4 + rand() * 0.9);
    const dur = r2(2 + rand() * 4);
    const delay = r2(-rand() * 6);
    stars.push(
      `<circle class="st" cx="${sx}" cy="${sy}" r="${rr}" style="animation-duration:${dur}s;animation-delay:${delay}s"/>`
    );
  }

  const months = monthLabels(data)
    .map((m) => `<text class="mo" x="${m.x}" y="${GRID_TOP - 8}">${m.label}</text>`)
    .join('');

  const targets = timeline.shots.length;
  const subtitle = `${data.total.toLocaleString('en-US')} contributions · ${targets} targets destroyed`;

  const css = `
${themeCss}
.bgr{fill:var(--bg)}
.panel{fill:var(--panel);stroke:var(--border);stroke-width:1}
.c{shape-rendering:geometricPrecision;transform-box:fill-box;transform-origin:50% 50%;
   animation-duration:${r2(total)}s;animation-timing-function:linear;animation-iteration-count:infinite}
.l0{fill:var(--l0)}.l1{fill:var(--l1)}.l2{fill:var(--l2)}.l3{fill:var(--l3)}.l4{fill:var(--l4)}
.b{fill:var(--laser);opacity:0;filter:url(#glow);
   animation-duration:${r2(total)}s;animation-timing-function:linear;animation-iteration-count:infinite}
.r{fill:none;stroke:var(--boom);stroke-width:1.5;opacity:0;transform-box:fill-box;transform-origin:50% 50%;
   animation-duration:${r2(total)}s;animation-timing-function:ease-out;animation-iteration-count:infinite}
.ship{animation:fly ${r2(total)}s linear infinite}
.hull{fill:var(--ship)}.fin{fill:var(--ship2)}.cock{fill:var(--cockpit)}
.flame{fill:var(--flame);transform-box:fill-box;transform-origin:50% 0%;animation:burn .45s ease-in-out infinite}
.st{fill:var(--star);animation-name:tw;animation-timing-function:ease-in-out;animation-iteration-count:infinite}
.ttl{fill:var(--text);font:600 13px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif}
.sub{fill:var(--dim);font:400 11px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif}
.mo{fill:var(--dim);font:400 9px 'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif}
@keyframes fly{${shipFrames.join('')}}
@keyframes burn{0%,100%{transform:scaleY(.65);opacity:.75}50%{transform:scaleY(1.3);opacity:1}}
@keyframes tw{0%,100%{opacity:.18}50%{opacity:.75}}
${cellCss.join('\n')}
${bulletCss.join('\n')}
${ringCss.join('\n')}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${username}'s GitHub contribution graph played as a space shooter">
<style><![CDATA[${css}]]></style>
<defs>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="1.4" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<rect class="bgr" width="${width}" height="${height}" rx="6"/>
<g>${stars.join('')}</g>
<rect class="panel" x="${PAD - 8}" y="${GRID_TOP - 6}" width="${width - (PAD - 8) * 2}" height="${gridBottom - GRID_TOP + 12}" rx="6"/>
<text class="ttl" x="${PAD}" y="24">@${username}</text>
<text class="sub" x="${width - PAD}" y="24" text-anchor="end">${subtitle}</text>
${months}
<g>${cellSvg.join('')}</g>
<g>${bulletSvg.join('')}</g>
<g>${ringSvg.join('')}</g>
<g class="ship"><g transform="scale(1.25)">
  <path class="fin" d="M-8,5 L-3,-2 L-3,5 Z"/>
  <path class="fin" d="M8,5 L3,-2 L3,5 Z"/>
  <path class="hull" d="M0,-12 C3.4,-7 4.6,-1 4.4,5 L-4.4,5 C-4.6,-1 -3.4,-7 0,-12 Z"/>
  <circle class="cock" cx="0" cy="-4.2" r="1.9"/>
  <path class="flame" d="M-2.6,5 L0,12 L2.6,5 Z"/>
</g></g>
</svg>`;
}
