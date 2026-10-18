/* Ornements gothiques de Koîos, dessinés en SVG : rosace des savoirs, niche en arc brisé, lancette, quadrilobe.
   Chaque chapitre validé allume un vitrail de la rosace, dans la couleur de son domaine. Dessins originaux. */
(function (g) {
  var PIERRE = "#e2d3b3", PLOMB = "#1d130a", ETEINT = "#4f4134", AMBRE = "#8a7650", OR = "#cfa645", BOIS = "#3b2716";
  function r2(n) { return Math.round(n * 100) / 100; }

  /* petales : [{ verre: "#couleur" ou null (éteint), neuf: bool }] ; o : { cx, cy, R, lobes: [4 couleurs ou null] } */
  function rosace(petales, o) {
    var cx = o.cx, cy = o.cy, R = o.R;
    var n = Math.max(petales.length, 8);
    var s = Math.sin(Math.PI / n);
    var rs = 0.88 * R / (1 + Math.sqrt(3) * 0.78 * s);
    var hs = rs * s * 0.78, r1 = 0.38 * R, h1 = r1 * s * 0.78;
    var apex = rs + Math.sqrt(3) * hs;
    var d = "M" + r2(-h1) + " " + r2(-r1) + "L" + r2(-hs) + " " + r2(-rs) +
      "A" + r2(2 * hs) + " " + r2(2 * hs) + " 0 0 1 0 " + r2(-apex) +
      "A" + r2(2 * hs) + " " + r2(2 * hs) + " 0 0 1 " + r2(hs) + " " + r2(-rs) +
      "L" + r2(h1) + " " + r2(-r1) + "A" + r2(r1) + " " + r2(r1) + " 0 0 0 " + r2(-h1) + " " + r2(-r1) + "Z";
    var trait = r2(R * 0.034);
    var out = '<g class="rosace">';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + PLOMB + '"/>';
    for (var i = 0; i < n; i++) {
      var p = petales[i] || { verre: null };
      var a = r2((i + 0.5) * 360 / n);
      out += '<path class="petale' + (p.neuf ? ' neuf' : '') + '" d="' + d + '" transform="translate(' + cx + ' ' + cy + ') rotate(' + a + ')" fill="' + (p.verre || ETEINT) + '" stroke="' + (p.neuf ? "#f3d98c" : PIERRE) + '" stroke-width="' + (p.neuf ? trait * 1.8 : trait) + '"/>';
      var b = i * 2 * Math.PI / n, ro = 0.8 * R * s * 0.4;
      out += '<circle cx="' + r2(cx + Math.sin(b) * 0.8 * R) + '" cy="' + r2(cy - Math.cos(b) * 0.8 * R) + '" r="' + r2(ro) + '" fill="' + AMBRE + '" stroke="' + PIERRE + '" stroke-width="' + r2(trait * 0.8) + '"/>';
    }
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(r1 - R * 0.02) + '" fill="' + PLOMB + '" stroke="' + PIERRE + '" stroke-width="' + trait + '"/>';
    var lobes = o.lobes || [];
    for (var k = 0; k < 4; k++) {
      var c = (45 + k * 90) * Math.PI / 180;
      out += '<circle cx="' + r2(cx + Math.sin(c) * 0.15 * R) + '" cy="' + r2(cy - Math.cos(c) * 0.15 * R) + '" r="' + r2(0.13 * R) + '" fill="' + (lobes[k] || ETEINT) + '" stroke="' + PIERRE + '" stroke-width="' + r2(trait * 0.8) + '"/>';
    }
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(0.075 * R) + '" fill="' + OR + '" stroke="' + PIERRE + '" stroke-width="' + r2(trait * 0.8) + '"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(R * 0.965) + '" fill="none" stroke="' + PIERRE + '" stroke-width="' + r2(R * 0.05) + '"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r2(R * 0.9) + '" fill="none" stroke="' + PIERRE + '" stroke-width="' + r2(R * 0.012) + '"/>';
    return out + '</g>';
  }

  function quadrilobe(x, y, k, attrs) {
    var p = function (a, b) { return r2(x + a * k) + " " + r2(y + b * k); };
    var r = r2(3 * k);
    return '<path d="M' + p(-0.43, -0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(0.43, -0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(0.43, 0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(-0.43, 0.43) + 'A' + r + ' ' + r + ' 0 1 1 ' + p(-0.43, -0.43) + 'Z" ' + attrs + '/>';
  }

  /* Haut de l'armoire : niche en arc brisé équilatéral (portée 300), rosace dans la tête de l'arc. */
  function ogive(petales, lobes, etiquette) {
    var arc = "M0 268A300 300 0 0 1 150 8A300 300 0 0 1 300 268Z";
    var s = '<svg class="ogive" viewBox="0 0 300 268" role="img" aria-label="' + etiquette + '">';
    s += '<path d="M-7 268A307 307 0 0 1 150 1A307 307 0 0 1 307 268" fill="none" stroke="' + BOIS + '" stroke-width="2"/>';
    s += '<path d="' + arc + '" fill="#2b1c0f"/>';
    s += '<path d="M6 268A294 294 0 0 1 150 15.1A294 294 0 0 1 294 268" fill="none" stroke="#c9a043" stroke-opacity="0.6" stroke-width="1"/>';
    s += quadrilobe(36, 40, 3.4, 'fill="none" stroke="' + BOIS + '" stroke-width="1.6"');
    s += quadrilobe(264, 40, 3.4, 'fill="none" stroke="' + BOIS + '" stroke-width="1.6"');
    s += quadrilobe(150, 33, 2.6, 'fill="' + OR + '" stroke="' + PIERRE + '" stroke-width="1.4"');
    s += rosace(petales, { cx: 150, cy: 154, R: 100, lobes: lobes });
    return s + '</svg>';
  }

  /* Rosace seule, dans un cadre rond (bilan, profil). */
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

  g.Gothique = { rosace: rosace, ogive: ogive, medaillon: medaillon, lancette: lancette, fleuron: fleuron, marque: marque };
})(window);
