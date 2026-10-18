/* Le Rival de Koîos : un renard bibliothécaire dessiné comme un ex-libris (traits d'encre dans un cachet rond).
   Usage : rivalSVG("malin" | "ravi" | "vexe" | "explique", taille) -> chaîne SVG. Dessin original. */
(function (global) {
  var E = "#6f2330", P = "#fffdf8";
  function t(d, l) { return '<path d="' + d + '" stroke="' + E + '" stroke-width="' + (l || 2.6) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function f(d) { return '<path d="' + d + '" fill="' + P + '" stroke="' + E + '" stroke-width="2.6" stroke-linejoin="round"/>'; }
  function o(x, y, r) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (r || 3) + '" ry="' + ((r || 3) + 0.8) + '" fill="' + E + '"/>'; }
  var VISAGE = {
    malin: t("M44 62 q6 -4 12 0", 2.8) + o(75, 61) + t("M41 51 l15 2") + t("M69 47 q7 -6 15 -2") + t("M57 103 q7 4 13 -2", 2.4),
    ravi: t("M43 63 q7 -8 14 0", 2.8) + t("M69 63 q7 -8 14 0", 2.8) + t("M41 49 q8 -5 15 -1") + t("M70 48 q8 -4 15 1") + t("M56 100 q7 8 14 0", 2.4),
    vexe: o(55, 62, 2.7) + o(79, 62, 2.7) + t("M42 52 l14 0") + t("M70 52 l14 0") + t("M58 105 l10 -1", 2.4),
    explique: o(51, 61) + o(75, 61) + t("M41 47 q8 -7 16 -3") + t("M69 50 q8 -2 15 1") + t("M58 102 q5 3 10 0", 2.4)
  };
  var NOMS = { malin: "l’air malin", ravi: "ravi", vexe: "boudeur", explique: "en train d’expliquer" };
  function rivalSVG(humeur, taille) {
    humeur = VISAGE[humeur] ? humeur : "malin";
    taille = taille || 56;
    return '<svg class="rival-svg" viewBox="0 0 132 132" width="' + taille + '" height="' + taille + '" role="img" aria-label="Le Rival, ' + NOMS[humeur] + '">' +
      '<circle cx="66" cy="66" r="63" fill="' + P + '" stroke="' + E + '" stroke-width="2.4"/>' +
      '<circle cx="66" cy="66" r="57" fill="none" stroke="' + E + '" stroke-width="1" stroke-dasharray="1.5 3"/>' +
      '<g transform="translate(16 12) scale(0.79)">' +
        f("M22 46 L30 8 L56 34 Z") + f("M104 46 L96 8 L70 34 Z") + t("M30 36 L33 18 L45 32", 1.8) + t("M96 36 L93 18 L81 32", 1.8) +
        '<g transform="rotate(-38 104 30)">' + f("M84 26 h34 v7 h-34 Z") + t("M114 26 v7", 1.8) + f("M84 26 L76 29.5 L84 33 Z") + '</g>' +
        f("M18 62 L8 72 L19 74 L12 84 L28 82 Z") + f("M108 62 L118 72 L107 74 L114 84 L98 82 Z") +
        f("M63 24 C90 24 108 40 108 60 C108 74 100 84 90 92 L63 112 L36 92 C26 84 18 74 18 60 C18 40 36 24 63 24 Z") +
        t("M22 70 C32 74 48 76 63 86 C78 76 94 74 104 70", 2) +
        t("M58 34 q5 6 10 0", 1.6) +
        VISAGE[humeur] +
        t("M41 70 h18 a9 8 0 0 1 -18 0 Z", 2.2) + t("M67 70 h18 a9 8 0 0 1 -18 0 Z", 2.2) + t("M59 71 q4 -3 8 0", 1.8) + t("M41 70 L26 64 M85 70 L100 64", 1.6) +
        '<path d="M58 90 q5 -3 10 0 q-2 5 -5 6 q-3 -1 -5 -6 z" fill="' + E + '"/>' +
      '</g></svg>';
  }
  global.rivalSVG = rivalSVG;
})(window);
