// Génération partagée entre la demande d'un lecteur (functions/api/palier.js) et la génération de nuit (lib/nuit.js) :
// ouvrir le module suivant d'un parcours, écrire une leçon. Un seul code pour les deux, les mêmes tables (parcours, paliers).
// Deux générations simultanées ne s'écrasent pas : le module garde la première étape écrite pour un numéro (mise à jour
// conditionnelle), la leçon le premier INSERT OR IGNORE. Aucun secret.
import { typographier } from './typo.js';
import { ErreurHttp } from './api.js';
import {
  SEUIL_LECON, TERMES_MAX, decoderParcours, genererEtapeSuivante, genererModuleSuivant, genererPalier, idPalier,
} from './paliers.js';

const COLONNES = 'id, titre, contenu';

// Noms des termes déjà définis dans les leçons précédentes du parcours (les plus récentes d'abord, 200 au plus).
export async function termesDefinis(env, parcours, k) {
  const { results } = await env.DB.prepare(
    'SELECT contenu FROM paliers WHERE parcours = ? AND numero < ? ORDER BY numero DESC LIMIT 80',
  )
    .bind(parcours, k)
    .all();
  const termes = [];
  const vus = new Set();
  for (const r of results || []) {
    let definitions = [];
    try {
      definitions = JSON.parse(r.contenu).definitions;
    } catch {
      // palier illisible : ignoré
    }
    for (const d of Array.isArray(definitions) ? definitions : []) {
      const terme = d && typeof d.terme === 'string' ? d.terme.trim() : '';
      if (terme && !vus.has(terme.toLowerCase())) {
        vus.add(terme.toLowerCase());
        termes.push(terme);
      }
    }
  }
  return termes.slice(0, TERMES_MAX);
}

// Ajoute l'étape au parcours. Si un autre lecteur a écrit entre-temps, on relit : son étape (même numéro) vaut la nôtre.
export async function enregistrerEtape(env, ligne, etape) {
  for (let essai = 0; essai < 3; essai++) {
    const contenu = JSON.parse(ligne.contenu);
    if (contenu.etapes.some((e) => e.numero === etape.numero)) return ligne;
    contenu.etapes.push(etape);
    const neuf = JSON.stringify(contenu);
    const ecrit = await env.DB.prepare('UPDATE parcours SET contenu = ? WHERE id = ? AND contenu = ?')
      .bind(neuf, ligne.id, ligne.contenu)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) return { ...ligne, contenu: neuf };
    ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(ligne.id).first();
    if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  }
  throw new ErreurHttp(503, 'Le parcours est très demandé. Réessaie dans un instant.');
}

// Écrit (plan de l'étape suivante) puis enregistre l'étape ou le module suivant du parcours. Renvoie la ligne à jour.
// `ligne` : ligne de la table parcours ; `parcours` : decoderParcours(ligne).
export async function ouvrirEtapeSuivante(env, ligne, parcours, horloge) {
  const etape = parcours.programme
    ? typographier(await genererModuleSuivant(env, parcours, horloge))
    : await genererEtapeSuivante(env, parcours, horloge);
  const neuve = await enregistrerEtape(env, ligne, etape);
  await noterModule(env, parcours.id, etape);
  return neuve;
}

