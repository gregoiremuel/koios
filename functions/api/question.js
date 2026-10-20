// POST /api/question {parcours, numero, question} : « Pose une question » dans une leçon (200 caractères au plus).
// Compte requis. Réponse en cache (questions_cache) : servie sans quota. Sinon : quota du compte (20 par jour + bonus des codes),
// réponse de l'IA à partir de la leçon et des extraits Wikipédia en cache, recoupée par une autre famille d'IA, puis enregistrée.
// Clé personnelle x-cle-ia acceptée. La question n'est jamais journalisée ni exécutée comme consigne.
import {
  ErreurHttp, auth, enveloppe, envAvecCle, exigerBase, json, lireJSON, quota, quotaJoueur,
} from '../../lib/api.js';
import {
  ID_PARCOURS, PALIER_MAX, decoderParcours, demarrerChrono, pagesDeReferenceCachees,
} from '../../lib/paliers.js';
import { pagesAncrees } from '../../lib/sources.js';
import {
  QUESTIONS_PAR_JOUR, lireReponse, normaliserQuestion, repondreQuestion, validerQuestion,
} from '../../lib/question.js';

export const onRequestPost = enveloppe(async ({ request, env: envServeur }) => {
  await exigerBase(envServeur);
  const joueur = await auth(request, envServeur);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 2048);
  const parcoursId = corps.parcours;
  const numero = corps.numero;
  if (typeof parcoursId !== 'string' || !ID_PARCOURS.test(parcoursId)) throw new ErreurHttp(400, 'Parcours de la leçon attendu.');
  if (!Number.isInteger(numero) || numero < 1 || numero > PALIER_MAX) throw new ErreurHttp(400, `Numéro de leçon attendu : un entier de 1 à ${PALIER_MAX}.`);
  const question = validerQuestion(corps.question);

  const ligne = await envServeur.DB.prepare('SELECT contenu FROM paliers WHERE parcours = ? AND numero = ?').bind(parcoursId, numero).first();
  if (!ligne) throw new ErreurHttp(404, 'Leçon introuvable.');
  let lecon;
  try { lecon = JSON.parse(ligne.contenu); } catch { throw new ErreurHttp(404, 'Leçon introuvable.'); }

  const cle = `${parcoursId}|${numero}|${normaliserQuestion(question)}`;
  const deja = await lireReponse(envServeur, cle);
  if (deja) return json({ reponse: deja.reponse, trouve: deja.trouve, cache: true });

  if (!envServeur.AI) throw new ErreurHttp(503, 'IA absente');
  if (!(await quotaJoueur(envServeur, joueur, 'question:joueur:' + joueur.id, QUESTIONS_PAR_JOUR))) {
    throw new ErreurHttp(429, `Tu as déjà posé ${QUESTIONS_PAR_JOUR} questions aujourd’hui. Reviens demain.`);
  }
  if (!(await quota(envServeur, 'question:total', 500))) throw new ErreurHttp(429, 'Le Rival est débordé aujourd’hui. Reviens demain.');
  const env = envAvecCle(request, envServeur);

  const lignePar = await env.DB.prepare('SELECT id, titre, contenu FROM parcours WHERE id = ?').bind(parcoursId).first();
  if (!lignePar) throw new ErreurHttp(404, 'Parcours introuvable.');
  const parcours = decoderParcours(lignePar);
  const titre = typeof lecon.titre === 'string' ? lecon.titre : `Leçon ${numero}`;
  const [specifiques, reference] = await Promise.all([
    pagesAncrees(env, `${titre} ${parcours.titre}`, titre).catch(() => []),
    pagesDeReferenceCachees(env, parcours).catch(() => []),
  ]);
  const pages = [...specifiques, ...reference].filter((p, i, t) => t.findIndex((q) => q.langue === p.langue && q.titre === p.titre) === i).slice(0, 4);

  const r = await repondreQuestion(env, { cle, parcours: parcoursId, numero, titre, lecon, pages, question, horloge: demarrerChrono() });
  return json({ reponse: r.reponse, trouve: r.trouve, verifie: r.verifie, cache: false });
});
