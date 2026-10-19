// Génération de nuit (admin) : une file de tâches (table file_attente) que le cron de worker.js vide par petits morceaux.
//   - tâche « module » (numero = n° du module) : ouvrir le module (plan de ses leçons) puis mettre en file ses leçons ;
//   - tâche « lecon » (numero = n° global de la leçon) : écrire la leçon.
// Même code que la génération à la demande (lib/generation.js), mêmes tables (parcours, paliers). Clés du serveur seulement :
// jamais de clé personnelle. Aucun secret ici.
import { ErreurHttp, initBase, quota } from './api.js';
import { nomsEpuises, nomsIgnores, tousEpuises } from './fournisseurs.js';
import { ID_PARCOURS, decoderParcours, demarrerChrono, entreePalier, idPalier } from './paliers.js';
import { COLONNES, ecrireLecon, ouvrirEtapeSuivante } from './generation.js';

export const ESSAIS_MAX = 3; // essais par tâche, puis « echec »
export const PAR_PASSAGE = 2; // tâches prises à chaque passage du cron
export const REPRISE_MS = 6 * 60 * 1000; // une tâche « en_cours » plus vieille que cela est reprise
export const ETATS = ['attente', 'en_cours', 'fait', 'echec'];
const CLE_PAUSE = 'file:pause'; // table quotas : n = 1 quand la file est en pause
const CLE_JOUR = 'file:autorise-jour'; // table quotas : n = 1 quand l'admin autorise le travail en journée
export const PLAFOND_JOUR = 300; // tâches par jour au plus (nuit et journée ensemble)
export const NUIT_UTC = [0, 5]; // heures UTC (incluses) de la fenêtre de nuit : de 0 h à 5 h 59
const CLE_EPUISES = 'file:epuises'; // table quotas : n = instant (secondes), jour = noms séparés par des virgules

const maintenant = () => new Date().toISOString();

// --- Pause -------------------------------------------------------------------

export async function enPause(env) {
  const l = await env.DB.prepare('SELECT n FROM quotas WHERE cle = ?').bind(CLE_PAUSE).first();
  return !!l && l.n === 1;
}

export async function definirPause(env, pause) {
  await env.DB.prepare(
    `INSERT INTO quotas (cle, n, jour) VALUES (?, ?, '') ON CONFLICT(cle) DO UPDATE SET n = excluded.n`,
  )
    .bind(CLE_PAUSE, pause ? 1 : 0)
    .run();
}

// « Travailler aussi en journée » : sans lui, le cron (toutes les 5 minutes, toute la journée) ne travaille que la nuit.
export async function enJournee(env) {
  const l = await env.DB.prepare('SELECT n FROM quotas WHERE cle = ?').bind(CLE_JOUR).first();
  return !!l && l.n === 1;
}

export async function definirJournee(env, actif) {
  await env.DB.prepare(
    `INSERT INTO quotas (cle, n, jour) VALUES (?, ?, '') ON CONFLICT(cle) DO UPDATE SET n = excluded.n`,
  )
    .bind(CLE_JOUR, actif ? 1 : 0)
    .run();
}

export const estDeNuit = (date) => date.getUTCHours() >= NUIT_UTC[0] && date.getUTCHours() <= NUIT_UTC[1];

// --- État --------------------------------------------------------------------

// Fournisseurs épuisés ou ignorés : ceux que cet isolat connaît, plus ceux que le dernier passage du cron a notés (moins de 30 min).
async function epuisesConnus(env) {
  const noms = new Set([...nomsEpuises(), ...nomsIgnores().map((n) => n + ' (clé refusée)')]);
  const l = await env.DB.prepare('SELECT n, jour FROM quotas WHERE cle = ?').bind(CLE_EPUISES).first();
  if (l && l.jour && Date.now() / 1000 - l.n < 30 * 60) for (const n of l.jour.split(',')) noms.add(n);
  return [...noms];
}

