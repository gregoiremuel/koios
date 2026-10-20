// Outils communs de l'API Koîos. Aucune dépendance, aucun secret.
// Importé en relatif par les fonctions de functions/api/ (le dossier lib/ n'est pas une route).

const ENTETES = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

// Colonnes de comptes ajoutées à `joueurs` (lot 6). Elles figurent dans le CREATE TABLE ci-dessous ; une base plus ancienne les reçoit par ALTER
// au démarrage (migrerBase). Les index uniques viennent après, car ils portent sur ces colonnes. Un pseudo ou un identifiant Google nul n'est pas unique.
export const COLONNES_COMPTE = [
  ['prenom', 'TEXT'], ['nom', 'TEXT'], ['pseudo_cle', 'TEXT'], ['mdp_hash', 'TEXT'], ['secours_hash', 'TEXT'],
  ['role', "TEXT DEFAULT 'joueur'"], ['bloque', 'INTEGER DEFAULT 0'], ['google_sub', 'TEXT'], ['vu', 'TEXT'],
  ['reinit_hash', 'TEXT'], ['reinit_fin', 'TEXT'],
];
const INDEX_COMPTES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_joueurs_pseudo_cle ON joueurs(pseudo_cle) WHERE pseudo_cle IS NOT NULL',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_joueurs_google_sub ON joueurs(google_sub) WHERE google_sub IS NOT NULL',
];

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
  maj TEXT,
  prenom TEXT,
  nom TEXT,
  pseudo_cle TEXT,
  mdp_hash TEXT,
  secours_hash TEXT,
  role TEXT DEFAULT 'joueur',
  bloque INTEGER DEFAULT 0,
  google_sub TEXT,
  vu TEXT,
  reinit_hash TEXT,
  reinit_fin TEXT
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
  cree TEXT,
  traite INTEGER DEFAULT 0
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
  `CREATE TABLE IF NOT EXISTS variantes (
  id TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS file_attente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parcours TEXT,
  type TEXT,
  numero INTEGER,
  etat TEXT DEFAULT 'attente',
  essais INTEGER DEFAULT 0,
  erreur TEXT,
  maj TEXT,
  UNIQUE (parcours, type, numero)
)`,
  `CREATE TABLE IF NOT EXISTS sources_cache (
  cle TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
)`,
  `CREATE TABLE IF NOT EXISTS sessions (
  cle_hash TEXT PRIMARY KEY,
  joueur_id TEXT,
  cree TEXT,
  vu TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_joueur ON sessions(joueur_id)`,
  `CREATE TABLE IF NOT EXISTS codes (
  code TEXT PRIMARY KEY,
  bonus INTEGER,
  jours INTEGER,
  usages_max INTEGER,
  usages INTEGER DEFAULT 0,
  cree TEXT,
  revoque INTEGER DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS codes_utilises (
  code TEXT,
  joueur_id TEXT,
  expire TEXT,
  PRIMARY KEY (code, joueur_id)
)`,
  `CREATE TABLE IF NOT EXISTS amities (
  a TEXT,
  b TEXT,
  etat TEXT,
  cree TEXT,
  PRIMARY KEY (a, b)
)`,
  `CREATE INDEX IF NOT EXISTS idx_amities_b ON amities(b)`,
  `CREATE TABLE IF NOT EXISTS invitations (
  jeton_hash TEXT PRIMARY KEY,
  joueur_id TEXT,
  cree TEXT,
  expire TEXT,
  usages_max INTEGER,
  usages INTEGER DEFAULT 0
)`,
  ...INDEX_COMPTES,
  `CREATE TABLE IF NOT EXISTS questions_cache (
  cle TEXT PRIMARY KEY,
  parcours TEXT,
  numero INTEGER,
  reponse TEXT,
  trouve INTEGER,
  ia TEXT,
  cree TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_cache_lecon ON questions_cache(parcours, numero)`,
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

// --- Clé IA personnelle (en-tête x-cle-ia: <fournisseur>:<clé>) -----------------
// Elle n'est jamais enregistrée, jamais journalisée, jamais renvoyée : masquer() la retire de tout message.

