// GET /api/cercle (connexion) : toi et tes amis, classés par XP (50 au plus). Jamais d'identifiant, de clé ni de joueur inconnu :
// aucune route ne liste les joueurs à un non-admin.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json,
} from '../../lib/api.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const lecteur = await auth(request, env);
  if (!lecteur) throw new ErreurHttp(401, 'Connexion requise.');
  const { results } = await env.DB.prepare(
    `SELECT j.id, j.pseudo, j.points, j.valides FROM joueurs j
     WHERE COALESCE(j.bloque, 0) = 0 AND (j.id = ? OR j.id IN
       (SELECT CASE WHEN a = ? THEN b ELSE a END FROM amities WHERE etat = 'ami' AND (a = ? OR b = ?)))
     ORDER BY j.points DESC, j.valides DESC, j.cree ASC LIMIT 50`,
  )
    .bind(lecteur.id, lecteur.id, lecteur.id, lecteur.id)
    .all();
  return json({
    joueurs: (results || []).map((j) => ({ pseudo: j.pseudo, points: j.points, valides: j.valides, ...(lecteur.id === j.id ? { moi: true } : {}) })),
  });
});
