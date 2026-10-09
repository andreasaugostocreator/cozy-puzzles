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
for (let i = 0; generated.length < want; i++) {
  const p = Math.min(1, generated.length / want);
  const rnd = LC.mulberry32(i * 31 + 7);
  const opts = {
    n: p < 0.22 ? 5 : p < 0.58 ? 6 : 7,
    turns: 2 + Math.floor(p * 5.2 + rnd() * 0.8),
    cats: 2 + Math.floor(rnd() * 2) + (p > 0.5 ? 1 : 0),
    double: p > 0.05 ? 0.25 : 0,
    fixedShare: p > 0.12 ? 0.25 + rnd() * 0.2 : 0,
    blockers: 1 + Math.floor(rnd() * 3),
  };
  const L = LC.generate(1000 + i, opts);
  if (L) generated.push(L);
}
// Sort by difficulty but keep the size ramp (5×5 before 6×6 before 7×7).
generated.sort((a, b) => (a.w - b.w) || (a.difficulty - b.difficulty));
for (const L of generated) levels.push(L);
levels.forEach((L, i) => { L.id = i + 1; if (!L.name) L.name = `Level ${i + 1}`; delete L.nodes; });

const out = path.join(__dirname, '..', 'assets', 'laser-levels.json');
fs.writeFileSync(out, JSON.stringify(levels));
const sizes = {}; levels.forEach(L => sizes[L.w] = (sizes[L.w] || 0) + 1);
console.log(`${levels.length} levels, sizes ${JSON.stringify(sizes)}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log('difficulty first/mid/last:', levels[5].difficulty, levels[150].difficulty, levels[levels.length - 1].difficulty);
