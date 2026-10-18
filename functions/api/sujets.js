// GET /api/sujets?parent=<id> : les sujets enfants d'un sujet (sans parent : les sujets racine).
// Public. 60 au plus, par vues décroissantes.
import { enveloppe, exigerBase, json } from '../../lib/api.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const parent = new URL(request.url).searchParams.get('parent');
  const filtre = parent ? 'parent = ?' : 'parent IS NULL';
  const requete = env.DB.prepare(
    `SELECT id, titre, niveau, vues, json_extract(contenu, '$.resume') AS resume
     FROM sujets WHERE ${filtre} ORDER BY vues DESC, cree DESC, id LIMIT 60`,
  );
  const { results } = await (parent ? requete.bind(parent) : requete).all();
  return json({
    sujets: (results || []).map((s) => ({ id: s.id, titre: s.titre, resume: s.resume, niveau: s.niveau, vues: s.vues })),
  });
});
