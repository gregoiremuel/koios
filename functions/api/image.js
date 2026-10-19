// GET /api/image?q=<sujet> : une photo libre (Unsplash, sinon rien) pour illustrer un parcours ou un palier vérifié.
// Mise en cache par requête (y compris l'absence de résultat), 400 recherches nouvelles par jour au plus.
import { ErreurHttp, enveloppe, exigerBase, json, quota } from '../../lib/api.js';
import { imageUnsplash } from '../../lib/images.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) throw new ErreurHttp(400, 'Requête d’image attendue.');
  const cle = q.toLowerCase();
  const ligne = await env.DB.prepare('SELECT contenu FROM images WHERE requete = ?').bind(cle).first();
  if (ligne) return json({ image: JSON.parse(ligne.contenu) });
  if (!(await quota(env, 'image:total', 400))) return json({ image: null });
  let image = null;
  try { image = await imageUnsplash(env, q, q); } catch { image = null; }
  await env.DB.prepare('INSERT OR IGNORE INTO images (requete, contenu, cree) VALUES (?, ?, ?)')
    .bind(cle, JSON.stringify(image), new Date().toISOString()).run();
  return json({ image });
});
