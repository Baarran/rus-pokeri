/* ===================================================================
   main.js  —  Arayüz: giriş, ana menü (lobi + envanter), savaş ekranı,
   maç oluşturma/katılma, maç sonu ödülü
   =================================================================== */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2800); }
  function show(v) { ['authView', 'hubView', 'battleView'].forEach(function (id) { $(id).hidden = id !== v; }); }

  var P = null, tab = 'lobby', lobby = {}, myMatches = {}, matchInfo = {}, view = 'auth';
  var game = null, battle = null;   // battle: {id, mref, sref, uref, match}

  /* ---------------- GİRİŞ ---------------- */
  var mode = 'login';
  function setMode(m) { mode = m; $('tabLogin').classList.toggle('on', m === 'login'); $('tabReg').classList.toggle('on', m === 'reg'); $('auGo').textContent = m === 'login' ? 'Giriş yap' : 'Hesap oluştur'; $('auErr').textContent = ''; }
  $('tabLogin').onclick = function () { setMode('login'); }; $('tabReg').onclick = function () { setMode('reg'); };
  $('auGo').onclick = function () {
    var n = $('auName').value, p = $('auPass').value; $('auErr').textContent = ''; $('auGo').disabled = true;
    (mode === 'login' ? Auth.login(n, p) : Auth.register(n, p)).then(function () { $('auGo').disabled = false; }, function (e) { $('auGo').disabled = false; $('auErr').textContent = Auth.errText(e); });
  };
  $('auPass').onkeydown = function (e) { if (e.key === 'Enter') $('auGo').click(); };
  $('btnOut').onclick = function () { Auth.logout(); };

  Auth.onChange(function (p) {
    P = p;
    if (!p) { leaveBattle(); stopHubListeners(); view = 'auth'; show('authView'); return; }
    if (view === 'auth') { view = 'hub'; show('hubView'); startHubListeners(); }
    renderProfile(); if (view === 'hub') renderHub();
  });

  /* ---------------- PROFİL ÇUBUĞU ---------------- */
  function renderProfile() {
    if (!P) return;
    var base = Rules.xpForLevel(P.level), next = Rules.xpForLevel(P.level + 1), pc = Math.round((P.xp - base) / (next - base) * 100);
    $('pName').textContent = P.name; $('pLv').textContent = 'Sv ' + P.level;
    $('pXp').style.width = pc + '%'; $('pXpT').textContent = 'XP ' + P.xp + ' / ' + next;
    $('pGold').textContent = P.gold; $('pHp').textContent = P.maxHp; $('pArmor').textContent = P.armor; $('pWL').textContent = P.wins + '/' + P.losses;
  }
  $('hbLobby').onclick = function () { tab = 'lobby'; $('hbLobby').classList.add('on'); $('hbInv').classList.remove('on'); renderHub(); };
  $('hbInv').onclick = function () { tab = 'inv'; $('hbInv').classList.add('on'); $('hbLobby').classList.remove('on'); renderHub(); };

  /* ---------------- LOBİ DİNLEYİCİLERİ ---------------- */
  var lref = null, umref = null;
  function startHubListeners() {
    stopHubListeners();
    lref = DB.ref('lobby'); lref.on('value', function (s) { lobby = s.val() || {}; if (view === 'hub') renderHub(); });
    umref = DB.ref('userMatches/' + DB.uid());
    umref.on('value', function (s) {
      myMatches = s.val() || {};
      Object.keys(myMatches).forEach(function (id) {
        DB.ref('matches/' + id).once('value').then(function (ms) {
          var v = ms.val();
          if (!v) { DB.ref('userMatches/' + DB.uid() + '/' + id).remove(); delete matchInfo[id]; }
          else matchInfo[id] = { status: v.status, bot: v.bot, host: v.host, names: Object.keys(v.players || {}).map(function (u) { return v.players[u].name; }), done: !!v.winner };
          if (view === 'hub') renderHub();
        });
      });
      if (view === 'hub') renderHub();
    });
  }
  function stopHubListeners() { if (lref) lref.off(); if (umref) umref.off(); lref = umref = null; }

  /* ---------------- ANA MENÜ GÖVDESİ ---------------- */
  function renderHub() { if (!P) return; if (tab === 'lobby') renderLobby(); else renderInv(); }
  function renderLobby() {
    var uid = DB.uid(), h = '<div class="row"><button class="btn primary" data-a="new" type="button">⚔️ Maç aç (rakip bekle)</button><button class="btn" data-a="bot" type="button">🤖 Antrenman (bot)</button></div>';
    var open = Object.keys(lobby);
    h += '<div class="card"><h3>Açık maçlar</h3>';
    if (!open.length) h += '<small style="color:var(--mut)">Şu an rakip bekleyen maç yok. Sen bir tane aç!</small>';
    open.forEach(function (id) {
      var l = lobby[id], mine = l.uid === uid;
      h += '<div class="item"><div><b>' + esc(l.name) + '</b><small>' + (mine ? 'Senin maçın' : 'Rakip arıyor') + '</small></div>' +
        (mine ? '<button class="btn sm" data-a="open" data-id="' + esc(id) + '" type="button">Aç</button>' : '<button class="btn primary sm" data-a="join" data-id="' + esc(id) + '" type="button">Katıl</button>') + '</div>';
    });
    h += '</div><div class="card"><h3>Devam eden maçlarım</h3>';
    var mine = Object.keys(myMatches).filter(function (id) { return matchInfo[id]; });
    if (!mine.length) h += '<small style="color:var(--mut)">Devam eden maç yok.</small>';
    mine.forEach(function (id) {
      var m = matchInfo[id];
      h += '<div class="item"><div><b>' + esc(m.names.join(' vs ')) + '</b><small>' + (m.status === 'waiting' ? 'Rakip bekleniyor' : m.done ? 'Bitti — ödülünü al' : 'Oynanıyor') + '</small></div><button class="btn sm" data-a="open" data-id="' + esc(id) + '" type="button">Devam</button></div>';
    });
    $('hubBody').innerHTML = h + '</div>';
  }
  function renderInv() {
    var h = '<div class="card"><h3>🛡️ Zırh</h3><div class="item"><div><b>Zırh: ' + P.armor + ' / ' + Rules.ARMOR_MAX + '</b><small>Gelen hasarı %' + Math.round(P.armor / (P.armor + 100) * 100) + ' azaltır · Maks. can: ' + P.maxHp + ' (seviyeyle artar)</small></div>' +
      (P.armor >= Rules.ARMOR_MAX ? '<span class="pill">MAX</span>' : '<button class="btn sm" data-a="armor" type="button">+' + Rules.ARMOR_STEP + ' · 🪙' + Rules.armorCost(P.armor) + '</button>') + '</div></div>';
    h += '<div class="card"><h3>🎒 Silahlar</h3>';
    WORDER.forEach(function (id) {
      var w = WEAPONS[id], it = P.inventory[id], lvl = it ? it.level : 1;
      h += '<div class="item weapon' + (it ? '' : ' locked') + '"><div style="flex:1"><div class="top"><div><span class="ic">' + w.icon + '</span><b>' + w.name + '</b> ' + (it ? '<span class="pill">Sv ' + lvl + '/' + MAX_WLEVEL + '</span>' : '') + '</div>' +
        (it ? (lvl >= MAX_WLEVEL ? '<span class="pill">MAX</span>' : '<button class="btn sm" data-a="up" data-id="' + id + '" type="button">⬆ 🪙' + Rules.upgradeCost(lvl) + '</button>') : '<span class="pill">Şema yok</span>') + '</div>' +
        '<small>' + w.desc + '</small><div class="bars"><span>Hasar ' + Rules.wDmg(id, lvl) + (w.shots > 1 ? ' ×' + w.shots : '') + '</span><div class="bar"><i style="width:' + Math.min(100, Rules.wDmg(id, lvl) / 1.6) + '%"></i></div>' +
        '<span>Çukur ' + Rules.wRad(id, lvl) + '</span><div class="bar"><i class="r" style="width:' + Math.min(100, Rules.wRad(id, lvl) / 0.8) + '%"></i></div></div>' +
        (it && lvl < MAX_WLEVEL ? '<small>Sonraki: hasar ' + Rules.wDmg(id, lvl + 1) + ', çukur ' + Rules.wRad(id, lvl + 1) + ' · gereken oyuncu seviyesi ' + Rules.upgradeNeedsLevel(lvl + 1) + '</small>' : '') + '</div></div>';
    });
    $('hubBody').innerHTML = h + '<small style="color:var(--mut)">Maçı kazanınca ganimet kutusu veya yeni silah şeması düşebilir.</small></div>';
  }
  $('hubBody').onclick = function (e) {
    var b = e.target.closest('button[data-a]'); if (!b) return; var a = b.dataset.a, id = b.dataset.id;
    if (a === 'new') createMatch(false); else if (a === 'bot') createMatch(true);
    else if (a === 'join') joinMatch(id); else if (a === 'open') openMatch(id);
    else if (a === 'up') Inv.upgrade(id).then(function () { toast('Silah geliştirildi!'); }, function (er) { toast(er.message); });
    else if (a === 'armor') Inv.buyArmor().then(function () { toast('Zırh artırıldı!'); }, function (er) { toast(er.message); });
  };

  /* ---------------- MAÇ OLUŞTUR / KATIL ---------------- */
  function snap(p, idx) { return { name: p.name, idx: idx, maxHp: p.maxHp, armor: p.armor, level: p.level }; }
  function createMatch(bot) {
    var uid = DB.uid(), id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), map = Physics.makeMap();
    var m = { status: bot ? 'playing' : 'waiting', host: uid, bot: !!bot, created: Date.now(), terrain: map.terrain, spawn: map.spawn, winds: map.winds, players: {} };
    m.players[uid] = snap(P, 0);
    if (bot) { m.players.bot = { name: 'Bot', idx: 1, maxHp: 200 + 20 * (P.level - 1), armor: Math.min(30, 5 * P.level), level: P.level }; m.order = Math.random() < 0.5 ? [uid, 'bot'] : ['bot', uid]; }
    DB.ref('matches/' + id).set(m).then(function () {
      var up = { }; up['userMatches/' + uid + '/' + id] = true; if (!bot) up['lobby/' + id] = { uid: uid, name: P.name, at: Date.now() };
      return DB.ref().update(up);
    }).then(function () { openMatch(id); }, function (e) { toast('Maç açılamadı: ' + e.message); });
  }
  function joinMatch(id) {
    var uid = DB.uid(), ok = false;
    DB.tx('matches/' + id, function (cur) {
      if (cur === null) return null;
      ok = false; if (cur.status !== 'waiting' || cur.host === uid || (cur.players && cur.players[uid])) return undefined;
      cur.players[uid] = snap(P, 1); cur.order = Math.random() < 0.5 ? [cur.host, uid] : [uid, cur.host]; cur.status = 'playing'; ok = true;
      return cur;
    }).then(function (r) {
      if (!r.committed || !ok) { toast('Bu maça katılamadın (dolmuş olabilir).'); return; }
      var up = {}; up['lobby/' + id] = null; up['userMatches/' + uid + '/' + id] = true;
      return DB.ref().update(up).then(function () { openMatch(id); });
    }, function (e) { toast('Katılamadı: ' + e.message); });
  }

  /* ---------------- SAVAŞ EKRANI ---------------- */
  function openMatch(id) {
    leaveBattle(); view = 'battle'; show('battleView'); $('resBox').hidden = true; $('waitBox').hidden = true;
    battle = { id: id, started: false, mref: DB.ref('matches/' + id), sref: null, claimed: false };
    battle.mref.on('value', function (s) {
      var m = s.val();
      if (!battle || battle.id !== id) return;
      if (!m) { toast('Maç bulunamadı.'); DB.ref('userMatches/' + DB.uid() + '/' + id).remove(); backToHub(); return; }
      if (m.status === 'waiting') { $('waitBox').hidden = false; return; }
      $('waitBox').hidden = true;
      if (!battle.started) { battle.started = true; battle.match = m; startGame(id, m); }
    });
  }
  function startGame(id, m) {
    var uid = DB.uid();
    game = new Game($('cv'), {
      id: id, uid: uid, match: m,
      onHud: function (h) {
        if (!game) return;
        $('turnInfo').textContent = h.over ? 'Maç bitti' : h.myTurn ? 'Senin sıran!' : h.busy ? 'Atış…' : h.turnName + ' oynuyor';
        $('aimInfo').textContent = 'Açı ' + h.angle + '° · Güç ' + h.power;
        $('btnFire').disabled = !h.myTurn;
      },
      onOver: function (winner, loser) { finishMatch(id, m, winner); }
    });
    var it = P.inventory[P.selected] || P.inventory.bomb; game.weapon = P.inventory[P.selected] ? P.selected : 'bomb'; game.wlevel = it.level;
    renderWeapons();
    battle.sref = DB.ref('matches/' + id + '/shots'); battle.sref.on('value', function (s) { if (game) game.onShots(s.val()); });
  }
  function renderWeapons() {
    var h = '';
    WORDER.forEach(function (id) {
      var it = P.inventory[id]; if (!it) return;
      h += '<button type="button" class="wbtn' + (game && game.weapon === id ? ' on' : '') + '" data-w="' + id + '"><b>' + WEAPONS[id].icon + '</b>' + WEAPONS[id].name + '<br>Sv ' + it.level + '</button>';
    });
    $('wbar').innerHTML = h;
  }
  $('wbar').onclick = function (e) {
    var b = e.target.closest('[data-w]'); if (!b || !game) return; var id = b.dataset.w;
    game.weapon = id; game.wlevel = P.inventory[id].level; Inv.select(id); renderWeapons();
  };
  $('btnFire').onclick = function () { if (game) game.fire(); };
  $('btnSur').onclick = function () { if (game && !game.over && confirm('Teslim olup maçı kaybetmek istiyor musun?')) game.surrender(); };
  $('btnLeave').onclick = function () { backToHub(); };
  $('btnCancel').onclick = function () {
    var id = battle && battle.id, uid = DB.uid(); if (!id) return;
    var up = {}; up['lobby/' + id] = null; up['matches/' + id] = null; up['userMatches/' + uid + '/' + id] = null;
    DB.ref().update(up).then(backToHub);
  };
  function leaveBattle() {
    if (battle) { if (battle.mref) battle.mref.off(); if (battle.sref) battle.sref.off(); }
    if (game) { game.destroy(); game = null; }
    battle = null;
  }
  function backToHub() { leaveBattle(); if (!P) return; view = 'hub'; show('hubView'); $('resBox').hidden = true; $('waitBox').hidden = true; startHubListeners(); renderProfile(); renderHub(); }

  /* ---------------- MAÇ SONU ---------------- */
  function finishMatch(id, m, winner) {
    var uid = DB.uid(), won = winner === uid;
    if (battle && battle.id === id) { battle.mref.off(); if (battle.sref) battle.sref.off(); }   // maç silinince 'bulunamadı' tetiklenmesin
    DB.tx('matches/' + id + '/winner', function (cur) { return cur === null ? winner : undefined; });
    DB.ref('matches/' + id + '/status').set('done');
    Inv.claim(id, won, !!m.bot).then(function (sum) {
      DB.ref('userMatches/' + uid + '/' + id).remove();
      DB.ref('matches/' + id + '/rewarded').once('value').then(function (s) {
        var n = Object.keys(s.val() || {}).length; if (m.bot || n >= 2) DB.ref('matches/' + id).remove();
      });
      showResult(won, sum, m, winner);
    });
  }
  function showResult(won, sum, m, winner) {
    var wname = m.players[winner] ? m.players[winner].name : '—', h = '<div class="card res"><h2 class="' + (won ? 'win' : 'lose') + '">' + (won ? '🏆 ZAFER!' : '💀 YENİLGİ') + '</h2><p>Kazanan: <b>' + esc(wname) + '</b></p>';
    if (sum) {
      h += '<p>🪙 +' + sum.gold + ' altın · ⭐ +' + sum.xp + ' XP</p>';
      if (sum.levelUp > 0) h += '<p class="win"><b>SEVİYE ATLADIN! 🎉</b></p>';
      if (sum.loot) {
        if (sum.loot.type === 'blueprint') h += '<div class="loot">📜</div><p><b>Yeni silah şeması:</b> ' + WEAPONS[sum.loot.weapon].icon + ' ' + WEAPONS[sum.loot.weapon].name + '</p>';
        else if (sum.loot.type === 'upgrade') h += '<div class="loot">✨</div><p><b>Nadir ganimet!</b> ' + WEAPONS[sum.loot.weapon].name + ' bedava Sv ' + sum.loot.level + ' oldu</p>';
        else h += '<div class="loot">🎁</div><p><b>Ganimet kutusu:</b> +' + sum.loot.gold + ' altın' + (sum.loot.xp ? ', +' + sum.loot.xp + ' XP' : '') + '</p>';
      } else if (won && !m.bot) h += '<p style="color:var(--mut)">Bu sefer ganimet düşmedi.</p>';
    } else h += '<p style="color:var(--mut)">Ödül zaten alınmış.</p>';
    h += '<button class="btn primary" id="resOk" type="button">Menüye dön</button></div>';
    $('resBox').innerHTML = h; $('resBox').hidden = false; $('resOk').onclick = backToHub;
  }

  window.__dbg = function () { return game; };
  show('authView');
})();
