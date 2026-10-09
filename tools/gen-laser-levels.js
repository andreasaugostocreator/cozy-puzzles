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
// Difficulty bands right after the tutorials. Each level is the hardest of `pickFrom` candidates
// (search effort × pieces), so even early levels need real thinking.
function bandFor(p) {
  if (p < 0.12) return { n: 6, turns: [4, 5], cats: [2, 3], pickFrom: 6 };
  if (p < 0.45) return { n: 7, turns: [5, 6], cats: [2, 3], pickFrom: 5 };
  if (p < 0.75) return { n: 7, turns: [6, 7], cats: [3, 3], pickFrom: 4 };
  return { n: 8, turns: [7, 8], cats: [3, 4], pickFrom: 3 };
}
const score = L => L.nodes * (1 + 0.15 * L.tray.length) * (1 + 0.1 * L.fixed.filter(f => f.rotatable).length);
let seed = 1;
for (let slot = 0; slot < want; slot++) {
  const p = slot / Math.max(1, want - 1), band = bandFor(p);
  let best = null;
  for (let c = 0; c < band.pickFrom; c++) {
    let L = null;
    while (!L) {
      const rnd = LC.mulberry32(seed * 977 + 13);
      const opts = {
        n: band.n,
        turns: band.turns[0] + Math.floor(rnd() * (band.turns[1] - band.turns[0] + 1)),
        cats: band.cats[0] + Math.floor(rnd() * (band.cats[1] - band.cats[0] + 1)),
        double: 0.3, fixedShare: 0.15 + rnd() * 0.15, blockers: 2 + Math.floor(rnd() * 3),
        budget: 400000, attempts: 300,
      };
      L = LC.generate(seed++, opts);
    }
    if (!best || score(L) > score(best)) best = L;
  }
  generated.push(best);
  if (slot % 25 === 0) console.log(`level ${slot + 6}: ${best.w}×${best.h}, ${best.tray.length} pieces, ${best.nodes} nodes · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
// Within each chapter, order from easier to harder.
// Chapters are 30 levels; the first one starts with the 5 tutorials, so its generated part is 25 long.
for (let i = 0, size = 30 - levels.length; i < generated.length; i += size, size = 30) {
  const chunk = generated.slice(i, i + size).sort((a, b) => (a.w - b.w) || (score(a) - score(b)));
  generated.splice(i, chunk.length, ...chunk);
}
for (const L of generated) levels.push(L);
levels.forEach((L, i) => { L.id = i + 1; if (!L.name) L.name = `Level ${i + 1}`; delete L.nodes; });

const out = path.join(__dirname, '..', 'assets', 'laser-levels.json');
fs.writeFileSync(out, JSON.stringify(levels));
const sizes = {}; levels.forEach(L => sizes[L.w] = (sizes[L.w] || 0) + 1);
console.log(`${levels.length} levels, sizes ${JSON.stringify(sizes)}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('difficulty first/mid/last:', levels[5].difficulty, levels[150].difficulty, levels[levels.length - 1].difficulty);
