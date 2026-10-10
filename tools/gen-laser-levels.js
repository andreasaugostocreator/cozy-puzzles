#!/usr/bin/env node
// Builds assets/laser-levels.json: hand-made tutorials, then generated levels sorted by difficulty.
// Usage: node tools/gen-laser-levels.js [count=300]
const fs = require('fs'), path = require('path');
const LC = require('../assets/laser-core.js');
const tutorials = require('./laser-tutorials.js');
const total = +(process.argv[2] || 300);
const t0 = Date.now();

const levels = tutorials.map((L, i) => {
  const res = LC.solve(L);
  if (!res.complete || res.sols.length !== 1) throw new Error(`tutorial ${L.name} is not unique (${res.sols.length})`);
  return { ...L, sol: { placed: res.sols[0].placed, fixedRot: res.sols[0].fixedRot }, nodes: res.nodes };
});
levels.forEach(L => { L.difficulty = LC.difficulty(L); });

const generated = [];
const want = total - levels.length;
// New pieces unlock chapter by chapter (30 levels each). The first level of a chapter introduces
// its piece on a small board; the rest mix it with what came before (at most two specials a level).
// A new piece every 15 levels keeps things fresh; chapters (and new cats) stay 30 levels long.
const INTRO = { 16: 'splitter', 31: 'bowl', 46: 'portal', 61: 'filter' };
const UNLOCK = Object.entries(INTRO).map(([lvl, f]) => [+lvl, f]);
const FEATURE_OPTS = {
  splitter: rnd => ({ splitter: 0.35, maxSplit: 1 + Math.floor(rnd() * 2) }),
  bowl: rnd => ({ bowls: 1 + Math.floor(rnd() * 2) }),
  portal: () => ({ portals: 1 }),
  filter: () => ({ filters: 1 }),
};
function shape(level) {
  if (level <= 15) return { n: 6, turns: [4, 5], pickFrom: 4 };
  if (level <= 60) return { n: 6, turns: [3, 5], pickFrom: 3 };
  if (level <= 150) return { n: 7, turns: [4, 5], pickFrom: 3 };
  if (level <= 210) return { n: 7, turns: [5, 5], pickFrom: 3 };
  return { n: 8, turns: [5, 6], pickFrom: 2 };
}
const score = L => L.nodes * (1 + 0.15 * L.tray.length) * (1 + 0.1 * L.fixed.filter(f => f.rotatable).length) * (1 + 0.15 * ((L.portals || []).length + (L.bowls || []).length));
let seed = 1;
for (let level = levels.length + 1; level <= total; level++) {
  const rnd0 = LC.mulberry32(level * 7919);
  if (INTRO[level]) {
    const f = INTRO[level];
    let L = null;
    while (!L) L = LC.generate(seed++, { n: 5, turns: f === 'portal' || f === 'filter' ? 1 : 2, cats: f === 'bowl' ? 1 : 2, double: 0, fixedShare: 0, blockers: 1, require: f, ...FEATURE_OPTS[f](rnd0), maxSplit: 1, budget: 200000, attempts: 300 });
    L.intro = f;
    generated.push(L);
    console.log(`level ${level}: intro ${f}`);
    continue;
  }
  const sh = shape(level), unlocked = UNLOCK.filter(([at]) => level > at).map(([, f]) => f);
  const newest = unlocked[unlocked.length - 1];
  let best = null;
  for (let cnd = 0; cnd < sh.pickFrom; cnd++) {
    let L = null;
    while (!L) {
      const rnd = LC.mulberry32(seed * 977 + 13);
      // This chapter's piece shows up in most levels; older ones now and then. Max two specials.
      const chosen = [];
      // The newest piece is guaranteed in most of the 14 levels right after its intro.
      const fresh = newest && level <= UNLOCK.find(([, f]) => f === newest)[0] + 14;
      if (fresh && rnd() < 0.8) chosen.push(newest);
      for (const f of unlocked.slice().sort(() => rnd() - 0.5)) if (chosen.length < 2 && !chosen.includes(f) && rnd() < 0.35) chosen.push(f);
      const opts = {
        n: sh.n, turns: sh.turns[0] + Math.floor(rnd() * (sh.turns[1] - sh.turns[0] + 1)),
        cats: (chosen.includes('bowl') ? 1 : 2) + Math.floor(rnd() * 2) + (level > 210 ? 1 : 0),
        double: 0.3, fixedShare: 0.15 + rnd() * 0.15, blockers: 1 + Math.floor(rnd() * 3),
        budget: 300000, attempts: 200,
      };
      for (const f of chosen) Object.assign(opts, FEATURE_OPTS[f](rnd));
      if (fresh && chosen[0] === newest) opts.require = newest;
      L = LC.generate(seed++, opts);
    }
    if (!best || score(L) > score(best)) best = L;
  }
  generated.push(best);
  if (level % 15 === 0) console.log(`level ${level}: ${best.w}×${best.h}, ${best.tray.join(' ')}${best.portals ? ' +flap' : ''}${best.bowls ? ' +bowl' : ''} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
// Order from easier to harder inside each 15-level block (intro levels stay first in their block).
for (let from = levels.length + 1; from <= total; ) {
  const blockEnd = Math.min(total, Math.ceil(from / 15) * 15);
  const start = INTRO[from] ? from + 1 : from;
  const a = start - levels.length - 1, b = blockEnd - levels.length;
  if (b - a > 1) { const chunk = generated.slice(a, b).sort((x, y) => (x.w - y.w) || (score(x) - score(y))); generated.splice(a, chunk.length, ...chunk); }
  from = blockEnd + 1;
}
for (const L of generated) levels.push(L);
levels.forEach((L, i) => { L.id = i + 1; if (!L.name) L.name = `Level ${i + 1}`; delete L.nodes; });

const out = path.join(__dirname, '..', 'assets', 'laser-levels.json');
fs.writeFileSync(out, JSON.stringify(levels));
const sizes = {}; levels.forEach(L => sizes[L.w] = (sizes[L.w] || 0) + 1);
console.log(`${levels.length} levels, sizes ${JSON.stringify(sizes)}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('difficulty first/mid/last:', levels[5].difficulty, levels[150].difficulty, levels[levels.length - 1].difficulty);
