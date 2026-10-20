// Comptes (lot 6A). Un mot de passe n'est jamais gardé en clair (PBKDF2), jamais journalisé, jamais renvoyé ; aucun hash ne sort d'ici.
//   GET  /api/compte?config=1  (public) -> {google: <identifiant client> | null} : le bouton Google n'existe que si GOOGLE_CLIENT_ID est posé.
//   GET  /api/compte (connexion) -> {compte, pseudo, prenom, nom, role, google, motDePasse, cree, bonus, codes: [{bonus, expire}]}
//   POST /api/compte {action: ...} :
//     inscrire   {prenom, nom, pseudo, mdp} -> {id, cle, pseudo, prenom, nom, role, phrase} : la phrase de secours (12 mots) n'est montrée
//                qu'une fois. Avec la clé d'un ancien profil sans compte, ce profil est complété (la progression reste) et son ancienne clé ne
//                marche plus. 20 inscriptions par jour et par IP.
//     connecter  {pseudo, mdp} -> session. 10 échecs par jour par pseudo et par IP, puis 429 (100 par pseudo toutes IP confondues).
//     secours    {pseudo, phrase, nouveauMdp} -> session. Phrase de secours, ou code temporaire donné par l'admin. Toutes les sessions sont effacées.
//     deconnecter, mdp {ancien, nouveau}, supprimer {mdp | jeton | confirmer}, code {code}, google {jeton, pseudo?, prenom?, nom?}.
//   Une session = un appareil (Authorization: Bearer <id>.<cle>), 180 jours d'inactivité au plus.
import {
  ErreurHttp, auth, bonusActif, cleDeLaRequete, creerSession, enveloppe, exigerBase, hacherMdp, ipHachee, json,
  lireJSON, aleatoire, quota, sha256Hex, verifierContreLeurre, verifierMdp,
} from '../../lib/api.js';
import {
  ECHECS_IP_PAR_JOUR, ECHECS_PAR_JOUR, ECHECS_PSEUDO_PAR_JOUR, cleDePseudo, compterEssais, effacerEchecs, motDePasse, nomPropre,
  normaliserCode, normaliserPhrase, phraseDeSecours, pseudoCompte, supprimerJoueur,
} from '../../lib/comptes.js';

const INSCRIPTIONS_PAR_JOUR = 20;
const ECHECS_MDP_PAR_JOUR = 10;
const ECHECS_CODE_PAR_JOUR = 10;

const sessionPublique = (ligne, session, plus = {}) => ({
  id: session.id, cle: session.cle, pseudo: ligne.pseudo, prenom: ligne.prenom || null, nom: ligne.nom || null, role: ligne.role || 'joueur', ...plus,
});

const refusConnexion = () => new ErreurHttp(401, 'Pseudo ou mot de passe incorrect.');

// --- Création d'un compte (inscription ou Google) -----------------------------------------------------

