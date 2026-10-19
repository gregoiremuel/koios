// Duels entre amis : mêmes questions, chacun son score.
// POST /api/duel {questions: [{chapitre, index}], score: {justes, n, points}} (connexion) -> {id}
// GET  /api/duel?id= (public) -> {duel: {id, createur, questions, scores}}
// PUT  /api/duel {id, score} (connexion) : ajoute ou remplace le score de ce lecteur.
// Les identifiants des joueurs restent dans la base : on n'expose que les pseudos.
import {
  ErreurHttp, aleatoire, auth, enveloppe, exigerBase, json, lireJSON,
} from '../../lib/api.js';
import { EXERCICES_PAR_CHAPITRE, scoresPublics } from '../../lib/questions.js';
import { lireIdChapitre } from '../../lib/sujets.js';

const MAX_OCTETS = 4096;
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

// 5 à 20 questions {chapitre: "ia:<sujet>:<k>" (chapitre IA) ou "hg-01" (chapitre vérifié), index: 0 à 2}.
const ID_VERIFIE = /^[a-z]{2}-\d{2}$/;
function validerQuestions(brut) {
  if (!Array.isArray(brut) || brut.length < 5 || brut.length > 20) {
    throw new ErreurHttp(400, 'Un duel compte de 5 à 20 questions.');
  }
  return brut.map((q) => {
    if (!objet(q) || typeof q.chapitre !== 'string' || !(ID_VERIFIE.test(q.chapitre) || lireIdChapitre(q.chapitre)) || !Number.isInteger(q.index) || q.index < 0 || q.index >= EXERCICES_PAR_CHAPITRE) {
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

export const onRequestPost = enveloppe(async ({ request, env }) => {
  const joueur = await joueurConnecte(request, env);
  const corps = await lireJSON(request, MAX_OCTETS);
  const questions = validerQuestions(corps.questions);
  const score = validerScore(corps.score, questions.length);

  // Chaque chapitre IA doit exister dans le cache : un duel doit pouvoir se jouer (les chapitres vérifiés sont des fichiers de l'app).
  const ids = [...new Set(questions.map((q) => q.chapitre).filter((c) => !ID_VERIFIE.test(c)))];
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT id FROM chapitres_ia WHERE id IN (${ids.map(() => '?').join(', ')})`)
      .bind(...ids)
      .all();
    if ((results || []).length !== ids.length) throw new ErreurHttp(400, 'Question inconnue : chapitre absent de la bibliothèque.');
  }

  const maintenant = new Date().toISOString();
  const scores = [{ joueur: joueur.id, pseudo: joueur.pseudo, ...score, date: maintenant }];
  for (let essai = 0; essai < 3; essai++) {
    const id = aleatoire(8);
    const ecrit = await env.DB.prepare(
      'INSERT OR IGNORE INTO duels (id, createur, questions, scores, cree) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(id, joueur.id, JSON.stringify(questions), JSON.stringify(scores), maintenant)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) return json({ id });
  }
  throw new Error('identifiant de duel déjà pris');
});

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_DUEL.test(id)) throw new ErreurHttp(400, 'Identifiant de duel attendu : 8 caractères.');
  const ligne = await env.DB.prepare(
    `SELECT d.id, d.questions, d.scores, j.pseudo AS createur
     FROM duels d LEFT JOIN joueurs j ON j.id = d.createur WHERE d.id = ?`,
  )
    .bind(id)
    .first();
  if (!ligne) throw new ErreurHttp(404, 'Duel introuvable.');
  const couples = lireJSONColonne(ligne.questions, []);
  return json({
    duel: {
      id: ligne.id,
      createur: ligne.createur || 'Un joueur',
      questions: couples, // références {chapitre, index} ; l'app retrouve les questions
      scores: scoresPublics(lireJSONColonne(ligne.scores, [])),
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
    const score = validerScore(corps.score, lireJSONColonne(ligne.questions, []).length);
    const scores = lireJSONColonne(ligne.scores, []);
    const entree = { joueur: joueur.id, pseudo: joueur.pseudo, ...score, date: new Date().toISOString() };
    const rang = scores.findIndex((s) => s.joueur === joueur.id);
    if (rang === -1) scores.push(entree);
    else scores[rang] = entree;
    const ecrit = await env.DB.prepare('UPDATE duels SET scores = ? WHERE id = ? AND scores = ?')
      .bind(JSON.stringify(scores), corps.id, ligne.scores)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) return json({ ok: true });
  }
  throw new ErreurHttp(503, 'Le duel est très demandé. Réessaie dans un instant.');
});
