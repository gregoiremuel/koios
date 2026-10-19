// GET /api/palier?parcours=<id>&n=<k> : un palier d'un parcours (k de 1 à 500).
// En cache : public, aucun quota. Sinon : connexion, quota, sources Wikipédia, rédaction, vérification par une
// 2e IA, mise en cache. Si k dépasse le plan, le plan de l'étape suivante (10 paliers) est écrit d'abord.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, quota,
} from '../../lib/api.js';
import {
  ETAPE_TAILLE, ID_PARCOURS, PALIER_MAX, decoderParcours, demarrerChrono, genererEtapeSuivante, genererPalier,
  idPalier, nbPaliers,
} from '../../lib/paliers.js';

const COLONNES = 'id, titre, contenu';

// Ajoute l'étape au parcours. Si un autre lecteur a écrit entre-temps, on relit : son étape (même numéro) vaut la nôtre.
async function enregistrerEtape(env, ligne, etape) {
  for (let essai = 0; essai < 3; essai++) {
    const contenu = JSON.parse(ligne.contenu);
    if (contenu.etapes.some((e) => e.numero === etape.numero)) return ligne;
    contenu.etapes.push(etape);
    const neuf = JSON.stringify(contenu);
    const ecrit = await env.DB.prepare('UPDATE parcours SET contenu = ? WHERE id = ? AND contenu = ?')
      .bind(neuf, ligne.id, ligne.contenu)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) return { ...ligne, contenu: neuf };
    ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(ligne.id).first();
    if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  }
  throw new ErreurHttp(503, 'Le parcours est très demandé. Réessaie dans un instant.');
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const p = new URL(request.url).searchParams;
  const parcoursId = p.get('parcours');
  const brutN = p.get('n');
  if (!parcoursId || brutN === null) throw new ErreurHttp(400, 'Indique le parcours et le numéro du palier.');
  if (!/^\d{1,3}$/.test(brutN) || Number(brutN) < 1 || Number(brutN) > PALIER_MAX) {
    throw new ErreurHttp(400, `Numéro de palier invalide : un entier de 1 à ${PALIER_MAX}.`);
  }
  if (!ID_PARCOURS.test(parcoursId)) throw new ErreurHttp(404, 'Parcours introuvable.');
  const k = Number(brutN);
  const id = idPalier(parcoursId, k);

  // En cache : on le sert (et on compte une vue), sans connexion ni quota.
  const cache = await env.DB.prepare('UPDATE paliers SET vues = vues + 1 WHERE id = ? RETURNING contenu')
    .bind(id)
    .first();
  if (cache) return json({ palier: JSON.parse(cache.contenu) });

  let ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(parcoursId).first();
  if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  let parcours = decoderParcours(ligne);
  const total = nbPaliers(parcours.etapes);
  // Seule l'étape qui suit le plan peut être écrite : pas de saut de plusieurs étapes.
  if (k > total + ETAPE_TAILLE) throw new ErreurHttp(404, 'Palier introuvable : lis d’abord les paliers précédents.');

  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
  if (!(await quota(env, 'palier:joueur:' + joueur.id, 30))) {
    throw new ErreurHttp(429, 'Tu as déjà lancé 30 paliers aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'palier:total', 300))) {
    throw new ErreurHttp(429, 'La bibliothèque est débordée aujourd’hui. Reviens demain.');
  }

  // Un seul chronomètre pour le plan éventuel, les sources, la rédaction et la vérification.
  const horloge = demarrerChrono();
  if (k > total) {
    const etape = await genererEtapeSuivante(env, parcours, horloge);
    ligne = await enregistrerEtape(env, ligne, etape);
    parcours = decoderParcours(ligne);
  }

  const palier = await genererPalier(env, { parcours, numero: k, horloge });

  // Deux lecteurs peuvent lancer le même palier en même temps : le premier enregistré gagne.
  const ecrit = await env.DB.prepare(
    `INSERT OR IGNORE INTO paliers (id, parcours, numero, contenu, vues, cree)
     VALUES (?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, parcoursId, k, JSON.stringify(palier), new Date().toISOString())
    .run();
  if (ecrit.meta && ecrit.meta.changes === 0) {
    const gagnant = await env.DB.prepare('SELECT contenu FROM paliers WHERE id = ?').bind(id).first();
    if (gagnant) return json({ palier: JSON.parse(gagnant.contenu) });
  }
  return json({ palier });
});
