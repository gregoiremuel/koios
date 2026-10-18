// POST /api/signalement {chapitre, exercice, message} : « c'est faux » ou autre remarque sur un exercice.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 8192);

  const chapitre = nettoyer(corps.chapitre);
  if (chapitre === null || longueur(chapitre) < 1 || longueur(chapitre) > 40) {
    throw new ErreurHttp(400, 'Chapitre de 1 à 40 caractères attendu.');
  }
  const exercice = corps.exercice;
  if (!Number.isInteger(exercice) || exercice < 0 || exercice > 99) {
    throw new ErreurHttp(400, 'Numéro d’exercice attendu : un entier de 0 à 99.');
  }
  const message = nettoyer(corps.message);
  if (message === null || longueur(message) < 1 || longueur(message) > 1000) {
    throw new ErreurHttp(400, 'Message de 1 à 1000 caractères attendu.');
  }

  if (!(await quota(env, 'signalement:' + joueur.id, 30))) {
    throw new ErreurHttp(429, 'Trop de signalements aujourd’hui. Réessaie demain.');
  }
  await env.DB.prepare(
    'INSERT INTO signalements (joueur, chapitre, exercice, message, cree) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(joueur.id, chapitre, exercice, message, new Date().toISOString())
    .run();
  return json({ ok: true });
});
