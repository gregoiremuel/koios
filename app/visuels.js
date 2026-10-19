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

  /* notions : { noeuds: [..], liens: [[a, b, relation]] } ; graphe rayonnant autour de la notion la plus reliée.
     Le dessin montre les liens ; la liste dessous nomme chaque relation. Si des nœuds se chevauchent, seule la liste reste. */
  function liste(liens) {
    var ul = el("ul", { "class": "liste-notions" });
    liens.forEach(function (l) { ul.appendChild(el("li", {}, [el("b", { text: l[0] }), " ", el("em", { text: "— " + l[2] + " —" }), " ", el("b", { text: l[1] })])); });
    return ul;
  }
  function chevauche(a, b, marge) { marge = marge || 0; return a.x - marge < b.x + b.w && b.x - marge < a.x + a.w && a.y - marge < b.y + b.h && b.y - marge < a.y + a.h; }
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
    var W = 340, H = 320, cx = W / 2, cy = H / 2, boite = {};
    function placer(n, x, y) {
      var lignes = coupe(n), larg = Math.min(124, Math.max.apply(null, lignes.map(function (t) { return t.length; })) * 6.8 + 16), haut = lignes.length * 15 + 10;
      x = Math.min(Math.max(x, larg / 2 + 2), W - larg / 2 - 2); y = Math.min(Math.max(y, haut / 2 + 2), H - haut / 2 - 2);
      boite[n] = { x: x - larg / 2, y: y - haut / 2, w: larg, h: haut, cx: x, cy: y, lignes: lignes };
    }
    placer(centre, cx, cy);
    autres.forEach(function (n, k) { var a = -Math.PI / 2 + k * 2 * Math.PI / autres.length; placer(n, cx + Math.cos(a) * 112, cy + Math.sin(a) * 124); });
    for (var a1 = 0; a1 < noeuds.length; a1++) for (var b1 = a1 + 1; b1 < noeuds.length; b1++) if (chevauche(boite[noeuds[a1]], boite[noeuds[b1]], 4)) return liste(liens);
    var s = svg("svg", { "class": "graphe-reseau", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Réseau des notions : " + liens.map(function (l) { return l[0] + " et " + l[1] + ", " + l[2]; }).join(" ; ") });
    liens.forEach(function (l) { var p = boite[l[0]], q = boite[l[1]]; s.appendChild(svg("line", { x1: p.cx, y1: p.cy, x2: q.cx, y2: q.cy, "class": "lien-reseau" })); });
    noeuds.forEach(function (n) {
      var b = boite[n];
      s.appendChild(svg("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6, "class": n === centre ? "noeud centre" : "noeud" }));
      b.lignes.forEach(function (ligne, k) { s.appendChild(svg("text", { x: b.cx, y: b.cy - (b.lignes.length - 1) * 7.5 + k * 15 + 4, "text-anchor": "middle", "class": n === centre ? "nom-noeud centre" : "nom-noeud" }, ligne)); });
    });
    s.setAttribute("aria-hidden", "true"); s.removeAttribute("role"); s.removeAttribute("aria-label");
    return el("div", { "class": "reseau" }, [s, liste(liens)]); // le dessin montre la forme du réseau, la liste nomme chaque relation
  }

  /* citation : { texte, auteur, oeuvre, source: [titre, url] } */
  function citation(c) {
    if (!c || !c.texte || !c.auteur) return null;
    var legende = el("figcaption", {}, ["— " + c.auteur, c.oeuvre ? ", " : null, c.oeuvre ? el("cite", { text: c.oeuvre }) : null]);
    if (c.source && c.source[1]) { legende.appendChild(document.createTextNode(" · ")); legende.appendChild(el("a", { href: c.source[1], target: "_blank", rel: "noopener", text: "source" })); }
    var bloc = el("blockquote", { lang: c.langue || null }, [el("p", { text: "«\u00a0" + c.texte + "\u202f»" })]);
    var trad = c.traduction ? el("p", { "class": "traduction", text: "Traduction\u00a0: " + c.traduction }) : null;
    return el("figure", { "class": "citation" }, [bloc, trad, legende]);
  }

  g.Visuels = { barres: barres, reseau: reseau, citation: citation };
})(window);
