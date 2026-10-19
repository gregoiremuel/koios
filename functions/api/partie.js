// Jeu en direct : plusieurs joueurs répondent aux mêmes questions en même temps (12 au plus). Pas de WebSocket : l'app
// interroge GET toutes les 2 s. L'état est calculé à la lecture avec l'horloge du serveur (voir lib/parties.js).
// POST /api/partie {action: "creer", questions: [{chapitre, index}], titre?} (connexion) -> {id, code}
//   5 à 20 références comme POST /api/duel, mais seulement des paliers de formation, des quiz directs et des blocs de quiz
//   général ou de tournoi (questions à choix ou vrai ou faux). id = code = 6 caractères majuscules ou chiffres, sans O, 0, I, 1.
// POST /api/partie {action: "rejoindre", id} (connexion) : avant le début seulement, 12 joueurs au plus.
// POST /api/partie {action: "demarrer", id} (connexion) : le créateur seulement ; la question 1 démarre tout de suite.
// POST /api/partie {action: "repondre", id, indice, choix} (connexion) : une réponse par question, refusée hors délai (409).
//   choix : numéro de la réponse (QCM) ou 0 = Vrai, 1 = Faux.
// GET  /api/partie?id= -> {partie}
//   partie = {id, code, titre, createur, etat ("attente" | "question" | "resultat" | "fini"), indice, total, restant (ms),
//   duree (ms de la question), joueurs, moi, question?}. Avant le résultat, `question` ne contient ni la bonne réponse ni l'explication.
//   Les joueurs sont des pseudos : jamais d'identifiant. Les points apparaissent au résultat et à la fin.
import {
  ErreurHttp, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';
import {
  DUREE_QUESTION, DUREE_VIE_MS, JOUEURS_MAX, PARTIES_PAR_JOUR, SQL_POINTS, avancer, chargerQuestion, classerJoueurs, codePartie,
  lireCode, maintenant, pointsReponse, restant, typeDeReference, vueQuestion,
} from '../../lib/parties.js';
import { validerQuestions, verifierReferences } from './duel.js';

const MAX_OCTETS = 4096;
const TITRE_MAX = 60;

async function joueurConnecte(request, env) {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  return joueur;
}

function codeValide(texte) {
  const code = lireCode(texte);
  if (!code) throw new ErreurHttp(400, 'Code de partie attendu : 6 caractères.');
  return code;
}

const lireRefs = (texte) => {
  try {
    const v = JSON.parse(texte);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

async function lirePartie(env, id) {
  const partie = await env.DB.prepare(
    `SELECT p.id, p.createur, p.titre, p.questions, p.etat, p.indice, p.debut_question, j.pseudo AS pseudo_createur
     FROM parties p LEFT JOIN joueurs j ON j.id = p.createur WHERE p.id = ?`,
  ).bind(id).first();
  if (!partie) throw new ErreurHttp(404, 'Cette partie n’existe pas (ou plus).');
  return partie;
}

// Lit la partie et la fait avancer à l'heure `t` : l'écriture est conditionnelle à l'ancien état, donc un seul des lecteurs
// simultanés l'applique ; les autres relisent. Renvoie { partie (ligne à jour), vue ({etat, indice, debut, ecoule}), refs }.
async function etatCourant(env, id, t) {
  for (let essai = 0; essai < 4; essai++) {
    const partie = await lirePartie(env, id);
    const refs = lireRefs(partie.questions);
    const vue = avancer(partie, refs.length, t);
    if (vue.etat === partie.etat && vue.indice === partie.indice && vue.debut === partie.debut_question) return { partie, vue, refs };
    const ecrit = await env.DB.prepare(
      'UPDATE parties SET etat = ?, indice = ?, debut_question = ? WHERE id = ? AND etat = ? AND indice = ? AND debut_question = ?',
    )
      .bind(vue.etat, vue.indice, vue.debut, id, partie.etat, partie.indice, partie.debut_question)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) {
      return { partie: { ...partie, etat: vue.etat, indice: vue.indice, debut_question: vue.debut }, vue, refs };
    }
  }
  throw new ErreurHttp(503, 'La partie est très demandée. Réessaie dans un instant.');
}

async function creer(env, joueur, corps) {
  const titre = corps.titre === undefined || corps.titre === null ? 'Partie en direct' : nettoyer(corps.titre);
  if (titre === null || longueur(titre) < 1 || longueur(titre) > TITRE_MAX) {
    throw new ErreurHttp(400, `Titre de 1 à ${TITRE_MAX} caractères attendu.`);
  }
  const questions = validerQuestions(corps.questions, 'duel'); // 5 à 20
  if (questions.some((q) => typeDeReference(q.chapitre) === null)) {
    throw new ErreurHttp(400, 'Une partie en direct joue des questions de formation, de quiz ou de tournoi.');
  }
  await verifierReferences(env, questions);
  for (const ref of questions) {
    if (!(await chargerQuestion(env, ref))) {
      throw new ErreurHttp(400, 'Une partie en direct joue des questions à choix ou des vrai ou faux : une de ces questions est d’un autre type.');
    }
  }
  if (!(await quota(env, 'partie:joueur:' + joueur.id, PARTIES_PAR_JOUR))) {
    throw new ErreurHttp(429, `Tu as déjà créé ${PARTIES_PAR_JOUR} parties aujourd’hui. Reviens demain.`);
  }
  // Ménage : une partie de plus de 24 h n'a plus d'intérêt.
  const limite = new Date(Date.now() - DUREE_VIE_MS).toISOString();
  await env.DB.prepare('DELETE FROM parties WHERE cree < ?').bind(limite).run();
  await env.DB.prepare('DELETE FROM parties_joueurs WHERE partie NOT IN (SELECT id FROM parties)').run();
  await env.DB.prepare('DELETE FROM parties_reponses WHERE partie NOT IN (SELECT id FROM parties)').run();

  const cree = new Date().toISOString();
  for (let essai = 0; essai < 5; essai++) {
    const id = codePartie();
    const ecrit = await env.DB.prepare(
      `INSERT OR IGNORE INTO parties (id, createur, titre, questions, etat, indice, debut_question, cree)
       VALUES (?, ?, ?, ?, 'attente', 0, 0, ?)`,
    )
      .bind(id, joueur.id, titre, JSON.stringify(questions), cree)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) {
      await env.DB.prepare('INSERT OR IGNORE INTO parties_joueurs (partie, joueur, points) VALUES (?, ?, 0)').bind(id, joueur.id).run();
      return json({ id, code: id });
    }
  }
  throw new Error('code de partie déjà pris');
}

async function rejoindre(env, joueur, id) {
  const partie = await lirePartie(env, id);
  const deja = await env.DB.prepare('SELECT 1 AS ok FROM parties_joueurs WHERE partie = ? AND joueur = ?').bind(id, joueur.id).first();
  if (deja) return json({ ok: true, id, dejaJoueur: true });
  if (partie.etat !== 'attente') throw new ErreurHttp(409, 'Cette partie a déjà commencé.');
  // Un seul ordre SQL : l'état et le plafond sont vérifiés au moment de l'écriture.
  const ecrit = await env.DB.prepare(
    `INSERT OR IGNORE INTO parties_joueurs (partie, joueur, points)
     SELECT ?, ?, 0 WHERE EXISTS (SELECT 1 FROM parties WHERE id = ? AND etat = 'attente')
       AND (SELECT COUNT(*) FROM parties_joueurs WHERE partie = ?) < ?`,
  )
    .bind(id, joueur.id, id, id, JOUEURS_MAX)
    .run();
  if (!(ecrit.meta && ecrit.meta.changes === 1)) {
    const encore = await lirePartie(env, id);
    throw new ErreurHttp(409, encore.etat !== 'attente' ? 'Cette partie a déjà commencé.' : `Cette partie est complète : ${JOUEURS_MAX} joueurs au plus.`);
  }
  return json({ ok: true, id });
}

async function demarrer(env, joueur, id, t) {
  const partie = await lirePartie(env, id);
  if (partie.createur !== joueur.id) throw new ErreurHttp(403, 'Seul le créateur peut démarrer la partie.');
  if (partie.etat !== 'attente') throw new ErreurHttp(409, 'Cette partie a déjà commencé.');
  const ecrit = await env.DB.prepare("UPDATE parties SET etat = 'question', indice = 0, debut_question = ? WHERE id = ? AND etat = 'attente'")
    .bind(t, id)
    .run();
  if (!(ecrit.meta && ecrit.meta.changes === 1)) throw new ErreurHttp(409, 'Cette partie a déjà commencé.');
  return json({ ok: true });
}

async function repondre(env, joueur, id, corps, t) {
  if (!Number.isInteger(corps.indice) || corps.indice < 0 || !Number.isInteger(corps.choix) || corps.choix < 0) {
    throw new ErreurHttp(400, 'indice et choix attendus : des entiers.');
  }
  const membre = await env.DB.prepare('SELECT 1 AS ok FROM parties_joueurs WHERE partie = ? AND joueur = ?').bind(id, joueur.id).first();
  if (!membre) throw new ErreurHttp(403, 'Tu ne joues pas dans cette partie.');
  const { partie, vue, refs } = await etatCourant(env, id, t);
  if (vue.etat === 'attente') throw new ErreurHttp(409, 'La partie n’a pas encore commencé.');
  if (vue.etat !== 'question' || vue.indice !== corps.indice) throw new ErreurHttp(409, 'Trop tard : cette question est terminée.');
  const question = await chargerQuestion(env, refs[vue.indice]);
  if (!question) throw new ErreurHttp(503, 'Question indisponible. Réessaie dans un instant.');
  const max = question.type === 'qcm' ? question.reponses.length : 2;
  if (corps.choix >= max) throw new ErreurHttp(400, 'Ce choix n’existe pas.');
  const deja = await env.DB.prepare('SELECT 1 AS ok FROM parties_reponses WHERE partie = ? AND joueur = ? AND indice = ?').bind(id, joueur.id, vue.indice).first();
  if (deja) throw new ErreurHttp(409, 'Tu as déjà répondu à cette question.');
  const ms = Math.min(DUREE_QUESTION, Math.max(0, t - partie.debut_question));
  const juste = corps.choix === question.bonne ? 1 : 0;
  // Un seul lot : la réponse et le total recalculé (même si deux envois se croisent, la réponse ne compte qu'une fois).
  const [ecrit] = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO parties_reponses (partie, joueur, indice, choix, ms, juste) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, joueur.id, vue.indice, corps.choix, ms, juste),
    env.DB.prepare(
      `UPDATE parties_joueurs SET points = (SELECT COALESCE(SUM(${SQL_POINTS}), 0) FROM parties_reponses r
         WHERE r.partie = parties_joueurs.partie AND r.joueur = parties_joueurs.joueur)
       WHERE partie = ? AND joueur = ?`,
    ).bind(id, joueur.id),
  ]);
  if (!(ecrit.meta && ecrit.meta.changes === 1)) throw new ErreurHttp(409, 'Tu as déjà répondu à cette question.');
  return json({ ok: true });
}

