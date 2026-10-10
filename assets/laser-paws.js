'use strict';
/* Laser Paws: guide the laser pointer with mirrors and wake every sleeping cat.
   Game logic lives in laser-core.js (LaserCore); levels in laser-levels.json. */
const LC = window.LaserCore;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daySeed = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function retrigger(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function pent(i) { i = Math.min(i, 19); const d = [0, 2, 4, 7, 9]; const m = 60 + 12 * Math.floor(i / 5) + d[((i % 5) + 5) % 5]; return 440 * Math.pow(2, (m - 69) / 12); }
const CHAPTER = 30;

/* =================== Cats to collect: one new breed per chapter =================== */
const BREEDS = [
  { name: 'Ginger Tabby', fur: '#F2B27E', dark: '#D98E5A', light: '#FBE3CC', eye: '#5A4636', stripes: true },
  { name: 'Grey Tabby', fur: '#BDB6AF', dark: '#8E867E', light: '#ECE7E2', eye: '#6E8B3D', stripes: true },
  { name: 'Tuxedo', fur: '#4A4448', dark: '#2E292C', light: '#FFFFFF', eye: '#C9B23A' },
  { name: 'Calico', fur: '#FFF6EC', dark: '#E39B53', light: '#FFFFFF', eye: '#5A4636', patch: '#4A4448' },
  { name: 'Siamese', fur: '#F3E6D3', dark: '#7A5A48', light: '#FFF8EE', eye: '#3D7EC9', points: true },
  { name: 'Russian Blue', fur: '#9AA7B8', dark: '#6E7B8E', light: '#D3DAE4', eye: '#5DB37E' },
  { name: 'Black Cat', fur: '#3B3540', dark: '#262129', light: '#5A5160', eye: '#F6C445' },
  { name: 'Cream Persian', fur: '#F6E7C8', dark: '#E2C79A', light: '#FFF8E8', eye: '#C9853A' },
  { name: 'Tortoiseshell', fur: '#6B4A3A', dark: '#3E2A22', light: '#E39B53', eye: '#C9B23A', patch: '#E39B53' },
  { name: 'Snow Ragdoll', fur: '#FFFFFF', dark: '#C9B8A8', light: '#FFFFFF', eye: '#3D7EC9', points: true },
];

/* =================== Saved progress =================== */
const KEY = 'laserpaws.v1';
const P = (() => { let d = null; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  return Object.assign({ level: 1, hints: 3, stars: {}, streak: 0, lastDaily: '', daily: {}, sound: true, music: true, haptics: true, seenBreeds: 1 }, d || {}); })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} };
const totalStars = () => Object.values(P.stars).reduce((a, b) => a + b, 0);
const streakNow = () => P.lastDaily === dayKey() || P.lastDaily === yesterday() ? P.streak : 0;
const breedsUnlocked = () => Math.min(BREEDS.length, 1 + Math.floor((P.level - 1) / CHAPTER));
const chapterOf = level => Math.floor((level - 1) / CHAPTER);

/* =================== Sound (synthesised, no files) =================== */
const Sound = {
  ctx: null,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -12; this.comp.ratio.value = 4; this.comp.connect(c.destination);
      const len = Math.floor(c.sampleRate * 1.8); this.ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = this.ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
      this.nb = c.createBuffer(1, c.sampleRate, c.sampleRate); const nd = this.nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this.sfx = this.bus(P.sound ? 1 : 0); this.mus = this.bus(P.music ? 0.8 : 0);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    Music.start();
  },
  bus(v) { const c = this.ctx, g = c.createGain(); g.gain.value = v; g.connect(this.comp); const r = c.createConvolver(); r.buffer = this.ir; const rg = c.createGain(); rg.gain.value = 0.45; r.connect(rg); rg.connect(g); return { in: g, verb: r }; },
  set() { if (!this.ctx) return; this.sfx.in.gain.value = P.sound ? 1 : 0; this.mus.in.gain.value = P.music ? 0.8 : 0; },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  tone(f, o = {}) {
    const c = this.ctx; if (!c) return; const bus = o.bus || 'sfx'; if (bus === 'sfx' && !P.sound) return;
    const t = Math.max(o.t || 0, c.currentTime), dur = o.dur || 0.3, b = this[bus];
    const os = c.createOscillator(), g = c.createGain(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t);
    if (o.glide) os.frequency.exponentialRampToValueAtTime(o.glide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.attack || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(b.in);
    const wet = o.wet === undefined ? 0.25 : o.wet; if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(b.verb); }
    os.start(t); os.stop(t + dur + 0.05);
  },
  noise(o = {}) {
    const c = this.ctx; if (!c || !P.sound) return; const t = Math.max(o.t || 0, c.currentTime), dur = o.dur || 0.12;
    const s = c.createBufferSource(); s.buffer = this.nb; const f = c.createBiquadFilter(); f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 2000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur); f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + (o.attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx.in); if (o.wet) { const w = c.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(this.sfx.verb); }
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  },
  marimba(f, o = {}) { const v = o.vol || 0.16; this.tone(f, { ...o, dur: 0.6, vol: v }); this.tone(f * 4, { ...o, dur: 0.06, vol: v * 0.25, wet: 0 }); this.tone(f * 2, { ...o, type: 'triangle', dur: 0.16, vol: v * 0.12 }); },
  bell(f, o = {}) { const v = o.vol || 0.12; this.tone(f, { ...o, dur: 1.5, vol: v, wet: 0.6 }); this.tone(f * 2.76, { ...o, dur: 0.5, vol: v * 0.22, wet: 0.5 }); },
  click() { this.tone(1600, { dur: 0.03, vol: 0.05, type: 'triangle', wet: 0 }); },
  pickup() { this.tone(520, { glide: 820, dur: 0.09, vol: 0.12, type: 'triangle', wet: 0.1 }); },
  place() { this.tone(330, { dur: 0.12, vol: 0.22, type: 'triangle', wet: 0.1 }); this.noise({ type: 'highpass', f: 2500, dur: 0.03, vol: 0.12 }); },
  turn() { this.tone(980, { dur: 0.04, vol: 0.07, type: 'square', wet: 0 }); this.tone(1470, { dur: 0.03, vol: 0.04, type: 'triangle', wet: 0, t: this.now() + 0.025 }); },
  back() { this.tone(600, { glide: 380, dur: 0.12, vol: 0.1, type: 'triangle', wet: 0.1 }); },
  denied() { this.tone(160, { glide: 90, dur: 0.18, vol: 0.35, wet: 0 }); },
  /** A soft synthetic "mrrp": rising-falling sawtooth through a vocal-ish band-pass, with a purr trill. */
  meow(pitch = 1) {
    const c = this.ctx; if (!c || !P.sound) return; const t = c.currentTime + 0.01;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(430 * pitch, t); o.frequency.exponentialRampToValueAtTime(720 * pitch, t + 0.13); o.frequency.exponentialRampToValueAtTime(470 * pitch, t + 0.42);
    f.type = 'bandpass'; f.Q.value = 3.5; f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(1900, t + 0.14); f.frequency.exponentialRampToValueAtTime(900, t + 0.42);
    lfo.frequency.value = 26; lg.gain.value = 0.5; lfo.connect(lg); // purr trill at the start
    const trill = c.createGain(); trill.gain.setValueAtTime(1, t); lg.connect(trill.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.04); g.gain.setValueAtTime(0.32, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    o.connect(f); f.connect(trill); trill.connect(g); g.connect(this.sfx.in);
    const w = c.createGain(); w.gain.value = 0.18; g.connect(w); w.connect(this.sfx.verb);
    o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
  },
  star(i) { this.bell(pent(9 + i * 2), { vol: 0.15 }); this.marimba(pent(4 + i * 2), { vol: 0.1 }); },
  win() { const t = this.now(); for (let i = 0; i < 8; i++) this.marimba(pent(5 + i), { t: t + i * 0.065, vol: 0.14 }); [12, 14, 16].forEach(k => this.bell(pent(k), { t: t + 0.58, vol: 0.09 })); },
  gift() { const t = this.now(); [10, 12, 14, 17].forEach((k, i) => this.bell(pent(k), { t: t + i * 0.09, vol: 0.1 })); },
};
/* Gentle generative background music: pad, bass, sparse marimba. */
const Music = { timer: null, next: 0, step: 0,
  start() { if (this.timer || !Sound.ctx) return; this.next = Sound.ctx.currentTime + 0.2; this.timer = setInterval(() => this.tick(), 100); },
  tick() { const c = Sound.ctx; if (!c || c.state !== 'running' || !P.music) return; const spb = 60 / 76 / 2; if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.35) { this.play(this.step, this.next); this.next += spb; this.step++; } },
  play(s, t) {
    const CH = [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]], ch = CH[Math.floor(s / 16) % 4], m = n => 440 * Math.pow(2, (n - 69) / 12);
    if (s % 16 === 0) for (const k of ch) Sound.tone(m(55 + k), { t, dur: 4.4, vol: 0.018, attack: 1, wet: 0.7, bus: 'mus' });
    if (s % 8 === 0) Sound.tone(m(43 + ch[0]), { t, dur: 1.6, vol: 0.04, type: 'triangle', wet: 0.2, bus: 'mus' });
    if (s % 2 === 0 && Math.random() < 0.35) { const pool = [0, 2, 4, 7, 9, 12, 14]; Sound.marimba(m(72 + pool[Math.floor(Math.random() * pool.length)]), { t, vol: 0.028, bus: 'mus', wet: 0.6 }); }
  } };