// Module ouvert à la demande : sa tâche de nuit passe à « fait », mais ses leçons sont mises en file si elles n'y sont pas déjà
// (sinon la tâche « module » faite ferait oublier les leçons : personne ne les mettrait plus en file).
export async function noterModule(env, parcours, etape) {
  try {
    const tache = await env.DB.prepare(`SELECT id FROM file_attente WHERE parcours = ? AND type = 'module' AND numero = ?`)
      .bind(parcours, etape.numero).first();
    if (tache) {
      const maj = new Date().toISOString();
      for (const p of etape.paliers || []) {
        const ecrit = await env.DB.prepare('SELECT id FROM paliers WHERE id = ?').bind(idPalier(parcours, p.numero)).first();
        if (ecrit) continue;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO file_attente (parcours, type, numero, etat, essais, maj) VALUES (?, 'lecon', ?, 'attente', 0, ?)`,
        ).bind(parcours, p.numero, maj).run();
      }
    }
  } catch (e) {
    console.warn('file de nuit : leçons du module non mises en file', e && e.message);
  }
  await noterFait(env, parcours, 'module', etape.numero);
}

// Marque « fait » la tâche de nuit d'une leçon ou d'un module (si elle existe) : la génération à la demande et celle de nuit
// ne refont jamais le même travail. Un échec de cette écriture ne doit jamais faire échouer la génération.
export async function noterFait(env, parcours, type, numero) {
  try {
    await env.DB.prepare(
      `UPDATE file_attente SET etat = 'fait', erreur = NULL, maj = ? WHERE parcours = ? AND type = ? AND numero = ? AND etat != 'fait'`,
    )
      .bind(new Date().toISOString(), parcours, type, numero)
      .run();
  } catch (e) {
    console.warn('file de nuit : tâche non marquée', e && e.message);
  }
}

// Part d'affirmations retirées d'une leçon écrite (0 si elle n'a pas de vérification chiffrée).
export function ratioRetraits(contenu) {
  const v = contenu && contenu.verification;
  return v && v.affirmations > 0 ? (v.retirees || 0) / v.affirmations : 0;
}

// Leçons à réécrire : statut « partiel » dont plus de 20 % des affirmations ont été retirées, ou marquées « à revoir ».
export const estFaible = (contenu) => {
  const v = contenu && contenu.verification;
  return !!v && (v.aRevoir === true || (v.statut === 'partiel' && ratioRetraits(contenu) > SEUIL_LECON));
};

// Met en file la réécriture d'une leçon publiée « à revoir » (une seule fois : la file de nuit la reprendra plus tard).
async function planifierReecriture(env, parcours, numero) {
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO file_attente (parcours, type, numero, etat, essais, maj) VALUES (?, 'reecriture', ?, 'attente', 0, ?)`,
    ).bind(parcours, numero, new Date().toISOString()).run();
  } catch (e) {
    console.warn('file de nuit : réécriture non mise en file', e && e.message);
  }
}

// Écrit la leçon n° `numero` d'un parcours déjà décodé et l'enregistre (le premier enregistré gagne). Renvoie la leçon enregistrée.
// `remplacer` (réécriture demandée par l'admin) : la nouvelle version écrase l'ancienne, seul cas où l'on écrase ; sauf si elle est
// « à revoir » et plus abîmée que l'ancienne (on garde alors l'ancienne). Les vues sont conservées.
export async function ecrireLecon(env, { parcours, numero, horloge, remplacer = false }) {
  const termes = parcours.programme ? await termesDefinis(env, parcours.id, numero) : [];
  const palier = typographier(await genererPalier(env, { parcours, numero, horloge, termes }));
  // Sans second contrôle (clé personnelle, aucune autre famille disponible) : jamais dans la bibliothèque partagée.
  // La leçon n'est renvoyée qu'à celui qui l'a demandée ; la tâche de nuit, elle, reste à faire.
  if (palier.verification && palier.verification.statut === 'seule') {
    return { ...palier, nonEnregistree: true };
  }
  const id = idPalier(parcours.id, numero);
  if (remplacer) {
    const ancien = await env.DB.prepare('SELECT contenu FROM paliers WHERE id = ?').bind(id).first();
    let ancienne = null;
    try { ancienne = ancien ? JSON.parse(ancien.contenu) : null; } catch { ancienne = null; }
    if (ancienne && palier.verification.aRevoir && ratioRetraits(palier) > ratioRetraits(ancienne)) return ancienne;
    if (ancienne) {
      await env.DB.prepare('UPDATE paliers SET contenu = ?, cree = ? WHERE id = ?').bind(JSON.stringify(palier), new Date().toISOString(), id).run();
      return palier;
    }
  }
  const ecrit = await env.DB.prepare(
    `INSERT OR IGNORE INTO paliers (id, parcours, numero, contenu, vues, cree)
     VALUES (?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, parcours.id, numero, JSON.stringify(palier), new Date().toISOString())
    .run();
  await noterFait(env, parcours.id, 'lecon', numero);
  if (ecrit.meta && ecrit.meta.changes === 0) {
    const gagnant = await env.DB.prepare('SELECT contenu FROM paliers WHERE id = ?').bind(id).first();
    if (gagnant) return JSON.parse(gagnant.contenu);
  } else if (palier.verification && palier.verification.aRevoir) {
    await planifierReecriture(env, parcours.id, numero);
  }
  return palier;
}

export { COLONNES, decoderParcours };
