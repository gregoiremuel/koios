/* Le Rival de Koîos : un renard bibliothécaire à lunettes. Dessin original.
   Usage : rivalSVG("malin" | "ravi" | "vexe" | "explique", taille) -> chaîne SVG. */
(function (global) {
  var C = {
    poil: "#d9773a", ombre: "#b85f2a", creme: "#fbefdf", encre: "#3a2a22",
    oreille: "#f2c9a0", echarpe: "#8e2f3c", echarpe2: "#6f2330", verre: "#ffffff"
  };
  var YEUX = {
    malin: '<path d="M44 63 q6 -5 12 0" stroke="' + C.encre + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
           '<ellipse cx="76" cy="62" rx="3.4" ry="4.2" fill="' + C.encre + '"/>' +
           '<path d="M40 50 l15 3" stroke="' + C.encre + '" stroke-width="3" stroke-linecap="round"/>' +
           '<path d="M70 49 q7 -6 14 -2" stroke="' + C.encre + '" stroke-width="3" fill="none" stroke-linecap="round"/>',
    ravi: '<path d="M43 64 q7 -8 14 0" stroke="' + C.encre + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
          '<path d="M69 64 q7 -8 14 0" stroke="' + C.encre + '" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
          '<path d="M41 49 q8 -5 15 -1" stroke="' + C.encre + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
          '<path d="M70 48 q8 -4 15 1" stroke="' + C.encre + '" stroke-width="3" fill="none" stroke-linecap="round"/>',
    vexe: '<ellipse cx="51" cy="63" rx="3.2" ry="3.6" fill="' + C.encre + '"/>' +
          '<ellipse cx="75" cy="63" rx="3.2" ry="3.6" fill="' + C.encre + '"/>' +
          '<path d="M42 51 l14 5" stroke="' + C.encre + '" stroke-width="3.2" stroke-linecap="round"/>' +
          '<path d="M84 51 l-14 5" stroke="' + C.encre + '" stroke-width="3.2" stroke-linecap="round"/>',
    explique: '<ellipse cx="51" cy="62" rx="3.4" ry="4.4" fill="' + C.encre + '"/>' +
              '<ellipse cx="75" cy="62" rx="3.4" ry="4.4" fill="' + C.encre + '"/>' +
              '<circle cx="52.3" cy="60.6" r="1.1" fill="#fff"/><circle cx="76.3" cy="60.6" r="1.1" fill="#fff"/>' +
              '<path d="M42 49 q8 -6 15 -2" stroke="' + C.encre + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
              '<path d="M69 47 q8 -4 15 2" stroke="' + C.encre + '" stroke-width="3" fill="none" stroke-linecap="round"/>'
  };
  var BOUCHE = {
    malin: '<path d="M58 103 q7 4 13 -2" stroke="' + C.encre + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    ravi: '<path d="M56 100 q7 9 14 0 z" fill="' + C.encre + '"/><path d="M59 103 q4 3.5 8 0" fill="#e07a6a"/>',
    vexe: '<path d="M57 105 q6 -4 12 0" stroke="' + C.encre + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
    explique: '<ellipse cx="63" cy="103" rx="4" ry="3" fill="' + C.encre + '"/>'
  };
  function rivalSVG(humeur, taille) {
    humeur = YEUX[humeur] ? humeur : "malin";
    taille = taille || 64;
    return '<svg class="rival-svg" viewBox="0 0 126 136" width="' + taille + '" height="' + Math.round(taille * 136 / 126) + '" role="img" aria-label="Le Rival, ' +
      ({ malin: "l’air malin", ravi: "ravi", vexe: "vexé", explique: "en train d’expliquer" })[humeur] + '">' +
      /* écharpe */

      /* oreilles */
      '<path d="M22 46 L30 8 L56 34 Z" fill="' + C.poil + '"/><path d="M29 38 L33 18 L47 33 Z" fill="' + C.oreille + '"/>' +
      '<path d="M104 46 L96 8 L70 34 Z" fill="' + C.poil + '"/><path d="M97 38 L93 18 L79 33 Z" fill="' + C.oreille + '"/>' +
      '<path d="M30 8 L27 22 L36 17 Z" fill="' + C.encre + '"/><path d="M96 8 L99 22 L90 17 Z" fill="' + C.encre + '"/>' +
      /* tête */
      '<path d="M18 62 L8 72 L19 74 L12 84 L28 82 Z" fill="' + C.poil + '"/><path d="M108 62 L118 72 L107 74 L114 84 L98 82 Z" fill="' + C.poil + '"/>' +
      '<path d="M63 24 C90 24 108 40 108 60 C108 74 100 84 90 92 L63 112 L36 92 C26 84 18 74 18 60 C18 40 36 24 63 24 Z" fill="' + C.poil + '"/>' +
      '<path d="M63 26 C70 26 76 27 82 29 C74 34 68 42 63 50 C58 42 52 34 44 29 C50 27 56 26 63 26 Z" fill="' + C.ombre + '" opacity="0.55"/>' +
      /* museau crème */
      '<path d="M22 70 C32 74 48 76 63 86 C78 76 94 74 104 70 C100 80 94 86 88 92 L63 112 L38 92 C32 86 26 80 22 70 Z" fill="' + C.creme + '"/>' +
      /* yeux et sourcils */
      YEUX[humeur] +
      /* lunettes */
      '<circle cx="51" cy="62" r="9.5" fill="' + C.verre + '" fill-opacity="0.18" stroke="' + C.encre + '" stroke-width="2.4"/>' +
      '<circle cx="75" cy="62" r="9.5" fill="' + C.verre + '" fill-opacity="0.18" stroke="' + C.encre + '" stroke-width="2.4"/>' +
      '<path d="M62 60 q1 -3 2 0" stroke="' + C.encre + '" stroke-width="2.4" fill="none"/>' +
      '<path d="M41.5 60 L24 56 M84.5 60 L102 56" stroke="' + C.encre + '" stroke-width="2" stroke-linecap="round"/>' +
      /* nez et bouche */
      '<path d="M58 92 q5 -3 10 0 q-2 5 -5 6 q-3 -1 -5 -6 z" fill="' + C.encre + '"/>' +
      BOUCHE[humeur] +
      /* écharpe nouée sous le menton */
      '<path d="M32 98 Q63 124 94 98 L100 112 Q63 138 26 112 Z" fill="' + C.echarpe + '"/>' +
      '<path d="M80 116 l11 16 l-13 1 l-5 -14 z" fill="' + C.echarpe2 + '"/>' +
      '</svg>';
  }
  global.rivalSVG = rivalSVG;
})(window);