export const FOURNISSEURS_PERSO = ['gemini', 'glm', 'claude'];

// Renvoie {fournisseur, cle}, ou null sans en-tête. 400 si l'en-tête est illisible (sans jamais le recopier).
export function lireClePerso(request) {
  const brut = request && request.headers ? request.headers.get('x-cle-ia') : null;
  if (brut === null || brut === undefined || brut.trim() === '') return null;
  const m = /^([a-z]{2,10}):([A-Za-z0-9._~+/=-]{8,400})$/.exec(brut.trim());
  if (!m || !FOURNISSEURS_PERSO.includes(m[1])) {
    throw new ErreurHttp(400, 'Clé IA personnelle illisible : choisis Gemini, GLM ou Claude et colle la clé entière.');
  }
  return { fournisseur: m[1], cle: m[2] };
}

// Retire du texte la clé personnelle de la requête (et toute valeur de l'en-tête x-cle-ia).
export function masquer(texte, request) {
  let t = String(texte === undefined || texte === null ? '' : texte);
  const brut = request && request.headers ? request.headers.get('x-cle-ia') : null;
  if (brut) {
    const cle = brut.trim().split(':').slice(1).join(':');
    for (const secret of [brut.trim(), cle]) if (secret.length >= 6) t = t.split(secret).join('***');
  }
  return t;
}

// Environnement de la requête : avec `clePerso` quand le lecteur apporte sa clé (jamais sur le serveur d'origine).
export function envAvecCle(request, env) {
  const perso = lireClePerso(request);
  return perso ? { ...env, clePerso: perso } : env;
}

// Entoure un handler : toute erreur sort en JSON français, jamais en page HTML.
export function enveloppe(gestionnaire) {
  return async (contexte) => {
    try {
      return await gestionnaire(contexte);
    } catch (e) {
      if (e instanceof ErreurHttp) return json({ erreur: masquer(e.message, contexte && contexte.request) }, e.statut);
      console.error('Erreur API :', masquer(e && e.message, contexte && contexte.request));
      return json({ erreur: 'Service momentanément indisponible. Réessaie dans un instant.' }, 503);
    }
  };
}

// Ajoute à une base plus ancienne les colonnes de comptes qui manquent, puis les index uniques (idempotent).
export async function migrerBase(env) {
  const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info('joueurs')").all();
  const presentes = new Set((results || []).map((r) => r.name));
  for (const [nom, type] of COLONNES_COMPTE) {
    if (presentes.has(nom)) continue;
    try {
      await env.DB.prepare(`ALTER TABLE joueurs ADD COLUMN ${nom} ${type}`).run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e && e.message))) throw e; // un autre isolat l'a ajoutée entre-temps
    }
  }
  // Colonne `traite` des signalements (lot 7bis) : 1 une fois la leçon réécrite. Tolère une base sans cette table (elle est créée à part).
  const sig = await env.DB.prepare("SELECT name FROM pragma_table_info('signalements')").all();
  const colSig = new Set((sig.results || []).map((r) => r.name));
  if (colSig.size && !colSig.has('traite')) {
    try {
      await env.DB.prepare('ALTER TABLE signalements ADD COLUMN traite INTEGER DEFAULT 0').run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e && e.message))) throw e;
    }
  }
  for (const sql of INDEX_COMPTES) await env.DB.prepare(sql).run();
}

