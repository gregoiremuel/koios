// GET /api/cercle : les 50 premiers joueurs. Jamais d'identifiant ni de clé.
import { enveloppe, exigerBase, json } from '../../lib/api.js';

export const onRequestGet = enveloppe(async ({ env }) => {
  await exigerBase(env);
  const { results } = await env.DB.prepare(
    'SELECT pseudo, points, valides FROM joueurs ORDER BY points DESC, valides DESC, cree ASC LIMIT 50',
  ).all();
  return json({
    joueurs: (results || []).map((j) => ({ pseudo: j.pseudo, points: j.points, valides: j.valides })),
  });
});