export const onRequestPost = enveloppe(async ({ request, env }) => {
  const joueur = await joueurConnecte(request, env);
  const corps = await lireJSON(request, MAX_OCTETS);
  const t = maintenant(env);
  switch (corps.action) {
    case 'creer': return creer(env, joueur, corps);
    case 'rejoindre': return rejoindre(env, joueur, codeValide(corps.id));
    case 'demarrer': return demarrer(env, joueur, codeValide(corps.id), t);
    case 'repondre': return repondre(env, joueur, codeValide(corps.id), corps, t);
    default: throw new ErreurHttp(400, 'Action inconnue : creer, rejoindre, demarrer ou repondre.');
  }
});

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const id = codeValide(new URL(request.url).searchParams.get('id'));
  const t = maintenant(env);
  const lecteur = await auth(request, env).catch(() => null);
  const { partie, vue, refs } = await etatCourant(env, id, t);

  const { results } = await env.DB.prepare(
    `SELECT j.id AS jid, j.pseudo, pj.points,
       (SELECT COUNT(*) FROM parties_reponses r WHERE r.partie = pj.partie AND r.joueur = pj.joueur AND r.juste = 1) AS justes,
       (SELECT COUNT(*) FROM parties_reponses r WHERE r.partie = pj.partie AND r.joueur = pj.joueur AND r.indice = ?) AS repondu
     FROM parties_joueurs pj JOIN joueurs j ON j.id = pj.joueur WHERE pj.partie = ? ORDER BY pj.rowid LIMIT ?`,
  )
    .bind(vue.indice, id, JOUEURS_MAX + 1)
    .all();
  const lignes = (results || []).map((l) => ({
    pseudo: l.pseudo || 'Un joueur', points: l.points || 0, justes: l.justes || 0, repondu: l.repondu > 0,
    createur: l.jid === partie.createur, moi: !!(lecteur && l.jid === lecteur.id),
  }));
  const jeu = vue.etat !== 'attente';
  const avecPoints = vue.etat === 'resultat' || vue.etat === 'fini';
  const publics = lignes.map(({ pseudo, points, justes, repondu, createur, moi }) => ({
    pseudo,
    ...(avecPoints ? { points, justes } : {}),
    ...(vue.etat === 'question' ? { repondu } : {}),
    ...(createur ? { createur: true } : {}),
    ...(moi ? { moi: true } : {}),
  }));
  const joueurs = avecPoints ? classerJoueurs(publics) : publics;
  const moiLigne = lignes.find((l) => l.moi) || null;

  const sortie = {
    id,
    code: id,
    titre: partie.titre,
    createur: partie.pseudo_createur || 'Un joueur',
    etat: vue.etat,
    indice: jeu ? vue.indice : 0,
    total: refs.length,
    restant: restant(vue.etat, vue.ecoule),
    duree: DUREE_QUESTION,
    max: JOUEURS_MAX,
    joueurs,
    moi: { joueur: !!moiLigne, createur: !!(lecteur && lecteur.id === partie.createur) },
  };

  // La question n'est montrée qu'aux joueurs de la partie, et sans réponse avant le résultat.
  if (moiLigne && (vue.etat === 'question' || vue.etat === 'resultat')) {
    const question = await chargerQuestion(env, refs[vue.indice]);
    if (question) sortie.question = vueQuestion(question, vue.etat === 'resultat');
    const reponse = await env.DB.prepare('SELECT choix, ms, juste FROM parties_reponses WHERE partie = ? AND joueur = ? AND indice = ?')
      .bind(id, lecteur.id, vue.indice)
      .first();
    sortie.moi.repondu = !!reponse;
    if (reponse) {
      sortie.moi.choix = reponse.choix;
      if (vue.etat === 'resultat') {
        sortie.moi.juste = reponse.juste === 1;
        sortie.moi.gain = pointsReponse(reponse.juste === 1, reponse.ms);
      }
    } else if (vue.etat === 'resultat') {
      sortie.moi.juste = false;
      sortie.moi.gain = 0;
    }
  }
  return json({ partie: sortie });
});
