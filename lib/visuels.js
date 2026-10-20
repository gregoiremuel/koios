// Visuels d'une leçon (lot 9A) : l'IA fournit des DONNÉES, jamais un dessin. Ce module les valide (tailles bornées, textes courts,
// nombres finis, aucun HTML) et les aplatit en affirmations pour le vérificateur. Le dessin est fait côté app (app/visuels.js).
// Un visuel invalide est retiré ; la leçon, elle, reste. Aucun secret.

export const TYPES_VISUELS = ['echelle', 'courbe', 'barres', 'tableau', 'frise', 'schema', 'carte_mentale'];
export const VISUELS_MAX = 2; // par leçon
export const TEXTE_VISUEL_MAX = 60;
const NOMBRE_MAX = 1e12;

const objet = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const longueur = (t) => [...t].length;

// Texte court : chaîne de 1 à 60 caractères (min..max), espaces réduits, sans caractère de contrôle ni HTML (< > &). Sinon null.
function texte(v, min = 1, max = TEXTE_VISUEL_MAX) {
  if (typeof v !== 'string') return null;
  const t = v.normalize('NFC').replace(/[ \t\r\n\f\v]+/g, ' ').replace(/[\p{Cc}​‎‏‪-‮⁦-⁩﻿]/gu, '').trim();
  const n = longueur(t);
  return n >= min && n <= max && !/[<>&]/.test(t) ? t : null;
}

// Nombre fini et raisonnable (pas de texte, pas de NaN ni d'infini), sinon null.
function nombre(v) {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= NOMBRE_MAX ? v : null;
}

// Unité facultative : texte de 0 à 20 caractères ; invalide -> null (le visuel est refusé).
function unite(v) {
  if (v === undefined || v === null || v === '') return '';
  return texte(v, 1, 20);
}

const liste = (v, min, max) => (Array.isArray(v) && v.length >= min && v.length <= max ? v : null);

function echelle(v) {
  const titre = texte(v.titre);
  const u = unite(v.unite);
  const points = liste(v.points, 3, 10);
  if (!titre || u === null || !points) return null;
  const sortie = [];
  for (const p of points) {
    if (!objet(p)) return null;
    const etiquette = texte(p.etiquette);
    const valeur = nombre(p.valeur);
    if (!etiquette || valeur === null) return null;
    if (sortie.length && valeur <= sortie[sortie.length - 1].valeur) return null; // valeurs strictement croissantes
    sortie.push({ etiquette, valeur });
  }
  return { type: 'echelle', titre, unite: u, points: sortie };
}

function axe(a) {
  if (!objet(a)) return null;
  const nom = texte(a.nom);
  const u = unite(a.unite);
  return nom && u !== null ? { nom, unite: u } : null;
}

function courbe(v) {
  const titre = texte(v.titre);
  const x = axe(v.x);
  const y = axe(v.y);
  const series = liste(v.series, 1, 3);
  if (!titre || !x || !y || !series) return null;
  const sortie = [];
  for (const s of series) {
    if (!objet(s)) return null;
    const nom = texte(s.nom);
    const pts = liste(s.points, 3, 12);
    if (!nom || !pts) return null;
    const points = [];
    for (const p of pts) {
      if (!Array.isArray(p) || p.length !== 2) return null;
      const px = nombre(p[0]);
      const py = nombre(p[1]);
      if (px === null || py === null) return null;
      if (points.length && px <= points[points.length - 1][0]) return null; // x strictement croissant
      points.push([px, py]);
    }
    sortie.push({ nom, points });
  }
  return { type: 'courbe', titre, x, y, series: sortie };
}

function barres(v) {
  const titre = texte(v.titre);
  const u = unite(v.unite);
  const liste8 = liste(v.barres, 2, 8);
  if (!titre || u === null || !liste8) return null;
  const sortie = [];
  for (const b of liste8) {
    if (!objet(b)) return null;
    const etiquette = texte(b.etiquette);
    const valeur = nombre(b.valeur);
    if (!etiquette || valeur === null || valeur < 0) return null;
    sortie.push({ etiquette, valeur });
  }
  return { type: 'barres', titre, unite: u, barres: sortie };
}

function tableau(v) {
  const titre = texte(v.titre);
  const colonnes = liste(v.colonnes, 2, 4);
  const lignes = liste(v.lignes, 1, 6);
  if (!titre || !colonnes || !lignes) return null;
  const cols = colonnes.map((c) => texte(c));
  if (cols.some((c) => c === null)) return null;
  const sortie = [];
  for (const l of lignes) {
    if (!Array.isArray(l) || l.length !== cols.length) return null;
    const cellules = l.map((c) => texte(typeof c === 'number' && Number.isFinite(c) ? String(c) : c));
    if (cellules.some((c) => c === null)) return null;
    sortie.push(cellules);
  }
  return { type: 'tableau', titre, colonnes: cols, lignes: sortie };
}

// Année d'une date de frise (« 1889 », « 12 mars 1889 », « 44 av. J.-C. »), ou null. Négative avant J.-C.
// On prend le nombre de 3 ou 4 chiffres (« 12 mars 1890 » -> 1890), sinon le dernier nombre ; « av. » ne compte que juste après ce nombre
// (« Avant 1914 » reste 1914).
export function anneeDe(date) {
  const s = String(date);
  const tous = [...s.matchAll(/\d+/g)];
  if (!tous.length) return null;
  const m = tous.find((x) => /^\d{3,4}$/.test(x[0])) || tous[tous.length - 1];
  const apres = s.slice(m.index + m[0].length);
  return /^\s*(?:av\.|avant\b)/i.test(apres) ? -Number(m[0]) : Number(m[0]);
}