// Crée les tables une seule fois par isolat (puis migre les colonnes de comptes d'une base plus ancienne).
let promesseBase = null;
export function initBase(env) {
  if (!env.DB) return Promise.resolve(false);
  if (!promesseBase) {
    promesseBase = env.DB.batch(TABLES.filter((sql) => !INDEX_COMPTES.includes(sql)).map((sql) => env.DB.prepare(sql)))
      .then(() => migrerBase(env))
      .then(
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

// Comparaison de deux secrets à temps constant, quelle que soit leur longueur (comparaison de leurs empreintes).
export async function secretsEgaux(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false;
  return egal(await sha256Hex(a), await sha256Hex(b));
}

function egal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i++) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

export const SESSION_JOURS = 180;
const JOUR_MS = 86400000;
const HEURE_MS = 3600000;

export const egalConstant = egal;

// Empreinte de l'adresse IP : l'adresse n'est jamais gardée en clair.
export async function ipHachee(request) {
  return sha256Hex(request.headers.get('CF-Connecting-IP') || 'inconnue');
}

// En-tête « Authorization: Bearer <id>.<cle> » -> {id, cle}, ou null.
export function cleDeLaRequete(request) {
  const entete = (request.headers.get('authorization') || '').trim();
  const m = /^[Bb]earer ([a-z0-9]{12})\.([a-z0-9]{32})$/.exec(entete);
  return m ? { id: m[1], cle: m[2] } : null;
}

// Renvoie {id, pseudo, ton, role, compte} ou null. La clé est cherchée d'abord dans `sessions` (180 jours d'inactivité au plus), puis dans
// l'ancien joueurs.cle_hash (profils d'avant les comptes). Un compte bloqué reçoit 403. `compte` : le profil a un pseudo de compte.
export async function auth(request, env, { avecBloques = false } = {}) {
  if (!env.DB) return null;
  const m = cleDeLaRequete(request);
  if (!m) return null;
  await initBase(env);
  const empreinte = await sha256Hex(m.cle);
  const maintenant = Date.now();
  const iso = new Date(maintenant).toISOString();
  let ligne = null;
  const session = await env.DB.prepare(
    `SELECT s.joueur_id, s.vu AS session_vu, j.pseudo, j.ton, j.role, j.bloque, j.pseudo_cle, j.vu AS joueur_vu
     FROM sessions s JOIN joueurs j ON j.id = s.joueur_id WHERE s.cle_hash = ?`,
  )
    .bind(empreinte)
    .first();
  if (session && egal(session.joueur_id, m.id)) {
    const dernier = Date.parse(session.session_vu);
    if (!(dernier > maintenant - SESSION_JOURS * JOUR_MS)) {
      await env.DB.prepare('DELETE FROM sessions WHERE cle_hash = ?').bind(empreinte).run();
      return null;
    }
    ligne = session;
    if (!(dernier > maintenant - HEURE_MS)) {
      await env.DB.prepare('UPDATE sessions SET vu = ? WHERE cle_hash = ?').bind(iso, empreinte).run();
    }
  } else {
    const ancien = await env.DB.prepare('SELECT id, cle_hash, pseudo, ton, role, bloque, pseudo_cle, vu AS joueur_vu FROM joueurs WHERE id = ?')
      .bind(m.id)
      .first();
    if (!ancien || !egal(empreinte, ancien.cle_hash)) return null;
    ligne = { ...ancien, joueur_id: ancien.id };
  }
  if (ligne.bloque && !avecBloques) throw new ErreurHttp(403, 'Ce compte est bloqué. Contacte l’administrateur.');
  if (!(Date.parse(ligne.joueur_vu) > maintenant - HEURE_MS)) {
    await env.DB.prepare('UPDATE joueurs SET vu = ? WHERE id = ?').bind(iso, m.id).run();
  }
  return { id: m.id, pseudo: ligne.pseudo, ton: ligne.ton, role: ligne.role || 'joueur', compte: ligne.pseudo_cle !== null && ligne.pseudo_cle !== undefined };
}

// Comme auth, pour les routes ouvertes à tous : sans identité valable (ou si la base répond mal), le lecteur est anonyme.
// Un compte bloqué reçoit quand même 403.
export async function authOptionnelle(request, env) {
  try {
    return await auth(request, env);
  } catch (e) {
    if (e instanceof ErreurHttp) throw e;
    return null;
  }
}

// Nouvelle session pour un appareil : la clé n'est renvoyée qu'une fois, seule son empreinte est gardée. 20 appareils au plus par compte.
export async function creerSession(env, joueurId) {
  const cle = aleatoire(32);
  const iso = new Date(Date.now()).toISOString();
  await env.DB.prepare('INSERT INTO sessions (cle_hash, joueur_id, cree, vu) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(cle), joueurId, iso, iso)
    .run();
  await env.DB.prepare('DELETE FROM sessions WHERE joueur_id = ? AND cle_hash NOT IN (SELECT cle_hash FROM sessions WHERE joueur_id = ? ORDER BY vu DESC, cree DESC LIMIT 20)')
    .bind(joueurId, joueurId)
    .run();
  return { id: joueurId, cle };
}

// --- Mots de passe : PBKDF2-SHA256 (WebCrypto), 100 000 itérations (maximum des Workers), sel de 16 octets ---------
// Format « pbkdf2$100000$<sel hex>$<hash hex> ». Jamais journalisé, jamais renvoyé.

export const ITERATIONS_MDP = 100000;
const hex = (octets) => Array.from(octets, (o) => o.toString(16).padStart(2, '0')).join('');
const octetsDeHex = (texte) => Uint8Array.from(texte.match(/../g) || [], (h) => parseInt(h, 16));

async function deriver(texte, sel, iterations) {
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(texte).normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sel, iterations }, cle, 256));
}

