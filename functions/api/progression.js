// GET/PUT /api/progression : pseudo, ton du Rival et état de jeu du joueur connecté.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, pseudoValide,
} from '../../lib/api.js';

const TONS = ['taquin', 'sobre'];
const MAX_OCTETS = 64 * 1024;

async function joueurConnecte(request, env) {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  return joueur;
}

function borner(valeur) {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return 0;
  return Math.min(40, Math.max(0, Math.floor(valeur)));
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

  let points = 0;
  let valides = 0;
  if (etat.chapitres && typeof etat.chapitres === 'object') {
    for (const [cle, chapitre] of Object.entries(etat.chapitres)) {
      // Le classement ne compte que les chapitres vérifiés : les brouillons IA (« ia:… ») n'y entrent pas.
      if (!chapitre || typeof chapitre !== 'object' || cle.startsWith('ia:')) continue;
      points += borner(chapitre.points);
      if (chapitre.valide === true) valides += 1;
    }
  }

  await env.DB.prepare(
    'UPDATE joueurs SET pseudo = ?, ton = ?, etat = ?, points = ?, valides = ?, maj = ? WHERE id = ?',
  )
    .bind(pseudo, ton, JSON.stringify(etat), points, valides, new Date().toISOString(), joueur.id)
    .run();
  return json({ ok: true });
});