// Compteurs par état, dernière erreur, fournisseurs épuisés. `parcours` : ajoute, pour cette formation, les leçons prêtes et le total connu.
export async function etatFile(env, parcours = null) {
  const { results } = await env.DB.prepare('SELECT etat, COUNT(*) AS n FROM file_attente GROUP BY etat').all();
  const taches = Object.fromEntries(ETATS.map((e) => [e, 0]));
  for (const r of results || []) if (r.etat in taches) taches[r.etat] = r.n;
  const derniere = await env.DB.prepare(
    `SELECT parcours, type, numero, erreur, maj FROM file_attente WHERE erreur IS NOT NULL AND erreur != '' ORDER BY maj DESC, id DESC LIMIT 1`,
  ).first();
  const sortie = { pause: await enPause(env), jour: await enJournee(env), taches, derniereErreur: derniere || null, epuises: await epuisesConnus(env) };
  if (parcours) {
    if (!ID_PARCOURS.test(parcours)) throw new ErreurHttp(404, 'Parcours introuvable.');
    const ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(parcours).first();
    if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
    const p = decoderParcours(ligne);
    const pretes = await env.DB.prepare('SELECT COUNT(*) AS n FROM paliers WHERE parcours = ?').bind(parcours).first();
    const enFile = await env.DB.prepare(`SELECT COUNT(*) AS n FROM file_attente WHERE parcours = ? AND etat IN ('attente', 'en_cours')`).bind(parcours).first();
    sortie.formation = {
      id: parcours,
      programme: !!p.programme,
      pretes: pretes.n,
      total: p.etapes.reduce((n, e) => n + e.paliers.length, 0),
      modules: p.modulesTotal,
      ouverts: p.etapes.length,
      enFile: enFile.n,
    };
  }
  return sortie;
}

// Export pour audit : titre, programme et toutes les leçons écrites (table paliers) avec leur vérification et les IA connues.
// `modele` : l'IA rédactrice si la leçon la mentionne, sinon null. Aucune clé ni secret : seulement le contenu stocké.
export async function exporterLecons(env, parcours) {
  if (!ID_PARCOURS.test(parcours || '')) throw new ErreurHttp(404, 'Parcours introuvable.');
  const ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(parcours).first();
  if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  const p = decoderParcours(ligne);
  const { results } = await env.DB.prepare('SELECT numero, contenu, cree FROM paliers WHERE parcours = ? ORDER BY numero').bind(parcours).all();
  const lecons = [];
  for (const r of results || []) {
    let c;
    try { c = JSON.parse(r.contenu); } catch { continue; }
    const v = c && c.verification ? c.verification : null;
    const ia = v && Array.isArray(v.ia) ? v.ia : null;
    lecons.push({
      numero: r.numero,
      titre: c.titre || null,
      cree: r.cree || null,
      verification: v ? { statut: v.statut, affirmations: v.affirmations, retirees: v.retirees, ia } : null,
      modele: ia && ia.length ? (Array.isArray(ia[0]) ? ia[0].join(' + ') : String(ia[0])) : null,
      contenu: c,
    });
  }
  return { id: parcours, titre: p.titre, programme: p.programme, lecons };
}

// --- File --------------------------------------------------------------------

// Met une tâche en file. Une tâche déjà en file ou faite n'est pas touchée ; une tâche en échec est remise en attente.
// Renvoie 1 si la file a changé, sinon 0.
async function ajouterTache(env, parcours, type, numero) {
  const r = await env.DB.prepare(
    `INSERT INTO file_attente (parcours, type, numero, etat, essais, erreur, maj) VALUES (?, ?, ?, 'attente', 0, NULL, ?)
     ON CONFLICT(parcours, type, numero) DO UPDATE SET etat = 'attente', essais = 0, erreur = NULL, maj = excluded.maj
     WHERE file_attente.etat = 'echec'`,
  )
    .bind(parcours, type, numero, maintenant())
    .run();
  return r.meta && r.meta.changes ? 1 : 0;
}

