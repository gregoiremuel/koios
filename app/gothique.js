/* Ornements gothiques de Koîos, dessinés en SVG : rosace des savoirs, baie en arc brisé, lancette, quadrilobe.
   Comme vu de l'intérieur d'une église : verre clair en losanges, remplage en silhouette sombre et fine.
   Chaque chapitre validé allume un vitrail de la rosace, dans la couleur de son domaine. Dessins originaux. */
(function (g) {
  var VERRE = "#f1e9d6", ETEINT = "#e3d8bf", LOSANGE = "#cdbb94", TRAIT = "#3b2716", AMBRE = "#ead9a6", OR = "#cfa645", NEUF = "#a8802f";
  function r2(n) { return Math.round(n * 100) / 100; }
  var motif = '<defs><pattern id="losanges" width="14" height="20" patternUnits="userSpaceOnUse"><rect width="14" height="20" fill="' + VERRE + '"/><path d="M0 10L7 0L14 10L7 20Z" fill="none" stroke="' + LOSANGE + '" stroke-width="0.7"/></pattern></defs>';

  /* petales : [{ verre: "#couleur" ou null (éteint), neuf: bool }] ; o : { cx, cy, R, lobes: [4 couleurs ou null] } */
  function rosace(petales, o) {
    var cx = o.cx, cy = o.cy, R = o.R;
    var n = Math.max(petales.length, 4);
    var s = Math.sin(Math.PI / n);
    var rs = 0.88 * R / (1 + Math.sqrt(3) * 0.78 * s);
    var hs = rs * s * 0.78, r1 = 0.38 * R, h1 = r1 * s * 0.78;
    var apex = rs + Math.sqrt(3) * hs;
    var d = "M" + r2(-h1) + " " + r2(-r1) + "L" + r2(-hs) + " " + r2(-rs) +
      "A" + r2(2 * hs) + " " + r2(2 * hs) + " 0 0 1 0 " + r2(-apex) +
      "A" + r2(2 * hs) + " " + r2(2 * hs) + " 0 0 1 " + r2(hs) + " " + r2(-rs) +
      "L" + r2(h1) + " " + r2(-r1) + "A" + r2(r1) + " " + r2(r1) + " 0 0 0 " + r2(-h1) + " " + r2(-r1) + "Z";
    var trait = r2(Math.max(R * 0.026, 1));
    var out = '<g class="rosace">';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + VERRE + '"/>';
    for (var i = 0; i < n; i++) {
      var p = petales[i] || { verre: null };
      var a = r2((i + 0.5) * 360 / n);
      out += '<path class="petale' + (p.neuf ? ' neuf' : '') + '" d="' + d + '" transform="translate(' + cx + ' ' + cy + ') rotate(' + a + ')" fill="' + (p.verre || ETEINT) + '" stroke="' + (p.neuf ? NEUF : TRAIT) + '" stroke-width="' + r2(p.neuf ? trait * 2 : trait) + '"/>';
      var b = i * 2 * Math.PI / n, ro = 0.8 * R * s * 0.4;
      out += '<circle cx="' + r2(cx + Math.sin(b) * 0.8 * R) + '" cy="' + r2(cy - Math.cos(b) * 0.8 * R) + '" r="' + r2(ro) + '" fill="' + AMBRE + '" stroke="' + TRAIT + '" stroke-width="' + r2(trait * 0.8) + '"/>';
    }
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(r1 - R * 0.02) + '" fill="' + VERRE + '" stroke="' + TRAIT + '" stroke-width="' + trait + '"/>';
    var lobes = o.lobes || [];
    for (var k = 0; k < 4; k++) {
      var c = (45 + k * 90) * Math.PI / 180;
      out += '<circle cx="' + r2(cx + Math.sin(c) * 0.15 * R) + '" cy="' + r2(cy - Math.cos(c) * 0.15 * R) + '" r="' + r2(0.13 * R) + '" fill="' + (lobes[k] || ETEINT) + '" stroke="' + TRAIT + '" stroke-width="' + r2(trait * 0.8) + '"/>';
    }
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(0.075 * R) + '" fill="' + OR + '" stroke="' + TRAIT + '" stroke-width="' + r2(trait * 0.8) + '"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(R * 0.975) + '" fill="none" stroke="' + TRAIT + '" stroke-width="' + r2(R * 0.04) + '"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(R * 0.9) + '" fill="none" stroke="' + TRAIT + '" stroke-width="' + r2(Math.max(R * 0.01, 0.6)) + '"/>';
    return out + '</g>';
  }

  function quadrilobe(x, y, k, attrs) {
    var p = function (a, b) { return r2(x + a * k) + " " + r2(y + b * k); };
    var r = r2(3 * k);
    return '<path d="M' + p(-0.43, -0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(0.43, -0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(0.43, 0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(-0.43, 0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(-0.43, -0.43) + 'Z" ' + attrs + '/>';
  }
  function sculpte(x, y, k) { return quadrilobe(x, y, k, 'fill="none" stroke="#3b2716" stroke-width="1.5"'); }

  /* Tête vitrée de l'armoire : arc brisé en lancette (rayon 1,2 fois la portée), rosace à 60 % de la largeur, arcature basse. */
  function ogive(petales, lobes, etiquette) {
    var s = '<svg class="ogive" viewBox="0 0 300 300" role="img" aria-label="' + etiquette + '">' + motif;
    s += '<path d="M-7 300A367 367 0 0 1 150 -1A367 367 0 0 1 307 300" fill="none" stroke="#3b2716" stroke-width="1.6"/>';
    s += '<path d="M0 300A360 360 0 0 1 150 8A360 360 0 0 1 300 300Z" fill="url(#losanges)" stroke="' + TRAIT + '" stroke-width="3"/>';
    s += '<path d="M6 300A354 354 0 0 1 150 15A354 354 0 0 1 294 300" fill="none" stroke="#a8802f" stroke-width="1"/>';
    s += sculpte(34, 60, 3.4) + sculpte(266, 60, 3.4);
    s += quadrilobe(150, 50, 2.6, 'fill="' + OR + '" stroke="' + TRAIT + '" stroke-width="1.6"');
    s += rosace(petales, { cx: 150, cy: 170, R: 90, lobes: lobes });
    [100, 150, 200].forEach(function (x) {
      s += '<path d="M' + (x - 25) + ' 293V286A35.6 35.6 0 0 1 ' + x + ' 264A35.6 35.6 0 0 1 ' + (x + 25) + ' 286V293" fill="none" stroke="' + TRAIT + '" stroke-width="1.6"/>';
    });
    s += '<rect x="0" y="292" width="300" height="8" fill="#4a3220"/><path d="M0 292H300" stroke="#a8802f" stroke-width="1"/>';
    return s + '</svg>';
  }

  /* Baie seule, haute et étroite : rosace dans la tête de l'arc, deux lancettes dessous (accueil, profil). */
  function baie(petales, lobes, etiquette) {
    var s = '<svg class="baie" viewBox="0 0 200 330" role="img" aria-label="' + etiquette + '">' + motif;
    s += sculpte(22, 40, 2.4) + sculpte(178, 40, 2.4);
    s += '<path d="M0 330V211A260 260 0 0 1 100 6A260 260 0 0 1 200 211V330Z" fill="url(#losanges)" stroke="' + TRAIT + '" stroke-width="3"/>';
    s += '<path d="M6 330V211A254 254 0 0 1 100 13A254 254 0 0 1 194 211V330" fill="none" stroke="#a8802f" stroke-width="1"/>';
    s += quadrilobe(100, 40, 2, 'fill="' + OR + '" stroke="' + TRAIT + '" stroke-width="1.4"');
    s += rosace(petales, { cx: 100, cy: 128, R: 62, lobes: lobes });
    [[14, 96], [104, 186]].forEach(function (l) {
      var m = (l[0] + l[1]) / 2;
      s += '<path d="M' + l[0] + ' 322V272A51 51 0 0 1 ' + m + ' 222A51 51 0 0 1 ' + l[1] + ' 272V322Z" fill="none" stroke="' + TRAIT + '" stroke-width="2.4"/>';
      s += quadrilobe(m, 250, 2.2, 'fill="' + AMBRE + '" stroke="' + TRAIT + '" stroke-width="1.2"');
    });
    return s + '</svg>';
  }

  /* Rosace seule, dans un cadre rond (bilan). */
  function medaillon(petales, lobes, etiquette) {
    return '<svg class="medaillon" viewBox="0 0 132 132" role="img" aria-label="' + etiquette + '"><circle cx="66" cy="66" r="65" fill="#6b4a2f"/>' + rosace(petales, { cx: 66, cy: 66, R: 58, lobes: lobes }) + '</svg>';
  }

  /* Petite lancette en verre de couleur, emblème d'un domaine. */
  function lancette(verre) {
    return '<svg viewBox="0 0 44 92" aria-hidden="true"><path d="M4 92V33A36 36 0 0 1 22 1.8A36 36 0 0 1 40 33V92Z" fill="' + verre + '" stroke="#2a2119" stroke-width="1.6"/>' +
      '<path d="M4 62H40M22 62V92" stroke="#2a2119" stroke-width="1.2"/>' + quadrilobe(22, 34, 2.3, 'fill="none" stroke="#2a2119" stroke-width="1.2"') + '</svg>';
  }

  function fleuron() {
    return '<svg viewBox="0 0 16 16" aria-hidden="true">' + quadrilobe(8, 8, 1, 'fill="none" stroke="currentColor" stroke-width="1.1"') + '<circle cx="8" cy="8" r="1.1" fill="currentColor"/></svg>';
  }

  /* Marque : petite rosace aux quatre couleurs des domaines. */
  function marque(verres) {
    var p = [];
    for (var i = 0; i < 8; i++) p.push({ verre: verres[Math.floor(i / 2)] });
    return '<svg viewBox="0 0 64 64" aria-hidden="true">' + rosace(p, { cx: 32, cy: 32, R: 31, lobes: verres }) + '</svg>';
  }

  g.Gothique = { rosace: rosace, ogive: ogive, baie: baie, medaillon: medaillon, lancette: lancette, fleuron: fleuron, marque: marque };
})(window);
