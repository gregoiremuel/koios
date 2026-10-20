// Duels entre amis : mêmes questions, chacun son score. Un duel peut aussi être un salon (lien partagé, joueurs en nombre
// illimité) ou le tournoi de la semaine (créé par GET /api/tournoi) : titre, type et fin sont dans la table salons.
// POST /api/duel {questions: [{chapitre, index}], score: {justes, n, points}, titre?, type?, fin?} (connexion) -> {id}
//   chapitre : "hg-01" (chapitre vérifié), "ia:<sujet>:<k>" (chapitre IA), "<parcours>:<k>" (palier en cache),
//   "<parcours>:quiz" (quiz direct en cache) ou "qg:<slug>:<k>" (bloc de quiz de culture générale en cache).
//   type : "duel" (défaut, 5 à 20 questions, score obligatoire) ou "salon" (5 à 50 questions, score facultatif :
//   le créateur peut jouer après). titre : 60 caractères au plus. fin : date ISO future (31 jours au plus) après laquelle
//   les scores ne changent plus. Le tournoi ne se crée pas ici.
// GET  /api/duel?id= (public) -> {duel: {id, createur, questions, scores, dejaJoue, titre, type, fin, termine, joueurs, classement}}
//   classement : scores triés par points, avec rang.
// PUT  /api/duel {id, score} (connexion) : ajoute ou remplace le score de ce lecteur. 409 après la fin ; un tournoi ne se joue qu'une fois.
// Les identifiants des joueurs restent dans la base : on n'expose que les pseudos. Un tournoi (public) ne montre que toi et tes amis.
import {
  ErreurHttp, aleatoire, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, authOptionnelle,
} from '../../lib/api.js';
import { EXERCICES_PAR_CHAPITRE, scoresPublics } from '../../lib/questions.js';
import {
  QUESTIONS_BLOC, classer, lireRefQg,
} from '../../lib/general.js';
import { lireIdQuiz, lireIdPalier } from '../../lib/paliers.js';
import { idsAmis } from '../../lib/comptes.js';
import { lireIdChapitre } from '../../lib/sujets.js';

const MAX_OCTETS = 4096; // un salon de 50 questions tient dans ce corps (une référence pèse 76 octets au plus)
const ID_DUEL = /^[a-z0-9]{8}$/;

async function joueurConnecte(request, env) {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  return joueur;
}