document.addEventListener('visibilitychange', () => { if (!Sound.ctx) return; document.hidden ? Sound.ctx.suspend() : Sound.ctx.resume(); });

/* =================== Haptics ===================
   Android: Vibration API. iPhone (iOS 18+): Safari has no vibration API, but toggling a native
   switch control plays the system haptic tick, so we click a hidden one. */
const Haptic = {
  tick() {
    if (!P.haptics) return;
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} return; }
    try { const l = document.createElement('label'); l.ariaHidden = 'true'; l.style.display = 'none'; const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i); document.head.appendChild(l); l.click(); l.remove(); } catch (e) {}
  },
  pattern(ms, vib) { if (!P.haptics) return; if (navigator.vibrate) { try { navigator.vibrate(vib); } catch (e) {} return; } ms.forEach(t => t ? setTimeout(() => this.tick(), t) : this.tick()); },
  tap() { this.tick(); },
  success() { this.pattern([0, 110], [14, 60, 22]); },
  error() { this.pattern([0, 90], [40, 40, 40]); },
  big() { this.pattern([0, 90, 180, 320], [20, 50, 20, 50, 80]); },
};

/* =================== Particles, floating text, toasts =================== */
const FX = { p: [], on: false,
  init() { this.cv = $('#fx'); this.x = this.cv.getContext('2d'); this.size(); addEventListener('resize', () => this.size()); },
  size() { this.d = Math.min(devicePixelRatio || 1, 2); this.cv.width = innerWidth * this.d; this.cv.height = innerHeight * this.d; },
  add(o) { this.p.push(o); if (!this.on) { this.on = true; this.last = performance.now(); requestAnimationFrame(t => this.step(t)); } },
  burst(x, y, colors, n = 14, sp = 260) { if (reduce) n = Math.ceil(n / 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.35 + Math.random() * 0.65); this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 70, g: 520, life: 0, max: 0.45 + Math.random() * 0.35, r: 2.5 + Math.random() * 3.5, c: colors[i % colors.length] }); } },
  confetti(colors) { const n = reduce ? 30 : 150, W = innerWidth, H = innerHeight;
    for (let i = 0; i < n; i++) { const side = i % 3; let x, y, vx, vy;
      if (side === 0) { x = Math.random() * W; y = -20; vx = (Math.random() - 0.5) * 120; vy = 80 + Math.random() * 180; }
      else { x = side === 1 ? -10 : W + 10; y = H * 0.78; vx = (side === 1 ? 1 : -1) * (180 + Math.random() * 340); vy = -(480 + Math.random() * 440); }
      this.add({ x, y, vx, vy, g: 560, drag: 0.986, life: 0, max: 3.4, w: 6 + Math.random() * 5, h: 9 + Math.random() * 7, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: colors[i % colors.length], rect: true }); } },
  step(t) {
    const dt = Math.min(0.033, (t - this.last) / 1000); this.last = t; const x = this.x;
    x.setTransform(this.d, 0, 0, this.d, 0, 0); x.clearRect(0, 0, innerWidth, innerHeight);
    this.p = this.p.filter(q => { q.life += dt; if (q.life > q.max || q.y > innerHeight + 60) return false;
      q.vy += q.g * dt; if (q.drag) { q.vx *= q.drag; q.vy *= q.drag; } q.x += q.vx * dt; q.y += q.vy * dt;
      x.globalAlpha = Math.min(1, (q.max - q.life) / 0.3); x.fillStyle = q.c;
      if (q.rect) { q.rot += q.vr * dt; x.save(); x.translate(q.x, q.y); x.rotate(q.rot); x.scale(1, Math.cos(q.rot * 1.7)); x.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); x.restore(); }
      else { x.beginPath(); x.arc(q.x, q.y, q.r * (1 - q.life / q.max * 0.6), 0, 7); x.fill(); }
      return true; });
    x.globalAlpha = 1;
    if (this.p.length) requestAnimationFrame(t => this.step(t)); else { this.on = false; x.clearRect(0, 0, innerWidth, innerHeight); }
  } };
function toast(html) { const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = html; $('#toasts').appendChild(d); setTimeout(() => d.remove(), 2900); }