export async function hacherMdp(mdp) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS_MDP}$${hex(sel)}$${hex(await deriver(mdp, sel, ITERATIONS_MDP))}`;
}

// Hash servant de leurre quand le compte n'existe pas : le temps de réponse ne dit pas si le pseudo existe.
const HASH_LEURRE = `pbkdf2$${ITERATIONS_MDP}$${'0'.repeat(32)}$${'0'.repeat(64)}`;

// Vrai si `mdp` correspond au hash stocké. Comparaison à temps constant ; un hash absent ou illisible ne correspond jamais
// (mais le calcul est fait quand même).
export async function verifierMdp(mdp, stocke) {
  const m = typeof stocke === 'string' ? /^pbkdf2\$(\d{4,6})\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(stocke) : null;
  const iterations = m ? Number(m[1]) : ITERATIONS_MDP;
  const valide = !!m && iterations >= 1000 && iterations <= ITERATIONS_MDP;
  const sel = octetsDeHex(valide ? m[2] : '0'.repeat(32));
  const calcule = hex(await deriver(typeof mdp === 'string' ? mdp : '', sel, valide ? iterations : ITERATIONS_MDP));
  const bon = egal(calcule, valide ? m[3] : '0'.repeat(64));
  return valide && bon;
}

export const verifierContreLeurre = (mdp) => verifierMdp(mdp, HASH_LEURRE).then(() => false);

// --- Limites de création par jour -----------------------------------------------------------------------------

// Somme des bonus des codes d'amis actifs (non expirés, non révoqués) de ce joueur.
export async function bonusActif(env, joueurId) {
  const ligne = await env.DB.prepare(
    `SELECT COALESCE(SUM(c.bonus), 0) AS n FROM codes_utilises u JOIN codes c ON c.code = u.code
     WHERE u.joueur_id = ? AND u.expire > ? AND c.revoque = 0`,
  )
    .bind(joueurId, new Date(Date.now()).toISOString())
    .first();
  return ligne ? Number(ligne.n) || 0 : 0;
}

// Quota par joueur pour les créations IA : limite de base + bonus des codes actifs ; un admin n'a pas de limite.
export async function quotaJoueur(env, joueur, cle, base) {
  await exigerBase(env);
  // Les créations avec l'IA exigent un compte connecté (un ancien profil sans compte ou un anonyme ne crée plus).
  if (!joueur) throw new ErreurHttp(401, 'Connecte-toi à ton compte pour créer une formation.');
  if (!joueur.compte) throw new ErreurHttp(403, 'Crée ton compte pour créer avec l’IA. Ton ancien profil peut lire, pas créer.');
  if (joueur.role === 'admin') return true;
  return quota(env, cle, base + await bonusActif(env, joueur.id));
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

// Rend une unité à un compteur du jour (appel qui n'a rien produit, ex. 502). Sans effet si le jour a changé.
export async function rendreQuota(env, cle) {
  const jour = new Date().toISOString().slice(0, 10);
  try {
    await env.DB.prepare('UPDATE quotas SET n = n - 1 WHERE cle = ? AND jour = ? AND n > 0').bind(cle, jour).run();
  } catch (e) {
    console.warn('quota : restitution impossible');
  }
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