function frise(v) {
  const titre = texte(v.titre);
  const evts = liste(v.evenements, 2, 8);
  if (!titre || !evts) return null;
  const sortie = [];
  let precedente = -Infinity;
  for (const e of evts) {
    if (!objet(e)) return null;
    const date = texte(e.date, 1, 40);
    const t = texte(e.texte);
    const annee = date ? anneeDe(date) : null;
    if (!date || !t || annee === null || annee < precedente) return null; // dates croissantes
    precedente = annee;
    sortie.push({ date, texte: t });
  }
  return { type: 'frise', titre, evenements: sortie };
}

function schema(v) {
  const titre = texte(v.titre);
  const noeuds = liste(v.noeuds, 2, 8);
  if (!titre || !noeuds) return null;
  const ns = [];
  const ids = new Set();
  for (const n of noeuds) {
    if (!objet(n)) return null;
    const id = typeof n.id === 'string' && /^[a-z0-9_-]{1,20}$/.test(n.id) ? n.id : null;
    const t = texte(n.texte);
    if (!id || !t || ids.has(id)) return null;
    ids.add(id);
    ns.push({ id, texte: t });
  }
  const liens = [];
  if (v.liens !== undefined && v.liens !== null) {
    if (!Array.isArray(v.liens) || v.liens.length > 12) return null;
    const vus = new Set();
    for (const l of v.liens) {
      if (!objet(l) || !ids.has(l.de) || !ids.has(l.vers) || l.de === l.vers) return null;
      const t = l.texte === undefined || l.texte === null || l.texte === '' ? null : texte(l.texte, 1, 40);
      if (l.texte !== undefined && l.texte !== null && l.texte !== '' && !t) return null;
      const cle = l.de + '>' + l.vers;
      if (vus.has(cle)) return null; // lien en double : refusé
      vus.add(cle);
      liens.push({ de: l.de, vers: l.vers, ...(t ? { texte: t } : {}) });
    }
  }
  return { type: 'schema', titre, noeuds: ns, liens };
}

function carteMentale(v) {
  const centre = texte(v.centre);
  const branches = liste(v.branches, 2, 6);
  if (!centre || !branches) return null;
  const sortie = [];
  for (const b of branches) {
    if (!objet(b)) return null;
    const t = texte(b.texte);
    if (!t) return null;
    let sous = [];
    if (b.sous !== undefined && b.sous !== null) {
      if (!Array.isArray(b.sous) || b.sous.length > 4) return null;
      sous = b.sous.map((s) => texte(s));
      if (sous.some((s) => s === null)) return null;
    }
    sortie.push({ texte: t, sous });
  }
  return { type: 'carte_mentale', centre, branches: sortie };
}

const VALIDEURS = { echelle, courbe, barres, tableau, frise, schema, carte_mentale: carteMentale };

// Un visuel brut -> visuel normalisé, ou null s'il est invalide (type inconnu, taille, texte, nombre, ordre…).
export function validerVisuel(v) {
  if (!objet(v) || typeof v.type !== 'string' || !Object.hasOwn(VALIDEURS, v.type)) return null;
  try {
    return VALIDEURS[v.type](v);
  } catch {
    return null;
  }
}

// Liste brute -> 0 à 2 visuels valides ; les invalides sont écartés, jamais de refus de la leçon.
export function validerVisuels(v) {
  if (!Array.isArray(v)) return [];
  const sortie = [];
  for (const brut of v.slice(0, 6)) {
    const ok = validerVisuel(brut);
    if (ok) sortie.push(ok);
    if (sortie.length >= VISUELS_MAX) break;
  }
  return sortie;
}

const avecUnite = (valeur, u) => `${valeur}${u ? ` ${u}` : ''}`;

// Visuel -> lignes d'affirmations pour le vérificateur (une par point, barre, série, ligne, événement ou lien).
export function aplatirVisuel(v) {
  switch (v.type) {
    case 'echelle':
      return v.points.map((p) => `${v.titre} : ${p.etiquette} = ${avecUnite(p.valeur, v.unite)}`);
    case 'courbe':
      return v.series.map((s) => `${v.titre} (${s.nom}) : ${s.points.map(([x, y]) => `${v.x.nom} ${avecUnite(x, v.x.unite)} donne ${v.y.nom} ${avecUnite(y, v.y.unite)}`).join(' ; ')}`);
    case 'barres':
      return v.barres.map((b) => `${v.titre} : ${b.etiquette} = ${avecUnite(b.valeur, v.unite)}`);
    case 'tableau':
      return v.lignes.map((l) => `${v.titre} : ${l.map((c, i) => `${v.colonnes[i]} ${c}`).join(', ')}`);
    case 'frise':
      return v.evenements.map((e) => `${v.titre} : ${e.date}, ${e.texte}`);
    case 'schema': {
      const nom = new Map(v.noeuds.map((n) => [n.id, n.texte]));
      if (!v.liens.length) return v.noeuds.map((n) => `${v.titre} : ${n.texte}`);
      return v.liens.map((l) => `${v.titre} : ${nom.get(l.de)} mène à ${nom.get(l.vers)}${l.texte ? ` (${l.texte})` : ''}`);
    }
    case 'carte_mentale':
      return v.branches.map((b) => `${v.centre} : ${b.texte}${b.sous.length ? ` (${b.sous.join(', ')})` : ''}`);
    default:
      return [];
  }
}
