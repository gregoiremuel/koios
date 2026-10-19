// Outils communs de l'API Koîos. Aucune dépendance, aucun secret.
// Importé en relatif par les fonctions de functions/api/ (le dossier lib/ n'est pas une route).

const ENTETES = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

// Mêmes instructions que schema.sql (référence).
export const TABLES = [
  `CREATE TABLE IF NOT EXISTS joueurs (
  id TEXT PRIMARY KEY,
  cle_hash TEXT,
  pseudo TEXT,
  ton TEXT DEFAULT 'taquin',
  etat TEXT DEFAULT '{}',
  points INTEGER DEFAULT 0,
  valides INTEGER DEFAULT 0,
  cree TEXT,
  maj TEXT
)`,
  `CREATE TABLE IF NOT EXISTS brouillons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  joueur TEXT,
  sujet TEXT,
  contenu TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS signalements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  joueur TEXT,
  chapitre TEXT,
  exercice INTEGER,
  message TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS quotas (
  cle TEXT PRIMARY KEY,
  n INTEGER,
  jour TEXT
)`,
  `CREATE TABLE IF NOT EXISTS sujets (
  id TEXT PRIMARY KEY,
  titre TEXT,
  parent TEXT,
  niveau INTEGER,
  contenu TEXT,
  auteur TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_sujets_parent ON sujets(parent)`,
  `CREATE TABLE IF NOT EXISTS chapitres_ia (
  id TEXT PRIMARY KEY,
  sujet TEXT,
  numero INTEGER,
  contenu TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_chapitres_ia_sujet ON chapitres_ia(sujet)`,
  `CREATE TABLE IF NOT EXISTS duels (
  id TEXT PRIMARY KEY,
  createur TEXT,
  questions TEXT,
  scores TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS parcours (
  id TEXT PRIMARY KEY,
  titre TEXT,
  contenu TEXT,
  auteur TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS paliers (
  id TEXT PRIMARY KEY,
  parcours TEXT,
  numero INTEGER,
  contenu TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_paliers_parcours ON paliers(parcours)`,
  `CREATE TABLE IF NOT EXISTS quiz_direct (
  parcours TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS images (
  requete TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS quiz_general (
  id TEXT PRIMARY KEY,
  sujet TEXT,
  bloc INTEGER,
  contenu TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS salons (
  id TEXT PRIMARY KEY,
  titre TEXT,
  type TEXT,
  fin TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS groupes (
  id TEXT PRIMARY KEY,
  nom TEXT,
  parcours TEXT,
  createur TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS groupe_membres (
  groupe TEXT,
  joueur TEXT,
  rejoint TEXT,
  PRIMARY KEY (groupe, joueur)
)`,
  `CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  createur TEXT,
  titre TEXT,
  questions TEXT,
  etat TEXT,
  indice INTEGER,
  debut_question INTEGER,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS parties_joueurs (
  partie TEXT,
  joueur TEXT,
  points INTEGER,
  PRIMARY KEY (partie, joueur)
)`,
  `CREATE TABLE IF NOT EXISTS parties_reponses (
  partie TEXT,
  joueur TEXT,
  indice INTEGER,
  choix INTEGER,
  ms INTEGER,
  juste INTEGER,
  PRIMARY KEY (partie, joueur, indice)
)`,
];

export function json(obj, statut = 200) {
  return new Response(JSON.stringify(obj), { status: statut, headers: ENTETES });
}

// Erreur prévue : l'enveloppe la transforme en {erreur} avec le bon code.
export class ErreurHttp extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

// Entoure un handler : toute erreur sort en JSON français, jamais en page HTML.
export function enveloppe(gestionnaire) {
  return async (contexte) => {
    try {
      return await gestionnaire(contexte);
    } catch (e) {
      if (e instanceof ErreurHttp) return json({ erreur: e.message }, e.statut);
      console.error('Erreur API :', e && e.message);
      return json({ erreur: 'Service momentanément indisponible. Réessaie dans un instant.' }, 503);
    }
  };
}