async function numerosEcrits(env, parcours) {
  const { results } = await env.DB.prepare('SELECT numero FROM paliers WHERE parcours = ?').bind(parcours).all();
  return new Set((results || []).map((r) => r.numero));
}

// Met en file les leçons pas encore écrites d'une étape (module), dans l'ordre.
async function mettreLeconsEnFile(env, parcours, etape) {
  const ecrits = await numerosEcrits(env, parcours);
  let n = 0;
  for (const p of etape.paliers) if (!ecrits.has(p.numero)) n += await ajouterTache(env, parcours, 'lecon', p.numero);
  return n;
}

// Débloque toute la formation : les leçons des modules déjà ouverts, puis l'ouverture de chaque module qui reste (Bases d'abord :
// l'ordre des numéros est l'ordre des niveaux). Les leçons d'un module sont mises en file quand il s'ouvre. Renvoie le nombre de tâches ajoutées.
export async function debloquer(env, parcoursId) {
  if (typeof parcoursId !== 'string' || !ID_PARCOURS.test(parcoursId)) throw new ErreurHttp(400, 'Indique la formation à débloquer.');
  const ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(parcoursId).first();
  if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  const p = decoderParcours(ligne);
  if (!p.programme) throw new ErreurHttp(400, 'Cette formation n’a pas de modules à débloquer : elle continue sans fin.');
  let ajoutees = 0;
  for (const etape of p.etapes) ajoutees += await mettreLeconsEnFile(env, parcoursId, etape);
  for (let n = p.etapes.length + 1; n <= p.modulesTotal; n++) ajoutees += await ajouterTache(env, parcoursId, 'module', n);
  return ajoutees;
}

// Vide la file : les tâches en attente ou en échec disparaissent (celles en cours et les faites restent).
export async function viderFile(env) {
  const r = await env.DB.prepare(`DELETE FROM file_attente WHERE etat IN ('attente', 'echec')`).run();
  return r.meta ? r.meta.changes : 0;
}

// --- Passage du cron ---------------------------------------------------------

async function noterEpuises(env) {
  const noms = [...nomsEpuises(), ...nomsIgnores()];
  await env.DB.prepare(
    `INSERT INTO quotas (cle, n, jour) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET n = excluded.n, jour = excluded.jour`,
  )
    .bind(CLE_EPUISES, Math.floor(Date.now() / 1000), noms.join(','))
    .run();
}

async function marquer(env, id, etat, { essais, erreur = null } = {}) {
  await env.DB.prepare('UPDATE file_attente SET etat = ?, essais = COALESCE(?, essais), erreur = ?, maj = ? WHERE id = ?')
    .bind(etat, essais === undefined ? null : essais, erreur, maintenant(), id)
    .run();
}

// Exécute une tâche avec le code de la génération à la demande. Lève une erreur en cas d'échec ; renvoie quand la tâche est faite.
async function executer(env, tache) {
  const ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(tache.parcours).first();
  if (!ligne) return; // formation disparue : rien à faire
  let parcours = decoderParcours(ligne);
  if (tache.type === 'module') {
    if (!parcours.programme || tache.numero > parcours.modulesTotal) throw new ErreurHttp(404, 'Ce module n’existe pas dans le programme.');
    let courante = ligne;
    for (let tours = 0; parcours.etapes.length < tache.numero && tours < tache.numero; tours++) {
      courante = await ouvrirEtapeSuivante(env, courante, parcours, demarrerChrono());
      parcours = decoderParcours(courante);
    }
    const etape = parcours.etapes.find((e) => e.numero === tache.numero);
    if (!etape) throw new ErreurHttp(502, 'Le module n’a pas pu être ouvert.');
    await mettreLeconsEnFile(env, tache.parcours, etape);
    return;
  }
  const existe = await env.DB.prepare('SELECT id FROM paliers WHERE id = ?').bind(idPalier(tache.parcours, tache.numero)).first();
  if (existe) return; // déjà écrite (à la demande, ou par un autre passage)
  if (!entreePalier(parcours.etapes, tache.numero)) throw new ErreurHttp(404, 'Cette leçon n’est pas dans le plan de la formation.');
  await ecrireLecon(env, { parcours, numero: tache.numero, horloge: demarrerChrono() });
}

