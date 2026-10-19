// GET /api/jour[?date=AAAA-MM-JJ] (public) -> {date, theme, question}
// Un thème par jour (liste fixe, jour de l'année modulo sa taille). La question est écrite à la première requête du jour
// (un bloc de 10 sur le thème, vérifié par une 2e IA ; on garde la 1re question à choix), puis servie à tout le monde.
// Pas de quota de lecteur ; plafond global de 5 tentatives par jour. En cas d'échec : une question du pool vérifié
// (app/contenu/questions.json) avec theme null et repli true ; si même cela manque, question null (l'app a son pool).
// `date` n'est lue que si elle tombe la veille, le jour ou le lendemain (UTC) : l'app envoie la date de l'appareil.
import { enveloppe, exigerBase, json, quota } from '../../lib/api.js';
import {
  LIMITE_TENTATIVES_JOUR, dateValide, ecrireBloc, genererBlocTheme, jourUtc, lireBloc, questionsDuBloc, themeDuJour,
} from '../../lib/general.js';
import { generateur } from '../../lib/questions.js';

function dateDemandee(url) {
  const demandee = url.searchParams.get('date');
  const utc = jourUtc();
  if (!dateValide(demandee)) return utc;
  const ecart = Math.abs(Date.parse(demandee + 'T00:00:00Z') - Date.parse(utc + 'T00:00:00Z')) / 86400000;
  return ecart <= 1 ? demandee : utc;
}

// Une question du pool vérifié, la même pour tous ce jour-là. null si le pool est injoignable.
async function questionDuPool(env, request, date) {
  try {
    if (!env.ASSETS) return null;
    const reponse = await env.ASSETS.fetch(new Request(new URL('/contenu/questions.json', request.url)));
    if (!reponse.ok) return null;
    const pool = (await reponse.json()).filter((x) => x && x.question && x.question.type !== 'ordre');
    if (!pool.length) return null;
    const x = pool[Math.floor(generateur(Number(date.replace(/-/g, '')))() * pool.length)];
    return { palier: x.palier, titre: x.titre, index: x.index, question: x.question };
  } catch {
    return null;
  }
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const date = dateDemandee(new URL(request.url));
  const theme = themeDuJour(date);
  const id = 'jour:' + date;

  let bloc = await lireBloc(env, id);
  if (!bloc && env.AI && (await quota(env, 'quizjour:tentatives', LIMITE_TENTATIVES_JOUR))) {
    try {
      const contenu = await genererBlocTheme(env, theme);
      const retenue = contenu.questions.find((q) => q.type === 'qcm') || contenu.questions[0];
      bloc = await ecrireBloc(env, { id, sujet: theme, bloc: 0, contenu: { ...contenu, questions: [retenue] } });
    } catch (e) {
      console.warn('Question du jour : échec', e && e.message);
    }
  }
  if (bloc && bloc.contenu.questions.length) {
    return json({ date, theme, question: questionsDuBloc(id, theme, bloc.contenu.questions)[0] });
  }
  return json({ date, theme: null, question: await questionDuPool(env, request, date), repli: true });
});
