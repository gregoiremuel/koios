// Espace admin : génération de nuit, comptes et codes d'amis. Deux accès : la session d'un compte dont le rôle est « admin », ou le secret
// ADMIN_KEY, envoyé dans l'en-tête x-admin-cle (comparaison à temps constant). Sans accès valide : 403, jamais d'indice sur la clé (ni
// longueur, ni présence du secret). Aucun hash ni secret ne sort d'ici.
//   GET  /api/admin[?parcours=<id>]  : état de la file (tâches par état, pause, dernière erreur, fournisseurs épuisés) et, avec
//                                       `parcours`, les leçons prêtes et le total connu de cette formation.
//   GET  /api/admin?export=<id>      : titre, programme et leçons écrites du parcours (verification, modele), pour audit.
//   POST /api/admin {action: 'promouvoir'} : exige la session d'un compte ET x-admin-cle (une seule fois) ; ce compte devient admin.
//   GET  /api/admin?comptes=1[&q=][&page=] : comptes (pseudo, prénom, nom, créé, vu, leçons faites, XP, bloqué, rôle), 50 par page.
//   POST /api/admin {action: 'bloquer' | 'debloquer' | 'reinitialiser', pseudo} : bloque (sessions effacées) ou débloque un compte ;
//                                       « reinitialiser » donne un code temporaire de 8 caractères, valable 24 h, à utiliser comme « phrase » dans compte/secours.
//   GET  /api/admin?codes=1 ; POST {action: 'creer_code', bonus, jours, usages} ; POST {action: 'revoquer_code', code} : codes d'amis (bonus
//                                       de créations IA par jour pendant `jours` jours, `usages` personnes au plus).
//   POST /api/admin {action: 'debloquer', parcours} : met en file toute la formation (leçons des modules ouverts, ouverture des
//                                       modules restants), dans l'ordre, niveau Bases d'abord.
//   POST /api/admin {action: 'reecrire', parcours} : met en file la réécriture des leçons faibles (statut « partiel » avec plus de 20 % de
//                                       retraits, ou marquées « à revoir »). La nouvelle version remplace l'ancienne : seul cas où l'on écrase.
//   POST /api/admin {action: 'credit', montant} : crédit Claude chargé (dollars), dépense cumulée remise à zéro. GET (état de la file)
//                                       renvoie `credit` : {charge, depense, restant, seuil, alerte, epuise}.
//   GET  /api/admin?signalements=1 : leçons signalées par des lecteurs (parcours, numéro, titres, nombre de joueurs, motifs, messages, `enFile` si
//                                       une réécriture est en file), les plus signalées d'abord. POST {action: 'ignorer_signalements', parcours, numero} :
//                                       efface les signalements de cette leçon (pas de réécriture).
//   POST /api/admin {action: 'pause' | 'reprendre' | 'vider'} : suspend, relance ou vide la file.
//   POST /api/admin {action: 'jour', valeur: true | false} : autorise (ou non) le travail en journée ; sans lui, seule la nuit (0 h à 5 h 59 UTC).
//                                       L'état est renvoyé par GET et POST dans `jour`.
import {
  ErreurHttp, aleatoire, auth, enveloppe, exigerBase, hacherMdp, ipHachee, json, lireJSON, quota, secretsEgaux,
} from '../../lib/api.js';
import { cleDePseudo, normaliserCode } from '../../lib/comptes.js';
import { chargerCredit, etatCredit } from '../../lib/fournisseurs.js';
import { ID_PARCOURS, PALIER_MAX } from '../../lib/paliers.js';
import {
  debloquer, definirJournee, definirPause, etatFile, exporterLecons, reecrire, viderFile,
} from '../../lib/nuit.js';

// La clé x-admin-cle : chaque essai est compté AVANT la comparaison (atomique) ; 20 essais ratés par jour et par adresse (hachée), 100 en tout
// par jour, au-delà même la bonne clé est refusée. Un accès réussi rend son essai : il ne compte pas.
const ESSAIS_CLE_IP = 20;
const ESSAIS_CLE_TOTAL = 100;
async function exigerCle(request, env) {
  const cles = env.DB ? [['admin:ip:' + (await ipHachee(request)), ESSAIS_CLE_IP], ['admin:total', ESSAIS_CLE_TOTAL]] : [];
  for (const [cle, plafond] of cles) {
    if (!(await quota(env, cle, plafond))) throw new ErreurHttp(403, 'Accès refusé.');
  }
  const fournie = request.headers.get('x-admin-cle') || '';
  if (!(await secretsEgaux(fournie, env.ADMIN_KEY))) throw new ErreurHttp(403, 'Accès refusé.');
  const jour = new Date().toISOString().slice(0, 10);
  for (const [cle] of cles) await env.DB.prepare('UPDATE quotas SET n = MAX(n - 1, 0) WHERE cle = ? AND jour = ?').bind(cle, jour).run();
}

