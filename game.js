'use strict';
(function () {
  /* =====================================================================
     EL MAPA DE FUNES  -  simulador estilo GTA San Andreas (vista cenital)
     ===================================================================== */
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const TAU = Math.PI * 2;
  const angDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------- mundo ---------- */
  const W = 2400, H = 2400;
  const RX = [400, 1200, 2000], RY = [400, 1200, 2000];
  const HALF = 70, ASPH = 55, LANE = 20;
  const PLAZA = { x: 1000, y: 1000, w: 400, h: 400 };
  const AYTO = { x: 1040, y: 865, w: 320, h: 120, type: 'ayto' };
  const IGLESIA = { x: 1480, y: 870, w: 170, h: 180, type: 'iglesia' };
  const RIVER = { y0: 2190, y1: 2310 };
  const SPAWN = { x: 1200, y: 1022 };
  const DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const LANE_OFF = [LANE, -LANE, -LANE, LANE];

  const buildings = [];
  const trees = [];
  let worldCv = null, miniCv = null;

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const expand = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
  const onRoad = (x, y, m) => RX.some((r) => Math.abs(x - r) < m) || RY.some((r) => Math.abs(y - r) < m);
  function isWater(x, y) {
    if (y <= RIVER.y0 || y >= RIVER.y1) return false;
    for (const r of RX) if (Math.abs(x - r) < HALF) return false;
    return true;
  }
  function pointInBuilding(x, y) {
    for (const b of buildings) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    return false;
  }

  function buildWorld() {
    buildings.length = 0; trees.length = 0;
    const r = mulberry(20241122);
    const bands = [[0, 330], [470, 1130], [1270, 1930], [2070, W]];
    const roofs = ['#b5533c', '#c2673f', '#a8472f', '#b8683f', '#9c4b36', '#c4784a'];
    const walls = ['#eadfc8', '#dccbaa', '#f1e8d6', '#d6bb9a', '#cdd3c4'];
    const keep = [expand(PLAZA, 25), expand(AYTO, 22), expand(IGLESIA, 25),
      { x: 0, y: RIVER.y0 - 14, w: W, h: RIVER.y1 - RIVER.y0 + 28 }];
    for (const [x0, x1] of bands) {
      for (const [y0, y1] of bands) {
        for (let x = x0 + 15; x + 110 <= x1 - 5; x += 130) {
          for (let y = y0 + 15; y + 110 <= y1 - 5; y += 130) {
            const w = 66 + r() * 34, h = 66 + r() * 34;
            const b = { x: x + r() * 10, y: y + r() * 10, w, h, type: 'house',
              roof: roofs[(r() * roofs.length) | 0], wall: walls[(r() * walls.length) | 0] };
            if (r() < 0.1) continue;
            if (keep.some((k) => overlap(k, b))) continue;
            buildings.push(b);
          }
        }
      }
    }
    buildings.push(AYTO, IGLESIA);
    for (let i = 0; i < 700 && trees.length < 160; i++) {
      const x = r() * W, y = r() * H;
      if (onRoad(x, y, HALF + 8)) continue;
      if (y > RIVER.y0 - 18 && y < RIVER.y1 + 18) continue;
      if (x > PLAZA.x - 20 && x < PLAZA.x + PLAZA.w + 20 && y > PLAZA.y - 20 && y < PLAZA.y + PLAZA.h + 20) continue;
      if (buildings.some((b) => x > b.x - 16 && x < b.x + b.w + 16 && y > b.y - 16 && y < b.y + b.h + 16)) continue;
      trees.push({ x, y, r: 10 + r() * 8 });
    }
    [[1030, 1030], [1370, 1030], [1030, 1370], [1370, 1370]].forEach((p) => trees.push({ x: p[0], y: p[1], r: 15 }));
  }

  /* colisión círculo-rectángulos */
  function pushOut(e, rad) {
    let hit = false;
    for (const b of buildings) {
      if (e.x < b.x - rad || e.x > b.x + b.w + rad || e.y < b.y - rad || e.y > b.y + b.h + rad) continue;
      const nx = clamp(e.x, b.x, b.x + b.w), ny = clamp(e.y, b.y, b.y + b.h);
      const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
      if (d2 < rad * rad) {
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2), p = rad - d;
          e.x += (dx / d) * p; e.y += (dy / d) * p;
        } else {
          const l = e.x - b.x, rr = b.x + b.w - e.x, t = e.y - b.y, bt = b.y + b.h - e.y;
          const m = Math.min(l, rr, t, bt);
          if (m === l) e.x = b.x - rad; else if (m === rr) e.x = b.x + b.w + rad;
          else if (m === t) e.y = b.y - rad; else e.y = b.y + b.h + rad;
        }
      }
    }
    e.x = clamp(e.x, rad, W - rad); e.y = clamp(e.y, rad, H - rad);
    return hit;
  }

  /* ---------- armas ---------- */
  const WEAPONS = {
    fist: { name: 'Puños', melee: true, dmg: 12, rate: 0.38, range: 34 },
    pistol: { name: 'Pistola', dmg: 26, rate: 0.28, speed: 1100, spread: 0.03, pellets: 1, snd: 'shot' },
    shotgun: { name: 'Escopeta', dmg: 15, rate: 0.85, speed: 950, spread: 0.2, pellets: 6, snd: 'shotgun' },
    smg: { name: 'Subfusil', dmg: 12, rate: 0.085, speed: 1200, spread: 0.09, pellets: 1, snd: 'smg' },
  };
  const WORDER = ['fist', 'pistol', 'shotgun', 'smg'];

  /* ---------- personaje ---------- */
  const SKINS = ['#f2c9a0', '#e0ac7e', '#c68642', '#8d5524', '#5c3a21'];
  const HAIRS = ['#1b1b1b', '#4a2c17', '#8b5a2b', '#d9b44a', '#b8341c', '#cfcfcf'];
  const SHIRTS = ['#ffffff', '#d62828', '#1d4ed8', '#16a34a', '#f59e0b', '#111111', '#7c3aed', '#ec4899'];
  const PANTS = ['#1e3a8a', '#111827', '#4b5563', '#7c5a3a', '#3f6212', '#9ca3af'];
  const HATS = ['#d62828', '#111111', '#1d4ed8', '#ffffff', '#16a34a', '#f59e0b'];
  const DEFAULT_CHAR = { name: 'Funesino', skin: SKINS[1], hairStyle: 'corto', hair: HAIRS[1], shirt: SHIRTS[1], pants: PANTS[0], hat: 'none', hatCol: HATS[0] };
  let charSaved = false;
  function loadChar() {
    try {
      const s = localStorage.getItem('funes_char');
      if (s) { charSaved = true; return Object.assign({}, DEFAULT_CHAR, JSON.parse(s)); }
    } catch (e) { /* sin almacenamiento */ }
    return Object.assign({}, DEFAULT_CHAR);
  }
  function saveChar(c) {
    charSaved = true;
    try { localStorage.setItem('funes_char', JSON.stringify(c)); } catch (e) { /* nada */ }
  }
  let charLook = loadChar();

  function ell(c, x, y, rx, ry, col, stroke) {
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = col; c.fill();
    if (stroke) { c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.9; c.stroke(); }
  }
  function drawPerson(c, x, y, a, look, o) {
    o = o || {};
    const s = o.scale || 1, sw = Math.sin(o.walk || 0) * 3;
    c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
    ell(c, 1.5, 1.5, 7.5, 12.5, 'rgba(0,0,0,.25)');
    ell(c, sw, -4, 4.6, 3, look.pants); ell(c, -sw, 4, 4.6, 3, look.pants);
    const wp = o.weapon && o.weapon !== 'fist' ? o.weapon : null;
    // brazos
    let h1, h2;
    if (wp) {
      h1 = wp === 'pistol' ? [11, -1] : [9, -1.5]; h2 = wp === 'pistol' ? [11, 1.6] : [17, 1.2];
    } else {
      h1 = [2 + sw * 0.3, -10.5]; h2 = [2 - sw * 0.3 + (o.swing ? 11 : 0), 10.5];
    }
    c.lineCap = 'round'; c.strokeStyle = look.shirt; c.lineWidth = 4.2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(h1[0], h1[1]); c.moveTo(0, 9); c.lineTo(h2[0], h2[1]); c.stroke();
    if (wp) {
      c.fillStyle = '#222';
      if (wp === 'pistol') c.fillRect(8, -1.2, 9, 2.4);
      else if (wp === 'smg') c.fillRect(7, -1.6, 14, 3.2);
      else { c.fillRect(6, -1.3, 21, 2.6); c.fillStyle = '#6b4423'; c.fillRect(6, -1.3, 9, 2.6); }
    }
    ell(c, 0, 0, 5.5, 11.5, look.shirt, true);
    ell(c, h1[0], h1[1], 2.5, 2.5, look.skin); ell(c, h2[0], h2[1], 2.5, 2.5, look.skin);
    ell(c, 0, 0, 6.5, 6.5, look.skin, true);
    const hc = look.hair;
    if (look.hairStyle === 'corto') ell(c, -1.3, 0, 6.6, 6.6, hc);
    else if (look.hairStyle === 'largo') { ell(c, -6, 0, 6, 7.8, hc); ell(c, -1, 0, 6.8, 6.8, hc); }
    else if (look.hairStyle === 'cresta') ell(c, -0.5, 0, 7, 2.2, hc);
    if (look.hat === 'gorra') {
      ell(c, -1, 0, 6.9, 6.9, look.hatCol, true);
      c.fillStyle = shade(look.hatCol, -45); c.fillRect(4, -4.6, 6, 9.2);
    } else if (look.hat === 'txapela') {
      ell(c, -0.5, 0, 9.4, 9.4, look.hatCol, true);
      ell(c, 0, 0, 1.5, 1.5, shade(look.hatCol, -60));
    }
    c.restore();
  }

  /* ---------- estado ---------- */
  const keys = {};
  const mouse = { sx: 0, sy: 0, down: false, last: -1e9, wx: 0, wy: 0 };
  let state = 'loading';
  let started = false;
  let cv, ctx, mctx;
  let G = null, P = null;
  const cam = { x: SPAWN.x, y: SPAWN.y, z: 1.15 };
  let lastT = 0;
  let hudT = 0;
  let IS_TOUCH = false;
  try { IS_TOUCH = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches); } catch (e) { /* nada */ }
  let RS = 1;   // resolución interna del lienzo respecto a los píxeles CSS
  let VS = 1;   // escala de la vista según el alto de la pantalla
  const touch = { mx: 0, my: 0, mag: 0, ax: 0, ay: 0, amag: 0, brake: false };

  function newGame() {
    G = { cars: [], peds: [], cops: [], bullets: [], pickups: [], parts: [], decals: [],
      heat: 0, lastCrime: -99, time: 0, shake: 0, msgT: 0, deadT: 0, copT: 0, spawnT: 0 };
    P = { x: SPAWN.x, y: SPAWN.y, a: -Math.PI / 2, hp: 100, armor: 0, money: 500,
      have: { fist: true, pistol: true }, ammo: { pistol: 48, shotgun: 0, smg: 0 }, cur: 'pistol',
      car: null, cool: 0, walk: 0, swing: 0, hitCool: 0, look: charLook };
    // coches aparcados en la plaza
    const parked = [[1070, 1062, 0, '#c0392b'], [1330, 1062, Math.PI, '#2563eb'], [1070, 1338, 0, '#f1c40f'], [1330, 1338, Math.PI, '#e5e7eb']];
    for (const p of parked) G.cars.push(makeCar(p[0], p[1], p[2], p[3], false));
    for (let i = 0; i < 14; i++) spawnAICar(true);
    for (let i = 0; i < 26; i++) spawnPed(true);
    // objetos
    const fixed = [['shotgun', 1120, 1048], ['smg', 1280, 1048], ['armor', 1160, 1090], ['health', 1240, 1090]];
    for (const f of fixed) G.pickups.push({ type: f[0], x: f[1], y: f[2], t: 0 });
    const types = ['health', 'armor', 'shotgun', 'smg', 'health', 'armor', 'money', 'money', 'money', 'smg'];
    for (const t of types) { const p = randomSidewalkPoint(); G.pickups.push({ type: t, x: p.x, y: p.y, t: 0, amount: t === 'money' ? 100 + ((Math.random() * 400) | 0) : 0 }); }
    cam.x = P.x; cam.y = P.y; cam.z = 1.15;
    showMsg('Has aparecido en la Plaza del Ayuntamiento de Funes.', 4200);
  }

  function randomSidewalkPoint() {
    for (let i = 0; i < 40; i++) {
      let x, y;
      const side = (Math.random() < 0.5 ? -1 : 1) * rand(ASPH + 3, HALF - 3);
      if (Math.random() < 0.5) { y = pick(RY) + side; x = rand(60, W - 60); }
      else { x = pick(RX) + side; y = rand(60, H - 60); }
      if (!pointInBuilding(x, y) && !isWater(x, y)) return { x, y };
    }
    return { x: 1200, y: 1100 };
  }

  /* ---------- coches ---------- */
  const CAR_COLS = ['#c0392b', '#2563eb', '#f1c40f', '#e5e7eb', '#16a34a', '#111827', '#ea580c', '#7c3aed', '#9ca3af'];
  function makeCar(x, y, a, col, ai) {
    return { x, y, a, v: 0, col, hp: 100, ai, dir: 0, rc: 0, lastX: -1, dead: false, burnT: 0, maxv: rand(150, 230) };
  }
  function spawnAICar(init) {
    for (let t = 0; t < 40; t++) {
      const horiz = Math.random() < 0.5;
      const dir = horiz ? (Math.random() < 0.5 ? 0 : 2) : (Math.random() < 0.5 ? 1 : 3);
      const rc = horiz ? pick(RY) : pick(RX);
      let x, y;
      if (horiz) { x = rand(80, W - 80); y = rc + LANE_OFF[dir]; } else { y = rand(80, H - 80); x = rc + LANE_OFF[dir]; }
      if (isWater(x, y) && false) continue;
      if (P && dist(x, y, P.x, P.y) < (init ? 260 : 700)) continue;
      if (G.cars.some((o) => dist(o.x, o.y, x, y) < 110)) continue;
      const c = makeCar(x, y, dir * Math.PI / 2, pick(CAR_COLS), true);
      c.dir = dir; c.rc = rc;
      G.cars.push(c);
      return;
    }
  }
  function updateAICar(c, dt) {
    const dv = DIRV[c.dir];
    const fx = c.x + dv[0] * 58, fy = c.y + dv[1] * 58;
    let block = false;
    for (const o of G.cars) { if (o !== c && !o.dead && dist(o.x, o.y, fx, fy) < 42) { block = true; break; } }
    if (!block && !P.car && dist(P.x, P.y, fx, fy) < 32) block = true;
    if (!block) for (const q of G.peds) { if (dist(q.x, q.y, fx, fy) < 26) { block = true; break; } }
    if (!block) for (const q of G.cops) { if (dist(q.x, q.y, fx, fy) < 26) { block = true; break; } }
    c.v += clamp((block ? 0 : c.maxv) - c.v, -500 * dt, 140 * dt);
    const px = c.x, py = c.y;
    c.x += dv[0] * c.v * dt; c.y += dv[1] * c.v * dt;
    const off = LANE_OFF[c.dir];
    if (c.dir % 2 === 0) c.y += ((c.rc + off) - c.y) * Math.min(1, dt * 5);
    else c.x += ((c.rc + off) - c.x) * Math.min(1, dt * 5);
    const list = c.dir % 2 === 0 ? RX : RY;
    const prev = c.dir % 2 === 0 ? px : py, cur = c.dir % 2 === 0 ? c.x : c.y;
    for (const r of list) {
      if ((prev - r) * (cur - r) <= 0 && prev !== cur && c.lastX !== r) {
        c.lastX = r;
        const roll = Math.random();
        let nd = c.dir;
        if (roll < 0.25) nd = (c.dir + 1) % 4; else if (roll < 0.5) nd = (c.dir + 3) % 4;
        if (nd !== c.dir) { c.dir = nd; c.rc = r; }
        break;
      }
    }
    if (c.x < 50 && c.dir === 2) c.dir = 0;
    if (c.x > W - 50 && c.dir === 0) c.dir = 2;
    if (c.y < 50 && c.dir === 3) c.dir = 1;
    if (c.y > H - 50 && c.dir === 1) c.dir = 3;
    c.a += angDiff(c.a, c.dir * Math.PI / 2) * Math.min(1, dt * 6);
    carRunOver(c);
  }
  function carRunOver(c) {
    if (Math.abs(c.v) < 90) return;
    const fx = c.x + Math.cos(c.a) * 18, fy = c.y + Math.sin(c.a) * 18;
    for (const q of G.peds) {
      if (!q.dead && dist(q.x, q.y, fx, fy) < 26) killPed(q, c === P.car);
    }
    for (const q of G.cops) {
      if (!q.dead && dist(q.x, q.y, fx, fy) < 26) hurtCop(q, c.v * 0.25, c === P.car);
    }
    if (c !== P.car && P.hp > 0 && !P.car && P.hitCool <= 0 && state === 'playing' && dist(P.x, P.y, fx, fy) < 24) {
      P.hitCool = 0.7; hurtPlayer(Math.abs(c.v) * 0.12); sfx('punch');
    }
  }
  function moveCar(c, dt) {
    const cs = Math.cos(c.a), sn = Math.sin(c.a);
    const ox = c.x, oy = c.y;
    c.x += cs * c.v * dt; c.y += sn * c.v * dt;
    let hit = false;
    for (const s of [-18, 18]) {
      const p = { x: c.x + cs * s, y: c.y + sn * s }, bx = p.x, by = p.y;
      if (pushOut(p, 16)) { hit = true; c.x += p.x - bx; c.y += p.y - by; }
    }
    if (isWater(c.x, c.y) || isWater(c.x + cs * 28, c.y + sn * 28)) { c.x = ox; c.y = oy; hit = true; }
    if (hit) {
      const sp = Math.abs(c.v);
      if (sp > 110) { damageCar(c, (sp - 90) * 0.09); sfx('crash'); G.shake = Math.max(G.shake, Math.min(0.35, sp / 900)); }
      c.v *= -0.3;
    }
    c.x = clamp(c.x, 20, W - 20); c.y = clamp(c.y, 20, H - 20);
  }
  function damageCar(c, d) {
    if (c.dead) return;
    c.hp -= d;
    if (c.hp <= 0) explodeCar(c);
  }
  function explodeCar(c) {
    c.dead = true; c.burnT = 0; c.v = 0; c.hp = 0;
    boom(c.x, c.y);
    if (P.car === c) { exitCar(); hurtPlayer(35); }
  }
  function boom(x, y) {
    sfx('boom'); G.shake = 0.6;
    for (let i = 0; i < 36; i++) {
      const a = rand(0, TAU), s = rand(40, 260);
      G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 1), max: 1, size: rand(5, 14), col: pick(['#ffb02e', '#ff6a00', '#444', '#ffd84d']) });
    }
    for (const q of G.peds) if (!q.dead && dist(q.x, q.y, x, y) < 110) killPed(q, true);
    for (const q of G.cops) if (!q.dead && dist(q.x, q.y, x, y) < 110) hurtCop(q, 80, true);
    for (const o of G.cars) if (!o.dead && dist(o.x, o.y, x, y) < 100 && (o.x !== x || o.y !== y)) damageCar(o, 45);
    const d = dist(P.x, P.y, x, y);
    if (state === 'playing' && d < 120) hurtPlayer(70 * (1 - d / 130));
  }
  function exitCar() {
    const c = P.car;
    if (!c) return;
    P.x = c.x + Math.cos(c.a - Math.PI / 2) * 38; P.y = c.y + Math.sin(c.a - Math.PI / 2) * 38;
    pushOut(P, 9);
    P.car = null;
  }
  function tryEnterExit() {
    if (P.car) { exitCar(); return; }
    let best = null, bd = 80;
    for (const c of G.cars) { if (c.dead) continue; const d = dist(c.x, c.y, P.x, P.y); if (d < bd) { bd = d; best = c; } }
    if (best) {
      if (best.ai) { best.ai = false; showMsg('¡Le has quitado el coche a un vecino!', 2500); }
      P.car = best;
    }
  }

  function driveCar(dt) {
    const c = P.car;
    let thr = (keys.w || keys.up ? 1 : 0) - (keys.s || keys.down ? 1 : 0);
    let steer = (keys.d || keys.right ? 1 : 0) - (keys.a || keys.left ? 1 : 0);
    if (touch.mag > 0.12) {
      if (Math.abs(touch.my) > 0.25) thr = clamp(-touch.my * 1.25, -1, 1);
      if (Math.abs(touch.mx) > 0.18) steer = clamp(touch.mx * 1.2, -1, 1);
    }
    c.v += thr * (thr > 0 ? 270 : 210) * dt;
    c.v -= c.v * 0.7 * dt;
    if (keys.space || touch.brake) { const b = Math.min(Math.abs(c.v), 650 * dt); c.v -= Math.sign(c.v) * b; }
    c.v = clamp(c.v, -150, 390);
    c.a += steer * clamp(c.v / 110, -1, 1) * 2.3 * dt;
    moveCar(c, dt);
    // choques con otros coches
    for (const o of G.cars) {
      if (o === c || o.dead) continue;
      const d = dist(c.x, c.y, o.x, o.y);
      if (d < 46 && d > 0.01) {
        const nx = (c.x - o.x) / d, ny = (c.y - o.y) / d, push = (46 - d) / 2;
        c.x += nx * push; c.y += ny * push; o.x -= nx * push; o.y -= ny * push;
        const dmg = Math.min(25, Math.abs(c.v) * 0.06);
        if (Math.abs(c.v) > 80) { damageCar(c, dmg); damageCar(o, dmg * 1.2); sfx('crash'); G.shake = Math.max(G.shake, 0.25); }
        c.v *= 0.7; o.v *= 0.6;
      }
    }
    carRunOver(c);
    P.x = c.x; P.y = c.y; P.a = c.a;
  }
  function updateCar(c, dt) {
    if (c.dead) {
      c.burnT += dt;
      if (Math.random() < dt * 20) G.parts.push({ x: c.x + rand(-12, 12), y: c.y + rand(-8, 8), vx: rand(-15, 15), vy: rand(-40, -10), life: 0.7, max: 0.7, size: rand(5, 10), col: Math.random() < 0.5 ? '#ff7a1a' : '#333' });
      return;
    }
    if (c.hp < 35 && Math.random() < dt * 6) G.parts.push({ x: c.x, y: c.y, vx: rand(-12, 12), vy: rand(-30, -8), life: 0.9, max: 0.9, size: rand(4, 8), col: 'rgba(80,80,80,0.7)' });
    if (c.hp < 15) { c.hp -= dt * 2.5; if (c.hp <= 0) { explodeCar(c); return; } }
    if (c === P.car) return;
    if (c.ai) updateAICar(c, dt);
    else if (Math.abs(c.v) > 1) { c.v *= 1 - Math.min(1, dt * 1.8); moveCar(c, dt); }
  }

  /* ---------- peatones y policía ---------- */
  function randomLook() {
    return { skin: pick(SKINS), hairStyle: pick(['corto', 'corto', 'largo', 'cresta', 'calvo']), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick(PANTS),
      hat: pick(['none', 'none', 'none', 'gorra', 'txapela']), hatCol: pick(HATS) };
  }
  function spawnPed(init) {
    for (let t = 0; t < 30; t++) {
      const p = randomSidewalkPoint();
      if (P && dist(p.x, p.y, P.x, P.y) < (init ? 120 : 450)) continue;
      G.peds.push({ x: p.x, y: p.y, a: rand(0, TAU), hp: 30, look: randomLook(), t: rand(1, 4), wait: 0, flee: 0, walk: 0, dead: false });
      return;
    }
  }
  function updatePed(p, dt) {
    let speed;
    if (p.flee > 0) {
      p.flee -= dt; p.a = Math.atan2(p.y - P.y, p.x - P.x) + Math.sin(G.time * 3 + p.x) * 0.5; speed = 170;
    } else if (p.wait > 0) { p.wait -= dt; speed = 0; }
    else {
      p.t -= dt; speed = 55;
      if (p.t <= 0) { p.a = rand(0, TAU); p.t = rand(2, 5); if (Math.random() < 0.35) p.wait = rand(1, 3); }
    }
    const nx = p.x + Math.cos(p.a) * speed * dt, ny = p.y + Math.sin(p.a) * speed *