function objet(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Chapitres vérifiés (fichiers de l'app) : « hg-01 ». Un palier a 4 questions au plus, un quiz direct 10.
const ID_VERIFIE = /^[a-z]{2}-\d{2}$/;
const QUESTIONS_PALIER = 4;
const QUESTIONS_QUIZ = 10;

// Nombre d'exercices ou de questions que peut contenir la source d'une référence (null : référence invalide).
function maxIndex(chapitre) {
  if (ID_VERIFIE.test(chapitre) || lireIdChapitre(chapitre)) return EXERCICES_PAR_CHAPITRE;
  if (lireIdPalier(chapitre)) return QUESTIONS_PALIER;
  if (lireIdQuiz(chapitre)) return QUESTIONS_QUIZ;
  if (lireRefQg(chapitre)) return QUESTIONS_BLOC;
  return null;
}

const MAX_QUESTIONS = { duel: 20, salon: 50 };
const TYPES = ['duel', 'salon'];
const TITRE_MAX = 60;
const FIN_MAX_JOURS = 31;

// 5 à 20 questions (50 pour un salon) {chapitre: "ia:<sujet>:<k>" (chapitre IA), "hg-01" (chapitre vérifié), "<parcours>:<k>"
// (palier), "<parcours>:quiz" (quiz direct) ou "qg:<slug>:<k>" (bloc de culture générale), index}.
export function validerQuestions(brut, type = 'duel') {
  const max = MAX_QUESTIONS[type];
  if (!Array.isArray(brut) || brut.length < 5 || brut.length > max) {
    throw new ErreurHttp(400, `Un ${type} compte de 5 à ${max} questions.`);
  }
  return brut.map((q) => {
    const max = objet(q) && typeof q.chapitre === 'string' ? maxIndex(q.chapitre) : null;
    if (max === null || !Number.isInteger(q.index) || q.index < 0 || q.index >= max) {
      throw new ErreurHttp(400, 'Question invalide : chapitre et numéro d’exercice attendus.');
    }
    return { chapitre: q.chapitre, index: q.index };
  });
}

// {justes, n, points} : n est le nombre de questions du duel.
function validerScore(brut, nQuestions) {
  const entier = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  const points = Number.isInteger(brut && brut.points) && brut.points >= -1000 && brut.points <= 10000;
  if (!objet(brut) || brut.n !== nQuestions || !entier(brut.justes, nQuestions) || !points) {
    throw new ErreurHttp(400, 'Score invalide : justes, n (le nombre de questions) et points attendus.');
  }
  return { justes: brut.justes, n: brut.n, points: brut.points };
}

function lireJSONColonne(texte, parDefaut) {
  try {
    const v = JSON.parse(texte);
    return Array.isArray(v) ? v : parDefaut;
  } catch {
    return parDefaut;
  }
}

const inconnue = () => new ErreurHttp(400, 'Question inconnue : chapitre absent de la bibliothèque.');

export async function verifierReferences(env, questions) {
  const marque = (ids) => ids.map(() => '?').join(', ');
  const chapitres = [...new Set(questions.map((q) => q.chapitre).filter((c) => lireIdChapitre(c)))];
  if (chapitres.length) {
    const { results } = await env.DB.prepare(`SELECT id FROM chapitres_ia WHERE id IN (${marque(chapitres)})`)
      .bind(...chapitres)
      .all();
    if ((results || []).length !== chapitres.length) throw inconnue();
  }
  const paliers = [...new Set(questions.map((q) => q.chapitre).filter((c) => lireIdPalier(c)))];
  if (paliers.length) {
    const { results } = await env.DB.prepare(
      `SELECT id, json_array_length(contenu, '$.questions') AS nq FROM paliers WHERE id IN (${marque(paliers)})`,
    )
      .bind(...paliers)
      .all();
    const nq = new Map((results || []).map((r) => [r.id, r.nq || 0]));
    if (questions.some((q) => lireIdPalier(q.chapitre) && !(q.index < nq.get(q.chapitre)))) throw inconnue();
  }
  const quiz = [...new Set(questions.map((q) => lireIdQuiz(q.chapitre)).filter(Boolean))];
  if (quiz.length) {
    const { results } = await env.DB.prepare(
      `SELECT parcours, json_array_length(contenu, '$.questions') AS nq FROM quiz_direct WHERE parcours IN (${marque(quiz)})`,
    )
      .bind(...quiz)
      .all();
    const nq = new Map((results || []).map((r) => [r.parcours, r.nq || 0]));
    if (questions.some((q) => lireIdQuiz(q.chapitre) && !(q.index < nq.get(lireIdQuiz(q.chapitre))))) throw inconnue();
  }
  const blocs = [...new Set(questions.map((q) => lireRefQg(q.chapitre)).filter(Boolean))];
  if (blocs.length) {
    const { results } = await env.DB.prepare(
      `SELECT id, json_array_length(contenu, '$.questions') AS nq FROM quiz_general WHERE id IN (${marque(blocs)})`,
    )
      .bind(...blocs)
      .all();
    const nq = new Map((results || []).map((r) => [r.id, r.nq || 0]));
    if (questions.some((q) => lireRefQg(q.chapitre) && !(q.index < nq.get(lireRefQg(q.chapitre))))) throw inconnue();
  }
}

// Titre, type et fin facultatifs d'un duel : {titre, type, fin} (titre et fin null si absents).
function validerMeta(corps) {
  const type = corps.type === undefined ? 'duel' : corps.type;
  if (!TYPES.includes(type)) throw new ErreurHttp(400, 'Type de duel inconnu : duel ou salon.');
  let titre = null;
  if (corps.titre !== undefined && corps.titre !== null) {
    titre = nettoyer(corps.titre);
    if (titre === null || longueur(titre) < 1 || longueur(titre) > TITRE_MAX) {
      throw new ErreurHttp(400, `Titre de 1 à ${TITRE_MAX} caractères attendu.`);
    }
  }
  let fin = null;
  if (corps.fin !== undefined && corps.fin !== null) {
    const t = typeof corps.fin === 'string' ? Date.parse(corps.fin) : NaN;
    if (!Number.isFinite(t) || t <= Date.now() || t > Date.now() + FIN_MAX_JOURS * 86400000) {
      throw new ErreurHttp(400, `fin doit être une date à venir, dans les ${FIN_MAX_JOURS} jours.`);
    }
    fin = new Date(t).toISOString();
  }
  return { type, titre, fin };
}

export const onRequestPost = enveloppe(async ({ request, env }) => {
  const joueur = await joueurConnecte(request, env);
  const corps = await lireJSON(request, MAX_OCTETS);
  const meta = validerMeta(corps);
  const questions = validerQuestions(corps.questions, meta.type);
  // Le score du créateur est obligatoire pour un duel ; un salon peut être créé avant d'être joué.
  const score = meta.type === 'salon' && corps.score === undefined ? null : validerScore(corps.score, questions.length);

  // Chaque chapitre IA, palier ou quiz doit exister dans le cache : un duel doit pouvoir se jouer
  // (les chapitres vérifiés sont des fichiers de l'app). Palier et quiz : la question demandée doit exister.
  await verifierReferences(env, questions);

  const maintenant = new Date().toISOString();
  const scores = score ? [{ joueur: joueur.id, pseudo: joueur.pseudo, ...score, date: maintenant }] : [];
  for (let essai = 0; essai < 3; essai++) {
    const id = aleatoire(8);
    const ecrit = await env.DB.prepare(
      'INSERT OR IGNORE INTO duels (id, createur, questions, scores, cree) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(id, joueur.id, JSON.stringify(questions), JSON.stringify(scores), maintenant)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) {
      if (meta.type !== 'duel' || meta.titre || meta.fin) {
        await env.DB.prepare('INSERT OR IGNORE INTO salons (id, titre, type, fin, cree) VALUES (?, ?, ?, ?, ?)')
          .bind(id, meta.titre, meta.type, meta.fin, maintenant)
          .run();
      }
      return json({ id });
    }
  }
  throw new Error('identifiant de duel déjà pris');
});

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_DUEL.test(id)) throw new ErreurHttp(400, 'Identifiant de duel attendu : 8 caractères.');
  const lecteur = await authOptionnelle(request, env);
  const ligne = await env.DB.prepare(
    `SELECT d.id, d.questions, d.scores, j.pseudo AS createur, s.titre, s.type, s.fin
     FROM duels d LEFT JOIN joueurs j ON j.id = d.createur LEFT JOIN salons s ON s.id = d.id WHERE d.id = ?`,
  )
    .bind(id)
    .first();
  if (!ligne) throw new ErreurHttp(404, 'Duel introuvable.');
  const couples = lireJSONColonne(ligne.questions, []);
  const brut = lireJSONColonne(ligne.scores, []);
  // Le tournoi est public : sa liste ne montre que toi et tes amis (rangs réels). Un duel ou un salon se joue par lien : tous ceux qui l'ont s'y voient.
  const visibles = ligne.type === 'tournoi' ? new Set(lecteur ? [lecteur.id, ...(await idsAmis(env, lecteur.id))] : []) : null;
  const classement = classer(brut, lecteur && lecteur.id, visibles);
  const montres = brut.map((s, i) => ({ s, i })).filter(({ s }) => !visibles || visibles.has(s.joueur));
  return json({
    duel: {
      id: ligne.id,
      createur: ligne.type === 'tournoi' ? 'Koîos' : ligne.createur || 'Un joueur',
      questions: couples, // références {chapitre, index} ; l'app retrouve les questions
      scores: montres.map(({ s, i }) => { const p = scoresPublics([s])[0]; return lecteur && brut[i] && brut[i].joueur === lecteur.id ? { ...p, moi: true } : p; }),
      // Vrai si le lecteur connecté a déjà joué ce duel (reconnu par son identifiant, jamais exposé).
      dejaJoue: !!(lecteur && brut.some((s) => s.joueur === lecteur.id)),
      titre: ligne.titre || null,
      type: ligne.type || 'duel',
      fin: ligne.fin || null,
      termine: !!ligne.fin && Date.now() > Date.parse(ligne.fin),
      joueurs: brut.length,
      classement,
    },
  });
});