/* =================== Drawing (all placeholder vector art; one cell = s px) =================== */
const C = {}; // colours, read from CSS tokens
function readColors() { for (const k of ['board', 'tile1', 'tile2', 'token', 'token-fixed', 'token-edge', 'mirror', 'mirror-sheen', 'mirror-back', 'couch', 'couch-dark', 'beam', 'beam-glow', 'laser', 'laser-tip', 'valid', 'tray', 'ink', 'muted', 'shadow', 'gold', 'surface', 'accent', 'mint', 'sky', 'blue', 'blue-glow', 'green', 'green-glow', 'glass', 'glass-edge', 'portal1', 'portal2', 'bowl', 'bowl-dark', 'kibble']) C[k] = tok('--' + k); }
const beamColors = col => [[C.beam, C['beam-glow']], [C.blue, C['blue-glow']], [C.green, C['green-glow']]][col || 0];
function rr(ctx, cx, cy, w, h, r) { ctx.beginPath(); ctx.moveTo(cx - w / 2 + r, cy - h / 2); ctx.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r); ctx.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r); ctx.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r); ctx.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r); ctx.closePath(); }
const box = (ctx, cx, cy, w, h, r, fill) => { rr(ctx, cx, cy, w, h, r); ctx.fillStyle = fill; ctx.fill(); };
function drawToken(ctx, x, y, s, fixed) {
  const side = s * 0.84;
  box(ctx, x, y + s * 0.045, side, side, side * 0.24, C.shadow);
  rr(ctx, x, y, side, side, side * 0.24); ctx.fillStyle = fixed ? C['token-fixed'] : C.token; ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.025); ctx.strokeStyle = C['token-edge']; ctx.stroke();
}
function drawMirror(ctx, x, y, s, kind, angle) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle - Math.PI / 4);
  const L = s * 0.9, T = s * 0.17;
  box(ctx, 0, T / 4, L, T / 2, T / 4, kind === 'double' ? C.mirror : C['mirror-back']); // back half (bottom-right at rotation 0)
  box(ctx, 0, -T / 4, L, T / 2, T / 4, C.mirror); // shiny face (top-left at rotation 0)
  box(ctx, -L * 0.05, -T * 0.33, L * 0.68, T * 0.1, T * 0.05, C['mirror-sheen']);
  if (kind === 'double') box(ctx, L * 0.05, T * 0.33, L * 0.68, T * 0.1, T * 0.05, C['mirror-sheen']);
  ctx.restore();
}
/** Glass vase: the pane through it shows which diagonal bends the light (like a mirror, but light also passes). */
function drawSplitter(ctx, x, y, s, angle) {
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = 0.55; ctx.fillStyle = C.glass;
  ctx.beginPath(); ctx.ellipse(0, s * 0.07, s * 0.25, s * 0.25, 0, 0, 7); ctx.fill();
  box(ctx, 0, -s * 0.2, s * 0.16, s * 0.14, s * 0.05, C.glass);
  ctx.globalAlpha = 1; ctx.strokeStyle = C['glass-edge']; ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.beginPath(); ctx.ellipse(0, s * 0.07, s * 0.25, s * 0.25, 0, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -s * 0.27, s * 0.11, s * 0.035, 0, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(-s * 0.12, -s * 0.02, s * 0.04, s * 0.09, 0.4, 0, 7); ctx.fill();
  ctx.rotate(angle - Math.PI / 4); ctx.lineCap = 'round';
  ctx.strokeStyle = C['glass-edge']; ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.moveTo(-s * 0.37, 0); ctx.lineTo(s * 0.37, 0); ctx.stroke();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = s * 0.03; ctx.stroke();
  ctx.restore();
}
/** Coloured glass: tints the beam passing through it. */
function drawFilter(ctx, x, y, s, kind) {
  const col = kind === 'fblue' ? C.blue : C.green;
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = 0.55; box(ctx, 0, 0, s * 0.56, s * 0.56, s * 0.12, col); ctx.globalAlpha = 1;
  rr(ctx, 0, 0, s * 0.56, s * 0.56, s * 0.12); ctx.lineWidth = Math.max(1.5, s * 0.04); ctx.strokeStyle = col; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = s * 0.045; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * 0.16, s * 0.07); ctx.lineTo(s * 0.06, -s * 0.15); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * 0.03, s * 0.15); ctx.lineTo(s * 0.13, -s * 0.01); ctx.stroke();
  ctx.restore();
}
/** Food bowl with an arrow: the beam has to cross this cell going that way. Gold when it does. */
function drawBowl(ctx, x, y, s, d, met, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.save(); ctx.rotate(DIR_ANGLE[d]); ctx.globalAlpha = met ? 1 : 0.6; ctx.fillStyle = met ? C.gold : C.muted;
  ctx.beginPath(); ctx.moveTo(s * 0.45, 0); ctx.lineTo(s * 0.24, -s * 0.17); ctx.lineTo(s * 0.24, -s * 0.06); ctx.lineTo(-s * 0.43, -s * 0.06);
  ctx.lineTo(-s * 0.43, s * 0.06); ctx.lineTo(s * 0.24, s * 0.06); ctx.lineTo(s * 0.24, s * 0.17); ctx.closePath(); ctx.fill(); ctx.restore();
  if (met) { ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t / 200); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(0, s * 0.06, s * 0.36, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.fillStyle = C['bowl-dark']; ctx.beginPath(); ctx.moveTo(-s * 0.28, s * 0.04); ctx.quadraticCurveTo(0, s * 0.36, s * 0.28, s * 0.04); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.bowl; ctx.beginPath(); ctx.ellipse(0, s * 0.04, s * 0.28, s * 0.09, 0, 0, 7); ctx.fill();
  ctx.fillStyle = C.kibble; for (const [kx, ky] of [[-0.12, 0.03], [-0.03, 0.01], [0.07, 0.04], [0.14, 0.02], [0.02, 0.06]]) { ctx.beginPath(); ctx.arc(s * kx, s * ky, s * 0.035, 0, 7); ctx.fill(); }
  ctx.restore();
}
/** Cat flap. Flaps come in matching-colour pairs: in one, out of the other. */
function drawPortal(ctx, x, y, s, i, t) {
  const col = [C.portal1, C.portal2, C.gold][i % 3];
  ctx.save(); ctx.translate(x, y);
  box(ctx, 0, 0, s * 0.8, s * 0.8, s * 0.24, col);
  ctx.fillStyle = '#2B2238'; ctx.beginPath(); ctx.ellipse(0, s * 0.03, s * 0.27, s * 0.29, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round';
  for (let j = 0; j < 3; j++) { const a = t / 500 + j * 2.1; ctx.beginPath(); ctx.arc(0, s * 0.03, s * (0.07 + j * 0.065), a, a + 2.2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const [px, py, pr] of [[0, -0.31, 0.035], [-0.07, -0.335, 0.022], [0.07, -0.335, 0.022]]) { ctx.beginPath(); ctx.arc(s * px, s * py, s * pr, 0, 7); ctx.fill(); }
  ctx.restore();
}
function drawCouch(ctx, x, y, s) {
  const w = s * 0.66;
  box(ctx, x - w * 0.38, y + s * 0.2, s * 0.05, s * 0.08, s * 0.02, C.ink);
  box(ctx, x + w * 0.38, y + s * 0.2, s * 0.05, s * 0.08, s * 0.02, C.ink);
  box(ctx, x, y - s * 0.12, w, s * 0.22, s * 0.08, C['couch-dark']);
  box(ctx, x, y + s * 0.04, w * 0.82, s * 0.24, s * 0.07, C.couch);
  box(ctx, x - w / 2, y, s * 0.13, s * 0.34, s * 0.06, C['couch-dark']);
  box(ctx, x + w / 2, y, s * 0.13, s * 0.34, s * 0.06, C['couch-dark']);
}
const DIR_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
function drawLaser(ctx, x, y, s, d, t) {
  drawToken(ctx, x, y, s, true);
  ctx.save(); ctx.translate(x, y); ctx.rotate(DIR_ANGLE[d]);
  box(ctx, -s * 0.04, 0, s * 0.56, s * 0.22, s * 0.11, C.laser);
  box(ctx, s * 0.27, 0, s * 0.14, s * 0.16, s * 0.04, C['laser-tip']);
  ctx.fillStyle = C.beam; ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.02, s * 0.045, 0, 7); ctx.fill();
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t / 250); ctx.beginPath(); ctx.arc(s * 0.34, 0, s * 0.045, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();
}
function drawBadge(ctx, x, y, s, kind) {
  const r = s * 0.15, bx = x + s * 0.33, by = y - s * 0.33;
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.025); ctx.strokeStyle = C.token; ctx.stroke();
  ctx.fillStyle = C.token; ctx.strokeStyle = C.token; ctx.lineWidth = Math.max(1.2, r * 0.2); ctx.lineCap = 'round';
  if (kind === 'lock') {
    box(ctx, bx, by + r * 0.2, r * 1.0, r * 0.75, r * 0.15, C.token);
    ctx.beginPath(); ctx.arc(bx, by - r * 0.15, r * 0.32, Math.PI, 0); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(bx, by, r * 0.5, -Math.PI * 0.15, Math.PI * 1.3); ctx.stroke();
    const a = -Math.PI * 0.15, tx = bx + r * 0.5 * Math.cos(a), ty = by + r * 0.5 * Math.sin(a);
    ctx.beginPath(); ctx.moveTo(tx + r * 0.3, ty - r * 0.02); ctx.lineTo(tx - r * 0.1, ty - r * 0.34); ctx.lineTo(tx - r * 0.06, ty + r * 0.22); ctx.closePath(); ctx.fill();
  }
}
function ears(ctx, hx, hy, r, color, inner) {
  for (const sd of [-1, 1]) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(hx + sd * r * 0.95, hy - r * 0.25); ctx.lineTo(hx + sd * r * 0.78, hy - r * 1.18); ctx.lineTo(hx + sd * r * 0.18, hy - r * 0.78); ctx.closePath(); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = r * 0.14; ctx.strokeStyle = color; ctx.stroke();
    if (inner) { ctx.fillStyle = inner; ctx.beginPath(); ctx.moveTo(hx + sd * r * 0.75, hy - r * 0.45); ctx.lineTo(hx + sd * r * 0.7, hy - r * 0.92); ctx.lineTo(hx + sd * r * 0.38, hy - r * 0.68); ctx.closePath(); ctx.fill(); }
  }
}
/** A cat. `awake` 0..1 blends nothing (the poses differ); `pop` is the wake-up bounce 0..1; `t` drives idle motion. */
function drawCat(ctx, x, y, s, breed, awake, t, pop = 0, hop = 0, collar = null) {
  const B = breed, earColor = B.points ? B.dark : B.fur;
  ctx.save(); ctx.translate(x, y - hop * s * 0.3);
  const sc = 1 + Math.sin(pop * Math.PI) * 0.22; ctx.scale(sc, sc);
  ctx.fillStyle = C.shadow; ctx.beginPath(); ctx.ellipse(0, s * 0.22 + hop * s * 0.3, s * 0.36 * (1 - hop * 0.3), s * 0.11, 0, 0, 7); ctx.fill();
  if (collar) { ctx.globalAlpha = 0.35; ctx.fillStyle = collar; ctx.beginPath(); ctx.ellipse(0, s * 0.22 + hop * s * 0.3, s * 0.42, s * 0.15, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  const band = (cx, cy, r, a0, a1) => { if (!collar) return; ctx.strokeStyle = collar; ctx.lineWidth = s * 0.055; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.96, a0, a1); ctx.stroke(); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(cx + r * 0.96 * Math.cos((a0 + a1) / 2), cy + r * 0.96 * Math.sin((a0 + a1) / 2) + s * 0.03, s * 0.04, 0, 7); ctx.fill(); };
  if (!awake) {
    // Curled up asleep, breathing.
    const br = 1 + Math.sin(t / 700) * 0.025;
    ctx.lineCap = 'round'; ctx.strokeStyle = B.dark; ctx.lineWidth = s * 0.08;
    ctx.beginPath(); ctx.moveTo(s * 0.33, s * 0.12); ctx.quadraticCurveTo(s * 0.3, s * 0.36, -s * 0.15, s * 0.3); ctx.stroke();
    ctx.fillStyle = B.fur; ctx.beginPath(); ctx.ellipse(s * 0.04, s * 0.1, s * 0.33 * br, s * 0.2 * br, 0, 0, 7); ctx.fill();
    if (B.patch) { ctx.fillStyle = B.patch; ctx.beginPath(); ctx.ellipse(s * 0.14, s * 0.04, s * 0.12, s * 0.08, 0.4, 0, 7); ctx.fill(); }
    if (B.stripes) { ctx.strokeStyle = B.dark; ctx.lineWidth = s * 0.03; for (const dx of [0.02, 0.12, 0.22]) { ctx.beginPath(); ctx.arc(s * dx, s * 0.0, s * 0.07, 0.3, 1.4); ctx.stroke(); } }
    const r = s * 0.17, hx = -s * 0.18, hy = s * 0.04;
    ears(ctx, hx, hy, r, earColor);
    ctx.fillStyle = B.fur; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.fill();
    band(hx, hy, r, Math.PI * 0.3, Math.PI * 0.85);
    if (B.points) { ctx.fillStyle = B.dark; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.ellipse(hx, hy + r * 0.25, r * 0.5, r * 0.4, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = B.fur === '#3B3540' || B.fur === '#4A4448' || B.fur === '#6B4A3A' ? '#E8DCCB' : C.ink; ctx.lineWidth = Math.max(1, r * 0.12);
    for (const ex of [-r * 0.4, r * 0.35]) { ctx.beginPath(); ctx.moveTo(hx + ex - r * 0.2, hy - r * 0.05); ctx.quadraticCurveTo(hx + ex, hy + r * 0.15, hx + ex + r * 0.2, hy - r * 0.05); ctx.stroke(); }
    // Floating z
    const zt = (t / 1600) % 1;
    ctx.globalAlpha = Math.sin(zt * Math.PI) * 0.8; ctx.fillStyle = C.muted; ctx.font = `700 ${s * 0.2}px Fredoka, sans-serif`;
    ctx.fillText('z', s * 0.22 + zt * s * 0.1, -s * 0.12 - zt * s * 0.16); ctx.globalAlpha = 1;
  } else {
    // Sitting up, tail swishing, watching the red dot.
    const wag = Math.sin(t / 220) * 0.18;
    ctx.save(); ctx.translate(s * 0.18, s * 0.2); ctx.rotate(wag);
    ctx.lineCap = 'round'; ctx.strokeStyle = B.points ? B.dark : B.dark; ctx.lineWidth = s * 0.08;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.26, 0, s * 0.18, -s * 0.3); ctx.stroke(); ctx.restore();
    ctx.fillStyle = B.fur; ctx.beginPath(); ctx.ellipse(0, s * 0.13, s * 0.22, s * 0.21, 0, 0, 7); ctx.fill();
    ctx.fillStyle = B.light; ctx.beginPath(); ctx.ellipse(0, s * 0.16, s * 0.11, s * 0.13, 0, 0, 7); ctx.fill();
    if (B.patch) { ctx.fillStyle = B.patch; ctx.beginPath(); ctx.ellipse(-s * 0.12, s * 0.08, s * 0.08, s * 0.1, 0.3, 0, 7); ctx.fill(); }
    const r = s * 0.19, hy = -s * 0.13;
    ears(ctx, 0, hy, r, earColor, B.points ? null : '#F7C9C0');
    ctx.fillStyle = B.fur; ctx.beginPath(); ctx.arc(0, hy, r, 0, 7); ctx.fill();
    band(0, hy, r, Math.PI * 0.22, Math.PI * 0.78);
    if (B.patch) { ctx.fillStyle = B.patch; ctx.beginPath(); ctx.arc(r * 0.45, hy - r * 0.35, r * 0.42, 0, 7); ctx.fill(); }
    if (B.points) { ctx.fillStyle = B.dark; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(0, hy + r * 0.25, r * 0.55, r * 0.45, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    if (B.stripes) { ctx.strokeStyle = B.dark; ctx.lineWidth = s * 0.025; for (const dx of [-0.25, 0, 0.25]) { ctx.beginPath(); ctx.moveTo(dx * r, hy - r * 0.95); ctx.lineTo(dx * r * 0.8, hy - r * 0.6); ctx.stroke(); } }
    const blink = (t % 3800) < 120 ? 0.15 : 1;
    for (const ex of [-r * 0.42, r * 0.42]) {
      ctx.fillStyle = B.eye; ctx.beginPath(); ctx.ellipse(ex, hy + r * 0.05, r * 0.2, r * 0.2 * blink, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#2A211B'; ctx.beginPath(); ctx.ellipse(ex + r * 0.04, hy + r * 0.05, r * 0.08, r * 0.15 * blink, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#F29AA6'; ctx.beginPath(); ctx.moveTo(-r * 0.12, hy + r * 0.3); ctx.lineTo(r * 0.12, hy + r * 0.3); ctx.lineTo(0, hy + r * 0.44); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* =================== Icons =================== */
const I = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 2c1 3.6 5.5 5.6 5.5 11.2a5.5 5.5 0 0 1-11 0c0-2.6 1.3-4.3 2.6-5.4.1 1.9 1 3.2 2.3 3.6C10.9 8.5 11.2 5 12 2z" fill="currentColor"/></svg>',
  bulb: '<svg viewBox="0 0 24 24"><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.6.5 1 1.2 1 2V17h5.6v-.7c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 2.5z" fill="currentColor"/><path d="M9.5 19.5h5M10.5 22h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3"/><path d="M3.5 3.5v4.8h4.8"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle cx="16" cy="7" r="2.6"/><circle cx="10" cy="17" r="2.6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  paw: '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="16" rx="5" ry="4.2"/><circle cx="5.5" cy="10.5" r="2.2"/><circle cx="9.3" cy="6.6" r="2.3"/><circle cx="14.7" cy="6.6" r="2.3"/><circle cx="18.5" cy="10.5" r="2.2"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L4 15.5a1.6 1.6 0 0 1 2.4-2.1L9 15.5V8.5"/></svg>',
};

/* =================== Markup =================== */
document.body.insertAdjacentHTML('afterbegin', `
<div id="app">
 <section id="home" class="screen">
  <header class="topbar">
   <div class="pills">
    <span class="pill" aria-label="Stars"><span class="c-gold">${I.star}</span><b id="pStars">0</b></span>
    <span class="pill" aria-label="Daily streak"><span class="c-flame">${I.flame}</span><b id="pStreak">0</b></span>
    <span class="pill" aria-label="Hints"><span class="c-gold">${I.bulb}</span><b data-hints>0</b></span>
   </div>
   <button class="icon-btn" id="btnSettings" aria-label="Settings">${I.sliders}</button>
  </header>
  <div class="home-body">
   <div class="hero">
    <div class="hero-art"><canvas id="heroCanvas"></canvas></div>
    <div class="hero-head"><h1>Laser Paws</h1><span class="lvl-tag" id="heroLvl"></span></div>
    <p>Bounce the laser pointer off mirrors and wake every sleeping cat in one go.</p>
    <div class="gift"><span class="gi c-gold">${I.paw}</span><div class="bar"><i id="chapBar"></i></div><span id="chapTxt"></span></div>
    <button class="btn big glow" id="btnPlay">${I.play}<span id="playTxt">Play</span></button>
    <div class="duo"><button class="btn soft" id="btnLevels">Levels</button><button class="btn soft" id="btnDaily">Daily</button></div>
    <button class="btn soft" id="btnCats">${I.paw}<span id="catsTxt">Cat collection</span></button>
   </div>
   <p class="install" id="installTip" hidden>Play it like an app: in Safari tap Share, then “Add to Home Screen”.</p>
   <a class="back-link" id="allLink" href="../" hidden>More puzzles</a>
  </div>
 </section>
 <section id="levels" class="screen" hidden>
  <header class="gbar"><button class="icon-btn" data-home aria-label="Back">${I.back}</button><div class="gtitle"><h2>Levels</h2><div class="sub" id="lvSub"></div></div></header>
  <div class="lv-wrap" id="lvWrap"></div>
 </section>
 <section id="cats" class="screen" hidden>
  <header class="gbar"><button class="icon-btn" data-home aria-label="Back">${I.back}</button><div class="gtitle"><h2>Cat collection</h2><div class="sub" id="catsSub"></div></div></header>
  <div class="cats-grid" id="catsGrid"></div>
 </section>
 <section id="game" class="screen" hidden>
  <header class="gbar">
   <button class="icon-btn" data-home aria-label="Menu">${I.back}</button>
   <div class="gtitle"><h2 id="gTitle">Level 1</h2><div class="sub" id="gSub"></div></div>
   <span class="moves">${I.hand}<b id="gMoves">0</b></span>
  </header>
  <div class="stage" id="stage"><canvas id="lpCanvas"></canvas></div>
  <p class="coach" id="coach" hidden></p>
  <nav class="gctl">
   <button class="rbtn" id="btnUndo"><i class="disc">${I.undo}</i><span>Undo</span></button>
   <button class="rbtn hint" id="btnHint"><i class="disc">${I.bulb}<b class="count" data-hints>0</b></i><span>Hint</span></button>
   <button class="rbtn" id="btnReset"><i class="disc">${I.restart}</i><span>Reset</span></button>
  </nav>
 </section>
</div>
<div id="sheetWrap" hidden><div class="sheet" id="sheet"></div></div>
<div id="toasts"></div>
<canvas id="fx"></canvas>`);

/* =================== Sheets =================== */
let adTimer = null;
function openSheet(html, dismiss) { const w = $('#sheetWrap'), s = $('#sheet'); s.innerHTML = html; w.hidden = false; retrigger(s, 'sheet'); w.onclick = e => { if (dismiss && e.target === w) closeSheet(); }; return s; }
function closeSheet() { $('#sheetWrap').hidden = true; clearInterval(adTimer); }
function bind(s, map) { s.querySelectorAll('[data-act]').forEach(b => b.onclick = () => map[b.dataset.act]()); }
function playAd(reward) {
  let n = 3; const draw = () => openSheet(`<p style="font-weight:800;color:var(--muted);margin:0">AD BREAK</p><div class="big-n">${n}</div><div class="ad-box">Rewarded ad slot. The App Store version plays a short video ad here.</div>`);
  draw(); clearInterval(adTimer); adTimer = setInterval(() => { n--; if (n <= 0) { closeSheet(); reward(); } else draw(); }, 1000);
}
function settings() {
  const tg = (k, l) => `<button class="tgl" role="switch" aria-checked="${P[k]}" data-tg="${k}"><span>${l}</span><i></i></button>`;
  const s = openSheet(`<h3>Settings</h3><div class="tgls">${tg('sound', 'Sound effects')}${tg('music', 'Music')}${tg('haptics', 'Vibration')}</div><button class="btn big" data-act="done">Done</button>`, true);
  s.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const k = b.dataset.tg; P[k] = !P[k]; save(); b.setAttribute('aria-checked', P[k]); Sound.set(); if (k === 'haptics') Haptic.tap(); });
  bind(s, { done: closeSheet });
}

/* =================== Screens =================== */
let LEVELS = [];
function go(id) {
  $$('.screen').forEach(s => s.hidden = s.id !== id);
  if (id === 'home') renderHome();
  if (id === 'game') { layout(); loop(); }
  if (id === 'home') heroLoop();
}
function hud() { $$('[data-hints]').forEach(e => e.textContent = P.hints); $('#pStars').textContent = totalStars(); $('#pStreak').textContent = streakNow(); }
function renderHome() {
  hud();
  const lvl = Math.min(P.level, LEVELS.length || P.level), ch = chapterOf(lvl), into = (lvl - 1) % CHAPTER;
  $('#heroLvl').textContent = 'Level ' + lvl;
  $('#playTxt').textContent = P.level > LEVELS.length && LEVELS.length ? 'All levels done!' : 'Play Level ' + lvl;
  $('#chapBar').style.width = '0%'; requestAnimationFrame(() => requestAnimationFrame(() => $('#chapBar').style.width = (into / CHAPTER * 100) + '%'));
  $('#chapTxt').textContent = ch + 1 < BREEDS.length ? `New cat in ${CHAPTER - into}` : `Chapter ${ch + 1}`;
  const done = !!P.daily[dayKey()]; $('#btnDaily').innerHTML = done ? `${I.check}Daily` : 'Daily <i class="dot"></i>'; $('#btnDaily').classList.toggle('done', done);
  $('#catsTxt').textContent = `Cat collection · ${breedsUnlocked()}/${BREEDS.length}`;
}
function miniCat(breed, awake = true, size = 104) {
  const cv = document.createElement('canvas'), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = cv.height = size * d; const x = cv.getContext('2d'); x.scale(d, d);
  drawCat(x, size / 2, size * 0.56, size * 0.95, breed, awake, 1000);
  return cv;
}
function showLevels() {
  const cur = P.level, wrap = $('#lvWrap'); wrap.innerHTML = '';
  for (let ch = 0; ch * CHAPTER < LEVELS.length; ch++) {
    const first = ch * CHAPTER + 1, last = Math.min(LEVELS.length, first + CHAPTER - 1), locked = cur < first;
    let stars = 0; for (let i = first; i <= last; i++) stars += P.stars[i] || 0;
    const sec = document.createElement('div'); sec.className = 'chapter';
    const head = document.createElement('div'); head.className = 'chapter-head' + (locked ? ' locked' : '');
    head.appendChild(miniCat(BREEDS[ch % BREEDS.length], !locked, 52));
    const fresh = ['glass vases', 'food bowls & cat flaps', 'coloured glass'][ch] || '';
    head.insertAdjacentHTML('beforeend', `<div><h3>Chapter ${ch + 1}</h3><p>${locked ? (fresh ? `Locked · new: ${fresh}` : 'Locked') : `${BREEDS[ch % BREEDS.length].name} · ${stars}/${(last - first + 1) * 3} stars${fresh ? ` · new: ${fresh}` : ''}`}</p></div>`);
    sec.appendChild(head);
    if (!locked) {
      let h = '<div class="lv-grid">';
      for (let i = first; i <= last; i++) {
        const st = P.stars[i] || 0, state = i < cur ? 'done' : i === cur ? 'cur' : 'lock';
        h += `<button class="lvl ${state}" data-lv="${i}" ${state === 'lock' ? 'disabled' : ''}><span>${state === 'lock' ? I.lock : i}</span>${state === 'done' ? `<span class="lst">${[0, 1, 2].map(k => `<i class="${k < st ? 'on' : ''}">${I.star}</i>`).join('')}</span>` : ''}</button>`;
      }
      sec.insertAdjacentHTML('beforeend', h + '</div>');
    }
    wrap.appendChild(sec);
  }
  $('#lvSub').innerHTML = `${I.star} ${totalStars()} stars · ${cur - 1} solved`;
  go('levels'); const c = wrap.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' });
}
function showCats() {
  const g = $('#catsGrid'); g.innerHTML = ''; const n = breedsUnlocked();
  BREEDS.forEach((b, i) => {
    const card = document.createElement('div'); card.className = 'cat-card' + (i < n ? '' : ' locked');
    card.appendChild(miniCat(b, true, 140));
    card.insertAdjacentHTML('beforeend', `<b>${i < n ? b.name : '???'}</b><small>${i < n ? `Chapter ${i + 1}` : `Finish chapter ${i}`}</small>`);
    g.appendChild(card);
  });
  $('#catsSub').textContent = `${n} of ${BREEDS.length} found`;
  go('cats');
}
document.addEventListener('pointerdown', e => { Sound.unlock(); const b = e.target.closest('button'); if (b && !b.disabled) { Sound.click(); Haptic.tap(); } }, true);
document.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.lv) start(+b.dataset.lv); else if (b.hasAttribute('data-home')) { closeSheet(); go('home'); } });
$('#btnPlay').onclick = () => start(Math.min(P.level, LEVELS.length));
$('#btnLevels').onclick = showLevels;
let DAILY = null;
$('#btnDaily').onclick = async () => {
  if (!DAILY) { try { DAILY = await (await fetch('../assets/laser-daily.json')).json(); } catch (e) { DAILY = {}; } }
  start(0, true);
};
$('#btnCats').onclick = showCats;
$('#btnSettings').onclick = settings;

/* Animated hero: a tiny room with the laser, a mirror and a cat. */
let heroOn = false;
function heroLoop() {
  if (heroOn) return; heroOn = true;
  const cv = $('#heroCanvas'), x = cv.getContext('2d');
  const step = t => {
    if ($('#home').hidden) { heroOn = false; return; }
    const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(r.width * d)) { cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); }
    x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, r.width, r.height);
    const s = Math.min(r.width / 4.4, r.height / 2.6), ox = (r.width - s * 4) / 2, oy = (r.height - s * 2) / 2;
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) box(x, ox + (col + 0.5) * s, oy + (row + 0.5) * s, s * 0.94, s * 0.94, s * 0.16, (row + col) % 2 ? C.tile2 : C.tile1);
    const pts = [[ox + 0.5 * s, oy + 1.5 * s], [ox + 2.5 * s, oy + 1.5 * s], [ox + 2.5 * s, oy + 0.5 * s], [ox + 3.5 * s, oy + 0.5 * s]];
    drawBeamPath(x, pts, s, t, true);
    drawLaser(x, ox + 0.5 * s, oy + 1.5 * s, s, 1, t);
    drawToken(x, ox + 2.5 * s, oy + 1.5 * s, s, false); drawMirror(x, ox + 2.5 * s, oy + 1.5 * s, s, 'mirror', 0);
    drawToken(x, ox + 2.5 * s, oy + 0.5 * s, s, true); drawMirror(x, ox + 2.5 * s, oy + 0.5 * s, s, 'mirror', Math.PI);
    drawCat(x, ox + 3.5 * s, oy + 0.5 * s, s, BREEDS[(breedsUnlocked() - 1) % BREEDS.length], true, t);
    drawCat(x, ox + 1.5 * s, oy + 0.5 * s, s, BREEDS[0], false, t);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* =================== Game =================== */
