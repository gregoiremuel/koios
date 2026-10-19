// Jeu en direct : tout se déduit de l'horloge du serveur à chaque lecture, sans tâche de fond ni WebSocket.
// Importé par functions/api/partie.js. Aucun secret.
//
// Une question dure 20 s, puis 5 s de résultat, puis la suivante démarre toute seule. `debut_question` est le début de la
// question `indice` ; l'état affiché se calcule avec `avancer` et n'est écrit qu'avec une condition sur l'ancien état.

import { lireIdPalier, lireIdQuiz } from './paliers.js';
import { lireRefQg } from './general.js';

export const DUREE_QUESTION = 20000; // ms
export const DUREE_RESULTAT = 5000; // ms
export const CYCLE = DUREE_QUESTION + DUREE_RESULTAT;
export const JOUEURS_MAX = 12;
export const QUESTIONS_MIN = 5;
export const QUESTIONS_MAX = 20;
export const POINTS_BASE = 100;
export const BONUS_MAX = 50; // linéaire sur 20 s
export const DUREE_VIE_MS = 24 * 3600 * 1000; // une partie plus ancienne est effacée à la création suivante
export const PARTIES_PAR_JOUR = 20;

// 32 signes : ni O, ni 0, ni I, ni 1. 256 = 8 × 32 : aucun biais avec un octet.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const FORME_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

export function codePartie() {
  const octets = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(octets, (o) => ALPHABET[o % 32]).join('');
}

// Ce que tape un joueur (minuscules, espaces) -> code valide, ou null.
export function lireCode(texte) {
  if (typeof texte !== 'string') return null;
  const code = texte.replace(/\s+/g, '').toUpperCase();
  return FORME_CODE.test(code) ? code : null;
}

// Horloge : injectable pour les tests (env.maintenant), jamais fournie en production.
export const maintenant = (env) => (typeof env.maintenant === 'function' ? env.maintenant() : Date.now());

// Points d'une réponse : 100 + bonus de rapidité (50 à l'instant 0, 0 à 20 s), 0 si faux.
export function pointsReponse(juste, ms) {
  if (!juste) return 0;
  const t = Math.min(DUREE_QUESTION, Math.max(0, Math.floor(ms)));
  return POINTS_BASE + Math.round((DUREE_QUESTION - t) / (DUREE_QUESTION / BONUS_MAX));
}
// Même calcul en SQL (colonnes juste et ms de parties_reponses) : le total d'un joueur se recalcule, il ne s'additionne pas.
export const SQL_POINTS = `CASE WHEN r.juste = 1 THEN ${POINTS_BASE} + CAST(ROUND((${DUREE_QUESTION} - MIN(${DUREE_QUESTION}, MAX(0, r.ms))) / ${DUREE_QUESTION / BONUS_MAX}.0) AS INTEGER) ELSE 0 END`;

// État affiché à l'instant `t` pour une partie { etat, indice, debut_question } de `total` questions.
// -> { etat, indice, debut, ecoule } ; `ecoule` = ms écoulées dans la question ou le résultat en cours.
export function avancer(partie, total, t) {
  if (partie.etat === 'attente') return { etat: 'attente', indice: 0, debut: partie.debut_question || 0, ecoule: 0 };
  if (partie.etat === 'fini') return { etat: 'fini', indice: partie.indice, debut: partie.debut_question, ecoule: 0 };
  const ecoule = Math.max(0, t - partie.debut_question);
  const cycles = Math.floor(ecoule / CYCLE);
  const indice = partie.indice + cycles;
  if (indice >= total) {
    return { etat: 'fini', indice: total - 1, debut: partie.debut_question + (total - partie.indice) * CYCLE, ecoule: 0 };
  }
  const reste = ecoule - cycles * CYCLE;
  return { etat: reste < DUREE_QUESTION ? 'question' : 'resultat', indice, debut: partie.debut_question + cycles * CYCLE, ecoule: reste };
}