async function ouvrirCompte(env, request, {
  pseudo, cle, prenom, nom, mdpHash = null, secoursHash = null, googleSub = null,
}) {
  const ip = await ipHachee(request);
  if (!(await quota(env, 'inscrire:' + ip, INSCRIPTIONS_PAR_JOUR))) {
    throw new ErreurHttp(429, 'Trop d’inscriptions depuis cette connexion aujourd’hui. Réessaie demain.');
  }
  const ancien = await auth(request, env); // ancien profil sans compte : on le complète
  if (ancien && ancien.compte) throw new ErreurHttp(409, 'Tu as déjà un compte. Déconnecte-toi avant d’en créer un autre.');
  const pris = await env.DB.prepare('SELECT 1 AS ok FROM joueurs WHERE pseudo_cle = ?').bind(cle).first();
  if (pris) throw new ErreurHttp(409, 'Ce pseudo est déjà pris. Choisis-en un autre.');
  const maintenant = new Date().toISOString();
  let id;
  try {
    if (ancien) {
      id = ancien.id;
      const ecrit = await env.DB.prepare(
        `UPDATE joueurs SET pseudo = ?, pseudo_cle = ?, prenom = ?, nom = ?, mdp_hash = ?, secours_hash = ?, google_sub = ?,
           cle_hash = NULL, maj = ?, vu = ? WHERE id = ? AND pseudo_cle IS NULL`,
      )
        .bind(pseudo, cle, prenom, nom, mdpHash, secoursHash, googleSub, maintenant, maintenant, id)
        .run();
      if (!(ecrit.meta && ecrit.meta.changes === 1)) throw new ErreurHttp(409, 'Ce profil a déjà un compte.');
      await env.DB.prepare('DELETE FROM sessions WHERE joueur_id = ?').bind(id).run();
    } else {
      id = aleatoire(12);
      await env.DB.prepare(
        `INSERT INTO joueurs (id, cle_hash, pseudo, ton, etat, points, valides, cree, maj, prenom, nom, pseudo_cle, mdp_hash, secours_hash, role, bloque, google_sub, vu)
         VALUES (?, NULL, ?, 'taquin', '{}', 0, 0, ?, ?, ?, ?, ?, ?, ?, 'joueur', 0, ?, ?)`,
      )
        .bind(id, pseudo, maintenant, maintenant, prenom, nom, cle, mdpHash, secoursHash, googleSub, maintenant)
        .run();
    }
  } catch (e) {
    if (e instanceof ErreurHttp) throw e;
    if (/UNIQUE|constraint/i.test(String(e && e.message))) {
      throw new ErreurHttp(409, /google/i.test(String(e.message)) ? 'Ce compte Google a déjà un compte Koîos.' : 'Ce pseudo est déjà pris. Choisis-en un autre.');
    }
    throw e;
  }
  return { id, session: await creerSession(env, id) };
}

async function inscrire(env, request, corps) {
  const { pseudo, cle } = pseudoCompte(corps.pseudo);
  const prenom = nomPropre(corps.prenom, 'Prénom');
  const nom = nomPropre(corps.nom, 'Nom');
  const mdp = motDePasse(corps.mdp);
  const phrase = phraseDeSecours();
  const { session } = await ouvrirCompte(env, request, {
    pseudo, cle, prenom, nom, mdpHash: await hacherMdp(mdp), secoursHash: await hacherMdp(normaliserPhrase(phrase)),
  });
  return json(sessionPublique({ pseudo, prenom, nom, role: 'joueur' }, session, { phrase }));
}

// --- Connexion, secours ---------------------------------------------------------------------------------

async function connecter(env, request, corps) {
  const ip = await ipHachee(request);
  // D'abord la limite par IP (tous pseudos confondus), avant tout calcul PBKDF2 ; puis, si le pseudo existe, celles du pseudo. Un pseudo
  // inconnu ne crée aucune ligne à son nom : il ne compte que par IP (et dans un compteur commun des pseudos inconnus, pour que la réponse
  // ne révèle pas s'il existe).
  await compterEssais(env, [[`echec:conn:ip:${ip}`, ECHECS_IP_PAR_JOUR]]);
  const cle = cleDePseudo(corps.pseudo);
  const ligne = cle
    ? await env.DB.prepare('SELECT id, pseudo, prenom, nom, role, bloque, mdp_hash FROM joueurs WHERE pseudo_cle = ?').bind(cle).first()
    : null;
  const limites = ligne
    ? [[`echec:conn:${cle}:${ip}`, ECHECS_PAR_JOUR], [`echec:conn:${cle}`, ECHECS_PSEUDO_PAR_JOUR]]
    : [[`echec:conn:inconnu:${ip}`, ECHECS_PAR_JOUR]];
  await compterEssais(env, limites);
  const bon = ligne && ligne.mdp_hash
    ? await verifierMdp(corps.mdp, ligne.mdp_hash)
    : await verifierContreLeurre(corps.mdp); // même durée, que le pseudo existe ou non
  if (!bon) throw refusConnexion();
  if (ligne.bloque) throw new ErreurHttp(403, 'Ce compte est bloqué. Contacte l’administrateur.');
  await effacerEchecs(env, limites.map((l) => l[0]));
  await env.DB.prepare('UPDATE joueurs SET vu = ? WHERE id = ?').bind(new Date().toISOString(), ligne.id).run();
  return json(sessionPublique(ligne, await creerSession(env, ligne.id)));
}

