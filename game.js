/* =====================================================================
   EL MAPA DE FUNES  ·  creado por Issa
   Mundo abierto 2D (vista cenital) inspirado en el pueblo de Funes, Navarra.
   Sin librerías: solo HTML + CSS + JavaScript (canvas).
   ===================================================================== */
'use strict';
(() => {

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[(Math.random() * arr.length) | 0];
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/* ------------------------------------------------------------------ */
/*  Canvas                                                             */
/* ------------------------------------------------------------------ */
const canvas = $('game'), ctx = canvas.getContext('2d');
const miniEl = $('minimap'), mctx = miniEl.getContext('2d');
const bigEl = $('bigmap'), bctx = bigEl.getContext('2d');
const darkC = document.createElement('canvas'), dctx = darkC.getContext('2d');
let W = 800, H = 600;
function resize() {
  W = canvas.width = window.innerWidth || 800;
  H = canvas.height = window.innerHeight || 600;
  darkC.width = W; darkC.height = H;
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ */
/*  Mundo                                                              */
/* ------------------------------------------------------------------ */
const WORLD_W = 4000, WORLD_H = 3200;
const XS = [800, 1600, 2400, 3200];       // calles verticales
const YS = [700, 1500, 2300];             // calles horizontales
const HALF = 60, SIDEWALK = 14, LANE = 24;
const RIVER = { y: 2700, h: 160 };        // Río Arga
const BRIDGE = { x0: 1528, x1: 1672 };
const TOWN = { x: 560, y: 460, w: 2880, h: 2080 };
const PLAZA = { x: 1680, y: 780, w: 640, h: 640 };
const TILE = 512;

const roads = [];
[[700, 600, 3400], [1500, 0, 4000], [2300, 600, 3400]].forEach(([y, a, b]) =>
  roads.push({ dir: 'h', c: y, a, b, x: a, y: y - HALF, w: b - a, h: HALF * 2 }));
[[800, 500, 2500], [1600, 0, 3200], [2400, 500, 2500], [3200, 500, 2500]].forEach(([x, a, b]) =>
  roads.push({ dir: 'v', c: x, a, b, x: x - HALF, y: a, w: HALF * 2, h: b - a }));

/* nodos de la red de calles (12 cruces) */
const NODE_COUNT = XS.length * YS.length;
const nodePos = id => ({ x: XS[(id / 3) | 0], y: YS[id % 3] });
function neighbors(id) {
  const i = (id / 3) | 0, j = id % 3, r = [];
  if (i > 0) r.push(id - 3);
  if (i < XS.length - 1) r.push(id + 3);
  if (j > 0) r.push(id - 1);
  if (j < YS.length - 1) r.push(id + 1);
  return r;
}
const NDIST = [];
for (let s = 0; s < NODE_COUNT; s++) {
  const d = new Array(NODE_COUNT).fill(99); d[s] = 0;
  const q = [s];
  while (q.length) { const u = q.shift(); for (const v of neighbors(u)) if (d[v] === 99) { d[v] = d[u] + 1; q.push(v); } }
  NDIST.push(d);
}
function nearestNode(x, y) {
  let best = 0, bd = 1e9;
  for (let n = 0; n < NODE_COUNT; n++) { const p = nodePos(n); const d = dist(x, y, p.x, p.y); if (d < bd) { bd = d; best = n; } }
  return best;
}

/* sólidos (colisiones) */
const solids = [];
const addRect = (x, y, w, h, water) => solids.push({ t: 'r', x, y, w, h, water: !!water });
const addCirc = (x, y, r) => solids.push({ t: 'c', x, y, r });

function collideCircle(e, r) {
  let hit = false, nx = 0, ny = 0;
  for (const s of solids) {
    if (s.t === 'r') {
      if (e.x + r < s.x || e.x - r > s.x + s.w || e.y + r < s.y || e.y - r > s.y + s.h) continue;
      const cx = clamp(e.x, s.x, s.x + s.w), cy = clamp(e.y, s.y, s.y + s.h);
      const dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 === 0) {
          const l = e.x - s.x, rg = s.x + s.w - e.x, t = e.y - s.y, b = s.y + s.h - e.y;
          const m = Math.min(l, rg, t, b);
          if (m === l) { e.x = s.x - r; nx = -1; ny = 0; }
          else if (m === rg) { e.x = s.x + s.w + r; nx = 1; ny = 0; }
          else if (m === t) { e.y = s.y - r; nx = 0; ny = -1; }
          else { e.y = s.y + s.h + r; nx = 0; ny = 1; }
        } else {
          const d = Math.sqrt(d2), p = r - d;
          e.x += dx / d * p; e.y += dy / d * p; nx = dx / d; ny = dy / d;
        }
        hit = true;
      }
    } else {
      const dx = e.x - s.x, dy = e.y - s.y, rr2 = r + s.r, d2 = dx * dx + dy * dy;
      if (d2 < rr2 * rr2) {
        const d = Math.sqrt(d2) || 0.001, p = rr2 - d;
        e.x += dx / d * p; e.y += dy / d * p; nx = dx / d; ny = dy / d; hit = true;
      }
    }
  }
  return hit ? { nx, ny } : null;
}
function pointBlocked(x, y, r, ignoreWater) {
  for (const s of solids) {
    if (ignoreWater && s.water) continue;
    if (s.t === 'r') {
      if (x + r < s.x || x - r > s.x + s.w || y + r < s.y || y - r > s.y + s.h) continue;
      const cx = clamp(x, s.x, s.x + s.w), cy = clamp(y, s.y, s.y + s.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
    } else if ((x - s.x) ** 2 + (y - s.y) ** 2 <= (r + s.r) ** 2) return true;
  }
  return false;
}

/* edificios */
const buildings = [];
const pois = [];            // puntos de interés (misiones)
const lamps = [];           // farolas
const PLAZA_TREES = [[1740, 850], [1740, 1100], [2260, 850], [2260, 1100], [1850, 960], [2150, 960], [1850, 1210], [2150, 1210]];
const FOUNTAIN = { x: 2000, y: 1130, r: 44 };
const ROOFS = ['#b5654a', '#a85a42', '#c27a55', '#9c5a45', '#b8734f', '#8d5a4a', '#c48a62', '#7f7468', '#a2503c'];

const SPECS = [
  { b: [0, 0], lots: [3], name: 'Panadería', color: '#d9a441', side: 'b' },
  { b: [2, 0], lots: [0, 2], name: 'Frontón', color: '#a9a08c', side: 'l', kind: 'fronton' },
  { b: [2, 0], lots: [1], name: 'Bar Txoko', color: '#b5533c', side: 't', kind: 'bar' },
  { b: [0, 1], lots: [0, 1], name: 'Centro de Salud', color: '#e6eef0', side: 't', kind: 'health' },
  { b: [1, 1], lots: [0, 1], name: 'Supermercado', color: '#5f93bf', side: 't', kind: 'shop' },
  { b: [1, 1], lots: [2], name: 'Farmacia', color: '#5fb588', side: 'b', kind: 'pharmacy' },
  { b: [2, 1], lots: [0, 1], name: 'Polideportivo', color: '#bfb8a4', side: 't', kind: 'sport' },
  { b: [2, 1], lots: [2], name: 'Gasolinera', color: '#d84b3f', side: 'b', kind: 'gas' },
];

function doorOf(r, side) {
  if (side === 'l') return { x: r.x - 20, y: r.y + r.h / 2 };
  if (side === 'r') return { x: r.x + r.w + 20, y: r.y + r.h / 2 };
  if (side === 't') return { x: r.x + r.w / 2, y: r.y - 20 };
  return { x: r.x + r.w / 2, y: r.y + r.h + 20 };
}

function buildWorld() {
  const rnd = mulberry32(20240);
  addRect(0, RIVER.y, BRIDGE.x0, RIVER.h, true);
  addRect(BRIDGE.x1, RIVER.y, WORLD_W - BRIDGE.x1, RIVER.h, true);

  const addHouse = (x, y, w, h) => {
    buildings.push({ x, y, w, h, kind: 'house', color: ROOFS[(rnd() * ROOFS.length) | 0], ridge: w >= h ? 'h' : 'v', cx: 0.2 + rnd() * 0.6, cy: 0.2 + rnd() * 0.6 });
    addRect(x, y, w, h);
  };

  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    if (i === 1 && j === 0) continue; // plaza
    const x0 = XS[i] + 80, y0 = YS[j] + 80;
    const used = new Set();
    SPECS.filter(s => s.b[0] === i && s.b[1] === j).forEach(s => {
      let ux0 = 1e9, uy0 = 1e9, ux1 = -1e9, uy1 = -1e9;
      s.lots.forEach(l => {
        used.add(l);
        const lx = x0 + (l % 2) * 330, ly = y0 + Math.floor(l / 2) * 330;
        ux0 = Math.min(ux0, lx); uy0 = Math.min(uy0, ly); ux1 = Math.max(ux1, lx + 310); uy1 = Math.max(uy1, ly + 310);
      });
      const m = 18;
      const r = { x: ux0 + m, y: uy0 + m, w: ux1 - ux0 - 2 * m, h: uy1 - uy0 - 2 * m };
      buildings.push({ ...r, kind: s.kind || 'special', color: s.color, name: s.name });
      addRect(r.x, r.y, r.w, r.h);
      const d = doorOf(r, s.side);
      pois.push({ name: s.name, x: d.x, y: d.y });
    });
    for (let l = 0; l < 4; l++) {
      if (used.has(l)) continue;
      const lx = x0 + (l % 2) * 330, ly = y0 + Math.floor(l / 2) * 330;
      const mx = 14 + rnd() * 26, my = 14 + rnd() * 26;
      const bx = lx + mx, by = ly + my, bw = 310 - mx * 2, bh = 310 - my * 2;
      if (rnd() < 0.45) {
        if (bw >= bh) { const w1 = bw * (0.4 + rnd() * 0.2); addHouse(bx, by, w1 - 7, bh); addHouse(bx + w1 + 7, by, bw - w1 - 7, bh); }
        else { const h1 = bh * (0.4 + rnd() * 0.2); addHouse(bx, by, bw, h1 - 7); addHouse(bx, by + h1 + 7, bw, bh - h1 - 7); }
      } else addHouse(bx, by, bw, bh);
    }
  }

  // Plaza
  const plazaB = [
    { x: 1930, y: 795, w: 140, h: 200, name: 'Iglesia', kind: 'church', color: '#b7ab92', door: { x: 2000, y: 1018 } },
    { x: 1710, y: 1250, w: 200, h: 150, name: 'Ayuntamiento', kind: 'town', color: '#c9a77a', door: { x: 1810, y: 1418 } },
    { x: 2090, y: 1250, w: 200, h: 150, name: 'Bar Plaza', kind: 'bar', color: '#a8473a', door: { x: 2190, y: 1418 } },
  ];
  plazaB.forEach(b => { const { door, ...rest } = b; buildings.push(rest); addRect(b.x, b.y, b.w, b.h); pois.push({ name: b.name, x: door.x, y: door.y }); });
  addCirc(FOUNTAIN.x, FOUNTAIN.y, FOUNTAIN.r - 6);
  PLAZA_TREES.forEach(t => addCirc(t[0], t[1], 12));

  // Farolas en las esquinas de cada cruce
  for (let n = 0; n < NODE_COUNT; n++) {
    const p = nodePos(n);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => lamps.push({ x: p.x + sx * (HALF + 10), y: p.y + sy * (HALF + 10) }));
  }
}
const poiByName = n => pois.find(p => p.name === n);