const G = { vis: {}, cats: {} };
const cv = $('#lpCanvas'), ctx = cv.getContext('2d');
const INTRO_TIP = {
  splitter: 'New: the glass vase splits the light. The beam goes straight through and bends at the same time.',
  bowl: 'New: food bowls. The beam has to cross each bowl the way its arrow points.',
  portal: 'New: cat flaps come in pairs. The beam goes into one and comes out of the other.',
  filter: 'New: coloured glass tints the beam. Cats with a collar only wake for their colour.',
};
const COACH = {
  1: 'Drag the mirror onto the board, then tap it to turn it. Wake every cat!',
  2: 'Two mirrors, two turns. Cats let the beam pass through.',
  3: 'Couches stop the laser. Pieces with a lock can’t be moved.',
  4: 'This mirror is stuck, but tap it and it turns.',
  5: 'Double mirrors are shiny on both sides.',
};
let dailyLevel = null;
function start(n, daily = false) {
  closeSheet();
  let L;
  if (daily) {
    if ((!dailyLevel || dailyLevel.day !== dayKey()) && DAILY && DAILY[dayKey()]) dailyLevel = Object.assign(DAILY[dayKey()], { day: dayKey(), name: 'Daily' });
    if (!dailyLevel || dailyLevel.day !== dayKey()) {
      // Not in the pre-built file: make it here, seeded by the date so everyone still gets the same one.
      const seed = daySeed();
      for (let i = 0; i < 4; i++) {
        const special = [{ bowls: 1 }, { portals: 1 }, { filters: 1 }, { splitter: 0.35, maxSplit: 1 }][seed % 4];
        const c = LC.generate(seed * 10 + i, { n: 7, turns: 5 + (i % 2), cats: 3, double: 0.3, fixedShare: 0.2, blockers: 3, budget: 200000, attempts: 120, ...special });
        if (c && (!L || c.nodes * c.tray.length > L.nodes * L.tray.length)) L = c;
      }
      L = L || LC.generate(seed, { n: 6, turns: 4, cats: 3, double: 0.25, fixedShare: 0.3, blockers: 2 });
      dailyLevel = Object.assign(L, { day: dayKey(), name: 'Daily' });
    }
    L = dailyLevel;
  } else L = LEVELS[n - 1];
  if (!L) return;
  Object.assign(G, { n, daily, L, S: LC.newState(L), hist: [], moves: 0, hintsUsed: 0, done: false, drag: null, pending: null, hintAt: null, t0: Date.now(), vis: {}, cats: {} });
  G.breed = daily ? BREEDS[daySeed() % breedsUnlocked()] : BREEDS[chapterOf(n) % BREEDS.length];
  G.trace = LC.traceState(L, G.S);
  for (const [c, r, col] of L.cats) G.cats[r * L.w + c] = { awake: G.trace.hits.has(r * L.w + c), since: 0, hop: 0, col };
  G.bowlsMet = new Set();
  $('#gTitle').textContent = daily ? 'Daily Puzzle' : 'Level ' + n;
  $('#gSub').innerHTML = `${I.star}${I.star}${I.star} in ${LC.parMoves(L) + 2} moves, no hints`;
  const tip = daily ? '' : (L.intro ? INTRO_TIP[L.intro] : COACH[n]) || ''; $('#coach').hidden = !tip; $('#coach').textContent = tip;
  go('game'); hud(); updateMoves(); snapVisuals();
}
function updateMoves() { $('#gMoves').textContent = G.moves; $('#btnUndo').disabled = !G.hist.length; }

