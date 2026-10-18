/* Koîos V1 : bibliothèque d'étude. Une page, sans étape de construction.
   Vues : accueil, bibliothèque, livre (formation), chapitre (fiche, 3 exercices, bilan), révisions, cercle, profil, brouillon, défi. */
(function () {
  "use strict";
  var F = " ", N = " "; // fine insécable, insécable
  var DOMAINES = [
    { code: "hg", nom: "Histoire et géographie", court: "Histoire · Géo", verre: "#b0414f", cuir: "#5e2430", ico: "sablier", w: 56, h: 214 },
    { code: "sn", nom: "Sciences et nature", court: "Sciences", verre: "#4f8f6c", cuir: "#2f5442", ico: "microscope", w: 48, h: 206 },
    { code: "ac", nom: "Arts et culture", court: "Arts · Culture", verre: "#4a7fb3", cuir: "#24405e", ico: "palette", w: 52, h: 210 },
    { code: "gj", nom: "Gemmologie et joaillerie", court: "Gemmologie", verre: "#cfa645", cuir: "#6a5020", ico: "gemme", w: 46, h: 202 }
  ];
  var DOM = {};
  DOMAINES.forEach(function (d) { DOM[d.code] = d; });
  var BAREME = { 50: [6, -1], 70: [8, -4], 90: [9, -8], 100: [10, -20] };

  /* ---------- Stockage local (peut être indisponible : navigation privée) ---------- */
  var S = {
    lire: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mémoire seule */ } }
  };
  var profil = S.lire("koios.profil", null);
  var etat = S.lire("koios.etat", null) || { version: 1, chapitres: {}, enCours: null, maj: 0 };
  if (!etat.chapitres) etat.chapitres = {};
  var brouillons = S.lire("koios.brouillons", []);
  var serveur = { base: false, ia: false };
  var apresAccueil = null;

  /* ---------- Outils DOM ---------- */
  var app = document.getElementById("app");
  var nav = document.getElementById("nav");
  var toastEl = document.getElementById("toast");
  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (enfants || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function icone(nom, cls, alt) {
    var s = el("span", { "class": "ic", html: window.ico ? window.ico(nom, cls || "i") : "" });
    if (alt) { s.setAttribute("role", "img"); s.setAttribute("aria-label", alt); } else s.setAttribute("aria-hidden", "true");
    return s;
  }
  function guill(t) { return "«" + N + t + F + "»"; }
  function signe(n) { return n < 0 ? "−" + Math.abs(n) : "+" + n; }
  function pts(n) { return (n < 0 ? "−" + Math.abs(n) : (n > 0 ? "+" + n : "0")) + (Math.abs(n) > 1 ? " points" : " point"); }
  function pluriel(n, un, plusieurs) { return n + " " + (n > 1 ? plusieurs : un); }
  function romain(n) {
    var t = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]], r = "";
    t.forEach(function (p) { while (n >= p[0]) { r += p[1]; n -= p[0]; } });
    return r;
  }
  var minuterieToast;
  function toast(texte) {
    toastEl.textContent = texte;
    toastEl.hidden = false;
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(function () { toastEl.hidden = true; }, 3200);
  }
  function taquin() { return !profil || profil.ton !== "sobre"; }
  function marge(humeur, texte) {
    var b = el("div", { "class": "marge" });
    b.innerHTML = window.rivalSVG ? window.rivalSVG(humeur, 48) : "";
    b.appendChild(el("p", {}, [el("small", { text: "Le Rival, en marge" }), texte]));
    return b;
  }
  function figure(f) {
    if (!f || !f.src) return null;
    var img = el("img", { src: f.src, alt: f.alt || "", loading: "lazy" });
    var fig = el("figure", {}, [img, f.credit ? el("figcaption", { text: f.credit }) : null]);
    img.addEventListener("error", function () { fig.remove(); });
    return fig;
  }
  function sources(liste) {
    if (!liste || !liste.length) return el("p", { "class": "sans-source" }, [icone("faux"), "Brouillon non vérifié : aucune source contrôlée."]);
    var ul = el("ul");
    liste.forEach(function (s) {
      ul.appendChild(el("li", {}, [s[1] ? el("a", { href: s[1], target: "_blank", rel: "noopener", text: s[0] }) : el("span", { style: "display:block;padding:11px 0", text: s[0] })]));
    });
    return el("details", { "class": "sources" }, [el("summary", {}, [icone("verifie"), "Vérifié par " + liste.length + " sources"]), ul]);
  }
  function filet() { return el("div", { "class": "filet", html: window.Gothique ? Gothique.fleuron() : "" }); }
  function lien(href, texte, cls) { return el("a", { "class": cls || "lien", href: href, text: texte }); }
  function partager(titre, texte, url, repli) {
    if (navigator.share) {
      navigator.share({ title: titre, text: texte, url: url }).catch(function () {});
      return;
    }
    var echec = function () { repli("Copie impossible ici. Lien : " + url); };
    try { navigator.clipboard.writeText(url).then(function () { repli("Lien copié : colle-le dans WhatsApp ou un message."); }, echec); } catch (e) { echec(); }
  }

  /* ---------- Réseau ---------- */
  function api(methode, chemin, corps, delai, cle) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, delai || 8000) : null;
    var h = { "Content-Type": "application/json" };
    var c = cle || (profil && profil.id ? profil.id + "." + profil.cle : null);
    if (c) h.Authorization = "Bearer " + c;
    return fetch("/api/" + chemin, { method: methode, headers: h, body: corps ? JSON.stringify(corps) : undefined, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          clearTimeout(t);
          if (!r.ok) { var e = new Error(j.erreur || ("Erreur " + r.status)); e.statut = r.status; throw e; }
          return j;
        });
      }, function (e) { clearTimeout(t); e.statut = 0; throw e; });
  }
  var minuterieSync;
  function sauver() {
    etat.maj = Date.now();
    S.ecrire("koios.etat", etat);
    pousser();
  }
  function pousser() {
    if (!profil || !profil.id || !serveur.base) return;
    clearTimeout(minuterieSync);
    minuterieSync = setTimeout(function () {
      api("PUT", "progression", { pseudo: profil.pseudo, ton: profil.ton, etat: etat }).catch(function () {});
    }, 700);
  }
  function fusion(a, b) {
    var r = { version: 1, chapitres: {}, enCours: (b.maj || 0) > (a.maj || 0) ? b.enCours : a.enCours, maj: Math.max(a.maj || 0, b.maj || 0) };
    var ca = a.chapitres || {}, cb = b.chapitres || {};
    Object.keys(ca).concat(Object.keys(cb)).forEach(function (id) {
      var x = ca[id], y = cb[id];
      if (!x || !y) { r.chapitres[id] = x || y; return; }
      var recent = (y.date || "") > (x.date || "") ? y : x;
      r.chapitres[id] = { valide: !!(x.valide || y.valide), meilleur: Math.max(x.meilleur || 0, y.meilleur || 0), n: recent.n || x.n || y.n, points: Math.max(x.points || 0, y.points || 0), rates: recent.rates || [], date: recent.date };
    });
    return r;
  }
  function creerJoueur() {
    if (!serveur.base || !profil || profil.id) return Promise.resolve();
    return api("POST", "joueur", { pseudo: profil.pseudo }).then(function (j) {
      profil.id = j.id; profil.cle = j.cle;
      S.ecrire("koios.profil", profil);
      pousser();
    }, function () {});
  }
  function synchroniser() {
    if (!profil) return Promise.resolve();
    if (!profil.id) return creerJoueur();
    return api("GET", "progression").then(function (j) {
      etat = fusion(etat, j.etat || {});
      S.ecrire("koios.etat", etat);
      pousser();
    }, function () {});
  }
  var pretServeur = api("GET", "etat", null, 5000).then(function (j) { serveur.base = !!j.base; serveur.ia = !!j.ia; }, function () {});

  /* ---------- Contenu ---------- */
  var catalogue = null, promesseCatalogue = null, cache = {};
  function chargerCatalogue() {
    if (!promesseCatalogue) promesseCatalogue = fetch("contenu/catalogue.json").then(function (r) { if (!r.ok) throw new Error("catalogue"); return r.json(); }).then(function (c) { catalogue = c; return c; });
    return promesseCatalogue;
  }
  function chapitres(code) { return (catalogue && catalogue.domaines[code]) || []; }
  function infoChap(id) {
    var code = String(id).split("-")[0];
    var liste = chapitres(code);
    for (var k = 0; k < liste.length; k++) if (liste[k].id === id) return { dom: DOM[code], chap: liste[k], rang: k, liste: liste };
    return null;
  }
  function chargerChapitre(id) {
    if (!/^[a-z]{2}-\d{2}$/.test(id || "")) return Promise.reject(new Error("chapitre"));
    if (!cache[id]) cache[id] = fetch("contenu/" + id + ".json").then(function (r) { if (!r.ok) throw new Error("chapitre"); return r.json(); });
    return cache[id];
  }
  function suivant(id) {
    var i = infoChap(id);
    return i && i.rang + 1 < i.liste.length ? i.liste[i.rang + 1] : null;
  }
  function totalChapitres() { return DOMAINES.reduce(function (s, d) { return s + chapitres(d.code).length; }, 0); }
  function valides(code) {
    return chapitres(code).filter(function (c) { return etat.chapitres[c.id] && etat.chapitres[c.id].valide; }).length;
  }
  function totalValides() { return DOMAINES.reduce(function (s, d) { return s + valides(d.code); }, 0); }
  function totalPoints() { return Object.keys(etat.chapitres).reduce(function (s, k) { return s + (etat.chapitres[k].points || 0); }, 0); }
  function prochain() {
    if (etat.enCours && infoChap(etat.enCours) && !(etat.chapitres[etat.enCours] || {}).valide) return infoChap(etat.enCours);
    var dernier = null;
    Object.keys(etat.chapitres).forEach(function (id) { var c = etat.chapitres[id]; if (!dernier || (c.date || "") > (etat.chapitres[dernier].date || "")) dernier = id; });
    var ordre = DOMAINES.map(function (d) { return d.code; });
    if (dernier) { var d0 = dernier.split("-")[0]; ordre = [d0].concat(ordre.filter(function (c) { return c !== d0; })); }
    for (var k = 0; k < ordre.length; k++) {
      var liste = chapitres(ordre[k]);
      for (var j = 0; j < liste.length; j++) if (!(etat.chapitres[liste[j].id] || {}).valide) return infoChap(liste[j].id);
    }
    return null;
  }
  function petales(neuf) {
    var p = [];
    DOMAINES.forEach(function (d) {
      chapitres(d.code).forEach(function (c) { var v = (etat.chapitres[c.id] || {}).valide; p.push({ verre: v ? d.verre : null, neuf: c.id === neuf }); });
    });
    return p;
  }
  function lobes() { return DOMAINES.map(function (d) { return valides(d.code) > 0 ? d.verre : null; }); }
  function vitraux(n) { return n + (n > 1 ? " vitraux" : " vitrail"); }
  function etiquetteRosace() { var v = totalValides(); return "Rosace des savoirs : " + vitraux(v) + " allumé" + (v > 1 ? "s" : "") + " sur " + totalChapitres(); }

  /* ---------- Mise en page ---------- */
  function montrer(page, onglet, titre) {
    app.innerHTML = "";
    app.appendChild(page);
    document.title = titre ? "Koîos · " + titre : "Koîos";
    nav.hidden = !onglet;
    nav.querySelectorAll("a").forEach(function (a) { if (a.dataset.onglet === onglet) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    window.scrollTo(0, 0);
    if (window.poserIcones) window.poserIcones(page);
    var h = page.querySelector("h1");
    if (h && montrer.deja) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    montrer.deja = true;
  }
  function entete() {
    var initiale = (profil && profil.pseudo ? profil.pseudo.trim().charAt(0) : "?").toUpperCase();
    var verres = DOMAINES.map(function (d) { return d.verre; });
    return el("div", { style: "display:grid;gap:0" }, [
      el("header", { "class": "haut" }, [
        el("a", { "class": "marque", href: "#/", "aria-label": "Koîos, bibliothèque" }, [el("span", { "class": "ic", "aria-hidden": "true", html: window.Gothique ? Gothique.marque(verres) : "" }), "Koîos"]),
        el("a", { "class": "initiale", href: "#/profil", "aria-label": "Ton profil" + (profil ? ", " + profil.pseudo : ""), text: initiale })
      ]),
      el("div", { "class": "arcature", "aria-hidden": "true" })
    ]);
  }
  function attente(texte) {
    var p = el("div", { "class": "page" }, [entete(), el("p", { "class": "attente", text: texte })]);
    return p;
  }
  function erreurPage(texte) {
    return el("div", { "class": "page" }, [entete(), el("section", { "class": "carte" }, [el("h1", { text: "Page introuvable" }), el("p", { text: texte }), lien("#/", "Retour à la bibliothèque", "btn")])]);
  }

  /* ---------- Accueil (première visite) ---------- */
  function vueAccueil() {
    var ton = "taquin";
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", autocomplete: "nickname", placeholder: "Ton prénom ou un pseudo" });
    var alerte = el("p", { "class": "alerte", hidden: "" });
    var choix = el("div", { "class": "choix", role: "group", "aria-label": "Le ton du Rival" });
    [["taquin", "Taquin", "Pince‑sans‑rire, il te provoque un peu."], ["sobre", "Sobre", "Il corrige, sans commentaire."]].forEach(function (c) {
      var b = el("button", { type: "button", "aria-pressed": c[0] === ton ? "true" : "false" }, [el("b", { text: c[1] }), el("span", { text: c[2] })]);
      b.addEventListener("click", function () { ton = c[0]; choix.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
      choix.appendChild(b);
    });
    var go = el("button", { "class": "btn", type: "button", text: "Ouvrir la bibliothèque" });
    go.addEventListener("click", function () {
      var p = champ.value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24);
      if (!p) { alerte.textContent = "Écris d’abord un nom de lecteur."; alerte.hidden = false; champ.focus(); return; }
      profil = { pseudo: p, ton: ton };
      S.ecrire("koios.profil", profil);
      pretServeur.then(creerJoueur);
      var cible = apresAccueil && apresAccueil !== "#/accueil" ? apresAccueil : "#/";
      apresAccueil = null;
      if (location.hash === cible) route(); else location.hash = cible;
    });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    var vitrail = el("div", { "class": "vitrail" });
    var syncSpan = el("span", { text: "Ta progression est enregistrée sur cet appareil." });
    var syncTexte = el("p", { "class": "astuce" }, [icone("verifie"), syncSpan]);
    pretServeur.then(function () { if (serveur.base) syncSpan.textContent = "Ta progression est enregistrée en ligne. Ta clé de lecteur, dans le profil, permet de la retrouver sur un autre appareil."; });
    chargerCatalogue().then(function () { vitrail.innerHTML = Gothique.baie(petales(null), lobes(), etiquetteRosace()); }, function () { vitrail.remove(); });
    montrer(el("div", { "class": "page sans-nav" }, [
      el("header", { "class": "haut" }, [el("span", { "class": "marque", html: (window.Gothique ? Gothique.marque(DOMAINES.map(function (d) { return d.verre; })) : "") + "Koîos" })]),
      el("div", { "class": "arcature", "aria-hidden": "true" }),
      el("h1", { text: "Une bibliothèque d’étude, chapitre après chapitre." }),
      el("p", { style: "font-family:var(--livre);font-size:18px;line-height:1.5", text: "Chaque chapitre tient en une fiche à retenir, trois exercices et un bilan. Chaque notion est vérifiée par au moins deux sources sérieuses. Le Rival, un renard bibliothécaire, corrige en marge." }),
      vitrail,
      el("p", { "class": "meta", style: "text-align:center", text: "Chaque chapitre validé allume un vitrail de la rosace." }),
      el("section", { "class": "carte" }, [
        el("label", { "for": "pseudo", style: "font-family:var(--livre);font-weight:600;font-size:21px", text: "Ton nom de lecteur" }), champ,
        el("span", { "class": "lib", text: "Le ton du Rival" }), choix,
        go, alerte,
        syncTexte
      ])
    ]), null, "Accueil");
  }

  /* ---------- Bibliothèque ---------- */
  function armoire() {
    var a = el("div", { "class": "armoire" });
    a.innerHTML = Gothique.ogive(petales(null), lobes(), etiquetteRosace());
    var livres = el("div", { "class": "livres" });
    DOMAINES.forEach(function (d) {
      var liste = chapitres(d.code), v = valides(d.code);
      var bandes = el("span", { "class": "bandes" });
      liste.slice(0, 6).forEach(function (c) { bandes.appendChild(el("i", { "class": (etat.chapitres[c.id] || {}).valide ? "ok" : null })); });
      var vide = liste.length === 0;
      livres.appendChild(el(vide ? "span" : "a", { "class": "livre" + (vide ? " vide" : ""), href: vide ? null : "#/livre/" + d.code, style: "background-color:" + d.cuir + ";width:" + d.w + "px;min-height:" + d.h + "px", "aria-label": vide ? d.nom + ", en préparation" : d.nom + ", " + v + " chapitre" + (v > 1 ? "s" : "") + " validé" + (v > 1 ? "s" : "") + " sur " + liste.length, role: vide ? "img" : null }, [
        el("span", { "class": "nerfs" }, [el("i"), el("i")]), el("span", { "class": "piece" }, [el("span", { "class": "nom", text: d.court })]), bandes
      ]));
    });
    livres.appendChild(el("span", { "class": "serre", "aria-hidden": "true" }));
    a.appendChild(el("div", { "class": "niche" }, [livres, el("div", { "class": "planche" })]));
    return a;
  }
  function legende() {
    var l = el("div", { "class": "legende" });
    DOMAINES.forEach(function (d) {
      var nb = chapitres(d.code).length;
      l.appendChild(el(nb ? "a" : "span", { href: nb ? "#/livre/" + d.code : null }, [el("span", { "class": "pastille", style: "background:" + d.verre, "aria-hidden": "true" }), el("b", { text: d.court }), el("span", { text: nb ? valides(d.code) + " / " + nb : "En préparation" })]));
    });
    return l;
  }
  function noteAccueil() {
    var v = totalValides(), t = totalChapitres(), enCours = etat.enCours && !(etat.chapitres[etat.enCours] || {}).valide;
    if (taquin()) {
      if (v === t && t > 0) return marge("vexe", "Toute la rosace est allumée. Je prépare d’autres chapitres, plus retors.");
      if (enCours) return marge("malin", "Un chapitre commencé, jamais fini. Je note.");
      if (v === 0) return marge("malin", vitraux(t) + " éteint" + (t > 1 ? "s" : "") + ". Allume le premier, je regarde.");
      return marge("malin", vitraux(v) + " sur " + t + ". Je commence à me méfier.");
    }
    if (v === t && t > 0) return marge("explique", "Tout est validé. D’autres chapitres arrivent.");
    if (enCours) return marge("explique", "Un chapitre t’attend là où tu l’as laissé.");
    return marge("explique", v + " chapitre" + (v > 1 ? "s" : "") + " validé" + (v > 1 ? "s" : "") + " sur " + t + ".");
  }
  function carteReprendre() {
    var p = prochain();
    if (!p) return el("section", { "class": "carte" }, [el("span", { "class": "lib", text: "Programme" }), el("h2", { text: "Tout est validé" }), el("p", { "class": "meta", text: "Révise tes erreurs ou étudie un autre sujet en attendant les prochains chapitres." })]);
    var c = etat.chapitres[p.chap.id];
    var commence = etat.enCours === p.chap.id || (c && !c.valide);
    var barres = el("div", { "class": "barres", style: "grid-template-columns:repeat(" + p.liste.length + ",1fr)", role: "img", "aria-label": pluriel(p.liste.length, "chapitre", "chapitres") + " au programme, " + pluriel(valides(p.dom.code), "validé", "validés") });
    p.liste.forEach(function (x) { barres.appendChild(el("i", { "class": (etat.chapitres[x.id] || {}).valide ? "fait" : (x.id === p.chap.id ? "cours" : null) })); });
    return el("section", { "class": "carte reprendre", "aria-labelledby": "reprendre-titre" }, [
      el("span", { "class": "lib", text: commence ? "Formation en cours" : "Prochain chapitre" }),
      el("h2", { id: "reprendre-titre", text: p.dom.nom }),
      el("p", { "class": "sous", text: "Chapitre " + romain(p.chap.numero) + " · " + p.chap.titre }),
      el("div", { "class": "infos meta" }, [el("span", {}, [icone("livre"), "Fiche " + guill("L’essentiel")]), el("span", {}, [icone("liste"), "3 exercices"]), el("span", {}, [icone("verifie"), "Sources vérifiées"])]),
      el("div", { style: "display:grid;gap:6px" }, [barres, el("span", { "class": "meta", text: pluriel(p.liste.length, "chapitre", "chapitres") + " au programme · " + pluriel(valides(p.dom.code), "validé", "validés") })]),
      lien("#/chapitre/" + p.chap.id, (commence ? "Reprendre" : "Commencer") + " le chapitre " + romain(p.chap.numero), "btn")
    ]);
  }
  function aReviser() {
    var items = [];
    Object.keys(etat.chapitres).sort().forEach(function (id) {
      var c = etat.chapitres[id], i = infoChap(id);
      if (!i) return;
      (c.rates || []).forEach(function (r) { items.push({ id: id, theme: r[1], i: i }); });
    });
    return items;
  }
  function carteLibre() {
    var champ = el("input", { "class": "champ", id: "sujet", type: "text", maxlength: "80", autocomplete: "off", placeholder: "Le cubisme, les volcans d’Islande…" });
    var bouton = el("button", { "class": "btn trait", type: "button", text: "Demander un brouillon au Rival" });
    var astuce = el("p", { "class": "astuce" }, [icone("ampoule"), el("span", { text: "Hors catalogue, le Rival rédige un chapitre en direct. Ce brouillon n’est pas vérifié : il peut contenir des erreurs." })]);
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    bouton.addEventListener("click", function () {
      var sujet = champ.value.trim();
      alerte.hidden = true;
      if (sujet.length < 3) { alerte.textContent = "Écris d’abord un sujet, par exemple " + guill("le cubisme") + "."; alerte.hidden = false; champ.focus(); return; }
      if (!serveur.base || !serveur.ia || !profil.id) { alerte.textContent = "La rédaction en direct n’est pas encore branchée. Réessaie un peu plus tard."; alerte.hidden = false; return; }
      bouton.disabled = true;
      bouton.textContent = "Le Rival rédige (une demi-minute environ)…";
      api("POST", "libre", { sujet: sujet }, 90000).then(function (j) {
        var ch = j.chapitre;
        ch.sujet = sujet; ch.date = new Date().toISOString();
        brouillons.unshift(ch);
        brouillons = brouillons.slice(0, 8);
        S.ecrire("koios.brouillons", brouillons);
        location.hash = "#/brouillon/0";
      }, function (e) {
        bouton.disabled = false;
        bouton.textContent = "Demander un brouillon au Rival";
        alerte.textContent = e.statut === 429 ? "Limite du jour atteinte : 5 brouillons par jour et par lecteur." : e.statut === 503 ? "La rédaction en direct n’est pas encore branchée." : "Le Rival n’a pas réussi ce brouillon. Réessaie dans un moment ou change de sujet.";
        alerte.hidden = false;
      });
    });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
    var blocs = [el("label", { "for": "sujet", style: "font-family:var(--livre);font-weight:600;font-size:21px", text: "Étudier un autre sujet" }), champ, bouton, alerte, astuce];
    if (brouillons.length) {
      var ul = el("ul", { "class": "lignes" });
      brouillons.slice(0, 4).forEach(function (b, k) { ul.appendChild(el("li", {}, [icone("parchemin"), el("span", {}, [el("b", { text: b.titre }), el("br"), el("span", { "class": "meta", text: "Brouillon · " + b.sujet })]), lien("#/brouillon/" + k, "Ouvrir")])); });
      blocs.push(el("span", { "class": "lib", text: "Tes brouillons" }), ul);
    }
    return el("section", { "class": "carte" }, blocs);
  }
  function vueBibliotheque() {
    var items = aReviser();
    var blocs = [entete(), el("h1", { "class": "sr", text: "Bibliothèque" }), noteAccueil(), carteReprendre(),
      el("section", { "aria-labelledby": "etagere-titre", style: "display:grid;gap:12px" }, [
        el("div", { "class": "titre-sec" }, [el("h2", { id: "etagere-titre", text: "Ta bibliothèque" }), el("span", { "class": "meta", text: pluriel(totalChapitres(), "chapitre vérifié", "chapitres vérifiés") })]),
        armoire(), legende(),
        el("p", { "class": "meta", style: "text-align:center", text: "Touche un livre pour ouvrir sa formation. Chaque chapitre validé allume un vitrail." })
      ])];
    if (items.length) {
      var ul = el("ul", { "class": "lignes" });
      items.slice(0, 3).forEach(function (it) { ul.appendChild(el("li", {}, [icone("revision"), el("span", {}, [el("b", { text: it.theme }), el("br"), el("span", { "class": "meta", text: it.i.dom.nom + " · chapitre " + romain(it.i.chap.numero) })]), lien("#/chapitre/" + it.id + "/revoir", "Revoir")])); });
      blocs.push(el("section", { "class": "carte", "aria-labelledby": "reviser-titre" }, [el("div", { "class": "titre-sec" }, [el("h2", { id: "reviser-titre", text: "À réviser" }), items.length > 3 ? lien("#/revisions", "Tout voir (" + items.length + ")") : el("span", { "class": "meta", text: "Tiré de tes bilans" })]), ul]));
    }
    blocs.push(carteLibre(), el("p", { "class": "credit", text: "Icônes Phosphor (licence MIT) · Rival et rosace dessinés pour Koîos" }));
    montrer(el("div", { "class": "page" }, blocs), "bibliotheque", "Bibliothèque");
  }

  /* ---------- Livre (formation d'un domaine) ---------- */
  function vueLivre(code) {
    var d = DOM[code];
    if (!d) return montrer(erreurPage("Cette formation n’existe pas."), "bibliotheque");
    var liste = chapitres(code), v = valides(code);
    var table = el("ol", { "class": "table" });
    liste.forEach(function (c) {
      var e = etat.chapitres[c.id];
      var etatChap = e && e.valide ? el("span", { "class": "etat ok" }, [icone("juste"), "Validé"]) : e ? el("span", { "class": "etat ko" }, [icone("revision"), "À reprendre"]) : etat.enCours === c.id ? el("span", { "class": "etat" }, ["En cours"]) : el("span", { "class": "etat" }, ["Nouveau"]);
      table.appendChild(el("li", {}, [el("a", { href: "#/chapitre/" + c.id }, [el("span", { "class": "num", text: romain(c.numero) }), el("span", {}, [el("b", { text: c.titre }), e ? el("span", { "class": "meta", text: "Meilleur score " + (e.meilleur || 0) + "/" + (e.n || 3) }) : null]), etatChap])]));
    });
    var barres = el("div", { "class": "barres", style: "grid-template-columns:repeat(" + Math.max(liste.length, 1) + ",1fr)", "aria-hidden": "true" });
    liste.forEach(function (c) { barres.appendChild(el("i", { "class": (etat.chapitres[c.id] || {}).valide ? "fait" : null })); });
    var p = null;
    for (var k = 0; k < liste.length; k++) if (!(etat.chapitres[liste[k].id] || {}).valide) { p = liste[k]; break; }
    var tete = el("div", { "class": "tete-livre" });
    tete.innerHTML = Gothique.lancette(d.verre);
    tete.appendChild(el("div", { style: "display:grid;gap:4px" }, [el("span", { "class": "lib", text: "Formation · " + pluriel(liste.length, "chapitre", "chapitres") }), el("h1", { text: d.nom })]));
    var mot = taquin() ? (v === 0 ? "Tout commence au chapitre I. Moi, je les connais déjà." : v === liste.length ? "Formation achevée. Je n’ai plus rien à t’apprendre ici, pour l’instant." : v + " sur " + liste.length + ". Le plus dur reste à faire.") : (v + " chapitre" + (v > 1 ? "s" : "") + " validé" + (v > 1 ? "s" : "") + " sur " + liste.length + ".");
    montrer(el("div", { "class": "page" }, [
      el("div", { "class": "barre-chap", style: "grid-template-columns:auto 1fr" }, [el("a", { "class": "retour", href: "#/" }, [icone("retour"), "Bibliothèque"])]),
      tete,
      el("div", { style: "display:grid;gap:6px" }, [barres, el("span", { "class": "meta", text: v + " validé" + (v > 1 ? "s" : "") + " sur " + liste.length })]),
      marge(taquin() ? "malin" : "explique", mot),
      el("section", { "class": "carte", "aria-labelledby": "table-titre" }, [el("h2", { id: "table-titre", text: "Table des chapitres" }), liste.length ? table : el("p", { "class": "meta", text: "Les premiers chapitres sont en cours de vérification." })]),
      p ? lien("#/chapitre/" + p.id, (etat.chapitres[p.id] || etat.enCours === p.id ? "Reprendre" : "Commencer") + " le chapitre " + romain(p.numero), "btn") : null,
      el("p", { "class": "astuce" }, [icone("verifie"), el("span", { text: "Chaque notion est vérifiée par au moins deux sources indépendantes, dont une institutionnelle ou savante." })])
    ]), "bibliotheque", d.nom);
  }

  /* ---------- Chapitre : fiche, exercices, bilan ---------- */
  function partie(ch, opt) {
    opt = opt || {};
    var brouillon = !!ch.brouillon;
    var info = brouillon ? null : infoChap(ch.id);
    var dom = DOM[ch.domaine] || { nom: "Sujet libre" };
    var serie = ch.exercices.map(function (q, i) { q._i = i; return q; });
    var aRevoir = [];
    if (opt.revoir) {
      var idx = ((etat.chapitres[ch.id] || {}).rates || []).map(function (r) { return r[0]; });
      serie = serie.filter(function (q) { return idx.indexOf(q._i) >= 0; });
      aRevoir = serie.map(function (q) { return q.repere; });
      if (!serie.length) { serie = ch.exercices.slice(); aRevoir = []; opt.revoir = false; }
    }
    var etape = 0, justes = 0, total = 0, rates = [];
    var scene = el("main", { id: "scene" });
    var etapes = el("div", { "class": "etapes", role: "progressbar", "aria-label": "Avancement du chapitre", "aria-valuemin": "1" });
    var compteur = el("span", { "class": "meta compteur" });
    var retourHref = brouillon ? "#/" : "#/livre/" + ch.domaine;
    var page = el("div", { "class": "page sans-nav" }, [
      el("div", { "class": "barre-chap" }, [el("a", { "class": "retour", href: retourHref }, [icone("retour"), brouillon ? "Bibliothèque" : "Formation"]), el("span", { "class": "titre-chap", text: brouillon ? "Brouillon" : "Chapitre " + romain(ch.numero) }), compteur]),
      etapes, scene
    ]);
    if (!brouillon && !opt.revoir && !opt.defi) { etat.enCours = (etat.chapitres[ch.id] || {}).valide ? etat.enCours : ch.id; sauver(); }

    function majEtapes() {
      var n = serie.length + 2;
      etapes.innerHTML = "";
      for (var k = 0; k < n; k++) etapes.appendChild(el("i", { "class": k < etape ? "fait" : (k === etape ? "cours" : null) }));
      etapes.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
      etapes.setAttribute("aria-valuemax", String(n));
      etapes.setAttribute("aria-valuenow", String(etape + 1));
      compteur.textContent = etape === 0 ? "Fiche" : (etape > serie.length ? "Bilan" : etape + " / " + serie.length);
    }
    function repartie(q, juste) {
      if (taquin()) return juste ? q.rivalJuste : q.rivalFaux;
      return juste ? "Bonne réponse, c’est noté." : "Relis la correction : elle fait foi.";
    }
    function signaler(q) {
      var zone = el("div", { "class": "signaler" });
      var ouvrir = el("button", { "class": "lien discret", type: "button" }, [icone("plume"), "Signaler une erreur"]);
      ouvrir.addEventListener("click", function () {
        var texte = el("textarea", { "class": "champ", maxlength: "1000", placeholder: "Qu’est‑ce qui te semble faux ? Une source, si tu en as une." , "aria-label": "Ton signalement" });
        var envoyer = el("button", { "class": "btn trait", type: "button", text: "Envoyer le signalement" });
        envoyer.addEventListener("click", function () {
          var m = texte.value.trim();
          if (!m) { texte.focus(); return; }
          if (!serveur.base || !profil.id) { toast("Envoi impossible pour l’instant : la base en ligne n’est pas branchée."); return; }
          envoyer.disabled = true;
          api("POST", "signalement", { chapitre: brouillon ? "libre:" + (ch.sujet || ch.titre) : ch.id, exercice: q._i, message: m }).then(function () {
            zone.innerHTML = "";
            zone.appendChild(el("p", { "class": "astuce" }, [icone("juste"), el("span", { text: "Signalement envoyé. Il sera relu et corrigé si besoin." })]));
            if (window.poserIcones) window.poserIcones(zone);
          }, function () { envoyer.disabled = false; toast("Envoi impossible pour l’instant. Réessaie plus tard."); });
        });
        zone.innerHTML = "";
        zone.appendChild(texte); zone.appendChild(envoyer);
        texte.focus();
      });
      zone.appendChild(ouvrir);
      return zone;
    }
    function verdict(q, juste, gagne) {
      if (juste) justes += 1; else rates.push(q);
      total += gagne;
      var b = el("section", { "class": "verdict " + (juste ? "ok" : "ko"), role: "status" }, [
        el("div", { "class": "titre" }, [icone(juste ? "juste" : "faux"), el("strong", { text: juste ? "Exact" : "Inexact" }), el("span", { "class": "pts", text: pts(gagne) })]),
        el("p", { "class": "explication", text: q.correction }),
        figure(q.figure),
        sources(q.sources),
        marge(juste ? "vexe" : "ravi", repartie(q, juste)),
        signaler(q)
      ]);
      var suite = el("button", { "class": "btn", type: "button", id: "continuer", text: etape === serie.length ? "Voir le bilan" : "Exercice suivant" });
      suite.addEventListener("click", function () { etape += 1; afficher(); });
      b.appendChild(suite);
      return b;
    }
    function poser(zone, bloc) {
      zone.appendChild(bloc);
      if (window.poserIcones) window.poserIcones(bloc);
      var calme = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      bloc.scrollIntoView({ behavior: calme ? "auto" : "smooth", block: "nearest" });
      setTimeout(function () { var s = bloc.querySelector("#continuer"); if (s) s.focus({ preventScroll: true }); }, 0);
    }
    function fiche() {
      var revision = aRevoir.length > 0;
      var liste = el("ol", { "class": "reperes" });
      (ch.reperes || []).forEach(function (r, k) {
        var li = el("li", {}, [el("span", { "class": "cle", text: r[0] }), el("span", { "class": "def", text: r[1] })]);
        if (aRevoir.indexOf(k) >= 0) li.classList.add("revoir");
        liste.appendChild(li);
      });
      var essentiel = el("div", { "class": "essentiel" });
      (ch.essentiel || []).forEach(function (t, k) {
        if (k === 0 && /^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t)) essentiel.appendChild(el("p", {}, [el("span", { "class": "lettrine", "aria-hidden": "true", text: t.charAt(0) }), el("span", { "class": "sr", text: t.charAt(0) }), t.slice(1)]));
        else essentiel.appendChild(el("p", { text: t }));
      });
      var n = serie.length;
      var go = el("button", { "class": "btn", type: "button", id: "commencer", text: revision ? "Rejouer " + (n > 1 ? "les " + n + " exercices manqués" : "l’exercice manqué") : "Passer aux " + pluriel(n, "exercice", "exercices") });
      go.addEventListener("click", function () { etape = 1; afficher(); });
      var lib = brouillon ? "Brouillon non vérifié" : revision ? "Révision · chapitre " + romain(ch.numero) : dom.nom + " · chapitre " + romain(ch.numero);
      var mot = brouillon ? (taquin() ? "Écrit à l’instant, sans vérification. Méfie‑toi de moi plus que d’habitude." : "Brouillon non vérifié : garde un œil critique.")
        : revision ? (taquin() ? "J’ai surligné ce qui t’a échappé. Relis, puis on reprend." : "Les repères à revoir sont surlignés.")
        : (taquin() ? pluriel((ch.reperes || []).length, "repère", "repères") + ", et je te les demanderai. Prends ton temps." : "Lis la fiche, puis passe aux exercices.");
      var blocs = [];
      if (brouillon) blocs.push(el("div", { "class": "bandeau-brouillon", role: "note" }, [icone("faux"), el("span", {}, [el("b", { text: "Brouillon non vérifié" }), "Rédigé en direct par une IA sur " + guill(ch.sujet || ch.titre) + ". Il peut contenir des erreurs et ne compte pas dans ta rosace."])]));
      if (opt.defi) blocs.push(el("div", { "class": "bandeau-defi", role: "note" }, [icone("epee"), el("span", { text: opt.defi.pseudo + " te défie sur ce chapitre : " + opt.defi.justes + "/" + opt.defi.n + ", " + pts(opt.defi.points) + ". À toi." })]));
      blocs.push(el("article", { "class": "feuille" }, [
        el("div", { "class": "arcature", "aria-hidden": "true" }),
        el("span", { "class": "lib", text: lib }),
        el("h1", { text: ch.titre }),
        figure(ch.figure),
        filet(), el("h2", { text: "L’essentiel" }), essentiel,
        filet(), el("h2", { text: "Repères" }), liste,
        sources(ch.sources)
      ]), marge("explique", mot), go, el("p", { "class": "meta", style: "margin-top:-8px;text-align:center", text: pluriel(n, "exercice", "exercices") + " · sans chronomètre" }));
      return el("div", { "class": "pile large" }, blocs);
    }
    function qcm(q) {
      var choisi = null, certitude = 70;
      var lettres = ["A", "B", "C", "D"];
      var rep = el("div", { "class": "reponses", role: "group", "aria-label": "Réponses" });
      var alerte = el("p", { "class": "alerte", text: "Choisis d’abord une réponse.", hidden: "" });
      var tuiles = q.reponses.map(function (r, k) {
        var t = el("button", { "class": "tuile", type: "button", "aria-pressed": "false" }, [el("span", { "class": "lettre", text: lettres[k] }), el("span", { text: r }), el("span", { "class": "fin" })]);
        t.addEventListener("click", function () { choisi = k; tuiles.forEach(function (x, j) { x.setAttribute("aria-pressed", j === k ? "true" : "false"); }); alerte.hidden = true; });
        rep.appendChild(t);
        return t;
      });
      var regle = el("span", { "class": "meta" });
      function majRegle() { regle.textContent = "Juste " + signe(BAREME[certitude][0]) + " · faux " + signe(BAREME[certitude][1]); }
      var jetons = el("div", { "class": "jetons", role: "group", "aria-label": "Ta certitude" });
      [50, 70, 90, 100].forEach(function (c) {
        var b = el("button", { type: "button", "aria-pressed": c === certitude ? "true" : "false", text: c + F + "%" });
        b.addEventListener("click", function () { certitude = c; jetons.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); majRegle(); });
        jetons.appendChild(b);
      });
      majRegle();
      var pari = el("div", { "class": "pari" }, [el("div", { "class": "ligne-titre" }, [el("span", { "class": "lib", text: "Ta certitude" }), regle]), jetons]);
      var valider = el("button", { "class": "btn", type: "button", text: "Valider" });
      var zone = el("div", { "class": "pile large" }, [el("div", { "class": "feuille" }, [el("span", { "class": "lib", text: q.lib }), el("h1", { text: q.enonce })]), rep, pari, valider, alerte]);
      valider.addEventListener("click", function () {
        if (choisi === null) { alerte.hidden = false; return; }
        tuiles.forEach(function (t) { t.disabled = true; t.setAttribute("aria-pressed", "false"); });
        var juste = choisi === q.bonne;
        tuiles[q.bonne].classList.add("juste");
        tuiles[q.bonne].querySelector(".fin").appendChild(icone("juste", "i marque-rep", "Bonne réponse"));
        if (!juste) { tuiles[choisi].classList.add("faux"); tuiles[choisi].querySelector(".fin").appendChild(icone("faux", "i marque-rep", "Ta réponse, inexacte")); }
        pari.remove(); valider.remove(); alerte.remove();
        poser(zone, verdict(q, juste, BAREME[certitude][juste ? 0 : 1]));
      });
      return zone;
    }
    function bluff(q) {
      var rep = el("div", { "class": "reponses deux", role: "group", "aria-label": "Ton verdict" });
      var vraiB = el("button", { "class": "tuile", type: "button", text: "Il dit vrai" });
      var bluffB = el("button", { "class": "tuile", type: "button", text: "Il bluffe" });
      rep.appendChild(vraiB); rep.appendChild(bluffB);
      var tete = el("div", { "class": "marge" });
      tete.innerHTML = window.rivalSVG ? window.rivalSVG("malin", 48) : "";
      tete.appendChild(el("p", { "class": "affirmation", text: guill(q.affirmation) }));
      var zone = el("div", { "class": "pile large" }, [el("div", { "class": "feuille" }, [el("span", { "class": "lib", text: q.lib }), tete]), rep]);
      function conclure(dit) {
        vraiB.disabled = true; bluffB.disabled = true;
        var juste = dit === q.vrai;
        var bon = q.vrai ? vraiB : bluffB;
        bon.classList.add("juste");
        bon.appendChild(icone("juste", "i marque-rep", "Bonne réponse"));
        if (!juste) { var mauvais = dit ? vraiB : bluffB; mauvais.classList.add("faux"); mauvais.appendChild(icone("faux", "i marque-rep", "Ta réponse, inexacte")); }
        poser(zone, verdict(q, juste, juste ? 8 : -4));
      }
      vraiB.addEventListener("click", function () { conclure(true); });
      bluffB.addEventListener("click", function () { conclure(false); });
      return zone;
    }
    function frise(q) {
      var placees = [];
      var n = q.ordre.length;
      var valeurs = q.valeurs || q.dates || {};
      var classement = /classement/i.test(q.lib || "");
      var rayon = el("div", { "class": "rayon", role: "group", "aria-label": "Ton ordre" });
      var pioche = el("div", { "class": "pioche", role: "group", "aria-label": "Éléments à placer" });
      var alerte = el("p", { "class": "alerte", text: "Place les " + n + " éléments avant de valider.", hidden: "" });
      function dessiner() {
        rayon.innerHTML = "";
        for (var k = 0; k < n; k++) {
          var nom = placees[k];
          var vide = k === 0 ? (classement ? "En premier" : "Le plus ancien") : (k === n - 1 ? (classement ? "En dernier" : "Le plus récent") : "Ensuite");
          rayon.appendChild(el("div", { "class": "case" + (nom ? " pleine" : "") }, [el("span", { "class": "num", text: String(k + 1) }), nom ? el("span", { text: nom }) : el("em", { text: vide })]));
        }
        pioche.querySelectorAll("button").forEach(function (b) { var d = placees.indexOf(b.dataset.nom) >= 0; b.setAttribute("aria-pressed", d ? "true" : "false"); b.querySelector(".etat").textContent = d ? "Retirer" : "Placer"; });
      }
      q.elements.forEach(function (nom) {
        var b = el("button", { "class": "tuile", type: "button", "data-nom": nom, "aria-pressed": "false" }, [el("span", { text: nom }), el("span", { "class": "etat", text: "Placer" })]);
        b.addEventListener("click", function () { var k = placees.indexOf(nom); if (k >= 0) placees.splice(k, 1); else if (placees.length < n) placees.push(nom); alerte.hidden = true; dessiner(); });
        pioche.appendChild(b);
      });
      var valider = el("button", { "class": "btn", type: "button", text: "Valider l’ordre" });
      var zone = el("div", { "class": "pile large" }, [el("div", { "class": "feuille" }, [el("span", { "class": "lib", text: q.lib }), el("h1", { text: q.enonce })]), rayon, pioche, valider, alerte]);
      valider.addEventListener("click", function () {
        if (placees.length < n) { alerte.hidden = false; return; }
        var juste = placees.every(function (x, k) { return x === q.ordre[k]; });
        pioche.remove(); valider.remove(); alerte.remove();
        rayon.innerHTML = "";
        q.ordre.forEach(function (nom, k) {
          var ok = placees[k] === nom;
          var txt = el("span", {}, [nom + (valeurs[nom] ? ", " + valeurs[nom] : "")]);
          if (!ok) txt.appendChild(el("small", { text: "Tu avais placé ici : " + placees[k] }));
          rayon.appendChild(el("div", { "class": "case " + (ok ? "ok" : "ko") }, [el("span", { "class": "num", text: String(k + 1) }), txt]));
        });
        poser(zone, verdict(q, juste, juste ? 10 : 0));
      });
      dessiner();
      return zone;
    }
    function enregistrer() {
      var c = etat.chapitres[ch.id] || {};
      var n = serie.length;
      var res = { nouveau: false, valide: false };
      if (opt.revoir) {
        var corriges = serie.filter(function (q) { return rates.indexOf(q) < 0; }).map(function (q) { return q._i; });
        c.rates = (c.rates || []).filter(function (r) { return corriges.indexOf(r[0]) < 0; });
        c.date = new Date().toISOString();
        etat.chapitres[ch.id] = c;
        res.valide = !!c.valide;
      } else {
        var valide = justes >= Math.ceil(n * 2 / 3);
        res.nouveau = valide && !c.valide;
        res.valide = valide || !!c.valide;
        etat.chapitres[ch.id] = { valide: res.valide, meilleur: Math.max(c.meilleur || 0, justes), n: n, points: Math.max(c.points || 0, Math.max(0, total)), rates: rates.map(function (q) { return [q._i, q.theme]; }), date: new Date().toISOString() };
        if (valide && etat.enCours === ch.id) etat.enCours = null;
        if (!valide) etat.enCours = ch.id;
      }
      sauver();
      return res;
    }
    function bilan() {
      var n = serie.length;
      var seuil = Math.ceil(n * 2 / 3);
      var reussi = opt.revoir ? rates.length === 0 : justes >= seuil;
      var res = brouillon ? { valide: reussi, nouveau: false } : enregistrer();
      var revoirListe = el("ul", { "class": "liste-revoir" });
      if (rates.length) rates.forEach(function (q) { revoirListe.appendChild(el("li", {}, [icone("revision"), q.theme])); });
      else revoirListe.appendChild(el("li", {}, [icone("juste"), "Rien à revoir sur ce chapitre."]));
      var titre = opt.revoir ? (reussi ? "Erreurs corrigées" : "Encore un effort") : brouillon ? (reussi ? "Brouillon réussi" : "Brouillon à reprendre") : (reussi ? "Chapitre validé" : "Chapitre à reprendre");
      var nextC = !brouillon && res.valide ? suivant(ch.id) : null;
      var precision = brouillon ? "Brouillon : ce résultat ne compte pas dans ta rosace."
        : opt.revoir ? (res.valide ? "Le chapitre reste validé." : "Refais le chapitre entier pour le valider.")
        : reussi ? (nextC ? "Suite : chapitre " + romain(nextC.numero) + " · " + nextC.titre + "." : "Dernier chapitre disponible de cette formation.")
        : "Il faut " + pluriel(seuil, "bonne réponse", "bonnes réponses") + " sur " + n + " pour valider.";
      var feuille = el("section", { "class": "feuille", "aria-labelledby": "bilan-titre" }, [
        el("span", { "class": "lib", text: (opt.revoir ? "Révision" : brouillon ? "Brouillon" : "Chapitre " + romain(ch.numero)) + " · bilan" }),
        el("h1", { id: "bilan-titre", text: titre }),
        el("div", { "class": "score" }, [el("strong", { text: justes + "/" + n }), el("span", { "class": "meta", text: Math.round(justes / n * 100) + F + "% · " + pts(total) })]),
        el("h2", { text: "Points à revoir" }), revoirListe,
        el("p", { "class": "meta", text: precision })
      ]);
      var blocs = [feuille];
      if (opt.defi && !opt.revoir) {
        var d = opt.defi;
        var issue = justes > d.justes || (justes === d.justes && total > d.points) ? "Défi remporté." : (justes === d.justes && total === d.points ? "Égalité parfaite." : "Défi perdu, cette fois.");
        blocs.push(el("div", { "class": "bandeau-defi" }, [icone("epee"), el("span", { text: issue + " " + d.pseudo + " : " + d.justes + "/" + d.n + ", " + pts(d.points) + ". Toi : " + justes + "/" + n + ", " + pts(total) + "." })]));
      }
      if (res.nouveau) {
        var m = el("div", { "class": "allume" });
        m.innerHTML = Gothique.medaillon(petales(ch.id), lobes(), etiquetteRosace());
        m.appendChild(el("p", { text: "Un vitrail de plus. Ta rosace en compte " + totalValides() + " allumé" + (totalValides() > 1 ? "s" : "") + " sur " + totalChapitres() + "." }));
        blocs.push(el("section", { "class": "carte" }, [m]));
      }
      var mot = taquin() ? (rates.length === 0 ? "Rien à redire. Le prochain sera moins indulgent." : reussi ? "Validé, mais pas sans fautes. Revois‑les avant d’avancer." : "Pas encore. Relis ce que j’ai surligné, puis reviens.")
        : (rates.length === 0 ? "Aucune erreur." : reussi ? "Validé. Quelques points à revoir." : "Relis la fiche, puis réessaie.");
      blocs.push(marge(reussi ? "vexe" : "ravi", mot));
      var actions = el("div", { "class": "pile" }), liste = [];
      if (rates.length && !brouillon) {
        var revoir = el("button", { type: "button", text: "Revoir mes erreurs" });
        revoir.addEventListener("click", function () {
          var cible = "#/chapitre/" + ch.id + "/revoir";
          if (location.hash === cible) route(); else location.hash = cible;
        });
        liste.push(revoir);
      } else if (rates.length && brouillon) {
        var refaire = el("button", { type: "button", text: "Refaire ce brouillon" });
        refaire.addEventListener("click", route);
        liste.push(refaire);
      }
      if (nextC) liste.push(el("a", { href: "#/chapitre/" + nextC.id, text: "Chapitre suivant" }));
      var info2 = el("p", { "class": "meta", role: "status" });
      if (!brouillon && !opt.revoir) {
        var defier = el("button", { type: "button" }, [icone("epee"), "Défier un ami sur ce chapitre"]);
        defier.addEventListener("click", function () {
          var url = location.origin + location.pathname + "#/defi/" + ch.id + "/" + encodeURIComponent(profil.pseudo) + "/" + justes + "/" + n + "/" + total;
          partager("Koîos", profil.pseudo + " te défie sur " + guill(ch.titre) + " : " + justes + "/" + n + ". À toi.", url, function (t) { info2.textContent = t; });
        });
        liste.push(defier);
      }
      liste.push(el("a", { href: brouillon ? "#/" : "#/livre/" + ch.domaine, text: brouillon ? "Retour à la bibliothèque" : "Retour à la formation" }));
      liste.forEach(function (x, k) { x.className = k === 0 ? "btn" : k === 1 ? "btn trait" : "lien"; actions.appendChild(x); });
      actions.appendChild(info2);
      blocs.push(actions);
      return el("div", { "class": "pile large" }, blocs);
    }
    function afficher() {
      scene.innerHTML = "";
      window.scrollTo(0, 0);
      majEtapes();
      var bloc;
      if (etape === 0) bloc = fiche();
      else if (etape > serie.length) bloc = bilan();
      else { var q = serie[etape - 1]; bloc = q.type === "qcm" ? qcm(q) : q.type === "bluff" ? bluff(q) : frise(q); }
      scene.appendChild(bloc);
      if (window.poserIcones) window.poserIcones(scene);
      var h = scene.querySelector("h1");
      if (h && etape > 0) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
    afficher();
    return page;
  }
  function vueChapitre(id, mode, defi) {
    montrer(attente("Le Rival sort le chapitre de l’étagère…"), null, "Chapitre");
    chargerChapitre(id).then(function (ch) {
      var titre = ch.titre;
      montrer(partie(ch, { revoir: mode === "revoir", defi: defi }), null, titre);
    }, function () { montrer(erreurPage("Ce chapitre n’existe pas, ou n’est pas encore publié."), "bibliotheque"); });
  }
  function vueBrouillon(k) {
    var ch = brouillons[k];
    if (!ch) return montrer(erreurPage("Ce brouillon n’existe plus sur cet appareil."), "bibliotheque");
    montrer(partie(ch, {}), null, "Brouillon");
  }
  function vueDefi(p) {
    var defi = { pseudo: (p[2] || "Un ami").slice(0, 24), justes: parseInt(p[3], 10) || 0, n: parseInt(p[4], 10) || 3, points: parseInt(p[5], 10) || 0 };
    vueChapitre(p[1], null, defi);
  }

  /* ---------- Révisions ---------- */
  function vueRevisions() {
    var items = aReviser();
    var contenu;
    if (items.length) {
      contenu = el("ul", { "class": "lignes" });
      items.forEach(function (it) { contenu.appendChild(el("li", {}, [icone("revision"), el("span", {}, [el("b", { text: it.theme }), el("br"), el("span", { "class": "meta", text: it.i.dom.nom + " · chapitre " + romain(it.i.chap.numero) })]), lien("#/chapitre/" + it.id + "/revoir", "Revoir")])); });
    } else contenu = el("p", { "class": "meta", text: "Rien à réviser pour l’instant. Tes erreurs arrivent ici après chaque bilan." });
    montrer(el("div", { "class": "page" }, [entete(),
      el("h1", { text: "Révisions" }),
      marge(taquin() ? "malin" : "explique", taquin() ? (items.length ? "Tes erreurs, rangées par chapitre. Je les garde au chaud." : "Aucune erreur en réserve. Pour l’instant.") : "Chaque erreur d’un bilan arrive ici, avec la fiche surlignée."),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "À revoir" }), el("span", { "class": "meta", text: pluriel(items.length, "point", "points") })]), contenu])
    ]), "revisions", "Révisions");
  }

  /* ---------- Cercle ---------- */
  function vueCercle() {
    var zone = el("div", { "class": "pile" }, [el("p", { "class": "attente", text: "Le Rival consulte le registre…" })]);
    var inviter = el("button", { "class": "btn trait", type: "button" }, [icone("cercle"), "Inviter un ami dans Koîos"]);
    var info = el("p", { "class": "meta", role: "status" });
    inviter.addEventListener("click", function () { partager("Koîos", "Une bibliothèque d’étude avec un Rival qui corrige en marge.", location.origin + "/", function (t) { info.textContent = t; }); });
    montrer(el("div", { "class": "page" }, [entete(),
      el("h1", { text: "Cercle d’étude" }),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "Classement" }), el("span", { "class": "meta", text: "Points cumulés" })]), zone]),
      el("section", { "class": "carte" }, [el("h2", { text: "Défier un ami" }), el("p", { style: "font-family:var(--livre);font-size:17px", text: "À la fin de chaque chapitre, envoie un lien de défi. Ton ami joue le même chapitre, puis vous comparez vos scores." }), inviter, info])
    ]), "cercle", "Cercle");
    pretServeur.then(function () {
      if (!serveur.base) { zone.innerHTML = ""; zone.appendChild(el("p", { "class": "meta", text: "Le classement s’affiche dès que la base en ligne est branchée." })); return; }
      api("GET", "cercle").then(function (j) {
        zone.innerHTML = "";
        var ol = el("ol", { "class": "classement" });
        (j.joueurs || []).forEach(function (x, k) {
          var moi = profil && x.pseudo === profil.pseudo;
          ol.appendChild(el("li", { "class": moi ? "moi" : null }, [el("span", { "class": "rang", text: String(k + 1) }), el("span", { "class": "qui", text: x.pseudo }), el("span", { "class": "meta", text: x.points + " pts · " + pluriel(x.valides, "chapitre", "chapitres") })]));
        });
        zone.appendChild((j.joueurs || []).length ? ol : el("p", { "class": "meta", text: "Personne n’a encore validé de chapitre." }));
      }, function () { zone.innerHTML = ""; zone.appendChild(el("p", { "class": "meta", text: "Classement indisponible pour l’instant." })); });
    });
  }

  /* ---------- Profil ---------- */
  function vueProfil() {
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", value: profil.pseudo });
    champ.addEventListener("change", function () {
      var p = champ.value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24);
      if (!p) { champ.value = profil.pseudo; return; }
      profil.pseudo = p; S.ecrire("koios.profil", profil); pousser(); toast("Nom de lecteur enregistré.");
    });
    var choix = el("div", { "class": "choix", role: "group", "aria-label": "Le ton du Rival" });
    [["taquin", "Taquin", "Pince‑sans‑rire, il te provoque un peu."], ["sobre", "Sobre", "Il corrige, sans commentaire."]].forEach(function (c) {
      var b = el("button", { type: "button", "aria-pressed": (profil.ton || "taquin") === c[0] ? "true" : "false" }, [el("b", { text: c[1] }), el("span", { text: c[2] })]);
      b.addEventListener("click", function () { profil.ton = c[0]; S.ecrire("koios.profil", profil); pousser(); choix.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
      choix.appendChild(b);
    });
    var sync = el("p", { "class": "etat-sync" });
    var cleZone = el("div", { "class": "pile" });
    function majSync() {
      sync.innerHTML = "";
      var ok = serveur.base && profil.id;
      sync.className = "etat-sync" + (ok ? "" : " hors");
      sync.appendChild(icone(ok ? "verifie" : "signet"));
      sync.appendChild(el("span", { text: ok ? "Progression enregistrée en ligne." : "Progression enregistrée sur cet appareil seulement, pour l’instant." }));
      cleZone.innerHTML = "";
      if (ok) {
        var montre = el("button", { "class": "btn trait", type: "button", text: "Afficher ma clé de lecteur" });
        montre.addEventListener("click", function () {
          var cle = profil.id + "." + profil.cle;
          var boite = el("p", { "class": "cle-lecteur", text: cle });
          var copier = el("button", { "class": "lien", type: "button", text: "Copier la clé" });
          copier.addEventListener("click", function () { try { navigator.clipboard.writeText(cle).then(function () { toast("Clé copiée. Garde‑la pour toi."); }, function () { toast("Sélectionne la clé pour la copier."); }); } catch (e) { toast("Sélectionne la clé pour la copier."); } });
          montre.replaceWith(el("div", { "class": "pile" }, [boite, copier, el("p", { "class": "meta", text: "Cette clé ouvre ta progression. Ne la partage pas." })]));
        });
        cleZone.appendChild(montre);
      }
      var saisie = el("input", { "class": "champ", type: "text", autocomplete: "off", placeholder: "Colle ici une clé de lecteur", "aria-label": "Clé de lecteur existante" });
      var retrouver = el("button", { "class": "btn trait", type: "button", text: "Retrouver ma progression" });
      var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
      retrouver.addEventListener("click", function () {
        var c = saisie.value.trim();
        if (!/^[a-z0-9]+\.[A-Za-z0-9]+$/.test(c)) { alerte.textContent = "Cette clé n’a pas le bon format."; alerte.hidden = false; return; }
        retrouver.disabled = true;
        api("GET", "progression", null, 8000, c).then(function (j) {
          var parts = c.split(".");
          profil.id = parts[0]; profil.cle = parts[1];
          if (j.pseudo) profil.pseudo = j.pseudo;
          if (j.ton) profil.ton = j.ton;
          S.ecrire("koios.profil", profil);
          etat = fusion(etat, j.etat || {});
          sauver();
          toast("Progression retrouvée.");
          vueProfil();
        }, function (e) { retrouver.disabled = false; alerte.textContent = e.statut === 401 ? "Clé inconnue." : "Impossible pour l’instant. Réessaie plus tard."; alerte.hidden = false; });
      });
      if (serveur.base) cleZone.appendChild(el("details", { "class": "sources" }, [el("summary", {}, [icone("signet"), "J’ai déjà une clé de lecteur"]), el("div", { "class": "pile", style: "padding-top:8px" }, [saisie, retrouver, alerte])]));
      if (window.poserIcones) window.poserIcones(cleZone);
    }
    var vitrail = el("div", { "class": "vitrail", html: Gothique.baie(petales(null), lobes(), etiquetteRosace()) });
    montrer(el("div", { "class": "page" }, [entete(),
      el("div", { style: "display:grid;gap:2px" }, [el("span", { "class": "lib", text: "Lecteur" }), el("h1", { text: profil.pseudo })]),
      vitrail,
      el("div", { "class": "chiffres" }, [
        el("div", {}, [el("span", { "class": "lib", text: "Vitraux" }), el("strong", { text: totalValides() + "/" + totalChapitres() }), el("span", { "class": "meta", text: "chapitres validés" })]),
        el("div", {}, [el("span", { "class": "lib", text: "Points" }), el("strong", { text: String(totalPoints()) }), el("span", { "class": "meta", text: "meilleurs scores cumulés" })])
      ]),
      el("section", { "class": "carte" }, [el("h2", { text: "Réglages" }), el("label", { "for": "pseudo", "class": "lib", text: "Nom de lecteur" }), champ, el("span", { "class": "lib", text: "Le ton du Rival" }), choix]),
      el("section", { "class": "carte" }, [el("h2", { text: "Ta progression" }), sync, cleZone]),
      el("p", { "class": "credit", text: "Koîos V1 · chapitres vérifiés par au moins deux sources · icônes Phosphor (licence MIT)" })
    ]), "profil", "Profil");
    majSync();
    pretServeur.then(majSync);
  }

  /* ---------- Routeur ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, "");
    var p = h.split("/").map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (!profil) { if (p[0] !== "accueil") apresAccueil = location.hash || "#/"; return vueAccueil(); }
    chargerCatalogue().then(function () {
      switch (p[0]) {
        case "": case "accueil": return vueBibliotheque();
        case "livre": return vueLivre(p[1]);
        case "chapitre": return vueChapitre(p[1], p[2]);
        case "brouillon": return vueBrouillon(parseInt(p[1], 10) || 0);
        case "defi": return vueDefi(p);
        case "revisions": return vueRevisions();
        case "cercle": return vueCercle();
        case "profil": return vueProfil();
        default: location.hash = "#/";
      }
    }, function () { montrer(erreurPage("Le catalogue ne se charge pas. Vérifie ta connexion, puis recharge la page."), null); });
  }
  window.addEventListener("hashchange", route);
  route();
  pretServeur.then(function () { return synchroniser(); }).then(function () {
    var h = location.hash.replace(/^#\/?/, "");
    if (profil && (h === "" || h === "profil")) route();
  });
})();
