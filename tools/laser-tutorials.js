// Hand-made opening levels for Laser Paws. Each teaches one idea; the solver fills in `sol`.
module.exports = [
  { name: 'First Bounce', w: 5, h: 5, src: { c: 0, r: 2, d: 1 }, cats: [[1, 2], [2, 0]], fixed: [], tray: ['mirror'] },
  { name: 'Two Turns', w: 5, h: 5, src: { c: 0, r: 0, d: 2 }, cats: [[2, 3], [3, 1]], fixed: [], tray: ['mirror', 'mirror'] },
  { name: 'Couch in the Way', w: 5, h: 5, src: { c: 4, r: 4, d: 3 }, cats: [[2, 2], [0, 1]],
    fixed: [{ k: 'blocker', c: 1, r: 4, rot: 0, rotatable: false }], tray: ['mirror', 'mirror'] },
  { name: 'Turn It', w: 5, h: 5, src: { c: 0, r: 1, d: 1 }, cats: [[3, 3], [1, 4]],
    fixed: [{ k: 'mirror', c: 3, r: 1, rot: 0, rotatable: true }], tray: ['mirror'] },
  { name: 'Shiny Both Sides', w: 5, h: 5, src: { c: 0, r: 4, d: 0 }, cats: [[0, 2], [3, 0], [4, 3]], fixed: [], tray: ['double', 'double'] },
];
