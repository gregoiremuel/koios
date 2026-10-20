// Documents de référence (lot 10A) : PDF ajoutés par l'admin (cours, livrets, tableaux), découpés en morceaux et consultés SANS IA.
// Tout est programmé ici : découpage (150 à 250 mots, sur les titres et paragraphes, recouvrement de 20 mots), recherche BM25 simplifiée
// (mots sans accents, sans mots vides français), contrôle des mots identiques (jamais plus de 15 d'affilée).
// Les morceaux ne sont jamais servis aux joueurs : ils alimentent le rédacteur et le vérificateur (pages de langue « doc »).
// Aucune dépendance, aucun secret. Importé par functions/api/documents.js, lib/paliers.js et lib/nuit.js.
import { sansAccents } from './wiki.js';

export const MORCEAU_MIN = 150; // mots
export const MORCEAU_MAX = 250;
export const RECOUVREMENT = 20;
export const MORCEAUX_GARDES = 4; // meilleurs morceaux donnés à l'IA
export const MOTS_GARDES_MAX = 1200;
export const MOTS_IDENTIQUES_MAX = 15; // jamais plus de 15 mots consécutifs identiques au document
export const DOC_OCTETS_MAX = 2 * 1024 * 1024; // 2 Mo de texte par document
export const TOTAL_OCTETS_MAX = 20 * 1024 * 1024; // 20 Mo au total
export const PAQUET_CARACTERES_MAX = 60000; // un paquet d'envoi : environ 50 ko de texte

// --- Découpage ----------------------------------------------------------------

const MOTS_PAR_SEGMENT = 200; // un bloc plus long que MORCEAU_MAX est coupé (phrases d'abord)

// Texte d'une page -> blocs {mots, titre}. Un bloc = paragraphes séparés par une ligne vide ; un bloc court d'une ligne sans point final est un titre.
function blocsDe(texte) {
  const propre = String(texte || '').replace(/\r/g, '').replace(/\f/g, '\n\n').replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2');
  const blocs = [];
  for (const brut of propre.split(/\n[ \t]*\n/)) {
    const lignes = brut.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!lignes.length) continue;
    const mots = lignes.join(' ').split(' ');
    const titre = lignes.length === 1 && mots.length <= 12 && !/[.;!?]$/.test(lignes[0]);
    blocs.push({ mots, titre, texte: lignes.join(' ') });
  }
  return blocs;
}

// Un bloc de plus de MORCEAU_MAX mots est coupé en segments de MOTS_PAR_SEGMENT mots au plus, sur les fins de phrase si possible.
function segmentsDe(bloc) {
  if (bloc.mots.length <= MORCEAU_MAX) return [bloc];
  const phrases = bloc.texte.split(/(?<=[.!?])\s+/);
  const segments = [];
  let courant = [];
  const pousser = () => { if (courant.length) segments.push({ mots: courant, titre: false }); courant = []; };
  for (const phrase of phrases) {
    let mots = phrase.split(' ').filter(Boolean);
    while (mots.length > MOTS_PAR_SEGMENT) {
      if (courant.length) pousser();
      segments.push({ mots: mots.slice(0, MOTS_PAR_SEGMENT), titre: false });
      mots = mots.slice(MOTS_PAR_SEGMENT);
    }
    if (courant.length + mots.length > MOTS_PAR_SEGMENT) pousser();
    courant.push(...mots);
  }
  pousser();
  return segments;
}

