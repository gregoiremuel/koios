/* Koîos v2 : apprendre n'importe quel sujet, palier par palier. Blanc et net, une seule page, sans étape de construction.
   Vues : accueil (première visite), maison, parcours (paliers, quiz, défis), palier (leçon), quiz, mini-jeux, duel, jouer, profil. */
(function () {
  "use strict";
  var F = " ", N = " ";
  var SUGGESTIONS = ["La Vendée", "Les volcans", "Le cinéma de Kubrick", "La philosophie stoïcienne", "Les fonds marins"];
  var XP = { palier: 10, verif: 5, quiz: 5, defi: 10, jeu: 2 };
  var LIMITES = { formations: 10, lecons: 30, quizDirect: 10, formationsTotal: 80, leconsTotal: 300, blocs: 25, blocsTotal: 150, prolonger: 5, prolongerTotal: 40, signalements: 5 }; // par jour : voir functions/api/parcours.js, palier.js, quiz-direct.js, quiz-general.js (un bloc = 10 questions)
  var L = window.Logique; // règles pures : révision espacée, jours actifs, badges, cours vérifiés (app/logique.js)

  /* ---------- Mémoire locale ---------- */
  var S = {
    lire: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    ecrire: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* mémoire seule */ } }
  };
  var profil = S.lire("koios.profil", null);
  try { localStorage.removeItem("koios.profondeur"); } catch (e) { /* mémoire seule */ } // lot 11 : plus de mode « Essentiel », l'ancien réglage est ignoré et retiré
  try { localStorage.removeItem("koios.admin"); } catch (e) { /* mémoire seule */ } // la clé admin ne reste plus sur le téléphone : le rôle admin est porté par le compte
  var etat = S.lire("koios.etat", null);
  var toutNeuf = !etat; // première visite : les premiers badges sont annoncés
  if (!etat || etat.version !== 2) etat = { version: 2, xp: 0, parcours: {}, erreurs: [], jours: (etat && etat.jours) || {}, maj: 0 };
  ["parcours", "jours"].forEach(function (k) { if (!etat[k]) etat[k] = {}; });
  if (!etat.erreurs) etat.erreurs = [];
  if (!etat.reussies) etat.reussies = {};
  if (!etat.cartes) etat.cartes = {};
  if (!etat.revisions) etat.revisions = {}; // { clé: { boite, prochaine, xp? } } : révision espacée
  if (!etat.faits) etat.faits = {}; // { duel, direct } : dates des premières parties
  if (!etat.badges) etat.badges = toutNeuf ? {} : null; // { id: date } une fois suivis ; null = pas encore suivis (premier calcul sans annonce)
  etat.jours = L.normaliserJours(etat.jours); // lit l'ancien format (une chaîne par jour)
  var verifiees = []; // catalogue des formations vérifiées à la main (contenu/parcours.json), chargé au démarrage
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
  /* Une photo ne s'affiche qu'avec son auteur et sa licence : seules celles de Commons ou d'Unsplash passent. Les anciennes images de Wikipédia, sans crédit complet, sont ignorées. */
  function imageOk(img) { return img && img.src && img.credit && (img.source === "commons" || img.source === "unsplash" || img.source === "fixe") ? img : null; }
  /* Cours vérifié à la main qui correspond au titre d'une formation (même règle partout) : le même titre, ou un titre qui contient le mot clé
     d'un domaine vérifié (histoire ou géographie, sciences ou nature, art ou culture, gemmologie, joaillerie ou pierres), sans accents. */
  function verifieeDeTitre(titre) {
    var k = normaliser(titre), exact = verifiees.filter(function (x) { return normaliser(x.titre) === k; })[0];
    if (exact) return exact;
    var id = L.domaineVerifie(titre);
    return id ? verifiees.filter(function (x) { return x.id === id; })[0] || null : null;
  }
  /* Photo imposée par le contenu (imageFixe : { src, credit, lien }) : elle prime sur toute recherche. Vide ou incomplète : ignorée. */
  function imageFixe(p) {
    var f = p && p.imageFixe;
    if (!f && p && !p.verifie && p.titre) { var v = verifieeDeTitre(p.titre); f = v && v.imageFixe; }
    if (!f || typeof f.src !== "string" || typeof f.credit !== "string" || !f.src.trim() || !f.credit.trim()) return null;
    if (!/^(https:\/\/|\/|contenu\/|images\/)/.test(f.src.trim())) return null;
    return { src: f.src.trim(), credit: f.credit.trim(), lien: typeof f.lien === "string" && /^https:\/\//.test(f.lien) ? f.lien : null, source: "fixe" };
  }
  /* Requête de photo d'une formation : motImage (anglais, précis), sinon le titre. */
  function requetePhoto(p) { return (p && p.motImage) || (p && p.titre) || ""; }
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
  /* Teinte d'une catégorie (t1 bleu, t2 turquoise, t3 ocre, t4 rose corail, t5 bleu nuit, t6 olive), d'après le nom de son icône. Une icône de rôle sans catégorie prend une teinte stable tirée de son nom. */
  var TEINTES_ICONE = {
    atome: "t1", puce: "t1", courbe: "t1", langues: "t1", livres: "t1", aide: "t1", eclair: "t1",
    feuille: "t2", montagne: "t2", globe: "t2", carte: "t2", liste: "t2", carnet: "t2",
    histoire: "t3", litterature: "t3", livre: "t3", ampoule: "t3",
    diamant: "t5", pinceau: "t4", clap: "t4", musique: "t4", epee: "t4",
    cerveau: "t6", chemin: "t5", medaille: "t5",
    ballon: "t6", marmite: "t3", sablier: "t6", pousse: "t6"
  };
  var ORDRE_TEINTES = ["t1", "t2", "t3", "t5", "t6", "t4"];
  function teinte(nom) {
    if (TEINTES_ICONE[nom]) return TEINTES_ICONE[nom];
    var h = 0; String(nom || "").split("").forEach(function (c) { h += c.charCodeAt(0); });
    return ORDRE_TEINTES[h % ORDRE_TEINTES.length];
  }
  function teinteSujet(titre) { return teinte(categorie(titre)); }
  /* Tuile d'icône (48 px) : catégorie d'un sujet, ou rôle d'une rangée. */
  function tuile(nom) { return el("span", { "class": "tuile " + teinte(nom), "aria-hidden": "true" }, [icone(nom)]); }
  /* Vignette d'une liste : photo (48 px, décorative) si l'image est connue, sinon la tuile de la catégorie du sujet. */
  function vignette(img, titre) {
    var t = tuile(categorie(titre));
    if (!imageOk(img)) return t;
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
  /* Clé IA personnelle ({ f: fournisseur, c: clé }) : gardée sur ce téléphone seulement (jamais dans l'état synchronisé). Elle part dans l'en-tête
     x-cle-ia vers les routes qui rédigent (formation, leçon, version réécrite, quiz), et nulle part ailleurs. Jamais affichée ni écrite dans la page. */
  function cleIA() { var c = S.lire("koios.cleia", null); return c && typeof c.f === "string" && typeof c.c === "string" && c.c ? c : null; }
  function api(methode, chemin, corps, delai, cle, extra) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, delai || 8000) : null;
    var h = { "Content-Type": "application/json" };
    var c = cle || (profil && profil.id ? profil.id + "." + profil.cle : null);
    if (c) h.Authorization = "Bearer " + c;
    var perso = cleIA();
    if (perso && ((methode === "POST" && /^(parcours|quiz-general|question)(\?|$)/.test(chemin)) || (methode === "GET" && /^palier\?/.test(chemin)))) h["x-cle-ia"] = perso.f + ":" + perso.c;
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
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
  function sauver() { etat.maj = Date.now(); S.ecrire("koios.etat", etat); pousser(); verifierBadges(); }
  function pousser() {
    if (!enLigne()) return;
    clearTimeout(minuterieSync);
    minuterieSync = setTimeout(function () {
      var envoye = etat.xp || 0;
      api("PUT", "progression", { pseudo: profil.pseudo, ton: "sobre", etat: etat }).then(function (j) {
        /* Anti-triche : le serveur ramène l'XP à ce que l'état prouve. On ne retire de l'XP que pour « plausible » ; le plafond du jour
           freine le rythme côté serveur, jamais le total affiché (la fusion garde le maximum). */
        if (j && typeof j.xp === "number" && j.xp < envoye && j.raison === "plausible") {
          etat.xp = Math.max(0, (etat.xp || 0) - (envoye - j.xp)); S.ecrire("koios.etat", etat);
          Array.prototype.forEach.call(document.querySelectorAll(".xp"), majPuce);
        }
      }, function (e) { if (e.statut === 413 && !pousser.prevenu) { pousser.prevenu = true; toast("Synchronisation impossible" + N + ": progression trop volumineuse. Elle reste sur cet appareil."); } });
    }, 700);
  }
  /* Cartes de révision : { "<formation>:<leçon>:<k>": { vu: instant, ok: vrai | faux | null } }. Les plus anciennes partent au-delà de 1 000, pour que l'état reste sous la limite de synchronisation. */
  var CARTES_MAX = 1000;
  function elaguerCartes(o) {
    var cles = Object.keys(o);
    if (cles.length <= CARTES_MAX) return;
    cles.sort(function (x, y) { return o[x].vu - o[y].vu; }).slice(0, cles.length - CARTES_MAX).forEach(function (k) { delete o[k]; if (o === etat.cartes) delete etat.revisions[k]; });
  }
  /* Une carte vue : notée dans etat.cartes. Sa première vue la met en révision espacée (boîte 1, à revoir demain). */
  function marquerCarte(id, ok) {
    var c = etat.cartes[id];
    etat.cartes[id] = { vu: Date.now(), ok: ok === undefined ? (c && c.ok !== undefined ? c.ok : null) : ok };
    if (!etat.revisions[id]) etat.revisions[id] = L.nouvelleEntree(aujourdhui());
    elaguerCartes(etat.cartes);
  }
  function noterCarte(id, ok) { marquerCarte(id, ok); sauver(); }
  /* Une réponse de révision (« Je savais » ou « À revoir ») : boîte suivante ou retour en boîte 1, jour actif, 1 XP au plus par élément et par jour.
     Une question ratée qui atteint la boîte 3 sort de la liste des erreurs. Renvoie l'XP gagnée (0 ou 1). */
  function reponseRevision(cle, ok) {
    var r = L.repondre(etat.revisions[cle], ok, aujourdhui());
    etat.revisions[cle] = r.entree;
    if (cle.indexOf("#") < 0) marquerCarte(cle, ok);
    else if (ok && r.entree.boite >= 3) { etat.erreurs = etat.erreurs.filter(function (e) { return e.palier + "#" + e.index !== cle; }); delete etat.revisions[cle]; }
    noterJour("revision");
    if (r.xp) gagner(r.xp); else sauver();
    return r.xp;
  }
  function fusion(a, b) {
    if (!b || b.version !== 2) return a;
    var r = { version: 2, xp: Math.max(a.xp || 0, b.xp || 0), parcours: {}, erreurs: [], jours: {}, maj: Math.max(a.maj || 0, b.maj || 0) };
    Object.keys(a.parcours).concat(Object.keys(b.parcours || {})).forEach(function (id) {
      var x = a.parcours[id], y = (b.parcours || {})[id];
      if (!x || !y) { r.parcours[id] = x || y; return; }
      var q = {}; [x.quiz || {}, y.quiz || {}].forEach(function (o) { Object.keys(o).forEach(function (k) { q[k] = Math.max(q[k] || 0, o[k]); }); });
      r.parcours[id] = { titre: x.titre || y.titre, image: x.image || y.image, fait: Math.max(x.fait || 0, y.fait || 0), xp: Math.max(x.xp || 0, y.xp || 0), quiz: q, jeux: Object.assign({}, x.jeux || {}, y.jeux || {}), total: x.total || y.total, date: (x.date || "") > (y.date || "") ? x.date : y.date, mods: Math.max(x.mods || 0, y.mods || 0), bases: Math.max(x.bases || 0, y.bases || 0), tests: L.fusionnerTests(x.tests, y.tests) };
    });
    var vus = {};
    (a.erreurs || []).concat(b.erreurs || []).forEach(function (e) { var k = e.palier + "#" + e.index; if (!vus[k]) { vus[k] = 1; r.erreurs.push(e); } });
    r.erreurs = r.erreurs.slice(-100);
    r.reussies = {}; [a.reussies || {}, b.reussies || {}].forEach(function (o) { Object.keys(o).forEach(function (k) { r.reussies[k] = 1; }); });
    r.cartes = {};
    [a.cartes || {}, b.cartes || {}].forEach(function (o) { Object.keys(o).forEach(function (k) { var c = o[k]; if (c && typeof c.vu === "number" && (!r.cartes[k] || c.vu > r.cartes[k].vu)) r.cartes[k] = { vu: c.vu, ok: c.ok === true ? true : c.ok === false ? false : null }; }); });
    elaguerCartes(r.cartes);
    r.jours = L.fusionnerJours(a.jours, b.jours);
    r.revisions = L.fusionnerRevisions(a.revisions, b.revisions);
    L.elaguerRevisions(r);
    r.faits = {};
    [a.faits || {}, b.faits || {}].forEach(function (o) { Object.keys(o).forEach(function (k) { if (typeof o[k] === "string" && (!r.faits[k] || o[k] < r.faits[k])) r.faits[k] = o[k]; }); });
    r.badges = L.fusionnerBadges(a.badges, b.badges);
    return r;
  }
  /* Plus de profil anonyme créé en silence : on entre par un compte (voir « Comptes »). Gardé pour les appels qui attendent le serveur. */
  function creerJoueur() { return Promise.resolve(); }
  function synchroniser() {
    if (!profil || !profil.id) return Promise.resolve();
    return api("GET", "compte").then(function (c) { majProfilCompte(c); return api("GET", "progression"); })
      .then(function (j) { etat = fusion(etat, j.etat); S.ecrire("koios.etat", etat); pousser(); },
        function (e) { if (e.statut === 401) perdreSession(); else if (e.statut === 403) toast(e.message); });
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
    etat.erreurs.slice(0, -100).forEach(function (e) { delete etat.revisions[e.palier + "#" + e.index]; });
    etat.erreurs = etat.erreurs.slice(-100);
    if (it.index >= 0) etat.revisions[k] = L.nouvelleEntree(aujourdhui()); // une erreur revient en boîte 1, à revoir demain
  }
  function premiereReussite(it) { // l'XP d'une question ne se gagne qu'une fois
    var k = it.palier + "#" + it.index;
    if (etat.reussies[k]) return false;
    etat.reussies[k] = 1;
    var cles = Object.keys(etat.reussies);
    if (cles.length > 3000) delete etat.reussies[cles[0]];
    return true;
  }
  function oublierErreur(it) { var k = it.palier + "#" + it.index; etat.erreurs = etat.erreurs.filter(function (e) { return e.palier + "#" + e.index !== k; }); delete etat.revisions[k]; }
  /* Jour actif : type = « lecon », « revision », « quiz » ou « jour » (valeur « juste » ou « faux » pour la question du jour). Compte pour la série. */
  function noterJour(type, valeur) {
    var d = aujourdhui(), j = L.jourNormal(etat.jours[d]);
    if (type === "jour") j.jour = valeur === "juste" ? "juste" : "faux"; else j[type] = 1;
    etat.jours[d] = j;
  }
  function jourFait(d) { return L.jourNormal(etat.jours[d]).jour || null; } // « juste », « faux » ou null : la question du jour de cette date
  function serieJours() { return L.serieActuelle(etat.jours, aujourdhui()); }
  /* Première fois qu'on joue ou lance un duel ou un salon (« duel »), qu'on termine une partie en direct (« direct ») : gardée pour les badges. */
  function noterFait(cle) { if (!etat.faits[cle]) { etat.faits[cle] = aujourdhui(); sauver(); } }
  /* Badges : calculés sur les données réelles (jamais accordés d'avance), annoncés une seule fois par un petit toast.
     Au premier suivi, ce qui est déjà acquis est noté sans annonce (date vide : on ne l'invente pas). */
  function verifierBadges() {
    var liste = L.calculerBadges(etat, aujourdhui());
    if (!etat.badges) {
      etat.badges = {};
      liste.forEach(function (b) { if (b.obtenu) etat.badges[b.id] = ""; });
      S.ecrire("koios.etat", etat); pousser();
      return;
    }
    var neufs = liste.filter(function (b) { return b.obtenu && etat.badges[b.id] === undefined; });
    if (!neufs.length) return;
    neufs.forEach(function (b) { etat.badges[b.id] = aujourdhui(); });
    S.ecrire("koios.etat", etat); pousser();
    neufs.forEach(toastBadge);
  }
  function toastBadge(b) {
    var zone = document.getElementById("toasts-badges");
    if (!zone) { zone = el("div", { id: "toasts-badges", "class": "toasts-badges" }); document.body.appendChild(zone); }
    var t = el("div", { "class": "toast-badge " + b.teinte, role: "status" }, [
      el("span", { "class": "badge-rond", "aria-hidden": "true" }, [icone(b.icone)]),
      el("span", { "class": "toast-badge-texte" }, [el("span", { "class": "sur", text: "Badge obtenu" }), el("b", { text: b.nom })])
    ]);
    zone.appendChild(t);
    setTimeout(function () { t.classList.add("sort"); setTimeout(function () { t.remove(); }, 250); }, 4000);
  }

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
  /* Une photo gardée n'est conservée que si elle vient de la requête actuelle du parcours (sinon une ancienne photo hors sujet resterait). */
  /* Modules finis et premier niveau (Novice) fini d'une formation par niveaux, d'après les leçons faites (pour les badges). Jamais à la baisse. */
  function majModules(p, s) {
    if (!parProgramme(p)) return;
    var ouverts = {}, mods = 0, bases = 0;
    (p.etapes || []).forEach(function (e) { ouverts[e.numero] = e; });
    function fait(m) { var e = ouverts[m.numero], l = e ? e.paliers || [] : []; return l.length > 0 && l[l.length - 1].numero <= (s.fait || 0); }
    p.programme.niveaux.forEach(function (niv) {
      var f = niv.modules.filter(fait).length;
      mods += f;
      if (niv.numero === 1 && niv.modules.length > 0 && f === niv.modules.length) bases = 1;
    });
    s.mods = Math.max(s.mods || 0, mods); s.bases = Math.max(s.bases || 0, bases);
  }
  function retenir(p) { var s = suivi(p.id); s.titre = p.titre; majModules(p, s); s.motImage = p.motImage || null; var gardee = imageOk(s.image) && s.image.req === requetePhoto(p) ? s.image : null; s.image = imageFixe(p) || imageOk(p.image) || gardee || null; if (p.verifie || formationComplete(p)) s.total = paliersPrevus(p); etat.parcours[p.id] = s; }
  function modulesFaits(p, fait) { return (p.etapes || []).filter(function (e) { var l = e.paliers || []; return l.length && l[l.length - 1].numero <= fait; }).length; }
  function creerParcours(titre, bouton, alerte, statut) {
    titre = String(titre || "").trim();
    alerte.hidden = true;
    if (titre.length < 2) { alerte.textContent = "Écris d’abord un sujet."; alerte.hidden = false; return; }
    var vive = vivante();
    var texte = bouton.textContent;
    bouton.disabled = true; bouton.textContent = "Préparation de la formation…";
    if (statut) { statut.textContent = "Préparation de " + guill(titre) + "… La première fois, compte jusqu’à une minute."; statut.hidden = false; }
    pretCompte().then(function () {
      if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
      return api("POST", "parcours", { titre: titre }, 100000);
    }).then(function (j) {
      cache["p:" + j.parcours.id] = Promise.resolve(j.parcours);
      if (vive()) location.hash = "#/p/" + encodeURIComponent(j.parcours.id);
    }, function (e) {
      bouton.disabled = false; bouton.textContent = texte;
      if (statut) statut.hidden = true;
      alerte.textContent = messageErreur(e, "Limite du jour" + N + ": 10 nouveaux sujets par personne. Les sujets déjà ouverts restent disponibles.");
      alerte.hidden = false;
    });
  }

  /* ---------- Mise en page ---------- */
  /* Jeton de navigation : chaque changement de page l'augmente. Une vue qui attend le réseau note le jeton au départ (vivante) et ne touche plus à l'écran si l'utilisateur a changé de page entre-temps. */
  var navigation = 0;
  function vivante() { var n = navigation; return function () { return n === navigation; }; }
  /* Remonte en haut à chaque changement de vue, aussi après la mise en page (sinon l'accueil peut s'ouvrir déjà défilé, donc blanc). */
  function enHaut() {
    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) { /* sans effet */ }
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    if (window.requestAnimationFrame) window.requestAnimationFrame(function () { window.scrollTo(0, 0); });
  }
  function montrer(page, onglet, titre) {
    app.innerHTML = ""; app.appendChild(page);
    document.title = titre ? titre + " · Koîos" : "Koîos";
    nav.hidden = !onglet;
    nav.querySelectorAll("a").forEach(function (a) { if (a.dataset.onglet === onglet) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    enHaut();
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
    if (v.statut === "seule") return el("span", { "class": "badge partiel" }, [icone("liste"), "Une seule IA"]);
    return el("span", { "class": "badge partiel" }, [icone("liste"), "Recoupé en partie"]);
  }

  /* ---------- Photos d'accueil : idées de formations, mosaïque, crédits ---------- */
  /* [sujet de la formation, requête de photo en anglais] : une idée par grand domaine. */
  var IDEES = [
    ["La Rome antique", "Roman Forum"], ["Les fonds marins", "Coral reef"], ["Le cinéma de Kubrick", "Movie camera"],
    ["L’histoire du jazz", "Saxophone"], ["Les pierres précieuses", "Cut gemstones"], ["La philosophie stoïcienne", "Marcus Aurelius"]
  ];
  /* Cadre photo : fond clair avec l'icône de catégorie ; la photo se pose par-dessus quand elle arrive (et son crédit est noté). */
  function cadrePhoto(sujet, cls) { return el("span", { "class": "cadre teinte " + teinteSujet(sujet) + (cls ? " " + cls : ""), "aria-hidden": "true" }, [icone(categorie(sujet))]); }
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

  /* ---------- Comptes : créer, se connecter, phrase de secours, Google ---------- */
  /* Message d'une erreur du serveur : ses phrases sont déjà claires, sauf quand il ne répond pas ou n'est pas branché. */
  function erreurCompte(e) { return e.statut === 0 || e.statut === 503 ? messageErreur(e) : (e.message || "Une erreur est survenue."); }
  /* Une session refusée (401) : on revient à l'écran de connexion, la progression reste sur ce téléphone. */
  function perdreSession() {
    profil = null;
    ["koios.profil", "koios.etat"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* mémoire seule */ } });
    etat = { version: 2, xp: 0, parcours: {}, erreurs: [], jours: {}, maj: 0, reussies: {}, cartes: {}, revisions: {}, faits: {}, badges: null }; // rien du compte précédent ne reste, même en mémoire
    viderCacheHorsLigne();
    toast("Ta session a expiré. Reconnecte-toi.");
    route();
  }
  /* Quitte ce compte sur ce téléphone : profil et progression locale partent (la progression reste sur le serveur). */
  function oublierCompteLocal() {
    ["koios.profil", "koios.etat", "koios.admin"].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) { /* mémoire seule */ } });
    location.hash = "#/";
    /* Les leçons gardées pour le hors ligne ne restent pas sur un téléphone prêté : on attend leur effacement avant de recharger. */
    viderCacheHorsLigne().then(function () { location.reload(); });
  }
  function majProfilCompte(c) {
    if (!profil || !c) return;
    profil.compte = !!c.compte;
    profil.role = c.role || "joueur";
    profil.prenom = c.prenom || null;
    profil.nom = c.nom || null;
    profil.google = !!c.google;
    profil.mdp = c.motDePasse !== false;
    profil.bonus = c.bonus || 0;
    if (c.pseudo) profil.pseudo = c.pseudo;
    S.ecrire("koios.profil", profil);
  }
  /* Une session ouverte (inscription, connexion, secours ou Google) : on la garde, puis on fusionne la progression du serveur. */
  function ouvrirSession(rep) {
    profil = { id: rep.id, cle: rep.cle, pseudo: rep.pseudo, prenom: rep.prenom || null, nom: rep.nom || null, role: rep.role || "joueur", compte: true };
    S.ecrire("koios.profil", profil);
    return synchroniser();
  }
  function suiteConnexion() {
    var cible = apresAccueil && apresAccueil !== "#/accueil" ? apresAccueil : "#/";
    apresAccueil = null;
    if (location.hash === cible) route(); else location.hash = cible;
  }
  function champTexte(id, libelle, attrs) {
    var a = { "class": "champ", id: id, type: "text" };
    Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    return { label: el("label", { "for": id, "class": "sur", text: libelle }), input: el("input", a) };
  }
  function ligneChamp(c, aide) { return el("div", { "class": "pile serree" }, [c.label, c.input, aide ? el("p", { "class": "meta", text: aide }) : null]); }
  function alerteVide() { return el("p", { "class": "alerte", hidden: "", role: "status" }); }
  function dire(al, texte) { al.textContent = texte; al.hidden = !texte; }
  function boutonAvance(texte) { return el("button", { "class": "btn", type: "button" }, [el("span", { text: texte }), icone("fleche")]); }

  /* Écran affiché une seule fois après l'inscription : les 12 mots, copier, et une case à cocher avant de continuer. */
  function vuePhrase(phrase, suite) {
    var mots = String(phrase || "").split(" ");
    var liste = el("ol", { "class": "phrase" }, mots.map(function (m) { return el("li", { text: m }); }));
    var info = el("p", { "class": "meta", role: "status" });
    var copier = el("button", { "class": "btn second", type: "button" }, [icone("lien"), el("span", { text: "Copier la phrase" })]);
    copier.addEventListener("click", function () {
      var fait = function () { info.textContent = "Phrase copiée. Colle‑la dans une note à l’abri."; };
      var echec = function () { info.textContent = "Copie impossible ici. Recopie les mots à la main."; };
      try { navigator.clipboard.writeText(phrase).then(fait, echec); } catch (e) { echec(); }
    });
    var case1 = el("input", { type: "checkbox", id: "phrase-notee" });
    var go = boutonAvance("Continuer");
    go.disabled = true;
    case1.addEventListener("change", function () { go.disabled = !case1.checked; });
    go.addEventListener("click", function () { if (case1.checked) suite(); });
    montrer(el("div", { "class": "page plein" }, [
      el("header", { "class": "haut" }, [marque(true)]),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Compte créé" }), el("h1", { text: "Note ta phrase de secours" })]),
      el("p", { style: "font-size:17px", text: "Si tu oublies ton mot de passe, ces 12 mots te redonnent accès à ton compte. Ils ne s’affichent qu’une seule fois." }),
      el("div", { "class": "phrase-bloc" }, [liste]),
      copier, info,
      el("label", { "class": "cocher", "for": "phrase-notee" }, [case1, el("span", { text: "Je l’ai notée" })]),
      go
    ]), null, "Phrase de secours");
  }

  /* Google : le bouton n'existe que si le serveur annonce un identifiant client. Le jeton reçu est vérifié par le serveur. */
  function boutonGoogle(zone, surJeton) {
    api("GET", "compte?config=1", null, 5000).then(function (c) {
      if (!c || !c.google || !zone.isConnected) return;
      var s = el("script", { src: "https://accounts.google.com/gsi/client", async: "", defer: "" });
      s.addEventListener("load", function () {
        if (!window.google || !window.google.accounts || !zone.isConnected) return;
        window.google.accounts.id.initialize({ client_id: c.google, callback: function (r) { if (r && r.credential) surJeton(r.credential); } });
        var bloc = el("div", { "class": "google-bouton" });
        zone.appendChild(bloc);
        window.google.accounts.id.renderButton(bloc, { type: "standard", theme: "outline", size: "large", text: "continue_with", locale: "fr", width: 280 });
      });
      document.head.appendChild(s);
    }, function () { /* pas de Google : le reste fonctionne */ });
  }
  /* Premier passage avec Google : le serveur demande un pseudo, un prénom et un nom. */
  function completerGoogle(jeton, suite) {
    var pseudo = champTexte("g-pseudo", "Pseudo", { maxlength: "20", autocomplete: "username", autocapitalize: "off", spellcheck: "false" });
    var prenom = champTexte("g-prenom", "Prénom", { maxlength: "40", autocomplete: "given-name" });
    var nom = champTexte("g-nom", "Nom", { maxlength: "40", autocomplete: "family-name" });
    var al = alerteVide(), go = boutonAvance("Créer mon compte");
    go.addEventListener("click", function () {
      dire(al, ""); go.disabled = true;
      api("POST", "compte", { action: "google", jeton: jeton, pseudo: pseudo.input.value, prenom: prenom.input.value, nom: nom.input.value }, 20000)
        .then(ouvrirSession)
        .then(function () { suite(); }, function (e) { go.disabled = false; dire(al, erreurCompte(e)); });
    });
    montrer(el("div", { "class": "page plein" }, [
      el("header", { "class": "haut" }, [marque(true)]),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Google" }), el("h1", { text: "Choisis ton pseudo" })]),
      el("p", { "class": "meta", style: "font-size:16px", text: "Ton pseudo est le nom que tes amis voient. Ton prénom et ton nom restent privés." }),
      el("div", { "class": "pile" }, [ligneChamp(pseudo, "3 à 20 caractères" + N + ": lettres, chiffres, _ . -"), ligneChamp(prenom), ligneChamp(nom), go, al])
    ]), null, "Choisir un pseudo");
  }
  function connexionGoogle(jeton, suite, al) {
    return api("POST", "compte", { action: "google", jeton: jeton }, 20000).then(function (rep) {
      if (rep.aCompleter) { completerGoogle(jeton, suite); return; }
      return ouvrirSession(rep).then(suite);
    }, function (e) { dire(al, erreurCompte(e)); });
  }

  function formCreer(suite) {
    var prenom = champTexte("c-prenom", "Prénom", { maxlength: "40", autocomplete: "given-name" });
    var nom = champTexte("c-nom", "Nom", { maxlength: "40", autocomplete: "family-name" });
    var pseudo = champTexte("c-pseudo", "Pseudo", { maxlength: "20", autocomplete: "username", autocapitalize: "off", spellcheck: "false" });
    var mdp = champTexte("c-mdp", "Mot de passe", { type: "password", autocomplete: "new-password" });
    var al = alerteVide(), go = boutonAvance("Créer mon compte");
    go.addEventListener("click", function () {
      dire(al, "");
      if (!prenom.input.value.trim() || !nom.input.value.trim() || !pseudo.input.value.trim()) { dire(al, "Remplis ton prénom, ton nom et ton pseudo."); return; }
      if (mdp.input.value.length < 10) { dire(al, "Ton mot de passe doit avoir 10 caractères au moins."); mdp.input.focus(); return; }
      go.disabled = true;
      api("POST", "compte", { action: "inscrire", prenom: prenom.input.value, nom: nom.input.value, pseudo: pseudo.input.value, mdp: mdp.input.value }, 25000).then(function (rep) {
        return ouvrirSession(rep).then(function () { vuePhrase(rep.phrase, suite); });
      }, function (e) { go.disabled = false; dire(al, erreurCompte(e)); });
    });
    return el("div", { "class": "pile" }, [ligneChamp(prenom), ligneChamp(nom), ligneChamp(pseudo, "3 à 20 caractères" + N + ": lettres, chiffres, _ . -"), ligneChamp(mdp, "10 caractères au moins."), go, al]);
  }
  function formConnecter(suite, versSecours) {
    var pseudo = champTexte("s-pseudo", "Pseudo", { maxlength: "20", autocomplete: "username", autocapitalize: "off", spellcheck: "false" });
    var mdp = champTexte("s-mdp", "Mot de passe", { type: "password", autocomplete: "current-password" });
    var al = alerteVide(), go = boutonAvance("Se connecter");
    var oubli = el("button", { "class": "lien", type: "button", text: "Mot de passe oublié" });
    oubli.addEventListener("click", versSecours);
    go.addEventListener("click", function () {
      dire(al, "");
      if (!pseudo.input.value.trim() || !mdp.input.value) { dire(al, "Écris ton pseudo et ton mot de passe."); return; }
      go.disabled = true;
      api("POST", "compte", { action: "connecter", pseudo: pseudo.input.value, mdp: mdp.input.value }, 25000).then(function (rep) {
        return ouvrirSession(rep).then(suite);
      }, function (e) { go.disabled = false; dire(al, erreurCompte(e)); });
    });
    mdp.input.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    return el("div", { "class": "pile" }, [ligneChamp(pseudo), ligneChamp(mdp), go, al, oubli]);
  }
  function formSecours(suite, retour) {
    var pseudo = champTexte("r-pseudo", "Pseudo", { maxlength: "20", autocomplete: "username", autocapitalize: "off", spellcheck: "false" });
    var phrase = el("textarea", { "class": "champ zone", id: "r-phrase", rows: "3", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    var nouveau = champTexte("r-mdp", "Nouveau mot de passe", { type: "password", autocomplete: "new-password" });
    var al = alerteVide(), go = boutonAvance("Changer mon mot de passe");
    var retourBtn = el("button", { "class": "lien", type: "button", text: "Retour à la connexion" });
    retourBtn.addEventListener("click", retour);
    go.addEventListener("click", function () {
      dire(al, "");
      if (!pseudo.input.value.trim() || !phrase.value.trim()) { dire(al, "Écris ton pseudo et ta phrase de secours."); return; }
      if (nouveau.input.value.length < 10) { dire(al, "Ton nouveau mot de passe doit avoir 10 caractères au moins."); return; }
      go.disabled = true;
      api("POST", "compte", { action: "secours", pseudo: pseudo.input.value, phrase: phrase.value, nouveauMdp: nouveau.input.value }, 25000).then(function (rep) {
        return ouvrirSession(rep).then(function () { toast("Mot de passe changé."); suite(); });
      }, function (e) { go.disabled = false; dire(al, erreurCompte(e)); });
    });
    return el("div", { "class": "pile" }, [
      el("p", { "class": "meta", style: "font-size:16px", text: "Tape les 12 mots de ta phrase de secours (ou le code reçu de l’admin), puis choisis un nouveau mot de passe." }),
      ligneChamp(pseudo),
      el("div", { "class": "pile serree" }, [el("label", { "for": "r-phrase", "class": "sur", text: "Phrase de secours" }), phrase]),
      ligneChamp(nouveau, "10 caractères au moins."), go, al, retourBtn
    ]);
  }
  /* Onglets « Créer un compte » et « Se connecter », avec « Mot de passe oublié » et le bouton Google s'il est configuré. */
  function blocConnexion(suite, depart) {
    var corps = el("div", { "class": "pile" }), onglets = el("div", { "class": "onglets", role: "tablist", "aria-label": "Compte" }), boutons = {};
    var google = el("div", { "class": "pile google-zone" }), alGoogle = alerteVide();
    function afficher(mode) {
      Object.keys(boutons).forEach(function (k) { boutons[k].setAttribute("aria-selected", k === mode ? "true" : "false"); });
      onglets.hidden = mode === "secours";
      corps.textContent = "";
      corps.appendChild(mode === "creer" ? formCreer(suite) : mode === "connecter" ? formConnecter(suite, function () { afficher("secours"); }) : formSecours(suite, function () { afficher("connecter"); }));
      google.hidden = mode === "secours";
    }
    [["creer", "Créer un compte"], ["connecter", "Se connecter"]].forEach(function (m) {
      var b = el("button", { type: "button", role: "tab", "aria-selected": "false", text: m[1] });
      b.addEventListener("click", function () { afficher(m[0]); });
      boutons[m[0]] = b; onglets.appendChild(b);
    });
    google.appendChild(alGoogle);
    boutonGoogle(google, function (jeton) { connexionGoogle(jeton, suite, alGoogle); });
    afficher(depart || "creer");
    return el("div", { "class": "pile" }, [onglets, corps, google]);
  }
  /* Sans serveur : l'app marche sur ce téléphone seulement, avec un simple nom. */
  function formLocal() {
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", autocomplete: "nickname", placeholder: "Ton prénom ou un pseudo" });
    var alerte = el("p", { "class": "alerte", hidden: "" });
    var go = boutonAvance("Commencer");
    go.addEventListener("click", function () {
      var p = champ.value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 24);
      if (!p) { alerte.textContent = "Écris d’abord ton prénom ou un pseudo."; alerte.hidden = false; champ.focus(); return; }
      profil = { pseudo: p }; S.ecrire("koios.profil", profil);
      suiteConnexion();
    });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    return el("div", { "class": "pile" }, [el("p", { "class": "meta", text: "Le serveur ne répond pas" + N + ": tu peux commencer sur ce téléphone, sans compte." }), el("label", { "for": "pseudo", "class": "sur", text: "Ton nom" }), champ, go, alerte]);
  }

  /* ---------- Première visite ---------- */
  function vueAccueil() {
    var credits = blocCredits();
    var formulaire = el("div", { "class": "pile" }, [el("p", { "class": "attente", role: "status", text: "Chargement…" })]);
    pretServeur.then(function () {
      if (!formulaire.isConnected) return;
      formulaire.textContent = "";
      formulaire.appendChild(serveur.base ? blocConnexion(suiteConnexion, "creer") : formLocal());
    });
    montrer(el("div", { "class": "page plein" }, [
      el("header", { "class": "haut" }, [marque(true)]),
      mosaique(credits),
      el("div", { "class": "pile" }, [el("h1", { text: "Apprends n’importe quel sujet, leçon par leçon." }),
        el("p", { "class": "meta", style: "font-size:17px", text: "Des leçons courtes et sourcées, des définitions, des frises et des chiffres. Toutes les 5 leçons, un quiz ; ensuite des mini‑jeux et des duels entre amis." })]),
      formulaire,
      el("div", { "class": "pile serree" }, [lien("#/aide", "Comment ça marche", "lien discret"), lien("#/confidentialite", "Confidentialité", "lien discret")]),
      credits.noeud
    ]), null, "Commencer");
  }
  /* Page pour qui a déjà un profil sans compte (ou qui est resté sur ce téléphone) : créer le compte garde la progression. */
  function vueCompte() {
    if (profil && profil.compte) { location.hash = "#/profil"; return; }
    var formulaire = el("div", { "class": "pile" }, [el("p", { "class": "attente", role: "status", text: "Chargement…" })]);
    pretServeur.then(function () {
      if (!formulaire.isConnected) return;
      formulaire.textContent = "";
      formulaire.appendChild(serveur.base ? blocConnexion(suiteConnexion, "creer") : etatVide("profil", "Le serveur ne répond pas. Réessaie dans un instant.", lien("#/", "Retour à l’accueil", "btn second petit")));
    });
    montrer(el("div", { "class": "page" }, [
      el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/profil" }, [icone("retour"), "Profil"]), el("span"), puceXP()]),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Compte" }), el("h1", { text: "Protège ta progression" })]),
      el("p", { style: "font-size:17px", text: "Crée ton compte" + N + ": tu gardes tout ce que tu as fait, et tu le retrouves sur tous tes appareils." }),
      formulaire
    ]), "profil", "Créer mon compte");
  }
  /* Lien d'invitation reçu (par exemple par WhatsApp) : on devient ami de celui qui l'a envoyé. */
  function vueInvitation(jeton) {
    if (!profil.compte) {
      apresAccueil = location.hash;
      montrer(el("div", { "class": "page" }, [entete(), el("h1", { text: "Invitation d’un ami" }),
        etatVide("invitation", "Crée ton compte pour devenir ami. Tu reviendras ici ensuite.", lienAvance("#/compte", "Créer mon compte", "btn"))]), "amis", "Invitation");
      return;
    }
    var vive = vivante();
    montrer(attente("Ouverture de l’invitation…"), "amis", "Invitation");
    api("POST", "amis", { action: "rejoindre", jeton: jeton }, 15000).then(function (r) {
      if (!vive()) return;
      toast(r.dejaAmis ? "Vous êtes déjà amis." : "Tu es maintenant ami avec " + r.pseudo + ".");
      location.hash = "#/amis";
    }, function (e) { if (vive()) montrer(erreurPage(erreurCompte(e), "Invitation indisponible"), "amis"); });
  }
  /* Ce qui est gardé, ce qui est visible, comment tout effacer. */
  function vueConfidentialite() {
    function section(titre, textes) { return el("section", { "class": "pile serree" }, [el("h2", { text: titre })].concat(textes.map(function (t) { return el("p", { text: t }); }))); }
    montrer(el("div", { "class": "page" }, [
      profil ? el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/profil" }, [icone("retour"), "Profil"]), el("span"), puceXP()])
        : el("div", { "class": "pile serree" }, [el("header", { "class": "haut" }, [marque(true)]), el("a", { "class": "retour-texte", href: "#/accueil" }, [icone("retour"), "Retour"])]),
      el("h1", { text: "Confidentialité" }),
      section("Ce que Koîos garde", [
        "Ton prénom, ton nom, ton pseudo et ta progression (XP, leçons faites, révisions, badges).",
        "Ton mot de passe et ta phrase de secours ne sont jamais gardés tels quels" + N + ": seule une empreinte est enregistrée, impossible à relire. Si tu te connectes avec Google, seul l’identifiant Google est gardé, pas ton adresse e‑mail.",
        "Ton adresse IP n’est jamais gardée en clair" + N + ": son empreinte sert seulement à limiter les abus."
      ]),
      section("Ce qui est visible", [
        "Tes amis voient ton pseudo et tes points. Personne d’autre ne peut lister les joueurs" + N + ": on ne trouve quelqu’un que par son pseudo exact ou par un lien d’invitation.",
        "Un salon, un groupe ou une partie ouverts par un lien ou un code montrent ton pseudo à ceux qui y participent. Ton prénom et ton nom ne sont jamais montrés aux autres joueurs."
      ]),
      section("Pas de publicité", ["Koîos n’affiche aucune publicité, ne vend aucune donnée et n’utilise aucun traqueur."]),
      section("Supprimer ton compte", [
        "Tu peux tout effacer à tout moment, dans le Profil, avec ton mot de passe (ou Google)" + N + ": compte, appareils connectés, progression, amitiés et demandes.",
        "Les formations que tu as créées restent, sans nom d’auteur" + N + ": le contenu des formations est public."
      ])
    ]), profil ? "profil" : null, "Confidentialité");
  }

  /* ---------- Maison ---------- */
  /* Recherche d'un sujet, puis « Idées de formations » en tuiles photo (4:3, titre dessous, icône de catégorie à côté). */
  /* Formations existantes : les cours vérifiés (catalogue local) puis les formations de l'IA (GET parcours?q=). Une formation qui existe ne se régénère jamais : elle s'ouvre. */
  function motsDe(t) { return sansAccent(t).split(" ").filter(Boolean); }
  /* Formation complète : tous ses modules sont ouverts et toutes les leçons connues sont écrites. */
  function complete(x) { return !!(x.modules && x.ouverts >= x.modules && x.paliers > 0 && x.lecons >= x.paliers); }
  /* Bibliothèque : leçons prêtes sur leçons connues, niveau atteint, modules. */
  function detailExistante(x) {
    if (x.detail) return x.detail;
    if (x.verifie) return "Cours vérifié · " + pluriel(x.paliers, "chapitre", "chapitres");
    var d = [];
    d.push(x.lecons ? pluriel(x.lecons, "leçon prête", "leçons prêtes") : "Aucune leçon prête");
    var aOuvrir = (x.modules || 0) - (x.ouverts || 0);
    if (aOuvrir > 0) d.push(pluriel(aOuvrir, "module à ouvrir", "modules à ouvrir"));
    if (x.niveauAtteint) d.push("niveau " + x.niveauAtteint.numero + " atteint");
    return d.join(" · ");
  }
  /* Seules les formations « novice à expert » (avec un programme) se montrent ; les anciennes formations courtes restent en base, ouvrables par l'historique. */
  function parNiveauxServeur(x) { return !!(x && Array.isArray(x.niveaux) && x.niveaux.length); }
  function chercherExistantes(q) {
    var mots = motsDe(q);
    var locales = []; // les cours vérifiés à la main sont masqués (leur catalogue ne sert plus qu'aux photos)
    return pretServeur.then(function () { return serveur.base ? api("GET", "parcours?q=" + encodeURIComponent(q)) : { parcours: [] }; })
      .then(function (j) { return (j.parcours || []).filter(parNiveauxServeur); }, function () { return []; })
      .then(function (l) { return locales.concat(l.map(function (x) { return { id: x.id, titre: x.titre, image: imageFixe({ titre: x.titre }) || x.image, verifie: false, lecons: x.lecons, paliers: x.paliers, modules: x.modules, ouverts: x.ouverts, niveauAtteint: x.niveauAtteint, niveaux: x.niveaux }; })); });
  }
  function blocSuggestions(champ) {
    var ul = el("ul", { "class": "liste" });
    var bloc = el("section", { "class": "pile serree suggestions", hidden: "", "aria-labelledby": "titre-existantes" }, [el("h2", { id: "titre-existantes", text: "Formations existantes" }), ul]);
    var minuteur = null, numero = 0;
    champ.addEventListener("input", function () {
      clearTimeout(minuteur);
      var q = champ.value.trim();
      numero += 1;
      if (q.length < 2) { bloc.hidden = true; return; }
      var mien = numero;
      minuteur = setTimeout(function () {
        chercherExistantes(q).then(function (l) {
          if (mien !== numero || !bloc.isConnected) return;
          ul.textContent = "";
          l.slice(0, 6).forEach(function (x) { ul.appendChild(rangeeParcours(x.id, x.titre, x.image, detailExistante(x))); });
          bloc.hidden = !l.length;
          if (window.poserIcones) window.poserIcones(ul);
        });
      }, 300);
    });
    return bloc;
  }
  function carteRecherche(credits) {
    var champ = el("input", { "class": "champ", id: "sujet", type: "search", maxlength: "80", autocomplete: "off", enterkeyhint: "go", placeholder: "Un sujet, une époque…" });
    var bouton = el("button", { "class": "btn petit", type: "button", text: "Apprendre" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    bouton.addEventListener("click", function () { creerParcours(champ.value, bouton, alerte); });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
    var suggestions = blocSuggestions(champ);
    var recherche = el("section", { "class": "pile", "aria-labelledby": "titre-recherche" }, [el("h1", { id: "titre-recherche", text: "Que veux‑tu apprendre" + F + "?" }), el("div", { "class": "recherche" }, [champ, suggestions, bouton]), alerte,
      el("div", { "class": "liens-recherche" }, [lien("#/bibliotheque", "Parcourir la bibliothèque", "lien discret"), lien("#/aide", "Comment ça marche", "lien discret")])]);
    var alerteIdees = el("p", { "class": "alerte", hidden: "", role: "status" }), statutIdees = el("p", { "class": "meta", hidden: "", role: "status" });
    var grille = el("div", { "class": "idees" });
    IDEES.forEach(function (idee, i) {
      var cadre = cadrePhoto(idee[0], i < 2 ? "r21" : "r43");
      var b = el("button", { "class": "idee " + teinteSujet(idee[0]) + (i < 2 ? " grande" : ""), type: "button", style: "--i:" + i }, [cadre, el("span", { "class": "idee-titre" }, [icone(categorie(idee[0])), el("b", { text: idee[0] })])]);
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
    if (q) return "Leçon " + s.fait + " · " + (q % 10 === 0 ? "grand quiz" : "quiz") + " disponible";
    if (termine(s)) return "Formation terminée · " + pluriel(s.total, "leçon", "leçons");
    var j = prochainJalon(s);
    if (!j) return "Leçon " + s.fait + " sur " + s.total;
    return "Leçon " + s.fait + " · " + (j % 10 === 0 ? "grand quiz" : "quiz") + " dans " + pluriel(j - s.fait, "leçon", "leçons");
  }
  function avanceJalon(s) { if (quizEnAttente(s) || termine(s)) return 100; return prochainJalon(s) ? ((s.fait || 0) % 5) / 5 * 100 : (s.fait || 0) / s.total * 100; }
  /* Bande pleine largeur (fond blanc, ou --surface en alternance) contenant une colonne de contenu. */
  function bande(enfants, alt) { return el("div", { "class": "bande" + (alt ? " alt" : "") }, [el("div", { "class": "colonne" }, enfants)]); }
  /* Carte d'un parcours vérifié dans le carrousel : photo, badge, nombre de leçons, progression. */
  function carteVerifiee(p, credits) {
    var s = suivi(p.id), cadre = cadrePhoto(p.titre, "r169"), fixe = imageFixe(p);
    if (fixe) poserDansCadre(cadre, fixe, p.titre, credits);
    else if (imageOk(s.image) && s.image.req === requetePhoto(p)) poserDansCadre(cadre, s.image, p.titre, credits);
    else if (p.motImage) photoDansCadre(cadre, p.motImage, p.titre, credits, function (im) { memoriserImage(p.id, im, p.motImage); });
    var pct = p.paliers ? Math.min(100, Math.round((s.fait || 0) / p.paliers * 100)) : 0;
    return el("li", {}, [el("a", { "class": "carte-v " + teinteSujet(p.titre), href: "#/p/" + encodeURIComponent(p.id) }, [cadre, el("span", { "class": "carte-v-corps" }, [
      el("span", { "class": "badge verifie" }, [icone("verifie"), "Vérifié"]),
      el("b", { text: p.titre }),
      el("span", { "class": "meta", text: pluriel(p.paliers, "leçon", "leçons") + (s.fait ? " · " + s.fait + (s.fait > 1 ? " faites" : " faite") : "") }),
      el("span", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + pct + "%" })])])])]);
  }
  /* Accueil en grille « bento » : chaque tuile repose sur une donnée réelle de l’état du joueur (XP, jours actifs, éléments à réviser, glossaire, formation en cours). */
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
  /* Série : jours d'affilée où une leçon, une révision, un quiz ou la question du jour a été faite, et la semaine en cours (lundi à dimanche). */
  function tuileSerie() {
    var n = serieJours(), d = new Date(), dow = (d.getDay() + 6) % 7, faits = 0;
    var semaine = el("div", { "class": "semaine", role: "img" });
    for (var k = 0; k < 7; k++) {
      var fait = L.jourActif(etat.jours[jour(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + k))]);
      if (fait) faits += 1;
      semaine.appendChild(el("span", { "class": "jr" + (fait ? " fait" : "") + (k === dow ? " auj" : "") }, [el("i"), el("span", { text: JOURS_COURTS[k] })]));
    }
    semaine.setAttribute("aria-label", "Activité cette semaine" + N + ": " + pluriel(faits, "jour actif", "jours actifs"));
    return el("div", { "class": "tb serie" }, [
      el("span", { "class": "sur", text: "Série" }),
      el("span", { "class": "ligne-gros" }, [el("span", { "class": "gros", text: String(n) }), el("span", { "class": "meta", text: n > 1 ? "jours de suite" : "jour de suite" })]),
      semaine
    ]);
  }
  function tuileJour() {
    var fait = jourFait(aujourdhui());
    return el("section", { "class": "tb jour", "aria-label": "Question du jour" }, [
      el("div", { "class": "tb-tete" }, [ronde("ampoule"), el("span", { "class": "tb-texte" }, [el("b", { text: "Question du jour" }),
        el("span", { "class": "meta", text: fait ? (fait === "juste" ? "Réussie aujourd’hui. La suivante arrive demain." : "Manquée aujourd’hui. La suivante arrive demain.") : "La même pour tous." })])]),
      fait ? el("span", { "class": "fait-tag" }, [icone("juste"), "Faite"]) : lienAvance("#/jeu/jour", "Répondre", "btn second")
    ]);
  }
  function tuileCompte(href, nomIcone, nombre, singulier, pluriels, titre) {
    return el("a", { "class": "tb fin", href: href }, [coin(), ronde(nomIcone), el("span", { "class": "tb-bas" }, [titre ? el("b", { text: titre }) : null, el("span", { "class": "gros", text: String(nombre) }), el("span", { "class": "meta", text: nombre > 1 ? pluriels : singulier })])]);
  }
  function tuileEclair() {
    return el("a", { "class": "tb fin", href: "#/jeu/melange" }, [coin(), ronde("eclair"), el("span", { "class": "tb-bas" }, [el("b", { text: "Quiz éclair" }), el("span", { "class": "meta", text: "10 questions" })])]);
  }
  /* Tuile « Reprendre » : photo de la formation en cours, titre, progression, un seul bouton noir. */
  function tuileReprendre(r, credits) {
    var photoR = cadrePhoto(r.s.titre, "photo-r r169"), requete = r.s.motImage || r.s.titre;
    var fixeR = imageFixe({ titre: r.s.titre });
    if (fixeR) poserDansCadre(photoR, fixeR, r.s.titre, credits);
    else if (imageOk(r.s.image) && (r.s.image.source === "fixe" || r.s.image.req === requete)) poserDansCadre(photoR, r.s.image, r.s.titre, credits);
    else photoDansCadre(photoR, requete, r.s.titre, credits, function (im) { memoriserImage(r.id, im, requete); });
    var q = quizEnAttente(r.s), avance = !(termine(r.s) && !q);
    return el("section", { "class": "tb reprendre " + teinteSujet(r.s.titre), "aria-labelledby": "titre-reprendre" }, [
      photoR,
      el("div", { "class": "reprendre-corps" }, [
        el("span", { "class": "sur", text: "Reprendre" }),
        el("div", { "class": "ligne-titre" }, [el("h2", { id: "titre-reprendre", text: r.s.titre }), el("span", { "class": "meta", text: (r.s.xp || 0) + N + "XP" })]),
        el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + avanceJalon(r.s) + "%" })]),
        el("span", { "class": "meta", text: detailSuivi(r.s) }),
        (avance ? lienAvance : lien)("#/p/" + encodeURIComponent(r.id) + (q ? (q % 10 === 0 ? "/defi/" : "/quiz/") + q : ""), q ? "Passer le " + (q % 10 === 0 ? "grand quiz" : "quiz") : (termine(r.s) ? "Revoir la formation" : r.s.fait ? "Continuer à la leçon " + (r.s.fait + 1) : "Commencer"), "btn")
      ])
    ]);
  }
  function vueMaison() {
    var credits = blocCredits();
    var miens = Object.keys(etat.parcours).map(function (id) { return { id: id, s: etat.parcours[id] }; }).filter(function (x) { return x.s.titre; }).sort(function (a, b) { return (b.s.date || "") > (a.s.date || "") ? 1 : -1; });
    var rech = carteRecherche(credits);
    var tuiles = [], nbRevisions = L.fileDuJour(etat, aujourdhui()).length;
    if (miens.length) tuiles.push(tuileReprendre(miens[0], credits));
    else {
      var premiere = el("button", { "class": "tb premiere", type: "button" }, [icone("livres"), el("span", { "class": "tb-texte" }, [el("b", { text: "Lance ta première formation" }), el("span", { "class": "meta", text: "Écris un sujet, ou choisis une idée plus bas." })]), icone("fleche")]);
      premiere.addEventListener("click", function () { var c = document.getElementById("sujet"); if (c) { c.scrollIntoView({ block: "center" }); c.focus(); } });
      tuiles.push(premiere);
    }
    tuiles.push(tuileNiveau(), tuileSerie(), tuileJour());
    if (nbRevisions) tuiles.push(tuileCompte("#/reviser", "cerveau", nbRevisions, "à réviser aujourd’hui", "à réviser aujourd’hui"));
    var eclair = tuileEclair();
    tuiles.push(eclair);
    var bibliotheque = null;
    var bento = el("div", { "class": "bento" + (miens.length ? "" : " sans-form") }, tuiles);
    function ranger() {
      var fin = bento.querySelectorAll(".tb.fin");
      Array.prototype.forEach.call(fin, function (t) { t.classList.toggle("seul", fin.length === 1); });
      Array.prototype.forEach.call(bento.children, function (t, k) {
        t.style.setProperty("--i", Math.min(k, 8));
        if (t.classList.contains("reprendre")) return; // celle-ci a la teinte de sa formation
        ORDRE_TEINTES.forEach(function (c) { t.classList.remove(c); });
        t.classList.add(ORDRE_TEINTES[(k + 1) % ORDRE_TEINTES.length]);
      });
    }
    ranger();
    // Tuile Bibliothèque : seulement si le serveur répond avec un nombre réel de formations.
    pretServeur.then(function () { return serveur.base ? api("GET", "parcours") : { parcours: [] }; }).then(function (j) {
      var n = (j.parcours || []).filter(parNiveauxServeur).length;
      if (!n || !bento.isConnected || bibliotheque) return;
      bibliotheque = tuileCompte("#/bibliotheque", "livres", n, "formation à ouvrir", "formations à ouvrir", "Bibliothèque");
      bento.insertBefore(bibliotheque, eclair); ranger();
    }, function () {});
    // Rien à réviser aujourd'hui : la tuile Glossaire (termes déjà rencontrés dans la formation en cours) prend la place, si elle a des termes.
    if (!nbRevisions && miens.length && miens[0].s.fait >= 1) {
      glossaireJusqua({ id: miens[0].id }, miens[0].s.fait).then(function (termes) {
        if (!termes.length || !bento.isConnected) return;
        bento.insertBefore(tuileCompte("#/p/" + encodeURIComponent(miens[0].id) + "/glossaire", "carnet", termes.length, "terme appris", "termes appris"), eclair);
        ranger();
      }, function () {});
    }
    var rappelCompte = el("div", { hidden: "" });
    pretServeur.then(function () { if (serveur.base && !profil.compte && rappelCompte.isConnected) { rappelCompte.appendChild(rangeeCompte()); rappelCompte.hidden = false; if (window.poserIcones) window.poserIcones(rappelCompte); } });
    var haut = [entete(), zoneCredit(), rappelCompte, rech.recherche, bento];
    if (miens.length > 1) {
      var ul = el("ul", { "class": "liste" });
      miens.slice(1, 8).forEach(function (x) { ul.appendChild(rangeeParcours(x.id, x.s.titre, imageFixe({ titre: x.s.titre }) || x.s.image, detailSuivi(x.s))); });
      haut.push(el("section", { "class": "pile serree" }, [el("h2", { text: "Tes sujets" }), ul]));
    }
    var bandes = [bande(haut, false), bande([rech.idees, credits.noeud], true)];
    montrer(el("div", { "class": "page bandes accueil" }, bandes), "accueil", "Accueil");
  }

  /* ---------- Bibliothèque : toutes les formations déjà écrites ---------- */
  function vueBibliotheque() {
    var vive = vivante();
    var champ = el("input", { "class": "champ", id: "sujet-bibliotheque", type: "search", maxlength: "80", autocomplete: "off", enterkeyhint: "search", placeholder: "Chercher une formation" });
    var ul = el("ul", { "class": "liste" }), compte = el("p", { "class": "meta", role: "status" });
    var zone = el("div", { "class": "pile" }, [compte, ul]);
    function lister(l, q) {
      ul.textContent = "";
      l.forEach(function (x) {
        var li = rangeeParcours(x.id, x.titre, x.image, detailExistante(x));
        if (x.verifie) { var titreX = li.querySelector("b"); titreX.parentNode.insertBefore(el("span", { "class": "badge verifie" }, [icone("verifie"), "Vérifié"]), titreX); }
        else if (complete(x)) { var titreC = li.querySelector("b"); titreC.parentNode.insertBefore(el("span", { "class": "badge recoupe" }, [icone("diplome"), "Complète"]), titreC); }
        ul.appendChild(li);
      });
      compte.textContent = l.length ? pluriel(l.length, "formation", "formations") : (q ? "Aucune formation ne correspond." : "Aucune formation pour le moment.");
      if (window.poserIcones) window.poserIcones(ul);
    }
    function charger0() {
      var locales = [];
      pretServeur.then(function () { return serveur.base ? api("GET", "parcours") : { parcours: [] }; }).then(function (j) { return (j.parcours || []).filter(parNiveauxServeur); }, function () { return []; }).then(function (l) {
        if (!vive()) return;
        lister(locales.concat(l.map(function (x) { return { id: x.id, titre: x.titre, image: imageFixe({ titre: x.titre }) || x.image, verifie: false, lecons: x.lecons, paliers: x.paliers, modules: x.modules, ouverts: x.ouverts, niveauAtteint: x.niveauAtteint }; })), "");
      });
    }
    var minuteur = null, numero = 0;
    champ.addEventListener("input", function () {
      clearTimeout(minuteur); numero += 1;
      var q = champ.value.trim(), mien = numero;
      if (q.length < 2) { charger0(); return; }
      minuteur = setTimeout(function () { chercherExistantes(q).then(function (l) { if (mien === numero && vive()) lister(l, q); }); }, 300);
    });
    montrer(el("div", { "class": "page" }, [entete(), el("h1", { text: "Bibliothèque" }),
      el("p", { "class": "meta", style: "font-size:16px", text: "Les formations déjà écrites. Elles s’ouvrent tout de suite, sans rien régénérer." }),
      el("label", { "for": "sujet-bibliotheque", "class": "sr", text: "Chercher une formation" }), champ, zone,
      lien("#/", "Retour à l’accueil", "btn second")]), "accueil", "Bibliothèque");
    charger0();
  }

  /* ---------- Parcours ---------- */
  function memoriserImage(id, im, req) { var s = etat.parcours[id]; if (s && !imageOk(s.image)) { s.image = { req: req || null, src: im.src, credit: im.credit, lien: im.lien, source: im.source, auteur: im.auteur, lienAuteur: im.lienAuteur, lienSource: im.lienSource }; S.ecrire("koios.etat", etat); } }
  /* Couverture 16:9 : l'image du parcours, sinon une photo cherchée sur Commons puis Unsplash (cadre gris le temps de la recherche, retiré si rien ne vient). */
  function couverture(p) {
    var fixe = imageFixe(p) || imageOk(p.image);
    if (fixe) return photo(fixe, "couverture", p.titre);
    var gardee = suivi(p.id).image;
    if (imageOk(gardee) && gardee.req === requetePhoto(p)) return photo(gardee, "couverture", p.titre);
    /* Tuile de catégorie colorée le temps de la recherche, et si aucune photo pertinente ne vient (jamais une photo hors sujet). */
    var attendre = el("figure", { "class": "photo couverture", "aria-hidden": "true" }, [el("div", { "class": "cadre categorie teinte " + teinteSujet(p.titre) }, [icone(categorie(p.titre))])]);
    trouverImage(requetePhoto(p), "auto").then(function (im) {
      var f = im ? photo(im, "couverture", p.titre) : null;
      if (f) { attendre.replaceWith(f); memoriserImage(p.id, im, requetePhoto(p)); }
    });
    return attendre;
  }
  /* Génération de nuit, côté admin : leçons prêtes sur leçons connues d'une formation, et bouton pour tout mettre en file. Rien n'apparaît sans clé admin valable. */
  function afficherAdminFormation(p, zone, j) {
    zone.textContent = "";
    var f = j.formation;
    if (!f) return;
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" }), info = el("p", { "class": "meta", hidden: "", role: "status" });
    var bouton = el("button", { "class": "btn second", type: "button", text: "Débloquer toute la formation (de nuit)" });
    bouton.addEventListener("click", function () {
      if (bouton.disabled) return;
      bouton.disabled = true; alerte.hidden = true;
      api("POST", "admin", { action: "debloquer", parcours: p.id }, 30000).then(function (r) {
        afficherAdminFormation(p, zone, r);
        var n = r.ajoutees || 0, i2 = zone.querySelector(".info-nuit");
        if (i2) { i2.textContent = n ? pluriel(n, "tâche ajoutée", "tâches ajoutées") + ". Elles s’écrivent la nuit (0\u00a0h à 5\u00a0h\u00a059 UTC), 2 par 2, et en journée si tu l’autorises dans l’espace admin." : "Tout est déjà en file."; i2.hidden = false; }
      }, function (e) { bouton.disabled = false; alerte.textContent = messageErreur(e); alerte.hidden = false; });
    });
    info.className = "meta info-nuit";
    zone.appendChild(el("p", { "class": "meta", text: pluriel(f.pretes, "leçon prête", "leçons prêtes") + " sur " + f.total + (f.ouverts < f.modules ? " · " + pluriel(f.modules - f.ouverts, "module pas encore ouvert", "modules pas encore ouverts") : "") + (f.enFile ? " · " + pluriel(f.enFile, "tâche en file", "tâches en file") : "") }));
    /* Leçons faibles (statut « partiel » avec plus de 20 % de retraits, ou « à revoir ») : réécriture mise en file, la nouvelle version remplace l'ancienne. */
    var reecrire = el("button", { "class": "btn second", type: "button", text: "Réécrire les leçons faibles" });
    reecrire.addEventListener("click", function () {
      if (reecrire.disabled) return;
      reecrire.disabled = true; alerte.hidden = true;
      api("POST", "admin", { action: "reecrire", parcours: p.id }, 30000).then(function (r) {
        afficherAdminFormation(p, zone, r);
        var n = (r.faibles || []).length, i2 = zone.querySelector(".info-nuit");
        if (i2) { i2.textContent = n ? pluriel(r.ajoutees || 0, "réécriture mise en file", "réécritures mises en file") + " sur " + pluriel(n, "leçon faible", "leçons faibles") + ". La nouvelle version remplace l’ancienne." : "Aucune leçon faible."; i2.hidden = false; }
      }, function (e) { reecrire.disabled = false; alerte.textContent = messageErreur(e); alerte.hidden = false; });
    });
    zone.appendChild(bouton); zone.appendChild(reecrire); zone.appendChild(info); zone.appendChild(alerte);
    /* Export pour audit : l'en-tête x-admin-cle part avec la requête (api), le fichier ne contient aucune clé. */
    var telecharger = el("button", { "class": "btn second", type: "button", text: "Télécharger les leçons prêtes" });
    telecharger.addEventListener("click", function () {
      if (telecharger.disabled) return;
      telecharger.disabled = true; alerte.hidden = true;
      api("GET", "admin?export=" + encodeURIComponent(p.id), null, 30000).then(function (r) {
        telecharger.disabled = false;
        var url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
        var a = el("a", { href: url, download: "koios-" + p.id + ".json" });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      }, function (e) { telecharger.disabled = false; alerte.textContent = messageErreur(e); alerte.hidden = false; });
    });
    zone.appendChild(telecharger);
  }
  function vueParcours(id, onglet) {
    var vive = vivante();
    montrer(attente("Ouverture de la formation…"), "accueil", "Formation");
    chargerParcours(id).then(function (p) {
      if (!vive()) return;
      retenir(p); S.ecrire("koios.etat", etat);
      var s = suivi(p.id), prevus = paliersPrevus(p);
      var zone = el("div", { "class": "pile", id: "panneau", role: "tabpanel" });
      var tabs = el("div", { "class": "onglets cinq", role: "tablist", "aria-label": "Sections de la formation" });
      var choix = [["parcours", "Leçons"], ["quiz", "Quiz"], ["defis", "Défis"], ["cartes", "Cartes"], ["glossaire", "Glossaire"]];
      choix.forEach(function (c) {
        var b = el("button", { type: "button", role: "tab", "aria-controls": "panneau", "aria-selected": c[0] === (onglet || "parcours") ? "true" : "false", text: c[1] });
        b.addEventListener("click", function () { history.replaceState(null, "", "#/p/" + encodeURIComponent(p.id) + (c[0] === "parcours" ? "" : "/" + c[0])); tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); }); remplir(c[0]); });
        tabs.appendChild(b);
      });
      var ongletCourant = onglet || "parcours";
      function remplir(o) {
        ongletCourant = o;
        zone.innerHTML = "";
        if (o === "quiz") zone.appendChild(ongletQuiz(p, s)); else if (o === "defis") zone.appendChild(ongletDefis(p, s)); else if (o === "cartes") zone.appendChild(ongletCartes(p, s)); else if (o === "glossaire") zone.appendChild(ongletGlossaire(p, s)); else zone.appendChild(parProgramme(p) ? ongletSommaire(p, s, prevus) : ongletPaliers(p, s, prevus));
        if (window.poserIcones) window.poserIcones(zone);
      }
      var suivant = Math.min(s.fait + 1, p.verifie ? prevus : s.fait + 1), prog = parProgramme(p), mf = prog ? modulesFaits(p, s.fait) : 0;
      var zoneGroupe = el("div", { "class": "pile serree" });
      boutonGroupe(p, zoneGroupe, vive);
      var zoneAdmin = el("div", { "class": "pile serree" });
      if (profil && profil.role === "admin" && parProgramme(p) && !p.verifie) {
        api("GET", "admin?parcours=" + encodeURIComponent(p.id), null, 10000).then(function (j) { if (vive()) afficherAdminFormation(p, zoneAdmin, j); }, function () { /* pas de clé valable, ou hors ligne : rien à montrer */ });
      }
      var ver = null; // la carte « Cours vérifié à la main » est masquée : les 5 chapitres ne sont plus montrés
      var coursVerifie = ver ? el("a", { "class": "cours-verifie", href: "#/p/" + encodeURIComponent(ver.id) }, [icone("verifie"), el("span", { "class": "cv-texte" }, [el("b", { text: "Cours vérifié à la main · " + pluriel(ver.paliers, "chapitre", "chapitres") + " de référence" }), el("span", { "class": "meta", text: "Deux sources par notion. Plus court que cette formation." })]), icone("chevron")]) : null;
      var complet = null;
      if (p.verifie) {
        var alerteC = el("p", { "class": "alerte", hidden: "", role: "status" }), statutC = el("p", { "class": "meta", hidden: "", role: "status" });
        var boutonC = el("button", { "class": "btn second", type: "button" }, [el("span", { text: "Formation complète, de zéro à expert" }), icone("fleche")]);
        boutonC.addEventListener("click", function () { creerParcours(p.titre, boutonC, alerteC, statutC); });
        complet = el("div", { "class": "pile serree" }, [boutonC, el("p", { "class": "meta", text: "Une formation en 4 niveaux, écrite par l’IA, qui part de zéro. Si elle existe déjà, elle s’ouvre." }), statutC, alerteC]);
      }
      montrer(el("div", { "class": "page " + teinteSujet(p.titre) }, [
        el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/" }, [icone("retour"), "Accueil"]), el("span"), puceXP()]),
        couverture(p),
        el("div", { "class": "pile serree bandeau" }, [el("span", {}, [badge({ statut: p.verifie ? "verifie" : "recoupe" })]), el("h1", { text: p.titre }), p.resume ? el("p", { "class": "meta", style: "font-size:16px", text: p.resume }) : null]),
        el("div", { "class": "pile serree" }, [el("div", { "class": "ligne-titre" }, [el("span", { "class": "meta", text: (s.fait ? pluriel(s.fait, "leçon terminée", "leçons terminées") : "Pas encore commencé") + (prog && s.fait ? " · " + mf + " sur " + pluriel(p.modulesTotal, "module", "modules") : "") }), el("span", { "class": "meta gain", text: (s.xp || 0) + N + "XP" })]),
          el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + (prog ? Math.round(mf / Math.max(p.modulesTotal, 1) * 100) : p.verifie ? Math.round(s.fait / Math.max(prevus, 1) * 100) : ((s.fait % 10) * 10)) + "%" })])]),
        fini(p) ? el("p", { "class": "verrou" }, [icone("diplome"), prog ? "Formation terminée. Rejoue les quiz et les défis pour consolider." : "Formation terminée. Rejoue les quiz et les défis pour consolider."]) : lienAvance("#/p/" + encodeURIComponent(p.id) + "/" + suivant, s.fait ? "Continuer · leçon " + suivant : "Commencer la leçon 1", "btn"),
        complet,
        coursVerifie,
        zoneAdmin,
        zoneGroupe,
        s.fait >= 1 && !p.verifie ? el("div", { "class": "pile serree" }, [lien("#/dossier/" + encodeURIComponent(p.id), "Dossier de voyage à imprimer", "lien")]) : null,
        tabs, zone
      ]), "accueil", p.titre);
      remplir(onglet || "parcours");
    }, function (e) { if (vive()) montrer(erreurPage(e.statut === 404 ? "Cette formation n’existe pas encore." : messageErreur(e), "Formation indisponible"), "accueil"); });
  }
  /* Une leçon (pastille fait / actuel / verrou) puis, tous les 5 paliers, son jalon quiz ou défi. */
  function ajouterPalier(ul, p, s, n) {
    var t = titrePalier(p, n) || (n <= s.fait + 1 ? "Leçon " + n : "Leçon à venir");
    var etatP = n <= s.fait ? "fait" : (n === s.fait + 1 ? "actuel" : "");
    var ouvert = n <= s.fait + 1;
    var contenu = [el("span", { "class": "pastille", text: n <= s.fait ? null : String(n), "aria-hidden": "true" }, [n <= s.fait ? icone("juste") : null]), el("span", {}, [el("b", { text: t }), el("span", { "class": "etat", text: n <= s.fait ? "Terminé" : (ouvert ? "À faire" : "Verrouillé") })]), ouvert ? icone("chevron") : icone("cadenas")];
    ul.appendChild(el("li", { "class": etatP }, [ouvert ? el("a", { href: "#/p/" + encodeURIComponent(p.id) + "/" + n, "aria-label": "Leçon " + n + N + ": " + t }, contenu) : el("span", { "class": "bloque" }, contenu)]));
    if (n % 5 === 0) {
      var k = n, nom = n % 10 === 0 ? "Grand quiz" : "Quiz", score = (s.quiz || {})[k];
      var dispo = s.fait >= k;
      var c2 = [el("span", { "class": "pastille", "aria-hidden": "true" }, [icone(score !== undefined ? "juste" : (n % 10 === 0 ? "trophee" : "liste"))]), el("span", {}, [el("b", { text: nom + " · leçons " + (k - (n % 10 === 0 ? 9 : 4)) + " à " + k }), el("span", { "class": "etat", text: score !== undefined ? "Meilleur score" + N + ": " + score + F + "%" : (dispo ? "Disponible" : "S’ouvre à la leçon " + k) })]), dispo ? icone("chevron") : icone("cadenas")];
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
      bloc.appendChild(el("div", { "class": "etape-titre" }, [el("h2", { text: "Étape " + e + (et.titre && et.titre !== "Étape " + e ? " · " + et.titre : "") }), el("span", { "class": "meta", text: "Leçons " + debut + " à " + finE })]));
      bloc.appendChild(ul);
    }
    if (!p.verifie) bloc.appendChild(el("p", { "class": "meta", text: "La formation continue sans fin" + N + ": chaque étape de 10 leçons en ouvre une autre, plus précise." }));
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
  function moduleDepliant(m, fait, resume, chemin, ouvert, idParcours) {
    var id = "module-" + m.numero;
    var fiche = el("a", { "class": "lien fiche-module", href: "#/p/" + encodeURIComponent(idParcours) + "/fiche/" + m.numero }, [icone("carnet"), "Fiche du module"]);
    var volet = el("div", { "class": "depli", id: id, "data-ouvert": ouvert ? "1" : "0" }, [el("div", { "class": "depli-int" }, [el("p", { "class": "meta", text: resume }), fiche, chemin])]);
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
      var mods = niv.modules;
      var faits = mods.filter(function (m) { var e = ouverts[m.numero], l = e ? e.paliers || [] : []; return l.length && l[l.length - 1].numero <= s.fait; }).length;
      var total = mods.length;
      var ul = el("ul", { "class": "liste modules" });
      mods.forEach(function (m) {
        var e = ouverts[m.numero];
        if (e) {
          var l = e.paliers || [], a = l.length ? l[0].numero : 0, z = l.length ? l[l.length - 1].numero : 0;
          var nFaits = l.filter(function (x) { return x.numero <= s.fait; }).length, fait = l.length > 0 && nFaits >= l.length;
          var resume = fait ? "Terminé · " + pluriel(l.length, "leçon", "leçons") : "Leçons " + a + " à " + z + " · " + nFaits + " sur " + l.length + " faites";
          var chemin = el("ol", { "class": "chemin" });
          l.forEach(function (x) { ajouterPalier(chemin, p, s, x.numero); });
          ul.appendChild(moduleDepliant(m, fait, resume, chemin, m.numero === courant, p.id));
        } else if (m.numero === prochain && s.fait >= prevus) {
          ul.appendChild(el("li", { "class": "module-ferme" }, [el("div", { "class": "rang" }, rangModule(m, "actuel", icone("chevron"))),
            lienAvance("#/p/" + encodeURIComponent(p.id) + "/" + (prevus + 1), "Ouvrir ce module", "btn second")]));
        } else {
          ul.appendChild(el("li", { "class": "module-ferme", "aria-label": "verrouillé" }, [el("div", { "class": "rang" }, rangModule(m, "bloque", icone("cadenas")))]));
        }
      });
      bloc.appendChild(el("section", { "class": "pile niveau " + ["t1", "t2", "t3", "t5"][((niv.numero || 1) - 1) % 4] }, [
        el("div", { "class": "niveau-haut" }, [
          el("span", { "class": "tuile ronde", "aria-hidden": "true" }, [icone(ICONES_NIVEAU[niv.numero] || "diamant")]),
          el("div", {}, [el("span", { "class": "sur", text: "Niveau " + niv.numero }), el("h2", { text: niv.titre })]),
          el("span", { "class": "meta", text: faits + "/" + total + (total > 1 ? " modules" : " module") })]),
        el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.round(faits / Math.max(total, 1) * 100) + "%" })]),
        ul,
        !p.verifie && L.niveauFini(p, niv, s.fait) ? blocTestNiveau(p, s, niv) : null]));
    });
    if (!formationComplete(p)) bloc.appendChild(el("p", { "class": "meta", text: "Les leçons d’un module sont rédigées quand tu l’ouvres, dès que tu as fini le module précédent." }));
    else if (!p.verifie) bloc.appendChild(boutonProlonger(p, function () { route(); }));
    return bloc;
  }
  function ongletQuiz(p, s) {
    return el("div", { "class": "pile" }, [
      el("div", { "class": "carte" }, [el("h2", { text: "Quiz direct" }), el("p", { "class": "meta", text: "Dix questions sur tout le sujet, avec l’explication de chaque réponse. Disponible tout de suite." }), lienAvance("#/p/" + encodeURIComponent(p.id) + "/quiz/direct", "Lancer le quiz", "btn")]),
      s.fait >= 5 ? el("div", { "class": "carte" }, [el("h2", { text: "Quiz des leçons" }), el("p", { "class": "meta", text: "Rejoue les quiz déjà ouverts depuis l’onglet Leçons." })]) : el("p", { "class": "verrou" }, [icone("cadenas"), "Les quiz s’ouvrent toutes les 5 leçons."])
    ]);
  }
  function ongletDefis(p, s) {
    if (s.fait < 5) return el("p", { "class": "verrou" }, [icone("cadenas"), "Mini‑jeux et duels s’ouvrent à la leçon 5. Encore " + pluriel(5 - s.fait, "leçon", "leçons") + "."]);
    var ul = el("ul", { "class": "liste" });
    [["vraifaux", "Vrai ou faux express", "Huit affirmations, réponds vite."], ["paires", "Associe les notions", "Relie chaque terme à sa définition."], ["ordre", "Remets dans l’ordre", "Classe les dates de tes leçons."], ["duel", "Duel avec un ami", "Dix questions, les mêmes pour vous deux."]].forEach(function (j) {
      ul.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/p/" + encodeURIComponent(p.id) + "/jeu/" + j[0] }, [tuile(j[0] === "duel" ? "epee" : j[0] === "paires" ? "liste" : j[0] === "ordre" ? "sablier" : "ampoule"), el("span", {}, [el("b", { text: j[1] }), el("span", { "class": "meta", text: j[2] })]), icone("chevron")])]));
    });
    return ul;
  }

  /* ---------- Cartes : révision des cartes des leçons déjà faites ---------- */
  /* Charge les leçons faites (déjà écrites : aucune IA), quelques-unes à la fois, et en tire les cartes avec leur module. */
  function chargerCartes(p, s, progres) {
    var faits = [], k;
    for (k = 1; k <= s.fait; k++) faits.push(k);
    var module = {}; (p.etapes || []).forEach(function (e) { (e.paliers || []).forEach(function (x) { module[x.numero] = e; }); });
    var cartes = [], suivant = 0, fini = 0;
    return new Promise(function (resolu) {
      if (!faits.length) { resolu(cartes); return; }
      function un() {
        if (suivant >= faits.length) return;
        var n = faits[suivant++];
        chargerPalier(p.id, n).then(function (l) {
          ((l && l.cartes) || []).forEach(function (c, j) {
            if (c && typeof c.recto === "string" && typeof c.verso === "string") cartes.push({ id: p.id + ":" + n + ":" + (j + 1), recto: c.recto, verso: c.verso, n: n, titre: l.titre || "", module: module[n] || null });
          });
        }, function () { /* leçon illisible : ses cartes manquent, le reste s'affiche */ }).then(function () {
          fini += 1; if (progres) progres(fini, faits.length);
          if (fini === faits.length) resolu(cartes.sort(function (a, b) { return a.n - b.n || a.id.localeCompare(b.id); })); else un();
        });
      }
      for (var i = 0; i < Math.min(4, faits.length); i++) un();
    });
  }
  function ongletCartes(p, s) {
    var bloc = el("div", { "class": "pile" });
    var vide = function (texte) { return etatVide("carnet", texte || "Les cartes des leçons que tu as faites apparaîtront ici.", fini(p) ? null : lienAvance("#/p/" + encodeURIComponent(p.id) + "/" + (s.fait + 1), s.fait ? "Continuer · leçon " + (s.fait + 1) : "Commencer la leçon 1", "btn second petit")); };
    if (!(s.fait >= 1) || p.verifie) { bloc.appendChild(vide(p.verifie ? "Les cours vérifiés n’ont pas de cartes. La formation complète en a, à chaque leçon." : null)); return bloc; }
    var attenteC = el("p", { "class": "attente", role: "status", text: "Chargement des cartes…" });
    bloc.appendChild(attenteC);
    chargerCartes(p, s, function (a, b) { if (attenteC.isConnected) attenteC.textContent = "Chargement des cartes… " + a + " sur " + b; }).then(function (cartes) {
      attenteC.remove();
      if (!bloc.isConnected && !bloc.parentNode) { /* l'onglet a changé : le travail est gardé en mémoire, rien à faire */ }
      if (!cartes.length) { bloc.appendChild(vide("Aucune carte dans les leçons déjà faites. Les leçons nouvelles en ont.")); return; }
      var modules = [];
      cartes.forEach(function (c) { if (c.module && !modules.some(function (m) { return m.numero === c.module.numero; })) modules.push(c.module); });
      var choisi = "";
      var select = el("select", { "class": "champ", id: "filtre-module" }, [el("option", { value: "", text: "Tous les modules" })]);
      modules.forEach(function (m) { select.appendChild(el("option", { value: String(m.numero), text: "Module " + m.numero + " · " + m.titre })); });
      var compte = el("p", { "class": "meta", role: "status" });
      var zoneListe = el("div", { "class": "pile" });
      var zoneBouton = el("div", { "class": "pile serree" });
      var visibles = 30;
      function filtrees() { return cartes.filter(function (c) { return !choisi || (c.module && String(c.module.numero) === choisi); }); }
      function sues(l) { return l.filter(function (c) { return etat.cartes[c.id] && etat.cartes[c.id].ok === true; }).length; }
      function afficher() {
        var l = filtrees(), nSues = sues(l), arevoir = l.length - nSues;
        compte.textContent = pluriel(l.length, "carte", "cartes") + " · " + nSues + (nSues > 1 ? " sues" : " sue") + " · " + arevoir + " à revoir ou nouvelle" + (arevoir > 1 ? "s" : "");
        zoneBouton.textContent = "";
        if (l.length) {
          var cible = arevoir ? l.filter(function (c) { return !(etat.cartes[c.id] && etat.cartes[c.id].ok === true); }) : l;
          var rev = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Réviser · " + pluriel(cible.length, "carte", "cartes") }), icone("fleche")]);
          rev.addEventListener("click", function () { reviser(cible); });
          zoneBouton.appendChild(rev);
          if (window.poserIcones) window.poserIcones(zoneBouton);
        }
        zoneListe.textContent = "";
        var grille = el("div", { "class": "cartes-grille" });
        l.slice(0, visibles).forEach(function (c) { grille.appendChild(el("div", { "class": "carte-item" }, [carteRetournable(c, function (on) { if (on && !etat.cartes[c.id]) { noterCarte(c.id, null); } }), el("a", { "class": "lien discret", href: "#/p/" + encodeURIComponent(p.id) + "/" + c.n, text: "Leçon " + c.n + (c.titre ? " · " + c.titre : "") })])); });
        zoneListe.appendChild(grille);
        if (l.length > visibles) {
          var plus = el("button", { "class": "btn second petit", type: "button", text: "Afficher plus de cartes" });
          plus.addEventListener("click", function () { visibles += 30; afficher(); plus.remove(); });
          zoneListe.appendChild(plus);
        }
      }
      /* Mode « Réviser » : une carte à la fois ; on retourne, puis « À revoir » ou « Je savais ». */
      function reviser(liste) {
        var file = melanger(liste), i = 0, savait = 0;
        var cadre = el("div", { "class": "pile revision" });
        bloc.textContent = ""; bloc.appendChild(cadre);
        function carteSuivante() {
          cadre.textContent = "";
          if (i >= file.length) { fin(); return; }
          var c = file[i], etapes = el("p", { "class": "meta", role: "status", text: "Carte " + (i + 1) + " sur " + file.length });
          var barre = el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.round(i / file.length * 100) + "%" })]);
          var rep = el("div", { "class": "reponses-rev", hidden: "" });
          var revoir = el("button", { "class": "btn second", type: "button", text: "À revoir" }), sue = el("button", { "class": "btn", type: "button", text: "Je savais" });
          function repondre(ok) { reponseRevision(c.id, ok); if (ok) savait += 1; i += 1; carteSuivante(); var h = cadre.querySelector(".carte-flip"); if (h) h.focus(); }
          revoir.addEventListener("click", function () { repondre(false); });
          sue.addEventListener("click", function () { repondre(true); });
          rep.appendChild(revoir); rep.appendChild(sue);
          var tuileC = carteRetournable(c, function (on) { rep.hidden = !on; indice.hidden = on; });
          var indice = el("p", { "class": "meta", text: "Touche la carte pour voir la réponse." });
          var quitter = el("button", { "class": "lien", type: "button", text: "Arrêter la révision" });
          quitter.addEventListener("click", function () { route(); });
          cadre.appendChild(etapes); cadre.appendChild(barre); cadre.appendChild(tuileC); cadre.appendChild(indice); cadre.appendChild(rep); cadre.appendChild(quitter);
        }
        function fin() {
          var rate = file.length - savait;
          cadre.appendChild(el("h2", { text: "Révision terminée" }));
          cadre.appendChild(el("p", { text: "Tu savais " + savait + " carte" + (savait > 1 ? "s" : "") + " sur " + file.length + "." }));
          var retour = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Retour aux cartes" }), icone("fleche")]);
          retour.addEventListener("click", function () { route(); });
          cadre.appendChild(retour);
          if (window.poserIcones) window.poserIcones(cadre);
          if (rate) cadre.appendChild(el("p", { "class": "meta", text: pluriel(rate, "carte reste", "cartes restent") + " à revoir. Elles reviennent demain dans la révision du jour." }));
        }
        carteSuivante();
        if (window.poserIcones) window.poserIcones(cadre);
      }
      select.addEventListener("change", function () { choisi = select.value; visibles = 30; afficher(); });
      bloc.appendChild(el("div", { "class": "pile serree" }, [el("label", { "for": "filtre-module", "class": "sr", text: "Filtrer par module" }), modules.length > 1 ? select : null, compte]));
      bloc.appendChild(zoneBouton); bloc.appendChild(zoneListe);
      afficher();
      if (window.poserIcones) window.poserIcones(bloc);
    }, function () { attenteC.replaceWith(el("p", { "class": "verrou" }, [icone("carnet"), "Les cartes ne se chargent pas. Réessaie dans un moment."])); });
    return bloc;
  }

  /* ---------- Fiche d'un module : « À retenir » et définitions des leçons faites, sans IA ---------- */
  function vueFiche(id, numero) {
    var vive = vivante();
    montrer(attente("Ouverture de la fiche…"), "accueil", "Fiche du module");
    chargerParcours(id).then(function (p) {
      if (!vive()) return;
      var e = (p.etapes || []).filter(function (x) { return x.numero === numero; })[0];
      var mod = parProgramme(p) ? p.programme.niveaux.reduce(function (acc, niv) { return acc || niv.modules.filter(function (m) { return m.numero === numero; }).map(function (m) { return { m: m, niv: niv }; })[0]; }, null) : null;
      var retour = el("a", { "class": "retour-texte", href: "#/p/" + encodeURIComponent(id) }, [icone("retour"), "Sommaire"]);
      if (!e || !mod) { montrer(el("div", { "class": "page" }, [el("div", { "class": "barre-haut" }, [retour, el("span"), puceXP()]), el("div", { "class": "pile" }, [etatVide("carnet", "Ce module n’est pas encore ouvert.", null)])]), "accueil", "Fiche du module"); return; }
      var s = suivi(p.id), faits = (e.paliers || []).filter(function (x) { return x.numero <= s.fait; });
      var corps = el("div", { "class": "pile ecart" });
      var page = el("div", { "class": "page " + teinteSujet(p.titre) }, [
        el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [retour, el("span"), puceXP()]),
        el("div", { "class": "pile serree bandeau" }, [el("span", { "class": "sur", text: "Fiche · Niveau " + mod.niv.numero + " · " + mod.niv.titre }), el("h1", { text: "Module " + mod.m.numero + N + ": " + mod.m.titre }), el("p", { "class": "meta", style: "font-size:16px", text: mod.m.objectif })]),
        corps]);
      montrer(page, "accueil", "Fiche · " + mod.m.titre);
      if (!faits.length) { corps.appendChild(etatVide("carnet", "Fais une première leçon de ce module" + N + ": sa fiche apparaîtra ici.", lienAvance("#/p/" + encodeURIComponent(id) + "/" + (e.paliers[0] ? e.paliers[0].numero : s.fait + 1), "Ouvrir la leçon " + (e.paliers[0] ? e.paliers[0].numero : s.fait + 1), "btn second petit"))); if (window.poserIcones) window.poserIcones(corps); return; }
      var attenteF = el("p", { "class": "attente", role: "status", text: "Chargement de la fiche…" });
      corps.appendChild(attenteF);
      pretServeur.then(function () {
        if (!serveur.base) throw Object.assign(new Error("hors ligne"), { statut: 0 });
        return api("GET", "fiche?parcours=" + encodeURIComponent(id) + "&de=" + faits[0].numero + "&a=" + faits[faits.length - 1].numero);
      }).then(function (j) {
        if (!vive()) return;
        attenteF.remove();
        var lecons = (j.lecons || []).filter(function (l) { return l && typeof l.numero === "number" && l.numero <= s.fait; });
        if (!lecons.length) { corps.appendChild(etatVide("carnet", "Les leçons de ce module ne sont pas encore en mémoire.", null)); if (window.poserIcones) window.poserIcones(corps); return; }
        lecons.forEach(function (l) {
          var defs = (l.definitions || []).filter(function (d) { return d && typeof d.terme === "string" && typeof d.definition === "string"; });
          var dl = null;
          if (defs.length) { dl = el("dl", { "class": "definitions" }); defs.forEach(function (d, k) { dl.appendChild(el("div", { "class": k === 0 ? "vedette" : null }, [el("dt", { text: d.terme }), el("dd", { text: d.definition })])); }); }
          corps.appendChild(el("section", { "class": "pile lecon fiche-lecon" }, [
            el("h2", {}, [el("a", { "class": "lien-titre", href: "#/p/" + encodeURIComponent(id) + "/" + l.numero, text: "Leçon " + l.numero + (l.titre ? " · " + l.titre : "") })]),
            blocRetenir((l.aRetenir || []).filter(function (t) { return typeof t === "string"; })),
            dl ? el("section", {}, [titreSection("Définitions", "livre-ouvert"), dl]) : null]));
        });
        if (window.poserIcones) window.poserIcones(corps);
      }, function (er) { if (vive()) { attenteF.replaceWith(el("p", { "class": "verrou" }, [icone("carnet"), er.statut === 0 ? "La fiche demande la connexion. Réessaie en ligne." : "La fiche ne se charge pas. Réessaie dans un moment."])); if (window.poserIcones) window.poserIcones(corps); } });
    }, function (er) { if (vive()) montrer(erreurPage(er.statut === 404 ? "Cette formation n’existe pas encore." : messageErreur(er), "Fiche indisponible"), "accueil"); });
  }

  /* ---------- Glossaire : onglet, mots soulignés dans les leçons, fiche ---------- */
  var glossaires = {}; // par parcours : { k, termes } (le plus grand « jusqu'à » demandé ; une lecture plus courte en est extraite)
  function sansAccent(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim(); }
  function comparerTermes(a, b) { return a.terme.localeCompare(b.terme, "fr", { sensitivity: "base" }) || a.numero - b.numero; }
  /* Parcours vérifiés : même forme que GET /api/glossaire (termes uniques sans accents ni casse, première leçon gardée, tri français). */
  var DATE_TERME = /^\s*(\d|vers\s+\d|(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+\d)/i; // les dates des repères ne sont pas des mots à définir
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
    var vide = function () { return etatVide("carnet", "Les mots définis dans tes leçons apparaîtront ici.", fini(p) ? null : lienAvance("#/p/" + encodeURIComponent(p.id) + "/" + (s.fait + 1), s.fait ? "Continuer · leçon " + (s.fait + 1) : "Commencer la leçon 1", "btn second petit")); };
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
    var court = Array.from(terme.trim()).length <= 4; // « Mars » la planète, pas « mars » le mois : un mot de 4 lettres ou moins se souligne à casse identique
    var motif = terme.trim().split(/\s+/).map(function (m) { return m.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&").replace(/['’]/g, "['’]"); }).join("\\s+");
    return new RegExp(motif + "(?![\\p{L}\\p{N}_])", court ? "gu" : "giu");
  }
  function dejaPris(liste, d, f) { return liste.some(function (x) { return d < x.f && x.d < f; }); }
  /* Première occurrence de chaque mot connu dans En bref, À retenir et les explications : les plus longs d'abord, sans chevauchement. */
  function lierTermes(article, termes, id) {
    var zones = Array.prototype.slice.call(article.querySelectorAll(".texte p, .a-retenir li, .avant-liste li, .exemple p")), pris;
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
        var b = el("span", { "class": "terme", role: "button", tabindex: "0", "aria-haspopup": "dialog", text: texte.slice(x.d, x.f) });
        b.addEventListener("click", function () { ouvrirFiche(x.t, id, b); });
        b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirFiche(x.t, id, b); } });
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
  /* Visuels de la leçon (lot 9A) : 0 à 2 figures SVG dessinées par Visuels.visuel (createElementNS, aucune donnée insérée comme HTML) ;
     un tableau alternatif, lisible par lecteur d'écran, accompagne chaque dessin. Un visuel inutilisable est simplement absent ; les anciennes leçons n'en ont pas. */
  function blocVisuels(liste) {
    var V = window.Visuels;
    if (!V || !V.visuel || !Array.isArray(liste)) return null;
    var figures = liste.slice(0, 2).map(function (v) { return V.visuel(v); }).filter(Boolean);
    return figures.length ? el("div", { "class": "visuels-lecon" }, figures) : null;
  }
  /* « À retenir » : bloc à part (filet gauche, fond --surface, puces). */
  function blocRetenir(liste) { var ul = listeRetenir(liste); return ul ? el("section", { "class": "retenir" }, [titreSection("À retenir", "epingle"), ul]) : null; }
  /* Durée de lecture estimée : mots du texte affiché (hors sources, note de vérification et dessin du réseau), 200 mots par minute, 1 minute au moins ; 0 si rien n'est lisible. */
  function dureeLecture(noeud) {
    var c = noeud.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll(".sources-pliees, .sources-lecon, .verif, .graphe-reseau, .visuels-lecon"), function (x) { x.remove(); });
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
  /* Sources : repliées par défaut, sous un résumé « Sources (n) » (touche = ouvrir). */
  function sourcesPliees(n, liste) {
    return el("details", { "class": "sources-pliees" }, [el("summary", {}, [el("span", { "class": "aide-titre" }, [icone("lien"), el("span", { text: "Sources (" + n + ")" })]), icone("chevron")]), liste]);
  }
  /* Carte retournable : un bouton à deux faces. Touche, Entrée ou Espace la retourne ; aria-pressed dit si la réponse est visible. L'animation est coupée sous prefers-reduced-motion. */
  function carteRetournable(c, surRetourne) {
    var recto = el("span", { "class": "face recto" }, [el("span", { "class": "sur", text: "Question" }), el("span", { "class": "face-texte", text: c.recto })]);
    var verso = el("span", { "class": "face verso", "aria-hidden": "true" }, [el("span", { "class": "sur", text: "Réponse" }), el("span", { "class": "face-texte", text: c.verso })]);
    var b = el("button", { "class": "carte-flip", type: "button", "aria-pressed": "false" }, [el("span", { "class": "flip-int" }, [recto, verso])]);
    b.addEventListener("click", function () {
      var on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      recto.setAttribute("aria-hidden", on ? "true" : "false"); verso.setAttribute("aria-hidden", on ? "false" : "true");
      b.classList.toggle("retournee", on);
      if (surRetourne) surRetourne(on);
    });
    return b;
  }
  /* « Tes cartes » en fin de leçon : 2 à 4 tuiles. La première fois qu'une carte est retournée, elle est notée comme vue. */
  function blocCartesLecon(p, n, cartes) {
    var liste = (cartes || []).filter(function (c) { return c && typeof c.recto === "string" && typeof c.verso === "string"; });
    if (liste.length < 2) return null;
    var grille = el("div", { "class": "cartes-grille" });
    liste.forEach(function (c, k) {
      var id = p.id + ":" + n + ":" + (k + 1);
      grille.appendChild(carteRetournable(c, function (on) { if (on && !etat.cartes[id]) noterCarte(id, null); }));
    });
    return el("section", { "class": "cartes-lecon" }, [titreSection("Tes cartes", "carnet"), el("p", { "class": "meta", text: "Touche une carte pour voir la réponse. Tu les retrouves dans l’onglet Cartes de la formation." }), grille]);
  }
  function texteL(t) { if (!t) return null; var d = el("div", { "class": "texte" }); String(t).split("\n").forEach(function (x) { if (x.trim()) d.appendChild(el("p", { text: x })); }); return d; }
  function listeRetenir(liste, cls) { if (!liste || !liste.length) return null; var ul = el("ul", { "class": cls || "a-retenir" }); liste.forEach(function (t) { ul.appendChild(el("li", { text: t })); }); return ul; }
  /* Au-dessus du titre : « Niveau · Module » (formation par niveaux) ou « Sommaire », dans les deux cas un lien vers le sommaire. */
  function filAriane(l, id) {
    var sommaire = "#/p/" + encodeURIComponent(id);
    if (!l.niveau || !l.module) return el("nav", { "aria-label": "Sommaire" }, [el("a", { "class": "fil-lien", href: sommaire }, [icone("sommaire"), "Sommaire"])]);
    return el("nav", { "aria-label": "Position dans la formation" }, [el("a", { "class": "fil-lien", href: sommaire }, [icone("sommaire"), el("span", { "class": "sr", text: "Sommaire" + N + ": " }),
      el("ol", { "class": "fil" }, [el("li", { text: "Niveau " + l.niveau.numero + " · " + l.niveau.titre }), el("li", { text: "Module " + l.module.numero + " · " + l.module.titre })])])]);
  }
  function pageVerrou(id, texte, n) { montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [el("p", { "class": "verrou" }, [icone("cadenas"), texte]), lien("#/p/" + encodeURIComponent(id) + "/" + n, "Aller à la leçon " + n, "btn")])]), "accueil", "Verrouillé"); }
  /* « Aller plus loin » : l'IA écrit 3 à 5 modules de plus (niveau « Maîtrise n »). Seulement quand tous les modules sont ouverts ; connexion requise. `apres` reçoit la formation mise à jour (ou null si le serveur dit qu'elle l'a déjà été). */
  function boutonProlonger(p, apres) {
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" }), statut = el("p", { "class": "meta", hidden: "", role: "status" });
    var libelle = "Aller plus loin · 3 à 5 modules de plus";
    var etiquette = el("span", { text: libelle });
    var b = el("button", { "class": "btn second", type: "button" }, [etiquette, icone("fleche")]);
    b.addEventListener("click", function () {
      if (b.disabled) return;
      alerte.hidden = true; b.disabled = true; etiquette.textContent = "Écriture de la suite…";
      statut.textContent = "Le Rival écrit les nouveaux modules à partir des sources. Compte jusqu’à une minute."; statut.hidden = false;
      pretCompte().then(function () {
        if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
        return api("POST", "parcours", { id: p.id, prolonger: true }, 100000);
      }).then(function (j) {
        cache["p:" + p.id] = Promise.resolve(j.parcours);
        apres(j.parcours);
      }, function (e) {
        if (e.statut === 409) { delete cache["p:" + p.id]; apres(null); return; }
        b.disabled = false; etiquette.textContent = libelle; statut.hidden = true;
        alerte.textContent = messageErreur(e, "Limite du jour" + N + ": " + pluriel(LIMITES.prolonger, "formation prolongée", "formations prolongées") + " par personne. Reviens demain.");
        alerte.hidden = false;
      });
    });
    return el("div", { "class": "pile serree prolonger" }, [el("p", { "class": "meta", text: "Tu as ouvert tous les modules. Le Rival peut en écrire de nouveaux, plus pointus, pour tout le monde." }), b, statut, alerte]);
  }
  function pageFin(p) {
    var base = "#/p/" + encodeURIComponent(p.id), nb = paliersPrevus(p);
    montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [
      el("span", { "class": "sur", text: p.titre || "Formation" }),
      el("h1", { text: "Formation terminée" }),
      el("p", { text: "Tu as fait le tour de ce sujet" + (nb ? N + ": " + pluriel(nb, "leçon", "leçons") + (p.modulesTotal ? " dans " + pluriel(p.modulesTotal, "module", "modules") : "") : "") + "." }),
      lienAvance(base + "/quiz/direct", "Lancer le quiz direct", "btn"),
      p.programme && formationComplete(p) && !p.verifie ? boutonProlonger(p, function () { delete cache["p:" + p.id]; location.hash = base; }) : null,
      lien("#/", "Retour à l’accueil", "btn second")])]), "accueil", "Formation terminée");
  }
  function vuePalier(id, n) {
    var s0 = suivi(id);
    if (n > (s0.fait || 0) + 1) { pageVerrou(id, "Cette leçon s’ouvre après la leçon " + (n - 1) + ".", (s0.fait || 0) + 1); return; }
    var vive = vivante();
    montrer(attenteLecon(), null, "Leçon");
    chargerParcours(id).then(function (p0) {
      if (formationComplete(p0) && n > paliersPrevus(p0)) return { fin: p0 };
      return chargerPalier(id, n).then(function (l) {
        if (!l) throw Object.assign(new Error("introuvable"), { statut: 404 });
        // Un module vient de s'ouvrir : le parcours gardé en mémoire est périmé.
        if (parProgramme(p0) && n > paliersPrevus(p0)) { delete cache["p:" + id]; return chargerParcours(id).then(function (p) { return { p: p, l: l }; }); }
        return { p: p0, l: l };
      });
    }).then(function (r) {
      if (!vive()) return;
      if (r.fin) { pageFin(r.fin); return; }
      var p = r.p, l = r.l;
      retenir(p);
      var s = suivi(p.id), V = window.Visuels || {};
      if (n > s.fait + 1) { montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [el("p", { "class": "verrou" }, [icone("cadenas"), "Cette leçon s’ouvre après la leçon " + (n - 1) + "."]), lien("#/p/" + encodeURIComponent(p.id) + "/" + (s.fait + 1), "Aller à la leçon " + (s.fait + 1), "btn")])]), "accueil", "Leçon verrouillée"); return; }
      var dl = null;
      var defs = (l.definitions || []).concat((l.frise || []).length >= 2 ? [] : (l.reperes || []));
      if (defs.length) { dl = el("dl", { "class": "definitions" }); defs.forEach(function (d, k) { dl.appendChild(el("div", { "class": k === 0 ? "vedette" : null }, [el("dt", { text: d.terme }), el("dd", { text: d.definition })])); }); }
      var srcs = null;
      if ((l.sources || []).length) {
        var listeSrc = el("ul", { "class": "sources-lecon" });
        l.sources.forEach(function (x) { listeSrc.appendChild(el("li", {}, [x[1] ? el("a", { href: x[1], target: "_blank", rel: "noopener", text: x[0] }) : el("span", { text: x[0] })])); });
        srcs = sourcesPliees(l.sources.length, listeSrc);
      }
      var v = l.verification || {};
      var noteV = v.statut === "verifie" ? v.note : (v.statut === "seule" && v.ia ? "Rédigé par l’IA " + v.ia[0] + " à partir des sources ci‑dessus (surtout Wikipédia). Aucun second contrôle" + N + ": une seule IA a écrit cette leçon, sans relecture humaine." : v.ia ? "Rédigé par l’IA " + v.ia[0] + " à partir des sources ci‑dessus (surtout Wikipédia), puis contrôlé affirmation par affirmation par l’IA " + v.ia[1] + (v.retirees ? " ; " + pluriel(v.retirees, "affirmation non confirmée a été retirée", "affirmations non confirmées ont été retirées") + "." : ".") + (v.aValider ? " " + pluriel(v.aValider, "affirmation, soutenue par un seul document, est à valider", "affirmations, soutenues par un seul document, sont à valider") + "." : "") + " Pas de relecture humaine." : "Rédigé à partir des sources ci‑dessus.");
      // Question de compréhension
      var bonus = 0, qIndex = (l.questions || []).findIndex(function (q) { return q.type === "qcm"; });
      var verifBloc = null;
      if (qIndex >= 0) {
        verifBloc = el("section", { "class": "bloc-verif" }, [el("h2", { text: "Vérifie ta compréhension" })]);
        verifBloc.appendChild(rendreQuestion(l.questions[qIndex], function (juste) {
          var it = { palier: l.id, index: qIndex, titre: l.titre };
          if (juste) { bonus = etat.reussies[it.palier + "#" + it.index] ? 0 : XP.verif; oublierErreur(it); } else noterErreur(it);
          if (!deja && bonus) finir.firstChild.textContent = "Terminer la leçon · +" + (XP.palier + bonus) + N + "XP"; // le bouton annonce le vrai gain
          S.ecrire("koios.etat", etat);
        }));
      }
      var deja = n <= s.fait;
      /* Fin de leçon : ce qui vient ensuite, d'après le titre de la leçon suivante quand son module est ouvert. */
      var suiteT = null; (p.etapes || []).forEach(function (e) { (e.paliers || []).forEach(function (x) { if (x.numero === n + 1) suiteT = x.titre; }); });
      var ensuite = suiteT ? el("p", { "class": "meta ensuite" }, [icone("fleche"), "Ensuite" + N + ": " + suiteT]) : null;
      var finir = el("button", { "class": "btn", type: "button" }, [el("span", { text: deja ? "Leçon suivante" : "Terminer la leçon · +" + XP.palier + N + "XP" }), icone("fleche")]);
      finir.addEventListener("click", function () {
        var s2 = suivi(p.id);
        if (finir.disabled) return;
        var gain = 0;
        if (n > s2.fait) { if (bonus && !premiereReussite({ palier: l.id, index: qIndex })) bonus = 0; s2.fait = n; majModules(p, s2); etat.parcours[p.id] = s2; noterJour("lecon"); gain = XP.palier + bonus; gagner(gain, p.id); toast("+" + gain + N + "XP"); }
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
      var rappels = (l.avant || []).filter(function (t) { return typeof t === "string" && t; });
      var avant = rappels.length ? el("section", { "class": "avant" }, [titreSection("Avant de commencer", "chemin"), listeRetenir(rappels, "avant-liste"),
        n > 1 ? el("a", { "class": "lien", href: "#/p/" + encodeURIComponent(p.id) + "/glossaire" }, [icone("carnet"), "Voir le glossaire"]) : null]) : null;
      var exemple = typeof l.exemple === "string" && l.exemple ? el("section", { "class": "exemple" }, [titreSection("Exemple", "ampoule"), texteL(l.exemple)]) : null;
      /* Objectif mesurable et rappel de ce qui précède : facultatifs (les leçons plus anciennes n'en ont pas). */
      var objectifL = typeof l.objectif === "string" && l.objectif, rappelL = typeof l.rappel === "string" && l.rappel;
      var blocObjectif = objectifL || rappelL ? el("section", { "class": "objectif-lecon pile serree" }, [titreSection("Objectif", "medaille"), objectifL ? el("p", { "class": "objectif-phrase", text: l.objectif }) : null, rappelL ? el("p", { "class": "meta rappel", text: l.rappel }) : null]) : null;
      var cartesL = blocCartesLecon(p, n, l.cartes);
      var originales = l.sections || {};
      var secEls = {
        enBref: sectionL("En bref", texteL(originales.enBref), "eclair"),
        comment: sectionL("Comment", texteL(originales.comment), "engrenage"),
        pourquoi: sectionL("Pourquoi", texteL(originales.pourquoi), "aide"),
        ouQuand: sectionL("Où et quand", texteL(originales.ouQuand), "repere")
      };
      var article = el("article", { "class": "lecon" }, [
        blocObjectif,
        avant,
        secEls.enBref,
        blocRetenir(l.aRetenir),
        secEls.comment,
        blocVisuels(l.visuels),
        exemple,
        secEls.pourquoi,
        sectionL("Piège fréquent", typeof l.piege === "string" && l.piege ? el("p", { text: l.piege }) : null, "faux"),
        secEls.ouQuand,
        sectionL(!(l.definitions || []).length ? "Repères" : "Définitions", dl, "livre-ouvert"),
        sectionL("Frise", V.frise ? V.frise(l.frise) : null, "frise"),
        sectionL("En chiffres", V.barres ? V.barres(l.chiffres) : null, "barres"),
        sectionL("Réseau des notions", V.reseau ? V.reseau(l.notions) : null, "reseau"),
        l.citation && V.citation ? V.citation(l.citation) : null,
        sectionL("L’histoire", l.histoire ? el("p", { text: l.histoire }) : null, "guillemets"),
        sectionL("Pour s’en souvenir", l.mnemo ? el("p", { text: l.mnemo }) : null, "ampoule"),
        cartesL,
        srcs,
        el("p", { "class": "verif" + (v.statut === "verifie" ? " ok" : "") }, [icone(v.statut === "verifie" ? "verifie" : "liste"), noteV])
      ]);
      var minutes = dureeLecture(article);
      // Photo de la leçon : la sienne, sinon une photo libre cherchée sur Commons. Rien n'est réservé tant que l'adresse n'est pas connue.
      var emplacement = el("div", { "class": "emplacement", hidden: "" });
      function poserPhoto(img) { var f = photo(img, "lecon-img", l.titre); if (f) { emplacement.appendChild(f); emplacement.hidden = false; } }
      /* Voix : les sections et « À retenir » tels qu'ils sont affichés. Absente si le navigateur ne sait pas lire. */
      var voix = lecteurVoix(function () { return [secEls.enBref, article.querySelector(".retenir"), secEls.comment, article.querySelector(".exemple"), secEls.pourquoi, secEls.ouQuand].filter(Boolean); });
      montrer(el("div", { "class": "page plein " + teinteSujet(p.titre) }, [
        el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: "#/p/" + encodeURIComponent(p.id), "aria-label": "Fermer la leçon" }, [icone("fermer")]), points, puceXP()]),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: p.titre }), filAriane(l, p.id), el("h1", { text: l.titre }),
          el("div", { "class": "meta-lecon" }, [badge(v), el("span", { "class": "meta", text: "Leçon " + n }), minutes ? el("span", { "class": "meta", text: "≈" + N + minutes + N + "min" }) : null]),
          voix]),
        emplacement,
        article,
        verifBloc, ensuite, finir, rangeeNav,
        p.verifie ? null : blocQuestion(p, n),
        p.verifie ? null : blocSignalement(p, n)
      ]), null, l.titre);
      if (imageOk(l.image)) poserPhoto(l.image);
      else trouverImage(String(l.titre || "").slice(0, 50).trim() + " " + requetePhoto(p), "commons").then(function (img) { if (img && emplacement.isConnected) poserPhoto(img); });
      // Mots déjà définis dans les leçons précédentes : soulignés, avec leur fiche. Sans glossaire, la leçon reste telle quelle.
      glossaireJusqua(p, n - 1).then(function (termes) { if (article.isConnected) lierTermes(article, termes, p.id); }, function () {});
    }, function (e) {
      if (!vive()) return;
      if (e.statut === 404 && /^Formation terminée/.test(e.message || "")) { // le serveur dit qu'il n'y a plus de module
        delete cache["p:" + id];
        chargerParcours(id).then(pageFin, function () { pageFin({ id: id, titre: "" }); });
        return;
      }
      montrer(erreurPage(e.statut === 404 ? "Cette leçon n’existe pas." : e.statut === 401 ? "La rédaction d’une nouvelle leçon demande ton compte en ligne. Réessaie dans un moment." : messageErreur(e, "Limite du jour" + N + ": 30 nouvelles leçons par personne. Les leçons déjà rédigées restent ouvertes."), "Leçon indisponible"), "accueil");
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
        var b = el("button", { "class": "option avec-lettre", type: "button" }, [el("span", { "class": "lettre", "aria-hidden": "true", text: "ABCDEF".charAt(k) }), el("span", { text: rep }), el("span", { "class": "fin" })]);
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
  /* opt.flux (facultatif) : questions qui arrivent pendant la partie { total, items (le même tableau que items), fini, erreur, ecoute }. Les points et le compteur partent du total attendu ; si la suite n'est pas arrivée, une attente sobre s'affiche. */
  function quiz(items, opt) {
    var k = 0, justes = 0, gagne = 0, rates = [], details = [], attend = false, flux = opt.flux || null;
    function nb() { return flux && !flux.fini ? Math.max(flux.total, items.length) : items.length; }
    var points = el("div", { "class": "etapes-q", "aria-hidden": "true" });
    var scene = el("main", { "class": "pile" });
    var compteur = el("span", { "class": "meta" });
    var statut = el("p", { "class": "meta statut-flux", role: "status", hidden: "" });
    var page = el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: opt.retour, "aria-label": "Quitter" }, [icone("fermer")]), points, compteur]), scene, statut]);
    function majPoints() {
      points.className = "etapes-q" + (nb() > 20 ? " dense" : "");
      while (points.children.length < nb()) points.appendChild(el("i"));
      while (points.children.length > nb() && points.lastChild.className === "") points.removeChild(points.lastChild);
    }
    function majStatut() {
      if (!flux || flux.fini) { statut.hidden = true; return; }
      statut.hidden = false; statut.textContent = pluriel(items.length, "question prête", "questions prêtes") + " sur " + flux.total + ". La suite s’écrit pendant que tu joues.";
    }
    majPoints(); majStatut();
    function afficher() {
      scene.innerHTML = ""; scene.className = "pile " + ORDRE_TEINTES[k % ORDRE_TEINTES.length]; window.scrollTo(0, 0); attend = false;
      majPoints(); majStatut();
      compteur.textContent = Math.min(k + 1, nb()) + " / " + nb();
      if (k >= nb()) return fin();
      if (k >= items.length) { // la suite n'est pas encore écrite
        attend = true;
        scene.appendChild(el("span", { "class": "sur", text: opt.titre }));
        scene.appendChild(el("p", { "class": "attente", role: "status", text: "La suite arrive" + N + ": le Rival écrit les prochaines questions, puis une 2e IA les vérifie." }));
        return;
      }
      var it = items[k];
      scene.appendChild(el("span", { "class": "sur", text: opt.entete || (opt.titre + (it.titre ? " · " + it.titre : "")) }));
      var suite = el("button", { "class": "btn", type: "button", hidden: "" }, [el("span", { text: k === nb() - 1 ? "Voir le résultat" : "Question suivante" }), icone("fleche")]);
      suite.addEventListener("click", function () { k += 1; afficher(); });
      scene.appendChild(rendreQuestion(it.question, function (juste) {
        points.children[k].className = juste ? "ok" : "ko";
        details[k] = juste ? 1 : 0;
        if (juste) { justes += 1; if (!opt.sansXp && premiereReussite(it)) gagne += opt.xp; if (opt.erreurs) oublierErreur(it); }
        else { rates.push(it); if (!opt.sansErreurs) noterErreur(it); }
        suite.hidden = false; setTimeout(function () { suite.focus({ preventScroll: true }); suite.scrollIntoView({ block: "nearest" }); }, 0);
      }));
      scene.appendChild(suite);
      if (window.poserIcones) window.poserIcones(scene);
      var h = scene.querySelector(".enonce"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
    if (flux) flux.ecoute = function () {
      majPoints(); majStatut();
      if (attend) afficher(); else compteur.textContent = Math.min(k + 1, nb()) + " / " + nb();
    };
    function fin() {
      if (flux) flux.ecoute = null;
      var n = items.length, pct = Math.round(justes / Math.max(n, 1) * 100);
      compteur.textContent = ""; compteur.appendChild(puceXP());
      if (!opt.pasQuiz) { noterJour("quiz"); sauver(); } // un quiz fini est un jour actif (la question du jour compte à part)
      gagner(gagne, opt.parcours);
      var revoir = el("div", { "class": "pile" });
      rates.forEach(function (it) {
        var q = it.question;
        revoir.appendChild(el("details", { "class": "plier ligne" }, [el("summary", {}, [el("span", {}, [el("b", { text: it.titre || "Question" }), el("span", { "class": "meta", text: (q.enonce || q.affirmation || "").slice(0, 90) })]), icone("chevron")]), el("p", { "class": "meta", text: q.type === "qcm" ? "Réponse" + N + ": " + q.reponses[q.bonne] : q.type === "vraifaux" ? "Réponse" + N + ": " + (q.vrai ? "vrai" : "faux") : "Ordre" + N + ": " + q.ordre.join(" → ") }), q.explication ? el("p", { text: q.explication }) : null]));
      });
      scene.appendChild(el("span", { "class": "sur", text: opt.titre + " · résultat" }));
      scene.appendChild(el("h1", { text: opt.verdict ? opt.verdict(pct) : pct === 100 ? "Sans faute" : pct >= 60 ? "Bien joué" : "À retravailler" }));
      scene.appendChild(el("div", { "class": "score" }, [el("strong", { text: justes + "/" + n }), opt.sansXp ? null : el("span", { "class": "meta gain", text: "+" + gagne + N + "XP" })]));
      if (flux && flux.erreur) scene.appendChild(el("p", { "class": "alerte", role: "status", text: "Le quiz s’arrête à " + pluriel(n, "question", "questions") + " sur " + flux.total + N + ": " + flux.erreur }));
      if (rates.length) { scene.appendChild(el("h2", { text: "À revoir" })); scene.appendChild(revoir); }
      var suite = el("div", { "class": "pile" });
      scene.appendChild(suite);
      if (opt.fin) opt.fin({ justes: justes, n: n, pct: pct, gagne: gagne, details: details }, suite);
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
    if (mode !== "direct" && (!(k0 > 0) || (s0.fait || 0) < k0)) { pageVerrou(id, "Ce quiz s’ouvre après la leçon " + (k0 > 0 ? k0 : 5) + ".", (s0.fait || 0) + 1); return; }
    var vive = vivante();
    montrer(attente("Préparation du quiz…", true), null, "Quiz");
    chargerParcours(id).then(function (p) {
      if (!vive()) return;
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
        if (!vive()) return;
        if (!items.length) { montrer(erreurPage("Pas encore assez de questions pour ce quiz.", "Quiz indisponible"), "accueil"); return; }
        var titre = mode === "direct" ? "Quiz direct" : (defi ? "Grand quiz" : "Quiz des leçons " + (k - 4) + " à " + k);
        montrer(quiz(items, { titre: titre, retour: base, xp: defi ? XP.defi : XP.quiz, parcours: p.id, fin: function (res, zone) {
          if (mode !== "direct") { var s2 = suivi(p.id); s2.quiz = s2.quiz || {}; s2.quiz[k] = Math.max(s2.quiz[k] || 0, res.pct); etat.parcours[p.id] = s2; sauver(); }
          var prochain = mode !== "direct" && !((p.verifie || formationComplete(p)) && k >= paliersPrevus(p)) ? k + 1 : null;
          if (prochain) zone.appendChild(lienAvance(base + "/" + prochain, "Continuer · leçon " + prochain, "btn"));
          zone.appendChild(lien(base + "/jeu/duel", "Défier un ami sur ce sujet", prochain ? "btn second" : "btn"));
          zone.appendChild(lien(base, "Retour à la formation"));
        } }), null, titre);
      }, function (e) { if (vive()) montrer(erreurPage(messageErreur(e), "Quiz indisponible"), "accueil"); });
    }, function (e) { if (vive()) montrer(erreurPage(messageErreur(e), "Quiz indisponible"), "accueil"); });
  }

  /* ---------- Mini-jeux et duels d'un parcours ---------- */
  function vueJeu(id, type) {
    var vive = vivante();
    montrer(attente("Préparation du jeu…", true), null, "Jeu");
    chargerParcours(id).then(function (p) {
      if (!vive()) return;
      var base = "#/p/" + encodeURIComponent(p.id), s = suivi(p.id);
      if (s.fait < 5 && type !== "duel") { montrer(erreurPage("Ce jeu s’ouvre à la leçon 5.", "Pas encore"), "accueil"); return; }
      paliersEntre(p, 1, Math.max(s.fait, 1)).then(function (ls) {
        if (!vive()) return;
        var toutes = [].concat.apply([], ls.map(questionsDe));
        if (type === "paires") return montrer(jeuPaires(p, ls), null, "Associe les notions");
        var items;
        if (type === "vraifaux") { items = melanger(toutes.filter(function (x) { return x.question.type === "vraifaux"; })).slice(0, 8); if (items.length < 3) items = []; }
        else if (type === "ordre") {
          var frises = ls.filter(function (l) { return (l.frise || []).length >= 3; });
          items = melanger(toutes.filter(function (x) { return x.question.type === "ordre"; })).slice(0, 3);
          frises.slice(0, 3 - items.length).forEach(function (l) { var f = melanger(l.frise).slice(0, 4); var ordre = f.slice().sort(function (a, b) { return l.frise.indexOf(a) - l.frise.indexOf(b); }); var v = {}; f.forEach(function (x) { v[x.evenement] = x.date; }); items.push({ palier: l.id, titre: l.titre, index: -1, question: { type: "ordre", enonce: "Range ces événements du plus ancien au plus récent.", elements: f.map(function (x) { return x.evenement; }), ordre: ordre.map(function (x) { return x.evenement; }), valeurs: v, explication: "Ordre des dates de la leçon " + guill(l.titre) + "." } }); });
        } else items = melanger(toutes).slice(0, 10);
        if (!items.length) { montrer(erreurPage("Pas assez de matière pour ce jeu dans tes leçons. Avance encore un peu.", "Jeu indisponible"), "accueil"); return; }
        var titres = { vraifaux: "Vrai ou faux express", ordre: "Remets dans l’ordre", duel: "Duel" };
        montrer(quiz(items, { titre: titres[type] || "Jeu", retour: base + "/defis", xp: type === "duel" ? XP.quiz : XP.jeu * 2, parcours: p.id, sansErreurs: type !== "duel", fin: function (res, zone) {
          if (type !== "duel") { zone.appendChild(lienAvance(base + "/jeu/" + type, "Rejouer", "btn")); zone.appendChild(lien(base + "/defis", "Autres défis")); return; }
          creerDuel(items, res, zone, p);
        } }), null, titres[type] || "Jeu");
      });
    }, function (e) { if (vive()) montrer(erreurPage(messageErreur(e), "Jeu indisponible"), "accueil"); });
  }
  function jeuPaires(p, ls) {
    var base = "#/p/" + encodeURIComponent(p.id);
    var defs = melanger([].concat.apply([], ls.map(function (l) { return (l.definitions || []).concat(l.reperes || []); }))).slice(0, 4);
    if (defs.length < 3) return erreurPage("Pas assez de définitions dans tes leçons pour ce jeu. Avance encore un peu.", "Jeu indisponible");
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
      noterFait("duel");
      var url = location.origin + location.pathname + "#/duel/" + j.id;
      info.textContent = "Duel prêt. Tes amis auront les mêmes questions.";
      var b = el("button", { "class": "btn", type: "button" }, [icone("epee"), "Envoyer le duel"]);
      var r = el("p", { "class": "meta", role: "status" });
      b.addEventListener("click", function () { partager("Koîos", profil.pseudo + " te lance un duel sur " + guill(p ? p.titre : "Koîos") + N + ": " + res.justes + "/" + res.n + ". À toi.", url, function (t) { r.textContent = t; }); });
      zone.appendChild(b); zone.appendChild(r); zone.appendChild(lien("#/duel/" + j.id, "Voir le tableau du duel"));
      if (window.poserIcones) window.poserIcones(zone);
    }, function (e) { info.textContent = e.statut === 503 ? "Les duels demandent la connexion en ligne. Réessaie dans un moment." : messageErreur(e); });
  }
  /* ---------- Quiz de culture générale ---------- */
  /* Thèmes proposés (libellé, icône de catégorie) : chaque puce prend la teinte de son icône. « Surprends-moi » en tire un au hasard. */
  var PUCES = [
    ["Musique", "musique"], ["Cinéma", "clap"], ["Sport", "ballon"], ["Géographie", "carte"], ["Histoire", "histoire"], ["Sciences", "atome"],
    ["Cuisine", "marmite"], ["Art", "pinceau"], ["Littérature", "litterature"], ["Technologie", "puce"], ["Animaux", "feuille"], ["Espace", "globe"],
    ["Philosophie", "cerveau"], ["Mythologie", "epee"], ["Joaillerie", "diamant"], ["Économie", "courbe"]
  ];
  var LONGUEURS = [10, 20, 30, 40, 50];
  function longueurChoisie() { var n = S.lire("koios.qgn", 10); return LONGUEURS.indexOf(n) >= 0 ? n : 10; }
  function enc(t) { return encodeURIComponent(t); }
  function pretes(k, n) { return k + (k > 1 ? " questions" : " question") + " sur " + n + " prêtes"; }
  /* Choix d'un sujet libre ou d'un thème, et de la longueur : opt = { id, bouton, lancer(sujet, n) }. */
  function formulaireQuiz(opt) {
    var champ = el("input", { "class": "champ", id: opt.id, type: "text", maxlength: "80", autocomplete: "off", placeholder: "Ex." + N + ": les volcans, Beethoven" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "alert" });
    var puces = el("div", { "class": "puces", role: "group", "aria-label": "Thèmes" });
    var n = longueurChoisie();
    function marquer(actif) { Array.prototype.forEach.call(puces.children, function (b) { b.setAttribute("aria-pressed", b === actif ? "true" : "false"); }); }
    var boutons = PUCES.map(function (p) {
      var b = el("button", { "class": "theme-puce " + teinte(p[1]), type: "button", "aria-pressed": "false" }, [icone(p[1]), p[0]]);
      b.addEventListener("click", function () { champ.value = p[0]; marquer(b); alerte.hidden = true; });
      puces.appendChild(b);
      return b;
    });
    champ.addEventListener("input", function () { marquer(null); alerte.hidden = true; });
    var surprends = el("button", { "class": "btn second", type: "button" }, [icone("eclair"), el("span", { text: "Surprends-moi" })]);
    surprends.addEventListener("click", function () {
      var k = Math.floor(Math.random() * PUCES.length);
      if (PUCES[k][0] === champ.value) k = (k + 1) % PUCES.length;
      champ.value = PUCES[k][0]; marquer(boutons[k]); alerte.hidden = true;
    });
    var seg = el("div", { "class": "onglets", role: "radiogroup", "aria-label": "Nombre de questions" });
    LONGUEURS.forEach(function (v) {
      var b = el("button", { type: "button", role: "radio", "aria-checked": v === n ? "true" : "false", text: String(v) });
      b.addEventListener("click", function () { n = v; S.ecrire("koios.qgn", v); Array.prototype.forEach.call(seg.children, function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); }); });
      seg.appendChild(b);
    });
    var go = el("button", { "class": "btn", type: "button" }, [el("span", { text: opt.bouton }), icone("fleche")]);
    go.addEventListener("click", function () {
      var s = champ.value.replace(/\s+/g, " ").trim().slice(0, 80);
      if (s.length < 2) { alerte.textContent = "Écris d’abord un sujet, ou choisis un thème."; alerte.hidden = false; champ.focus(); return; }
      opt.lancer(s, n);
    });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") go.click(); });
    var f = el("div", { "class": "pile" }, [
      el("div", { "class": "pile serree" }, [el("label", { "for": opt.id, "class": "sur", text: "Sujet libre" }), champ]),
      puces, surprends,
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", id: opt.id + "-n", text: "Nombre de questions" }), seg]),
      alerte, go
    ]);
    seg.setAttribute("aria-labelledby", opt.id + "-n");
    return f;
  }
  function nouveauFlux(n) { return { total: n, items: [], fini: false, erreur: null, blocs: [], ecoute: null }; }
  /* Appelle la route par blocs (un bloc de 10 questions par appel) tant qu'il en manque. `apres` : numéro du dernier bloc déjà joué (régénérer), sinon rien. Les questions arrivent dans flux.items ; surProgres(j) est appelé après chaque bloc. */
  function produireBlocs(sujet, n, apres, vive, flux, surProgres) {
    var corps = { sujet: sujet, n: n };
    if (apres !== undefined && apres !== null) { corps.regenerer = true; corps.apres = apres; }
    function tour() {
      return api("POST", "quiz-general", corps, 100000).then(function (j) {
        var vus = {};
        flux.items.forEach(function (x) { vus[x.palier + "#" + x.index] = 1; });
        (j.questions || []).forEach(function (x) { if (!vus[x.palier + "#" + x.index]) flux.items.push({ palier: x.palier, titre: x.titre, index: x.index, question: x.question }); });
        flux.blocs = j.blocs || flux.blocs;
        if (!(j.manquants > 0) || !vive()) flux.fini = true;
        surProgres(j);
        if (j.manquants > 0 && vive()) return tour();
      });
    }
    return pretCompte().then(function () {
      if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
      return tour();
    });
  }
  /* Écran d'attente par blocs : « 10 questions sur 30 prêtes », barre déterminée (questions reçues), étapes décrites. */
  function ecranGeneration(titre, sujet, n) {
    var barre = el("span", { "class": "progres gen", role: "progressbar", "aria-label": "Questions prêtes", "aria-valuemin": "0", "aria-valuemax": String(n), "aria-valuenow": "0" }, [el("i")]);
    var etat = el("p", { "class": "titre-attente", role: "status", text: pretes(0, n) });
    var ul = el("ul", { "class": "etapes-gen" });
    [["loupe", "Recherche des sources sur Wikipédia"], ["plume", "Écriture des questions et de leurs explications"], ["verifie", "Vérification par une 2e IA"]].forEach(function (x) { ul.appendChild(el("li", {}, [icone(x[0]), x[1]])); });
    var bloc = el("section", { "class": "generation" }, [
      el("span", { "class": "sur", text: titre }), el("h1", { text: sujet }), barre, etat,
      el("p", { "class": "meta", text: "Les questions s’écrivent par blocs de 10. La première fois, compte jusqu’à une minute par bloc" + (n > 10 ? "\u202f; tu peux jouer dès le premier." : ".") }),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Ce qui se passe" }), ul])
    ]);
    return {
      page: el("div", { "class": "page plein" }, [entete(), bloc]),
      maj: function (k) {
        barre.firstChild.style.setProperty("--p", String(Math.min(1, k / n)));
        barre.setAttribute("aria-valuenow", String(k));
        etat.textContent = pretes(k, n);
      }
    };
  }
  function pageErreurGen(e, retour) {
    var texte = messageErreur(e, e.message);
    var reessayer = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Réessayer" }), icone("fleche")]);
    reessayer.addEventListener("click", route);
    return el("div", { "class": "page" }, [entete(), el("div", { "class": "carte" }, [
      el("h1", { text: "Quiz indisponible" }),
      el("p", { text: texte + (e.statut === 422 ? " Essaie une autre formulation." : "") }),
      e.statut === 422 || e.statut === 429 ? null : reessayer,
      lien(retour, "Choisir un autre sujet", "btn second")
    ])]);
  }
  function refsDe(items) { return items.map(function (x) { return { chapitre: x.palier, index: x.index }; }); }
  function urlSalon(id) { return location.origin + location.pathname + "#/salon/" + id; }
  function envoyerSalon(id, titre, n, repli) {
    partager("Koîos", (profil ? profil.pseudo : "Un ami") + " te défie sur " + guill(titre) + N + ": " + pluriel(n, "question", "questions") + ". Rejoins le salon.", urlSalon(id), repli);
  }
  /* Crée un salon (duel de type salon) avec ces questions ; score = celui du créateur, ou null s'il n'a pas encore joué. */
  function creerSalonApi(items, sujet, score) {
    return pretCompte().then(function () {
      if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
      var corps = { questions: refsDe(items), type: "salon", titre: sujet.slice(0, 60) };
      if (score) corps.score = score;
      return api("POST", "duel", corps);
    }).then(function (j) { noterFait("duel"); return j; });
  }
  function vueQuizGeneral(sujet, n, apres) {
    sujet = String(sujet || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (sujet.length < 2 || LONGUEURS.indexOf(n) < 0) { location.replace("#/jouer"); return; }
    var vive = vivante(), g = ecranGeneration("Préparation du quiz", sujet, n), flux = nouveauFlux(n), demarre = false;
    montrer(g.page, null, "Quiz");
    function jouer() {
      demarre = true;
      var base = "#/quiz/" + enc(sujet) + "/" + n;
      montrer(quiz(flux.items, { titre: sujet, entete: sujet, retour: "#/jouer", xp: XP.quiz, flux: flux, fin: function (res, zone) {
        var dernier = flux.blocs.length ? Math.max.apply(null, flux.blocs) : (apres || 0) + n / 10;
        zone.appendChild(lienAvance(base + "/" + dernier, "Rejouer avec de nouvelles questions", "btn"));
        var info = el("p", { "class": "meta", role: "status" });
        var defier = el("button", { "class": "btn second", type: "button" }, [icone("epee"), el("span", { text: "Défier des amis" })]);
        defier.addEventListener("click", function () {
          defier.disabled = true; info.textContent = "Création du salon…";
          creerSalonApi(flux.items, sujet, { justes: res.justes, n: res.n, points: res.justes * XP.quiz }).then(function (j) {
            info.textContent = "Salon créé. Envoie le lien à tes amis" + N + ": ils jouent les mêmes questions que toi.";
            var envoi = el("button", { "class": "btn", type: "button" }, [icone("invitation"), el("span", { text: "Envoyer le lien" })]);
            var retour = function (t) { info.textContent = t; };
            envoi.addEventListener("click", function () { envoyerSalon(j.id, sujet, res.n, retour); });
            defier.replaceWith(envoi);
            info.after(lien("#/salon/" + j.id, "Ouvrir le salon"));
            if (window.poserIcones) window.poserIcones(zone);
            envoyerSalon(j.id, sujet, res.n, retour);
          }, function (e) { defier.disabled = false; info.textContent = e.statut === 503 ? "Les salons demandent la connexion en ligne. Réessaie dans un moment." : messageErreur(e); });
        });
        zone.appendChild(defier); zone.appendChild(info);
        zone.appendChild(lien("#/jouer", "Autre sujet"));
      } }), null, sujet);
    }
    produireBlocs(sujet, n, apres, vive, flux, function () {
      if (!vive()) return;
      if (!demarre) { g.maj(flux.items.length); if (flux.items.length) jouer(); } else if (flux.ecoute) flux.ecoute();
    }).then(function () {
      if (flux.ecoute) flux.ecoute();
    }, function (e) {
      if (!vive()) return;
      if (!demarre) { montrer(pageErreurGen(e, "#/jouer"), null, "Quiz indisponible"); return; }
      flux.erreur = messageErreur(e, e.message); flux.fini = true;
      if (flux.ecoute) flux.ecoute();
    });
  }
  /* Salon créé depuis l'onglet Amis : on écrit toutes les questions, puis le salon s'ouvre (le créateur joue ensuite, comme les autres). */
  function vueNouveauSalon(sujet, n) {
    sujet = String(sujet || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (sujet.length < 2 || LONGUEURS.indexOf(n) < 0) { location.replace("#/amis"); return; }
    var vive = vivante(), g = ecranGeneration("Création du salon", sujet, n), flux = nouveauFlux(n);
    montrer(g.page, null, "Création du salon");
    produireBlocs(sujet, n, null, vive, flux, function () { if (vive()) g.maj(flux.items.length); }).then(function () {
      if (!vive()) return;
      if (flux.items.length < 5) { var x = new Error("Trop peu de questions ont passé la vérification. Réessaie."); x.statut = 502; throw x; }
      return creerSalonApi(flux.items, sujet, null).then(function (j) { if (vive()) location.replace("#/salon/" + j.id); });
    }).then(null, function (e) { if (vive()) montrer(pageErreurGen(e, "#/amis"), null, "Salon indisponible"); });
  }

  /* Bloc de questions en cache (quiz de culture générale, question du jour, tournoi) : [{ palier, titre, index, question }]. */
  function chargerBloc(id) {
    return charger("qg:" + id, function () { return api("GET", "quiz-general?bloc=" + enc(id), null, 15000).then(function (j) { return j.questions || []; }); });
  }
  function resoudre(refs) {
    return chargerQuestionsVerifiees().catch(function () { return []; }).then(function (pool) {
      return Promise.all(refs.map(function (r) {
        var t = pool.filter(function (x) { return x.palier === r.chapitre && x.index === r.index; })[0];
        if (t) return t;
        var bloc = /^qg:(.+)$/.exec(r.chapitre || "") || /^(jour:\d{4}-\d{2}-\d{2})$/.exec(r.chapitre || "");
        if (bloc) return chargerBloc(bloc[1]).then(function (l) { return l.filter(function (x) { return x.index === r.index; })[0] || null; }, function () { return null; });
        var m = /^(.+):(\d+)$/.exec(r.chapitre || "");
        if (m) return chargerPalier(m[1], parseInt(m[2], 10)).then(function (l) { var q = (l.questions || [])[r.index]; return q ? { palier: l.id, titre: l.titre, index: r.index, question: q } : null; }, function () { return null; });
        var mq = /^(.+):quiz$/.exec(r.chapitre || "");
        if (mq) return api("POST", "quiz-direct", { parcours: mq[1] }, 100000).then(function (j) { var x = (j.questions || [])[r.index]; return x ? { palier: r.chapitre, titre: x.titre, index: r.index, question: x.question } : null; }, function () { return null; });
        return null;
      }));
    }).then(function (l) { return l.filter(Boolean); });
  }
  /* Temps restant avant une date de fin (ISO) : « 3 j 4 h », « 5 h 07 », « 12 min ». */
  function restant(fin) {
    var ms = Date.parse(fin) - Date.now();
    if (!(ms > 0)) return "terminé";
    var m = Math.floor(ms / 60000), j = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    if (j >= 1) return j + N + "j " + h + N + "h";
    if (h >= 1) return h + N + "h " + ("0" + (m % 60)).slice(-2);
    return Math.max(1, m) + N + "min";
  }
  /* Réponses jouées dans un salon : une chaîne de 0 et de 1 par salon, gardée sur cet appareil seulement (pas de synchronisation). */
  function noterReponses(id, details) {
    var o = S.lire("koios.reponses", {});
    o[id] = details.map(function (x) { return x ? 1 : 0; }).join("");
    var cles = Object.keys(o);
    if (cles.length > 80) delete o[cles[0]];
    S.ecrire("koios.reponses", o);
  }
  /* Classement avec rang : les `max` premiers, plus ma ligne si je suis plus loin. Des points de suspension marquent un saut de rang. */
  function tableauDuel(d, max) {
    var ol = el("ol", { "class": "liste" });
    var lignes = d.classement && d.classement.length ? d.classement : (d.scores || []).slice().sort(function (a, b) { return b.justes - a.justes || b.points - a.points; }).map(function (x, k) { return { rang: k + 1, pseudo: x.pseudo, justes: x.justes, n: x.n, points: x.points, moi: x.moi }; });
    var vus = lignes.slice(0, max || 20), moi = lignes.filter(function (x) { return x.moi; })[0];
    if (moi && vus.indexOf(moi) < 0) vus.push(moi);
    vus.forEach(function (x, k) {
      if (k && x.rang - vus[k - 1].rang > 1) ol.appendChild(el("li", {}, [el("p", { "class": "meta saut", "aria-hidden": "true", text: "…" })]));
      ol.appendChild(el("li", {}, [el("div", { "class": "rangee rang" }, [el("b", { text: String(x.rang) }), el("b", { text: x.pseudo + (x.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: x.justes + "/" + x.n + " · " + x.points + N + "pts" })])]));
    });
    return ol;
  }
  /* Page d'un duel, d'un salon (titre, joueurs en nombre illimité) ou du tournoi de la semaine. `auto` : lance la partie tout de suite. */
  function vueDuel(id, auto) {
    var vive = vivante();
    montrer(attente("Ouverture…", true), null, "Salon");
    pretCompte().then(function () { return api("GET", "duel?id=" + enc(id)); }).then(function (j) {
      if (!vive()) return;
      var d = j.duel, salon = d.type === "salon", tournoi = d.type === "tournoi", nq = (d.questions || []).length;
      var nom = tournoi ? "tournoi" : salon ? "salon" : "duel";
      var titreP = tournoi ? "Tournoi de la semaine" : salon ? "Salon" : "Duel";
      var h1 = salon || tournoi ? (d.titre || titreP) : (profil && d.createur === profil.pseudo ? "Ton duel" : d.createur + " te lance un duel");
      var meta = [];
      if (salon) meta.push("Créé par " + (profil && d.createur === profil.pseudo ? "toi" : d.createur));
      if (salon || tournoi) meta.push(d.joueurs ? pluriel(d.joueurs, "joueur", "joueurs") : "Aucun joueur");
      meta.push(pluriel(nq, "question", "questions"));
      if (d.fin) meta.push(d.termine ? "Terminé" : "Il reste " + restant(d.fin));
      var lancer = el("button", { "class": "btn", type: "button" }, [el("span", { text: (nom === "duel" ? "Relever le duel" : "Jouer") + " · " + pluriel(nq, "question", "questions") }), icone("fleche")]);
      var info = el("p", { "class": "alerte", role: "status", hidden: "" });
      lancer.addEventListener("click", function () {
        lancer.disabled = true; info.hidden = true;
        resoudre(d.questions || []).then(function (items) {
          if (!vive()) return;
          if (items.length < nq) { lancer.disabled = false; info.textContent = "Certaines questions ne se chargent pas. Réessaie dans un instant."; info.hidden = false; return; }
          montrer(quiz(items, { titre: d.titre || "Duel", entete: d.titre || "Duel", retour: "#/amis", xp: XP.quiz, fin: function (res, zone) {
            var etat2 = el("p", { "class": "meta", role: "status", text: "Enregistrement de ton score…" });
            zone.appendChild(etat2);
            noterReponses(d.id, res.details || []);
            api("PUT", "duel", { id: d.id, score: { justes: res.justes, n: res.n, points: res.justes * XP.quiz } }).then(function () { noterFait("duel"); return api("GET", "duel?id=" + enc(d.id)); }).then(function (j2) {
              etat2.textContent = "";
              zone.appendChild(el("h2", { text: salon || tournoi ? "Classement" : "Tableau du duel" }));
              zone.appendChild(tableauDuel(j2.duel));
              zone.appendChild(lien("#/salon/" + d.id, "Page du " + nom, "btn second"));
              zone.appendChild(lien("#/amis", "Retour aux amis"));
            }, function (e) { etat2.textContent = e.statut === 409 ? e.message : messageErreur(e); zone.appendChild(lien("#/amis", "Retour aux amis")); });
          } }), null, d.titre || "Duel");
        });
      });
      var actions = [];
      if (!enLigne()) actions.push(el("p", { "class": "alerte", text: "Les " + (nom === "duel" ? "duels" : nom === "salon" ? "salons" : "tournois") + " demandent la connexion en ligne. Réessaie dans un moment." }));
      else if (d.termine) actions.push(el("p", { "class": "verrou" }, [icone("sablier"), "Ce " + nom + " est terminé. Le classement reste visible."]));
      else if (d.dejaJoue) actions.push(el("p", { "class": "verrou" }, [icone("juste"), "Tu as déjà joué ce " + nom + "."]));
      else actions.push(lancer);
      if (enLigne() && d.dejaJoue) actions.push(lienAvance("#/salon/" + d.id + "/reponses", "Voir mes réponses", "btn second"));
      var retourPartage = el("p", { "class": "meta", role: "status" });
      var partage = el("button", { "class": "btn second", type: "button" }, [icone("invitation"), el("span", { text: "Partager le lien" })]);
      partage.addEventListener("click", function () {
        partager("Koîos", (profil ? profil.pseudo : "Un ami") + " te propose " + (tournoi ? "le tournoi de la semaine" : "un " + nom) + (d.titre && !tournoi ? " sur " + guill(d.titre) : "") + N + ": " + pluriel(nq, "question", "questions") + ".", urlSalon(d.id), function (t) { retourPartage.textContent = t; });
      });
      var direct = null, infoDirect = el("p", { "class": "alerte", role: "status", hidden: "" });
      if ((salon || tournoi) && enLigne() && nq >= 5) {
        direct = el("button", { "class": "btn second", type: "button" }, [icone("eclair"), el("span", { text: "Jouer en direct" })]);
        direct.addEventListener("click", function () {
          direct.disabled = true; infoDirect.hidden = true;
          api("POST", "partie", { action: "creer", titre: (d.titre || "Partie en direct").slice(0, 60), questions: (d.questions || []).slice(0, 20) }).then(function (j2) { location.hash = "#/partie/" + j2.id; },
            function (e) { direct.disabled = false; infoDirect.textContent = messageErreur(e, "Tu as déjà créé 20 parties aujourd’hui. Reviens demain."); infoDirect.hidden = false; });
        });
      }
      montrer(el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/amis" }, [icone("retour"), "Amis"]), el("span"), puceXP()]),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: titreP }), el("h1", { text: h1 }), el("p", { "class": "meta", text: meta.join(" · ") })]),
        el("div", { "class": "pile" }, actions.concat([info, partage, retourPartage, direct, direct ? el("p", { "class": "meta", text: "Jusqu’à 12 joueurs, en même temps" + (nq > 20 ? ". Les 20 premières questions seulement." : ".") }) : null, infoDirect])),
        el("h2", { text: salon || tournoi ? "Classement" : "Tableau" }),
        (d.scores || []).length ? tableauDuel(d) : el("p", { "class": "meta", text: "Personne n’a encore joué. Sois le premier." })
      ]), null, h1);
      if (auto && enLigne() && !d.termine && !d.dejaJoue) lancer.click();
    }, function (e) { if (vive()) montrer(erreurPage(e.statut === 404 ? "Ce duel ou ce salon n’existe pas." : messageErreur(e), "Salon indisponible"), "amis"); });
  }
  /* Mes réponses dans un salon déjà joué : les questions, la bonne réponse, l'explication ; réussite ou raté si l'appareil s'en souvient. */
  function vueReponses(id) {
    var vive = vivante();
    montrer(attente("Ouverture…", true), null, "Mes réponses");
    pretCompte().then(function () { return api("GET", "duel?id=" + enc(id)); }).then(function (j) {
      return resoudre(j.duel.questions || []).then(function (items) { return { d: j.duel, items: items }; });
    }).then(function (r) {
      if (!vive()) return;
      var gardees = S.lire("koios.reponses", {})[id] || "", liste = el("div", { "class": "pile" });
      r.items.forEach(function (it, k) {
        var q = it.question, etatQ = gardees.charAt(k);
        var bonne = q.type === "qcm" ? q.reponses[q.bonne] : q.type === "vraifaux" ? (q.vrai ? "vrai" : "faux") : (q.ordre || []).join(" → ");
        liste.appendChild(el("details", { "class": "plier ligne" }, [
          el("summary", {}, [el("span", {}, [el("b", { text: "Question " + (k + 1) }), el("span", { "class": "meta", text: q.enonce || q.affirmation || "" })]), etatQ === "1" ? icone("juste", "Réussie") : etatQ === "0" ? icone("faux", "Ratée") : icone("chevron")]),
          el("p", { "class": "meta", text: "Réponse" + N + ": " + bonne }), q.explication ? el("p", { text: q.explication }) : null
        ]));
      });
      var justes = gardees ? gardees.split("1").length - 1 : null;
      montrer(el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/salon/" + id }, [icone("retour"), "Salon"]), el("span"), puceXP()]),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: r.d.titre || "Duel" }), el("h1", { text: "Mes réponses" }), el("p", { "class": "meta", text: justes === null ? "Tes réponses ne sont pas gardées sur cet appareil. Voici les questions et leurs explications." : justes + "/" + r.items.length + " bonnes réponses" })]),
        liste
      ]), null, "Mes réponses");
    }, function (e) { if (vive()) montrer(erreurPage(e.statut === 404 ? "Ce salon n’existe pas." : messageErreur(e), "Salon indisponible"), "amis"); });
  }

  /* ---------- Jouer ---------- */
  /* Question du jour : /api/jour (thème du jour et question, la même pour tous). Gardée pour la session ; null si le réseau ou le serveur manque. */
  function chargerJour() {
    var d = aujourdhui();
    return charger("jour:" + d, function () {
      return pretServeur.then(function () { return serveur.base ? api("GET", "jour?date=" + d, null, 100000) : null; });
    }).catch(function () { return null; });
  }
  function vueJour() {
    var d = aujourdhui();
    if (jourFait(d)) { location.replace("#/jouer"); return; }
    var vive = vivante();
    montrer(attente("Préparation de la question du jour…", true), null, "Question du jour");
    chargerJour().then(function (j) {
      if (j && j.question && j.question.question) return { it: j.question, theme: j.theme };
      // Pas de réseau, ou rien d'écrit : une question du pool vérifié, la même pour tous ce jour-là.
      return chargerQuestionsVerifiees().then(function (pool) {
        var simples = pool.filter(function (x) { return x.question.type !== "ordre"; });
        return { it: simples[Math.floor(hasard(parseInt(d.replace(/-/g, ""), 10))() * simples.length)], theme: null };
      });
    }).then(function (r) {
      if (!vive()) return;
      var it = r.it;
      noterJour("jour", "faux"); sauver();
      montrer(quiz([it], { titre: "Question du jour", entete: r.theme ? "Aujourd’hui" + N + ": " + r.theme : "Question du jour", retour: "#/jouer", xp: XP.quiz, pasQuiz: true, fin: function (res, zone) {
        noterJour("jour", res.justes ? "juste" : "faux"); sauver();
        zone.appendChild(el("p", { "class": "meta", text: "Série" + N + ": " + pluriel(serieJours(), "jour", "jours") + ". La prochaine arrive demain." }));
        if (r.theme) zone.appendChild(lienAvance("#/quiz/" + enc(r.theme) + "/10", "Un quiz sur ce thème", "btn"));
        else zone.appendChild(lienAvance("#/p/" + it.palier.split(":")[0], "Ouvrir cette formation", "btn"));
        zone.appendChild(lien("#/jouer", "Retour aux jeux"));
      } }), null, "Question du jour");
    }, function () { if (vive()) montrer(erreurPage("Les questions ne se chargent pas.", "Indisponible"), "jouer"); });
  }
  function vueMelange() {
    var vive = vivante();
    montrer(attente("Mélange des questions…", true), null, "Quiz mélangé");
    chargerQuestionsVerifiees().then(function (pool) {
      var miens = Object.keys(etat.parcours).filter(function (id) { return !verifie(id) && suivi(id).fait > 0; }).slice(0, 4);
      return Promise.all(miens.map(function (id) { return paliersEntre({ id: id }, 1, Math.min(suivi(id).fait, 10)).then(function (ls) { return melanger([].concat.apply([], ls.map(questionsDe))).slice(0, 3); }); })).then(function (lots) {
        return melanger(melanger(pool).slice(0, 10 - Math.min(5, [].concat.apply([], lots).length)).concat([].concat.apply([], lots).slice(0, 5)));
      });
    }).then(function (items) {
      if (!vive()) return;
      montrer(quiz(items.slice(0, 10), { titre: "Quiz mélangé", retour: "#/jouer", xp: XP.quiz, fin: function (res, zone) {
        zone.appendChild(lienAvance("#/jeu/melange", "Rejouer", "btn"));
        var b = el("button", { "class": "btn second", type: "button", text: "Défier un ami avec ces questions" });
        b.addEventListener("click", function () { b.remove(); creerDuel(items.slice(0, 10), res, zone, null); });
        zone.appendChild(b);
      } }), null, "Quiz mélangé");
    }, function () { if (vive()) montrer(erreurPage("Les questions ne se chargent pas.", "Indisponible"), "jouer"); });
  }
  function vueErreurs() {
    if (!etat.erreurs.length) { location.replace("#/profil"); return; }
    var vive = vivante();
    montrer(attente("Préparation…", true), null, "Mes erreurs");
    resoudre(etat.erreurs.slice(-10).map(function (e) { return { chapitre: e.palier, index: e.index }; })).then(function (items) {
      if (!vive()) return;
      montrer(quiz(items, { titre: "Revoir mes erreurs", retour: "#/profil", xp: XP.quiz, erreurs: true, fin: function (res, zone) { sauver(); zone.appendChild(lien("#/profil", "Retour au profil", "btn second")); } }), null, "Mes erreurs");
    });
  }
  /* ---------- Révision espacée : une file unique, sans IA ---------- */
  /* Une question ratée en carte : l'énoncé au recto, la bonne réponse et son explication au verso. */
  function faceQuestion(q) {
    if (!q) return null;
    var expl = q.explication ? " " + q.explication : "";
    if (q.type === "qcm" && typeof q.enonce === "string" && q.reponses && typeof q.reponses[q.bonne] === "string") return { recto: q.enonce, verso: q.reponses[q.bonne].replace(/\.$/, "") + "." + expl };
    if (q.type === "vraifaux" && typeof q.affirmation === "string") return { recto: "Vrai ou faux" + F + "? " + q.affirmation, verso: (q.vrai ? "Vrai." : "Faux.") + expl };
    return null;
  }
  /* Contenu d'un élément de la file : une carte (lue dans sa leçon, déjà écrite) ou une question ratée. null si on ne peut pas la lire. */
  function chargerElement(x) {
    if (x.type === "carte") {
      var m = /^(.+):(\d+):(\d+)$/.exec(x.cle);
      return chargerPalier(m[1], parseInt(m[2], 10)).then(function (l) {
        var c = ((l && l.cartes) || [])[parseInt(m[3], 10) - 1];
        return c && typeof c.recto === "string" && typeof c.verso === "string" ? { cle: x.cle, recto: c.recto, verso: c.verso, source: "Carte · leçon " + m[2] + (l.titre ? " · " + l.titre : "") } : null;
      }, function () { return null; });
    }
    return resoudre([{ chapitre: x.palier, index: x.index }]).then(function (l) {
      var f = l[0] ? faceQuestion(l[0].question) : null;
      return f ? { cle: x.cle, recto: f.recto, verso: f.verso, source: "Question ratée" + (x.titre ? " · " + x.titre : "") } : null;
    }, function () { return null; });
  }
  function quandRevision(p) { return (p.jours === 1 ? "demain" : "dans " + p.jours + " jours") + " · " + pluriel(p.n, "élément", "éléments"); }
  function vueReviser() {
    var vive = vivante(), auj = aujourdhui();
    var file = L.fileDuJour(etat, auj), lot = file.slice(0, L.SEANCE);
    var barre = el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: "#/", "aria-label": "Quitter la révision" }, [icone("fermer")]), el("span"), puceXP()]);
    function pageSimple(enfants) { montrer(el("div", { "class": "page plein" }, [barre].concat(enfants)), null, "Réviser"); }
    if (!file.length) {
      var proch = L.prochaineRevision(etat, auj);
      pageSimple([el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Révision" }), el("h1", { text: "Rien à réviser" })]),
        etatVide("juste", proch ? "Tu es à jour. Prochaine révision" + N + ": " + quandRevision(proch) + "." : "Les cartes des leçons que tu fais et les questions que tu rates arrivent ici, pour revenir au bon moment.", lien("#/", "Retour à l’accueil", "btn"))]);
      return;
    }
    montrer(attente("Préparation de la révision…", true), null, "Réviser");
    Promise.all(lot.map(chargerElement)).then(function (liste) {
      if (!vive()) return;
      var items = melanger(liste.filter(Boolean)), i = 0, justes = 0, xp = 0;
      if (!items.length) { pageSimple([etatVide("carnet", "Les éléments à réviser ne se chargent pas. Réessaie dans un moment.", lien("#/", "Retour à l’accueil", "btn"))]); return; }
      var cadre = el("div", { "class": "pile revision" });
      pageSimple([cadre]);
      function suivante() {
        cadre.textContent = "";
        if (i >= items.length) { fin(); return; }
        var c = items[i];
        var etapes = el("p", { "class": "meta", role: "status", text: (i + 1) + " sur " + items.length });
        var jauge = el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + Math.round(i / items.length * 100) + "%" })]);
        var rep = el("div", { "class": "reponses-rev", hidden: "" });
        var revoir = el("button", { "class": "btn second", type: "button", text: "À revoir" }), sue = el("button", { "class": "btn", type: "button", text: "Je savais" });
        function repondre(ok) { if (ok) justes += 1; xp += reponseRevision(c.cle, ok); i += 1; suivante(); var h = cadre.querySelector(".carte-flip"); if (h) h.focus(); }
        revoir.addEventListener("click", function () { repondre(false); });
        sue.addEventListener("click", function () { repondre(true); });
        rep.appendChild(revoir); rep.appendChild(sue);
        var indice = el("p", { "class": "meta", text: "Touche la carte pour voir la réponse." });
        cadre.appendChild(el("span", { "class": "sur", text: c.source }));
        cadre.appendChild(etapes); cadre.appendChild(jauge);
        cadre.appendChild(carteRetournable(c, function (on) { rep.hidden = !on; indice.hidden = on; }));
        cadre.appendChild(indice); cadre.appendChild(rep);
        if (window.poserIcones) window.poserIcones(cadre);
      }
      function fin() {
        var reste = L.fileDuJour(etat, auj).length, prochaine = L.prochaineRevision(etat, auj);
        cadre.appendChild(el("span", { "class": "sur", text: "Révision" }));
        cadre.appendChild(el("h1", { text: justes === items.length ? "Sans faute" : "Séance terminée" }));
        cadre.appendChild(el("div", { "class": "score" }, [el("strong", { text: justes + "/" + items.length }), el("span", { "class": "meta gain", text: "+" + xp + N + "XP" })]));
        if (items.length - justes) cadre.appendChild(el("p", { "class": "meta", text: pluriel(items.length - justes, "élément reviendra", "éléments reviendront") + " demain." }));
        if (reste) cadre.appendChild(el("p", { "class": "meta", text: "Il en reste " + reste + " à réviser aujourd’hui." }));
        else if (prochaine) cadre.appendChild(el("p", { "class": "meta", text: "Prochaine révision" + N + ": " + quandRevision(prochaine) + "." }));
        if (reste) {
          var encore = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Continuer · " + pluriel(Math.min(reste, L.SEANCE), "élément", "éléments") }), icone("fleche")]);
          encore.addEventListener("click", function () { route(); });
          cadre.appendChild(encore);
          cadre.appendChild(lien("#/", "Retour à l’accueil"));
        } else cadre.appendChild(lien("#/", "Retour à l’accueil", "btn"));
        if (window.poserIcones) window.poserIcones(cadre);
        var h = cadre.querySelector("h1"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      }
      suivante();
    });
  }

  /* ---------- Badges : obtenus en couleur, à venir en gris avec leur condition ---------- */
  function dateFr(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    var d = new Date(+m[1], +m[2] - 1, +m[3], 12), opt = { day: "numeric", month: "long" };
    if (d.getFullYear() !== new Date().getFullYear()) opt.year = "numeric";
    return d.toLocaleDateString("fr-FR", opt);
  }
  function vueBadges() {
    var liste = L.calculerBadges(etat, aujourdhui());
    var obtenus = liste.filter(function (b) { return b.obtenu; }), avenir = liste.filter(function (b) { return !b.obtenu; });
    function ligne(b) {
      var date = etat.badges && etat.badges[b.id];
      var detail = b.obtenu ? (date ? "Obtenu le " + dateFr(date) : "Obtenu") : b.condition + (b.cible > 1 ? " " + b.valeur + " sur " + b.cible + "." : "");
      return el("li", {}, [el("div", { "class": "rangee badge-ligne" + (b.obtenu ? "" : " gris") }, [
        el("span", { "class": "badge-rond " + (b.obtenu ? b.teinte : "gris"), "aria-hidden": "true" }, [icone(b.icone)]),
        el("span", {}, [el("b", {}, [el("span", { "class": "sr", text: (b.obtenu ? "Obtenu" : "À venir") + N + ": " }), b.nom]), el("span", { "class": "meta", text: detail })])])]);
    }
    function groupe(titre, l) { return l.length ? el("section", { "class": "pile serree" }, [el("h2", { text: titre }), el("ul", { "class": "liste" }, l.map(ligne))]) : null; }
    montrer(el("div", { "class": "page" }, [
      el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/profil" }, [icone("retour"), "Profil"]), el("span"), puceXP()]),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Profil" }), el("h1", { text: "Badges" }),
        el("p", { "class": "meta", style: "font-size:16px", text: obtenus.length + " sur " + liste.length + " obtenus. Chacun se calcule sur ce que tu as vraiment fait." })]),
      groupe("Obtenus", obtenus), groupe("À venir", avenir)
    ]), "profil", "Badges");
  }

  /* Jouer : le quiz de culture générale, puis ce qui se joue seul (question du jour, quiz mélangé, erreurs à revoir, mini-jeux des formations). */
  function vueJouer() {
    var faitJour = jourFait(aujourdhui());
    var metaJour = el("span", { "class": "meta", text: faitJour ? (faitJour === "juste" ? "Réussie. Reviens demain." : "Manquée. Reviens demain.") : "La même pour tous" + (serieJours() ? " · série de " + pluriel(serieJours(), "jour", "jours") : "") });
    var lignes = [
      el("li", {}, [el(faitJour ? "div" : "a", { "class": "rangee", href: faitJour ? null : "#/jeu/jour" }, [tuile("ampoule"), el("span", {}, [el("b", { text: "Question du jour" }), metaJour]), faitJour ? icone("juste") : icone("chevron")])]),
      el("li", {}, [el("a", { "class": "rangee", href: "#/jeu/melange" }, [tuile("liste"), el("span", {}, [el("b", { text: "Quiz mélangé" }), el("span", { "class": "meta", text: "10 questions, tous sujets confondus" })]), icone("chevron")])])
    ];
    if (!faitJour) chargerJour().then(function (j) { if (j && j.theme && metaJour.isConnected) metaJour.textContent = "Aujourd’hui" + N + ": " + j.theme + " · la même pour tous"; });
    if (etat.erreurs.length) lignes.push(el("li", {}, [el("a", { "class": "rangee", href: "#/jeu/erreurs" }, [tuile("cerveau"), el("span", {}, [el("b", { text: "Revoir mes erreurs" }), el("span", { "class": "meta", text: pluriel(etat.erreurs.length, "question à revoir", "questions à revoir") })]), icone("chevron")])]));
    var defis = Object.keys(etat.parcours).filter(function (id) { return etat.parcours[id].titre && (etat.parcours[id].fait || 0) >= 5; });
    var ulDefis = el("ul", { "class": "liste" });
    defis.slice(0, 6).forEach(function (id) { var x = etat.parcours[id]; ulDefis.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/p/" + encodeURIComponent(id) + "/defis" }, [tuile(categorie(x.titre)), el("span", {}, [el("b", { text: x.titre }), el("span", { "class": "meta", text: "Vrai ou faux, associations, ordre" })]), icone("chevron")])])); });
    montrer(el("div", { "class": "page" }, [entete(), el("h1", { text: "Jouer" }),
      el("section", { "class": "pile" }, [
        el("div", { "class": "pile serree" }, [el("h2", { text: "Quiz de culture générale" }), el("p", { "class": "meta", text: "Un sujet de ton choix, de 10 à 50 questions. Chaque réponse est expliquée et vérifiée par une 2e IA." })]),
        formulaireQuiz({ id: "sujet-quiz", bouton: "Lancer le quiz", lancer: function (s, n) { location.hash = "#/quiz/" + enc(s) + "/" + n; } })
      ]),
      el("ul", { "class": "liste" }, lignes),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Mini‑jeux" }), defis.length ? ulDefis : el("p", { "class": "meta", text: "Les mini‑jeux d’une formation s’ouvrent à la leçon 5." })])
    ]), "jouer", "Jouer");
  }
  /* Rangée d'un salon ou d'un duel de la liste « Amis ». */
  function rangeeSalon(d) {
    var moi = profil && d.createur === profil.pseudo, salon = d.type === "salon";
    var titre = salon ? (d.titre || "Salon") : (moi ? "Duel lancé par toi" : "Duel de " + d.createur);
    var detail = (salon ? (moi ? "Créé par toi" : "Salon de " + d.createur) : (moi ? "Envoyé" : "Reçu")) + " · " + pluriel((d.scores || []).length, "joueur", "joueurs");
    return el("li", {}, [el("a", { "class": "rangee", href: (salon ? "#/salon/" : "#/duel/") + d.id }, [tuile(salon ? categorie(titre) : "epee"), el("span", {}, [el("b", { text: titre }), el("span", { "class": "meta", text: detail })]), icone("chevron")])]);
  }
  /* Carte du tournoi de la semaine : thème, temps restant, bouton, dix premiers et ma place. */
  function carteTournoi() {
    var corps = el("div", { "class": "pile" }, [el("p", { "class": "attente", role: "status", text: "Chargement du tournoi…" })]);
    var carte = el("section", { "class": "carte tournoi" }, [corps]);
    function vide(texte) { corps.innerHTML = ""; corps.appendChild(el("div", { "class": "ligne-titre" }, [el("h2", { text: "Tournoi de la semaine" })])); corps.appendChild(el("p", { "class": "meta", text: texte })); }
    pretServeur.then(function () {
      if (!serveur.base) { vide("Le tournoi s’affiche dès que le serveur répond."); return; }
      return api("GET", "tournoi", null, 100000).then(function (j) {
        var t = j.tournoi;
        if (!t) { vide("Le tournoi de cette semaine n’est pas encore prêt. Reviens un peu plus tard."); return; }
        corps.innerHTML = "";
        corps.appendChild(el("div", { "class": "ligne-titre" }, [el("h2", { text: "Tournoi de la semaine" }), el("span", { "class": "meta", text: t.termine ? "Terminé" : "Il reste " + restant(t.fin) })]));
        corps.appendChild(el("div", { "class": "pile serree" }, [el("p", { "class": "theme-tournoi", text: "Thème" + N + ": " + t.theme }), el("p", { "class": "meta", text: pluriel(t.questions, "question", "questions") + " · " + (t.joueurs ? pluriel(t.joueurs, "joueur", "joueurs") : "aucun joueur") + " · une seule partie par joueur" })]));
        if (!t.termine && !t.dejaJoue) corps.appendChild(lienAvance("#/salon/" + t.id + "/jouer", "Jouer", "btn"));
        else corps.appendChild(lienAvance("#/salon/" + t.id + (t.dejaJoue ? "/reponses" : ""), t.dejaJoue ? "Voir mes réponses" : "Voir le classement", "btn second"));
        var liste = (t.classement || []).slice();
        if (t.moi && !liste.some(function (x) { return x.moi; })) liste.push({ rang: t.moi.rang, pseudo: t.moi.pseudo, justes: t.moi.justes, n: t.moi.n, points: t.moi.points, moi: true });
        corps.appendChild(liste.length ? tableauDuel({ classement: liste }, 10) : el("p", { "class": "meta", text: "Personne n’a encore joué. Sois le premier." }));
        if (t.dejaJoue || t.termine) corps.appendChild(lien("#/salon/" + t.id, "Page du tournoi"));
        if (window.poserIcones) window.poserIcones(corps);
      });
    }).then(null, function () { vide("Le tournoi ne se charge pas pour l’instant."); });
    return carte;
  }
  /* Amis : salons, tournoi de la semaine, duels, classement du cercle. */
  /* Amis : inviter par un lien (WhatsApp), chercher un pseudo exact, répondre aux demandes, retirer un ami. */
  function urlInvitation(jeton) { return location.origin + location.pathname + "#/invitation/" + jeton; }
  function inviterParLien(info) {
    return api("POST", "amis", { action: "inviter" }, 10000).then(function (r) {
      var url = urlInvitation(r.jeton), texte = (profil ? profil.pseudo : "Un ami") + " t’invite sur Koîos" + F + ": apprends n’importe quel sujet et défie‑moi. Ce lien marche 7 jours.";
      if (navigator.share) { navigator.share({ title: "Koîos", text: texte, url: url }).catch(function () {}); return; }
      var ouvert = window.open("https://wa.me/?text=" + encodeURIComponent(texte + " " + url), "_blank", "noopener");
      if (!ouvert) partager("Koîos", texte, url, function (t) { info.textContent = t; });
    }, function (e) { info.textContent = erreurCompte(e); });
  }
  function rangeeAmi(pseudo, details, actions) {
    return el("li", {}, [el("div", { "class": "ligne-ami" }, [el("span", { "class": "pile serree" }, [el("b", { text: pseudo }), details ? el("span", { "class": "meta", text: details }) : null]), el("span", { "class": "actions" }, actions)])]);
  }
  function sectionAmisCompte(apres) {
    var zone = el("div", { "class": "pile" }, [el("p", { "class": "attente", role: "status", text: "Chargement…" })]);
    function agir(corps, bouton, info) {
      if (bouton) bouton.disabled = true;
      return api("POST", "amis", corps, 10000).then(function () { charger(); if (apres) apres(); }, function (e) { if (bouton) bouton.disabled = false; info.textContent = erreurCompte(e); });
    }
    function rendre(j) {
      zone.textContent = "";
      var info = el("p", { "class": "meta", role: "status" });
      var inviter = el("button", { "class": "btn", type: "button" }, [icone("invitation"), el("span", { text: "Inviter par WhatsApp" })]);
      inviter.addEventListener("click", function () { inviter.disabled = true; inviterParLien(info).then(function () { inviter.disabled = false; }); });
      var pseudo = champTexte("ami-pseudo", "Ajouter par pseudo", { maxlength: "20", autocapitalize: "off", autocomplete: "off", spellcheck: "false", placeholder: "Pseudo exact" });
      var envoyer = el("button", { "class": "btn second", type: "button", text: "Envoyer la demande" });
      envoyer.addEventListener("click", function () {
        var p = pseudo.input.value.trim();
        if (!p) { info.textContent = "Écris le pseudo exact de ton ami."; return; }
        envoyer.disabled = true;
        api("POST", "amis", { action: "demander", pseudo: p }, 10000).then(function (r) {
          toast(r.etat === "ami" ? "Vous êtes maintenant amis." : "Demande envoyée à " + r.pseudo + ".");
          charger(); if (apres) apres();
        }, function (e) { envoyer.disabled = false; info.textContent = erreurCompte(e); });
      });
      zone.appendChild(el("div", { "class": "pile" }, [inviter, el("div", { "class": "pile serree" }, [pseudo.label, pseudo.input]), envoyer, info]));
      if ((j.recues || []).length) {
        var ur = el("ul", { "class": "liste" });
        j.recues.forEach(function (d) {
          var ok = el("button", { "class": "btn second petit", type: "button", text: "Accepter" }), non = el("button", { "class": "btn second petit", type: "button", text: "Refuser" });
          ok.addEventListener("click", function () { agir({ action: "accepter", pseudo: d.pseudo }, ok, info); });
          non.addEventListener("click", function () { agir({ action: "refuser", pseudo: d.pseudo }, non, info); });
          ur.appendChild(rangeeAmi(d.pseudo, "veut devenir ton ami", [ok, non]));
        });
        zone.appendChild(el("section", { "class": "pile serree" }, [el("h2", { text: "Demandes reçues" }), ur]));
      }
      if ((j.envoyees || []).length) {
        var ue = el("ul", { "class": "liste" });
        j.envoyees.forEach(function (d) {
          var annuler = el("button", { "class": "btn second petit", type: "button", text: "Annuler" });
          annuler.addEventListener("click", function () { agir({ action: "retirer", pseudo: d.pseudo }, annuler, info); });
          ue.appendChild(rangeeAmi(d.pseudo, "en attente de réponse", [annuler]));
        });
        zone.appendChild(el("section", { "class": "pile serree" }, [el("h2", { text: "Demandes envoyées" }), ue]));
      }
      var ua = el("ul", { "class": "liste" });
      (j.amis || []).forEach(function (a) {
        var retirer = el("button", { "class": "btn second petit", type: "button", text: "Retirer" });
        retirer.addEventListener("click", function () { if (window.confirm("Retirer " + a.pseudo + " de tes amis" + F + "?")) agir({ action: "retirer", pseudo: a.pseudo }, retirer, info); });
        ua.appendChild(rangeeAmi(a.pseudo, a.points + N + "XP", [retirer]));
      });
      zone.appendChild(el("section", { "class": "pile serree" }, [el("h2", { text: "Mes amis" }), (j.amis || []).length ? ua : el("p", { "class": "meta", text: "Pas encore d’ami. Envoie un lien par WhatsApp, ou cherche un pseudo exact." })]));
      if (window.poserIcones) window.poserIcones(zone);
    }
    function charger() { return api("GET", "amis", null, 10000).then(rendre, function (e) { zone.textContent = ""; zone.appendChild(el("p", { "class": "meta", text: erreurCompte(e) })); }); }
    charger();
    return zone;
  }
  function vueAmis() {
    var classement = el("div", { "class": "pile" }, [el("p", { "class": "attente", text: "Chargement…" })]);
    var duels = el("div", { "class": "pile serree" });
    var salons = el("div", { "class": "pile serree" });
    var groupes = el("div", { "class": "pile serree" }, [el("p", { "class": "attente", text: "Chargement…" })]);
    var info = el("p", { "class": "meta", role: "status" });
    var zoneAmis = el("div", { "class": "pile serree" });
    var pasDeDuel = function (texte) { duels.innerHTML = ""; duels.appendChild(etatVide("epee", texte, lien("#/", "Choisir une formation", "btn second petit"))); };
    var pasDeSalon = function (texte) { salons.innerHTML = ""; salons.appendChild(el("p", { "class": "meta", text: texte })); };
    var creer = el("details", { "class": "plier creer-salon" }, [
      el("summary", {}, [icone("cercle"), el("span", { text: "Créer un salon" })]),
      el("div", { "class": "pile" }, [
        el("p", { "class": "meta", text: "Choisis un sujet et une longueur. Tes amis rejoignent par un simple lien, sans limite de joueurs." }),
        formulaireQuiz({ id: "sujet-salon", bouton: "Créer le salon", lancer: function (s, n) { location.hash = "#/nouveau-salon/" + enc(s) + "/" + n; } })
      ])
    ]);
    montrer(el("div", { "class": "page" }, [entete(), el("h1", { text: "Amis" }),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Mes amis" }), el("p", { "class": "meta", style: "font-size:16px", text: "Tu ne vois que toi et tes amis. On devient ami par un lien d’invitation ou par un pseudo exact." }), zoneAmis, info]),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Salons" }), salons, creer]),
      carteTournoi(),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Mes groupes" }), groupes]),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Rejoindre une partie" }), el("p", { "class": "meta", text: "Jusqu’à 12 joueurs répondent en même temps. Entre le code de ton ami. Pour en lancer une, ouvre un salon et touche " + guill("Jouer en direct") + "." }), formulaireCode()]),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Duels" }), duels]),
      el("section", { "class": "pile serree" }, [el("div", { "class": "ligne-titre" }, [el("h2", { text: "Classement entre amis" }), el("span", { "class": "meta", text: "XP cumulés" })]), classement])
    ]), "amis", "Amis");
    if (window.poserIcones) window.poserIcones(creer);
    pretServeur.then(function () {
      if (!serveur.base) { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Le classement s’affiche dès que le serveur répond." })); pasDeDuel("Les duels demandent la connexion en ligne."); pasDeSalon("Les salons demandent la connexion en ligne."); groupes.innerHTML = ""; groupes.appendChild(el("p", { "class": "meta", text: "Les groupes demandent la connexion en ligne." })); return; }
      remplirGroupes(groupes);
      if (profil.compte) zoneAmis.appendChild(sectionAmisCompte(chargerClassement));
      else zoneAmis.appendChild(etatVide("invitation", "Crée ton compte pour ajouter des amis et voir leur classement.", lienAvance("#/compte", "Créer mon compte", "btn second petit")));
      if (window.poserIcones) window.poserIcones(zoneAmis);
      chargerClassement();
      function chargerClassement() { api("GET", "cercle").then(function (j) {
        classement.innerHTML = "";
        var ol = el("ol", { "class": "liste" });
        (j.joueurs || []).forEach(function (x, k) { ol.appendChild(el("li", {}, [el("div", { "class": "rangee rang" }, [el("b", { text: String(k + 1) }), el("b", { text: x.pseudo + (x.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: x.points + N + "XP" })])])); });
        classement.appendChild((j.joueurs || []).length ? ol : el("p", { "class": "meta", text: "Ton classement et celui de tes amis s’affichent ici." }));
      }, function () { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Classement indisponible pour l’instant." })); }); }
      if (!enLigne()) { pasDeDuel("Les duels demandent la connexion en ligne."); pasDeSalon("Connecte‑toi pour retrouver tes salons."); return; }
      api("GET", "duels").then(function (j) {
        var tous = j.duels || [];
        var mesSalons = tous.filter(function (d) { return d.type === "salon"; }).slice(0, 8);
        var mesDuels = tous.filter(function (d) { return d.type !== "salon" && d.type !== "tournoi"; }).slice(0, 8);
        if (!mesSalons.length) pasDeSalon("Aucun salon pour l’instant. Crée le tien, ou ouvre le lien d’un ami.");
        else { var us = el("ul", { "class": "liste" }); mesSalons.forEach(function (d) { us.appendChild(rangeeSalon(d)); }); salons.innerHTML = ""; salons.appendChild(us); }
        if (!mesDuels.length) pasDeDuel("Aucun duel pour l’instant. Lance‑en un depuis l’onglet Défis d’une formation.");
        else { var ud = el("ul", { "class": "liste" }); mesDuels.forEach(function (d) { ud.appendChild(rangeeSalon(d)); }); duels.innerHTML = ""; duels.appendChild(ud); }
        if (window.poserIcones) { window.poserIcones(salons); window.poserIcones(duels); }
      }, function () { pasDeDuel("Les duels ne se chargent pas pour l’instant."); pasDeSalon("Les salons ne se chargent pas pour l’instant."); });
    });
  }

  /* ---------- Formation à plusieurs ---------- */
  function urlGroupe(id) { return location.origin + location.pathname + "#/groupe/" + id; }
  function depuis(iso) {
    var m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
    if (!(m >= 1)) return "à l’instant";
    if (m < 60) return "il y a " + m + N + "min";
    if (m < 1440) return "il y a " + Math.floor(m / 60) + N + "h";
    return "il y a " + Math.floor(m / 1440) + N + "j";
  }
  /* Rangée d'un membre : rang, pseudo (toi), leçons faites, XP gagnée sur la formation, dernière activité, barre de progression. */
  function rangeeMembre(m, ref) {
    var pct = ref ? Math.min(100, Math.round(m.lecons / ref * 100)) : 0;
    var detail = m.lecons || m.xp ? pluriel(m.lecons, "leçon faite", "leçons faites") + " · " + m.xp + N + "XP" + (m.activite ? " · " + depuis(m.activite) : "") : "Pas encore commencé";
    return el("li", {}, [el("div", { "class": "rangee membre" }, [
      el("b", { "class": "rang-num", text: String(m.rang) }),
      el("span", { "class": "membre-corps" }, [
        el("b", { text: m.pseudo + (m.moi ? " (toi)" : "") }),
        el("span", { "class": "meta", text: detail }),
        el("span", { "class": "progres", role: "progressbar", "aria-label": "Avancée de " + m.pseudo, "aria-valuemin": "0", "aria-valuemax": String(ref), "aria-valuenow": String(Math.min(m.lecons, ref)) }, [el("i", { style: "width:" + pct + "%" })])
      ])
    ])]);
  }
  /* Sur la page d'une formation : « Suivre à plusieurs » crée un groupe ; si j'en ai déjà un pour cette formation, un lien vers lui. */
  function boutonGroupe(p, zone, vive) {
    pretCompte().then(function () {
      if (!enLigne() || !vive()) return;
      return api("GET", "groupe").then(function (j) {
        if (!vive()) return;
        var mien = (j.groupes || []).filter(function (g) { return g.parcours === p.id; })[0];
        if (mien) zone.appendChild(lienAvance("#/groupe/" + mien.id, "Mon groupe" + N + ": " + mien.nom, "btn second"));
        else {
          var b = el("button", { "class": "btn second", type: "button" }, [icone("cercle"), el("span", { text: "Suivre à plusieurs" })]);
          var al = el("p", { "class": "alerte", hidden: "", role: "status" });
          b.addEventListener("click", function () {
            b.disabled = true; al.hidden = true;
            api("POST", "groupe", { nom: p.titre.slice(0, 40), parcours: p.id }).then(function (j2) { location.hash = "#/groupe/" + j2.id; },
              function (e) { b.disabled = false; al.textContent = messageErreur(e, "Tu as déjà créé 10 groupes aujourd’hui. Reviens demain."); al.hidden = false; });
          });
          zone.appendChild(b); zone.appendChild(al);
        }
        if (window.poserIcones) window.poserIcones(zone);
      });
    }).then(null, function () {});
  }
  /* Page d'un groupe : la formation, les membres (rang, leçons, XP, activité), continuer, défier, inviter, quitter. */
  function vueGroupe(id) {
    var vive = vivante();
    montrer(attente("Ouverture du groupe…"), "amis", "Groupe");
    pretCompte().then(function () {
      // Ma progression part d'abord (l'envoi habituel) : le groupe lit ce que le serveur sait de moi.
      var envoi = enLigne() ? api("PUT", "progression", { pseudo: profil.pseudo, ton: "sobre", etat: etat }).catch(function () {}) : Promise.resolve();
      return envoi.then(function () { return api("GET", "groupe?id=" + enc(id)); });
    }).then(function (j) {
      var g = j.groupe;
      return chargerParcours(g.parcours).then(function (p) { return { g: g, p: p }; }, function () { return { g: g, p: null }; });
    }).then(function (r) {
      if (!vive()) return;
      var g = r.g, p = r.p, titre = (p && p.titre) || g.parcoursTitre || "la formation";
      var s = suivi(g.parcours), suivant = s.fait + 1, base = "#/p/" + enc(g.parcours);
      var total = p && (p.verifie || formationComplete(p)) ? paliersPrevus(p) : 0;
      var ref = Math.max(total, 5, g.classement.reduce(function (m, x) { return Math.max(m, x.lecons); }, 0));
      var retour = el("p", { "class": "meta", role: "status" });
      var actions = el("div", { "class": "pile" });
      if (!g.dejaMembre) {
        if (g.complet) actions.appendChild(el("p", { "class": "verrou" }, [icone("cadenas"), "Ce groupe est complet" + N + ": " + g.max + " membres au plus."]));
        else {
          var rejoindre = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Rejoindre le groupe" }), icone("fleche")]);
          rejoindre.addEventListener("click", function () {
            if (!enLigne()) { retour.textContent = "Les groupes demandent la connexion en ligne. Réessaie dans un moment."; return; }
            rejoindre.disabled = true;
            api("POST", "groupe", { id: g.id, rejoindre: true }).then(function () { vueGroupe(id); }, function (e) { rejoindre.disabled = false; retour.textContent = messageErreur(e); });
          });
          actions.appendChild(rejoindre);
        }
      } else {
        actions.appendChild(lienAvance(p && fini(p) ? base : base + "/" + suivant, s.fait ? "Continuer la formation" : "Commencer la formation", "btn"));
      }
      if (g.dejaMembre && p && !p.verifie) {
        var defier = el("button", { "class": "btn second", type: "button" }, [icone("epee"), el("span", { text: "Défier le groupe" })]);
        defier.addEventListener("click", function () {
          defier.disabled = true; retour.textContent = "Création du salon…";
          pretCompte().then(function () { return api("GET", "quiz?parcours=" + enc(g.parcours) + "&n=10&graine=" + Math.floor(Math.random() * 1e9)); }).then(function (q) {
            if ((q.questions || []).length >= 5) return q.questions;
            return api("POST", "quiz-direct", { parcours: g.parcours }, 100000).then(function (q2) { return q2.questions || []; });
          }).then(function (items) { return creerSalonApi(items, titre, null); }).then(function (s2) {
            retour.textContent = "Salon créé. Envoie le lien au groupe" + N + ": tout le monde joue les mêmes questions.";
            var envoi = el("button", { "class": "btn second", type: "button" }, [icone("invitation"), el("span", { text: "Envoyer le salon" })]);
            envoi.addEventListener("click", function () { envoyerSalon(s2.id, titre, 10, function (t) { retour.textContent = t; }); });
            defier.replaceWith(envoi); retour.after(lien("#/salon/" + s2.id, "Ouvrir le salon"));
            if (window.poserIcones) window.poserIcones(actions);
          }, function (e) { defier.disabled = false; retour.textContent = e.statut === 503 ? "Les salons demandent la connexion en ligne. Réessaie dans un moment." : messageErreur(e); });
        });
        actions.appendChild(defier);
      }
      var inviter = el("button", { "class": "btn second", type: "button" }, [icone("invitation"), el("span", { text: "Inviter" })]);
      inviter.addEventListener("click", function () { partager("Koîos", (profil ? profil.pseudo : "Un ami") + " te propose de suivre " + guill(titre) + " à plusieurs.", urlGroupe(g.id), function (t) { retour.textContent = t; }); });
      actions.appendChild(inviter);
      actions.appendChild(retour);
      var liste = el("ol", { "class": "liste" });
      g.classement.forEach(function (m) { liste.appendChild(rangeeMembre(m, ref)); });
      var quitter = null;
      if (g.dejaMembre) {
        quitter = el("button", { "class": "lien discret", type: "button", text: "Quitter le groupe" });
        quitter.addEventListener("click", function () {
          if (!quitter.dataset.sur) { quitter.dataset.sur = "1"; quitter.textContent = "Touche encore pour quitter ce groupe"; return; }
          quitter.disabled = true;
          api("POST", "groupe", { id: g.id, quitter: true }).then(function () { location.hash = "#/amis"; }, function (e) { quitter.disabled = false; retour.textContent = messageErreur(e); });
        });
      }
      montrer(el("div", { "class": "page " + teinteSujet(titre) }, [
        el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/amis" }, [icone("retour"), "Amis"]), el("span"), puceXP()]),
        p ? couverture(p) : null,
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Formation à plusieurs" }), el("h1", { text: g.nom }), el("p", { "class": "meta", text: (g.nom === titre ? "" : titre + " · ") + pluriel(g.membres, "membre", "membres") + " sur " + g.max })]),
        actions,
        el("section", { "class": "pile" }, [el("div", { "class": "ligne-titre" }, [el("h2", { text: "Classement" }), el("span", { "class": "meta", text: "Leçons faites" })]), liste]),
        quitter
      ]), "amis", g.nom);
    }, function (e) { if (vive()) montrer(erreurPage(e.statut === 404 ? "Ce groupe n’existe pas (ou plus)." : messageErreur(e), "Groupe indisponible"), "amis"); });
  }
  /* Amis : mes groupes. */
  function remplirGroupes(zone) {
    function vide(texte) { zone.innerHTML = ""; zone.appendChild(el("p", { "class": "meta", text: texte })); }
    if (!enLigne()) { vide("Connecte‑toi pour retrouver tes groupes."); return; }
    api("GET", "groupe").then(function (j) {
      var l = j.groupes || [];
      if (!l.length) { vide("Aucun groupe pour l’instant. Ouvre une formation et touche " + guill("Suivre à plusieurs") + "."); return; }
      var ul = el("ul", { "class": "liste" });
      l.forEach(function (g) { ul.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/groupe/" + g.id }, [tuile(categorie(g.nom)), el("span", {}, [el("b", { text: g.nom }), el("span", { "class": "meta", text: pluriel(g.membres, "membre", "membres") })]), icone("chevron")])])); });
      zone.innerHTML = ""; zone.appendChild(ul);
      if (window.poserIcones) window.poserIcones(zone);
    }, function () { vide("Les groupes ne se chargent pas pour l’instant."); });
  }

  /* ---------- Jeu en direct ---------- */
  var CODE_PARTIE = /^[A-HJ-NP-Z2-9]{6}$/;
  function urlPartie(code) { return location.origin + location.pathname + "#/partie/" + code; }
  /* Rejoindre par code (Amis) : lettres sans O ni I, chiffres sans 0 ni 1. */
  function formulaireCode() {
    var champ = el("input", { "class": "champ code-saisie", id: "code-partie", type: "text", maxlength: "6", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", enterkeyhint: "go", placeholder: "Code à 6 caractères", "aria-label": "Code de la partie" });
    var bouton = el("button", { "class": "btn petit", type: "button", text: "Rejoindre" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    bouton.addEventListener("click", function () {
      var c = champ.value.replace(/\s+/g, "").toUpperCase();
      if (!CODE_PARTIE.test(c)) { alerte.textContent = "Un code compte 6 caractères" + N + ": des lettres (sans O ni I) et des chiffres (sans 0 ni 1)."; alerte.hidden = false; champ.focus(); return; }
      location.hash = "#/partie/" + c + "/rejoindre";
    });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
    champ.addEventListener("input", function () { alerte.hidden = true; });
    return el("div", { "class": "pile serree" }, [el("div", { "class": "recherche" }, [champ, bouton]), alerte]);
  }
  function ordinal(n) { return n === 1 ? "1er" : n + "e"; }
  /* Podium : les trois premiers, en colonnes de hauteur différente (le premier en encre). */
  function podium(joueurs) {
    var tops = joueurs.slice(0, 3), ol = el("ol", { "class": "podium" + (tops.length === 3 ? " trois" : "") });
    tops.forEach(function (j) {
      ol.appendChild(el("li", { "class": "r" + Math.min(j.rang, 3) }, [el("b", { text: j.pseudo + (j.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: j.points + N + "pts" }), el("span", { "class": "marche", "aria-label": "Place " + j.rang, text: String(j.rang) })]));
    });
    return ol;
  }
  function ligneJoueur(j) {
    return el("li", {}, [el("div", { "class": "rangee rang" }, [icone("profil"), el("b", { text: j.pseudo + (j.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: j.createur ? "Créateur" : "" })])]);
  }
  function classementDirect(joueurs) {
    var ol = el("ol", { "class": "liste" });
    joueurs.forEach(function (x) { ol.appendChild(el("li", {}, [el("div", { "class": "rangee rang" }, [el("b", { text: String(x.rang) }), el("b", { text: x.pseudo + (x.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: pluriel(x.points, "pt", "pts") })])])); });
    return ol;
  }
  /* Partie en direct : tout le monde répond en même temps. Pas de WebSocket : l'écran interroge le serveur toutes les 2 s
     (4 s si l'onglet est caché) et s'arrête dès qu'on quitte la page (jeton de navigation). Le compte à rebours est local,
     recalé à chaque réponse du serveur, qui reste seul juge du temps. */
  function vuePartie(code, auto) {
    code = String(code || "").replace(/\s+/g, "").toUpperCase();
    if (!CODE_PARTIE.test(code)) { montrer(erreurPage("Ce code n’est pas valide" + N + ": il compte 6 caractères.", "Code invalide"), "amis"); return; }
    var vive = vivante();
    var scene = el("main", { "class": "pile" });
    var bandeau = el("p", { "class": "alerte", role: "status", hidden: "" });
    montrer(el("div", { "class": "page plein" }, [
      el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: "#/amis", "aria-label": "Quitter la partie" }, [icone("fermer")]), el("span", { "class": "meta", text: "Partie " + code }), puceXP()]),
      scene, bandeau
    ]), null, "Partie en direct");
    var p = null, cle = "", enCours = false, minuterie = null, tic = null, fin = 0, demande = false;
    var chrono = null, listeEl = null, nbSalle = 0, compteEl = null, compteSalle = null, demarrerBtn = null;
    function arreter() { clearTimeout(minuterie); clearInterval(tic); tic = null; }
    function suite() {
      clearTimeout(minuterie);
      if (!vive() || (p && p.etat === "fini")) { arreter(); return; }
      minuterie = setTimeout(interroger, document.hidden ? 4000 : 2000);
    }
    function interroger() {
      if (!vive()) { arreter(); return; }
      if (enCours) return;
      enCours = true; clearTimeout(minuterie);
      api("GET", "partie?id=" + code, null, 6000).then(function (j) {
        enCours = false; if (!vive()) return;
        bandeau.hidden = true; recevoir(j.partie); suite();
      }, function (e) {
        enCours = false; if (!vive()) return;
        if (e.statut === 404 || e.statut === 400) { arreter(); montrer(erreurPage("Cette partie n’existe pas (ou plus). Vérifie le code.", "Partie introuvable"), "amis"); return; }
        bandeau.textContent = "Connexion perdue. Nouvel essai…"; bandeau.hidden = false; suite();
      });
    }
    function reste() { return Math.max(0, fin - performance.now()); }
    function tictac() {
      if (!vive()) { arreter(); return; }
      if (chrono) {
        var r = reste();
        if (chrono.barre) chrono.barre.style.setProperty("--r", String(Math.min(1, r / p.duree)));
        chrono.texte.textContent = chrono.libelle(Math.ceil(r / 1000));
      }
      if (reste() <= 0 && !demande && p && (p.etat === "question" || p.etat === "resultat")) { demande = true; interroger(); }
    }
    function recevoir(n) {
      p = n; fin = performance.now() + n.restant;
      // Code saisi dans Amis : l'intention est claire, on rejoint tout de suite (un lien ouvert, lui, demande d'abord).
      if (auto && !n.moi.joueur) {
        auto = false;
        if (n.etat === "attente" && n.joueurs.length < n.max && enLigne()) {
          api("POST", "partie", { action: "rejoindre", id: code }).then(function () { interroger(); }, function () { rendre(); });
          return;
        }
      }
      if (n.restant > 600) demande = false;
      var k = n.etat + ":" + n.indice + ":" + (n.moi.joueur ? 1 : 0);
      if (k !== cle) { cle = k; demande = false; rendre(); } else majPartielle();
      if (!tic && p.etat !== "fini") tic = setInterval(tictac, 250);
      if (p.etat === "fini") { clearInterval(tic); tic = null; if (p.moi.joueur) noterFait("direct"); }
      tictac();
    }
    function majPartielle() {
      if (p.etat === "attente" && listeEl) ajouterJoueurs();
      if (p.etat === "question" && compteEl) compteEl.textContent = pluriel(p.joueurs.filter(function (j) { return j.repondu; }).length, "joueur a répondu", "joueurs ont répondu") + " sur " + p.joueurs.length + ".";
    }
    function rendre() {
      scene.innerHTML = ""; chrono = null; listeEl = null; compteEl = null; compteSalle = null; demarrerBtn = null;
      if (!p.moi.joueur) rendreSpectateur();
      else if (p.etat === "attente") rendreSalle();
      else if (p.etat === "question") rendreQuestion();
      else if (p.etat === "resultat") rendreResultat();
      else rendreFin();
      if (window.poserIcones) window.poserIcones(scene);
      var h = scene.querySelector("h1, .enonce"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      window.scrollTo(0, 0);
    }
    /* Joueurs de la salle d'attente : seuls les nouveaux arrivants s'ajoutent (la liste ne clignote pas à chaque interrogation). */
    function ajouterJoueurs() {
      for (; nbSalle < p.joueurs.length; nbSalle++) {
        listeEl.appendChild(ligneJoueur(p.joueurs[nbSalle]));
      }
      if (window.poserIcones) window.poserIcones(listeEl);
      if (compteSalle) compteSalle.textContent = p.joueurs.length + " sur " + p.max;
      if (demarrerBtn) demarrerBtn.querySelector("span").textContent = "Démarrer · " + pluriel(p.joueurs.length, "joueur", "joueurs");
    }
    function rendreSalle() {
      nbSalle = 0; listeEl = el("ul", { "class": "liste" });
      compteSalle = el("span", { "class": "meta" });
      var retour = el("p", { "class": "meta", role: "status" });
      var entete = el("div", { "class": "ligne-titre" }, [el("h2", { text: "Joueurs" }), compteSalle]);
      var inviter = el("button", { "class": "btn second", type: "button" }, [icone("invitation"), el("span", { text: "Inviter" })]);
      inviter.addEventListener("click", function () { partager("Koîos", (profil ? profil.pseudo : "Un ami") + " te lance une partie en direct" + N + ": " + guill(p.titre) + ". Code " + code + ".", urlPartie(code), function (t) { retour.textContent = t; }); });
      scene.appendChild(el("span", { "class": "sur", text: "Partie en direct" }));
      scene.appendChild(el("h1", { text: p.titre }));
      scene.appendChild(el("p", { "class": "meta", text: "Créée par " + (p.moi.createur ? "toi" : p.createur) + " · " + pluriel(p.total, "question", "questions") + " · " + p.duree / 1000 + N + "s par question" }));
      scene.appendChild(el("div", { "class": "code-bloc" }, [el("span", { "class": "sur", text: "Code de la partie" }), el("p", { "class": "code-partie", "aria-label": "Code " + code.split("").join(" "), text: code }), el("p", { "class": "meta lien-partie", text: urlPartie(code) })]));
      scene.appendChild(entete); scene.appendChild(listeEl);
      if (p.moi.createur) {
        demarrerBtn = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Démarrer" }), icone("fleche")]);
        demarrerBtn.addEventListener("click", function () {
          demarrerBtn.disabled = true; retour.textContent = "";
          api("POST", "partie", { action: "demarrer", id: code }).then(function () { interroger(); }, function (e) { demarrerBtn.disabled = false; retour.textContent = messageErreur(e); });
        });
        scene.appendChild(demarrerBtn);
      } else scene.appendChild(el("p", { "class": "verrou", role: "status" }, [icone("sablier"), "En attente du créateur. La partie démarre dès qu’il la lance."]));
      scene.appendChild(inviter); scene.appendChild(retour);
      ajouterJoueurs();
    }
    function optionsDe(q, choisi, bonne) {
      var o = el("div", { "class": "options" + (q.type === "vraifaux" ? " deux" : ""), role: "group", "aria-label": q.type === "vraifaux" ? "Vrai ou faux" : "Réponses" });
      var libelles = q.type === "vraifaux" ? ["Vrai", "Faux"] : q.reponses;
      libelles.forEach(function (rep, k) {
        var b = el("button", { "class": "option" + (q.type === "vraifaux" ? "" : " avec-lettre"), type: "button" }, q.type === "vraifaux" ? [el("span", { text: rep })] : [el("span", { "class": "lettre", "aria-hidden": "true", text: "ABCDEF".charAt(k) }), el("span", { text: rep }), el("span", { "class": "fin" })]);
        if (bonne !== undefined) {
          b.disabled = true;
          if (k === bonne) { b.classList.add("juste"); var f = b.querySelector(".fin"); if (f) f.appendChild(coche(false, "Bonne réponse")); }
          else if (k === choisi) { b.classList.add("faux"); var f2 = b.querySelector(".fin"); if (f2) f2.appendChild(icone("faux", "Ta réponse")); }
        } else if (k === choisi) { b.classList.add("choisi"); b.setAttribute("aria-pressed", "true"); b.disabled = true; }
        o.appendChild(b);
      });
      return o;
    }
    function rendreQuestion() {
      var q = p.question, indice = p.indice;
      if (!q) { scene.appendChild(el("p", { "class": "attente", role: "status", text: "La question arrive…" })); return; }
      var temps = el("span", { "class": "temps", role: "timer", "aria-live": "off" });
      var barre = el("i");
      chrono = { barre: barre, texte: temps, libelle: function (s) { return s + N + "s"; } };
      scene.appendChild(el("div", { "class": "ligne-titre" }, [el("span", { "class": "sur", text: "Question " + (indice + 1) + " sur " + p.total }), temps]));
      scene.appendChild(el("div", { "class": "progres chrono", "aria-hidden": "true" }, [barre]));
      scene.appendChild(el("p", { "class": "enonce", text: q.type === "vraifaux" ? q.affirmation : q.enonce }));
      var etatRep = el("p", { "class": "meta", role: "status", text: p.moi.repondu ? "Réponse envoyée. Le résultat arrive à la fin du compte à rebours." : "Touche ta réponse" + N + ": plus c’est rapide, plus ça rapporte." });
      var o = optionsDe(q, p.moi.repondu ? p.moi.choix : undefined);
      var boutons = Array.prototype.slice.call(o.children);
      boutons.forEach(function (b, k) {
        b.addEventListener("click", function () {
          boutons.forEach(function (x) { x.disabled = true; });
          b.classList.add("choisi"); b.setAttribute("aria-pressed", "true");
          etatRep.textContent = "Envoi de ta réponse…";
          api("POST", "partie", { action: "repondre", id: code, indice: indice, choix: k }, 6000).then(function () {
            etatRep.textContent = "Réponse envoyée. Le résultat arrive à la fin du compte à rebours.";
          }, function (e) {
            etatRep.textContent = e.statut === 409 || e.statut === 403 ? e.message : messageErreur(e);
            if (e.statut !== 409 && e.statut !== 403) { boutons.forEach(function (x) { x.disabled = false; x.classList.remove("choisi"); x.removeAttribute("aria-pressed"); }); }
          });
        });
      });
      scene.appendChild(o); scene.appendChild(etatRep);
      compteEl = el("p", { "class": "meta" }); scene.appendChild(compteEl);
      majPartielle();
    }
    function rendreResultat() {
      var q = p.question, moi = p.moi, dernier = p.indice + 1 >= p.total;
      var temps = el("span", { "class": "temps", role: "timer", "aria-live": "off" });
      chrono = { barre: null, texte: temps, libelle: function (s) { return (dernier ? "Classement final dans " : "Question suivante dans ") + s + N + "s"; } };
      scene.appendChild(el("div", { "class": "ligne-titre" }, [el("span", { "class": "sur", text: "Résultat · question " + (p.indice + 1) + " sur " + p.total }), el("span", { "class": "meta gain", text: "+" + (moi.gain || 0) + N + "pts" })]));
      if (q) {
        scene.appendChild(el("p", { "class": "enonce", text: q.type === "vraifaux" ? q.affirmation : q.enonce }));
        scene.appendChild(optionsDe(q, moi.choix, q.bonne));
        var titre = moi.juste ? "Exact" : moi.repondu ? "Pas tout à fait" : "Pas de réponse";
        scene.appendChild(el("div", { "class": "retour-q " + (moi.juste ? "ok" : "ko"), role: "status" }, [el("strong", {}, [icone(moi.juste ? "juste" : "faux"), titre]), q.explication ? el("p", { text: q.explication }) : null]));
      }
      scene.appendChild(el("h2", { text: "Classement provisoire" }));
      scene.appendChild(classementDirect(p.joueurs));
      scene.appendChild(el("p", { "class": "meta", role: "status" }, [temps]));
    }
    function rendreFin() {
      var moi = p.joueurs.filter(function (j) { return j.moi; })[0];
      scene.appendChild(el("span", { "class": "sur", text: p.titre }));
      scene.appendChild(el("h1", { text: "Partie terminée" }));
      if (moi) scene.appendChild(el("p", { "class": "meta", style: "font-size:16px", text: "Ta place" + N + ": " + ordinal(moi.rang) + " sur " + p.joueurs.length + " · " + pluriel(moi.points, "point", "points") + " · " + moi.justes + "/" + p.total + " bonnes réponses" }));
      scene.appendChild(podium(p.joueurs));
      scene.appendChild(el("h2", { text: "Classement final" }));
      scene.appendChild(classementDirect(p.joueurs));
      var retour = el("p", { "class": "meta", role: "status" });
      if (moi) {
        var part = el("button", { "class": "btn", type: "button" }, [icone("invitation"), el("span", { text: "Partager le résultat" })]);
        part.addEventListener("click", function () { partager("Koîos", "J’ai fini " + ordinal(moi.rang) + " sur " + p.joueurs.length + " à la partie " + guill(p.titre) + " avec " + pluriel(moi.points, "point", "points") + ".", urlPartie(code), function (t) { retour.textContent = t; }); });
        scene.appendChild(part);
      }
      scene.appendChild(retour);
      scene.appendChild(lien("#/amis", "Retour aux amis"));
    }
    function rendreSpectateur() {
      scene.appendChild(el("span", { "class": "sur", text: "Partie en direct" }));
      scene.appendChild(el("h1", { text: p.titre }));
      scene.appendChild(el("p", { "class": "meta", text: "Créée par " + p.createur + " · " + pluriel(p.joueurs.length, "joueur", "joueurs") + " sur " + p.max }));
      if (p.etat === "fini") { scene.appendChild(podium(p.joueurs)); scene.appendChild(classementDirect(p.joueurs)); scene.appendChild(lien("#/amis", "Retour aux amis")); return; }
      if (p.etat !== "attente") {
        scene.appendChild(el("p", { "class": "verrou", role: "status" }, [icone("cadenas"), "Cette partie a déjà commencé. On ne la rejoint qu’avant le début."]));
        scene.appendChild(lien("#/amis", "Retour aux amis"));
        return;
      }
      var retour = el("p", { "class": "alerte", role: "status", hidden: "" });
      if (p.joueurs.length >= p.max) scene.appendChild(el("p", { "class": "verrou" }, [icone("cadenas"), "Cette partie est complète" + N + ": " + p.max + " joueurs au plus."]));
      else {
        var rejoindre = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Rejoindre la partie" }), icone("fleche")]);
        rejoindre.addEventListener("click", function () {
          if (!enLigne()) { retour.textContent = "Le jeu en direct demande la connexion en ligne. Réessaie dans un moment."; retour.hidden = false; return; }
          rejoindre.disabled = true; retour.hidden = true;
          api("POST", "partie", { action: "rejoindre", id: code }).then(function () { interroger(); }, function (e) { rejoindre.disabled = false; retour.textContent = messageErreur(e); retour.hidden = false; });
        });
        scene.appendChild(rejoindre);
      }
      scene.appendChild(retour);
      var ul = el("ul", { "class": "liste" });
      p.joueurs.forEach(function (j) { ul.appendChild(ligneJoueur(j)); });
      scene.appendChild(ul);
    }
    scene.appendChild(el("p", { "class": "attente", role: "status", text: "Ouverture de la partie…" }));
    pretServeur.then(function () {
      if (!vive()) return;
      if (!serveur.base) { montrer(erreurPage("Le jeu en direct demande la connexion en ligne. Réessaie dans un moment.", "Partie indisponible"), "amis"); return; }
      return pretCompte().then(function () { if (vive()) interroger(); });
    });
  }

  /* ---------- Profil ---------- */
  /* ---------- Ma clé IA et espace admin (Profil) ---------- */
  var NOM_FOURNISSEUR = { gemini: "Gemini", glm: "GLM", claude: "Claude" };
  /* La clé personnelle ne s'affiche jamais : le champ se vide dès qu'elle est enregistrée sur ce téléphone. */
  function sectionCleIA() {
    var courant = (cleIA() && cleIA().f) || "gemini";
    var seg = el("div", { "class": "onglets", role: "radiogroup", "aria-label": "Fournisseur de ta clé" });
    var aide = el("div", { "class": "pile serree" });
    var champ = el("input", { "class": "champ", id: "cle-ia", type: "password", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Colle ta clé ici", "aria-label": "Clé IA" });
    var etatCle = el("p", { "class": "meta", role: "status" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    var tester = el("button", { "class": "btn second", type: "button", text: "Tester" });
    var retirer = el("button", { "class": "btn second", type: "button", text: "Retirer" });
    function majAide() {
      aide.textContent = "";
      if (courant === "gemini") aide.appendChild(el("p", { "class": "meta", text: "Gemini est le plus simple" + N + ": la clé gratuite se crée en quelques minutes." })), aide.appendChild(el("a", { "class": "lien", href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener", text: "Créer une clé Gemini gratuite" }));
      else aide.appendChild(el("p", { "class": "meta", text: "Colle la clé de ton compte " + NOM_FOURNISSEUR[courant] + "." }));
    }
    function majEtat() {
      var c = cleIA();
      etatCle.textContent = c ? "Clé " + NOM_FOURNISSEUR[c.f] + " enregistrée sur ce téléphone." : "Aucune clé enregistrée. Les leçons s’écrivent avec les clés de Koîos.";
      retirer.hidden = !c;
    }
    [["gemini", "Gemini"], ["glm", "GLM"], ["claude", "Claude"]].forEach(function (c) {
      var b = el("button", { type: "button", role: "radio", "aria-checked": c[0] === courant ? "true" : "false", text: c[1] });
      b.addEventListener("click", function () { courant = c[0]; seg.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); }); majAide(); alerte.hidden = true; });
      seg.appendChild(b);
    });
    tester.addEventListener("click", function () {
      var cle = champ.value.trim();
      alerte.hidden = true;
      if (!/^[A-Za-z0-9._~+\/=-]{8,400}$/.test(cle)) { alerte.textContent = "Cette clé n’a pas le bon format. Colle-la en entier, sans espace."; alerte.hidden = false; return; }
      tester.disabled = true; tester.textContent = "Essai en cours…";
      pretCompte().then(function () {
        if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
        var entetes = {}; entetes["x-cle-ia"] = courant + ":" + cle;
        return api("POST", "cle-ia", {}, 30000, null, entetes);
      }).then(function () {
        S.ecrire("koios.cleia", { f: courant, c: cle }); champ.value = ""; toast("Ta clé fonctionne. Elle reste sur ce téléphone.");
      }, function (e) { alerte.textContent = messageErreur(e); alerte.hidden = false; }).then(function () { tester.disabled = false; tester.textContent = "Tester"; majEtat(); });
    });
    retirer.addEventListener("click", function () { try { localStorage.removeItem("koios.cleia"); } catch (e) { /* mémoire seule */ } champ.value = ""; alerte.hidden = true; toast("Clé retirée de ce téléphone."); majEtat(); });
    majAide(); majEtat();
    return el("section", { "class": "pile" }, [el("h2", { text: "Ma clé IA" }),
      el("p", { "class": "meta", style: "font-size:16px", text: "Ta clé reste sur ton téléphone. Les leçons que tu crées restent dans la bibliothèque pour tous." }),
      seg, aide, el("label", { "for": "cle-ia", "class": "sr", text: "Clé IA" }), champ, etatCle, alerte,
      el("div", { "class": "boutons-ligne" }, [tester, retirer])]);
  }
  /* Crédit Claude : bandeau rouge sous le seuil (ou crédit épuisé). Admin seulement ; un seul appel léger à GET admin, jamais pour les autres joueurs. */
  function dollars(x) { return String(Math.round((Number(x) || 0) * 100) / 100).replace(".", ",") + N + "$"; }
  function bandeauCredit(c, avecLien) {
    if (!c || !c.alerte) return null;
    return el("div", { "class": "bandeau-credit", role: "alert" }, [
      el("p", { "class": "alerte", text: "Crédit Claude" + N + ": " + (c.epuise ? "épuisé. " : "il reste environ " + dollars(c.restant) + ". ") + "Recharge sur console.anthropic.com" }),
      avecLien ? lien("#/admin", "Noter ma recharge", "lien discret") : null]);
  }
  function zoneCredit() {
    var zone = el("div", { "class": "pile serree" });
    if (!profil || profil.role !== "admin") return zone;
    var vive = vivante();
    api("GET", "admin", null, 10000).then(function (j) {
      var b = vive() ? bandeauCredit(j && j.credit, true) : null;
      if (b) { zone.appendChild(b); if (window.poserIcones) window.poserIcones(zone); }
    }, function () { /* pas admin, ou hors ligne : rien à montrer */ });
    return zone;
  }
  /* Espace admin : visible seulement pour un compte admin. On le devient une fois, avec la clé ADMIN_KEY (elle n'est pas gardée sur le téléphone). */
  function sectionAdmin() {
    if (!profil || profil.role !== "admin") return null;
    return el("section", { "class": "pile" }, [el("h2", { text: "Espace admin" }), lienAvance("#/admin", "Ouvrir l’espace admin", "btn second")]);
  }
  function ecranCleAdmin() {
    var champ = el("input", { "class": "champ", type: "password", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Clé admin", placeholder: "Clé admin" });
    var al = el("p", { "class": "alerte", hidden: "", role: "status" });
    var entrer = el("button", { "class": "btn", type: "button", text: "Entrer" });
    entrer.addEventListener("click", function () {
      var c = champ.value.trim(); al.hidden = true;
      if (!c) return;
      entrer.disabled = true;
      var entetes = {}; entetes["x-admin-cle"] = c;
      api("POST", "admin", { action: "promouvoir" }, 10000, null, entetes).then(function () {
        champ.value = ""; profil.role = "admin"; S.ecrire("koios.profil", profil); route();
      }, function (e) { entrer.disabled = false; al.textContent = e.statut === 403 ? "Clé non reconnue." : erreurCompte(e); al.hidden = false; });
    });
    montrer(el("div", { "class": "page" }, [
      el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/profil" }, [icone("retour"), "Profil"]), el("span"), puceXP()]),
      el("div", { "class": "pile" }, [el("h1", { text: "Clé admin" }), el("p", { "class": "meta", style: "font-size:16px", text: "Une seule fois" + N + ": ce compte devient admin. La clé n’est pas gardée sur ce téléphone." }), champ, entrer, al])]), "profil", "Clé admin");
  }
  function ligneAdmin(titre, details, actions) {
    return el("li", {}, [el("div", { "class": "ligne-ami" }, [el("span", { "class": "pile serree" }, [el("b", { text: titre }), details ? el("span", { "class": "meta", text: details }) : null]), el("span", { "class": "actions" }, actions)])]);
  }
  /* Onglet Comptes : recherche, 50 par page, bloquer ou débloquer, code temporaire de réinitialisation. */
  function panneauComptes(vive) {
    var zone = el("div", { "class": "pile" }), liste = el("div", { "class": "pile serree" }), alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    var q = el("input", { "class": "champ", type: "search", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Pseudo, prénom ou nom", "aria-label": "Chercher un compte" });
    var chercher = el("button", { "class": "btn second", type: "button", text: "Chercher" }), page = 0;
    function depuis2(iso) { return iso ? depuis(iso) : "jamais"; }
    function rendre(j) {
      liste.textContent = "";
      var ul = el("ul", { "class": "liste" });
      (j.comptes || []).forEach(function (c) {
        var b = el("button", { "class": "btn second petit", type: "button", text: c.bloque ? "Débloquer" : "Bloquer" });
        b.addEventListener("click", function () {
          b.disabled = true;
          api("POST", "admin", { action: c.bloque ? "debloquer" : "bloquer", pseudo: c.pseudo }, 10000).then(function () { charger(); }, function (e) { b.disabled = false; dire(alerte, erreurCompte(e)); });
        });
        var r = el("button", { "class": "btn second petit", type: "button", text: "Code temporaire" });
        r.addEventListener("click", function () {
          r.disabled = true;
          api("POST", "admin", { action: "reinitialiser", pseudo: c.pseudo }, 20000).then(function (x) {
            r.disabled = false;
            li.appendChild(el("div", { "class": "pile serree" }, [el("p", { "class": "cle-lecteur", text: x.code }), el("p", { "class": "meta", text: "Valable 24\u00a0h. Donne‑le à la personne" + N + ": elle le tape à la place de sa phrase de secours." })]));
          }, function (e) { r.disabled = false; dire(alerte, erreurCompte(e)); });
        });
        var li = ligneAdmin(c.pseudo + (c.role === "admin" ? " (admin)" : "") + (c.bloque ? " · bloqué" : ""),
          [c.prenom, c.nom].filter(Boolean).join(" ") + " · " + c.xp + N + "XP · " + pluriel(c.lecons, "leçon", "leçons") + " · vu " + depuis2(c.vu), [b, r]);
        ul.appendChild(li);
      });
      liste.appendChild((j.comptes || []).length ? ul : el("p", { "class": "meta", text: "Aucun compte trouvé." }));
      var total = j.total || 0, pages = Math.max(1, Math.ceil(total / (j.parPage || 50)));
      var nav = el("div", { "class": "pages-admin" });
      var prec = el("button", { "class": "btn second petit", type: "button", text: "Précédent" }), suiv = el("button", { "class": "btn second petit", type: "button", text: "Suivant" });
      prec.disabled = page <= 0; suiv.disabled = page + 1 >= pages;
      prec.addEventListener("click", function () { page -= 1; charger(); });
      suiv.addEventListener("click", function () { page += 1; charger(); });
      nav.appendChild(prec); nav.appendChild(el("span", { "class": "meta", text: pluriel(total, "compte", "comptes") + " · page " + (page + 1) + "/" + pages })); nav.appendChild(suiv);
      liste.appendChild(nav);
    }
    function charger() {
      dire(alerte, "");
      api("GET", "admin?comptes=1&page=" + page + (q.value.trim() ? "&q=" + enc(q.value.trim()) : ""), null, 10000).then(function (j) { if (vive()) rendre(j); }, function (e) { if (vive()) dire(alerte, erreurCompte(e)); });
    }
    chercher.addEventListener("click", function () { page = 0; charger(); });
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") chercher.click(); });
    zone.appendChild(el("div", { "class": "pile serree" }, [q, chercher])); zone.appendChild(alerte); zone.appendChild(liste);
    charger();
    return zone;
  }
  /* Onglet Codes : créer un code d'ami (bonus par jour, durée, nombre de personnes), le révoquer. */
  function panneauCodes(vive) {
    var zone = el("div", { "class": "pile" }), liste = el("div", { "class": "pile serree" }), alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    var bonus = champTexte("code-bonus", "Créations de plus par jour", { type: "number", inputmode: "numeric", min: "1", max: "500", value: "5" });
    var jours = champTexte("code-jours", "Durée en jours", { type: "number", inputmode: "numeric", min: "1", max: "365", value: "30" });
    var usages = champTexte("code-usages", "Nombre de personnes", { type: "number", inputmode: "numeric", min: "1", max: "1000", value: "10" });
    var creer = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Créer le code" }), icone("fleche")]), resultat = el("div", { "class": "pile serree" });
    creer.addEventListener("click", function () {
      dire(alerte, ""); creer.disabled = true;
      api("POST", "admin", { action: "creer_code", bonus: parseInt(bonus.input.value, 10), jours: parseInt(jours.input.value, 10), usages: parseInt(usages.input.value, 10) }, 10000).then(function (x) {
        creer.disabled = false; resultat.textContent = "";
        resultat.appendChild(el("p", { "class": "cle-lecteur", text: x.code }));
        resultat.appendChild(el("p", { "class": "meta", text: "+" + x.bonus + " par jour pendant " + pluriel(x.jours, "jour", "jours") + ", pour " + pluriel(x.usages, "personne", "personnes") + "." }));
        charger();
      }, function (e) { creer.disabled = false; dire(alerte, erreurCompte(e)); });
    });
    function charger() {
      api("GET", "admin?codes=1", null, 10000).then(function (j) {
        if (!vive()) return;
        liste.textContent = "";
        var ul = el("ul", { "class": "liste" });
        (j.codes || []).forEach(function (c) {
          var rev = el("button", { "class": "btn second petit", type: "button", text: "Révoquer" });
          rev.addEventListener("click", function () { rev.disabled = true; api("POST", "admin", { action: "revoquer_code", code: c.code }, 10000).then(function () { charger(); }, function (e) { rev.disabled = false; dire(alerte, erreurCompte(e)); }); });
          ul.appendChild(ligneAdmin(c.code + (c.revoque ? " · révoqué" : ""), "+" + c.bonus + " par jour · " + pluriel(c.jours, "jour", "jours") + " · " + c.usages + "/" + c.usagesMax + " utilisé" + (c.usages > 1 ? "s" : ""), c.revoque ? [] : [rev]));
        });
        liste.appendChild(el("h2", { text: "Codes créés" }));
        liste.appendChild((j.codes || []).length ? ul : el("p", { "class": "meta", text: "Aucun code pour l’instant." }));
      }, function (e) { if (vive()) dire(alerte, erreurCompte(e)); });
    }
    zone.appendChild(el("div", { "class": "pile" }, [ligneChamp(bonus), ligneChamp(jours), ligneChamp(usages), creer, resultat, alerte])); zone.appendChild(liste);
    charger();
    return zone;
  }
  /* Onglet Génération : compteurs, pause et reprise. Rafraîchi toutes les 15 secondes tant que l'onglet est ouvert. */
  function panneauGeneration(vive) {
    var corps = el("div", { "class": "pile ecart" }), alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    function compteur(valeur, libelle) { return el("div", {}, [el("strong", { text: String(valeur) }), el("span", { "class": "meta", text: libelle })]); }
    function agir(action, valeur) {
      alerte.hidden = true;
      var envoi = { action: action };
      if (valeur !== undefined) envoi.valeur = valeur;
      return api("POST", "admin", envoi, 15000).then(remplir, function (e) { alerte.textContent = messageErreur(e); alerte.hidden = false; });
    }
    function remplir(j) {
      var t = j.taches || {};
      corps.textContent = "";
      majCredit(j.credit);
      corps.appendChild(el("div", { "class": "pile serree" }, [
        el("p", { "class": "meta", role: "status", text: j.pause ? "La file est en pause" + N + ": rien n’est écrit." : "La file est active" + N + ": elle tourne la nuit (0 h à 6 h UTC)" + (j.jour ? " et en journée" : "") + ", 2 tâches toutes les 5 minutes, 300 par jour au plus." }),
        el("div", { "class": "chiffres-cles" }, [compteur((t.attente || 0) + (t.en_cours || 0), "En attente"), compteur(t.fait || 0, "Faites"), compteur(t.echec || 0, "Échecs")])]));
      var pause = el("button", { "class": j.pause ? "btn" : "btn second", type: "button", text: j.pause ? "Reprendre" : "Pause" });
      pause.addEventListener("click", function () { pause.disabled = true; agir(j.pause ? "reprendre" : "pause"); });
      var jour = el("button", { "class": "btn second", type: "button", text: "Travailler aussi en journée : " + (j.jour ? "oui" : "non") });
      jour.addEventListener("click", function () { jour.disabled = true; agir("jour", !j.jour); });
      var vider = el("button", { "class": "btn second", type: "button", text: "Vider la file d’attente" });
      vider.addEventListener("click", function () { if (window.confirm("Retirer les tâches en attente ou en échec" + F + "?")) agir("vider"); });
      corps.appendChild(el("div", { "class": "pile" }, [pause, jour, vider]));
      var d = j.derniereErreur;
      corps.appendChild(el("div", { "class": "pile serree" }, [
        el("p", { "class": "meta derniere-erreur", text: d ? "Dernière erreur" + N + ": " + (d.type === "module" ? "module " : "leçon ") + d.numero + " de " + d.parcours + " · " + d.erreur : "Aucune erreur pour l’instant." }),
        el("p", { "class": "meta", text: (j.recentes || []).map(function (r) { return r.type + " " + r.numero + " " + r.etat + (r.essais ? " (" + r.essais + " essai" + (r.essais > 1 ? "s" : "") + ")" : "") + (r.erreur ? " · " + r.erreur : ""); }).join(" — ") }),
        el("p", { "class": "meta", text: j.epuises && j.epuises.length ? "Fournisseurs épuisés ou écartés" + N + ": " + j.epuises.join(", ") + "." : "Aucun fournisseur épuisé connu." })]));
    }
    /* Bloc crédit : construit une fois (le champ garde ce qu'on tape pendant les rafraîchissements), seuls les textes changent. */
    var creditBandeau = el("div"), creditTexte = el("p", { "class": "meta" });
    var creditChamp = el("input", { "class": "champ", id: "credit-recharge", type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "10" });
    var creditOk = el("button", { "class": "btn second", type: "button", text: "Noter ma recharge" });
    creditOk.addEventListener("click", function () {
      var m = parseFloat(String(creditChamp.value).replace(",", "."));
      if (!(m > 0)) { alerte.textContent = "Indique un montant en dollars."; alerte.hidden = false; return; }
      creditOk.disabled = true; alerte.hidden = true;
      api("POST", "admin", { action: "credit", montant: m }, 15000).then(function () { creditChamp.value = ""; creditOk.disabled = false; return charger().then(remplir); }, function (e) { creditOk.disabled = false; alerte.textContent = messageErreur(e); alerte.hidden = false; });
    });
    var creditZone = el("div", { "class": "pile serree", hidden: "" }, [creditBandeau, creditTexte, ligneChamp({ label: el("label", { "for": "credit-recharge", text: "J’ai rechargé de … $" }), input: creditChamp }), creditOk]);
    function majCredit(c) {
      if (!c) return;
      creditZone.hidden = false; creditBandeau.textContent = "";
      var b = bandeauCredit(c, false); if (b) creditBandeau.appendChild(b);
      creditTexte.textContent = "Dépensé" + N + ": " + dollars(c.depense) + " · Restant" + N + ": " + dollars(c.restant);
    }
    function charger() { return api("GET", "admin", null, 10000); }
    charger().then(function (j) {
      if (!vive()) return;
      remplir(j);
      var minuterie = setInterval(function () {
        if (!vive() || !corps.isConnected) { clearInterval(minuterie); return; }
        charger().then(function (r) { if (vive() && corps.isConnected) remplir(r); }, function () { /* on réessaie au prochain tour */ });
      }, 15000);
    }, function (e) { if (vive()) { alerte.textContent = erreurCompte(e); alerte.hidden = false; } });
    return el("div", { "class": "pile" }, [creditZone, corps, alerte]);
  }
  /* Page admin : cinq onglets (Génération, Comptes, Codes, Signalements, Documents). Un 403 (compte plus admin) ramène à la saisie de la clé. */
  function vueAdmin() {
    if (!profil.compte) { montrer(erreurPage("Connecte‑toi à ton compte pour ouvrir l’espace admin.", "Espace admin"), "profil"); return; }
    if (profil.role !== "admin") return ecranCleAdmin();
    var vive = vivante(), choix = 0;
    var zone = el("div", { "class": "pile" }), onglets = el("div", { "class": "onglets quatre", role: "tablist", "aria-label": "Espace admin" });
    var boutons = [["Génération", panneauGeneration], ["Comptes", panneauComptes], ["Codes", panneauCodes], ["Signalements", panneauSignalements], ["Documents", panneauDocuments]].map(function (o, k) {
      var b = el("button", { type: "button", role: "tab", "aria-selected": k === 0 ? "true" : "false", text: o[0] });
      b.addEventListener("click", function () { afficher(k); });
      onglets.appendChild(b);
      return b;
    });
    function afficher(k) {
      choix += 1; var mien = choix;
      boutons.forEach(function (b, i) { b.setAttribute("aria-selected", i === k ? "true" : "false"); });
      zone.textContent = "";
      zone.appendChild([panneauGeneration, panneauComptes, panneauCodes, panneauSignalements, panneauDocuments][k](function () { return vive() && mien === choix; }));
    }
    montrer(el("div", { "class": "page" }, [
      el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/profil" }, [icone("retour"), "Profil"]), el("span"), puceXP()]),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Admin" }), el("h1", { text: "Espace admin" })]),
      onglets, zone]), "profil", "Espace admin");
    afficher(0);
  }

  /* Compte dans le Profil : mot de passe, déconnexion, code d'ami, suppression. */
  function sectionCompte() {
    var nomComplet = [profil.prenom, profil.nom].filter(Boolean).join(" ");
    var zone = el("section", { "class": "pile" }, [
      el("h2", { text: "Mon compte" }),
      el("p", { style: "font-size:16px", text: "Pseudo" + N + ": " + profil.pseudo + (nomComplet ? " · " + nomComplet : "") }),
      el("p", { "class": "meta", text: profil.google && profil.mdp === false ? "Tu te connectes avec Google." : "Progression enregistrée en ligne." })
    ]);
    if (profil.mdp !== false) {
      var ancien = champTexte("mdp-ancien", "Mot de passe actuel", { type: "password", autocomplete: "current-password" });
      var neuf = champTexte("mdp-neuf", "Nouveau mot de passe", { type: "password", autocomplete: "new-password" });
      var alM = alerteVide(), changer = el("button", { "class": "btn second", type: "button", text: "Changer le mot de passe" });
      changer.addEventListener("click", function () {
        dire(alM, "");
        if (neuf.input.value.length < 10) { dire(alM, "Le nouveau mot de passe doit avoir 10 caractères au moins."); return; }
        changer.disabled = true;
        api("POST", "compte", { action: "mdp", ancien: ancien.input.value, nouveau: neuf.input.value }, 25000).then(function () {
          ancien.input.value = ""; neuf.input.value = ""; changer.disabled = false; toast("Mot de passe changé. Tes autres appareils sont déconnectés.");
        }, function (e) { changer.disabled = false; dire(alM, erreurCompte(e)); });
      });
      zone.appendChild(el("details", { "class": "plier" }, [el("summary", { text: "Changer mon mot de passe" }), el("div", { "class": "pile" }, [ligneChamp(ancien), ligneChamp(neuf, "10 caractères au moins."), changer, alM])]));
    }
    // Code d'ami : des créations de plus par jour, pour un temps.
    var code = champTexte("code-ami", "Code d’ami", { autocapitalize: "off", autocomplete: "off", spellcheck: "false", maxlength: "40" });
    var alC = alerteVide(), utiliser = el("button", { "class": "btn second", type: "button", text: "Utiliser le code" });
    utiliser.addEventListener("click", function () {
      dire(alC, ""); if (!code.input.value.trim()) return;
      utiliser.disabled = true;
      api("POST", "compte", { action: "code", code: code.input.value }, 10000).then(function (r) {
        code.input.value = ""; utiliser.disabled = false; profil.bonus = r.total; S.ecrire("koios.profil", profil);
        toast("Code accepté" + N + ": +" + r.bonus + " créations par jour.");
        vueProfil();
      }, function (e) { utiliser.disabled = false; dire(alC, erreurCompte(e)); });
    });
    zone.appendChild(el("details", { "class": "plier" }, [el("summary", { text: "J’ai un code d’ami" }), el("div", { "class": "pile" }, [ligneChamp(code, profil.bonus ? "Bonus actif" + N + ": +" + profil.bonus + " créations par jour." : "Il donne quelques créations de plus par jour, pour un temps."), utiliser, alC])]));
    // Déconnexion.
    var sortir = el("button", { "class": "btn second", type: "button", text: "Me déconnecter" });
    sortir.addEventListener("click", function () { sortir.disabled = true; api("POST", "compte", { action: "deconnecter" }, 8000).then(oublierCompteLocal, oublierCompteLocal); });
    zone.appendChild(sortir);
    // Suppression : mot de passe (ou connexion Google) pour confirmer.
    var supprimer = el("div", { "class": "pile" }, [el("p", { "class": "meta", style: "font-size:16px", text: "Cela efface ton compte, ta progression, tes amitiés et tes demandes. Les formations que tu as créées restent, sans ton nom. C’est définitif." })]);
    var alS = alerteVide();
    function effacer(corps, bouton) {
      dire(alS, ""); if (bouton) bouton.disabled = true;
      api("POST", "compte", corps, 25000).then(oublierCompteLocal, function (e) { if (bouton) bouton.disabled = false; dire(alS, erreurCompte(e)); });
    }
    if (profil.mdp !== false) {
      var mdpS = champTexte("mdp-suppr", "Ton mot de passe", { type: "password", autocomplete: "current-password" });
      var effacerBtn = el("button", { "class": "btn second", type: "button", text: "Supprimer mon compte" });
      effacerBtn.addEventListener("click", function () { if (!mdpS.input.value) { dire(alS, "Écris ton mot de passe pour confirmer."); return; } if (window.confirm("Supprimer définitivement ton compte" + F + "?")) effacer({ action: "supprimer", mdp: mdpS.input.value }, effacerBtn); });
      supprimer.appendChild(ligneChamp(mdpS)); supprimer.appendChild(effacerBtn);
    } else {
      var zoneG = el("div", { "class": "pile google-zone" });
      supprimer.appendChild(el("p", { "class": "meta", text: "Confirme avec Google pour supprimer." })); supprimer.appendChild(zoneG);
      boutonGoogle(zoneG, function (jeton) { if (window.confirm("Supprimer définitivement ton compte" + F + "?")) effacer({ action: "supprimer", jeton: jeton }); });
    }
    supprimer.appendChild(alS);
    zone.appendChild(el("details", { "class": "plier" }, [el("summary", { text: "Supprimer mon compte" }), supprimer]));
    return zone;
  }
  /* Profil sans compte : un bandeau mène à la création du compte, qui garde la progression (seulement si le serveur répond). */
  function rangeeCompteSiServeur() {
    var slot = el("div", { hidden: "" });
    pretServeur.then(function () { if (serveur.base) { slot.appendChild(rangeeCompte()); slot.hidden = false; if (window.poserIcones) window.poserIcones(slot); } });
    return slot;
  }
  function rangeeCompte() {
    return el("ul", { "class": "liste" }, [el("li", {}, [el("a", { "class": "rangee", href: "#/compte" }, [tuile("profil"), el("span", {}, [el("b", { text: "Protège ta progression" }), el("span", { "class": "meta", text: "Crée ton compte" + N + ": tu gardes tout, sur tous tes appareils." })]), icone("chevron")])])]);
  }

  function vueProfil() {
    var n = niveau(etat.xp || 0);
    var paliers = Object.keys(etat.parcours).reduce(function (s, id) { return s + (etat.parcours[id].fait || 0); }, 0);
    var sujets = Object.keys(etat.parcours).filter(function (id) { return etat.parcours[id].fait > 0; }).length;
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", value: profil.pseudo || "" });
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
      bande([entete(), zoneCredit(),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Profil" }), el("h1", { text: profil.pseudo })]),
        el("div", { "class": "profil-niveau" }, [anneau, el("p", { "class": "meta", style: "text-align:center", text: (n.suivant - (etat.xp || 0)) + N + "XP avant le niveau " + (n.niveau + 1) + " · " + (etat.xp || 0) + N + "XP au total" })]),
        el("div", { "class": "chiffres-cles" }, [el("div", {}, [el("strong", { text: String(paliers) }), el("span", { "class": "meta", text: paliers > 1 ? "Leçons faites" : "Leçon faite" })]), el("div", {}, [el("strong", { text: String(sujets) }), el("span", { "class": "meta", text: sujets > 1 ? "Sujets suivis" : "Sujet suivi" })]), el("div", {}, [el("strong", { text: String(serieJours()) }), el("span", { "class": "meta", text: "Jours de suite" })])])], true),
      bande([
        etat.erreurs.length ? lienAvance("#/jeu/erreurs", "Revoir mes erreurs (" + etat.erreurs.length + ")", "btn") : etatVide("juste", "Aucune erreur à revoir pour l’instant.", lien("#/jeu/melange", "Faire un quiz mélangé", "btn second petit")),
        el("ul", { "class": "liste" }, [el("li", {}, [el("a", { "class": "rangee", href: "#/badges" }, [tuile("medaille"), el("span", {}, [el("b", { text: "Badges" }), el("span", { "class": "meta", text: L.calculerBadges(etat, aujourdhui()).filter(function (b) { return b.obtenu; }).length + " sur " + L.BADGES.length + " obtenus" })]), icone("chevron")])]), el("li", {}, [el("a", { "class": "rangee", href: "#/aide" }, [tuile("aide"), el("span", {}, [el("b", { text: "Comment ça marche" }), el("span", { "class": "meta", text: "Leçons, quiz, XP, sources et limites" })]), icone("chevron")])]), el("li", {}, [el("a", { "class": "rangee", href: "#/confidentialite" }, [tuile("verifie"), el("span", {}, [el("b", { text: "Confidentialité" }), el("span", { "class": "meta", text: "Ce qui est gardé et comment tout effacer" })]), icone("chevron")])])]),
        profil.compte ? sectionCompte() : el("section", { "class": "pile" }, [el("h2", { text: "Réglages" }), el("label", { "for": "pseudo", "class": "sur", text: "Nom affiché" }), champ, sync, cleZone]),
        profil.compte ? null : rangeeCompteSiServeur(),
        sectionCleIA(),
        sectionAdmin(),
        el("p", { "class": "credit", text: "Koîos · leçons vérifiées par la rédaction ou recoupées par deux IA à partir de sources ouvertes · photos Wikimédia Commons et Unsplash · icônes Phosphor (MIT)" })
      ], false)
    ]), "profil", "Profil");
    if (!profil.compte) { majSync(); pretServeur.then(majSync); }
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
        el("p", { text: "Tape un sujet. L’app écrit une formation complète, de zéro jusqu’au niveau expert, en 4 niveaux" + N + ": Novice, Intermédiaire, Avancé, Expert. Tout monte d’un seul mouvement, du débutant à l’expert." }),
        el("p", { text: "Le niveau Novice part de zéro, sans rien supposer. Chaque niveau a de 5 à 10 modules (6 à 10 pour Novice), donc de 21 à 40 modules en tout. Chaque module compte 6 à 10 leçons, une seule idée par leçon." }),
        el("p", { text: "Les modules s’ouvrent dans l’ordre et chacun s’appuie sur ceux d’avant. Tu peux relire toutes les leçons déjà faites depuis le sommaire." }),
        el("p", { text: "Si la formation existe déjà, elle s’ouvre, sans être réécrite. Cherche‑la dans la " + guill("Bibliothèque") + " ou en tapant ton sujet." })
      ]),
      rubriqueAide("sommaire", "La bibliothèque", [
        el("p", { text: "Sous la recherche de l’accueil, les " + guill("Formations existantes") + " apparaissent dès que tu écris 2 lettres. La page Bibliothèque les réunit toutes." }),
      ]),
      rubriqueAide("diamant", "Aller plus loin", [
        el("p", { text: "Quand tous les modules d’une formation sont ouverts, " + guill("Aller plus loin") + " apparaît en bas du sommaire et sur la page " + guill("Formation terminée") + ". L’IA écrit 3 à 5 modules de plus, dans un niveau " + guill("Maîtrise") + ", pour tout le monde." }),
        el("p", { text: "Il faut être connecté. Limite" + N + ": " + pluriel(LIMITES.prolonger, "formation prolongée", "formations prolongées") + " par jour et par personne, " + LIMITES.prolongerTotal + " pour tout le monde." })
      ]),
      rubriqueAide("livre", "Une leçon", [
        el("p", { text: "Une leçon réunit" + N + ":" }),
        listeAide([guill("Avant de commencer") + N + ": un rappel de ce que tu as déjà vu", "l’essentiel en bref", guill("À retenir"), "les explications" + N + ": comment, pourquoi, où et quand", "un exemple", "les définitions", "une frise ou des chiffres", "un moyen de s’en souvenir, quand il y en a un", guill("Tes cartes") + N + ": 2 à 4 cartes à retourner", "les sources, repliées sous " + guill("Sources") + ", à ouvrir si tu veux vérifier", "une question pour vérifier que tu as compris"]),
        el("p", { text: "Une seule façon d’apprendre" + N + ": la leçon. Chaque leçon commence par un rappel de la précédente et finit par ce que tu verras ensuite." }),
        el("p", { text: "Les mots déjà vus sont soulignés" + N + ": touche‑les pour revoir leur définition." }),
        el("p", { text: "Chaque module a sa " + guill("Fiche du module") + N + ": l’essentiel et les définitions des leçons que tu as faites, à relire d’un coup. Elle se construit sans IA." })
      ]),
      rubriqueAide("carnet", "Les cartes", [
        el("p", { text: "Chaque leçon donne 2 à 4 cartes. Touche une carte pour la retourner et voir la réponse." }),
        listeAide(["L’onglet " + guill("Cartes") + " d’une formation réunit les cartes des leçons faites. Tu peux filtrer par module.", guill("Réviser") + N + ": une carte à la fois. Tu retournes, puis tu touches " + guill("Je savais") + " ou " + guill("À revoir") + ".", "Chaque réponse compte dans la révision espacée (voir plus bas). Tes réponses sont gardées avec ta progression."])
      ]),
      rubriqueAide("cerveau", "La révision du jour", [
        el("p", { text: "Sur l’accueil, la tuile " + guill("À réviser aujourd’hui") + " réunit en une seule file les cartes des leçons que tu as vues et les questions que tu as ratées. Elle disparaît quand il n’y a rien à réviser." }),
        listeAide([
          "Une carte ou une question à la fois. Tu retournes, puis tu touches " + guill("Je savais") + " ou " + guill("À revoir") + ". Une séance compte 20 éléments au plus.",
          guill("Je savais") + " fait passer l’élément à la boîte suivante, qui revient plus tard" + N + ": après 1, 3, 7, 16 puis 35" + N + "jours (cinq boîtes). " + guill("À revoir") + " le remet en première boîte, à revoir demain.",
          "Une question ratée sort de ta liste d’erreurs quand elle atteint la troisième boîte.",
          ["Chaque bonne réponse rapporte ", gainAide(1), " au plus une fois par jour pour un même élément."]
        ]),
        el("p", { text: "Cette révision n’utilise pas l’IA et ne consomme aucune limite." })
      ]),
      rubriqueAide("medaille", "Série et badges", [
        el("p", { text: "Un jour compte dans ta série quand tu termines une leçon, une révision, un quiz ou la question du jour. La tuile " + guill("Série") + " montre les jours de suite et la semaine en cours." }),
        el("p", { text: "Les badges sont dans ton Profil. Chacun se calcule sur ce que tu as vraiment fait" + N + ": leçons terminées, premier module, niveau Novice, séries de 3, 7 et 30" + N + "jours, cartes révisées, premier duel ou salon, première partie en direct, 1" + F + "000" + N + "XP. Les badges obtenus sont en couleur, les autres en gris avec leur condition." })
      ]),
      rubriqueAide("carnet", "Le glossaire", [
        el("p", { text: "Dans chaque formation, l’onglet Glossaire réunit les mots définis dans les leçons déjà faites. Une recherche t’aide à retrouver un mot." })
      ]),
      rubriqueAide("trophee", "Quiz et défis", [
        listeAide(["Un quiz toutes les 5 leçons.", "Un grand quiz toutes les 10 leçons.", "Le quiz direct est toujours ouvert."]),
        el("p", { text: "Chaque réponse est expliquée, qu’elle soit juste ou fausse. Tes erreurs sont gardées pour être revues." })
      ]),
      rubriqueAide("liste", "Le quiz de culture générale", [
        el("p", { text: "Dans l’onglet Jouer, écris n’importe quel sujet ou choisis un thème. Tu peux aussi toucher " + guill("Surprends-moi") + "." }),
        listeAide(["Tu choisis 10, 20, 30, 40 ou 50 questions.", "Les questions s’écrivent par blocs de 10. Tu joues dès que le premier bloc est prêt\u202f; la suite arrive pendant que tu joues.", "Chaque réponse, juste ou fausse, est expliquée.", "Les questions viennent de Wikipédia en français et en anglais. Une deuxième IA, différente de la première, les vérifie\u202f; ce qu’elle ne confirme pas est retiré. Un bloc peut donc compter un peu moins de 10 questions.", [guill("Rejouer avec de nouvelles questions") + N + ": tu reçois d’autres questions sur le même sujet, jamais les mêmes."]]),
        el("p", { text: "Tu gagnes " + XP.quiz + N + "XP par bonne réponse, une seule fois par question." })
      ]),
      rubriqueAide("diplome", "L’XP", [
        el("p", { text: "Tu gagnes de l’XP en avançant" + N + ":" }),
        listeAide([["Une leçon terminée" + N + ": ", gainAide(XP.palier)], ["Une bonne réponse à la question de vérification d’une leçon" + N + ": ", gainAide(XP.verif)], ["Une bonne réponse de quiz" + N + ": ", gainAide(XP.quiz)], ["Une bonne réponse de grand quiz" + N + ": ", gainAide(XP.defi)], ["Une bonne réponse dans un mini‑jeu" + N + ": ", gainAide(XP.jeu * 2)], ["Un élément révisé juste dans la révision du jour" + N + ": ", gainAide(1)]]),
        el("p", { text: "Une mauvaise réponse ne rapporte rien. Une question ne rapporte de l’XP qu’une seule fois. Les niveaux demandent de plus en plus d’XP." })
      ]),
      rubriqueAide("verifie", "D’où viennent les informations", [
        el("p", { text: "Les formations au badge " + guill("Vérifié") + " portent cette note" + N + ": " + guill("Vérifié par la rédaction" + N + ": au moins deux sources indépendantes par notion, dont une institutionnelle ou savante.") }),
        el("p", { text: "Les autres formations sont rédigées par une IA, le plus souvent GLM, à partir d’extraits de Wikipédia en français et en anglais. Une deuxième IA, différente de la première, contrôle chaque affirmation contre ces extraits, y compris les rappels, l’exemple et les cartes. Ce qui n’est pas confirmé est retiré." }),
        listeAide([["Badge " + guill("Recoupé automatiquement") + N + ": la deuxième IA a tout confirmé."], ["Badge " + guill("Recoupé en partie") + N + ": des affirmations ont été retirées."]]),
        el("p", { text: "Il n’y a pas de relecture humaine pour ces formations. Garde un œil critique et consulte les sources en bas de chaque leçon." }),
        el("p", { text: "Les photos viennent de Wikimédia Commons ou d’Unsplash, avec leur crédit et leur licence." })
      ]),
      rubriqueAide("verifie", "Ton compte", [
        el("p", { text: "Un compte (pseudo et mot de passe) garde ta progression et te permet de te reconnecter sur un autre appareil. Le mot de passe compte 10 caractères au moins." }),
        listeAide([
          ["Phrase de secours" + N + ": 12 mots, montrés une seule fois à la création. Note‑les" + N + ": ils servent si tu oublies ton mot de passe."],
          ["Mot de passe oublié sans phrase" + N + ": un administrateur peut te donner un code temporaire de 24" + N + "heures."],
          ["Code d’ami" + N + ": un code reçu d’un administrateur augmente ta limite quotidienne de créations pendant quelques jours. Entre‑le dans ton Profil."],
          ["Tu peux changer ton mot de passe, te déconnecter ou supprimer ton compte à tout moment, depuis le Profil."]
        ]),
        el("p", { text: "Le détail de ce qui est gardé est dans la page " + guill("Confidentialité") + " du Profil." })
      ]),
      rubriqueAide("cercle", "Avec tes amis", [
        el("p", { text: "L’onglet Amis réunit ce qui se fait à plusieurs. L’onglet Jouer garde le quiz de culture générale, la question du jour, le quiz mélangé et les mini‑jeux." }),
        listeAide([
          ["Question du jour" + N + ": la même pour tous, sur un thème qui change chaque jour (cinéma, sport, sciences…). Elle compte, comme une leçon, une révision ou un quiz, dans ta série de jours."],
          ["Quiz mélangé" + N + ": 10 questions sur tous les sujets."],
          ["Salon" + N + ": un quiz de culture générale que tes amis jouent par un simple lien, sans limite de joueurs. Crée‑le depuis l’onglet Amis, ou touche " + guill("Défier des amis") + " à la fin d’un quiz. Le classement du salon compte " + XP.quiz + N + "points par bonne réponse."],
          ["Tournoi de la semaine" + N + ": 10 questions sur un thème qui change chaque semaine, une seule partie par joueur, du lundi 00" + N + "h au dimanche 23" + N + "h 59 (heure UTC). Ensuite le classement reste visible, mais les scores ne changent plus."],
          ["Duel" + N + ": lance‑le depuis l’onglet Défis d’un sujet ou depuis le quiz mélangé. Envoie le lien à un ami" + N + ": il a les mêmes questions que toi, et le tableau du duel compare vos scores."],
          ["Classement" + N + ": toi et tes amis, classés selon vos XP cumulés, dans l’onglet Amis."],
          ["Ajouter un ami" + N + ": par un lien d’invitation (WhatsApp), valable 7 jours, ou par son pseudo exact. L’autre accepte ou refuse. Il faut un compte."]
        ]),
        el("p", { text: "Les salons, les duels et le tournoi demandent la connexion en ligne." })
      ]),
      rubriqueAide("cercle", "Une formation à plusieurs", [
        el("p", { text: "Sur la page d’une formation, touche " + guill("Suivre à plusieurs") + ". Tu crées un groupe et tu envoies son lien à tes amis. Un groupe compte 12 membres au plus." }),
        listeAide([
          "Chacun suit la formation à son rythme. La page du groupe montre, pour chaque membre, les leçons faites, l’XP gagnée sur cette formation et sa dernière activité.",
          "Le classement du groupe compte d’abord les leçons faites, puis l’XP.",
          [guill("Continuer la formation") + N + ": tu reprends là où tu t’étais arrêté."],
          [guill("Défier le groupe") + N + ": un salon de 10 questions sur la formation, à envoyer au groupe."],
          [guill("Inviter") + N + ": le lien du groupe, par le menu de partage de ton téléphone ou copié."]
        ]),
        el("p", { text: "Seuls les pseudos sont visibles. Ta progression se met à jour quand tu ouvres la page du groupe." })
      ]),
      rubriqueAide("eclair", "Le jeu en direct", [
        el("p", { text: "Une partie où tout le monde répond en même temps, sur les mêmes questions." }),
        listeAide([
          "Pour en lancer une, ouvre un salon ou le tournoi et touche " + guill("Jouer en direct") + ". Tu reçois un code de 6 caractères et un lien.",
          "Tes amis entrent le code dans l’onglet Amis (" + guill("Rejoindre une partie") + ") ou ouvrent le lien. On rejoint avant le début seulement.",
          "Chaque question dure 20 secondes, puis 5 secondes de résultat avec la bonne réponse, l’explication et le classement provisoire.",
          ["Une bonne réponse rapporte " + 100 + " points, plus jusqu’à 50 points de bonus selon la rapidité. Une mauvaise réponse, ou pas de réponse, rapporte 0."],
          "À la fin, un podium et le classement final, à partager."
        ]),
        el("p", { text: "Jusqu’à 12 joueurs, mise à jour toutes les 2 secondes. L’écran interroge le serveur" + N + ": le résultat peut donc arriver avec un petit décalage. Une partie demande la connexion en ligne et s’efface après 24 heures." })
      ]),
      rubriqueAide("profil", "Ton compte", [
        el("p", { text: "Ta progression est gardée sur ton téléphone et synchronisée. La clé de connexion, dans le Profil, te permet de la retrouver sur un autre appareil. Garde‑la pour toi." })
      ]),
      rubriqueAide("sablier", "Limites", [
        el("p", { text: "Une leçon nouvelle peut prendre jusqu’à une minute la première fois. Ensuite elle s’ouvre tout de suite, pour tout le monde." }),
        el("p", { text: "Chaque jour, une personne peut lancer " + pluriel(LIMITES.formations, "nouvelle formation", "nouvelles formations") + ", " + pluriel(LIMITES.lecons, "nouvelle leçon", "nouvelles leçons") + ", " + pluriel(LIMITES.quizDirect, "nouveau quiz direct", "nouveaux quiz directs") + " et " + pluriel(LIMITES.blocs, "nouveau bloc de 10 questions", "nouveaux blocs de 10 questions") + " pour le quiz de culture générale. Tu peux aussi prolonger " + pluriel(LIMITES.prolonger, "formation", "formations") + " avec " + guill("Aller plus loin") + "." }),
        el("p", { text: "Pour tout le monde ensemble, la limite est de " + pluriel(LIMITES.formationsTotal, "nouvelle formation", "nouvelles formations") + ", " + pluriel(LIMITES.leconsTotal, "nouvelle leçon", "nouvelles leçons") + ", " + pluriel(LIMITES.blocsTotal, "nouveau bloc de questions", "nouveaux blocs de questions") + " et " + pluriel(LIMITES.prolongerTotal, "prolongement", "prolongements") + " par jour. Une fois ce plafond atteint, reviens le lendemain." }),
        el("p", { text: "Ce qui est déjà écrit reste ouvert pour tout le monde, sans compter dans ces limites. La question du jour et le tournoi sont écrits une seule fois pour tous et ne comptent pas dans tes limites." }),
        el("p", { text: "Jeu en direct" + N + ": jusqu’à 12 joueurs, mise à jour toutes les 2 secondes. Un groupe de formation compte aussi 12 membres au plus." }),
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
  /* ---------- Lot 7 : signalement, test et certificat de fin de niveau, voix, dossier de voyage, hors ligne ---------- */

  /* « Poser une question » sous la leçon : bouton secondaire qui déplie un champ de 200 caractères. La réponse (3 à 5 phrases, tirée de la leçon
     et de ses sources, recoupée par une autre IA) s'affiche en carte. La question reste une donnée : le texte est inséré avec textContent. */
  function blocQuestion(p, n) {
    var declencheur = el("button", { "class": "btn second", type: "button", "aria-expanded": "false", "aria-controls": "question-panneau" }, [icone("aide"), el("span", { text: "Poser une question" })]);
    var panneau = el("form", { "class": "pile serree", id: "question-panneau", hidden: "", novalidate: "" });
    var etiquette = el("label", { "class": "meta", "for": "question-champ", text: "Ta question sur cette leçon" });
    var champ = el("input", { "class": "champ", id: "question-champ", type: "text", maxlength: "200", autocomplete: "off", placeholder: "Une question sur cette leçon", "aria-describedby": "question-compteur" });
    var compteur = el("p", { "class": "meta", id: "question-compteur", text: "0" + N + "/" + N + "200" });
    var envoyer = el("button", { "class": "btn second", type: "submit" }, [el("span", { text: "Envoyer la question" })]);
    var alerte = alerteVide();
    /* Zone annoncée : visible et vide au départ (une région vivante doit exister avant d'être remplie). La carte s'y glisse avec la réponse. */
    var zone = el("div", { role: "status", "aria-live": "polite" });
    declencheur.addEventListener("click", function () {
      var ouvre = panneau.hidden;
      panneau.hidden = !ouvre; declencheur.setAttribute("aria-expanded", ouvre ? "true" : "false");
      if (ouvre) champ.focus();
    });
    champ.addEventListener("input", function () { compteur.textContent = champ.value.length + N + "/" + N + "200"; });
    panneau.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (envoyer.disabled) return;
      var q = champ.value.trim();
      if (q.length < 5) { dire(alerte, "Écris ta question en quelques mots."); return; }
      if (!enLigne()) { dire(alerte, "Connecte-toi à ton compte pour poser une question."); return; }
      dire(alerte, ""); zone.textContent = ""; envoyer.disabled = true; envoyer.firstChild.textContent = "Le Rival cherche…";
      api("POST", "question", { parcours: p.id, numero: n, question: q }, 100000).then(function (r) {
        envoyer.disabled = false; envoyer.firstChild.textContent = "Envoyer la question";
        var carte = el("div", { "class": "carte", tabindex: "-1" });
        carte.appendChild(el("p", { "class": "meta", text: "Ta question" }));
        carte.appendChild(el("p", { text: q }));
        carte.appendChild(el("p", { "class": "meta", text: "Réponse du Rival" }));
        carte.appendChild(el("p", { text: r.reponse }));
        if (r.trouve) carte.appendChild(el("p", { "class": "meta", text: "Tirée de la leçon et de ses sources, recoupée par une autre IA." }));
        zone.appendChild(carte);
        carte.focus();
      }, function (e) {
        envoyer.disabled = false; envoyer.firstChild.textContent = "Envoyer la question";
        /* 429 : on affiche le message du serveur (quota du compte ou plafond de tout le monde), qui dit déjà lequel des deux. */
        dire(alerte, typo(e.statut === 429 && e.message ? e.message : messageErreur(e, "Tu as posé toutes tes questions du jour. Réessaie demain.")));
      });
    });
    [etiquette, champ, compteur, envoyer, alerte, zone].forEach(function (x) { panneau.appendChild(x); });
    return el("section", { "class": "question pile serree" }, [declencheur, panneau]);
  }

  /* Signaler une erreur dans une leçon : lien discret en bas de la leçon, qui déplie un motif et un champ court. 5 par jour et par compte ;
     trois joueurs différents sur la même leçon la mettent en file de réécriture (côté serveur). */
  function blocSignalement(p, n) {
    var motif = "fait";
    var declencheur = el("button", { "class": "lien discret", type: "button", "aria-expanded": "false", "aria-controls": "signal-panneau" }, [icone("aide"), "Signaler une erreur dans cette leçon"]);
    var panneau = el("div", { "class": "pile", id: "signal-panneau", hidden: "" });
    var seg = el("div", { "class": "onglets trois", role: "radiogroup", "aria-label": "Motif du signalement" });
    [["fait", "Erreur de fait"], ["pas_clair", "Pas clair"], ["autre", "Autre"]].forEach(function (c) {
      var b = el("button", { type: "button", role: "radio", "aria-checked": c[0] === motif ? "true" : "false", text: c[1] });
      b.addEventListener("click", function () { motif = c[0]; seg.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); }); });
      seg.appendChild(b);
    });
    var champ = el("textarea", { "class": "champ", id: "signal-message", maxlength: "300", rows: "3", placeholder: "Dis en quelques mots ce qui ne va pas.", "aria-label": "Message du signalement (300 caractères au plus)" });
    var envoyer = el("button", { "class": "btn second", type: "button" }, [el("span", { text: "Envoyer le signalement" })]);
    var alerte = alerteVide(), merci = el("p", { "class": "meta", role: "status", hidden: "" });
    declencheur.addEventListener("click", function () {
      var ouvre = panneau.hidden;
      panneau.hidden = !ouvre; declencheur.setAttribute("aria-expanded", ouvre ? "true" : "false");
      if (ouvre) champ.focus();
    });
    envoyer.addEventListener("click", function () {
      var texte = champ.value.trim();
      if (motif === "autre" && texte.length < 3) { dire(alerte, "Dis en quelques mots ce qui ne va pas."); return; }
      dire(alerte, ""); envoyer.disabled = true;
      api("POST", "signalement", { type: "lecon", parcours: p.id, numero: n, motif: motif, message: texte }, 15000).then(function () {
        panneau.hidden = true; declencheur.hidden = true;
        merci.textContent = "Merci. Ta remarque est transmise."; merci.hidden = false;
      }, function (e) {
        envoyer.disabled = false;
        if (e.statut === 409) { panneau.hidden = true; declencheur.hidden = true; merci.textContent = "Tu as déjà signalé cette leçon. Merci."; merci.hidden = false; return; }
        dire(alerte, e.statut === 429 ? "Tu as fait " + pluriel(LIMITES.signalements, "signalement", "signalements") + " aujourd’hui. Réessaie demain." : messageErreur(e));
      });
    });
    panneau.appendChild(el("p", { "class": "meta", text: "Qu’est-ce qui ne va pas" + F + "?" }));
    [seg, champ, envoyer, alerte].forEach(function (x) { panneau.appendChild(x); });
    return el("section", { "class": "signal pile serree" }, [declencheur, panneau, merci]);
  }

  /* Lecture à voix haute (speechSynthesis) : sections et « À retenir » de la leçon, voix française si le navigateur en a une. Rien ne part vers un
     serveur. La pause arrête la lecture au morceau en cours et la reprend de là (plus fiable que pause/resume selon les navigateurs). */
  var arretVoix = null;
  function voixFrancaise() {
    var v = window.speechSynthesis.getVoices() || [], i;
    for (i = 0; i < v.length; i++) if (/^fr[-_]FR/i.test(v[i].lang)) return v[i];
    for (i = 0; i < v.length; i++) if (/^fr/i.test(v[i].lang)) return v[i];
    return null;
  }
  /* sources : fonction qui rend les noeuds à lire, dans l'ordre (sections visibles et « À retenir »). */
  function lecteurVoix(sources) {
    var synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance !== "function") return null;
    var segments = [], courant = 0, mode = "arret", jeton = 0;
    var statut = el("p", { "class": "meta", role: "status", hidden: "" });
    var lire = el("button", { "class": "btn second petit", type: "button", text: "Écouter la leçon" });
    var pause = el("button", { "class": "btn second petit", type: "button", text: "Pause", hidden: "" });
    var arret = el("button", { "class": "btn second petit", type: "button", text: "Arrêter", hidden: "" });
    function afficher() {
      lire.hidden = mode !== "arret"; pause.hidden = mode === "arret"; arret.hidden = mode === "arret";
      pause.textContent = mode === "pause" ? "Reprendre" : "Pause";
      statut.hidden = mode === "arret";
      statut.textContent = mode === "pause" ? "En pause" : "Lecture en cours";
    }
    function dire1(k) {
      if (k >= segments.length) { mode = "arret"; courant = 0; afficher(); return; }
      courant = k;
      var mien = jeton, u = new window.SpeechSynthesisUtterance(segments[k]);
      u.lang = "fr-FR";
      var v = voixFrancaise(); if (v) u.voice = v;
      u.onend = function () { if (mode === "lecture" && mien === jeton) dire1(k + 1); };
      u.onerror = function (e) { if (mien === jeton && e && e.error !== "canceled" && e.error !== "interrupted") { mode = "arret"; afficher(); } };
      synth.speak(u);
    }
    function demarrer(k) { jeton += 1; synth.cancel(); mode = "lecture"; afficher(); setTimeout(function () { dire1(k); }, 60); }
    function arreter() { jeton += 1; mode = "arret"; courant = 0; try { synth.cancel(); } catch (e) { /* rien à arrêter */ } afficher(); }
    lire.addEventListener("click", function () {
      var parties = [];
      sources().forEach(function (noeud) {
        var h = noeud.querySelector("h2"), morceaux = [];
        Array.prototype.forEach.call(noeud.querySelectorAll("p, li"), function (x) { morceaux.push(x.textContent.replace(/\s+/g, " ").trim()); });
        parties.push({ titre: h ? h.textContent : "", texte: morceaux.filter(Boolean).join(" ") });
      });
      segments = L.segmentsVoix(parties, 200);
      if (!segments.length) { statut.hidden = false; statut.textContent = "Rien à lire pour l’instant."; return; }
      demarrer(0);
      pause.focus(); // « Écouter la leçon » se cache : le focus passe à « Pause » (déjà visible, demarrer a appelé afficher)
    });
    pause.addEventListener("click", function () {
      if (mode === "lecture") { jeton += 1; mode = "pause"; synth.cancel(); afficher(); } else if (mode === "pause") demarrer(courant);
    });
    arret.addEventListener("click", arreter);
    if (arretVoix) arretVoix();
    arretVoix = arreter;
    return el("div", { "class": "voix pile serree", role: "group", "aria-label": "Lecture à voix haute" }, [el("div", { "class": "voix-boutons" }, [lire, pause, arret]), statut]);
  }

  /* Charge des leçons déjà écrites (aucune IA), quatre à la fois. Renvoie { lecons (dans l'ordre), manquantes }. */
  function chargerLecons(id, numeros, progres) {
    var res = new Array(numeros.length), suivant = 0, fini = 0;
    return new Promise(function (resolu) {
      if (!numeros.length) { resolu({ lecons: [], manquantes: 0 }); return; }
      function un() {
        if (suivant >= numeros.length) return;
        var i = suivant++;
        chargerPalier(id, numeros[i]).then(function (l) { res[i] = l || null; }, function () { res[i] = null; }).then(function () {
          fini += 1; if (progres) progres(fini, numeros.length);
          if (fini === numeros.length) { var bonnes = res.filter(Boolean); resolu({ lecons: bonnes, manquantes: numeros.length - bonnes.length }); } else un();
        });
      }
      for (var k = 0; k < Math.min(4, numeros.length); k++) un();
    });
  }
  function niveauDe(p, num) { return parProgramme(p) && !p.verifie ? p.programme.niveaux.filter(function (x) { return x.numero === num; })[0] || null : null; }
  function enteteRetour(href, libelle) { return el("div", { "class": "barre-haut no-print", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: href }, [icone("retour"), libelle]), el("span"), puceXP()]); }

  /* Bloc « Test de fin de niveau » sous les modules d'un niveau fini : passer ou refaire le test, et le certificat une fois le test réussi. */
  function blocTestNiveau(p, s, niv) {
    var t = (s.tests || {})[niv.numero], reussi = L.testReussi(s, niv.numero), base = "#/p/" + encodeURIComponent(p.id);
    var phrase = reussi ? "Réussi" + N + ": " + t.justes + " sur " + t.n + " (" + t.pct + F + "%)." : t ? "Pas encore réussi. Meilleur score" + N + ": " + t.pct + F + "%." : L.TEST_QUESTIONS + " questions tirées de tes leçons, sans IA. Réussite à " + L.TEST_SEUIL + F + "%. Le niveau suivant reste ouvert.";
    return el("div", { "class": "test-niveau pile serree" }, [
      el("h3", {}, [icone("diplome"), "Test de fin de niveau"]),
      el("p", { "class": "meta", text: phrase }),
      lienAvance(base + "/test/" + niv.numero, reussi ? "Refaire le test" : "Passer le test", "btn second"),
      reussi ? lien("#/certificat/" + encodeURIComponent(p.id) + "/" + niv.numero, "Voir mon certificat", "lien") : null]);
  }

  /* Test de fin de niveau : 15 questions tirées par programme des questions déjà écrites dans les leçons du niveau. Réussite à 70 %. Ni XP ni IA. */
  function vueTestNiveau(id, num) {
    var vive = vivante();
    montrer(attente("Préparation du test…", true), null, "Test de niveau");
    chargerParcours(id).then(function (p) {
      if (!vive()) return null;
      var niv = niveauDe(p, num), base = "#/p/" + encodeURIComponent(p.id), s = suivi(p.id);
      if (!niv) { montrer(erreurPage("Ce niveau n’existe pas dans cette formation.", "Test indisponible"), "accueil"); return null; }
      if (!L.niveauFini(p, niv, s.fait)) {
        montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [el("p", { "class": "verrou" }, [icone("cadenas"), "Le test s’ouvre quand tu as fini toutes les leçons du niveau " + num + "."]), lien(base, "Retour à la formation", "btn")])]), "accueil", "Test de niveau");
        return null;
      }
      return chargerLecons(p.id, L.leconsDuNiveau(p, niv)).then(function (r) {
        if (!vive()) return;
        var items = L.tirerTest(r.lecons, L.TEST_QUESTIONS);
        if (items.length < L.TEST_MIN) { montrer(erreurPage("Pas assez de questions dans les leçons de ce niveau pour un test. Réessaie plus tard.", "Test indisponible"), "accueil"); return; }
        var titre = "Test · " + niv.titre;
        montrer(quiz(items, {
          titre: titre, retour: base, xp: 0, sansXp: true, parcours: p.id,
          verdict: function (pct) { return pct >= L.TEST_SEUIL ? "Test réussi" : "Pas encore"; },
          fin: function (res, zone) {
            var r2 = L.resultatTest(res.justes, res.n), s2 = suivi(p.id);
            s2.tests = s2.tests || {};
            s2.tests[num] = L.majTest(s2.tests[num], r2, aujourdhui());
            etat.parcours[p.id] = s2; sauver();
            zone.appendChild(el("p", { "class": "verrou" }, [icone(r2.ok ? "diplome" : "liste"), r2.ok ? "Réussi" + N + ": " + r2.justes + " sur " + r2.n + " (" + r2.pct + F + "%). Ton certificat est prêt." : "Il faut " + L.TEST_SEUIL + F + "% pour réussir. Tu as " + r2.pct + F + "%. Revois les leçons, puis refais le test."]));
            if (r2.ok) zone.appendChild(lienAvance("#/certificat/" + encodeURIComponent(p.id) + "/" + num, "Voir mon certificat", "btn"));
            else {
              var encore = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Refaire le test" }), icone("fleche")]);
              encore.addEventListener("click", function () { vueTestNiveau(id, num); });
              zone.appendChild(encore);
            }
            zone.appendChild(lien(base, "Retour à la formation"));
            if (window.poserIcones) window.poserIcones(zone);
          }
        }), null, titre);
      });
    }).then(null, function (e) { if (vive()) montrer(erreurPage(e.statut === 404 ? "Cette formation n’existe pas encore." : messageErreur(e), "Test indisponible"), "accueil"); });
  }

  /* Certificat de fin de niveau : page imprimable (window.print, CSS @media print). Exige le test réussi. Pas un diplôme, et la page le dit. */
  function vueCertificat(id, num) {
    var vive = vivante();
    montrer(attente("Ouverture du certificat…"), null, "Certificat");
    chargerParcours(id).then(function (p) {
      if (!vive()) return;
      var niv = niveauDe(p, num), base = "#/p/" + encodeURIComponent(p.id), s = suivi(p.id);
      if (!niv) { montrer(erreurPage("Ce niveau n’existe pas dans cette formation.", "Certificat indisponible"), "accueil"); return; }
      if (!L.testReussi(s, num)) {
        var pret = L.niveauFini(p, niv, s.fait);
        montrer(el("div", { "class": "page" }, [entete(), el("div", { "class": "pile" }, [
          el("p", { "class": "verrou" }, [icone("cadenas"), "Le certificat s’obtient en réussissant le test de fin de niveau (" + L.TEST_SEUIL + F + "% au moins)."]),
          pret ? lienAvance(base + "/test/" + num, "Passer le test", "btn") : lien(base, "Retour à la formation", "btn")])]), "accueil", "Certificat");
        return;
      }
      var t = s.tests[num], nom = [profil.prenom, profil.nom].filter(Boolean).join(" ") || profil.pseudo;
      var imprimer = el("button", { "class": "btn no-print", type: "button" }, [icone("liste"), el("span", { text: "Imprimer / Enregistrer en PDF" })]);
      imprimer.addEventListener("click", function () { window.print(); });
      montrer(el("div", { "class": "page certificat-page " + teinteSujet(p.titre) }, [
        enteteRetour(base, "Formation"),
        el("article", { "class": "certificat pile", "aria-label": "Attestation de suivi" }, [
          el("div", { "class": "certificat-marque" }, [marque(true)]),
          el("span", { "class": "sur", text: "Attestation de suivi" }),
          el("h1", { text: nom }),
          el("p", { "class": "certificat-texte", text: "a terminé le niveau " + niv.numero + N + ": " + niv.titre + ", de la formation" }),
          el("h2", { "class": "certificat-formation", text: p.titre }),
          el("div", { "class": "certificat-score" }, [el("strong", { text: t.pct + F + "%" }), el("span", { "class": "meta", text: "Test de fin de niveau" + N + ": " + t.justes + " bonnes réponses sur " + t.n })]),
          el("p", { "class": "certificat-date", text: L.dateLongue(t.date) ? "Le " + L.dateLongue(t.date) : "" }),
          el("p", { "class": "certificat-mention", text: "Attestation de suivi Koîos, pas un diplôme." }),
          el("p", { "class": "meta", text: "Elle est établie d’après tes réponses au test, sans vérification d’identité." })]),
        imprimer
      ]), null, "Certificat · " + niv.titre);
    }, function (e) { if (vive()) montrer(erreurPage(e.statut === 404 ? "Cette formation n’existe pas encore." : messageErreur(e), "Certificat indisponible"), "accueil"); });
  }

  /* Dossier de voyage : toutes les leçons lues d'une formation (titres, « À retenir », définitions, cartes) en un document imprimable. */
  function vueDossier(id) {
    var vive = vivante();
    montrer(attente("Rassemblement des leçons…"), null, "Dossier de voyage");
    chargerParcours(id).then(function (p) {
      if (!vive()) return;
      var base = "#/p/" + encodeURIComponent(p.id), s = suivi(p.id), faites = [], k;
      for (k = 1; k <= (s.fait || 0); k++) faites.push(k);
      if (p.verifie || !faites.length) {
        montrer(el("div", { "class": "page" }, [enteteRetour(base, "Formation"), etatVide("carnet", "Le dossier se remplit avec les leçons que tu as lues. Fais une première leçon.", lienAvance(base + "/" + ((s.fait || 0) + 1), "Commencer", "btn second petit"))]), null, "Dossier de voyage");
        return;
      }
      var etatChargement = el("p", { "class": "attente", role: "status", text: "Rassemblement des leçons… 0 sur " + faites.length });
      montrer(el("div", { "class": "page" }, [enteteRetour(base, "Formation"), etatChargement]), null, "Dossier de voyage");
      chargerLecons(p.id, faites, function (a, b) { if (etatChargement.isConnected) etatChargement.textContent = "Rassemblement des leçons… " + a + " sur " + b; }).then(function (r) {
        if (!vive()) return;
        var doc = el("div", { "class": "dossier pile" }), niveauCourant = null, moduleCourant = null;
        r.lecons.forEach(function (l) {
          if (l.niveau && l.niveau.numero !== niveauCourant) { niveauCourant = l.niveau.numero; moduleCourant = null; doc.appendChild(el("p", { "class": "sur dossier-niveau", text: "Niveau " + l.niveau.numero + " · " + l.niveau.titre })); }
          if (l.module && l.module.numero !== moduleCourant) { moduleCourant = l.module.numero; doc.appendChild(el("h2", { "class": "dossier-module", text: "Module " + l.module.numero + " · " + l.module.titre })); }
          var bloc = el("section", { "class": "dossier-lecon pile serree" }, [el("h3", { text: "Leçon " + l.numero + " · " + l.titre })]);
          var retenir = (l.aRetenir || []).filter(function (t) { return typeof t === "string" && t; });
          if (retenir.length) bloc.appendChild(el("div", { "class": "retenir pile serree" }, [titreSection("À retenir", "epingle"), listeRetenir(retenir)]));
          var defs = (l.definitions || []).filter(function (d) { return d && d.terme && d.definition; });
          if (defs.length) {
            var dl = el("dl", { "class": "dossier-defs" });
            defs.forEach(function (d) { dl.appendChild(el("div", {}, [el("dt", { text: d.terme }), el("dd", { text: d.definition })])); });
            bloc.appendChild(el("div", { "class": "pile serree" }, [el("h4", { text: "Définitions" }), dl]));
          }
          var cartes = (l.cartes || []).filter(function (c) { return c && typeof c.recto === "string" && typeof c.verso === "string"; });
          if (cartes.length) {
            var ul = el("ul", { "class": "dossier-cartes" });
            cartes.forEach(function (c) { ul.appendChild(el("li", {}, [el("b", { text: c.recto }), el("span", { text: c.verso })])); });
            bloc.appendChild(el("div", { "class": "pile serree" }, [el("h4", { text: "Cartes" }), ul]));
          }
          doc.appendChild(bloc);
        });
        var imprimer = el("button", { "class": "btn no-print", type: "button" }, [icone("liste"), el("span", { text: "Imprimer / Enregistrer en PDF" })]);
        imprimer.addEventListener("click", function () { window.print(); });
        var date = L.dateLongue(aujourdhui());
        montrer(el("div", { "class": "page dossier-page " + teinteSujet(p.titre) }, [
          enteteRetour(base, "Formation"),
          el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Dossier de voyage" }), el("h1", { text: p.titre }),
            el("p", { "class": "meta", text: pluriel(r.lecons.length, "leçon lue", "leçons lues") + (date ? " · " + date : "") })]),
          r.manquantes ? el("p", { "class": "alerte no-print", role: "status", text: pluriel(r.manquantes, "leçon n’a pas pu être chargée", "leçons n’ont pas pu être chargées") + " (hors ligne" + F + "?). Ouvre-la une fois en ligne." }) : null,
          imprimer, doc
        ]), null, "Dossier · " + p.titre);
      });
    }, function (e) { if (vive()) montrer(erreurPage(e.statut === 404 ? "Cette formation n’existe pas encore." : messageErreur(e), "Dossier indisponible"), "accueil"); });
  }

  /* Admin, onglet « Signalements » : leçons signalées par des lecteurs (les plus signalées d'abord), avec « Ignorer ». */
  function panneauSignalements(vive) {
    var zone = el("div", { "class": "pile" }), liste = el("div", { "class": "pile serree" }), alerte = alerteVide();
    function rendre(j) {
      liste.textContent = "";
      var ul = el("ul", { "class": "liste" });
      (j.lecons || []).forEach(function (x) {
        var motifs = [];
        if (x.motifs.fait) motifs.push(pluriel(x.motifs.fait, "erreur de fait", "erreurs de fait"));
        if (x.motifs.pas_clair) motifs.push(x.motifs.pas_clair + N + "pas clair");
        if (x.motifs.autre) motifs.push(x.motifs.autre + N + "autre");
        var ign = el("button", { "class": "btn second petit", type: "button", text: "Ignorer" });
        ign.addEventListener("click", function () {
          ign.disabled = true;
          api("POST", "admin", { action: "ignorer_signalements", parcours: x.parcours, numero: x.numero }, 10000).then(function (j2) { if (vive()) rendre(j2); }, function (e) { ign.disabled = false; dire(alerte, erreurCompte(e)); });
        });
        var li = ligneAdmin((x.titre || "Leçon " + x.numero) + " · leçon " + x.numero,
          (x.formation ? x.formation + " · " : "") + pluriel(x.joueurs, "joueur", "joueurs") + " · " + motifs.join(", ") + (x.enFile ? " · réécriture en file" : ""), [ign]);
        (x.messages || []).forEach(function (m) { li.appendChild(el("p", { "class": "meta", text: guill(m) })); });
        ul.appendChild(li);
      });
      liste.appendChild(el("h2", { text: "Leçons signalées" }));
      liste.appendChild((j.lecons || []).length ? ul : el("p", { "class": "meta", text: "Aucun signalement pour l’instant." }));
      liste.appendChild(el("p", { "class": "meta", text: "Trois joueurs différents sur la même leçon la mettent en file de réécriture." }));
    }
    api("GET", "admin?signalements=1", null, 10000).then(function (j) { if (vive()) rendre(j); }, function (e) { if (vive()) dire(alerte, erreurCompte(e)); });
    zone.appendChild(alerte); zone.appendChild(liste);
    return zone;
  }

  /* Admin, onglet « Documents » (lot 10A) : PDF de référence des leçons. Le texte est extrait ICI, dans le navigateur, avec pdf.js (cdnjs, version
     épinglée, chargé seulement à l'ajout), puis envoyé par paquets de 50 ko ; le serveur découpe et indexe. Un PDF d'images n'a pas de texte : on le dit. */
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  var chargementPdf = null;
  function chargerPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!chargementPdf) chargementPdf = new Promise(function (ok, ko) {
      var sc = document.createElement("script"); sc.src = PDFJS + "pdf.min.js"; sc.async = true;
      sc.onload = function () { if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; ok(window.pdfjsLib); } else { chargementPdf = null; ko(new Error("pdf.js indisponible")); } };
      sc.onerror = function () { chargementPdf = null; ko(new Error("Impossible de charger pdf.js. Vérifie ta connexion.")); };
      document.head.appendChild(sc);
    });
    return chargementPdf;
  }
  /* Texte d'une page : lignes par `hasEOL`, ligne vide quand l'écart vertical dépasse une ligne et demie (paragraphe). */
  function textePagePdf(contenu) {
    var out = "", y = null;
    contenu.items.forEach(function (it) {
      if (typeof it.str !== "string") return;
      var yi = it.transform ? it.transform[5] : null, h = it.height || 10;
      if (y !== null && yi !== null && Math.abs(y - yi) > h * 1.6 && out && !/\n$/.test(out)) out += "\n\n";
      out += it.str + (it.hasEOL ? "\n" : "");
      if (yi !== null && it.str.trim()) y = yi;
    });
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  /* Pages -> paquets d'environ 50 000 caractères (une page trop longue est coupée, même numéro). */
  function paquetsDePages(pages) {
    var paquets = [], cur = [], n = 0, MAXP = 50000;
    pages.forEach(function (p) {
      var t = p.texte;
      while (t.length) {
        var part = t.slice(0, MAXP); t = t.slice(MAXP);
        if (n + part.length > MAXP && cur.length) { paquets.push(cur); cur = []; n = 0; }
        cur.push({ page: p.page, texte: part }); n += part.length;
      }
    });
    if (cur.length) paquets.push(cur);
    return paquets;
  }
  function titreDeFichier(nom) { return nom.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim(); }
  function octetsLisibles(o) { return o >= 1048576 ? (o / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(o / 1024)) + " ko"; }
  function panneauDocuments(vive) {
    var zone = el("div", { "class": "pile" }), liste = el("div", { "class": "pile serree" }), alerte = alerteVide(), bilan = el("ul", { "class": "liste", hidden: "" });
    var fichiers = el("input", { type: "file", id: "doc-fichiers", accept: "application/pdf,.pdf", multiple: "", "class": "champ" });
    var formation = champTexte("doc-formation", "Formation liée (identifiant, vide = tout sujet)", { autocapitalize: "off", spellcheck: "false", placeholder: "gemmologie-et-joaillerie" });
    var editeur = champTexte("doc-editeur", "Éditeur affiché dans les sources", { placeholder: "Institut National de Gemmologie" });
    var niveau = el("select", { "class": "champ", id: "doc-niveau" }, [["", "Tous les niveaux"], ["1", "Niveau 1 et plus"], ["2", "Niveau 2 et plus"], ["3", "Niveau 3 et plus"], ["4", "Niveau 4 seulement"]].map(function (o) { return el("option", { value: o[0], text: o[1] }); }));
    var ajouter = el("button", { "class": "btn", type: "button" }, [el("span", { text: "Ajouter les PDF" }), icone("fleche")]);
    var barre = el("div", { "class": "barre-det", hidden: "", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, [el("i")]);
    var etatEnvoi = el("p", { "class": "meta", role: "status", hidden: "" });
    function progres(f, texte) { barre.hidden = false; barre.firstChild.style.transform = "scaleX(" + f + ")"; barre.setAttribute("aria-valuenow", String(Math.round(f * 100))); if (texte) { etatEnvoi.textContent = texte; etatEnvoi.hidden = false; } }
    function note(texte, ok) { bilan.hidden = false; bilan.appendChild(el("li", {}, [el("span", { "class": ok ? "meta" : "alerte", text: texte })])); }
    function envoyer() {
      var fs = Array.prototype.slice.call(fichiers.files || []);
      dire(alerte, ""); bilan.textContent = ""; bilan.hidden = true;
      if (!fs.length) { dire(alerte, "Choisis d’abord un ou plusieurs PDF."); return; }
      ajouter.disabled = true;
      var ids = formation.input.value.trim(), niv = niveau.value ? parseInt(niveau.value, 10) : null, ed = editeur.input.value.trim();
      chargerPdfJs().then(function (pdfjs) {
        var k = 0;
        function suivant() {
          if (k >= fs.length) return Promise.resolve();
          var f = fs[k], rang = k; k += 1;
          progres(rang / fs.length, f.name + " : lecture du PDF…");
          return f.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: buf }).promise; }).then(function (pdf) {
            var pages = [], i = 0;
            function page() {
              if (i >= pdf.numPages) return Promise.resolve();
              i += 1; var num = i;
              progres((rang + (num / pdf.numPages) * 0.5) / fs.length, f.name + " : page " + num + " sur " + pdf.numPages);
              return pdf.getPage(num).then(function (p) { return p.getTextContent(); }).then(function (c) { var t = textePagePdf(c); if (t) pages.push({ page: num, texte: t }); return page(); });
            }
            return page().then(function () {
              if (!pages.length) { note(f.name + " : pas de texte extractible (PDF fait d’images). Rien n’a été ajouté.", false); return null; }
              var paquets = paquetsDePages(pages), id = null, j = 0, morceaux = 0;
              function paquet() {
                if (j >= paquets.length) return Promise.resolve();
                var corps = id ? { id: id, pages: paquets[j] } : { titre: titreDeFichier(f.name), fichier: f.name, parcours: ids || null, editeur: ed || null, niveau: niv, pagesTotal: pdf.numPages, pages: paquets[j] };
                j += 1;
                progres((rang + 0.5 + 0.5 * (j / paquets.length)) / fs.length, f.name + " : envoi " + j + " sur " + paquets.length);
                return api("POST", "documents", corps, 60000).then(function (r) { id = r.id; morceaux += r.morceauxAjoutes; return paquet(); });
              }
              return paquet().then(function () { note(f.name + " : ajouté, " + pluriel(morceaux, "morceau", "morceaux") + ".", true); });
            });
          }).then(suivant, function (e) { note(f.name + " : " + (e.statut === 409 ? "déjà ajouté." : erreurCompte(e)), false); return suivant(); });
        }
        return suivant();
      }).then(function () { progres(1, "Terminé."); fichiers.value = ""; ajouter.disabled = false; if (vive()) charger(); },
        function (e) { ajouter.disabled = false; dire(alerte, e.message || "Ajout impossible."); });
    }
    ajouter.addEventListener("click", envoyer);
    function modifier(corps) { return api("POST", "documents", Object.assign({ action: "modifier" }, corps), 15000).then(function (j) { if (vive()) rendre(j); }, function (e) { dire(alerte, erreurCompte(e)); }); }
    function rendre(j) {
      liste.textContent = "";
      var ul = el("ul", { "class": "liste" });
      (j.documents || []).forEach(function (d) {
        var bascule = el("button", { "class": "btn second petit", type: "button", text: d.actif ? "Désactiver" : "Activer" });
        bascule.addEventListener("click", function () { bascule.disabled = true; modifier({ id: d.id, actif: !d.actif }); });
        var sup = el("button", { "class": "btn second petit", type: "button", text: "Supprimer" });
        sup.addEventListener("click", function () {
          if (!window.confirm("Supprimer " + guill(d.titre) + " et ses " + pluriel(d.morceaux, "morceau", "morceaux") + F + "?")) return;
          sup.disabled = true;
          api("DELETE", "documents?id=" + d.id, null, 15000).then(function (j2) { if (vive()) rendre(j2); }, function (e) { sup.disabled = false; dire(alerte, erreurCompte(e)); });
        });
        var lien = el("input", { "class": "champ", type: "text", value: d.parcours || "", autocapitalize: "off", spellcheck: "false", placeholder: "Formation (vide = tout sujet)", "aria-label": "Formation liée à " + d.titre });
        var lier = el("button", { "class": "btn second petit", type: "button", text: "Lier" });
        lier.addEventListener("click", function () { lier.disabled = true; modifier({ id: d.id, parcours: lien.value.trim() || null }); });
        var details = (d.editeur ? d.editeur + " · " : "") + (d.niveau ? "niveau " + d.niveau + " et plus · " : "tous niveaux · ") + pluriel(d.pages || 0, "page", "pages") + " · " + pluriel(d.morceaux, "morceau", "morceaux") + " · " + octetsLisibles(d.octets) + " · " + (d.formation || d.parcours ? "formation " + (d.formation || d.parcours) : "tout sujet");
        var li = ligneAdmin(d.titre + (d.actif ? "" : " · désactivé"), details, [bascule, sup]);
        li.appendChild(el("div", { "class": "ligne-doc" }, [lien, lier]));
        ul.appendChild(li);
      });
      liste.appendChild(el("h2", { text: "Documents ajoutés" }));
      liste.appendChild((j.documents || []).length ? ul : el("p", { "class": "meta", text: "Aucun document pour l’instant." }));
      liste.appendChild(el("p", { "class": "meta", text: "Place utilisée" + N + ": " + octetsLisibles(j.octets || 0) + " sur " + octetsLisibles(j.max || 0) + ". Les leçons s’appuient d’abord sur ces documents, puis sur Wikipédia et le web. Les textes ne sont jamais montrés tels quels aux joueurs." }));
    }
    function charger() { api("GET", "documents", null, 10000).then(function (j) { if (vive()) rendre(j); }, function (e) { if (vive()) dire(alerte, erreurCompte(e)); }); }
    zone.appendChild(el("div", { "class": "pile" }, [
      el("label", { "for": "doc-fichiers", "class": "sur", text: "PDF à ajouter" }), fichiers,
      ligneChamp(formation), ligneChamp(editeur),
      el("div", { "class": "pile serree" }, [el("label", { "for": "doc-niveau", "class": "sur", text: "Niveau du document" }), niveau]),
      ajouter, barre, etatEnvoi, bilan, alerte]));
    zone.appendChild(liste);
    charger();
    return zone;
  }

  /* ---------- Hors ligne ---------- */
  /* Service worker (app/sw.js) : coquille de l'app et leçons déjà lues. Le bandeau dit ce qui reste disponible sans réseau. */
  var bandeauHorsLigne = document.getElementById("hors-ligne");
  function majBandeauHorsLigne() {
    if (!bandeauHorsLigne) return;
    var hors = navigator.onLine === false;
    bandeauHorsLigne.hidden = !hors;
    if (hors && !bandeauHorsLigne.textContent) bandeauHorsLigne.textContent = "Hors ligne" + N + ": leçons déjà lues disponibles";
  }
  window.addEventListener("offline", majBandeauHorsLigne);
  window.addEventListener("online", function () {
    majBandeauHorsLigne();
    /* Retour du réseau : on reprend la synchronisation (le test de la base ne s'était peut-être pas fait au démarrage). */
    api("GET", "etat", null, 5000).then(function (j) { serveur.base = !!j.base; serveur.ia = !!j.ia; return synchroniser(); }, function () {});
  });
  majBandeauHorsLigne();
  /* Vide le cache des leçons gardées pour le hors ligne. Renvoie une promesse, toujours tenue : à attendre avant de recharger la page. */
  function viderCacheHorsLigne() {
    try { return window.caches ? window.caches.delete("koios-lecons").then(function () {}, function () {}) : Promise.resolve(); } catch (e) { return Promise.resolve(); }
  }
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(null, function () { /* sans service worker, l'app marche comme avant */ }); });

  function route() {
    navigation += 1;
    if (arretVoix) { arretVoix(); arretVoix = null; } // la lecture à voix haute s'arrête quand on change de page
    enHaut();
    var p = location.hash.replace(/^#\/?/, "").split("/").map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    fermerFiche(false);
    if (!profil && p[0] !== "aide" && p[0] !== "confidentialite") { if (p[0] !== "accueil") apresAccueil = location.hash || "#/"; return vueAccueil(); }
    switch (p[0]) {
      case "": case "accueil": return vueMaison();
      case "p":
        if (!p[1]) return vueMaison();
        if (p[2] === "fiche" && /^\d+$/.test(p[3] || "")) return vueFiche(p[1], parseInt(p[3], 10));
        if (!p[2] || p[2] === "quiz" && !p[3] || p[2] === "defis" || p[2] === "cartes" || p[2] === "glossaire") return vueParcours(p[1], p[2] === "defis" ? "defis" : p[2] === "quiz" ? "quiz" : p[2] === "cartes" ? "cartes" : p[2] === "glossaire" ? "glossaire" : null);
        if (p[2] === "test" && /^\d+$/.test(p[3] || "")) return vueTestNiveau(p[1], parseInt(p[3], 10));
        if (p[2] === "quiz" || p[2] === "defi") return vueQuiz(p[1], p[3]);
        if (p[2] === "jeu") return vueJeu(p[1], p[3]);
        return vuePalier(p[1], Math.max(1, parseInt(p[2], 10) || 1));
      case "jeu": return p[1] === "jour" ? vueJour() : p[1] === "erreurs" ? vueErreurs() : vueMelange();
      case "duel": return vueDuel(p[1]);
      case "salon": return p[2] === "reponses" ? vueReponses(p[1]) : vueDuel(p[1], p[2] === "jouer");
      case "quiz": return vueQuizGeneral(p[1], parseInt(p[2], 10), /^\d+$/.test(p[3] || "") ? parseInt(p[3], 10) : undefined);
      case "nouveau-salon": return vueNouveauSalon(p[1], parseInt(p[2], 10));
      case "groupe": return p[1] ? vueGroupe(p[1]) : vueAmis();
      case "partie": return p[1] ? vuePartie(p[1], p[2] === "rejoindre") : vueAmis();
      case "certificat": return p[1] && /^\d+$/.test(p[2] || "") ? vueCertificat(p[1], parseInt(p[2], 10)) : vueMaison();
      case "dossier": return p[1] ? vueDossier(p[1]) : vueMaison();
      case "reviser": return vueReviser();
      case "badges": return vueBadges();
      case "jouer": return vueJouer();
      case "amis": return vueAmis();
      case "bibliotheque": return vueBibliotheque();
      case "profil": return vueProfil();
      case "admin": return vueAdmin();
      case "compte": return vueCompte();
      case "confidentialite": return vueConfidentialite();
      case "invitation": return p[1] ? vueInvitation(p[1]) : vueAmis();
      case "aide": return vueAide();
      default: location.hash = "#/";
    }
  }
  window.addEventListener("hashchange", route);
  Promise.race([chargerListeVerifies(), new Promise(function (ok) { setTimeout(ok, 1500); })]).then(function (l) { if (Array.isArray(l)) verifiees = l; }, function () {}).then(route);
  chargerListeVerifies().then(function (l) { verifiees = l; }, function () {});
  pretServeur.then(synchroniser).then(function () { var h = location.hash.replace(/^#\/?/, ""); if (profil && (h === "" || h === "profil")) route(); });
})();
