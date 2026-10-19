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

  g.Logique = {
    INTERVALLES: INTERVALLES, SEANCE: SEANCE, BADGES: BADGES,
    plusJours: plusJours, ecartJours: ecartJours, dateDe: dateDe,
    nouvelleEntree: nouvelleEntree, repondre: repondre, echu: echu, elements: elements, fileDuJour: fileDuJour,
    prochaineRevision: prochaineRevision, fusionnerRevisions: fusionnerRevisions, elaguerRevisions: elaguerRevisions,
    jourNormal: jourNormal, jourActif: jourActif, normaliserJours: normaliserJours, fusionnerJours: fusionnerJours,
    serieActuelle: serieActuelle, meilleureSerie: meilleureSerie,
    statistiques: statistiques, calculerBadges: calculerBadges, fusionnerBadges: fusionnerBadges,
    domaineVerifie: domaineVerifie
  };
})(typeof window !== "undefined" ? window : globalThis);
