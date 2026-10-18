// GET /api/duels (connexion) : les 20 derniers duels où le lecteur a joué.
import { ErreurHttp, auth, enveloppe, exigerBase, json } from '../../lib/api.js';
import { scoresPublics } from '../../lib/questions.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  // Les identifiants ne contiennent que a-z et 0-9 : le motif LIKE est sûr, et on revérifie en JS.
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.scores, d.cree, j.pseudo AS createur
     FROM duels d LEFT JOIN joueurs j ON j.id = d.createur
     WHERE d.scores LIKE ? ORDER BY d.cree DESC, d.id LIMIT 20`,
  )
    .bind(`%"joueur":"${joueur.id}"%`)
    .all();
  const duels = [];
  for (const r of results || []) {
    let scores;
    try {
      scores = JSON.parse(r.scores);
    } catch {
      continue;
    }
    if (!Array.isArray(scores) || !scores.some((s) => s && s.joueur === joueur.id)) continue;
    duels.push({ id: r.id, createur: r.createur || 'Un joueur', scores: scoresPublics(scores), cree: r.cree });
  }
  return json({ duels });
});