async function secours(env, request, corps) {
  const nouveau = motDePasse(corps.nouveauMdp, 'Nouveau mot de passe');
  const ip = await ipHachee(request);
  await compterEssais(env, [[`echec:secours:ip:${ip}`, ECHECS_IP_PAR_JOUR]]);
  const cle = cleDePseudo(corps.pseudo);
  const ligne = cle
    ? await env.DB.prepare('SELECT id, pseudo, prenom, nom, role, bloque, secours_hash, reinit_hash, reinit_fin FROM joueurs WHERE pseudo_cle = ?').bind(cle).first()
    : null;
  const limites = ligne
    ? [[`echec:secours:${cle}:${ip}`, ECHECS_PAR_JOUR], [`echec:secours:${cle}`, ECHECS_PSEUDO_PAR_JOUR]]
    : [[`echec:secours:inconnu:${ip}`, ECHECS_PAR_JOUR]];
  await compterEssais(env, limites);
  const phrase = normaliserPhrase(corps.phrase);
  // Les deux vérifications sont toujours faites (même durée, quel que soit le cas).
  const parPhrase = ligne && ligne.secours_hash && phrase ? await verifierMdp(phrase, ligne.secours_hash) : await verifierContreLeurre(phrase);
  const reinitActif = !!(ligne && ligne.reinit_hash && Date.parse(ligne.reinit_fin) > Date.now());
  const code = normaliserCode(corps.phrase); // le code temporaire de l'admin (8 caractères) se tape sans soin particulier
  const parCode = reinitActif && code ? await verifierMdp(code, ligne.reinit_hash) : await verifierContreLeurre(code);
  if (!parPhrase && !parCode) throw new ErreurHttp(401, 'Pseudo ou phrase de secours incorrect.');
  if (ligne.bloque) throw new ErreurHttp(403, 'Ce compte est bloqué. Contacte l’administrateur.');
  await env.DB.batch([
    env.DB.prepare('UPDATE joueurs SET mdp_hash = ?, reinit_hash = NULL, reinit_fin = NULL, vu = ? WHERE id = ?')
      .bind(await hacherMdp(nouveau), new Date().toISOString(), ligne.id),
    env.DB.prepare('DELETE FROM sessions WHERE joueur_id = ?').bind(ligne.id),
  ]);
  await effacerEchecs(env, limites.map((l) => l[0]));
  return json(sessionPublique(ligne, await creerSession(env, ligne.id)));
}

// --- Compte connecté ----------------------------------------------------------------------------------------

async function deconnecter(env, request) {
  const k = cleDeLaRequete(request);
  if (k) await env.DB.prepare('DELETE FROM sessions WHERE cle_hash = ? AND joueur_id = ?').bind(await sha256Hex(k.cle), k.id).run();
  return json({ ok: true });
}

async function joueurConnecte(env, request, options) {
  const joueur = await auth(request, env, options);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  return joueur;
}

// Le mot de passe actuel, vérifié avec une limite d'échecs par compte (une session volée ne sert pas à le deviner).
async function exigerMdpActuel(env, joueur, mdp) {
  const ligne = await env.DB.prepare('SELECT mdp_hash FROM joueurs WHERE id = ?').bind(joueur.id).first();
  const limites = [[`echec:mdp:${joueur.id}`, ECHECS_MDP_PAR_JOUR]];
  await compterEssais(env, limites);
  if (!(ligne && ligne.mdp_hash && (await verifierMdp(mdp, ligne.mdp_hash)))) throw new ErreurHttp(401, 'Mot de passe incorrect.');
  await effacerEchecs(env, limites[0][0]);
}

async function changerMdp(env, request, corps) {
  const joueur = await joueurConnecte(env, request);
  const nouveau = motDePasse(corps.nouveau, 'Nouveau mot de passe');
  const ligne = await env.DB.prepare('SELECT mdp_hash, google_sub FROM joueurs WHERE id = ?').bind(joueur.id).first();
  if (!ligne || !ligne.mdp_hash) {
    throw new ErreurHttp(400, ligne && ligne.google_sub ? 'Ce compte se connecte avec Google : il n’a pas de mot de passe.' : 'Crée d’abord ton compte.');
  }
  await exigerMdpActuel(env, joueur, corps.ancien);
  const k = cleDeLaRequete(request);
  await env.DB.batch([
    env.DB.prepare('UPDATE joueurs SET mdp_hash = ?, reinit_hash = NULL, reinit_fin = NULL WHERE id = ?').bind(await hacherMdp(nouveau), joueur.id),
    env.DB.prepare('DELETE FROM sessions WHERE joueur_id = ? AND cle_hash <> ?').bind(joueur.id, await sha256Hex(k.cle)),
  ]);
  return json({ ok: true });
}

