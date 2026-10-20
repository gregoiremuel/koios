/* Koîos : règles pures de l'app (révision espacée, jours actifs et série, badges, correspondance avec les cours vérifiés).
   Aucune page, aucun réseau, aucune dépendance : ce fichier se charge dans le navigateur (window.Logique) et dans les tests
   (scripts/test_api.mjs). Les dates sont des chaînes AAAA-MM-JJ (jour local de l'appareil). */
(function (g) {
  "use strict";
  var N = " ", F = " ";

  /* ---------- Dates ---------- */
  function pad(n) { return ("0" + n).slice(-2); }
  function dateDe(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function lireDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s)); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; }
  function plusJours(s, n) { var d = lireDate(s); if (!d) return s; d.setDate(d.getDate() + n); return dateDe(d); }
  function ecartJours(a, b) { var x = lireDate(a), y = lireDate(b); return x && y ? Math.round((y - x) / 86400000) : 0; }

  /* ---------- Révision espacée (Leitner, 5 boîtes) ----------
     etat.revisions[clé] = { boite: 1 à 5, prochaine: "AAAA-MM-JJ", xp?: date du dernier gain d'XP }.
     Clés : « parcours:leçon:k » pour une carte, « palier#index » pour une question ratée.
     Un élément sans entrée est « nouveau » : il est à réviser tout de suite. */
  var INTERVALLES = [1, 3, 7, 16, 35]; // jours d'attente avant la prochaine révision, selon la boîte (1 à 5)
  var SEANCE = 20; // éléments au plus par séance

  function entreeValide(e) { return !!e && typeof e === "object" && Number.isInteger(e.boite) && e.boite >= 1 && e.boite <= 5 && !!lireDate(e.prochaine); }
  /* Premier passage d'un élément (carte vue, question ratée) : boîte 1, à revoir demain. */
  function nouvelleEntree(auj) { return { boite: 1, prochaine: plusJours(auj, INTERVALLES[0]) }; }
  /* Après une réponse : « Je savais » monte d'une boîte (la 5e est la dernière), « À revoir » revient en boîte 1.
     xp vaut 1 si cette réponse rapporte 1 XP : juste, et pas déjà récompensée aujourd'hui pour cet élément. */
  function repondre(e, ok, auj) {
    var b = entreeValide(e) ? e.boite : 1;
    var nb = ok ? Math.min(5, b + 1) : 1;
    var r = { boite: nb, prochaine: plusJours(auj, INTERVALLES[nb - 1]) };
    var dernier = e && typeof e.xp === "string" ? e.xp : null;
    var xp = ok && dernier !== auj ? 1 : 0;
    if (xp) r.xp = auj; else if (dernier) r.xp = dernier;
    return { entree: r, xp: xp };
  }
  function echu(e, auj) { return !entreeValide(e) || e.prochaine <= auj; }
  /* Éléments connus : cartes des leçons vues (etat.cartes) et questions ratées (etat.erreurs). */
  function elements(etat) {
    var l = [];
    Object.keys(etat.cartes || {}).forEach(function (k) { if (/^.+:\d+:\d+$/.test(k)) l.push({ cle: k, type: "carte" }); });
    (etat.erreurs || []).forEach(function (e) {
      if (e && typeof e.palier === "string" && e.index >= 0) l.push({ cle: e.palier + "#" + e.index, type: "question", palier: e.palier, index: e.index, titre: e.titre });
    });
    return l;
  }
  /* File du jour : les éléments échus, les boîtes les plus basses d'abord, puis les plus en retard. */
  function fileDuJour(etat, auj) {
    var rev = etat.revisions || {};
    return elements(etat).filter(function (x) { return echu(rev[x.cle], auj); }).sort(function (a, b) {
      var ea = entreeValide(rev[a.cle]) ? rev[a.cle] : { boite: 1, prochaine: "" }, eb = entreeValide(rev[b.cle]) ? rev[b.cle] : { boite: 1, prochaine: "" };
      return ea.boite - eb.boite || (ea.prochaine < eb.prochaine ? -1 : ea.prochaine > eb.prochaine ? 1 : 0) || (a.cle < b.cle ? -1 : 1);
    });
  }
  /* Prochaine échéance parmi les éléments pas encore échus : { date, jours, n } ou null. */
  function prochaineRevision(etat, auj) {
    var rev = etat.revisions || {}, date = null, n = 0;
    elements(etat).forEach(function (x) {
      var e = rev[x.cle];
      if (!entreeValide(e) || e.prochaine <= auj) return;
      if (date === null || e.prochaine < date) { date = e.prochaine; n = 1; } else if (e.prochaine === date) n += 1;
    });
    return date === null ? null : { date: date, jours: ecartJours(auj, date), n: n };
  }
  /* Fusion de deux appareils : même boîte, la date la plus lointaine ; sinon, la plus grande boîte (avec sa date). */
  function fusionnerRevisions(a, b) {
    var r = {};
    [a || {}, b || {}].forEach(function (o) {
      Object.keys(o).forEach(function (k) {
        var e = o[k];
        if (!entreeValide(e)) return;
        var c = r[k];
        if (!c) { r[k] = { boite: e.boite, prochaine: e.prochaine }; if (typeof e.xp === "string") r[k].xp = e.xp; return; }
        var pris = e.boite > c.boite || (e.boite === c.boite && e.prochaine > c.prochaine) ? e : c;
        var xp = [c.xp, e.xp].filter(function (x) { return typeof x === "string"; }).sort().pop();
        r[k] = { boite: pris.boite, prochaine: pris.prochaine };
        if (xp) r[k].xp = xp;
      });
    });
    return r;
  }
  /* Retire les entrées d'éléments qui n'existent plus (carte élaguée, erreur oubliée). */
  function elaguerRevisions(etat) {
    var vivants = {};
    elements(etat).forEach(function (x) { vivants[x.cle] = 1; });
    var rev = etat.revisions || {};
    Object.keys(rev).forEach(function (k) { if (!vivants[k] || !entreeValide(rev[k])) delete rev[k]; });
    etat.revisions = rev;
  }

  /* ---------- Jours actifs et série ----------
     etat.jours[date] = { lecon: 1, revision: 1, quiz: 1, jour: "juste" | "faux" } (seulement ce qui est fait).
     Ancien format : une chaîne « juste » ou « faux » = la question du jour jouée. */
  function jourNormal(v) {
    if (typeof v === "string") return v ? { jour: v === "juste" ? "juste" : "faux" } : {};
    if (!v || typeof v !== "object") return {};
    var r = {};
    if (v.lecon) r.lecon = 1;
    if (v.revision) r.revision = 1;
    if (v.quiz) r.quiz = 1;
    if (v.jour) r.jour = v.jour === "juste" ? "juste" : "faux";
    return r;
  }
  function jourActif(v) { var j = jourNormal(v); return !!(j.lecon || j.revision || j.quiz || j.jour); }
  function normaliserJours(o) {
    var r = {};
    if (!o || typeof o !== "object") return r;
    Object.keys(o).forEach(function (d) { if (lireDate(d) && jourActif(o[d])) r[d] = jourNormal(o[d]); });
    return r;
  }
  function fusionnerJours(a, b) {
    var r = normaliserJours(a), y = normaliserJours(b);
    Object.keys(y).forEach(function (d) {
      var x = r[d] || {}, z = y[d], m = {};
      ["lecon", "revision", "quiz"].forEach(function (c) { if (x[c] || z[c]) m[c] = 1; });
      if (x.jour || z.jour) m.jour = x.jour === "juste" || z.jour === "juste" ? "juste" : "faux";
      r[d] = m;
    });
    return r;
  }
  /* Jours de suite jusqu'à aujourd'hui (ou jusqu'à hier si aujourd'hui n'est pas encore joué). */
  function serieActuelle(jours, auj) {
    var n = 0, d = auj;
    if (!jourActif((jours || {})[d])) d = plusJours(d, -1);
    while (jourActif((jours || {})[d])) { n += 1; d = plusJours(d, -1); }
    return n;
  }
  /* Plus longue série de tous les temps. */
  function meilleureSerie(jours) {
    var dates = Object.keys(jours || {}).filter(function (d) { return lireDate(d) && jourActif(jours[d]); }).sort();
    var best = 0, cur = 0, prec = null;
    dates.forEach(function (d) { cur = prec !== null && plusJours(prec, 1) === d ? cur + 1 : 1; prec = d; if (cur > best) best = cur; });
    return best;
  }

  /* ---------- Badges ----------
     Chaque badge se calcule sur des données réelles de l'état ; rien n'est accordé d'avance.
     valeur / cible : la progression montrée sur un badge à venir (cible 1 : pas de compteur). */
  function statistiques(etat, auj) {
    var parcours = etat.parcours || {}, lecons = 0, modules = 0, bases = 0;
    Object.keys(parcours).forEach(function (id) {
      var s = parcours[id] || {};
      lecons += Math.max(0, Number(s.fait) || 0);
      modules += Math.max(0, Number(s.mods) || 0);
      if (s.bases) bases = 1;
    });
    var cartes = {};
    Object.keys(etat.cartes || {}).forEach(function (k) { var c = etat.cartes[k]; if (c && (c.ok === true || c.ok === false)) cartes[k] = 1; });
    var faits = etat.faits || {};
    return {
      lecons: lecons, modules: modules, bases: bases, serie: meilleureSerie(etat.jours), cartes: Object.keys(cartes).length,
      duel: faits.duel ? 1 : 0, direct: faits.direct ? 1 : 0, xp: Math.max(0, Number(etat.xp) || 0)
    };
  }
  var BADGES = [
    { id: "lecon-1", nom: "Première leçon", icone: "pousse", teinte: "t2", cle: "lecons", cible: 1, condition: "Termine ta première leçon." },
    { id: "lecons-10", nom: "10" + N + "leçons", icone: "livre", teinte: "t3", cle: "lecons", cible: 10, condition: "Termine 10" + N + "leçons." },
    { id: "lecons-50", nom: "50" + N + "leçons", icone: "livres", teinte: "t1", cle: "lecons", cible: 50, condition: "Termine 50" + N + "leçons." },
    { id: "lecons-200", nom: "200" + N + "leçons", icone: "diplome", teinte: "t5", cle: "lecons", cible: 200, condition: "Termine 200" + N + "leçons." },
    { id: "module-1", nom: "Premier module", icone: "chemin", teinte: "t5", cle: "modules", cible: 1, condition: "Termine toutes les leçons d’un module." },
    { id: "bases", nom: "Bases terminées", icone: "verifie", teinte: "t2", cle: "bases", cible: 1, condition: "Termine tous les modules du niveau Bases d’une formation." },
    { id: "serie-3", nom: "Série de 3" + N + "jours", icone: "eclair", teinte: "t3", cle: "serie", cible: 3, condition: "Sois actif 3" + N + "jours de suite (leçon, révision, quiz ou question du jour)." },
    { id: "serie-7", nom: "Série de 7" + N + "jours", icone: "sablier", teinte: "t6", cle: "serie", cible: 7, condition: "Sois actif 7" + N + "jours de suite." },
    { id: "serie-30", nom: "Série de 30" + N + "jours", icone: "trophee", teinte: "t4", cle: "serie", cible: 30, condition: "Sois actif 30" + N + "jours de suite." },
    { id: "cartes-100", nom: "100" + N + "cartes révisées", icone: "carnet", teinte: "t1", cle: "cartes", cible: 100, condition: "Révise 100" + N + "cartes différentes." },
    { id: "duel", nom: "Premier duel ou salon", icone: "epee", teinte: "t4", cle: "duel", cible: 1, condition: "Joue ou lance un duel ou un salon." },
    { id: "direct", nom: "Partie en direct", icone: "cercle", teinte: "t6", cle: "direct", cible: 1, condition: "Termine une partie en direct." },
    { id: "xp-1000", nom: "1" + F + "000" + N + "XP", icone: "medaille", teinte: "t3", cle: "xp", cible: 1000, condition: "Gagne 1" + F + "000" + N + "XP." }
  ];
  function calculerBadges(etat, auj) {
    var st = statistiques(etat, auj);
    return BADGES.map(function (b) {
      var v = st[b.cle];
      return { id: b.id, nom: b.nom, icone: b.icone, teinte: b.teinte, condition: b.condition, valeur: Math.min(v, b.cible), cible: b.cible, obtenu: v >= b.cible };
    });
  }
  /* Badges obtenus : union des deux appareils, la plus ancienne date gardée (une date vide = obtenu avant le suivi). */
  function fusionnerBadges(a, b) {
    if (!a && !b) return null;
    var r = {};
    [a || {}, b || {}].forEach(function (o) {
      Object.keys(o).forEach(function (k) {
        var d = typeof o[k] === "string" ? o[k] : "";
        if (r[k] === undefined || (d && (!r[k] || d < r[k]))) r[k] = d;
      });
    });
    return r;
  }

  /* ---------- Cours vérifiés à la main ----------
     Un titre qui contient le mot clé d'un domaine vérifié (sans accents, mot entier) ouvre le cours de ce domaine.
     Le plus précis d'abord : gemmologie, puis arts, sciences, histoire. */
  var DOMAINES = [
    ["v-gj", /(?:^|[^a-z0-9])(?:gemmologie|joaillerie|pierres?)(?![a-z0-9])/],
    ["v-ac", /(?:^|[^a-z0-9])(?:arts?|culture)(?![a-z0-9])/],
    ["v-sn", /(?:^|[^a-z0-9])(?:sciences?|nature)(?![a-z0-9])/],
    ["v-hg", /(?:^|[^a-z0-9])(?:histoire|geographie)(?![a-z0-9])/]
  ];
  function sansAccent(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function domaineVerifie(titre) {
    var t = sansAccent(titre);
    for (var k = 0; k < DOMAINES.length; k++) if (DOMAINES[k][1].test(t)) return DOMAINES[k][0];
    return null;
  }

  /* ---------- Tests et certificats de fin de niveau ----------
     Un niveau est fini quand tous ses modules sont ouverts et que leur dernière leçon est faite. Le test tire 15 questions parmi
     celles déjà écrites dans les leçons du niveau (aucune IA) ; il est réussi à 70 %. Résultat : etat.parcours[id].tests[niveau]
     = { pct, justes, n, date, ok }. Le niveau suivant n'est jamais verrouillé ; seul le certificat exige le test réussi. */
  var TEST_QUESTIONS = 15, TEST_SEUIL = 70, TEST_MIN = 5;

  function niveauFini(p, niv, fait) {
    if (!p || !niv || !niv.modules || !niv.modules.length) return false;
    var ouverts = {};
    (p.etapes || []).forEach(function (e) { ouverts[e.numero] = e; });
    return niv.modules.every(function (m) { var e = ouverts[m.numero], l = (e && e.paliers) || []; return l.length > 0 && l[l.length - 1].numero <= (Number(fait) || 0); });
  }
  /* Numéros (globaux) des leçons d'un niveau, dans l'ordre. */
  function leconsDuNiveau(p, niv) {
    var numeros = {}, l = [];
    ((niv && niv.modules) || []).forEach(function (m) { numeros[m.numero] = 1; });
    (p.etapes || []).forEach(function (e) { if (numeros[e.numero]) (e.paliers || []).forEach(function (x) { l.push(x.numero); }); });
    return l.sort(function (a, b) { return a - b; });
  }
  function questionValide(q) {
    if (!q || typeof q !== "object") return false;
    if (q.type === "vraifaux") return typeof q.affirmation === "string" && typeof q.vrai === "boolean";
    if (q.type === "ordre") return typeof q.enonce === "string" && Array.isArray(q.ordre) && Array.isArray(q.elements) && q.ordre.length >= 2;
    return typeof q.enonce === "string" && Array.isArray(q.reponses) && q.reponses.length >= 2 && Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < q.reponses.length;
  }
  /* lecons : [{ id, titre, questions }] (leçons déjà écrites). Tire n questions valides, réparties entre les leçons (une par leçon à tour de rôle,
     leçons et questions mélangées), puis mélange le tout. alea : () => [0, 1[ (Math.random par défaut). Renvoie [{ palier, titre, index, question }]. */
  function tirerTest(lecons, n, alea) {
    alea = alea || Math.random;
    function melanger(l) { l = l.slice(); for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(alea() * (i + 1)), x = l[i]; l[i] = l[j]; l[j] = x; } return l; }
    var files = melanger((lecons || []).map(function (l) {
      return melanger(((l && l.questions) || []).map(function (q, i) { return { palier: l.id, titre: l.titre, index: i, question: q }; }).filter(function (x) { return questionValide(x.question); }));
    }).filter(function (f) { return f.length; }));
    var pris = [], reste = true;
    while (pris.length < n && reste) {
      reste = false;
      for (var k = 0; k < files.length && pris.length < n; k++) if (files[k].length) { pris.push(files[k].shift()); reste = true; }
    }
    return melanger(pris);
  }
  function resultatTest(justes, n) {
    var pct = n > 0 ? Math.round(justes / n * 100) : 0;
    return { justes: justes, n: n, pct: pct, ok: n > 0 && pct >= TEST_SEUIL };
  }
  function testValide(t) { return !!t && typeof t === "object" && Number.isFinite(t.pct) && Number.isFinite(t.justes) && Number.isFinite(t.n) && typeof t.date === "string"; }
  /* Garde le meilleur : un test réussi reste réussi (avec sa date, celle du certificat) ; sinon le meilleur score. */
  function majTest(ancien, r, auj) {
    var a = testValide(ancien) ? ancien : null;
    if (a && a.ok) return a;
    if (r.ok || !a || r.pct > a.pct) return { pct: r.pct, justes: r.justes, n: r.n, date: auj, ok: !!r.ok };
    return a;
  }
  function testReussi(suivi, niveau) { var t = suivi && suivi.tests && suivi.tests[niveau]; return testValide(t) && t.ok === true; }
  /* Fusion de deux appareils : réussi avant non réussi ; deux réussis, le plus ancien ; sinon le meilleur score. */
  function fusionnerTests(a, b) {
    var r = {};
    [a || {}, b || {}].forEach(function (o) {
      Object.keys(o).forEach(function (k) {
        var t = o[k];
        if (!testValide(t)) return;
        var c = r[k];
        var garde = !c || (t.ok && !c.ok) || (t.ok === c.ok && (t.ok ? t.date < c.date : t.pct > c.pct));
        if (garde) r[k] = { pct: t.pct, justes: t.justes, n: t.n, date: t.date, ok: !!t.ok };
      });
    });
    return r;
  }
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  /* « 2026-10-20 » -> « 20 octobre 2026 » (« 1er » le premier du mois). Chaîne vide si la date est illisible. */
  function dateLongue(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return "";
    return (+m[3] === 1 ? "1er" : String(+m[3])) + N + MOIS[+m[2] - 1] + N + m[1];
  }

  /* ---------- Lecture à voix haute ----------
     Le texte est coupé en morceaux courts (certains navigateurs coupent une lecture trop longue). Un titre est un morceau à part. */
  function decouperLecture(texte, max) {
    max = max || 200;
    var t = String(texte || "").replace(/\s+/g, " ").trim();
    if (!t) return [];
    var phrases = t.match(/[^.!?…]+[.!?…]*\s*/g) || [t], morceaux = [], cur = "";
    function pousser(x) { x = x.trim(); if (x) morceaux.push(x); }
    phrases.forEach(function (ph) {
      while (ph.length > max) { // phrase trop longue : coupée à la dernière virgule ou au dernier espace avant max
        var coupe = Math.max(ph.lastIndexOf(", ", max), ph.lastIndexOf("; ", max)), cut = coupe > max / 3 ? coupe + 1 : ph.lastIndexOf(" ", max);
        if (cut <= 0) cut = max;
        pousser(cur); cur = "";
        pousser(ph.slice(0, cut)); ph = ph.slice(cut);
      }
      if ((cur + ph).length > max) { pousser(cur); cur = ph; } else cur += ph;
    });
    pousser(cur);
    return morceaux;
  }
  /* parties : [{ titre, texte }] -> liste de morceaux à dire, dans l'ordre (titre puis texte). */
  function segmentsVoix(parties, max) {
    var l = [];
    (parties || []).forEach(function (p) {
      if (!p) return;
      var corps = decouperLecture(p.texte, max);
      if (!corps.length) return;
      if (p.titre) l.push(String(p.titre).replace(/[\s.!?:]*$/, "") + ".");
      corps.forEach(function (x) { l.push(x); });
    });
    return l;
  }

  g.Logique = {
    INTERVALLES: INTERVALLES, SEANCE: SEANCE, BADGES: BADGES,
    plusJours: plusJours, ecartJours: ecartJours, dateDe: dateDe,
    nouvelleEntree: nouvelleEntree, repondre: repondre, echu: echu, elements: elements, fileDuJour: fileDuJour,
    prochaineRevision: prochaineRevision, fusionnerRevisions: fusionnerRevisions, elaguerRevisions: elaguerRevisions,
    jourNormal: jourNormal, jourActif: jourActif, normaliserJours: normaliserJours, fusionnerJours: fusionnerJours,
    serieActuelle: serieActuelle, meilleureSerie: meilleureSerie,
    statistiques: statistiques, calculerBadges: calculerBadges, fusionnerBadges: fusionnerBadges,
    domaineVerifie: domaineVerifie,
    TEST_QUESTIONS: TEST_QUESTIONS, TEST_SEUIL: TEST_SEUIL, TEST_MIN: TEST_MIN,
    niveauFini: niveauFini, leconsDuNiveau: leconsDuNiveau, questionValide: questionValide, tirerTest: tirerTest, resultatTest: resultatTest,
    majTest: majTest, testReussi: testReussi, fusionnerTests: fusionnerTests, dateLongue: dateLongue,
    decouperLecture: decouperLecture, segmentsVoix: segmentsVoix
  };
})(typeof window !== "undefined" ? window : globalThis);
