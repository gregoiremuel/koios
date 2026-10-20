// GET /api/chapitre-ia?sujet=<id>&n=<k> (ou ?id=ia:<sujet>:<k>) : un chapitre IA.
// En cache : public, aucun quota. Sinon : connexion, quota, génération ancrée sur Wikipédia, mise en cache.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, quota, quotaJoueur,
} from '../../lib/api.js';
import {
  assemblerChapitre, decoderSujet, genererContenuChapitre, idChapitre, lireIdChapitre, pagesDuChapitre,
} from '../../lib/sujets.js';

function demande(url) {
  const p = url.searchParams;
  if (p.get('id')) {
    const lu = lireIdChapitre(p.get('id'));
    if (!lu) throw new ErreurHttp(400, 'Identifiant de chapitre invalide.');
    return lu;
  }
  const sujetId = p.get('sujet');
  const n = p.get('n');
  if (!sujetId || n === null) throw new ErreurHttp(400, 'Indique le sujet et le numéro du chapitre.');
  if (!/^\d{1,3}$/.test(n)) throw new ErreurHttp(400, 'Numéro de chapitre invalide.');
  return { sujetId, numero: Number(n) };
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const { sujetId, numero } = demande(new URL(request.url));
  const id = idChapitre(sujetId, numero);

  // En cache : on le sert (et on compte une vue), sans connexion ni quota.
  const cache = await env.DB.prepare('UPDATE chapitres_ia SET vues = vues + 1 WHERE id = ? RETURNING contenu')
    .bind(id)
    .first();
  if (cache) return json({ chapitre: JSON.parse(cache.contenu) });

  const ligneSujet = await env.DB.prepare('SELECT id, titre, parent, niveau, contenu FROM sujets WHERE id = ?')
    .bind(sujetId)
    .first();
  if (!ligneSujet) throw new ErreurHttp(404, 'Sujet introuvable.');
  const { sujet, pageWiki } = decoderSujet(ligneSujet);
  const entree = sujet.plan.find((c) => c.numero === numero);
  if (!entree) throw new ErreurHttp(404, 'Chapitre introuvable.');

  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
  if (!(await quotaJoueur(env, joueur, 'chapitre:joueur:' + joueur.id, 15))) {
    throw new ErreurHttp(429, 'Tu as déjà lancé 15 chapitres aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'chapitre:total', 100))) {
    throw new ErreurHttp(429, 'La bibliothèque est débordée aujourd’hui. Reviens demain.');
  }

  const pages = await pagesDuChapitre(sujet, entree, pageWiki);
  const contenu = await genererContenuChapitre(env.AI, sujet, entree, pages);
  if (!contenu) {
    throw new ErreurHttp(502, 'Le Rival n’a pas réussi à écrire ce chapitre. Réessaie dans un moment.');
  }
  const chapitre = assemblerChapitre(sujet, entree, contenu, pages);

  // Deux lecteurs peuvent lancer le même chapitre en même temps : le premier enregistré gagne.
  const ecrit = await env.DB.prepare(
    `INSERT OR IGNORE INTO chapitres_ia (id, sujet, numero, contenu, vues, cree)
     VALUES (?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, sujetId, numero, JSON.stringify(chapitre), new Date().toISOString())
    .run();
  if (ecrit.meta && ecrit.meta.changes === 0) {
    const gagnant = await env.DB.prepare('SELECT contenu FROM chapitres_ia WHERE id = ?').bind(id).first();
    if (gagnant) return json({ chapitre: JSON.parse(gagnant.contenu) });
  }
  return json({ chapitre });
});
