// Comptes de Koîos (lot 6) : validations, phrase de secours, limites d'échecs, suppression d'un compte.
// Importé par functions/api/compte.js, amis.js et admin.js. Aucun secret : les mots de passe et les phrases ne sont jamais gardés en clair
// (PBKDF2, voir lib/api.js), jamais journalisés, jamais renvoyés.
import {
  ErreurHttp, longueur, nettoyer, quota,
} from './api.js';

// --- Phrase de secours : 12 mots tirés dans une liste fixe de 256 mots (8 bits chacun, sans biais : 96 bits en tout) ---------

export const MOTS_SECOURS = [
  'abeille', 'acier', 'agneau', 'aigle', 'algue', 'amande', 'ananas', 'arbre', 'argile', 'aurore', 'avion', 'bague', 'balcon', 'bambou', 'banane',
  'barque', 'basalte', 'bateau', 'beurre', 'biche', 'bisque', 'blason', 'bocal', 'boucle', 'bougie', 'bouton', 'branche', 'brume', 'buisson',
  'cabane', 'cactus', 'cadeau', 'cafe', 'caille', 'canard', 'canyon', 'carotte', 'carton', 'cascade', 'cerise', 'chaise', 'champ', 'chanson',
  'chapeau', 'chateau', 'chemin', 'cheval', 'chevre', 'cigale', 'ciment', 'citron', 'clavier', 'cloche', 'cobalt', 'colline', 'comete', 'concert',
  'coquille', 'corail', 'corde', 'coton', 'couteau', 'crayon', 'crevette', 'cuivre', 'cygne', 'dahlia', 'dauphin', 'desert', 'diamant', 'dragon',
  'eclair', 'ecorce', 'ecureuil', 'element', 'erable', 'escargot', 'etoile', 'falaise', 'farine', 'fenetre', 'fermier', 'fougere', 'fourmi',
  'fraise', 'fusain', 'galet', 'gazelle', 'genou', 'girafe', 'glacier', 'gomme', 'grenade', 'grotte', 'guitare', 'hamac', 'harpe', 'hibou',
  'horizon', 'hublot', 'iris', 'jardin', 'jasmin', 'jonquille', 'jungle', 'lagune', 'lampe', 'lavande', 'lezard', 'liane', 'librairie', 'lilas',
  'lingot', 'lion', 'livre', 'lumiere', 'lune', 'magnolia', 'maison', 'mangue', 'marbre', 'marmotte', 'meteore', 'miroir', 'moineau', 'montagne',
  'moulin', 'mouton', 'myrtille', 'nacre', 'navire', 'nenuphar', 'noisette', 'nuage', 'oasis', 'ocean', 'olivier', 'orage', 'orchidee', 'orgue',
  'ortie', 'ourson', 'paille', 'palmier', 'panier', 'papier', 'paysage', 'pelican', 'perle', 'phare', 'piano', 'pigeon', 'pinceau', 'planete',
  'plume', 'poire', 'pomme', 'pont', 'poulain', 'prairie', 'prune', 'puits', 'quartz', 'rabot', 'raisin', 'rameau', 'renard', 'riviere', 'rocher',
  'rosee', 'rubis', 'ruisseau', 'sable', 'safran', 'saphir', 'sapin', 'sarcelle', 'saule', 'sentier', 'serpent', 'sirop', 'soleil', 'source',
  'tabouret', 'tambour', 'tapis', 'tulipe', 'tunnel', 'vallon', 'velours', 'verger', 'violon', 'volcan', 'voilier', 'zebre', 'ambre', 'averse',
  'bergere', 'brouette', 'calcaire', 'cerf', 'cime', 'clairiere', 'dune', 'estuaire', 'etang', 'flute', 'glaise', 'jade', 'lac', 'lierre', 'menthe',
  'nectar', 'opale', 'pivoine', 'pluie', 'quai', 'rivage', 'romarin', 'sauge', 'tilleul', 'tonnelle', 'vague', 'violette', 'vigne', 'zenith',
  'aquarelle', 'boussole', 'ecluse', 'fanfare', 'gondole', 'hameau', 'lanterne', 'mosaique', 'nougat', 'paravent', 'regate', 'sonate', 'trefle',
  'vitrail', 'ruche', 'tisane', 'zephyr', 'cadran', 'forge', 'galerie', 'harmonie', 'ivoire', 'jetee', 'lagon', 'manoir', 'noyau', 'ombrelle',
  'sillage', 'topaze', 'olive',
];

