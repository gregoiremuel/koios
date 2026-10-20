// Quiz de culture générale : blocs de questions en cache (table quiz_general), question du jour, tournoi de la semaine.
// Importé par functions/api/quiz-general.js, jour.js, tournoi.js et duel.js. Aucun secret.
//
// Identifiants de blocs (colonne `id` de quiz_general) :
//   - « <slug du sujet>:<k> » (k de 1 à 9999) : le bloc k d'un sujet libre, partagé entre tous les lecteurs ;
//   - « jour:AAAA-MM-JJ » : la question du jour (bloc de 10 sur le thème du jour, on garde la 1re question à choix) ;
//   - « tournoi:AAAA-MM-JJ » : les 10 questions du tournoi de la semaine (AAAA-MM-JJ = le lundi).
// Dans un duel, une question de bloc s'écrit {chapitre: "qg:<id du bloc>", index}.

import { ErreurHttp } from './api.js';
import { typographier } from './typo.js';
import {
  MAX_PAGES, QUESTIONS_QUIZ, demarrerChrono, genererBlocQuiz, pagesFrEn,
} from './paliers.js';

export const LONGUEURS = [10, 20, 30, 40, 50];
export const BLOC_MAX = 9999;
export const QUESTIONS_BLOC = QUESTIONS_QUIZ; // un bloc compte 10 questions au plus
export const LIMITE_BLOCS_LECTEUR = 25; // blocs nouveaux par lecteur et par jour
export const LIMITE_BLOCS_TOTAL = 150; // blocs nouveaux par jour, tous lecteurs
export const LIMITE_TENTATIVES_JOUR = 5; // générations de la question du jour par jour (tous lecteurs)
export const LIMITE_TENTATIVES_TOURNOI = 5; // générations du tournoi par jour (tous lecteurs)
export const MESSAGE_SANS_SOURCE = 'Je ne trouve aucune source fiable sur ce sujet.';

// Thèmes de la question du jour (un par jour de l'année, modulo la taille de la liste) et du tournoi (un par semaine).
export const THEMES = [
  'musique classique', 'cinéma', 'football', 'géographie de la France', 'Moyen Âge', 'astronomie', 'cuisine française',
  'peinture', 'littérature française', 'informatique', 'animaux marins', 'exploration spatiale', 'jazz', 'Jeux olympiques',
  'mythologie grecque', 'Égypte antique', 'volcans', 'chimie', 'corps humain', 'architecture', 'philosophie', 'vin',
  'fromages', 'chocolat', 'tennis', 'rugby', 'Révolution française', 'Seconde Guerre mondiale', 'Rome antique', 'Renaissance',
  'dinosaures', 'oiseaux', 'forêts', 'océans', 'montagnes', 'fleuves', 'Paris', 'Provence', 'Bretagne', 'cyclisme',
  'photographie', 'bande dessinée', 'théâtre', 'opéra', 'rock', 'chanson française', 'mathématiques', 'physique',
  'météorologie', 'énergie', 'inventions', 'chemins de fer', 'aviation', 'navigation', 'pierres précieuses', 'joaillerie',
  'cirque', 'jeux de société', 'échecs', 'cinéma d’animation',
];

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateValide(texte) {
  return typeof texte === 'string' && FORME_DATE.test(texte) && !Number.isNaN(Date.parse(texte + 'T00:00:00Z'))
    && new Date(texte + 'T00:00:00Z').toISOString().slice(0, 10) === texte;
}

export const jourUtc = (d = new Date()) => d.toISOString().slice(0, 10);

function jourDeLAn(date) {
  const d = new Date(date + 'T00:00:00Z');
  return Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
}

export const themeDuJour = (date) => THEMES[(jourDeLAn(date) - 1) % THEMES.length];

