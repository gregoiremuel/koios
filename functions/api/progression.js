// GET/PUT /api/progression : pseudo, ton du Rival et état de jeu du joueur connecté.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, pseudoValide,
} from '../../lib/api.js';

const TONS = ['taquin', 'sobre'];
const MAX_OCTETS = 64 * 1024;
const XP_MAX = 1000000;
const PALIERS_PAR_PARCOURS = 500;
const PALIERS_MAX = 100000;

async function joueurConnecte(request, env) {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  return joueur;
}

// Points du classement : l'XP du joueur, entier de 0 à 1 000 000.
function bornerXp(valeur) {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return 0;
  return Math.min(XP_MAX, Math.max(0, Math.floor(valeur)));
}

// Paliers terminés d'un parcours (`fait`) : liste de numéros, objet {numéro: vrai} ou nombre. 500 au plus.
function compterFaits(fait) {
  const numero = (v) => {
    const n = typeof v === 'string' && /^\d{1,3}$/.test(v) ? Number(v) : v;
    return Number.isInteger(n) && n >= 1 && n <= PALIERS_PAR_PARCOURS ? n : null;
  };
  if (Array.isArray(fait)) return new Set(fait.map(numero).filter((n) => n !== null)).size;
  if (fait && typeof fait === 'object') {
    return Object.entries(fait).filter(([cle, v]) => v && numero(cle) !== null).length;
  }
  if (typeof fait === 'number' && Number.isFinite(fait)) {
    return Math.min(PALIERS_PAR_PARCOURS, Math.max(0, Math.floor(fait)));
  }
  return 0;
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
  if (corps.pseudo !== undefined) {
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

  // Le classement compte l'XP (`etat.xp`) et le nombre de paliers terminés (`etat.parcours[*].fait`).
  const points = bornerXp(etat.xp);
  let valides = 0;
  if (etat.parcours && typeof etat.parcours === 'object' && !Array.isArray(etat.parcours)) {
    for (const parcours of Object.values(etat.parcours)) {
      if (parcours && typeof parcours === 'object') valides += compterFaits(parcours.fait);
    }
  }
  valides = Math.min(PALIERS_MAX, valides);

  await env.DB.prepare(
    'UPDATE joueurs SET pseudo = ?, ton = ?, etat = ?, points = ?, valides = ?, maj = ? WHERE id = ?',
  )
    .bind(pseudo, ton, JSON.stringify(etat), points, valides, new Date().toISOString(), joueur.id)
    .run();
  return json({ ok: true });
});
