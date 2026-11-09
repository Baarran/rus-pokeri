/* ===================================================================
   auth-inventory.js  —  Giriş/kayıt, kalıcı profil, silah kataloğu,
   envanter, silah geliştirme, zırh dükkânı ve maç sonu ganimet sistemi
   =================================================================== */
(function (w) {
  'use strict';
  var MAX_WLEVEL = 5;

  /* ---- Silah kataloğu. dmg/rad: [1. seviye değeri, seviye başına artış] ---- */
  var WEAPONS = {
    bomb:      { name: 'Basit Bomba', icon: '💣', kind: 'shell', dmg: [50, 25], rad: [22, 13], wind: 1.0, speed: 1.0, shots: 1, spread: 0,
                 desc: 'Dengeli, güvenilir. Seviye atladıkça devasa çukur açar.' },
    triple:    { name: 'Üçlü Atış', icon: '🔱', kind: 'shell', dmg: [26, 10], rad: [16, 6], wind: 1.0, speed: 1.0, shots: 3, spread: 7,
                 desc: 'Yelpaze şeklinde 3 mermi; her biri ayrı çukur açar.' },
    missile:   { name: 'Füze', icon: '🚀', kind: 'shell', dmg: [70, 25], rad: [28, 10], wind: 1.9, speed: 1.15, shots: 1, spread: 0,
                 desc: 'Çok sert vurur ama hafif olduğu için rüzgârdan çok etkilenir.' },
    boomerang: { name: 'Bumerang', icon: '🪃', kind: 'shell', dmg: [60, 20], rad: [24, 8], wind: 0.5, speed: 1.0, shots: 1, spread: 0, back: 0.08,
                 desc: 'Giderken ve dönerken vurabilir. Dikkat: sana da dönebilir!' },
    laser:     { name: 'Lazer', icon: '⚡', kind: 'beam', dmg: [40, 15], rad: [10, 4], wind: 0, speed: 1.0, shots: 1, spread: 0,
                 desc: 'Rüzgâr ve yerçekiminden etkilenmez; düz çizgide anında vurur.' }
  };
  var WORDER = ['bomb', 'triple', 'missile', 'boomerang', 'laser'];
  function wDmg(id, lvl) { var d = WEAPONS[id].dmg; return d[0] + (lvl - 1) * d[1]; }
  function wRad(id, lvl) { var r = WEAPONS[id].rad; return r[0] + (lvl - 1) * r[1]; }

  /* ---- Seviye / maliyet formülleri ---- */
  function levelFromXp(xp) { return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 50)); }
  function xpForLevel(l) { return 50 * (l - 1) * (l - 1); }
  function maxHpFor(level) { return 200 + (level - 1) * 20; }
  function upgradeCost(curLvl) { return 60 * curLvl * curLvl; }           // 1→2: 60, 2→3: 240, 3→4: 540, 4→5: 960
  function upgradeNeedsLevel(targetLvl) { return [0, 1, 2, 3, 5, 7][targetLvl]; } // hedef silah seviyesi → gereken oyuncu seviyesi
  function armorCost(armor) { return 80 + armor * 10; }
  var ARMOR_STEP = 5, ARMOR_MAX = 60;

  function norm(p) {
    p = p || {};
    p.inventory = p.inventory || {};
    if (!p.inventory.bomb) p.inventory.bomb = { level: 1 };
    p.xp = p.xp || 0; p.gold = p.gold || 0; p.armor = p.armor || 0; p.wins = p.wins || 0; p.losses = p.losses || 0;
    p.level = levelFromXp(p.xp); p.maxHp = maxHpFor(p.level);
    if (!p.selected || !p.inventory[p.selected]) p.selected = 'bomb';
    return p;
  }
  function defaultProfile(name) {
    return norm({ name: name, xp: 0, gold: 150, armor: 0, wins: 0, losses: 0, selected: 'bomb', created: Date.now(), inventory: { bomb: { level: 1 } } });
  }

  /* ---- Kullanıcı adı ↔ e-posta (Firebase Auth e-posta/şifre ile çalışır) ---- */
  function nameToEmail(name) {
    var parts = []; name = name.toLowerCase();
    for (var i = 0; i < name.length; i++) parts.push(name.charCodeAt(i).toString(16));
    return 'u' + parts.join('-') + '@topcu.oyun';
  }
  function emailToName(email) {
    var s = String(email || '').split('@')[0].slice(1).split('-'), o = '';
    s.forEach(function (h) { o += String.fromCharCode(parseInt(h, 16)); });
    return o || 'Oyuncu';
  }
  var NAME_RE = /^[A-Za-z0-9ğüşıöçĞÜŞİÖÇ_]{3,14}$/;

  /* ---- AUTH ---- */
  var listeners = [], profRef = null, pendingName = null;
  var Auth = {
    profile: null, ready: false,
    onChange: function (fn) { listeners.push(fn); },
    emit: function () { listeners.forEach(function (f) { try { f(Auth.profile); } catch (e) { console.error(e); } }); },
    uid: function () { return DB.uid(); },
    register: function (name, pass) {
      name = (name || '').trim();
      if (!NAME_RE.test(name)) return Promise.reject({ message: 'Kullanıcı adı 3–14 karakter olmalı (harf, rakam, _).' });
      if ((pass || '').length < 6) return Promise.reject({ message: 'Şifre en az 6 karakter olmalı.' });
      pendingName = name;
      return DB.auth().createUserWithEmailAndPassword(nameToEmail(name), pass);
    },
    login: function (name, pass) {
      name = (name || '').trim();
      if (!name || !pass) return Promise.reject({ message: 'Kullanıcı adı ve şifre gerekli.' });
      return DB.auth().signInWithEmailAndPassword(nameToEmail(name), pass);
    },
    logout: function () { return DB.auth().signOut(); },
    errText: function (e) {
      var c = (e && e.code) || '';
      if (c === 'auth/email-already-in-use') return 'Bu kullanıcı adı alınmış.';
      if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-login-credentials') return 'Kullanıcı adı veya şifre yanlış.';
      if (c === 'auth/weak-password') return 'Şifre çok zayıf (en az 6 karakter).';
      if (c === 'auth/operation-not-allowed') return 'Firebase\'de E-posta/Şifre girişi kapalı.';
      return (e && e.message) || 'Bir hata oluştu.';
    }
  };

  DB.auth().onAuthStateChanged(function (user) {
    if (profRef) { profRef.off(); profRef = null; }
    Auth.profile = null;
    if (!user) { Auth.ready = true; Auth.emit(); return; }
    var nm = pendingName || emailToName(user.email); pendingName = null;
    // profil yoksa oluştur (varsa dokunma)
    DB.tx('users/' + user.uid, function (cur) { return cur === null ? defaultProfile(nm) : undefined; }).then(function () {
      profRef = DB.ref('users/' + user.uid);
      profRef.on('value', function (s) { var v = s.val(); if (!v) return; Auth.profile = norm(v); Auth.ready = true; Auth.emit(); });
    });
  });

  /* ---- ENVANTER İŞLEMLERİ (hepsi transaction ile; altın sahteciliği olmasın diye) ---- */
  var Inv = {
    select: function (wid) {
      var uid = DB.uid(); if (!uid || !WEAPONS[wid]) return Promise.resolve();
      return DB.tx('users/' + uid + '/selected', function (cur) { return wid; });
    },
    upgrade: function (wid) {
      var uid = DB.uid(), err = null;
      return DB.tx('users/' + uid, function (cur) {
        if (cur === null) return null;
        var p = norm(cur), it = p.inventory[wid]; err = null;
        if (!it) { err = 'Bu silahı henüz bulmadın.'; return undefined; }
        if (it.level >= MAX_WLEVEL) { err = 'Silah zaten son seviyede.'; return undefined; }
        var target = it.level + 1, cost = upgradeCost(it.level);
        if (p.level < upgradeNeedsLevel(target)) { err = 'Bu geliştirme için Seviye ' + upgradeNeedsLevel(target) + ' gerekli.'; return undefined; }
        if (p.gold < cost) { err = 'Yetersiz altın (' + cost + ' gerekli).'; return undefined; }
        p.gold -= cost; it.level = target;
        return p;
      }).then(function (r) { if (!r.committed) throw new Error(err || 'İşlem başarısız.'); return r; });
    },
    buyArmor: function () {
      var uid = DB.uid(), err = null;
      return DB.tx('users/' + uid, function (cur) {
        if (cur === null) return null;
        var p = norm(cur); err = null;
        if (p.armor >= ARMOR_MAX) { err = 'Zırh en üst seviyede.'; return undefined; }
        var cost = armorCost(p.armor);
        if (p.gold < cost) { err = 'Yetersiz altın (' + cost + ' gerekli).'; return undefined; }
        p.gold -= cost; p.armor += ARMOR_STEP;
        return p;
      }).then(function (r) { if (!r.committed) throw new Error(err || 'İşlem başarısız.'); return r; });
    },
    /* Maç sonu ödülü: bir maç için kişi başı yalnızca BİR kez (rewarded kilidi). */
    claim: function (mid, won, isBot) {
      var uid = DB.uid();
      return DB.tx('matches/' + mid + '/rewarded/' + uid, function (cur) { return cur === null ? true : undefined; }).then(function (lock) {
        if (!lock.committed) return null;
        var roll = Math.random(), pick = Math.random(), boxGold = 40 + Math.floor(Math.random() * 101), sum = null;
        var baseGold = won ? (isBot ? 30 : 60 + Math.floor(Math.random() * 41)) : (isBot ? 8 : 20);
        var baseXp = won ? (isBot ? 30 : 60) : (isBot ? 8 : 20);
        return DB.tx('users/' + uid, function (cur) {
          if (cur === null) return null;
          var p = norm(cur), oldLvl = p.level;
          sum = { won: won, gold: baseGold, xp: baseXp, loot: null, levelUp: 0 };
          p.gold += baseGold; p.xp += baseXp;
          if (won) p.wins++; else p.losses++;
          if (won && !isBot) {                      // ganimet kutusu / silah şeması
            if (roll < 0.35) {
              if (pick < 0.12) {                    // nadir: bir silahı bedava 1 seviye yükselt
                var up = WORDER.filter(function (k) { return p.inventory[k] && p.inventory[k].level < MAX_WLEVEL; });
                if (up.length) { var k = up[Math.floor(pick / 0.12 * up.length) % up.length]; p.inventory[k].level++; sum.loot = { type: 'upgrade', weapon: k, level: p.inventory[k].level }; }
              }
              if (!sum.loot) { p.gold += boxGold; p.xp += 20; sum.loot = { type: 'box', gold: boxGold, xp: 20 }; }
            } else if (roll < 0.65) {               // yeni silah şeması
              var un = WORDER.filter(function (k) { return !p.inventory[k]; });
              if (un.length) { var wk = un[Math.floor(pick * un.length) % un.length]; p.inventory[wk] = { level: 1 }; sum.loot = { type: 'blueprint', weapon: wk }; }
              else { p.gold += 120; sum.loot = { type: 'box', gold: 120, xp: 0 }; }
            }
          }
          p.level = levelFromXp(p.xp); p.maxHp = maxHpFor(p.level);
          sum.levelUp = p.level - oldLvl;
          return p;
        }).then(function () { return sum; });
      });
    }
  };

  w.WEAPONS = WEAPONS; w.WORDER = WORDER; w.MAX_WLEVEL = MAX_WLEVEL;
  w.Auth = Auth; w.Inv = Inv;
  w.Rules = { wDmg: wDmg, wRad: wRad, upgradeCost: upgradeCost, upgradeNeedsLevel: upgradeNeedsLevel, armorCost: armorCost, ARMOR_STEP: ARMOR_STEP, ARMOR_MAX: ARMOR_MAX, xpForLevel: xpForLevel, maxHpFor: maxHpFor, levelFromXp: levelFromXp };
})(window);
