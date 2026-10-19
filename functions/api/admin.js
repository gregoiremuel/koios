// Espace admin : la génération de nuit. Protégé par le secret ADMIN_KEY, envoyé dans l'en-tête x-admin-cle (comparaison à temps
// constant). Sans clé valide : 403, jamais d'indice sur la clé (ni longueur, ni présence du secret).
//   GET  /api/admin[?parcours=<id>]  : état de la file (tâches par état, pause, dernière erreur, fournisseurs épuisés) et, avec
//                                       `parcours`, les leçons prêtes et le total connu de cette formation.
//   GET  /api/admin?export=<id>      : titre, programme et leçons écrites du parcours (verification, modele), pour audit.
//   POST /api/admin {action: 'debloquer', parcours} : met en file toute la formation (leçons des modules ouverts, ouverture des
//                                       modules restants), dans l'ordre, niveau Bases d'abord.
//   POST /api/admin {action: 'pause' | 'reprendre' | 'vider'} : suspend, relance ou vide la file.
//   POST /api/admin {action: 'jour', valeur: true | false} : autorise (ou non) le travail en journée ; sans lui, seule la nuit (0 h à 5 h UTC).
//                                       L'état est renvoyé par GET et POST dans `jour`.
import {
  ErreurHttp, enveloppe, exigerBase, json, lireJSON, quota, secretsEgaux,
} from '../../lib/api.js';
import {
  debloquer, definirJournee, definirPause, etatFile, exporterLecons, viderFile,
} from '../../lib/nuit.js';

// 20 mauvais essais par jour et par adresse : au-delà, même la bonne clé est refusée. Les accès réussis ne comptent pas.
async function exigerAdmin(request, env) {
  const cle = env.DB ? 'admin:ip:' + (request.headers.get('cf-connecting-ip') || 'inconnue') : null;
  if (cle) {
    const jour = new Date().toISOString().slice(0, 10);
    const ligne = await env.DB.prepare('SELECT n FROM quotas WHERE cle = ? AND jour = ?').bind(cle, jour).first();
    if (ligne && ligne.n >= 20) throw new ErreurHttp(403, 'Accès refusé.');
  }
  const fournie = request.headers.get('x-admin-cle') || '';
  if (!(await secretsEgaux(fournie, env.ADMIN_KEY))) {
    if (cle) await quota(env, cle, 20);
    throw new ErreurHttp(403, 'Accès refusé.');
  }
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  await exigerAdmin(request, env);
  const params = new URL(request.url).searchParams;
  if (params.has('export')) return json(await exporterLecons(env, params.get('export')));
  const parcours = params.get('parcours');
  return json(await etatFile(env, parcours || null));
});

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  await exigerAdmin(request, env);
  const corps = await lireJSON(request, 2048);
  if (corps.action === 'debloquer') {
    const ajoutees = await debloquer(env, corps.parcours);
    return json({ ok: true, ajoutees, ...(await etatFile(env, corps.parcours)) });
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
  if (corps.action === 'vider') {
    const retirees = await viderFile(env);
    return json({ ok: true, retirees, ...(await etatFile(env)) });
  }
  throw new ErreurHttp(400, 'Action inconnue : debloquer, pause, reprendre, jour ou vider.');
});