/* Layout */
function layout() {
  if (!G.L) return;
  const r = $('#stage').getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 3), L = G.L;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  Object.assign(G, { dpr, W: r.width, H: r.height });
  const trayH = Math.max(72, Math.min(112, r.height * 0.19));
  G.cell = Math.floor(Math.min((r.width - 4) / (L.w + 0.35), (r.height - trayH - 16) / (L.h + 0.35)));
  G.ox = (r.width - G.cell * L.w) / 2;
  G.oy = Math.max(G.cell * 0.2, (r.height - trayH - 12 - G.cell * L.h) / 2);
  G.tray = { x: 4, y: r.height - trayH - 2, w: r.width - 8, h: trayH };
  const n = Math.max(1, L.tray.length);
  G.slot = Math.min(G.tray.w / n, trayH * 1.05);
  G.traySc = Math.min(1, G.slot * 0.8 / G.cell);
  snapVisuals();
}
addEventListener('resize', () => { if (!$('#game').hidden) layout(); });
const cellXY = (c, r) => [G.ox + (c + 0.5) * G.cell, G.oy + (r + 0.5) * G.cell];
const slotXY = i => [G.tray.x + G.tray.w / 2 + (i - (G.L.tray.length - 1) / 2) * G.slot, G.tray.y + G.tray.h / 2];
function cellAt(x, y) { const c = Math.floor((x - G.ox) / G.cell), r = Math.floor((y - G.oy) / G.cell); return c >= 0 && r >= 0 && c < G.L.w && r < G.L.h ? [c, r] : null; }