// Session d'un compte admin (sans clé), sinon la clé. Un compte bloqué n'ouvre rien par sa session, mais la clé reste valable.
async function exigerAdmin(request, env) {
  let joueur = null;
  try {
    joueur = await auth(request, env);
  } catch (e) {
    if (!(e instanceof ErreurHttp)) throw e;
  }
  if (joueur && joueur.role === 'admin') return joueur;
  await exigerCle(request, env);
  return joueur;
}

const PAR_PAGE = 50;
const echapperLike = (t) => t.replace(/[\\%_]/g, (c) => '\\' + c);

async function listerComptes(env, params) {
  const q = cleDePseudo(params.get('q') || '');
  const page = Math.max(0, Math.min(100000, Number.parseInt(params.get('page') || '0', 10) || 0));
  const motif = '%' + echapperLike(q) + '%';
  const filtre = q
    ? "WHERE pseudo_cle IS NOT NULL AND (pseudo_cle LIKE ? ESCAPE '\\' OR LOWER(COALESCE(prenom, '')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(nom, '')) LIKE ? ESCAPE '\\')"
    : 'WHERE pseudo_cle IS NOT NULL';
  const liens = q ? [motif, motif, motif] : [];
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM joueurs ${filtre}`).bind(...liens).first();
  const { results } = await env.DB.prepare(
    `SELECT pseudo, prenom, nom, cree, vu, valides, points, bloque, role FROM joueurs ${filtre}
     ORDER BY cree DESC, pseudo_cle LIMIT ? OFFSET ?`,
  )
    .bind(...liens, PAR_PAGE, page * PAR_PAGE)
    .all();
  return {
    page,
    parPage: PAR_PAGE,
    total: total ? total.n : 0,
    comptes: (results || []).map((c) => ({
      pseudo: c.pseudo, prenom: c.prenom, nom: c.nom, cree: c.cree, vu: c.vu, lecons: c.valides || 0, xp: c.points || 0, bloque: !!c.bloque, role: c.role || 'joueur',
    })),
  };
}

// Signalements de leçons non traités, regroupés par leçon (au plus 20 leçons). Le message est « <motif>|<texte> ».
// Cinq requêtes D1 au plus, quel que soit le nombre de leçons (les détails se lisent par paquets avec IN).
async function listerSignalements(env) {
  const { results } = await env.DB.prepare(
    `SELECT chapitre, exercice, COUNT(DISTINCT joueur) AS joueurs, MAX(cree) AS dernier FROM signalements
     WHERE chapitre LIKE 'lecon:%' AND traite = 0 GROUP BY chapitre, exercice ORDER BY joueurs DESC, dernier DESC LIMIT 20`,
  ).all();
  const groupes = results || [];
  if (!groupes.length) return { lecons: [] };
  const paires = groupes.map(() => '(?, ?)').join(', ');
  const parPaire = groupes.flatMap((r) => [r.chapitre, r.exercice]);
  const parParcours = groupes.flatMap((r) => [r.chapitre.slice('lecon:'.length), r.exercice]);
  const ids = [...new Set(groupes.map((r) => r.chapitre.slice('lecon:'.length)))];
  const { results: lignes } = await env.DB.prepare(
    `SELECT chapitre, exercice, message FROM signalements WHERE traite = 0 AND (chapitre, exercice) IN (VALUES ${paires}) ORDER BY id`,
  ).bind(...parPaire).all();
  const { results: paliers } = await env.DB.prepare(
    `SELECT parcours, numero, contenu FROM paliers WHERE (parcours, numero) IN (VALUES ${paires})`,
  ).bind(...parParcours).all();
  const { results: formations } = await env.DB.prepare(
    `SELECT id, titre FROM parcours WHERE id IN (${ids.map(() => '?').join(', ')})`,
  ).bind(...ids).all();
  const { results: taches } = await env.DB.prepare(
    `SELECT parcours, numero, etat FROM file_attente WHERE type = 'reecriture' AND (parcours, numero) IN (VALUES ${paires})`,
  ).bind(...parParcours).all();
  const cle = (a, b) => a + '\u0000' + b;
  const messagesDe = new Map();
  for (const l of lignes || []) {
    const k = cle(l.chapitre, l.exercice);
    if (!messagesDe.has(k)) messagesDe.set(k, []);
    if (messagesDe.get(k).length < 20) messagesDe.get(k).push(l.message);
  }
  const palierDe = new Map((paliers || []).map((p) => [cle(p.parcours, p.numero), p.contenu]));
  const formationDe = new Map((formations || []).map((f) => [f.id, f.titre]));
  const tacheDe = new Map((taches || []).map((t) => [cle(t.parcours, t.numero), t.etat]));
  const lecons = groupes.map((r) => {
    const parcours = r.chapitre.slice('lecon:'.length);
    const motifs = { fait: 0, pas_clair: 0, autre: 0 };
    const messages = [];
    for (const m of messagesDe.get(cle(r.chapitre, r.exercice)) || []) {
      const [motif, ...reste] = String(m).split('|');
      if (Object.hasOwn(motifs, motif)) motifs[motif] += 1;
      const texte = reste.join('|').trim();
      if (texte) messages.push(texte.slice(0, 300));
    }
    let titre = null;
    const contenu = palierDe.get(cle(parcours, r.exercice));
    try {
      titre = contenu ? JSON.parse(contenu).titre || null : null;
    } catch {
      titre = null;
    }
    const etat = tacheDe.get(cle(parcours, r.exercice));
    return {
      parcours, numero: r.exercice, titre, formation: formationDe.get(parcours) || null, joueurs: r.joueurs, motifs, messages: messages.slice(0, 5),
      dernier: r.dernier, enFile: etat === 'attente' || etat === 'en_cours',
    };
  });
  return { lecons };
}

async function listerCodes(env) {
  const { results } = await env.DB.prepare('SELECT code, bonus, jours, usages_max, usages, cree, revoque FROM codes ORDER BY cree DESC, code LIMIT 200').all();
  return {
    codes: (results || []).map((c) => ({
      code: c.code, bonus: c.bonus, jours: c.jours, usagesMax: c.usages_max, usages: c.usages, cree: c.cree, revoque: !!c.revoque,
    })),
  };
}

const entier = (v, min, max, nom) => {
  if (!Number.isInteger(v) || v < min || v > max) throw new ErreurHttp(400, `${nom} : un entier de ${min} à ${max} attendu.`);
  return v;
};

async function compteCible(env, corps) {
  const cle = cleDePseudo(corps.pseudo);
  const ligne = cle ? await env.DB.prepare('SELECT id, pseudo FROM joueurs WHERE pseudo_cle = ?').bind(cle).first() : null;
  if (!ligne) throw new ErreurHttp(404, 'Aucun compte avec ce pseudo.');
  return ligne;
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  await exigerAdmin(request, env);
  const params = new URL(request.url).searchParams;
  if (params.has('comptes')) return json(await listerComptes(env, params));
  if (params.has('codes')) return json(await listerCodes(env));
  if (params.has('signalements')) return json(await listerSignalements(env));
  if (params.has('export')) return json(await exporterLecons(env, params.get('export')));
  const parcours = params.get('parcours');
  return json({ ...(await etatFile(env, parcours || null)), credit: await etatCredit(env) });
});

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const corps = await lireJSON(request, 2048);
  if (corps.action === 'promouvoir') {
    const joueur = await auth(request, env);
    if (!joueur || !joueur.compte) throw new ErreurHttp(401, 'Connecte-toi à ton compte d’abord.');
    await exigerCle(request, env);
    await env.DB.prepare("UPDATE joueurs SET role = 'admin' WHERE id = ?").bind(joueur.id).run();
    return json({ ok: true, role: 'admin' });
  }
  const admin = await exigerAdmin(request, env);
  if (corps.action === 'bloquer' || (corps.action === 'debloquer' && corps.pseudo !== undefined)) {
    const cible = await compteCible(env, corps);
    if (admin && cible.id === admin.id) throw new ErreurHttp(400, 'Tu ne peux pas bloquer ton propre compte.');
    const bloquer = corps.action === 'bloquer'; // « debloquer » avec un pseudo débloque un compte ; avec une formation, il met la formation en file
    await env.DB.batch([
      env.DB.prepare('UPDATE joueurs SET bloque = ? WHERE id = ?').bind(bloquer ? 1 : 0, cible.id),
      ...(bloquer ? [env.DB.prepare('DELETE FROM sessions WHERE joueur_id = ?').bind(cible.id)] : []),
    ]);
    return json({ ok: true, pseudo: cible.pseudo, bloque: bloquer });
  }
  if (corps.action === 'reinitialiser') {
    const cible = await compteCible(env, corps);
    const code = aleatoire(8);
    const expire = new Date(Date.now() + 86400000).toISOString();
    await env.DB.prepare('UPDATE joueurs SET reinit_hash = ?, reinit_fin = ? WHERE id = ?').bind(await hacherMdp(normaliserCode(code)), expire, cible.id).run();
    return json({ ok: true, pseudo: cible.pseudo, code, expire });
  }
  if (corps.action === 'creer_code') {
    const bonus = entier(corps.bonus, 1, 500, 'bonus');
    const jours = entier(corps.jours, 1, 365, 'jours');
    const usages = entier(corps.usages, 1, 1000, 'usages');
    const code = aleatoire(8);
    await env.DB.prepare('INSERT INTO codes (code, bonus, jours, usages_max, usages, cree, revoque) VALUES (?, ?, ?, ?, 0, ?, 0)')
      .bind(code, bonus, jours, usages, new Date().toISOString())
      .run();
    return json({ ok: true, code, bonus, jours, usages });
  }
  if (corps.action === 'revoquer_code') {
    const code = normaliserCode(corps.code);
    const ecrit = code ? await env.DB.prepare('UPDATE codes SET revoque = 1 WHERE code = ?').bind(code).run() : null;
    if (!(ecrit && ecrit.meta && ecrit.meta.changes === 1)) throw new ErreurHttp(404, 'Ce code n’existe pas.');
    return json({ ok: true, ...(await listerCodes(env)) });
  }
  if (corps.action === 'debloquer') {
    const ajoutees = await debloquer(env, corps.parcours);
    return json({ ok: true, ajoutees, ...(await etatFile(env, corps.parcours)) });
  }
  if (corps.action === 'reecrire') {
    const { ajoutees, faibles } = await reecrire(env, corps.parcours);
    return json({ ok: true, ajoutees, faibles, ...(await etatFile(env, corps.parcours)) });
  }
  if (corps.action === 'ignorer_signalements') {
    if (typeof corps.parcours !== 'string' || !ID_PARCOURS.test(corps.parcours)) throw new ErreurHttp(400, 'Indique la formation.');
    entier(corps.numero, 1, PALIER_MAX, 'numero');
    const r = await env.DB.prepare('DELETE FROM signalements WHERE chapitre = ? AND exercice = ?').bind('lecon:' + corps.parcours, corps.numero).run();
    return json({ ok: true, retires: r.meta ? r.meta.changes : 0, ...(await listerSignalements(env)) });
  }
  if (corps.action === 'pause' || corps.action === 'reprendre') {
    await definirPause(env, corps.action === 'pause');
    return json({ ok: true, ...(await etatFile(env)) });
  }
  if (corps.action === 'jour') {
    if (typeof corps.valeur !== 'boolean') throw new ErreurHttp(400, 'Indique valeur : true ou false.');
    await definirJournee(env, corps.valeur);
    return json({ ok: true, ...(await etatFile(env)) });
  }
  if (corps.action === 'credit') {
    const montant = corps.montant;
    if (typeof montant !== 'number' || !Number.isFinite(montant) || montant <= 0 || montant > 100000) throw new ErreurHttp(400, 'montant : un nombre de dollars entre 0 et 100 000 attendu.');
    return json({ ok: true, credit: await chargerCredit(env, montant) });
  }
  if (corps.action === 'vider') {
    const retirees = await viderFile(env);
    return json({ ok: true, retirees, ...(await etatFile(env)) });
  }
  throw new ErreurHttp(400, 'Action inconnue : promouvoir, bloquer, reinitialiser, creer_code, revoquer_code, debloquer, reecrire, ignorer_signalements, pause, reprendre, jour, credit ou vider.');
});