/* ------------------------------------------------------------------ */
/*  Dibujo del mapa estático (en teselas)                              */
/* ------------------------------------------------------------------ */
function onRoad(x, y, pad) {
  for (const r of roads) if (x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad) return true;
  return false;
}

function drawParcel(g, px, py, pw, ph, h) {
  const type = Math.floor(h * 5), horiz = ((h * 1000) | 0) % 2 === 0;
  const pal = [['#6aa845', '#5b9a3a'], ['#a07f55', '#8f7049'], ['#9bc468', '#8cb85a'], ['#cdb868', '#bfa95a'], ['#4f8a3a', '#468032']][type];
  const x = px + 4, y = py + 4, w = pw - 8, hh = ph - 8;
  g.fillStyle = pal[0]; g.fillRect(x, y, w, hh);
  g.fillStyle = pal[1];
  if (horiz) for (let yy = y; yy < y + hh; yy += 16) g.fillRect(x, yy, w, 7);
  else for (let xx = x; xx < x + w; xx += 16) g.fillRect(xx, y, 7, hh);
  if (type === 2) { g.fillStyle = 'rgba(255,255,255,.18)'; for (let xx = x + 6; xx < x + w; xx += 22) for (let yy = y + 6; yy < y + hh; yy += 22) g.fillRect(xx, yy, 3, 3); }
}

