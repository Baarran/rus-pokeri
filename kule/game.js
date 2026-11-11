/* Buz Kule — dikey zıplama oyunu. Tek kişilik modlar + herkesin aynı anda tırmandığı çok oyunculu modlar. */
(function () {
  'use strict';
  var W = 360, H = 640, GAP = 80, WALL = 16, GRAV = 1700, MAXV = 340;
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), ov = document.getElementById('ov'), card = document.getElementById('card'), pad = document.getElementById('pad');
  var TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var PAL = ['#ff5a7a', '#5ad2ff', '#ffd25a', '#8dff5a', '#c05aff', '#ff9a5a', '#ffffff', '#5affc0'];

  /* ---- modlar ---- */
  var MODES = {
    classic: { n: 'Klasik', ic: '❄', d: 'Normal kule · haftalık skor tablosu', acc: 1500, fric: 1100, scroll: 1, wmul: 1, lb: true },
    slippery: { n: 'Kaygan Buz', ic: '🧊', d: 'Zemin çok kaygan — durmak ve hedeflemek zor', acc: 900, fric: 200, scroll: 1, wmul: 1 },
    storm: { n: 'Fırtına', ic: '🌪', d: 'Ekran çok hızlı yükselir, platformlar dar', acc: 1500, fric: 1100, scroll: 1.7, wmul: 0.72 },
    race: { n: 'Kat Yarışı', ic: '🏁', d: 'Herkes aynı kuleye aynı anda başlar · ilk 50. kata çıkan kazanır', acc: 1500, fric: 1100, scroll: 1, wmul: 1, online: true, target: 50 },
    survive: { n: 'Son Kalan', ic: '💀', d: 'Ekran hızla yükselir · düşen elenir, son ayakta kalan kazanır', acc: 1500, fric: 1100, scroll: 1.25, wmul: 0.9, online: true, ramp: true },
    timed: { n: 'Süre Yarışı', ic: '⏱', d: '90 saniyede en yüksek puanı yapan kazanır', acc: 1500, fric: 1100, scroll: 1, wmul: 1, online: true, dur: 90000 }
  };
  var ONLINE_MODES = ['race', 'survive', 'timed'];

  /* ---- Firebase ---- */
  var CFG = { apiKey: 'AIzaSyBsP1VNPJpt1Y6MN0FwDCmvuHeZxaDoTGU', authDomain: 'ruspokeri-de28e.firebaseapp.com', databaseURL: 'https://ruspokeri-de28e-default-rtdb.europe-west1.firebasedatabase.app', projectId: 'ruspokeri-de28e' };
  var db = null, uid = null, myName = 'Oyuncu', best = { floors: 0, score: 0 }, board = [], tOff = 0;
  function snow() { return Date.now() + tOff; }
  try {
    if (window.firebase) {
      if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(CFG);
      db = firebase.database();
      try { db.ref('.info/serverTimeOffset').on('value', function (s) { tOff = s.val() || 0; }); } catch (e) {}
      firebase.auth().onAuthStateChanged(function (u) {
        if (!u) { uid = null; if (!running && !room) showMenu(); return; }
        uid = u.uid;
        try { var pr = db.ref('rp/online/' + uid); pr.onDisconnect().remove(); pr.set('kule'); } catch (e) {}
        db.ref('rp/users/' + uid + '/name').once('value').then(function (s) { myName = s.val() || 'Oyuncu'; loadBoard(); }, function () { loadBoard(); });
      });
    }
  } catch (e) { db = null; }
  var DAYMS = 86400000, TRT = 3 * 3600000;
  function weekId() {
    var d = new Date(Date.now() + TRT), dow = (d.getUTCDay() + 6) % 7, ws = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAYMS;
    var x = new Date(ws); function p2(n) { return (n < 10 ? '0' : '') + n; }
    return x.getUTCFullYear() + '-' + p2(x.getUTCMonth() + 1) + '-' + p2(x.getUTCDate());
  }
  function loadBoard() {
    if (!db) return;
    db.ref('rp/kule/weeks/' + weekId()).once('value').then(function (s) {
      var v = s.val() || {}; board = Object.keys(v).map(function (k) { return { id: k, name: v[k].name, floors: v[k].floors || 0, score: v[k].score || 0, at: v[k].at || 0 }; }).sort(function (a, b) { return b.score - a.score || a.at - b.at; });
      var m = v[uid]; if (m) best = { floors: m.floors || 0, score: m.score || 0 };
      if (!running && !room) showMenu();
    }, function () {});
  }
  function saveBest() {
    if (!db || !uid || !MODES[G.mode].lb) return;
    if (G.score > best.score) {
      best = { floors: Math.max(best.floors, G.floors), score: G.score };
      db.ref('rp/kule/weeks/' + weekId() + '/' + uid).set({ name: myName, floors: best.floors, score: best.score, at: Date.now() }).then(loadBoard, function () {});
    }
  }

  /* ---- kule (tohumlu: herkeste aynı) ---- */
  function hash(a, b) { var h = (a ^ Math.imul(b + 1, 2654435761)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function plat(i) {
    var M = MODES[G.mode];
    if (i === 0) return { i: 0, x: WALL, w: W - 2 * WALL, y: 0 };
    var big = i % 25 === 0, w = (Math.max(56, 130 - i * 0.6) + hash(G.seed, i * 3) * 40) * M.wmul; if (!big && w < 44) w = 44;
    return { i: i, x: big ? WALL : WALL + hash(G.seed, i * 3 + 1) * (W - 2 * WALL - w), w: big ? W - 2 * WALL : w, y: -i * GAP, big: big };
  }

  /* ---- oyun durumu ---- */
  var G = null, running = false, keys = { l: 0, r: 0, j: 0 }, last = 0, acc = 0;
  var room = 0, base = null, pl = {}, st = null, inLobby = false, ready = false, cfg = { mode: 'race' }, lastNo = -1, shown = false, grid = {}, sendT = 0;
  function reset(mode, seed, t0) {
    G = { mode: mode, seed: seed, online: !!MODES[mode].online, t0: t0 || 0, p: { x: W / 2, y: -14, vx: 0, vy: 0, ground: true, face: 1 }, plats: [], top: -1, cam: -(H - 120), floors: 0, score: 0, comboF: 0, comboN: 0, comboT: 0, lastFloor: 0, started: false, t: 0, fx: [], dead: false, over: false, buf: 0, coy: 0, scroll: 0, fin: 0, deadAt: 0 };
    for (var i = 0; i < 14; i++) addPlat();
  }
  function addPlat() { G.top++; G.plats.push(plat(G.top)); }
  function say(txt, x, y, col) { G.fx.push({ t: txt, x: x, y: y, a: 1.2, c: col || '#fff' }); }

  function step(dt) {
    var p = G.p, M = MODES[G.mode]; G.t += dt;
    if (G.online && snow() < G.t0) { p.vx = 0; return; }       // geri sayım
    if (G.dead || G.fin || G.over) { if (G.online) specCam(dt); return; }
    var el = G.online ? (snow() - G.t0) / 1000 : G.t;
    var dir = keys.r - keys.l;
    if (dir) { p.vx += dir * M.acc * dt; p.face = dir; }
    else { var f = M.fric * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
    if (p.vx > MAXV) p.vx = MAXV; if (p.vx < -MAXV) p.vx = -MAXV;
    p.x += p.vx * dt;
    if (p.x < WALL + 10) { p.x = WALL + 10; p.vx = Math.abs(p.vx) * 0.9; }
    if (p.x > W - WALL - 10) { p.x = W - WALL - 10; p.vx = -Math.abs(p.vx) * 0.9; }
    if (keys.j) G.buf = 0.12; else G.buf = Math.max(0, G.buf - dt);
    G.coy = p.ground ? 0.09 : Math.max(0, G.coy - dt);
    if (G.buf > 0 && G.coy > 0) { p.vy = -(560 + Math.abs(p.vx) * 1.0); p.ground = false; G.coy = 0; G.buf = 0; G.started = true; for (var k = 0; k < 6; k++) G.fx.push({ d: 1, x: p.x, y: p.y, vx: (Math.random() - .5) * 120, vy: -Math.random() * 60, a: .5 }); }
    var py = p.y, was = p.ground; p.vy += GRAV * dt; p.y += p.vy * dt; p.ground = false;
    if (p.vy >= 0) {
      for (var i = 0; i < G.plats.length; i++) {
        var q = G.plats[i];
        if (py <= q.y + 1 && p.y >= q.y && p.x + 8 > q.x && p.x - 8 < q.x + q.w) { p.y = q.y; p.vy = 0; p.ground = true; if (!was) land(q); break; }
      }
    }
    if (G.comboF > 0) { G.comboT -= dt; if (G.comboT <= 0) endCombo(); }
    // kamera / ekran kayması
    if (M.ramp) { if (el > 2) { G.scroll = Math.min(250, (34 + el * 2.4) * M.scroll); G.cam -= G.scroll * dt; } }
    else if (G.started) { G.scroll = Math.min(190 * M.scroll, (28 + G.floors * 0.55 + el * 0.6) * M.scroll); if (G.floors >= 3) G.cam -= G.scroll * dt; }
    var want = p.y - H * 0.45; if (want < G.cam) G.cam = want;
    fxStep(dt);
    if (M.target && G.floors >= M.target && !G.fin) { G.fin = Math.max(1, Math.round(snow() - G.t0)); p.vx = 0; say('BİTİŞ!', p.x, p.y - 40, '#ffd86b'); }
    if (p.y > G.cam + H + 40) die();
  }
  function fxStep(dt) {
    while (G.top * GAP < -G.cam + H + 400) addPlat();
    G.plats = G.plats.filter(function (q) { return q.y < G.cam + H + 120; });
    for (var j = G.fx.length - 1; j >= 0; j--) { var e = G.fx[j]; e.a -= dt; if (e.d) { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 200 * dt; } else e.y -= 30 * dt; if (e.a <= 0) G.fx.splice(j, 1); }
  }
  function specCam(dt) {      // elendim/bitirdim: en yüksek rakibi izle
    var tgt = null; Object.keys(grid).forEach(function (u) { var p = pl[u]; if (u === uid || !p || snow() - p.a > 8000 || p.dd) return; if (!tgt || p.y < tgt.y) tgt = p; });
    if (tgt) { var want = tgt.y - H * 0.5; G.cam += (want - G.cam) * Math.min(1, 3 * dt); }
    fxStep(dt);
  }
  function land(q) {
    var gain = q.i - G.lastFloor;
    if (q.i > G.floors) { G.score += (q.i - G.floors) * 10; G.floors = q.i; }
    if (gain >= 2) { G.comboF += gain; G.comboN++; G.comboT = 1.4; say('+' + gain + ' kat', G.p.x, G.p.y - 30, '#9fe3ff'); }
    else if (G.comboF > 0) endCombo();
    G.lastFloor = q.i;
    for (var k = 0; k < 5; k++) G.fx.push({ d: 1, x: G.p.x, y: G.p.y, vx: (Math.random() - .5) * 140, vy: -Math.random() * 80, a: .4 });
  }
  function endCombo() { if (G.comboF >= 4) { var b = G.comboF * G.comboN * 10; G.score += b; say('KOMBO ×' + G.comboN + '  +' + b, G.p.x, G.p.y - 50, '#ffd86b'); } G.comboF = 0; G.comboN = 0; G.comboT = 0; }
  function die() {
    if (G.dead) return; endCombo(); G.dead = true;
    if (G.online) { G.deadAt = Math.max(1, Math.round(snow() - G.t0)); say('Elendin', G.p.x, G.cam + H - 80, '#ff8080'); publish(true); return; }
    running = false; saveBest(); showOver();
  }

  /* ---- çizim ---- */
  function mix(a, b, t) { return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }).join(',') + ')'; }
  function snowman(x, y, face, alpha, tint, sq, rot) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(1 / (sq || 1), sq || 1);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -9, 10, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -25, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = tint || '#d63a3a'; ctx.fillRect(-9, -20, 18, 3.5); ctx.fillRect(face > 0 ? -9 : 5, -20, 4, 9);
    ctx.fillStyle = '#233'; ctx.fillRect(-5, -32, 10, 4); ctx.fillRect(-7, -29, 14, 2);
    ctx.fillStyle = '#111'; ctx.fillRect(face * 2 - 2.5, -27, 2, 2); ctx.fillRect(face * 2 + 2, -27, 2, 2);
    ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.moveTo(face * 4, -24); ctx.lineTo(face * 10, -23); ctx.lineTo(face * 4, -22); ctx.fill();
    ctx.restore();
  }
  function draw() {
    var cam = G.cam, hgt = Math.min(1, G.floors / 200), M = MODES[G.mode];
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, mix([40, 70, 120], [12, 8, 40], hgt)); g.addColorStop(1, mix([120, 190, 235], [40, 60, 130], hgt));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; for (var s = 0; s < 40; s++) { var sx = (s * 97) % W, sy = ((s * 53 - cam * 0.2) % H + H) % H; ctx.fillRect(sx, sy, 2, 2); }
    var wg = ctx.createLinearGradient(0, 0, WALL, 0); wg.addColorStop(0, '#9fd8f5'); wg.addColorStop(1, '#5aa6cf');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, WALL, H); ctx.fillStyle = '#5aa6cf'; ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; for (var y = -((cam % 40) + 40); y < H; y += 40) { ctx.fillRect(0, y, WALL, 3); ctx.fillRect(W - WALL, y, WALL, 3); }
    G.plats.forEach(function (q) {
      var y = q.y - cam; if (y < -20 || y > H + 20) return;
      ctx.fillStyle = q.big ? '#ffd86b' : '#cfefff'; ctx.fillRect(q.x, y, q.w, 14);
      ctx.fillStyle = q.big ? '#c99a2a' : '#7fbbe0'; ctx.fillRect(q.x, y + 9, q.w, 5);
      ctx.fillStyle = '#fff'; ctx.fillRect(q.x, y, q.w, 3);
      if (q.i % 10 === 0 && q.i > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left'; ctx.fillText(q.i, WALL + 4, y - 4); }
      if (M.target && q.i === M.target) { ctx.fillStyle = '#fff'; ctx.fillRect(q.x, y - 14, q.w, 4); ctx.fillStyle = '#111'; for (var cx = q.x; cx < q.x + q.w; cx += 12) ctx.fillRect(cx + ((cx / 12) % 2 ? 6 : 0), y - 14, 6, 4); }
    });
    // rakipler (hayalet)
    if (G.online) Object.keys(grid).forEach(function (u) {
      if (u === uid) return; var p = pl[u]; if (!p || snow() - p.a > 8000) return; var gx = G.rx && G.rx[u] ? G.rx[u].x : p.x, gy = G.rx && G.rx[u] ? G.rx[u].y : p.y, yy = gy - cam; if (yy < -60 || yy > H + 40) return;
      snowman(gx, yy, p.vx >= 0 ? 1 : -1, p.dd ? 0.25 : 0.7, PAL[grid[u] % 8]);
      ctx.globalAlpha = p.dd ? .4 : .95; ctx.fillStyle = PAL[grid[u] % 8]; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(p.n || '').slice(0, 10), gx, yy - 42); ctx.globalAlpha = 1;
    });
    var p = G.p, sq = p.ground ? 1 : 1 + Math.min(0.2, Math.abs(p.vy) / 4000);
    if (!G.dead) snowman(p.x, p.y - cam, p.face, 1, G.online && uid && grid[uid] != null ? PAL[grid[uid] % 8] : null, sq, p.ground ? 0 : p.vx / 2200);
    G.fx.forEach(function (e) {
      if (e.d) { ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, e.a * 2) + ')'; ctx.fillRect(e.x - 1, e.y - cam - 1, 3, 3); }
      else { ctx.globalAlpha = Math.min(1, e.a); ctx.fillStyle = e.c; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.t, Math.max(60, Math.min(W - 60, e.x)), e.y - cam); ctx.globalAlpha = 1; }
    });
    hudDraw(M);
  }
  function hudDraw(M) {
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '900 22px system-ui'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText(G.score, 100, 30); ctx.font = '700 13px system-ui'; ctx.fillStyle = '#bfe6ff'; ctx.fillText('Kat ' + G.floors + (M.target ? ' / ' + M.target : ''), 100, 48);
    if (G.comboF > 0) { ctx.fillStyle = '#ffd86b'; ctx.textAlign = 'right'; ctx.font = '900 18px system-ui'; ctx.fillText('KOMBO ' + G.comboF + ' kat', W - 24, 30); ctx.fillStyle = 'rgba(255,216,107,.8)'; ctx.fillRect(W - 24 - 90 * Math.max(0, G.comboT / 1.4), 36, 90 * Math.max(0, G.comboT / 1.4), 4); }
    if (G.online) {
      var now = snow(), el = now - G.t0, txt = '';
      if (el < 0) txt = String(Math.ceil(-el / 1000)); else if (M.dur) txt = Math.max(0, Math.ceil((M.dur - el) / 1000)) + ' sn'; else if (M.ramp) txt = aliveCount() + ' kişi hayatta'; else txt = Math.floor(el / 60000) + ':' + ('0' + Math.floor(el / 1000) % 60).slice(-2);
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = el < 0 ? '900 90px system-ui' : '800 16px system-ui'; ctx.fillText(txt, W / 2, el < 0 ? 280 : 70);
      if (el >= 0 && el < 1000) { ctx.font = '900 56px system-ui'; ctx.fillStyle = '#ffd86b'; ctx.fillText('BAŞLA!', W / 2, 260); }
      // ilerleme çubuğu
      var maxF = M.target || Math.max(30, G.floors + 10); Object.keys(grid).forEach(function (u) { var p = pl[u]; if (p && !M.target) maxF = Math.max(maxF, (p.fl || 0) + 5); });
      var bx = W - 7, top = 80, bh = 400; ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(bx - 2, top, 4, bh);
      Object.keys(grid).forEach(function (u) { var fl = u === uid ? G.floors : (pl[u] && snow() - pl[u].a < 8000 ? pl[u].fl || 0 : null); if (fl == null) return; var yy = top + bh - Math.min(1, fl / maxF) * bh; ctx.fillStyle = PAL[grid[u] % 8]; ctx.globalAlpha = (u !== uid && pl[u] && pl[u].dd) ? .35 : 1; ctx.beginPath(); ctx.arc(bx, yy, u === uid ? 6 : 4, 0, 7); ctx.fill(); if (u === uid) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); } ctx.globalAlpha = 1; });
      if (G.dead) { ctx.fillStyle = '#ff9a9a'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Elendin — izliyorsun', W / 2, H - 40); }
      else if (G.fin) { ctx.fillStyle = '#ffd86b'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Bitirdin! Diğerleri bekleniyor', W / 2, H - 40); }
    }
    ctx.shadowBlur = 0;
  }
  function aliveCount() { var n = G.dead ? 0 : 1; Object.keys(grid).forEach(function (u) { var p = pl[u]; if (u !== uid && p && snow() - p.a < 8000 && !p.dd) n++; }); return n; }

  /* ---- döngü ---- */
  function loop(ts) {
    requestAnimationFrame(loop); if (!G) return;
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (running) {
      acc += dt; while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; if (!running) break; }
      if (G.online) { onlineTick(dt); }
    }
    draw();
  }
  function fit() {
    var s = Math.min(innerWidth / W, innerHeight / H), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr); cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  }
  addEventListener('resize', fit); fit();
  var KM = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'j', w: 'j', W: 'j', ' ': 'j' };
  addEventListener('keydown', function (e) { var k = KM[e.key]; if (k) { keys[k] = 1; e.preventDefault(); } });
  addEventListener('keyup', function (e) { var k = KM[e.key]; if (k) keys[k] = 0; });
  [['bL', 'l'], ['bR', 'r'], ['bJ', 'j']].forEach(function (a) {
    var b = $(a[0]);
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); keys[a[1]] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) {} });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { keys[a[1]] = 0; b.classList.remove('on'); }); });
  });

  /* ---- çok oyunculu ---- */
  function lobbyHumans() { var now = snow(); return Object.keys(pl).filter(function (u) { var p = pl[u]; return now - p.a < 6000 && p.l === 1; }).sort(); }
  function lobbyHost() { return lobbyHumans()[0] || null; }
  function raceBusy() {
    if (!st || !st.grid || snow() < st.t0 || snow() - st.t0 > 300000) return false;
    return Object.keys(st.grid).some(function (u) { var p = pl[u]; return p && snow() - p.a < 6000 && !p.dd && !p.fin && p.l !== 1; });
  }
  function canStart() {
    var hs = lobbyHumans(), host = lobbyHost(); if (host !== uid) return 'Başlatma yetkisi oda sahibinde';
    if (raceBusy()) return 'Önceki oyun sürüyor';
    if (hs.length < 2) return 'En az 2 oyuncu gerekir';
    var wait = hs.filter(function (u) { return u !== host && !pl[u].r; }); if (wait.length) return wait.length + ' kişi hazır değil';
    return '';
  }
  function joinRoom(n) {
    if (!db || !uid) return; room = n; base = db.ref('rp/kulemp/' + n); pl = {}; st = null; lastNo = -1; inLobby = true; ready = false; cfg = { mode: 'race' }; shown = true; grid = {}; running = false; G = null;
    var me = base.child('pl/' + uid); me.onDisconnect().remove(); me.set({ n: myName, x: 0, y: 0, fl: 0, sc: 0, dd: 0, fin: 0, l: 1, r: 0, a: snow() });
    base.child('pl').on('value', function (s) { pl = s.val() || {}; });
    base.child('cfg').on('value', function (s) { var v = s.val(); if (v && MODES[v.mode]) cfg = v; renderLobby(true); });
    base.child('st').on('value', function (s) { st = s.val(); onSt(); });
    sendT = 0; running = true; last = performance.now(); reset('classic', 1, 0); G.over = true; showLobby();
  }
  function leaveRoom() {
    if (!base) return; base.child('pl').off(); base.child('cfg').off(); base.child('st').off(); base.child('pl/' + uid).remove().catch(function () {});
    try { db.ref('rp/online/' + uid).set('kule'); } catch (e) {}
    base = null; room = 0; running = false; G = null; ov.hidden = false; pad.hidden = true; $('back').hidden = false; $('leave') && ($('leave').hidden = true); showMenu();
  }
  function onSt() {
    if (!st || st.no === lastNo) return; lastNo = st.no; grid = st.grid || {};
    if (snow() - st.t0 > 20000) return;                                 // eski oyun, katılma
    if (grid[uid] != null) { reset(st.mode, st.seed, st.t0); inLobby = false; ready = false; shown = false; running = true; acc = 0; last = performance.now(); ov.hidden = true; pad.hidden = !TOUCH; $('back').hidden = true; keys.l = keys.r = keys.j = 0; G.rx = {}; }
  }
  function startOnline() {
    if (canStart()) return; var hs = lobbyHumans().slice(0, 8), g = {}; hs.forEach(function (u, i) { g[u] = i; });
    base.child('st').set({ no: ((st && st.no) || 0) + 1, t0: snow() + 4500, seed: (Math.random() * 1e9) | 0, mode: cfg.mode, grid: g });
  }
  function publish(force) {
    if (!base) return; var p = G && G.p, o = { n: myName, x: p ? +p.x.toFixed(1) : 0, y: p ? +p.y.toFixed(1) : 0, vx: p ? Math.round(p.vx) : 0, fl: G ? G.floors : 0, sc: G ? G.score : 0, dd: G ? G.deadAt : 0, fin: G ? G.fin : 0, l: inLobby ? 1 : 0, r: ready ? 1 : 0, a: snow() };
    base.child('pl/' + uid).set(o).catch(function () {});
  }
  function onlineTick(dt) {
    sendT += dt; if (sendT > 0.12) { sendT = 0; publish(); }
    if (!G.rx) G.rx = {}; Object.keys(grid).forEach(function (u) { var p = pl[u]; if (u === uid || !p) return; var r = G.rx[u] || (G.rx[u] = { x: p.x, y: p.y }), k = Math.min(1, 14 * dt); r.x += (p.x - r.x) * k; r.y += (p.y - r.y) * k; });
    if (!shown && !inLobby) checkEnd();
  }
  function entries() {
    var now = snow(), out = [];
    Object.keys(grid).forEach(function (u) { var p = u === uid ? { n: myName, fl: G.floors, sc: G.score, dd: G.deadAt, fin: G.fin, a: now } : pl[u]; if (!p) return; var gone = now - p.a > 8000; out.push({ id: u, n: p.n, fl: p.fl || 0, sc: p.sc || 0, dd: p.dd || (gone ? 1 : 0), fin: p.fin || 0, gone: gone }); });
    return out;
  }
  function checkEnd() {
    var M = MODES[G.mode], now = snow(), el = now - G.t0; if (el < 3000) return; var es = entries(), done = false, alive = es.filter(function (e) { return !e.dd && !e.fin; });
    if (M.target) { var fins = es.filter(function (e) { return e.fin; }).map(function (e) { return e.fin; }); done = alive.length === 0 || (fins.length > 0 && el - Math.min.apply(null, fins) > 15000); }
    else if (M.ramp) done = alive.length <= (es.length > 1 ? 1 : 0);
    else if (M.dur) done = el >= M.dur || alive.length === 0;
    if (done) showResults(es, M);
  }
  function rank(es, M) {
    var a = es.slice();
    if (M.target) a.sort(function (x, y) { return (x.fin ? 0 : 1) - (y.fin ? 0 : 1) || (x.fin && y.fin ? x.fin - y.fin : y.fl - x.fl); });
    else if (M.ramp) a.sort(function (x, y) { return (x.dd ? 1 : 0) - (y.dd ? 1 : 0) || (x.dd && y.dd ? y.dd - x.dd : y.fl - x.fl); });
    else a.sort(function (x, y) { return y.sc - x.sc; });
    return a;
  }
  function fmtT(ms) { var s = ms / 1000, m = Math.floor(s / 60); return m + ':' + ('0' + (s - m * 60).toFixed(1)).slice(-4); }
  function showResults(es, M) {
    shown = true; G.over = true; keys.l = keys.r = keys.j = 0; var rk = rank(es, M);
    var h = '<h1>' + M.ic + ' ' + M.n + '</h1><div class="sub">Sonuçlar</div><div id="lb">' + rk.map(function (e, i) {
      var v = M.target ? (e.fin ? fmtT(e.fin) : e.fl + '. kat') : M.ramp ? (e.dd ? fmtT(e.dd) + ' · ' + e.fl + ' kat' : 'hayatta · ' + e.fl + ' kat') : e.sc + ' puan';
      return '<div class="' + (e.id === uid ? 'me' : '') + '"><span>' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.') + ' ' + esc(e.n) + '</span><b>' + v + '</b></div>'; }).join('') + '</div>' +
      '<button class="btn pri" id="again" type="button">↩ Odaya dön</button> <button class="btn" id="out" type="button">Çık</button>';
    card.innerHTML = h; ov.hidden = false; pad.hidden = true; $('back').hidden = true;
    $('again').onclick = function () { inLobby = true; ready = false; G.over = true; ov.hidden = false; showLobby(); publish(); }; $('out').onclick = leaveRoom;
  }
  var lobSig = '';
  function renderLobby(force) { if (!base || !inLobby || !ov || ov.hidden) return; showLobby(force); }
  function showLobby(force) {
    if (!base) return; ov.hidden = false; pad.hidden = true; $('back').hidden = true;
    var hs = lobbyHumans(), host = lobbyHost(), why = canStart(), isHost = host === uid, M = MODES[cfg.mode];
    var sig = JSON.stringify([hs.map(function (u) { return [u, pl[u].n, pl[u].r]; }), host, cfg, why, ready]); if (sig === lobSig && !force) return; lobSig = sig;
    var rows = ''; for (var i = 0; i < 8; i++) { var u = hs[i];
      if (u) rows += '<div class="lr"><i style="background:' + PAL[i] + '"></i><span>' + esc(pl[u].n) + (u === uid ? ' <small>(sen)</small>' : '') + (u === host ? ' 👑' : '') + '</span><b class="' + (u === host || pl[u].r ? 'ok' : 'wt') + '">' + (u === host ? 'Oda sahibi' : pl[u].r ? '✓ Hazır' : 'Bekliyor') + '</b></div>';
      else if (i < 4) rows += '<div class="lr emp"><i></i><span>Boş koltuk</span><b></b></div>'; }
    var modes = ONLINE_MODES.map(function (k) { var m = MODES[k]; return isHost ? '<button type="button" class="mode' + (cfg.mode === k ? ' on' : '') + '" data-m="' + k + '"><b>' + m.ic + ' ' + m.n + '</b><small>' + m.d + '</small></button>' : (cfg.mode === k ? '<div class="mode on"><b>' + m.ic + ' ' + m.n + '</b><small>' + m.d + '</small></div>' : ''); }).join('');
    card.innerHTML = '<h1>ODA ' + room + '</h1><div class="sub">' + hs.length + '/8 oyuncu · herkes aynı anda yarışır</div>' + rows + '<div style="margin:10px 0">' + modes + '</div>' +
      '<div style="display:flex;gap:8px">' + (isHost ? '<button class="btn pri" id="lStart" type="button" style="flex:1"' + (why ? ' disabled' : '') + '>🏁 Başlat</button>' : '<button class="btn pri" id="lReady" type="button" style="flex:1">' + (ready ? '✓ Hazırsın (iptal)' : '✋ Hazırım') + '</button>') + '<button class="btn" id="lOut" type="button">Çık</button></div>' +
      '<div class="help" style="text-align:center">' + (isHost ? (why || 'Herkes hazır — başlatabilirsin!') : (ready ? 'Oda sahibi başlatınca oyun açılır.' : 'Hazır olunca “Hazırım”a bas.')) + '</div>';
    if ($('lStart')) $('lStart').onclick = startOnline; if ($('lReady')) $('lReady').onclick = function () { ready = !ready; publish(); showLobby(true); }; $('lOut').onclick = leaveRoom;
    card.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { cfg = { mode: b.getAttribute('data-m') }; base.child('cfg').set(cfg).catch(function () {}); showLobby(true); }; });
  }
  setInterval(function () { if (base && inLobby) { publish(); showLobby(false); } }, 1000);

  /* ---- menüler ---- */
  function boardHTML() {
    if (!board.length) return '<div class="help">Bu hafta henüz kimse oynamadı' + (uid ? '' : ' (skor için ana sayfadan giriş yap)') + '.</div>';
    return '<div class="sub" style="margin:8px 0 0">🏆 Bu haftanın sıralaması (Klasik) · 1. olana <b>500 çip</b> hediye</div><div id="lb">' + board.slice(0, 10).map(function (b, i) { return '<div class="' + (b.id === uid ? 'me' : '') + '"><span>' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.') + ' ' + esc(b.name) + '</span><b>' + b.score + ' <small style="color:#9db4d8">· ' + b.floors + ' kat</small></b></div>'; }).join('') + '</div>';
  }
  function showMenu() {
    if (running || room) return; ov.hidden = false; pad.hidden = true;
    var solo = ['classic', 'slippery', 'storm'].map(function (k) { var m = MODES[k]; return '<button type="button" class="mode" data-solo="' + k + '"><b>' + m.ic + ' ' + m.n + '</b><small>' + m.d + '</small></button>'; }).join('');
    card.innerHTML = '<h1>❄ BUZ KULE ❄</h1><div class="sub">Platformdan platforma zıpla, kuleye tırman, aşağıda kalma!</div>' +
      (uid ? '<div class="sub">Bu hafta en iyin: <b>' + best.score + '</b> puan · ' + best.floors + ' kat</div>' : '') +
      '<div class="sec">Tek kişilik</div>' + solo +
      '<div class="sec">Çok oyunculu · herkes aynı anda</div><div id="rooms" class="help">' + (uid ? 'Odalar yükleniyor…' : 'Çok oyunculu için ana sayfadan giriş yap.') + '</div>' + boardHTML() +
      '<div class="help">' + (TOUCH ? '◀ ▶ ile koş, ⤒ ile zıpla.' : '← → / A D ile koş, Boşluk/↑ ile zıpla.') + ' <b>Hızlıyken zıplarsan daha yükseğe çıkarsın.</b> Duvardan seker. 2+ kat zıplayıp art arda yaparsan kombo kazanırsın.</div>';
    card.querySelectorAll('[data-solo]').forEach(function (b) { b.onclick = function () { start(b.getAttribute('data-solo')); }; });
    refreshRooms();
  }
  function refreshRooms() {
    var el = $('rooms'); if (!el || !uid || !db) return;
    db.ref('rp/kulemp').once('value').then(function (s) {
      var v = s.val() || {}, now = snow(), h = ''; for (var i = 1; i <= 3; i++) { var pp = (v[i] && v[i].pl) || {}, ids = Object.keys(pp).filter(function (u) { return now - (pp[u].a || 0) < 6000; });
        h += '<div class="room"><div><b>Oda ' + i + '</b><small>' + ids.length + '/8 oyuncu' + (ids.length ? ' · ' + ids.map(function (u) { return esc(pp[u].n); }).join(', ') : '') + '</small></div><button class="btn pri" type="button" data-room="' + i + '"' + (ids.length >= 8 ? ' disabled' : '') + '>Katıl</button></div>'; }
      if (!$('rooms')) return; el.className = ''; el.innerHTML = h; el.onclick = function (e) { var b = e.target.closest('[data-room]'); if (b && !b.disabled) joinRoom(+b.getAttribute('data-room')); };
    }, function () { el.textContent = 'Odalara ulaşılamadı (Firebase kuralı gerekli: rp/kulemp).'; });
  }
  setInterval(function () { if (!room && !running && !ov.hidden && $('rooms')) refreshRooms(); }, 4000);
  function showOver() {
    pad.hidden = true; ov.hidden = false; var M = MODES[G.mode];
    card.innerHTML = '<h1>Düştün!</h1><div class="big">' + G.score + '</div><div class="sub">' + M.n + ' · ' + G.floors + '. kata ulaştın' + (uid && M.lb && G.score >= best.score && G.score > 0 ? ' · <b style="color:#ffd86b">Yeni rekor!</b>' : '') + '</div>' + (M.lb ? boardHTML() : '') +
      '<button class="btn pri" id="go" type="button">Tekrar oyna</button> <button class="btn" id="mn" type="button">Modlar</button> <a class="btn" href="../">Ana lobi</a>';
    $('go').onclick = function () { start(G.mode); }; $('mn').onclick = function () { running = false; G = null; showMenu(); };
  }
  function start(mode) { reset(mode, (Math.random() * 1e9) | 0, 0); running = true; acc = 0; last = performance.now(); ov.hidden = true; pad.hidden = !TOUCH; keys.l = keys.r = keys.j = 0; }
  window.__K = { state: function () { return G; }, keys: keys, start: start, join: joinRoom, pl: function () { return pl; }, grid: function () { return grid; }, st: function () { return st; } };
  reset('classic', 1, 0); G.dead = true; requestAnimationFrame(loop); showMenu();
})();
