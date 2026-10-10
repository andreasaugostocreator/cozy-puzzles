#!/usr/bin/env node
// Pre-builds daily puzzles into assets/laser-daily.json so every player gets the same one, fast.
// Usage: node tools/gen-laser-daily.js [startDate=today-7] [days=460]
const fs = require('fs'), path = require('path');
const LC = require('../assets/laser-core.js');
const start = process.argv[2] ? new Date(process.argv[2]) : new Date(Date.now() - 7 * 864e5);
const days = +(process.argv[3] || 460);
const out = {}, t0 = Date.now();
const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
for (let i = 0; i < days; i++) {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  // One special piece per day, in rotation; the hardest of three 7×7 candidates.
  const special = [{ bowls: 1 }, { portals: 1 }, { filters: 1 }, { splitter: 0.35, maxSplit: 1 }][seed % 4];
  let best = null;
  for (let c = 0; c < 3; c++) {
    let L = null;
    for (let s = 0; !L; s++) L = LC.generate(seed * 100 + c * 10 + s, { n: 7, turns: 5, cats: 3, double: 0.3, fixedShare: 0.2, blockers: 2, budget: 300000, attempts: 150, ...special });
    if (!best || L.nodes * L.tray.length > best.nodes * best.tray.length) best = L;
  }
  delete best.nodes;
  out[key(d)] = best;
}
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'laser-daily.json'), JSON.stringify(out));
console.log(`${days} daily puzzles from ${key(start)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
