// Amis (lot 6C). Un joueur ne voit que lui et ses amis. On ne devient ami que de deux façons : un lien d'invitation (jeton aléatoire, à
// usage limité, 7 jours) ou la recherche du pseudo EXACT, qui envoie une demande que l'autre accepte ou refuse. Rien d'autre ne révèle un pseudo.
//   GET  /api/amis (compte) -> {amis: [{pseudo, points, valides}], recues: [{pseudo}], envoyees: [{pseudo}]}
//   POST /api/amis {action: 'demander', pseudo} -> {ok, etat: 'demande' | 'ami', pseudo} : 404 si aucun compte n'a ce pseudo ; 30 recherches par jour.
//   POST /api/amis {action: 'accepter' | 'refuser' | 'retirer', pseudo} : réponse à une demande reçue ; retirer = supprimer un ami ou annuler sa demande.
//   POST /api/amis {action: 'inviter'} -> {jeton, expire, usagesMax} : le lien est <adresse>#/invitation/<jeton>. 10 liens par jour.
//   POST /api/amis {action: 'rejoindre', jeton} -> {ok, pseudo} : devient ami de celui qui a créé le lien. 20 liens refusés par jour au plus.
import {
  ErreurHttp, aleatoire, auth, enveloppe, exigerBase, json, lireJSON, quota, sha256Hex,
} from '../../lib/api.js';
import {
  effacerEchecs, exigerPasBloque, joueurParPseudo, noterEchec,
} from '../../lib/comptes.js';

const RECHERCHES_PAR_JOUR = 30;
const INVITATIONS_PAR_JOUR = 10;
const ECHECS_INVITATION_PAR_JOUR = 20;
const DEMANDES_EN_ATTENTE_MAX = 50;
const INVITATION_JOURS = 7;
const INVITATION_USAGES = 5;

async function joueurCompte(request, env) {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  if (!joueur.compte) throw new ErreurHttp(403, 'Crée ton compte pour ajouter des amis.');
  return joueur;
}

function relation(env, moi, autre) {
  return env.DB.prepare('SELECT a, b, etat FROM amities WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(moi, autre, autre, moi).first();
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  const moi = await joueurCompte(request, env);
  const amis = await env.DB.prepare(
    `SELECT j.pseudo, j.points, j.valides FROM amities m JOIN joueurs j ON j.id = CASE WHEN m.a = ? THEN m.b ELSE m.a END
     WHERE m.etat = 'ami' AND (m.a = ? OR m.b = ?) AND COALESCE(j.bloque, 0) = 0 ORDER BY j.pseudo_cle LIMIT 200`,
  )
    .bind(moi.id, moi.id, moi.id)
    .all();
  const recues = await env.DB.prepare(
    `SELECT j.pseudo FROM amities m JOIN joueurs j ON j.id = m.a WHERE m.b = ? AND m.etat = 'demande' AND COALESCE(j.bloque, 0) = 0 ORDER BY m.cree DESC LIMIT 50`,
  )
    .bind(moi.id)
    .all();
  const envoyees = await env.DB.prepare(
    `SELECT j.pseudo FROM amities m JOIN joueurs j ON j.id = m.b WHERE m.a = ? AND m.etat = 'demande' AND COALESCE(j.bloque, 0) = 0 ORDER BY m.cree DESC LIMIT 50`,
  )
    .bind(moi.id)
    .all();
  return json({
    amis: (amis.results || []).map((j) => ({ pseudo: j.pseudo, points: j.points || 0, valides: j.valides || 0 })),
    recues: (recues.results || []).map((j) => ({ pseudo: j.pseudo })),
    envoyees: (envoyees.results || []).map((j) => ({ pseudo: j.pseudo })),
  });
});

async function demander(env, moi, corps) {
  if (!(await quota(env, 'amis:recherche:' + moi.id, RECHERCHES_PAR_JOUR))) {
    throw new ErreurHttp(429, 'Trop de recherches aujourd’hui. Reviens demain.');
  }
  const cible = await joueurParPseudo(env, corps.pseudo);
  if (!cible) throw new ErreurHttp(404, 'Aucun joueur avec ce pseudo.');
  if (cible.id === moi.id) throw new ErreurHttp(400, 'C’est ton propre pseudo.');
  const rel = await relation(env, moi.id, cible.id);
  if (rel && rel.etat === 'ami') throw new ErreurHttp(409, 'Vous êtes déjà amis.');
  if (rel && rel.a === moi.id) return json({ ok: true, etat: 'demande', pseudo: cible.pseudo }); // déjà envoyée
  if (rel) { // il m'avait déjà écrit : les deux demandes se rejoignent
    await env.DB.prepare("UPDATE amities SET etat = 'ami' WHERE a = ? AND b = ?").bind(cible.id, moi.id).run();
    return json({ ok: true, etat: 'ami', pseudo: cible.pseudo });
  }
  const attente = await env.DB.prepare("SELECT COUNT(*) AS n FROM amities WHERE a = ? AND etat = 'demande'").bind(moi.id).first();
  if (attente && attente.n >= DEMANDES_EN_ATTENTE_MAX) throw new ErreurHttp(409, 'Tu as déjà beaucoup de demandes en attente. Attends des réponses.');
  await env.DB.prepare("INSERT OR IGNORE INTO amities (a, b, etat, cree) VALUES (?, ?, 'demande', ?)").bind(moi.id, cible.id, new Date().toISOString()).run();
  return json({ ok: true, etat: 'demande', pseudo: cible.pseudo });
}