function drawLabel(g, text, x, y) {
  g.font = 'bold 15px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(text, x, y);
  g.fillStyle = '#fff'; g.fillText(text, x, y);
}

function drawBuilding(g, b) {
  const { x, y, w, h } = b;
  if (b.kind === 'church') {
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(x + 30 + 7, y + 10, 80, h); g.fillRect(x + 7, y + 55 + 10, w, 60);
    g.fillStyle = b.color; g.fillRect(x + 30, y, 80, h); g.fillRect(x, y + 55, w, 60);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 30, y, 40, h); g.fillRect(x, y + 55, w, 30);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x + 70, y, 40, h); g.fillRect(x, y + 85, w, 30);
    g.fillStyle = '#8f8570'; g.fillRect(x + 45, y, 50, 50);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(x + 45, y, 50, 50);
    g.strokeRect(x + 30, y + 50, 80, h - 50); g.strokeRect(x, y + 55, w, 60);
    g.strokeStyle = '#4a4338'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 70, y + 12); g.lineTo(x + 70, y + 38); g.moveTo(x + 60, y + 21); g.lineTo(x + 80, y + 21); g.stroke();
    return;
  }
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 7, y + 10, w, h);
  g.fillStyle = b.color; g.fillRect(x, y, w, h);
  switch (b.kind) {
    case 'house': {
      const hr = b.ridge === 'h';
      g.fillStyle = 'rgba(255,255,255,.12)'; if (hr) g.fillRect(x, y, w, h / 2); else g.fillRect(x, y, w / 2, h);
      g.fillStyle = 'rgba(0,0,0,.14)'; if (hr) g.fillRect(x, y + h / 2, w, h / 2); else g.fillRect(x + w / 2, y, w / 2, h);
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.beginPath();
      if (hr) for (let yy = y + 8; yy < y + h; yy += 8) { g.moveTo(x, yy); g.lineTo(x + w, yy); }
      else for (let xx = x + 8; xx < x + w; xx += 8) { g.moveTo(xx, y); g.lineTo(xx, y + h); }
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath();
      if (hr) { g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); } else { g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); }
      g.stroke();
      g.fillStyle = '#6b5a4e'; g.fillRect(x + w * b.cx - 5, y + h * b.cy - 5, 10, 10);
      break;
    }
    case 'town':
      g.fillStyle = '#9fb07a'; g.fillRect(x + 20, y + 20, w - 40, h - 40);
      g.fillStyle = '#8a6f4e'; g.fillRect(x + w / 2 - 14, y + 6, 28, 28);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + w / 2, y + 20, 8, 0, TAU); g.fill();
      g.strokeStyle = '#333'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + w / 2, y + 20); g.lineTo(x + w / 2, y + 14); g.moveTo(x + w / 2, y + 20); g.lineTo(x + w / 2 + 5, y + 20); g.stroke();
      break;
    case 'bar':
      for (let xx = x; xx < x + w; xx += 20) { g.fillStyle = ((xx - x) / 20) % 2 === 0 ? '#e9e3d3' : '#c0392b'; g.fillRect(xx, y + h - 16, Math.min(20, x + w - xx), 16); }
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y, w, h - 16);
      break;
    case 'fronton':
      g.fillStyle = '#6e8fa6'; g.fillRect(x + 16, y + 16, w - 32, h - 32);
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.strokeRect(x + 22, y + 22, w - 44, h - 44);
      for (let yy = y + 60; yy < y + h - 40; yy += 50) { g.beginPath(); g.moveTo(x + 22, yy); g.lineTo(x + w - 22, yy); g.stroke(); }
      break;
    case 'health':
      g.fillStyle = '#d7263d'; g.fillRect(x + w / 2 - 14, y + h / 2 - 48, 28, 96); g.fillRect(x + w / 2 - 48, y + h / 2 - 14, 96, 28);
      break;
    case 'sport':
      g.fillStyle = '#5f9e4f'; g.fillRect(x + 28, y + 28, w - 56, h - 56);
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.strokeRect(x + 34, y + 34, w - 68, h - 68);
      g.beginPath(); g.moveTo(x + w / 2, y + 34); g.lineTo(x + w / 2, y + h - 34); g.stroke();
      g.beginPath(); g.arc(x + w / 2, y + h / 2, 30, 0, TAU); g.stroke();
      break;
    case 'gas':
      g.fillStyle = '#f2f2f2'; g.fillRect(x, y + h / 2 - 8, w, 16);
      g.fillStyle = '#333'; g.fillRect(x + w * 0.25 - 6, y + h / 2 - 22, 12, 44); g.fillRect(x + w * 0.75 - 6, y + h / 2 - 22, 12, 44);
      break;
    case 'shop':
      g.fillStyle = 'rgba(255,255,255,.35)'; for (let xx = x + 30; xx < x + w - 40; xx += 60) g.fillRect(xx, y + 24, 36, 20);
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x + 20, y + h - 50, 50, 30); g.fillRect(x + w - 70, y + h - 50, 50, 30);
      break;
    case 'pharmacy':
      g.fillStyle = '#fff'; g.fillRect(x + w / 2 - 8, y + h / 2 - 26, 16, 52); g.fillRect(x + w / 2 - 26, y + h / 2 - 8, 52, 16);
      break;
    default:
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 14, y + 14, 26, 20); g.fillRect(x + w - 44, y + h - 34, 26, 20);
      g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x, y, w, 8);
  }
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

