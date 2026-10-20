// POST /api/signalement {chapitre, exercice, message} : « c'est faux » ou autre remarque sur un exercice.
// POST /api/signalement {type: 'lecon', parcours, numero, motif, message?} : signaler une erreur dans une leçon (motif : fait, pas_clair
//   ou autre ; message de 300 caractères au plus, obligatoire pour « autre »). 5 par jour et par compte, un seul par leçon et par compte.
//   Stockage dans `signalements` : chapitre = « lecon:<parcours> », exercice = n° de la leçon, message = « <motif>|<texte> ».
//   Dès SEUIL_REECRITURE joueurs différents sur la même leçon, elle entre dans la file de réécriture (tâche `reecriture`).
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';
import { demanderReecriture } from '../../lib/nuit.js';
import { ID_PARCOURS, PALIER_MAX } from '../../lib/paliers.js';

export const MOTIFS_LECON = ['fait', 'pas_clair', 'autre'];
export const SEUIL_REECRITURE = 3;
export const SIGNALEMENTS_LECON_PAR_JOUR = 5;
const MESSAGE_LECON_MAX = 300;

async function signalerLecon(env, joueur, corps) {
  const parcours = typeof corps.parcours === 'string' && ID_PARCOURS.test(corps.parcours) ? corps.parcours : null;
  if (!parcours) throw new ErreurHttp(400, 'Parcours de la leçon attendu.');
  const numero = corps.numero;
  if (!Number.isInteger(numero) || numero < 1 || numero > PALIER_MAX) throw new ErreurHttp(400, `Numéro de leçon attendu : un entier de 1 à ${PALIER_MAX}.`);
  if (!MOTIFS_LECON.includes(corps.motif)) throw new ErreurHttp(400, 'Motif attendu : fait, pas_clair ou autre.');
  let texte = '';
  if (corps.message !== undefined && corps.message !== null && corps.message !== '') {
    texte = nettoyer(corps.message);
    if (texte === null || longueur(texte) > MESSAGE_LECON_MAX) throw new ErreurHttp(400, `Message de ${MESSAGE_LECON_MAX} caractères au plus.`);
  }
  if (corps.motif === 'autre' && longueur(texte) < 3) throw new ErreurHttp(400, 'Dis en quelques mots ce qui ne va pas.');
  const lecon = await env.DB.prepare('SELECT id FROM paliers WHERE parcours = ? AND numero = ?').bind(parcours, numero).first();
  if (!lecon) throw new ErreurHttp(404, 'Leçon introuvable.');
  const chapitre = 'lecon:' + parcours;
  const deja = await env.DB.prepare('SELECT id FROM signalements WHERE joueur = ? AND chapitre = ? AND exercice = ?').bind(joueur.id, chapitre, numero).first();
  if (deja) throw new ErreurHttp(409, 'Tu as déjà signalé cette leçon. Merci.');
  if (!(await quota(env, 'signalement-lecon:' + joueur.id, SIGNALEMENTS_LECON_PAR_JOUR))) {
    throw new ErreurHttp(429, `Tu as déjà fait ${SIGNALEMENTS_LECON_PAR_JOUR} signalements aujourd’hui. Réessaie demain.`);
  }
  await env.DB.prepare('INSERT INTO signalements (joueur, chapitre, exercice, message, cree) VALUES (?, ?, ?, ?, ?)')
    .bind(joueur.id, chapitre, numero, corps.motif + '|' + texte, new Date().toISOString())
    .run();
  const { n } = await env.DB.prepare('SELECT COUNT(DISTINCT joueur) AS n FROM signalements WHERE chapitre = ? AND exercice = ?').bind(chapitre, numero).first();
  let enFile = false;
  if (n >= SEUIL_REECRITURE) {
    await demanderReecriture(env, parcours, numero);
    enFile = true;
  }
  return json({ ok: true, enFile });
}

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 8192);
  if (corps.type === 'lecon') return signalerLecon(env, joueur, corps);

  const chapitre = nettoyer(corps.chapitre);
  if (chapitre === null || longueur(chapitre) < 1 || longueur(chapitre) > 40) {
    throw new ErreurHttp(400, 'Chapitre de 1 à 40 caractères attendu.');
  }
  const exercice = corps.exercice;
  if (!Number.isInteger(exercice) || exercice < 0 || exercice > 99) {
    throw new ErreurHttp(400, 'Numéro d’exercice attendu : un entier de 0 à 99.');
  }
  const message = nettoyer(corps.message);
  if (message === null || longueur(message) < 1 || longueur(message) > 1000) {
    throw new ErreurHttp(400, 'Message de 1 à 1000 caractères attendu.');
  }

  if (!(await quota(env, 'signalement:' + joueur.id, 30))) {
    throw new ErreurHttp(429, 'Trop de signalements aujourd’hui. Réessaie demain.');
  }
  await env.DB.prepare(
    'INSERT INTO signalements (joueur, chapitre, exercice, message, cree) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(joueur.id, chapitre, exercice, message, new Date().toISOString())
    .run();
  return json({ ok: true });
});
