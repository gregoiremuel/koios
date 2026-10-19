// POST /api/quiz-direct {parcours} : 10 questions avec explications, écrites à partir des sources du parcours et
// vérifiées par une 2e IA. Mises en cache par parcours : un quiz déjà écrit est renvoyé sans rien consommer.
// Réponse : {questions: [{palier: "<parcours>:quiz", titre, index, question}]}, comme GET /api/quiz.
import { typographier } from '../../lib/typo.js';
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, quota,
} from '../../lib/api.js';
import {
  ID_PARCOURS, decoderParcours, demarrerChrono, genererQuizDirect, questionsDuQuiz,
} from '../../lib/paliers.js';

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 2048);

  if (typeof corps.parcours !== 'string' || !ID_PARCOURS.test(corps.parcours)) {
    throw new ErreurHttp(400, 'Identifiant de parcours attendu.');
  }
  const ligne = await env.DB.prepare('SELECT id, titre, contenu FROM parcours WHERE id = ?').bind(corps.parcours).first();
  if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  const parcours = decoderParcours(ligne);

  // Déjà en cache : rien à générer, aucun quota.
  const cache = await env.DB.prepare('SELECT contenu FROM quiz_direct WHERE parcours = ?').bind(parcours.id).first();
  if (cache) return json({ questions: questionsDuQuiz(parcours, JSON.parse(cache.contenu).questions) });

  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  if (!(await quota(env, 'quizdirect:joueur:' + joueur.id, 10))) {
    throw new ErreurHttp(429, 'Tu as déjà lancé 10 quiz aujourd’hui. Reviens demain.');
  }

  const quiz = typographier(await genererQuizDirect(env, parcours, demarrerChrono()));

  // Deux lecteurs peuvent lancer le même quiz en même temps : le premier enregistré gagne.
  await env.DB.prepare('INSERT OR IGNORE INTO quiz_direct (parcours, contenu, cree) VALUES (?, ?, ?)')
    .bind(parcours.id, JSON.stringify(quiz), new Date().toISOString())
    .run();
  const gagnant = await env.DB.prepare('SELECT contenu FROM quiz_direct WHERE parcours = ?').bind(parcours.id).first();
  return json({ questions: questionsDuQuiz(parcours, JSON.parse(gagnant.contenu).questions) });
});
