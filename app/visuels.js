/* Visuels des fiches de Koîos : « En chiffres » (barres), « Réseau des notions » (graphe), citation.
   Lot 9A : visuel(v) dessine en SVG les données validées par le serveur (échelle, courbe, barres, tableau, frise, schéma, carte mentale),
   carteModule(plan) dessine la carte du module sans IA. Fonctions pures qui renvoient des nœuds DOM ou du SVG (createElementNS ; le HTML
   n'est jamais inséré sous forme de texte) ; testables en Node avec un faux document. Aucune donnée inventée : tout vient du chapitre. */
(function (g) {
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, enfants) {
    var n = g.document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) { if (k === "text") n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); } });
    (enfants || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? g.document.createTextNode(c) : c); });
    return n;
  }
  function svg(tag, attrs, texte) {
    var n = g.document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (texte != null) n.textContent = texte;
    return n;
  }
  /* Nombre à la française. Un entier de moins de 5 chiffres s'écrit sans séparateur de milliers (une année : « 1889 », pas « 1 889 »). */
  function nombre(v) {
    try {
      var o = { maximumFractionDigits: 3 };
      if (Math.abs(v) < 10000 && Math.floor(v) === v) o.useGrouping = false;
      if (v !== 0 && Math.abs(v) < 0.01) o = { maximumSignificantDigits: 2 };
      return v.toLocaleString("fr-FR", o);
    } catch (e) { return String(v); }
  }
  /* Forme compacte pour le dessin (axes, valeurs) : 361 millions -> « 361\u00a0M », 1 000 milliards -> « 1000\u00a0Md ». Le tableau alternatif garde le nombre entier. */
  function compact(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return nombre(Number((v / 1e9).toPrecision(3))) + "\u00a0Md";
    if (a >= 1e6) return nombre(Number((v / 1e6).toPrecision(3))) + "\u00a0M";
    return nombre(v);
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
    if (c.source && c.source[1]) { legende.appendChild(g.document.createTextNode(" · ")); legende.appendChild(el("a", { href: c.source[1], target: "_blank", rel: "noopener", text: "source" })); }
    var bloc = el("blockquote", { lang: c.langue || null }, [el("p", { text: "«\u00a0" + c.texte + "\u202f»" })]);
    var trad = c.traduction ? el("p", { "class": "traduction", text: "Traduction\u00a0: " + c.traduction }) : null;
    return el("figure", { "class": "citation" }, [bloc, trad, legende]);
  }

  /* frise : [{ date, evenement }] -> frise verticale */
  function frise(items) {
    var l = (items || []).filter(function (x) { return x && x.date && x.evenement; });
    if (l.length < 2) return null;
    var ol = el("ol", { "class": "frise" });
    l.forEach(function (x) { ol.appendChild(el("li", {}, [el("span", { "class": "date", text: x.date }), el("span", { "class": "evt", text: x.evenement })])); });
    return ol;
  }

  /* ---------- Lot 9A : visuels par programme ---------- */
  var W = 340, LH = 20, FS = 14; // largeur du dessin (viewBox), interligne, corps du texte (14 px au moins à 390 px)

  function coupeMots(t, max) {
    var lignes = [], c = "";
    String(t).split(" ").forEach(function (m) {
      while (m.length > max) { if (c) { lignes.push(c); c = ""; } lignes.push(m.slice(0, max)); m = m.slice(max); }
      if (c && (c + " " + m).length > max) { lignes.push(c); c = m; } else c = c ? c + " " + m : m;
    });
    if (c) lignes.push(c);
    return lignes.length ? lignes : [""];
  }
  /* Écrit des lignes de texte (une balise text par ligne) ; renvoie l'ordonnée de la ligne suivante. */
  function ecrire(parent, lignes, x, y, classe, ancre) {
    lignes.forEach(function (l, i) {
      var a = { x: x, y: y + i * LH, "font-size": FS, "class": classe || "v-t" };
      if (ancre) a["text-anchor"] = ancre;
      parent.appendChild(svg("text", a, l));
    });
    return y + lignes.length * LH;
  }
  function fleche(parent, x, y, sens) { // pointe vers le bas (sens "b") ou vers la gauche ("g")
    var pts = sens === "g" ? [x, y, x + 8, y - 5, x + 8, y + 5] : [x, y, x - 5, y - 8, x + 5, y - 8];
    parent.appendChild(svg("polygon", { points: pts.join(" "), "class": "v-fleche" }));
  }
  function n3(v) { return nombre(v); }
  function avecUnite(v, u) { return compact(v) + (u ? "\u00a0" + u : ""); }
  function cadre(hauteur, description) {
    var s = svg("svg", { "class": "visuel-svg", viewBox: "0 0 " + W + " " + Math.ceil(hauteur), role: "img", "aria-label": description, focusable: "false" });
    return s;
  }

  /* Description en phrases (aria-label) et tableau alternatif : {colonnes, lignes}. */
  function alternative(v) {
    switch (v.type) {
      case "echelle": return { colonnes: ["Repère", "Valeur" + (v.unite ? " (" + v.unite + ")" : "")], lignes: v.points.map(function (p) { return [p.etiquette, n3(p.valeur)]; }) };
      case "barres": return { colonnes: ["Élément", "Valeur" + (v.unite ? " (" + v.unite + ")" : "")], lignes: v.barres.map(function (b) { return [b.etiquette, n3(b.valeur)]; }) };
      case "courbe": {
        var l = [];
        v.series.forEach(function (s) { s.points.forEach(function (p) { l.push([s.nom, n3(p[0]) + (v.x.unite ? "\u00a0" + v.x.unite : ""), n3(p[1]) + (v.y.unite ? "\u00a0" + v.y.unite : "")]); }); });
        return { colonnes: ["Série", v.x.nom, v.y.nom], lignes: l };
      }
      case "frise": return { colonnes: ["Date", "Événement"], lignes: v.evenements.map(function (e) { return [e.date, e.texte]; }) };
      case "schema": {
        var nom = {}; v.noeuds.forEach(function (n) { nom[n.id] = n.texte; });
        if (!v.liens.length) return { colonnes: ["Étape"], lignes: v.noeuds.map(function (n) { return [n.texte]; }) };
        return { colonnes: ["De", "Vers", "Relation"], lignes: v.liens.map(function (k) { return [nom[k.de], nom[k.vers], k.texte || ""]; }) };
      }
      case "carte_mentale": return { colonnes: ["Branche", "Détails"], lignes: v.branches.map(function (b) { return [b.texte, b.sous.join(", ")]; }) };
      default: return { colonnes: v.colonnes || [], lignes: v.lignes || [] };
    }
  }
  var NOM_TYPE = { echelle: "Échelle", courbe: "Courbe", barres: "Comparaison", tableau: "Tableau", frise: "Frise", schema: "Schéma", carte_mentale: "Carte mentale" };
  function description(v) {
    var t = v.titre || v.centre || "", alt = alternative(v);
    var phrases = alt.lignes.map(function (l) { return l.filter(Boolean).join(", "); });
    return NOM_TYPE[v.type] + "\u00a0: " + t + ". " + phrases.join(". ") + ".";
  }
  function tableHtml(alt, titre, classe) {
    var tete = el("tr", {}, alt.colonnes.map(function (c) { return el("th", { scope: "col", text: c }); }));
    var corps = alt.lignes.map(function (l) { return el("tr", {}, l.map(function (c) { return el("td", { text: String(c) }); })); });
    return el("table", classe ? { "class": classe } : {}, [el("caption", { text: titre }), el("thead", {}, [tete]), el("tbody", {}, corps)]);
  }

  /* Texte coupé à n caractères au plus (points de suspension compris) ; le texte entier reste dans le tableau alternatif. */
  function tronque(t, n) { t = String(t); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+$/, "") + "…"; }
  var PX = 7.6, PXG = 8.4; // largeur moyenne d'un caractère à 14 px (normal, gras) : sert à réserver la place, jamais à rogner

  function dessinEchelle(v) {
    var vals = v.points.map(function (p) { return avecUnite(p.valeur, v.unite); });
    var empile = Math.max.apply(null, vals.map(function (t) { return t.length; })) * PXG > 88; // valeur trop large pour la colonne de gauche : elle passe au-dessus de l'étiquette
    var rx = empile ? 12 : 104, tx = rx + 16, maxc = Math.floor((W - tx - 4) / PX);
    var lignes = v.points.map(function (p) { return coupeMots(p.etiquette, maxc); });
    var y = 12, haut = y;
    lignes.forEach(function (l) { haut += (l.length + (empile ? 1 : 0)) * LH + 10; });
    var s = cadre(haut + 4, description(v));
    s.appendChild(svg("line", { x1: rx, y1: 6, x2: rx, y2: haut - 6, "class": "v-trait" }));
    v.points.forEach(function (p, i) {
      var l = lignes[i];
      s.appendChild(svg("circle", { cx: rx, cy: y + 6, r: 6, "class": "v-point" }));
      if (empile) { ecrire(s, [vals[i]], tx, y + 11, "v-t v-gras"); ecrire(s, l, tx, y + 11 + LH, "v-t"); y += (l.length + 1) * LH + 10; }
      else { ecrire(s, [vals[i]], rx - 14, y + 11, "v-t v-gras", "end"); ecrire(s, l, tx, y + 11, "v-t"); y += l.length * LH + 10; }
    });
    return s;
  }

  function dessinBarres(v) {
    var vals = v.barres.map(function (b) { return avecUnite(b.valeur, v.unite); });
    var besoin = Math.max.apply(null, vals.map(function (t) { return t.length; })) * PXG + 8;
    var enLigne = besoin <= 150, vw = enLigne ? besoin : 0, lg = W - vw - 4;
    var max = Math.max.apply(null, v.barres.map(function (b) { return b.valeur; })) || 1, y = 8;
    var blocs = v.barres.map(function (b, i) { var l = coupeMots(b.etiquette, 40); var h = (l.length + (enLigne ? 0 : 1)) * LH + 22; var r = { b: b, v: vals[i], l: l, y: y, h: h }; y += h; return r; });
    var s = cadre(y + 4, description(v));
    blocs.forEach(function (r) {
      var yy = ecrire(s, r.l, 0, r.y + 14, "v-t");
      if (!enLigne) yy = ecrire(s, [r.v], 0, yy, "v-t v-gras");
      var largeur = Math.max(2, Math.round(r.b.valeur / max * lg));
      s.appendChild(svg("rect", { x: 0, y: yy - 12, width: largeur, height: 12, rx: 3, "class": "v-barre" }));
      if (enLigne) ecrire(s, [r.v], largeur + 6, yy - 1, "v-t v-gras");
    });
    return s;
  }

  function dessinCourbe(v) {
    var xs = [], ys = [];
    v.series.forEach(function (s) { s.points.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (x1 === x0) x1 = x0 + 1; if (y1 === y0) y1 = y0 + 1;
    var ty0 = compact(y0), ty1 = compact(y1), tx0 = compact(x0), tx1 = compact(x1);
    /* marge gauche calculée sur le plus large des deux repères de l'axe vertical : jamais de coupe à gauche */
    var ml = Math.min(120, Math.max(44, Math.max(ty0.length, ty1.length) * PXG + 12)), mr = 14, mt = 28, hh = 190, pw = W - ml - mr;
    var fx = function (x) { return ml + (x - x0) / (x1 - x0) * pw; }, fy = function (y) { return mt + hh - (y - y0) / (y1 - y0) * hh; };
    var n = v.series.length, base = mt + hh;
    var total = n > 1 ? base + 70 + (n - 1) * LH + 8 : base + 56;
    var s = cadre(total, description(v));
    s.appendChild(svg("line", { x1: ml, y1: mt, x2: ml, y2: base, "class": "v-trait" }));
    s.appendChild(svg("line", { x1: ml, y1: base, x2: ml + pw, y2: base, "class": "v-trait" }));
    ecrire(s, [tronque(v.y.nom + (v.y.unite ? " (" + v.y.unite + ")" : ""), 40)], 0, 14, "v-t2");
    ecrire(s, [ty1], ml - 6, mt + 5, "v-t2", "end");
    ecrire(s, [ty0], ml - 6, base + 5, "v-t2", "end");
    ecrire(s, [tx0], ml, base + 22, "v-t2");
    ecrire(s, [tx1], ml + pw, base + 22, "v-t2", "end");
    ecrire(s, [tronque(v.x.nom + (v.x.unite ? " (" + v.x.unite + ")" : ""), 36)], W / 2, base + 46, "v-t2", "middle");
    v.series.forEach(function (serie, k) {
      var c = "v-s" + (k + 1);
      s.appendChild(svg("polyline", { points: serie.points.map(function (p) { return fx(p[0]).toFixed(1) + "," + fy(p[1]).toFixed(1); }).join(" "), "class": "v-serie " + c, fill: "none" }));
      serie.points.forEach(function (p) { s.appendChild(svg("circle", { cx: fx(p[0]).toFixed(1), cy: fy(p[1]).toFixed(1), r: 3.5, "class": "v-pt " + c })); });
      if (n > 1) {
        var ly = base + 70 + k * LH;
        s.appendChild(svg("line", { x1: 0, y1: ly - 5, x2: 24, y2: ly - 5, "class": "v-serie " + c, fill: "none" }));
        ecrire(s, [tronque(serie.nom, 38)], 32, ly, "v-t");
      }
    });
    return s;
  }

  function dessinFrise(v) {
    var y = 10, blocs = v.evenements.map(function (e) { var l = coupeMots(e.texte, 38); var r = { e: e, l: l, y: y }; y += LH + l.length * LH + 8; return r; });
    var s = cadre(y, description(v));
    s.appendChild(svg("line", { x1: 12, y1: 8, x2: 12, y2: y - 14, "class": "v-trait" }));
    blocs.forEach(function (r) {
      s.appendChild(svg("circle", { cx: 12, cy: r.y + 6, r: 6, "class": "v-point" }));
      var yy = ecrire(s, [tronque(r.e.date, 34)], 32, r.y + 11, "v-t v-gras");
      ecrire(s, r.l, 32, yy + 0, "v-t");
    });
    return s;
  }

  /* Schéma : les liens vers l'étape suivante sont des flèches droites ; les autres passent par un « couloir » à droite des boîtes (3 au plus,
     le reste est listé sous le dessin). Un libellé de lien tient en 18 caractères au plus, posé à côté de la flèche. */
  function dessinSchema(v) {
    var pos = {}; v.noeuds.forEach(function (n, i) { pos[n.id] = i; });
    var suivants = [], retours = [];
    v.liens.forEach(function (k) { (pos[k.vers] === pos[k.de] + 1 ? suivants : retours).push(k); });
    var couloirs = retours.slice(0, 3), restes = retours.slice(3);
    var etroit = couloirs.length > 0, bx = etroit ? 10 : 20, bw = etroit ? 150 : 300, wrap = etroit ? 18 : 38;
    var y = 8, boites = {};
    v.noeuds.forEach(function (n, i) {
      var l = coupeMots(n.texte, wrap), h = l.length * LH + 16;
      boites[n.id] = { n: n, l: l, y: y, h: h, i: i };
      y += h + 38;
    });
    var fin = y - 30; // bas de la dernière boîte
    var extra = [];
    if (restes.length) {
      var nom = {}; v.noeuds.forEach(function (n) { nom[n.id] = n.texte; });
      restes.forEach(function (k) { extra = extra.concat(coupeMots(nom[k.de] + " vers " + nom[k.vers] + (k.texte ? " (" + tronque(k.texte, 18) + ")" : ""), 42)); });
    }
    var hauteur = fin + 8 + (extra.length ? 12 + (extra.length + 1) * LH : 0);
    var s = cadre(hauteur, description(v));
    v.noeuds.forEach(function (n) {
      var b = boites[n.id];
      s.appendChild(svg("rect", { x: bx, y: b.y, width: bw, height: b.h, rx: 12, "class": "v-noeud" }));
      ecrire(s, b.l, bx + bw / 2, b.y + 8 + 15, "v-t", "middle");
    });
    var xr = bx + bw, xl = xr + 10, xTexte = xr + 10 + 3 * 10 + 10, posees = [];
    var traversants = couloirs.map(function (k) { var a = boites[k.de], b = boites[k.vers]; return { x: 0, h1: Math.min(a.y + a.h / 2, b.y + b.h / 2), h2: Math.max(a.y + a.h / 2, b.y + b.h / 2) }; });
    traversants.forEach(function (t, i) { t.x = xl + i * 10; });
    suivants.forEach(function (k) {
      var a = boites[k.de], b = boites[k.vers], x = etroit ? bx + 24 : bx + bw / 2, y1 = a.y + a.h, y2 = b.y; // flèche près du bord gauche quand des couloirs prennent la droite : le libellé a de la place
      s.appendChild(svg("line", { x1: x, y1: y1, x2: x, y2: y2 - 8, "class": "v-trait v-lien" }));
      fleche(s, x, y2, "b");
      if (k.texte) {
        var butee = W - 4;
        traversants.forEach(function (t) { if (t.h1 < y2 && t.h2 > y1 && t.x - 6 < butee) butee = t.x - 6; });
        var n = Math.min(18, Math.floor((butee - (x + 12)) / PX));
        if (n >= 4) ecrire(s, [tronque(k.texte, n)], x + 12, y1 + (y2 - y1) / 2 + 5, "v-t2");
      }
    });
    couloirs.forEach(function (k, i) {
      var a = boites[k.de], b = boites[k.vers], xe = traversants[i].x, ya = a.y + a.h / 2, yb = b.y + b.h / 2;
      s.appendChild(svg("path", { d: "M" + xr + "," + ya + " H" + xe + " V" + yb + " H" + (xr + 8), "class": "v-trait v-lien", fill: "none" }));
      fleche(s, xr, yb, "g");
      if (k.texte) {
        var ty = (ya + yb) / 2 + 5;
        while (posees.some(function (p) { return Math.abs(p - ty) < LH; })) ty += LH;
        posees.push(ty);
        ecrire(s, [tronque(k.texte, 18)], xTexte, ty, "v-t2");
      }
    });
    if (extra.length) {
      var ey = ecrire(s, ["Autres liens"], 0, fin + 8 + 12 + 14, "v-t v-gras");
      ecrire(s, extra, 0, ey, "v-t2");
    }
    return s;
  }

  function dessinCarte(v) {
    var y = 8, lc = coupeMots(v.centre, 34), hc = lc.length * LH + 16, tx = 22;
    var yy = y + hc + 22;
    var blocs = v.branches.map(function (b) { var l = coupeMots(b.texte, 32), sous = b.sous.map(function (t) { return coupeMots(t, 32); }); var r = { b: b, l: l, sous: sous, y: yy }; yy += l.length * LH + 16 + sous.reduce(function (n, t) { return n + t.length * LH; }, 0) + 14; return r; });
    var s = cadre(yy - 6, description(v));
    s.appendChild(svg("rect", { x: 20, y: y, width: 280, height: hc, rx: 12, "class": "v-centre" }));
    ecrire(s, lc, 160, y + 8 + 15, "v-t v-gras v-centre-t", "middle");
    s.appendChild(svg("line", { x1: tx, y1: y + hc, x2: tx, y2: blocs[blocs.length - 1].y + 14, "class": "v-trait" }));
    blocs.forEach(function (r) {
      s.appendChild(svg("line", { x1: tx, y1: r.y + 14, x2: tx + 14, y2: r.y + 14, "class": "v-trait" }));
      var hb = r.l.length * LH + 16;
      s.appendChild(svg("rect", { x: tx + 14, y: r.y, width: 264, height: hb, rx: 10, "class": "v-noeud" }));
      ecrire(s, r.l, tx + 26, r.y + 8 + 15, "v-t v-gras");
      var cy = r.y + hb + 4;
      r.sous.forEach(function (t) { /* tiret au bord, texte (et ses lignes suivantes) décalé de 12 en x : retrait par position, pas par espaces */
        ecrire(s, ["–"], tx + 26, cy + 15, "v-t2");
        cy = ecrire(s, t, tx + 40, cy + 15, "v-t2") - 15;
      });
    });
    return s;
  }

  var DESSINS = { echelle: dessinEchelle, courbe: dessinCourbe, barres: dessinBarres, frise: dessinFrise, schema: dessinSchema, carte_mentale: dessinCarte };

  /* visuel : { type, titre… } validé par le serveur (lib/visuels.js). Renvoie une figure, ou null si les données sont inutilisables.
     Tout est dessiné en SVG (createElementNS), sans HTML venu des données ; le tableau alternatif est lisible par un lecteur d'écran. */
  function visuel(v) {
    if (!v || typeof v !== "object" || !Object.prototype.hasOwnProperty.call(NOM_TYPE, v.type)) return null;
    try {
      var titre = v.titre || v.centre || "";
      if (v.type === "tableau") {
        if (!Array.isArray(v.colonnes) || !Array.isArray(v.lignes) || !v.lignes.length) return null;
        return el("figure", { "class": "visuel visuel-tableau-fig" }, [el("figcaption", { "class": "visuel-titre", text: titre }), tableHtml({ colonnes: v.colonnes, lignes: v.lignes }, titre, "visuel-tableau")]);
      }
      var alt = alternative(v);
      if (!alt.lignes.length) return null;
      var dessin = DESSINS[v.type](v);
      var legende = v.type === "carte_mentale" ? v.centre : v.titre;
      /* La carte mentale porte déjà son titre dans le dessin : pas de légende en double. Le tableau alternatif est dans un div.sr (le tableau seul ne se rogne pas). */
      return el("figure", { "class": "visuel visuel-" + v.type.replace("_", "-") }, [v.type === "carte_mentale" ? null : el("figcaption", { "class": "visuel-titre", text: legende }), dessin, el("div", { "class": "sr" }, [tableHtml(alt, legende, null)])]);
    } catch (e) { return null; }
  }

  /* carteModule : plan { titre, niveaux: [{ titre, modules: [{ numero, titre, etat }] }], courant: { titre, lecons: [{ numero, fait }] } | null }
     etat : "fait", "cours", "ouvert" ou "ferme". Généré sans IA à partir du programme et des leçons faites. */
  function carteModule(plan) {
    if (!plan || !Array.isArray(plan.niveaux) || !plan.niveaux.length) return null;
    try {
      var NOM_ETAT = { fait: "fait", cours: "en cours", ouvert: "ouvert", ferme: "verrouillé" };
      var phrases = [];
      var y = 6, rangs = plan.niveaux.map(function (n) {
        var faits = n.modules.filter(function (m) { return m.etat === "fait"; }).length;
        var titre = coupeMots(n.titre + " · " + faits + "/" + n.modules.length + " modules", 36);
        var r = { n: n, titre: titre, y: y, faits: faits }; y += titre.length * LH + 40; return r;
      });
      phrases = plan.niveaux.map(function (n) { return n.titre + "\u00a0: " + n.modules.map(function (m) { return "module " + m.numero + " " + NOM_ETAT[m.etat || "ferme"]; }).join(", "); });
      var cy0 = y;
      var lecons = plan.courant && Array.isArray(plan.courant.lecons) && plan.courant.lecons.length ? plan.courant.lecons : null;
      var tc = lecons ? coupeMots("Module en cours\u00a0: " + plan.courant.titre, 38) : null;
      if (lecons) {
        y += tc.length * LH + 36;
        phrases.push("Module en cours\u00a0: " + plan.courant.titre + ", " + lecons.filter(function (l) { return l.fait; }).length + " leçons faites sur " + lecons.length);
      }
      var s = cadre(y, "Carte de la formation" + (plan.titre ? " " + plan.titre : "") + ". " + phrases.join(". ") + ".");
      function puces(liste, py, rayon, pas) {
        liste.forEach(function (m, i) {
          var cx = rayon + 2 + i * pas, classe = "v-m v-m-" + (m.etat || (m.fait ? "fait" : "ferme"));
          s.appendChild(svg("circle", { cx: cx, cy: py, r: rayon, "class": classe }));
          if (m.numero != null) ecrire(s, [String(m.numero)], cx, py + 5, "v-t v-num" + ((m.etat === "fait" || m.fait) ? " v-num-fait" : ""), "middle");
        });
      }
      rangs.forEach(function (r) {
        var yy = ecrire(s, r.titre, 0, r.y + 14, "v-t v-gras");
        puces(r.n.modules.map(function (m) { return { numero: m.numero, etat: m.etat }; }), yy + 6, 12, Math.min(30, (W - 28) / Math.max(1, r.n.modules.length)));
      });
      if (lecons) {
        var yy = ecrire(s, tc, 0, cy0 + 14, "v-t v-gras");
        puces(lecons.map(function (l) { return { numero: l.numero, etat: l.fait ? "fait" : "ouvert" }; }), yy + 6, 12, Math.min(30, (W - 28) / lecons.length));
      }
      return el("figure", { "class": "visuel visuel-carte-module" }, [el("figcaption", { "class": "visuel-titre", text: "Carte de la formation" }), s]);
    } catch (e) { return null; }
  }

  g.Visuels = { barres: barres, reseau: reseau, citation: citation, frise: frise, visuel: visuel, carteModule: carteModule, description: description, alternative: alternative };
})(typeof window !== "undefined" ? window : globalThis);
