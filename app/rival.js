/* Le Rival de Koîos : un renard bibliothécaire de profil, gravé comme un ex-libris (traits d'encre bordeaux dans un cachet rond),
   demi-lunes sur le museau et crayon derrière l'oreille.
   Usage : rivalSVG("malin" | "ravi" | "vexe" | "explique", taille) -> chaîne SVG. Dessin original. */
(function (global) {
  var E = "#6f2330", P = "#fffdf8";
  function t(d, l) { return '<path d="' + d + '" stroke="' + E + '" stroke-width="' + (l || 2.4) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function f(d, l) { return '<path d="' + d + '" fill="' + P + '" stroke="' + E + '" stroke-width="' + (l || 2.4) + '" stroke-linejoin="round"/>'; }
  function o(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 2.4) + '" fill="' + E + '"/>'; }
  var VISAGE = {
    malin: t("M73 53 Q79 49 86 52", 2.2) + o(81, 53, 2.3) + t("M71 47 L86 49", 2) + t("M103 75 Q96 77 91 73", 2.2),
    ravi: t("M73 54 Q79 48 86 54", 2.4) + t("M71 46 Q78 43 86 46", 2) + t("M104 75 Q95 80 89 71", 2.2),
    vexe: t("M73 53 L86 53", 2.2) + o(80, 55, 2.1) + t("M72 46 L86 50", 2) + t("M104 75 Q97 76 91 79", 2.2),
    explique: t("M73 53 Q79 47 86 52", 2.2) + o(80, 53, 2.6) + t("M71 44 Q78 41 86 44", 2) + '<path d="M105 74 L91 76 Q97 81 104 77 Z" fill="' + E + '"/>'
  };
  var NOMS = { malin: "l’air malin", ravi: "ravi", vexe: "boudeur", explique: "en train d’expliquer" };
  function rivalSVG(humeur, taille) {
    humeur = VISAGE[humeur] ? humeur : "malin";
    taille = taille || 56;
    return '<svg class="rival-svg" viewBox="0 0 132 132" width="' + taille + '" height="' + taille + '" role="img" aria-label="Le Rival, renard bibliothécaire, ' + NOMS[humeur] + '">' +
      '<circle cx="66" cy="66" r="63" fill="' + P + '" stroke="' + E + '" stroke-width="2.4"/>' +
      '<circle cx="66" cy="66" r="57" fill="none" stroke="' + E + '" stroke-width="1" stroke-dasharray="1.5 3"/>' +
      '<g transform="rotate(-32 50 34)">' + f("M27 31 h40 v6 h-40 Z", 2) + f("M67 31 L75 34 L67 37 Z", 2) + t("M33 31 v6", 1.4) + '</g>' +
      f("M42 117 C35 100 33 82 38 66 C40 58 42 52 46 46 L51 15 L66 41 C72 41 78 44 82 48 C90 54 102 59 113 63 C117 64 118 69 114 71 C106 74 98 76 90 77 C88 80 86 83 82 85 L85 90 L76 92 L79 97 L69 99 L71 104 L61 106 L63 117 Z") +
      '<path d="M51 15 L56.6 24 L49.6 24.5 Z" fill="' + E + '"/>' + t("M52 23 Q55 34 61 41", 1.6) + t("M51 30 Q53 37 57 41", 1.2) +
      t("M88 62 C84 68 82 75 80 84", 1.6) + t("M44 88 Q49 94 47 102", 1.4) + t("M52 92 Q56 98 54 106", 1.2) +
      '<ellipse cx="114" cy="66.5" rx="3.4" ry="2.8" fill="' + E + '"/>' + o(101, 67, 0.9) + o(105, 68.5, 0.9) +
      t("M88 59 H101 A6.5 5.5 0 0 1 88 59 Z", 1.8) + t("M88 60 L64 52", 1.4) +
      VISAGE[humeur] +
      '</svg>';
  }
  global.rivalSVG = rivalSVG;
})(window);
