/* Laser Paws game logic: pieces, beam tracing, solver and level generator.
   No DOM access, so it also runs in Node (tools/gen-laser-levels.js and the tests). */
(function (root) {
'use strict';

// Directions: 0 up, 1 right, 2 down, 3 left. Grid y grows downwards.
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const dirOf = (dx, dy) => dx === 0 ? (dy < 0 ? 0 : 2) : (dx > 0 ? 1 : 3);

// Beam colours. The laser starts red; coloured glass re-tints it.
const COLORS = ['red', 'blue', 'green'];
const FILTER = { fblue: 1, fgreen: 2 };

// Distinct rotations per kind. Mirror rotation 0 is "/" with the shiny face top-left (NW);
// each step turns it a quarter clockwise: 0 "/" NW, 1 "\" NE, 2 "/" SE, 3 "\" SW.
// Splitter (glass vase): rotation 0 "/", 1 "\"; the beam goes straight through AND bends.
const ROT = { mirror: 4, double: 2, splitter: 2, blocker: 1, fblue: 1, fgreen: 1 };
const KINDS = ['mirror', 'double', 'splitter', 'fblue', 'fgreen', 'blocker'];
const NORMALS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const norm = (k, r) => ((r % ROT[k]) + ROT[k]) % ROT[k];

function reflect(d, slash) {
  const dx = DX[d], dy = DY[d];
  return slash ? dirOf(-dy, -dx) : dirOf(dy, dx);
}

/** Directions the beam leaves a piece in, given the direction it travels in. Empty = stopped. */
function outgoing(kind, rot, d) {
  if (kind === 'blocker') return [];
  if (FILTER[kind]) return [d];
  if (kind === 'double') return [reflect(d, rot % 2 === 0)];
  if (kind === 'splitter') return [d, reflect(d, rot % 2 === 0)];
  const n = NORMALS[rot];
  return DX[d] * n[0] + DY[d] * n[1] < 0 ? [reflect(d, rot % 2 === 0)] : [];
}

/* Level shape:
   { id, name, w, h, src: {c, r, d},
     cats: [[c, r, color?]]        color 1 blue / 2 green: wakes only for that beam colour; none = any colour
     fixed: [{k, c, r, rot, rotatable}], tray: ['mirror', ...],
     bowls?: [{c, r, d}]           the beam must cross this cell travelling in direction d
     portals?: [[c1, r1, c2, r2]]  cat flaps: entering one, the beam leaves the other in the same direction
     intro?: 'splitter' | 'bowl' | 'portal' | 'filter'
     allowUnused?: bool, sol?: {placed: [{k, c, r, rot}], fixedRot: {i: rot}} } */
const cache = new WeakMap();
function info(L) {
  let i = cache.get(L);
  if (i) return i;
  const key = (c, r) => r * L.w + c;
  const catColor = new Map(L.cats.map(([c, r, col]) => [key(c, r), col || 0]));
  const cats = new Set(catColor.keys());
  const fixedAt = new Map(L.fixed.map((f, idx) => [key(f.c, f.r), idx]));
  const portal = new Map();
  for (const [a, b, c, d] of L.portals || []) { portal.set(key(a, b), key(c, d)); portal.set(key(c, d), key(a, b)); }
  const bowls = (L.bowls || []).map(b => ({ k: key(b.c, b.r), d: b.d }));
  const bowlAt = new Set(bowls.map(b => b.k));
  const src = key(L.src.c, L.src.r);
  const playable = [];
  for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) {
    const k = key(c, r);
    if (k !== src && !cats.has(k) && !fixedAt.has(k) && !portal.has(k) && !bowlAt.has(k)) playable.push(k);
  }
  const splits = L.tray.includes('splitter') || L.fixed.some(f => f.k === 'splitter');
  i = { key, cats, catColor, fixedAt, portal, bowls, bowlAt, src, splits, playable: new Set(playable), playableList: playable };
  cache.set(L, i);
  return i;
}

/** Traces the laser. `pieces` is a Map cellKey → {k, rot}. Cats let the beam through and wake up. */
function trace(L, pieces) {
  const I = info(L), W = L.w, H = L.h;
  const queue = [{ x: L.src.c + 0.5, y: L.src.r + 0.5, c: L.src.c, r: L.src.r, d: L.src.d, col: 0 }];
  const seen = new Set(), paths = [], visited = [], vset = new Set(), hits = new Set(), dirIn = new Map(), colIn = new Map(), passes = new Set();
  let steps = 0;
  const enter = (k, d, col) => {
    steps++;
    if (!vset.has(k)) { vset.add(k); visited.push(k); dirIn.set(k, d); colIn.set(k, col); }
    passes.add(k * 4 + d);
    if (I.cats.has(k)) { const need = I.catColor.get(k); if (!need || need === col) hits.add(k); }
  };
  while (queue.length) {
    const b = queue.shift();
    let pts = [[b.x, b.y]], c = b.c, r = b.r, d = b.d, col = b.col, end;
    for (;;) {
      const nc = c + DX[d], nr = r + DY[d];
      const ex = nc + 0.5 - DX[d] * 0.5, ey = nr + 0.5 - DY[d] * 0.5; // where the beam enters that cell
      if (nc < 0 || nr < 0 || nc >= W || nr >= H) { end = { t: 'edge' }; pts.push([ex, ey]); break; }
      const k = nr * W + nc;
      if (k === I.src) { end = { t: 'source' }; pts.push([ex, ey]); break; }
      if (seen.has((k * 4 + d) * 3 + col)) { end = { t: 'loop', k }; pts.push([nc + 0.5, nr + 0.5]); break; }
      seen.add((k * 4 + d) * 3 + col);
      enter(k, d, col);
      c = nc; r = nr;
      const partner = I.portal.get(k);
      if (partner !== undefined) {
        // Through the cat flap: continue from the twin flap in the same direction.
        pts.push([nc + 0.5, nr + 0.5]);
        paths.push({ pts, end: { t: 'portal', k }, col });
        c = partner % W; r = Math.floor(partner / W);
        pts = [[c + 0.5, r + 0.5]];
        if (seen.has((partner * 4 + d) * 3 + col)) { end = { t: 'loop', k: partner }; break; }
        seen.add((partner * 4 + d) * 3 + col);
        enter(partner, d, col);
        continue;
      }
      const p = pieces.get(k);
      if (!p) continue;
      if (FILTER[p.k]) {
        if (FILTER[p.k] !== col) { pts.push([nc + 0.5, nr + 0.5]); paths.push({ pts, end: { t: 'filter', k }, col }); pts = [[nc + 0.5, nr + 0.5]]; col = FILTER[p.k]; }
        continue;
      }
      const outs = outgoing(p.k, p.rot, d);
      if (!outs.length) {
        if (p.k === 'blocker') { end = { t: 'blocked', k }; pts.push([ex + DX[d] * 0.1, ey + DY[d] * 0.1]); }
        else { end = { t: 'absorbed', k }; pts.push([nc + 0.5, nr + 0.5]); }
        break;
      }
      for (const o of outs.slice(1)) queue.push({ x: nc + 0.5, y: nr + 0.5, c: nc, r: nr, d: o, col });
      if (outs[0] !== d) { pts.push([nc + 0.5, nr + 0.5]); d = outs[0]; }
    }
    paths.push({ pts, end, col });
  }
  return { paths, visited, vset, hits, steps, dirIn, colIn, passes };
}

const allCatsHit = (L, t) => { for (const k of info(L).cats) if (!t.hits.has(k)) return false; return true; };
const bowlsMet = (L, t) => info(L).bowls.every(b => t.passes.has(b.k * 4 + b.d));
/** Every cat awake and every food bowl crossed the right way. */
const goalMet = (L, t) => allCatsHit(L, t) && bowlsMet(L, t);

/* ---------- Board state: what the player changed ---------- */
// state = { pl: { trayIndex: {c, r, rot} }, fr: [rotation per fixed piece] }
function newState(L) { return { pl: {}, fr: L.fixed.map(f => f.rot) }; }
function cloneState(S) { const pl = {}; for (const i in S.pl) pl[i] = { ...S.pl[i] }; return { pl, fr: S.fr.slice() }; }

/** Map cellKey → {k, rot, fixed: index|undefined, tray: index|undefined, locked} */
function boardPieces(L, S) {
  const I = info(L), m = new Map();
  L.fixed.forEach((f, i) => m.set(I.key(f.c, f.r), { k: f.k, rot: S.fr[i], fixed: i, locked: !f.rotatable }));
  for (const i in S.pl) { const p = S.pl[i]; m.set(I.key(p.c, p.r), { k: L.tray[i], rot: p.rot, tray: +i, locked: false }); }
  return m;
}
const traceState = (L, S) => trace(L, boardPieces(L, S));
const unplaced = (L, S) => L.tray.map((_, i) => i).filter(i => !S.pl[i]);

function canPlace(L, S, i, c, r) {
  if (c < 0 || r < 0 || c >= L.w || r >= L.h || i < 0 || i >= L.tray.length) return false;
  const I = info(L), k = I.key(c, r);
  if (!I.playable.has(k)) return false;
  for (const j in S.pl) if (+j !== i && S.pl[j].c === c && S.pl[j].r === r) return false;
  return true;
}
function place(L, S, i, c, r) {
  if (!canPlace(L, S, i, c, r)) return null;
  const T = cloneState(S), rot = S.pl[i] ? S.pl[i].rot : 0;
  if (S.pl[i] && S.pl[i].c === c && S.pl[i].r === r) return null;
  T.pl[i] = { c, r, rot };
  return T;
}
function remove(S, i) { if (!S.pl[i]) return null; const T = cloneState(S); delete T.pl[i]; return T; }
function rotate(L, S, c, r) {
  const p = boardPieces(L, S).get(info(L).key(c, r));
  if (!p || p.locked || ROT[p.k] < 2) return null;
  const T = cloneState(S);
  if (p.tray !== undefined) T.pl[p.tray].rot = norm(p.k, p.rot + 1); else T.fr[p.fixed] = norm(p.k, p.rot + 1);
  return T;
}
function isSolved(L, S, t) {
  t = t || traceState(L, S);
  return goalMet(L, t) && (L.allowUnused || unplaced(L, S).length === 0);
}

/* ---------- Solver ----------
   Beam-guided backtracking: trace with the decisions so far, take the first undecided cell on the
   beam and branch on it (leave empty, or each remaining tray piece in each distinct rotation; for a
   rotatable fixed piece, each rotation). Cells the beam never reaches are never branched on. */
function solve(L, limit = Infinity, budget = 400000) {
  const I = info(L), pieces = new Map(), decided = new Set(), avail = {}, fixedRot = {};
  for (const k of L.tray) avail[k] = (avail[k] || 0) + 1;
  const kinds = KINDS.filter(k => avail[k]);
  L.fixed.forEach(f => { const k = I.key(f.c, f.r); pieces.set(k, { k: f.k, rot: f.rot }); if (!f.rotatable) decided.add(k); });
  const goals = I.cats.size + I.bowls.length;
  const sols = [], sigs = new Set();
  let nodes = 0, stopped = false, outOfBudget = false;

  function dfs() {
    if (stopped) return;
    if (++nodes > budget) { stopped = outOfBudget = true; return; }
    if (sols.length >= limit) { stopped = true; return; }
    const t = trace(L, pieces);
    let trayLeft = 0;
    for (const k of kinds) trayLeft += avail[k];
    let goalsSoFar = 0;
    for (const k of t.visited) {
      if (I.cats.has(k)) { goalsSoFar++; continue; }
      if (I.bowlAt.has(k)) goalsSoFar++;
      if (decided.has(k)) continue;
      const fi = I.fixedAt.get(k);
      if (fi !== undefined) {
        const f = L.fixed[fi];
        decided.add(k);
        for (let r = 0; r < ROT[f.k] && !stopped; r++) { pieces.set(k, { k: f.k, rot: r }); fixedRot[fi] = r; dfs(); }
        pieces.set(k, { k: f.k, rot: f.rot }); delete fixedRot[fi]; decided.delete(k);
        return;
      }
      if (!I.playable.has(k) || !trayLeft) continue;
      decided.add(k);
      dfs(); // leave it empty
      for (const kind of kinds) {
        if (stopped || !avail[kind]) continue;
        avail[kind]--;
        for (let r = 0; r < ROT[kind] && !stopped; r++) {
          // Without splitters there is one beam: a piece that stops it here only works if every goal is already met.
          if (!I.splits && !outgoing(kind, r, t.dirIn.get(k)).length && goalsSoFar < goals) continue;
          pieces.set(k, { k: kind, rot: r }); dfs();
        }
        pieces.delete(k);
        avail[kind]++;
      }
      decided.delete(k);
      return;
    }
    record(t);
  }
  function record(t) {
    if (!goalMet(L, t)) return;
    const unused = [];
    for (const k of kinds) for (let n = 0; n < avail[k]; n++) unused.push(k);
    if (!L.allowUnused && unused.length) {
      let spare = 0;
      for (const k of I.playableList) if (!pieces.has(k) && !t.vset.has(k)) spare++;
      if (spare < unused.length) return;
    }
    const placed = [];
    for (const [k, p] of pieces) if (!I.fixedAt.has(k)) placed.push({ k: p.k, c: k % L.w, r: Math.floor(k / L.w), rot: p.rot });
    placed.sort((a, b) => (a.r - b.r) || (a.c - b.c));
    const sol = { placed, fixedRot: { ...fixedRot }, unused };
    const sig = JSON.stringify(sol);
    if (!sigs.has(sig)) { sigs.add(sig); sols.push(sol); }
  }
  dfs();
  // complete: every solution was found. outOfBudget: gave up early, so the count is unknown.
  return { sols, nodes, complete: !stopped, outOfBudget };
}

/** Puts a known solution on the board (hints, tests). Leftover pieces go off the beam. */
function applySolution(L, sol) {
  const S = newState(L), free = L.tray.map((_, i) => i);
  for (const p of sol.placed) {
    const at = free.findIndex(i => L.tray[i] === p.k);
    if (at >= 0) S.pl[free.splice(at, 1)[0]] = { c: p.c, r: p.r, rot: p.rot };
  }
  for (const i in sol.fixedRot) S.fr[i] = sol.fixedRot[i];
  if (!L.allowUnused && free.length) {
    const t = traceState(L, S), taken = new Set(Object.values(S.pl).map(p => p.r * L.w + p.c));
    const spare = info(L).playableList.filter(k => !t.vset.has(k) && !taken.has(k));
    for (const i of free) { const k = spare.shift(); if (k !== undefined) S.pl[i] = { c: k % L.w, r: Math.floor(k / L.w), rot: 0 }; }
  }
  return S;
}

/** Fewest moves to solve: one per tray piece placed, plus the taps to turn pieces into position. */
function parMoves(L) {
  if (!L.sol) return L.tray.length * 2;
  let m = 0;
  for (const p of L.sol.placed) m += 1 + p.rot;
  for (const i in L.sol.fixedRot) { const f = L.fixed[i]; m += norm(f.k, L.sol.fixedRot[i] - f.rot); }
  return m;
}

/* ---------- Generator ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * Builds a level with exactly one solution: walk a beam from an edge laser, dropping pieces at
 * random turns (mirrors, double mirrors, glass vases), coloured glass on straights and cat flaps;
 * put cats (and food bowls) where the beam passes; turn some pieces into fixed ones and add couches;
 * then let the solver confirm the answer is unique, parking extra couches on any rival answer's path.
 * opts: { n, turns, cats, double, splitter, filters, portals, bowls, fixedShare, blockers,
 *         require: feature that must appear, budget, attempts, repairs }
 */
function generate(seed, opts) {
  const rnd = mulberry32(seed);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const n = opts.n, key = (c, r) => r * n + c;
  const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  for (let attempt = 0; attempt < (opts.attempts || 400); attempt++) {
    // Laser on an edge cell, facing into the board.
    const side = Math.floor(rnd() * 4), pos = Math.floor(rnd() * n);
    const src = [{ c: pos, r: 0, d: 2 }, { c: n - 1, r: pos, d: 3 }, { c: pos, r: n - 1, d: 0 }, { c: 0, r: pos, d: 1 }][side];
    const pieces = new Map(), sol = [], portals = [], portalCells = new Set();
    let c = src.c, r = src.r, d = src.d, ok = true;
    let portalsLeft = opts.portals || 0, filtersLeft = opts.filters || 0, split = 0;
    const steps = opts.turns + portalsLeft + filtersLeft;
    const forceAt = Math.floor(rnd() * Math.max(1, steps - 1));
    let turnsLeft = opts.turns;
    for (let s = 0; s < steps && ok; s++) {
      const run = [];
      for (let x = c + DX[d], y = r + DY[d]; inside(x, y); x += DX[d], y += DY[d]) {
        const k = key(x, y);
        if (pieces.has(k) || portalCells.has(k) || (x === src.c && y === src.r)) break;
        run.push([x, y]);
      }
      if (!run.length) { ok = false; break; }
      const idx = Math.max(Math.floor(rnd() * run.length), Math.floor(rnd() * run.length));
      const [px, py] = run[idx];
      const forced = s === forceAt ? opts.require : null;
      let action = 'turn';
      if (portalsLeft > 0 && (forced === 'portal' || (forced === null && rnd() < portalsLeft / (steps - s)))) action = 'portal';
      else if (filtersLeft > 0 && (forced === 'filter' || (forced === null && rnd() < filtersLeft / (steps - s)))) action = 'filter';
      else if (turnsLeft <= 0) action = portalsLeft > 0 ? 'portal' : 'filter';
      if (action === 'portal') {
        // Twin flap somewhere free, with room to continue in the same direction.
        const exits = [];
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
          const k = key(x, y);
          if (k === key(px, py) || pieces.has(k) || portalCells.has(k) || (x === src.c && y === src.r)) continue;
          if (run.some(([a, b]) => a === x && b === y)) continue;
          if (inside(x + DX[d], y + DY[d]) && !pieces.has(key(x + DX[d], y + DY[d]))) exits.push([x, y]);
        }
        if (!exits.length) { ok = false; break; }
        const [qx, qy] = pick(exits);
        portals.push([px, py, qx, qy]); portalCells.add(key(px, py)); portalCells.add(key(qx, qy));
        c = qx; r = qy; portalsLeft--;
        continue;
      }
      if (action === 'filter') {
        const kind = rnd() < 0.5 ? 'fblue' : 'fgreen';
        pieces.set(key(px, py), { k: kind, rot: 0 }); sol.push({ k: kind, c: px, r: py, rot: 0 });
        c = px; r = py; filtersLeft--;
        continue;
      }
      const turns = [(d + 1) % 4, (d + 3) % 4].filter(o => inside(px + DX[o], py + DY[o]));
      if (!turns.length) { ok = false; break; }
      const out = pick(turns);
      const kind = forced === 'splitter' || (split < (opts.maxSplit ?? 2) && rnd() < (opts.splitter || 0)) ? 'splitter' : rnd() < (opts.double || 0) ? 'double' : 'mirror';
      let rot = 0;
      while (!outgoing(kind, rot, d).includes(out)) rot++;
      if (kind === 'splitter') split++;
      pieces.set(key(px, py), { k: kind, rot });
      sol.push({ k: kind, c: px, r: py, rot });
      c = px; r = py; d = out; turnsLeft--;
    }
    if (!ok) continue;
    if (opts.require === 'splitter' && !split) continue;
    if (opts.require === 'portal' && !portals.length) continue;
    if (opts.require === 'filter' && !sol.some(p => FILTER[p.k])) continue;

    const stub = { w: n, h: n, src, cats: [], fixed: [], tray: [], portals };
    const t = trace(stub, pieces);
    if (!sol.every(p => t.vset.has(key(p.c, p.r)))) continue;
    if (portals.some(([a, b]) => !t.vset.has(key(a, b)))) continue;

    // Cats: one on the last stretch, the rest spread over earlier ones. Behind coloured glass,
    // most cats wear that colour so the glass is needed.
    const busy = k => pieces.has(k) || portalCells.has(k);
    const lastPieceAt = Math.max(...sol.map(p => t.visited.indexOf(key(p.c, p.r))), ...portals.map(([a, b]) => t.visited.indexOf(key(a, b))));
    const after = t.visited.slice(lastPieceAt + 1).filter(k => !busy(k));
    if (!after.length) continue;
    const catKeys = new Set([pick(after)]);
    const before = t.visited.slice(0, lastPieceAt).filter(k => !busy(k));
    for (let tries = 0; catKeys.size < opts.cats && tries < 30 && before.length; tries++) catKeys.add(pick(before));
    const cats = [...catKeys].map(k => { const col = t.colIn.get(k); return col && rnd() < 0.8 ? [k % n, Math.floor(k / n), col] : [k % n, Math.floor(k / n)]; });
    const usedColors = new Set(sol.filter(p => FILTER[p.k]).map(p => FILTER[p.k]));
    if ([...usedColors].some(col => !cats.some(ct => ct[2] === col))) continue;

    // Food bowls on the beam, facing the way the beam crosses them.
    const bowls = [];
    const bowlSpots = t.visited.filter(k => !busy(k) && !catKeys.has(k));
    for (let b = 0; b < (opts.bowls || 0) && bowlSpots.length; b++) {
      const k = bowlSpots.splice(Math.floor(rnd() * bowlSpots.length), 1)[0];
      bowls.push({ c: k % n, r: Math.floor(k / n), d: t.dirIn.get(k) });
    }
    if (opts.require === 'bowl' && !bowls.length) continue;

    // Some pieces stay on the board as fixed pieces; the rest go into the tray.
    const fixed = [], tray = [];
    const shuffled = sol.slice().sort(() => rnd() - 0.5);
    let fixedCount = Math.min(sol.length - 1, Math.round(sol.length * (opts.fixedShare || 0) + (rnd() - 0.5)));
    for (const p of shuffled) {
      const keepInTray = opts.require && (p.k === 'splitter' && opts.require === 'splitter' || FILTER[p.k] && opts.require === 'filter') && !tray.some(k => k === p.k);
      if (fixedCount > 0 && !keepInTray) {
        fixedCount--;
        const rotatable = ROT[p.k] > 1 && rnd() < 0.7;
        const rot = rotatable ? norm(p.k, p.rot + 1 + Math.floor(rnd() * (ROT[p.k] - 1))) : p.rot;
        fixed.push({ k: p.k, c: p.c, r: p.r, rot, rotatable });
      } else tray.push(p.k);
    }
    if (!tray.length) continue;
    // Couches: obstacles off the beam that close off tempting detours.
    const free = [];
    for (let k = 0; k < n * n; k++) if (!t.vset.has(k) && k !== key(src.c, src.r) && !portalCells.has(k)) free.push(k);
    for (let b = 0; b < (opts.blockers || 0) && free.length; b++) {
      const k = free.splice(Math.floor(rnd() * free.length), 1)[0];
      fixed.push({ k: 'blocker', c: k % n, r: Math.floor(k / n), rot: 0, rotatable: false });
    }
    tray.sort((a, b) => KINDS.indexOf(a) - KINDS.indexOf(b));
    const level = { w: n, h: n, src, cats, fixed, tray };
    if (portals.length) level.portals = portals;
    if (bowls.length) level.bowls = bowls;
    const intended = new Set(sol.filter(p => !fixed.some(f => f.c === p.c && f.r === p.r)).map(p => `${p.k}@${p.c},${p.r}/${p.rot}`));
    let res = null;
    // Repair: while a second answer exists, park a couch where only that answer's beam goes.
    for (let fix = 0; fix <= (opts.repairs ?? 6); fix++) {
      cache.delete(level);
      res = solve(level, 2, opts.budget || 150000);
      if (res.outOfBudget) break;
      const alt = res.sols.find(x => x.unused.length || x.placed.length !== intended.size || x.placed.some(p => !intended.has(`${p.k}@${p.c},${p.r}/${p.rot}`)));
      if (!alt) break;
      const S = applySolution(level, { placed: alt.placed, fixedRot: alt.fixedRot });
      const altTrace = traceState(level, S), I = info(level);
      const spots = [...altTrace.vset].filter(k => !t.vset.has(k) && I.playable.has(k));
      for (const p of alt.placed) { const k = key(p.c, p.r); if (!t.vset.has(k) && I.playable.has(k) && !spots.includes(k)) spots.push(k); }
      if (!spots.length) { res = null; break; }
      const k = pick(spots);
      level.fixed.push({ k: 'blocker', c: k % n, r: Math.floor(k / n), rot: 0, rotatable: false });
    }
    if (!res || res.outOfBudget || res.sols.length !== 1 || res.sols[0].unused.length) continue;
    level.sol = { placed: res.sols[0].placed, fixedRot: res.sols[0].fixedRot };
    level.nodes = res.nodes;
    level.difficulty = difficulty(level);
    return level;
  }
  return null;
}

/** Rough difficulty: board size, pieces to place, rotations to find, search effort, empty cells to consider. */
function difficulty(L) {
  const empty = info(L).playable.size;
  const rotatable = L.fixed.filter(f => f.rotatable).length;
  const extras = (L.portals || []).length * 2 + (L.bowls || []).length + L.cats.filter(c => c[2]).length;
  return Math.round((L.w * 2 + L.tray.length * 4 + rotatable * 2.5 + extras * 1.5 + Math.log2(1 + (L.nodes || 1)) * 1.6 + empty * 0.06) * 10) / 10;
}

const api = { DX, DY, ROT, KINDS, COLORS, FILTER, norm, outgoing, info, trace, allCatsHit, bowlsMet, goalMet, newState, cloneState, boardPieces,
  traceState, unplaced, canPlace, place, remove, rotate, isSolved, solve, applySolution, parMoves, generate, difficulty, mulberry32 };
root.LaserCore = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
