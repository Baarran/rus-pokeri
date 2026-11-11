/* Altın Ayak — futbolcu kariyer oyunu (özgün). Sunucuda saklanan ortak skor tablosu. */
(function () {
  'use strict';
  var $app = document.getElementById('app');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5; }
  function money(n) { n = Math.round(n); return (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₺'; }
  function slug(s) { return String(s).toLowerCase().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9]/g, ''); }

  /* ---- sabitler ---- */
  var TIERS = [
    { n: 'Mahalle Ligi', sal: 200, clubs: ['Çınar Spor', 'Yıldırım Gençlik', 'Demirtepe SK', 'Kuzey Yıldızı', 'Ova Spor', 'Taşköprü FK', 'Bozkır Gücü', 'Liman Spor'] },
    { n: 'Bölge Ligi', sal: 800, clubs: ['Akpınar SK', 'Karakaya Spor', 'Deniz Gücü', 'Sarıkaya FK', 'Yeşilvadi', 'Çelikspor', 'Doruk FK', 'Rüzgar Spor'] },
    { n: 'Birinci Lig', sal: 3000, clubs: ['Anka FK', 'Kızıltepe', 'Mavidalga', 'Gümüşspor', 'Tuna Gücü', 'Altınova', 'Şimşek SK', 'Zirve Spor'] },
    { n: 'Elit Lig', sal: 12000, clubs: ['Atlas SK', 'Kaplanlar', 'Ejderha FK', 'Kuzey Kartalları', 'Zümrüt SK', 'Fırtına Gücü', 'Kristal FK', 'Efsane SK'] },
    { n: 'Süper Yıldızlar Ligi', sal: 50000, clubs: ['Nova FC', 'Titan SK', 'Orion United', 'Phoenix FK', 'Galaksi SK', 'Zenith FC', 'Apex SK', 'Meteor FK'] }
  ];
  var POS = { F: 'Forvet', M: 'Orta Saha', K: 'Kanat' };
  var STN = { shot: 'Şut', pass: 'Pas', drib: 'Dribling', fit: 'Kondisyon', spd: 'Hız' };
  var HOUSES = [['Kiralık oda', 0], ['Stüdyo daire', 3000], ['2+1 daire', 20000], ['Müstakil villa', 150000], ['Deniz kenarı malikane', 1000000]];
  var CARS = [['Yaya / otobüs', 0], ['Bisiklet', 300], ['İkinci el hatchback', 5000], ['Spor coupe', 60000], ['Lüks SUV', 400000], ['Süper spor araba', 2500000]];
  var ITEMS = [
    { id: 'krampon', n: 'Profesyonel krampon', p: 2000, d: 'Şut +3 (maçta)' }, { id: 'ekip', n: 'Antrenman ekipmanı', p: 4000, d: 'Antrenman kazancı +1' },
    { id: 'fizyo', n: 'Fizyoterapist', p: 15000, d: 'Haftalık enerji +10' }, { id: 'diyet', n: 'Beslenme uzmanı', p: 25000, d: 'Kondisyon +4 (maçta)' },
    { id: 'mental', n: 'Mental koç', p: 30000, d: 'Moral düşmez, form +' }, { id: 'menajer', n: 'Menajer', p: 40000, d: 'Daha çok ve iyi transfer teklifi' }
  ];
  var WEEKS = 14;

  /* ---- Firebase / giriş ---- */
  var CFG = { apiKey: 'AIzaSyBsP1VNPJpt1Y6MN0FwDCmvuHeZxaDoTGU', authDomain: 'ruspokeri-de28e.firebaseapp.com', databaseURL: 'https://ruspokeri-de28e-default-rtdb.europe-west1.firebasedatabase.app', projectId: 'ruspokeri-de28e' };
  var db = null, auth = null, uid = null, uname = '', S = null, ui = { view: 'boot', tab: 'hub', board: 'g' }, topMine = null, saveT = 0;
  try { if (window.firebase) { if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(CFG); db = firebase.database(); auth = firebase.auth(); } } catch (e) { db = null; }
  function lsKey() { return 'kr_' + (uid || slug(uname)); }
  function boot() {
    if (!auth) { ui.view = 'login'; render(); return; }
    var done = false;
    auth.onAuthStateChanged(function (u) {
      if (done) return; done = true;
      if (u) { uid = u.uid; db.ref('rp/users/' + uid).once('value').then(function (s) { var v = s.val(); uname = (v && (v.name || v)) || (u.email || 'Oyuncu').split('@')[0]; if (typeof uname !== 'string') uname = 'Oyuncu'; afterLogin(); }, function () { uname = (u.email || 'Oyuncu').split('@')[0]; afterLogin(); }); }
      else { ui.view = 'login'; render(); }
    });
  }
  function usernameLogin(name) {
    var sl = slug(name); if (sl.length < 2) { toast('En az 2 harf/rakam gir'); return; }
    var email = 'k_' + sl + '@kariyer.rp', pass = 'kariyer-' + sl + '-9x';
    auth.signInWithEmailAndPassword(email, pass).catch(function () { return auth.createUserWithEmailAndPassword(email, pass); }).then(function (c) { uid = c.user.uid; uname = name.trim().slice(0, 16); afterLogin(); }, function (e) { toast('Giriş olmadı: ' + (e && e.message || e)); });
  }
  function afterLogin() {
    try { var pr = db.ref('rp/online/' + uid); pr.onDisconnect().remove(); pr.set('kariyer'); } catch (e) {}
    function use(v) { S = v || null; if (S && !S.retired && S.v === 1) { ui.view = 'main'; ui.tab = 'hub'; startPresence(); } else { ui.view = S && S.retired ? 'retired' : 'create'; } render(); }
    db.ref('rp/kariyer/top/' + uid).once('value').then(function (s) { topMine = s.val() || null; }, function () {}).then(function () {
      return db.ref('rp/kariyer/p/' + uid).once('value');
    }).then(function (s) { var v = s.val(); if (v && typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } use(v || lsLoad()); }, function () { use(lsLoad()); });
  }
  function lsLoad() { try { return JSON.parse(localStorage.getItem(lsKey())); } catch (e) { return null; } }
  function save(now) {
    if (!S) return; try { localStorage.setItem(lsKey(), JSON.stringify(S)); } catch (e) {}
    var run = function () { if (!db || !uid) return; try { db.ref('rp/kariyer/p/' + uid).set(JSON.stringify(S)); pushTop(); } catch (e) {} };
    clearTimeout(saveT); if (now) run(); else saveT = setTimeout(run, 800);
  }
  function worth() { return S.money + HOUSES[S.house][1] * 0.5 + CARS[S.car][1] * 0.3; }
  function pushTop() {
    var t = topMine || {}, avg = Math.max(t.r || 0, S.best.avg), g = Math.max(t.g || 0, S.goals), m = Math.max(t.m || 0, Math.round(worth()));
    topMine = { n: uname, g: g, a: Math.max(t.a || 0, S.assists), r: avg, bm: Math.max(t.bm || 0, S.best.match), m: m, o: ovr(), age: S.age, c: S.club, ret: !!S.retired, t: S.tier, nm: S.name, dw: Math.max(t.dw || 0, S.dw || 0) };
    db.ref('rp/kariyer/top/' + uid).set(topMine);
  }

  /* ---- oyuncu ---- */
  function ovr(p) {
    p = p || S; var s = p.st, w = p.pos === 'F' ? [.4, .1, .2, .1, .2] : p.pos === 'M' ? [.15, .35, .2, .2, .1] : [.1, .15, .35, .1, .3];
    return Math.round(s.shot * w[0] + s.pass * w[1] + s.drib * w[2] + s.fit * w[3] + s.spd * w[4]);
  }
  function newCareer(name, pos) {
    var st = { shot: 38, pass: 38, drib: 38, fit: 40, spd: 40 }; var main = pos === 'F' ? 'shot' : pos === 'M' ? 'pass' : 'drib'; st[main] += 8; if (pos === 'K') st.spd += 5;
    S = { v: 1, name: name, pos: pos, age: 17, season: 1, week: 1, st: st, energy: 100, form: 50, morale: 60, money: 500, rep: 0, tier: 0, club: pick(TIERS[0].clubs), sal: 200, goals: 0, assists: 0, apps: 0, sg: 0, sa: 0, sapps: 0, srat: [], best: { avg: 0, match: 0 }, house: 0, car: 0, items: [], awards: [], titles: 0, hist: [], acted: false, retired: false, phase: 'play', offers: [], last: null, ts: Date.now() };
    newSeasonTable(); S.fx = fixtures(); save(true);
  }
  function oppStr(tier, i) { return 32 + tier * 13 + (i % 4) * 2 - 3; }
  function others() { return TIERS[S.tier].clubs.filter(function (c) { return c !== S.club; }); }
  function fixtures() { var o = others(), a = o.slice().sort(function () { return Math.random() - .5; }), b = o.slice().sort(function () { return Math.random() - .5; }); return a.concat(b); }
  function newSeasonTable() { S.table = {}; TIERS[S.tier].clubs.forEach(function (c) { S.table[c] = { p: 0, g: 0, a: 0, pl: 0 }; }); if (!S.table[S.club]) S.table[S.club] = { p: 0, g: 0, a: 0, pl: 0 }; }
  function strOf(club) { var i = TIERS[S.tier].clubs.indexOf(club); return oppStr(S.tier, i < 0 ? 3 : i); }
  function opp() { return S.fx[S.week - 1]; }
  function eff(k) { var v = S.st[k]; if (k === 'shot' && S.items.indexOf('krampon') >= 0) v += 3; if (k === 'fit' && S.items.indexOf('diyet') >= 0) v += 4; return v; }
  function condition() { return (100 - S.energy) / 150 + (50 - S.form) / 250 + (50 - S.morale) / 400; }

  /* ---- maç mantığı ---- */
  var MT = { F: ['sut', 'sut', 'sut', 'drib', 'pas', 'sut'], M: ['pas', 'pas', 'sut', 'drib', 'pas', 'sut'], K: ['drib', 'drib', 'sut', 'pas', 'drib', 'sut'] };
  var MC = null; /* aktif maç */
  function startMatch() {
    var o = opp(), os = strOf(o), diff = clamp((os - ovr()) / 100, -0.3, 0.5), n = 5, list = [], pool = MT[S.pos];
    for (var i = 0; i < n; i++) list.push(pick(pool));
    if (Math.random() < 0.2) list.splice(ri(1, n - 1), 0, 'pen');
    MC = { opp: o, os: os, diff: diff, list: list, i: 0, rating: 6.0, g: 0, a: 0, mine: 0, theirs: 0, log: [], sc: null, bonus: false };
    S.energy = Math.max(0, S.energy - (20 + (100 - S.st.fit) / 6)); ui.view = 'match'; nextMoment();
  }
  function nextMoment() {
    if (MC.i >= MC.list.length) { finishMatch(); return; }
    MC.kind = MC.list[MC.i]; MC.state = 'wait'; MC.msg = ''; MC.minute = Math.round(12 + MC.i * (78 / MC.list.length) + rnd(-4, 4)); MC.press = rnd(0.0, 0.25) + MC.diff * 0.5; if (MC.bonusNext) { MC.press *= 0.5; MC.bonusNext = false; }
    if (MC.kind === 'drib') { MC.def = pick([-1, 0, 1]); MC.tell = Math.random() < 0.6 ? MC.def : pick([-1, 0, 1]); }
    if (MC.kind === 'pas') { MC.opts = [{ n: 'Kısa pas', r: 0.05, w: 0.14 }, { n: 'Ara pası', r: 0.25, w: 0.36 }, { n: 'Derin pas', r: 0.45, w: 0.62 }]; }
    if (MC.kind === 'sut' || MC.kind === 'pen') { MC.ks = clamp(0.22 + S.tier * 0.1 + MC.diff * 0.3 + rnd(-.05, .08), .15, .95); MC.kx = pick([-0.65, 0, 0.65]); }
    render(); if (MC.kind === 'sut' || MC.kind === 'pen' || MC.kind === 'drib' || MC.kind === 'pas') startScene();
  }
  function shotOutcome(x, pw, press, pen) {
    var sh = eff('shot'), sd = (0.55 - sh / 99 * 0.42) * (1 + condition() + (pen ? -0.25 : press)); sd = Math.max(0.05, sd);
    var h = 0.12 + 0.9 * clamp(pw, 0, 1.1), fx = x + gauss() * sd, fh = h + gauss() * sd * 0.35, weak = pw < 0.3, res;
    if (pw > 1.12) fh += 0.25;
    if (fh > 1.02) return { r: 'over', x: fx, h: fh, kx: 0 };
    if (Math.abs(fx) > 1.06) return { r: 'wide', x: fx, h: fh, kx: 0 };
    if (Math.abs(fx) > 1.0) return { r: 'post', x: fx, h: fh, kx: 0 };
    var ks = MC.ks, kx = MC.kx; if (Math.random() < ks * 0.35) kx = fx < -0.3 ? -0.65 : fx > 0.3 ? 0.65 : 0;
    var reach = (0.28 + ks * 0.32) * (1.2 - 0.55 * clamp(fh, 0, 1)) * (weak ? 1.9 : 1); if (fh > 0.75 && Math.abs(fx) > 0.6) reach *= 0.55;
    return { r: Math.abs(fx - kx) < reach ? 'save' : 'goal', x: fx, h: fh, kx: kx };
  }
  function addRating(d, txt) { MC.rating += d; MC.log.push(txt); }
  function momentDone(txt, cls) { MC.state = 'done'; MC.msg = txt; MC.cls = cls || ''; MC.i++; render(); }
  function resolveShot(x, pw) {
    var o = shotOutcome(x, pw, MC.press, MC.kind === 'pen'); MC.shotRes = o; MC.anim = { t: 0, o: o }; MC.state = 'fly';
    var txt, cls = '';
    if (o.r === 'goal') { MC.g++; MC.mine++; S.goals++; S.sg++; addRating(MC.kind === 'pen' ? 0.8 : 1.0, MC.minute + "' gol"); txt = 'GOOOL! ⚽'; cls = 'ok'; }
    else if (o.r === 'save') { addRating(0.1, 'şut kurtarıldı'); txt = 'Kaleci kurtardı!'; }
    else if (o.r === 'post') { addRating(0.15, 'direk'); txt = 'DİREK! Ucu ucuna…'; }
    else if (o.r === 'wide') { addRating(-0.15, 'şut auta'); txt = 'Auta gitti'; cls = 'bad'; }
    else { addRating(-0.15, 'şut üstten'); txt = 'Üstünden uçtu'; cls = 'bad'; }
    MC.pend = { txt: txt, cls: cls };
    setTimeout(function () { if (MC && MC.state === 'fly') { MC.state = 'wait'; momentDone(MC.pend.txt, MC.pend.cls); } }, 1100);
  }
  function resolvePas(k) {
    var op = MC.opts[k], ps = S.st.pass, p = clamp(0.95 - op.r * 1.1 + (ps - 50) / 250 - condition() * 0.5 - MC.diff * 0.25, 0.1, 0.97);
    if (Math.random() < p) {
      if (Math.random() < op.w * (0.7 + MC.os / 200 * 0 + 0.3)) { MC.a++; MC.mine++; S.assists++; S.sa++; addRating(0.8, MC.minute + "' asist"); momentDone('Harika pas! Takım arkadaşın attı — ASİST 🅰', 'ok'); }
      else { addRating(0.2, 'iyi pas'); momentDone('Pas yerine ulaştı ama gol olmadı', ''); }
    } else { addRating(-0.3, 'top kaybı'); momentDone('Pas kesildi — top rakipte!', 'bad'); }
  }
  function resolveDrib(dir) {
    var ds = S.st.drib, win = dir !== MC.def ? 0.82 : 0.28 + ds / 220; win = clamp(win + (ds - 50) / 400 - condition() * 0.4 - MC.diff * 0.2, 0.1, 0.95);
    if (Math.random() < win) { addRating(0.3, 'çalım'); MC.list.splice(MC.i + 1, 0, 'sut'); MC.bonusNext = true; momentDone('Rakibi geçtin! Şimdi şut zamanı 🔥', 'ok'); }
    else { addRating(-0.3, 'top kaybı'); momentDone('Savunmacı topu kaptı!', 'bad'); }
  }
  function finishMatch() {
    var os = MC.os, ps = ovr(), lam = clamp(0.95 + (ps - os) / 55, 0.2, 2.4), tm = 0, th = 0, i;
    for (i = 0; i < 4; i++) { if (Math.random() < lam / 4 * 0.8) tm++; if (Math.random() < clamp(0.95 - (ps - os) / 55, 0.2, 2.4) / 4 * 0.8) th++; }
    var mine = MC.mine + tm, theirs = th;
    var res = mine > theirs ? 3 : mine === theirs ? 1 : 0; MC.res = res; MC.fs = [mine, theirs];
    var rating = MC.rating + (res === 3 ? 0.3 : res === 0 ? -0.3 : 0) + rnd(-0.25, 0.25) - (S.energy < 20 ? 0.2 : 0); rating = Math.round(clamp(rating, 3, 10) * 10) / 10; MC.final = rating;
    S.apps++; S.sapps++; S.srat.push(rating); S.best.match = Math.max(S.best.match, rating);
    S.form = clamp(S.form + (rating - 6.5) * 6, 0, 100); S.morale = clamp(S.morale + (res === 3 ? 8 : res === 1 ? 1 : -7) + (S.items.indexOf('mental') >= 0 && res === 0 ? 5 : 0), 0, 100);
    var sal = S.sal + MC.g * S.sal * 0.25 + (res === 3 ? S.sal * 0.2 : 0) + S.rep * 2; S.money += Math.round(sal); MC.pay = Math.round(sal); S.rep += res === 3 ? 1 : 0; S.rep += rating >= 8 ? 2 : 0; if (MC.g >= 2) S.rep += 2;
    var t = S.table[S.club]; t.p += res; t.g += mine; t.a += theirs; t.pl++;
    var ot = S.table[MC.opp]; if (ot) { ot.p += res === 3 ? 0 : res === 1 ? 1 : 3; ot.g += theirs; ot.a += mine; ot.pl++; }
    /* diğer maçlar */
    var rest = TIERS[S.tier].clubs.filter(function (c) { return c !== S.club && c !== MC.opp; }).sort(function () { return Math.random() - .5; });
    for (i = 0; i + 1 < rest.length; i += 2) { var a = rest[i], b = rest[i + 1], sa = strOf(a), sb = strOf(b), ga = ri(0, 3) + (sa > sb && Math.random() < .5 ? 1 : 0), gb = ri(0, 3) + (sb > sa && Math.random() < .5 ? 1 : 0); S.table[a].pl++; S.table[b].pl++; S.table[a].g += ga; S.table[a].a += gb; S.table[b].g += gb; S.table[b].a += ga; if (ga > gb) S.table[a].p += 3; else if (gb > ga) S.table[b].p += 3; else { S.table[a].p++; S.table[b].p++; } }
    S.last = { opp: MC.opp, fs: MC.fs, rating: rating, g: MC.g, a: MC.a, res: res, pay: MC.pay, wk: S.week };
    S.week++; S.acted = false;
    S.energy = clamp(S.energy + 42 + S.house * 5 + (S.items.indexOf('fizyo') >= 0 ? 10 : 0), 0, 100);
    S.morale = clamp(S.morale + (S.house * 2 + S.car * 2 + 10 - S.morale * 0.12) * 0.2 + (50 - S.morale) * 0.05, 0, 100);
    if (S.week > WEEKS) { S.phase = 'seasonEnd'; }
    MC.state = 'over'; save(true); render();
  }

  /* ---- sezon sonu ---- */
  function standings() { return Object.keys(S.table).map(function (c) { var t = S.table[c]; return { c: c, p: t.p, gd: t.g - t.a, g: t.g }; }).sort(function (a, b) { return b.p - a.p || b.gd - a.gd || b.g - a.g; }); }
  function seasonEnd() {
    var st = standings(), rank = 1 + st.map(function (x) { return x.c; }).indexOf(S.club), avg = S.srat.length ? S.srat.reduce(function (a, b) { return a + b; }, 0) / S.srat.length : 0;
    avg = Math.round(avg * 100) / 100; S.best.avg = Math.max(S.best.avg, avg); var aw = [], bonus = 0;
    if (rank === 1) { aw.push('🏆 Lig Şampiyonu (' + TIERS[S.tier].n + ')'); S.titles++; bonus += S.sal * 6; S.rep += 8; }
    var topG = 9 + S.tier * 2 + ri(0, 4); if (S.sg > topG) { aw.push('👟 Gol Kralı (' + S.sg + ' gol)'); bonus += S.sal * 4; S.rep += 6; }
    if (avg >= 7.4 && S.sapps >= 8) { aw.push('⭐ Sezonun Oyuncusu (ort. ' + avg.toFixed(2) + ')'); bonus += S.sal * 4; S.rep += 6; }
    if (S.age <= 21 && avg >= 6.9) { aw.push('🌱 Yılın Genç Oyuncusu'); bonus += S.sal * 2; S.rep += 3; }
    if (S.sa >= 8) { aw.push('🎯 Asist Kralı (' + S.sa + ')'); bonus += S.sal * 2; S.rep += 3; }
    S.money += Math.round(bonus); aw.forEach(function (a) { S.awards.push({ s: S.season, t: a }); });
    S.hist.push({ s: S.season, age: S.age, c: S.club, t: S.tier, ap: S.sapps, g: S.sg, a: S.sa, r: avg, k: rank, o: ovr() });
    S.sumry = { rank: rank, avg: avg, aw: aw, bonus: Math.round(bonus), g: S.sg, a: S.sa };
    /* kulüp terfi / düşme */
    var promo = rank <= 2 && S.tier < 4, rel = rank >= 8 && S.tier > 0; S.sumry.promo = promo; S.sumry.rel = rel;
    if (promo) { S.tier++; S.club = S.club; } else if (rel) { S.tier--; }
    if (promo || rel) S.sumry.newLeague = TIERS[S.tier].n;
    S.offers = makeOffers(avg); S.phase = 'offers'; save(true); render();
  }
  function makeOffers(avg) {
    var o = ovr(), res = [], mg = S.items.indexOf('menajer') >= 0, tries = 0, maxN = mg ? 4 : 2;
    var q = (avg - 6) * 10 + S.rep * 0.4;
    while (res.length < maxN && tries++ < 30) {
      var t = clamp(S.tier + ri(-1, mg ? 2 : 1), 0, 4); if (t > S.tier && o < 30 + t * 12 - (mg ? 4 : 0) - q * 0.3) continue;
      var club = pick(TIERS[t].clubs); if (club === S.club && t === S.tier) continue; if (res.some(function (r) { return r.club === club; })) continue;
      var sal = Math.round(TIERS[t].sal * (0.8 + o / 100) * (mg ? 1.15 : 1) * (1 + Math.max(0, q) / 80)); res.push({ club: club, tier: t, sal: sal, sign: sal * 4 });
    }
    return res;
  }
  function nextSeason() {
    var old = ovr(); S.age++; S.season++; S.week = 1; S.sg = S.sa = S.sapps = 0; S.srat = []; S.phase = 'play'; S.sumry = null; S.offers = [];
    var young = S.age <= 23; Object.keys(S.st).forEach(function (k) { if (S.age >= 31 && (k === 'spd' || k === 'fit')) S.st[k] = Math.max(20, S.st[k] - ri(1, 3)); else if (S.age >= 33) S.st[k] = Math.max(20, S.st[k] - ri(0, 2)); else if (young) S.st[k] = Math.min(99, S.st[k] + ri(0, 2)); });
    S.energy = 100; S.sal = Math.round(TIERS[S.tier].sal * (0.8 + ovr() / 100)); newSeasonTable(); S.fx = fixtures(); S.acted = false;
    if (S.age >= 35) { S.phase = 'retireAsk'; if (S.age >= 38 || ovr() < 35) { retire(); return; } }
    save(true); render();
  }
  function retire() { S.retired = true; S.phase = 'done'; ui.view = 'retired'; save(true); render(); }

  /* ---- antrenman / mağaza ---- */
  function train(k) {
    if (S.acted) return; var cost = k === 'fit' ? 22 : 18, g = 1 + (S.age <= 22 ? 1 : 0) + (Math.random() < 0.4 ? 1 : 0) + (S.items.indexOf('ekip') >= 0 ? 1 : 0); if (S.age >= 30) g = Math.max(0, g - 1);
    if (S.energy < cost) { g = Math.max(0, g - 1); toast('Yorgunsun — verim düştü'); }
    S.energy = Math.max(0, S.energy - cost); S.st[k] = Math.min(99, S.st[k] + g); S.form = clamp(S.form + 3, 0, 100); S.acted = true; toast(STN[k] + ' +' + g); save(); render();
  }
  function rest() { if (S.acted) return; S.energy = clamp(S.energy + 35, 0, 100); S.morale = clamp(S.morale + 8, 0, 100); S.acted = true; toast('Dinlendin: enerji ve moral arttı'); save(); render(); }
  function buy(kind, i) {
    if (kind === 'house') { var h = HOUSES[i]; if (S.house >= i || S.money < h[1]) return; S.money -= h[1]; S.house = i; S.morale = clamp(S.morale + 10, 0, 100); }
    else if (kind === 'car') { var c = CARS[i]; if (S.car >= i || S.money < c[1]) return; S.money -= c[1]; S.car = i; S.morale = clamp(S.morale + 8, 0, 100); S.rep += i; }
    else { var it = ITEMS[i]; if (S.items.indexOf(it.id) >= 0 || S.money < it.p) return; S.money -= it.p; S.items.push(it.id); }
    toast('Satın alındı!'); save(true); render();
  }

  /* ---- ekran: giriş / yaratma ---- */
  function toast(t) { var d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 1600); }
  function bar(v, col) { return '<div class="bar"><i style="width:' + clamp(v, 0, 100) + '%;background:' + col + '"></i></div>'; }
  var createPos = 'F';
  function viewLogin() {
    return '<h1>ALTIN AYAK</h1><p class="sub">Futbolcu kariyeri · arkadaşlarınla ortak skor tablosu</p><div class="card"><b>Kullanıcı adın</b><input type="text" id="un" maxlength="16" placeholder="örn. Baran" autocomplete="off"><button class="btn pri" id="goLogin">Devam</button><p class="mu">Şifre yok: aynı kullanıcı adıyla girince kariyerin kaldığın yerden devam eder.</p></div>';
  }
  function viewCreate() {
    return '<h1>FUTBOLCUNU YARAT</h1><p class="sub">17 yaşında, en alt ligde başlıyorsun</p><div class="card"><b>Futbolcu adı</b><input type="text" id="pn" maxlength="18" value="' + esc(uname) + '"><b>Mevki</b><div class="pos" style="margin:8px 0">' + ['F', 'M', 'K'].map(function (p) { return '<button class="btn ' + (createPos === p ? 'on' : '') + '" data-pos="' + p + '">' + { F: '🎯 Forvet', M: '🧠 Orta Saha', K: '⚡ Kanat' }[p] + '</button>'; }).join('') + '</div><p class="mu">' + { F: 'Şutta güçlüsün: bol şut pozisyonu.', M: 'Pas ustası: asist fırsatları çok.', K: 'Hız ve çalım: dribling ve şut karışık.' }[createPos] + '</p><button class="btn pri" id="goCreate">Kariyere başla</button></div>';
  }
  function viewRetired() {
    var tg = S.hist.reduce(function (a, h) { return a + h.g; }, 0), ta = S.hist.reduce(function (a, h) { return a + h.a; }, 0);
    return '<h1>EMEKLİLİK</h1><p class="sub">' + esc(S.name) + ' ' + S.age + ' yaşında kramponları astı</p><div class="card"><div class="row"><div class="av">🏅</div><div><b>' + tg + ' gol · ' + ta + ' asist</b><div class="mu">' + S.hist.length + ' sezon · ' + S.titles + ' şampiyonluk</div><div class="mu">Servet: ' + money(worth()) + '</div></div></div></div><div class="card"><b>Ödüller</b><div>' + (S.awards.map(function (a) { return '<span class="pill">' + a.s + '. sezon ' + esc(a.t) + '</span>'; }).join('') || '<span class="mu">—</span>') + '</div></div><button class="btn pri" id="newCareer">Yeni kariyer başlat</button><div style="height:8px"></div><button class="btn" id="goBoard">Skor tablosu</button>';
  }
  /* ---- ana sekmeler ---- */
  function playerCard() {
    return '<div class="card"><div class="row"><div class="av">' + esc(S.name.charAt(0).toUpperCase()) + '</div><div class="sp"><b style="font-size:18px">' + esc(S.name) + '</b><div class="mu">' + POS[S.pos] + ' · ' + S.age + ' yaş · Genel <b class="gold">' + ovr() + '</b></div><div class="mu">' + esc(S.club) + ' · ' + TIERS[S.tier].n + '</div></div><div style="text-align:right"><div class="gold"><b>' + money(S.money) + '</b></div><div class="mu">İtibar ' + S.rep + '</div></div></div>' +
      '<div style="margin-top:8px"><div class="mu">Enerji ' + Math.round(S.energy) + '</div>' + bar(S.energy, '#4ade80') + '<div class="mu" style="margin-top:6px">Form ' + Math.round(S.form) + '</div>' + bar(S.form, '#ffd54a') + '<div class="mu" style="margin-top:6px">Moral ' + Math.round(S.morale) + '</div>' + bar(S.morale, '#5ab4ff') + '</div></div>';
  }
  function tableHTML(n) {
    var st = standings(); return '<table><tr><th>#</th><th>Takım</th><th>O</th><th>AV</th><th>P</th></tr>' + st.map(function (r, i) { return (n && i >= n && r.c !== S.club) ? '' : '<tr class="' + (r.c === S.club ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(r.c) + '</td><td>' + S.table[r.c].pl + '</td><td>' + (r.gd > 0 ? '+' : '') + r.gd + '</td><td><b>' + r.p + '</b></td></tr>'; }).join('') + '</table>';
  }
  function viewHub() {
    var h = playerCard();
    if (S.last && S.last.wk === S.week - 1) h += '<div class="card"><b>Geçen maç</b><div class="mu">' + esc(S.last.opp) + ' · ' + S.last.fs[0] + '-' + S.last.fs[1] + ' · Puan <b class="gold">' + S.last.rating.toFixed(1) + '</b> · ' + S.last.g + ' gol, ' + S.last.a + ' asist · +' + money(S.last.pay) + '</div></div>';
    if (S.phase === 'play') {
      var o = opp(); h += '<div class="card"><div class="row"><b>Hafta ' + S.week + '/' + WEEKS + ' · ' + S.season + '. sezon</b><span class="sp"></span><span class="mu">Rakip gücü ' + strOf(o) + '</span></div><div style="font-size:20px;font-weight:900;margin:6px 0">' + esc(S.club) + ' <span class="mu">vs</span> ' + esc(o) + '</div>' + (S.acted ? '' : '<div class="mu">Önce antrenman yap ya da dinlen (haftada 1 kez), sonra maça çık.</div>') + '</div>';
      h += '<button class="btn hot" id="goMatch">⚽ Maça çık</button>';
    }
    h += '<h2>Lig tablosu</h2><div class="card">' + tableHTML(5) + '</div>'; return h;
  }
  function viewTrain() {
    var h = playerCard() + '<h2>Antrenman</h2><div class="card">' + (S.acted ? '<div class="mu">Bu hafta zaten antrenman yaptın/dinlendin.</div>' : '<div class="mu">Haftada bir seçim: antrenman ya da dinlenme.</div>');
    Object.keys(STN).forEach(function (k) { h += '<div class="stat"><b>' + STN[k] + '</b>' + bar(S.st[k], '#c6ff3d') + '<span>' + S.st[k] + '</span><button class="btn sm" data-train="' + k + '"' + (S.acted ? ' disabled' : '') + '>Çalış</button></div>'; });
    h += '</div><button class="btn" id="doRest"' + (S.acted ? ' disabled' : '') + '>😴 Dinlen (+35 enerji, +8 moral)</button>'; return h;
  }
  function viewShop() {
    var h = '<div class="card row"><b>Bakiye</b><span class="sp"></span><b class="gold">' + money(S.money) + '</b></div><h2>Ev (enerji + moral)</h2>';
    HOUSES.forEach(function (x, i) { h += '<div class="card row"><div class="sp"><b>🏠 ' + x[0] + '</b><div class="mu">' + (i ? 'Haftalık enerji +' + (i * 5) + ', moral' : 'Başlangıç') + '</div></div>' + (S.house === i ? '<span class="pill">Oturuyorsun</span>' : S.house > i ? '' : '<button class="btn sm pri" data-buy="house:' + i + '"' + (S.money < x[1] ? ' disabled' : '') + '>' + money(x[1]) + '</button>') + '</div>'; });
    h += '<h2>Araba (moral + itibar)</h2>';
    CARS.forEach(function (x, i) { h += '<div class="card row"><div class="sp"><b>🚗 ' + x[0] + '</b></div>' + (S.car === i ? '<span class="pill">Sürüyorsun</span>' : S.car > i ? '' : '<button class="btn sm pri" data-buy="car:' + i + '"' + (S.money < x[1] ? ' disabled' : '') + '>' + money(x[1]) + '</button>') + '</div>'; });
    h += '<h2>Eşyalar</h2>'; ITEMS.forEach(function (x, i) { var has = S.items.indexOf(x.id) >= 0; h += '<div class="card row"><div class="sp"><b>' + x.n + '</b><div class="mu">' + x.d + '</div></div>' + (has ? '<span class="pill">Var ✔</span>' : '<button class="btn sm pri" data-buy="item:' + i + '"' + (S.money < x.p ? ' disabled' : '') + '>' + money(x.p) + '</button>') + '</div>'; });
    return h;
  }
  function viewCareer() {
    var h = playerCard() + '<h2>Bu sezon</h2><div class="card"><div class="row"><div class="sp"><b>' + S.sapps + '</b><div class="mu">Maç</div></div><div class="sp"><b>' + S.sg + '</b><div class="mu">Gol</div></div><div class="sp"><b>' + S.sa + '</b><div class="mu">Asist</div></div><div class="sp"><b>' + (S.srat.length ? (S.srat.reduce(function (a, b) { return a + b; }, 0) / S.srat.length).toFixed(2) : '—') + '</b><div class="mu">Ort. puan</div></div></div></div>';
    h += '<h2>Kariyer</h2><div class="card"><div class="row"><div class="sp"><b>' + S.goals + '</b><div class="mu">Toplam gol</div></div><div class="sp"><b>' + S.assists + '</b><div class="mu">Asist</div></div><div class="sp"><b>' + S.apps + '</b><div class="mu">Maç</div></div><div class="sp"><b>' + S.titles + '</b><div class="mu">Şampiyonluk</div></div></div></div>';
    h += '<h2>Ödüller</h2><div class="card">' + (S.awards.map(function (a) { return '<div class="pill">' + a.s + '. sezon · ' + esc(a.t) + '</div>'; }).join('') || '<span class="mu">Henüz ödül yok</span>') + '</div>';
    h += '<h2>Sezon geçmişi</h2><div class="card"><table><tr><th>Yaş</th><th>Kulüp</th><th>M</th><th>G</th><th>A</th><th>P</th></tr>' + S.hist.map(function (x) { return '<tr><td>' + x.age + '</td><td>' + esc(x.c) + '</td><td>' + x.ap + '</td><td>' + x.g + '</td><td>' + x.a + '</td><td>' + x.r.toFixed(1) + '</td></tr>'; }).join('') + '</table></div>';
    return h;
  }
  var boardData = null;
  function loadBoard() { if (!db) return; db.ref('rp/kariyer/top').once('value').then(function (s) { boardData = s.val() || {}; if (ui.tab === 'board' || ui.view === 'retired') render(); }, function () { }); }
  function viewBoard() {
    var key = ui.board, rows = Object.keys(boardData || {}).map(function (k) { var v = boardData[k]; v.id = k; return v; });
    if (topMine && uid) { var mm = rows.filter(function (r) { return r.id === uid; })[0]; if (!mm) rows.push(Object.assign({ id: uid }, topMine)); }
    rows.sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
    var lab = { g: 'Gol', r: 'Sezon ort. puan', m: 'Servet', dw: 'Canlı galibiyet' }, fmt = function (r) { return key === 'm' ? money(r.m || 0) : key === 'r' ? (r.r || 0).toFixed(2) : key === 'dw' ? (r.dw || 0) : (r.g || 0); };
    var h = '<h2>Skor tablosu</h2><div class="tabs"><button data-bd="g" class="' + (key === 'g' ? 'on' : '') + '">⚽ En çok gol</button><button data-bd="r" class="' + (key === 'r' ? 'on' : '') + '">⭐ En yüksek puan</button><button data-bd="m" class="' + (key === 'm' ? 'on' : '') + '">💰 En zengin</button><button data-bd="dw" class="' + (key === 'dw' ? 'on' : '') + '">⚔ Canlı</button></div><div class="card"><table><tr><th>#</th><th>Oyuncu</th><th>Kulüp</th><th>' + lab[key] + '</th></tr>';
    rows.slice(0, 30).forEach(function (r, i) { h += '<tr class="' + (r.id === uid ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(r.nm || r.n) + '<div class="mu">' + esc(r.n) + (r.ret ? ' · emekli' : '') + '</div></td><td class="mu">' + esc(r.c || '') + '</td><td><b>' + fmt(r) + '</b></td></tr>'; });
    return h + '</table>' + (rows.length ? '' : '<div class="mu">Henüz kimse yok</div>') + '</div>';
  }
  /* ---- sezon sonu ekranları ---- */
  function viewSeasonEnd() { return '<h1>SEZON BİTTİ</h1><div class="card"><div class="mu">Son tablo</div>' + tableHTML() + '</div><button class="btn pri" id="doSeasonEnd">Sezon özetini gör</button>'; }
  function viewOffers() {
    var s = S.sumry, h = '<h1>' + S.season + '. SEZON ÖZETİ</h1><div class="card"><b>' + s.rank + '. sıra · ' + s.g + ' gol · ' + s.a + ' asist · ort. ' + s.avg.toFixed(2) + '</b>' + (s.promo ? '<div class="ok" style="color:var(--ok)">Kulüp terfi etti → ' + s.newLeague + '</div>' : '') + (s.rel ? '<div style="color:var(--bad)">Kulüp küme düştü → ' + s.newLeague + '</div>' : '') + '<div style="margin-top:6px">' + (s.aw.map(function (a) { return '<div class="pill">' + esc(a) + '</div>'; }).join('') || '<span class="mu">Bu sezon ödül yok</span>') + '</div>' + (s.bonus ? '<div class="gold">Ödül primi: +' + money(s.bonus) + '</div>' : '') + '</div>';
    h += '<h2>Transfer teklifleri</h2>';
    S.offers.forEach(function (o, i) { h += '<div class="card"><div class="row"><div class="sp"><b>' + esc(o.club) + '</b><div class="mu">' + TIERS[o.tier].n + ' · maaş ' + money(o.sal) + '/hafta</div><div class="mu">İmza parası ' + money(o.sign) + '</div></div><button class="btn sm pri" data-offer="' + i + '">Kabul et</button></div></div>'; });
    if (!S.offers.length) h += '<div class="card mu">Bu sezon teklif gelmedi. Daha iyi oyna!</div>';
    return h + '<button class="btn" id="stay">' + esc(S.club) + ' kulübünde kal</button>';
  }
  function viewRetireAsk() { return '<h1>EMEKLİLİK ZAMANI?</h1><p class="sub">' + S.age + ' yaşındasın.</p><div class="card mu">Bir sezon daha oynayabilirsin ama yaş ilerledikçe hız ve kondisyon düşer.</div><button class="btn hot" id="doRetire">Emekli ol</button><div style="height:8px"></div><button class="btn" id="oneMore">Bir sezon daha oyna</button>'; }
  /* ---- maç ekranı ---- */
  var cv = null, cx = null, anim = null, drag = null, raf = 0;
  var KN = { sut: 'ŞUT', pen: 'PENALTI', pas: 'PAS', drib: 'DRİBLİNG' };
  function viewMatch() {
    var m = MC, h = '<div class="card row"><b>' + esc(S.club) + ' vs ' + esc(m.opp) + '</b><span class="sp"></span><span class="mu">' + (m.state === 'over' ? 'Maç bitti' : m.minute + '. dk') + '</span></div>';
    if (m.state === 'over') {
      return h + '<div class="card" style="text-align:center"><div style="font-size:46px;font-weight:900">' + m.fs[0] + ' - ' + m.fs[1] + '</div><div class="res" style="color:' + (m.res === 3 ? 'var(--ok)' : m.res === 0 ? 'var(--bad)' : 'var(--tx)') + '">' + (m.res === 3 ? 'GALİBİYET' : m.res === 1 ? 'BERABERLİK' : 'MAĞLUBİYET') + '</div><div style="font-size:30px;font-weight:900" class="gold">' + m.final.toFixed(1) + '</div><div class="mu">Maçın puanı</div><div style="margin:8px 0">' + m.g + ' gol · ' + m.a + ' asist</div><div class="gold">+' + money(m.pay) + '</div></div><button class="btn pri" id="matchEnd">' + (S.phase === 'seasonEnd' ? 'Sezonu bitir' : 'Devam') + '</button>';
    }
    h += '<div class="card" style="padding:8px"><div class="row"><b>' + KN[m.kind] + '</b><span class="sp"></span><span class="mu">Pozisyon ' + Math.min(m.i + 1, m.list.length) + '/' + m.list.length + ' · Puan ' + m.rating.toFixed(1) + '</span></div>';
    h += '<canvas id="cv" width="720" height="800"></canvas><div class="res ' + (m.cls || '') + '" style="color:' + (m.cls === 'ok' ? 'var(--ok)' : m.cls === 'bad' ? 'var(--bad)' : 'var(--tx)') + '">' + esc(m.msg || (m.kind === 'sut' || m.kind === 'pen' ? 'Parmağını kaydır: yana = yön, yukarı = güç' : m.kind === 'drib' ? 'Savunmacının hamlesini oku — yönünü seç' : 'Pas seç')) + '</div>';
    if (m.state === 'wait' && m.kind === 'pas') h += m.opts.map(function (o, i) { var p = Math.round(clamp(0.95 - o.r * 1.1 + (S.st.pass - 50) / 250 - condition() * .5 - m.diff * .25, .1, .97) * 100); return '<button class="btn" style="margin:6px 0" data-pas="' + i + '">' + o.n + ' <span class="mu">(başarı ~%' + p + ')</span></button>'; }).join('');
    if (m.state === 'wait' && m.kind === 'drib') h += '<div class="row"><button class="btn" data-dr="-1">◀ Sol</button><button class="btn" data-dr="0">▲ Orta</button><button class="btn" data-dr="1">Sağ ▶</button></div>';
    if (m.state === 'done') h += '<button class="btn pri" id="nextM">Devam ▶</button>';
    return h + '</div>';
  }
  function startScene() { cancelAnimationFrame(raf); setTimeout(function () { cv = document.getElementById('cv'); if (!cv) return; cx = cv.getContext('2d'); cx.setTransform(2, 0, 0, 2, 0, 0); if (MC.kind === 'sut' || MC.kind === 'pen') bindShot(); bindSwipe(); loop(); }, 30); }
  function bindShot() {
    cv.onpointerdown = function (e) { if (!MC || (MC.kind !== 'sut' && MC.kind !== 'pen') || MC.state !== 'wait') return; var r = cv.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, k: 360 / r.width }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} };
    cv.onpointermove = function (e) { if (!drag) return; drag.dx = (e.clientX - drag.x) * drag.k; drag.dy = (e.clientY - drag.y) * drag.k; };
    cv.onpointerup = function () { if (!drag) return; var d = drag; drag = null; var pw = clamp(-d.dy / 150, 0, 1.3), x = clamp(d.dx / 90, -1.4, 1.4); if (pw < 0.08) return; resolveShot(x, pw); };
    cv.onpointercancel = function () { drag = null; };
  }
  function bindSwipe() {
    if (MC.kind !== 'drib') return; var sx = 0;
    cv.onpointerdown = function (e) { sx = e.clientX; }; cv.onpointerup = function (e) { if (MC.state !== 'wait') return; var d = e.clientX - sx; if (Math.abs(d) > 30) resolveDrib(d < 0 ? -1 : 1); else if (Math.abs(d) < 10) { /* dokun = orta */ } };
  }
  function loop() {
    if (!cv || !document.body.contains(cv)) return; draw(); raf = requestAnimationFrame(loop);
  }
  function draw() {
    var c = cx, m = MC; if (!m) return; var t = performance.now() / 1000;
    var g = c.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#0b3d1e'); g.addColorStop(1, '#14803c'); c.fillStyle = g; c.fillRect(0, 0, 360, 400);
    for (var i = 0; i < 8; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'; c.fillRect(0, i * 50, 360, 50); }
    if (m.kind === 'sut' || m.kind === 'pen') drawShot(c, m, t); else if (m.kind === 'drib') drawDrib(c, m, t); else drawPas(c, m, t);
  }
  function jersey(c, x, y, col, s, lean) { c.save(); c.translate(x, y); c.rotate(lean || 0); c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 18 * s, 14 * s, 5 * s, 0, 0, 6.3); c.fill(); c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(-11 * s, -4 * s, 22 * s, 24 * s, 6 * s) : c.rect(-11 * s, -4 * s, 22 * s, 24 * s); c.fill(); c.fillStyle = '#f2c9a0'; c.beginPath(); c.arc(0, -12 * s, 8 * s, 0, 6.3); c.fill(); c.restore(); }
  function drawShot(c, m, t) {
    var gx = 180, gw = 130, top = 60, bot = 190, GX = function (x) { return gx + x * gw; }, GY = function (h) { return bot - h * 120; };
    c.fillStyle = 'rgba(255,255,255,.08)'; for (var i = 0; i <= 14; i++) { c.fillRect(gx - gw + i * (2 * gw / 14), top, 1, bot - top); } for (i = 0; i <= 6; i++) c.fillRect(gx - gw, top + i * 20, 2 * gw, 1);
    c.strokeStyle = '#fff'; c.lineWidth = 5; c.strokeRect(gx - gw, top, 2 * gw, bot - top);
    var kx = 0, dv = 0, a = m.anim;
    if (a) { var k = clamp(a.t / 0.35, 0, 1); kx = a.o.kx * k; if (a.o.r === 'goal' || a.o.r === 'save') dv = k; }
    else kx = Math.sin(t * 2) * 0.12;
    var kxp = GX(kx), kyp = bot - 28 - (dv ? Math.min(0, a.o.h - 0.4) * 0 : 0) - (a && a.o.r === 'save' ? a.o.h * 40 * dv : 0);
    jersey(c, kxp, kyp, '#ffb02e', 1.5, kx * 1.1 * dv);
    /* nişan */
    var bx = 180, by = 340, tx = bx, ty = by, px = bx, py = by;
    if (drag && m.state === 'wait') {
      var pw = clamp(-drag.dy / 150, 0, 1.3), ax = clamp(drag.dx / 90, -1.4, 1.4); var h = 0.12 + 0.9 * clamp(pw, 0, 1.1); tx = GX(ax); ty = GY(h);
      c.strokeStyle = 'rgba(255,230,80,.9)'; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(bx, by); c.lineTo(tx, ty); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(tx, ty, 9, 0, 6.3); c.stroke();
      /* güç çubuğu */
      c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(14, 220, 16, 150); c.fillStyle = 'rgba(80,255,120,.35)'; c.fillRect(14, 370 - 150 * 0.95, 16, 150 * 0.4); c.fillStyle = pw > 1.05 ? '#ff5d6c' : pw < 0.3 ? '#ffb02e' : '#c6ff3d'; c.fillRect(14, 370 - 150 * Math.min(1.1, pw), 16, 150 * Math.min(1.1, pw));
    }
    var bpx = bx, bpy = by, sc = 1;
    if (a) { a.t += 1 / 60; var f = clamp(a.t / 0.55, 0, 1), ex = GX(clamp(a.o.x, -1.6, 1.6)), ey = GY(clamp(a.o.h, 0, 1.4)); bpx = bx + (ex - bx) * f; bpy = by + (ey - by) * f - Math.sin(f * 3.14) * 14; sc = 1 - 0.55 * f; if (a.o.r === 'save' && f >= 1) { bpx = kxp; bpy = kyp - 6; } }
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(bpx, (a ? by + (bpy - by) * 0 : by) + 12 * sc, 12 * sc, 4 * sc, 0, 0, 6.3); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(bpx, bpy, 12 * sc, 0, 6.3); c.fill(); c.fillStyle = '#222'; c.beginPath(); c.arc(bpx, bpy, 4 * sc, 0, 6.3); c.fill();
    jersey(c, 180, 380, '#2aa9ff', 1.1, 0);
    c.fillStyle = '#fff9'; c.font = '12px system-ui'; c.textAlign = 'center'; if (!a && m.state === 'wait') c.fillText(m.kind === 'pen' ? 'Penaltı noktası' : 'Aşağıdan yukarı kaydır', 180, 300);
  }
  function drawDrib(c, m, t) {
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 90); c.lineTo(360, 90); c.stroke(); c.beginPath(); c.arc(180, 90, 60, 0, 3.14); c.stroke();
    var lean = m.tell * 0.45 * (0.5 + 0.5 * Math.sin(t * 6)), dx = 180 + m.tell * 14 * Math.sin(t * 4);
    jersey(c, dx, 150, '#ff5d6c', 2, lean); c.fillStyle = '#fff9'; c.font = 'bold 13px system-ui'; c.textAlign = 'center'; c.fillText('Savunmacı', dx, 100);
    jersey(c, 180, 330, '#2aa9ff', 1.8, 0); c.fillStyle = '#fff'; c.beginPath(); c.arc(180, 372, 10, 0, 6.3); c.fill();
    c.fillStyle = '#fffb'; c.fillText('◀ sola / sağa ▶ kaydır ya da butona bas', 180, 250);
  }
  function drawPas(c, m, t) {
    var pos = [[90, 250, '#7be0ff'], [180, 170, '#ffd54a'], [270, 90, '#ff9a5c']];
    jersey(c, 180, 350, '#2aa9ff', 1.6, 0); c.fillStyle = '#fff'; c.beginPath(); c.arc(180, 386, 10, 0, 6.3); c.fill();
    m.opts.forEach(function (o, i) { var p = pos[i]; c.strokeStyle = p[2]; c.lineWidth = 3; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(180, 340); c.lineTo(p[0], p[1] + 10); c.stroke(); c.setLineDash([]); jersey(c, p[0], p[1], p[2], 1.3, 0); c.fillStyle = '#fff'; c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.fillText(o.n, p[0], p[1] - 24); });
    jersey(c, 230, 60, '#ff5d6c', 1.1, 0); jersey(c, 120, 200, '#ff5d6c', 1.1, 0);
  }
  /* ---- render ---- */
  function nav() { var t = [['hub', '🏟', 'Ana'], ['train', '💪', 'Antrenman'], ['shop', '🛍', 'Mağaza'], ['live', '⚔', 'Canlı'], ['career', '📈', 'Kariyer'], ['board', '🏆', 'Sıralama']]; return '<nav>' + t.map(function (x) { return '<button data-tab="' + x[0] + '" class="' + (ui.tab === x[0] ? 'on' : '') + '"><b>' + x[1] + '</b>' + x[2] + '</button>'; }).join('') + '</nav>'; }
  function render() {
    cancelAnimationFrame(raf); var h = '';
    if (ui.view === 'boot') h = '<h1>ALTIN AYAK</h1><p class="sub">Yükleniyor…</p>';
    else if (ui.view === 'login') h = viewLogin();
    else if (ui.view === 'create') h = viewCreate();
    else if (ui.view === 'retired') h = viewRetired() + (boardData ? viewBoard() : '');
    else if (ui.view === 'match') h = viewMatch();
    else if (ui.view === 'duel') h = duelHTML();
    else if (S.phase === 'seasonEnd') h = viewSeasonEnd();
    else if (S.phase === 'offers') h = viewOffers();
    else if (S.phase === 'retireAsk') h = viewRetireAsk();
    else { h = ({ hub: viewHub, train: viewTrain, shop: viewShop, live: viewLive, career: viewCareer, board: viewBoard })[ui.tab](); h += nav(); }
    $app.innerHTML = h; wire(); window.scrollTo(0, 0);
    if (ui.view === 'duel') startDuelScene();
    if (ui.view === 'match' && MC && MC.state !== 'over' && (MC.kind === 'sut' || MC.kind === 'pen' || MC.kind === 'drib' || MC.kind === 'pas')) startScene();
  }
  function q(s) { return $app.querySelector(s); } function qa(s) { return $app.querySelectorAll(s); }
  function wire() {
    var b;
    if ((b = q('#goLogin'))) b.onclick = function () { usernameLogin(q('#un').value); };
    qa('[data-pos]').forEach(function (e) { e.onclick = function () { createPos = e.getAttribute('data-pos'); var n = q('#pn').value; render(); q('#pn').value = n; }; });
    if ((b = q('#goCreate'))) b.onclick = function () { var n = q('#pn').value.trim().slice(0, 18) || uname; newCareer(n, createPos); ui.view = 'main'; ui.tab = 'hub'; startPresence(); render(); };
    if ((b = q('#newCareer'))) b.onclick = function () { S = null; ui.view = 'create'; render(); };
    if ((b = q('#goBoard'))) b.onclick = function () { loadBoard(); };
    qa('[data-tab]').forEach(function (e) { e.onclick = function () { ui.tab = e.getAttribute('data-tab'); if (ui.tab === 'board') loadBoard(); render(); }; });
    qa('[data-bd]').forEach(function (e) { e.onclick = function () { ui.board = e.getAttribute('data-bd'); render(); }; });
    if ((b = q('#goMatch'))) b.onclick = startMatch;
    qa('[data-train]').forEach(function (e) { e.onclick = function () { train(e.getAttribute('data-train')); }; });
    if ((b = q('#doRest'))) b.onclick = rest;
    qa('[data-buy]').forEach(function (e) { e.onclick = function () { var p = e.getAttribute('data-buy').split(':'); buy(p[0], +p[1]); }; });
    qa('[data-pas]').forEach(function (e) { e.onclick = function () { resolvePas(+e.getAttribute('data-pas')); }; });
    qa('[data-dr]').forEach(function (e) { e.onclick = function () { resolveDrib(+e.getAttribute('data-dr')); }; });
    if ((b = q('#nextM'))) b.onclick = nextMoment;
    if ((b = q('#matchEnd'))) b.onclick = function () { ui.view = 'main'; MC = null; ui.tab = 'hub'; if (S.phase === 'seasonEnd') render(); else render(); };
    if ((b = q('#doSeasonEnd'))) b.onclick = seasonEnd;
    qa('[data-offer]').forEach(function (e) { e.onclick = function () { var o = S.offers[+e.getAttribute('data-offer')]; S.club = o.club; S.tier = o.tier; S.money += o.sign; toast('Transfer tamam: ' + o.club); nextSeason(); }; });
    if ((b = q('#stay'))) b.onclick = nextSeason;
    if ((b = q('#doRetire'))) b.onclick = retire;
    qa('[data-ch]').forEach(function (e) { e.onclick = function () { challenge(e.getAttribute('data-ch')); }; });
    qa('[data-dv]').forEach(function (e) { e.onclick = function () { duelPick(+e.getAttribute('data-dv')); }; });
    if ((b = q('#duelCancel'))) b.onclick = closeDuel;
    if ((b = q('#duelOut'))) b.onclick = closeDuel;
    if ((b = q('#oneMore'))) b.onclick = function () { S.phase = 'play'; save(true); render(); };
  }

  /* ---- canlı düello (arkadaşla gerçek zamanlı) ---- */
  var lobbyData = {}, inv = {}, DM = null, DREF = null, presOn = false, dTimer = 0;
  function refOf() { return Math.round((S.st.fit + S.st.spd) / 2); }
  function setPresence(busy) { if (!db || !uid || !S) return; try { db.ref('rp/kariyer/lobby/' + uid).set({ n: uname, nm: S.name, o: ovr(), c: S.club, b: busy ? 1 : 0, ts: Date.now() }); } catch (e) {} }
  function startPresence() {
    if (!db || !uid || !S || presOn) return; presOn = true;
    try { db.ref('rp/kariyer/lobby/' + uid).onDisconnect().remove(); } catch (e) {}
    setPresence(false);
    db.ref('rp/kariyer/lobby').on('value', function (s) { lobbyData = s.val() || {}; if (ui.view === 'main' && ui.tab === 'live' && S && S.phase === 'play') { var sc = window.scrollY; render(); window.scrollTo(0, sc); } });
    db.ref('rp/kariyer/inv/' + uid).on('value', function (s) { inv = s.val() || {}; showInv(); });
  }
  function showInv() {
    var old = document.getElementById('invB'); if (old) old.remove();
    if (!S || ui.view === 'duel' || ui.view === 'match') return;
    var ids = Object.keys(inv).filter(function (k) { return inv[k] && Date.now() - (inv[k].ts || 0) < 180000; }); if (!ids.length) return;
    var f = ids[0], v = inv[f], d = document.createElement('div'); d.id = 'invB';
    d.style.cssText = 'position:fixed;left:10px;right:10px;bottom:84px;z-index:60;max-width:460px;margin:0 auto;background:#23306a;border:2px solid #c6ff3d;border-radius:14px;padding:12px';
    d.innerHTML = '<b>⚔ ' + esc(v.nm) + '</b> <span class="mu">(Genel ' + v.o + ')</span> seni canlı maça davet ediyor!<div class="row" style="margin-top:8px"><button class="btn sm pri" id="invY">Kabul et</button><button class="btn sm" id="invN">Reddet</button></div>';
    document.body.appendChild(d);
    document.getElementById('invY').onclick = function () { acceptInv(f, v); };
    document.getElementById('invN').onclick = function () { try { db.ref('rp/kariyer/duel/' + v.id + '/st').set('declined'); } catch (e) {} db.ref('rp/kariyer/inv/' + uid + '/' + f).remove(); };
  }
  function challenge(tid) {
    if (!db || !S || DM) return; var id = uid.slice(0, 5) + Date.now().toString(36);
    db.ref('rp/kariyer/duel/' + id).set({ a: uid, an: S.name, au: uname, ao: ovr(), as: eff('shot'), ar: refOf(), st: 'wait', cur: 0, n: 10, t: 0, sc: [0, 0] });
    db.ref('rp/kariyer/inv/' + tid + '/' + uid).set({ id: id, nm: S.name, o: ovr(), ts: Date.now() });
    openDuel(id, true);
  }
  function acceptInv(from, v) {
    db.ref('rp/kariyer/duel/' + v.id).once('value').then(function (s) {
      var d = s.val(); db.ref('rp/kariyer/inv/' + uid + '/' + from).remove();
      if (!d || d.st !== 'wait') { toast('Davet artık geçerli değil'); return; }
      db.ref('rp/kariyer/duel/' + v.id).update({ b: uid, bn: S.name, bu: uname, bo: ovr(), bs: eff('shot'), br: refOf(), st: 'play', t: snow(), cur: 0 });
      openDuel(v.id, false);
    });
  }
  var tOff = 0; try { if (db) db.ref('.info/serverTimeOffset').on('value', function (s) { tOff = s.val() || 0; }); } catch (e) {}
  function snow() { return Date.now() + tOff; }
  function openDuel(id, host) {
    DM = { id: id, host: host, d: null, rk: '', paid: false, anim: null, shownN: -1, resolving: false, ended: false }; DREF = db.ref('rp/kariyer/duel/' + id);
    try { DREF.child('gone/' + uid).onDisconnect().set(true); } catch (e) {}
    setPresence(true); ui.view = 'duel'; ui.tab = 'live'; showInv(); render();
    DREF.on('value', onDuel); clearInterval(dTimer); dTimer = setInterval(duelTick, 1000);
  }
  function closeDuel() {
    clearInterval(dTimer); var d = DM && DM.d;
    try { if (DREF) { DREF.off(); if (d && d.st === 'play') DREF.child('gone/' + uid).set(true); else if (DM.host) DREF.remove(); } } catch (e) {}
    DM = null; DREF = null; ui.view = 'main'; ui.tab = 'live'; setPresence(false); render();
  }
  function duelRole(d) { var n = d.cur, att = n % 2 === 0 ? d.a : d.b; return att === uid ? 'att' : 'def'; }
  function onDuel(snap) {
    if (!DM) return; var d = snap.val();
    if (!d) { if (DM && !DM.ended) toast('Maç iptal edildi'); DM.ended = true; closeDuel(); return; }
    DM.d = d;
    if (d.st === 'declined') { toast('Davet reddedildi'); closeDuel(); return; }
    if (d.st === 'wait') { var k0 = 'wait'; if (DM.rk !== k0) { DM.rk = k0; render(); } return; }
    var opp = d.a === uid ? d.b : d.a;
    if (d.st === 'play' && d.gone && d.gone[opp]) { DREF.update({ st: 'end', w: uid, ff: 1 }); return; }
    var n = d.cur, r = (d.r || {})[n] || {};
    if (d.st === 'play' && DM.host && r.s && r.d !== undefined && !r.res && !DM.resolving) hostResolve(n, r);
    if (d.st === 'play' && r.res && DM.shownN !== n) { DM.shownN = n; DM.anim = { t: 0, o: r.res }; if (DM.host) setTimeout(function () { advance(n); }, 2900); }
    var role = d.st === 'play' ? duelRole(d) : 'end', my = role === 'att' ? r.s : r.d, ph = d.st === 'end' ? 'end' : r.res ? 'res' : (my !== undefined ? 'wait' : 'pick');
    var key = d.st + ':' + n + ':' + ph + ':' + d.n; if (key !== DM.rk) { DM.rk = key; if (ph === 'pick') DM.anim = null; render(); } else duelTexts();
    if (d.st === 'end' && !DM.paid) payDuel(d);
  }
  function duelShot(sh, rf, x, pw, dive) {
    var sd = Math.max(0.06, 0.52 - sh / 99 * 0.4), h = 0.12 + 0.9 * clamp(pw, 0, 1.1), fx = x + gauss() * sd, fh = h + gauss() * sd * 0.35, kx = dive * 0.65;
    if (pw > 1.12) fh += 0.25;
    if (fh > 1.02) return { r: 'over', x: fx, h: fh, kx: kx }; if (Math.abs(fx) > 1.06) return { r: 'wide', x: fx, h: fh, kx: kx }; if (Math.abs(fx) > 1.0) return { r: 'post', x: fx, h: fh, kx: kx };
    var reach = (0.27 + rf / 99 * 0.2) * (1.2 - 0.55 * clamp(fh, 0, 1)) * (pw < 0.3 ? 1.9 : 1); if (fh > 0.75 && Math.abs(fx) > 0.6) reach *= 0.55;
    return { r: Math.abs(fx - kx) < reach ? 'save' : 'goal', x: fx, h: fh, kx: kx };
  }
  function hostResolve(n, r) {
    DM.resolving = true; var d = DM.d, aIsA = n % 2 === 0, sh = aIsA ? d.as : d.bs, rf = aIsA ? d.br : d.ar, res = duelShot(sh, rf, r.s.x, r.s.pw, r.d), sc = (d.sc || [0, 0]).slice();
    if (res.r === 'goal') sc[aIsA ? 0 : 1]++;
    DREF.child('r/' + n + '/res').set(res); DREF.child('sc').set(sc); DM.resolving = false;
  }
  function advance(n) {
    var d = DM && DM.d; if (!d || d.st !== 'play' || d.cur !== n) return; var nx = n + 1, sc = d.sc || [0, 0];
    if (nx >= d.n) { if (sc[0] === sc[1] && d.n < 16) DREF.update({ n: d.n + 2, cur: nx, t: snow() }); else DREF.update({ st: 'end', w: sc[0] > sc[1] ? d.a : sc[1] > sc[0] ? d.b : 'draw' }); }
    else DREF.update({ cur: nx, t: snow() });
  }
  function duelTick() {
    var d = DM && DM.d; if (!d || d.st !== 'play') return; var n = d.cur, r = (d.r || {})[n] || {}, el = (snow() - (d.t || 0)) / 1000;
    var tm = document.getElementById('dtm'); if (tm) tm.textContent = r.res ? '' : Math.max(0, Math.ceil(15 - el)) + ' sn';
    if (DM.host && el > 16 && !r.res) { if (!r.s) DREF.child('r/' + n + '/s').set({ x: 0, pw: 0.2, to: 1 }); if (r.d === undefined) DREF.child('r/' + n + '/d').set(0); }
  }
  function duelPick(dv) { var d = DM && DM.d; if (!d || d.st !== 'play') return; DREF.child('r/' + d.cur + '/d').set(dv); }
  function payDuel(d) {
    DM.paid = true; var win = d.w === uid, draw = d.w === 'draw';
    if (win) { S.dw = (S.dw || 0) + 1; var g = 400 * (1 + S.tier); S.money += g; S.rep += 2; DM.reward = '+' + money(g) + ' · +2 itibar'; } else if (draw) { S.money += 150; DM.reward = '+' + money(150); } else { S.dl = (S.dl || 0) + 1; S.money += 100; DM.reward = '+' + money(100); }
    save(true);
  }
  function duelText(res, d) {
    var n = d.cur, aN = n % 2 === 0 ? d.an : d.bn, who = aN;
    return { goal: 'GOOOL! ⚽ ' + who + ' attı', save: 'Kaleci kurtardı!', post: 'DİREK!', wide: 'Auta gitti', over: 'Üstünden uçtu' }[res.r];
  }
  function duelHTML() {
    var d = DM && DM.d; if (!d) return '<div class="card">Bağlanıyor…</div>';
    if (d.st === 'wait') return '<h1>⚔ CANLI MAÇ</h1><div class="card" style="text-align:center"><b>Rakip bekleniyor…</b><p class="mu">Davet gönderildi. Arkadaşın kabul edince maç başlar.</p></div><button class="btn" id="duelCancel">İptal</button>';
    var sc = d.sc || [0, 0];
    if (d.st === 'end') {
      var win = d.w === uid, draw = d.w === 'draw';
      return '<h1>' + (draw ? 'BERABERE' : win ? '🏆 KAZANDIN!' : 'Kaybettin') + '</h1><div class="card" style="text-align:center"><div class="mu">' + esc(d.an) + ' vs ' + esc(d.bn) + '</div><div style="font-size:50px;font-weight:900">' + sc[0] + ' - ' + sc[1] + '</div>' + (d.ff ? '<div class="mu">Rakip oyundan ayrıldı</div>' : '') + '<div class="gold">' + (DM.reward || '') + '</div></div><button class="btn pri" id="duelOut">Tamam</button>';
    }
    var role = duelRole(d), n = d.cur, r = (d.r || {})[n] || {}, my = role === 'att' ? r.s : r.d, ph = r.res ? 'res' : (my !== undefined ? 'wait' : 'pick');
    var h = '<div class="card row"><b>' + esc(d.an) + '</b><span class="sp" style="text-align:center;font-size:24px;font-weight:900" id="dsc">' + sc[0] + ' - ' + sc[1] + '</span><b>' + esc(d.bn) + '</b></div>';
    h += '<div class="card" style="padding:8px"><div class="row"><b>' + (role === 'att' ? '🎯 Şutçusun' : '🧤 Kalecisin') + '</b><span class="sp"></span><span class="mu">Tur ' + (n + 1) + '/' + d.n + ' · <span id="dtm"></span></span></div><canvas id="cv" width="720" height="800"></canvas><div class="res" id="dmsg">' + (ph === 'res' ? esc(duelText(r.res, d)) : ph === 'wait' ? 'Rakip bekleniyor…' : role === 'att' ? 'Kaydır: yana = yön, yukarı = güç' : 'Hangi tarafa atlarsın?') + '</div>';
    if (role === 'def' && ph === 'pick') h += '<div class="row"><button class="btn" data-dv="-1">◀ Sol</button><button class="btn" data-dv="0">▲ Orta</button><button class="btn" data-dv="1">Sağ ▶</button></div>';
    return h + '</div>';
  }
  function duelTexts() { var d = DM && DM.d; if (!d) return; var el = document.getElementById('dsc'); if (el) el.textContent = (d.sc || [0, 0]).join(' - '); var r = (d.r || {})[d.cur] || {}, m = document.getElementById('dmsg'); if (m && r.res) m.textContent = duelText(r.res, d); }
  function startDuelScene() {
    cancelAnimationFrame(raf); setTimeout(function () {
      cv = document.getElementById('cv'); if (!cv || !DM || !DM.d || DM.d.st !== 'play') return; cx = cv.getContext('2d'); cx.setTransform(2, 0, 0, 2, 0, 0);
      cv.onpointerdown = function (e) { var d = DM && DM.d; if (!d || duelRole(d) !== 'att') return; var rr = (d.r || {})[d.cur] || {}; if (rr.s) return; var b = cv.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, k: 360 / b.width }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} };
      cv.onpointermove = function (e) { if (!drag) return; drag.dx = (e.clientX - drag.x) * drag.k; drag.dy = (e.clientY - drag.y) * drag.k; };
      cv.onpointerup = function () { if (!drag) return; var dd = drag; drag = null; var pw = clamp(-dd.dy / 150, 0, 1.3), x = clamp(dd.dx / 90, -1.4, 1.4); if (pw < 0.08) return; var d = DM.d; DREF.child('r/' + d.cur + '/s').set({ x: Math.round(x * 100) / 100, pw: Math.round(pw * 100) / 100 }); };
      (function dl() { if (!cv || !document.body.contains(cv) || !DM) return; var d = DM.d, r = d && (d.r || {})[d.cur] || {}; var c = cx; var g = c.createLinearGradient(0, 0, 0, 400); g.addColorStop(0, '#0b3d1e'); g.addColorStop(1, '#14803c'); c.fillStyle = g; c.fillRect(0, 0, 360, 400); for (var i = 0; i < 8; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'; c.fillRect(0, i * 50, 360, 50); }
        var att = d && duelRole(d) === 'att'; drawShot(c, { kind: 'sut', state: att && !r.s ? 'wait' : 'x', anim: DM.anim }, performance.now() / 1000); raf = requestAnimationFrame(dl); })();
    }, 30);
  }
  function viewLive() {
    var rows = Object.keys(lobbyData).filter(function (k) { return k !== uid; }).map(function (k) { var v = lobbyData[k]; v.id = k; return v; });
    var h = '<h2>Canlı maç</h2><div class="card"><b>Arkadaşınla gerçek zamanlı düello</b><div class="mu">10 tur: sırayla biri şutçu, diğeri kaleci olur. Şutçu yön ve gücü seçer, kaleci aynı anda hangi köşeye atlayacağını seçer. Şut ve refleks değerlerin önemli. Kariyerini etkilemez; kazanana para + itibar.</div><div class="mu" style="margin-top:6px">Galibiyet: <b class="gold">' + (S.dw || 0) + '</b> · Mağlubiyet: ' + (S.dl || 0) + '</div></div><h2>Çevrimiçi oyuncular</h2>';
    if (!db) return h + '<div class="card mu">Çevrimiçi mod için bağlantı yok.</div>';
    rows.forEach(function (r) { h += '<div class="card row"><div class="sp"><b>' + esc(r.nm) + '</b> <span class="mu">(' + esc(r.n) + ')</span><div class="mu">Genel ' + r.o + ' · ' + esc(r.c || '') + (r.b ? ' · maçta' : '') + '</div></div><button class="btn sm hot" data-ch="' + r.id + '"' + (r.b ? ' disabled' : '') + '>⚔ Meydan oku</button></div>'; });
    if (!rows.length) h += '<div class="card mu">Şu an kimse çevrimiçi değil. Arkadaşların Altın Ayak\'ı açınca burada görünür.</div>';
    return h;
  }
  window.__KR = { S: function () { return S; }, MC: function () { return MC; }, ui: ui, shot: function (x, pw) { resolveShot(x, pw); }, ovr: ovr, train: train, startMatch: startMatch, shotOutcome: shotOutcome, seasonEnd: seasonEnd };
  boot();
})();