// pages : [{page, texte}] dans l'ordre. Renvoie [{n, page, texte, mots}] (n à partir de `depart`).
// Chaque morceau reprend les 20 derniers mots du précédent. Un titre ouvre un nouveau morceau quand le courant a déjà son compte.
// Le dernier morceau, trop court, est rattaché au précédent quand le total ne dépasse pas 250 mots.
export function decouper(pages, { depart = 0 } = {}) {
  const morceaux = [];
  let cur = [];
  let neuf = 0; // mots de `cur` qui ne sont pas du recouvrement
  let pageDebut = null;
  const fermer = (page) => {
    if (!neuf) return;
    morceaux.push({ page: pageDebut, mots: cur });
    cur = cur.slice(-RECOUVREMENT);
    neuf = 0;
    pageDebut = page;
  };
  for (const { page, texte } of pages || []) {
    for (const bloc of blocsDe(texte)) {
      for (const seg of segmentsDe(bloc)) {
        if (seg.titre && cur.length >= MORCEAU_MIN) fermer(page);
        let mots = seg.mots;
        while (mots.length) {
          if (pageDebut === null) pageDebut = page;
          const place = MORCEAU_MAX - cur.length;
          if (mots.length <= place) {
            cur = cur.concat(mots);
            neuf += mots.length;
            mots = [];
          } else if (cur.length >= MORCEAU_MIN) {
            fermer(page);
          } else {
            cur = cur.concat(mots.slice(0, place));
            neuf += place;
            mots = mots.slice(place);
            fermer(page);
          }
        }
      }
    }
  }
  if (neuf) {
    const prec = morceaux[morceaux.length - 1];
    if (prec && cur.length < MORCEAU_MIN && prec.mots.length + neuf <= MORCEAU_MAX) prec.mots = prec.mots.concat(cur.slice(cur.length - neuf));
    else morceaux.push({ page: pageDebut, mots: cur });
  }
  return morceaux.map((m, i) => ({ n: depart + i, page: m.page, texte: m.mots.join(' '), mots: m.mots.length }));
}

// --- Mots, mots vides, recherche ---------------------------------------------------

export const MOTS_VIDES = new Set((
  'a ai aie aient aies ait as au aux avaient avais avait avec avoir avons avez ayant c ca car ce ceci cela ces cet cette ceux chaque ci comme comment '
  + 'd dans de des deja depuis donc dont du elle elles en encore entre es est et etaient etais etait etant ete etre eu eux fait faire fois il ils j je '
  + 'jusqu jusque l la le les leur leurs lors lui m ma mais me meme mes moi moins mon n ne ni nos notre nous on ont ou ou par parce pas peu peut plus '
  + 'pour pourquoi qu quand que quel quelle quelles quels qui s sa sans se sera ses si sinon soit son sont sous sur ta te tes toi ton tous tout toute '
  + 'toutes tres tu un une vos votre vous y'
).split(/\s+/).filter(Boolean));

// Mot sans accents ni majuscules, pluriel retiré (« gemmes » -> « gemme », « cristaux » -> « cristau ») : requête et morceaux se rejoignent.
const racine = (m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m);

// Mots utiles d'un texte (sans accents, sans mots vides, au moins 2 caractères), dans l'ordre, doublons gardés.
export function motsUtiles(texte) {
  return sansAccents(String(texte === undefined || texte === null ? '' : texte).replace(/['’]/g, ' '))
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 2 && !MOTS_VIDES.has(m))
    .map(racine);
}

const K1 = 1.5;
const B = 0.75;

// Score BM25 simplifié de chaque morceau pour la requête. `morceaux` : [{texte, mots}]. Renvoie un tableau de scores (0 = aucun mot commun).
export function scoresBM25(requete, morceaux) {
  const termes = [...new Set(motsUtiles(requete))];
  const docs = morceaux.map((m) => {
    const frequences = new Map();
    for (const mot of motsUtiles(m.texte)) frequences.set(mot, (frequences.get(mot) || 0) + 1);
    return { frequences, longueur: Math.max(1, Number(m.mots) || m.texte.split(/\s+/).length) };
  });
  const N = docs.length;
  if (!N || !termes.length) return morceaux.map(() => 0);
  const moyenne = docs.reduce((s, d) => s + d.longueur, 0) / N;
  const idf = new Map(termes.map((t) => {
    const n = docs.filter((d) => d.frequences.has(t)).length;
    return [t, Math.log(1 + (N - n + 0.5) / (n + 0.5))];
  }));
  return docs.map((d) => termes.reduce((s, t) => {
    const f = d.frequences.get(t) || 0;
    if (!f) return s;
    return s + idf.get(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.longueur) / moyenne)));
  }, 0));
}

