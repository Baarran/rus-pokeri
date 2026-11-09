/* ===================================================================
   game-physics.js  —  Canvas oyun motoru
   Yıkılabilir arazi, parabolik atış + rüzgâr, silah kütlesi, sıra tabanlı
   senkronizasyon (atış günlüğü Firebase'den yeniden oynatılır), bot.
   Senkron güvenliği: atışı yapan istemci uçuş yolunu ve hasarı hesaplar,
   sonucu Firebase'e yazar; herkes AYNI kayıttan animasyonu oynatır.
   =================================================================== */
(function (w) {
  'use strict';
  var W = 960, H = 540, G = 0.15, WIND_K = 0.0025, DT = 0.25, TURN_MS = 40000, PI = Math.PI;
  var COLORS = ['#4fa3ff', '#ff6a5c'];

  /* ---------- saf yardımcılar ---------- */
  function solidAt(mask, x, y) { x = Math.floor(x); y = Math.floor(y); return x >= 0 && x < W && y >= 0 && y < H && mask[y * W + x] === 1; }
  function hmAt(hm, x) { var i = x >> 2, f = x & 3; return (hm[i] * (4 - f) + hm[Math.min(i + 1, hm.length - 1)] * f + 2) >> 2; }
  function carveMask(mask, cx, cy, r) {
    var r2 = r * r;
    for (var y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
      for (var x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) mask[y * W + x] = 0;
  }
  /* Karakterin duracağı zemin (ayak Y'si). -1: altında zemin yok (boşluğa düşer). */
  function groundY(mask, x, y0) {
    var best = 1e9;
    [-6, 0, 6].forEach(function (dx) {
      var xx = Math.max(0, Math.min(W - 1, x + dx));
      for (var yy = Math.max(0, y0 - 3); yy < H; yy++) if (mask[yy * W + xx]) { if (yy < best) best = yy; break; }
    });
    return best === 1e9 ? -1 : best - 1;
  }
  /* Yeni harita: yükseklik dizisi (241 değer), başlangıç X'leri ve tur rüzgârları */
  function makeMap() {
    var p1 = Math.random() * 6.28, p2 = Math.random() * 6.28, p3 = Math.random() * 6.28, hm = [];
    for (var i = 0; i <= 240; i++) {
      var x = i * 4, h = 335 + 55 * Math.sin(x * 0.0065 + p1) + 32 * Math.sin(x * 0.0145 + p2) + 14 * Math.sin(x * 0.034 + p3);
      hm.push(Math.max(190, Math.min(470, Math.round(h))));
    }
    var winds = []; for (var k = 0; k < 40; k++) winds.push(Math.round((Math.random() * 2 - 1) * 10));
    return { terrain: hm, spawn: [Math.round(90 + Math.random() * 90), Math.round(W - 90 - Math.random() * 90)], winds: winds };
  }

  /* ---------- Arazi (maske + görüntü) ---------- */
  function Terrain(hm) {
    this.mask = new Uint8Array(W * H);
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H;
    this.cx = this.cv.getContext('2d'); this.img = this.cx.createImageData(W, H);
    var d = this.img.data;
    for (var x = 0; x < W; x++) {
      var h = hmAt(hm, x);
      for (var y = h; y < H; y++) {
        this.mask[y * W + x] = 1;
        var depth = y - h, i = (y * W + x) * 4, v = ((x * 7 + y * 13) % 11) * 2;
        if (depth < 5) { d[i] = 78 + depth * 4; d[i + 1] = 168 - depth * 9; d[i + 2] = 62; }
        else { var s = Math.max(0.32, 1 - depth / 430); d[i] = 138 * s + v; d[i + 1] = 98 * s + v; d[i + 2] = 58 * s + v; }
        d[i + 3] = 255;
      }
    }
    this.cx.putImageData(this.img, 0, 0);
  }
  Terrain.prototype.carve = function (cx, cy, r) {
    carveMask(this.mask, cx, cy, r);
    var d = this.img.data, r2 = r * r, R2 = (r + 3) * (r + 3);
    for (var y = Math.max(0, cy - r - 3); y <= Math.min(H - 1, cy + r + 3); y++)
      for (var x = Math.max(0, cx - r - 3); x <= Math.min(W - 1, cx + r + 3); x++) {
        var q = (x - cx) * (x - cx) + (y - cy) * (y - cy), i = (y * W + x) * 4;
        if (q <= r2) d[i + 3] = 0;
        else if (q <= R2 && this.mask[y * W + x]) { d[i] *= 0.55; d[i + 1] *= 0.55; d[i + 2] *= 0.55; }
      }
    this.cx.putImageData(this.img, 0, 0);
  };

  /* ---------- Atış simülasyonu (yalnızca atan istemci çalıştırır) ---------- */
  function blast(x, y, r, base, players) {
    var d = {}, any = false, reach = r + 14;
    players.forEach(function (p) {
      if (!p.alive) return;
      var dist = Math.hypot(p.x - x, (p.y - 10) - y);
      if (dist < reach) {
        var dm = Math.round(base * (0.3 + 0.7 * (1 - dist / reach)));
        dm = Math.round(dm * 100 / (100 + p.armor));
        if (dm > 0) { d[p.uid] = dm; any = true; }
      }
    });
    return any ? d : null;
  }
  function hitPlayer(players, shooterUid, t, x, y) {
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p.alive || (p.uid === shooterUid && t < 30)) continue;
      if (Math.abs(x - p.x) <= 11 && y >= p.y - 20 && y <= p.y + 2) return true;
    }
    return false;
  }
  function shell(mask, players, shooter, wp, base, rad, ang, pw, wind) {
    var a = ang * PI / 180, sp = pw * 0.13 * wp.speed, vx = Math.cos(a) * sp, vy = -Math.sin(a) * sp, dir = vx >= 0 ? 1 : -1;
    var x = shooter.x, y = shooter.y - 18, path = [Math.round(x), Math.round(y)];
    for (var i = 1; i < 16000; i++) {
      vx += wind * WIND_K * wp.wind * DT; if (wp.back) vx -= dir * wp.back * DT;
      vy += G * DT; x += vx * DT; y += vy * DT;
      if (i % 8 === 0) path.push(Math.round(x), Math.round(y));
      if (x < -60 || x > W + 60 || y > H + 60) { path.push(Math.round(x), Math.round(y)); return { p: path, x: Math.round(x), y: Math.round(y), r: 0 }; }
      if (solidAt(mask, x, y) || hitPlayer(players, shooter.uid, i / 4, x, y)) {
        var ex = Math.round(x), ey = Math.round(y); path.push(ex, ey);
        var b = { p: path, x: ex, y: ey, r: rad }, d = blast(ex, ey, rad, base, players); if (d) b.d = d; return b;
      }
    }
    return { p: path, x: Math.round(x), y: Math.round(y), r: 0 };
  }
  function beam(mask, players, shooter, base, rad, ang) {
    var a = ang * PI / 180, ox = shooter.x, oy = shooter.y - 18, x = ox, y = oy, ex = null, ey = null;
    for (var i = 1; i < 560; i++) {
      x = ox + Math.cos(a) * i * 2; y = oy - Math.sin(a) * i * 2;
      if (x < -20 || x > W + 20 || y > H + 20) break;
      if (solidAt(mask, x, y) || hitPlayer(players, shooter.uid, i > 10 ? 99 : 0, x, y)) { ex = Math.round(x); ey = Math.round(y); break; }
    }
    if (ex === null) return { p: [Math.round(ox), Math.round(oy), Math.round(x), Math.round(y)], x: Math.round(x), y: Math.round(y), r: 0 };
    var b = { p: [Math.round(ox), Math.round(oy), ex, ey], x: ex, y: ey, r: rad }, d = blast(ex, ey, rad, base, players); if (d) b.d = d; return b;
  }
  function simulate(mask0, players, shooter, wid, lvl, ang, pw, wind) {
    var wp = WEAPONS[wid], mask = new Uint8Array(mask0), out = [], n = wp.shots || 1;
    var base = Rules.wDmg(wid, lvl), rad = Rules.wRad(wid, lvl);
    for (var s = 0; s < n; s++) {
      var a = ang + (n > 1 ? (s - (n - 1) / 2) * wp.spread : 0);
      var b = wp.kind === 'beam' ? beam(mask, players, shooter, base, rad, a) : shell(mask, players, shooter, wp, base, rad, a, pw, wind);
      out.push(b); if (b.r > 0) carveMask(mask, b.x, b.y, b.r);
    }
    return out;
  }

  /* ===================== OYUN ===================== */
  function Game(canvas, o) {
    var self = this, m = o.match;
    this.cv = canvas; this.ctx = canvas.getContext('2d'); canvas.width = W; canvas.height = H;
    this.o = o; this.uid = o.uid; this.id = o.id; this.m = m; this.order = m.order; this.winds = m.winds;
    this.terrain = new Terrain(m.terrain);
    this.list = []; this.pl = {};
    Object.keys(m.players).forEach(function (u) {
      var q = m.players[u], p = { uid: u, name: q.name, idx: q.idx, x: m.spawn[q.idx], y: 0, dy: 0, hp: q.maxHp, maxHp: q.maxHp, armor: q.armor || 0, angle: q.idx ? 135 : 45, alive: true, skips: 0, power: 60 };
      var g = groundY(self.terrain.mask, p.x, 0); p.y = g < 0 ? 300 : g; p.dy = p.y;
      self.pl[u] = p; self.list.push(p);
    });
    this.seen = 0; this.applied = 0; this.queue = []; this.cur = null; this.over = false; this.firstSnap = true;
    this.parts = []; this.texts = []; this.rings = []; this.trail = []; this.shake = 0; this.sunT = 0;
    this.aim = { angle: this.me() && this.me().idx ? 135 : 45, power: 60 }; this.weapon = 'bomb'; this.wlevel = 1;
    this.deadline = performance.now() + TURN_MS; this.busyWrite = false; this.botAt = 0; this.pressed = false;
    this.bind(); this.running = true; this.loop();
  }
  var GP = Game.prototype;
  GP.me = function () { return this.pl[this.uid]; };
  GP.turnUid = function () { return this.order[this.applied % 2]; };
  GP.wind = function () { return this.winds[this.applied % this.winds.length]; };
  GP.myTurn = function () { return !this.over && !this.cur && !this.queue.length && this.turnUid() === this.uid && this.me() && this.me().alive; };
  GP.destroy = function () {
    this.running = false;
    this.cv.removeEventListener('pointerdown', this._pd); this.cv.removeEventListener('pointermove', this._pm);
    window.removeEventListener('pointerup', this._pu); window.removeEventListener('keydown', this._kd);
  };

  /* --- Firebase'den gelen atış günlüğü --- */
  GP.onShots = function (obj) {
    obj = obj || {};
    var keys = Object.keys(obj).sort(), first = this.firstSnap; this.firstSnap = false;
    for (var i = 0; i < keys.length; i++) {
      var s = obj[keys[i]];
      if (s.n === this.seen) { s.instant = first; this.queue.push(s); this.seen++; }
    }
  };

  /* --- Atış uygulama (animasyonlu veya anında) --- */
  GP.applyBurst = function (b, visual) {
    var self = this;
    if (b.r > 0) {
      this.terrain.carve(b.x, b.y, b.r);
      if (visual) {
        this.rings.push({ x: b.x, y: b.y, r: b.r, t: 0 }); this.shake = Math.min(14, 3 + b.r / 6);
        for (var i = 0; i < 18; i++) { var a = Math.random() * 6.28, s = 1 + Math.random() * 3.5; this.parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 24 + Math.random() * 20, c: i % 2 ? '#ffb347' : '#8a5a2b' }); }
      }
    }
    Object.keys(b.d || {}).forEach(function (u) {
      var p = self.pl[u]; if (!p) return;
      p.hp = Math.max(0, p.hp - b.d[u]);
      if (visual) self.texts.push({ x: p.x, y: p.y - 40, t: '-' + b.d[u], c: '#ff5a4d', life: 60 });
    });
  };
  GP.applySettle = function (visual) {
    var self = this;
    this.list.forEach(function (p) {
      if (!p.alive) return;
      var g = groundY(self.terrain.mask, p.x, p.y);
      if (g < 0) { p.y = H + 40; p.hp = 0; if (visual) self.texts.push({ x: p.x, y: H - 30, t: 'Boşluğa düştü!', c: '#ffd34d', life: 80 }); return; }
      var drop = g - p.y; p.y = g;
      if (drop > 35) {
        var fd = Math.round((drop - 35) * 0.5); p.hp = Math.max(0, p.hp - fd);
        if (visual) self.texts.push({ x: p.x, y: p.y - 50, t: 'Düşme -' + fd, c: '#ffa94d', life: 70 });
      }
    });
  };
  GP.finishShot = function (s) {
    var self = this;
    if (s.sur) this.pl[s.uid].hp = 0;
    this.list.forEach(function (p) { if (p.hp <= 0) p.alive = false; });
    this.applied++; this.deadline = performance.now() + TURN_MS; this.botAt = performance.now() + 1100; this.trail = [];
    var loser = null;
    if (!this.pl[s.uid].alive) loser = s.uid;
    else this.list.forEach(function (p) { if (!p.alive) loser = p.uid; });
    if (loser && !this.over) {
      this.over = true;
      var winner = this.list.filter(function (p) { return p.uid !== loser; })[0];
      if (this.o.onOver) this.o.onOver(winner ? winner.uid : null, loser);
    }
  };
  GP.instantApply = function (s) {
    if (s.uid !== this.turnUid() && !s.sur) { return; }
    if (s.skip) { var p = this.pl[s.uid]; p.skips++; if (p.skips >= 3) p.hp = 0; }
    else if (!s.sur) { this.pl[s.uid].skips = 0; this.pl[s.uid].angle = s.ang; (s.bursts || []).forEach(function (b) { this.applyBurst(b, false); }, this); this.applySettle(false); this.list.forEach(function (p) { p.dy = p.y; }); }
    this.finishShot(s);
  };
  GP.startShot = function (s) {
    if (s.sur) { this.texts.push({ x: this.pl[s.uid].x, y: this.pl[s.uid].y - 50, t: 'Teslim oldu', c: '#ffd34d', life: 90 }); this.finishShot(s); return; }
    if (s.uid !== this.turnUid()) return;
    if (s.skip) {
      var p = this.pl[s.uid]; p.skips++; this.texts.push({ x: p.x, y: p.y - 50, t: 'Süre doldu (pas)', c: '#ffd34d', life: 70 });
      if (p.skips >= 3) { p.hp = 0; this.texts.push({ x: p.x, y: p.y - 70, t: '3 pas: elendi', c: '#ff5a4d', life: 90 }); }
      this.finishShot(s); return;
    }
    this.pl[s.uid].skips = 0; this.pl[s.uid].angle = s.ang;
    this.cur = { s: s, bi: 0, pi: 0, phase: 'fly', t: 0 };
  };

  /* --- Atış yapma --- */
  GP.fire = function () {
    var me = this.me(); if (!this.myTurn() || this.busyWrite) return;
    var wid = this.weapon, lvl = this.wlevel;
    var bursts = simulate(this.terrain.mask, this.list, me, wid, lvl, this.aim.angle, this.aim.power, this.wind());
    this.writeShot({ uid: this.uid, w: wid, l: lvl, ang: Math.round(this.aim.angle), pw: Math.round(this.aim.power), bursts: bursts });
  };
  GP.writeShot = function (obj) {
    var self = this, n = this.seen; obj.n = n; obj.t = DB.now(); this.busyWrite = true;
    DB.tx('matches/' + this.id + '/shots/s' + DB.pad(n), function (cur) { return cur === null ? obj : undefined; })
      .then(function () { self.busyWrite = false; }, function () { self.busyWrite = false; });
  };
  GP.surrender = function () { if (!this.over) this.writeShot({ uid: this.uid, sur: 1 }); };
  GP.botShot = function () {
    var bot = this.pl[this.turnUid()], me = null, self = this;
    this.list.forEach(function (p) { if (p.uid !== bot.uid) me = p; });
    var best = null, ws = ['bomb', 'bomb', 'triple', 'missile'], wid = ws[Math.floor(Math.random() * ws.length)];
    for (var i = 0; i < 70; i++) {
      var ang = bot.idx ? 95 + Math.random() * 65 : 20 + Math.random() * 65, pw = 25 + Math.random() * 75;
      var bs = simulate(this.terrain.mask, this.list, bot, wid, 2, ang, pw, this.wind());
      var sc = 0; bs.forEach(function (b) { sc -= Math.hypot(b.x - me.x, b.y - (me.y - 10)); if (b.d && b.d[me.uid]) sc += 400 + b.d[me.uid]; if (b.d && b.d[bot.uid]) sc -= 600; });
      sc += (Math.random() - 0.5) * 140;
      if (!best || sc > best.sc) best = { sc: sc, ang: ang, pw: pw, bs: bs };
    }
    this.writeShot({ uid: bot.uid, w: wid, l: 2, ang: Math.round(best.ang), pw: Math.round(best.pw), bursts: best.bs });
  };

  /* --- Girdi: fare/dokunma ile açı ve güç; ok tuşları + boşluk --- */
  GP.bind = function () {
    var self = this;
    function aimAt(e) {
      var me = self.me(); if (!self.myTurn()) return;
      var r = self.cv.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width, py = (e.clientY - r.top) * H / r.height;
      var dx = px - me.x, dy = py - (me.y - 18), ang = Math.atan2(-dy, dx) * 180 / PI;
      if (ang < 0) ang = dx >= 0 ? 0 : 180;
      self.aim.angle = Math.max(0, Math.min(180, ang));
      self.aim.power = Math.max(8, Math.min(100, Math.hypot(dx, dy) / (W * 0.4) * 100));
      self.changed();
    }
    this._pd = function (e) { self.pressed = true; try { self.cv.setPointerCapture(e.pointerId); } catch (x) {} aimAt(e); };
    this._pm = function (e) { if (self.pressed) aimAt(e); };
    this._pu = function () { self.pressed = false; };
    this._kd = function (e) {
      if (!self.myTurn()) return; var k = e.key, a = self.aim;
      if (k === 'ArrowLeft') a.angle = Math.min(180, a.angle + 1); else if (k === 'ArrowRight') a.angle = Math.max(0, a.angle - 1);
      else if (k === 'ArrowUp') a.power = Math.min(100, a.power + 1); else if (k === 'ArrowDown') a.power = Math.max(8, a.power - 1);
      else if (k === ' ') { e.preventDefault(); self.fire(); return; } else return;
      e.preventDefault(); self.changed();
    };
    this.cv.addEventListener('pointerdown', this._pd); this.cv.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu); window.addEventListener('keydown', this._kd);
  };
  GP.changed = function () { if (this.o.onHud) this.o.onHud(this.hud()); };
  GP.hud = function () {
    var tu = this.turnUid(), p = this.pl[tu];
    return { turnUid: tu, turnName: p ? p.name : '?', myTurn: this.myTurn(), wind: this.wind(), secs: Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000)),
      angle: Math.round(this.aim.angle), power: Math.round(this.aim.power), over: this.over, busy: !!this.cur || this.queue.length > 0 };
  };

  /* --- Çerçeve güncelleme --- */
  GP.update = function () {
    var now = performance.now(), self = this;
    this.sunT += 0.002;
    // bekleyen anında uygulanacaklar (tekrar bağlanma/yenileme)
    while (!this.cur && this.queue.length && this.queue[0].instant) this.instantApply(this.queue.shift());
    if (!this.cur && this.queue.length) this.startShot(this.queue.shift());
    var c = this.cur;
    if (c) {
      var bs = c.s.bursts || [], b = bs[c.bi];
      if (!b) { c.phase = 'settle'; }
      if (c.phase === 'fly') {
        var beamShot = WEAPONS[c.s.w] && WEAPONS[c.s.w].kind === 'beam';
        if (beamShot) { c.t++; if (c.t > 14) { c.phase = 'boom'; c.t = 0; this.applyBurst(b, true); } }
        else {
          c.pi++; var pi = Math.min(c.pi, b.p.length / 2 - 1);
          this.trail.push([b.p[pi * 2], b.p[pi * 2 + 1]]); if (this.trail.length > 14) this.trail.shift();
          if (pi >= b.p.length / 2 - 1) { c.phase = 'boom'; c.t = 0; this.applyBurst(b, true); this.trail = []; }
        }
      } else if (c.phase === 'boom') {
        c.t++; if (c.t > 22) { c.bi++; c.pi = 0; c.t = 0; c.phase = bs[c.bi] ? 'fly' : 'settle'; }
      } else if (c.phase === 'settle') {
        if (c.t === 0) this.applySettle(true);
        c.t++;
        var moving = false; this.list.forEach(function (p) { if (Math.abs(p.dy - p.y) > 0.5) moving = true; });
        if (!moving && c.t > 10) { this.cur = null; this.finishShot(c.s); }
      }
    }
    this.list.forEach(function (p) { var d = p.y - p.dy; p.dy += Math.abs(d) < 0.5 ? d : Math.sign(d) * Math.min(Math.abs(d), 3.2); });
    this.parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; });
    this.parts = this.parts.filter(function (p) { return p.life > 0; });
    this.texts.forEach(function (t) { t.y -= 0.5; t.life--; }); this.texts = this.texts.filter(function (t) { return t.life > 0; });
    this.rings.forEach(function (r) { r.t++; }); this.rings = this.rings.filter(function (r) { return r.t < 22; });
    if (this.shake > 0) this.shake *= 0.9;
    // sıra süresi, bot, pas
    if (!this.over && !this.cur && !this.queue.length && !this.busyWrite) {
      var tu = this.turnUid();
      if (tu === 'bot') { if (this.m.host === this.uid && now > this.botAt) { this.botAt = now + 5000; this.botShot(); } }
      else if (tu === this.uid && now > this.deadline) { this.deadline = now + 3000; this.writeShot({ uid: this.uid, skip: 1 }); }
      else if (tu !== this.uid && now > this.deadline + 20000) { this.deadline = now + 3000; this.writeShot({ uid: tu, skip: 1 }); }
    }
    if (!this._hudT || now - this._hudT > 250) { this._hudT = now; this.changed(); }
  };

  /* --- Çizim --- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  GP.draw = function () {
    var ctx = this.ctx, self = this;
    ctx.save();
    if (this.shake > 0.5) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b2a55'); g.addColorStop(0.55, '#4a78b8'); g.addColorStop(1, '#a9d1e8');
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = 'rgba(255,240,190,.9)'; ctx.beginPath(); ctx.arc(780 + Math.sin(this.sunT) * 30, 90, 30, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (var i = 0; i < 4; i++) { var cx = ((i * 260 + this.sunT * 900) % (W + 200)) - 100, cy = 70 + i * 38; ctx.beginPath(); ctx.ellipse(cx, cy, 60, 14, 0, 0, 7); ctx.ellipse(cx + 30, cy - 8, 36, 12, 0, 0, 7); ctx.fill(); }
    ctx.drawImage(this.terrain.cv, 0, 0);
    // oyuncular
    this.list.forEach(function (p) {
      if (!p.alive) { if (p.y < H) { ctx.fillStyle = '#ddd'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🪦', p.x, p.dy); } return; }
      var col = COLORS[p.idx % 2], isMe = p.uid === self.uid, ang = (isMe && self.myTurn()) ? self.aim.angle : p.angle, a = ang * PI / 180, x = p.x, y = p.dy;
      ctx.strokeStyle = '#222'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + Math.cos(a) * 17, y - 12 - Math.sin(a) * 17); ctx.stroke();
      ctx.fillStyle = col; rr(ctx, x - 13, y - 10, 26, 9, 3); ctx.fill();
      ctx.fillStyle = '#222'; [-8, 0, 8].forEach(function (dx) { ctx.beginPath(); ctx.arc(x + dx, y - 1, 3.4, 0, 7); ctx.fill(); });
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - 11, 6.5, 0, 7); ctx.fill();
      // HP çubuğu + ad
      var f = p.hp / p.maxHp; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - 21, y - 36, 42, 7);
      ctx.fillStyle = f > 0.5 ? '#5fd35f' : f > 0.25 ? '#f1c232' : '#e5483c'; ctx.fillRect(x - 20, y - 35, 40 * f, 5);
      ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
      var lbl = p.name + ' ' + p.hp; ctx.strokeText(lbl, x, y - 42); ctx.fillText(lbl, x, y - 42);
      if (p.uid === self.turnUid() && !self.over) { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(x, y - 62); ctx.lineTo(x - 6, y - 70); ctx.lineTo(x + 6, y - 70); ctx.fill(); }
    });
    // nişan
    var me = this.me();
    if (this.myTurn() && me) {
      var a2 = this.aim.angle * PI / 180, L = 20 + this.aim.power * 1.1;
      ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(me.x, me.dy - 18); ctx.lineTo(me.x + Math.cos(a2) * L, me.dy - 18 - Math.sin(a2) * L); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(me.x + Math.cos(a2) * L, me.dy - 18 - Math.sin(a2) * L, 5, 0, 7); ctx.fill();
    }
    // mermi
    var c = this.cur;
    if (c && c.phase === 'fly') {
      var b = (c.s.bursts || [])[c.bi];
      if (b) {
        if (WEAPONS[c.s.w] && WEAPONS[c.s.w].kind === 'beam') {
          ctx.strokeStyle = 'rgba(120,240,255,' + (1 - c.t / 16) + ')'; ctx.lineWidth = 4 + (14 - c.t) * 0.4; ctx.shadowColor = '#7ff'; ctx.shadowBlur = 14;
          ctx.beginPath(); ctx.moveTo(b.p[0], b.p[1]); ctx.lineTo(b.p[2], b.p[3]); ctx.stroke(); ctx.shadowBlur = 0;
        } else {
          for (var t = 0; t < this.trail.length; t++) { ctx.fillStyle = 'rgba(255,220,150,' + (t / this.trail.length * 0.6) + ')'; ctx.beginPath(); ctx.arc(this.trail[t][0], this.trail[t][1], 2 + t * 0.15, 0, 7); ctx.fill(); }
          var tp = this.trail[this.trail.length - 1];
          if (tp) { ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(tp[0], tp[1], 4.5, 0, 7); ctx.fill(); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(tp[0] - 1, tp[1] - 1, 2, 0, 7); ctx.fill(); }
        }
      }
    }
    this.rings.forEach(function (r) { var k = r.t / 22; ctx.strokeStyle = 'rgba(255,200,80,' + (1 - k) + ')'; ctx.lineWidth = 5 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.6 + k * 0.9), 0, 7); ctx.stroke(); });
    this.parts.forEach(function (p) { ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, p.life / 20); ctx.fillRect(p.x, p.y, 3, 3); }); ctx.globalAlpha = 1;
    ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
    this.texts.forEach(function (t) { ctx.globalAlpha = Math.min(1, t.life / 25); ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4; ctx.strokeText(t.t, t.x, t.y); ctx.fillStyle = t.c; ctx.fillText(t.t, t.x, t.y); }); ctx.globalAlpha = 1;
    ctx.restore();
    // rüzgâr göstergesi
    var wd = this.wind(); ctx.fillStyle = 'rgba(0,0,0,.45)'; rr(ctx, W / 2 - 100, 8, 200, 40, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Rüzgâr ' + Math.abs(wd) + (wd === 0 ? '' : wd > 0 ? ' →' : ' ←'), W / 2, 35);
    if (wd !== 0) { ctx.strokeStyle = '#7fd7ff'; ctx.lineWidth = 3; var ln = Math.abs(wd) * 3, dr = Math.sign(wd); ctx.beginPath(); ctx.moveTo(W / 2 - dr * ln, 58); ctx.lineTo(W / 2 + dr * ln, 58); ctx.stroke(); }
    var secs = Math.max(0, Math.ceil((this.deadline - performance.now()) / 1000));
    ctx.fillStyle = secs <= 8 && !this.over ? '#ff6a5c' : '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(this.over ? '' : '⏱ ' + secs, W - 14, 32);
  };
  GP.loop = function () {
    var self = this;
    (function f() { if (!self.running) return; self.update(); self.draw(); requestAnimationFrame(f); })();
  };

  w.Game = Game; w.Physics = { makeMap: makeMap, W: W, H: H, TURN_MS: TURN_MS, simulate: simulate, groundY: groundY, hmAt: hmAt, solidAt: solidAt, carveMask: carveMask };
})(window);
