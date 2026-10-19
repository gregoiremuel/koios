// GET /api/tournoi (public) -> {tournoi}
// Le tournoi de la semaine : 10 questions sur le thème de la semaine, créé à la première requête de la semaine
// (lundi 00:00 UTC à dimanche 23:59 UTC) et partagé par tous. C'est un duel de type « tournoi » (table salons) :
// on le joue avec GET/PUT /api/duel?id=. Même génération et même plafond global que /api/jour (5 tentatives par jour).
// tournoi = {id, titre, theme, debut, fin, termine, questions, joueurs, classement (10 premiers), moi, dejaJoue}
//   classement : [{rang, pseudo, justes, n, points, moi?}] ; moi : mon rang et mon score, ou null.
// Si le tournoi ne peut pas être écrit (plus d'IA, plafond atteint) : {tournoi: null}.
import {
  auth, enveloppe, exigerBase, json, quota, sha256Hex,
} from '../../lib/api.js';
import {
  LIMITE_TENTATIVES_TOURNOI, classer, ecrireBloc, finDeSemaine, genererBlocTheme, jourUtc, lireBloc, lundiDe, themeDeLaSemaine,
} from '../../lib/general.js';

const lire = (texte) => {
  try {
    const v = JSON.parse(texte);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

async function creer(env, { id, lundi, theme, fin }) {
  const idQuiz = 'tournoi:' + lundi;
  let bloc = await lireBloc(env, idQuiz);
  if (!bloc) {
    if (!env.AI || !(await quota(env, 'tournoi:tentatives', LIMITE_TENTATIVES_TOURNOI))) return false;
    try {
      bloc = await ecrireBloc(env, { id: idQuiz, sujet: theme, bloc: 0, contenu: await genererBlocTheme(env, theme) });
    } catch (e) {
      console.warn('Tournoi : échec', e && e.message);
      return false;
    }
  }
  if (!bloc) return false;
  const maintenant = new Date().toISOString();
  const questions = bloc.contenu.questions.map((_, index) => ({ chapitre: 'qg:' + idQuiz, index }));
  // Identifiant fixé par la semaine : deux premières requêtes en même temps créent un seul tournoi (le premier gagne).
  await env.DB.prepare('INSERT OR IGNORE INTO duels (id, createur, questions, scores, cree) VALUES (?, ?, ?, ?, ?)')
    .bind(id, 'koios', JSON.stringify(questions), '[]', maintenant)
    .run();
  await env.DB.prepare('INSERT OR IGNORE INTO salons (id, titre, type, fin, cree) VALUES (?, ?, ?, ?, ?)')
    .bind(id, `Tournoi : ${theme}`.slice(0, 60), 'tournoi', fin, maintenant)
    .run();
  return true;
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const lundi = lundiDe(jourUtc());
  const fin = finDeSemaine(lundi);
  const theme = themeDeLaSemaine(lundi);
  const id = (await sha256Hex('tournoi:' + lundi)).slice(0, 8);

  const requete = () => env.DB.prepare(
    `SELECT d.questions, d.scores, s.titre, s.fin FROM duels d JOIN salons s ON s.id = d.id WHERE d.id = ? AND s.type = 'tournoi'`,
  ).bind(id).first();
  let ligne = await requete();
  if (!ligne) {
    if (!(await creer(env, { id, lundi, theme, fin }))) return json({ tournoi: null });
    ligne = await requete();
    if (!ligne) return json({ tournoi: null });
  }

  const lecteur = await auth(request, env).catch(() => null);
  const scores = lire(ligne.scores);
  const classement = classer(scores, lecteur && lecteur.id);
  const moi = classement.find((x) => x.moi) || null;
  return json({
    tournoi: {
      id,
      titre: ligne.titre,
      theme,
      debut: lundi + 'T00:00:00.000Z',
      fin: ligne.fin,
      termine: Date.now() > Date.parse(ligne.fin),
      questions: lire(ligne.questions).length,
      joueurs: classement.length,
      classement: classement.slice(0, 10).map(({ moi: _m, ...x }) => (moi && x.rang === moi.rang ? { ...x, moi: true } : x)),
      moi: moi ? { rang: moi.rang, pseudo: moi.pseudo, justes: moi.justes, n: moi.n, points: moi.points } : null,
      dejaJoue: !!moi,
    },
  });
});
