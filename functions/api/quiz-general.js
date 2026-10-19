// Quiz de culture générale sur un sujet libre, écrit par blocs de 10 questions (7 à choix, 3 vrai ou faux),
// vérifiées par une 2e IA comme les leçons. Un bloc écrit est mis en cache pour tous les lecteurs.
// POST /api/quiz-general {sujet, n, regenerer?, apres?} (connexion) -> {questions, manquants, blocs}
//   n : 10, 20, 30, 40 ou 50 questions (n / 10 blocs). Sans `regenerer` : les blocs 1 à n / 10. Avec `regenerer` : les
//   n / 10 blocs qui suivent le bloc `apres` (par défaut n / 10), sans limite (6, 7…), chacun distinct.
//   Un appel n'écrit qu'UN bloc manquant (limite de temps d'un Worker) : l'app rappelle tant que manquants > 0.
//   Quota : 25 blocs nouveaux par lecteur et par jour, 150 en tout ; un bloc en cache ne coûte rien.
// GET  /api/quiz-general?bloc=<slug>:<k> | jour:AAAA-MM-JJ | tournoi:AAAA-MM-JJ (public) -> {questions} d'un bloc en cache.
// Questions au format de GET quiz : {palier: "qg:<slug>:<k>", titre, index, question}.
import { typographier } from '../../lib/typo.js';
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';
import { genererBlocQuiz, demarrerChrono, pagesFrEn, MAX_PAGES } from '../../lib/paliers.js';
import {
  BLOC_MAX, LIMITE_BLOCS_LECTEUR, LIMITE_BLOCS_TOTAL, LONGUEURS, MESSAGE_SANS_SOURCE, ecrireBloc, idBloc, lireBlocs, lireIdBloc,
  questionsDuBloc, questionsDuSujet,
} from '../../lib/general.js';
import { slug } from '../../lib/sujets.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const id = lireIdBloc(new URL(request.url).searchParams.get('bloc'));
  if (!id) throw new ErreurHttp(400, 'Identifiant de bloc attendu.');
  const [bloc] = await lireBlocs(env, [id]);
  if (!bloc) throw new ErreurHttp(404, 'Ces questions ne sont pas (ou plus) en mémoire.');
  return json({ questions: questionsDuBloc(id, bloc.sujet, bloc.contenu.questions) });
});

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 2048);

  const sujet = nettoyer(corps.sujet);
  if (sujet === null || longueur(sujet) < 2 || longueur(sujet) > 80) {
    throw new ErreurHttp(400, 'Sujet de 2 à 80 caractères attendu.');
  }
  const racine = slug(sujet);
  if (racine === '') throw new ErreurHttp(400, 'Sujet sans lettre ni chiffre.');
  if (!LONGUEURS.includes(corps.n)) throw new ErreurHttp(400, 'n doit valoir 10, 20, 30, 40 ou 50.');
  if (corps.regenerer !== undefined && typeof corps.regenerer !== 'boolean') throw new ErreurHttp(400, 'regenerer doit être vrai ou faux.');
  if (corps.apres !== undefined && !(Number.isInteger(corps.apres) && corps.apres >= 0 && corps.apres <= BLOC_MAX)) {
    throw new ErreurHttp(400, 'apres doit être un numéro de bloc.');
  }

  const nb = corps.n / 10;
  const premier = corps.regenerer ? (corps.apres === undefined ? nb : corps.apres) + 1 : 1;
  if (premier + nb - 1 > BLOC_MAX) throw new ErreurHttp(400, 'Tu as fait le tour de ce sujet : choisis-en un autre.');
  const numeros = Array.from({ length: nb }, (_, i) => premier + i);
  const ids = numeros.map((k) => idBloc(racine, k));

  const prets = new Map((await lireBlocs(env, ids)).map((b) => [b.id, b]));
  const absents = ids.filter((id) => !prets.has(id));

  if (absents.length) {
    // On n'écrit qu'un bloc par requête : le premier qui manque.
    const id = absents[0];
    const k = numeros[ids.indexOf(id)];
    if (!env.AI) throw new ErreurHttp(503, 'IA absente');
    const pages = (await pagesFrEn(sujet)).slice(0, MAX_PAGES);
    if (!pages.length) throw new ErreurHttp(422, MESSAGE_SANS_SOURCE);
    // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
    if (!(await quota(env, 'quizgeneral:joueur:' + joueur.id, LIMITE_BLOCS_LECTEUR))) {
      throw new ErreurHttp(429, `Tu as déjà fait écrire ${LIMITE_BLOCS_LECTEUR} blocs de questions aujourd’hui. Reviens demain.`);
    }
    if (!(await quota(env, 'quizgeneral:total', LIMITE_BLOCS_TOTAL))) {
      throw new ErreurHttp(429, 'Le Rival est débordé aujourd’hui. Reviens demain.');
    }
    const existantes = await questionsDuSujet(env, racine, id);
    const contenu = typographier(await genererBlocQuiz(env, { sujet, pages, existants: existantes, horloge: demarrerChrono() }));
    // Deux lecteurs peuvent demander le même bloc en même temps : le premier enregistré gagne.
    const gagnant = await ecrireBloc(env, { id, sujet, bloc: k, contenu });
    if (!gagnant) throw new Error('bloc introuvable après écriture');
    prets.set(id, gagnant);
  }

  const questions = ids.filter((id) => prets.has(id)).flatMap((id) => {
    const b = prets.get(id);
    return questionsDuBloc(id, b.sujet, b.contenu.questions);
  });
  return json({ questions, manquants: ids.filter((id) => !prets.has(id)).length, blocs: numeros });
});