export const MOTS_PAR_PHRASE = 12;

export function phraseDeSecours() {
  const tirage = crypto.getRandomValues(new Uint8Array(MOTS_PAR_PHRASE));
  return Array.from(tirage, (o) => MOTS_SECOURS[o]).join(' ');
}

// Une phrase (ou un code temporaire) se compare sans casse, sans accents ni ponctuation : « Cafe  Lune » vaut « café lune ».
export function normaliserPhrase(texte) {
  if (typeof texte !== 'string') return '';
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// --- Validations ----------------------------------------------------------------------------------------------

const MOTIF_PSEUDO = /^[\p{Script=Latin}\p{Nd}_.-]{3,20}$/u;
const PSEUDOS_RESERVES = ['admin', 'administrateur', 'koios', 'koîos', 'moderateur', 'modérateur', 'support', 'root', 'systeme', 'système'];

// Pseudo de compte : 3 à 20 caractères (lettres latines, chiffres, _ . -). Renvoie {pseudo, cle} ; cle = pseudo en minuscules, unique.
export function pseudoCompte(valeur) {
  const p = nettoyer(valeur);
  if (p === null || !MOTIF_PSEUDO.test(p)) {
    throw new ErreurHttp(400, 'Pseudo de 3 à 20 caractères attendu : lettres, chiffres, tiret, point ou souligné, sans espace.');
  }
  const cle = p.toLowerCase();
  if (PSEUDOS_RESERVES.includes(cle)) throw new ErreurHttp(409, 'Ce pseudo est réservé. Choisis-en un autre.');
  return { pseudo: p, cle };
}

// Prénom ou nom : 1 à 40 caractères.
export function nomPropre(valeur, libelle) {
  const t = nettoyer(valeur);
  if (t === null || longueur(t) < 1 || longueur(t) > 40) throw new ErreurHttp(400, `${libelle} de 1 à 40 caractères attendu.`);
  return t;
}

export const MDP_MIN = 10;
export const MDP_MAX = 128;

export function motDePasse(valeur, libelle = 'Mot de passe') {
  if (typeof valeur !== 'string' || longueur(valeur) < MDP_MIN || longueur(valeur) > MDP_MAX) {
    throw new ErreurHttp(400, `${libelle} de ${MDP_MIN} à ${MDP_MAX} caractères attendu.`);
  }
  return valeur;
}

// Clé de recherche d'un pseudo saisi (connexion, secours, amis) : sans erreur de format, la recherche échoue simplement.
export function cleDePseudo(valeur) {
  const p = nettoyer(valeur);
  return p === null ? '' : p.toLowerCase().slice(0, 40);
}

// --- Limites d'échecs ----------------------------------------------------------------------------------------
// Les compteurs vivent dans `quotas` (par jour). Les clés portent l'empreinte de l'IP, jamais l'adresse. Le refus ne dépend pas de
// l'existence du pseudo : on compte ce que l'appelant a saisi.

export const ECHECS_PAR_JOUR = 10; // par pseudo et par IP
export const ECHECS_PSEUDO_PAR_JOUR = 100; // par pseudo, toutes IP confondues (devinette répartie)

async function compteur(env, cle) {
  const jour = new Date().toISOString().slice(0, 10);
  const ligne = await env.DB.prepare('SELECT n FROM quotas WHERE cle = ? AND jour = ?').bind(cle, jour).first();
  return ligne ? ligne.n : 0;
}

// Lève 429 si une des limites est atteinte. `limites` : [[clé, plafond], ...].
export async function exigerPasBloque(env, limites) {
  for (const [cle, plafond] of limites) {
    if ((await compteur(env, cle)) >= plafond) {
      throw new ErreurHttp(429, 'Trop d’essais ratés aujourd’hui. Réessaie demain, ou utilise ta phrase de secours.');
    }
  }
}

export async function noterEchec(env, limites) {
  for (const [cle, plafond] of limites) await quota(env, cle, plafond);
}

export async function effacerEchecs(env, cle) {
  await env.DB.prepare('DELETE FROM quotas WHERE cle = ?').bind(cle).run();
}

// --- Joueurs --------------------------------------------------------------------------------------------------

// Compte actif (non bloqué, avec pseudo) dont le pseudo est exactement celui-ci, sans tenir compte de la casse. Sinon null.
export async function joueurParPseudo(env, pseudo) {
  const cle = cleDePseudo(pseudo);
  if (!cle) return null;
  return env.DB.prepare('SELECT id, pseudo, points, valides FROM joueurs WHERE pseudo_cle = ? AND COALESCE(bloque, 0) = 0').bind(cle).first();
}

// Efface un compte : sessions, progression, amitiés, demandes, invitations, groupes, parties, scores. Les formations créées restent, sans auteur.
export async function supprimerJoueur(env, id) {
  const sql = (texte, ...params) => env.DB.prepare(texte).bind(...params);
  // Les scores de duels et de salons gardent le pseudo : on retire les lignes de ce joueur (il n'y a rien d'autre à anonymiser).
  const { results } = await sql('SELECT id, scores FROM duels WHERE scores LIKE ?', `%"joueur":"${id}"%`).all();
  for (const d of results || []) {
    let scores;
    try {
      scores = JSON.parse(d.scores);
    } catch {
      continue;
    }
    if (!Array.isArray(scores)) continue;
    await sql('UPDATE duels SET scores = ? WHERE id = ?', JSON.stringify(scores.filter((s) => !(s && s.joueur === id))), d.id).run();
  }
  await env.DB.batch([
    sql('UPDATE duels SET createur = NULL WHERE createur = ?', id),
    sql('DELETE FROM sessions WHERE joueur_id = ?', id),
    sql('DELETE FROM amities WHERE a = ? OR b = ?', id, id),
    sql('DELETE FROM invitations WHERE joueur_id = ?', id),
    sql('DELETE FROM codes_utilises WHERE joueur_id = ?', id),
    sql('DELETE FROM groupe_membres WHERE joueur = ?', id),
    sql('UPDATE groupes SET createur = NULL WHERE createur = ?', id),
    sql('DELETE FROM groupes WHERE NOT EXISTS (SELECT 1 FROM groupe_membres WHERE groupe = groupes.id)'),
    sql('DELETE FROM parties_reponses WHERE joueur = ? OR partie IN (SELECT id FROM parties WHERE createur = ?)', id, id),
    sql('DELETE FROM parties_joueurs WHERE joueur = ? OR partie IN (SELECT id FROM parties WHERE createur = ?)', id, id),
    sql('DELETE FROM parties WHERE createur = ?', id),
    sql('UPDATE sujets SET auteur = NULL WHERE auteur = ?', id),
    sql('UPDATE parcours SET auteur = NULL WHERE auteur = ?', id),
    sql('DELETE FROM brouillons WHERE joueur = ?', id),
    sql('DELETE FROM signalements WHERE joueur = ?', id),
    sql("DELETE FROM quotas WHERE cle LIKE ? ESCAPE '\\'", `%:${id}`),
    sql('DELETE FROM joueurs WHERE id = ?', id),
  ]);
}

// Identifiants des amis (état « ami ») d'un joueur.
export async function idsAmis(env, id) {
  const { results } = await env.DB.prepare(
    "SELECT CASE WHEN a = ? THEN b ELSE a END AS ami FROM amities WHERE etat = 'ami' AND (a = ? OR b = ?)",
  )
    .bind(id, id, id)
    .all();
  return new Set((results || []).map((r) => r.ami));
}
