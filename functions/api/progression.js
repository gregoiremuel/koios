// GET/PUT /api/progression : pseudo, ton du Rival et état de jeu du joueur connecté.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, pseudoValide,
} from '../../lib/api.js';
import { compterFaits } from '../../lib/groupes.js';
import { plafonnerParJour, plafondsPaliers, raisonCoupe, xpPlausible } from '../../lib/xp.js';

const TONS = ['taquin', 'sobre'];
const MAX_OCTETS = 64 * 1024;
const XP_MAX = 1000000;
const PALIERS_MAX = 100000;

async function joueurConnecte(request, env) {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  return joueur;
}

// XP envoyée par le téléphone : entier de 0 à 1 000 000. Le serveur la ramène ensuite à la valeur plausible (lib/xp.js).
function bornerXp(valeur) {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return 0;
  return Math.min(XP_MAX, Math.max(0, Math.floor(valeur)));
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  const joueur = await joueurConnecte(request, env);
  const ligne = await env.DB.prepare('SELECT etat FROM joueurs WHERE id = ?').bind(joueur.id).first();
  let etat = {};
  try {
    etat = JSON.parse(ligne && ligne.etat ? ligne.etat : '{}');
  } catch {
    etat = {};
  }
  return json({ pseudo: joueur.pseudo, ton: joueur.ton, etat });
});

export const onRequestPut = enveloppe(async ({ request, env }) => {
  const joueur = await joueurConnecte(request, env);
  const corps = await lireJSON(request, MAX_OCTETS);

  let pseudo = joueur.pseudo;
  if (corps.pseudo !== undefined && !joueur.compte) { // le pseudo d'un compte est unique et ne change pas ici
    pseudo = pseudoValide(corps.pseudo);
    if (pseudo === null) throw new ErreurHttp(400, 'Pseudo de 1 à 24 caractères attendu.');
  }
  let ton = joueur.ton;
  if (corps.ton !== undefined) {
    if (!TONS.includes(corps.ton)) throw new ErreurHttp(400, 'Ton inconnu : taquin ou sobre.');
    ton = corps.ton;
  }
  const etat = corps.etat;
  if (!etat || typeof etat !== 'object' || Array.isArray(etat)) {
    throw new ErreurHttp(400, 'État de jeu attendu : un objet.');
  }

  // Anti-triche : l'XP n'est pas crue sur parole. Elle est ramenée à ce que l'état prouve (leçons réellement écrites et faites, questions
  // réussies, jeux, révisions), puis au plafond de gain du jour. L'état gardé porte l'XP acceptée.
  const parcoursEnvoyes = etat.parcours && typeof etat.parcours === 'object' && !Array.isArray(etat.parcours) ? etat.parcours : null;
  const plafonds = await plafondsPaliers(env, parcoursEnvoyes ? Object.keys(parcoursEnvoyes) : []);
  const avant = await env.DB.prepare('SELECT points FROM joueurs WHERE id = ?').bind(joueur.id).first();
  const dejaAcceptee = avant && avant.points ? avant.points : 0;
  const envoyee = bornerXp(etat.xp);
  const demande = Math.min(envoyee, Math.max(dejaAcceptee, xpPlausible(etat, plafonds))); // jamais sous l'XP déjà acceptée
  const points = await plafonnerParJour(env, joueur.id, dejaAcceptee, demande);
  const raison = raisonCoupe(envoyee, demande, points);
  const propre = Object.hasOwn(etat, 'xp') ? { ...etat, xp: points } : { ...etat };
  if (parcoursEnvoyes) {
    propre.parcours = {};
    for (const [id, suivi] of Object.entries(parcoursEnvoyes)) {
      propre.parcours[id] = suivi && typeof suivi === 'object' && typeof suivi.xp === 'number' ? { ...suivi, xp: Math.min(Math.max(0, suivi.xp), points) } : suivi;
    }
  }

  // Le classement compte l'XP acceptée (`etat.xp`) et le nombre de paliers terminés (`etat.parcours[*].fait`).
  let valides = 0;
  if (parcoursEnvoyes) {
    for (const parcours of Object.values(parcoursEnvoyes)) {
      if (parcours && typeof parcours === 'object') valides += compterFaits(parcours.fait);
    }
  }
  valides = Math.min(PALIERS_MAX, valides);

  await env.DB.prepare(
    'UPDATE joueurs SET pseudo = ?, ton = ?, etat = ?, points = ?, valides = ?, maj = ? WHERE id = ?',
  )
    .bind(pseudo, ton, JSON.stringify(propre), points, valides, new Date().toISOString(), joueur.id)
    .run();
  return json(raison ? { ok: true, xp: points, raison } : { ok: true, xp: points });
});