async function repondre(env, moi, corps, action) {
  const cible = await joueurParPseudo(env, corps.pseudo, { avecBloques: true });
  const introuvable = new ErreurHttp(404, action === 'retirer' ? 'Cet ami n’existe pas.' : 'Cette demande n’existe pas.');
  if (!cible) throw introuvable;
  let ecrit;
  if (action === 'accepter') {
    ecrit = await env.DB.prepare("UPDATE amities SET etat = 'ami' WHERE a = ? AND b = ? AND etat = 'demande'").bind(cible.id, moi.id).run();
  } else if (action === 'refuser') {
    ecrit = await env.DB.prepare("DELETE FROM amities WHERE a = ? AND b = ? AND etat = 'demande'").bind(cible.id, moi.id).run();
  } else {
    ecrit = await env.DB.prepare('DELETE FROM amities WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(moi.id, cible.id, cible.id, moi.id).run();
  }
  if (!(ecrit.meta && ecrit.meta.changes >= 1)) throw introuvable;
  return json({ ok: true });
}

async function inviter(env, moi) {
  if (!(await quota(env, 'amis:invitation:' + moi.id, INVITATIONS_PAR_JOUR))) {
    throw new ErreurHttp(429, 'Tu as déjà créé 10 liens aujourd’hui. Reviens demain.');
  }
  const jeton = aleatoire(24);
  const expire = new Date(Date.now() + INVITATION_JOURS * 86400000).toISOString();
  await env.DB.prepare('INSERT INTO invitations (jeton_hash, joueur_id, cree, expire, usages_max, usages) VALUES (?, ?, ?, ?, ?, 0)')
    .bind(await sha256Hex(jeton), moi.id, new Date().toISOString(), expire, INVITATION_USAGES)
    .run();
  return json({ jeton, expire, usagesMax: INVITATION_USAGES });
}

async function rejoindre(env, moi, corps) {
  const limites = [[`echec:invitation:${moi.id}`, ECHECS_INVITATION_PAR_JOUR]];
  await exigerPasBloque(env, limites);
  const refus = async () => {
    await noterEchec(env, limites);
    return new ErreurHttp(404, 'Ce lien n’est plus valable.');
  };
  if (typeof corps.jeton !== 'string' || !/^[a-z0-9]{24}$/.test(corps.jeton)) throw await refus();
  const empreinte = await sha256Hex(corps.jeton);
  const ligne = await env.DB.prepare(
    `SELECT i.joueur_id, i.expire, i.usages, i.usages_max, j.pseudo, j.bloque FROM invitations i JOIN joueurs j ON j.id = i.joueur_id WHERE i.jeton_hash = ?`,
  )
    .bind(empreinte)
    .first();
  if (!ligne || ligne.bloque || !(Date.parse(ligne.expire) > Date.now()) || ligne.usages >= ligne.usages_max) throw await refus();
  if (ligne.joueur_id === moi.id) throw new ErreurHttp(400, 'C’est ton propre lien.');
  const rel = await relation(env, moi.id, ligne.joueur_id);
  if (rel && rel.etat === 'ami') return json({ ok: true, dejaAmis: true, pseudo: ligne.pseudo });
  // Un seul ordre : le plafond d'usages et la date sont vérifiés au moment de l'écriture.
  const pris = await env.DB.prepare('UPDATE invitations SET usages = usages + 1 WHERE jeton_hash = ? AND usages < usages_max AND expire > ?')
    .bind(empreinte, new Date().toISOString())
    .run();
  if (!(pris.meta && pris.meta.changes === 1)) throw await refus();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM amities WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(moi.id, ligne.joueur_id, ligne.joueur_id, moi.id),
    env.DB.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', ?)").bind(ligne.joueur_id, moi.id, new Date().toISOString()),
  ]);
  await effacerEchecs(env, limites[0][0]);
  return json({ ok: true, pseudo: ligne.pseudo });
}

export const onRequestPost = enveloppe(async ({ request, env }) => {
  const moi = await joueurCompte(request, env);
  const corps = await lireJSON(request, 1024);
  switch (corps.action) {
    case 'demander': return demander(env, moi, corps);
    case 'accepter': case 'refuser': case 'retirer': return repondre(env, moi, corps, corps.action);
    case 'inviter': return inviter(env, moi);
    case 'rejoindre': return rejoindre(env, moi, corps);
    default: throw new ErreurHttp(400, 'Action inconnue : demander, accepter, refuser, retirer, inviter ou rejoindre.');
  }
});