// Lundi de la semaine d'une date (AAAA-MM-JJ, UTC).
export function lundiDe(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Dimanche 23 h 59 min 59 s 999 ms (UTC) de la semaine qui commence ce lundi.
export function finDeSemaine(lundi) {
  return new Date(Date.parse(lundi + 'T00:00:00Z') + 7 * 86400000 - 1).toISOString();
}

// Un thème par semaine ; le pas de 7 est premier avec la taille de la liste : deux semaines de suite ne se ressemblent pas.
export const themeDeLaSemaine = (lundi) => THEMES[(Math.floor(Date.parse(lundi + 'T00:00:00Z') / 604800000) * 7 + 3) % THEMES.length];

// --- Références -------------------------------------------------------------

export const idBloc = (slugSujet, k) => `${slugSujet}:${k}`;

// « <slug>:<k> » | « jour:AAAA-MM-JJ » | « tournoi:AAAA-MM-JJ » -> identifiant valide, ou null.
export function lireIdBloc(texte) {
  if (typeof texte !== 'string') return null;
  const m = /^(?:[a-z0-9-]{1,40}:(\d{1,4})|(?:jour|tournoi):\d{4}-\d{2}-\d{2})$/.exec(texte);
  if (!m) return null;
  if (m[1] !== undefined && !(Number(m[1]) >= 1 && Number(m[1]) <= BLOC_MAX)) return null;
  if (m[1] === undefined && !dateValide(texte.slice(texte.indexOf(':') + 1))) return null;
  return texte;
}

// Référence de question d'un duel : « qg:<id du bloc> » (bloc d'un sujet ou du tournoi) -> id du bloc, ou null.
export function lireRefQg(chapitre) {
  if (typeof chapitre !== 'string' || !chapitre.startsWith('qg:')) return null;
  const id = lireIdBloc(chapitre.slice(3));
  return id && !id.startsWith('jour:') ? id : null;
}

// Nom que porte un bloc dans {palier} d'une question.
export const palierDuBloc = (id) => (id.startsWith('jour:') ? id : 'qg:' + id);

// Format de GET quiz : { palier, titre, index, question }.
export function questionsDuBloc(id, titre, questions) {
  return questions.map((question, index) => ({ palier: palierDuBloc(id), titre, index, question }));
}

function decoder(ligne) {
  try {
    const contenu = JSON.parse(ligne.contenu);
    return Array.isArray(contenu.questions) ? { id: ligne.id, sujet: ligne.sujet, bloc: ligne.bloc, contenu } : null;
  } catch {
    return null;
  }
}

export async function lireBloc(env, id) {
  const ligne = await env.DB.prepare('SELECT id, sujet, bloc, contenu FROM quiz_general WHERE id = ?').bind(id).first();
  return ligne ? decoder(ligne) : null;
}

export async function lireBlocs(env, ids) {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT id, sujet, bloc, contenu FROM quiz_general WHERE id IN (${ids.map(() => '?').join(', ')})`,
  )
    .bind(...ids)
    .all();
  return (results || []).map(decoder).filter(Boolean);
}

// Questions déjà écrites sur ce sujet (tous les blocs sauf `sauf`), dans l'ordre des blocs.
export async function questionsDuSujet(env, slugSujet, sauf) {
  const { results } = await env.DB.prepare(
    'SELECT id, sujet, bloc, contenu FROM quiz_general WHERE id LIKE ? AND bloc > 0 AND id <> ? ORDER BY bloc LIMIT 60',
  )
    .bind(`${slugSujet}:%`, sauf)
    .all();
  return (results || []).map(decoder).filter(Boolean).flatMap((b) => b.contenu.questions);
}

// Enregistre un bloc (le premier enregistré gagne) et renvoie celui qui est en base.
export async function ecrireBloc(env, { id, sujet, bloc, contenu }) {
  await env.DB.prepare('INSERT OR IGNORE INTO quiz_general (id, sujet, bloc, contenu, cree) VALUES (?, ?, ?, ?, ?)')
    .bind(id, sujet, bloc, JSON.stringify(contenu), new Date().toISOString())
    .run();
  return lireBloc(env, id);
}

// Un bloc de 10 questions sur un thème (question du jour, tournoi). Lève une ErreurHttp si le thème n'a pas de source
// ou si l'IA échoue. Ne touche à aucun quota : l'appelant compte sa tentative.
export async function genererBlocTheme(env, theme) {
  const pages = (await pagesFrEn(theme)).slice(0, MAX_PAGES);
  if (!pages.length) throw new ErreurHttp(422, MESSAGE_SANS_SOURCE);
  return typographier(await genererBlocQuiz(env, { sujet: theme, pages, existants: [], horloge: demarrerChrono() }));
}

// --- Classement -------------------------------------------------------------

// Scores d'un duel -> classement trié par points (puis bonnes réponses, puis date de jeu), avec rang. Sans identifiant de joueur.
// `visibles` (ensemble d'identifiants, facultatif) : seuls ces joueurs figurent dans la liste, les rangs restent ceux du classement entier
// (tournoi : on ne voit que soi et ses amis).
export function classer(scores, lecteurId, visibles = null) {
  return scores
    .map((s) => ({ s, moi: !!(lecteurId && s.joueur === lecteurId) }))
    .sort((a, b) => b.s.points - a.s.points || b.s.justes - a.s.justes || String(a.s.date).localeCompare(String(b.s.date)))
    .map(({ s, moi }, i) => ({ s, moi, rang: i + 1 }))
    .filter(({ s }) => !visibles || visibles.has(s.joueur))
    .map(({ s, moi, rang }) => ({
      rang, pseudo: s.pseudo, justes: s.justes, n: s.n, points: s.points, date: s.date, ...(moi ? { moi: true } : {}),
    }));
}
