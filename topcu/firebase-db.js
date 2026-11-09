/* ===================================================================
   firebase-db.js  —  Firebase bağlantısı ve ortak veritabanı yardımcıları
   -------------------------------------------------------------------
   VERİTABANI AĞACI (Realtime Database, kök: /topcu)

   topcu/
   ├─ users/{uid}/                    ← kalıcı oyuncu profili
   │    ├─ name: "Baran"
   │    ├─ level: 3        xp: 215      gold: 480
   │    ├─ maxHp: 240      armor: 15    (HP seviyeyle, zırh dükkândan artar)
   │    ├─ wins: 4         losses: 2
   │    ├─ selected: "triple"           (son seçilen silah)
   │    ├─ created: 1731170000000
   │    └─ inventory/                   ← silah envanteri
   │         ├─ bomb/    { level: 3 }
   │         ├─ triple/  { level: 1 }
   │         └─ laser/   { level: 2 }
   ├─ lobby/{matchId}/  { uid, name, at }       ← rakip bekleyen açık maçlar
   ├─ userMatches/{uid}/{matchId}: true         ← oyuncunun devam eden maçları
   └─ matches/{matchId}/
        ├─ status: "waiting" | "playing" | "done"
        ├─ host: uid           bot: true|false
        ├─ created: 1731170000000
        ├─ terrain: [241 tamsayı]   ← arazi yükseklik haritası (4 px'de bir)
        ├─ spawn:   [x0, x1]        ← iki oyuncunun başlangıç X konumu
        ├─ winds:   [-10..10, ...]  ← tur başına rüzgâr (tur no % uzunluk)
        ├─ order:   [uidA, uidB]    ← sıra düzeni (turn = atış sayısı % 2)
        ├─ players/{uid}/ { name, idx, maxHp, armor, level }
        ├─ shots/s000, s001, ...    ← atış günlüğü (her şey buradan yeniden oynatılır)
        │     { n, uid, w:"bomb", l:2, ang:48, pw:71, t:serverTime,
        │       bursts:[ { p:[x,y,x,y,...], x, y, r, d:{uid:hasar} } ] }
        │     (pas: {n,uid,skip:1}   teslim: {n,uid,sur:1})
        ├─ winner: uid
        └─ rewarded/{uid}: true         ← ödül tekrar alınmasın diye kilit
   =================================================================== */
(function (w) {
  'use strict';
  var CONFIG = {
    apiKey: 'AIzaSyBsP1VNPJpt1Y6MN0FwDCmvuHeZxaDoTGU',
    authDomain: 'ruspokeri-de28e.firebaseapp.com',
    databaseURL: 'https://ruspokeri-de28e-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'ruspokeri-de28e'
  };
  if (!(firebase.apps && firebase.apps.length)) firebase.initializeApp(CONFIG);
  var root = firebase.database().ref('topcu');
  var offset = 0;
  try { firebase.database().ref('.info/serverTimeOffset').on('value', function (s) { offset = s.val() || 0; }); } catch (e) { /* sunucu saati yoksa yerel saat */ }

  var DB = {
    ref: function (p) { return p ? root.child(p) : root; },
    now: function () { return Date.now() + offset; },
    auth: function () { return firebase.auth(); },
    uid: function () { var u = firebase.auth().currentUser; return u ? u.uid : null; },
    /* Transaction: fn(cur) → yeni değer; undefined dönersen iptal. Firebase ilk çağrıda cur=null verebilir,
       bu yüzden fn her zaman null'a dayanıklı yazılmalı. */
    tx: function (path, fn) { return root.child(path).transaction(fn); },
    pad: function (n) { return ('00' + n).slice(-3); }
  };
  w.DB = DB;
})(window);