// Un passage hors de la fenêtre de nuit (0 h à 5 h UTC) ne fait rien, sauf si l'admin a autorisé la journée. `options.maintenant` : horloge (tests).
// Un passage : reprend les tâches « en_cours » trop vieilles, prend au plus PAR_PASSAGE tâches en attente et les exécute une à une.
// Échec : un essai de plus, 3 au plus, puis « echec ». Tous les fournisseurs du serveur épuisés : rien n'est consommé, la tâche reste en attente.
export async function traiterFile(env, { maintenant: instant = new Date(Date.now()) } = {}) {
  const bilan = {
    pause: false, horsFenetre: false, reprises: 0, prises: 0, faites: 0, echecs: 0, reportees: 0, epuises: false,
  };
  if (!env || !env.DB) return bilan;
  await initBase(env);
  if (await enPause(env)) { bilan.pause = true; return bilan; }
  if (!estDeNuit(instant) && !(await enJournee(env))) { bilan.horsFenetre = true; return bilan; }

  // Tâches interrompues (le Worker s'est arrêté en route) : reprises, en comptant l'essai.
  const limite = new Date(Date.now() - REPRISE_MS).toISOString();
  const vieilles = await env.DB.prepare(`SELECT id, essais FROM file_attente WHERE etat = 'en_cours' AND maj < ?`).bind(limite).all();
  for (const t of vieilles.results || []) {
    const essais = t.essais + 1;
    await marquer(env, t.id, essais >= ESSAIS_MAX ? 'echec' : 'attente', { essais, erreur: 'Interrompue avant la fin, reprise.' });
    bilan.reprises += 1;
  }

  if (tousEpuises(env)) { bilan.epuises = true; await noterEpuises(env); return bilan; }

  const { results } = await env.DB.prepare(
    `SELECT id, parcours, type, numero, essais FROM file_attente WHERE etat = 'attente'
      ORDER BY CASE type WHEN 'lecon' THEN 0 ELSE 1 END, id LIMIT ?`,
  )
    .bind(PAR_PASSAGE)
    .all();
  for (const t of results || []) {
    // Plafond de la journée : au-delà, on s'arrête (les tâches restantes attendent demain).
    if (!(await quota(env, 'file:jour', PLAFOND_JOUR))) { bilan.plafond = true; break; }
    // Verrou : seul le passage qui change l'état de la tâche l'exécute.
    const pris = await env.DB.prepare(`UPDATE file_attente SET etat = 'en_cours', maj = ? WHERE id = ? AND etat = 'attente'`).bind(maintenant(), t.id).run();
    if (!pris.meta || pris.meta.changes !== 1) continue;
    bilan.prises += 1;
    try {
      await executer(env, t);
      await marquer(env, t.id, 'fait');
      bilan.faites += 1;
    } catch (e) {
      const message = String((e && e.message) || e).slice(0, 300);
      if (tousEpuises(env)) {
        // Plus aucun fournisseur gratuit : l'essai ne compte pas, la tâche attend le prochain passage.
        await marquer(env, t.id, 'attente', { essais: t.essais, erreur: message });
        bilan.epuises = true;
        bilan.reportees += 1;
        await noterEpuises(env);
        break;
      }
      const essais = t.essais + 1;
      await marquer(env, t.id, essais >= ESSAIS_MAX ? 'echec' : 'attente', { essais, erreur: message });
      if (essais >= ESSAIS_MAX) bilan.echecs += 1; else bilan.reportees += 1;
    }
  }
  return bilan;
}
