// POST /api/libre {sujet} : le Rival écrit un chapitre-brouillon (Workers AI), non vérifié.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota, quotaJoueur,
} from '../../lib/api.js';
import { genererChapitre } from '../../lib/libre.js';

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  if (!env.AI) throw new ErreurHttp(503, 'IA absente');

  const corps = await lireJSON(request, 2048);
  const sujet = nettoyer(corps.sujet);
  if (sujet === null || longueur(sujet) < 3 || longueur(sujet) > 80) {
    throw new ErreurHttp(400, 'Sujet de 3 à 80 caractères attendu.');
  }

  // Par joueur d'abord : un joueur qui insiste ne doit pas vider le quota des autres.
  if (!(await quotaJoueur(env, joueur, 'libre:joueur:' + joueur.id, 5))) {
    throw new ErreurHttp(429, 'Tu as déjà écrit 5 sujets libres aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'libre:total', 60))) {
    throw new ErreurHttp(429, 'Le Rival est débordé aujourd’hui. Reviens demain.');
  }

  const chapitre = await genererChapitre(env.AI, sujet);
  if (!chapitre) {
    throw new ErreurHttp(502, 'Le Rival n’a pas réussi à écrire ce sujet. Réessaie, ou change la formulation.');
  }

  try {
    await env.DB.prepare('INSERT INTO brouillons (joueur, sujet, contenu, cree) VALUES (?, ?, ?, ?)')
      .bind(joueur.id, sujet, JSON.stringify(chapitre), new Date().toISOString())
      .run();
  } catch (e) {
    console.error('Brouillon non enregistré :', e && e.message); // le joueur garde son chapitre
  }
  return json({ chapitre });
});
