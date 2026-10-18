// GET /api/sujet?id=<id> : un sujet (public, compte une vue).
// POST /api/sujet {titre, parent?} : crée un sujet (l'IA écrit le plan, une seule fois, pour tous les lecteurs).
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';
import {
  ID_MAX, contenuSujet, decoderSujet, genererPlan, idSujetValide, pageDuSujet, slug,
} from '../../lib/sujets.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw new ErreurHttp(400, 'Identifiant de sujet attendu.');
  const ligne = await env.DB.prepare(
    'UPDATE sujets SET vues = vues + 1 WHERE id = ? RETURNING id, titre, parent, niveau, contenu',
  )
    .bind(id)
    .first();
  if (!ligne) throw new ErreurHttp(404, 'Sujet introuvable.');
  return json({ sujet: decoderSujet(ligne).sujet });
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
  const feuille = slug(titre);
  if (feuille === '') throw new ErreurHttp(400, 'Titre sans lettre ni chiffre.');

  // Parent facultatif : il doit exister. Le niveau monte d'un cran par génération, jusqu'à 3.
  let parent = null;
  let niveau = 1;
  let parentTitre = null;
  if (corps.parent !== undefined && corps.parent !== null && corps.parent !== '') {
    if (!idSujetValide(corps.parent)) throw new ErreurHttp(400, 'Parent invalide.');
    const ligneParent = await env.DB.prepare('SELECT id, titre, niveau FROM sujets WHERE id = ?').bind(corps.parent).first();
    if (!ligneParent) throw new ErreurHttp(400, 'Le sujet parent n’existe pas.');
    parent = ligneParent.id;
    parentTitre = ligneParent.titre;
    niveau = Math.min(ligneParent.niveau + 1, 3);
  }
  const id = parent ? `${parent}.${feuille}` : feuille;
  if (id.length > ID_MAX) throw new ErreurHttp(400, 'Sujet trop profond.');

  // Déjà en cache : rien à générer, aucun quota.
  const existant = await env.DB.prepare('SELECT id, titre, parent, niveau, contenu FROM sujets WHERE id = ?').bind(id).first();
  if (existant) return json({ sujet: decoderSujet(existant).sujet });

  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
  if (!(await quota(env, 'sujet:joueur:' + joueur.id, 10))) {
    throw new ErreurHttp(429, 'Tu as déjà lancé 10 sujets aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'sujet:total', 80))) {
    throw new ErreurHttp(429, 'La bibliothèque est débordée aujourd’hui. Reviens demain.');
  }

  const page = await pageDuSujet(titre, parentTitre);
  const plan = await genererPlan(env.AI, { titre, parentTitre, niveau, page });
  if (!plan) {
    throw new ErreurHttp(502, 'Le Rival n’a pas réussi à écrire ce sujet. Réessaie, ou change la formulation.');
  }

  // Deux lecteurs peuvent lancer le même sujet en même temps : le premier enregistré gagne.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO sujets (id, titre, parent, niveau, contenu, auteur, vues, cree)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, titre, parent, niveau, JSON.stringify(contenuSujet(plan, page)), joueur.id, new Date().toISOString())
    .run();
  const ligne = await env.DB.prepare('SELECT id, titre, parent, niveau, contenu FROM sujets WHERE id = ?').bind(id).first();
  return json({ sujet: decoderSujet(ligne).sujet });
});