// Crée les tables une seule fois par isolat.
let promesseBase = null;
export function initBase(env) {
  if (!env.DB) return Promise.resolve(false);
  if (!promesseBase) {
    promesseBase = env.DB.batch(TABLES.map((sql) => env.DB.prepare(sql))).then(
      () => true,
      (e) => {
        promesseBase = null; // on réessaiera à la requête suivante
        throw e;
      },
    );
  }
  return promesseBase;
}

// À appeler en tête des routes qui ont besoin de la base.
export async function exigerBase(env) {
  if (!env.DB) throw new ErreurHttp(503, 'base absente');
  await initBase(env);
}

export async function sha256Hex(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(octets), (o) => o.toString(16).padStart(2, '0')).join('');
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// n caractères a-z0-9 tirés avec crypto, sans biais (252 = 7 × 36).
export function aleatoire(n) {
  let sortie = '';
  const tampon = new Uint8Array(n * 2);
  while (sortie.length < n) {
    crypto.getRandomValues(tampon);
    for (const o of tampon) {
      if (o < 252 && sortie.length < n) sortie += ALPHABET[o % 36];
    }
  }
  return sortie;
}

function egal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

// En-tête « Authorization: Bearer <id>.<cle> ». Renvoie {id, pseudo, ton} ou null.
export async function auth(request, env) {
  if (!env.DB) return null;
  const entete = (request.headers.get('authorization') || '').trim();
  const m = /^[Bb]earer ([a-z0-9]{12})\.([a-z0-9]{32})$/.exec(entete);
  if (!m) return null;
  await initBase(env);
  const ligne = await env.DB.prepare('SELECT id, cle_hash, pseudo, ton FROM joueurs WHERE id = ?')
    .bind(m[1])
    .first();
  if (!ligne) return null;
  if (!egal(await sha256Hex(m[2]), ligne.cle_hash)) return null;
  return { id: ligne.id, pseudo: ligne.pseudo, ton: ligne.ton };
}

// Compteur par jour (UTC). Renvoie false quand le plafond est dépassé.
export async function quota(env, cle, max) {
  await exigerBase(env);
  const jour = new Date().toISOString().slice(0, 10);
  const ligne = await env.DB.prepare(
    `INSERT INTO quotas (cle, n, jour) VALUES (?, 1, ?)
     ON CONFLICT(cle) DO UPDATE SET
       n = CASE WHEN quotas.jour = excluded.jour THEN quotas.n + 1 ELSE 1 END,
       jour = excluded.jour
     RETURNING n`,
  )
    .bind(cle, jour)
    .first();
  return !!ligne && ligne.n <= max;
}

// Lit le corps JSON (objet) sans dépasser maxOctets. 413 si trop gros, 400 si illisible.
export async function lireJSON(request, maxOctets = 8192) {
  const declare = Number(request.headers.get('content-length'));
  if (Number.isFinite(declare) && declare > maxOctets) {
    throw new ErreurHttp(413, 'Corps de la requête trop gros.');
  }
  if (!request.body) throw new ErreurHttp(400, 'Corps JSON attendu.');
  const lecteur = request.body.getReader();
  const morceaux = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxOctets) {
      await lecteur.cancel().catch(() => {});
      throw new ErreurHttp(413, 'Corps de la requête trop gros.');
    }
    morceaux.push(value);
  }
  const octets = new Uint8Array(total);
  let position = 0;
  for (const m of morceaux) {
    octets.set(m, position);
    position += m.byteLength;
  }
  let valeur;
  try {
    valeur = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(octets));
  } catch {
    throw new ErreurHttp(400, 'Corps JSON illisible.');
  }
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new ErreurHttp(400, 'Corps JSON attendu : un objet.');
  }
  return valeur;
}

export function longueur(texte) {
  return Array.from(texte).length;
}

// Texte d'une ligne : espaces réduits, caractères de contrôle et marques d'inversion retirés.
// Renvoie null si ce n'est pas une chaîne.
export function nettoyer(valeur) {
  if (typeof valeur !== 'string') return null;
  return valeur
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}​‎‏‪-‮⁦-⁩﻿]/gu, '')
    .trim();
}

// Pseudo de 1 à 24 caractères, ou null.
export function pseudoValide(valeur) {
  const p = nettoyer(valeur);
  if (p === null) return null;
  const n = longueur(p);
  return n >= 1 && n <= 24 ? p : null;
}
