/* Koîos v1.1 : bibliothèque d'étude, exploration sans fin, jeux entre amis. Une page, sans étape de construction.
   Vues : accueil, bibliothèque, livre (formation vérifiée), chapitre (fiche, 3 exercices, bilan), explorer (n'importe quel sujet),
   sujet (programme et sous-sujets), chapitre IA, jouer (question du jour, quiz éclair, duels, classement), révisions, profil. */
(function () {
  "use strict";
  var F = " ", N = " "; // fine insécable, insécable
  var DOMAINES = [
    { code: "hg", nom: "Histoire et géographie", court: "Histoire · Géo", verre: "#b0414f", cuir: "#5e2430", w: 56, h: 214 },
    { code: "sn", nom: "Sciences et nature", court: "Sciences", verre: "#4f8f6c", cuir: "#2f5442", w: 48, h: 206 },
    { code: "ac", nom: "Arts et culture", court: "Arts · Culture", verre: "#4a7fb3", cuir: "#24405e", w: 52, h: 210 },
    { code: "gj", nom: "Gemmologie et joaillerie", court: "Gemmologie", verre: "#cfa645", cuir: "#6a5020", w: 46, h: 202 }
  ];
  var DOM = {};
  DOMAINES.forEach(function (d) { DOM[d.code] = d; });
  var NIVEAUX = { 1: "Découverte", 2: "Approfondissement", 3: "Expert" };
  var VERRE_NIVEAU = { 1: "#cfa645", 2: "#cfa645", 3: "#cfa645" }; // brouillons : or, jamais les couleurs des domaines vérifiés
  var SUGGESTIONS = ["La Grèce antique", "L’Islande", "La Vendée", "La Bretagne", "Le Mexique", "Le Texas", "Les fonds marins", "La montagne", "La philosophie", "La littérature française", "Le cinéma", "La musique classique", "L’Autriche", "Les grandes découvertes"];
  var BAREME = { 50: [6, -1], 70: [8, -4], 90: [9, -8], 100: [10, -20] };

  /* ---------- Stockage local (peut être indisponible : navigation privée) ---------- */
  var S = {
    lire: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mémoire seule */ } }
  };
  var profil = S.lire("koios.profil", null);
  var etat = S.lire("koios.etat", null) || { version: 1, chapitres: {}, enCours: null, maj: 0 };
  if (!etat.chapitres) etat.chapitres = {};
  if (!etat.jours) etat.jours = {};
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
    var t = [[40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]], r = "";
    t.forEach(function (p) { while (n >= p[0]) { r += p[1]; n -= p[0]; } });
    return r;
  }
  function jour(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function aujourdhui() { return jour(new Date()); }
  function hasard(graine) { // mulberry32 : même graine, même suite
    var a = graine >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function melanger(liste, alea) { var l = liste.slice(); for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(alea() * (i + 1)); var x = l[i]; l[i] = l[j]; l[j] = x; } return l; }
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
    var legende = f.credit ? el("figcaption", {}, [f.credit, f.page ? " · " : null, f.page ? el("a", { href: f.page, target: "_blank", rel: "noopener", text: "page du fichier" }) : null]) : null;
    var fig = el("figure", {}, [img, legende]);
    img.addEventListener("error", function () { fig.remove(); });
    return fig;
  }
  function sources(liste, brouillon) {
    if (!liste || !liste.length) return el("p", { "class": "sans-source" }, [icone("faux"), "Brouillon non vérifié" + N + ": aucune source contrôlée."]);
    var ul = el("ul");
    liste.forEach(function (s) {
      ul.appendChild(el("li", {}, [s[1] ? el("a", { href: s[1], target: "_blank", rel: "noopener", text: s[0] }) : el("span", { style: "display:block;padding:11px 0", text: s[0] })]));
    });
    var titre = brouillon ? "Point de départ, non vérifié" + N + ": " + pluriel(liste.length, "page", "pages") : "Vérifié par " + liste.length + " sources";
    return el("details", { "class": "sources" + (brouillon ? " depart" : "") }, [el("summary", {}, [icone(brouillon ? "parchemin" : "verifie"), titre]), ul]);
  }
  function filet() { return el("div", { "class": "filet", html: window.Gothique ? Gothique.fleuron() : "" }); }
  function lien(href, texte, cls) { return el("a", { "class": cls || "lien", href: href, text: texte }); }
  function partager(titre, texte, url, repli) {
    if (navigator.share) { navigator.share({ title: titre, text: texte, url: url }).catch(function () {}); return; }
    var echec = function () { repli("Copie impossible ici. Lien" + N + ": " + url); };
    try { navigator.clipboard.writeText(url).then(function () { repli("Lien copié" + N + ": colle‑le dans WhatsApp ou un message."); }, echec); } catch (e) { echec(); }
  }
  function enLigne() { return serveur.base && profil && profil.id; }
  function pretCompte() { return pretServeur.then(function () { return creerJoueur(); }); }

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
      }, function () { clearTimeout(t); var x = new Error("hors ligne"); x.statut = 0; throw x; });
  }
  function messageErreur(e, quota) {
    if (e.statut === 429) return quota || "Limite du jour atteinte. Réessaie demain.";
    if (e.statut === 503) return "Ce service en ligne n’est pas encore branché.";
    if (e.statut === 0) return "Pas de réponse du serveur. Vérifie ta connexion.";
    return e.message || "Une erreur est survenue.";
  }
  var minuterieSync;
  function sauver() { etat.maj = Date.now(); S.ecrire("koios.etat", etat); pousser(); }
  function pousser() {
    if (!enLigne()) return;
    clearTimeout(minuterieSync);
    minuterieSync = setTimeout(function () {
      api("PUT", "progression", { pseudo: profil.pseudo, ton: profil.ton, etat: compacter(etat) }).catch(function (e) {
        if (e.statut === 413 && !pousser.prevenu) { pousser.prevenu = true; toast("Synchronisation en ligne impossible" + N + ": progression trop volumineuse. Elle reste sur cet appareil."); }
      });
    }, 700);
  }
  function compacter(e) { // les brouillons IA sans erreur à revoir n'ont pas besoin de leur titre en ligne
    var c = { version: e.version, enCours: e.enCours, maj: e.maj, jours: e.jours, chapitres: {} };
    Object.keys(e.chapitres).forEach(function (k) {
      var x = e.chapitres[k];
      if (/^ia:/.test(k) && !(x.rates || []).length) c.chapitres[k] = { valide: x.valide, meilleur: x.meilleur, n: x.n, points: x.points, rates: [], date: x.date };
      else c.chapitres[k] = x;
    });
    return c;
  }
  function fusion(a, b) {
    var r = { version: 1, chapitres: {}, jours: {}, enCours: (b.maj || 0) > (a.maj || 0) ? b.enCours : a.enCours, maj: Math.max(a.maj || 0, b.maj || 0) };
    var ca = a.chapitres || {}, cb = b.chapitres || {};
    Object.keys(ca).concat(Object.keys(cb)).forEach(function (id) {
      var x = ca[id], y = cb[id];
      if (!x || !y) { r.chapitres[id] = x || y; return; }
      var recent = (y.date || "") > (x.date || "") ? y : x;
      var c = {}; Object.keys(recent).forEach(function (k) { c[k] = recent[k]; });
      c.valide = !!(x.valide || y.valide); c.meilleur = Math.max(x.meilleur || 0, y.meilleur || 0); c.points = Math.max(x.points || 0, y.points || 0);
      r.chapitres[id] = c;
    });
    [a.jours || {}, b.jours || {}].forEach(function (j) { Object.keys(j).forEach(function (d) { r.jours[d] = r.jours[d] || j[d]; }); });
    return r;
  }
  var creation = null; // une seule création de compte à la fois
  function creerJoueur() {
    if (!serveur.base || !profil || profil.id) return Promise.resolve();
    if (!creation) creation = api("POST", "joueur", { pseudo: profil.pseudo }).then(function (j) {
      profil.id = j.id; profil.cle = j.cle;
      S.ecrire("koios.profil", profil);
      pousser();
    }, function () { creation = null; });
    return creation;
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

  /* ---------- Contenu vérifié ---------- */
  var catalogue = null, promesseCatalogue = null, cache = {}, promesseQuestions = null;
  function chargerCatalogue() {
    if (!promesseCatalogue) promesseCatalogue = fetch("contenu/catalogue.json").then(function (r) { if (!r.ok) throw new Error("catalogue"); return r.json(); }).then(function (c) { catalogue = c; return c; });
    return promesseCatalogue;
  }
  function chargerQuestions() {
    if (!promesseQuestions) promesseQuestions = fetch("contenu/questions.json").then(function (r) { if (!r.ok) throw new Error("questions"); return r.json(); });
    return promesseQuestions;
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
  function suivant(id) { var i = infoChap(id); return i && i.rang + 1 < i.liste.length ? i.liste[i.rang + 1] : null; }
  function totalChapitres() { return DOMAINES.reduce(function (s, d) { return s + chapitres(d.code).length; }, 0); }
  function valides(code) { return chapitres(code).filter(function (c) { return etat.chapitres[c.id] && etat.chapitres[c.id].valide; }).length; }
  function totalValides() { return DOMAINES.reduce(function (s, d) { return s + valides(d.code); }, 0); }
  function totalPoints() { return Object.keys(etat.chapitres).reduce(function (s, k) { return s + (etat.chapitres[k].points || 0); }, 0); }
  function explorations() { return Object.keys(etat.chapitres).filter(function (k) { return /^ia:/.test(k) && etat.chapitres[k].valide; }).length; }
  function sujetsVerifies() {
    var vus = {}, l = [];
    DOMAINES.forEach(function (d) { chapitres(d.code).forEach(function (c) { if (c.sujet && !vus[c.sujet]) { vus[c.sujet] = 1; l.push({ titre: c.sujet, dom: d }); } }); });
    return l;
  }
  function prochain() {
    if (etat.enCours && infoChap(etat.enCours) && !(etat.chapitres[etat.enCours] || {}).valide) return infoChap(etat.enCours);
    var dernier = null;
    Object.keys(etat.chapitres).forEach(function (id) { if (/^ia:/.test(id) || !infoChap(id)) return; var c = etat.chapitres[id]; if (!dernier || (c.date || "") > (etat.chapitres[dernier].date || "")) dernier = id; });
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
    DOMAINES.forEach(function (d) { chapitres(d.code).forEach(function (c) { var v = (etat.chapitres[c.id] || {}).valide; p.push({ verre: v ? d.verre : null, neuf: c.id === neuf }); }); });
    return p;
  }
  function lobes() { return DOMAINES.map(function (d) { return valides(d.code) > 0 ? d.verre : null; }); }
  function vitraux(n) { return n + (n > 1 ? " vitraux" : " vitrail"); }
  function etiquetteRosace() { var v = totalValides(); return "Rosace des savoirs" + N + ": " + vitraux(v) + " allumé" + (v > 1 ? "s" : "") + " sur " + totalChapitres(); }

  /* ---------- Exploration (sujets créés par l'IA, partagés entre tous) ---------- */
  var cacheSujets = {};
  function chargerSujet(id) {
    if (!cacheSujets[id]) cacheSujets[id] = api("GET", "sujet?id=" + encodeURIComponent(id)).then(function (j) { return j.sujet; }, function (e) { delete cacheSujets[id]; throw e; });
    return cacheSujets[id];
  }
  function idIA(sujet, n) { return "ia:" + sujet + ":" + n; }
  function normaliser(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ").replace(/^(l |la |le |les )/, "").replace(/\s+/g, " ").trim(); }
  function lireIdIA(id) { var m = /^ia:(.+):(\d+)$/.exec(id || ""); return m ? { sujet: m[1], n: parseInt(m[2], 10) } : null; }
  function hrefIA(sujet, n) { return "#/ia/" + encodeURIComponent(sujet) + "/" + n; }
  function creerSujet(titre, parent, bouton, alerte) {
    titre = String(titre || "").trim();
    alerte.hidden = true;
    if (titre.length < 2) { alerte.textContent = "Écris d’abord un sujet, par exemple " + guill("la Vendée") + "."; alerte.hidden = false; return; }
    if (!parent) {
      var cle = normaliser(titre);
      var v = sujetsVerifies().filter(function (s) { return normaliser(s.titre) === cle; })[0];
      var d = DOMAINES.filter(function (x) { return normaliser(x.nom) === cle && chapitres(x.code).length; })[0];
      if (v || d) { location.hash = "#/livre/" + (v ? v.dom.code : d.code); return; }
    }
    var texte = bouton ? bouton.textContent : "";
    if (bouton) { bouton.disabled = true; bouton.textContent = "Le Rival dresse le programme…"; }
    var corps = { titre: titre };
    if (parent) corps.parent = parent;
    pretCompte().then(function () {
      if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
      return api("POST", "sujet", corps, 90000);
    }).then(function (j) {
      cacheSujets[j.sujet.id] = Promise.resolve(j.sujet);
      location.hash = "#/sujet/" + encodeURIComponent(j.sujet.id);
    }, function (e) {
      if (bouton) { bouton.disabled = false; bouton.textContent = texte; }
      alerte.textContent = messageErreur(e, "Limite du jour" + N + ": 10 nouveaux sujets par lecteur. Les sujets déjà créés restent ouverts à tous.");
      alerte.hidden = false;
    });
  }

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
  function retour(href, texte) { return el("div", { "class": "barre-chap", style: "grid-template-columns:auto 1fr" }, [el("a", { "class": "retour", href: href }, [icone("retour"), texte])]); }
  function attente(texte, sansNav) { return el("div", { "class": "page" + (sansNav ? " sans-nav" : "") }, [entete(), el("p", { "class": "attente", role: "status" }, [el("span", { html: window.rivalSVG ? window.rivalSVG("explique", 40) : "" }), texte])]); }
  function erreurPage(texte, titre) {
    return el("div", { "class": "page" }, [entete(), el("section", { "class": "carte" }, [el("h1", { text: titre || "Page introuvable" }), el("p", { text: texte }), lien("#/", "Retour à la bibliothèque", "btn")])]);
  }
  function puces(titres, action) {
    var z = el("div", { "class": "puces" });
    titres.forEach(function (t) { var b = el("button", { type: "button", "class": "puce", text: t }); b.addEventListener("click", function () { action(t, b); }); z.appendChild(b); });
    return z;
  }
  function choixTon(initial, rappel) {
    var choix = el("div", { "class": "choix", role: "group", "aria-label": "Le ton du Rival" });
    [["taquin", "Taquin", "Pince‑sans‑rire, il te provoque un peu."], ["sobre", "Sobre", "Il corrige, sans commentaire."]].forEach(function (c) {
      var b = el("button", { type: "button", "aria-pressed": c[0] === initial ? "true" : "false" }, [el("b", { text: c[1] }), el("span", { text: c[2] })]);
      b.addEventListener("click", function () { rappel(c[0]); choix.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
      choix.appendChild(b);
    });
    return choix;
  }

  /* ---------- Accueil (première visite) ---------- */
  function vueAccueil() {
    var ton = "taquin";
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", autocomplete: "nickname", placeholder: "Ton prénom ou un pseudo" });
    var alerte = el("p", { "class": "alerte", hidden: "" });
    var choix = choixTon(ton, function (t) { ton = t; });
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
    pretServeur.then(function () { if (serveur.base) syncSpan.textContent = "Ta progression est enregistrée en ligne. Ta clé de lecteur, dans le profil, permet de la retrouver sur un autre appareil."; });
    chargerCatalogue().then(function () { vitrail.innerHTML = Gothique.baie(petales(null), lobes(), etiquetteRosace()); }, function () { vitrail.remove(); });
    montrer(el("div", { "class": "page sans-nav" }, [
      el("header", { "class": "haut" }, [el("span", { "class": "marque", html: (window.Gothique ? Gothique.marque(DOMAINES.map(function (d) { return d.verre; })) : "") + "Koîos" })]),
      el("div", { "class": "arcature", "aria-hidden": "true" }),
      el("h1", { text: "Un puits de science, chapitre après chapitre." }),
      el("p", { "class": "chapeau", text: "Choisis n’importe quel sujet et creuse‑le aussi loin que tu veux : fiches, repères, chiffres, réseau des notions, puis exercices et duels entre amis. La bibliothèque vérifiée s’appuie sur au moins deux sources sérieuses par notion ; le reste est rédigé par le Rival, un renard bibliothécaire, et signalé comme brouillon." }),
      el("section", { "class": "carte" }, [
        el("label", { "for": "pseudo", "class": "titre-champ", text: "Ton nom de lecteur" }), champ,
        el("span", { "class": "lib", text: "Le ton du Rival" }), choix,
        go, alerte,
        el("p", { "class": "astuce" }, [icone("verifie"), syncSpan])
      ]),
      vitrail,
      el("p", { "class": "meta", style: "text-align:center", text: "Chaque chapitre vérifié et validé allume un vitrail de la rosace." })
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
      if (v === t && t > 0) return marge("vexe", "Toute la rosace est allumée. Va donc explorer un sujet que je ne connais pas.");
      if (enCours) return marge("malin", "Un chapitre commencé, jamais fini. Je note.");
      if (v === 0) return marge("malin", vitraux(t) + " éteint" + (t > 1 ? "s" : "") + ". Allume le premier, je regarde.");
      return marge("malin", vitraux(v) + " sur " + t + ". Je commence à me méfier.");
    }
    if (v === t && t > 0) return marge("explique", "Tout est validé. Explore d’autres sujets en attendant les prochains chapitres.");
    if (enCours) return marge("explique", "Un chapitre t’attend là où tu l’as laissé.");
    return marge("explique", v + " chapitre" + (v > 1 ? "s" : "") + " validé" + (v > 1 ? "s" : "") + " sur " + t + ".");
  }
  function carteReprendre() {
    var p = prochain();
    if (!p) return el("section", { "class": "carte" }, [el("span", { "class": "lib", text: "Programme vérifié" }), el("h2", { text: "Tout est validé" }), el("p", { "class": "meta", text: "Révise tes erreurs ou explore un autre sujet en attendant les prochains chapitres." }), lien("#/explorer", "Explorer un sujet", "btn")]);
    var c = etat.chapitres[p.chap.id];
    var commence = etat.enCours === p.chap.id || (c && !c.valide);
    var barres = el("div", { "class": "barres", style: "grid-template-columns:repeat(" + p.liste.length + ",1fr)", role: "img", "aria-label": pluriel(p.liste.length, "chapitre", "chapitres") + " au programme, " + pluriel(valides(p.dom.code), "validé", "validés") });
    p.liste.forEach(function (x) { barres.appendChild(el("i", { "class": (etat.chapitres[x.id] || {}).valide ? "fait" : (x.id === p.chap.id ? "cours" : null) })); });
    return el("section", { "class": "carte reprendre", "aria-labelledby": "reprendre-titre" }, [
      el("span", { "class": "lib", text: commence ? "Formation en cours" : "Prochain chapitre" }),
      el("h2", { id: "reprendre-titre", text: p.dom.nom }),
      el("p", { "class": "sous", text: (p.chap.sujet ? p.chap.sujet + " · " : "") + "Chapitre " + romain(p.chap.numero) + " · " + p.chap.titre }),
      el("div", { "class": "infos meta" }, [el("span", {}, [icone("livre"), "Fiche " + guill("L’essentiel")]), el("span", {}, [icone("liste"), "3 exercices"]), el("span", {}, [icone("verifie"), "Sources vérifiées"])]),
      el("div", { style: "display:grid;gap:6px" }, [barres, el("span", { "class": "meta", text: pluriel(p.liste.length, "chapitre", "chapitres") + " au programme · " + pluriel(valides(p.dom.code), "validé", "validés") })]),
      lien("#/chapitre/" + p.chap.id, (commence ? "Reprendre" : "Commencer") + " le chapitre " + romain(p.chap.numero), "btn")
    ]);
  }
  function aReviser() {
    var items = [];
    Object.keys(etat.chapitres).sort().forEach(function (id) {
      var c = etat.chapitres[id];
      if (!(c.rates || []).length) return;
      var i = infoChap(id), ia = lireIdIA(id);
      if (i) c.rates.forEach(function (r) { items.push({ theme: r[1], lieu: i.dom.nom + " · chapitre " + romain(i.chap.numero), href: "#/chapitre/" + id + "/revoir" }); });
      else if (ia) c.rates.forEach(function (r) { items.push({ theme: r[1], lieu: (c.sujet || "Exploration") + " · chapitre " + romain(ia.n) + " · brouillon", href: hrefIA(ia.sujet, ia.n) + "/revoir" }); });
    });
    return items;
  }
  function ligneRevision(it) { return el("li", {}, [icone("revision"), el("span", {}, [el("b", { text: it.theme }), el("br"), el("span", { "class": "meta", text: it.lieu })]), lien(it.href, "Revoir")]); }
  function carteExplorer() {
    var champ = el("input", { "class": "champ", id: "sujet", type: "search", maxlength: "80", autocomplete: "off", enterkeyhint: "go", placeholder: "La Vendée, les fonds marins, Kubrick…" });
    var bouton = el("button", { "class": "btn", type: "button", text: "Ouvrir le programme" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    bouton.addEventListener("click", function () { creerSujet(champ.value, null, bouton, alerte); });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
    return el("section", { "class": "carte", "aria-labelledby": "explorer-titre" }, [
      el("label", { "for": "sujet", id: "explorer-titre", "class": "titre-champ", text: "Approfondir n’importe quel sujet" }),
      el("p", { "class": "meta", text: "Le Rival dresse un programme de chapitres, puis des sous‑sujets toujours plus pointus. Sans fin." }),
      champ, bouton, alerte,
      puces(SUGGESTIONS.slice(0, 6), function (t) { champ.value = t; creerSujet(t, null, bouton, alerte); }),
      lien("#/explorer", "Tous les sujets")
    ]);
  }
  function serieJours() {
    var n = 0, d = new Date();
    if (!etat.jours[jour(d)]) d.setDate(d.getDate() - 1);
    while (etat.jours[jour(d)]) { n += 1; d.setDate(d.getDate() - 1); }
    return n;
  }
  function carteJour() {
    var fait = etat.jours[aujourdhui()], serie = serieJours();
    return el("section", { "class": "carte", "aria-labelledby": "jour-titre" }, [
      el("div", { "class": "titre-sec" }, [el("h2", { id: "jour-titre", text: "Question du jour" }), el("span", { "class": "meta", text: serie ? "Série" + N + ": " + pluriel(serie, "jour", "jours") : "La même pour tous" })]),
      fait ? el("p", { "class": "astuce" }, [icone(fait === "juste" ? "juste" : "faux"), el("span", { text: fait === "juste" ? "Répondue juste aujourd’hui. Reviens demain." : "Manquée aujourd’hui. La suivante arrive demain." })])
        : lien("#/jeu/jour", "Répondre", "btn trait")
    ]);
  }
  function vueBibliotheque() {
    var items = aReviser();
    var blocs = [entete(), el("h1", { "class": "sr", text: "Bibliothèque" }), noteAccueil(), carteReprendre(), carteJour(),
      el("section", { "aria-labelledby": "etagere-titre", style: "display:grid;gap:12px" }, [
        el("div", { "class": "titre-sec" }, [el("h2", { id: "etagere-titre", text: "Bibliothèque vérifiée" }), el("span", { "class": "meta", text: pluriel(totalChapitres(), "chapitre", "chapitres") })]),
        armoire(), legende(),
        el("p", { "class": "meta", style: "text-align:center", text: "Touche un livre pour ouvrir sa formation. Chaque chapitre validé allume un vitrail." })
      ]),
      carteExplorer()];
    if (items.length) {
      var ul = el("ul", { "class": "lignes" });
      items.slice(0, 3).forEach(function (it) { ul.appendChild(ligneRevision(it)); });
      blocs.push(el("section", { "class": "carte", "aria-labelledby": "reviser-titre" }, [el("div", { "class": "titre-sec" }, [el("h2", { id: "reviser-titre", text: "À réviser" }), items.length > 3 ? lien("#/revisions", "Tout voir (" + items.length + ")") : el("span", { "class": "meta", text: "Tiré de tes bilans" })]), ul]));
    }
    blocs.push(el("p", { "class": "credit", text: "Icônes Phosphor (licence MIT) · Rival et rosace dessinés pour Koîos" }));
    montrer(el("div", { "class": "page" }, blocs), "bibliotheque", "Bibliothèque");
  }

  /* ---------- Livre (formation vérifiée d'un domaine) ---------- */
  function etatLigne(e, enCours) {
    return e && e.valide ? el("span", { "class": "etat ok" }, [icone("juste"), "Validé"]) : e ? el("span", { "class": "etat ko" }, [icone("revision"), "À reprendre"]) : enCours ? el("span", { "class": "etat" }, ["En cours"]) : el("span", { "class": "etat" }, ["Nouveau"]);
  }
  function vueLivre(code) {
    var d = DOM[code];
    if (!d) return montrer(erreurPage("Cette formation n’existe pas."), "bibliotheque");
    var liste = chapitres(code), v = valides(code);
    var table = el("ol", { "class": "table" }), groupe = null;
    liste.forEach(function (c) {
      var g = c.sujet || "Fondamentaux";
      if (g !== groupe) { groupe = g; table.appendChild(el("li", { "class": "groupe", "aria-hidden": "true", text: g })); }
      var e = etat.chapitres[c.id];
      table.appendChild(el("li", {}, [el("a", { href: "#/chapitre/" + c.id, "aria-label": g + ", chapitre " + c.numero + N + ": " + c.titre }, [el("span", { "class": "num", text: romain(c.numero) }), el("span", {}, [el("b", { text: c.titre }), e ? el("span", { "class": "meta", text: "Meilleur score " + (e.meilleur || 0) + "/" + (e.n || 3) }) : null]), etatLigne(e, etat.enCours === c.id)])]));
    });
    var barres = el("div", { "class": "barres", style: "grid-template-columns:repeat(" + Math.max(liste.length, 1) + ",1fr)", "aria-hidden": "true" });
    liste.forEach(function (c) { barres.appendChild(el("i", { "class": (etat.chapitres[c.id] || {}).valide ? "fait" : null })); });
    var p = null;
    for (var k = 0; k < liste.length; k++) if (!(etat.chapitres[liste[k].id] || {}).valide) { p = liste[k]; break; }
    var tete = el("div", { "class": "tete-livre" });
    tete.innerHTML = Gothique.lancette(d.verre);
    tete.appendChild(el("div", { style: "display:grid;gap:4px" }, [el("span", { "class": "lib", text: "Formation vérifiée · " + pluriel(liste.length, "chapitre", "chapitres") }), el("h1", { text: d.nom })]));
    var mot = taquin() ? (v === 0 ? "Tout commence au chapitre I. Moi, je les connais déjà." : v === liste.length ? "Formation achevée. Pour aller plus loin, explore un sous‑sujet." : v + " sur " + liste.length + ". Le plus dur reste à faire.") : (v + " chapitre" + (v > 1 ? "s" : "") + " validé" + (v > 1 ? "s" : "") + " sur " + liste.length + ".");
    montrer(el("div", { "class": "page" }, [
      retour("#/", "Bibliothèque"),
      tete,
      el("div", { style: "display:grid;gap:6px" }, [barres, el("span", { "class": "meta", text: v + " validé" + (v > 1 ? "s" : "") + " sur " + liste.length })]),
      marge(taquin() ? "malin" : "explique", mot),
      el("section", { "class": "carte", "aria-labelledby": "table-titre" }, [el("h2", { id: "table-titre", text: "Table des chapitres" }), liste.length ? table : el("p", { "class": "meta", text: "Les premiers chapitres sont en cours de vérification." })]),
      p ? lien("#/chapitre/" + p.id, (etat.chapitres[p.id] || etat.enCours === p.id ? "Reprendre" : "Commencer") + " le chapitre " + romain(p.numero), "btn") : null,
      lien("#/explorer", "Approfondir un sujet de ce domaine", "btn trait"),
      el("p", { "class": "astuce" }, [icone("verifie"), el("span", { text: "Chaque notion est vérifiée par au moins deux sources indépendantes, dont une institutionnelle ou savante." })])
    ]), "bibliotheque", d.nom);
  }

  /* ---------- Moteur commun : fiche, exercices, bilan (chapitre vérifié, brouillon IA, jeu) ---------- */
  function partie(ch, opt) {
    opt = opt || {};
    var jeu = !!opt.jeu;
    var brouillon = !!ch.brouillon;
    var estIA = /^ia:/.test(ch.id || "");
    var dom = DOM[ch.domaine] || { nom: ch.sujetTitre || "Exploration", verre: VERRE_NIVEAU[2] };
    var serie = ch.exercices.map(function (q, i) { if (!jeu) q._i = i; return q; });
    var aRevoir = [];
    if (opt.revoir) {
      var idx = ((etat.chapitres[ch.id] || {}).rates || []).map(function (r) { return r[0]; });
      serie = serie.filter(function (q) { return idx.indexOf(q._i) >= 0; });
      aRevoir = serie.map(function (q) { return q.repere; });
      if (!serie.length) { serie = ch.exercices.slice(); aRevoir = []; opt.revoir = false; }
    }
    var etape = jeu ? 1 : 0, justes = 0, total = 0, rates = [];
    var scene = el("main", { id: "scene" });
    var etapes = el("div", { "class": "etapes", role: "progressbar", "aria-label": jeu ? "Avancement de la partie" : "Avancement du chapitre", "aria-valuemin": "1" });
    var compteur = el("span", { "class": "meta compteur" });
    var r = opt.retour || (brouillon ? { href: "#/", texte: "Bibliothèque" } : { href: "#/livre/" + ch.domaine, texte: "Formation" });
    var page = el("div", { "class": "page sans-nav" }, [
      el("div", { "class": "barre-chap" }, [el("a", { "class": "retour", href: r.href }, [icone("retour"), r.texte]), el("span", { "class": "titre-chap", text: opt.titreBarre || (ch.numero ? "Chapitre " + romain(ch.numero) : "Brouillon") }), compteur]),
      etapes, scene
    ]);
    if (!brouillon && !jeu && !opt.revoir && !opt.defi) { etat.enCours = (etat.chapitres[ch.id] || {}).valide ? etat.enCours : ch.id; sauver(); }

    function majEtapes() {
      var n = serie.length + (jeu ? 1 : 2), cur = jeu ? etape - 1 : etape;
      etapes.innerHTML = "";
      for (var k = 0; k < n; k++) etapes.appendChild(el("i", { "class": k < cur ? "fait" : (k === cur ? "cours" : null) }));
      etapes.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
      etapes.setAttribute("aria-valuemax", String(n));
      etapes.setAttribute("aria-valuenow", String(cur + 1));
      compteur.textContent = etape === 0 ? "Fiche" : (etape > serie.length ? "Bilan" : etape + " / " + serie.length);
    }
    function repartie(q, juste) {
      if (taquin() && q.rivalJuste && q.rivalFaux) return juste ? q.rivalJuste : q.rivalFaux;
      return juste ? "Bonne réponse, c’est noté." : "Relis la correction" + N + ": elle fait foi.";
    }
    function signaler(q) {
      var zone = el("div", { "class": "signaler" });
      var ouvrir = el("button", { "class": "lien discret", type: "button" }, [icone("plume"), "Signaler une erreur"]);
      ouvrir.addEventListener("click", function () {
        var texte = el("textarea", { "class": "champ", maxlength: "1000", placeholder: "Qu’est‑ce qui te semble faux" + F + "? Une source, si tu en as une.", "aria-label": "Ton signalement" });
        var envoyer = el("button", { "class": "btn trait", type: "button", text: "Envoyer le signalement" });
        envoyer.addEventListener("click", function () {
          var m = texte.value.trim();
          if (!m) { texte.focus(); return; }
          if (!enLigne()) { toast("Envoi impossible pour l’instant" + N + ": la base en ligne n’est pas branchée."); return; }
          envoyer.disabled = true;
          api("POST", "signalement", { chapitre: q._chap || ch.id || ("libre:" + ch.titre), exercice: q._i, message: m }).then(function () {
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
        sources(q.sources, q._brouillon !== undefined ? q._brouillon : brouillon),
        marge(juste ? "vexe" : "ravi", repartie(q, juste)),
        signaler(q)
      ]);
      var suite = el("button", { "class": "btn", type: "button", id: "continuer", text: etape === serie.length ? "Voir le bilan" : (jeu ? "Question suivante" : "Exercice suivant") });
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
    function section(titre, contenu) { return contenu ? [filet(), el("h2", { text: titre }), contenu] : []; }
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
      var V = window.Visuels || {};
      var chiffres = V.barres ? V.barres(ch.chiffres, dom.verre) : null;
      var reseau = V.reseau ? V.reseau(ch.notions) : null;
      var cit = !brouillon && V.citation ? V.citation(ch.citation) : null;
      var saviez = ch.saviezVous ? el("aside", { "class": "saviez" }, [icone("ampoule"), el("div", {}, [el("span", { "class": "lib", text: "Le saviez‑vous" + F + "?" }), el("p", { text: ch.saviezVous })])]) : null;
      var n = serie.length;
      var go = el("button", { "class": "btn", type: "button", id: "commencer", text: revision ? "Rejouer " + (n > 1 ? "les " + n + " exercices manqués" : "l’exercice manqué") : "Passer aux " + pluriel(n, "exercice", "exercices") });
      go.addEventListener("click", function () { etape = 1; afficher(); });
      var lib = brouillon ? "Brouillon · " + (ch.sujetTitre ? ch.sujetTitre + " · " : "") + (ch.numero ? "chapitre " + romain(ch.numero) : "non vérifié") : revision ? "Révision · chapitre " + romain(ch.numero) : dom.nom + (ch.sujet ? " · " + ch.sujet : "") + " · chapitre " + romain(ch.numero);
      var mot = brouillon ? (taquin() ? (ch.ancrage === "wikipedia" ? "Rédigé à partir de Wikipédia, sans vérification." : "Rédigé sans source de départ.") + " Méfie‑toi de moi plus que d’habitude." : "Brouillon non vérifié" + N + ": garde un œil critique.")
        : revision ? (taquin() ? "J’ai surligné ce qui t’a échappé. Relis, puis on reprend." : "Les repères à revoir sont surlignés.")
        : (taquin() ? pluriel((ch.reperes || []).length, "repère", "repères") + ", et je te les demanderai. Prends ton temps." : "Lis la fiche, puis passe aux exercices.");
      var blocs = [];
      if (brouillon) blocs.push(el("div", { "class": "bandeau-brouillon", role: "note" }, [icone("faux"), el("span", {}, [el("b", { text: "Brouillon non vérifié" }), (ch.ancrage === "wikipedia" ? "Rédigé par l’IA à partir de Wikipédia, sans vérification humaine. " : "Rédigé par l’IA sans source de départ. ") + "Il peut contenir des erreurs" + N + ": signale‑les. Il n’allume pas la rosace."])]));
      if (opt.defi) blocs.push(el("div", { "class": "bandeau-defi", role: "note" }, [icone("epee"), el("span", { text: opt.defi.pseudo + " te défie sur ce chapitre" + N + ": " + opt.defi.justes + "/" + opt.defi.n + ", " + pts(opt.defi.points) + ". À toi." })]));
      var contenu = [el("div", { "class": "arcature", "aria-hidden": "true" }), el("span", { "class": "lib", text: lib }), el("h1", { text: ch.titre }), figure(ch.figure)]
        .concat(section("L’essentiel", essentiel), cit ? [cit] : [], section("En chiffres", chiffres), section("Réseau des notions", reseau), section("Repères", liste), saviez ? [saviez] : [], [sources(ch.sources, brouillon)]);
      blocs.push(el("article", { "class": "feuille" }, contenu), marge("explique", mot), go, el("p", { "class": "meta", style: "margin-top:-8px;text-align:center", text: pluriel(n, "exercice", "exercices") + " · sans chronomètre" }));
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
      var classement = /classement/i.test(q.lib || "") || !/ancien|récent|chronolog/i.test(q.enonce || "");
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
          if (!ok) txt.appendChild(el("small", { text: "Tu avais placé ici" + N + ": " + placees[k] }));
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
        var e = { valide: res.valide, meilleur: Math.max(c.meilleur || 0, justes), n: n, points: Math.max(c.points || 0, Math.max(0, total)), rates: rates.map(function (q) { return [q._i, q.theme]; }), date: new Date().toISOString() };
        if (estIA) { e.titre = ch.titre; e.sujet = ch.sujetTitre; }
        etat.chapitres[ch.id] = e;
        if (!estIA) { if (valide && etat.enCours === ch.id) etat.enCours = null; if (!valide) etat.enCours = ch.id; }
      }
      sauver();
      return res;
    }
    function bilanJeu() {
      var n = serie.length;
      var revoirListe = el("ul", { "class": "liste-revoir" });
      if (rates.length) rates.forEach(function (q) { revoirListe.appendChild(el("li", {}, [icone("revision"), el("span", {}, [q.theme || "Question", el("br"), el("span", { "class": "meta", text: q._titre || "" })])])); });
      else revoirListe.appendChild(el("li", {}, [icone("juste"), "Sans faute."]));
      var moitie = Math.ceil(n / 2);
      var blocs = [el("section", { "class": "feuille", "aria-labelledby": "bilan-titre" }, [
        el("span", { "class": "lib", text: (opt.titreBarre || "Partie") + " · bilan" }),
        el("h1", { id: "bilan-titre", text: justes === n ? "Sans faute" : justes >= moitie ? "Bien joué" : "À retravailler" }),
        el("div", { "class": "score" }, [el("strong", { text: justes + "/" + n }), el("span", { "class": "meta", text: Math.round(justes / n * 100) + F + "% · " + pts(total) })]),
        el("h2", { text: "À revoir" }), revoirListe
      ])];
      blocs.push(marge(justes >= moitie ? "vexe" : "ravi", taquin() ? (justes === n ? "Sans faute. J’en reviens à peine." : justes >= moitie ? "Honorable. Les chapitres d’origine t’attendent pour le reste." : "Le hasard ne suffit pas. Les fiches, si.") : (justes + " bonnes réponses sur " + n + ".")));
      var suite = el("div", { "class": "pile" });
      blocs.push(suite);
      if (opt.fin) opt.fin({ justes: justes, n: n, points: total, rates: rates }, suite);
      return el("div", { "class": "pile large" }, blocs);
    }
    function bilan() {
      if (jeu) return bilanJeu();
      var n = serie.length;
      var seuil = Math.ceil(n * 2 / 3);
      var reussi = opt.revoir ? rates.length === 0 : justes >= seuil;
      var compte = !brouillon || estIA;
      var res = compte ? enregistrer() : { valide: reussi, nouveau: false };
      var revoirListe = el("ul", { "class": "liste-revoir" });
      if (rates.length) rates.forEach(function (q) { revoirListe.appendChild(el("li", {}, [icone("revision"), q.theme])); });
      else revoirListe.appendChild(el("li", {}, [icone("juste"), "Rien à revoir sur ce chapitre."]));
      var titre = opt.revoir ? (reussi ? "Erreurs corrigées" : "Encore un effort") : (reussi ? "Chapitre validé" : "Chapitre à reprendre");
      var nextC = !brouillon && res.valide ? suivant(ch.id) : null;
      var nextIA = brouillon && opt.suivant && reussi ? opt.suivant : null;
      var precision = opt.revoir ? (res.valide ? "Le chapitre reste validé." : "Refais le chapitre entier pour le valider.")
        : !reussi ? "Il faut " + pluriel(seuil, "bonne réponse", "bonnes réponses") + " sur " + n + " pour valider."
        : brouillon ? (nextIA ? "Suite" + N + ": " + nextIA.titre + "." : "Programme terminé" + N + ": choisis un sous‑sujet pour aller plus loin.") + " Brouillon" + N + ": il n’allume pas la rosace."
        : (nextC ? "Suite" + N + ": chapitre " + romain(nextC.numero) + " · " + nextC.titre + "." : "Dernier chapitre disponible de cette formation.");
      var blocs = [el("section", { "class": "feuille", "aria-labelledby": "bilan-titre" }, [
        el("span", { "class": "lib", text: (opt.revoir ? "Révision" : (ch.numero ? "Chapitre " + romain(ch.numero) : "Brouillon")) + " · bilan" }),
        el("h1", { id: "bilan-titre", text: titre }),
        el("div", { "class": "score" }, [el("strong", { text: justes + "/" + n }), el("span", { "class": "meta", text: Math.round(justes / n * 100) + F + "% · " + pts(total) })]),
        el("h2", { text: "Points à revoir" }), revoirListe,
        el("p", { "class": "meta", text: precision })
      ])];
      if (opt.defi && !opt.revoir) {
        var d = opt.defi;
        var issue = justes > d.justes || (justes === d.justes && total > d.points) ? "Défi remporté." : (justes === d.justes && total === d.points ? "Égalité parfaite." : "Défi perdu, cette fois.");
        blocs.push(el("div", { "class": "bandeau-defi" }, [icone("epee"), el("span", { text: issue + " " + d.pseudo + N + ": " + d.justes + "/" + d.n + ", " + pts(d.points) + ". Toi" + N + ": " + justes + "/" + n + ", " + pts(total) + "." })]));
      }
      if (res.nouveau && !brouillon) {
        var m = el("div", { "class": "allume" });
        m.innerHTML = Gothique.medaillon(petales(ch.id), lobes(), etiquetteRosace());
        m.appendChild(el("p", { text: "Un vitrail de plus. Ta rosace en compte " + totalValides() + " allumé" + (totalValides() > 1 ? "s" : "") + " sur " + totalChapitres() + "." }));
        blocs.push(el("section", { "class": "carte" }, [m]));
      }
      var mot = taquin() ? (rates.length === 0 ? "Rien à redire. Le prochain sera moins indulgent." : reussi ? "Validé, mais pas sans fautes. Revois‑les avant d’avancer." : "Pas encore. Relis ce que j’ai surligné, puis reviens.")
        : (rates.length === 0 ? "Aucune erreur." : reussi ? "Validé. Quelques points à revoir." : "Relis la fiche, puis réessaie.");
      blocs.push(marge(reussi ? "vexe" : "ravi", mot));
      var actions = el("div", { "class": "pile" }), liste = [];
      if (rates.length && compte) {
        var revoir = el("button", { type: "button", text: "Revoir mes erreurs" });
        revoir.addEventListener("click", function () {
          var ia = lireIdIA(ch.id);
          var cible = ia ? hrefIA(ia.sujet, ia.n) + "/revoir" : "#/chapitre/" + ch.id + "/revoir";
          if (location.hash === cible) route(); else location.hash = cible;
        });
        liste.push(revoir);
      }
      if (nextC) liste.push(el("a", { href: "#/chapitre/" + nextC.id, text: "Chapitre suivant" }));
      if (nextIA) liste.push(el("a", { href: nextIA.href, text: "Chapitre suivant" }));
      if (brouillon && !nextIA && reussi && opt.retour) liste.push(el("a", { href: opt.retour.href, text: "Choisir un sous‑sujet" }));
      var info2 = el("p", { "class": "meta", role: "status" });
      if (!opt.revoir) {
        var defier = el("button", { type: "button" }, [icone("epee"), "Défier un ami sur ce chapitre"]);
        defier.addEventListener("click", function () {
          var ia = lireIdIA(ch.id);
          var cible = ia ? "ia/" + encodeURIComponent(ia.sujet) + "/" + ia.n : ch.id;
          var url = location.origin + location.pathname + "#/defi/" + cible + "/" + encodeURIComponent(profil.pseudo) + "/" + justes + "/" + n + "/" + total;
          partager("Koîos", profil.pseudo + " te défie sur " + guill(ch.titre) + F + ": " + justes + "/" + n + ". À toi.", url, function (t) { info2.textContent = t; });
        });
        liste.push(defier);
      }
      liste.push(el("a", { href: r.href, text: "Retour" + N + ": " + r.texte.toLowerCase() }));
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
      if (h && (etape > 0 || jeu)) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
    afficher();
    return page;
  }
  function vueChapitre(id, mode, defi) {
    montrer(attente("Le Rival sort le chapitre de l’étagère…", true), null, "Chapitre");
    chargerChapitre(id).then(function (ch) {
      montrer(partie(ch, { revoir: mode === "revoir", defi: defi }), null, ch.titre);
    }, function () { montrer(erreurPage("Ce chapitre n’existe pas, ou n’est pas encore publié."), "bibliotheque"); });
  }
  function vueDefi(p) {
    var k = p.length;
    var defi = { pseudo: (p[k - 4] || "Un ami").slice(0, 24), justes: parseInt(p[k - 3], 10) || 0, n: parseInt(p[k - 2], 10) || 3, points: parseInt(p[k - 1], 10) || 0 };
    if (p[1] === "ia") vueChapitreIA(p[2], parseInt(p[3], 10) || 1, null, defi);
    else vueChapitre(p[1], null, defi);
  }

  /* ---------- Explorer ---------- */
  function vueExplorer() {
    var champ = el("input", { "class": "champ", id: "sujet", type: "search", maxlength: "80", autocomplete: "off", enterkeyhint: "go", placeholder: "La Vendée, le Texas, Kubrick, les volcans…" });
    var bouton = el("button", { "class": "btn", type: "button", text: "Ouvrir le programme" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    bouton.addEventListener("click", function () { creerSujet(champ.value, null, bouton, alerte); });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
    var communaute = el("div", { "class": "pile" }, [el("p", { "class": "attente", text: "Le Rival consulte le registre…" })]);
    var zv = el("div", { "class": "puces" });
    sujetsVerifies().forEach(function (s) { zv.appendChild(el("a", { "class": "puce verifie", href: "#/livre/" + s.dom.code, text: s.titre })); });
    DOMAINES.forEach(function (d) { if (chapitres(d.code).length) zv.appendChild(el("a", { "class": "puce verifie", href: "#/livre/" + d.code, text: d.nom })); });
    montrer(el("div", { "class": "page" }, [entete(),
      el("div", { style: "display:grid;gap:4px" }, [el("span", { "class": "lib", text: "Sans fin" }), el("h1", { text: "Explorer un sujet" })]),
      marge(taquin() ? "malin" : "explique", taquin() ? "Donne‑moi un sujet, n’importe lequel. Je te prépare huit chapitres, puis de quoi creuser encore. Et encore." : "Chaque sujet a un programme de huit chapitres et des sous‑sujets plus pointus."),
      el("section", { "class": "carte" }, [el("label", { "for": "sujet", "class": "titre-champ", text: "Quel sujet veux‑tu approfondir" + F + "?" }), champ, bouton, alerte,
        el("span", { "class": "lib", text: "Idées" }), puces(SUGGESTIONS, function (t) { champ.value = t; creerSujet(t, null, bouton, alerte); }),
        el("p", { "class": "astuce" }, [icone("parchemin"), el("span", { text: "Programmes et chapitres sont rédigés par l’IA à partir de Wikipédia, puis partagés avec tous les lecteurs. Ce sont des brouillons" + N + ": les meilleurs entreront dans la bibliothèque vérifiée." })])
      ]),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "Bibliothèque vérifiée" }), el("span", { "class": "meta", text: "2 sources par notion" })]), zv]),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "Sujets des lecteurs" }), el("span", { "class": "meta", text: "Les plus ouverts" })]), communaute])
    ]), "explorer", "Explorer");
    pretServeur.then(function () {
      if (!serveur.base) { communaute.innerHTML = ""; communaute.appendChild(el("p", { "class": "meta", text: "La liste s’affiche dès que la base en ligne répond." })); return; }
      api("GET", "sujets").then(function (j) {
        communaute.innerHTML = "";
        var l = j.sujets || [];
        if (!l.length) { communaute.appendChild(el("p", { "class": "meta", text: "Aucun sujet pour l’instant. Ouvre le premier." })); return; }
        var ul = el("ul", { "class": "lignes" });
        l.forEach(function (s) { ul.appendChild(el("li", {}, [icone("globe"), el("span", {}, [el("b", { text: s.titre }), el("br"), el("span", { "class": "meta", text: (NIVEAUX[s.niveau] || "Découverte") + " · " + pluriel(s.vues || 0, "lecture", "lectures") })]), lien("#/sujet/" + encodeURIComponent(s.id), "Ouvrir")])); });
        communaute.appendChild(ul);
        if (window.poserIcones) window.poserIcones(communaute);
      }, function () { communaute.innerHTML = ""; communaute.appendChild(el("p", { "class": "meta", text: "Liste indisponible pour l’instant." })); });
    });
  }

  /* ---------- Sujet (programme et sous-sujets) ---------- */
  function vueSujet(id) {
    montrer(attente("Le Rival ouvre le programme…"), "explorer", "Sujet");
    pretServeur.then(function () { return chargerSujet(id); }).then(function (s) {
      var plan = s.plan || [];
      var faits = plan.filter(function (c) { return (etat.chapitres[idIA(s.id, c.numero)] || {}).valide; }).length;
      var table = el("ol", { "class": "table" });
      plan.forEach(function (c) {
        var e = etat.chapitres[idIA(s.id, c.numero)];
        table.appendChild(el("li", {}, [el("a", { href: hrefIA(s.id, c.numero) }, [el("span", { "class": "num", text: romain(c.numero) }), el("span", {}, [el("b", { text: c.titre }), c.resume ? el("span", { "class": "meta", text: c.resume }) : null]), etatLigne(e, false)])]));
      });
      var barres = el("div", { "class": "barres", style: "grid-template-columns:repeat(" + Math.max(plan.length, 1) + ",1fr)", "aria-hidden": "true" });
      plan.forEach(function (c) { barres.appendChild(el("i", { "class": (etat.chapitres[idIA(s.id, c.numero)] || {}).valide ? "fait" : null })); });
      var prochainC = plan.filter(function (c) { return !(etat.chapitres[idIA(s.id, c.numero)] || {}).valide; })[0];
      var tete = el("div", { "class": "tete-livre" });
      tete.innerHTML = Gothique.lancette(VERRE_NIVEAU[s.niveau] || VERRE_NIVEAU[1]);
      tete.appendChild(el("div", { style: "display:grid;gap:4px" }, [el("span", { "class": "lib", text: (NIVEAUX[s.niveau] || "Découverte") + " · " + pluriel(plan.length, "chapitre", "chapitres") }), el("h1", { text: s.titre })]));
      var champ = el("input", { "class": "champ", id: "sous-sujet", type: "search", maxlength: "80", autocomplete: "off", enterkeyhint: "go", placeholder: "Un angle précis, une période, une personne…" });
      var bouton = el("button", { "class": "btn trait", type: "button", text: "Ouvrir ce sous‑sujet" });
      var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
      bouton.addEventListener("click", function () { creerSujet(champ.value, s.id, bouton, alerte); });
      champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
      var parentHref = s.parent ? "#/sujet/" + encodeURIComponent(s.parent) : "#/explorer";
      montrer(el("div", { "class": "page" }, [
        retour(parentHref, s.parent ? "Sujet parent" : "Explorer"),
        tete,
        el("div", { style: "display:grid;gap:6px" }, [barres, el("span", { "class": "meta", text: faits + " validé" + (faits > 1 ? "s" : "") + " sur " + plan.length })]),
        figure(s.image),
        s.resume ? el("p", { "class": "chapeau", text: s.resume }) : null,
        el("div", { "class": "bandeau-brouillon", role: "note" }, [icone("parchemin"), el("span", {}, [el("b", { text: "Programme en brouillon" }), (s.ancrage === "wikipedia" ? "Dressé par l’IA à partir de Wikipédia. " : "Dressé par l’IA. ") + "Partagé avec tous les lecteurs ; non vérifié."])]),
        el("section", { "class": "carte", "aria-labelledby": "plan-titre" }, [el("h2", { id: "plan-titre", text: "Programme" }), table]),
        prochainC ? lien(hrefIA(s.id, prochainC.numero), (etat.chapitres[idIA(s.id, prochainC.numero)] ? "Reprendre" : "Commencer") + " le chapitre " + romain(prochainC.numero), "btn") : null,
        el("section", { "class": "carte", "aria-labelledby": "approfondir-titre" }, [
          el("div", { "class": "titre-sec" }, [el("h2", { id: "approfondir-titre", text: "Approfondir" }), el("span", { "class": "meta", text: s.niveau >= 3 ? "Niveau expert" : "Niveau suivant" + N + ": " + NIVEAUX[Math.min((s.niveau || 1) + 1, 3)] })]),
          puces(s.approfondir || [], function (t) { champ.value = t; creerSujet(t, s.id, bouton, alerte); }),
          el("label", { "for": "sous-sujet", "class": "lib", text: "Ou un autre angle" }), champ, bouton, alerte
        ]),
        sources(s.sources, true),
        marge(taquin() ? "malin" : "explique", taquin() ? "Huit chapitres pour commencer. Après, chaque sous‑sujet en ouvre huit autres. Tu vois où je veux en venir." : "Valide les chapitres, puis choisis un sous‑sujet pour aller plus loin.")
      ]), "explorer", s.titre);
    }, function (e) {
      montrer(erreurPage(e.statut === 404 ? "Ce sujet n’existe pas encore. Ouvre‑le depuis l’écran Explorer." : messageErreur(e), "Sujet indisponible"), "explorer");
    });
  }

  /* ---------- Chapitre IA (rédigé à la demande, puis partagé) ---------- */
  function vueChapitreIA(sujet, n, mode, defi) {
    montrer(attente("Le Rival rédige ce chapitre à partir de Wikipédia… La première fois, compte une demi‑minute.", true), null, "Chapitre");
    pretCompte().then(function () {
      return Promise.all([chargerSujet(sujet), api("GET", "chapitre-ia?sujet=" + encodeURIComponent(sujet) + "&n=" + n, null, 90000)]);
    }).then(function (res) {
      var s = res[0], ch = res[1].chapitre;
      ch.brouillon = true;
      ch.sujetTitre = ch.sujetTitre || s.titre;
      var apres = (s.plan || []).filter(function (c) { return c.numero === n + 1; })[0];
      montrer(partie(ch, {
        revoir: mode === "revoir", defi: defi,
        retour: { href: "#/sujet/" + encodeURIComponent(sujet), texte: "Programme" },
        suivant: apres ? { href: hrefIA(sujet, apres.numero), titre: "chapitre " + romain(apres.numero) + " · " + apres.titre } : null
      }), null, ch.titre);
    }, function (e) {
      montrer(erreurPage(e.statut === 404 ? "Ce chapitre n’existe pas." : e.statut === 401 ? "La rédaction d’un nouveau chapitre demande ton compte en ligne. Réessaie dans un moment." : messageErreur(e, "Limite du jour" + N + ": 15 nouveaux chapitres par lecteur. Les chapitres déjà rédigés restent ouverts."), "Chapitre indisponible"), "explorer");
    });
  }

  /* ---------- Jouer : question du jour, quiz éclair, duels, classement ---------- */
  function questionDeJeu(item, k, total) {
    var q = {}; Object.keys(item.exercice).forEach(function (x) { q[x] = item.exercice[x]; });
    q._i = item.index; q._chap = item.chapitre; q._titre = item.titre; q._brouillon = /^ia:/.test(item.chapitre);
    q.lib = "Question " + (k + 1) + " sur " + total + " · " + item.titre + (q._brouillon ? " · brouillon" : "");
    return q;
  }
  function tirage(graine, n) {
    var alea = hasard(graine);
    return chargerQuestions().then(function (pool) {
      var verifiees = melanger(pool, alea).slice(0, n);
      return pretServeur.then(function () {
        if (!serveur.base) return verifiees;
        return api("GET", "melange?n=" + Math.max(1, Math.floor(n / 3)) + "&graine=" + graine).then(function (j) {
          var ia = (j.questions || []).map(function (x) { return { chapitre: x.chapitre, titre: x.titre, index: x.index, exercice: x.exercice }; });
          return melanger(verifiees.slice(0, n - ia.length).concat(ia), alea);
        }, function () { return verifiees; });
      });
    });
  }
  function resoudre(refs) {
    return chargerQuestions().then(function (pool) {
      return Promise.all(refs.map(function (r) {
        var trouve = pool.filter(function (x) { return x.chapitre === r.chapitre && x.index === r.index; })[0];
        if (trouve) return trouve;
        if (!lireIdIA(r.chapitre)) return null;
        return api("GET", "chapitre-ia?id=" + encodeURIComponent(r.chapitre)).then(function (j) { var c = j.chapitre; return c && c.exercices[r.index] ? { chapitre: r.chapitre, titre: c.titre, index: r.index, exercice: c.exercices[r.index] } : null; }, function () { return null; });
      }));
    }).then(function (l) { return l.filter(Boolean); });
  }
  function jouer(items, opt) {
    var ch = { id: null, titre: opt.titre, exercices: items.map(function (it, k) { return questionDeJeu(it, k, items.length); }) };
    montrer(partie(ch, { jeu: true, titreBarre: opt.titre, retour: { href: "#/jouer", texte: "Jouer" }, fin: opt.fin }), null, opt.titre);
  }
  function vueJour() {
    montrer(attente("Le Rival choisit la question du jour…", true), null, "Question du jour");
    var d = aujourdhui(), graine = parseInt(d.replace(/-/g, ""), 10);
    if (etat.jours[d]) { location.replace("#/jouer"); return; }
    etat.jours[d] = "faux"; sauver(); // une seule tentative : la question compte dès qu'elle est ouverte
    chargerQuestions().then(function (pool) {
      var simples = pool.filter(function (x) { return x.exercice.type !== "frise"; });
      var item = simples[Math.floor(hasard(graine)() * simples.length)];
      jouer([item], { titre: "Question du jour", fin: function (res, zone) {
        etat.jours[d] = res.justes ? "juste" : "faux"; sauver();
        zone.appendChild(el("p", { "class": "meta", text: "Série" + N + ": " + pluriel(serieJours(), "jour", "jours") + ". La prochaine question arrive demain." }));
        zone.appendChild(lien("#/chapitre/" + item.chapitre, "Lire le chapitre d’origine", "btn"));
        zone.appendChild(lien("#/jeu/eclair", "Enchaîner sur un quiz éclair", "btn trait"));
      } });
    }, function () { montrer(erreurPage("Les questions ne se chargent pas. Vérifie ta connexion."), "jouer"); });
  }
  function vueEclair(enDuel) {
    montrer(attente("Le Rival mélange les questions…", true), null, enDuel ? "Duel" : "Quiz éclair");
    var graine = Math.floor(Math.random() * 2147483647);
    tirage(graine, 10).then(function (items) {
      jouer(items, { titre: enDuel ? "Duel" : "Quiz éclair", fin: function (res, zone) {
        if (!enDuel) {
          zone.appendChild(lien("#/jeu/eclair", "Rejouer un quiz éclair", "btn"));
          zone.appendChild(el("a", { "class": "btn trait", href: "#/jeu/duel" }, [icone("epee"), "Lancer un duel"]));
          return;
        }
        if (!enLigne()) { zone.appendChild(el("p", { "class": "alerte", text: "Les duels demandent la base en ligne. Réessaie dans un moment." })); return; }
        var info = el("p", { "class": "meta", role: "status", text: "Enregistrement du duel…" });
        zone.appendChild(info);
        api("POST", "duel", { questions: items.map(function (x) { return { chapitre: x.chapitre, index: x.index }; }), score: { justes: res.justes, n: res.n, points: res.points } }).then(function (j) {
          var url = location.origin + location.pathname + "#/duel/" + j.id;
          info.textContent = "Duel prêt. Envoie‑le à un ami" + N + ": il aura les mêmes questions.";
          var envoyer = el("button", { "class": "btn", type: "button" }, [icone("epee"), "Envoyer le duel"]);
          var retourInfo = el("p", { "class": "meta", role: "status" });
          envoyer.addEventListener("click", function () { partager("Koîos", profil.pseudo + " te lance un duel" + F + ": " + res.justes + "/" + res.n + ". Mêmes questions, à toi.", url, function (t) { retourInfo.textContent = t; }); });
          zone.appendChild(envoyer); zone.appendChild(retourInfo);
          zone.appendChild(lien("#/duel/" + j.id, "Voir le tableau du duel"));
          if (window.poserIcones) window.poserIcones(zone);
        }, function (e) { info.textContent = messageErreur(e); });
      } });
    }, function () { montrer(erreurPage("Les questions ne se chargent pas. Vérifie ta connexion."), "jouer"); });
  }
  function tableauDuel(duel) {
    var scores = (duel.scores || []).slice().sort(function (a, b) { return b.justes - a.justes || b.points - a.points; });
    var ol = el("ol", { "class": "classement" });
    scores.forEach(function (x, k) {
      ol.appendChild(el("li", { "class": profil && x.pseudo === profil.pseudo ? "moi" : null }, [el("span", { "class": "rang", text: String(k + 1) }), el("span", { "class": "qui", text: x.pseudo }), el("span", { "class": "meta", text: x.justes + "/" + x.n + " · " + pts(x.points) })]));
    });
    return ol;
  }
  function vueDuel(id) {
    montrer(attente("Le Rival ouvre le duel…", true), null, "Duel");
    pretCompte().then(function () { return api("GET", "duel?id=" + encodeURIComponent(id)); }).then(function (j) {
      var duel = j.duel;
      var dejaJoue = !!duel.dejaJoue;
      var lancer = el("button", { "class": "btn", type: "button", text: "Relever le duel (" + pluriel((duel.questions || []).length, "question", "questions") + ")" });
      lancer.addEventListener("click", function () {
        lancer.disabled = true;
        resoudre(duel.questions || []).then(function (items) {
          jouer(items, { titre: "Duel", fin: function (res, zone) {
            var info = el("p", { "class": "meta", role: "status", text: "Enregistrement de ton score…" });
            zone.appendChild(info);
            api("PUT", "duel", { id: duel.id, score: { justes: res.justes, n: res.n, points: res.points } }).then(function () { return api("GET", "duel?id=" + encodeURIComponent(duel.id)); }).then(function (j2) {
              info.textContent = "";
              zone.appendChild(el("section", { "class": "carte" }, [el("h2", { text: "Tableau du duel" }), tableauDuel(j2.duel)]));
              zone.appendChild(lien("#/jouer", "Retour aux jeux", "btn trait"));
            }, function (e) { info.textContent = messageErreur(e); });
          } });
        });
      });
      montrer(el("div", { "class": "page sans-nav" }, [retour("#/jouer", "Jouer"),
        el("div", { style: "display:grid;gap:4px" }, [el("span", { "class": "lib", text: "Duel" }), el("h1", { text: profil && duel.createur === profil.pseudo ? "Ton duel" : duel.createur + " te lance un duel" })]),
        marge("malin", taquin() ? "Mêmes questions, même barème. Que le meilleur gagne, et que l’autre révise." : "Mêmes questions pour tous les joueurs du duel."),
        dejaJoue ? el("p", { "class": "astuce" }, [icone("juste"), el("span", { text: "Tu as déjà joué ce duel." })]) : (enLigne() ? lancer : el("p", { "class": "alerte", text: "Les duels demandent la base en ligne. Réessaie dans un moment." })),
        el("section", { "class": "carte" }, [el("h2", { text: "Tableau du duel" }), tableauDuel(duel)])
      ]), null, "Duel");
    }, function (e) { montrer(erreurPage(e.statut === 404 ? "Ce duel n’existe pas." : messageErreur(e), "Duel indisponible"), "jouer"); });
  }
  function vueJouer() {
    var classement = el("div", { "class": "pile" }, [el("p", { "class": "attente", text: "Le Rival consulte le registre…" })]);
    var mesDuels = el("div", { "class": "pile" });
    var info = el("p", { "class": "meta", role: "status" });
    var inviter = el("button", { "class": "lien", type: "button" }, [icone("cercle"), "Inviter un ami dans Koîos"]);
    inviter.addEventListener("click", function () { partager("Koîos", "Un puits de science avec un Rival qui corrige en marge. Viens me défier.", location.origin + "/", function (t) { info.textContent = t; }); });
    montrer(el("div", { "class": "page" }, [entete(),
      el("h1", { text: "Jouer" }),
      carteJour(),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "Quiz éclair" }), el("span", { "class": "meta", text: "10 questions" })]),
        el("p", { "class": "chapeau-petit", text: "Tout dans un seul bol" + N + ": questions mélangées de tous les chapitres, vérifiés et explorés." }), lien("#/jeu/eclair", "Lancer un quiz éclair", "btn")]),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "Duel entre amis" }), el("span", { "class": "meta", text: "Mêmes questions" })]),
        el("p", { "class": "chapeau-petit", text: "Joue dix questions, puis envoie le duel" + N + ": tes amis répondent aux mêmes, le tableau les départage." }), lien("#/jeu/duel", "Lancer un duel", "btn trait"), mesDuels]),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "Classement du cercle" }), el("span", { "class": "meta", text: "Points cumulés" })]), classement, inviter, info])
    ]), "jouer", "Jouer");
    pretServeur.then(function () {
      if (!serveur.base) { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Le classement s’affiche dès que la base en ligne répond." })); return; }
      api("GET", "cercle").then(function (j) {
        classement.innerHTML = "";
        var ol = el("ol", { "class": "classement" });
        (j.joueurs || []).forEach(function (x, k) { ol.appendChild(el("li", { "class": profil && x.pseudo === profil.pseudo ? "moi" : null }, [el("span", { "class": "rang", text: String(k + 1) }), el("span", { "class": "qui", text: x.pseudo }), el("span", { "class": "meta", text: x.points + " pts · " + pluriel(x.valides, "chapitre", "chapitres") })])); });
        classement.appendChild((j.joueurs || []).length ? ol : el("p", { "class": "meta", text: "Personne n’a encore validé de chapitre." }));
      }, function () { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Classement indisponible pour l’instant." })); });
      if (enLigne()) api("GET", "duels").then(function (j) {
        var l = j.duels || [];
        if (!l.length) return;
        var ul = el("ul", { "class": "lignes" });
        l.slice(0, 5).forEach(function (d) { var moi = (d.scores || []).filter(function (x) { return x.pseudo === profil.pseudo; })[0]; ul.appendChild(el("li", {}, [icone("epee"), el("span", {}, [el("b", { text: "Duel de " + d.createur }), el("br"), el("span", { "class": "meta", text: pluriel((d.scores || []).length, "joueur", "joueurs") + (moi ? " · toi" + N + ": " + moi.justes + "/" + moi.n : "") })]), lien("#/duel/" + d.id, "Voir")])); });
        mesDuels.appendChild(el("span", { "class": "lib", text: "Tes duels" }));
        mesDuels.appendChild(ul);
        if (window.poserIcones) window.poserIcones(mesDuels);
      }, function () {});
    });
  }

  /* ---------- Révisions ---------- */
  function vueRevisions() {
    var items = aReviser();
    var contenu;
    if (items.length) { contenu = el("ul", { "class": "lignes" }); items.forEach(function (it) { contenu.appendChild(ligneRevision(it)); }); }
    else contenu = el("p", { "class": "meta", text: "Rien à réviser pour l’instant. Tes erreurs arrivent ici après chaque bilan." });
    montrer(el("div", { "class": "page" }, [entete(),
      el("h1", { text: "Révisions" }),
      marge(taquin() ? "malin" : "explique", taquin() ? (items.length ? "Tes erreurs, rangées par chapitre. Je les garde au chaud." : "Aucune erreur en réserve. Pour l’instant.") : "Chaque erreur d’un bilan arrive ici, avec la fiche surlignée."),
      el("section", { "class": "carte" }, [el("div", { "class": "titre-sec" }, [el("h2", { text: "À revoir" }), el("span", { "class": "meta", text: pluriel(items.length, "point", "points") })]), contenu]),
      el("section", { "class": "carte" }, [el("h2", { text: "S’entraîner" }), el("p", { "class": "chapeau-petit", text: "Un quiz éclair mélange des questions de tous les chapitres." }), lien("#/jeu/eclair", "Lancer un quiz éclair", "btn trait")])
    ]), "revisions", "Révisions");
  }

  /* ---------- Profil ---------- */
  function vueProfil() {
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", value: profil.pseudo });
    champ.addEventListener("change", function () {
      var p = champ.value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24);
      if (!p) { champ.value = profil.pseudo; return; }
      profil.pseudo = p; S.ecrire("koios.profil", profil); pousser(); toast("Nom de lecteur enregistré.");
    });
    var choix = choixTon(profil.ton || "taquin", function (t) { profil.ton = t; S.ecrire("koios.profil", profil); pousser(); });
    var sync = el("p", { "class": "etat-sync" });
    var cleZone = el("div", { "class": "pile" });
    function majSync() {
      sync.innerHTML = "";
      var ok = enLigne();
      sync.className = "etat-sync" + (ok ? "" : " hors");
      sync.appendChild(icone(ok ? "verifie" : "signet"));
      sync.appendChild(el("span", { text: ok ? "Progression enregistrée en ligne." : "Progression enregistrée sur cet appareil seulement, pour l’instant." }));
      cleZone.innerHTML = "";
      if (ok) {
        var montre = el("button", { "class": "btn trait", type: "button", text: "Afficher ma clé de lecteur" });
        montre.addEventListener("click", function () {
          var cle = profil.id + "." + profil.cle;
          var copier = el("button", { "class": "lien", type: "button", text: "Copier la clé" });
          copier.addEventListener("click", function () { try { navigator.clipboard.writeText(cle).then(function () { toast("Clé copiée. Garde‑la pour toi."); }, function () { toast("Sélectionne la clé pour la copier."); }); } catch (e) { toast("Sélectionne la clé pour la copier."); } });
          montre.replaceWith(el("div", { "class": "pile" }, [el("p", { "class": "cle-lecteur", text: cle }), copier, el("p", { "class": "meta", text: "Cette clé ouvre ta progression. Ne la partage pas." })]));
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
        el("div", {}, [el("span", { "class": "lib", text: "Vitraux" }), el("strong", { text: totalValides() + "/" + totalChapitres() }), el("span", { "class": "meta", text: "chapitres vérifiés validés" })]),
        el("div", {}, [el("span", { "class": "lib", text: "Explorations" }), el("strong", { text: String(explorations()) }), el("span", { "class": "meta", text: "chapitres explorés validés" })]),
        el("div", {}, [el("span", { "class": "lib", text: "Points" }), el("strong", { text: String(totalPoints()) }), el("span", { "class": "meta", text: "meilleurs scores cumulés" })]),
        el("div", {}, [el("span", { "class": "lib", text: "Série" }), el("strong", { text: String(serieJours()) }), el("span", { "class": "meta", text: (serieJours() > 1 ? "jours" : "jour") + " de question du jour d’affilée" })])
      ]),
      el("section", { "class": "carte" }, [el("h2", { text: "Réglages" }), el("label", { "for": "pseudo", "class": "lib", text: "Nom de lecteur" }), champ, el("span", { "class": "lib", text: "Le ton du Rival" }), choix]),
      el("section", { "class": "carte" }, [el("h2", { text: "Ta progression" }), sync, cleZone]),
      el("p", { "class": "credit", text: "Koîos v1.1 · bibliothèque vérifiée par au moins deux sources · explorations rédigées par l’IA à partir de Wikipédia · icônes Phosphor (licence MIT)" })
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
        case "defi": return vueDefi(p);
        case "explorer": return vueExplorer();
        case "sujet": return vueSujet(p.slice(1).join("/"));
        case "ia": return vueChapitreIA(p[1], parseInt(p[2], 10) || 1, p[3]);
        case "jouer": case "cercle": return vueJouer();
        case "jeu": return p[1] === "jour" ? vueJour() : vueEclair(p[1] === "duel");
        case "duel": return vueDuel(p[1]);
        case "revisions": return vueRevisions();
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