async function supprimer(env, request, corps) {
  const joueur = await joueurConnecte(env, request, { avecBloques: true }); // un compte bloqué peut supprimer le sien
  const ligne = await env.DB.prepare('SELECT mdp_hash, google_sub FROM joueurs WHERE id = ?').bind(joueur.id).first();
  if (ligne && ligne.mdp_hash) await exigerMdpActuel(env, joueur, corps.mdp);
  else if (ligne && ligne.google_sub) {
    if ((await verifierGoogle(env, corps.jeton)) !== ligne.google_sub) throw new ErreurHttp(401, 'Connexion Google refusée.');
  } else if (corps.confirmer !== true) throw new ErreurHttp(400, 'Confirme la suppression (confirmer : true).');
  await supprimerJoueur(env, joueur.id);
  return json({ ok: true });
}

// --- Codes d'amis -------------------------------------------------------------------------------------------

async function utiliserCode(env, request, corps) {
  const joueur = await joueurConnecte(env, request);
  const code = normaliserCode(corps.code);
  const limites = [[`echec:code:${joueur.id}`, ECHECS_CODE_PAR_JOUR]];
  await compterEssais(env, limites);
  const ligne = code && code.length <= 40 ? await env.DB.prepare('SELECT code, bonus, jours FROM codes WHERE code = ? AND revoque = 0').bind(code).first() : null;
  const pasValable = () => new ErreurHttp(404, 'Ce code n’est pas valable.');
  if (!ligne) throw pasValable();
  const deja = await env.DB.prepare('SELECT 1 AS ok FROM codes_utilises WHERE code = ? AND joueur_id = ?').bind(ligne.code, joueur.id).first();
  if (deja) throw new ErreurHttp(409, 'Tu as déjà utilisé ce code.');
  // Un seul ordre : le plafond d'usages est vérifié au moment de l'écriture.
  const pris = await env.DB.prepare('UPDATE codes SET usages = usages + 1 WHERE code = ? AND revoque = 0 AND usages < usages_max').bind(ligne.code).run();
  if (!(pris.meta && pris.meta.changes === 1)) throw pasValable();
  const expire = new Date(Date.now() + ligne.jours * 86400000).toISOString();
  const ecrit = await env.DB.prepare('INSERT OR IGNORE INTO codes_utilises (code, joueur_id, expire) VALUES (?, ?, ?)').bind(ligne.code, joueur.id, expire).run();
  if (!(ecrit.meta && ecrit.meta.changes === 1)) {
    await env.DB.prepare('UPDATE codes SET usages = usages - 1 WHERE code = ?').bind(ligne.code).run();
    throw new ErreurHttp(409, 'Tu as déjà utilisé ce code.');
  }
  await effacerEchecs(env, limites[0][0]);
  return json({ ok: true, bonus: ligne.bonus, expire, total: await bonusActif(env, joueur.id) });
}

// --- Google -------------------------------------------------------------------------------------------------

