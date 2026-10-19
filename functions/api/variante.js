// POST /api/variante {parcours, n, mode} : une leçon réécrite en version « simple » ou « expert ».
// Les sections de la leçon en cache (« En bref » et les explications) sont réécrites à partir de la leçon et des
// extraits Wikipédia de ses sources, puis vérifiées par une 2e IA comme une leçon (phrase non confirmée retirée).
// Mises en cache par leçon et par mode (table variantes, id = <parcours>:<n>:<mode>) : une version déjà écrite est
// renvoyée sans rien consommer. Les cours vérifiés (v-xx) n'ont pas de variante.
// Réponse : {variante: {id, parcours, n, mode, sections: {enBref, comment, pourquoi, ouQuand}, verification}}.
import { typographier } from '../../lib/typo.js';
import {
  ErreurHttp, auth, enveloppe, envAvecCle, exigerBase, json, lireJSON, quota,
} from '../../lib/api.js';
import {
  ID_PARCOURS, MODES_VARIANTE, PALIER_MAX, demarrerChrono, genererVariante,
} from '../../lib/paliers.js';

const VERIFIE = /^v-[a-z]{2}$/;

export const onRequestPost = enveloppe(async ({ request, env: envServeur }) => {
  await exigerBase(envServeur);
  const env = envAvecCle(request, envServeur); // clé IA personnelle facultative (en-tête x-cle-ia)
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 2048);

  if (typeof corps.parcours !== 'string' || !ID_PARCOURS.test(corps.parcours)) {
    throw new ErreurHttp(400, 'Identifiant de parcours attendu.');
  }
  if (VERIFIE.test(corps.parcours)) {
    throw new ErreurHttp(400, 'Les cours vérifiés à la main n’ont pas de version simple ou experte.');
  }
  if (!Number.isInteger(corps.n) || corps.n < 1 || corps.n > PALIER_MAX) {
    throw new ErreurHttp(400, `Numéro de leçon invalide : un entier de 1 à ${PALIER_MAX}.`);
  }
  if (!MODES_VARIANTE.includes(corps.mode)) throw new ErreurHttp(400, 'Mode inconnu : simple ou expert.');

  const parcours = await env.DB.prepare('SELECT id, titre FROM parcours WHERE id = ?').bind(corps.parcours).first();
  if (!parcours) throw new ErreurHttp(404, 'Parcours introuvable.');
  const ligne = await env.DB.prepare('SELECT contenu FROM paliers WHERE id = ?').bind(`${corps.parcours}:${corps.n}`).first();
  if (!ligne) throw new ErreurHttp(404, 'Leçon introuvable : ouvre-la d’abord.');

  // Déjà en cache : rien à générer, aucun quota.
  const id = `${corps.parcours}:${corps.n}:${corps.mode}`;
  const cache = await env.DB.prepare('SELECT contenu FROM variantes WHERE id = ?').bind(id).first();
  if (cache) return json({ variante: JSON.parse(cache.contenu) });

  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
  if (!(await quota(env, 'variante:joueur:' + joueur.id, 15))) {
    throw new ErreurHttp(429, 'Tu as déjà demandé 15 versions réécrites aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'variante:total', 150))) {
    throw new ErreurHttp(429, 'La bibliothèque est débordée aujourd’hui. Reviens demain.');
  }

  let lecon;
  try {
    lecon = JSON.parse(ligne.contenu);
  } catch {
    throw new ErreurHttp(404, 'Leçon introuvable : ouvre-la d’abord.');
  }
  const ecrit = typographier(await genererVariante(env, { parcours, lecon, mode: corps.mode, horloge: demarrerChrono() }));
  const variante = { id, parcours: corps.parcours, n: corps.n, mode: corps.mode, ...ecrit };

  // Deux lecteurs peuvent lancer la même version en même temps : le premier enregistré gagne.
  await env.DB.prepare('INSERT OR IGNORE INTO variantes (id, contenu, cree) VALUES (?, ?, ?)')
    .bind(id, JSON.stringify(variante), new Date().toISOString())
    .run();
  const gagnant = await env.DB.prepare('SELECT contenu FROM variantes WHERE id = ?').bind(id).first();
  return json({ variante: JSON.parse(gagnant.contenu) });
});