/* Visual positions ease towards the model, so moves, snaps and turns animate. */
function targetOf(key) {
  if (key[0] === 'f') { const i = +key.slice(1), f = G.L.fixed[i]; const [x, y] = cellXY(f.c, f.r); return { x, y, sc: 1, rot: G.S.fr[i], k: f.k }; }
  const i = +key.slice(1), p = G.S.pl[i];
  if (p) { const [x, y] = cellXY(p.c, p.r); return { x, y, sc: 1, rot: p.rot, k: G.L.tray[i] }; }
  const [x, y] = slotXY(i); return { x, y, sc: G.traySc, rot: 0, k: G.L.tray[i] };
}
const visKeys = () => [...G.L.fixed.map((_, i) => 'f' + i), ...G.L.tray.map((_, i) => 't' + i)];
function snapVisuals() { if (!G.L || !G.cell) return; for (const k of visKeys()) { const t = targetOf(k); G.vis[k] = { x: t.x, y: t.y, sc: t.sc, rot: t.rot, ang: t.rot * Math.PI / 2, angT: t.rot * Math.PI / 2 }; } }
function syncRotations() {
  for (const k of visKeys()) {
    const v = G.vis[k], t = targetOf(k); if (!v) continue;
    if (v.rot !== t.rot) { const n = LC.ROT[t.k]; let st = ((t.rot - v.rot) % n + n) % n; if (st * 2 > n) st -= n; v.angT += st * Math.PI / 2; v.rot = t.rot; }
  }
}

