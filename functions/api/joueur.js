// POST /api/joueur {pseudo} : crée un joueur. La clé n'est renvoyée qu'une fois ; seul son hash est gardé.
import {
  ErreurHttp, enveloppe, exigerBase, lireJSON, pseudoValide, quota, sha256Hex, aleatoire, json,
} from '../../lib/api.js';

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const corps = await lireJSON(request, 1024);
  const pseudo = pseudoValide(corps.pseudo);
  if (pseudo === null) throw new ErreurHttp(400, 'Pseudo de 1 à 24 caractères attendu.');

  // L'adresse IP n'est jamais gardée en clair : seulement son hash.
  const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
  if (!(await quota(env, 'joueur:' + (await sha256Hex(ip)), 20))) {
    throw new ErreurHttp(429, 'Trop de créations de profil aujourd’hui. Réessaie demain.');
  }

  const id = aleatoire(12);
  const cle = aleatoire(32);
  const maintenant = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO joueurs (id, cle_hash, pseudo, ton, etat, points, valides, cree, maj)
     VALUES (?, ?, ?, 'taquin', '{}', 0, 0, ?, ?)`,
  )
    .bind(id, await sha256Hex(cle), pseudo, maintenant, maintenant)
    .run();
  return json({ id, cle, pseudo });
});
