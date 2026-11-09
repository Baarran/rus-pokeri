/* Buz Dünyası — özgün tasarım buz haritası. Her şey eksen hizalı kutulardır (çarpışma + ışın testi kolay). */
(function (root) {
  'use strict';
  var B = [];   // {x,z,w,d,y,h,t}  merkez x,z · boyut w(x) d(z) h(yükseklik) · y taban · t: ice|snow|crate|wall
  function box(x, z, w, d, h, t, y) { B.push({ x: x, z: z, w: w, d: d, h: h, y: y || 0, t: t || 'ice' }); }
  function wall(x1, z1, x2, z2, h, t) {            // ince duvar (0.7 kalın)
    var th = 0.7;
    if (Math.abs(z1 - z2) < 1e-6) box((x1 + x2) / 2, z1, Math.abs(x2 - x1), th, h, t || 'ice');
    else box(x1, (z1 + z2) / 2, th, Math.abs(z2 - z1), h, t || 'ice');
  }
  // kapılı bina: doors = {N|S|W|E: [merkez, genişlik]...}
  function building(x1, z1, x2, z2, h, doors) {
    function side(a1, a2, fixed, horiz, door) {
      var segs = [[a1, a2]];
      (door || []).forEach(function (dd) {
        var c = dd[0], w = dd[1], out = [];
        segs.forEach(function (s) {
          if (c + w / 2 <= s[0] || c - w / 2 >= s[1]) { out.push(s); return; }
          if (c - w / 2 > s[0]) out.push([s[0], c - w / 2]);
          if (c + w / 2 < s[1]) out.push([c + w / 2, s[1]]);
        }); segs = out;
      });
      segs.forEach(function (s) { if (horiz) wall(s[0], fixed, s[1], fixed, h); else wall(fixed, s[0], fixed, s[1], h); });
    }
    side(x1, x2, z1, true, doors.N); side(x1, x2, z2, true, doors.S); side(z1, z2, x1, false, doors.W); side(z1, z2, x2, false, doors.E);
  }
  var H = 40;
  // dış sınır
  box(0, -H - 0.5, 2 * H + 4, 1, 7, 'wall'); box(0, H + 0.5, 2 * H + 4, 1, 7, 'wall'); box(-H - 0.5, 0, 1, 2 * H + 4, 7, 'wall'); box(H + 0.5, 0, 1, 2 * H + 4, 7, 'wall');
  // üs avluları: ortada 12 m kapı, yanlarda 8 m geçit
  [-1, 1].forEach(function (s) {
    var z = s * 27;
    wall(-40, z, -31, z, 3.2); wall(-23, z, -7, z, 3.2); wall(7, z, 23, z, 3.2); wall(31, z, 40, z, 3.2);
    box(-15, s * 35, 3, 1.4, 1.2, 'crate'); box(15, s * 35, 3, 1.4, 1.2, 'crate'); box(0, s * 37.5, 5, 1.2, 2.2, 'ice');
    box(-33, s * 33, 2, 2, 1.2, 'crate'); box(33, s * 33, 2, 2, 1.2, 'crate');
  });
  // sol & sağ buz binaları (dört yönden kapılı)
  building(-30, -11, -15, 11, 3.6, { N: [[-22.5, 4]], S: [[-22.5, 4]], E: [[0, 4.5]], W: [[-4, 3.5]] });
  building(15, -11, 30, 11, 3.6, { N: [[22.5, 4]], S: [[22.5, 4]], W: [[0, 4.5]], E: [[4, 3.5]] });
  box(-22.5, 0, 3, 3, 1.2, 'crate'); box(22.5, 0, 3, 3, 1.2, 'crate');   // bina içi sandıklar
  // orta donmuş göl: kule + sütunlar + alçak siperler
  box(0, 0, 5, 5, 3.2, 'ice');
  [[-8, -8], [8, -8], [-8, 8], [8, 8]].forEach(function (p) { box(p[0], p[1], 2, 2, 4, 'ice'); });
  box(-5, -14, 6, 1.1, 1.2, 'snow'); box(5, 14, 6, 1.1, 1.2, 'snow'); box(5, -14, 6, 1.1, 1.2, 'snow'); box(-5, 14, 6, 1.1, 1.2, 'snow');
  box(0, -20, 2.4, 2.4, 1.3, 'crate'); box(0, 20, 2.4, 2.4, 1.3, 'crate');
  // kenar şeritlerinde siper
  box(-36, -17, 2.4, 2.4, 1.3, 'crate'); box(-36, 17, 2.4, 2.4, 1.3, 'crate'); box(36, -17, 2.4, 2.4, 1.3, 'crate'); box(36, 17, 2.4, 2.4, 1.3, 'crate');
  box(-36, 0, 1.8, 6, 2.4, 'ice'); box(36, 0, 1.8, 6, 2.4, 'ice');
  box(-12, -21, 1.5, 4, 2.0, 'ice'); box(12, 21, 1.5, 4, 2.0, 'ice'); box(12, -21, 1.5, 4, 2.0, 'ice'); box(-12, 21, 1.5, 4, 2.0, 'ice');
  var M = {
    boxes: B, half: H,
    spawns: {
      T: [[-9, 36], [-5, 36], [-1, 36], [3, 36], [7, 36], [11, 33], [-12, 33], [0, 32]],
      CT: [[-9, -36], [-5, -36], [-1, -36], [3, -36], [7, -36], [11, -33], [-12, -33], [0, -32]]
    }
  };
  if (typeof module !== 'undefined') module.exports = M; else root.MAP = M;
})(this);