/* Moves */
function commit(S, countMove = true) {
  if (!S) return false;
  G.hist.push(G.S); G.S = S; if (countMove) G.moves++;
  afterChange();
  return true;
}
function afterChange() {
  syncRotations();
  const prev = G.trace; G.trace = LC.traceState(G.L, G.S);
  wakeCats(G.trace, true);
  for (const b of G.L.bowls || []) {
    const id = b.r * G.L.w + b.c, met = G.trace.passes.has(id * 4 + b.d);
    if (met && !G.bowlsMet.has(id)) { Sound.bell(pent(11), { vol: 0.08 }); const [bx, by] = cellXY(b.c, b.r), r = cv.getBoundingClientRect(); FX.burst(r.left + bx, r.top + by, [C.gold, '#fff'], 10, 160); }
    met ? G.bowlsMet.add(id) : G.bowlsMet.delete(id);
  }
  updateMoves();
  if (!G.done && LC.isSolved(G.L, G.S, G.trace)) win();
}
function wakeCats(trace, real) {
  const now = performance.now(); let woke = 0;
  for (const k in G.cats) {
    const c = G.cats[k], awake = trace.hits.has(+k);
    if (awake !== c.awake) { c.awake = awake; c.since = now; if (awake) woke++; }
  }
  if (woke && real) {
    setTimeout(() => Sound.meow(0.9 + Math.random() * 0.25), 40); Haptic.success();
    for (const k in G.cats) if (G.cats[k].awake && G.cats[k].since === now) { const [x, y] = cellXY(+k % G.L.w, Math.floor(+k / G.L.w)), r = cv.getBoundingClientRect(); FX.burst(r.left + x, r.top + y - G.cell * 0.2, [C.gold, C.accent, '#fff'], 10, 180); }
  }
}
$('#btnUndo').onclick = () => { if (G.done || !G.hist.length) return; G.S = G.hist.pop(); G.moves++; Sound.back(); afterChange(); };
$('#btnReset').onclick = () => { if (G.done) return; const fresh = LC.newState(G.L); if (JSON.stringify(fresh) === JSON.stringify(G.S)) return; commit(fresh, false); Sound.back(); };
$('#btnHint').onclick = () => { if (G.done) return; const step = hintStep(); if (!step) return;
  if (P.hints <= 0) return outOfHints();
  P.hints--; save(); hud(); G.hintsUsed++;
  commit(step.S, false); G.hintAt = { c: step.c, r: step.r, t: performance.now() };
  Sound.bell(pent(12), { vol: 0.1 }); Haptic.success();
};
function outOfHints() {
  const s = openSheet(`<div class="sheet-icon">${I.bulb}</div><h3>Out of hints</h3><p>Watch a short ad for 3 more hints. Each daily puzzle also gives one.</p><div class="stack"><button class="btn gold big" data-act="ad">${I.play}Watch ad · +3</button><button class="btn soft" data-act="no">Not now</button></div>`, true);
  bind(s, { ad: () => playAd(() => { P.hints += 3; save(); hud(); toast(`${I.bulb} +3 hints`); Sound.gift(); Haptic.success(); }), no: closeSheet });
}
/** The next correct piece from the level's solution, applied to a copy of the board. */
function hintStep() {
  const L = G.L, sol = L.sol; if (!sol) return null;
  let S = LC.cloneState(G.S);
  for (const i in sol.fixedRot) if (S.fr[i] !== sol.fixedRot[i]) { S.fr[i] = sol.fixedRot[i]; return { S, c: L.fixed[i].c, r: L.fixed[i].r }; }
  const at = (c, r) => Object.keys(S.pl).find(i => S.pl[i].c === c && S.pl[i].r === r);
  const correct = i => sol.placed.some(p => S.pl[i] && p.c === S.pl[i].c && p.r === S.pl[i].r && p.k === L.tray[i] && p.rot === S.pl[i].rot);
  for (const p of sol.placed) {
    const here = at(p.c, p.r);
    if (here !== undefined && correct(here)) continue;
    if (here !== undefined) delete S.pl[here];
    const free = L.tray.map((k, i) => i).filter(i => L.tray[i] === p.k && (!S.pl[i] || !correct(i)));
    const pickI = free.find(i => !S.pl[i]) ?? free[0];
    if (pickI === undefined) return null;
    S.pl[pickI] = { c: p.c, r: p.r, rot: p.rot };
    return { S, c: p.c, r: p.r };
  }
  return null;
}

/* Input: drag from the tray, drag on the board, tap to turn */
cv.addEventListener('pointerdown', e => {
  if (G.done || G.drag) return;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  cv.setPointerCapture(e.pointerId);
  G.lift = e.pointerType === 'touch' ? G.cell * 0.6 : 0;
  for (const i of LC.unplaced(G.L, G.S)) {
    const [sx, sy] = slotXY(i);
    if (Math.abs(x - sx) < G.slot * 0.5 && Math.abs(y - sy) < G.tray.h * 0.5) { beginDrag(i, null, x, y); return; }
  }
  const at = cellAt(x, y); if (!at) return;
  const p = LC.boardPieces(G.L, G.S).get(at[1] * G.L.w + at[0]); if (!p) return;
  if (p.locked) { G.vis['f' + p.fixed].shake = performance.now(); Sound.denied(); Haptic.error(); return; }
  G.pending = { c: at[0], r: at[1], x, y, tray: p.tray };
});
cv.addEventListener('pointermove', e => {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (G.pending && G.pending.tray !== undefined && Math.hypot(x - G.pending.x, y - G.pending.y) > G.cell * 0.22) {
    const p = G.pending; G.pending = null; beginDrag(p.tray, [p.c, p.r], x, y);
  }
  if (!G.drag) return;
  G.drag.x = x; G.drag.y = y - G.lift;
  const at = cellAt(G.drag.x, G.drag.y), target = at && LC.canPlace(G.L, G.S, G.drag.i, at[0], at[1]) ? at : null;
  if (String(target) !== String(G.drag.target)) {
    G.drag.target = target;
    if (target) Haptic.tap();
    // Live preview of the beam with the piece dropped here (or lifted off the board).
    const S = target ? LC.place(G.L, G.S, G.drag.i, target[0], target[1]) || G.S : (G.drag.from ? LC.remove(G.S, G.drag.i) : G.S);
    G.preview = LC.traceState(G.L, S);
    wakeCats(G.preview, false);
  }
});
function endPointer() {
  if (G.pending) {
    const p = G.pending; G.pending = null;
    const S = LC.rotate(G.L, G.S, p.c, p.r);
    if (S) { commit(S); Sound.turn(); Haptic.tap(); }
    return;
  }
  const d = G.drag; if (!d) return;
  G.drag = null; G.preview = null;
  let S = null;
  if (d.target) S = LC.place(G.L, G.S, d.i, d.target[0], d.target[1]);
  else if (d.from) S = LC.remove(G.S, d.i);
  if (S) { commit(S); if (d.target) { Sound.place(); Haptic.tap(); } else Sound.back(); }
  else { wakeCats(G.trace, false); if (d.target) { Sound.place(); } }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', () => { G.pending = null; if (G.drag) { G.drag = null; G.preview = null; wakeCats(G.trace, false); } });
function beginDrag(i, from, x, y) {
  G.drag = { i, from, x, y: y - G.lift, target: from };
  G.preview = null;
  Sound.pickup(); Haptic.tap();
}

/* Win */
function win() {
  G.done = true;
  const L = G.L, par = LC.parMoves(L);
  let stars = 3; if (G.hintsUsed) stars--; if (G.moves > par + 2 + Math.ceil(par * 0.5)) stars--; stars = Math.max(1, stars);
  const time = Date.now() - G.t0, now = performance.now();
  Object.values(G.cats).forEach((c, i) => c.hop = now + 250 + i * 110);
  setTimeout(() => { Sound.win(); Haptic.big(); FX.confetti([C.beam, C.gold, C.mint, C.sky, C.couch, C.laser]); }, 350);
  const before = breedsUnlocked(), res = { daily: false, breed: null };
  if (G.daily) {
    const k = dayKey();
    if (!P.daily[k]) { P.daily[k] = 1; P.streak = P.lastDaily === yesterday() ? P.streak + 1 : P.lastDaily === k ? P.streak : 1; P.lastDaily = k; P.hints += 1; res.daily = true; }
  } else {
    P.stars[G.n] = Math.max(P.stars[G.n] || 0, stars);
    if (G.n >= P.level) P.level = G.n + 1;
    if (breedsUnlocked() > before) res.breed = BREEDS[breedsUnlocked() - 1];
  }
  save(); hud();
  setTimeout(() => winSheet(stars, time, par, res), 1300);
}
function winSheet(stars, time, par, res) {
  const title = G.daily ? 'Daily done!' : stars === 3 ? 'Purr-fect!' : stars === 2 ? 'Great!' : 'All awake!';
  const into = G.n % CHAPTER;
  const progress = G.daily ? '' : `<div class="gift"><span class="gi c-gold">${I.paw}</span><div class="bar"><i id="wBar" style="width:${((into === 0 ? CHAPTER : into) - 1) / CHAPTER * 100}%"></i></div><span>${into === 0 ? 'New cat!' : 'New cat in ' + (CHAPTER - into)}</span></div>`;
  const s = openSheet(`<div class="ribbon">${title}</div>
    <div class="wstars">${[0, 1, 2].map(i => `<span class="wstar ${i < stars ? 'on' : ''}" style="--d:${0.15 + i * 0.3}s">${I.star}</span>`).join('')}</div>
    <div class="chips"><span class="chip">${I.hand}${G.moves} moves${G.moves <= par ? ' · best' : ''}</span><span class="chip">${I.clock}${fmt(time)}</span>${G.hintsUsed ? `<span class="chip c-gold">${I.bulb}<span style="color:var(--ink)">${G.hintsUsed}</span></span>` : ''}${G.daily ? `<span class="chip"><span class="c-flame">${I.flame}</span>${streakNow()} day streak</span>` : ''}</div>
    ${progress}
    <div class="stack">${G.daily || G.n >= LEVELS.length ? `<button class="btn big" data-act="home">Back to menu</button>` : `<button class="btn big glow" data-act="next">Next level ${I.play}</button>`}
    <div class="duo"><button class="btn soft" data-act="replay">${I.restart}Replay</button><button class="btn soft" data-act="home">Menu</button></div></div>`);
  for (let i = 0; i < stars; i++) setTimeout(() => { Sound.star(i); Haptic.tap(); const el = s.querySelectorAll('.wstar')[i]; if (el) { const r = el.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height / 2, [C.gold, '#fff', C.gold], 16, 300); } }, 300 + i * 300);
  const bar = $('#wBar'); if (bar) setTimeout(() => bar.style.width = ((into === 0 ? CHAPTER : into) / CHAPTER * 100) + '%', 300 + stars * 300);
  if (res.daily) setTimeout(() => { Sound.gift(); toast(`${I.flame} Daily streak: ${streakNow()} · +1 hint`); }, 600 + stars * 300);
  bind(s, { next: () => res.breed ? newBreed(res.breed, () => start(G.n + 1)) : start(G.n + 1), replay: () => start(G.n, G.daily), home: () => res.breed ? newBreed(res.breed, () => { closeSheet(); go('home'); }) : (closeSheet(), go('home')) });
}
function newBreed(b, then) {
  const s = openSheet(`<p style="margin:0;font-weight:800;color:var(--muted)">CHAPTER COMPLETE</p><div id="nbCat"></div><h3>New cat: ${b.name}</h3><p>Find it in your cat collection.</p><button class="btn big" data-act="ok">Yay!</button>`);
  const c = miniCat(b, true, 150); c.className = 'new-cat'; s.querySelector('#nbCat').appendChild(c);
  Sound.gift(); setTimeout(() => Sound.meow(1.1), 300); Haptic.big(); FX.confetti([C.beam, C.gold, C.mint, C.sky]);
  bind(s, { ok: then });
}

