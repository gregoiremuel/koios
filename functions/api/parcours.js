// GET /api/parcours?id=<id> : un parcours (public, compte une vue). GET /api/parcours : les 60 plus lus.
// POST /api/parcours {titre} : crée un parcours (sources, plan de l'étape 1, résumé, photo de tête), une seule fois
// pour tous les lecteurs. Un parcours qui existe déjà est renvoyé sans rien générer ni consommer de quota.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';
import {
  ID_PARCOURS, decoderParcours, demarrerChrono, genererParcours, nbPaliers,
} from '../../lib/paliers.js';
import { slug } from '../../lib/sujets.js';

const COLONNES = 'id, titre, contenu';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const p = new URL(request.url).searchParams;

  if (!p.has('id')) {
    const { results } = await env.DB.prepare(
      'SELECT id, titre, contenu, vues FROM parcours ORDER BY vues DESC, cree DESC, id LIMIT 60',
    ).all();
    const parcours = [];
    for (const r of results || []) {
      try {
        const c = decoderParcours(r);
        parcours.push({ id: r.id, titre: r.titre, image: c.image, vues: r.vues, paliers: nbPaliers(c.etapes) });
      } catch {
        // contenu illisible : ce parcours est écarté de la liste
      }
    }
    return json({ parcours });
  }

  const id = p.get('id');
  if (!id) throw new ErreurHttp(400, 'Identifiant de parcours attendu.');
  if (!ID_PARCOURS.test(id)) throw new ErreurHttp(404, 'Parcours introuvable.');
  const ligne = await env.DB.prepare(`UPDATE parcours SET vues = vues + 1 WHERE id = ? RETURNING ${COLONNES}`)
    .bind(id)
    .first();
  if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  return json({ parcours: decoderParcours(ligne) });
});

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 2048);

  const titre = nettoyer(corps.titre);
  if (titre === null || longueur(titre) < 2 || longueur(titre) > 80) {
    throw new ErreurHttp(400, 'Titre de 2 à 80 caractères attendu.');
  }
  const id = slug(titre);
  if (id === '') throw new ErreurHttp(400, 'Titre sans lettre ni chiffre.');

  // Déjà en cache : rien à générer, aucun quota.
  const existant = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(id).first();
  if (existant) return json({ parcours: decoderParcours(existant) });

  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
  if (!(await quota(env, 'parcours:joueur:' + joueur.id, 10))) {
    throw new ErreurHttp(429, 'Tu as déjà lancé 10 parcours aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'parcours:total', 80))) {
    throw new ErreurHttp(429, 'La bibliothèque est débordée aujourd’hui. Reviens demain.');
  }

  const contenu = await genererParcours(env, titre, demarrerChrono());

  // Deux lecteurs peuvent lancer le même parcours en même temps : le premier enregistré gagne.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO parcours (id, titre, contenu, auteur, vues, cree)
     VALUES (?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, titre, JSON.stringify(contenu), joueur.id, new Date().toISOString())
    .run();
  const ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(id).first();
  return json({ parcours: decoderParcours(ligne) });
});
