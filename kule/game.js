/* Buz Kule — dikey zıplama oyunu. Platformdan platforma tırman, hızlıyken yüksek zıpla, kombo yap, aşağıda kalma. */
(function () {
  'use strict';
  var W = 360, H = 640, GAP = 80, WALL = 16, GRAV = 1700, MAXV = 340, ACC = 1500, FRIC = 1100;
  var cv = document.getElementById('c'), ctx = cv.getContext('2d'), ov = document.getElementById('ov'), card = document.getElementById('card'), pad = document.getElementById('pad');
  var TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---- Firebase (isteğe bağlı: skor tablosu) ---- */
  var CFG = { apiKey: 'AIzaSyBsP1VNPJpt1Y6MN0FwDCmvuHeZxaDoTGU', authDomain: 'ruspokeri-de28e.firebaseapp.com', databaseURL: 'https://ruspokeri-de28e-default-rtdb.europe-west1.firebasedatabase.app', projectId: 'ruspokeri-de28e' };
  var db = null, uid = null, myName = 'Oyuncu', best = { floors: 0, score: 0 }, board = [];
  try {
    if (window.firebase) {
      if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(CFG);
      db = firebase.database();
      firebase.auth().onAuthStateChanged(function (u) {
        if (!u) { uid = null; showMenu(); return; }
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
      if (!running) showMenu();
    }, function () {});
  }
  function saveBest() {
    if (!db || !uid) return;
    if (G.score > best.score) {
      best = { floors: Math.max(best.floors, G.floors), score: G.score };
      db.ref('rp/kule/weeks/' + weekId() + '/' + uid).set({ name: myName, floors: best.floors, score: best.score, at: Date.now() }).then(loadBoard, function () {});
    }
  }

  /* ---- oyun durumu ---- */
  var G = null, running = false, keys = { l: 0, r: 0, j: 0 }, last = 0, acc = 0, rnd = Math.random;
  function plat(i) {
    if (i === 0) return { i: 0, x: WALL, w: W - 2 * WALL, y: 0 };
    var big = i % 25 === 0, w = big ? W - 2 * WALL : Math.max(56, 130 - i * 0.6) + rnd() * 40;
    return { i: i, x: big ? WALL : WALL + rnd() * (W - 2 * WALL - w), w: w, y: -i * GAP, big: big };
  }
  function reset() {
    G = { p: { x: W / 2, y: -14, vx: 0, vy: 0, ground: true, face: 1 }, plats: [], top: -1, cam: -(H - 120), floors: 0, score: 0, bonus: 0, comboF: 0, comboN: 0, comboT: 0, lastFloor: 0, started: false, t: 0, fx: [], dead: false, buf: 0, coy: 0, scroll: 0 };
    for (var i = 0; i < 14; i++) addPlat();
  }
  function addPlat() { G.top++; G.plats.push(plat(G.top)); }
  function say(txt, x, y, col) { G.fx.push({ t: txt, x: x, y: y, a: 1.2, c: col || '#fff' }); }

  function step(dt) {
    var p = G.p; G.t += dt;
    var dir = keys.r - keys.l;
    if (dir) { p.vx += dir * ACC * dt; p.face = dir; }
    else { var f = FRIC * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
    if (p.vx > MAXV) p.vx = MAXV; if (p.vx < -MAXV) p.vx = -MAXV;
    p.x += p.vx * dt;
    if (p.x < WALL + 10) { p.x = WALL + 10; p.vx = Math.abs(p.vx) * 0.9; }
    if (p.x > W - WALL - 10) { p.x = W - WALL - 10; p.vx = -Math.abs(p.vx) * 0.9; }
    if (keys.j) G.buf = 0.12; else G.buf = Math.max(0, G.buf - dt);
    G.coy = p.ground ? 0.09 : Math.max(0, G.coy - dt);
    if (G.buf > 0 && G.coy > 0) { p.vy = -(560 + Math.abs(p.vx) * 1.0); p.ground = false; G.coy = 0; G.buf = 0; G.started = true; for (var k = 0; k < 6; k++) G.fx.push({ d: 1, x: p.x, y: p.y, vx: (rnd() - .5) * 120, vy: -rnd() * 60, a: .5 }); }
    var py = p.y, was = p.ground; p.vy += GRAV * dt; p.y += p.vy * dt;
    p.ground = false;
    if (p.vy >= 0) {
      for (var i = 0; i < G.plats.length; i++) {
        var q = G.plats[i];
        if (py <= q.y + 1 && p.y >= q.y && p.x + 8 > q.x && p.x - 8 < q.x + q.w) {
          p.y = q.y; p.vy = 0; p.ground = true;
          if (!was) land(q); break;
        }
      }
    }
    // kombo sayacı: havada ve bir süredir inmediyse biter
    if (G.comboF > 0) { G.comboT -= dt; if (G.comboT <= 0) endCombo(); }
    // kamera
    if (G.started) { G.scroll = Math.min(190, 28 + G.floors * 0.55 + G.t * 0.6); if (G.floors >= 3) G.cam -= G.scroll * dt; }
    var want = p.y - H * 0.45; if (want < G.cam) G.cam = want;
    while (G.top * GAP < -G.cam + H + 400) addPlat();
    G.plats = G.plats.filter(function (q) { return q.y < G.cam + H + 120; });
    for (var j = G.fx.length - 1; j >= 0; j--) { var e = G.fx[j]; e.a -= dt; if (e.d) { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 200 * dt; } else e.y -= 30 * dt; if (e.a <= 0) G.fx.splice(j, 1); }
    if (p.y > G.cam + H + 40) die();
  }
  function land(q) {
    var gain = q.i - G.lastFloor;
    if (q.i > G.floors) { G.score += (q.i - G.floors) * 10; G.floors = q.i; }
    if (gain >= 2) { G.comboF += gain; G.comboN++; G.comboT = 0.0; G.comboT = 1.4; say('+' + gain + ' kat', G.p.x, G.p.y - 30, '#9fe3ff'); }
    else if (G.comboF > 0) endCombo();
    G.lastFloor = q.i;
    for (var k = 0; k < 5; k++) G.fx.push({ d: 1, x: G.p.x, y: G.p.y, vx: (rnd() - .5) * 140, vy: -rnd() * 80, a: .4 });
  }
  function endCombo() {
    if (G.comboF >= 4) { var b = G.comboF * G.comboN * 10; G.score += b; say('KOMBO ×' + G.comboN + '  +' + b, G.p.x, G.p.y - 50, '#ffd86b'); }
    G.comboF = 0; G.comboN = 0; G.comboT = 0;
  }
  function die() { if (G.dead) return; endCombo(); G.dead = true; running = false; saveBest(); showOver(); }

  /* ---- çizim ---- */
  function draw() {
    var cam = G.cam, hgt = Math.min(1, G.floors / 200);
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, mix([40, 70, 120], [12, 8, 40], hgt)); g.addColorStop(1, mix([120, 190, 235], [40, 60, 130], hgt));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; for (var s = 0; s < 40; s++) { var sx = (s * 97) % W, sy = ((s * 53 - cam * 0.2) % H + H) % H; ctx.fillRect(sx, sy, 2, 2); }
    // duvarlar
    var wg = ctx.createLinearGradient(0, 0, WALL, 0); wg.addColorStop(0, '#9fd8f5'); wg.addColorStop(1, '#5aa6cf');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, WALL, H); ctx.fillStyle = '#5aa6cf'; ctx.fillRect(W - WALL, 0, WALL, H);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; for (var y = -((cam % 40) + 40); y < H; y += 40) { ctx.fillRect(0, y, WALL, 3); ctx.fillRect(W - WALL, y, WALL, 3); }
    // platformlar
    G.plats.forEach(function (q) {
      var y = q.y - cam; if (y < -20 || y > H + 20) return;
      ctx.fillStyle = q.big ? '#ffd86b' : '#cfefff'; ctx.fillRect(q.x, y, q.w, 14);
      ctx.fillStyle = q.big ? '#c99a2a' : '#7fbbe0'; ctx.fillRect(q.x, y + 9, q.w, 5);
      ctx.fillStyle = '#fff'; ctx.fillRect(q.x, y, q.w, 3);
      if (q.i % 10 === 0 && q.i > 0) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left'; ctx.fillText(q.i, WALL + 4, y - 4); }
    });
    // oyuncu: kardan adam
    var p = G.p, px = p.x, py = p.y - cam, sq = p.ground ? 1 : 1 + Math.min(0.2, Math.abs(p.vy) / 4000), rot = p.vx / 2200;
    ctx.save(); ctx.translate(px, py); ctx.rotate(p.ground ? 0 : rot); ctx.scale(1 / sq, sq);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -9, 10, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -25, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#d63a3a'; ctx.fillRect(-9, -20, 18, 3.5); ctx.fillRect(p.face > 0 ? -9 : 5, -20, 4, 9);
    ctx.fillStyle = '#233'; ctx.fillRect(-5, -32, 10, 4); ctx.fillRect(-7, -29, 14, 2);
    ctx.fillStyle = '#111'; ctx.fillRect(p.face * 2 - 2.5, -27, 2, 2); ctx.fillRect(p.face * 2 + 2, -27, 2, 2);
    ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.moveTo(p.face * 4, -24); ctx.lineTo(p.face * 10, -23); ctx.lineTo(p.face * 4, -22); ctx.fill();
    ctx.restore();
    G.fx.forEach(function (e) {
      if (e.d) { ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, e.a * 2) + ')'; ctx.fillRect(e.x - 1, e.y - cam - 1, 3, 3); }
      else { ctx.globalAlpha = Math.min(1, e.a); ctx.fillStyle = e.c; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText(e.t, Math.max(60, Math.min(W - 60, e.x)), e.y - cam); ctx.globalAlpha = 1; }
    });
    // HUD
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '900 22px system-ui'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText(G.score, 100, 30); ctx.font = '700 13px system-ui'; ctx.fillStyle = '#bfe6ff'; ctx.fillText('Kat ' + G.floors, 100, 48);
    if (G.comboF > 0) { ctx.fillStyle = '#ffd86b'; ctx.textAlign = 'right'; ctx.font = '900 18px system-ui'; ctx.fillText('KOMBO ' + G.comboF + ' kat', W - 24, 30); ctx.fillStyle = 'rgba(255,216,107,.8)'; ctx.fillRect(W - 24 - 90 * Math.max(0, G.comboT / 1.4), 36, 90 * Math.max(0, G.comboT / 1.4), 4); }
    ctx.shadowBlur = 0;
  }
  function mix(a, b, t) { return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }).join(',') + ')'; }

  /* ---- döngü ---- */
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!G) return;
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (running) { acc += dt; while (acc >= 1 / 120) { step(1 / 120); acc -= 1 / 120; if (!running) break; } }
    draw();
  }
  function fit() {
    var s = Math.min(innerWidth / W, innerHeight / H), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr); cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px';
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  }
  addEventListener('resize', fit); fit();

  /* ---- giriş ---- */
  var KM = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'j', w: 'j', W: 'j', ' ': 'j' };
  addEventListener('keydown', function (e) { var k = KM[e.key]; if (k) { keys[k] = 1; e.preventDefault(); } });
  addEventListener('keyup', function (e) { var k = KM[e.key]; if (k) keys[k] = 0; });
  [['bL', 'l'], ['bR', 'r'], ['bJ', 'j']].forEach(function (a) {
    var b = $(a[0]);
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); keys[a[1]] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) {} });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { keys[a[1]] = 0; b.classList.remove('on'); }); });
  });

  /* ---- menüler ---- */
  function boardHTML() {
    if (!board.length) return '<div class="help">Bu hafta henüz kimse oynamadı (skor için ana sayfadan giriş yap).</div>';
    return '<div class="sub" style="margin:8px 0 0">🏆 Bu haftanın sıralaması · 1. olana <b>500 çip</b> hediye</div><div id="lb">' + board.slice(0, 10).map(function (b, i) { return '<div class="' + (b.id === uid ? 'me' : '') + '"><span>' + (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.') + ' ' + esc(b.name) + '</span><b>' + b.score + ' <small style="color:#9db4d8">· ' + b.floors + ' kat</small></b></div>'; }).join('') + '</div>';
  }
  function showMenu() {
    if (running) return; ov.hidden = false; pad.hidden = true;
    card.innerHTML = '<h1>❄ BUZ KULE ❄</h1><div class="sub">Platformdan platforma zıpla, kuleye tırman, aşağıda kalma!</div>' +
      (uid ? '<div class="sub">Bu hafta en iyin: <b>' + best.score + '</b> puan · ' + best.floors + ' kat</div>' : '') + boardHTML() +
      '<button class="btn pri" id="go" type="button">Başla</button>' +
      '<div class="help">' + (TOUCH ? '◀ ▶ ile koş, ⤒ ile zıpla. <b>Hızlı koşarken zıplarsan çok daha yükseğe çıkarsın.</b>' : '← → veya A D ile koş, Boşluk/↑ ile zıpla. <b>Hızlıyken zıplarsan daha yükseğe çıkarsın.</b>') +
      '<br>Duvardan seker. Bir seferde 2+ kat çıkıp art arda zıplarsan <b>kombo</b> puanı kazanırsın. Ekran yukarı kayar, geride kalma!</div>';
    $('go').onclick = start;
  }
  function showOver() {
    pad.hidden = true; ov.hidden = false;
    card.innerHTML = '<h1>Düştün!</h1><div class="big">' + G.score + '</div><div class="sub">' + G.floors + '. kata ulaştın' + (uid && G.score >= best.score && G.score > 0 ? ' · <b style="color:#ffd86b">Yeni rekor!</b>' : '') + '</div>' + boardHTML() +
      '<button class="btn pri" id="go" type="button">Tekrar oyna</button> <a class="btn" href="../">Ana lobi</a>';
    $('go').onclick = start;
  }
  function start() { reset(); running = true; acc = 0; last = performance.now(); ov.hidden = true; pad.hidden = !TOUCH; keys.l = keys.r = keys.j = 0; }
  window.__K = { state: function () { return G; }, keys: keys, start: start };
  reset(); G.dead = true; requestAnimationFrame(loop); showMenu();
})();