export const onRequestPut = enveloppe(async ({ request, env }) => {
  const joueur = await joueurConnecte(request, env);
  const corps = await lireJSON(request, MAX_OCTETS);
  if (typeof corps.id !== 'string' || !ID_DUEL.test(corps.id)) {
    throw new ErreurHttp(400, 'Identifiant de duel attendu : 8 caractères.');
  }

  // Lecture puis écriture conditionnelle : si un autre lecteur a écrit entre-temps, on relit.
  for (let essai = 0; essai < 4; essai++) {
    const ligne = await env.DB.prepare('SELECT questions, scores FROM duels WHERE id = ?').bind(corps.id).first();
    if (!ligne) throw new ErreurHttp(404, 'Duel introuvable.');
    const salon = (await env.DB.prepare('SELECT type, fin FROM salons WHERE id = ?').bind(corps.id).first()) || {};
    if (salon.fin && Date.now() > Date.parse(salon.fin)) {
      throw new ErreurHttp(409, salon.type === 'tournoi' ? 'Ce tournoi est terminé : les scores ne changent plus.' : 'Ce salon est terminé : les scores ne changent plus.');
    }
    const score = validerScore(corps.score, lireJSONColonne(ligne.questions, []).length);
    const scores = lireJSONColonne(ligne.scores, []);
    const entree = { joueur: joueur.id, pseudo: joueur.pseudo, ...score, date: new Date().toISOString() };
    const rang = scores.findIndex((s) => s.joueur === joueur.id);
    if (rang !== -1 && salon.type === 'tournoi') throw new ErreurHttp(409, 'Tu as déjà joué ce tournoi : une seule partie par joueur.');
    if (rang === -1) scores.push(entree);
    else scores[rang] = entree;
    const ecrit = await env.DB.prepare('UPDATE duels SET scores = ? WHERE id = ? AND scores = ?')
      .bind(JSON.stringify(scores), corps.id, ligne.scores)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) return json({ ok: true });
  }
  throw new ErreurHttp(503, 'Le duel est très demandé. Réessaie dans un instant.');
});
