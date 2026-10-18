/* Le Rival de Koîos : un renard bibliothécaire (demi-lunes, crayon à l'oreille, nœud papillon). Dessin original.
   Usage : rivalSVG("malin" | "ravi" | "vexe" | "explique", taille) -> chaîne SVG. */
(function (global) {
  var C = {
    poil: "#d9773a", ombre: "#b85f2a", creme: "#fbefdf", encre: "#3a2a22", oreille: "#f2c9a0",
    noeud: "#3e7a5a", noeud2: "#2c5a41", crayon: "#e8c25a", bois: "#f2c9a0", gomme: "#e7b9b9"
  };
  function trait(d, l) { return '<path d="' + d + '" stroke="' + C.encre + '" stroke-width="' + (l || 3) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function oeil(x, y, r) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (r || 3.4) + '" ry="' + ((r || 3.4) + 0.9) + '" fill="' + C.encre + '"/>'; }
  var VISAGE = {
    /* il taquine : un œil plissé, un sourcil levé, sourire en coin */
    malin: trait("M44 62 q6 -4 12 0", 3.2) + oeil(75, 61) + trait("M41 51 l15 2") + trait("M69 47 q7 -6 15 -2") +
           trait("M57 103 q7 4 13 -2", 2.6),
    /* tu t'es trompé : yeux rieurs, bouche ouverte */
    ravi: trait("M43 63 q7 -8 14 0", 3.2) + trait("M69 63 q7 -8 14 0", 3.2) + trait("M41 49 q8 -5 15 -1") + trait("M70 48 q8 -4 15 1") +
          '<path d="M56 100 q7 9 14 0 z" fill="' + C.encre + '"/><path d="M59 103 q4 3.5 8 0" fill="#e07a6a"/>',
    /* tu as eu juste : il boude, regard de côté */
    vexe: oeil(55, 62, 3) + oeil(79, 62, 3) + trait("M42 52 l14 0") + trait("M70 52 l14 0") + trait("M58 105 l10 -1", 2.6),
    /* il explique : yeux ouverts, un sourcil levé, petit sourire */
    explique: oeil(51, 61) + oeil(75, 61) + '<circle cx="52.3" cy="59.6" r="1.1" fill="#fff"/><circle cx="76.3" cy="59.6" r="1.1" fill="#fff"/>' +
              trait("M41 47 q8 -7 16 -3") + trait("M69 50 q8 -2 15 1") + trait("M58 102 q5 3 10 0", 2.6)
  };
  var NOMS = { malin: "l’air malin", ravi: "ravi", vexe: "boudeur", explique: "en train d’expliquer" };
  function rivalSVG(humeur, taille) {
    humeur = VISAGE[humeur] ? humeur : "malin";
    taille = taille || 64;
    return '<svg class="rival-svg" viewBox="0 0 126 132" width="' + taille + '" height="' + Math.round(taille * 132 / 126) + '" role="img" aria-label="Le Rival, ' + NOMS[humeur] + '">' +
      /* oreilles */
      '<path d="M22 46 L30 8 L56 34 Z" fill="' + C.poil + '"/><path d="M29 38 L33 18 L47 33 Z" fill="' + C.oreille + '"/>' +
      '<path d="M104 46 L96 8 L70 34 Z" fill="' + C.poil + '"/><path d="M97 38 L93 18 L79 33 Z" fill="' + C.oreille + '"/>' +
      '<path d="M30 8 L27 22 L36 17 Z" fill="' + C.encre + '"/><path d="M96 8 L99 22 L90 17 Z" fill="' + C.encre + '"/>' +
      /* crayon glissé derrière l'oreille droite */
      '<g transform="rotate(-38 104 30)"><rect x="84" y="26" width="34" height="7" rx="1.5" fill="' + C.crayon + '"/>' +
      '<rect x="114" y="26" width="6" height="7" rx="1.5" fill="' + C.gomme + '"/><path d="M84 26 L76 29.5 L84 33 Z" fill="' + C.bois + '"/>' +
      '<path d="M78.6 28.3 L76 29.5 L78.6 30.7 Z" fill="' + C.encre + '"/></g>' +
      /* touffes de joues et tête */
      '<path d="M18 62 L8 72 L19 74 L12 84 L28 82 Z" fill="' + C.poil + '"/><path d="M108 62 L118 72 L107 74 L114 84 L98 82 Z" fill="' + C.poil + '"/>' +
      '<path d="M63 24 C90 24 108 40 108 60 C108 74 100 84 90 92 L63 112 L36 92 C26 84 18 74 18 60 C18 40 36 24 63 24 Z" fill="' + C.poil + '"/>' +
      '<path d="M63 24 C70 24 76 25 82 27 C74 32 68 40 63 48 C58 40 52 32 44 27 C50 25 56 24 63 24 Z" fill="' + C.ombre + '" opacity="0.55"/>' +
      '<path d="M22 70 C32 74 48 76 63 86 C78 76 94 74 104 70 C100 80 94 86 88 92 L63 112 L38 92 C32 86 26 80 22 70 Z" fill="' + C.creme + '"/>' +
      VISAGE[humeur] +
      /* demi-lunes posées sur le museau : il regarde par-dessus */
      '<path d="M41 70 h18 a9 8 0 0 1 -18 0 Z" fill="#ffffff" fill-opacity="0.35" stroke="' + C.encre + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M67 70 h18 a9 8 0 0 1 -18 0 Z" fill="#ffffff" fill-opacity="0.35" stroke="' + C.encre + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      trait("M59 71 q4 -3 8 0", 2) + trait("M41 70 L26 64 M85 70 L100 64", 1.8) +
      /* nez */
      '<path d="M58 90 q5 -3 10 0 q-2 5 -5 6 q-3 -1 -5 -6 z" fill="' + C.encre + '"/>' +
      /* nœud papillon */
      '<path d="M63 116 L44 106 L44 126 Z" fill="' + C.noeud + '"/><path d="M63 116 L82 106 L82 126 Z" fill="' + C.noeud + '"/>' +
      '<rect x="58" y="110" width="10" height="11" rx="3" fill="' + C.noeud2 + '"/>' +
      '</svg>';
  }
  global.rivalSVG = rivalSVG;
})(window);