function drawTree(g, x, y, s) {
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(x + 6, y + 8, 28 * s, 0, TAU); g.fill();
  g.fillStyle = '#3d7a33'; g.beginPath(); g.arc(x, y, 28 * s, 0, TAU); g.fill();
  g.fillStyle = '#4e9442'; g.beginPath(); g.arc(x - 6 * s, y - 6 * s, 18 * s, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(x - 10 * s, y - 10 * s, 8 * s, 0, TAU); g.fill();
}

function drawWorld(g, vx, vy, vw, vh) {
  const vis = (x, y, w, h) => x < vx + vw && x + w > vx && y < vy + vh && y + h > vy;
  g.fillStyle = '#86ad55'; g.fillRect(vx, vy, vw, vh);

  // parcelas de campo (verdura, espárrago, barbecho…)
  const PW = 320, PH = 240;
  for (let px = Math.floor(vx / PW) * PW; px < vx + vw; px += PW)
    for (let py = Math.floor(vy / PH) * PH; py < vy + vh; py += PH) {
      const cx = px + PW / 2, cy = py + PH / 2;
      if (cx > TOWN.x && cx < TOWN.x + TOWN.w && cy > TOWN.y && cy < TOWN.y + TOWN.h) continue;
      drawParcel(g, px, py, PW, PH, hash2(px / PW, py / PH));
    }

  // casco urbano
  if (vis(TOWN.x, TOWN.y, TOWN.w, TOWN.h)) { g.fillStyle = '#8fb560'; g.fillRect(TOWN.x, TOWN.y, TOWN.w, TOWN.h); }

  // textura de hierba
  for (let gx = Math.floor(vx / 40); gx * 40 < vx + vw; gx++)
    for (let gy = Math.floor(vy / 40); gy * 40 < vy + vh; gy++) {
      const h = hash2(gx, gy + 999);
      if (h < 0.22) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(gx * 40, gy * 40, 40, 40); }
      else if (h > 0.84) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(gx * 40, gy * 40, 40, 40); }
    }

  // patios de manzana
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    if (i === 1 && j === 0) continue;
    const bx = XS[i] + 74, by = YS[j] + 74, bw = XS[i + 1] - XS[i] - 148, bh = YS[j + 1] - YS[j] - 148;
    if (!vis(bx, by, bw, bh)) continue;
    g.fillStyle = '#b8b392'; g.fillRect(bx, by, bw, bh);
  }

  // plaza
  if (vis(PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h)) {
    g.fillStyle = '#d4cab4'; g.fillRect(PLAZA.x - 6, PLAZA.y - 6, PLAZA.w + 12, PLAZA.h + 12);
    g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 1; g.beginPath();
    for (let xx = PLAZA.x; xx <= PLAZA.x + PLAZA.w; xx += 40) { g.moveTo(xx, PLAZA.y); g.lineTo(xx, PLAZA.y + PLAZA.h); }
    for (let yy = PLAZA.y; yy <= PLAZA.y + PLAZA.h; yy += 40) { g.moveTo(PLAZA.x, yy); g.lineTo(PLAZA.x + PLAZA.w, yy); }
    g.stroke();
    g.strokeStyle = '#a89e88'; g.lineWidth = 4; g.strokeRect(PLAZA.x - 6, PLAZA.y - 6, PLAZA.w + 12, PLAZA.h + 12);
    // parterres
    g.fillStyle = '#7fae55';
    [[1700, 1020, 90, 60], [2210, 1020, 90, 60]].forEach(([a, b, c, d]) => { g.fillRect(a, b, c, d); g.strokeStyle = '#6a9446'; g.lineWidth = 2; g.strokeRect(a, b, c, d); });
  }

  // río Arga
  if (vis(0, RIVER.y - 20, WORLD_W, RIVER.h + 40)) {
    g.fillStyle = '#6f8f4a'; g.fillRect(vx, RIVER.y - 16, vw, RIVER.h + 32);
    g.fillStyle = '#3d7ca6'; g.fillRect(vx, RIVER.y, vw, RIVER.h);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(vx, RIVER.y, vw, 8); g.fillRect(vx, RIVER.y + RIVER.h - 8, vw, 8);
    g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 2;
    for (let xx = Math.floor(vx / 70) * 70; xx < vx + vw; xx += 70) {
      const yy = RIVER.y + 22 + hash2(xx / 70, 7) * (RIVER.h - 44);
      g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx + 18, yy - 6, xx + 36, yy); g.stroke();
    }
  }

  // aceras
  g.fillStyle = '#bcb6a8';
  for (const r of roads) i
