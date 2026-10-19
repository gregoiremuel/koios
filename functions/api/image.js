// GET /api/image?q=<sujet>&source=auto|commons|unsplash : une photo libre pour illustrer un parcours ou une leçon.
//   commons  : Wikimedia Commons (domaine public, CC0, CC BY, CC BY-SA, 800 px de large au moins) ;
//   unsplash : Unsplash (clé UNSPLASH_KEY, crédit avec liens vers le photographe et Unsplash) ;
//   auto     : Commons d'abord, puis Unsplash (défaut).
// Réponse : { image: { src, alt, largeur, hauteur, credit, lien, source, ... } | null }.
// Mise en cache par source et par requête (y compris l'absence de résultat, sauf panne du fournisseur),
// 400 recherches nouvelles par jour au plus.
import { ErreurHttp, enveloppe, exigerBase, json, quota } from '../../lib/api.js';
import { SOURCES_IMAGE, chercherImage } from '../../lib/images.js';

export const onRequestGet = enveloppe(async ({ request, env, waitUntil }) => {
  await exigerBase(env);
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) throw new ErreurHttp(400, 'Requête d’image attendue.');
  const source = params.get('source') || 'auto';
  if (!SOURCES_IMAGE.includes(source)) throw new ErreurHttp(400, 'Source d’image inconnue : auto, commons ou unsplash.');
  const cle = `${source}:${q.toLowerCase()}`;
  const ligne = await env.DB.prepare('SELECT contenu FROM images WHERE requete = ?').bind(cle).first();
  if (ligne) return json({ image: JSON.parse(ligne.contenu) });
  if (!(await quota(env, 'image:total', 400))) return json({ image: null });
  let trouve = { image: null, incertain: true };
  try { trouve = await chercherImage(env, source, q, { waitUntil }); } catch { trouve = { image: null, incertain: true }; }
  if (trouve.image || !trouve.incertain) {
    await env.DB.prepare('INSERT OR IGNORE INTO images (requete, contenu, cree) VALUES (?, ?, ?)')
      .bind(cle, JSON.stringify(trouve.image), new Date().toISOString()).run();
  }
  return json({ image: trouve.image });
});
