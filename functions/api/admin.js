// Espace admin : la génération de nuit. Protégé par le secret ADMIN_KEY, envoyé dans l'en-tête x-admin-cle (comparaison à temps
// constant). Sans clé valide : 403, jamais d'indice sur la clé (ni longueur, ni présence du secret).
//   GET  /api/admin[?parcours=<id>]  : état de la file (tâches par état, pause, dernière erreur, fournisseurs épuisés) et, avec
//                                       `parcours`, les leçons prêtes et le total connu de cette formation.
//   POST /api/admin {action: 'debloquer', parcours} : met en file toute la formation (leçons des modules ouverts, ouverture des
//                                       modules restants), dans l'ordre, niveau Bases d'abord.
//   POST /api/admin {action: 'pause' | 'reprendre' | 'vider'} : suspend, relance ou vide la file.
import {
  ErreurHttp, enveloppe, exigerBase, json, lireJSON, quota, secretsEgaux,
} from '../../lib/api.js';
import {
  debloquer, definirPause, etatFile, viderFile,
} from '../../lib/nuit.js';

// 20 essais par jour et par adresse, comptés avant la comparaison : une clé ne se devine pas à coups d'essais.
async function exigerAdmin(request, env) {
  if (env.DB) {
    const ip = request.headers.get('cf-connecting-ip') || 'inconnue';
    if (!(await quota(env, 'admin:ip:' + ip, 20))) throw new ErreurHttp(403, 'Accès refusé.');
  }
  const fournie = request.headers.get('x-admin-cle') || '';
  if (!(await secretsEgaux(fournie, env.ADMIN_KEY))) throw new ErreurHttp(403, 'Accès refusé.');
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  await exigerAdmin(request, env);
  const parcours = new URL(request.url).searchParams.get('parcours');
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
  if (corps.action === 'vider') {
    const retirees = await viderFile(env);
    return json({ ok: true, retirees, ...(await etatFile(env)) });
  }
  throw new ErreurHttp(400, 'Action inconnue : debloquer, pause, reprendre ou vider.');
});
