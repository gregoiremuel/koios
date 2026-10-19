// GET /api/palier?parcours=<id>&n=<k> : un palier d'un parcours (k de 1 à 1 500).
// En cache : public, aucun quota. Sinon : connexion, quota, sources Wikipédia, rédaction, vérification par une
// 2e IA, mise en cache. Si k dépasse le plan, le plan de l'étape suivante est écrit d'abord : 10 paliers (ancien
// format, sans fin) ou les leçons du module suivant du programme (5 à 10 ; 404 quand le programme est terminé).
import {
  ErreurHttp, auth, enveloppe, envAvecCle, exigerBase, json, quota,
} from '../../lib/api.js';
import {
  ETAPE_TAILLE, ID_PARCOURS, MESSAGE_FIN, PALIER_MAX, decoderParcours, demarrerChrono, idPalier, nbPaliers,
} from '../../lib/paliers.js';
import { COLONNES, ecrireLecon, ouvrirEtapeSuivante } from '../../lib/generation.js';

export const onRequestGet = enveloppe(async ({ request, env: envServeur }) => {
  await exigerBase(envServeur);
  // Clé IA personnelle (en-tête x-cle-ia) : elle passe en premier pour la rédaction ; jamais enregistrée ni renvoyée.
  const env = envAvecCle(request, envServeur);
  const p = new URL(request.url).searchParams;
  const parcoursId = p.get('parcours');
  const brutN = p.get('n');
  if (!parcoursId || brutN === null) throw new ErreurHttp(400, 'Indique le parcours et le numéro du palier.');
  if (!/^\d{1,4}$/.test(brutN) || Number(brutN) < 1 || Number(brutN) > PALIER_MAX) {
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
  // Parcours à programme : tous les modules sont ouverts, il n'y a plus rien à écrire.
  if (parcours.programme && k > total && parcours.etapes.length >= parcours.modulesTotal) {
    throw new ErreurHttp(404, MESSAGE_FIN);
  }
  // Seule l'étape (le module) qui suit le plan peut être écrite : pas de saut de plusieurs étapes.
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
    ligne = await ouvrirEtapeSuivante(env, ligne, parcours, horloge);
    parcours = decoderParcours(ligne);
    // Le module compte moins de leçons que prévu : ce palier n'existe pas (le module reste enregistré).
    if (k > nbPaliers(parcours.etapes)) throw new ErreurHttp(404, 'Palier introuvable : lis d’abord les paliers précédents.');
  }

  // Deux lecteurs (ou la génération de nuit) peuvent lancer la même leçon en même temps : la première enregistrée gagne.
  return json({ palier: await ecrireLecon(env, { parcours, numero: k, horloge }) });
});
