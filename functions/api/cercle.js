// GET /api/cercle : les 50 premiers joueurs. Jamais d'identifiant ni de clé.
import { auth, enveloppe, exigerBase, json } from '../../lib/api.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const lecteur = await auth(request, env).catch(() => null);
  const { results } = await env.DB.prepare(
    'SELECT id, pseudo, points, valides FROM joueurs ORDER BY points DESC, valides DESC, cree ASC LIMIT 50',
  ).all();
  return json({
    joueurs: (results || []).map((j) => ({ pseudo: j.pseudo, points: j.points, valides: j.valides, ...(lecteur && lecteur.id === j.id ? { moi: true } : {}) })),
  });
});