// Millisecondes avant la fin de la phase en cours (0 pour une partie qui attend ou qui est finie).
export function restant(etat, ecoule) {
  if (etat === 'question') return DUREE_QUESTION - ecoule;
  if (etat === 'resultat') return CYCLE - ecoule;
  return 0;
}

// --- Questions --------------------------------------------------------------

export const typeDeReference = (chapitre) => {
  if (lireIdPalier(chapitre)) return 'palier';
  if (lireIdQuiz(chapitre)) return 'quiz';
  if (lireRefQg(chapitre)) return 'qg';
  return null;
};

// Une question jouable en direct : à choix (2 à 6 réponses) ou vrai ou faux. Sinon null.
export function questionJouable(q) {
  if (!q || typeof q !== 'object') return null;
  if (q.type === 'qcm' && typeof q.enonce === 'string' && Array.isArray(q.reponses) && q.reponses.length >= 2 && q.reponses.length <= 6
    && q.reponses.every((r) => typeof r === 'string') && Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < q.reponses.length) {
    return { type: 'qcm', enonce: q.enonce, reponses: q.reponses, bonne: q.bonne, explication: typeof q.explication === 'string' ? q.explication : '' };
  }
  if (q.type === 'vraifaux' && typeof q.affirmation === 'string' && typeof q.vrai === 'boolean') {
    // Choix d'un vrai ou faux : 0 = Vrai, 1 = Faux (l'ordre des deux boutons).
    return { type: 'vraifaux', affirmation: q.affirmation, bonne: q.vrai ? 0 : 1, explication: typeof q.explication === 'string' ? q.explication : '' };
  }
  return null;
}

const SAIN = "CASE WHEN json_valid(contenu) THEN contenu ELSE '{}' END"; // une ligne illisible n'est pas une erreur

// {chapitre, index} -> question jouable, ou null (référence inconnue ou question d'un autre type).
export async function chargerQuestion(env, ref) {
  const chemin = `$.questions[${ref.index}]`;
  const type = typeDeReference(ref.chapitre);
  let ligne = null;
  if (type === 'palier') {
    ligne = await env.DB.prepare(`SELECT json_extract(${SAIN}, ?) AS q FROM paliers WHERE id = ?`).bind(chemin, ref.chapitre).first();
  } else if (type === 'quiz') {
    ligne = await env.DB.prepare(`SELECT json_extract(${SAIN}, ?) AS q FROM quiz_direct WHERE parcours = ?`).bind(chemin, lireIdQuiz(ref.chapitre)).first();
  } else if (type === 'qg') {
    ligne = await env.DB.prepare(`SELECT json_extract(${SAIN}, ?) AS q FROM quiz_general WHERE id = ?`).bind(chemin, lireRefQg(ref.chapitre)).first();
  }
  if (!ligne || typeof ligne.q !== 'string') return null;
  try {
    return questionJouable(JSON.parse(ligne.q));
  } catch {
    return null;
  }
}

// Ce que voit un joueur : jamais la bonne réponse ni l'explication avant le résultat.
export function vueQuestion(q, avecReponse) {
  const base = q.type === 'qcm' ? { type: 'qcm', enonce: q.enonce, reponses: q.reponses } : { type: 'vraifaux', affirmation: q.affirmation };
  return avecReponse ? { ...base, bonne: q.bonne, explication: q.explication } : base;
}

// Classement : points, puis bonnes réponses, puis pseudo ; rang partagé à points égaux.
export function classerJoueurs(joueurs) {
  const tri = joueurs.slice().sort((a, b) => b.points - a.points || b.justes - a.justes || String(a.pseudo).localeCompare(String(b.pseudo), 'fr', { sensitivity: 'base' }));
  let rang = 0;
  return tri.map((j, i) => {
    if (i === 0 || j.points !== tri[i - 1].points) rang = i + 1;
    return { rang, ...j };
  });
}
