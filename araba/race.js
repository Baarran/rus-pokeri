/* Neon Yarış — 8 kişiye kadar çok oyunculu arcade araba yarışı (Three.js + Firebase RTDB).
   Herkes kendi arabasını sürer ve durumunu yayınlar; güçlendirmeler (nitro, şok, mayın, yıldırım) olaylarla paylaşılır. */
(function () {
  'use strict';
  var T = window.THREE;
  function $(id) { return document.getElementById(id); }
  var TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  var CFG = { apiKey: 'AIzaSyBsP1VNPJpt1Y6MN0FwDCmvuHeZxaDoTGU', authDomain: 'ruspokeri-de28e.firebaseapp.com', databaseURL: 'https://ruspokeri-de28e-default-rtdb.europe-west1.firebasedatabase.app', projectId: 'ruspokeri-de28e' };
  if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(CFG);
  var db = firebase.database(), auth = firebase.auth(), tOff = 0;
  try { db.ref('.info/serverTimeOffset').on('value', function (s) { tOff = s.val() || 0; }); } catch (e) {}
  function snow() { return Date.now() + tOff; }
  var LAPS = 3, ROOMS = 6, MAXP = 8, N = 720, W = 13, COLORS = [0xff3b6b, 0x3bd4ff, 0xffd23b, 0x7bff3b, 0xb23bff, 0xff8a3b, 0xffffff, 0x3bffb2], CN = ['Kırmızı', 'Mavi', 'Sarı', 'Yeşil', 'Mor', 'Turuncu', 'Beyaz', 'Turkuaz'];

  /* ---------- pist ---------- */
  var CP = [[0, 0], [130, -15], [215, 45], [225, 140], [165, 205], [70, 175], [25, 235], [-65, 270], [-155, 225], [-150, 125], [-70, 85], [-125, 20], [-85, -45]];
  var PTS = [], DS = 0;
  (function buildTrack() {
    var dense = [], n = CP.length;
    function cr(p0, p1, p2, p3, t) { var t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); }
    for (var i = 0; i < n; i++) for (var k = 0; k < 60; k++) {
      var t = k / 60, a = CP[(i + n - 1) % n], b = CP[i], c = CP[(i + 1) % n], d = CP[(i + 2) % n];
      dense.push([cr(a[0], b[0], c[0], d[0], t), cr(a[1], b[1], c[1], d[1], t)]);
    }
    var cum = [0], m = dense.length, j;
    for (j = 1; j <= m; j++) { var p = dense[j % m], q = dense[j - 1]; cum.push(cum[j - 1] + Math.hypot(p[0] - q[0], p[1] - q[1])); }
    var L = cum[m]; DS = L / N; var di = 0;
    for (var s = 0; s < N; s++) {
      var target = s * DS; while (cum[di + 1] < target) di++;
      var f = (target - cum[di]) / (cum[di + 1] - cum[di]), a2 = dense[di % m], b2 = dense[(di + 1) % m];
      PTS.push({ x: a2[0] + (b2[0] - a2[0]) * f, z: a2[1] + (b2[1] - a2[1]) * f });
    }
    for (s = 0; s < N; s++) {
      var pa = PTS[(s + N - 2) % N], pb = PTS[(s + 2) % N], tx = pb.x - pa.x, tz = pb.z - pa.z, l = Math.hypot(tx, tz); tx /= l; tz /= l;
      PTS[s].tx = tx; PTS[s].tz = tz; PTS[s].nx = tz; PTS[s].nz = -tx;
    }
  })();
  function nearest(x, z, hint) {
    var best = 1e18, bi = 0, i, lo, hi;
    if (hint == null) { lo = 0; hi = N; } else { lo = -40; hi = 40; }
    for (var k = lo; k < hi; k += (hint == null ? 3 : 1)) {
      i = hint == null ? k : (hint + k + N) % N; var p = PTS[i], d = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
      if (d < best) { best = d; bi = i; }
    }
    if (hint == null) for (var k2 = -3; k2 <= 3; k2++) { i = (bi + k2 + N) % N; var p2 = PTS[i], d2 = (x - p2.x) * (x - p2.x) + (z - p2.z) * (z - p2.z); if (d2 < best) { best = d2; bi = i; } }
    var pp = PTS[bi]; return { i: bi, d: (x - pp.x) * pp.nx + (z - pp.z) * pp.nz, a: (x - pp.x) * pp.tx + (z - pp.z) * pp.tz };
  }

  /* ---------- sahne ---------- */
  var renderer, scene, camera, ready3d = false, carMeshes = {}, pickMeshes = [], mineMeshes = {}, mapCv, mapCtx;
  function init3d() {
    if (ready3d) return; ready3d = true;
    renderer = new T.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6)); renderer.setSize(innerWidth, innerHeight, false);
    scene = new T.Scene(); scene.background = new T.Color(0x0a0d2a); scene.fog = new T.Fog(0x0a0d2a, 60, 420);
    camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 0.5, 900);
    scene.add(new T.AmbientLight(0x8890d0, 0.9)); var dl = new T.DirectionalLight(0xffffff, 0.8); dl.position.set(0.4, 1, 0.3); scene.add(dl);
    var gnd = new T.Mesh(new T.PlaneGeometry(3000, 3000), new T.MeshLambertMaterial({ color: 0x0c1230 })); gnd.rotation.x = -Math.PI / 2; gnd.position.set(40, -0.1, 100); scene.add(gnd);
    // yol
    var pos = [], col = [], idx = [], i;
    for (i = 0; i < N; i++) { var p = PTS[i], c = (Math.floor(i / 4) % 2) ? 0.2 : 0.24; pos.push(p.x - p.nx * W, 0, p.z - p.nz * W, p.x + p.nx * W, 0, p.z + p.nz * W); col.push(c, c, c + .06, c, c, c + .06); }
    for (i = 0; i < N; i++) { var a = i * 2, b = ((i + 1) % N) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    var road = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide })); road.position.y = 0.02; scene.add(road);
    // orta çizgi + kenar neon duvarlar
    var lp = [], li = [], wl = [], wr = [], wi = [], cc = 0;
    for (i = 0; i < N; i++) {
      p = PTS[i]; var w = 0.35;
      lp.push(p.x - p.nx * w, 0.06, p.z - p.nz * w, p.x + p.nx * w, 0.06, p.z + p.nz * w);
      for (var sd = -1; sd <= 1; sd += 2) { var arr = sd < 0 ? wl : wr, ex = p.x + p.nx * (W + 0.6) * sd, ez = p.z + p.nz * (W + 0.6) * sd; arr.push(ex, 0, ez, ex, 1.3, ez); }
    }
    for (i = 0; i < N; i += 2) { var a1 = i * 2, b1 = ((i + 1) % N) * 2; li.push(a1, b1, a1 + 1, a1 + 1, b1, b1 + 1); }
    for (i = 0; i < N; i++) { var a3 = i * 2, b3 = ((i + 1) % N) * 2; wi.push(a3, b3, a3 + 1, a3 + 1, b3, b3 + 1); }
    function strip(posArr, ind, color) { var gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(posArr, 3)); gg.setIndex(ind); var m = new T.Mesh(gg, new T.MeshBasicMaterial({ color: color, side: T.DoubleSide })); scene.add(m); return m; }
    strip(lp, li, 0xe8e8ff); strip(wl, wi, 0x20e0ff); strip(wr, wi, 0xff30d0);
    // başlangıç kapısı + dekor kapılar
    function gate(i, color) {
      var p = PTS[i], m = new T.MeshBasicMaterial({ color: color }), y = Math.atan2(p.tx, p.tz);
      var gr = new T.Group(); var l = new T.Mesh(new T.BoxGeometry(1, 11, 1), m), r = l.clone(), b = new T.Mesh(new T.BoxGeometry(W * 2 + 2, 1.2, 1), m);
      l.position.set(-W - 0.5, 5.5, 0); r.position.set(W + 0.5, 5.5, 0); b.position.set(0, 11, 0); gr.add(l, r, b); gr.position.set(p.x, 0, p.z); gr.rotation.y = y - Math.PI / 2 + Math.PI / 2; gr.rotation.y = Math.atan2(-p.tz, p.tx) + Math.PI / 2 * 0; gr.rotation.y = y; gr.updateMatrix(); scene.add(gr);
      // kapı yüzü yola dik: gruptaki x ekseni = normal
      gr.rotation.y = y;
    }
    gate(0, 0xffffff); for (i = 90; i < N; i += 90) gate(i, i % 180 ? 0xff30d0 : 0x20e0ff);
    // başlangıç çizgisi
    var sg = new T.Group(), sl = new T.Mesh(new T.PlaneGeometry(W * 2, 2.4), new T.MeshBasicMaterial({ color: 0xffffff })); sl.rotation.x = -Math.PI / 2; sg.add(sl); sg.position.set(PTS[0].x, 0.07, PTS[0].z); sg.rotation.y = Math.atan2(PTS[0].tx, PTS[0].tz); scene.add(sg);
    // dekor kuleler
    var seed = 7; function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var cols = [0x1c2f6e, 0x4a1c6e, 0x1c5a6e, 0x6e1c4a];
    for (i = 0; i < 160; i++) {
      var q = PTS[Math.floor(r() * N)], sd2 = r() < .5 ? -1 : 1, off = W + 14 + r() * 90, hh = 8 + r() * 55, ww = 5 + r() * 10;
      var m2 = new T.Mesh(new T.BoxGeometry(ww, hh, ww), new T.MeshLambertMaterial({ color: cols[Math.floor(r() * 4)] })); m2.position.set(q.x + q.nx * off * sd2, hh / 2, q.z + q.nz * off * sd2);
      // yol üstüne taşmasın
      if (Math.abs(nearest(m2.position.x, m2.position.z).d) < W + 8) continue; scene.add(m2);
      var cap = new T.Mesh(new T.BoxGeometry(ww + .2, .6, ww + .2), new T.MeshBasicMaterial({ color: r() < .5 ? 0x20e0ff : 0xff30d0 })); cap.position.set(m2.position.x, hh, m2.position.z); scene.add(cap);
    }
    // güçlendirme kutuları
    for (i = 20; i < N; i += 60) for (var lane = -1; lane <= 1; lane++) {
      var pp = PTS[i], bx = new T.Mesh(new T.BoxGeometry(2.2, 2.2, 2.2), new T.MeshBasicMaterial({ color: 0xffe14a })); bx.position.set(pp.x + pp.nx * lane * 6, 1.6, pp.z + pp.nz * lane * 6); scene.add(bx);
      pickMeshes.push({ m: bx, x: bx.position.x, z: bx.position.z, off: 0 });
    }
    mapCv = $('mini'); mapCtx = mapCv.getContext('2d');
    addEventListener('resize', function () { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
  }
  function makeCar(color, name) {
    var g = new T.Group(), body = new T.Mesh(new T.BoxGeometry(2.2, 0.8, 4.4), new T.MeshLambertMaterial({ color: color })); body.position.y = 0.8; g.add(body);
    var cab = new T.Mesh(new T.BoxGeometry(1.7, 0.7, 2), new T.MeshLambertMaterial({ color: 0x111827 })); cab.position.set(0, 1.5, -0.2); g.add(cab);
    var wm = new T.MeshLambertMaterial({ color: 0x111111 }); [[-1.15, 1.4], [1.15, 1.4], [-1.15, -1.4], [1.15, -1.4]].forEach(function (w) { var wh = new T.Mesh(new T.CylinderGeometry(.55, .55, .5, 10), wm); wh.rotation.z = Math.PI / 2; wh.position.set(w[0], .55, w[1]); g.add(wh); });
    var glow = new T.Mesh(new T.PlaneGeometry(2.6, 5), new T.MeshBasicMaterial({ color: color, transparent: true, opacity: .55 })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.08; g.add(glow);
    var fl = new T.Mesh(new T.ConeGeometry(.55, 2.6, 8), new T.MeshBasicMaterial({ color: 0x66ccff })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, .8, -3.6); fl.visible = false; g.add(fl); g.userData.flame = fl; var sh = new T.Mesh(new T.SphereGeometry(3.2, 14, 10), new T.MeshBasicMaterial({ color: 0x40e0ff, transparent: true, opacity: .28 })); sh.position.y = 1.2; sh.visible = false; g.add(sh); g.userData.shield = sh;
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; var cx = cv.getContext('2d'); cx.font = 'bold 34px system-ui'; cx.textAlign = 'center'; cx.fillStyle = 'rgba(0,0,0,.5)'; cx.fillRect(0, 8, 256, 48); cx.fillStyle = '#fff'; cx.fillText(String(name).slice(0, 12), 128, 46);
    var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), depthTest: false, transparent: true })); sp.scale.set(6, 1.5, 1); sp.position.y = 4.6; sp.renderOrder = 9; g.add(sp);
    scene.add(g); return g;
  }

  /* ---------- oyun durumu ---------- */
  var G = { room: 0, base: null, uid: null, name: 'Oyuncu', st: null, pl: {}, me: null, cars: {}, bots: {}, mines: {}, evSeen: {}, joinAt: 0, active: false, rooms: {}, lastNo: -1, shownRes: false, flash: 0, inLobby: false, ready: false, cfg: { bots: true, laps: 3 } };
  var keys = { l: 0, r: 0, g: 0, b: 0 }, steerIn = 0, wantItem = false, running = false;

  function newCar(slot, uid) {
    var s = slot || 0, i = 26 - Math.floor(s / 2) * 6, p = PTS[i], off = (s % 2 ? 5 : -5);
    var x = p.x + p.nx * off, z = p.z + p.nz * off;
    return { uid: uid, slot: s, x: x, z: z, h: Math.atan2(p.tx, p.tz), vx: 0, vz: 0, idx: i, lap: 0, total: i, boost: 0, stun: 0, fin: 0, speed: 0, vf: 0, item: null, steer: 0, auto: false, hint: i, off: 0, spin: 0 };
  }
  function stepCar(c, dt, inp) {
    var f = { x: Math.sin(c.h), z: Math.cos(c.h) }, r = { x: Math.cos(c.h), z: -Math.sin(c.h) };
    var vf = c.vx * f.x + c.vz * f.z, vl = c.vx * r.x + c.vz * r.z;
    var near = nearest(c.x, c.z, c.hint); c.hint = near.i; var off = Math.abs(near.d) > W - 1;
    var maxv = (c.boost > 0 ? 98 : 64) * (c.stun > 0 ? .5 : 1) * (off ? 0.55 : 1);
    if (c.stun > 0) { c.stun -= dt; c.h += 9 * dt * (c.stun > .5 ? 1 : 0); vf *= Math.exp(-2.2 * dt); inp = { g: 0, b: 0, s: 0, d: 0 }; }
    if (c.boost > 0) { c.boost -= dt; vf += 90 * dt; }
    if (inp.g) vf += (maxv - vf) * (c.boost > 0 ? 1.6 : 0.62) * dt;
    if (inp.b) vf -= 60 * dt; vf *= Math.exp(-0.22 * dt); if (vf > maxv && c.boost <= 0) vf -= (vf - maxv) * 3 * dt;
    if (vf < -12) vf = -12;
    if (inp.d && Math.abs(c.steer) > 0.3 && vf > 20) c.dr = (c.dr || 0) + dt; else { if (c.dr > 0.9 && c.stun <= 0) { c.boost = Math.max(c.boost, 1.2); c.mt = 1; } c.dr = 0; }
    var grip = inp.d ? 2.4 : 7.5; vl *= Math.exp(-grip * dt);
    c.steer += (inp.s - c.steer) * Math.min(1, 9 * dt);
    var turn = 2.15 / (1 + Math.max(0, vf) / 55) * (inp.d ? 1.5 : 1);
    c.h -= c.steer * turn * Math.max(-1, Math.min(1, vf / 14)) * dt;
    f = { x: Math.sin(c.h), z: Math.cos(c.h) }; r = { x: Math.cos(c.h), z: -Math.sin(c.h) };
    c.vx = f.x * vf + r.x * vl; c.vz = f.z * vf + r.z * vl;
    c.x += c.vx * dt; c.z += c.vz * dt;
    var nr = nearest(c.x, c.z, c.hint); c.hint = nr.i;
    if (Math.abs(nr.d) > W + 1.4) { // duvar
      var s = nr.d > 0 ? 1 : -1, p = PTS[nr.i], over = Math.abs(nr.d) - (W + 1.4);
      c.x -= p.nx * s * over; c.z -= p.nz * s * over;
      var vn = c.vx * p.nx * s + c.vz * p.nz * s; if (vn > 0) { c.vx -= p.nx * s * vn * 1.4; c.vz -= p.nz * s * vn * 1.4; c.vx *= .94; c.vz *= .94; c.hit = (c.hit || 0) + 1; }
    }
    // tur sayımı
    var d = nr.i - c.idx; if (d < -N / 2) c.lap++; else if (d > N / 2) c.lap--; c.idx = nr.i; c.total = c.lap * N + nr.i + nr.a / DS;
    c.speed = Math.hypot(c.vx, c.vz); c.vf = vf;
  }
  function botInput(c, rank, leaderTotal) {
    var look = (c.idx + 12 + Math.floor(c.speed / 10)) % N, tp = PTS[look], lane = c.bl || 0;
    var tx = tp.x + tp.nx * lane, tz = tp.z + tp.nz * lane, want = Math.atan2(tx - c.x, tz - c.z), dh = want - c.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    var a = PTS[c.idx], b = PTS[(c.idx + 30) % N], curv = Math.abs(a.tx * b.tz - a.tz * b.tx), skill = c.skill || 0.9;
    var cap = Math.max(34, 64 - curv * 32) * skill * (1 + Math.min(.08, Math.max(-.05, ((leaderTotal || 0) - c.total) / 3000)));
    return { g: c.speed < cap ? 1 : 0, b: c.speed > cap + 14 ? 1 : 0, s: Math.max(-1, Math.min(1, -dh * 2.4)), d: 0 };
  }

  /* ---------- ağ ---------- */
  function hostUid() {
    var now = snow(), ids = Object.keys(G.pl).filter(function (u) { var p = G.pl[u]; return !p.b && now - p.a < 6000 && G.st && G.st.grid && G.st.grid[u] != null; }).sort(); return ids[0] || null;
  }
  function roomIds() { var now = snow(); return Object.keys(G.pl).filter(function (u) { var p = G.pl[u]; return now - p.a < 6000 && (!p.b || true); }); }
  function joinRoom(n) {
    G.room = n; G.base = db.ref('rp/car/' + n); G.pl = {}; G.st = null; G.me = null; G.mines = {}; G.evSeen = {}; G.joinAt = snow(); G.lastNo = -1; G.cars = {}; G.bots = {}; G.shownRes = false; G.inLobby = true; G.ready = false; G.cfg = { bots: true, laps: 3 };
    init3d();
    var me = G.base.child('pl/' + G.uid); me.onDisconnect().remove();
    me.set({ n: G.name, x: 0, z: 0, h: 0, v: 0, p: 0, f: 0, l: 1, r: 0, a: snow() });
    G.base.child('pl').on('value', function (s) { G.pl = s.val() || {}; });
    G.base.child('st').on('value', function (s) { G.st = s.val(); onStChange(); });
    G.base.child('ev').on('child_added', onEv);
    G.base.child('cfg').on('value', function (s) { var v = s.val(); if (v) G.cfg = { bots: v.bots !== false, laps: v.laps || 3 }; renderLobby(true); });
    audio(); $('menu').hidden = true; $('hud').hidden = false; $('mute').hidden = false; $('leave').hidden = false; $('pad').hidden = !TOUCH; running = true; last = performance.now();
    try { var pr = db.ref('rp/online/' + G.uid); pr.onDisconnect().remove(); pr.set('car'); } catch (e) {}
  }
  function leaveRoom() {
    if (!G.base) return; running = false;
    G.base.child('pl').off(); G.base.child('st').off(); G.base.child('ev').off(); G.base.child('cfg').off(); $('lobby').hidden = true;
    G.base.child('pl/' + G.uid).remove().catch(function () {});
    Object.keys(G.bots).forEach(function (b) { G.base.child('pl/' + b).remove().catch(function () {}); });
    Object.keys(carMeshes).forEach(function (u) { scene.remove(carMeshes[u]); }); carMeshes = {};
    Object.keys(mineMeshes).forEach(function (u) { scene.remove(mineMeshes[u]); }); mineMeshes = {};
    G.base = null; G.me = null; G.bots = {}; $('hud').hidden = true; $('pad').hidden = true; $('leave').hidden = true; $('mute').hidden = true; $('res').hidden = true; $('cnt').textContent = '';
    try { db.ref('rp/online/' + G.uid).set('car'); } catch (e) {}
    showMenu();
  }
  function lobbyHumans() { var now = snow(); return Object.keys(G.pl).filter(function (u) { var p = G.pl[u]; return !p.b && now - p.a < 6000 && p.l === 1; }).sort(); }
  function lobbyHost() { return lobbyHumans()[0] || null; }
  function raceBusy() {
    var st = G.st, now = snow(); if (!st || !st.grid || now < st.t0 || now - st.t0 > 420000) return false;
    return Object.keys(st.grid).some(function (u) { var p = G.pl[u]; return u.indexOf('bot') !== 0 && p && now - p.a < 6000 && !p.f && p.l !== 1; });
  }
  function canStart() {
    var hs = lobbyHumans(), host = lobbyHost(); if (host !== G.uid) return 'Başlatma yetkisi oda sahibinde';
    if (raceBusy()) return 'Önceki yarış sürüyor';
    var wait = hs.filter(function (u) { return u !== host && !G.pl[u].r; }); if (wait.length) return wait.length + ' kişi hazır değil';
    if (hs.length < 2 && !G.cfg.bots) return 'En az 2 oyuncu gerekir (ya da botları aç)';
    return '';
  }
  function startRace() {
    if (canStart()) return; var now = snow(), humans = lobbyHumans().slice(0, MAXP), grid = {}, k = 0;
    humans.forEach(function (u) { grid[u] = k++; });
    var nb = 0; if (G.cfg.bots) while (k < MAXP) { grid['bot' + (++nb)] = k++; }
    var no = (G.st && G.st.no || 0) + 1;
    G.base.child('ev').remove().catch(function () {});
    G.base.child('st').set({ no: no, t0: now + 5000, grid: grid, nb: nb, laps: G.cfg.laps || 3 });
  }
  function setCfg(o) { G.cfg = Object.assign({}, G.cfg, o); G.base.child('cfg').set(G.cfg).catch(function () {}); renderLobby(true); }
  function toggleReady() { G.ready = !G.ready; renderLobby(true); }
  function backToLobby() { G.inLobby = true; G.ready = false; G.me = null; G.shownRes = true; $('res').hidden = true; $('cnt').textContent = ''; renderLobby(true); }
  var lobSig = '';
  function renderLobby(force) {
    var el = $('lobby'); if (!G.base) { el.hidden = true; return; }
    el.hidden = !G.inLobby; $('hud').hidden = G.inLobby; $('pad').hidden = G.inLobby || !TOUCH; $('leave').hidden = G.inLobby; if (!G.inLobby) return;
    var now = snow(), hs = lobbyHumans(), host = lobbyHost(), others = Object.keys(G.pl).filter(function (u) { var p = G.pl[u]; return !p.b && now - p.a < 6000 && p.l !== 1; });
    var why = canStart(), isHost = host === G.uid;
    var sig = JSON.stringify([hs.map(function (u) { return [u, G.pl[u].n, G.pl[u].r]; }), others.length, host, G.cfg, why, G.ready, raceBusy()]); if (sig === lobSig && !force) return; lobSig = sig;
    var rows = ''; for (var i = 0; i < MAXP; i++) {
      var u = hs[i], c = '#' + ('000000' + COLORS[i].toString(16)).slice(-6);
      if (u) { var p = G.pl[u]; rows += '<div class="lrow"><i style="background:' + c + '"></i><span>' + esc(p.n) + (u === G.uid ? ' <small>(sen)</small>' : '') + (u === host ? ' 👑' : '') + '</span><b class="' + (u === host || p.r ? 'ok' : 'wt') + '">' + (u === host ? 'Oda sahibi' : p.r ? '✓ Hazır' : 'Bekliyor') + '</b></div>'; }
      else rows += '<div class="lrow emp"><i style="background:#2a3463"></i><span>' + (G.cfg.bots ? '🤖 Bot' : 'Boş koltuk') + '</span><b></b></div>';
    }
    var h = '<div class="card"><h1>ODA ' + G.room + '</h1><div class="sub">' + hs.length + '/' + MAXP + ' oyuncu · ' + G.cfg.laps + ' tur' + (others.length ? ' · ' + others.length + ' kişi yarışta' : '') + '</div>' + rows;
    if (isHost) h += '<div class="lopt"><label>Tur <select id="oLaps">' + [1, 2, 3, 5].map(function (n) { return '<option' + (G.cfg.laps === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label><label><input type="checkbox" id="oBots"' + (G.cfg.bots ? ' checked' : '') + '> Boşları botla doldur</label></div>';
    h += '<div style="display:flex;gap:8px;margin-top:12px">' + (isHost ? '<button class="btn pri" id="lStart" type="button" style="flex:1"' + (why ? ' disabled' : '') + '>🏁 Yarışı başlat</button>' : '<button class="btn pri" id="lReady" type="button" style="flex:1">' + (G.ready ? '✓ Hazırsın (iptal)' : '✋ Hazırım') + '</button>') + '<button class="btn" id="lOut" type="button">Çık</button></div>';
    h += '<div class="help" style="text-align:center">' + (isHost ? (why || 'Herkes hazır — başlatabilirsin!') : (G.ready ? 'Oda sahibi başlatınca yarış açılır.' : 'Hazır olunca “Hazırım”a bas.')) + '</div></div>';
    el.innerHTML = h;
    if ($('lStart')) $('lStart').onclick = startRace; if ($('lReady')) $('lReady').onclick = toggleReady; $('lOut').onclick = leaveRoom;
    if ($('oLaps')) $('oLaps').onchange = function () { setCfg({ laps: +this.value }); }; if ($('oBots')) $('oBots').onchange = function () { setCfg({ bots: this.checked }); };
  }
  setInterval(function () { renderLobby(false); }, 400);
  function onStChange() {
    var st = G.st; if (!st || st.no === G.lastNo) return;
    G.lastNo = st.no; G.mines = {}; G.shownRes = false; $('res').hidden = true; G.bots = {}; G.evSeen = {};
    Object.keys(mineMeshes).forEach(function (u) { scene.remove(mineMeshes[u]); }); mineMeshes = {};
    var slot = st.grid && st.grid[G.uid];
    LAPS = st.laps || 3; if (slot != null) { G.me = newCar(slot, G.uid); G.me.name = G.name; G.active = true; G.inLobby = false; G.ready = false; }
    else { G.me = null; G.active = false; }
    pickMeshes.forEach(function (p) { p.off = 0; });
  }
  function onEv(s) {
    var e = s.val(), key = s.key; if (!e || G.evSeen[key]) return; G.evSeen[key] = 1;
    var now = snow(); if (now - e.at > 40000) return;
    var host = hostUid() === G.uid;
    if (e.t === 'mine' || e.t === 'oil') { G.mines[e.id] = { x: e.x, z: e.z, at: e.at, k: e.t, from: e.from }; }
    else if (e.t === 'emp') {
      if (e.from !== G.uid && G.me && Math.hypot(G.me.x - e.x, G.me.z - e.z) < e.r) hitMe(0.9, .5);
      if (host) Object.keys(G.bots).forEach(function (u) { var b = G.bots[u]; if (Math.hypot(b.x - e.x, b.z - e.z) < e.r) { b.stun = 0.9; b.boost = 0; } });
    }
    else if (e.t === 'mh') { delete G.mines[e.id]; }
    else if (e.t === 'shock' || e.t === 'bolt') {
      if (e.to === G.uid && G.me) hitMe(e.t === 'bolt' ? 2.0 : 1.4, 1);
      else if (host && G.bots[e.to]) { G.bots[e.to].stun = e.t === 'bolt' ? 2.0 : 1.4; G.bots[e.to].boost = 0; }
    }
  }
  function sendEv(o) { o.at = snow(); o.from = G.uid; G.base.child('ev/' + o.at.toString(36) + Math.random().toString(36).slice(2, 5)).set(o).catch(function () {}); }

  /* ---------- güçlendirme ---------- */
  var ITEMS = { nitro: { ic: '🚀', n: 'Nitro' }, shield: { ic: '🛡', n: 'Kalkan' }, shock: { ic: '⚡', n: 'Şok' }, mine: { ic: '💣', n: 'Mayın' }, oil: { ic: '🛢', n: 'Yağ' }, bolt: { ic: '🌩', n: 'Yıldırım' }, emp: { ic: '📡', n: 'EMP' } };
  function rollItem() {
    var rk = allRank(), my = rk.findIndex(function (r) { return r.id === G.uid; }), back = rk.length > 2 && my >= rk.length / 2, r = Math.random();
    var tbl = back ? [['nitro', .3], ['bolt', .22], ['shield', .12], ['emp', .12], ['shock', .1], ['mine', .07], ['oil', .07]] : [['nitro', .2], ['shield', .18], ['shock', .17], ['mine', .15], ['oil', .12], ['emp', .12], ['bolt', .06]];
    for (var i = 0; i < tbl.length; i++) { r -= tbl[i][1]; if (r <= 0) return tbl[i][0]; } return 'nitro';
  }
  function hitMe(t, flash) {
    var m = G.me; if (!m) return false;
    if (m.shield > 0) { m.shield = 0; toast('🛡 Kalkan seni korudu!'); blip(520, .15); return false; }
    m.stun = t; m.boost = 0; G.flash = flash || 1; blip(120, .3); return true;
  }
  function allRank() {
    var list = []; list.push({ id: G.uid, key: G.me ? (G.me.fin ? 1e9 - G.me.fin : G.me.total) : -1, name: G.name, fin: G.me ? G.me.fin : 0 });
    Object.keys(G.pl).forEach(function (u) { if (u === G.uid) return; var p = G.pl[u]; if (snow() - p.a > 6000) return; list.push({ id: u, key: p.f ? 1e9 - p.f : p.p, name: p.n, fin: p.f }); });
    list.sort(function (a, b) { return b.key - a.key; }); return list;
  }
  function useItem(back) {
    var m = G.me; if (!m || !m.item || m.stun > 0) return; var it = m.item;
    var rank = allRank(), my = rank.findIndex(function (r) { return r.id === G.uid; }), tg = rank[my + (back ? 1 : -1)], fx = Math.sin(m.h), fz = Math.cos(m.h), dist = back ? -4 : 20;
    if (it === 'nitro') { m.boost = 3; }
    else if (it === 'shield') { m.shield = 9; toast('🛡 Kalkan açık'); }
    else if (it === 'mine' || it === 'oil') { sendEv({ t: it, id: G.uid + snow().toString(36), x: m.x + fx * dist, z: m.z + fz * dist }); }
    else if (it === 'emp') { sendEv({ t: 'emp', x: m.x, z: m.z, r: 50 }); toast('📡 EMP yayıldı'); }
    else if (it === 'shock') { if (!tg) { toast(back ? 'Arkanda kimse yok!' : 'Önünde kimse yok!'); return; } sendEv({ t: 'shock', to: tg.id }); toast('⚡ Şok → ' + tg.name); }
    else if (it === 'bolt') { var ld = rank[0]; if (!ld || ld.id === G.uid) { toast('Liderin sensin!'); return; } sendEv({ t: 'bolt', to: ld.id }); toast('🌩 Yıldırım → ' + ld.name); }
    blip(it === 'nitro' ? 700 : 400, .2); m.item = null;
  }
  function respawn() {
    var m = G.me; if (!m) return; var p = PTS[m.idx]; m.x = p.x; m.z = p.z; m.h = Math.atan2(p.tx, p.tz); m.vx = m.vz = 0; m.stun = 0; m.boost = 0; m.stuck = 0; m.hint = m.idx; m.steer = 0; toast('Yola geri konuldun');
  }
  var AC = null, eng = null, muted = false;
  function audio() {
    if (AC || muted) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); eng = AC.createOscillator(); var gn = AC.createGain(); eng.type = 'sawtooth'; gn.gain.value = 0.025; eng.connect(gn); gn.connect(AC.destination); eng.frequency.value = 50; eng.start(); eng.g = gn; } catch (e) { AC = null; }
  }
  function blip(f, d) { if (!AC || muted) return; try { var o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; o.type = 'square'; g.gain.value = .05; g.gain.exponentialRampToValueAtTime(.001, AC.currentTime + d); o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + d); } catch (e) {} }
  var toastT = 0; function toast(t) { $('msg').textContent = t; toastT = 1.6; }

  /* ---------- döngü ---------- */
  var last = 0, acc = 0, sendT = 0, camPos = new T.Vector3(), lookP = new T.Vector3(), fov = 68, resSent = false;
  function loop(ts) {
    requestAnimationFrame(loop); if (!running || !G.base) { if (ready3d && !G.base) { renderer.render(scene, camera); } return; }
    var dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts; acc += dt;
    var now = snow(), st = G.st, phase = !st ? 'wait' : now < st.t0 ? 'count' : 'race';
    var steerTarget = keys.r - keys.l; if (TOUCH && !keys.l && !keys.r) steerTarget = 0;
    while (acc >= 1 / 60) {
      acc -= 1 / 60; var m = G.me;
      if (m && phase !== 'wait') {
        if (phase === 'count') { m.vx = m.vz = 0; m.speed = 0; }
        else {
          var inp = m.fin || m.auto ? botInput(m, 0, 0) : { g: TOUCH ? 1 : keys.g, b: keys.b, s: steerTarget, d: keys.b && Math.abs(steerTarget) ? 1 : 0 };
          if (m.fin) { inp = botInput(m, 0, 0); inp.g = 1; }
          stepCar(m, 1 / 60, inp); if (m.shield > 0) m.shield -= 1 / 60;
          if (m.speed < 4 && !m.fin) { m.stuck = (m.stuck || 0) + 1 / 60; if (m.stuck > 3.5) respawn(); } else m.stuck = 0;
          if (m.mt) { m.mt = 0; toast('🔥 Drift turbo!'); blip(800, .2); }
          if (m.lap > (m.lapSeen || 0)) { m.lapSeen = m.lap; var lt = snow() - (m.lapT || st.t0); m.lapT = snow(); if (m.lap < LAPS) toast('Tur ' + m.lap + ' · ' + fmtT(lt)); }
          // güçlendirme kutusu
          pickMeshes.forEach(function (p) { if (p.off > 0) return; if (!m.item && Math.hypot(m.x - p.x, m.z - p.z) < 3.2) { m.item = rollItem(); p.off = 5; blip(660, .12); } else if (m.item && Math.hypot(m.x - p.x, m.z - p.z) < 3.2) p.off = 3; });
          // mayın
          Object.keys(G.mines).forEach(function (id) { var mi = G.mines[id]; if (Math.hypot(m.x - mi.x, m.z - mi.z) < 3.4 && m.stun <= 0 && !(mi.from === G.uid && snow() - mi.at < 3500)) { hitMe(mi.k === 'oil' ? 0.7 : 1.2, .6); sendEv({ t: 'mh', id: id }); delete G.mines[id]; } if (mi && snow() - mi.at > 40000) delete G.mines[id]; });
          // araç çarpışması
          Object.keys(G.pl).forEach(function (u) { var c = G.cars[u]; if (!c || u === G.uid) return; var dx = m.x - c.x, dz = m.z - c.z, d = Math.hypot(dx, dz); if (d < 3.4 && d > .01) { var pu = (3.4 - d) * .5; m.x += dx / d * pu; m.z += dz / d * pu; m.vx *= .985; m.vz *= .985; } });
          if (!m.fin && m.lap >= LAPS) { m.fin = Math.max(1, Math.round(snow() - st.t0)); }
        }
      }
      // botlar (yalnızca ev sahibi)
      if (st && st.grid && hostUid() === G.uid && phase !== 'wait') {
        var rk = allRank(), leader = rk.length ? rk[0].key : 0;
        Object.keys(st.grid).forEach(function (u) {
          if (u.indexOf('bot') !== 0) return;
          var b = G.bots[u]; if (!b) { b = G.bots[u] = newCar(st.grid[u], u); b.name = 'Bot ' + u.slice(3); b.skill = 0.82 + Math.random() * 0.14; b.bl = (Math.random() - .5) * 10; var sv = G.pl[u]; if (sv && sv.a > st.t0 - 1000) { b.x = sv.x; b.z = sv.z; b.h = sv.h; b.hint = null; var nn = nearest(b.x, b.z); b.hint = nn.i; b.idx = nn.i; b.lap = Math.floor(sv.p / N); b.fin = sv.f || 0; } }
          if (phase === 'count') { b.vx = b.vz = 0; return; }
          if (!b.fin && b.lap >= LAPS) b.fin = Math.max(1, Math.round(snow() - st.t0));
          var bi = botInput(b, 0, leader); if (b.fin) bi.g = 1;
          stepCar(b, 1 / 60, bi);
          Object.keys(G.mines).forEach(function (id) { var mi = G.mines[id]; if (mi && b.stun <= 0 && Math.hypot(b.x - mi.x, b.z - mi.z) < 3.4 && !(mi.from === u && snow() - mi.at < 3500)) { b.stun = mi.k === 'oil' ? 0.7 : 1.2; sendEv({ t: 'mh', id: id }); delete G.mines[id]; } });
        });
      }
    }
    if (wantItem) { var wi = wantItem; wantItem = false; useItem(wi === 2); }
    // yayın
    sendT += dt; if (sendT > 0.1) {
      sendT = 0; var u = G.me;
      G.base.child('pl/' + G.uid).set({ n: G.name, x: u ? +u.x.toFixed(2) : 0, z: u ? +u.z.toFixed(2) : 0, h: u ? +u.h.toFixed(3) : 0, v: u ? +(u.speed || 0).toFixed(1) : 0, p: u ? +u.total.toFixed(2) : 0, f: u ? u.fin : 0, l: G.inLobby ? 1 : 0, r: G.ready ? 1 : 0, bo: u && u.boost > 0 ? 1 : 0, sp: u && u.stun > 0 ? 1 : 0, sh: u && u.shield > 0 ? 1 : 0, a: snow() }).catch(function () {});
      Object.keys(G.bots).forEach(function (id) { var b = G.bots[id]; G.base.child('pl/' + id).set({ n: b.name, b: 1, x: +b.x.toFixed(2), z: +b.z.toFixed(2), h: +b.h.toFixed(3), v: +(b.speed || 0).toFixed(1), p: +b.total.toFixed(2), f: b.fin, bo: b.boost > 0 ? 1 : 0, sp: b.stun > 0 ? 1 : 0, a: snow() }).catch(function () {}); });
    }
    render(dt, phase); hud(phase); results(phase);
  }
  function carFor(u, slot, name) {
    if (!carMeshes[u]) { carMeshes[u] = makeCar(COLORS[(slot || 0) % 8], name); } return carMeshes[u];
  }
  function render(dt, phase) {
    var st = G.st, slotOf = function (u) { return st && st.grid && st.grid[u] != null ? st.grid[u] : 0; }, now = snow();
    // diğer araçlar (ağdan)
    Object.keys(G.pl).forEach(function (u) {
      var p = G.pl[u]; if (u === G.uid) return; if (now - p.a > 6000) { if (carMeshes[u]) { scene.remove(carMeshes[u]); delete carMeshes[u]; delete G.cars[u]; } return; }
      if (G.bots[u]) return; // yerelde sürülüyor
      var c = G.cars[u] || (G.cars[u] = { x: p.x, z: p.z, h: p.h }); var age = Math.min(0.35, (now - p.a) / 1000), tx = p.x + Math.sin(p.h) * p.v * age, tz = p.z + Math.cos(p.h) * p.v * age, k = Math.min(1, 12 * dt);
      c.x += (tx - c.x) * k; c.z += (tz - c.z) * k; var dh = p.h - c.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; c.h += dh * k; c.bo = p.bo; c.sp = p.sp; c.sh = p.sh; c.v = p.v;
    });
    Object.keys(G.bots).forEach(function (u) { G.cars[u] = G.bots[u]; G.cars[u].bo = G.bots[u].boost > 0; G.cars[u].sp = G.bots[u].stun > 0; G.cars[u].v = G.bots[u].speed; });
    var drawList = Object.keys(G.cars).filter(function (u) { return u !== G.uid && G.pl[u] && now - G.pl[u].a < 6000; });
    drawList.forEach(function (u) { var c = G.cars[u], mesh = carFor(u, slotOf(u), G.pl[u].n); mesh.position.set(c.x, 0, c.z); mesh.rotation.y = c.h + (c.sp ? Date.now() / 60 : 0); mesh.userData.flame.visible = !!c.bo; mesh.userData.shield.visible = !!c.sh; });
    var m = G.me; if (m) { var mm = carFor(G.uid, m.slot, G.name); mm.children[mm.children.length - 1].visible = false; mm.position.set(m.x, 0, m.z); mm.rotation.y = m.h + (m.stun > .5 ? Date.now() / 60 : 0); mm.rotation.z = -m.steer * Math.min(1, (m.speed || 0) / 60) * .12; mm.userData.flame.visible = m.boost > 0; mm.userData.shield.visible = m.shield > 0; }
    // mayınlar
    Object.keys(G.mines).forEach(function (id) { if (!mineMeshes[id]) { var oil = G.mines[id].k === 'oil', c2 = oil ? new T.Mesh(new T.CircleGeometry(3, 16), new T.MeshBasicMaterial({ color: 0x050508 })) : new T.Mesh(new T.ConeGeometry(1.2, 1.8, 7), new T.MeshBasicMaterial({ color: 0xff3300 })); if (oil) { c2.rotation.x = -Math.PI / 2; c2.position.set(G.mines[id].x, 0.09, G.mines[id].z); } else c2.position.set(G.mines[id].x, 1, G.mines[id].z); c2.userData.oil = oil; scene.add(c2); mineMeshes[id] = c2; } if (!mineMeshes[id].userData.oil) mineMeshes[id].rotation.y += dt * 3; });
    Object.keys(mineMeshes).forEach(function (id) { if (!G.mines[id]) { scene.remove(mineMeshes[id]); delete mineMeshes[id]; } });
    pickMeshes.forEach(function (p) { if (p.off > 0) p.off -= dt; p.m.visible = p.off <= 0; p.m.rotation.y += dt * 2; p.m.rotation.x += dt; });
    // kamera
    if (G.inLobby) { Object.keys(carMeshes).forEach(function (u) { carMeshes[u].visible = false; }); var ang = Date.now() / 5000, c0 = PTS[0]; camera.position.set(c0.x + Math.cos(ang) * 28, 12, c0.z + Math.sin(ang) * 28); camera.lookAt(c0.x, 2, c0.z); $('fx').style.opacity = 0; renderer.render(scene, camera); return; }
    Object.keys(carMeshes).forEach(function (u) { carMeshes[u].visible = true; });
    var tgt = m || (function () { var rk = allRank(); var l = rk.find(function (r) { return G.cars[r.id]; }); return l ? G.cars[l.id] : null; })();
    if (tgt) {
      var spd = m ? m.speed || 0 : tgt.v || 0, bo = m ? m.boost > 0 : tgt.bo, f = { x: Math.sin(tgt.h), z: Math.cos(tgt.h) };
      var back = 9 + Math.min(5, spd / 14), cx = tgt.x - f.x * back, cz = tgt.z - f.z * back; if (!camPos.lengthSq()) camPos.set(cx, 4.5, cz);
      var kk = Math.min(1, 7 * dt); camPos.x += (cx - camPos.x) * kk; camPos.z += (cz - camPos.z) * kk; camPos.y = 4.2 + spd / 40;
      camera.position.copy(camPos); lookP.set(tgt.x + f.x * 7, 1.5, tgt.z + f.z * 7); camera.lookAt(lookP);
      var tf = 66 + Math.min(28, spd * 0.28) + (bo ? 14 : 0); fov += (tf - fov) * Math.min(1, 5 * dt); camera.fov = fov; camera.updateProjectionMatrix();
      $('fx').style.opacity = Math.min(1, Math.max(0, (spd - 55) / 50) + (bo ? .5 : 0));
    }
    if (G.flash > 0) { G.flash -= dt * 2.5; $('flash').style.opacity = Math.max(0, G.flash) * .8; } else $('flash').style.opacity = 0;
    renderer.render(scene, camera);
  }
  function ordinal(n) { return n; }
  function hud(phase) {
    var st = G.st, m = G.me, now = snow();
    if (toastT > 0) { toastT -= 1 / 60; if (toastT <= 0) $('msg').textContent = ''; }
    var rk = allRank(), my = rk.findIndex(function (r) { return r.id === G.uid; });
    $('pos').innerHTML = m ? (my + 1) + '<small>/' + rk.length + '</small>' : '';
    $('lap').textContent = m ? 'Tur ' + Math.min(LAPS, Math.max(1, m.lap + 1)) + '/' + LAPS : (G.st ? 'İzliyorsun' : '');
    $('spd').innerHTML = m ? Math.round((m.speed || 0) * 3.6) + '<small> km/sa</small>' : '';
    $('item').innerHTML = m && m.item ? ITEMS[m.item].ic + '<small>' + ITEMS[m.item].n + '</small>' : '<span style="opacity:.35;font-size:26px">▢</span>';
    if (m && phase === 'race' && !m.fin) { var tp = PTS[m.idx]; if (m.vx * tp.tx + m.vz * tp.tz < -5 && (m.speed || 0) > 12) { $('msg').textContent = '⚠ TERS YÖN!'; toastT = 0.3; } }
    if (AC && eng) eng.frequency.value = muted ? 0 : 45 + (m ? m.speed || 0 : 0) * 2.2 + (m && m.boost > 0 ? 30 : 0);
    var cnt = '';
    if (!st) cnt = ''; else if (phase === 'count') cnt = String(Math.max(1, Math.ceil((st.t0 - now) / 1000))); else if (now - st.t0 < 900) cnt = 'GO!';
    if (cnt !== lastCnt) { if (cnt && cnt !== 'GO!') blip(440, .15); else if (cnt === 'GO!') blip(880, .4); lastCnt = cnt; }
    $('cnt').textContent = cnt;
    if (st && !m && !G.inLobby && phase !== 'wait' && !toastT) $('msg').textContent = 'Yarışı izliyorsun';
    else if (st && m && phase === 'race' && !toastT && !m.fin && m.hit > 0 && false) $('msg').textContent = '';
    else if (m && !toastT && st) $('msg').textContent = '';
    // minimap
    var c = mapCtx; c.clearRect(0, 0, 220, 220); c.strokeStyle = 'rgba(180,200,255,.8)'; c.lineWidth = 5; c.beginPath();
    var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; PTS.forEach(function (p) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z); });
    var sc = 200 / Math.max(maxx - minx, maxz - minz), ox = 10 - minx * sc + (200 - (maxx - minx) * sc) / 2, oz = 10 - minz * sc + (200 - (maxz - minz) * sc) / 2;
    PTS.forEach(function (p, i) { var X = p.x * sc + ox, Y = p.z * sc + oz; if (!i) c.moveTo(X, Y); else c.lineTo(X, Y); }); c.closePath(); c.stroke();
    Object.keys(G.pl).forEach(function (u) { var p = G.pl[u]; if (now - p.a > 6000) return; var x = u === G.uid && m ? m.x : p.x, z = u === G.uid && m ? m.z : p.z; c.fillStyle = u === G.uid ? '#fff' : '#' + ('000000' + COLORS[(st && st.grid && st.grid[u] != null ? st.grid[u] : 0) % 8].toString(16)).slice(-6); c.beginPath(); c.arc(x * sc + ox, z * sc + oz, u === G.uid ? 7 : 5, 0, 7); c.fill(); });
  }
  var lastCnt = '';
  function fmtT(ms) { var s = ms / 1000, mm = Math.floor(s / 60); return mm + ':' + ('0' + (s - mm * 60).toFixed(2)).slice(-5); }
  function results(phase) {
    var st = G.st; if (!st || phase !== 'race') return;
    var rk = allRank(), humansIn = rk.filter(function (r) { return !r.id.startsWith('bot'); });
    var allDone = rk.length && rk.every(function (r) { return r.fin; }), humDone = humansIn.length && humansIn.every(function (r) { return r.fin; });
    var firstFin = rk.filter(function (r) { return r.fin; }).length, t = snow() - st.t0, fins = rk.filter(function (r) { return r.fin; }).map(function (r) { return r.fin; }), earliest = fins.length ? Math.min.apply(null, fins) : 0;
    var myDone = G.me && G.me.fin;
    if (!G.shownRes && (humDone || (myDone && (allDone || t - earliest > 25000)) || (earliest && t - earliest > 60000))) {
      G.shownRes = true; var h = '<h1>Sonuçlar</h1><div class="sub">' + LAPS + ' tur</div>';
      h += rk.map(function (r, i) { return '<div class="row' + (r.id === G.uid ? ' me' : '') + '"><span>' + (i + 1) + '. ' + esc(r.name) + '</span><b>' + (r.fin ? fmtT(r.fin) : 'bitiremedi') + '</b></div>'; }).join('');
      h += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="again" type="button" style="flex:1">↩ Odaya dön</button><button class="btn" id="out" type="button">Çık</button></div>';
      $('rcard').innerHTML = h; $('res').hidden = false;
      $('again').onclick = backToLobby; $('out').onclick = leaveRoom;
    }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- giriş ---------- */
  var KM = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'g', w: 'g', W: 'g', ArrowDown: 'b', s: 'b', S: 'b', Shift: 'b' };
  addEventListener('keydown', function (e) { audio(); if (e.key === ' ' || e.key === 'e' || e.key === 'E') { wantItem = 1; e.preventDefault(); return; } if (e.key === 'q' || e.key === 'Q') { wantItem = 2; return; } if (e.key === 'r' || e.key === 'R') { respawn(); return; } var k = KM[e.key]; if (k) { keys[k] = 1; e.preventDefault(); } });
  addEventListener('keyup', function (e) { var k = KM[e.key]; if (k) keys[k] = 0; });
  [['bL', 'l'], ['bR', 'r'], ['bB', 'b']].forEach(function (a) {
    var b = $(a[0]); b.addEventListener('pointerdown', function (e) { e.preventDefault(); keys[a[1]] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (x) {} });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { keys[a[1]] = 0; b.classList.remove('on'); }); });
  });
  $('bI').addEventListener('pointerdown', function (e) { e.preventDefault(); audio(); wantItem = 1; });
  $('bK').addEventListener('pointerdown', function (e) { e.preventDefault(); wantItem = 2; });
  $('mute').onclick = function () { muted = !muted; $('mute').textContent = muted ? '🔇' : '🔊'; if (muted && eng) eng.frequency.value = 0; };
  $('leave').onclick = leaveRoom;

  /* ---------- menü ---------- */
  function showMenu() {
    $('menu').hidden = false; $('hud').hidden = true;
    var h = '<h1>NEON YARIŞ</h1><div class="sub">8 kişiye kadar · 3 tur · nitro, şok, mayın, yıldırım</div><div id="menuMsg">' + (G.uid ? 'Merhaba ' + esc(G.name) + '!' : 'Önce <a href="../" style="color:#9cf">ana sayfadan</a> giriş yap, sonra buraya dön.') + '</div><div id="rooms"></div>' +
      '<div class="help">Telefon: ◀ ▶ ile dön (gaz otomatik), ⏹ el freni (dönerken basılı tutarsan drift, bırakınca turbo), ⚡ güçlendirmeyi öne, ↩ arkaya at. Bilgisayar: ← → / A D, ↑ gaz, ↓ fren, Boşluk güçlendirmeyi öne, Q arkaya at, R yola geri dön.<br>Sarı kutulardan güçlendirme topla: 🚀 nitro, 🛡 kalkan, ⚡ şok (öndeki/arkadaki arabayı yavaşlatır), 💣 mayın ve 🛢 yağ (öne fırlatılır ya da arkana bırakılır), 🌩 yıldırım (lideri vurur), 📡 EMP (yakındakilerin hepsini yavaşlatır). Geride olanlara daha iyi güçlendirme çıkar.</div><div style="text-align:center;margin-top:12px"><a class="btn" href="../">‹ Ana lobi</a></div>';
    $('mcard').innerHTML = h; refreshRooms();
  }
  function refreshRooms() {
    var el = $('rooms'); if (!el || !G.uid) return; var now = snow(), html = '';
    for (var i = 1; i <= ROOMS; i++) {
      var pl = (G.rooms[i] && G.rooms[i].pl) || {}, n = Object.keys(pl).filter(function (u) { return now - (pl[u].a || 0) < 6000 && !pl[u].b; }).length, st = G.rooms[i] && G.rooms[i].st;
      var ph = st && st.t0 && now - st.t0 < 600000 && now > st.t0 ? 'yarış sürüyor' : 'bekliyor';
      var names = Object.keys(pl).filter(function (u) { return now - (pl[u].a || 0) < 6000 && !pl[u].b; }).map(function (u) { return esc(pl[u].n); }).join(', ');
      html += '<div class="room"><div><b>Oda ' + i + '</b><small>' + n + '/' + MAXP + ' oyuncu · ' + ph + (names ? ' · ' + names : '') + '</small></div><button class="btn pri" type="button" data-room="' + i + '"' + (n >= MAXP ? ' disabled' : '') + '>Katıl</button></div>';
    }
    el.innerHTML = html; el.onclick = function (e) { var b = e.target.closest('[data-room]'); if (b && !b.disabled) joinRoom(+b.getAttribute('data-room')); };
  }
  setInterval(function () { if (!$('menu').hidden) refreshRooms(); }, 2000);
  try { db.ref('rp/car').on('value', function (s) { G.rooms = s.val() || {}; if (!$('menu').hidden) refreshRooms(); }, function () {}); } catch (e) {}
  auth.onAuthStateChanged(function (u) {
    if (!u) { G.uid = null; showMenu(); return; } G.uid = u.uid;
    db.ref('rp/users/' + u.uid + '/name').once('value').then(function (s) { G.name = s.val() || 'Oyuncu'; if (!G.base) showMenu(); }, function () { showMenu(); });
  });
  window.__car = { G: G, keys: keys, PTS: PTS, nearest: nearest, join: joinRoom, start: startRace, stepCar: stepCar };
  requestAnimationFrame(loop); showMenu();
})();
