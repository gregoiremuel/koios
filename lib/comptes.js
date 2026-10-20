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

// Un code (code d'ami, code temporaire de l'admin) se compare sans casse, accents, espaces ni tirets : « ABCD-1234 » vaut « abcd1234 ».
export function normaliserCode(texte) {
  return typeof texte === 'string' ? texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
}

// --- Validations ----------------------------------------------------------------------------------------------

// Pseudo : normalisé en NFKC (« ａｄｍｉｎ » devient « admin »), puis seulement A-Z a-z 0-9 _ . - et les lettres accentuées du français.
// Tout autre caractère (lettres d'autres alphabets, « ɡ » latin script, chiffres arabes, espaces) est refusé.
const MOTIF_PSEUDO = /^[A-Za-z0-9_.\-àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ]{3,20}$/u;
const PSEUDOS_RESERVES = ['admin', 'administrateur', 'koios', 'moderateur', 'support', 'root', 'systeme', 'staff', 'equipe', 'rival', 'anonyme'];
// Comparaison des pseudos réservés : sans casse, sans accents, sans séparateurs (« Ad.min », « k-o-i-o-s » ne passent pas non plus).
const formeReservee = (cle) => cle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_.-]+/g, '');
const normaliserPseudo = (p) => p.normalize('NFKC');

// Pseudo de compte : 3 à 20 caractères. Renvoie {pseudo, cle} ; cle = pseudo normalisé en minuscules, unique.
export function pseudoCompte(valeur) {
  const brut = nettoyer(valeur);
  const p = brut === null ? null : normaliserPseudo(brut);
  if (p === null || !MOTIF_PSEUDO.test(p)) {
    throw new ErreurHttp(400, 'Pseudo de 3 à 20 caractères attendu : lettres (sans espace), chiffres, tiret, point ou souligné.');
  }
  const cle = p.toLowerCase();
  if (PSEUDOS_RESERVES.includes(formeReservee(cle))) throw new ErreurHttp(409, 'Ce pseudo est réservé. Choisis-en un autre.');
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
  return p === null ? '' : normaliserPseudo(p).toLowerCase().slice(0, 40);
}

// --- Limites d'échecs ----------------------------------------------------------------------------------------
// Les compteurs vivent dans `quotas` (par jour). Les clés portent l'empreinte de l'IP, jamais l'adresse. Chaque essai est compté AVANT
// toute vérification coûteuse (quota() est atomique : des requêtes en parallèle ne dépassent pas le plafond) ; une réussite remet à zéro
// les compteurs du compte visé, jamais ceux de l'IP seule (sinon un compte à soi ouvrirait des essais illimités sur les autres).

export const ECHECS_PAR_JOUR = 10; // par pseudo et par IP
export const ECHECS_PSEUDO_PAR_JOUR = 100; // par pseudo, toutes IP confondues (devinette répartie)
export const ECHECS_IP_PAR_JOUR = 50; // par IP, tous pseudos confondus (devinette de pseudos en série)

// Compte un essai sur chaque limite [[clé, plafond], ...] ; lève 429 dès qu'un plafond est dépassé.
export async function compterEssais(env, limites) {
  for (const [cle, plafond] of limites) {
    if (!(await quota(env, cle, plafond))) {
      throw new ErreurHttp(429, 'Trop d’essais ratés aujourd’hui. Réessaie demain, ou utilise ta phrase de secours.');
    }
  }
}

export async function effacerEchecs(env, ...cles) {
  for (const cle of cles.flat()) await env.DB.prepare('DELETE FROM quotas WHERE cle = ?').bind(cle).run();
}

// --- Joueurs --------------------------------------------------------------------------------------------------

// Compte (non bloqué, sauf avecBloques) dont le pseudo est exactement celui-ci, sans tenir compte de la casse. Sinon null.
export async function joueurParPseudo(env, pseudo, { avecBloques = false } = {}) {
  const cle = cleDePseudo(pseudo);
  if (!cle) return null;
  return env.DB.prepare(`SELECT id, pseudo, points, valides FROM joueurs WHERE pseudo_cle = ?${avecBloques ? '' : ' AND COALESCE(bloque, 0) = 0'}`).bind(cle).first();
}

// Efface un compte : sessions, progression, amitiés, demandes, invitations, groupes, parties, scores. Les formations créées restent, sans auteur.
export async function supprimerJoueur(env, id) {
  const sql = (texte, ...params) => env.DB.prepare(texte).bind(...params);
  const compte = await sql('SELECT pseudo_cle FROM joueurs WHERE id = ?', id).first();
  const cle = compte && compte.pseudo_cle ? compte.pseudo_cle : null;
  const echapper = (t) => t.replace(/[\\%_]/g, (c) => '\\' + c);
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
    // Compteurs d'échecs liés au pseudo (connexion et secours : par pseudo, et par pseudo et IP).
    ...(cle ? ['conn', 'secours'].flatMap((t) => [
      sql('DELETE FROM quotas WHERE cle = ?', `echec:${t}:${cle}`),
      sql("DELETE FROM quotas WHERE cle LIKE ? ESCAPE '\\'", `echec:${t}:${echapper(cle)}:%`),
    ]) : []),
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