// Les meilleurs morceaux (4 au plus, 1 200 mots au plus, score > 0), du meilleur au moins bon. `morceaux` : [{texte, mots, ...}].
export function meilleursMorceaux(requete, morceaux, { max = MORCEAUX_GARDES, motsMax = MOTS_GARDES_MAX } = {}) {
  const scores = scoresBM25(requete, morceaux);
  const classes = morceaux.map((m, i) => ({ m, score: scores[i], i })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  const gardes = [];
  let mots = 0;
  for (const { m, score } of classes) {
    if (gardes.length >= max) break;
    const nb = Number(m.mots) || m.texte.split(/\s+/).length;
    if (mots + nb > motsMax) continue;
    gardes.push({ ...m, score });
    mots += nb;
  }
  return gardes;
}

// Requête d'une leçon : titre de la leçon, titre et objectif du module, titre de la formation (termes du programme).
export const requeteDeLecon = ({ lecon, module, objectif, parcours }) => [lecon, lecon, module, objectif, parcours].filter((x) => typeof x === 'string' && x).join(' ');

// Pages {langue: 'doc'} pour l'IA, à partir des morceaux choisis. Titre : « <éditeur>, <titre du document>, p. N » (c'est aussi la source affichée,
// sans lien) ; sans éditeur, la source s'affiche « Document de référence : <titre>, p. N » (voir sourceDe dans lib/wiki.js).
export const pageDeMorceau = (m) => ({
  langue: 'doc',
  titre: `${m.editeur ? `${m.editeur}, ` : ''}${m.titre}${m.page ? `, p. ${m.page}` : ''}`,
  editeur: m.editeur || null,
  texte: m.texte,
  url: '',
  document: m.doc_id,
});

// Recherche dans les documents actifs d'un parcours (et dans ceux sans parcours). Gratuite : aucune IA. Toute panne donne [].
// `niveau` (1 à 4, celui de la leçon) : seuls remontent les documents de niveau inférieur ou égal, ou sans niveau. Sans `niveau`, aucun filtre.
export async function pagesDeDocuments(env, { parcours, requete, niveau = null }) {
  if (!env || !env.DB || !requete) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT m.doc_id, m.n, m.page, m.texte, m.mots, d.titre, d.editeur FROM doc_morceaux m JOIN documents d ON d.id = m.doc_id
       WHERE d.actif = 1 AND (d.parcours IS NULL OR d.parcours = ?) AND (? IS NULL OR d.niveau IS NULL OR d.niveau <= ?) ORDER BY m.doc_id, m.n`,
    ).bind(parcours || '', niveau, niveau).all();
    const lignes = results || [];
    return meilleursMorceaux(requete, lignes).map(pageDeMorceau);
  } catch (e) {
    console.warn('documents : recherche impossible', e && e.message);
    return [];
  }
}

// Y a-t-il des documents actifs pour ce parcours ?
export async function aDesDocuments(env, parcours) {
  if (!env || !env.DB) return false;
  try {
    const l = await env.DB.prepare('SELECT 1 AS un FROM documents WHERE actif = 1 AND (parcours IS NULL OR parcours = ?) LIMIT 1').bind(parcours || '').first();
    return !!l;
  } catch {
    return false;
  }
}

// --- Contrôle des mots identiques ----------------------------------------------------

// Mots d'un texte pour la comparaison : sans accents, sans ponctuation, mots vides GARDÉS (c'est une suite de mots, pas une recherche).
const motsBruts = (texte) => sansAccents(String(texte || '').replace(/['’]/g, ' ')).split(/[^a-z0-9]+/).filter(Boolean);

// Ensemble des suites de 16 mots (MOTS_IDENTIQUES_MAX + 1) des textes donnés.
export function suitesDe(textes) {
  const suites = new Set();
  const n = MOTS_IDENTIQUES_MAX + 1;
  for (const t of textes) {
    const mots = motsBruts(t);
    for (let i = 0; i + n <= mots.length; i++) suites.add(mots.slice(i, i + n).join(' '));
  }
  return suites;
}

// Exception de droit d'auteur : une définition courte (15 mots au plus) entre guillemets « », avec sa source à côté (« selon », « d'après »,
// le nom de l'éditeur ou « Institut ») est une citation, tolérée. Une citation plus longue, ou sans source, ne l'est pas.
const ATTRIBUTION = /(?:selon|d['’]apr[èe]s|source|institut|cité par|citée par)/iu;
export function sansCitations(texte, editeur = null) {
  const t = String(texte || '');
  const attribue = ATTRIBUTION.test(t) || (editeur && t.toLowerCase().includes(String(editeur).toLowerCase()));
  if (!attribue) return t;
  return t.replace(/«([^»]*)»/g, (tout, dedans) => (dedans.trim().split(/\s+/).filter(Boolean).length <= MOTS_IDENTIQUES_MAX ? ' ' : tout));
}

// Vrai si `texte` reprend plus de 15 mots consécutifs de l'un des textes dont `suites` est tiré (suitesDe), citations attribuées exceptées.
export function recopie(texte, suites, editeur = null) {
  if (!suites || !suites.size) return false;
  const mots = motsBruts(sansCitations(texte, editeur));
  const n = MOTS_IDENTIQUES_MAX + 1;
  for (let i = 0; i + n <= mots.length; i++) if (suites.has(mots.slice(i, i + n).join(' '))) return true;
  return false;
}

// Plus longue suite de mots identiques entre deux textes (pour les tests et les rapports).
export function plusLongueSuite(a, b) {
  const x = motsBruts(a);
  const y = motsBruts(b);
  let meilleur = 0;
  let prec = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const cur = new Array(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        cur[j] = prec[j - 1] + 1;
        if (cur[j] > meilleur) meilleur = cur[j];
      }
    }
    prec = cur;
  }
  return meilleur;
}

// --- Progression de niveau (sans IA) --------------------------------------------------

// Radicaux de 5 lettres des mots de 4 lettres ou plus (même lecture que `soutenue`), pour comparer des termes.
const radicauxDe = (t) => new Set(sansAccents(String(t || '')).split(/[^a-z0-9]+/).filter((m) => m.length >= 4).map((m) => m.slice(0, 5)));

// Termes réservés à un niveau plus avancé que `niveau` : titres de modules (et leurs objectifs) des niveaux suivants dont aucun mot significatif
// ne figure dans les titres ni les objectifs des niveaux jusqu'à `niveau`. Renvoie une liste de {titre, radicaux:Set}.
export function termesReserves(programme, niveau) {
  const niveaux = programme && Array.isArray(programme.niveaux) ? programme.niveaux : [];
  if (!niveau) return [];
  const connus = new Set();
  for (const n of niveaux.filter((x) => x.numero <= niveau)) {
    for (const m of n.modules || []) for (const r of radicauxDe(`${m.titre} ${m.objectif || ''}`)) connus.add(r);
  }
  const reserves = [];
  for (const n of niveaux.filter((x) => x.numero > niveau)) {
    for (const m of n.modules || []) {
      const radicaux = new Set([...radicauxDe(m.titre)].filter((r) => !connus.has(r)));
      if (radicaux.size) reserves.push({ titre: m.titre, radicaux });
    }
  }
  return reserves;
}

// Un terme défini est « réservé » s'il est (en entier, par ses mots significatifs) un mot propre au titre d'un module d'un niveau plus avancé.
// Flagrant seulement : tous les mots significatifs du terme (au moins un) sont réservés, et le terme n'a aucun autre mot.
export function termeReserve(terme, reserves) {
  const r = radicauxDe(terme);
  if (!r.size) return null;
  for (const x of reserves) if ([...r].every((m) => x.radicaux.has(m))) return x.titre;
  return null;
}

// Sigles et formules (« DRX », « RI », « Al2O3 ») d'un texte, sans accents ni casse : mots de 2 à 6 capitales, ou chiffres collés aux lettres.
export function siglesDe(texte) {
  const trouves = String(texte || '').match(/\b(?:\p{Lu}{2,6}|\p{Lu}[a-z]?\d?\p{Lu}[a-z]?\d)\b/gu) || [];
  return [...new Set(trouves.filter((s) => !/^[IVXLCDM]+$/.test(s)))];
}