// Vérifie le jeton auprès de Google (aud, iss, email_verified, exp) et renvoie l'identifiant stable (sub). Le jeton n'est jamais journalisé.
async function verifierGoogle(env, jeton) {
  const client = env.GOOGLE_CLIENT_ID;
  if (!client) throw new ErreurHttp(404, 'La connexion Google n’est pas disponible.');
  if (typeof jeton !== 'string' || jeton.length < 20 || jeton.length > 4096 || !/^[A-Za-z0-9._-]+$/.test(jeton)) {
    throw new ErreurHttp(401, 'Connexion Google refusée.');
  }
  const adresse = new URL('https://oauth2.googleapis.com/tokeninfo');
  adresse.searchParams.set('id_token', jeton);
  let reponse;
  try {
    reponse = await fetch(adresse, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new ErreurHttp(503, 'Google ne répond pas. Réessaie dans un instant.');
  }
  let p = null;
  if (reponse.ok) p = await reponse.json().catch(() => null);
  const emailVerifie = p && (p.email_verified === true || p.email_verified === 'true');
  const iss = p && ['accounts.google.com', 'https://accounts.google.com'].includes(p.iss);
  if (!p || p.aud !== client || !iss || !emailVerifie || !(Number(p.exp) > Date.now() / 1000) || typeof p.sub !== 'string' || !/^\d{5,40}$/.test(p.sub)) {
    throw new ErreurHttp(401, 'Connexion Google refusée.');
  }
  return p.sub;
}

async function google(env, request, corps) {
  const ip = await ipHachee(request);
  if (!(await quota(env, 'echec:google:' + ip, 40))) throw new ErreurHttp(429, 'Trop d’essais aujourd’hui. Réessaie demain.');
  const sub = await verifierGoogle(env, corps.jeton);
  const ligne = await env.DB.prepare('SELECT id, pseudo, prenom, nom, role, bloque FROM joueurs WHERE google_sub = ?').bind(sub).first();
  if (ligne) {
    if (ligne.bloque) throw new ErreurHttp(403, 'Ce compte est bloqué. Contacte l’administrateur.');
    return json(sessionPublique(ligne, await creerSession(env, ligne.id)));
  }
  if (corps.pseudo === undefined && corps.prenom === undefined && corps.nom === undefined) return json({ aCompleter: true });
  const { pseudo, cle } = pseudoCompte(corps.pseudo);
  const prenom = nomPropre(corps.prenom, 'Prénom');
  const nom = nomPropre(corps.nom, 'Nom');
  const { session } = await ouvrirCompte(env, request, { pseudo, cle, prenom, nom, googleSub: sub });
  return json(sessionPublique({ pseudo, prenom, nom, role: 'joueur' }, session));
}

// --- Routes -------------------------------------------------------------------------------------------------

export const onRequestGet = enveloppe(async ({ request, env }) => {
  if (new URL(request.url).searchParams.has('config')) return json({ google: env.GOOGLE_CLIENT_ID || null });
  await exigerBase(env);
  const joueur = await joueurConnecte(env, request);
  const ligne = await env.DB.prepare(
    'SELECT pseudo, prenom, nom, role, cree, mdp_hash IS NOT NULL AS a_mdp, google_sub IS NOT NULL AS a_google FROM joueurs WHERE id = ?',
  )
    .bind(joueur.id)
    .first();
  const { results } = await env.DB.prepare(
    `SELECT c.bonus, u.expire FROM codes_utilises u JOIN codes c ON c.code = u.code
     WHERE u.joueur_id = ? AND u.expire > ? AND c.revoque = 0 ORDER BY u.expire`,
  )
    .bind(joueur.id, new Date().toISOString())
    .all();
  const codes = (results || []).map((c) => ({ bonus: c.bonus, expire: c.expire }));
  return json({
    compte: joueur.compte,
    pseudo: ligne.pseudo,
    prenom: ligne.prenom || null,
    nom: ligne.nom || null,
    role: ligne.role || 'joueur',
    google: !!ligne.a_google,
    motDePasse: !!ligne.a_mdp,
    cree: ligne.cree || null,
    bonus: codes.reduce((s, c) => s + c.bonus, 0),
    codes,
  });
});

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const corps = await lireJSON(request, 4096);
  switch (corps.action) {
    case 'inscrire': return inscrire(env, request, corps);
    case 'connecter': return connecter(env, request, corps);
    case 'secours': return secours(env, request, corps);
    case 'deconnecter': return deconnecter(env, request);
    case 'mdp': return changerMdp(env, request, corps);
    case 'supprimer': return supprimer(env, request, corps);
    case 'code': return utiliserCode(env, request, corps);
    case 'google': return google(env, request, corps);
    default: throw new ErreurHttp(400, 'Action inconnue : inscrire, connecter, secours, deconnecter, mdp, supprimer, code ou google.');
  }
});