/* Drawing the board */
let rafOn = false, lastT = 0;
function loop() { if (rafOn) return; rafOn = true; lastT = performance.now(); const step = () => { if ($('#game').hidden) { rafOn = false; return; } draw(performance.now()); requestAnimationFrame(step); }; requestAnimationFrame(step); }
function drawBeamPath(x, pts, s, t, dot, col = 0) {
  const [core, glow] = beamColors(col);
  const pulse = 0.75 + 0.25 * Math.sin(t / 260);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const path = () => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); };
  x.globalAlpha = 0.28 * pulse; x.strokeStyle = glow; x.lineWidth = s * 0.28; path(); x.stroke();
  x.globalAlpha = 0.5; x.lineWidth = s * 0.14; path(); x.stroke();
  x.globalAlpha = 1; x.strokeStyle = core; x.lineWidth = Math.max(2, s * 0.07); path(); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = Math.max(1, s * 0.022); path(); x.stroke();
  if (dot) {
    const [ex, ey] = pts[pts.length - 1];
    x.fillStyle = glow; x.globalAlpha = 0.45; x.beginPath(); x.arc(ex, ey, s * (0.14 + 0.05 * Math.sin(t / 180)), 0, 7); x.fill();
    x.globalAlpha = 1; x.fillStyle = core; x.beginPath(); x.arc(ex, ey, s * 0.075, 0, 7); x.fill();
  }
}
function draw(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const { L, cell: s, ox, oy, dpr } = G; if (!L || !s) return;
  const x = ctx; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, G.W, G.H);
  // Room
  box(x, ox + L.w * s / 2, oy + L.h * s / 2, L.w * s + s * 0.24, L.h * s + s * 0.24, s * 0.3, C.board);
  for (let r = 0; r < L.h; r++) for (let c = 0; c < L.w; c++) { const [cx, cy] = cellXY(c, r); box(x, cx, cy, s * 0.94, s * 0.94, s * 0.16, (r + c) % 2 ? C.tile2 : C.tile1); }
  if (G.drag && G.drag.target) { const [cx, cy] = cellXY(...G.drag.target); x.globalAlpha = 0.85; box(x, cx, cy, s * 0.94, s * 0.94, s * 0.16, C.valid); x.globalAlpha = 1; }
  // Tray
  box(x, G.tray.x + G.tray.w / 2, G.tray.y + G.tray.h / 2, G.tray.w, G.tray.h, Math.min(28, G.tray.h * 0.3), C.tray);
  L.tray.forEach((_, i) => { const [sx, sy] = slotXY(i), side = s * G.traySc * 0.84; rr(x, sx, sy, side, side, side * 0.24); x.lineWidth = 2; x.strokeStyle = C['token-edge']; x.stroke(); });
  // Beam (under the pieces)
  const tr = G.preview || G.trace;
  for (const p of tr.paths) if (p.pts.length > 1) drawBeamPath(x, p.pts.map(([px, py]) => [ox + px * s, oy + py * s]), s, now, p.end.t !== 'filter' && p.end.t !== 'portal', p.col);
  // Floor features over the beam: cat flaps and food bowls
  (L.portals || []).forEach(([a, b, c2, d2], i) => { drawPortal(x, ...cellXY(a, b), s, i, now); drawPortal(x, ...cellXY(c2, d2), s, i, now); });
  (L.bowls || []).forEach(b => drawBowl(x, ...cellXY(b.c, b.r), s, b.d, tr.passes.has((b.r * L.w + b.c) * 4 + b.d), now));
  // Laser and cats
  drawLaser(x, ...cellXY(L.src.c, L.src.r), s, L.src.d, now);
  for (const k in G.cats) {
    const c = G.cats[k], [cx, cy] = cellXY(+k % L.w, Math.floor(+k / L.w));
    const pop = c.awake && now - c.since < 350 ? (now - c.since) / 350 : 0;
    const hp = c.hop && now > c.hop && now < c.hop + 420 ? Math.sin((now - c.hop) / 420 * Math.PI) : 0;
    drawCat(x, cx, cy, s, G.breed, c.awake, now + +k * 377, pop, hp, c.col ? beamColors(c.col)[0] : null);
  }
  // Pieces
  for (const key of visKeys()) {
    const t = targetOf(key), v = G.vis[key]; if (!v) continue;
    const dragging = G.drag && key === 't' + G.drag.i;
    const tx = dragging ? G.drag.x : t.x, ty = dragging ? G.drag.y : t.y, tsc = dragging ? 1.12 : t.sc;
    const k = Math.min(1, dt * (dragging ? 40 : 16));
    v.x += (tx - v.x) * k; v.y += (ty - v.y) * k; v.sc += (tsc - v.sc) * k; v.ang += (v.angT - v.ang) * Math.min(1, dt * 18);
    if (dragging) continue;
    drawPiece(x, key, v, s, now);
  }
  if (G.drag) drawPiece(x, 't' + G.drag.i, G.vis['t' + G.drag.i], s, now, true);
  // Hint glow
  if (G.hintAt && now - G.hintAt.t < 2200) {
    const [hx, hy] = cellXY(G.hintAt.c, G.hintAt.r), a = 1 - (now - G.hintAt.t) / 2200;
    x.globalAlpha = a; x.strokeStyle = C.gold; x.lineWidth = s * 0.08; rr(x, hx, hy, s * (0.98 + 0.06 * Math.sin(now / 120)), s * (0.98 + 0.06 * Math.sin(now / 120)), s * 0.2); x.stroke(); x.globalAlpha = 1;
  }
}
function drawPiece(x, key, v, s, now, lifted) {
  const fixed = key[0] === 'f', i = +key.slice(1), k = fixed ? G.L.fixed[i].k : G.L.tray[i];
  let sx = 0; if (v.shake && now - v.shake < 300) sx = Math.sin((now - v.shake) / 300 * Math.PI * 6) * s * 0.06;
  x.save(); x.translate(v.x + sx, v.y); x.scale(v.sc, v.sc);
  if (lifted) { x.shadowColor = C.shadow; x.shadowBlur = s * 0.3; x.shadowOffsetY = s * 0.12; }
  drawToken(x, 0, 0, s, fixed);
  x.shadowColor = 'transparent';
  if (k === 'blocker') drawCouch(x, 0, 0, s); else if (k === 'splitter') drawSplitter(x, 0, 0, s, v.ang); else if (LC.FILTER[k]) drawFilter(x, 0, 0, s, k); else drawMirror(x, 0, 0, s, k, v.ang);
  if (fixed) drawBadge(x, 0, 0, s, G.L.fixed[i].rotatable ? 'rotate' : 'lock');
  x.restore();
}

/* =================== Boot =================== */
readColors(); FX.init();
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
if (!standalone) { $('#installTip').hidden = false; $('#allLink').hidden = false; }
document.addEventListener('gesturestart', e => e.preventDefault());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js').catch(() => {});
fetch('../assets/laser-levels.json').then(r => r.json()).then(levels => {
  LEVELS = levels;
  const m = location.hash.match(/^#(\d+)$/);
  if (m) start(+m[1]); else if (location.hash === '#daily') $('#btnDaily').onclick(); else if (location.hash === '#levels') showLevels(); else if (location.hash === '#cats') showCats(); else go('home');
}).catch(() => { go('home'); toast('Could not load the levels. Check your connection and reopen.'); });
