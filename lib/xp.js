// Anti-triche XP : le serveur ne croit pas le nombre d'XP envoyé par le téléphone. Il le ramène à ce que l'état prouve
// (leçons faites qui existent vraiment, questions réussies, jeux, révisions) et à un plafond de gain par jour et par compte.
// Importé par functions/api/progression.js. Aucun secret, aucun appel IA.
import { compterFaits } from './groupes.js';

// Barème du client (app/app.js, XP) : leçon 10 + question de compréhension 5 ; question de quiz 5, de grand quiz 10 ; jeu 2 par réponse.
export const XP_LECON = 15;
export const XP_QUESTION = 10; // au plus, par question réussie une première fois
export const XP_JEU = 40; // au plus, par mini-jeu terminé (une fois)
export const QUESTIONS_MAX = 3000; // le client garde 3 000 questions réussies au plus
export const REVISIONS_MAX = 5000;
export const XP_JOUR_MAX = 1500; // gain maximal par jour (UTC) et par compte
export const FAITS_COURS_VERIFIE = 100; // un cours vérifié (v-xx) vit hors base : plafond fixe de leçons faites
const PARCOURS_MAX = 200;
const PAQUET = 50;

const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

// Nombre de leçons écrites en base pour chacun des parcours de l'état : { id: n }.
export async function plafondsPaliers(env, ids) {
  const sortie = {};
  const propres = [...new Set(ids)].filter((id) => /^[a-z0-9-]{1,40}$/.test(id)).slice(0, PARCOURS_MAX);
  for (let i = 0; i < propres.length; i += PAQUET) {
    const lot = propres.slice(i, i + PAQUET);
    const { results } = await env.DB.prepare(
      `SELECT parcours, COUNT(*) AS n FROM paliers WHERE parcours IN (${lot.map(() => '?').join(', ')}) GROUP BY parcours`,
    ).bind(...lot).all();
    for (const r of results || []) sortie[r.parcours] = r.n;
  }
  return sortie;
}

// Leçons faites que l'on accepte pour un parcours : jamais plus que de leçons écrites.
export function faitsAcceptes(id, parcours, plafonds) {
  const p = objet(parcours);
  if (!p) return 0;
  const plafond = Object.hasOwn(plafonds, id) ? plafonds[id] : (/^v-[a-z]{2}$/.test(id) ? FAITS_COURS_VERIFIE : 0);
  return Math.min(compterFaits(p.fait), plafond);
}

// XP que l'état peut avoir rapporté, au plus. Large exprès (barème maximal partout) : il coupe la triche, pas le jeu honnête.
export function xpPlausible(etat, plafonds = {}) {
  const e = objet(etat) || {};
  const parcours = objet(e.parcours) || {};
  let lecons = 0;
  let jeux = 0;
  for (const id of Object.keys(parcours).slice(0, PARCOURS_MAX)) {
    lecons += faitsAcceptes(id, parcours[id], plafonds);
    const j = objet(parcours[id]) && objet(parcours[id].jeux);
    if (j) jeux += Object.keys(j).length;
  }
  const questions = Math.min(QUESTIONS_MAX, Object.keys(objet(e.reussies) || {}).length);
  const jours = Math.max(1, Object.keys(objet(e.jours) || {}).length);
  const revisions = Math.min(REVISIONS_MAX, Object.keys(objet(e.revisions) || {}).length * jours);
  return lecons * XP_LECON + questions * XP_QUESTION + jeux * XP_JEU + revisions;
}

// Plafond du jour : on garde l'XP du compte à sa première écriture du jour (table quotas, clé « xpdebut:<id> ») ; on ne monte pas
// de plus de XP_JOUR_MAX au-dessus. `precedent` : l'XP déjà acceptée avant cette écriture. Renvoie l'XP acceptée.
export async function plafonnerParJour(env, joueurId, precedent, demande, maintenant = new Date()) {
  const jour = maintenant.toISOString().slice(0, 10);
  const cle = 'xpdebut:' + joueurId;
  const ligne = await env.DB.prepare('SELECT n, jour FROM quotas WHERE cle = ?').bind(cle).first();
  let debut = ligne && ligne.jour === jour ? ligne.n : null;
  if (debut === null) {
    debut = precedent;
    await env.DB.prepare(
      `INSERT INTO quotas (cle, n, jour) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET n = excluded.n, jour = excluded.jour`,
    ).bind(cle, debut, jour).run();
  }
  return Math.min(demande, debut + XP_JOUR_MAX);
}
