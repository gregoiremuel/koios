/* Koîos v2 : apprendre n'importe quel sujet, palier par palier. Blanc et net, une seule page, sans étape de construction.
   Vues : accueil (première visite), maison, parcours (paliers, quiz, défis), palier (leçon), quiz, mini-jeux, duel, jouer, profil. */
(function () {
  "use strict";
  var F = " ", N = " ";
  var SUGGESTIONS = ["La Vendée", "Les volcans", "Le cinéma de Kubrick", "La philosophie stoïcienne", "Les fonds marins"];
  var XP = { palier: 10, verif: 5, quiz: 5, defi: 10, jeu: 2 };

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
  function image(img, cls) {
    if (!img || !img.src) return null;
    var i = el("img", { src: img.src, alt: img.alt || "", loading: "lazy" });
    var legende = img.credit ? el("figcaption", {}, [img.lien ? el("a", { href: img.lien, target: "_blank", rel: "noopener", text: img.credit }) : img.credit]) : null;
    var f = el("figure", { "class": cls || null }, [i, legende]);
    i.addEventListener("error", function () { f.remove(); });
    return f;
  }
  function vignette(img, titre) {
    if (img && img.src) { var i = el("img", { "class": "vignette", src: img.src, alt: "", loading: "lazy" }); i.addEventListener("error", function () { i.replaceWith(el("span", { "class": "vignette", text: (titre || "?").charAt(0) })); }); return i; }
    return el("span", { "class": "vignette", "aria-hidden": "true", text: (titre || "?").replace(/^(L’|La |Le |Les )/, "").charAt(0).toUpperCase() });
  }
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
      r.parcours[id] = { titre: x.titre || y.titre, image: x.image || y.image, fait: Math.max(x.fait || 0, y.fait || 0), xp: Math.max(x.xp || 0, y.xp || 0), quiz: q, date: (x.date || "") > (y.date || "") ? x.date : y.date };
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

  /* ---------- XP et niveaux ---------- */
  function seuil(n) { return 100 * n + 25 * n * (n - 1); } // XP pour atteindre le niveau n + 1
  function niveau(xp) { var n = 0; while (xp >= seuil(n + 1)) n += 1; return { niveau: n + 1, base: seuil(n), suivant: seuil(n + 1) }; }
  function suivi(id) { return etat.parcours[id] || { fait: 0, xp: 0, quiz: {} }; }
  function gagner(n, id) {
    if (n <= 0) return;
    etat.xp = (etat.xp || 0) + n;
    if (id) { var s = suivi(id); s.xp = (s.xp || 0) + n; s.date = new Date().toISOString(); etat.parcours[id] = s; }
    sauver();
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
  function fini(p) { return p.verifie && suivi(p.id).fait >= paliersPrevus(p); }
  function retenir(p) { var s = suivi(p.id); s.titre = p.titre; s.image = p.image || null; etat.parcours[p.id] = s; }
  function creerParcours(titre, bouton, alerte) {
    titre = String(titre || "").trim();
    alerte.hidden = true;
    if (titre.length < 2) { alerte.textContent = "Écris d’abord un sujet."; alerte.hidden = false; return; }
    chargerListeVerifies().then(function (l) {
      var v = l.filter(function (x) { return normaliser(x.titre) === normaliser(titre); })[0];
      if (v) { location.hash = "#/p/" + v.id; return; }
      var texte = bouton.textContent;
      bouton.disabled = true; bouton.textContent = "Préparation du parcours…";
      pretCompte().then(function () {
        if (!enLigne()) { var x = new Error("hors ligne"); x.statut = 503; throw x; }
        return api("POST", "parcours", { titre: titre }, 100000);
      }).then(function (j) {
        cache["p:" + j.parcours.id] = Promise.resolve(j.parcours);
        location.hash = "#/p/" + encodeURIComponent(j.parcours.id);
      }, function (e) {
        bouton.disabled = false; bouton.textContent = texte;
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
  function puceXP() { var n = niveau(etat.xp || 0); return el("a", { "class": "xp", href: "#/profil", "aria-label": "Niveau " + n.niveau + ", " + (etat.xp || 0) + " XP" }, [icone("diplome"), "Niv. " + n.niveau + " · " + (etat.xp || 0) + N + "XP"]); }
  function entete() { return el("header", { "class": "haut" }, [el("a", { "class": "marque", href: "#/", text: "Koîos" }), puceXP()]); }
  function attente(texte, plein) { return el("div", { "class": "page" + (plein ? " plein" : "") }, [entete(), el("p", { "class": "attente", role: "status", text: texte })]); }
  function erreurPage(texte, titre) { return el("div", { "class": "page" }, [entete(), el("div", { "class": "carte" }, [el("h1", { text: titre || "Page introuvable" }), el("p", { text: texte }), lien("#/", "Retour à l’accueil", "btn")])]); }
  function badge(v) {
    if (!v) return null;
    if (v.statut === "verifie") return el("span", { "class": "badge verifie" }, [icone("verifie"), "Vérifié"]);
    if (v.statut === "recoupe") return el("span", { "class": "badge recoupe" }, [icone("liste"), "Recoupé automatiquement"]);
    return el("span", { "class": "badge partiel" }, [icone("liste"), "Recoupé en partie"]);
  }

  /* ---------- Première visite ---------- */
  function vueAccueil() {
    var champ = el("input", { "class": "champ", id: "pseudo", type: "text", maxlength: "24", autocomplete: "nickname", placeholder: "Ton prénom ou un pseudo" });
    var alerte = el("p", { "class": "alerte", hidden: "" });
    var go = el("button", { "class": "btn", type: "button", text: "Commencer" });
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
      el("header", { "class": "haut" }, [el("span", { "class": "marque", text: "Koîos" })]),
      el("div", { "class": "pile" }, [el("h1", { text: "Apprends n’importe quel sujet, palier par palier." }),
        el("p", { "class": "meta", style: "font-size:17px", text: "Des leçons courtes et sourcées, des définitions, des frises et des chiffres. Tous les 5 paliers, un quiz ; ensuite des mini‑jeux et des duels entre amis." })]),
      el("div", { "class": "pile" }, [el("label", { "for": "pseudo", "class": "sur", text: "Ton nom" }), champ, go, alerte])
    ]), null, "Commencer");
  }

  /* ---------- Maison ---------- */
  function carteRecherche() {
    var champ = el("input", { "class": "champ", id: "sujet", type: "search", maxlength: "80", autocomplete: "off", enterkeyhint: "go", placeholder: "Un sujet, une époque, une personne…" });
    var bouton = el("button", { "class": "btn petit", type: "button", text: "Apprendre" });
    var alerte = el("p", { "class": "alerte", hidden: "", role: "status" });
    bouton.addEventListener("click", function () { creerParcours(champ.value, bouton, alerte); });
    champ.addEventListener("keydown", function (e) { if (e.key === "Enter") bouton.click(); });
    var puces = el("div", { "class": "puces" });
    SUGGESTIONS.forEach(function (t) { var b = el("button", { "class": "puce", type: "button", text: t }); b.addEventListener("click", function () { champ.value = t; creerParcours(t, bouton, alerte); }); puces.appendChild(b); });
    return el("section", { "class": "pile", "aria-labelledby": "titre-recherche" }, [el("h1", { id: "titre-recherche", text: "Que veux‑tu apprendre" + F + "?" }), el("div", { "class": "recherche" }, [champ, bouton]), alerte, puces]);
  }
  function rangeeParcours(id, titre, img, detail, droite) {
    return el("li", {}, [el("a", { "class": "rangee", href: "#/p/" + encodeURIComponent(id) }, [vignette(img, titre), el("span", {}, [el("b", { text: titre }), el("span", { "class": "meta", text: detail })]), droite || icone("fleche")])]);
  }
  function quizEnAttente(s) { var k = Math.floor((s.fait || 0) / 5) * 5; return k > 0 && (s.quiz || {})[k] === undefined ? k : 0; }
  function detailSuivi(s) {
    if (!s.fait) return "Pas encore commencé";
    if (quizEnAttente(s)) return "Palier " + s.fait + " · " + (quizEnAttente(s) % 10 === 0 ? "défi d’étape" : "quiz") + " disponible";
    var r = 5 - (s.fait % 5); return "Palier " + s.fait + " · quiz dans " + pluriel(r, "palier", "paliers");
  }
  function avanceJalon(s) { return quizEnAttente(s) ? 100 : ((s.fait || 0) % 5) / 5 * 100; }
  function vueMaison() {
    var miens = Object.keys(etat.parcours).map(function (id) { return { id: id, s: etat.parcours[id] }; }).filter(function (x) { return x.s.titre; }).sort(function (a, b) { return (b.s.date || "") > (a.s.date || "") ? 1 : -1; });
    var blocs = [entete(), carteRecherche()];
    if (miens.length) {
      var r = miens[0];
      blocs.push(el("section", { "class": "carte reprendre", "aria-labelledby": "titre-reprendre" }, [
        el("span", { "class": "sur", text: "Reprendre" }),
        r.s.image && r.s.image.src ? el("img", { "class": "photo-r", src: r.s.image.src, alt: "", loading: "lazy" }) : null,
        el("div", { "class": "ligne-titre" }, [el("h2", { id: "titre-reprendre", text: r.s.titre }), el("span", { "class": "meta", text: (r.s.xp || 0) + N + "XP" })]),
        el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + avanceJalon(r.s) + "%" })]),
        el("span", { "class": "meta", text: detailSuivi(r.s) }),
        lien("#/p/" + encodeURIComponent(r.id) + (quizEnAttente(r.s) ? (quizEnAttente(r.s) % 10 === 0 ? "/defi/" : "/quiz/") + quizEnAttente(r.s) : ""), quizEnAttente(r.s) ? "Passer le " + (quizEnAttente(r.s) % 10 === 0 ? "défi d’étape" : "quiz") : (r.s.fait ? "Continuer au palier " + (r.s.fait + 1) : "Commencer"), "btn")
      ]));
      if (miens.length > 1) {
        var ul = el("ul", { "class": "liste" });
        miens.slice(1, 8).forEach(function (x) { ul.appendChild(rangeeParcours(x.id, x.s.titre, x.s.image, detailSuivi(x.s))); });
        blocs.push(el("section", { "class": "pile serree" }, [el("h2", { text: "Tes sujets" }), ul]));
      }
    }
    var verifs = el("ul", { "class": "liste" });
    blocs.push(el("section", { "class": "pile serree" }, [el("div", { "class": "ligne-titre" }, [el("h2", { text: "Parcours vérifiés" }), el("span", { "class": "meta", text: "2 sources par notion" })]), verifs]));
    var jourFait = etat.jours[aujourdhui()];
    blocs.push(el("section", { "class": "carte" }, [el("div", { "class": "ligne-titre" }, [el("h2", { text: "Question du jour" }), el("span", { "class": "meta", text: serieJours() ? "Série" + N + ": " + pluriel(serieJours(), "jour", "jours") : "La même pour tous" })]),
      jourFait ? el("p", { "class": "meta", text: jourFait === "juste" ? "Réussie aujourd’hui. La suivante arrive demain." : "Manquée aujourd’hui. La suivante arrive demain." }) : lien("#/jeu/jour", "Répondre", "btn second")]));
    montrer(el("div", { "class": "page" }, blocs), "accueil", "Accueil");
    chargerListeVerifies().then(function (l) {
      l.forEach(function (p) { var s = suivi(p.id); verifs.appendChild(rangeeParcours(p.id, p.titre, null, s.fait ? "Palier " + s.fait + " sur " + p.paliers : pluriel(p.paliers, "palier", "paliers"), el("span", { "class": "badge verifie" }, [icone("verifie"), "Vérifié"]))); });
      if (window.poserIcones) window.poserIcones(verifs);
    }, function () {});
  }

  /* ---------- Parcours ---------- */
  function vueParcours(id, onglet) {
    montrer(attente("Ouverture du parcours…"), "accueil", "Parcours");
    chargerParcours(id).then(function (p) {
      retenir(p); S.ecrire("koios.etat", etat);
      var s = suivi(p.id), prevus = paliersPrevus(p);
      var zone = el("div", { "class": "pile", id: "panneau", role: "tabpanel" });
      var tabs = el("div", { "class": "onglets", role: "tablist", "aria-label": "Sections du parcours" });
      var choix = [["parcours", "Paliers"], ["quiz", "Quiz"], ["defis", "Défis"]];
      choix.forEach(function (c) {
        var b = el("button", { type: "button", role: "tab", "aria-controls": "panneau", "aria-selected": c[0] === (onglet || "parcours") ? "true" : "false", text: c[1] });
        b.addEventListener("click", function () { history.replaceState(null, "", "#/p/" + encodeURIComponent(p.id) + (c[0] === "parcours" ? "" : "/" + c[0])); tabs.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); }); remplir(c[0]); });
        tabs.appendChild(b);
      });
      function remplir(o) {
        zone.innerHTML = "";
        if (o === "quiz") zone.appendChild(ongletQuiz(p, s)); else if (o === "defis") zone.appendChild(ongletDefis(p, s)); else zone.appendChild(ongletPaliers(p, s, prevus));
        if (window.poserIcones) window.poserIcones(zone);
      }
      var suivant = Math.min(s.fait + 1, p.verifie ? prevus : s.fait + 1);
      montrer(el("div", { "class": "page" }, [
        el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/" }, [icone("retour"), "Accueil"]), el("span"), puceXP()]),
        image(p.image, "tete"),
        el("div", { "class": "pile serree" }, [el("span", {}, [badge({ statut: p.verifie ? "verifie" : "recoupe" })]), el("h1", { text: p.titre }), p.resume ? el("p", { "class": "meta", style: "font-size:16px", text: p.resume }) : null]),
        el("div", { "class": "pile serree" }, [el("div", { "class": "ligne-titre" }, [el("span", { "class": "meta", text: s.fait ? pluriel(s.fait, "palier terminé", "paliers terminés") : "Pas encore commencé" }), el("span", { "class": "meta gain", text: (s.xp || 0) + N + "XP" })]),
          el("div", { "class": "progres", "aria-hidden": "true" }, [el("i", { style: "width:" + (p.verifie ? Math.round(s.fait / Math.max(prevus, 1) * 100) : ((s.fait % 10) * 10)) + "%" })])]),
        fini(p) ? el("p", { "class": "verrou" }, [icone("diplome"), "Parcours terminé. Rejoue les quiz et les défis pour consolider."]) : lien("#/p/" + encodeURIComponent(p.id) + "/" + suivant, s.fait ? "Continuer · palier " + suivant : "Commencer le palier 1", "btn"),
        tabs, zone
      ]), "accueil", p.titre);
      remplir(onglet || "parcours");
    }, function (e) { montrer(erreurPage(e.statut === 404 ? "Ce parcours n’existe pas encore." : messageErreur(e), "Parcours indisponible"), "accueil"); });
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
      for (var n = debut; n <= finE; n++) {
        var t = titrePalier(p, n) || (n <= s.fait + 1 ? "Palier " + n : "Palier à venir");
        var etatP = n <= s.fait ? "fait" : (n === s.fait + 1 ? "actuel" : "");
        var ouvert = n <= s.fait + 1;
        var contenu = [el("span", { "class": "pastille", text: n <= s.fait ? null : String(n), "aria-hidden": "true" }, [n <= s.fait ? icone("juste") : null]), el("span", {}, [el("b", { text: t }), el("span", { "class": "etat", text: n <= s.fait ? "Terminé" : (ouvert ? "À faire" : "Verrouillé") })]), ouvert ? icone("fleche") : icone("cadenas")];
        ul.appendChild(el("li", { "class": etatP }, [ouvert ? el("a", { href: "#/p/" + encodeURIComponent(p.id) + "/" + n, "aria-label": "Palier " + n + N + ": " + t }, contenu) : el("span", { "class": "bloque" }, contenu)]));
        if (n % 5 === 0) {
          var k = n, nom = n % 10 === 0 ? "Défi d’étape" : "Quiz", score = (s.quiz || {})[k];
          var dispo = s.fait >= k;
          var c2 = [el("span", { "class": "pastille", "aria-hidden": "true" }, [icone(score !== undefined ? "juste" : (n % 10 === 0 ? "trophee" : "liste"))]), el("span", {}, [el("b", { text: nom + " · paliers " + (k - (n % 10 === 0 ? 9 : 4)) + " à " + k }), el("span", { "class": "etat", text: score !== undefined ? "Meilleur score" + N + ": " + score + F + "%" : (dispo ? "Disponible" : "S’ouvre au palier " + k) })]), dispo ? icone("fleche") : icone("cadenas")];
          ul.appendChild(el("li", { "class": "jalon" + (score !== undefined ? " fait" : "") }, [dispo ? el("a", { href: "#/p/" + encodeURIComponent(p.id) + "/" + (n % 10 === 0 ? "defi" : "quiz") + "/" + k }, c2) : el("span", { "class": "bloque" }, c2)]));
        }
      }
      bloc.appendChild(el("div", { "class": "etape-titre" }, [el("h2", { text: "Étape " + e + (et.titre && et.titre !== "Étape " + e ? " · " + et.titre : "") }), el("span", { "class": "meta", text: "Paliers " + debut + " à " + finE })]));
      bloc.appendChild(ul);
    }
    if (!p.verifie) bloc.appendChild(el("p", { "class": "meta", text: "Le parcours continue sans fin" + N + ": chaque étape de 10 paliers en ouvre une autre, plus précise." }));
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
      ul.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/p/" + encodeURIComponent(p.id) + "/jeu/" + j[0] }, [el("span", { "class": "vignette" }, [icone(j[0] === "duel" ? "epee" : j[0] === "paires" ? "liste" : j[0] === "ordre" ? "sablier" : "ampoule")]), el("span", {}, [el("b", { text: j[1] }), el("span", { "class": "meta", text: j[2] })]), icone("fleche")])]));
    });
    return ul;
  }

  /* ---------- Palier (leçon) ---------- */
  function sectionL(titre, contenu) { return contenu ? el("section", {}, [el("h2", { text: titre }), contenu]) : null; }
  function texteL(t) { if (!t) return null; var d = el("div", { "class": "texte" }); String(t).split("\n").forEach(function (x) { if (x.trim()) d.appendChild(el("p", { text: x })); }); return d; }
  function vuePalier(id, n) {
    montrer(attente("Préparation du palier… La première fois, compte jusqu’à une minute : deux IA rédigent puis vérifient la leçon.", true), null, "Palier");
    Promise.all([chargerParcours(id), chargerPalier(id, n)]).then(function (r) {
      var p = r[0], l = r[1];
      if (!l) throw Object.assign(new Error("introuvable"), { statut: 404 });
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
          if (juste) { bonus = XP.verif; oublierErreur(it); } else noterErreur(it);
          S.ecrire("koios.etat", etat);
        }));
      }
      var deja = n <= s.fait;
      var finir = el("button", { "class": "btn", type: "button", text: deja ? "Palier suivant" : "Terminer le palier · +" + XP.palier + N + "XP" });
      finir.addEventListener("click", function () {
        var s2 = suivi(p.id);
        if (n > s2.fait) { s2.fait = n; etat.parcours[p.id] = s2; gagner(XP.palier + bonus, p.id); toast("+" + (XP.palier + bonus) + N + "XP"); }
        var base = "#/p/" + encodeURIComponent(p.id);
        if (p.verifie && n >= paliersPrevus(p)) location.hash = base;
        else if (n % 10 === 0 && !(s2.quiz || {})[n]) location.hash = base + "/defi/" + n;
        else if (n % 5 === 0 && !(s2.quiz || {})[n]) location.hash = base + "/quiz/" + n;
        else location.hash = base + "/" + (n + 1);
      });
      var points = el("div", { "class": "etapes-q", "aria-hidden": "true" });
      var e0 = Math.floor((n - 1) / 10) * 10;
      for (var k = 1; k <= 10; k++) points.appendChild(el("i", { "class": e0 + k < n ? "fait" : (e0 + k === n ? "ok" : null) }));
      montrer(el("div", { "class": "page plein" }, [
        el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: "#/p/" + encodeURIComponent(p.id), "aria-label": "Fermer le palier" }, [icone("faux")]), points, puceXP()]),
        image(l.image),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: p.titre + " · palier " + n }), el("h1", { text: l.titre }), el("span", {}, [badge(v)])]),
        el("article", { "class": "lecon" }, [
          sectionL("En bref", texteL(l.sections && l.sections.enBref)),
          sectionL("Comment", texteL(l.sections && l.sections.comment)),
          sectionL("Pourquoi", texteL(l.sections && l.sections.pourquoi)),
          sectionL("Où et quand", texteL(l.sections && l.sections.ouQuand)),
          sectionL(!(l.definitions || []).length ? "Repères" : "Définitions", dl),
          sectionL("Frise", V.frise ? V.frise(l.frise) : null),
          sectionL("En chiffres", V.barres ? V.barres(l.chiffres) : null),
          sectionL("Réseau des notions", V.reseau ? V.reseau(l.notions) : null),
          l.citation && V.citation ? V.citation(l.citation) : null,
          l.histoire ? el("div", { "class": "anecdote" }, [el("span", { "class": "sur", text: "L’histoire" }), el("p", { text: l.histoire })]) : null,
          sectionL("Sources", srcs),
          el("p", { "class": "verif" + (v.statut === "verifie" ? " ok" : "") }, [icone(v.statut === "verifie" ? "verifie" : "liste"), noteV])
        ]),
        verifBloc, finir
      ]), null, l.titre);
    }, function (e) {
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
          bon.classList.add("juste"); bon.querySelector(".fin").appendChild(icone("juste", "Bonne réponse"));
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
    var page = el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: opt.retour, "aria-label": "Quitter" }, [icone("faux")]), points, compteur]), scene]);
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
      gagner(gagne, opt.parcours);
      compteur.textContent = "";
      var revoir = el("div", { "class": "pile" });
      rates.forEach(function (it) {
        var q = it.question;
        revoir.appendChild(el("details", { "class": "plier ligne" }, [el("summary", {}, [el("span", {}, [el("b", { text: it.titre || "Question" }), el("span", { "class": "meta", text: (q.enonce || q.affirmation || "").slice(0, 90) })]), icone("fleche")]), el("p", { "class": "meta", text: q.type === "qcm" ? "Réponse" + N + ": " + q.reponses[q.bonne] : q.type === "vraifaux" ? "Réponse" + N + ": " + (q.vrai ? "vrai" : "faux") : "Ordre" + N + ": " + q.ordre.join(" → ") }), q.explication ? el("p", { text: q.explication }) : null]));
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
          var prochain = mode !== "direct" && !(p.verifie && k >= paliersPrevus(p)) ? k + 1 : null;
          if (prochain) zone.appendChild(lien(base + "/" + prochain, "Continuer · palier " + prochain, "btn"));
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
    return el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut" }, [el("a", { "class": "fermer", href: base + "/defis", "aria-label": "Quitter" }, [icone("faux")]), el("span"), puceXP()]), el("span", { "class": "sur", text: p.titre }), el("h1", { text: "Associe les notions" }), info, zone, fin]);
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
          montrer(quiz(items, { titre: "Duel", retour: "#/jouer", xp: XP.quiz, fin: function (res, zone) {
            var info = el("p", { "class": "meta", role: "status", text: "Enregistrement de ton score…" });
            zone.appendChild(info);
            api("PUT", "duel", { id: d.id, score: { justes: res.justes, n: res.n, points: res.gagne } }).then(function () { return api("GET", "duel?id=" + encodeURIComponent(d.id)); }).then(function (j2) { info.textContent = ""; zone.appendChild(el("h2", { text: "Tableau du duel" })); zone.appendChild(tableauDuel(j2.duel)); zone.appendChild(lien("#/jouer", "Retour aux jeux", "btn second")); }, function (e) { info.textContent = messageErreur(e); });
          } }), null, "Duel");
        });
      });
      montrer(el("div", { "class": "page plein" }, [el("div", { "class": "barre-haut", style: "grid-template-columns:auto 1fr auto" }, [el("a", { "class": "retour-texte", href: "#/jouer" }, [icone("retour"), "Jouer"]), el("span"), puceXP()]),
        el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Duel" }), el("h1", { text: profil && d.createur === profil.pseudo ? "Ton duel" : d.createur + " te lance un duel" })]),
        d.dejaJoue ? el("p", { "class": "verrou" }, [icone("juste"), "Tu as déjà joué ce duel."]) : (enLigne() ? lancer : el("p", { "class": "alerte", text: "Les duels demandent la connexion en ligne. Réessaie dans un moment." })),
        el("h2", { text: "Tableau" }), tableauDuel(d)
      ]), null, "Duel");
    }, function (e) { montrer(erreurPage(e.statut === 404 ? "Ce duel n’existe pas." : messageErreur(e), "Duel indisponible"), "jouer"); });
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
  function vueJouer() {
    var classement = el("div", { "class": "pile" }, [el("p", { "class": "attente", text: "Chargement…" })]);
    var duels = el("div", { "class": "pile serree" });
    var info = el("p", { "class": "meta", role: "status" });
    var inviter = el("button", { "class": "lien", type: "button", text: "Inviter un ami dans Koîos" });
    inviter.addEventListener("click", function () { partager("Koîos", "Apprends n’importe quel sujet, palier par palier, et défie‑moi.", location.origin + "/", function (t) { info.textContent = t; }); });
    var jourFait = etat.jours[aujourdhui()];
    montrer(el("div", { "class": "page" }, [entete(), el("h1", { text: "Jouer" }),
      el("ul", { "class": "liste" }, [
        el("li", {}, [el(jourFait ? "div" : "a", { "class": "rangee", href: jourFait ? null : "#/jeu/jour" }, [el("span", { "class": "vignette" }, [icone("ampoule")]), el("span", {}, [el("b", { text: "Question du jour" }), el("span", { "class": "meta", text: jourFait ? (jourFait === "juste" ? "Réussie. Reviens demain." : "Manquée. Reviens demain.") : "La même pour tous" + (serieJours() ? " · série de " + pluriel(serieJours(), "jour", "jours") : "") })]), jourFait ? icone("juste") : icone("fleche")])]),
        el("li", {}, [el("a", { "class": "rangee", href: "#/jeu/melange" }, [el("span", { "class": "vignette" }, [icone("liste")]), el("span", {}, [el("b", { text: "Quiz mélangé" }), el("span", { "class": "meta", text: "10 questions, tous sujets confondus" })]), icone("fleche")])])
      ]),
      el("section", { "class": "pile serree" }, [el("h2", { text: "Duels" }), el("p", { "class": "meta", text: "Lance un duel depuis l’onglet Défis d’un sujet, ou depuis le quiz mélangé." }), duels]),
      el("section", { "class": "pile serree" }, [el("div", { "class": "ligne-titre" }, [el("h2", { text: "Classement" }), el("span", { "class": "meta", text: "XP cumulés" })]), classement, inviter, info])
    ]), "jouer", "Jouer");
    pretServeur.then(function () {
      if (!serveur.base) { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Le classement s’affiche dès que le serveur répond." })); return; }
      api("GET", "cercle").then(function (j) {
        classement.innerHTML = "";
        var ol = el("ol", { "class": "liste" });
        (j.joueurs || []).forEach(function (x, k) { ol.appendChild(el("li", {}, [el("div", { "class": "rangee", style: "grid-template-columns:28px 1fr auto;min-height:52px" }, [el("b", { text: String(k + 1) }), el("b", { text: x.pseudo + (x.moi ? " (toi)" : "") }), el("span", { "class": "meta", text: x.points + N + "XP" })])])); });
        classement.appendChild((j.joueurs || []).length ? ol : el("p", { "class": "meta", text: "Personne n’a encore d’XP." }));
      }, function () { classement.innerHTML = ""; classement.appendChild(el("p", { "class": "meta", text: "Classement indisponible pour l’instant." })); });
      if (enLigne()) api("GET", "duels").then(function (j) {
        var ul = el("ul", { "class": "liste" });
        (j.duels || []).slice(0, 6).forEach(function (d) { ul.appendChild(el("li", {}, [el("a", { "class": "rangee", href: "#/duel/" + d.id, style: "grid-template-columns:1fr auto;min-height:56px" }, [el("span", {}, [el("b", { text: "Duel de " + d.createur }), el("span", { "class": "meta", text: pluriel((d.scores || []).length, "joueur", "joueurs") })]), icone("fleche")])])); });
        if ((j.duels || []).length) { duels.appendChild(ul); if (window.poserIcones) window.poserIcones(duels); }
      }, function () {});
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
    montrer(el("div", { "class": "page" }, [entete(),
      el("div", { "class": "pile serree" }, [el("span", { "class": "sur", text: "Profil" }), el("h1", { text: profil.pseudo })]),
      el("div", { "class": "carte" }, [el("div", { "class": "ligne-titre" }, [el("h2", { text: "Niveau " + n.niveau }), el("span", { "class": "meta gain", text: (etat.xp || 0) + N + "XP" })]), el("div", { "class": "progres" }, [el("i", { style: "width:" + Math.round(((etat.xp || 0) - n.base) / (n.suivant - n.base) * 100) + "%" })]), el("span", { "class": "meta", text: (n.suivant - (etat.xp || 0)) + N + "XP avant le niveau " + (n.niveau + 1) })]),
      el("div", { "class": "chiffres-profil" }, [el("div", {}, [el("span", { "class": "meta", text: "Paliers" }), el("strong", { text: String(paliers) })]), el("div", {}, [el("span", { "class": "meta", text: "Sujets" }), el("strong", { text: String(sujets) })]), el("div", {}, [el("span", { "class": "meta", text: "Série" }), el("strong", { text: String(serieJours()) })]), el("div", {}, [el("span", { "class": "meta", text: "Erreurs à revoir" }), el("strong", { text: String(etat.erreurs.length) })])]),
      etat.erreurs.length ? lien("#/jeu/erreurs", "Revoir mes erreurs", "btn") : null,
      el("section", { "class": "pile" }, [el("h2", { text: "Réglages" }), el("label", { "for": "pseudo", "class": "sur", text: "Nom affiché" }), champ, sync, cleZone]),
      el("p", { "class": "credit", text: "Koîos · leçons vérifiées par la rédaction ou recoupées par deux IA à partir de sources ouvertes · photos Pexels, Unsplash et Wikimédia · icônes Phosphor (MIT)" })
    ]), "profil", "Profil");
    majSync(); pretServeur.then(majSync);
  }

  /* ---------- Routeur ---------- */
  function route() {
    var p = location.hash.replace(/^#\/?/, "").split("/").map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (!profil) { if (p[0] !== "accueil") apresAccueil = location.hash || "#/"; return vueAccueil(); }
    switch (p[0]) {
      case "": case "accueil": return vueMaison();
      case "p":
        if (!p[1]) return vueMaison();
        if (!p[2] || p[2] === "quiz" && !p[3] || p[2] === "defis") return vueParcours(p[1], p[2] === "defis" ? "defis" : p[2] === "quiz" ? "quiz" : null);
        if (p[2] === "quiz" || p[2] === "defi") return vueQuiz(p[1], p[3]);
        if (p[2] === "jeu") return vueJeu(p[1], p[3]);
        return vuePalier(p[1], Math.max(1, parseInt(p[2], 10) || 1));
      case "jeu": return p[1] === "jour" ? vueJour() : p[1] === "erreurs" ? vueErreurs() : vueMelange();
      case "duel": return vueDuel(p[1]);
      case "jouer": return vueJouer();
      case "profil": return vueProfil();
      default: location.hash = "#/";
    }
  }
  window.addEventListener("hashchange", route);
  route();
  pretServeur.then(synchroniser).then(function () { var h = location.hash.replace(/^#\/?/, ""); if (profil && (h === "" || h === "profil")) route(); });
})();
