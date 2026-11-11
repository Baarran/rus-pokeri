/* Sokak Futbolu — üstten görünüşlü arcade futbol. 1v1 / 2v2, çevrimiçi (host-otoriter) + botlarla tek kişilik. */
(function () {
  'use strict';
  var W = 1000, H = 560, GY0 = 200, GY1 = 360, PR = 18, BR = 11, DUR = 120, WINSCORE = 5;
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), ov = document.getElementById('ov'), card = document.getElementById('card');
  var TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var CFG = { apiKey: 'AIzaSyBsP1VNPJpt1Y6MN0FwDCmvuHeZxaDoTGU', authDomain: 'ruspokeri-de28e.firebaseapp.com', databaseURL: 'https://ruspokeri-de28e-default-rtdb.europe-west1.firebasedatabase.app', projectId: 'ruspokeri-de28e' };
  var COL = ['#ff5a5a', '#4aa8ff'];

  /* ---- ses ---- */
  var AC = null;
  function snd(f, d, type, v) { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); var o = AC.createOscillator(), g = AC.createGain(); o.type = type || 'square'; o.frequency.value = f; g.gain.value = v || 0.06; g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + d); } catch (e) {} }

  /* ---- Firebase ---- */
  var db = null, uid = null, myName = 'Oyuncu', tOff = 0;
  function snow() { return Date.now() + tOff; }
  try {
    if (window.firebase) {
      if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(CFG);
      db = firebase.database();
      try { db.ref('.info/serverTimeOffset').on('value', function (s) { tOff = s.val() || 0; }); } catch (e) {}
      firebase.auth().onAuthStateChanged(function (u) {
        if (!u) { uid = null; if (!M.on && !roomN) menu(); return; }
        uid = u.uid;
        try { var pr = db.ref('rp/online/' + uid); pr.onDisconnect().remove(); pr.set('sokak'); } catch (e) {}
        db.ref('rp/users/' + uid + '/name').once('value').then(function (s) { myName = s.val() || 'Oyuncu'; if (!M.on && !roomN) menu(); }, function () { if (!M.on && !roomN) menu(); });
      });
    }
  } catch (e) { db = null; }

  /* ---- maç durumu ---- */
  var M = { on: false, net: false, n: 1, E: [], me: null, ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, s: [0, 0], ph: 'cd', t0: 0, rs: 0, gt: 0, w: -1, sd: false, msg: '', msgT: 0, host: true, dur: DUR, pubT: 0, posT: 0, over: false, lastQ: 0 };
  var keys = { u: 0, d: 0, l: 0, r: 0, shoot: 0, sprint: 0 }, joy = { x: 0, y: 0 }, tbtn = { shoot: 0, sprint: 0 }, passReq = 0;
  var roomN = 0, room = {}, live = null, posAll = {}, lastNo = -1, lastRs = -1, kseq = 0, R = null, PS = null, LV = null, roomsAll = {}, roomsRef = null;

  function spawn(e) {
    var n = M.n, k = e.k, x = e.t === 0 ? 250 : W - 250;
    var y = n === 1 ? H / 2 : (k === 0 ? H / 2 - 110 : H / 2 + 110);
    e.x = x; e.y = y; e.vx = e.vy = 0; e.tx = x; e.ty = y; e.f = e.t === 0 ? 0 : Math.PI; e.chg = 0; e.cd = 0;
  }
  function buildEntities(n, as, names) {
    M.n = n; M.E = []; M.me = null;
    var byslot = {}; Object.keys(as || {}).forEach(function (u) { byslot[as[u]] = u; });
    for (var s = 0; s < n * 2; s++) {
      var e = { s: s, t: s < n ? 0 : 1, k: s % n, h: !!byslot[s], uid: byslot[s] || null, stam: 1, lastK: 0, chg: 0, cd: 0, shootHeld: false };
      e.name = e.h ? ((names && names[e.uid]) || 'Oyuncu') : 'Bot'; spawn(e);
      if (e.uid && e.uid === uid) M.me = e;
      M.E.push(e);
    }
  }
  function resetPositions() { M.E.forEach(spawn); M.ball.x = W / 2; M.ball.y = H / 2; M.ball.vx = M.ball.vy = 0; }
  function setMsg(t, d) { M.msg = t; M.msgT = d || 1.2; }
  function isLocal(e) { return e === M.me || (!e.h && M.host) || (!M.net && e !== M.me && M.host); }

  /* ---- fizik ---- */
  function inputVec() {
    var x = (keys.r - keys.l) + joy.x, y = (keys.d - keys.u) + joy.y, m = Math.sqrt(x * x + y * y);
    if (m > 1) { x /= m; y /= m; } return { x: x, y: y, m: Math.min(1, m) };
  }
  function moveEnt(e, ix, iy, sprint, dt) {
    var m = Math.sqrt(ix * ix + iy * iy), spd = 215 + (sprint && e.stam > 0.02 && m > 0.1 ? 95 : 0);
    if (sprint && m > 0.1 && e.stam > 0.02) e.stam = Math.max(0, e.stam - dt * 0.55); else e.stam = Math.min(1, e.stam + dt * 0.22);
    var tvx = ix * spd, tvy = iy * spd, a = Math.min(1, 11 * dt);
    e.vx += (tvx - e.vx) * a; e.vy += (tvy - e.vy) * a;
    e.x = clamp(e.x + e.vx * dt, PR, W - PR); e.y = clamp(e.y + e.vy * dt, PR, H - PR);
    if (m > 0.2) e.f = Math.atan2(iy, ix);
  }
  function separate() {
    for (var i = 0; i < M.E.length; i++) for (var j = i + 1; j < M.E.length; j++) {
      var a = M.E[i], b = M.E[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, min = PR * 2;
      if (d < min) { var o = (min - d) / 2, nx = dx / d, ny = dy / d; if (isLocal(a)) { a.x -= nx * o; a.y -= ny * o; } if (isLocal(b)) { b.x += nx * o; b.y += ny * o; } }
    }
  }
  function ballStep(dt) {
    var b = M.ball;
    b.x += b.vx * dt; b.y += b.vy * dt; var f = Math.pow(0.42, dt); b.vx *= f; b.vy *= f;
    if (Math.abs(b.vx) < 3 && Math.abs(b.vy) < 3) { b.vx = b.vy = 0; }
    if (b.y < BR) { b.y = BR; b.vy = -b.vy * 0.85; } if (b.y > H - BR) { b.y = H - BR; b.vy = -b.vy * 0.85; }
    var inGoal = b.y > GY0 + 8 && b.y < GY1 - 8;
    if (b.x < BR && !inGoal) { b.x = BR; b.vx = -b.vx * 0.85; }
    if (b.x > W - BR && !inGoal) { b.x = W - BR; b.vx = -b.vx * 0.85; }
    if (inGoal) { if (b.x < -4) b.x = Math.max(b.x, -46); if (b.x > W + 4) b.x = Math.min(b.x, W + 46); }
    if (!inGoal && (b.x < BR + 1 || b.x > W - BR - 1)) { /* direk köşesi: hafif it */ }
  }
  function ballCollide() {
    var b = M.ball;
    M.E.forEach(function (e) {
      var dx = b.x - e.x, dy = b.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01, min = PR + BR;
      if (d < min) {
        var nx = dx / d, ny = dy / d; b.x = e.x + nx * min; b.y = e.y + ny * min;
        var rv = (b.vx - e.vx) * nx + (b.vy - e.vy) * ny;
        if (rv < 0) { b.vx -= 1.25 * rv * nx; b.vy -= 1.25 * rv * ny; }
        var sp = Math.sqrt(e.vx * e.vx + e.vy * e.vy); if (sp > 60) { b.vx += e.vx * 0.3; b.vy += e.vy * 0.3; }
      }
    });
  }
  function applyKick(e, dx, dy, p) {
    var b = M.ball, d = Math.sqrt((b.x - e.x) * (b.x - e.x) + (b.y - e.y) * (b.y - e.y));
    if (d > PR + BR + 26) return false;
    var m = Math.sqrt(dx * dx + dy * dy) || 1; b.vx = dx / m * p + e.vx * 0.25; b.vy = dy / m * p + e.vy * 0.25;
    snd(p > 650 ? 160 : 230, 0.09, 'triangle', 0.09); return true;
  }
  function doKick(e, dx, dy, p) {
    if (M.host) applyKick(e, dx, dy, p);
    else if (PS && uid) { kseq++; PS.child(uid + '/k').set({ q: kseq, dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100, p: Math.round(p) }); applyKick(e, dx, dy, p); }
  }
  function mates(e) { return M.E.filter(function (o) { return o.t === e.t && o !== e; }); }
  function playerActions(e, dt) {
    var held = !!(keys.shoot || tbtn.shoot);
    if (held) e.chg = Math.min(1, e.chg + dt / 0.85);
    else if (e.shootHeld) { var p = 360 + 600 * e.chg; doKick(e, Math.cos(e.f), Math.sin(e.f), p); e.chg = 0; }
    e.shootHeld = held;
    if (passReq) {
      passReq = 0; var ms = mates(e), t = null, bd = 1e9;
      ms.forEach(function (o) { var d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd) { bd = d; t = o; } });
      if (t) doKick(e, t.x + t.vx * 0.3 - e.x, t.y + t.vy * 0.3 - e.y, clamp(260 + bd * 1.1, 300, 760)); else doKick(e, Math.cos(e.f), Math.sin(e.f), 380);
    }
  }
  /* ---- bot yapay zekâsı ---- */
  function botAI(e, dt) {
    var b = M.ball, atkX = e.t === 0 ? W : 0, ownX = e.t === 0 ? 0 : W, dir = e.t === 0 ? 1 : -1;
    var team = M.E.filter(function (o) { return o.t === e.t; }), ch = team[0], bd = 1e9;
    team.forEach(function (o) { var d = Math.hypot(o.x - b.x, o.y - b.y) + (o.h ? 40 : 0); if (d < bd) { bd = d; ch = o; } });
    var tx, ty, sprint = false;
    if (ch === e) {
      var gx = atkX, gy = H / 2, ux = b.x - gx, uy = b.y - gy, um = Math.hypot(ux, uy) || 1;
      var bx = b.x + ux / um * 20 + b.vx * 0.15, by = b.y + uy / um * 20 + b.vy * 0.15;
      var d = Math.hypot(b.x - e.x, b.y - e.y);
      if (d < 46) {
        var aim = Math.atan2(gy + (Math.sin(M.t * 1.7 + e.s) * 55) - e.y, gx - e.x), toB = Math.atan2(b.y - e.y, b.x - e.x), diff = Math.abs(Math.atan2(Math.sin(aim - toB), Math.cos(aim - toB)));
        if (e.cd <= 0 && (diff < 0.7 || d < 30) && Math.abs(gx - e.x) < 520) { applyBotKick(e, Math.cos(aim), Math.sin(aim), 520 + Math.random() * 200); e.cd = 0.7; }
      }
      tx = bx; ty = by; sprint = d > 120;
    } else {
      var off = e.k === 0 ? -1 : 1;
      if (b.x * dir > (W / 2) * dir - 40 * dir && false) { tx = b.x; ty = b.y; }
      var depth = M.n === 1 ? 0.5 : (e.k === 0 ? 0.35 : 0.65);
      tx = ownX + (b.x - ownX) * depth + dir * 20; ty = H / 2 + (b.y - H / 2) * 0.55 + off * (M.n === 2 ? 70 : 0);
      if (e.k === 1) tx = clamp(b.x + dir * 110, 120, W - 120);
    }
    var dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy);
    var sk = 0.9; e.cd = Math.max(0, e.cd - dt);
    if (dd > 6) moveEnt(e, dx / dd * sk, dy / dd * sk, sprint, dt); else moveEnt(e, 0, 0, false, dt);
  }
  function applyBotKick(e, dx, dy, p) { var b = M.ball; var d = Math.hypot(b.x - e.x, b.y - e.y); if (d > PR + BR + 22) return; b.vx = dx * p; b.vy = dy * p; snd(200, 0.07, 'triangle', 0.05); }

  /* ---- ana güncelleme ---- */
  function hostPhase() {
    var now = snow(), b = M.ball;
    if (M.ph === 'cd') { if (now >= M.t0) { M.ph = 'play'; setMsg('BAŞLA!', 0.8); snd(520, 0.2, 'square', 0.08); } return; }
    if (M.ph === 'goal') { if (now >= M.gt) { resetPositions(); M.rs++; M.ph = 'play'; } return; }
    if (M.ph !== 'play') return;
    var scored = -1;
    if (b.x < -2 && b.y > GY0 && b.y < GY1) scored = 1; else if (b.x > W + 2 && b.y > GY0 && b.y < GY1) scored = 0;
    var tl = M.dur - (now - M.t0) / 1000;
    if (scored >= 0) {
      M.s[scored]++; M.ph = 'goal'; M.gt = now + 2200; b.vx = b.vy = 0; setMsg('GOOOL!', 2); snd(660, 0.5, 'sawtooth', 0.09);
      if (M.s[scored] >= WINSCORE || (tl <= 0)) endMatch(M.s[0] > M.s[1] ? 0 : 1);
      else if (M.sd) endMatch(scored);
    } else if (tl <= 0) {
      if (M.s[0] !== M.s[1]) endMatch(M.s[0] > M.s[1] ? 0 : 1); else if (!M.sd) { M.sd = true; setMsg('Altın gol!', 2); }
    }
  }
  function endMatch(w) { M.ph = 'end'; M.w = w; M.over = true; snd(440, 0.6, 'triangle', 0.08); if (M.net && R && M.host) { try { R.child('st/over').set(true); } catch (e) {} } publish(true); setTimeout(showResults, 1800); }
  function publish(force) {
    if (!M.net || !M.host || !LV) return; var t = performance.now(); if (!force && t - M.pubT < 80) return; M.pubT = t;
    var b = M.ball;
    LV.set({ b: [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy)], bt: M.E.filter(function (e) { return !e.h; }).map(function (e) { return [Math.round(e.x), Math.round(e.y), Math.round(e.vx), Math.round(e.vy), Math.round(e.f * 100) / 100, e.s]; }), s: M.s, ph: M.ph, rs: M.rs, gt: M.gt, w: M.w, sd: M.sd, ts: snow() });
  }
  function publishPos() {
    if (!M.net || !PS || !M.me) return; var t = performance.now(); if (t - M.posT < 66) return; M.posT = t; var e = M.me;
    PS.child(uid).update({ x: Math.round(e.x), y: Math.round(e.y), vx: Math.round(e.vx), vy: Math.round(e.vy), f: Math.round(e.f * 100) / 100, ts: snow() });
  }
  var last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (M.on) { acc += dt; var n = 0; while (acc >= 1 / 60 && n++ < 6) { update(1 / 60); acc -= 1 / 60; } }
    draw();
  }
  function update(dt) {
    M.t = (M.t || 0) + dt; if (M.msgT > 0) M.msgT -= dt;
    var can = M.ph === 'play';
    M.E.forEach(function (e) {
      if (e === M.me) {
        if (can) { var iv = inputVec(); moveEnt(e, iv.x, iv.y, keys.sprint || tbtn.sprint, dt); playerActions(e, dt); } else { e.vx = e.vy = 0; }
      } else if (!e.h && M.host) { if (can) botAI(e, dt); else { e.vx = e.vy = 0; } }
      else if (e.h || !M.host) { /* uzak: yumuşak izleme */ e.x += (e.tx - e.x) * Math.min(1, 14 * dt); e.y += (e.ty - e.y) * Math.min(1, 14 * dt); }
    });
    if (can) separate();
    if (M.host) { if (can) { ballCollide(); ballStep(dt); } hostPhase(); publish(); }
    else { if (M.ph === 'play') ballStep(dt); }
    publishPos();
    if (M.me) { var bar = $('bar'); bar.style.display = M.me.chg > 0.02 ? 'block' : 'none'; bar.firstChild.style.width = (M.me.chg * 100) + '%'; $('stam').firstChild.style.width = (M.me.stam * 100) + '%'; }
  }

  /* ---- çizim ---- */
  var SCALE = 1, PADX = 40;
  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight, s = Math.min(vw / (W + 2 * PADX), vh / (H + 2 * PADX + 20)), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = (W + 2 * PADX) * s + 'px'; cv.style.height = (H + 2 * PADX + 20) * s + 'px'; cv.width = Math.round((W + 2 * PADX) * s * dpr); cv.height = Math.round((H + 2 * PADX + 20) * s * dpr); SCALE = s * dpr;
  }
  window.addEventListener('resize', resize); resize();
  function draw() {
    var c = ctx; c.setTransform(SCALE, 0, 0, SCALE, 0, 0); c.fillStyle = '#0b2415'; c.fillRect(0, 0, W + 2 * PADX, H + 2 * PADX + 20);
    c.save(); c.translate(PADX, PADX + 20);
    for (var i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#1f7a3a' : '#238543'; c.fillRect(i * W / 10, 0, W / 10, H); }
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.strokeRect(0, 0, W, H);
    c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke(); c.beginPath(); c.arc(W / 2, H / 2, 70, 0, 6.283); c.stroke();
    c.strokeRect(0, H / 2 - 110, 120, 220); c.strokeRect(W - 120, H / 2 - 110, 120, 220);
    [[-46, 0], [W, 1]].forEach(function (g) { c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(g[0], GY0, 46, GY1 - GY0); c.strokeStyle = COL[g[1]]; c.lineWidth = 4; c.strokeRect(g[0], GY0, 46, GY1 - GY0); });
    c.fillStyle = '#fff'; [[0, GY0], [0, GY1], [W, GY0], [W, GY1]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 6, 0, 6.283); c.fill(); });
    if (M.on) {
      var b = M.ball;
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(b.x + 3, b.y + 5, BR, BR * 0.7, 0, 0, 6.283); c.fill();
      M.E.forEach(function (e) {
        c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(e.x + 3, e.y + 6, PR, PR * 0.75, 0, 0, 6.283); c.fill();
        c.fillStyle = COL[e.t]; c.beginPath(); c.arc(e.x, e.y, PR, 0, 6.283); c.fill();
        c.lineWidth = e === M.me ? 4 : 2; c.strokeStyle = e === M.me ? '#ffe45a' : '#fff'; c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.moveTo(e.x + Math.cos(e.f) * (PR + 7), e.y + Math.sin(e.f) * (PR + 7)); c.lineTo(e.x + Math.cos(e.f + 2.5) * (PR - 4), e.y + Math.sin(e.f + 2.5) * (PR - 4)); c.lineTo(e.x + Math.cos(e.f - 2.5) * (PR - 4), e.y + Math.sin(e.f - 2.5) * (PR - 4)); c.fill();
        c.font = 'bold 12px system-ui'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(e.name, e.x, e.y - PR - 7);
      });
      c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x, b.y, BR, 0, 6.283); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#222'; c.beginPath(); c.arc(b.x, b.y, 4, 0, 6.283); c.fill();
    }
    c.restore();
    if (M.on) {
      var tl = Math.max(0, M.dur - (snow() - M.t0) / 1000), mm = Math.floor(tl / 60), ss = Math.floor(tl % 60);
      c.textAlign = 'center'; c.font = 'bold 26px system-ui'; c.fillStyle = COL[0]; c.fillText(M.s[0], W / 2 + PADX - 50, 34); c.fillStyle = '#fff'; c.fillText('-', W / 2 + PADX, 34); c.fillStyle = COL[1]; c.fillText(M.s[1], W / 2 + PADX + 50, 34);
      c.font = 'bold 14px system-ui'; c.fillStyle = '#fff'; c.fillText(M.sd ? 'ALTIN GOL' : (mm + ':' + (ss < 10 ? '0' : '') + ss), W / 2 + PADX, 54);
      var msg = M.msgT > 0 ? M.msg : '';
      if (M.ph === 'cd') { var cdn = Math.ceil((M.t0 - snow()) / 1000); msg = cdn > 0 ? String(cdn) : ''; }
      if (msg) { c.font = 'bold 64px system-ui'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 6; c.strokeText(msg, W / 2 + PADX, H / 2 + PADX + 40); c.fillText(msg, W / 2 + PADX, H / 2 + PADX + 40); }
    }
  }

  /* ---- girdi ---- */
  var KM = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'shoot', KeyZ: 'shoot', ShiftLeft: 'sprint', ShiftRight: 'sprint' };
  window.addEventListener('keydown', function (e) { if (KM[e.code]) { keys[KM[e.code]] = 1; if (M.on) e.preventDefault(); } if ((e.code === 'KeyE' || e.code === 'KeyX') && M.on) passReq = 1; });
  window.addEventListener('keyup', function (e) { if (KM[e.code]) keys[KM[e.code]] = 0; });
  var jz = $('joyZone'), jb = $('joy'), jid = null, jc = null;
  jz.addEventListener('pointerdown', function (e) { if (jid !== null) return; jid = e.pointerId; jc = { x: e.clientX, y: e.clientY }; jb.style.left = (e.clientX - 65) + 'px'; jb.style.top = (e.clientY - 65) + 'px'; jb.style.bottom = 'auto'; jb.classList.add('act'); try { jz.setPointerCapture(jid); } catch (x) {} });
  jz.addEventListener('pointermove', function (e) { if (e.pointerId !== jid) return; var dx = e.clientX - jc.x, dy = e.clientY - jc.y, m = Math.hypot(dx, dy), R = 55; if (m > R) { dx = dx / m * R; dy = dy / m * R; } joy.x = dx / R; joy.y = dy / R; jb.firstChild.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; });
  function jend(e) { if (e.pointerId !== jid) return; jid = null; joy.x = joy.y = 0; jb.firstChild.style.transform = ''; jb.classList.remove('act'); jb.style.left = '34px'; jb.style.top = 'auto'; jb.style.bottom = ''; }
  jz.addEventListener('pointerup', jend); jz.addEventListener('pointercancel', jend);
  function hold(id, fn) { var el = $(id); el.addEventListener('pointerdown', function (e) { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) {} el.classList.add('on'); fn(1); }); function up() { el.classList.remove('on'); fn(0); } el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); }
  hold('bShoot', function (v) { tbtn.shoot = v; }); hold('bSprint', function (v) { tbtn.sprint = v; }); hold('bPass', function (v) { if (v) passReq = 1; });
  function showCtl(on) { ['hud', 'bShoot', 'bPass', 'bSprint'].forEach(function (i) { if (i === 'hud' || TOUCH) $(i).hidden = !on; }); $('joyZone').hidden = !(on && TOUCH); $('joy').hidden = !(on && TOUCH); document.body.classList.toggle('playing', on && TOUCH); }

  /* ---- menüler ---- */
  var modeSel = '1v1';
  function menu() {
    if (M.on) return; leaveRoom(); showCtl(false); ov.hidden = false;
    var h = '<h1>⚽ SOKAK FUTBOLU</h1><p class="sub">Üstten görünüşlü arcade futbol · 1v1 veya 2v2</p>';
    h += '<div class="sec">Tek kişilik (botlara karşı)</div><button class="mode" data-off="1v1"><b>1v1 — Botla</b><small>Sen ve bir bot kapışır</small></button><button class="mode" data-off="2v2"><b>2v2 — Takım</b><small>Sen + bot takım arkadaşın, karşıda 2 bot</small></button>';
    h += '<div class="sec">Arkadaşlarla (çevrimiçi)</div>';
    if (!db || !uid) h += '<p class="help">Çevrimiçi oynamak için ana sayfadan giriş yap.</p>';
    else for (var i = 1; i <= 4; i++) { var r = roomsAll[i] || {}, pc = r.pl ? Object.keys(r.pl).length : 0, run = r.st && r.st.no && !r.st.over; h += '<div class="room"><div><b>Oda ' + i + '</b><small>' + pc + ' oyuncu' + (run ? ' · maç sürüyor' : '') + (r.cfg && r.cfg.mode ? ' · ' + r.cfg.mode : '') + '</small></div><button class="btn pri" data-room="' + i + '">Katıl</button></div>'; }
    h += '<div class="help">Hareket: WASD/ok tuşları ya da sol ekranda parmakla sürükle. ŞUT: basılı tut, bırakınca vurur (uzun basış = sert şut). PAS: takım arkadaşına. KOŞ: kısa süreli hız. Önce 5 gol atan ya da 2 dk sonunda önde olan kazanır; beraberlikte altın gol.</div>';
    card.innerHTML = h;
    card.querySelectorAll('[data-off]').forEach(function (b) { b.onclick = function () { startOffline(b.getAttribute('data-off')); }; });
    card.querySelectorAll('[data-room]').forEach(function (b) { b.onclick = function () { joinRoom(+b.getAttribute('data-room')); }; });
    if (db && uid && !roomsRef) { roomsRef = db.ref('rp/sokak/rooms'); roomsRef.on('value', function (s) { roomsAll = s.val() || {}; if (!M.on && !roomN && !ov.hidden) menuRefresh(); }); }
  }
  function menuRefresh() { var sc = card.scrollTop; menu(); card.scrollTop = sc; }
  function startOffline(mode) {
    var n = mode === '2v2' ? 2 : 1; M = freshM(); M.net = false; M.host = true; M.n = n; M.dur = DUR;
    var as = {}; as['me'] = 0; buildEntities(n, as, { me: myName }); M.me = M.E[0]; M.me.uid = 'me';
    M.t0 = snow() + 3000; M.ph = 'cd'; M.on = true; ov.hidden = true; showCtl(true); setMsg('', 0);
  }
  function freshM() { return { on: false, net: false, n: 1, E: [], me: null, ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 }, s: [0, 0], ph: 'cd', t0: 0, rs: 0, gt: 0, w: -1, sd: false, msg: '', msgT: 0, host: true, dur: DUR, pubT: 0, posT: 0, over: false, t: 0 }; }

  function hostUid() { var k = Object.keys(room.pl || {}).sort(); return k[0] || null; }
  function leaveRoom() {
    if (!roomN) return; try { R.child('pl/' + uid).remove(); PS.child(uid).remove(); R.off(); PS.off(); LV.off(); } catch (e) {}
    roomN = 0; R = PS = LV = null; room = {}; live = null; posAll = {};
  }
  function joinRoom(n) {
    if (!db || !uid) return; leaveRoom(); roomN = n; R = db.ref('rp/sokak/rooms/' + n); PS = db.ref('rp/sokak/pos/' + n); LV = db.ref('rp/sokak/live/' + n); lastNo = -1; lastRs = -1;
    R.once('value').then(function (s) {
      var v = s.val() || {}, pl = v.pl || {}, c0 = 0, c1 = 0; Object.keys(pl).forEach(function (k) { if (pl[k].t === 0) c0++; else c1++; });
      var t = c0 <= c1 ? 0 : 1; if (v.st && v.st.no) lastNo = v.st.no; /* devam eden maça girme */
      try { R.child('pl/' + uid).onDisconnect().remove(); PS.child(uid).onDisconnect().remove(); } catch (e) {}
      R.child('pl/' + uid).set({ n: myName, t: t, r: false });
      R.on('value', onRoom); PS.on('value', function (s2) { posAll = s2.val() || {}; applyPos(); }); LV.on('value', onLive);
    });
  }
  function onRoom(s) {
    room = s.val() || {}; var st = room.st || {};
    if (st.no && st.no !== lastNo && room.as && room.as[uid] != null && !st.over) { lastNo = st.no; startOnlineMatch(st); return; }
    if (!M.on) lobby();
  }
  function lobby() {
    if (!roomN || M.on) return; showCtl(false); ov.hidden = false;
    var pl = room.pl || {}, ids = Object.keys(pl).sort(), host = hostUid(), amHost = host === uid, mode = (room.cfg && room.cfg.mode) || '1v1', cap = mode === '2v2' ? 2 : 1;
    var tm = [[], []]; ids.forEach(function (k) { tm[pl[k].t === 1 ? 1 : 0].push(k); });
    var bad = tm[0].length > cap || tm[1].length > cap, allReady = ids.every(function (k) { return k === host || pl[k].r; });
    var h = '<h1>Oda ' + roomN + '</h1><p class="sub">' + (amHost ? 'Sen odanın sahibisin (başlatan)' : 'Sahip: ' + esc((pl[host] || {}).n)) + '</p><div class="teams">';
    [0, 1].forEach(function (t) {
      h += '<div class="team t' + t + '"><h4>' + (t ? 'MAVİ' : 'KIRMIZI') + ' <small>(' + tm[t].length + '/' + cap + ')</small></h4>';
      tm[t].forEach(function (k) { h += '<div class="pr">' + esc(pl[k].n) + (k === host ? ' 👑' : '') + '<span class="' + (k === host || pl[k].r ? 'ok' : 'wt') + '">' + (k === host ? '' : pl[k].r ? '✔ hazır' : 'bekliyor') + '</span></div>'; });
      for (var i = tm[t].length; i < cap; i++) h += '<div class="pr emp">boş → bot</div>';
      h += '<button class="btn" data-team="' + t + '" style="margin-top:6px;width:100%;padding:8px">Bu takıma geç</button></div>';
    });
    h += '</div><div class="lopt"><span>Mod:</span>' + (amHost ? '<select id="mSel"><option value="1v1"' + (mode === '1v1' ? ' selected' : '') + '>1v1</option><option value="2v2"' + (mode === '2v2' ? ' selected' : '') + '>2v2</option></select>' : '<b>' + mode + '</b>') + '</div>';
    h += '<div style="display:flex;gap:8px;margin-top:12px">' + (amHost ? '<button class="btn pri" id="lStart" style="flex:1"' + (bad || !allReady ? ' disabled' : '') + '>Maçı başlat</button>' : '<button class="btn pri" id="lReady" style="flex:1">' + (pl[uid] && pl[uid].r ? 'Hazır değilim' : 'Hazırım') + '</button>') + '<button class="btn" id="lLeave">Çık</button></div>';
    h += '<div class="help">' + (bad ? 'Bir takımda çok fazla oyuncu var — takım değiştirin ya da modu 2v2 yapın.' : (amHost && !allReady ? 'Herkes "Hazırım"a basınca başlatabilirsin.' : 'Boş yerler botlarla dolar.')) + '</div>';
    card.innerHTML = h;
    card.querySelectorAll('[data-team]').forEach(function (b) { b.onclick = function () { R.child('pl/' + uid + '/t').set(+b.getAttribute('data-team')); R.child('pl/' + uid + '/r').set(false); }; });
    var ms = $('mSel'); if (ms) ms.onchange = function () { R.child('cfg/mode').set(ms.value); };
    var ls = $('lStart'); if (ls) ls.onclick = function () { startHost(tm, cap); };
    var lr = $('lReady'); if (lr) lr.onclick = function () { R.child('pl/' + uid + '/r').set(!(pl[uid] && pl[uid].r)); };
    $('lLeave').onclick = function () { leaveRoom(); menu(); };
  }
  function startHost(tm, cap) {
    var as = {}; [0, 1].forEach(function (t) { tm[t].forEach(function (k, i) { as[k] = t * cap + i; }); });
    var names = {}; Object.keys(room.pl).forEach(function (k) { names[k] = room.pl[k].n; });
    var no = ((room.st && room.st.no) || 0) + 1;
    LV.set({ b: [W / 2, H / 2, 0, 0], bt: [], s: [0, 0], ph: 'cd', rs: 0, gt: 0, w: -1, sd: false, ts: snow() });
    R.child('as').set(as); R.child('names').set(names); R.child('st').set({ no: no, t0: snow() + 3500, over: false, n: cap });
    Object.keys(room.pl).forEach(function (k) { R.child('pl/' + k + '/r').set(false); });
  }
  function startOnlineMatch(st) {
    M = freshM(); M.net = true; M.host = hostUid() === uid; M.dur = DUR; M.t0 = st.t0; var n = st.n || 1;
    buildEntities(n, room.as, room.names || {}); M.on = true; M.ph = 'cd'; lastRs = -1; ov.hidden = true; showCtl(true); live = null; setMsg('', 0);
    if (M.me) { PS.child(uid).set({ x: M.me.x, y: M.me.y, vx: 0, vy: 0, f: M.me.f, ts: snow() }); }
  }
  function applyPos() {
    if (!M.on || !M.net) return;
    M.E.forEach(function (e) {
      if (!e.h || e === M.me || !e.uid) return; var p = posAll[e.uid]; if (!p) return;
      e.tx = p.x; e.ty = p.y; e.vx = p.vx || 0; e.vy = p.vy || 0; e.f = p.f || 0;
      if (M.host && p.k && p.k.q > e.lastK) { e.lastK = p.k.q; applyKick(e, p.k.dx, p.k.dy, Math.min(1000, p.k.p)); }
    });
  }
  function onLive(s) {
    live = s.val(); if (!live || !M.on || !M.net) return; var wasHost = M.host; M.host = hostUid() === uid;
    if (M.host) { if (!wasHost) { /* devralma: son bilinen skor */ M.s = live.s || M.s; } return; }
    var b = M.ball; if (live.b) { b.x = live.b[0]; b.y = live.b[1]; b.vx = live.b[2]; b.vy = live.b[3]; }
    (live.bt || []).forEach(function (a) { var e = M.E[a[5]]; if (e && !e.h) { e.tx = a[0]; e.ty = a[1]; e.vx = a[2]; e.vy = a[3]; e.f = a[4]; } });
    if (live.s && (live.s[0] !== M.s[0] || live.s[1] !== M.s[1])) { M.s = live.s.slice(); setMsg('GOOOL!', 2); snd(660, 0.5, 'sawtooth', 0.09); }
    M.sd = !!live.sd; if (live.ph === 'play' && M.ph !== 'play') setMsg('BAŞLA!', 0.8);
    M.ph = live.ph; if (live.rs !== undefined && live.rs !== lastRs) { if (lastRs !== -1) M.E.forEach(spawn); lastRs = live.rs; }
    if (live.ph === 'end' && !M.over) { M.over = true; M.w = live.w; setTimeout(showResults, 1800); }
  }
  function showResults() {
    var iw = M.me && M.me.t === M.w; M.on = false; showCtl(false); ov.hidden = false;
    var h = '<h1>' + (M.me ? (iw ? '🏆 KAZANDIN!' : 'Kaybettin') : 'Maç bitti') + '</h1><p class="sub">' + (M.w === 0 ? 'Kırmızı' : 'Mavi') + ' takım kazandı</p><div style="text-align:center;font-size:44px;font-weight:900"><span style="color:' + COL[0] + '">' + M.s[0] + '</span> - <span style="color:' + COL[1] + '">' + M.s[1] + '</span></div>';
    h += '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn pri" id="again" style="flex:1">' + (M.net ? 'Lobiye dön' : 'Tekrar oyna') + '</button><button class="btn" id="home">Menü</button></div>';
    card.innerHTML = h; var off = !M.net, n = M.n;
    $('again').onclick = function () { if (off) startOffline(n === 2 ? '2v2' : '1v1'); else { M.over = false; if (roomN) { R.child('pl/' + uid + '/r').set(false); lobby(); } } };
    $('home').onclick = function () { M.on = false; leaveRoom(); menu(); };
  }

  window.__S = { M: function () { return M; }, keys: keys, join: joinRoom, off: startOffline, room: function () { return room; }, kick: function (e, dx, dy, p) { doKick(e, dx, dy, p); }, passReq: function () { passReq = 1; } };
  menu(); requestAnimationFrame(frame);
})();
