/* Buz Operasyonu — tarayıcıda 3B takım savaşı (Three.js + Firebase RTDB).
   Çok oyunculu: herkes kendi konumunu yayınlar, atışta isabeti atan taraf hesaplar (arkadaş oyunu için yeterli). */
(function () {
  'use strict';
  var MAP = window.MAP, T = window.THREE;
  function $(id) { return document.getElementById(id); }
  var TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  var CFG = { apiKey: 'AIzaSyBsP1VNPJpt1Y6MN0FwDCmvuHeZxaDoTGU', authDomain: 'ruspokeri-de28e.firebaseapp.com', databaseURL: 'https://ruspokeri-de28e-default-rtdb.europe-west1.firebasedatabase.app', projectId: 'ruspokeri-de28e' };
  if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(CFG);
  var db = firebase.database(), auth = firebase.auth(), tOff = 0;
  try { db.ref('.info/serverTimeOffset').on('value', function (s) { tOff = s.val() || 0; }); } catch (e) {}
  var online = false;
  function snow() { return Date.now() + (online ? tOff : 0); }

  /* ---------------- sabitler ---------------- */
  var EYE = 1.65, RAD = 0.4, HGT = 1.8, GRAV = 24, JUMP = 8.3, SPD = 5.4, WALK = 2.7, BUY_MS = 8000, LIVE_MS = 100000, END_MS = 5000;
  var WP = {
    knife:  { n: 'Bıçak', slot: 3, dmg: 48, rate: 0.55, mag: 0, res: 0, range: 2.4, price: 0 },
    pistol: { n: 'Tabanca', slot: 2, dmg: 26, rate: 0.2, mag: 12, res: 48, reload: 1.5, spread: 0.012, auto: false, price: 0, kick: 0.012, len: 0.32, col: 0x555a66 },
    smg:    { n: 'Hafif Makineli', slot: 1, dmg: 19, rate: 0.075, mag: 30, res: 120, reload: 2.0, spread: 0.032, auto: true, price: 1250, kick: 0.006, len: 0.5, col: 0x2e3340 },
    rifle:  { n: 'Tüfek', slot: 1, dmg: 31, rate: 0.1, mag: 30, res: 90, reload: 2.4, spread: 0.02, auto: true, price: 2500, kick: 0.009, len: 0.75, col: 0x3a2f24 },
    sniper: { n: 'Keskin Nişancı', slot: 1, dmg: 98, rate: 1.25, mag: 8, res: 32, reload: 3.0, spread: 0.07, scopedSpread: 0.0008, auto: false, price: 4000, kick: 0.03, len: 1.0, col: 0x23262d, scope: true }
  };
  var ARMOR_PRICE = 650;

  /* ---------------- sahne ---------------- */
  var canvas = $('gl'), renderer = new T.WebGLRenderer({ canvas: canvas, antialias: !TOUCH, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, TOUCH ? 1.5 : 2));
  var scene = new T.Scene(); scene.background = new T.Color(0xbcd7ec); scene.fog = new T.Fog(0xbcd7ec, 25, 95);
  var cam = new T.PerspectiveCamera(75, 1, 0.05, 200); cam.rotation.order = 'YXZ'; scene.add(cam);
  scene.add(new T.HemisphereLight(0xe8f4ff, 0x8aa0b8, 0.95));
  var sun = new T.DirectionalLight(0xffffff, 0.55); sun.position.set(30, 50, 20); scene.add(sun);
  function resize() { var w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();

  var MATS = {
    ice: new T.MeshLambertMaterial({ color: 0x9fd2f2 }), wall: new T.MeshLambertMaterial({ color: 0x7f93ad }),
    snow: new T.MeshLambertMaterial({ color: 0xf2f7fb }), crate: new T.MeshLambertMaterial({ color: 0x9a6b3c })
  };
  var BX = MAP.boxes.map(function (b) {
    var m = new T.Mesh(new T.BoxGeometry(b.w, b.h, b.d), MATS[b.t] || MATS.ice); m.position.set(b.x, b.y + b.h / 2, b.z); scene.add(m);
    if (b.t === 'ice' && b.h > 1.5) { var cap = new T.Mesh(new T.BoxGeometry(b.w + 0.1, 0.18, b.d + 0.1), MATS.snow); cap.position.set(b.x, b.y + b.h + 0.09, b.z); scene.add(cap); }
    return { minx: b.x - b.w / 2, maxx: b.x + b.w / 2, miny: b.y, maxy: b.y + b.h, minz: b.z - b.d / 2, maxz: b.z + b.d / 2, h: b.h, t: b.t };
  });
  (function ground() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var g = c.getContext('2d'); g.fillStyle = '#eef5fa'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 900; i++) { g.fillStyle = 'rgba(' + (180 + Math.random() * 60 | 0) + ',' + (205 + Math.random() * 40 | 0) + ',255,' + (0.1 + Math.random() * 0.25) + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2 + Math.random() * 5); }
    var tx = new T.CanvasTexture(c); tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(18, 18);
    var f = new T.Mesh(new T.PlaneGeometry(100, 100), new T.MeshLambertMaterial({ map: tx })); f.rotation.x = -Math.PI / 2; scene.add(f);
    var lake = new T.Mesh(new T.CircleGeometry(15, 40), new T.MeshPhongMaterial({ color: 0x8cc8ee, shininess: 90, specular: 0xffffff })); lake.rotation.x = -Math.PI / 2; lake.position.y = 0.02; scene.add(lake);
  })();
  var flakes = (function () {
    var n = TOUCH ? 350 : 700, pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 18; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    var p = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9 })); p.frustumCulled = false; scene.add(p); return p;
  })();

  /* ---------------- ses ---------------- */
  var actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
  function sfx(kind, vol) {
    var a = audio(); if (!a || vol <= 0.01) return;
    var dur = kind === 'sniper' ? 0.35 : kind === 'knife' ? 0.12 : kind === 'hit' ? 0.07 : 0.14, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, kind === 'hit' ? 1 : 3);
    var s = a.createBufferSource(); s.buffer = buf; var f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'hit' ? 1800 : kind === 'sniper' ? 400 : kind === 'smg' ? 1500 : kind === 'knife' ? 3000 : 900; f.Q.value = 0.7;
    var g = a.createGain(); g.gain.value = Math.min(1, vol); s.connect(f); f.connect(g); g.connect(a.destination); s.start();
  }

  /* ---------------- durum ---------------- */
  var G = { mode: null, roomId: null, uid: null, name: 'Oyuncu', ents: {}, R: { n: 0, ph: 'wait', t0: 0, sT: 0, sCT: 0, win: '' }, lastN: -1, feed: [], menu: true, shake: 0, awarded: -1 };
  var me = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, alive: false, team: 'T', money: 800, primary: null, cw: 'pistol', ammo: {}, nextShot: 0, reloadEnd: 0, ground: true, scoped: false, k: 0, d: 0, sinceShot: 9 };
  var inp = { f: 0, r: 0, fire: false, edge: false, jump: false, walk: false };
  var shadow = new T.Group(); scene.add(shadow);
  me.ammo.pistol = { mag: WP.pistol.mag, res: WP.pistol.res };

  /* ---------------- görünüm modeli (silah) ---------------- */
  var vm = new T.Group(); cam.add(vm); var vmMesh = null, flash = new T.Mesh(new T.PlaneGeometry(0.25, 0.25), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.0, depthTest: false })); flash.renderOrder = 10;
  function buildVM() {
    if (vmMesh) vm.remove(vmMesh); var w = WP[me.cw], grp = new T.Group();
    if (me.cw === 'knife') { var bl = new T.Mesh(new T.BoxGeometry(0.03, 0.04, 0.4), new T.MeshLambertMaterial({ color: 0xc8d0d8 })); bl.position.set(0, 0, -0.25); grp.add(bl); }
    else {
      var m = new T.MeshLambertMaterial({ color: w.col }), body = new T.Mesh(new T.BoxGeometry(0.07, 0.1, w.len), m); body.position.set(0, 0, -w.len / 2); grp.add(body);
      var bar = new T.Mesh(new T.BoxGeometry(0.035, 0.035, w.len * 0.55), new T.MeshLambertMaterial({ color: 0x15171c })); bar.position.set(0, 0.02, -w.len - 0.1); grp.add(bar);
      flash.position.set(0, 0.02, -w.len - 0.4); grp.add(flash);
    }
    grp.scale.set(0.8, 0.8, 0.8); grp.position.set(0.2, -0.19, -0.4); vmMesh = grp; vm.add(grp);
  }
  var vmKick = 0;

  /* ---------------- avatarlar ---------------- */
  function tag(name, col) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64; var g = c.getContext('2d'); g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000a'; g.fillText(name, 129, 45); g.fillStyle = col; g.fillText(name, 128, 43);
    var s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), depthTest: false, transparent: true })); s.scale.set(1.6, 0.4, 1); s.position.y = 2.25; s.renderOrder = 5; return s;
  }
  function avatar(team, name) {
    var g = new T.Group(), col = team === 'CT' ? 0x2f6fdc : 0xe0702a, mb = new T.MeshLambertMaterial({ color: col }), mk = new T.MeshLambertMaterial({ color: 0x2a2f3a }), ms = new T.MeshLambertMaterial({ color: 0xf0c8a0 });
    function part(w, h, d, m, x, y, z) { var p = new T.Mesh(new T.BoxGeometry(w, h, d), m); p.position.set(x, y, z); g.add(p); return p; }
    part(0.28, 0.8, 0.3, mk, -0.14, 0.4, 0); part(0.28, 0.8, 0.3, mk, 0.14, 0.4, 0); part(0.6, 0.7, 0.36, mb, 0, 1.15, 0); part(0.3, 0.3, 0.3, ms, 0, 1.68, 0);
    part(0.12, 0.12, 0.6, mk, 0.26, 1.2, -0.3); g.add(tag(name, team === 'CT' ? '#8fc0ff' : '#ffb07a')); scene.add(g); return g;
  }

  /* ---------------- çarpışma / fizik ---------------- */
  function collide(p, step) {
    for (var it = 0; it < 2; it++) for (var i = 0; i < BX.length; i++) {
      var b = BX[i]; if (p.y + HGT <= b.miny + 0.01 || p.y >= b.maxy - 0.01) continue;
      var cx = Math.max(b.minx, Math.min(p.x, b.maxx)), cz = Math.max(b.minz, Math.min(p.z, b.maxz)), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= RAD * RAD) continue;
      if (step && b.maxy - p.y <= 0.45 && b.maxy - p.y > 0) { p.y = b.maxy; p.vy = Math.max(p.vy, 0); continue; }
      if (d2 > 1e-8) { var d = Math.sqrt(d2), k = (RAD - d) / d; p.x += dx * k; p.z += dz * k; }
      else { var l = p.x - b.minx, r = b.maxx - p.x, f = p.z - b.minz, bk = b.maxz - p.z, m = Math.min(l, r, f, bk); if (m === l) p.x = b.minx - RAD; else if (m === r) p.x = b.maxx + RAD; else if (m === f) p.z = b.minz - RAD; else p.z = b.maxz + RAD; }
    }
  }
  function landing(p, prevY) {
    var top = 0;
    for (var i = 0; i < BX.length; i++) { var b = BX[i]; if (p.x > b.minx - RAD * 0.7 && p.x < b.maxx + RAD * 0.7 && p.z > b.minz - RAD * 0.7 && p.z < b.maxz + RAD * 0.7 && b.maxy <= prevY + 0.35 && b.maxy > top) top = b.maxy; }
    return top;
  }
  function physics(p, dt, wishX, wishZ, spd, jump) {
    var ax = wishX * spd, az = wishZ * spd, k = p.ground ? 14 : 3;
    p.vx += (ax - p.vx) * Math.min(1, k * dt); p.vz += (az - p.vz) * Math.min(1, k * dt);
    if (jump && p.ground) { p.vy = JUMP; p.ground = false; }
    p.x += p.vx * dt; collide(p, true); p.z += p.vz * dt; collide(p, true);
    var prev = p.y; p.vy -= GRAV * dt; p.y += p.vy * dt;
    var top = landing(p, prev);
    if (p.y <= top && p.vy <= 0) { p.y = top; p.vy = 0; p.ground = true; } else p.ground = false;
    var H = MAP.half - 0.5; p.x = Math.max(-H, Math.min(H, p.x)); p.z = Math.max(-H, Math.min(H, p.z));
  }
  function rayBoxT(ox, oy, oz, dx, dy, dz, b) {
    var t0 = 0, t1 = 1e9, o = [ox, oy, oz], d = [dx, dy, dz], mn = [b.minx, b.miny, b.minz], mx = [b.maxx, b.maxy, b.maxz];
    for (var i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return -1; continue; }
      var a = (mn[i] - o[i]) / d[i], c = (mx[i] - o[i]) / d[i]; if (a > c) { var s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1;
    }
    return t0;
  }
  function rayWorld(ox, oy, oz, dx, dy, dz, max) {
    var best = max; for (var i = 0; i < BX.length; i++) { var t = rayBoxT(ox, oy, oz, dx, dy, dz, BX[i]); if (t >= 0 && t < best) best = t; }
    if (dy < 0) { var tg = -oy / dy; if (tg > 0 && tg < best) best = tg; }
    return best;
  }
  function los(a, b) { var dx = b.x - a.x, dy = (b.y + 1.5) - (a.y + 1.5), dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz); return rayWorld(a.x, a.y + 1.5, a.z, dx / d, dy / d, dz / d, d) >= d - 0.2; }

  /* ---------------- tur & takım yardımcıları ---------------- */
  function allPlayers() { var l = [me]; Object.keys(G.ents).forEach(function (u) { l.push(G.ents[u]); }); return l; }
  function teamIdx(team, uid) { var l = []; allPlayers().forEach(function (p) { if (p.team === team) l.push(p === me ? G.uid : p.uid); }); l.sort(); return Math.max(0, l.indexOf(uid)); }
  function spawnOf(team, uid) { var s = MAP.spawns[team], i = teamIdx(team, uid) % s.length; return s[i]; }
  function aliveCount(team) { var n = 0; allPlayers().forEach(function (p) { if (p.team === team && p.alive) n++; }); return n; }
  function teamCount(team) { var n = 0; allPlayers().forEach(function (p) { if (p.team === team) n++; }); return n; }
  function giveAmmo(id) { var w = WP[id]; me.ammo[id] = { mag: w.mag, res: w.res }; }
  function resetMe() {
    var sp = spawnOf(me.team, G.uid); me.x = sp[0]; me.z = sp[1]; me.y = 0; me.vx = me.vy = me.vz = 0; me.yaw = me.team === 'T' ? 0 : Math.PI; me.pitch = 0;
    if (!me.alive || me.hp <= 0) { me.armor = 0; me.primary = null; }
    me.alive = true; me.hp = 100; me.scoped = false; me.reloadEnd = 0; me.cw = me.primary || 'pistol';
    giveAmmo('pistol'); if (me.primary) giveAmmo(me.primary); buildVM();
  }
  function setRound(r) {
    var prev = G.R; G.R = r;
    if (r.n !== G.lastN) { G.lastN = r.n; resetMe(); resetBots(); }
    if (r.ph === 'end' && G.awarded !== r.n) { G.awarded = r.n; var won = r.win === me.team; me.money = Math.min(16000, me.money + (won ? 2800 : 1700)); say(won ? 'TUR SİZİN!' : 'Tur kaybedildi', (won ? '+$2800' : '+$1700')); }
    if (r.ph === 'buy' && prev.ph !== 'buy') say('Tur ' + r.n, 'Satın alma süresi — B'); 
    if (r.ph === 'live' && prev.ph === 'buy') { say('BAŞLA!', ''); closeShop(); }
    if (r.ph === 'wait' && prev.ph !== 'wait') say('Rakip bekleniyor', 'Diğer takımda oyuncu yok · serbest dolaş');
  }
  var msgT = 0; function say(a, b) { $('msg').innerHTML = a + (b ? '<small>' + b + '</small>' : ''); msgT = performance.now() + 2600; }
  function feedAdd(txt) { G.feed.push({ t: performance.now() + 6000, txt: txt }); if (G.feed.length > 5) G.feed.shift(); }

  /* host kararı: tur geçişleri (çevrimiçi: oda sahibi, çevrimdışı: yerel) */
  function commit(r) { if (online) G.base.child('rd').set(r); else setRound(r); }
  function hostTick() {
    var r = G.R, now = snow(), tc = teamCount('T'), cc = teamCount('CT'), ready = tc > 0 && cc > 0;
    if (r.ph === 'wait') { if (ready) commit({ n: r.n + 1, ph: 'buy', t0: now, sT: r.sT, sCT: r.sCT, win: '' }); return; }
    if (!ready) { commit({ n: r.n, ph: 'wait', t0: now, sT: r.sT, sCT: r.sCT, win: '' }); return; }
    if (r.ph === 'buy') { if (now - r.t0 >= BUY_MS) commit({ n: r.n, ph: 'live', t0: now, sT: r.sT, sCT: r.sCT, win: '' }); return; }
    if (r.ph === 'live') {
      var aT = aliveCount('T'), aC = aliveCount('CT'), win = '';
      if (aT === 0 && aC > 0) win = 'CT'; else if (aC === 0 && aT > 0) win = 'T'; else if (aT === 0 && aC === 0) win = 'CT'; else if (now - r.t0 >= LIVE_MS) win = aT > aC ? 'T' : 'CT';
      if (win) commit({ n: r.n, ph: 'end', t0: now, sT: r.sT + (win === 'T' ? 1 : 0), sCT: r.sCT + (win === 'CT' ? 1 : 0), win: win }); return;
    }
    if (r.ph === 'end' && now - r.t0 >= END_MS) commit({ n: r.n + 1, ph: 'buy', t0: now, sT: r.sT, sCT: r.sCT, win: '' });
  }
  function isHost() {
    if (!online) return true; var me0 = G.uid, ok = true, now = snow();
    Object.keys(G.roster || {}).forEach(function (u) { var v = G.roster[u]; if (u < me0 && v && now - v.at < 15000) ok = false; }); return ok;
  }

  /* ---------------- ateş ---------------- */
  var hitT = 0, flashT = 0;
  function tracer(ox, oy, oz, ex, ey, ez, col) {
    var g = new T.BufferGeometry().setFromPoints([new T.Vector3(ox, oy, oz), new T.Vector3(ex, ey, ez)]), l = new T.Line(g, new T.LineBasicMaterial({ color: col || 0xfff2b0, transparent: true, opacity: 0.9 })); scene.add(l);
    G.tracers = G.tracers || []; G.tracers.push({ l: l, t: performance.now() + 90 });
  }
  function puff(x, y, z) {
    for (var i = 0; i < 5; i++) { var m = new T.Mesh(new T.BoxGeometry(0.07, 0.07, 0.07), new T.MeshBasicMaterial({ color: 0xffffff })); m.position.set(x, y, z); scene.add(m); G.bits = G.bits || []; G.bits.push({ m: m, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, t: performance.now() + 450 }); }
  }
  function hitTest(ox, oy, oz, dx, dy, dz, maxD, shooterTeam, skip) {
    var best = rayWorld(ox, oy, oz, dx, dy, dz, maxD), who = null, head = false;
    allPlayers().forEach(function (p) {
      if (p === skip || !p.alive || p.team === shooterTeam) return;
      var hb = { minx: p.x - 0.2, maxx: p.x + 0.2, miny: p.y + 1.45, maxy: p.y + 1.88, minz: p.z - 0.2, maxz: p.z + 0.2 }, bb = { minx: p.x - 0.38, maxx: p.x + 0.38, miny: p.y, maxy: p.y + 1.45, minz: p.z - 0.38, maxz: p.z + 0.38 };
      var th = rayBoxT(ox, oy, oz, dx, dy, dz, hb), tb = rayBoxT(ox, oy, oz, dx, dy, dz, bb);
      if (th >= 0 && th < best) { best = th; who = p; head = true; } else if (tb >= 0 && tb < best) { best = tb; who = p; head = false; }
    });
    return { t: best, who: who, head: head };
  }
  function shoot() {
    var w = WP[me.cw], now = performance.now() / 1000;
    if (!me.alive || now < me.nextShot || now < me.reloadEnd) return;
    if (G.R.ph === 'buy') return;
    var am = me.ammo[me.cw];
    if (w.mag && am.mag <= 0) { reload(); return; }
    me.nextShot = now + w.rate; if (w.mag) am.mag--;
    var spread = w.spread || 0; if (w.scope) spread = me.scoped ? w.scopedSpread : w.spread;
    if (!me.ground) spread *= 3; else if (Math.hypot(me.vx, me.vz) > 3) spread *= 1.8;
    var cp = Math.cos(me.pitch), dx = -Math.sin(me.yaw) * cp, dy = Math.sin(me.pitch), dz = -Math.cos(me.yaw) * cp;
    dx += (Math.random() - 0.5) * 2 * spread; dy += (Math.random() - 0.5) * 2 * spread; dz += (Math.random() - 0.5) * 2 * spread; var l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    var ox = me.x, oy = me.y + EYE, oz = me.z, range = me.cw === 'knife' ? w.range : 120, h = hitTest(ox, oy, oz, dx, dy, dz, range, me.team, me);
    var ex = ox + dx * h.t, ey = oy + dy * h.t, ez = oz + dz * h.t;
    if (me.cw !== 'knife') { var rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw); tracer(ox + rx * 0.2 - Math.sin(me.yaw) * 0.6, oy - 0.2, oz + rz * 0.2 - Math.cos(me.yaw) * 0.6, ex, ey, ez); flashT = performance.now() + 45; }
    sfx(me.cw, 0.5); vmKick = 1; me.pitch += (w.kick || 0) * (0.6 + Math.random() * 0.8); me.sinceShot = 0;
    if (h.who) {
      var dmg = w.dmg * (h.head ? (me.cw === 'sniper' ? 2 : 3.2) : 1) * (me.cw === 'knife' ? 1 : Math.max(0.55, 1 - h.t / 160));
      dmg = Math.round(dmg); hitT = performance.now() + 140; sfx('hit', 0.35); $('cross').classList.add('hit');
      if (G.mode === 'bots' || h.who.bot) botHurt(h.who, dmg, h.head, me.cw);
      else netDamage(h.who.uid, dmg, h.head, me.cw);
    } else puff(ex, ey, ez);
    if (online) netEvent(me.cw, ox, oy, oz, ex, ey, ez);
    if (w.mag && am.mag === 0 && am.res > 0) setTimeout(reload, 250);
    if (me.cw === 'sniper' && me.scoped) { setTimeout(function () { setScope(false); }, 80); }
  }
  function reload() {
    var w = WP[me.cw], am = me.ammo[me.cw], now = performance.now() / 1000; if (!w.mag || !am || am.mag >= w.mag || am.res <= 0 || now < me.reloadEnd) return;
    me.reloadEnd = now + w.reload; say('', ''); setScope(false);
    setTimeout(function (id, token) { return function () { var a = me.ammo[id]; if (!a || me.cw !== id || !me.alive || token !== me.reloadEnd) return; var need = WP[id].mag - a.mag, take = Math.min(need, a.res); a.mag += take; a.res -= take; }; }(me.cw, me.reloadEnd), w.reload * 1000);
  }
  function switchTo(id) {
    if (!me.alive || me.cw === id) return; if (id !== 'knife' && id !== 'pistol' && me.primary !== id) return;
    me.cw = id; me.reloadEnd = 0; me.nextShot = performance.now() / 1000 + 0.3; setScope(false); buildVM(); renderSlots();
  }
  function setScope(on) {
    if (on && !(WP[me.cw].scope && me.alive)) on = false; me.scoped = on; $('scopeOv').hidden = !on; vm.visible = !on; cam.fov = on ? 22 : 75; cam.updateProjectionMatrix();
  }

  /* ---------------- hasar alma / ölüm ---------------- */
  function hurtMe(dmg, fromUid, fromName, wid, head) {
    if (!me.alive || G.R.ph !== 'live') return;
    if (me.armor > 0) { var ab = Math.min(me.armor, dmg * 0.5); me.armor -= ab; dmg = dmg - ab * 0.5; }
    me.hp -= dmg; G.hurtT = performance.now() + 250; $('vign').classList.add('hurt'); sfx('hit', 0.5);
    if (me.hp <= 0) { me.hp = 0; me.alive = false; me.d++; setScope(false); me.primary = null; say('Öldün', 'Turun bitmesini bekle'); netKill(fromUid, fromName, wid, head); }
  }
  function killFeedLine(kn, vn, wid, head) { return kn + '  ▸ ' + (head ? '🎯 ' : '') + (WP[wid] ? WP[wid].n : '') + ' ▸  ' + vn; }

  /* ---------------- botlar (antrenman) ---------------- */
  var bots = [], GRID = 0.5, GN = Math.round(MAP.half * 2 / GRID), blockedG = null;
  function buildGrid() {
    blockedG = new Uint8Array(GN * GN);
    for (var j = 0; j < GN; j++) for (var i = 0; i < GN; i++) {
      var x = -MAP.half + i * GRID + GRID / 2, z = -MAP.half + j * GRID + GRID / 2, bl = 0;
      for (var k = 0; k < BX.length; k++) { var b = BX[k]; if (b.h > 1.0 && x > b.minx - 0.5 && x < b.maxx + 0.5 && z > b.minz - 0.5 && z < b.maxz + 0.5) { bl = 1; break; } }
      blockedG[j * GN + i] = bl;
    }
  }
  function cellOf(x, z) { return [Math.max(0, Math.min(GN - 1, Math.floor((x + MAP.half) / GRID))), Math.max(0, Math.min(GN - 1, Math.floor((z + MAP.half) / GRID)))]; }
  function findPath(fx, fz, tx, tz) {
    var a = cellOf(fx, fz), b = cellOf(tx, tz), prev = new Int32Array(GN * GN).fill(-2), q = [a[1] * GN + a[0]], goal = b[1] * GN + b[0]; prev[q[0]] = -1;
    for (var h = 0; h < q.length; h++) {
      var c = q[h]; if (c === goal) break; var ci = c % GN, cj = (c / GN) | 0;
      for (var d = 0; d < 4; d++) { var ni = ci + (d === 0 ? 1 : d === 1 ? -1 : 0), nj = cj + (d === 2 ? 1 : d === 3 ? -1 : 0); if (ni < 0 || nj < 0 || ni >= GN || nj >= GN) continue; var n = nj * GN + ni; if (prev[n] !== -2 || (blockedG[n] && n !== goal)) continue; prev[n] = c; q.push(n); }
    }
    if (prev[goal] === -2) return null; var path = [], c2 = goal; while (c2 !== -1) { path.push(c2); c2 = prev[c2]; } path.reverse();
    return path.map(function (c3) { return [-MAP.half + (c3 % GN) * GRID + GRID / 2, -MAP.half + ((c3 / GN) | 0) * GRID + GRID / 2]; });
  }
  var BOT_NAMES = ['Kar Tilkisi', 'Buz Ayısı', 'Kutup Kurdu', 'Don Baba', 'Çığ'];
  function spawnBots() {
    bots.forEach(function (b) { scene.remove(b.mesh); }); bots = []; G.ents = {};
    var nb = 4, team = me.team === 'T' ? 'CT' : 'T';
    for (var i = 0; i < nb; i++) {
      var e = { uid: 'bot' + i, name: BOT_NAMES[i], team: team, bot: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, hp: 100, alive: true, path: null, pathT: 0, react: 0, fireT: 0, k: 0, d: 0, w: 'rifle', ground: true, walkT: 0 };
      e.mesh = avatar(team, e.name); bots.push(e); G.ents[e.uid] = e;
    }
    resetBots();
  }
  function resetBots() {
    bots.forEach(function (e, i) { var sp = MAP.spawns[e.team][i % 8]; e.x = sp[0]; e.z = sp[1]; e.y = 0; e.hp = 100; e.alive = true; e.path = null; e.react = 0; e.vx = e.vz = 0; e.yaw = e.team === 'T' ? 0 : Math.PI; e.mesh.rotation.z = 0; e.mesh.visible = true; });
  }
  function botHurt(e, dmg, head, wid) {
    if (G.R.ph !== 'live' && G.R.ph !== 'wait') return; e.hp -= dmg;
    if (e.hp <= 0 && e.alive) { e.alive = false; e.d++; me.k++; me.money = Math.min(16000, me.money + 300); feedAdd(killFeedLine(G.name, e.name, wid, head)); }
  }
  function botThink(e, dt) {
    if (!e.alive) return; var live = G.R.ph === 'live' || G.R.ph === 'wait'; if (G.R.ph === 'buy' || G.R.ph === 'end') return;
    var tgt = me.alive ? me : null, wx = 0, wz = 0, seen = false, dist = 99;
    if (tgt) { dist = Math.hypot(tgt.x - e.x, tgt.z - e.z); seen = dist < 55 && los(e, tgt); }
    e.pathT -= dt;
    if (seen) {
      var ang = Math.atan2(-(tgt.x - e.x), -(tgt.z - e.z)), dy = ((ang - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; e.yaw += dy * Math.min(1, dt * 7);
      e.react += dt; e.fireT -= dt;
      if (e.react > 0.55 && e.fireT <= 0 && Math.abs(dy) < 0.25 && G.R.ph === 'live') {
        e.fireT = 0.28 + Math.random() * 0.25; var p = Math.max(0.12, 0.5 - dist * 0.012); tracer(e.x, e.y + 1.4, e.z, tgt.x + (Math.random() - 0.5) * 0.8, tgt.y + 1.2, tgt.z + (Math.random() - 0.5) * 0.8, 0xffa070); sfx('rifle', Math.max(0.05, 0.4 - dist * 0.01));
        if (Math.random() < p) hurtMe(13 + Math.random() * 8, e.uid, e.name, 'rifle', false);
      }
      if (dist > 14) { wx = -Math.sin(e.yaw) * 0.6; wz = -Math.cos(e.yaw) * 0.6; }
    } else {
      e.react = 0;
      if (tgt && live && (e.pathT <= 0 || !e.path)) { e.path = findPath(e.x, e.z, tgt.x, tgt.z); e.pathT = 1.0; }
      if (e.path && e.path.length) { var n = e.path[0], ddx = n[0] - e.x, ddz = n[1] - e.z, dd = Math.hypot(ddx, ddz); if (dd < 0.45) e.path.shift(); else { wx = ddx / dd; wz = ddz / dd; e.yaw = Math.atan2(-wx, -wz); } }
    }
    e.walkT += dt; physics(e, dt, wx, wz, 3.4, false);
  }

  /* ---------------- ağ (çok oyunculu) ---------------- */
  var NET = null, sendT = 0, hbT = 0;
  function netJoin(roomId) {
    online = true; G.mode = 'online'; G.roomId = roomId; var base = db.ref('rp/cs/' + roomId); G.base = base; G.roster = {};
    NET = { off: [], t0: snow() - 2500 };
    var plRef = base.child('pl/' + G.uid), stRef = base.child('st/' + G.uid);
    // takım dengesi
    return base.child('pl').once('value').then(function (s) {
      var pl = s.val() || {}, t = 0, c = 0, now = snow(); Object.keys(pl).forEach(function (u) { if (u !== G.uid && now - (pl[u].at || 0) < 15000) { if (pl[u].team === 'T') t++; else c++; } });
      me.team = t < c ? 'T' : c < t ? 'CT' : (Math.random() < 0.5 ? 'T' : 'CT');
      try { plRef.onDisconnect().remove(); stRef.onDisconnect().remove(); } catch (e) {}
      return plRef.set({ name: G.name, team: me.team, at: snow() });
    }).then(function () {
      if (G.R.ph === 'wait') resetMe();
      function on(ref, ev, fn) { ref.on(ev, fn); NET.off.push(function () { ref.off(ev, fn); }); }
      on(base.child('pl'), 'value', function (s) { G.roster = s.val() || {}; syncEnts(); });
      on(base.child('st'), 'value', function (s) { var st = s.val() || {}; Object.keys(st).forEach(function (u) { var e = G.ents[u]; if (e) { var v = st[u]; e.tx = v.x; e.ty = v.y; e.tz = v.z; e.yaw = v.r; e.pitch = v.p; e.alive = !!v.a; e.hp = v.h; e.w = v.w; e.k = v.k || 0; e.d = v.d || 0; if (e.x === undefined) { e.x = e.tx; e.y = e.ty; e.z = e.tz; } } }); });
      on(base.child('rd'), 'value', function (s) { var r = s.val(); if (r && (r.n !== G.R.n || r.ph !== G.R.ph)) setRound(r); });
      on(base.child('ev'), 'child_added', function (s) { var v = s.val(); if (!v || v.u === G.uid || (v.at || 0) < NET.t0) return; var d = Math.hypot(v.ox - me.x, v.oz - me.z); sfx(v.w, Math.min(0.6, 8 / (d + 4))); tracer(v.ox, v.oy, v.oz, v.ex, v.ey, v.ez, 0xffc080); });
      on(base.child('dm/' + G.uid), 'child_added', function (s) { var v = s.val(); s.ref ? s.ref.remove() : base.child('dm/' + G.uid + '/' + s.key).remove(); if (!v || (v.at || 0) < NET.t0) return; var f = G.roster[v.f]; hurtMe(v.d, v.f, f ? f.name : 'Oyuncu', v.w, !!v.h); });
      on(base.child('kf'), 'child_added', function (s) { var v = s.val(); if (!v || (v.at || 0) < NET.t0) return; feedAdd(killFeedLine(v.kn, v.vn, v.w, v.h)); if (v.k === G.uid) { me.k++; me.money = Math.min(16000, me.money + 300); } });
      NET.loop = setInterval(netLoop, 80); NET.host = setInterval(function () { if (G.mode === 'online' && isHost()) hostTick(); }, 400);
    });
  }
  function syncEnts() {
    var now = snow(), ids = Object.keys(G.roster);
    ids.forEach(function (u) { var v = G.roster[u]; if (u === G.uid || now - (v.at || 0) > 15000) return; if (!G.ents[u]) { var e = { uid: u, name: v.name, team: v.team, alive: false, hp: 100, k: 0, d: 0, w: 'pistol' }; e.mesh = avatar(v.team, v.name); e.mesh.visible = false; G.ents[u] = e; } });
    Object.keys(G.ents).forEach(function (u) { var v = G.roster[u]; if (!v || now - (v.at || 0) > 15000) { scene.remove(G.ents[u].mesh); delete G.ents[u]; } });
  }
  function netLoop() {
    var now = snow(), b = G.base; if (!b) return;
    b.child('st/' + G.uid).set({ x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), r: +me.yaw.toFixed(2), p: +me.pitch.toFixed(2), h: Math.round(me.hp), a: me.alive ? 1 : 0, w: me.cw, k: me.k, d: me.d });
    if (now - hbT > 4000) { hbT = now; b.child('pl/' + G.uid + '/at').set(now); }
  }
  function netEvent(w, ox, oy, oz, ex, ey, ez) {
    var k = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), r = G.base.child('ev/' + k);
    r.set({ u: G.uid, w: w, ox: +ox.toFixed(1), oy: +oy.toFixed(1), oz: +oz.toFixed(1), ex: +ex.toFixed(1), ey: +ey.toFixed(1), ez: +ez.toFixed(1), at: snow() }); setTimeout(function () { r.remove(); }, 3000);
  }
  function netDamage(victim, dmg, head, w) { G.base.child('dm/' + victim + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).set({ f: G.uid, d: dmg, h: head ? 1 : 0, w: w, at: snow() }); }
  function netKill(killerUid, killerName, w, head) {
    var k = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), r = G.base.child('kf/' + k);
    r.set({ k: killerUid, kn: killerName, vn: G.name, w: w, h: head ? 1 : 0, at: snow() }); setTimeout(function () { r.remove(); }, 8000);
  }
  function netLeave() {
    if (!NET) return; clearInterval(NET.loop); clearInterval(NET.host); NET.off.forEach(function (f) { f(); });
    var b = G.base; if (b) { b.child('pl/' + G.uid).remove(); b.child('st/' + G.uid).remove(); }
    NET = null; G.base = null;
  }

  /* ---------------- girdiler ---------------- */
  var keys = {}, locked = false;
  function resetInput() { inp.f = inp.r = 0; inp.fire = false; inp.jump = false; keys = {}; }
  window.addEventListener('keydown', function (e) {
    if (G.menu) return; var k = e.key.toLowerCase(); if (e.repeat && k !== ' ') return; keys[k] = true;
    if (k === 'r') reload(); else if (k === 'b') toggleShop(); else if (k === 'tab') { e.preventDefault(); showBoard(true); } else if (k === 'z') setScope(!me.scoped);
    else if (k === '1' && me.primary) switchTo(me.primary); else if (k === '2') switchTo('pistol'); else if (k === '3') switchTo('knife');
    if (k === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { var k = e.key.toLowerCase(); keys[k] = false; if (k === 'tab') showBoard(false); });
  canvas.addEventListener('mousedown', function (e) {
    if (G.menu) return; if (!locked && !TOUCH) { canvas.requestPointerLock && canvas.requestPointerLock(); }
    if (e.button === 0) { inp.fire = true; inp.edge = true; } else if (e.button === 2) setScope(!me.scoped);
  });
  window.addEventListener('mouseup', function (e) { if (e.button === 0) inp.fire = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('pointerlockchange', function () { locked = document.pointerLockElement === canvas; });
  document.addEventListener('mousemove', function (e) { if (!locked || G.menu) return; var s = me.scoped ? 0.0009 : 0.0023; me.yaw -= e.movementX * s; me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - e.movementY * s)); });
  // dokunmatik
  (function touch() {
    if (!TOUCH) return; $('touch').hidden = false;
    var joy = $('joy'), knob = joy.querySelector('i'), jid = null, jc = null;
    function jmove(e) { var dx = e.clientX - jc.x, dy = e.clientY - jc.y, l = Math.hypot(dx, dy), m = 55; if (l > m) { dx *= m / l; dy *= m / l; } knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; inp.r = dx / m; inp.f = -dy / m; }
    joy.addEventListener('pointerdown', function (e) { jid = e.pointerId; joy.setPointerCapture(jid); var r = joy.getBoundingClientRect(); jc = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; jmove(e); });
    joy.addEventListener('pointermove', function (e) { if (e.pointerId === jid) jmove(e); });
    function jend(e) { if (e.pointerId === jid) { jid = null; knob.style.transform = ''; inp.r = inp.f = 0; } } joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
    var look = $('look'), lid = null, lx = 0, ly = 0;
    look.addEventListener('pointerdown', function (e) { lid = e.pointerId; look.setPointerCapture(lid); lx = e.clientX; ly = e.clientY; });
    look.addEventListener('pointermove', function (e) { if (e.pointerId !== lid) return; var s = me.scoped ? 0.0018 : 0.0048; me.yaw -= (e.clientX - lx) * s; me.pitch = Math.max(-1.5, Math.min(1.5, me.pitch - (e.clientY - ly) * s)); lx = e.clientX; ly = e.clientY; });
    function lend(e) { if (e.pointerId === lid) lid = null; } look.addEventListener('pointerup', lend); look.addEventListener('pointercancel', lend);
    function hold(id, on, off) { var el = $(id); el.addEventListener('pointerdown', function (e) { e.preventDefault(); el.setPointerCapture(e.pointerId); on(); }); function up() { off && off(); } el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); }
    hold('bFire', function () { inp.fire = true; inp.edge = true; }, function () { inp.fire = false; });
    hold('bJump', function () { inp.jump = true; }, function () { inp.jump = false; });
    hold('bReload', reload); hold('bScope', function () { setScope(!me.scoped); });
    hold('bSwap', function () { var order = [me.primary, 'pistol', 'knife'].filter(Boolean), i = order.indexOf(me.cw); switchTo(order[(i + 1) % order.length]); });
    hold('bBuy', toggleShop); hold('bScore', function () { showBoard($('board').hidden); }); hold('bMenu', function () { if (confirm('Maçtan çıkıp menüye dönmek istiyor musun?')) leaveGame(); });
  })();

  /* ---------------- dükkân / skor / HUD ---------------- */
  function renderSlots() {
    var h = ''; [['1', me.primary], ['2', 'pistol'], ['3', 'knife']].forEach(function (s) { if (!s[1]) return; h += '<button type="button" data-w="' + s[1] + '" class="' + (me.cw === s[1] ? 'on' : '') + '">' + s[0] + ' · ' + WP[s[1]].n + '</button>'; });
    $('slots').innerHTML = h;
  }
  $('slots').addEventListener('pointerdown', function (e) { var b = e.target.closest('[data-w]'); if (b) switchTo(b.dataset.w); });
  function toggleShop() { if ($('shop').hidden) openShop(); else closeShop(); }
  function openShop() {
    if (!me.alive) return; if (document.exitPointerLock) document.exitPointerLock(); $('shop').hidden = false; renderShop();
  }
  function closeShop() { $('shop').hidden = true; }
  function renderShop() {
    $('shopMoney').textContent = '$' + me.money; var can = G.R.ph === 'buy' || G.R.ph === 'wait', h = '';
    ['smg', 'rifle', 'sniper'].forEach(function (id) { var w = WP[id]; h += '<button class="btn" type="button" data-buy="' + id + '"' + (!can || me.money < w.price || me.primary === id ? ' disabled' : '') + '><span>' + w.n + (me.primary === id ? ' ✓' : '') + '</span><span>$' + w.price + '</span></button>'; });
    h += '<button class="btn" type="button" data-buy="armor"' + (!can || me.money < ARMOR_PRICE || me.armor >= 100 ? ' disabled' : '') + '><span>🛡 Zırh</span><span>$' + ARMOR_PRICE + '</span></button>';
    if (!can) h += '<p style="color:#93a1c4;font-size:13px">Satın alma yalnızca tur başında (ilk 8 sn) yapılır.</p>';
    $('shopList').innerHTML = h;
  }
  $('shopList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-buy]'); if (!b || b.disabled) return; var id = b.dataset.buy;
    if (id === 'armor') { me.money -= ARMOR_PRICE; me.armor = 100; } else { me.money -= WP[id].price; me.primary = id; giveAmmo(id); me.cw = id; buildVM(); }
    renderSlots(); renderShop(); sfx('hit', 0.3);
  });
  $('shopClose').onclick = closeShop;
  function showBoard(on) {
    $('board').hidden = !on; if (!on) return; var rows = allPlayers().map(function (p) { return { n: p === me ? G.name : p.name, t: p.team, k: p.k || 0, d: p.d || 0, me: p === me, a: p.alive }; });
    rows.sort(function (a, b) { return b.k - a.k; });
    $('boardBody').innerHTML = '<table><tr><th>Oyuncu</th><th>Takım</th><th>Öl</th><th>Ölüm</th></tr>' + rows.map(function (r) { return '<tr class="' + (r.me ? 'me' : '') + '"><td>' + esc(r.n) + (r.a ? '' : ' ☠') + '</td><td class="t' + r.t + '">' + r.t + '</td><td>' + r.k + '</td><td>' + r.d + '</td></tr>'; }).join('') + '</table><p style="color:#93a1c4;font-size:13px">Tur skoru: Kırmızı ' + G.R.sT + ' – ' + G.R.sCT + ' Mavi</p>';
  }
  $('boardClose').onclick = function () { showBoard(false); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var last = { hp: '', ammo: '', money: '', tmr: '', feed: '' };
  function hud() {
    var hp = '❤ ' + Math.round(me.hp) + '<small>🛡 ' + Math.round(me.armor) + '</small>'; if (hp !== last.hp) { $('hp').innerHTML = hp; last.hp = hp; }
    var w = WP[me.cw], am = me.ammo[me.cw], reloading = performance.now() / 1000 < me.reloadEnd, a = w.mag ? (reloading ? '…' : am.mag) + '<small>' + w.n + ' · / ' + am.res + '</small>' : '—<small>' + w.n + '</small>'; if (a !== last.ammo) { $('ammo').innerHTML = a; last.ammo = a; }
    var mo = '$' + me.money; if (mo !== last.money) { $('money').textContent = mo; last.money = mo; }
    var r = G.R, now = snow(), left = r.ph === 'buy' ? BUY_MS - (now - r.t0) : r.ph === 'live' ? LIVE_MS - (now - r.t0) : r.ph === 'end' ? END_MS - (now - r.t0) : 0, s = Math.max(0, Math.ceil(left / 1000)), tm = r.ph === 'wait' ? '—' : Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) + (r.ph === 'buy' ? ' 🛒' : '');
    if (tm !== last.tmr) { $('tmr').textContent = tm; last.tmr = tm; } $('sT').textContent = r.sT; $('sCT').textContent = r.sCT;
    var t = performance.now(); G.feed = G.feed.filter(function (f) { return f.t > t; }); var fh = G.feed.map(function (f) { return '<div>' + esc(f.txt) + '</div>'; }).join(''); if (fh !== last.feed) { $('feed').innerHTML = fh; last.feed = fh; }
    if (t > msgT && $('msg').innerHTML) $('msg').innerHTML = '';
    if (t > hitT) $('cross').classList.remove('hit'); if (G.hurtT && t > G.hurtT) { $('vign').classList.remove('hurt'); G.hurtT = 0; }
    if (!$('shop').hidden && Math.random() < 0.1) renderShop();
  }

  /* ---------------- ana döngü ---------------- */
  var lastT = performance.now(), hostLocalT = 0, fp = 0;
  function frame() {
    requestAnimationFrame(frame); var now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (!G.mode) { renderer.render(scene, cam); return; }
    var ph = G.R.ph, frozen = ph === 'buy' && G.R.n > 0;
    if (me.alive && !frozen) {
      var f = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0) + inp.f, r = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0) + inp.r, l = Math.hypot(f, r); if (l > 1) { f /= l; r /= l; }
      var sy = Math.sin(me.yaw), cy = Math.cos(me.yaw), wx = -sy * f + cy * r, wz = -cy * f - sy * r, slow = keys['shift'] ? WALK : SPD, wpn = me.cw === 'knife' ? 1.08 : me.scoped ? 0.5 : 1;
      physics(me, dt, wx, wz, slow * wpn, inp.jump || keys[' ']);
      if (inp.fire && (WP[me.cw].auto || inp.edge)) shoot(); inp.edge = false;
    } else if (!me.alive) { me.vx = me.vz = 0; }
    me.sinceShot += dt;
    // kamera
    var spec = null; if (!me.alive) { allPlayers().forEach(function (p) { if (p !== me && p.alive && p.team === me.team && !spec) spec = p; }); }
    if (spec) { cam.position.set(spec.x, spec.y + EYE, spec.z); cam.rotation.set(spec.pitch || 0, spec.yaw || 0, 0); }
    else if (me.alive) { cam.position.set(me.x, me.y + EYE, me.z); cam.rotation.set(me.pitch, me.yaw, 0); }
    else { cam.position.set(me.x, me.y + 0.4, me.z); cam.rotation.set(-0.3, me.yaw, 0.6); }
    vm.visible = me.alive && !me.scoped && !spec; vmKick = Math.max(0, vmKick - dt * 9); if (vmMesh) { vmMesh.position.z = -0.4 + vmKick * 0.07; vmMesh.position.y = -0.19 - Math.sin(now / 130) * (Math.hypot(me.vx, me.vz) > 1 && me.ground ? 0.008 : 0); }
    flash.material.opacity = now < flashT ? 0.95 : 0;
    // botlar & uzaktan oyuncular
    if (G.mode === 'bots') bots.forEach(function (b) { botThink(b, dt); });
    Object.keys(G.ents).forEach(function (u) {
      var e = G.ents[u], m = e.mesh; if (!e.bot && e.tx !== undefined) { e.x += (e.tx - e.x) * Math.min(1, dt * 14); e.y += (e.ty - e.y) * Math.min(1, dt * 14); e.z += (e.tz - e.z) * Math.min(1, dt * 14); }
      if (e.x === undefined) return; m.visible = true; m.position.set(e.x, e.y, e.z); m.rotation.y = e.yaw || 0;
      if (!e.alive) { m.rotation.z = Math.min(1.5, (m.rotation.z || 0) + dt * 6); m.children[m.children.length - 1].visible = false; } else { m.rotation.z = 0; m.children[m.children.length - 1].visible = true; }
    });
    // tracer/kırıntı temizliği
    if (G.tracers) G.tracers = G.tracers.filter(function (t) { if (now > t.t) { scene.remove(t.l); return false; } return true; });
    if (G.bits) G.bits = G.bits.filter(function (b) { if (now > b.t) { scene.remove(b.m); return false; } b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt; b.vy -= 9 * dt; return true; });
    // kar
    var pos = flakes.geometry.attributes.position, arr = pos.array; for (var i = 0; i < arr.length; i += 3) { arr[i + 1] -= dt * 1.6; arr[i] += Math.sin(now / 900 + i) * dt * 0.2; if (arr[i + 1] < 0) { arr[i + 1] = 18; arr[i] = cam.position.x + (Math.random() - 0.5) * 50; arr[i + 2] = cam.position.z + (Math.random() - 0.5) * 50; } } pos.needsUpdate = true;
    // çevrimdışı: yerel tur yöneticisi
    if (G.mode === 'bots' && now - hostLocalT > 400) { hostLocalT = now; hostTick(); }
    hud(); renderer.render(scene, cam);
  }

  /* ---------------- menü / başlat ---------------- */
  function startGame(mode, room) {
    G.mode = null; G.menu = false; document.body.classList.add('playing'); $('menu').hidden = true; $('hud').hidden = false; resetInput(); G.R = { n: 0, ph: 'wait', t0: snow(), sT: 0, sCT: 0, win: '' }; G.lastN = -1; G.awarded = -1; G.feed = [];
    me.money = 800; me.primary = null; me.k = 0; me.d = 0; me.armor = 0; me.alive = false; me.hp = 0; Object.keys(G.ents).forEach(function (u) { scene.remove(G.ents[u].mesh); }); G.ents = {};
    if (mode === 'bots') { online = false; G.mode = 'bots'; me.team = 'T'; buildGrid(); spawnBots(); commit({ n: 1, ph: 'buy', t0: snow(), sT: 0, sCT: 0, win: '' }); }
    else netJoin(room).then(function () { if (isHost()) hostTick(); }, function (e) { alert('Odaya girilemedi: ' + (e && e.message)); leaveGame(); });
    if (mode === 'bots' && !me.alive) resetMe();
    me.cw = 'pistol'; renderSlots(); if (TOUCH) $('touch').hidden = false; audio();
  }
  function leaveGame() {
    netLeave(); G.mode = null; G.menu = true; online = false; document.body.classList.remove('playing'); $('menu').hidden = false; $('hud').hidden = true; setScope(false); closeShop(); showBoard(false); if (document.exitPointerLock) document.exitPointerLock();
    Object.keys(G.ents).forEach(function (u) { scene.remove(G.ents[u].mesh); }); G.ents = {}; bots = []; refreshRooms();
  }
  function refreshRooms() {
    if (!G.menu) return; var box = $('rooms'); if (!G.uid) return;
    [1, 2, 3].forEach(function (r) {
      db.ref('rp/cs/' + r + '/pl').once('value').then(function (s) {
        var pl = s.val() || {}, now = Date.now() + tOff, n = 0, t = 0, c = 0; Object.keys(pl).forEach(function (u) { if (now - (pl[u].at || 0) < 15000) { n++; if (pl[u].team === 'T') t++; else c++; } });
        var el = document.getElementById('room' + r); if (!el) { el = document.createElement('div'); el.className = 'room'; el.id = 'room' + r; box.appendChild(el); }
        el.innerHTML = '<div><b>Oda ' + r + '</b><small>' + (n ? n + ' oyuncu · 🔴' + t + ' 🔵' + c : 'Boş') + '</small></div><button class="btn pri" type="button" data-room="' + r + '"' + (n >= 8 ? ' disabled' : '') + '>Katıl</button>';
      }, function () {});
    });
  }
  $('rooms').addEventListener('click', function (e) { var b = e.target.closest('[data-room]'); if (b && G.uid) startGame('online', b.dataset.room); });
  $('btnBot').onclick = function () { if (!G.uid) { $('menuMsg').textContent = 'Önce ana sayfadan giriş yap.'; return; } startGame('bots'); };
  setInterval(refreshRooms, 4000);
  auth.onAuthStateChanged(function (u) {
    if (!u) { G.uid = null; $('menuMsg').innerHTML = 'Önce <a href="../" style="color:#9cf">ana sayfadan</a> giriş yap, sonra buraya dön.'; return; }
    G.uid = u.uid; db.ref('rp/users/' + u.uid + '/name').once('value').then(function (s) { G.name = s.val() || 'Oyuncu'; $('menuMsg').textContent = 'Merhaba ' + G.name + '!'; refreshRooms(); });
  });
  window.__cs = { me: me, G: G, WP: WP, hostTick: hostTick, shoot: shoot, ents: function () { return G.ents; }, rayWorld: rayWorld, los: los };
  requestAnimationFrame(frame);
})();
