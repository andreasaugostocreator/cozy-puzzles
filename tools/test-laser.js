#!/usr/bin/env node
// Tests for assets/laser-core.js. Usage: node tools/test-laser.js
const LC = require('../assets/laser-core.js');
const levels = require('../assets/laser-levels.json');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const lvl = (o = {}) => ({ w: 5, h: 5, src: { c: 0, r: 2, d: 1 }, cats: [[4, 4]], fixed: [], tray: [], ...o });
const pieces = obj => new Map(Object.entries(obj).map(([k, v]) => [+k, v]));

// Mirror reflection table (null = back side stops the beam). Directions: 0 up 1 right 2 down 3 left.
const table = { 0: { 1: 0, 2: 3, 3: null, 0: null }, 1: { 3: 0, 2: 1, 1: null, 0: null }, 2: { 3: 2, 0: 1, 1: null, 2: null }, 3: { 1: 2, 0: 3, 3: null, 2: null } };
for (const rot in table) for (const d in table[rot]) eq(LC.outgoing('mirror', +rot, +d), table[rot][d] === null ? [] : [table[rot][d]], `mirror r${rot} d${d}`);
for (let r = 0; r < 2; r++) for (let d = 0; d < 4; d++) eq(LC.outgoing('double', r, d).length, 1, `double reflects r${r} d${d}`);
eq(LC.outgoing('blocker', 0, 1), [], 'blocker stops');

// Beam basics
let t = LC.trace(lvl(), new Map());
eq(t.paths[0].pts, [[0.5, 2.5], [5, 2.5]], 'straight beam to edge'); eq(t.paths[0].end.t, 'edge', 'edge end');
t = LC.trace(lvl(), pieces({ 12: { k: 'mirror', rot: 0 } }));
eq(t.paths[0].pts, [[0.5, 2.5], [2.5, 2.5], [2.5, 0]], 'mirror corner');
t = LC.trace(lvl(), pieces({ 13: { k: 'blocker', rot: 0 } })); eq(t.paths[0].end.t, 'blocked', 'blocked'); ok(!t.vset.has(14), 'nothing after couch');
t = LC.trace(lvl(), pieces({ 12: { k: 'mirror', rot: 2 } })); eq(t.paths[0].end.t, 'absorbed', 'mirror back absorbs');
t = LC.trace(lvl({ cats: [[1, 2], [3, 2], [0, 0]] }), new Map()); eq(t.hits.size, 2, 'cats pass the beam through');
t = LC.trace(lvl({ src: { c: 2, r: 2, d: 1 } }), pieces({ 14: { k: 'mirror', rot: 3 }, 24: { k: 'mirror', rot: 0 }, 22: { k: 'mirror', rot: 1 } }));
eq(t.paths[0].end.t, 'source', 'beam back into the laser stops');

// Board rules
const L4 = levels[3];
let S = LC.newState(L4);
ok(!LC.place(L4, S, 0, L4.src.c, L4.src.r), 'no placing on the laser');
ok(!LC.place(L4, S, 0, L4.cats[0][0], L4.cats[0][1]), 'no placing on a cat');
ok(!LC.place(L4, S, 0, 3, 1), 'no placing on a fixed piece');
S = LC.place(L4, S, 0, 2, 2); ok(S && S.pl[0].c === 2, 'place');
S = LC.rotate(L4, S, 2, 2); eq(S.pl[0].rot, 1, 'rotate placed');
S = LC.place(L4, S, 0, 4, 4); eq(S.pl[0], { c: 4, r: 4, rot: 1 }, 'move keeps rotation');
S = LC.rotate(L4, S, 3, 1); eq(S.fr[0], 1, 'rotatable fixed piece turns');
ok(!LC.rotate(levels[2], LC.newState(levels[2]), 1, 4), 'locked couch does not turn');
S = LC.remove(S, 0); ok(LC.unplaced(L4, S).length === 1, 'back to tray');

// Every shipped level: valid, unique, solution solves it, par is sane.
let worst = 0;
levels.forEach((L, i) => {
  const t0 = Date.now(), res = LC.solve(L, 2);
  worst = Math.max(worst, Date.now() - t0);
  ok(res.complete && res.sols.length === 1 && res.sols[0].unused.length === 0, `level ${i + 1} unique`);
  const SS = LC.applySolution(L, L.sol);
  ok(LC.isSolved(L, SS), `level ${i + 1} solution solves`);
  ok(!LC.isSolved(L, LC.newState(L)), `level ${i + 1} is not solved at the start`);
  ok(LC.parMoves(L) >= L.tray.length, `level ${i + 1} par`);
});
// Daily-style generation in the app must stay quick.
const g0 = Date.now(); let made = 0;
for (let s = 0; s < 10; s++) {
  let best = null;
  for (let i = 0; i < 4; i++) { const c = LC.generate((20261009 + s) * 10 + i, { n: 7, turns: 5 + (i % 2), cats: 3, double: 0.3, fixedShare: 0.2, blockers: 3, budget: 200000, attempts: 120 }); if (c) best = c; }
  if (best) made++;
}
const per = (Date.now() - g0) / 10;
ok(made === 10, `daily generation succeeded ${made}/10`);
ok(per < 2500, `daily generation ${per.toFixed(0)} ms each`);
console.log(`${pass} passed, ${fail} failed · ${levels.length} levels re-solved (slowest ${worst} ms) · daily gen ~${per.toFixed(0)} ms`);
process.exit(fail ? 1 : 0);
