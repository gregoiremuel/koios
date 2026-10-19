// GET /api/duels (connexion) : les 20 derniers duels (et salons, tournois) que le lecteur a créés ou joués.
// Chaque entrée : {id, createur, scores, cree} ; un salon ou un tournoi ajoute titre, type et fin.
import { ErreurHttp, auth, enveloppe, exigerBase, json } from '../../lib/api.js';
import { scoresPublics } from '../../lib/questions.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  // Les identifiants ne contiennent que a-z et 0-9 : le motif LIKE est sûr, et on revérifie en JS.
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.scores, d.cree, d.createur AS createur_id, j.pseudo AS createur, s.titre, s.type, s.fin
     FROM duels d LEFT JOIN joueurs j ON j.id = d.createur LEFT JOIN salons s ON s.id = d.id
     WHERE d.scores LIKE ? OR d.createur = ? ORDER BY d.cree DESC, d.id LIMIT 20`,
  )
    .bind(`%"joueur":"${joueur.id}"%`, joueur.id)
    .all();
  const duels = [];
  for (const r of results || []) {
    let scores;
    try {
      scores = JSON.parse(r.scores);
    } catch {
      continue;
    }
    if (!Array.isArray(scores) || !(r.createur_id === joueur.id || scores.some((s) => s && s.joueur === joueur.id))) continue;
    duels.push({
      id: r.id,
      createur: r.type === 'tournoi' ? 'Koîos' : r.createur || 'Un joueur',
      scores: scoresPublics(scores),
      cree: r.cree,
      ...(r.type ? { titre: r.titre || null, type: r.type, fin: r.fin || null } : {}), // salons et tournois seulement
    });
  }
  return json({ duels });
});
