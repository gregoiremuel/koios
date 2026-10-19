/* Koîos v2 : apprendre n'importe quel sujet, palier par palier. Blanc et net, une seule page, sans étape de construction.
   Vues : accueil (première visite), maison, parcours (paliers, quiz, défis), palier (leçon), quiz, mini-jeux, duel, jouer, profil. */
(function () {
  "use strict";
  var F = " ", N = " ";
  var SUGGESTIONS = ["La Vendée", "Les volcans", "Le cinéma de Kubrick", "La philosophie stoïcienne", "Les fonds marins"];
  var XP = { palier: 10, verif: 5, quiz: 5, defi: 10, jeu: 2 };
  var LIMITES = { formations: 10, lecons: 30 }; // par jour et par personne : voir functions/api/parcours.js et palier.js

  /* ---------- Mémoire locale ---------- */
  var S = {
    lire: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mémoire seule */ } }
  };
  var profil = S.lire("koios.profil", null);
  var etat = S.lire("koios.etat", null);
  if (!etat || etat.version !== 2) etat = { version: 2, xp: 0, parcours: {}, erreurs: [], jours: (etat && etat.jours) || {}, maj: 0 };
  ["parcours", "jours"].forEach(function (k) { if (!etat[k]) etat[k] = {}; });
  if (!etat.erreurs) etat.erreurs = [];
  if (!etat.reussies) etat.reussies = {};
  var serveur = { base: false, ia: false };
  var apresAccueil = null;

  /* ---------- Outils ---------- */
  var app = document.getElementById("app"), nav = document.getElementById("nav"), toastEl = document.getElementById("toast");
  function el(tag, attrs, enfants) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") n.textContent = v; else if (k === "html") n.innerHTML = v; else n.setAttribute(k, v);
    });
    (enfants || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function icone(nom, alt) {
    var s = el("span", { "class": "ic", html: window.ico ? window.ico(nom, "i") : "" });
    if (alt) { s.setAttribute("role", "img"); s.setAttribute("aria-label", alt); } else s.setAttribute("aria-hidden", "true");
    return s;
  }
  function guill(t) { return "«" + N + t + F + "»"; }
  function pluriel(n, un, plusieurs) { return n + " " + (n > 1 ? plusieurs : un); }
  function jour(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function aujourdhui() { return jour(new Date()); }
  function hasard(graine) { var a = graine >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function melanger(l, alea) { l = l.slice(); alea = alea || Math.random; for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(alea() * (i + 1)); var x = l[i]; l[i] = l[j]; l[j] = x; } return l; }
  function normaliser(t) { return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, " ").replace(/^(l |la |le |les )/, "").replace(/\s+/g, " ").trim(); }
  var minuterieToast;
  function toast(t) { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(minuterieToast); minuterieToast = setTimeout(function () { toastEl.hidden = true; }, 3000); }
  function lien(href, texte, cls) { return el("a", { "class": cls || "lien", href: href, text: texte }); }
  function typo(t) { return String(t || "").replace(/ :/g, N + ":"); }
  function lienExt(href, texte) { return el("a", { href: href, target: "_blank", rel: "noopener", text: texte }); }
  /* Crédit d'une photo. Unsplash exige un lien vers le photographe et un lien vers Unsplash ; les autres sources, un lien vers la page du fichier. */
  function legende(img) {
    if (!img || !img.credit) return null;
    if (img.source === "unsplash" && img.auteur && img.lienAuteur && img.lienSource) return el("figcaption", {}, ["Photo" + N + ": ", lienExt(img.lienAuteur, img.auteur), " sur ", lienExt(img.lienSource, "Unsplash")]);
    return el("figcaption", {}, [img.lien ? lienExt(img.lien, typo(img.credit)) : typo(img.credit)]);
  }
  /* Photo avec son crédit ; cls = « couverture » (16:9) ou « lecon-img » (3:2) ; alt = le sujet. Elle disparaît si elle ne charge pas. */
  function photo(img, cls, alt) {
    if (!img || !img.src) return null;
    var i = el("img", { src: img.src, alt: alt || "", loading: "lazy", decoding: "async" });
    var f = el("figure", { "class": "photo " + cls }, [i, legende(img)]);
    i.addEventListener("error", function () { var parent = f.parentNode; f.remove(); if (parent && parent.classList.contains("emplacement") && !parent.children.length) parent.hidden = true; });
    return f;
  }
  /* Photos trouvées par /api/image (« auto », « commons » ou « unsplash »), gardées en mémoire pour la session ; null si rien ne vient. */
  var imagesMem = {};
  function trouverImage(requete, source) {
    var q = String(requete || "").replace(/\s+/g, " ").trim().slice(0, 80), k = source + ":" + q.toLowerCase();
    if (q.length < 2) return Promise.resolve(null);
    if (!imagesMem[k]) {
      imagesMem[k] = pretServeur.then(function () { return serveur.base ? api("GET", "image?q=" + encodeURIComponent(q) + "&source=" + source, null, 14000) : null; })
        .then(function (j) { return j && j.image && j.image.src ? j.image : null; }, function () { delete imagesMem[k]; return null; });
    }
    return imagesMem[k];
  }
  /* Catégorie d'un sujet, d'après son titre (sans accents ni casse) : le nom de l'icône. Premier motif qui correspond ; « livre » sinon. */
  var CATEGORIES = [
    ["diamant", /\b(gemm|joaill|bijou|pierre|mineral|diamant|rubis|saphir|emeraude|corindon|beryl|orfevr|cristal|lapidaire)/],
    ["musique", /\b(musi|opera|symphon|chanson|compositeur|orchestre|piano|guitar|concert|jazz\b|rap\b|rock\b|beethoven|mozart|bach\b|ravel|debussy|bolero)/],
    ["clap", /\b(cinema|film|realisat|acteur|actrice|hollywood|kubrick|hitchcock|scenari)/],
    ["litterature", /\b(litterature|poesie|poeme|poete|roman\b|romans\b|romancier|ecrivain|theatre|moliere|hugo\b|conte\b|contes\b|nouvelle\b|bibliotheque|auteur|fable)/],
    ["cerveau", /\b(philosoph|stoic|ethique|morale|metaphysi|logique|existential|platon|socrate|aristote|nietzsche|psycholog|cognitiv|pensee|conscience)/],
    ["pinceau", /\b(arts?\b|peintur|peintre|architectur|sculpt|cathedral|gothi|impressionn|musee|dessin|photograph|design\b|baroque|renaissance)/],
    ["ballon", /\b(sport|football|foot\b|tennis|rugby|olympi|cyclisme|tour de france|basket|natation|marathon|athletisme|judo|ski\b|formule 1|handball|golf\b|boxe)/],
    ["marmite", /\b(cuisine|gastronom|recette|vins?\b|fromage|patisserie|boulang|chef\b|cafe\b|chocolat|aliment|culinaire)/],
    ["puce", /\b(technolog|informatique|ordinateur|internet|logiciel|programm|numerique|intelligence artificielle|robot|algorithm|cyber|blockchain|electronique|smartphone|web\b)/],
    ["courbe", /\b(econom|finance|bourse|entreprise|monnaie|banque|inflation|commerce|capitalis|invest|fiscal|comptab|marketing)/],
    ["langues", /\b(langue|langage|linguistique|grammaire|vocabulaire|anglais|espagnol|allemand|italien|latin\b|etymolog|alphabet|traduction|orthographe|dialecte)/],
    ["atome", /\b(science|physique|chimie|biologie|mathematique|maths?\b|astronom|astrophys|systeme solaire|planete|etoile|adn\b|genetique|medecine|quantique|atome|cellule|energie|geologie|evolution|cosmos|galaxie|neurone|virus|bacterie)/],
    ["histoire", /\b(histoire|antiquite|moyen age|medieval|revolution|empire|guerre|dynastie|royaume|civilisation|archeolog|siecle|pharaon|egypte|rom(e|ain)|grece|grec\b|grecque|athen|sparte|napoleon|gaule|croisade|colonis|prehistoire|monarchie|republique)/],
    ["montagne", /\b(montagne|volcan|alpes?\b|himalaya|everest|sommet|mont blanc|glacier|massif)/],
    ["feuille", /\b(nature|animal|animaux|oiseau|insecte|plante|foret|arbre|ocean|mer\b|marin|riviere|ecolog|climat|biodiversite|faune|flore|espece|desert|jungle|savane|reptile|poisson|mammifere|ecosysteme)/],
    ["carte", /\b(region|departement|ville\b|villes\b|village|quartier|vendee|provence|bretagne|normandie|alsace|corse|paris\b|lyon\b|marseille|bordeaux|toulouse|nantes|lille|strasbourg)/],
    ["globe", /\b(geograph|pays\b|continent|capitale|europe|afrique|asie\b|amerique|oceanie|france\b|monde\b|ile\b|iles\b|fleuve|frontiere|territoire|tourisme|voyage)/]
  ];
  function categorie(titre) {
    var t = sansAccent(titre);
    for (var k = 0; k < CATEGORIES.length; k++) if (CATEGORIES[k][1].test(t)) return CATEGORIES[k][0];
    return "livre";
  }
  /* Tuile d'icône (48 px) : catégorie d'un sujet, ou rôle d'une rangée. */
  function tuile(nom) { return el("span", { "class": "tuile", "aria-hidden": "true" }, [icone(nom)]); }
  /* Vignette d'une liste : photo (48 px, décorative) si l'image est connue, sinon la tuile de la catégorie du sujet. */
  function vignette(img, titre) {
    var t = tuile(categorie(titre));
    if (!(img && img.src)) return t;
    var i = el("img", { "class": "vignette", src: img.src, alt: "", loading: "lazy", decoding: "async" });
    i.addEventListener("error", function () { i.replaceWith(tuile(categorie(titre))); });
    return i;
  }
  var LOGO = "<svg viewBox='0 0 64 64' width='24' height='24' aria-hidden='true' focusable='false'><rect width='64' height='64' rx='14' style='fill:var(--encre)'/><text x='32' y='44' text-anchor='middle' font-weight='700' font-size='36' style='fill:#fff;font-family:var(--ui)'>K</text><rect x='20' y='49' width='24' height='3' rx='1.5' style='fill:var(--or)'/></svg>";
  function marque(sansLien) { var contenu = [el("span", { "class": "logo", html: LOGO }), "Koîos"]; return sansLien ? el("span", { "class": "marque" }, contenu) : el("a", { "class": "marque", href: "#/" }, contenu); }
  /* Bouton ou lien qui fait avancer : flèche à droite. */
  function lienAvance(href, texte, cls) { return el("a", { "class": cls || "btn", href: href }, [el("span", { text: texte }), icone("fleche")]); }
  /* État vide : icône de 32 px, une phrase, un bouton utile. */
  function etatVide(nomIcone, texte, action) { return el("div", { "class": "vide" }, [icone(nomIcone), el("p", { text: texte }), action]); }
  function partager(titre, texte, url, repli) {
    if (navigator.share) { navigator.share({ title: titre, text: texte, url: url }).catch(function () {}); return; }
    var echec = function () { repli("Copie impossible ici. Lien" + N + ": " + url); };
    try { navigator.clipboard.writeText(url).then(function () { repli("Lien copié" + N + ": colle‑le dans un message."); }, echec); } catch (e) { echec(); }
  }

  /* ---------- Réseau et synchronisation ---------- */
  function api(methode, chemin, corps, delai, cle) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, delai || 8000) : null;
    var h = { "Content-Type": "application/json" };
    var c = cle || (profil && profil.id ? profil.id + "." + profil.cle : null);
    if (c) h.Authorization = "Bearer " + c;
    return fetch("/api/" + chemin, { method: methode, headers: h, body: corps ? JSON.stringify(corps) : undefined, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { clearTimeout(t); if (!r.ok) { var e = new Error(j.erreur || ("Erreur " + r.status)); e.statut = r.status; throw e; } return j; }); },
        function () { clearTimeout(t); var x = new Error("hors ligne"); x.statut = 0; throw x; });
  }
  function messageErreur(e, quota) {
    if (e.statut === 429) return quota || "Limite du jour atteinte. Réessaie demain.";
    if (e.statut === 503) return "Ce service en ligne n’est pas encore branché.";
    if (e.statut === 0) return "Pas de réponse du serveur. Vérifie ta connexion.";
    return e.message || "Une erreur est survenue.";
  }
  function enLigne() { return serveur.base && profil && profil.id; }
  var minuterieSync;
  function sauver() { etat.maj = Date.now(); S.ecrire("koios.etat", etat); pousser(); }
  function pousser() {
    if (!enLigne()) return;
    clearTimeout(minuterieSync);
    minuterieSync = setTimeout(function () {
      api("PUT", "progression", { pseudo: profil.pseudo, ton: "sobre", etat: etat }).catch(function (e) { if (e.statut === 413 && !pousser.prevenu) { pousser.prevenu = true; toast("Synchronisation impossible" + N + ": progression trop volumineuse. Elle reste sur cet appareil."); } });
    }, 700);
  }
  function fusion(a, b) {
    if (!b || b.version !== 2) return a;
    var r = { version: 2, xp: Math.max(a.xp || 0, b.xp || 0), parcours: {}, erreurs: [], jours: {}, maj: Math.max(a.maj || 0, b.maj || 0) };
    Object.keys(a.parcours).concat(Object.keys(b.parcours || {})).forEach(function (id) {
      var x = a.parcours[id], y = (b.parcours || {})[id];
      if (!x || !y) { r.parcours[id] = x || y; return; }
      var q = {}; [x.quiz || {}, y.quiz || {}].forEach(function (o) { Object.keys(o).forEach(function (k) { q[k] = Math.max(q[k] || 0, o[k]); }); });
      r.parcours[id] = { titre: x.titre || y.titre, image: x.image || y.image, fait: Math.max(x.fait || 0, y.fait || 0), xp: Math.max(x.xp || 0, y.xp || 0), quiz: q, jeux: Object.assign({}, x.jeux || {}, y.jeux || {}), total: x.total || y.total, date: (x.date || "") > (y.date || "") ? x.date : y.date };
    });
    var vus = {};
    (a.erreurs || []).concat(b.erreurs || []).forEach(function (e) { var k = e.palier + "#" + e.index; if (!vus[k]) { vus[k] = 1; r.erreurs.push(e); } });
    r.erreurs = r.erreurs.slice(-100);
    r.reussies = {}; [a.reussies || {}, b.reussies || {}].forEach(function (o) { Object.keys(o).forEach(function (k) { r.reussies[k] = 1; }); });
    [a.jours, b.jours || {}].forEach(function (j) { Object.keys(j).forEach(function (d) { r.jours[d] = r.jours[d] || j[d]; }); });
    return r;
  }
  var creation = null;
  function creerJoueur() {
    if (!serveur.base || !profil || profil.id) return Promise.resolve();
    if (!creation) creation = api("POST", "joueur", { pseudo: profil.pseudo }).then(function (j) { profil.id = j.id; profil.cle = j.cle; S.ecrire("koios.profil", profil); pousser(); }, function () { creation = null; });
    return creation;
  }
  function synchroniser() {
    if (!profil) return Promise.resolve();
    if (!profil.id) return creerJoueur();
    return api("GET", "progression").then(function (j) { etat = fusion(etat, j.etat); S.ecrire("koios.etat", etat); pousser(); }, function () {});
  }
  var pretServeur = api("GET", "etat", null, 5000).then(function (j) { serveur.base = !!j.base; serveur.ia = !!j.ia; }, function () {});
  function pretCompte() { return pretServeur.then(function () { return creerJoueur(); }); }

  /* ---------- Mouvement : fin, rapide, coupé si l'appareil demande moins d'animations ---------- */
  var reduit = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function mouvementReduit() { return !!(reduit && reduit.matches); }
  /* Coche qui se dessine (trait qui se trace) ; avecCercle : dans un cercle ; alt : lue par les lecteurs d'écran, sinon décorative. */
  function coche(avecCercle, alt) {
    var c = el("span", { "class": "coche" + (avecCercle ? " ronde" : ""), html: "<svg viewBox='0 0 24 24' focusable='false' aria-hidden='true'>" + (avecCercle ? "<circle cx='12' cy='12' r='10.5' pathLength='1'/>" : "") + "<path d='M6.5 12.5l3.8 3.8 7.2-8' pathLength='1'/></svg>" });
    if (alt) { c.setAttribute("role", "img"); c.setAttribute("aria-label", alt); } else c.setAttribute("aria-hidden", "true");
    return c;
  }

  /* ---------- XP et niveaux ---------- */
  function seuil(n) { return 100 * n + 25 * n * (n - 1); } // XP pour atteindre le niveau n + 1
  function niveau(xp) { var n = 0; while (xp >= seuil(n + 1)) n += 1; return { niveau: n + 1, base: seuil(n), suivant: seuil(n + 1) }; }
  function suivi(id) { return etat.parcours[id] || { fait: 0, xp: 0, quiz: {} }; }
  /* La pastille d'XP compte jusqu'à la nouvelle valeur (250 ms) et pulse une fois en or. */
  function majPuce(c) {
    var n = niveau(etat.xp || 0);
    c.setAttribute("aria-label", "Niveau " + n.niveau + ", " + (etat.xp || 0) + " XP");
    c.replaceChildren(icone("diplome"), el("span", { "aria-hidden": "true" }, ["Niv. " + n.niveau + " · ", el("span", { "class": "xp-val", text: String(etat.xp || 0) }), N + "XP"]));
  }
  function compterXP(c, avant) {
    var apres = etat.xp || 0, val = c.querySelector(".xp-val");
    if (!val || mouvementReduit() || !(avant < apres)) { majPuce(c); return; }
    c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse");
    var t0 = null;
    function pas(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / 250);
      val.textContent = String(Math.round(avant + (apres - avant) * k));
      if (k < 1) requestAnimationFrame(pas); else majPuce(c);
    }
    val.textContent = String(avant);
    requestAnimationFrame(pas);
  }
  function gagner(n, id) {
    if (n <= 0) return;
    var avant = etat.xp || 0;
    etat.xp = avant + n;
    if (id) { var s = suivi(id); s.xp = (s.xp || 0) + n; s.date = new Date().toISOString(); etat.parcours[id] = s; }
    sauver();
    Array.prototype.forEach.call(document.querySelectorAll(".xp"), function (c) { compterXP(c, avant); });
  }
  function noterErreur(it) {
    if (!it || !it.palier) return;
    var k = it.palier + "#" + it.index;
    if (!etat.erreurs.some(function (e) { return e.palier + "#" + e.index === k; })) etat.erreurs.push({ palier: it.palier, index: it.index, titre: it.titre });
    etat.erreurs = etat.erreurs.slice(-100);
  }
  function premiereReussite(it) { // l'XP d'une question ne se gagne qu'une fois
    var k = it.palier + "#" + it.index;
    if (etat.reussies[k]) return false;
    etat.reussies[k] = 1;
    var cles = Object.keys(etat.reussies);
    if (cles.length > 3000) delete etat.reussies[cles[0]];
    return true;
  }
  function oublierErreur(it) { var k = it.palier + "#" + it.index; etat.erreurs = etat.erreurs.filter(function (e) { return e.palier + "#" + e.index !== k; }); }

  /* ---------- Contenu ---------- */
  var cache = {};
  function charger(cle, fn) { if (!cache[cle]) cache[cle] = fn().catch(function (e) { delete cache[cle]; throw e; }); return cache[cle]; }
  function fichier(chemin) { return fetch(chemin).then(function (r) { if (!r.ok) { var e = new Error("introuvable"); e.statut = r.status; throw e; } return r.json(); }); }
  function verifie(id) { return /^v-[a-z]{2}$/.test(id || ""); }
  function chargerListeVerifies() { return charger("liste", function () { return fichier("contenu/parcours.json").then(function (j) { return j.parcours || []; }); }); }
  function chargerParcours(id) {
    return charger("p:" + id, function () {
      if (verifie(id)) return fichier("contenu/parcours/" + id + ".json");
      return pretServeur.then(function () { return api("GET", "parcours?id=" + encodeURIComponent(id)); }).then(function (j) { return j.parcours; });
    });
  }
  function chargerPalier(id, n) {
    return charger("l:" + id + ":" + n, function () {
      if (verifie(id)) return fichier("contenu/paliers/" + id + "-" + n + ".json");
      return pretCompte().then(function () { return api("GET", "palier?parcours=" + encodeURIComponent(id) + "&n=" + n, null, 100000); }).then(function (j) { return j.palier; });
    });
  }
  function chargerQuestionsVerifiees() { return charger("questions", function () { return fichier("contenu/questions.json"); }); }
  function paliersPrevus(p) { return (p.etapes || []).reduce(function (s, e) { return s + (e.paliers || []).length; }, 0); }
  function titrePalier(p, n) { var t = null; (p.etapes || []).forEach(function (e) { (e.paliers || []).forEach(function (x) { if (x.numero === n) t = x.titre; }); }); return t; }
  /* Formation par niveaux : p.programme (niveaux, modules) ; p.etapes = modules déjà ouverts (étape n = module n). */
  function parProgramme(p) { return !!(p.programme && p.programme.niveaux); }
  function formationComplete(p) { return parProgramme(p) && (p.etapes || []).length >= (p.modulesTotal || 0); } // tous les modules sont ouverts
  function fini(p) { return (p.verifie || formationComplete(p)) && suivi(p.id).fait >= paliersPrevus(p); }
  function retenir(p) { var s = suivi(p.id); s.titre = p.titre; s.image = p.image || s.image || null; if (p.verifie || formationComplete(p)) s.total = paliersPrevus(p); etat.parcours[p.id] = s; }
  function modulesFaits(p, fait) { return (p.etapes || []).filter(function (e) { var l = e.paliers || []; return l.length && l[l.length - 1].numero <= fait; }).length; }
  function creerParcours(titre, bouton, alerte, statut) {
    titre = String(titre || "").trim();
    alerte.hidden = true;
    if (titre.length < 2) { alerte.textContent = "Écris d’abord un sujet."; alerte.hidden = false; return; }
    chargerListeVerifies().then(function (l) {
      var v = l.filter(function (x) { return normaliser(x.titre) === normaliser(titre); })[0];
      if (v) { location.hash = "#/p/" + v.id; return; }
      var texte = bouton.textContent;
      bouton.disabled = true; bouton.textContent = "Préparation du parcours…";
      if (statut) { statut.textContent = "Préparation de " + guill(titre) + "… La première fois, compte jusqu’à une minute."; statut.hidden = false; }
      pretCompte().then(function () {
        if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
        return api("POST", "parcours", { titre: titre }, 100000);
      }).then(function (j) {
        cache["p:" + j.parcours.id] = Promise.resolve(j.parcours);
        location.hash = "#/p/" + encodeURIComponent(j.parcours.id);
      }, function (e) {
        bouton.disabled = false; bouton.textContent = texte;
        if (statut) statut.hidden = true;
        alerte.textContent = messageErreur(e, "Limite du jour" + N + ": 10 nouveaux sujets par personne. Les sujets déjà ouverts restent disponibles.");
        alerte.hidden = false;
      });
    });
  }

  /* ---------- Mise en page ---------- */
  function montrer(page, onglet, titre) {
    app.innerHTML = ""; app.appendChild(page);
    document.title = titre ? titre + " · Koîos" : "Koîos";
    nav.hidden = !onglet;
    nav.querySelectorAll("a").forEach(function (a) { if (a.dataset.onglet === onglet) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    window.scrollTo(0, 0);
    if (window.poserIcones) window.poserIcones(page);
    var h = page.querySelector("h1");
    if (h && montrer.deja) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    montrer.deja = true;
  }
  function puceXP() { var c = el("a", { "class": "xp", href: "#/profil" }); majPuce(c); return c; }
  function entete() { return el("header", { "class": "haut" }, [marque(), puceXP()]); }
  function attente(texte, plein) { return el("div", { "class": "page" + (plein ? " plein" : "") }, [entete(), el("p", { "class": "attente", role: "status", text: texte })]); }
  function erreurPage(texte, titre) { return el("div", { "class": "page" }, [entete(), el("div", { "class": "carte" }, [el("h1", { text: titre || "Page introuvable" }), el("p", { text: texte }), lien("#/", "Retour à l’accueil", "btn")])]); }
  function badge(v) {
    if (!v) return null;
    if (v.statut === "verifie") return el("span", { "class": "badge verifie" }, [icone("verifie"), "Vérifié"]);
    if (v.statut === "recoupe") return el("span", { "class": "badge recoupe" }, [icone("liste"), "Recoupé automatiquement"]);
    return el("span", { "class": "badge partiel" }, [icone("liste"), "Recoupé en partie"]);
  }

  /* ---------- Photos d'accueil : idées de formations, mosaïque, crédits ---------- */
  /* [sujet de la formation, requête de photo en anglais] : une idée par grand domaine. */
  var IDEES = [
    ["La Rome antique", "Roman Forum"], ["Les fonds marins", "Coral reef"], ["Le cinéma de Kubrick", "Movie camera"],
    ["L’histoire du jazz", "Saxophone"], ["Les pierres précieuses", "Cut gemstones"], ["La philosophie stoïcienne", "Marcus Aurelius"]
  ];
  /* Cadre photo : fond clair avec l'icône de catégorie ; la photo se pose par-dessus quand elle arrive (et son crédit est noté). */
  function cadrePhoto(sujet, cls) { return el("span", { "class": "cadre" + (cls ? " " + cls : ""), "aria-hidden": "true" }, [icone(categorie(sujet))]); }
  function poserDansCadre(cadre, im, sujet, credits) {
    var i = el("img", { src: im.src, alt: "", loading: "lazy", decoding: "async" });
    i.addEventListener("error", function () { i.remove(); });
    if (credits) i.addEventListener("load", function () { credits.noter(im, sujet); });
    cadre.appendChild(i);
  }
  function photoDansCadre(cadre, requete, sujet, credits, apres) {
    trouverImage(requete, "auto").then(function (im) { if (im) { poserDansCadre(cadre, im, sujet, credits); if (apres) apres(im); } });
  }
  /* « Crédits des photos » : une ligne par photo affichée sur la page (auteur, licence, lien), sans charger les tuiles de texte. */
  function blocCredits() {
    var liste = el("ul", { "class": "credits-liste" }), vus = {};
    var noeud = el("details", { "class": "credits", hidden: "" }, [el("summary", { text: "Crédits des photos" }), liste]);
    return { noeud: noeud, noter: function (im, sujet) {
      if (!im || !im.credit || vus[im.src]) return;
      vus[im.src] = 1;
      var c = legende(im), li = el("li", {}, [sujet ? sujet + N + ": " : null]);
      while (c.firstChild) li.appendChild(c.firstChild);
      liste.appendChild(li); noeud.hidden = false;
    } };
  }
  function mosaique(credits) {
    var m = el("div", { "class": "mosaique", "aria-hidden": "true" });
    IDEES.slice(0, 4).forEach(function (idee, k) { var c = cadrePhoto(idee[0], "m" + (k + 1)); m.appendChild(c); photoDansCadre(c, idee[1], idee[0], credits); });
    return m;
  }

  /* ---------- Première visite ---------- */
  function vueAccueil() {
    var credits = blocCredits();
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", autocomplete: "nickname", placeholder: "Ton prénom ou un pseudo" });
    var alerte = el("p", { "class": "alerte", hidden: "" });
    var go = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Commencer" }), icone("fleche")]);
    go.addEventListener("click", function () {
      var p = champ.value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24);
      if (!p) { alerte.textContent = "Écris d’abord ton prénom ou un pseudo."; alerte.hidden = false; champ.focus(); return; }
      profil = { pseudo: p }; S.ecrire("koios.profil", profil);
      pretServeur.then(creerJoueur);
      var cible = apresAccueil && apresAccueil !== "#/accueil" ? apresAccueil : "#/";
      apresAccueil = null;
      if (location.hash === cible) route(); else location.hash = cible;
    });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    montrer(el("div", { "class": "page plein" }, [
      el("header", { "class": "haut" }, [marque(true)]),
      mosaique(credits),
      el("div", { "class": "pile" }, [el("h1", { text: "Apprends n’importe quel sujet, palier par palier." }),
        el("p", { "class": "meta", style: "font-size:17px", text: "Des leçons courtes et sourcées, des définitions, des frises et des chiffres. Tous les 5 paliers, un quiz ; ensuite des mini‑jeux et des duels entre amis." })]),
      el("div", { "class": "pile" }, [el("label", { "for": "pseudo", "class": "sur", text: "Ton nom" }), champ, go, alerte, lien("#/aide", "Comment ça marche", "lien discret")]),
      credits.noeud
    ]), null, "Commencer");
  }

  /* ---------- Maison ---------- */
  /* Recherche d'un sujet, puis « Idées de formations » en tuiles photo (4:3, titre dessous, icône de catégorie à côté). */
  function carteRecherche(credits) {
    var champ = el("input", { "class": "champ", id: "sujet", type: "search", maxlength: "80", autocomplete: "off", enterkeyhint: "go", placeholder: "Un sujet, une époque, une personne…" });
    var bouton = el("button", { "class": "btn petit", type: "button", text: "Apprendre" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    bouton.addEventListener("click", function () { creerParcours(champ.value, bouton, alerte); });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
    var recherche = el("section", { "class": "pile", "aria-labelledby": "titre-recherche" }, [el("h1", { id: "titre-recherche", text: "Que veux‑tu apprendre" + F + "?" }), el("div", { "class": "recherche" }, [champ, bouton]), alerte, lien("#/aide", "Comment ça marche", "lien discret")]);
    var alerteIdees = el("p", { "class": "alerte", hidden: "", role: "status" }), statutIdees = el("p", { "class": "meta", hidden: "", role: "status" });
    var grille = el("div", { "class": "idees" });
    IDEES.forEach(function (idee, i) {
      var cadre = cadrePhoto(idee[0], i < 2 ? "r21" : "r43");
      var b = el("button", { "class": "idee" + (i < 2 ? " grande" : ""), type: "button", style: "--i:" + i }, [cadre, el("span", { "class": "idee-titre" }, [icone(categorie(idee[0])), el("b", { text: idee[0] })])]);
      b.addEventListener("click", function () { champ.value = idee[0]; creerParcours(idee[0], bouton, alerteIdees, statutIdees); });
      grille.appendChild(b);
      photoDansCadre(cadre, idee[1], idee[0], credits);
    });
    var idees = el("section", { "class": "pile", "aria-labelledby": "titre-idees" }, [el("h2", { id: "titre-idees", text: "Idées de formations" }), grille, statutIdees, alerteIdees]);
    return { recherche: recherche, idees: idees };
  }
  function rangeeParcours(id, titre, img, detail, droite) {
    return el("li", {}, [el("a", { "class": "rangee", href: "#/p/" + encodeURIComponent(id) }, [vignette(img, titre), el("span", {}, [el("b", { text: titre }), el("span", { "class": "meta", text: detail })]), droite || icone("chevron")])]);
  }
  function quizEnAttente(s) { var k = Math.floor((s.fait || 0) / 5) * 5; return k > 0 && (s.quiz || {})[k] === undefined ? k : 0; }
  function prochainJalon(s) { var j = (Math.floor((s.fait || 0) / 5) + 1) * 5; return s.total && j > s.total ? 0 : j; }
  function termine(s) { return !!(s.total && s.fait >= s.total); }
  function detailSuivi(s) {
    if (!s.fait) return "Pas encore commencé";
    var q = quizEnAttente(s);
    if (q) return "Palier " + s.fait + " · " + (q % 10 === 0 ? "défi d’étape" : "quiz") + " disponible";
    if (termine(s)) return "Parcours terminé · " + pluriel(s.total, "palier", "paliers");
    var j = prochainJalon(s);
    if (!j) return "Palier " + s.fait + " sur " + s.total;
    return "Palier " + s.fait + " · " + (j % 10 === 0 ? "défi d’étape" : "quiz") + " dans " + pluriel(j - s.fait, "palier", "paliers");
  }
  function avanceJalon(s) { if (quizEnAttente(s) || termine(s)) return 100; return prochainJalon(s) ? ((s.fait || 0) % 5) / 5 * 100 : (s.fait || 0) / s.total * 100; }
  /* Bande pleine largeur (fond blanc, ou --surface en alternance) contenant une colonne de contenu. */
  function bande(enfants, alt) { return el("div", { "class": "bande" + (alt ? " alt" : "") }, [el("div", { "class": "colonne" }, enfants)]); }
  /* Carte d'un parcours vérifié dans le carrousel : photo, badge, nombre de leçons, progression. */
  function carteVerifiee(p, credits) {
    var s = suivi(p.id), cadre = cadrePhoto(p.titre, "r169");
    if (s.image && s.image.src) poserDansCadre(cadre, s.image, p.titre, credits);
    else if (p.motImage) photoDansCadre(cadre, p.motImage, p.titre, credits, function (im) { memoriserImage(p.id, im); });
    var pct = p.paliers ? Math.min(100, Math.round((s.fait || 0) / p.paliers * 100)) : 0;
    return el("li", {}, [el("a", { "class": "carte-v", href: "#/p/" + encodeURIComponent(p.id) }, [cadre, el("span", { "class": "carte-v-corps" }, [
      el("span", { "class": "badge verifie" }, [icone("verifie"), "Vérifié"]),
      el("b", { text: p.titre }),
      el("span", { "class": "meta", text: pluriel(p.paliers, "leçon", "leçons") + (s.fait ? " · " + s.fait + (s.fait > 1 ? " faites" : " faite") : "") }),
      el("span", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + pct + "%" })])])])]);
  }
  /* Accueil en grille « bento » : chaque tuile repose sur une donnée réelle de l’état du joueur (XP, jours joués, erreurs, glossaire, formation en cours). */
  var JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];
  function pctNiveau(n) { return Math.max(0, Math.min(100, Math.round(((etat.xp || 0) - n.base) / (n.suivant - n.base) * 100))); }
  function anneauHtml(pct, centre) {
    return "<svg viewBox='0 0 120 120' focusable='false' aria-hidden='true'><circle class='piste' cx='60' cy='60' r='52' pathLength='100'/><circle class='arc" + (pct ? "" : " zero") + "' cx='60' cy='60' r='52' pathLength='100' style='stroke-dashoffset:" + (100 - pct) + "'/></svg><div class='anneau-centre' aria-hidden='true'>" + centre + "</div>";
  }
  function coin() { return el("span", { "class": "coin" }, [icone("chevron")]); }
  function ronde(nom) { return el("span", { "class": "tuile ronde", "aria-hidden": "true" }, [icone(nom)]); }
  function tuileNiveau() {
    var xp = etat.xp || 0, n = niveau(xp), pct = pctNiveau(n);
    return el("a", { "class": "tb niveau", href: "#/profil", "aria-label": "Niveau " + n.niveau + ", " + xp + N + "XP, " + pct + F + "% du chemin vers le niveau " + (n.niveau + 1) }, [
      coin(),
      el("div", { "class": "anneau mini", "aria-hidden": "true", html: anneauHtml(pct, "<span class='sur'>Niv.</span><strong>" + n.niveau + "</strong>") }),
      el("span", { "class": "tb-bas", "aria-hidden": "true" }, [el("b", { text: xp + N + "XP" }), el("span", { "class": "meta", text: "encore " + (n.suivant - xp) + N + "XP" })])
    ]);
  }
  /* Série : jours d'affilée où la question du jour a été jouée, et la semaine en cours (lundi à dimanche). */
  function tuileSerie() {
    var n = serieJours(), d = new Date(), dow = (d.getDay() + 6) % 7, faits = 0;
    var semaine = el("div", { "class": "semaine", role: "img" });
    for (var k = 0; k < 7; k++) {
      var fait = !!etat.jours[jour(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + k))];
      if (fait) faits += 1;
      semaine.appendChild(el("span", { "class": "jr" + (fait ? " fait" : "") + (k === dow ? " auj" : "") }, [el("i"), el("span", { text: JOURS_COURTS[k] })]));
    }
    semaine.setAttribute("aria-label", "Question du jour cette semaine" + N + ": " + pluriel(faits, "jour joué", "jours joués"));
    return el("div", { "class": "tb serie" }, [
      el("span", { "class": "sur", text: "Série" }),
      el("span", { "class": "ligne-gros" }, [el("span", { "class": "gros", text: String(n) }), el("span", { "class": "meta", text: n > 1 ? "jours de suite" : "jour de suite" })]),
      semaine
    ]);
  }
  function tuileJour() {
    var fait = etat.jours[aujourdhui()];
    return el("section", { "class": "tb jour", "aria-label": "Question du jour" }, [
      el("div", { "class": "tb-tete" }, [ronde("ampoule"), el("span", { "class": "tb-texte" }, [el("b", { text: "Question du jour" }),
        el("span", { "class": "meta", text: fait ? (fait === "juste" ? "Réussie aujourd’hui. La suivante arrive demain." : "Manquée aujourd’hui. La suivante arrive demain.") : "La même pour tous." })])]),
      fait ? el("span", { "class": "fait-tag" }, [icone("juste"), "Faite"]) : lienAvance("#/jeu/jour", "Répondre", "btn second")
    ]);
  }
  function tuileCompte(href, nomIcone, nombre, singulier, pluriels) {
    return el("a", { "class": "tb fin", href: href }, [coin(), ronde(nomIcone), el("span", { "class": "tb-bas" }, [el("span", { "class": "gros", text: String(nombre) }), el("span", { "class": "meta", text: nombre > 1 ? pluriels : singulier })])]);
  }
  function tuileEclair() {
    return el("a", { "class": "tb fin", href: "#/jeu/melange" }, [coin(), ronde("eclair"), el("span", { "class": "tb-bas" }, [el("b", { text: "Quiz éclair" }), el("span", { "class": "meta", text: "10 questions" })])]);
  }
  /* Tuile « Reprendre » : photo de la formation en cours, titre, progression, un seul bouton noir. */
  function tuileReprendre(r, credits) {
    var photoR = cadrePhoto(r.s.titre, "photo-r r169");
    if (r.s.image && r.s.image.src) poserDansCadre(photoR, r.s.image, r.s.titre, credits);
    else photoDansCadre(photoR, r.s.titre, r.s.titre, credits, function (im) { memoriserImage(r.id, im); });
    var q = quizEnAttente(r.s), avance = !(termine(r.s) && !q);
    return el("section", { "class": "tb reprendre", "aria-labelledby": "titre-reprendre" }, [
      photoR,
      el("div", { "class": "reprendre-corps" }, [
        el("span", { "class": "sur", text: "Reprendre" }),
        el("div", { "class": "ligne-titre" }, [el("h2", { id: "titre-reprendre", text: r.s.titre }), el("span", { "class": "meta", text: (r.s.xp || 0) + N + "XP" })]),
        el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + avanceJalon(r.s) + "%" })]),
        el("span", { "class": "meta", text: detailSuivi(r.s) }),
        (avance ? lienAvance : lien)("#/p/" + encodeURIComponent(r.id) + (q ? (q % 10 === 0 ? "/defi/" : "/quiz/") + q : ""), q ? "Passer le " + (q % 10 === 0 ? "défi d’étape" : "quiz") : (termine(r.s) ? "Revoir le parcours" : r.s.fait ? "Continuer au palier " + (r.s.fait + 1) : "Commencer"), "btn")
      ])
    ]);
  }
  function vueMaison() {
    var credits = blocCredits();
    var miens = Object.keys(etat.parcours).map(function (id) { return { id: id, s: etat.parcours[id] }; }).filter(function (x) { return x.s.titre; }).sort(function (a, b) { return (b.s.date || "") > (a.s.date || "") ? 1 : -1; });
    var rech = carteRecherche(credits);
    var tuiles = [], nbErreurs = etat.erreurs.length;
    if (miens.length) tuiles.push(tuileReprendre(miens[0], credits));
    else {
      var premiere = el("button", { "class": "tb premiere", type: "button" }, [icone("livres"), el("span", { "class": "tb-texte" }, [el("b", { text: "Lance ta première formation" }), el("span", { "class": "meta", text: "Écris un sujet, ou choisis une idée plus bas." })]), icone("fleche")]);
      premiere.addEventListener("click", function () { var c = document.getElementById("sujet"); if (c) { c.scrollIntoView({ block: "center" }); c.focus(); } });
      tuiles.push(premiere);
    }
    tuiles.push(tuileNiveau(), tuileSerie(), tuileJour());
    if (nbErreurs) tuiles.push(tuileCompte("#/jeu/erreurs", "cerveau", nbErreurs, "question à revoir", "questions à revoir"));
    var eclair = tuileEclair();
    tuiles.push(eclair);
    var bento = el("div", { "class": "bento" + (miens.length ? "" : " sans-form") }, tuiles);
    function ranger() {
      var fin = bento.querySelectorAll(".tb.fin");
      Array.prototype.forEach.call(fin, function (t) { t.classList.toggle("seul", fin.length === 1); });
      Array.prototype.forEach.call(bento.children, function (t, k) { t.style.setProperty("--i", Math.min(k, 8)); });
    }
    ranger();
    // Pas d'erreur à revoir : la tuile Glossaire (termes déjà rencontrés dans la formation en cours) prend la place, si elle a des termes.
    if (!nbErreurs && miens.length && miens[0].s.fait >= 1) {
      glossaireJusqua({ id: miens[0].id }, miens[0].s.fait).then(function (termes) {
        if (!termes.length || !bento.isConnected) return;
        bento.insertBefore(tuileCompte("#/p/" + encodeURIComponent(miens[0].id) + "/glossaire", "carnet", termes.length, "terme appris", "termes appris"), eclair);
        ranger();
      }, function () {});
    }
    var haut = [entete(), rech.recherche, bento];
    if (miens.length > 1) {
      var ul = el("ul", { "class": "liste" });
      miens.slice(1, 8).forEach(function (x) { ul.appendChild(rangeeParcours(x.id, x.s.titre, x.s.image, detailSuivi(x.s))); });
      haut.push(el("section", { "class": "pile serree" }, [el("h2", { text: "Tes sujets" }), ul]));
    }
    var piste = el("ul", { "class": "carrousel", role: "list" });
    var bandes = [bande(haut, false), bande([rech.idees], true),
      bande([el("div", { "class": "ligne-titre" }, [el("h2", { text: "Parcours vérifiés" }), el("span", { "class": "meta", text: "2 sources par notion" })]), piste, credits.noeud], false)];
    montrer(el("div", { "class": "page bandes accueil" }, bandes), "accueil", "Accueil");
    chargerListeVerifies().then(function (l) {
      l.forEach(function (p) { piste.appendChild(carteVerifiee(p, credits)); });
    }, function () {});
  }

  /* ---------- Parcours ---------- */
  function memoriserImage(id, im) { var s = etat.parcours[id]; if (s && !(s.image && s.image.src)) { s.image = { src: im.src, credit: im.credit, lien: im.lien, source: im.source, auteur: im.auteur, lienAuteur: im.lienAuteur, lienSource: im.lienSource }; S.ecrire("koios.etat", etat); } }
  /* Couverture 16:9 : l'image du parcours, sinon une photo cherchée sur Commons puis Unsplash (cadre gris le temps de la recherche, retiré si rien ne vient). */
  function couverture(p) {
    if (p.image && p.image.src) return photo(p.image, "couverture", p.titre);
    var attendre = el("figure", { "class": "photo couverture", "aria-hidden": "true" }, [el("div", { "class": "cadre" })]);
    trouverImage(p.motImage || p.titre, "auto").then(function (im) {
      var f = im ? photo(im, "couverture", p.titre) : null;
      if (f) { attendre.replaceWith(f); memoriserImage(p.id, im); } else attendre.remove();
    });
    return attendre;
  }
  function vueParcours(id, onglet) {
    montrer(attente("Ouverture du parcours…"), "accueil", "Parcours");
    chargerParcours(id).then(function (p) {
      retenir(p); S.ecrire("koios.etat", etat);
      var s = suivi(p.id), prevus = paliersPrevus(p);
      var zone = el("div", { "class": "pile", id: "panneau", role: "tabpanel" });
      var tabs = el("div", { "class": "onglets", role: "tablist", "aria-label": "Sections du parcours" });
      var choix = [["parcours", "Paliers"], ["quiz", "Quiz"], ["defis", "Défis"], ["glossaire", "Glossaire"]];
      choix.forEach(function (c) {
        var b = el("button", { type: "button", role: "tab", "aria-controls": "panneau", "aria-selected": c[0] === (onglet || "parcours") ? "true" : "false", text: c[1] });
        b.addEventListener("click", function () { history.replaceState(null, "", "#/p/" + encodeURIComponent(p.id) + (c[0] === "parcours" ? "" : "/" + c[0])); tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); }); remplir(c[0]); });
        tabs.appendChild(b);
      });
      function remplir(o) {
        zone.innerHTML = "";
        if (o === "quiz") zone.appendChild(ongletQuiz(p, s)); else if (o === "defis") zone.appendChild(ongletDefis(p, s)); else if (o === "glossaire") zone.appendChild(ongletGlossaire(p, s)); else zone.appendChild(parProgramme(p) ? ongletSommaire(p, s, prevus) : ongletPaliers(p, s, prevus));
        if (window.poserIcones) window.poserIcones(zone);
      }
      var suivant = Math.min(s.fait + 1, p.verifie ? prevus : s.fait + 1), prog = parProgramme(p), mf = prog ? modulesFaits(p, s.fait) : 0;
      montrer(el("div", { "class": "page" }, [
        el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/" }, [icone("retour"), "Accueil"]), el("span"), puceXP()]),
        couverture(p),
        el("div", { "class": "pile serree" }, [el("span", {}, [badge({ statut: p.verifie ? "verifie" : "recoupe" })]), el("h1", { text: p.titre }), p.resume ? el("p", { "class": "meta", style: "font-size:16px", text: p.resume }) : null]),
        el("div", { "class": "pile serree" }, [el("div", { "class": "ligne-titre" }, [el("span", { "class": "meta", text: (s.fait ? pluriel(s.fait, "palier terminé", "paliers terminés") : "Pas encore commencé") + (prog && s.fait ? " · " + mf + " sur " + pluriel(p.modulesTotal, "module", "modules") : "") }), el("span", { "class": "meta gain", text: (s.xp || 0) + N + "XP" })]),
          el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + (prog ? Math.round(mf / Math.max(p.modulesTotal, 1) * 100) : p.verifie ? Math.round(s.fait / Math.max(prevus, 1) * 100) : ((s.fait % 10) * 10)) + "%" })])]),
        fini(p) ? el("p", { "class": "verrou" }, [icone("diplome"), prog ? "Formation terminée. Rejoue les quiz et les défis pour consolider." : "Parcours terminé. Rejoue les quiz et les défis pour consolider."]) : lienAvance("#/p/" + encodeURIComponent(p.id) + "/" + suivant, s.fait ? "Continuer · palier " + suivant : "Commencer le palier 1", "btn"),
        tabs, zone
      ]), "accueil", p.titre);
      remplir(onglet || "parcours");
    }, function (e) { montrer(erreurPage(e.statut === 404 ? "Ce parcours n’existe pas encore." : messageErreur(e), "Parcours indisponible"), "accueil"); });
  }
  /* Une leçon (pastille fait / actuel / verrou) puis, tous les 5 paliers, son jalon quiz ou défi. */
  function ajouterPalier(ul, p, s, n) {
    var t = titrePalier(p, n) || (n <= s.fait + 1 ? "Palier " + n : "Palier à venir");
    var etatP = n <= s.fait ? "fait" : (n === s.fait + 1 ? "actuel" : "");
    var ouvert = n <= s.fait + 1;
    var contenu = [el("span", { "class": "pastille", text: n <= s.fait ? null : String(n), "aria-hidden": "true" }, [n <= s.fait ? icone("juste") : null]), el("span", {}, [el("b", { text: t }), el("span", { "class": "etat", text: n <= s.fait ? "Terminé" : (ouvert ? "À faire" : "Verrouillé") })]), ouvert ? icone("chevron") : icone("cadenas")];
    ul.appendChild(el("li", { "class": etatP }, [ouvert ? el("a", { href: "#/p/" + encodeURIComponent(p.id) + "/" + n, "aria-label": "Palier " + n + N + ": " + t }, contenu) : el("span", { "class": "bloque" }, contenu)]));
    if (n % 5 === 0) {
      var k = n, nom = n % 10 === 0 ? "Défi d’étape" : "Quiz", score = (s.quiz || {})[k];
      var dispo = s.fait >= k;
      var c2 = [el("span", { "class": "pastille", "aria-hidden": "true" }, [icone(score !== undefined ? "juste" : (n % 10 === 0 ? "trophee" : "liste"))]), el("span", {}, [el("b", { text: nom + " · paliers " + (k - (n % 10 === 0 ? 9 : 4)) + " à " + k }), el("span", { "class": "etat", text: score !== undefined ? "Meilleur score" + N + ": " + score + F + "%" : (dispo ? "Disponible" : "S’ouvre au palier " + k) })]), dispo ? icone("chevron") : icone("cadenas")];
      ul.appendChild(el("li", { "class": "jalon" + (score !== undefined ? " fait" : "") }, [dispo ? el("a", { href: "#/p/" + encodeURIComponent(p.id) + "/" + (n % 10 === 0 ? "defi" : "quiz") + "/" + k }, c2) : el("span", { "class": "bloque" }, c2)]));
    }
  }
  function ongletPaliers(p, s, prevus) {
    var bloc = el("div", { "class": "pile" });
    var dernier = p.verifie ? prevus : Math.max(prevus, s.fait + 1);
    var etapes = p.etapes && p.etapes.length ? p.etapes.slice() : [];
    var nbEtapes = Math.max(etapes.length, Math.ceil(dernier / 10));
    for (var e = 1; e <= nbEtapes; e++) {
      var et = etapes[e - 1] || { numero: e, titre: "Étape " + e, paliers: [] };
      var ul = el("ol", { "class": "chemin" });
      var debut = (e - 1) * 10 + 1, finE = Math.min(e * 10, p.verifie ? prevus : e * 10);
      for (var n = debut; n <= finE; n++) ajouterPalier(ul, p, s, n);
      bloc.appendChild(el("div", { "class": "etape-titre" }, [el("h2", { text: "Étape " + e + (et.titre && et.titre !== "Étape " + e ? " · " + et.titre : "") }), el("span", { "class": "meta", text: "Paliers " + debut + " à " + finE })]));
      bloc.appendChild(ul);
    }
    if (!p.verifie) bloc.appendChild(el("p", { "class": "meta", text: "Le parcours continue sans fin" + N + ": chaque étape de 10 paliers en ouvre une autre, plus précise." }));
    return bloc;
  }
  /* Sommaire d'une formation par niveaux : en-tête de niveau (icône, titre, modules faits, barre), puis une rangée par module.
     Un module ouvert se déplie sur ses leçons ; le prochain à ouvrir a son bouton ; les autres sont verrouillés. */
  var ICONES_NIVEAU = { 1: "pousse", 2: "chemin", 3: "montagne", 4: "medaille" };
  /* Rangée d'un module : numéro dans un cercle (fait : plein ; en cours : contour encre ; verrouillé : contour clair), titre, objectif (2 lignes au plus), fin (chevron ou cadenas). */
  function rangModule(m, etatM, fin) {
    return [el("span", { "class": "num-module " + etatM, "aria-hidden": "true", text: String(m.numero) }),
      el("span", { "class": "rang-texte" }, [el("b", {}, [el("span", { "class": "sr", text: "Module " + m.numero + N + ": " }), m.titre]), el("span", { "class": "objectif", text: m.objectif })]),
      fin];
  }
  /* Module ouvert : bouton-rangée et volet qui se déplie (hauteur animée par grid-template-rows). */
  function moduleDepliant(m, fait, resume, chemin, ouvert) {
    var id = "module-" + m.numero;
    var volet = el("div", { "class": "depli", id: id, "data-ouvert": ouvert ? "1" : "0" }, [el("div", { "class": "depli-int" }, [el("p", { "class": "meta", text: resume }), chemin])]);
    var bouton = el("button", { "class": "rang", type: "button", "aria-expanded": ouvert ? "true" : "false", "aria-controls": id }, rangModule(m, fait ? "fait" : "actuel", icone("chevron")));
    bouton.addEventListener("click", function () { var o = bouton.getAttribute("aria-expanded") === "true"; bouton.setAttribute("aria-expanded", o ? "false" : "true"); volet.setAttribute("data-ouvert", o ? "0" : "1"); });
    return el("li", { "class": "module" }, [bouton, volet]);
  }
  function ongletSommaire(p, s, prevus) {
    var bloc = el("div", { "class": "pile ecart" });
    var ouverts = {}; (p.etapes || []).forEach(function (e) { ouverts[e.numero] = e; });
    var prochain = (p.etapes || []).length + 1, actuel = s.fait + 1, courant = 0;
    (p.etapes || []).forEach(function (e) { (e.paliers || []).forEach(function (x) { if (x.numero === actuel) courant = e.numero; }); });
    if (!courant) courant = s.fait >= prevus && prochain <= p.modulesTotal ? prochain : (p.etapes || []).length;
    if (!formationComplete(p)) bloc.appendChild(el("p", { "class": "meta", text: "Les modules s’ouvrent dans l’ordre." }));
    p.programme.niveaux.forEach(function (niv) {
      var faits = niv.modules.filter(function (m) { var e = ouverts[m.numero], l = e ? e.paliers || [] : []; return l.length && l[l.length - 1].numero <= s.fait; }).length;
      var total = niv.modules.length;
      var ul = el("ul", { "class": "liste modules" });
      niv.modules.forEach(function (m) {
        var e = ouverts[m.numero];
        if (e) {
          var l = e.paliers || [], a = l.length ? l[0].numero : 0, z = l.length ? l[l.length - 1].numero : 0;
          var nFaits = l.filter(function (x) { return x.numero <= s.fait; }).length, fait = l.length > 0 && nFaits >= l.length;
          var resume = fait ? "Terminé · " + pluriel(l.length, "leçon", "leçons") : "Leçons " + a + " à " + z + " · " + nFaits + " sur " + l.length + " faites";
          var chemin = el("ol", { "class": "chemin" });
          l.forEach(function (x) { ajouterPalier(chemin, p, s, x.numero); });
          ul.appendChild(moduleDepliant(m, fait, resume, chemin, m.numero === courant));
        } else if (m.numero === prochain && s.fait >= prevus) {
          ul.appendChild(el("li", { "class": "module-ferme" }, [el("div", { "class": "rang" }, rangModule(m, "actuel", icone("chevron"))),
            lienAvance("#/p/" + encodeURIComponent(p.id) + "/" + (prevus + 1), "Ouvrir ce module", "btn second")]));
        } else {
          ul.appendChild(el("li", { "class": "module-ferme", "aria-label": "verrouillé" }, [el("div", { "class": "rang" }, rangModule(m, "bloque", icone("cadenas")))]));
        }
      });
      bloc.appendChild(el("section", { "class": "pile niveau" }, [
        el("div", { "class": "niveau-haut" }, [
          el("span", { "class": "tuile ronde", "aria-hidden": "true" }, [icone(ICONES_NIVEAU[niv.numero] || "livre")]),
          el("div", {}, [el("span", { "class": "sur", text: "Niveau " + niv.numero }), el("h2", { text: niv.titre })]),
          el("span", { "class": "meta", text: faits + "/" + total + (total > 1 ? " modules" : " module") })]),
        el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.round(faits / Math.max(total, 1) * 100) + "%" })]),
        ul]));
    });
    if (!formationComplete(p)) bloc.appendChild(el("p", { "class": "meta", text: "Les leçons d’un module sont rédigées quand tu l’ouvres, dès que tu as fini le module précédent." }));
    return bloc;
  }
  function ongletQuiz(p, s) {
    return el("div", { "class": "pile" }, [
      el("div", { "class": "carte" }, [el("h2", { text: "Quiz direct" }), el("p", { "class": "meta", text: "Dix questions sur tout le sujet, avec l’explication de chaque réponse. Disponible tout de suite." }), lien("#/p/" + encodeURIComponent(p.id) + "/quiz/direct", "Lancer le quiz", "btn")]),
      s.fait >= 5 ? el("div", { "class": "carte" }, [el("h2", { text: "Quiz des paliers" }), el("p", { "class": "meta", text: "Rejoue les quiz déjà ouverts depuis l’onglet Paliers." })]) : el("p", { "class": "verrou" }, [icone("cadenas"), "Les quiz de paliers s’ouvrent tous les 5 paliers."])
    ]);
  }
  function ongletDefis(p, s) {
    if (s.fait < 5) return el("p", { "class": "verrou" }, [icone("cadenas"), "Mini‑jeux et duels s’ouvrent au palier 5. Encore " + pluriel(5 - s.fait, "palier", "paliers") + "."]);
    var ul = el("ul", { "class": "liste" });
    [["vraifaux", "Vrai ou faux express", "Huit affirmations, réponds vite."], ["paires", "Associe les notions", "Relie chaque terme à sa définition."], ["ordre", "Remets dans l’ordre", "Classe les dates de tes paliers."], ["duel", "Duel avec un ami", "Dix questions, les mêmes pour vous deux."]].forEach(function (j) {
      ul.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/p/" + encodeURIComponent(p.id) + "/jeu/" + j[0] }, [tuile(j[0] === "duel" ? "epee" : j[0] === "paires" ? "liste" : j[0] === "ordre" ? "sablier" : "ampoule"), el("span", {}, [el("b", { text: j[1] }), el("span", { "class": "meta", text: j[2] })]), icone("chevron")])]));
    });
    return ul;
  }

  /* ---------- Glossaire : onglet, mots soulignés dans les leçons, fiche ---------- */
  var glossaires = {}; // par parcours : { k, termes } (le plus grand « jusqu'à » demandé ; une lecture plus courte en est extraite)
  function sansAccent(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim(); }
  function comparerTermes(a, b) { return a.terme.localeCompare(b.terme, "fr", { sensitivity: "base" }) || a.numero - b.numero; }
  /* Parcours vérifiés : même forme que GET /api/glossaire (termes uniques sans accents ni casse, première leçon gardée, tri français). */
  var DATE_TERME = /^\s*(\d|vers\s+\d|(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\b)/i; // les dates des repères ne sont pas des mots à définir
  function glossaireDe(lecons) {
    var vus = Object.create(null), termes = [];
    lecons.slice().sort(function (a, b) { return a.numero - b.numero; }).forEach(function (l) {
      (l.definitions || []).concat(l.reperes || []).forEach(function (d) {
        if (!d || typeof d.terme !== "string" || typeof d.definition !== "string") return;
        var terme = d.terme.trim(), definition = d.definition.trim(), k = sansAccent(terme);
        if (!k || !definition || vus[k] || DATE_TERME.test(terme)) return;
        vus[k] = 1;
        termes.push({ terme: terme, definition: definition, numero: l.numero, titre: typeof l.titre === "string" ? l.titre : "" });
      });
    });
    return termes.sort(comparerTermes);
  }
  function glossaireServeur(id, k) {
    return pretServeur.then(function () {
      if (!serveur.base) throw Object.assign(new Error("hors ligne"), { statut: 0 });
      return api("GET", "glossaire?parcours=" + encodeURIComponent(id) + "&jusqua=" + k);
    }).then(function (j) {
      return (j.termes || []).filter(function (t) { return t && typeof t.terme === "string" && typeof t.definition === "string" && typeof t.numero === "number"; })
        .map(function (t) { return { terme: t.terme, definition: t.definition, numero: t.numero, titre: typeof t.titre === "string" ? t.titre : "" }; });
    });
  }
  /* Mots définis dans les leçons 1 à k du parcours (jamais au-delà : pas d'avance sur ce qui n'est pas encore lu). */
  function glossaireJusqua(p, k) {
    if (!(k >= 1)) return Promise.resolve([]);
    var g = glossaires[p.id];
    if (!g || g.k < k) {
      var termes = verifie(p.id) ? paliersEntre(p, 1, k).then(glossaireDe) : glossaireServeur(p.id, k);
      g = glossaires[p.id] = { k: k, termes: termes };
      termes.then(null, function () { if (glossaires[p.id] === g) delete glossaires[p.id]; });
    }
    return g.termes.then(function (l) { return l.filter(function (t) { return t.numero <= k; }); });
  }
  function ongletGlossaire(p, s) {
    var bloc = el("div", { "class": "pile" });
    var vide = function () { return etatVide("carnet", "Les mots définis dans tes leçons apparaîtront ici.", fini(p) ? null : lienAvance("#/p/" + encodeURIComponent(p.id) + "/" + (s.fait + 1), s.fait ? "Continuer · palier " + (s.fait + 1) : "Commencer le palier 1", "btn second petit")); };
    if (!(s.fait >= 1)) { bloc.appendChild(vide()); return bloc; }
    var attenteG = el("p", { "class": "attente", role: "status", text: "Chargement du glossaire…" });
    bloc.appendChild(attenteG);
    glossaireJusqua(p, s.fait).then(function (termes) {
      attenteG.remove();
      if (!termes.length) { bloc.appendChild(vide()); return; }
      var champ = el("input", { "class": "champ", id: "recherche-glossaire", type: "search", autocomplete: "off", enterkeyhint: "search", placeholder: "Chercher un mot ou une définition" });
      var compte = el("p", { "class": "meta", role: "status" });
      var liste = el("ul", { "class": "liste gloss-liste" });
      var aucun = el("p", { "class": "meta", text: "Aucun terme ne correspond.", hidden: "" });
      var plats = termes.map(function (t) { return sansAccent(t.terme + " " + t.definition); });
      function afficher() {
        var mots = sansAccent(champ.value).split(" ").filter(Boolean), f = document.createDocumentFragment(), n = 0;
        termes.forEach(function (t, i) {
          if (mots.some(function (m) { return plats[i].indexOf(m) < 0; })) return;
          n += 1;
          f.appendChild(el("li", {}, [el("b", { text: t.terme }), el("p", { text: t.definition }), el("a", { "class": "lien", href: "#/p/" + encodeURIComponent(p.id) + "/" + t.numero, text: "Leçon " + t.numero + (t.titre ? " · " + t.titre : "") })]));
        });
        liste.textContent = ""; liste.appendChild(f);
        compte.textContent = mots.length ? n + " sur " + pluriel(termes.length, "terme", "termes") : pluriel(termes.length, "terme", "termes");
        aucun.hidden = n > 0;
      }
      champ.addEventListener("input", afficher);
      bloc.appendChild(el("div", { "class": "pile serree" }, [el("label", { "for": "recherche-glossaire", "class": "sr", text: "Chercher dans le glossaire" }), champ, compte]));
      bloc.appendChild(aucun); bloc.appendChild(liste);
      afficher();
    }, function () { attenteG.replaceWith(el("p", { "class": "verrou" }, [icone("carnet"), "Le glossaire ne se charge pas. Réessaie dans un moment."])); });
    return bloc;
  }

  /* Fiche d'un mot : fenêtre en bas d'écran, fermable par Échap, par le bouton ou en touchant à côté. Le focus y entre, y reste, puis revient au mot. */
  var fiche = null;
  function fermerFiche(rendreFocus) {
    if (!fiche) return;
    document.removeEventListener("keydown", fiche.touche);
    fiche.voile.remove(); fiche.boite.remove();
    app.removeAttribute("inert"); nav.removeAttribute("inert");
    var d = fiche.declencheur; fiche = null;
    if (rendreFocus && d && d.isConnected) d.focus({ preventScroll: true });
  }
  function ouvrirFiche(t, id, declencheur) {
    fermerFiche(false);
    var fermer = el("button", { "class": "btn second petit", type: "button", text: "Fermer" });
    var revoir = el("a", { "class": "btn", href: "#/p/" + encodeURIComponent(id) + "/" + t.numero, text: "Revoir la leçon " + t.numero });
    var boite = el("div", { "class": "fiche", role: "dialog", "aria-modal": "true", "aria-labelledby": "fiche-terme", "aria-describedby": "fiche-definition", tabindex: "-1" }, [
      el("div", { "class": "ligne-titre fiche-haut" }, [el("h2", { id: "fiche-terme", text: t.terme }), fermer]),
      el("p", { id: "fiche-definition", text: t.definition }),
      revoir
    ]);
    var voile = el("div", { "class": "fiche-voile" });
    function touche(e) {
      if (e.key === "Escape") { e.preventDefault(); fermerFiche(true); return; }
      if (e.key !== "Tab") return;
      var cibles = [fermer, revoir], actif = document.activeElement, i = cibles.indexOf(actif);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); cibles[cibles.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === cibles.length - 1)) { e.preventDefault(); cibles[0].focus(); }
    }
    fermer.addEventListener("click", function () { fermerFiche(true); });
    voile.addEventListener("click", function () { fermerFiche(true); });
    revoir.addEventListener("click", function () { fermerFiche(false); });
    document.addEventListener("keydown", touche);
    document.body.appendChild(voile); document.body.appendChild(boite);
    app.setAttribute("inert", ""); nav.setAttribute("inert", "");
    fiche = { voile: voile, boite: boite, declencheur: declencheur, touche: touche };
    boite.focus({ preventScroll: true });
  }
  /* Une expression de mot entier, insensible à la casse ; espaces et apostrophes de typographie interchangeables. */
  function motEntier(terme) {
    var motif = terme.trim().split(/\s+/).map(function (m) { return m.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&").replace(/['’]/g, "['’]"); }).join("\\s+");
    return new RegExp(motif + "(?![\\p{L}\\p{N}_])", "giu");
  }
  function dejaPris(liste, d, f) { return liste.some(function (x) { return d < x.f && x.d < f; }); }
  /* Première occurrence de chaque mot connu dans En bref, À retenir et les explications : les plus longs d'abord, sans chevauchement. */
  function lierTermes(article, termes, id) {
    var zones = Array.prototype.slice.call(article.querySelectorAll(".texte p, .a-retenir li")), pris;
    try {
      var textes = zones.map(function (z) { return z.textContent; });
      pris = zones.map(function () { return []; });
      termes.filter(function (t) { return Array.from(t.terme.trim()).length >= 3; })
        .sort(function (a, b) { return b.terme.length - a.terme.length || comparerTermes(a, b); })
        .forEach(function (t) {
          var re = motEntier(t.terme);
          for (var i = 0; i < textes.length; i++) {
            var m; re.lastIndex = 0;
            while ((m = re.exec(textes[i]))) {
              var d = m.index, f = d + m[0].length;
              if ((d > 0 && /[\p{L}\p{N}_]/u.test(textes[i].charAt(d - 1))) || dejaPris(pris[i], d, f)) { re.lastIndex = d + 1; continue; }
              pris[i].push({ d: d, f: f, t: t });
              return;
            }
          }
        });
    } catch (e) { return; }
    zones.forEach(function (z, i) {
      if (!pris[i].length) return;
      var texte = z.textContent, suite = document.createDocumentFragment(), pos = 0;
      pris[i].sort(function (a, b) { return a.d - b.d; }).forEach(function (x) {
        if (x.d > pos) suite.appendChild(document.createTextNode(texte.slice(pos, x.d)));
        var b = el("button", { "class": "terme", type: "button", "aria-haspopup": "dialog", text: texte.slice(x.d, x.f) });
        b.addEventListener("click", function () { ouvrirFiche(x.t, id, b); });
        suite.appendChild(b); pos = x.f;
      });
      if (pos < texte.length) suite.appendChild(document.createTextNode(texte.slice(pos)));
      z.textContent = ""; z.appendChild(suite);
    });
  }

  /* ---------- Palier (leçon) ---------- */
  /* Titre de section avec son icône (20 px, --encre-2), alignée sur la ligne du titre. */
  function titreSection(titre, nomIcone) { return el("h2", { "class": "titre-section" }, [nomIcone ? icone(nomIcone) : null, titre]); }
  function sectionL(titre, contenu, nomIcone) { return contenu ? el("section", {}, [titreSection(titre, nomIcone), contenu]) : null; }
  /* « À retenir » : bloc à part (filet gauche, fond --surface, puces). */
  function blocRetenir(liste) { var ul = listeRetenir(liste); return ul ? el("section", { "class": "retenir" }, [titreSection("À retenir", "epingle"), ul]) : null; }
  /* Durée de lecture estimée : mots du texte affiché (hors sources, note de vérification et dessin du réseau), 200 mots par minute, 1 minute au moins ; 0 si rien n'est lisible. */
  function dureeLecture(noeud) {
    var c = noeud.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll(".sources-lecon, .verif, .graphe-reseau"), function (x) { x.remove(); });
    var mots = (c.textContent.match(/\S+/g) || []).length;
    return mots ? Math.max(1, Math.round(mots / 200)) : 0;
  }
  /* Attente de génération d'une leçon : ce qui se passe, en étapes décrites (pas de progression inventée). Le bloc n'apparaît qu'après un instant, pour ne pas clignoter quand la leçon est déjà prête. */
  function attenteLecon() {
    var ul = el("ul", { "class": "etapes-gen" });
    [["loupe", "Recherche des sources"], ["plume", "Rédaction de la leçon"], ["verifie", "Vérification par une 2e IA"]].forEach(function (x) { ul.appendChild(el("li", {}, [icone(x[0]), x[1]])); });
    var bloc = el("section", { "class": "generation", role: "status", hidden: "" }, [
      el("p", { "class": "titre-attente", text: "Préparation de la leçon…" }),
      el("div", { "class": "barre-indet", "aria-hidden": "true" }, [el("i")]),
      el("p", { "class": "meta", text: "La première fois, compte jusqu’à une minute. Ensuite la leçon s’ouvre tout de suite, pour tout le monde." }),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Ce qui se passe" }), ul])
    ]);
    setTimeout(function () { bloc.hidden = false; }, 500);
    return el("div", { "class": "page plein" }, [entete(), bloc]);
  }
  function texteL(t) { if (!t) return null; var d = el("div", { "class": "texte" }); String(t).split("\n").forEach(function (x) { if (x.trim()) d.appendChild(el("p", { text: x })); }); return d; }
  function listeRetenir(liste) { if (!liste || !liste.length) return null; var ul = el("ul", { "class": "a-retenir" }); liste.forEach(function (t) { ul.appendChild(el("li", { text: t })); }); return ul; }
  /* Au-dessus du titre : « Niveau · Module » (formation par niveaux) ou « Sommaire », dans les deux cas un lien vers le sommaire. */
  function filAriane(l, id) {
    var sommaire = "#/p/" + encodeURIComponent(id);
    if (!l.niveau || !l.module) return el("nav", { "aria-label": "Sommaire" }, [el("a", { "class": "fil-lien", href: sommaire }, [icone("sommaire"), "Sommaire"])]);
    return el("nav", { "aria-label": "Position dans la formation" }, [el("a", { "class": "fil-lien", href: sommaire }, [icone("sommaire"), el("span", { "class": "sr", text: "Sommaire" + N + ": " }),
      el("ol", { "class": "fil" }, [el("li", { text: "Niveau " + l.niveau.numero + " · " + l.niveau.titre }), el("li", { text: "Module " + l.module.numero + " · " + l.module.titre })])])]);
  }
  function pageVerrou(id, texte, n) { montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [el("p", { "class": "verrou" }, [icone("cadenas"), texte]), lien("#/p/" + encodeURIComponent(id) + "/" + n, "Aller au palier " + n, "btn")])]), "accueil", "Verrouillé"); }
  function pageFin(p) {
    var base = "#/p/" + encodeURIComponent(p.id), nb = paliersPrevus(p);
    montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [
      el("span", { "class": "sur", text: p.titre || "Formation" }),
      el("h1", { text: "Formation terminée" }),
      el("p", { text: "Tu as fait le tour de ce sujet" + (nb ? N + ": " + pluriel(nb, "leçon", "leçons") + (p.modulesTotal ? " dans " + pluriel(p.modulesTotal, "module", "modules") : "") : "") + "." }),
      lien(base + "/quiz/direct", "Lancer le quiz direct", "btn"),
      lien("#/", "Retour à l’accueil", "btn second")])]), "accueil", "Formation terminée");
  }
  function vuePalier(id, n) {
    var s0 = suivi(id);
    if (n > (s0.fait || 0) + 1) { pageVerrou(id, "Ce palier s’ouvre après le palier " + (n - 1) + ".", (s0.fait || 0) + 1); return; }
    montrer(attenteLecon(), null, "Palier");
    chargerParcours(id).then(function (p0) {
      if (formationComplete(p0) && n > paliersPrevus(p0)) return { fin: p0 };
      return chargerPalier(id, n).then(function (l) {
        if (!l) throw Object.assign(new Error("introuvable"), { statut: 404 });
        // Un module vient de s'ouvrir : le parcours gardé en mémoire est périmé.
        if (parProgramme(p0) && n > paliersPrevus(p0)) { delete cache["p:" + id]; return chargerParcours(id).then(function (p) { return { p: p, l: l }; }); }
        return { p: p0, l: l };
      });
    }).then(function (r) {
      if (r.fin) { pageFin(r.fin); return; }
      var p = r.p, l = r.l;
      retenir(p);
      var s = suivi(p.id), V = window.Visuels || {};
      if (n > s.fait + 1) { montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [el("p", { "class": "verrou" }, [icone("cadenas"), "Ce palier s’ouvre après le palier " + (n - 1) + "."]), lien("#/p/" + encodeURIComponent(p.id) + "/" + (s.fait + 1), "Aller au palier " + (s.fait + 1), "btn")])]), "accueil", "Palier verrouillé"); return; }
      var dl = null;
      var defs = (l.definitions || []).concat((l.frise || []).length >= 2 ? [] : (l.reperes || []));
      if (defs.length) { dl = el("dl", { "class": "definitions" }); defs.forEach(function (d) { dl.appendChild(el("div", {}, [el("dt", { text: d.terme }), el("dd", { text: d.definition })])); }); }
      var srcs = null;
      if ((l.sources || []).length) { srcs = el("ul", { "class": "sources-lecon" }); l.sources.forEach(function (x) { srcs.appendChild(el("li", {}, [x[1] ? el("a", { href: x[1], target: "_blank", rel: "noopener", text: x[0] }) : el("span", { text: x[0] })])); }); }
      var v = l.verification || {};
      var noteV = v.statut === "verifie" ? v.note : (v.ia ? "Rédigé par l’IA " + v.ia[0] + " à partir des sources ci‑dessus (surtout Wikipédia), puis contrôlé affirmation par affirmation par l’IA " + v.ia[1] + (v.retirees ? " ; " + pluriel(v.retirees, "affirmation non confirmée a été retirée", "affirmations non confirmées ont été retirées") + "." : ".") + " Pas de relecture humaine." : "Rédigé à partir des sources ci‑dessus.");
      // Question de compréhension
      var bonus = 0, qIndex = (l.questions || []).findIndex(function (q) { return q.type === "qcm"; });
      var verifBloc = null;
      if (qIndex >= 0) {
        verifBloc = el("section", { "class": "bloc-verif" }, [el("h2", { text: "Vérifie ta compréhension" })]);
        verifBloc.appendChild(rendreQuestion(l.questions[qIndex], function (juste) {
          var it = { palier: l.id, index: qIndex, titre: l.titre };
          if (juste) { bonus = etat.reussies[it.palier + "#" + it.index] ? 0 : XP.verif; oublierErreur(it); } else noterErreur(it);
          S.ecrire("koios.etat", etat);
        }));
      }
      var deja = n <= s.fait;
      var finir = el("button", { "class": "btn", type: "button" }, [el("span", { text: deja ? "Leçon suivante" : "Terminer le palier · +" + XP.palier + N + "XP" }), icone("fleche")]);
      finir.addEventListener("click", function () {
        var s2 = suivi(p.id);
        if (finir.disabled) return;
        var gain = 0;
        if (n > s2.fait) { if (bonus && !premiereReussite({ palier: l.id, index: qIndex })) bonus = 0; s2.fait = n; etat.parcours[p.id] = s2; gain = XP.palier + bonus; gagner(gain, p.id); toast("+" + gain + N + "XP"); }
        var base = "#/p/" + encodeURIComponent(p.id), cible;
        if (p.verifie && n >= paliersPrevus(p)) cible = base;
        else if (n % 10 === 0 && !(s2.quiz || {})[n]) cible = base + "/defi/" + n;
        else if (n % 5 === 0 && !(s2.quiz || {})[n]) cible = base + "/quiz/" + n;
        else cible = base + "/" + (n + 1);
        if (!gain || mouvementReduit()) { location.hash = cible; return; }
        // Fin de leçon : une coche se dessine dans un cercle, puis on passe à la suite.
        finir.disabled = true; finir.classList.add("fait-lecon");
        finir.replaceChildren(coche(true), el("span", { text: "Leçon terminée" }));
        setTimeout(function () { if (finir.isConnected) location.hash = cible; }, 750);
      });
      var racine = "#/p/" + encodeURIComponent(p.id);
      var rangeeNav = el("nav", { "class": "nav-lecon", "aria-label": "Navigation dans le cours" }, [
        n > 1 ? el("a", { "class": "lien", href: racine + "/" + (n - 1) }, [icone("retour"), "Leçon précédente"]) : null,
        el("a", { "class": "lien", href: racine }, [icone("sommaire"), "Sommaire"])
      ]);
      var points = el("div", { "class": "etapes-q", "aria-hidden": "true" });
      var mod = parProgramme(p) ? (p.etapes || []).filter(function (e) { return e.numero === l.etape; })[0] : null; // les points suivent le module
      var e0 = mod && (mod.paliers || []).length ? mod.paliers[0].numero - 1 : Math.floor((n - 1) / 10) * 10, nbPoints = mod && (mod.paliers || []).length ? mod.paliers.length : 10;
      for (var k = 1; k <= nbPoints; k++) points.appendChild(el("i", { "class": e0 + k < n ? "fait" : (e0 + k === n ? "ok" : null) }));
      var article = el("article", { "class": "lecon" }, [
        sectionL("En bref", texteL(l.sections && l.sections.enBref), "eclair"),
        blocRetenir(l.aRetenir),
        sectionL("Comment", texteL(l.sections && l.sections.comment), "engrenage"),
        sectionL("Pourquoi", texteL(l.sections && l.sections.pourquoi), "aide"),
        sectionL("Où et quand", texteL(l.sections && l.sections.ouQuand), "repere"),
        sectionL(!(l.definitions || []).length ? "Repères" : "Définitions", dl, "livre-ouvert"),
        sectionL("Frise", V.frise ? V.frise(l.frise) : null, "frise"),
        sectionL("En chiffres", V.barres ? V.barres(l.chiffres) : null, "barres"),
        sectionL("Réseau des notions", V.reseau ? V.reseau(l.notions) : null, "reseau"),
        l.citation && V.citation ? V.citation(l.citation) : null,
        sectionL("L’histoire", l.histoire ? el("p", { text: l.histoire }) : null, "guillemets"),
        sectionL("Pour s’en souvenir", l.mnemo ? el("p", { text: l.mnemo }) : null, "ampoule"),
        sectionL("Sources", srcs, "lien"),
        el("p", { "class": "verif" + (v.statut === "verifie" ? " ok" : "") }, [icone(v.statut === "verifie" ? "verifie" : "liste"), noteV])
      ]);
      var minutes = dureeLecture(article);
      // Photo de la leçon : la sienne, sinon une photo libre cherchée sur Commons. Rien n'est réservé tant que l'adresse n'est pas connue.
      var emplacement = el("div", { "class": "emplacement", hidden: "" });
      function poserPhoto(img) { var f = photo(img, "lecon-img", l.titre); if (f) { emplacement.appendChild(f); emplacement.hidden = false; } }
      montrer(el("div", { "class": "page plein" }, [
        el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: "#/p/" + encodeURIComponent(p.id), "aria-label": "Fermer le palier" }, [icone("fermer")]), points, puceXP()]),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: p.titre }), filAriane(l, p.id), el("h1", { text: l.titre }),
          el("div", { "class": "meta-lecon" }, [badge(v), el("span", { "class": "meta", text: "Leçon " + n }), minutes ? el("span", { "class": "meta", text: "≈" + N + minutes + N + "min" }) : null])]),
        emplacement,
        article,
        verifBloc, finir, rangeeNav
      ]), null, l.titre);
      if (l.image && l.image.src) poserPhoto(l.image);
      else trouverImage(l.titre + " " + p.titre, "commons").then(function (img) { if (img && emplacement.isConnected) poserPhoto(img); });
      // Mots déjà définis dans les leçons précédentes : soulignés, avec leur fiche. Sans glossaire, la leçon reste telle quelle.
      glossaireJusqua(p, n - 1).then(function (termes) { if (article.isConnected) lierTermes(article, termes, p.id); }, function () {});
    }, function (e) {
      if (e.statut === 404 && /^Formation terminée/.test(e.message || "")) { // le serveur dit qu'il n'y a plus de module
        delete cache["p:" + id];
        chargerParcours(id).then(pageFin, function () { pageFin({ id: id, titre: "" }); });
        return;
      }
      montrer(erreurPage(e.statut === 404 ? "Ce palier n’existe pas." : e.statut === 401 ? "La rédaction d’un nouveau palier demande ton compte en ligne. Réessaie dans un moment." : messageErreur(e, "Limite du jour" + N + ": 30 nouveaux paliers par personne. Les paliers déjà rédigés restent ouverts."), "Palier indisponible"), "accueil");
    });
  }

  /* ---------- Questions ---------- */
  function retourQ(juste, q) {
    var b = el("div", { "class": "retour-q " + (juste ? "ok" : "ko"), role: "status" }, [el("strong", {}, [icone(juste ? "juste" : "faux"), juste ? "Exact" : "Pas tout à fait"]), q.explication ? el("p", { text: q.explication }) : null]);
    if (window.poserIcones) window.poserIcones(b);
    return b;
  }
  function rendreQuestion(q, rappel) {
    var z = el("div", { "class": "question" });
    if (q.type === "vraifaux") {
      z.appendChild(el("p", { "class": "enonce", text: q.affirmation }));
      var o = el("div", { "class": "options deux", role: "group", "aria-label": "Vrai ou faux" });
      [[true, "Vrai"], [false, "Faux"]].forEach(function (c) {
        var b = el("button", { "class": "option", type: "button", text: c[1] });
        b.addEventListener("click", function () {
          o.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
          var juste = c[0] === q.vrai;
          var bon = o.children[q.vrai ? 0 : 1]; bon.classList.add("juste");
          if (!juste) b.classList.add("faux");
          z.appendChild(retourQ(juste, q)); rappel(juste);
        });
        o.appendChild(b);
      });
      z.appendChild(o);
    } else if (q.type === "ordre") {
      var placees = [], n = q.ordre.length, valeurs = q.valeurs || {};
      z.appendChild(el("p", { "class": "enonce", text: q.enonce }));
      var rayon = el("div", { "class": "ordre" }), pioche = el("div", { "class": "options" });
      var valider = el("button", { "class": "btn", type: "button", text: "Valider l’ordre", disabled: "" });
      function dessiner() {
        rayon.innerHTML = "";
        for (var k = 0; k < n; k++) rayon.appendChild(el("div", { "class": "case" + (placees[k] ? " pleine" : "") }, [el("span", { "class": "num", text: String(k + 1) }), placees[k] ? el("span", { text: placees[k] }) : el("em", { text: k === 0 ? "En premier" : (k === n - 1 ? "En dernier" : "Ensuite") })]));
        pioche.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", placees.indexOf(b.dataset.nom) >= 0 ? "true" : "false"); b.style.opacity = placees.indexOf(b.dataset.nom) >= 0 ? "0.45" : "1"; });
        if (placees.length === n) valider.removeAttribute("disabled"); else valider.setAttribute("disabled", "");
      }
      q.elements.forEach(function (nom) {
        var b = el("button", { "class": "option", type: "button", "data-nom": nom, "aria-pressed": "false" }, [el("span", { text: nom })]);
        b.addEventListener("click", function () { var k = placees.indexOf(nom); if (k >= 0) placees.splice(k, 1); else if (placees.length < n) placees.push(nom); dessiner(); });
        pioche.appendChild(b);
      });
      valider.addEventListener("click", function () {
        var juste = placees.every(function (x, k) { return x === q.ordre[k]; });
        pioche.remove(); valider.remove(); rayon.innerHTML = "";
        q.ordre.forEach(function (nom, k) { var ok = placees[k] === nom; var t = el("span", {}, [nom + (valeurs[nom] ? ", " + valeurs[nom] : "")]); if (!ok) t.appendChild(el("small", { text: "Tu avais placé ici" + N + ": " + placees[k] })); rayon.appendChild(el("div", { "class": "case " + (ok ? "ok" : "ko") }, [el("span", { "class": "num", text: String(k + 1) }), t])); });
        z.appendChild(retourQ(juste, q)); rappel(juste);
      });
      z.appendChild(rayon); z.appendChild(pioche); z.appendChild(valider); dessiner();
    } else {
      z.appendChild(el("p", { "class": "enonce", text: q.enonce }));
      var opts = el("div", { "class": "options", role: "group", "aria-label": "Réponses" });
      q.reponses.forEach(function (rep, k) {
        var b = el("button", { "class": "option", type: "button" }, [el("span", { text: rep }), el("span", { "class": "fin" })]);
        b.addEventListener("click", function () {
          opts.querySelectorAll("button").forEach(function (x) { x.disabled = true; });
          var juste = k === q.bonne, bon = opts.children[q.bonne];
          bon.classList.add("juste"); bon.querySelector(".fin").appendChild(coche(false, "Bonne réponse"));
          if (!juste) { b.classList.add("faux"); b.querySelector(".fin").appendChild(icone("faux", "Ta réponse")); }
          if (window.poserIcones) window.poserIcones(opts);
          z.appendChild(retourQ(juste, q)); rappel(juste);
        });
        opts.appendChild(b);
      });
      z.appendChild(opts);
    }
    return z;
  }

  /* ---------- Quiz (commun à tous les modes) ---------- */
  function quiz(items, opt) {
    var k = 0, justes = 0, gagne = 0, rates = [];
    var points = el("div", { "class": "etapes-q", "aria-hidden": "true" });
    items.forEach(function () { points.appendChild(el("i")); });
    var scene = el("main", { "class": "pile" });
    var compteur = el("span", { "class": "meta" });
    var page = el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: opt.retour, "aria-label": "Quitter" }, [icone("fermer")]), points, compteur]), scene]);
    function afficher() {
      scene.innerHTML = ""; window.scrollTo(0, 0);
      compteur.textContent = Math.min(k + 1, items.length) + " / " + items.length;
      if (k >= items.length) return fin();
      var it = items[k];
      scene.appendChild(el("span", { "class": "sur", text: opt.titre + (it.titre ? " · " + it.titre : "") }));
      var suite = el("button", { "class": "btn", type: "button", hidden: "", text: k === items.length - 1 ? "Voir le résultat" : "Question suivante" });
      suite.addEventListener("click", function () { k += 1; afficher(); });
      scene.appendChild(rendreQuestion(it.question, function (juste) {
        points.children[k].className = juste ? "ok" : "ko";
        if (juste) { justes += 1; if (premiereReussite(it)) gagne += opt.xp; if (opt.erreurs) oublierErreur(it); }
        else { rates.push(it); if (!opt.sansErreurs) noterErreur(it); }
        suite.hidden = false; setTimeout(function () { suite.focus({ preventScroll: true }); suite.scrollIntoView({ block: "nearest" }); }, 0);
      }));
      scene.appendChild(suite);
      if (window.poserIcones) window.poserIcones(scene);
      var h = scene.querySelector(".enonce"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
    function fin() {
      var n = items.length, pct = Math.round(justes / Math.max(n, 1) * 100);
      compteur.textContent = ""; compteur.appendChild(puceXP());
      gagner(gagne, opt.parcours);
      var revoir = el("div", { "class": "pile" });
      rates.forEach(function (it) {
        var q = it.question;
        revoir.appendChild(el("details", { "class": "plier ligne" }, [el("summary", {}, [el("span", {}, [el("b", { text: it.titre || "Question" }), el("span", { "class": "meta", text: (q.enonce || q.affirmation || "").slice(0, 90) })]), icone("chevron")]), el("p", { "class": "meta", text: q.type === "qcm" ? "Réponse" + N + ": " + q.reponses[q.bonne] : q.type === "vraifaux" ? "Réponse" + N + ": " + (q.vrai ? "vrai" : "faux") : "Ordre" + N + ": " + q.ordre.join(" → ") }), q.explication ? el("p", { text: q.explication }) : null]));
      });
      scene.appendChild(el("span", { "class": "sur", text: opt.titre + " · résultat" }));
      scene.appendChild(el("h1", { text: pct === 100 ? "Sans faute" : pct >= 60 ? "Bien joué" : "À retravailler" }));
      scene.appendChild(el("div", { "class": "score" }, [el("strong", { text: justes + "/" + n }), el("span", { "class": "meta gain", text: "+" + gagne + N + "XP" })]));
      if (rates.length) { scene.appendChild(el("h2", { text: "À revoir" })); scene.appendChild(revoir); }
      var suite = el("div", { "class": "pile" });
      scene.appendChild(suite);
      if (opt.fin) opt.fin({ justes: justes, n: n, pct: pct, gagne: gagne }, suite);
      if (window.poserIcones) window.poserIcones(scene);
    }
    afficher();
    return page;
  }
  function questionsDe(l) { return (l.questions || []).map(function (q, i) { return { palier: l.id, titre: l.titre, index: i, question: q }; }); }
  function paliersEntre(p, a, b) {
    var l = [];
    for (var n = Math.max(1, a); n <= b; n++) l.push(chargerPalier(p.id, n).catch(function () { return null; }));
    return Promise.all(l).then(function (x) { return x.filter(Boolean); });
  }
  function vueQuiz(id, mode) {
    var s0 = suivi(id), k0 = parseInt(mode, 10);
    if (mode !== "direct" && (!(k0 > 0) || (s0.fait || 0) < k0)) { pageVerrou(id, "Ce quiz s’ouvre après le palier " + (k0 > 0 ? k0 : 5) + ".", (s0.fait || 0) + 1); return; }
    montrer(attente("Préparation du quiz…", true), null, "Quiz");
    chargerParcours(id).then(function (p) {
      var base = "#/p/" + encodeURIComponent(p.id), s = suivi(p.id);
      var k = parseInt(mode, 10), defi = /^defi/.test(location.hash.split("/")[3] || "");
      var preparer;
      if (mode === "direct") {
        preparer = p.verifie ? paliersEntre(p, 1, paliersPrevus(p)).then(function (ls) { return melanger([].concat.apply([], ls.map(questionsDe))).slice(0, 10); })
          : pretCompte().then(function () { return api("GET", "quiz?parcours=" + encodeURIComponent(p.id) + "&n=10&graine=" + Math.floor(Math.random() * 1e9)); }).then(function (j) {
            if ((j.questions || []).length >= 5) return j.questions;
            return api("POST", "quiz-direct", { parcours: p.id }, 100000).then(function (j2) { return j2.questions || []; });
          }).then(function (l) { return l.map(function (x) { return { palier: x.palier, titre: x.titre, index: x.index, question: x.question }; }); });
      } else {
        var debut = defi ? k - 9 : k - 4;
        preparer = paliersEntre(p, debut, k).then(function (ls) {
          return [].concat.apply([], ls.map(function (l) {
            var qs = questionsDe(l), verifIdx = (l.questions || []).findIndex(function (q) { return q.type === "qcm"; });
            var autres = qs.filter(function (x) { return x.index !== verifIdx; });
            return defi ? autres.slice(-1) : autres.slice(0, 2);
          }));
        }).then(function (l) { return melanger(l).slice(0, defi ? 10 : 8); });
      }
      preparer.then(function (items) {
        if (!items.length) { montrer(erreurPage("Pas encore assez de questions pour ce quiz.", "Quiz indisponible"), "accueil"); return; }
        var titre = mode === "direct" ? "Quiz direct" : (defi ? "Défi d’étape" : "Quiz des paliers " + (k - 4) + " à " + k);
        montrer(quiz(items, { titre: titre, retour: base, xp: defi ? XP.defi : XP.quiz, parcours: p.id, fin: function (res, zone) {
          if (mode !== "direct") { var s2 = suivi(p.id); s2.quiz = s2.quiz || {}; s2.quiz[k] = Math.max(s2.quiz[k] || 0, res.pct); etat.parcours[p.id] = s2; sauver(); }
          var prochain = mode !== "direct" && !((p.verifie || formationComplete(p)) && k >= paliersPrevus(p)) ? k + 1 : null;
          if (prochain) zone.appendChild(lienAvance(base + "/" + prochain, "Continuer · palier " + prochain, "btn"));
          zone.appendChild(lien(base + "/jeu/duel", "Défier un ami sur ce sujet", prochain ? "btn second" : "btn"));
          zone.appendChild(lien(base, "Retour au parcours"));
        } }), null, titre);
      }, function (e) { montrer(erreurPage(messageErreur(e), "Quiz indisponible"), "accueil"); });
    }, function (e) { montrer(erreurPage(messageErreur(e), "Quiz indisponible"), "accueil"); });
  }

  /* ---------- Mini-jeux et duels d'un parcours ---------- */
  function vueJeu(id, type) {
    montrer(attente("Préparation du jeu…", true), null, "Jeu");
    chargerParcours(id).then(function (p) {
      var base = "#/p/" + encodeURIComponent(p.id), s = suivi(p.id);
      if (s.fait < 5 && type !== "duel") { montrer(erreurPage("Ce jeu s’ouvre au palier 5.", "Pas encore"), "accueil"); return; }
      paliersEntre(p, 1, Math.max(s.fait, 1)).then(function (ls) {
        var toutes = [].concat.apply([], ls.map(questionsDe));
        if (type === "paires") return montrer(jeuPaires(p, ls), null, "Associe les notions");
        var items;
        if (type === "vraifaux") { items = melanger(toutes.filter(function (x) { return x.question.type === "vraifaux"; })).slice(0, 8); if (items.length < 3) items = []; }
        else if (type === "ordre") {
          var frises = ls.filter(function (l) { return (l.frise || []).length >= 3; });
          items = melanger(toutes.filter(function (x) { return x.question.type === "ordre"; })).slice(0, 3);
          frises.slice(0, 3 - items.length).forEach(function (l) { var f = melanger(l.frise).slice(0, 4); var ordre = f.slice().sort(function (a, b) { return l.frise.indexOf(a) - l.frise.indexOf(b); }); var v = {}; f.forEach(function (x) { v[x.evenement] = x.date; }); items.push({ palier: l.id, titre: l.titre, index: -1, question: { type: "ordre", enonce: "Range ces événements du plus ancien au plus récent.", elements: f.map(function (x) { return x.evenement; }), ordre: ordre.map(function (x) { return x.evenement; }), valeurs: v, explication: "Ordre des dates du palier " + guill(l.titre) + "." } }); });
        } else items = melanger(toutes).slice(0, 10);
        if (!items.length) { montrer(erreurPage("Pas assez de matière pour ce jeu dans tes paliers. Avance encore un peu.", "Jeu indisponible"), "accueil"); return; }
        var titres = { vraifaux: "Vrai ou faux express", ordre: "Remets dans l’ordre", duel: "Duel" };
        montrer(quiz(items, { titre: titres[type] || "Jeu", retour: base + "/defis", xp: type === "duel" ? XP.quiz : XP.jeu * 2, parcours: p.id, sansErreurs: type !== "duel", fin: function (res, zone) {
          if (type !== "duel") { zone.appendChild(lien(base + "/jeu/" + type, "Rejouer", "btn")); zone.appendChild(lien(base + "/defis", "Autres défis")); return; }
          creerDuel(items, res, zone, p);
        } }), null, titres[type] || "Jeu");
      });
    }, function (e) { montrer(erreurPage(messageErreur(e), "Jeu indisponible"), "accueil"); });
  }
  function jeuPaires(p, ls) {
    var base = "#/p/" + encodeURIComponent(p.id);
    var defs = melanger([].concat.apply([], ls.map(function (l) { return (l.definitions || []).concat(l.reperes || []); }))).slice(0, 4);
    if (defs.length < 3) return erreurPage("Pas assez de définitions dans tes paliers pour ce jeu. Avance encore un peu.", "Jeu indisponible");
    var gauche = melanger(defs), droite = melanger(defs), choix = null, trouves = 0, essais = 0;
    var zone = el("div", { "class": "paires" });
    var colG = el("div", { "class": "options" }), colD = el("div", { "class": "options" });
    var info = el("p", { "class": "meta", role: "status", text: "Touche un terme, puis sa définition." });
    var fin = el("div", { "class": "pile" });
    gauche.forEach(function (d) { var b = el("button", { "class": "option", type: "button", "aria-pressed": "false", text: d.terme }); b._d = d; b.addEventListener("click", function () { colG.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); }); b.setAttribute("aria-pressed", "true"); choix = b; }); colG.appendChild(b); });
    droite.forEach(function (d) { var b = el("button", { "class": "option", type: "button", text: d.definition.length > 110 ? d.definition.slice(0, 107) + "…" : d.definition }); b.addEventListener("click", function () {
      if (!choix) { info.textContent = "Choisis d’abord un terme à gauche."; return; }
      essais += 1;
      if (choix._d === d) { choix.classList.add("juste"); b.classList.add("juste"); choix.disabled = true; b.disabled = true; choix.setAttribute("aria-pressed", "false"); choix = null; trouves += 1; info.textContent = "Exact."; }
      else { b.classList.add("faux"); setTimeout(function () { b.classList.remove("faux"); }, 600); info.textContent = "Pas cette définition."; }
      if (trouves === defs.length) { var sj = suivi(p.id); sj.jeux = sj.jeux || {}; var g = sj.jeux.paires ? 0 : Math.max(0, defs.length * 2 * XP.jeu - (essais - defs.length) * XP.jeu); sj.jeux.paires = 1; etat.parcours[p.id] = sj; if (g) gagner(g, p.id); else sauver(); fin.appendChild(el("p", { "class": "score" }, [el("strong", { text: trouves + "/" + defs.length }), el("span", { "class": "meta gain", text: "+" + g + N + "XP · " + pluriel(essais, "essai", "essais") })])); fin.appendChild(lien(base + "/jeu/paires", "Rejouer", "btn")); fin.appendChild(lien(base + "/defis", "Autres défis")); }
    }); colD.appendChild(b); });
    zone.appendChild(colG); zone.appendChild(colD);
    return el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: base + "/defis", "aria-label": "Quitter" }, [icone("fermer")]), el("span"), puceXP()]), el("span", { "class": "sur", text: p.titre }), el("h1", { text: "Associe les notions" }), info, zone, fin]);
  }
  function creerDuel(items, res, zone, p) {
    var info = el("p", { "class": "meta", role: "status", text: "Enregistrement du duel…" });
    zone.appendChild(info);
    pretCompte().then(function () {
      if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
      return api("POST", "duel", { questions: items.map(function (x) { return { chapitre: x.palier, index: x.index }; }), score: { justes: res.justes, n: res.n, points: res.gagne } });
    }).then(function (j) {
      var url = location.origin + location.pathname + "#/duel/" + j.id;
      info.textContent = "Duel prêt. Tes amis auront les mêmes questions.";
      var b = el("button", { "class": "btn", type: "button" }, [icone("epee"), "Envoyer le duel"]);
      var r = el("p", { "class": "meta", role: "status" });
      b.addEventListener("click", function () { partager("Koîos", profil.pseudo + " te lance un duel sur " + guill(p ? p.titre : "Koîos") + F + ": " + res.justes + "/" + res.n + ". À toi.", url, function (t) { r.textContent = t; }); });
      zone.appendChild(b); zone.appendChild(r); zone.appendChild(lien("#/duel/" + j.id, "Voir le tableau du duel"));
      if (window.poserIcones) window.poserIcones(zone);
    }, function (e) { info.textContent = e.statut === 503 ? "Les duels demandent la connexion en ligne. Réessaie dans un moment." : messageErreur(e); });
  }
  function resoudre(refs) {
    return chargerQuestionsVerifiees().catch(function () { return []; }).then(function (pool) {
      return Promise.all(refs.map(function (r) {
        var t = pool.filter(function (x) { return x.palier === r.chapitre && x.index === r.index; })[0];
        if (t) return t;
        var m = /^(.+):(\d+)$/.exec(r.chapitre || "");
        if (m) return chargerPalier(m[1], parseInt(m[2], 10)).then(function (l) { var q = (l.questions || [])[r.index]; return q ? { palier: l.id, titre: l.titre, index: r.index, question: q } : null; }, function () { return null; });
        var mq = /^(.+):quiz$/.exec(r.chapitre || "");
        if (mq) return api("POST", "quiz-direct", { parcours: mq[1] }, 100000).then(function (j) { var x = (j.questions || [])[r.index]; return x ? { palier: r.chapitre, titre: x.titre, index: r.index, question: x.question } : null; }, function () { return null; });
        return null;
      }));
    }).then(function (l) { return l.filter(Boolean); });
  }
  function tableauDuel(d) {
    var ol = el("ol", { "class": "liste" });
    (d.scores || []).slice().sort(function (a, b) { return b.justes - a.justes || b.points - a.points; }).forEach(function (x, k) {
      ol.appendChild(el("li", {}, [el("div", { "class": "rangee", style: "grid-template-columns:28px 1fr auto;min-height:52px" }, [el("b", { text: String(k + 1) }), el("b", { text: x.pseudo + (x.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: x.justes + "/" + x.n })])]));
    });
    return ol;
  }
  function vueDuel(id) {
    montrer(attente("Ouverture du duel…", true), null, "Duel");
    pretCompte().then(function () { return api("GET", "duel?id=" + encodeURIComponent(id)); }).then(function (j) {
      var d = j.duel;
      var lancer = el("button", { "class": "btn", type: "button", text: "Relever le duel · " + pluriel((d.questions || []).length, "question", "questions") });
      lancer.addEventListener("click", function () {
        lancer.disabled = true;
        resoudre(d.questions || []).then(function (items) {
          montrer(quiz(items, { titre: "Duel", retour: "#/amis", xp: XP.quiz, fin: function (res, zone) {
            var info = el("p", { "class": "meta", role: "status", text: "Enregistrement de ton score…" });
            zone.appendChild(info);
            api("PUT", "duel", { id: d.id, score: { justes: res.justes, n: res.n, points: res.gagne } }).then(function () { return api("GET", "duel?id=" + encodeURIComponent(d.id)); }).then(function (j2) { info.textContent = ""; zone.appendChild(el("h2", { text: "Tableau du duel" })); zone.appendChild(tableauDuel(j2.duel)); zone.appendChild(lien("#/amis", "Retour aux amis", "btn second")); }, function (e) { info.textContent = messageErreur(e); });
          } }), null, "Duel");
        });
      });
      montrer(el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/amis" }, [icone("retour"), "Amis"]), el("span"), puceXP()]),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Duel" }), el("h1", { text: profil && d.createur === profil.pseudo ? "Ton duel" : d.createur + " te lance un duel" })]),
        d.dejaJoue ? el("p", { "class": "verrou" }, [icone("juste"), "Tu as déjà joué ce duel."]) : (enLigne() ? lancer : el("p", { "class": "alerte", text: "Les duels demandent la connexion en ligne. Réessaie dans un moment." })),
        el("h2", { text: "Tableau" }), tableauDuel(d)
      ]), null, "Duel");
    }, function (e) { montrer(erreurPage(e.statut === 404 ? "Ce duel n’existe pas." : messageErreur(e), "Duel indisponible"), "amis"); });
  }

  /* ---------- Jouer ---------- */
  function serieJours() { var n = 0, d = new Date(); if (!etat.jours[jour(d)]) d.setDate(d.getDate() - 1); while (etat.jours[jour(d)]) { n += 1; d.setDate(d.getDate() - 1); } return n; }
  function vueJour() {
    var d = aujourdhui();
    if (etat.jours[d]) { location.replace("#/jouer"); return; }
    montrer(attente("Préparation…", true), null, "Question du jour");
    chargerQuestionsVerifiees().then(function (pool) {
      var simples = pool.filter(function (x) { return x.question.type !== "ordre"; });
      var it = simples[Math.floor(hasard(parseInt(d.replace(/-/g, ""), 10))() * simples.length)];
      etat.jours[d] = "faux"; sauver();
      montrer(quiz([it], { titre: "Question du jour", retour: "#/jouer", xp: XP.quiz, fin: function (res, zone) {
        etat.jours[d] = res.justes ? "juste" : "faux"; sauver();
        zone.appendChild(el("p", { "class": "meta", text: "Série" + N + ": " + pluriel(serieJours(), "jour", "jours") + ". La prochaine arrive demain." }));
        zone.appendChild(lien("#/p/" + it.palier.split(":")[0], "Ouvrir ce parcours", "btn"));
        zone.appendChild(lien("#/jouer", "Retour aux jeux"));
      } }), null, "Question du jour");
    }, function () { montrer(erreurPage("Les questions ne se chargent pas.", "Indisponible"), "jouer"); });
  }
  function vueMelange() {
    montrer(attente("Mélange des questions…", true), null, "Quiz mélangé");
    chargerQuestionsVerifiees().then(function (pool) {
      var miens = Object.keys(etat.parcours).filter(function (id) { return !verifie(id) && suivi(id).fait > 0; }).slice(0, 4);
      return Promise.all(miens.map(function (id) { return paliersEntre({ id: id }, 1, Math.min(suivi(id).fait, 10)).then(function (ls) { return melanger([].concat.apply([], ls.map(questionsDe))).slice(0, 3); }); })).then(function (lots) {
        return melanger(melanger(pool).slice(0, 10 - Math.min(5, [].concat.apply([], lots).length)).concat([].concat.apply([], lots).slice(0, 5)));
      });
    }).then(function (items) {
      montrer(quiz(items.slice(0, 10), { titre: "Quiz mélangé", retour: "#/jouer", xp: XP.quiz, fin: function (res, zone) {
        zone.appendChild(lien("#/jeu/melange", "Rejouer", "btn"));
        var b = el("button", { "class": "btn second", type: "button", text: "Défier un ami avec ces questions" });
        b.addEventListener("click", function () { b.remove(); creerDuel(items.slice(0, 10), res, zone, null); });
        zone.appendChild(b);
      } }), null, "Quiz mélangé");
    }, function () { montrer(erreurPage("Les questions ne se chargent pas.", "Indisponible"), "jouer"); });
  }
  function vueErreurs() {
    if (!etat.erreurs.length) { location.replace("#/profil"); return; }
    montrer(attente("Préparation…", true), null, "Mes erreurs");
    resoudre(etat.erreurs.slice(-10).map(function (e) { return { chapitre: e.palier, index: e.index }; })).then(function (items) {
      montrer(quiz(items, { titre: "Revoir mes erreurs", retour: "#/profil", xp: XP.quiz, erreurs: true, fin: function (res, zone) { sauver(); zone.appendChild(lien("#/profil", "Retour au profil", "btn second")); } }), null, "Mes erreurs");
    });
  }
  /* Jouer : ce qui se joue seul (question du jour, quiz mélangé, erreurs à revoir, mini-jeux des formations). */
  function vueJouer() {
    var jourFait = etat.jours[aujourdhui()];
    var lignes = [
      el("li", {}, [el(jourFait ? "div" : "a", { "class": "rangee", href: jourFait ? null : "#/jeu/jour" }, [tuile("ampoule"), el("span", {}, [el("b", { text: "Question du jour" }), el("span", { "class": "meta", text: jourFait ? (jourFait === "juste" ? "Réussie. Reviens demain." : "Manquée. Reviens demain.") : "La même pour tous" + (serieJours() ? " · série de " + pluriel(serieJours(), "jour", "jours") : "") })]), jourFait ? icone("juste") : icone("chevron")])]),
      el("li", {}, [el("a", { "class": "rangee", href: "#/jeu/melange" }, [tuile("liste"), el("span", {}, [el("b", { text: "Quiz mélangé" }), el("span", { "class": "meta", text: "10 questions, tous sujets confondus" })]), icone("chevron")])])
    ];
    if (etat.erreurs.length) lignes.push(el("li", {}, [el("a", { "class": "rangee", href: "#/jeu/erreurs" }, [tuile("cerveau"), el("span", {}, [el("b", { text: "Revoir mes erreurs" }), el("span", { "class": "meta", text: pluriel(etat.erreurs.length, "question à revoir", "questions à revoir") })]), icone("chevron")])]));
    var defis = Object.keys(etat.parcours).filter(function (id) { return etat.parcours[id].titre && (etat.parcours[id].fait || 0) >= 5; });
    var ulDefis = el("ul", { "class": "liste" });
    defis.slice(0, 6).forEach(function (id) { var x = etat.parcours[id]; ulDefis.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/p/" + encodeURIComponent(id) + "/defis" }, [tuile(categorie(x.titre)), el("span", {}, [el("b", { text: x.titre }), el("span", { "class": "meta", text: "Vrai ou faux, associations, ordre" })]), icone("chevron")])])); });
    montrer(el("div", { "class": "page" }, [entete(), el("h1", { text: "Jouer" }), el("ul", { "class": "liste" }, lignes),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Mini‑jeux" }), defis.length ? ulDefis : el("p", { "class": "meta", text: "Les mini‑jeux d’une formation s’ouvrent au palier 5." })])
    ]), "jouer", "Jouer");
  }
  /* Amis : inviter, duels, classement. Le lot suivant y ajoutera les formations à plusieurs. */
  function vueAmis() {
    var classement = el("div", { "class": "pile" }, [el("p", { "class": "attente", text: "Chargement…" })]);
    var duels = el("div", { "class": "pile serree" });
    var info = el("p", { "class": "meta", role: "status" });
    var inviter = el("button", { "class": "btn", type: "button" }, [icone("invitation"), el("span", { text: "Inviter un ami" })]);
    inviter.addEventListener("click", function () { partager("Koîos", "Apprends n’importe quel sujet, palier par palier, et défie‑moi.", location.origin + "/", function (t) { info.textContent = t; }); });
    var pasDeDuel = function (texte) { duels.innerHTML = ""; duels.appendChild(etatVide("epee", texte, lien("#/", "Choisir une formation", "btn second petit"))); };
    montrer(el("div", { "class": "page" }, [entete(), el("h1", { text: "Amis" }),
      el("section", { "class": "pile serree" }, [el("p", { "class": "meta", style: "font-size:16px", text: "Envoie un lien : ton ami rejoint Koîos et peut relever tes duels." }), inviter, info]),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Duels" }), duels]),
      el("section", { "class": "pile serree" }, [el("div", { "class": "ligne-titre" }, [el("h2", { text: "Classement" }), el("span", { "class": "meta", text: "XP cumulés" })]), classement])
    ]), "amis", "Amis");
    pretServeur.then(function () {
      if (!serveur.base) { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Le classement s’affiche dès que le serveur répond." })); pasDeDuel("Les duels demandent la connexion en ligne."); return; }
      api("GET", "cercle").then(function (j) {
        classement.innerHTML = "";
        var ol = el("ol", { "class": "liste" });
        (j.joueurs || []).forEach(function (x, k) { ol.appendChild(el("li", {}, [el("div", { "class": "rangee", style: "grid-template-columns:28px 1fr auto;min-height:52px" }, [el("b", { text: String(k + 1) }), el("b", { text: x.pseudo + (x.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: x.points + N + "XP" })])])); });
        classement.appendChild((j.joueurs || []).length ? ol : el("p", { "class": "meta", text: "Personne n’a encore d’XP." }));
      }, function () { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Classement indisponible pour l’instant." })); });
      if (!enLigne()) { pasDeDuel("Les duels demandent la connexion en ligne."); return; }
      api("GET", "duels").then(function (j) {
        var liste = (j.duels || []).slice(0, 8);
        if (!liste.length) { pasDeDuel("Aucun duel pour l’instant. Lance‑en un depuis l’onglet Défis d’une formation."); return; }
        var ul = el("ul", { "class": "liste" });
        liste.forEach(function (d) {
          var moi = profil && d.createur === profil.pseudo;
          ul.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/duel/" + d.id }, [tuile("epee"), el("span", {}, [el("b", { text: moi ? "Duel lancé par toi" : "Duel de " + d.createur }), el("span", { "class": "meta", text: (moi ? "Envoyé" : "Reçu") + " · " + pluriel((d.scores || []).length, "joueur", "joueurs") })]), icone("chevron")])]));
        });
        duels.innerHTML = ""; duels.appendChild(ul);
      }, function () { pasDeDuel("Les duels ne se chargent pas pour l’instant."); });
    });
  }

  /* ---------- Profil ---------- */
  function vueProfil() {
    var n = niveau(etat.xp || 0);
    var paliers = Object.keys(etat.parcours).reduce(function (s, id) { return s + (etat.parcours[id].fait || 0); }, 0);
    var sujets = Object.keys(etat.parcours).filter(function (id) { return etat.parcours[id].fait > 0; }).length;
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", value: profil.pseudo });
    champ.addEventListener("change", function () { var p = champ.value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24); if (!p) { champ.value = profil.pseudo; return; } profil.pseudo = p; S.ecrire("koios.profil", profil); pousser(); toast("Nom enregistré."); });
    var sync = el("p", { "class": "meta" }), cleZone = el("div", { "class": "pile" });
    function majSync() {
      var ok = enLigne();
      sync.textContent = ok ? "Progression enregistrée en ligne." : "Progression enregistrée sur cet appareil.";
      cleZone.innerHTML = "";
      if (ok) {
        var montre = el("button", { "class": "btn second", type: "button", text: "Afficher ma clé de connexion" });
        montre.addEventListener("click", function () { var c = profil.id + "." + profil.cle; montre.replaceWith(el("div", { "class": "pile serree" }, [el("p", { "class": "cle-lecteur", text: c }), el("p", { "class": "meta", text: "Cette clé ouvre ta progression sur un autre appareil. Garde‑la pour toi." })])); });
        cleZone.appendChild(montre);
      }
      if (serveur.base) {
        var saisie = el("input", { "class": "champ", type: "text", autocomplete: "off", placeholder: "Colle ici ta clé", "aria-label": "Clé de connexion" });
        var bout = el("button", { "class": "btn second", type: "button", text: "Retrouver ma progression" });
        var al = el("p", { "class": "alerte", hidden: "", role: "status" });
        bout.addEventListener("click", function () {
          var c = saisie.value.trim();
          if (!/^[a-z0-9]+\.[A-Za-z0-9]+$/.test(c)) { al.textContent = "Cette clé n’a pas le bon format."; al.hidden = false; return; }
          api("GET", "progression", null, 8000, c).then(function (j) { var x = c.split("."); profil.id = x[0]; profil.cle = x[1]; if (j.pseudo) profil.pseudo = j.pseudo; S.ecrire("koios.profil", profil); etat = fusion(etat, j.etat); sauver(); toast("Progression retrouvée."); vueProfil(); }, function (e) { al.textContent = e.statut === 401 ? "Clé inconnue." : "Impossible pour l’instant."; al.hidden = false; });
        });
        cleZone.appendChild(el("details", { "class": "plier" }, [el("summary", { text: "J’ai déjà une clé" }), el("div", { "class": "pile" }, [saisie, bout, al])]));
      }
    }
    var pct = Math.max(0, Math.min(100, Math.round(((etat.xp || 0) - n.base) / (n.suivant - n.base) * 100)));
    var anneau = el("div", { "class": "anneau", role: "img", "aria-label": "Niveau " + n.niveau + ", " + pct + F + "% du chemin vers le niveau " + (n.niveau + 1), html:
      "<svg viewBox='0 0 120 120' focusable='false' aria-hidden='true'><circle class='piste' cx='60' cy='60' r='52' pathLength='100'/><circle class='arc" + (pct ? "" : " zero") + "' cx='60' cy='60' r='52' pathLength='100' style='stroke-dashoffset:" + (100 - pct) + "'/></svg>" +
      "<div class='anneau-centre' aria-hidden='true'><span class='sur'>Niveau</span><strong>" + n.niveau + "</strong></div>" });
    montrer(el("div", { "class": "page bandes" }, [
      bande([entete(),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Profil" }), el("h1", { text: profil.pseudo })]),
        el("div", { "class": "profil-niveau" }, [anneau, el("p", { "class": "meta", style: "text-align:center", text: (n.suivant - (etat.xp || 0)) + N + "XP avant le niveau " + (n.niveau + 1) + " · " + (etat.xp || 0) + N + "XP au total" })]),
        el("div", { "class": "chiffres-cles" }, [el("div", {}, [el("strong", { text: String(paliers) }), el("span", { "class": "meta", text: paliers > 1 ? "Leçons faites" : "Leçon faite" })]), el("div", {}, [el("strong", { text: String(sujets) }), el("span", { "class": "meta", text: sujets > 1 ? "Sujets suivis" : "Sujet suivi" })]), el("div", {}, [el("strong", { text: String(serieJours()) }), el("span", { "class": "meta", text: "Jours de suite" })])])], true),
      bande([
        etat.erreurs.length ? lienAvance("#/jeu/erreurs", "Revoir mes erreurs (" + etat.erreurs.length + ")", "btn") : etatVide("juste", "Aucune erreur à revoir pour l’instant.", lien("#/jeu/melange", "Faire un quiz mélangé", "btn second petit")),
        el("ul", { "class": "liste" }, [el("li", {}, [el("a", { "class": "rangee", href: "#/aide" }, [tuile("aide"), el("span", {}, [el("b", { text: "Comment ça marche" }), el("span", { "class": "meta", text: "Leçons, quiz, XP, sources et limites" })]), icone("chevron")])])]),
        el("section", { "class": "pile" }, [el("h2", { text: "Réglages" }), el("label", { "for": "pseudo", "class": "sur", text: "Nom affiché" }), champ, sync, cleZone]),
        el("p", { "class": "credit", text: "Koîos · leçons vérifiées par la rédaction ou recoupées par deux IA à partir de sources ouvertes · photos Wikimédia Commons et Unsplash · icônes Phosphor (MIT)" })
      ], false)
    ]), "profil", "Profil");
    majSync(); pretServeur.then(majSync);
  }

  /* ---------- Comment ça marche ---------- */
  function rubriqueAide(nomIcone, titre, enfants) {
    return el("details", { "class": "plier ligne" }, [
      el("summary", {}, [el("span", { "class": "aide-titre" }, [icone(nomIcone), el("h2", { text: titre })]), icone("chevron")]),
      el("div", { "class": "aide-corps" }, enfants)
    ]);
  }
  function listeAide(items) { var ul = el("ul", { "class": "aide-liste" }); items.forEach(function (i) { ul.appendChild(el("li", {}, [].concat(i))); }); return ul; }
  function gainAide(n) { return el("span", { "class": "gain", text: "+" + n + N + "XP" }); }
  function vueAide() {
    var haut = profil ? entete() : el("div", { "class": "pile serree" }, [el("header", { "class": "haut" }, [marque(true)]), el("a", { "class": "retour-texte", href: "#/accueil" }, [icone("retour"), "Retour"])]);
    var rubriques = el("div", { "class": "aide-rubriques" }, [
      rubriqueAide("livres", "Une formation", [
        el("p", { text: "Tape un sujet. L’app écrit un programme en 4 niveaux" + N + ": Bases, Intermédiaire, Avancé, Expert." }),
        el("p", { text: "Chaque niveau a des modules. Chaque module compte 5 à 10 leçons." }),
        el("p", { text: "Les leçons s’ouvrent dans l’ordre et s’appuient sur les précédentes. Tu peux relire toutes les leçons déjà faites depuis le sommaire." })
      ]),
      rubriqueAide("livre", "Une leçon", [
        el("p", { text: "Une leçon réunit" + N + ":" }),
        listeAide(["l’essentiel en bref", guill("À retenir"), "les explications" + N + ": comment, pourquoi, où et quand", "les définitions", "une frise ou des chiffres", "un moyen de s’en souvenir, quand il y en a un", "les sources", "une question pour vérifier que tu as compris"]),
        el("p", { text: "Les mots déjà vus sont soulignés" + N + ": touche‑les pour revoir leur définition." })
      ]),
      rubriqueAide("carnet", "Le glossaire", [
        el("p", { text: "Dans chaque formation, l’onglet Glossaire réunit les mots définis dans les leçons déjà faites. Une recherche t’aide à retrouver un mot." })
      ]),
      rubriqueAide("trophee", "Quiz et défis", [
        listeAide(["Un quiz toutes les 5 leçons.", "Un défi d’étape toutes les 10 leçons.", "Le quiz direct est toujours ouvert."]),
        el("p", { text: "Chaque réponse est expliquée, qu’elle soit juste ou fausse. Tes erreurs sont gardées pour être revues." })
      ]),
      rubriqueAide("diplome", "L’XP", [
        el("p", { text: "Tu gagnes de l’XP en avançant" + N + ":" }),
        listeAide([["Une leçon terminée" + N + ": ", gainAide(XP.palier)], ["La question de vérification d’une leçon" + N + ": ", gainAide(XP.verif)], ["Une question de quiz" + N + ": ", gainAide(XP.quiz)], ["Une question de défi d’étape" + N + ": ", gainAide(XP.defi)], ["Une bonne réponse dans un mini‑jeu" + N + ": ", gainAide(XP.jeu * 2)]]),
        el("p", { text: "Une question ne rapporte de l’XP qu’une seule fois. Les niveaux demandent de plus en plus d’XP." })
      ]),
      rubriqueAide("verifie", "D’où viennent les informations", [
        el("p", { text: "Les parcours au badge " + guill("Vérifié") + " ont été recoupés à la main. Chaque fait a au moins deux sources indépendantes, dont une institutionnelle." }),
        el("p", { text: "Les autres formations sont rédigées par une IA (GLM) à partir d’extraits de Wikipédia en français et en anglais. Une deuxième IA, d’un autre fournisseur, contrôle chaque affirmation contre ces extraits. Ce qui n’est pas confirmé est retiré." }),
        listeAide([["Badge " + guill("Recoupé automatiquement") + N + ": la deuxième IA a tout confirmé."], ["Badge " + guill("Recoupé en partie") + N + ": des affirmations ont été retirées."]]),
        el("p", { text: "Il n’y a pas de relecture humaine pour ces formations. Garde un œil critique et consulte les sources en bas de chaque leçon." }),
        el("p", { text: "Les photos viennent de Wikimédia Commons ou d’Unsplash, avec leur crédit et leur licence." })
      ]),
      rubriqueAide("cercle", "Avec tes amis", [
        el("p", { text: "L’onglet Amis réunit ce qui se fait à plusieurs. L’onglet Jouer garde la question du jour, le quiz mélangé et les mini‑jeux." }),
        listeAide([
          ["Question du jour" + N + ": la même pour tous. Les jours de réponse qui se suivent forment ta série."],
          ["Quiz mélangé" + N + ": 10 questions sur tous les sujets."],
          ["Duel" + N + ": lance‑le depuis l’onglet Défis d’un sujet ou depuis le quiz mélangé. Envoie le lien à un ami" + N + ": il a les mêmes questions que toi, et le tableau du duel compare vos scores. Les duels demandent la connexion en ligne."],
          ["Classement" + N + ": les joueurs, classés selon leurs XP cumulés, dans l’onglet Amis."],
          ["Inviter" + N + ": un lien à partager pour faire venir un ami dans Koîos."]
        ])
      ]),
      rubriqueAide("profil", "Ton compte", [
        el("p", { text: "Ta progression est gardée sur ton téléphone et synchronisée. La clé de connexion, dans le Profil, te permet de la retrouver sur un autre appareil. Garde‑la pour toi." })
      ]),
      rubriqueAide("sablier", "Limites", [
        el("p", { text: "Une leçon nouvelle peut prendre jusqu’à une minute la première fois. Ensuite elle s’ouvre tout de suite, pour tout le monde." }),
        el("p", { text: "Chaque jour, une personne peut lancer " + pluriel(LIMITES.formations, "nouvelle formation", "nouvelles formations") + " et " + pluriel(LIMITES.lecons, "nouvelle leçon", "nouvelles leçons") + "." }),
        el("p", { text: "L’IA peut se tromper." })
      ])
    ]);
    montrer(el("div", { "class": "page aide" + (profil ? "" : " plein") }, [haut,
      el("h1", { text: "Comment ça marche" }),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Le but" }), el("p", { "class": "aide-intro", text: "Koîos t’aide à apprendre n’importe quel sujet, des bases jusqu’au niveau expert. Tu avances par leçons courtes. Ensuite tu retiens en jouant, seul ou avec tes amis." })]),
      rubriques
    ]), profil ? "aide" : null, "Comment ça marche");
  }

  /* ---------- Routeur ---------- */
  function route() {
    var p = location.hash.replace(/^#\/?/, "").split("/").map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    fermerFiche(false);
    if (!profil && p[0] !== "aide") { if (p[0] !== "accueil") apresAccueil = location.hash || "#/"; return vueAccueil(); }
    switch (p[0]) {
      case "": case "accueil": return vueMaison();
      case "p":
        if (!p[1]) return vueMaison();
        if (!p[2] || p[2] === "quiz" && !p[3] || p[2] === "defis" || p[2] === "glossaire") return vueParcours(p[1], p[2] === "defis" ? "defis" : p[2] === "quiz" ? "quiz" : p[2] === "glossaire" ? "glossaire" : null);
        if (p[2] === "quiz" || p[2] === "defi") return vueQuiz(p[1], p[3]);
        if (p[2] === "jeu") return vueJeu(p[1], p[3]);
        return vuePalier(p[1], Math.max(1, parseInt(p[2], 10) || 1));
      case "jeu": return p[1] === "jour" ? vueJour() : p[1] === "erreurs" ? vueErreurs() : vueMelange();
      case "duel": return vueDuel(p[1]);
      case "jouer": return vueJouer();
      case "amis": return vueAmis();
      case "profil": return vueProfil();
      case "aide": return vueAide();
      default: location.hash = "#/";
    }
  }
  window.addEventListener("hashchange", route);
  route();
  pretServeur.then(synchroniser).then(function () { var h = location.hash.replace(/^#\/?/, ""); if (profil && (h === "" || h === "profil")) route(); });
})();
