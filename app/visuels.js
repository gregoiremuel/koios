/* Visuels des fiches de Koîos : « En chiffres » (barres), « Réseau des notions » (graphe), citation.
   Fonctions pures qui renvoient des nœuds DOM ou du SVG ; aucune donnée inventée : tout vient du chapitre. */
(function (g) {
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) { if (k === "text") n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); } });
    (enfants || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function svg(tag, attrs, texte) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (texte != null) n.textContent = texte;
    return n;
  }
  function nombre(v) {
    try { return v.toLocaleString("fr-FR", { maximumFractionDigits: 3 }); } catch (e) { return String(v); }
  }

  /* chiffres : [{ libelle, valeur, unite }] ; couleur : verre du domaine. */
  function barres(chiffres, couleur) {
    var liste = (chiffres || []).filter(function (c) { return c && typeof c.valeur === "number" && isFinite(c.valeur); });
    if (liste.length < 2) return null;
    var max = Math.max.apply(null, liste.map(function (c) { return Math.abs(c.valeur); })) || 1;
    var bloc = el("div", { "class": "graphe-barres", role: "list" });
    liste.forEach(function (c) {
      var pct = Math.max(2, Math.round(Math.abs(c.valeur) / max * 100));
      var valeur = nombre(c.valeur) + (c.unite ? " " + c.unite : "");
      var ligne = el("div", { "class": "ligne-barre", role: "listitem", "aria-label": c.libelle + "\u00a0: " + valeur }, [
        el("span", { "class": "nom", text: c.libelle, "aria-hidden": "true" }),
        el("span", { "class": "piste", "aria-hidden": "true" }, [el("i", { style: "width:" + pct + "%;background:" + (couleur || "#a8802f") })]),
        el("span", { "class": "val", text: valeur, "aria-hidden": "true" })
      ]);
      bloc.appendChild(ligne);
    });
    return bloc;
  }

  function coupe(t) {
    if (t.length <= 16) return [t];
    var m = Math.floor(t.length / 2), a = t.lastIndexOf(" ", m), b = t.indexOf(" ", m);
    var k = a < 0 ? b : (b < 0 ? a : (m - a <= b - m ? a : b));
    return k < 0 ? [t] : [t.slice(0, k), t.slice(k + 1)];
  }

  /* notions : { noeuds: [..], liens: [[a, b, relation]] } ; graphe rayonnant autour de la notion la plus reliée. */
  function reseau(notions) {
    if (!notions || !notions.noeuds || !notions.liens) return null;
    var noeuds = notions.noeuds.slice(0, 7);
    var liens = notions.liens.filter(function (l) { return noeuds.indexOf(l[0]) >= 0 && noeuds.indexOf(l[1]) >= 0 && l[0] !== l[1]; }).slice(0, 8);
    if (noeuds.length < 3 || liens.length < 2) return null;
    var degre = {};
    noeuds.forEach(function (n) { degre[n] = 0; });
    liens.forEach(function (l) { degre[l[0]] += 1; degre[l[1]] += 1; });
    var centre = noeuds.slice().sort(function (a, b) { return degre[b] - degre[a]; })[0];
    var autres = noeuds.filter(function (n) { return n !== centre; });
    var W = 340, H = 280, cx = W / 2, cy = H / 2, pos = {};
    pos[centre] = [cx, cy];
    autres.forEach(function (n, k) {
      var a = -Math.PI / 2 + k * 2 * Math.PI / autres.length;
      pos[n] = [cx + Math.cos(a) * 118, cy + Math.sin(a) * 100];
    });
    var s = svg("svg", { "class": "graphe-reseau", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Réseau des notions\u00a0: " + liens.map(function (l) { return l[0] + " et " + l[1] + ", " + l[2]; }).join(" ; ") });
    liens.forEach(function (l) {
      var p = pos[l[0]], q = pos[l[1]];
      s.appendChild(svg("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], "class": "lien-reseau" }));
    });
    liens.forEach(function (l) {
      var p = pos[l[0]], q = pos[l[1]], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      var t = String(l[2] || "").slice(0, 22), w = t.length * 5.4 + 8;
      s.appendChild(svg("rect", { x: mx - w / 2, y: my - 8, width: w, height: 15, rx: 3, "class": "fond-relation" }));
      s.appendChild(svg("text", { x: mx, y: my + 3.5, "class": "relation", "text-anchor": "middle" }, t));
    });
    noeuds.forEach(function (n) {
      var lignes = coupe(n), larg = Math.min(130, Math.max.apply(null, lignes.map(function (x) { return x.length; })) * 6.6 + 16);
      var haut = lignes.length * 15 + 10, p = pos[n];
      var x = Math.min(Math.max(p[0], larg / 2 + 2), W - larg / 2 - 2), y = Math.min(Math.max(p[1], haut / 2 + 2), H - haut / 2 - 2);
      s.appendChild(svg("rect", { x: x - larg / 2, y: y - haut / 2, width: larg, height: haut, rx: 6, "class": n === centre ? "noeud centre" : "noeud" }));
      lignes.forEach(function (ligne, k) {
        s.appendChild(svg("text", { x: x, y: y - (lignes.length - 1) * 7.5 + k * 15 + 4, "text-anchor": "middle", "class": n === centre ? "nom-noeud centre" : "nom-noeud" }, ligne));
      });
    });
    return s;
  }

  /* citation : { texte, auteur, oeuvre, source: [titre, url] } */
  function citation(c) {
    if (!c || !c.texte || !c.auteur) return null;
    var legende = el("figcaption", {}, ["— " + c.auteur, c.oeuvre ? ", " : null, c.oeuvre ? el("cite", { text: c.oeuvre }) : null]);
    if (c.source && c.source[1]) { legende.appendChild(document.createTextNode(" · ")); legende.appendChild(el("a", { href: c.source[1], target: "_blank", rel: "noopener", text: "source" })); }
    return el("figure", { "class": "citation" }, [el("blockquote", {}, [el("p", { text: "« " + c.texte + " »" })]), legende]);
  }

  g.Visuels = { barres: barres, reseau: reseau, citation: citation };
})(window);
