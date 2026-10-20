// Tests de l'API Koîos : appelle les handlers avec un faux env.
// Base simulée : SQLite en mémoire (node:sqlite, intégré à Node 22) derrière l'interface D1
// (prepare / bind / first / all / run / batch), donc le SQL des routes est vraiment exécuté (scripts/faux_d1.mjs).
// IA simulée : renvoie ce qu'on lui prépare. Wikipédia simulé : `fetch` global remplacé.
// Lancer : node scripts/test_api.mjs

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  COLONNES_COMPTE, ErreurHttp, TABLES, bonusActif, egalConstant, enveloppe, hacherMdp, initBase, migrerBase, quota, quotaJoueur, sha256Hex,
  verifierContreLeurre, verifierMdp,
} from '../lib/api.js';
import { MOTS_SECOURS, normaliserPhrase, phraseDeSecours, pseudoCompte } from '../lib/comptes.js';
import { EXEMPLE, MODELES, PROMPT_SYSTEME, extraireObjet, validerChapitre } from '../lib/libre.js';
import {
  EXEMPLE_CHAPITRE, EXEMPLE_PLAN, PROMPT_CHAPITRE, PROMPT_PLAN, assemblerChapitre, slug, validerChapitreIA,
  validerChiffres, validerNotions, validerPlan, validerSaviezVous,
} from '../lib/sujets.js';
import {
  CREDIT_IMAGE, MAX_TEXTE, MAX_TEXTE_V2, OPTIONS_EN, OPTIONS_FR, USER_AGENT, USER_AGENT_V2, ancrer, chercher,
  choisirTitre, lirePage, nettoyerRequete, sourceDe, titreEnDe, tronquer,
} from '../lib/wiki.js';
import { generateur, tirer, tirerParmi } from '../lib/questions.js';
import {
  GLM_URL, LLAMA, MISTRAL, REGLAGES, cleGLM, nomCourt, oublierEpuisements, redacteurs, verificateurs,
  GEMINI_BASE, XAI_URL, GROQ_URL, tousLesFournisseurs, estEpuise, corpsGemini, etatModelesGemini, marquerModeleGemini, nomsEpuises,
  CLAUDE_MODELE, CLAUDE_URL, GEMINI_MODELES, corpsClaude, estIgnore, fournisseurPerso, marquerEpuise, tousEpuises,
  CEREBRAS_MODELES, CEREBRAS_URL, GROQ_MODELES, MISTRAL_MODELES, MISTRAL_URL, etatModelesCompat, nomsIgnores,
  EPUISEMENT_MISTRAL_MS, cleClaude,
} from '../lib/fournisseurs.js';
import { DUREE_CACHE_MS, pageDeReference, pagesAncrees } from '../lib/sources.js';
import { lireClePerso, masquer, secretsEgaux } from '../lib/api.js';
import {
  PLAFOND_JOUR, debloquer, definirJournee, definirPause, enJournee, etatFile, traiterFile as traiterFileReel,
} from '../lib/nuit.js';
// Les passages de test se font « à 2 h UTC » (dans la fenêtre de nuit), sauf si le test fixe son heure.
const traiterFile = (e, o = {}) => traiterFileReel(e, { maintenant: new Date(Date.UTC(2026, 9, 20, 2, 0, 0)), ...o });
import { onRequestGet as adminGet, onRequestPost as adminPost } from '../functions/api/admin.js';
import { onRequestPost as cleIaPost } from '../functions/api/cle-ia.js';
import {
  CREDIT_WIKIMEDIA, USER_AGENT_COMMONS, chercherCommons, chercherImage, motsSignificatifs, pertinence, imageDeTete, imageDesPages, imageUnsplash, imageWikipedia,
  licenceLibre, requeteImage, texteDeHtml,
} from '../lib/images.js';
import {
  EXEMPLE_ETAPE, EXEMPLE_LECON, EXEMPLE_MODULE, EXEMPLE_PALIER, EXEMPLE_PROGRAMME, EXEMPLE_PROLONGEMENT, MESSAGE_FIN, MOTS_INTERDITS,
  PALIER_MAX, PROMPT_ETAPE, PROMPT_LECON, PROMPT_LECON_A, PROMPT_LECON_A_COURT, PROMPT_LECON_B, PROMPT_LECON_B_COURT, PROMPT_PROGRAMME_COURT, PROMPT_MODULE, PROMPT_PALIER, PROMPT_PROGRAMME, PROMPT_PROLONGER, PROMPT_QUIZ, PROMPT_VARIANTE, PROMPT_VERIFICATION, CONSIGNES_VARIANTE, validerVariante,
  TON_MAITRISE, TON_NIVEAU, aplatir, contientInterdit, decoderParcours, decouperPhrases, evaluer, lireIdPalier, lireIdQuiz,
  modulesDe, referenceDe, tonDuNiveau, titreMaitrise, validerEtape, validerModule, validerProgramme, validerProlongement, validerQuestion, validerQuiz,
  validerMoitieA, validerMoitieB, validerRedaction, validerVerification,
  SECTIONS_BASE, SEUIL_LECON, soutenue, sujetDefini, validerVerdicts,
} from '../lib/paliers.js';
import '../app/logique.js';
import { onRequestPost as variantePost } from '../functions/api/variante.js';
import worker from '../worker.js';
import { onRequestGet as etatGet } from '../functions/api/etat.js';
import { onRequestPost as joueurPost } from '../functions/api/joueur.js';
import { onRequestGet as compteGet, onRequestPost as comptePost } from '../functions/api/compte.js';
import { onRequestGet as amisGet, onRequestPost as amisPost } from '../functions/api/amis.js';
import { onRequestGet as progressionGet, onRequestPut as progressionPut } from '../functions/api/progression.js';
import { onRequestGet as cercleGet } from '../functions/api/cercle.js';
import { onRequestPost as librePost } from '../functions/api/libre.js';
import { onRequestPost as signalementPost } from '../functions/api/signalement.js';
import { onRequestGet as sujetsGet } from '../functions/api/sujets.js';
import { onRequestGet as sujetGet, onRequestPost as sujetPost } from '../functions/api/sujet.js';
import { onRequestGet as chapitreIaGet } from '../functions/api/chapitre-ia.js';
import { onRequestGet as melangeGet } from '../functions/api/melange.js';
import { onRequestGet as duelGet, onRequestPost as duelPost, onRequestPut as duelPut } from '../functions/api/duel.js';
import { onRequestGet as duelsGet } from '../functions/api/duels.js';
import { onRequestGet as parcoursGet, onRequestPost as parcoursPost } from '../functions/api/parcours.js';
import { onRequestGet as diagnosticGet } from '../functions/api/diagnostic.js';
import { onRequestGet as palierGet } from '../functions/api/palier.js';
import { onRequestGet as glossaireGet } from '../functions/api/glossaire.js';
import { onRequestGet as ficheGet } from '../functions/api/fiche.js';
import { onRequestGet as imageGet } from '../functions/api/image.js';
import { onRequestGet as quizGet } from '../functions/api/quiz.js';
import { onRequestPost as quizDirectPost } from '../functions/api/quiz-direct.js';
import { onRequestGet as quizGeneralGet, onRequestPost as quizGeneralPost } from '../functions/api/quiz-general.js';
import { onRequestGet as jourGet } from '../functions/api/jour.js';
import { onRequestGet as tournoiGet } from '../functions/api/tournoi.js';
import { onRequestGet as groupeGet, onRequestPost as groupePost } from '../functions/api/groupe.js';
import { onRequestGet as partieGet, onRequestPost as partiePost } from '../functions/api/partie.js';
import {
  CYCLE, DUREE_QUESTION, SQL_POINTS, avancer, codePartie, lireCode, pointsReponse,
} from '../lib/parties.js';
import { classerMembres, lireSuivi } from '../lib/groupes.js';
import { typographierTexte } from '../lib/typo.js';
import {
  THEMES, classer, finDeSemaine, jourUtc, lireIdBloc, lireRefQg, lundiDe, themeDeLaSemaine, themeDuJour,
} from '../lib/general.js';
import { fauxD1 } from './faux_d1.mjs';

// --- Fausse IA -------------------------------------------------------------

// `reponses` : liste consommée dans l'ordre (la dernière se répète). Une Error est levée.
function fauxAI(reponses) {
  const appels = [];
  return {
    appels,
    async run(modele, entree) {
      appels.push({ modele, entree });
      const r = reponses[Math.min(appels.length - 1, reponses.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

const valide = (titre = 'Les phares') => ({ ...structuredClone(EXEMPLE), titre });
const invalide = () => {
  const c = valide();
  c.exercices[2].ordre[0] = 'Un autre événement'; // pas une permutation de elements
  return c;
};
const enReponse = (objet) => ({ response: 'Voici le chapitre :\n```json\n' + JSON.stringify(objet) + '\n```\nBonne lecture.' });

// --- Outils de test --------------------------------------------------------

const db = fauxD1();
const env = { DB: db, AI: undefined };
let numeroIp = 0;
const nouvelleIp = () => `198.51.100.${++numeroIp}`;

async function appel(handler, { env: e = env, methode = 'GET', corps, brut, jeton, ip = '203.0.113.7', entetes = {}, requete = '' } = {}) {
  const h = new Headers({ 'CF-Connecting-IP': ip, ...entetes });
  if (jeton) h.set('authorization', 'Bearer ' + jeton);
  let body;
  if (brut !== undefined) body = brut;
  else if (corps !== undefined) {
    body = JSON.stringify(corps);
    h.set('content-type', 'application/json');
  }
  const reponse = await handler({ request: new Request('https://koios.test/api/x' + requete, { method: methode, headers: h, body }), env: e });
  const texte = await reponse.text();
  let contenu;
  try { contenu = JSON.parse(texte); } catch { contenu = texte; }
  return { statut: reponse.status, corps: contenu, type: reponse.headers.get('content-type') };
}

async function creerJoueur(pseudo = 'Greg') {
  const r = await appel(joueurPost, { methode: 'POST', corps: { pseudo }, ip: nouvelleIp() });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  return { ...r.corps, jeton: `${r.corps.id}.${r.corps.cle}` };
}

function toutVider() {
  for (const t of ['joueurs', 'brouillons', 'signalements', 'quotas', 'sujets', 'chapitres_ia', 'duels', 'parcours', 'paliers', 'quiz_direct', 'quiz_general', 'salons', 'groupes', 'groupe_membres', 'parties', 'parties_joueurs', 'parties_reponses', 'variantes', 'file_attente', 'sources_cache', 'sessions', 'codes', 'codes_utilises', 'amities', 'invitations']) {
    db.base.exec(`DELETE FROM ${t}`);
  }
}
const lignes = (sql, ...p) => db.base.prepare(sql).all(...p).map((r) => ({ ...r }));
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const L = globalThis.Logique;
const tests = [];
const test = (nom, fn) => tests.push([nom, fn]);

function erreurFr(r, statut, extrait) {
  assert.equal(r.statut, statut, JSON.stringify(r.corps));
  assert.match(r.type, /application\/json/);
  assert.equal(typeof r.corps.erreur, 'string');
  if (extrait instanceof RegExp) assert.match(r.corps.erreur, extrait); // une chaîne en 3e argument n'est qu'un commentaire
}

// --- Sans base -------------------------------------------------------------

test('sans env.DB : /api/etat répond, les autres routes répondent 503 base absente', async () => {
  const sansBase = { DB: undefined, AI: undefined };
  const r = await appel(etatGet, { env: sansBase });
  assert.deepEqual(r.corps, { base: false, ia: false });
  const jeton = 'abcdefghij12.' + 'a'.repeat(32);
  const cas = [
    [joueurPost, { methode: 'POST', corps: { pseudo: 'Greg' } }],
    [progressionGet, { jeton }],
    [progressionPut, { methode: 'PUT', jeton, corps: { etat: {} } }],
    [cercleGet, {}],
    [librePost, { methode: 'POST', jeton, corps: { sujet: 'Les phares' } }],
    [signalementPost, { methode: 'POST', jeton, corps: { chapitre: 'hg-01', exercice: 0, message: 'faux' } }],
    [sujetsGet, {}],
    [sujetGet, { requete: '?id=phares' }],
    [sujetPost, { methode: 'POST', jeton, corps: { titre: 'Les phares' } }],
    [chapitreIaGet, { requete: '?sujet=phares&n=1' }],
    [melangeGet, {}],
    [duelGet, { requete: '?id=abcd1234' }],
    [duelPost, { methode: 'POST', jeton, corps: {} }],
    [duelPut, { methode: 'PUT', jeton, corps: {} }],
    [duelsGet, { jeton }],
    [parcoursGet, {}],
    [parcoursPost, { methode: 'POST', jeton, corps: { titre: 'Les phares' } }],
    [palierGet, { requete: '?parcours=phares&n=1' }],
    [quizGet, { requete: '?parcours=phares' }],
    [quizDirectPost, { methode: 'POST', jeton, corps: { parcours: 'phares' } }],
    [glossaireGet, { requete: '?parcours=phares&jusqua=1' }],
    [quizGeneralPost, { methode: 'POST', jeton, corps: { sujet: 'Les phares', n: 10 } }],
    [quizGeneralGet, { requete: '?bloc=phares:1' }],
    [jourGet, {}],
    [tournoiGet, {}],
    [groupeGet, { requete: '?id=abcd1234' }],
    [groupePost, { methode: 'POST', jeton, corps: { nom: 'Les phares', parcours: 'phares' } }],
    [partieGet, { requete: '?id=ABCDEF' }],
    [partiePost, { methode: 'POST', jeton, corps: { action: 'rejoindre', id: 'ABCDEF' } }],
    [compteGet, { jeton }],
    [comptePost, { methode: 'POST', corps: { action: 'connecter', pseudo: 'greg', mdp: 'x'.repeat(12) } }],
    [amisGet, { jeton }],
    [amisPost, { methode: 'POST', jeton, corps: { action: 'inviter' } }],
    [adminGet, { jeton }],
  ];
  for (const [handler, options] of cas) {
    const rep = await appel(handler, { ...options, env: sansBase });
    assert.equal(rep.statut, 503);
    assert.deepEqual(rep.corps, { erreur: 'base absente' });
  }
});

test('/api/etat reflète la base et l’IA', async () => {
  assert.deepEqual((await appel(etatGet, { env: { DB: db, AI: {} } })).corps, { base: true, ia: true });
  assert.deepEqual((await appel(etatGet, { env: { DB: db } })).corps, { base: true, ia: false });
});

// --- Schéma et quotas ------------------------------------------------------

test('schema.sql et initBase créent les mêmes tables', async () => {
  const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
    .replace(/--.*$/gm, '').split(';').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const dansLib = TABLES.map((s) => s.replace(/\s+/g, ' ').trim());
  assert.deepEqual(sql, dansLib);
  await initBase(env);
  const noms = lignes("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
  assert.deepEqual(noms, ['amities', 'brouillons', 'chapitres_ia', 'codes', 'codes_utilises', 'duels', 'file_attente', 'groupe_membres', 'groupes', 'images', 'invitations', 'joueurs', 'paliers', 'parcours', 'parties', 'parties_joueurs', 'parties_reponses', 'quiz_direct', 'quiz_general', 'quotas', 'salons', 'sessions', 'signalements', 'sources_cache', 'sujets', 'variantes']);
  const index = lignes("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  assert.deepEqual(index, [
    { name: 'idx_amities_b', tbl_name: 'amities' },
    { name: 'idx_chapitres_ia_sujet', tbl_name: 'chapitres_ia' },
    { name: 'idx_joueurs_google_sub', tbl_name: 'joueurs' },
    { name: 'idx_joueurs_pseudo_cle', tbl_name: 'joueurs' },
    { name: 'idx_paliers_parcours', tbl_name: 'paliers' },
    { name: 'idx_sessions_joueur', tbl_name: 'sessions' },
    { name: 'idx_sujets_parent', tbl_name: 'sujets' },
  ]);
  const colonnes = (t) => lignes(`SELECT name FROM pragma_table_info('${t}')`).map((c) => c.name);
  assert.deepEqual(colonnes('joueurs'), ['id', 'cle_hash', 'pseudo', 'ton', 'etat', 'points', 'valides', 'cree', 'maj', 'prenom', 'nom', 'pseudo_cle', 'mdp_hash', 'secours_hash', 'role', 'bloque', 'google_sub', 'vu', 'reinit_hash', 'reinit_fin']);
  assert.deepEqual(colonnes('sessions'), ['cle_hash', 'joueur_id', 'cree', 'vu']);
  assert.deepEqual(colonnes('codes'), ['code', 'bonus', 'jours', 'usages_max', 'usages', 'cree', 'revoque']);
  assert.deepEqual(colonnes('codes_utilises'), ['code', 'joueur_id', 'expire']);
  assert.deepEqual(colonnes('amities'), ['a', 'b', 'etat', 'cree']);
  assert.deepEqual(colonnes('invitations'), ['jeton_hash', 'joueur_id', 'cree', 'expire', 'usages_max', 'usages']);
  assert.deepEqual(colonnes('sujets'), ['id', 'titre', 'parent', 'niveau', 'contenu', 'auteur', 'vues', 'cree']);
  assert.deepEqual(colonnes('chapitres_ia'), ['id', 'sujet', 'numero', 'contenu', 'vues', 'cree']);
  assert.deepEqual(colonnes('duels'), ['id', 'createur', 'questions', 'scores', 'cree']);
  assert.deepEqual(colonnes('parcours'), ['id', 'titre', 'contenu', 'auteur', 'vues', 'cree']);
  assert.deepEqual(colonnes('paliers'), ['id', 'parcours', 'numero', 'contenu', 'vues', 'cree']);
  assert.deepEqual(colonnes('quiz_direct'), ['parcours', 'contenu', 'cree']);
  assert.deepEqual(colonnes('quiz_general'), ['id', 'sujet', 'bloc', 'contenu', 'cree']);
  assert.deepEqual(colonnes('salons'), ['id', 'titre', 'type', 'fin', 'cree']);
  assert.deepEqual(colonnes('groupes'), ['id', 'nom', 'parcours', 'createur', 'cree']);
  assert.deepEqual(colonnes('groupe_membres'), ['groupe', 'joueur', 'rejoint']);
  assert.deepEqual(colonnes('parties'), ['id', 'createur', 'titre', 'questions', 'etat', 'indice', 'debut_question', 'cree']);
  assert.deepEqual(colonnes('parties_joueurs'), ['partie', 'joueur', 'points']);
  assert.deepEqual(colonnes('parties_reponses'), ['partie', 'joueur', 'indice', 'choix', 'ms', 'juste']);
});

test('quota : compte, refuse au-delà, repart à zéro le lendemain', async () => {
  toutVider();
  for (let i = 0; i < 3; i++) assert.equal(await quota(env, 'essai', 3), true);
  assert.equal(await quota(env, 'essai', 3), false);
  assert.equal(await quota(env, 'autre', 3), true);
  db.base.prepare("UPDATE quotas SET jour = '2000-01-01', n = 99 WHERE cle = 'essai'").run();
  assert.equal(await quota(env, 'essai', 3), true);
  assert.deepEqual(lignes("SELECT n, jour FROM quotas WHERE cle = 'essai'"), [{ n: 1, jour: aujourdhui() }]);
});

// --- POST /api/joueur ------------------------------------------------------

test('joueur : crée id 12 car., cle 32 car., ne garde que le hash de la clé et de l’IP', async () => {
  toutVider();
  const ip = '192.0.2.55';
  const r = await appel(joueurPost, { methode: 'POST', corps: { pseudo: 'Greg' }, ip });
  assert.equal(r.statut, 200);
  assert.match(r.corps.id, /^[a-z0-9]{12}$/);
  assert.match(r.corps.cle, /^[a-z0-9]{32}$/);
  assert.equal(r.corps.pseudo, 'Greg');
  const [ligne] = lignes('SELECT * FROM joueurs');
  assert.equal(ligne.id, r.corps.id);
  assert.equal(ligne.cle_hash, await sha256Hex(r.corps.cle));
  assert.equal(ligne.ton, 'taquin');
  assert.equal(ligne.etat, '{}');
  assert.equal(ligne.points, 0);
  assert.equal(ligne.valides, 0);
  const tout = JSON.stringify([lignes('SELECT * FROM joueurs'), lignes('SELECT * FROM quotas')]);
  assert.ok(!tout.includes(r.corps.cle), 'la clé ne doit pas être stockée');
  assert.ok(!tout.includes(ip), 'l’IP ne doit pas être stockée en clair');
  assert.deepEqual(lignes('SELECT cle FROM quotas').map((q) => q.cle), ['joueur:' + (await sha256Hex(ip))]);
});

test('joueur : deux créations donnent des id et des clés différents', async () => {
  const a = await creerJoueur('A');
  const b = await creerJoueur('B');
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.cle, b.cle);
});

test('joueur : pseudo nettoyé, ou refusé en 400', async () => {
  toutVider();
  const ok = await appel(joueurPost, { methode: 'POST', corps: { pseudo: '  Gr\u0000é‮g \n\tM  ' }, ip: nouvelleIp() });
  assert.equal(ok.corps.pseudo, 'Grég M');
  for (const mauvais of ['', '   ', '\u0000\u0001', 'x'.repeat(25), 12, null, ['a'], undefined]) {
    const r = await appel(joueurPost, { methode: 'POST', corps: { pseudo: mauvais }, ip: nouvelleIp() });
    erreurFr(r, 400);
  }
  const limite = await appel(joueurPost, { methode: 'POST', corps: { pseudo: 'é'.repeat(24) }, ip: nouvelleIp() });
  assert.equal(limite.statut, 200);
});

test('joueur : corps illisible 400, trop gros 413', async () => {
  erreurFr(await appel(joueurPost, { methode: 'POST', brut: '{pas du json' }), 400);
  erreurFr(await appel(joueurPost, { methode: 'POST', brut: '[1,2]' }), 400);
  erreurFr(await appel(joueurPost, { methode: 'POST' }), 400);
  erreurFr(await appel(joueurPost, { methode: 'POST', corps: { pseudo: 'a', bourrage: 'x'.repeat(2000) } }), 413);
  erreurFr(await appel(joueurPost, { methode: 'POST', brut: '{}', entetes: { 'content-length': '999999' } }), 413);
});

test('joueur : 20 créations par jour et par IP, la 21e reçoit 429', async () => {
  toutVider();
  const ip = '192.0.2.99';
  for (let i = 0; i < 20; i++) {
    assert.equal((await appel(joueurPost, { methode: 'POST', corps: { pseudo: 'P' + i }, ip })).statut, 200);
  }
  erreurFr(await appel(joueurPost, { methode: 'POST', corps: { pseudo: 'trop' }, ip }), 429);
  assert.equal((await appel(joueurPost, { methode: 'POST', corps: { pseudo: 'autre' }, ip: '192.0.2.100' })).statut, 200);
});

// --- Authentification et progression ---------------------------------------

test('progression : 401 sans en-tête valide, avec mauvaise clé ou id inconnu', async () => {
  toutVider();
  const j = await creerJoueur();
  const mauvais = [
    undefined,
    'pas-bon',
    `${j.id}.${'z'.repeat(32)}`,
    `${j.id}.${j.cle.slice(1)}`,
    `${'a'.repeat(12)}.${j.cle}`,
    `${j.cle}.${j.id}`,
  ];
  for (const jeton of mauvais) {
    erreurFr(await appel(progressionGet, { jeton }), 401);
    erreurFr(await appel(progressionPut, { methode: 'PUT', jeton, corps: { etat: {} } }), 401);
  }
  erreurFr(await appel(progressionGet, { entetes: { authorization: `Basic ${j.id}.${j.cle}` } }), 401);
  assert.equal((await appel(progressionGet, { jeton: j.jeton })).statut, 200);
});

test('progression : GET renvoie pseudo, ton, etat parsé', async () => {
  toutVider();
  const j = await creerJoueur('Greg');
  const r = await appel(progressionGet, { jeton: j.jeton });
  assert.deepEqual(r.corps, { pseudo: 'Greg', ton: 'taquin', etat: {} });
});

test('progression : PUT calcule points (etat.xp, 0 à 1 000 000) et valides (paliers terminés), puis GET relit l’état', async () => {
  toutVider();
  const j = await creerJoueur('Greg');
  const etat = {
    version: 2,
    xp: 320.9,
    parcours: {
      'la-tour-eiffel': { fait: [1, 2, 3, 3, '4', 0, 1501, 'x', 2.5, null] }, // 1, 2, 3 et 4
      'mont-blanc': { fait: { 1: true, 2: false, 3: 1, 1600: true, abc: true } }, // 1 et 3
      sparte: { fait: 7 },
      vide: { fait: [] },
      casse: null,
      sansFait: { dernier: 3 },
      texte: { fait: 'beaucoup' },
    },
    chapitres: { 'hg-01': { points: 40, valide: true } }, // ancien format : ne compte plus
    reglages: { son: true },
  };
  const r = await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat } });
  assert.deepEqual(r.corps, { ok: true });
  const [ligne] = lignes('SELECT points, valides, pseudo, ton FROM joueurs');
  assert.deepEqual(ligne, { points: 320, valides: 4 + 2 + 7, pseudo: 'Greg', ton: 'taquin' });
  assert.deepEqual((await appel(progressionGet, { jeton: j.jeton })).corps.etat, etat);
  // XP borné.
  const xp = async (valeur) => {
    ok200(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: { xp: valeur } } }));
    return lignes('SELECT points FROM joueurs')[0].points;
  };
  assert.equal(await xp(5e9), 1000000);
  assert.equal(await xp(1000000), 1000000);
  assert.equal(await xp(-40), 0);
  assert.equal(await xp('500'), 0);
  assert.equal(await xp(null), 0);
  assert.equal(await xp(0.7), 0);
  assert.equal(await xp(41), 41, 'plus de plafond de 40 par chapitre');
  // Paliers terminés : 1 500 par parcours au plus, 100 000 au total ; parcours en liste ignoré.
  const grand = { xp: 1, parcours: { a: { fait: Array.from({ length: 900 }, (_, i) => i + 1) }, b: { fait: 9999 } } };
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: grand } }));
  assert.equal(lignes('SELECT valides FROM joueurs')[0].valides, 900 + 1500);
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: { parcours: [{ fait: [1, 2] }] } } }));
  assert.deepEqual(lignes('SELECT points, valides FROM joueurs')[0], { points: 0, valides: 0 });
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: { autre: 1 } } }));
  assert.deepEqual(lignes('SELECT points, valides FROM joueurs')[0], { points: 0, valides: 0 });
});

test('progression : PUT change pseudo et ton, valide les deux, garde l’ancien sinon', async () => {
  toutVider();
  const j = await creerJoueur('Greg');
  assert.equal((await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { pseudo: ' Fox\u0007 ', ton: 'sobre', etat: {} } })).statut, 200);
  assert.deepEqual((await appel(progressionGet, { jeton: j.jeton })).corps, { pseudo: 'Fox', ton: 'sobre', etat: {} });
  assert.equal((await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: { a: 1 } } })).statut, 200);
  assert.deepEqual((await appel(progressionGet, { jeton: j.jeton })).corps, { pseudo: 'Fox', ton: 'sobre', etat: { a: 1 } });
  for (const corps of [
    { ton: 'rigolo', etat: {} },
    { ton: 3, etat: {} },
    { pseudo: '', etat: {} },
    { pseudo: 'x'.repeat(25), etat: {} },
    { pseudo: null, etat: {} },
    { etat: [] },
    { etat: 'texte' },
    { etat: null },
    {},
  ]) {
    erreurFr(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps }), 400);
  }
  assert.deepEqual((await appel(progressionGet, { jeton: j.jeton })).corps, { pseudo: 'Fox', ton: 'sobre', etat: { a: 1 } });
});

test('progression : corps limité à 64 Ko (413 au-delà)', async () => {
  toutVider();
  const j = await creerJoueur('Greg');
  const sous = JSON.stringify({ etat: { note: 'x'.repeat(60 * 1024) } });
  assert.ok(sous.length < 65536);
  assert.equal((await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, brut: sous })).statut, 200);
  const trop = JSON.stringify({ etat: { note: 'x'.repeat(65536) } });
  erreurFr(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, brut: trop }), 413);
  erreurFr(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, brut: '{}', entetes: { 'content-length': '70000' } }), 413);
});

// --- Cercle ----------------------------------------------------------------

// (tests du cercle : voir la section « Lot 6 » en bas de ce fichier)

// --- Signalement -----------------------------------------------------------

test('signalement : 401 sans auth, 400 si champs invalides, 200 et ligne enregistrée', async () => {
  toutVider();
  const j = await creerJoueur();
  const corps = { chapitre: 'hg-01', exercice: 1, message: 'La date est fausse.' };
  erreurFr(await appel(signalementPost, { methode: 'POST', corps }), 401);
  for (const mauvais of [
    { ...corps, message: '' },
    { ...corps, message: '   ' },
    { ...corps, message: 'x'.repeat(1001) },
    { ...corps, message: 42 },
    { ...corps, chapitre: '' },
    { ...corps, chapitre: 'c'.repeat(41) },
    { ...corps, exercice: 'a' },
    { ...corps, exercice: 1.5 },
    { ...corps, exercice: -1 },
  ]) {
    erreurFr(await appel(signalementPost, { methode: 'POST', jeton: j.jeton, corps: mauvais }), 400);
  }
  const r = await appel(signalementPost, { methode: 'POST', jeton: j.jeton, corps });
  assert.deepEqual(r.corps, { ok: true });
  const [ligne] = lignes('SELECT joueur, chapitre, exercice, message FROM signalements');
  assert.deepEqual(ligne, { joueur: j.id, chapitre: 'hg-01', exercice: 1, message: 'La date est fausse.' });
  const mille = await appel(signalementPost, { methode: 'POST', jeton: j.jeton, corps: { ...corps, message: 'é'.repeat(1000) } });
  assert.equal(mille.statut, 200);
});

test('signalement : 30 par jour et par joueur, la 31e reçoit 429', async () => {
  toutVider();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const corps = { chapitre: 'libre', exercice: 0, message: 'Douteux.' };
  for (let i = 0; i < 30; i++) {
    assert.equal((await appel(signalementPost, { methode: 'POST', jeton: j.jeton, corps })).statut, 200);
  }
  erreurFr(await appel(signalementPost, { methode: 'POST', jeton: j.jeton, corps }), 429);
  assert.equal((await appel(signalementPost, { methode: 'POST', jeton: autre.jeton, corps })).statut, 200);
  assert.equal(lignes('SELECT * FROM signalements').length, 31);
});

// --- Sujet libre : lecture et validation -----------------------------------

test('libre : le prompt décrit le format et contient un exemple valide', async () => {
  assert.match(PROMPT_SYSTEME, /renard bibliothécaire/);
  assert.match(PROMPT_SYSTEME, /JSON/);
  for (const mot of ['titre', 'essentiel', 'reperes', 'qcm', 'bluff', 'frise', 'rivalJuste', 'rivalFaux', 'valeurs', 'ordre']) {
    assert.ok(PROMPT_SYSTEME.includes(mot), mot);
  }
  assert.ok(PROMPT_SYSTEME.includes(JSON.stringify(EXEMPLE)));
  assert.ok(validerChapitre(EXEMPLE).chapitre, validerChapitre(EXEMPLE).raison);
  assert.deepEqual(MODELES, ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/mistralai/mistral-small-3.1-24b-instruct']);
});

test('libre : extraireObjet gère response chaîne, response objet, choices, prose et balises', async () => {
  const o = { titre: 'T', note: 'accolade } dans une chaîne \\" et { ouvrante' };
  assert.deepEqual(extraireObjet({ response: JSON.stringify(o) }), o);
  assert.deepEqual(extraireObjet({ response: o }), o);
  assert.deepEqual(extraireObjet({ choices: [{ message: { content: JSON.stringify(o) } }] }), o);
  assert.deepEqual(extraireObjet({ response: 'Bien sûr !\n```json\n' + JSON.stringify(o) + '\n```\nVoilà.' }), o);
  assert.deepEqual(extraireObjet({ response: '', choices: [{ message: { content: JSON.stringify(o) } }] }), o);
  assert.deepEqual(extraireObjet(JSON.stringify(o)), o);
  assert.deepEqual(extraireObjet({ response: '{pas du json} puis ' + JSON.stringify(o) }), o);
  for (const rien of [null, undefined, {}, { response: 'aucun objet ici' }, { response: '{"coupé": "ici' }, { response: null }, { choices: [] }, 42]) {
    assert.equal(extraireObjet(rien), null);
  }
});

test('libre : validation stricte du chapitre', async () => {
  const modif = (fn) => { const c = valide(); fn(c); return c; };
  const refus = (c, motif) => {
    const r = validerChapitre(c);
    assert.ok(r.raison, 'devrait être refusé : ' + motif);
  };
  const ok = validerChapitre(valide('Mon sujet'));
  assert.ok(ok.chapitre, ok.raison);
  assert.deepEqual(Object.keys(ok.chapitre), ['id', 'domaine', 'titre', 'essentiel', 'reperes', 'sources', 'figure', 'brouillon', 'exercices']);
  assert.deepEqual(ok.chapitre.exercices.map((e) => e.lib), ['Exercice 1 · question à choix', 'Exercice 2 · le Rival bluffe-t-il ?', 'Exercice 3 · frise']);
  for (const e of ok.chapitre.exercices) {
    assert.deepEqual(e.sources, []);
    assert.equal(e.figure, null);
  }
  refus(null, 'null');
  refus([], 'tableau');
  refus(modif((c) => { delete c.titre; }), 'sans titre');
  refus(modif((c) => { c.titre = 'ab'; }), 'titre trop court');
  refus(modif((c) => { c.titre = 'x'.repeat(91); }), 'titre trop long');
  refus(modif((c) => { c.titre = 12; }), 'titre non texte');
  refus(modif((c) => { c.essentiel.pop(); }), 'essentiel à 3');
  refus(modif((c) => { c.essentiel = c.essentiel.join(' '); }), 'essentiel en chaîne');
  refus(modif((c) => { c.essentiel[0] = 'x'.repeat(401); }), 'phrase trop longue');
  refus(modif((c) => { c.reperes.pop(); }), 'reperes à 3');
  refus(modif((c) => { c.reperes[0] = ['seul']; }), 'repère sans explication');
  refus(modif((c) => { c.reperes[0][0] = 'x'.repeat(41); }), 'repère trop long');
  refus(modif((c) => { c.exercices.pop(); }), '2 exercices');
  refus(modif((c) => { c.exercices.push(structuredClone(c.exercices[0])); }), '4 exercices');
  refus(modif((c) => { c.exercices.reverse(); }), 'types dans le désordre');
  refus(modif((c) => { c.exercices[0].type = 'vrai-faux'; }), 'type inconnu');
  refus(modif((c) => { c.exercices[0].reponses.pop(); }), 'qcm à 3 réponses');
  refus(modif((c) => { c.exercices[0].reponses[1] = c.exercices[0].reponses[0]; }), 'réponses identiques');
  refus(modif((c) => { c.exercices[0].bonne = 4; }), 'bonne = 4');
  refus(modif((c) => { c.exercices[0].bonne = -1; }), 'bonne = -1');
  refus(modif((c) => { c.exercices[0].bonne = '1'; }), 'bonne en chaîne');
  refus(modif((c) => { c.exercices[0].repere = 4; }), 'repere = 4');
  refus(modif((c) => { c.exercices[0].repere = 1.5; }), 'repere décimal');
  refus(modif((c) => { delete c.exercices[0].rivalJuste; }), 'rivalJuste absent');
  refus(modif((c) => { c.exercices[0].correction = ''; }), 'correction vide');
  refus(modif((c) => { c.exercices[1].vrai = 'faux'; }), 'vrai non booléen');
  refus(modif((c) => { delete c.exercices[1].affirmation; }), 'affirmation absente');
  refus(modif((c) => { c.exercices[2].elements.pop(); }), 'frise à 3 éléments');
  refus(modif((c) => { c.exercices[2].ordre[0] = 'Autre chose'; }), 'ordre pas une permutation');
  refus(modif((c) => { c.exercices[2].ordre[1] = c.exercices[2].ordre[0]; }), 'ordre avec doublon');
  refus(modif((c) => { c.exercices[2].elements[1] = c.exercices[2].elements[0]; }), 'elements avec doublon');
  refus(modif((c) => { delete c.exercices[2].valeurs['Prise de la Bastille']; }), 'valeur manquante');
  refus(modif((c) => { c.exercices[2].valeurs.Intrus = '1'; }), 'valeur en trop');
  refus(modif((c) => { c.exercices[2].valeurs['Prise de la Bastille'] = ''; }), 'valeur vide');
  refus(modif((c) => { c.exercices[2].valeurs = ['1789', '1887', '1889', '1930']; }), 'valeurs en tableau');
});

test('libre : champs inconnus écartés, nombres de la frise convertis, elements jamais déjà dans le bon ordre', async () => {
  const c = valide();
  c.surprise = 'x';
  c.exercices[0].piege = '<script>';
  c.exercices[2].valeurs = Object.fromEntries(Object.entries(c.exercices[2].valeurs).map(([k, v]) => [k, Number(v)]));
  c.exercices[2].elements = [...c.exercices[2].ordre]; // déjà dans l'ordre : le serveur doit les mélanger
  for (let i = 0; i < 20; i++) {
    const r = validerChapitre(c);
    assert.ok(r.chapitre, r.raison);
    assert.ok(!('surprise' in r.chapitre));
    assert.ok(!('piege' in r.chapitre.exercices[0]));
    const f = r.chapitre.exercices[2];
    assert.equal(f.valeurs['Prise de la Bastille'], '1789');
    assert.deepEqual([...f.elements].sort(), [...f.ordre].sort());
    assert.notDeepEqual(f.elements, f.ordre);
  }
});

// --- Sujet libre : route ---------------------------------------------------

test('libre : 503 sans IA (et aucun quota consommé), 401 sans auth', async () => {
  toutVider();
  const j = await creerJoueur();
  const sansIa = { DB: db, AI: undefined };
  const r = await appel(librePost, { env: sansIa, jeton: j.jeton, corps: { sujet: 'Les phares' }, methode: 'POST' });
  erreurFr(r, 503);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'libre%'").length, 0);
  const avecIa = { DB: db, AI: fauxAI([enReponse(valide())]) };
  erreurFr(await appel(librePost, { env: avecIa, corps: { sujet: 'Les phares' }, methode: 'POST' }), 401);
  assert.equal(avecIa.AI.appels.length, 0);
});

test('libre : sujet de 3 à 80 caractères, sinon 400 sans appeler l’IA ni consommer de quota', async () => {
  toutVider();
  const j = await creerJoueur();
  const e = { DB: db, AI: fauxAI([enReponse(valide())]) };
  for (const sujet of ['', 'ab', '  a ', 'x'.repeat(81), 12, null, undefined, '\u0000\u0001\u0002']) {
    erreurFr(await appel(librePost, { env: e, methode: 'POST', jeton: j.jeton, corps: { sujet } }), 400);
  }
  erreurFr(await appel(librePost, { env: e, methode: 'POST', jeton: j.jeton, corps: { sujet: 'ok', bourrage: 'x'.repeat(3000) } }), 413);
  assert.equal(e.AI.appels.length, 0);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'libre%'").length, 0);
  assert.equal((await appel(librePost, { env: e, methode: 'POST', jeton: j.jeton, corps: { sujet: 'x'.repeat(80) } })).statut, 200);
  assert.equal((await appel(librePost, { env: e, methode: 'POST', jeton: j.jeton, corps: { sujet: 'abc' } })).statut, 200);
});

test('libre : succès avec le premier modèle, chapitre complété et brouillon enregistré', async () => {
  toutVider();
  const j = await creerJoueur();
  const ia = fauxAI([enReponse(valide('Les phares'))]);
  const r = await appel(librePost, { env: { DB: db, AI: ia }, methode: 'POST', jeton: j.jeton, corps: { sujet: '  Les phares  ' } });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.deepEqual(Object.keys(r.corps), ['chapitre']);
  const c = r.corps.chapitre;
  assert.deepEqual(Object.keys(c), ['id', 'domaine', 'titre', 'essentiel', 'reperes', 'sources', 'figure', 'brouillon', 'exercices']);
  assert.equal(c.id, 'libre');
  assert.equal(c.domaine, 'libre');
  assert.equal(c.titre, 'Les phares');
  assert.equal(c.essentiel.length, 4);
  assert.equal(c.reperes.length, 4);
  assert.deepEqual(c.sources, []);
  assert.equal(c.figure, null);
  assert.equal(c.brouillon, true);
  assert.deepEqual(c.exercices.map((e) => e.type), ['qcm', 'bluff', 'frise']);
  assert.deepEqual(c.exercices.map((e) => e.lib), ['Exercice 1 · question à choix', 'Exercice 2 · le Rival bluffe-t-il ?', 'Exercice 3 · frise']);
  for (const e of c.exercices) {
    assert.deepEqual(e.sources, []);
    assert.equal(e.figure, null);
  }
  // Un seul appel, au bon modèle, avec le bon format de demande.
  assert.equal(ia.appels.length, 1);
  assert.equal(ia.appels[0].modele, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(ia.appels[0].entree.max_tokens, 2500);
  assert.equal(ia.appels[0].entree.messages[0].role, 'system');
  assert.equal(ia.appels[0].entree.messages[0].content, PROMPT_SYSTEME);
  assert.match(ia.appels[0].entree.messages[1].content, /Les phares/);
  // Brouillon gardé.
  const [b] = lignes('SELECT joueur, sujet, contenu FROM brouillons');
  assert.equal(b.joueur, j.id);
  assert.equal(b.sujet, 'Les phares');
  assert.deepEqual(JSON.parse(b.contenu), c);
});

test('libre : lit aussi response en objet déjà parsé et choices[0].message.content', async () => {
  toutVider();
  const j = await creerJoueur();
  for (const sortie of [
    { response: valide('Objet') },
    { choices: [{ message: { content: JSON.stringify(valide('Choix')) } }] },
  ]) {
    const r = await appel(librePost, { env: { DB: db, AI: fauxAI([sortie]) }, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Un sujet' } });
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.ok(['Objet', 'Choix'].includes(r.corps.chapitre.titre));
  }
});

test('libre : réponse invalide puis valide, le second modèle reprend', async () => {
  toutVider();
  const j = await creerJoueur();
  const ia = fauxAI([enReponse(invalide()), enReponse(valide('Repli'))]);
  const r = await appel(librePost, { env: { DB: db, AI: ia }, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Un sujet' } });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.equal(r.corps.chapitre.titre, 'Repli');
  assert.deepEqual(ia.appels.map((a) => a.modele), MODELES);
  assert.equal(lignes('SELECT * FROM brouillons').length, 1);
});

test('libre : texte sans JSON puis erreur du modèle : repli ou 502', async () => {
  toutVider();
  const j = await creerJoueur();
  const iaA = fauxAI([{ response: 'Désolé, je ne peux pas.' }, enReponse(valide('Repli'))]);
  assert.equal((await appel(librePost, { env: { DB: db, AI: iaA }, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Sujet A' } })).statut, 200);
  assert.equal(iaA.appels.length, 2);
  const iaB = fauxAI([new Error('modèle indisponible'), enReponse(valide('Repli'))]);
  const rB = await appel(librePost, { env: { DB: db, AI: iaB }, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Sujet B' } });
  assert.equal(rB.statut, 200);
  assert.deepEqual(iaB.appels.map((a) => a.modele), MODELES);
  const iaC = fauxAI([new Error('panne'), new Error('panne')]);
  erreurFr(await appel(librePost, { env: { DB: db, AI: iaC }, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Sujet C' } }), 502);
});

test('libre : deux réponses invalides, 502 et aucun brouillon', async () => {
  toutVider();
  const j = await creerJoueur();
  const ia = fauxAI([enReponse(invalide()), { response: '{"titre":"coupé", "essentiel": [' }]);
  const r = await appel(librePost, { env: { DB: db, AI: ia }, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Un sujet' } });
  erreurFr(r, 502);
  assert.equal(ia.appels.length, 2);
  assert.equal(lignes('SELECT * FROM brouillons').length, 0);
});

test('libre : 5 par jour par joueur, 60 par jour au total', async () => {
  toutVider();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const ia = fauxAI([enReponse(valide())]);
  const e = { DB: db, AI: ia };
  for (let i = 0; i < 5; i++) {
    assert.equal((await appel(librePost, { env: e, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Sujet ' + i } })).statut, 200);
  }
  erreurFr(await appel(librePost, { env: e, methode: 'POST', jeton: j.jeton, corps: { sujet: 'Sujet 6' } }), 429);
  assert.equal(ia.appels.length, 5);
  // Le refus d'un joueur n'entame pas le quota global : toujours 5 après le refus.
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'libre:total'")[0].n, 5);
  assert.equal((await appel(librePost, { env: e, methode: 'POST', jeton: autre.jeton, corps: { sujet: 'Sujet 7' } })).statut, 200);
  // Plafond global.
  db.base.prepare("UPDATE quotas SET n = 59 WHERE cle = 'libre:total'").run();
  const dernier = await creerJoueur('Dernier');
  assert.equal((await appel(librePost, { env: e, methode: 'POST', jeton: dernier.jeton, corps: { sujet: 'Sujet 8' } })).statut, 200);
  const sans = await creerJoueur('Sans');
  erreurFr(await appel(librePost, { env: e, methode: 'POST', jeton: sans.jeton, corps: { sujet: 'Sujet 9' } }), 429);
});

// =============================================================================
// V1.1 : sujets, chapitres IA ancrés, mélange, duels
// =============================================================================

// --- Wikipédia simulé : `fetch` global remplacé (tout autre hôte est refusé) ---

const texteWiki = (sujet, n = 600) => `${sujet} est décrit ici pour les tests. `.repeat(Math.ceil(n / 30)).slice(0, n);
const wiki = { appels: [], pages: {}, pagesEn: {}, langliens: {}, recherche: null, rechercheEn: null, panne: null, avance: 0 };
// Fournisseurs externes simulés (GLM, Unsplash, Commons) : chacun est une fonction (url, init) -> Response, ou null (non prévu).
const ext = { appels: [], glm: null, unsplash: null, commons: null, gemini: null, grok: null, groq: null, cerebras: null, mistral: null, claude: null, google: null };
// Horloge simulée : `Date.now` avance de `horloge.t` (les tests de délais).
const horloge = { t: 0, vrai: Date.now.bind(Date) };
Date.now = () => horloge.vrai() + horloge.t;

function reinitWiki() {
  wiki.appels = [];
  wiki.panne = null;
  wiki.recherche = null;
  wiki.rechercheEn = null;
  wiki.avance = 0;
  wiki.pages = {
    'Tour Eiffel': { extract: texteWiki('La tour Eiffel', 800) + '\n\n\n== Notes et références ==\nNE PAS LIRE', image: 'Tour_Eiffel_Wikimedia_Commons.jpg' },
    'Gustave Eiffel': { extract: texteWiki('Gustave Eiffel', 500), image: 'Gustave_Eiffel.jpg' },
    'Maurice Koechlin': { extract: texteWiki('Maurice Koechlin', 500), image: null },
  };
  wiki.pagesEn = {
    'Eiffel Tower': { extract: texteWiki('The Eiffel Tower', 7000) + '\n\n\n== References ==\nDO NOT READ', image: 'Eiffel_Tower_Wikimedia_Commons.jpg' },
    'Gustave Eiffel': { extract: texteWiki('Gustave Eiffel (en)', 700), image: null },
  };
  wiki.langliens = { 'Tour Eiffel': 'Eiffel Tower', 'Gustave Eiffel': 'Gustave Eiffel' };
}
reinitWiki();

function reinitExt() {
  ext.appels = [];
  ext.glm = null;
  ext.unsplash = null;
  ext.commons = null;
  ext.gemini = null;
  ext.grok = null;
  ext.groq = null;
  ext.cerebras = null;
  ext.mistral = null;
  ext.claude = null;
  ext.google = null;
  oublierEpuisements();
  horloge.t = 0;
}

const reponseWiki = (objet) => new Response(JSON.stringify(objet), { status: 200, headers: { 'content-type': 'application/json' } });
function pageWikiJson(titre, p, langue = 'fr') {
  const sortie = { pageid: 1000, ns: 0, title: titre, extract: p.extract };
  if (!p.sansUrl) sortie.fullurl = `https://${langue}.wikipedia.org/wiki/` + titre.replace(/ /g, '_');
  if (p.image) {
    sortie.pageimage = p.image;
    sortie.thumbnail = { source: p.vignette || `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${p.image}/800px-${p.image}`, width: 800, height: 600 };
  }
  return sortie;
}
// Une requête qui reste bloquée jusqu'à l'abandon (délai) : pour tester les délais.
const bloquer = (init) => new Promise((resolu, rejete) => {
  const garde = setInterval(() => {}, 1000); // AbortSignal.timeout ne retient pas la boucle d'événements
  init.signal.addEventListener('abort', () => {
    clearInterval(garde);
    rejete(init.signal.reason);
  });
});
const FOURNISSEURS = { 'api.z.ai': 'glm', 'open.bigmodel.cn': 'glm', 'generativelanguage.googleapis.com': 'gemini', 'api.x.ai': 'grok', 'api.groq.com': 'groq', 'api.cerebras.ai': 'cerebras', 'api.mistral.ai': 'mistral', 'api.anthropic.com': 'claude', 'api.unsplash.com': 'unsplash', 'commons.wikimedia.org': 'commons', 'oauth2.googleapis.com': 'google' };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (FOURNISSEURS[u.hostname]) {
    ext.appels.push({ url: u, init, fournisseur: FOURNISSEURS[u.hostname] });
    const reponse = ext[FOURNISSEURS[u.hostname]];
    if (!reponse) throw new Error('fournisseur non prévu : ' + u.hostname);
    return reponse(u, init);
  }
  wiki.appels.push({ url: u, init });
  const langue = u.hostname === 'fr.wikipedia.org' ? 'fr' : u.hostname === 'en.wikipedia.org' ? 'en' : null;
  if (!langue) throw new Error('hôte inattendu : ' + u.hostname);
  horloge.t += wiki.avance;
  if (wiki.panne === 'reseau') throw new Error('réseau coupé');
  if (wiki.panne === 'delai') throw new DOMException('délai dépassé', 'TimeoutError');
  if (typeof wiki.panne === 'number') return new Response('panne', { status: wiki.panne });
  if (wiki.panne === 'json') return new Response('<html>pas du json</html>', { status: 200 });
  const p = u.searchParams;
  const pages = langue === 'fr' ? wiki.pages : wiki.pagesEn;
  if (p.get('list') === 'search') {
    const q = p.get('srsearch');
    const regle = langue === 'fr' ? wiki.recherche : wiki.rechercheEn;
    const titres = regle ? regle(q) : Object.keys(pages).filter((t) => q.toLowerCase().includes(t.toLowerCase()));
    return reponseWiki({ query: { search: titres.slice(0, 3).map((title) => ({ ns: 0, title })) } });
  }
  const titre = p.get('titles');
  if (p.get('prop') === 'langlinks') {
    const en = wiki.langliens[titre];
    return reponseWiki({ query: { pages: { 1000: { pageid: 1000, ns: 0, title: titre, ...(en ? { langlinks: [{ lang: 'en', '*': en }] } : {}) } } } });
  }
  const page = pages[titre];
  if (!page) return reponseWiki({ query: { pages: { '-1': { ns: 0, title: titre, missing: '' } } } });
  return reponseWiki({ query: { pages: { 1000: pageWikiJson(titre, page, langue) } } });
};

// --- Aides ---

const planValide = () => structuredClone(EXEMPLE_PLAN);
const chapitreValide = () => structuredClone(EXEMPLE_CHAPITRE);
const iaPlan = () => fauxAI([enReponse(planValide())]);
const iaChapitre = () => fauxAI([enReponse(chapitreValide())]);
const ok200 = (r) => assert.equal(r.statut, 200, JSON.stringify(r.corps));
const CLES_SUJET = ['id', 'titre', 'parent', 'niveau', 'resume', 'plan', 'approfondir', 'image', 'sources', 'ancrage', 'brouillon'];

async function creerSujet(joueur, titre = 'La tour Eiffel', { parent, ia = iaPlan() } = {}) {
  const r = await appel(sujetPost, { env: { DB: db, AI: ia }, methode: 'POST', jeton: joueur.jeton, corps: parent ? { titre, parent } : { titre } });
  ok200(r);
  return r.corps.sujet;
}
function lireChapitre(joueur, sujetId, n, ia = iaChapitre()) {
  return appel(chapitreIaGet, { env: { DB: db, AI: ia }, jeton: joueur && joueur.jeton, requete: `?sujet=${sujetId}&n=${n}` });
}
// Insertions directes (sans passer par l'IA).
function insererSujet(id, { titre = id, parent = null, niveau = 1, vues = 0, cree = '2026-10-19T08:00:00.000Z', resume } = {}) {
  const plan = planValide();
  const contenu = {
    resume: resume || plan.resume,
    plan: plan.plan.map((c, i) => ({ numero: i + 1, ...c })),
    approfondir: plan.approfondir,
    image: null,
    sources: [],
    ancrage: 'aucun',
    brouillon: true,
    pageWiki: null,
  };
  db.base.prepare('INSERT INTO sujets (id, titre, parent, niveau, contenu, auteur, vues, cree) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, titre, parent, niveau, JSON.stringify(contenu), 'auteur', vues, cree);
}
function insererChapitre(sujetId, numero, titre = `Chapitre ${numero}`) {
  const contenu = validerChapitreIA(chapitreValide(), titre).valeur;
  const chapitre = assemblerChapitre({ id: sujetId, titre: 'Sujet ' + sujetId }, { numero, titre }, contenu, []);
  db.base.prepare('INSERT INTO chapitres_ia (id, sujet, numero, contenu, vues, cree) VALUES (?, ?, ?, ?, 0, ?)')
    .run(chapitre.id, sujetId, numero, JSON.stringify(chapitre), '2026-10-19T08:00:00.000Z');
  return chapitre;
}
const toutVoir = () => { toutVider(); reinitWiki(); reinitExt(); };
// Repart d'une bibliothèque vide en gardant les joueurs.
const viderBibliotheque = () => {
  for (const t of ['quotas', 'sujets', 'chapitres_ia', 'duels', 'parcours', 'paliers', 'quiz_direct', 'quiz_general', 'salons', 'sources_cache']) db.base.exec(`DELETE FROM ${t}`);
  reinitWiki();
  reinitExt();
};

// --- wiki.js ---

test('wiki : recherche puis lecture, adresses, en-têtes et résultat conformes au cahier', async () => {
  reinitWiki();
  const page = await ancrer('Tour Eiffel');
  assert.equal(wiki.appels.length, 2);
  const [recherche, lecture] = wiki.appels;
  assert.equal(recherche.url.origin + recherche.url.pathname, 'https://fr.wikipedia.org/w/api.php');
  assert.deepEqual(Object.fromEntries(recherche.url.searchParams), {
    action: 'query', list: 'search', srsearch: 'Tour Eiffel', srlimit: '3', format: 'json', utf8: '1',
  });
  assert.deepEqual(Object.fromEntries(lecture.url.searchParams), {
    action: 'query', prop: 'extracts|pageimages|info', explaintext: '1', piprop: 'thumbnail|name', pithumbsize: '800',
    inprop: 'url', titles: 'Tour Eiffel', format: 'json', redirects: '1',
  });
  assert.equal(USER_AGENT, 'Koios/1.1 (https://koios.gregoire-muel.workers.dev)');
  for (const a of wiki.appels) {
    assert.equal(new Headers(a.init.headers).get('user-agent'), USER_AGENT);
    assert.ok(a.init.signal instanceof AbortSignal && !a.init.signal.aborted, 'délai prévu');
  }
  assert.equal(page.titre, 'Tour Eiffel');
  assert.equal(page.url, 'https://fr.wikipedia.org/wiki/Tour_Eiffel');
  assert.ok(page.texte.startsWith('La tour Eiffel est décrit'));
  assert.ok(!page.texte.includes('NE PAS LIRE'), 'fin d’article (notes) retirée');
  assert.deepEqual(page.image, {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg',
    alt: 'Illustration de « Tour Eiffel »',
    credit: CREDIT_IMAGE,
    page: 'https://fr.wikipedia.org/wiki/Fichier:Tour_Eiffel_Wikimedia_Commons.jpg',
  });
  assert.equal(CREDIT_IMAGE, 'Image : Wikimédia, auteur et licence sur la page du fichier');
  // Lecture directe d'une page par son titre : une seule requête.
  reinitWiki();
  assert.equal((await lirePage('Gustave Eiffel')).titre, 'Gustave Eiffel');
  assert.equal(wiki.appels.length, 1);
  assert.deepEqual(await chercher('Gustave Eiffel'), ['Gustave Eiffel']);
});

test('wiki : texte tronqué à 7 000 caractères, adresse reconstruite sans fullurl, image absente ou hors Wikimédia ignorée', async () => {
  reinitWiki();
  wiki.pages['Tour Eiffel'] = { extract: 'a'.repeat(20000), image: 'X.jpg', sansUrl: true };
  const longue = await ancrer('Tour Eiffel');
  assert.equal(MAX_TEXTE, 7000);
  assert.equal(longue.texte.length, 7000);
  assert.equal(longue.url, 'https://fr.wikipedia.org/wiki/Tour_Eiffel');
  wiki.pages['Tour Eiffel'] = { extract: texteWiki('Tour', 500), image: 'X.jpg', vignette: 'https://exemple.test/x.jpg' };
  assert.equal((await ancrer('Tour Eiffel')).image, null);
  wiki.pages['Tour Eiffel'] = { extract: texteWiki('Tour', 500) };
  assert.equal((await ancrer('Tour Eiffel')).image, null);
  assert.equal(tronquer('a\n\n\n\n\nb'), 'a\n\nb');
  assert.equal(tronquer('Intro.\n\n== Voir aussi ==\nliste\n\n== Liens externes ==\nlien'), 'Intro.');
  assert.equal(tronquer('é'.repeat(6999) + '😀').length, 6999, 'pas de demi-caractère en bout de texte');
});

test('wiki : toute panne donne null (jamais une exception) : HTTP, réseau, délai, JSON, page absente ou trop courte', async () => {
  for (const panne of [500, 404, 'reseau', 'delai', 'json']) {
    reinitWiki();
    wiki.panne = panne;
    assert.equal(await ancrer('Tour Eiffel'), null, String(panne));
    assert.deepEqual(await chercher('Tour Eiffel'), []);
    assert.equal(await lirePage('Tour Eiffel'), null);
  }
  reinitWiki();
  wiki.recherche = () => ['Page absente'];
  assert.equal(await ancrer('Page absente'), null);
  wiki.pages.Homonymie = { extract: 'Court. Voir aussi plusieurs pages.' };
  wiki.recherche = () => ['Homonymie'];
  assert.equal(await ancrer('Homonymie'), null);
  assert.equal(await lirePage(''), null);
  assert.equal(await lirePage(undefined), null);
  assert.deepEqual(await chercher('   '), []);
});

test('wiki : choix de la page (mots communs avec le titre voulu), requête nettoyée', async () => {
  assert.equal(choisirTitre('Les hoplites', ['Sparte', 'Hoplite']), 'Hoplite');
  assert.equal(choisirTitre('Mont Blanc', ['Blanc', 'Mont Blanc']), 'Mont Blanc');
  assert.equal(choisirTitre('Étoile', ['Etoile polaire']), 'Etoile polaire');
  assert.equal(choisirTitre('Zorglub', ['Tour Eiffel']), null);
  assert.equal(choisirTitre('Zorglub', []), null);
  // Le contexte de recherche (parent) ne décide pas du choix : seul le titre voulu compte.
  reinitWiki();
  const page = await ancrer('Gustave Eiffel La tour Eiffel', 'Gustave Eiffel');
  assert.equal(page.titre, 'Gustave Eiffel');
  assert.equal(nettoyerRequete('intitle:"Tour Eiffel" -insource:x  '), 'intitle Tour Eiffel insource x');
  assert.equal(nettoyerRequete('Jean-Pierre l’été'), 'Jean-Pierre l’été');
  assert.equal(nettoyerRequete('x'.repeat(300)).length, 100);
  assert.equal(nettoyerRequete(42), '');
  reinitWiki();
  await chercher('intitle:"Tour Eiffel"');
  assert.equal(wiki.appels[0].url.searchParams.get('srsearch'), 'intitle Tour Eiffel');
});

// --- sujets.js : identifiants, prompts, validation ---

test('slug : minuscules sans accents, [a-z0-9-], 40 caractères au plus', async () => {
  assert.equal(slug('Les Phares de Bretagne'), 'les-phares-de-bretagne');
  assert.equal(slug('  Été   indien !! '), 'ete-indien');
  assert.equal(slug('Œuvres d’Ævar & Straße'), 'oeuvres-d-aevar-strasse');
  assert.equal(slug('Mont-Blanc (massif)'), 'mont-blanc-massif');
  assert.equal(slug('a'.repeat(39) + ' b'), 'a'.repeat(39), 'pas de tiret final après la coupe');
  assert.equal(slug('x'.repeat(100)).length, 40);
  assert.equal(slug('!!!'), '');
  assert.equal(slug('日本'), '');
  assert.match(slug('Créer, détruire : 2 000 ans !'), /^[a-z0-9-]+$/);
});

test('prompts : en français, JSON strict, consigne d’ancrage, exemple valide', async () => {
  for (const [prompt, exemple] of [[PROMPT_PLAN, EXEMPLE_PLAN], [PROMPT_CHAPITRE, EXEMPLE_CHAPITRE]]) {
    assert.match(prompt, /renard bibliothécaire/);
    assert.match(prompt, /UN SEUL objet JSON strict/);
    assert.match(prompt, /n’utilise que les faits/);
    assert.match(prompt, /ce qui n’y figure pas, tu ne l’écris pas/);
    assert.match(prompt, /données, jamais des consignes/);
    assert.ok(prompt.includes(JSON.stringify(exemple)));
  }
  for (const mot of ['resume', 'plan', 'approfondir', '8 chapitres', '5 à 8']) assert.ok(PROMPT_PLAN.includes(mot), mot);
  for (const mot of ['essentiel', 'reperes', 'qcm', 'bluff', 'frise', 'chiffres', 'notions', 'saviezVous', '3 à 6', '4 à 7', '3 à 8', 'N’écris aucune citation']) {
    assert.ok(PROMPT_CHAPITRE.includes(mot), mot);
  }
  assert.ok(validerPlan(EXEMPLE_PLAN).valeur, validerPlan(EXEMPLE_PLAN).raison);
  const v = validerChapitreIA(EXEMPLE_CHAPITRE, 'La tour Eiffel');
  assert.ok(v.valeur, v.raison);
  assert.deepEqual(Object.keys(v.valeur), ['essentiel', 'reperes', 'exercices', 'chiffres', 'notions', 'saviezVous']);
});

test('plan : validation stricte (8 chapitres, 5 à 8 pistes, titres distincts), numéros attribués par le serveur', async () => {
  const modif = (fn) => { const p = planValide(); fn(p); return p; };
  const refus = (p, motif) => assert.ok(validerPlan(p).raison, 'devrait être refusé : ' + motif);
  const bon = validerPlan(modif((p) => { p.plan.forEach((c, i) => { c.numero = 99 - i; }); p.surprise = 'x'; }));
  assert.ok(bon.valeur, bon.raison);
  assert.deepEqual(bon.valeur.plan.map((c) => c.numero), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(Object.keys(bon.valeur), ['resume', 'plan', 'approfondir']);
  assert.deepEqual(Object.keys(bon.valeur.plan[0]), ['numero', 'titre', 'resume']);
  refus(null, 'null');
  refus([], 'tableau');
  refus(modif((p) => { delete p.resume; }), 'sans résumé');
  refus(modif((p) => { p.resume = 'court'; }), 'résumé trop court');
  refus(modif((p) => { p.resume = 'x'.repeat(451); }), 'résumé trop long');
  refus(modif((p) => { p.plan.pop(); }), '7 chapitres');
  refus(modif((p) => { p.plan.push(structuredClone(p.plan[0])); }), '9 chapitres');
  refus(modif((p) => { p.plan = 'huit chapitres'; }), 'plan en chaîne');
  refus(modif((p) => { p.plan[2] = 'titre seul'; }), 'chapitre en chaîne');
  refus(modif((p) => { p.plan[1].titre = p.plan[0].titre; }), 'titres identiques');
  refus(modif((p) => { p.plan[1].titre = p.plan[0].titre.toUpperCase(); }), 'titres identiques à la casse près');
  refus(modif((p) => { p.plan[0].titre = 'ab'; }), 'titre trop court');
  refus(modif((p) => { p.plan[0].titre = 'x'.repeat(91); }), 'titre trop long');
  refus(modif((p) => { p.plan[0].resume = 'court'; }), 'résumé de chapitre trop court');
  refus(modif((p) => { delete p.plan[0].resume; }), 'résumé de chapitre absent');
  refus(modif((p) => { p.approfondir = p.approfondir.slice(0, 4); }), '4 pistes');
  refus(modif((p) => { p.approfondir = [...p.approfondir, 'Septième', 'Huitième', 'Neuvième']; }), '9 pistes');
  refus(modif((p) => { p.approfondir[1] = p.approfondir[0]; }), 'pistes identiques');
  refus(modif((p) => { p.approfondir[0] = '!!!'; }), 'piste sans lettre');
  refus(modif((p) => { p.approfondir[0] = 'x'.repeat(81); }), 'piste trop longue');
  refus(modif((p) => { p.approfondir[0] = 12; }), 'piste non texte');
  refus(modif((p) => { p.approfondir = 'a, b, c, d, e'; }), 'pistes en chaîne');
  assert.ok(validerPlan(modif((p) => { p.approfondir = p.approfondir.concat(['Septième piste', 'Huitième piste']); })).valeur, '8 pistes');
  assert.ok(validerPlan(modif((p) => { p.approfondir = p.approfondir.slice(0, 5); })).valeur, '5 pistes');
});

test('chiffres : 3 à 6, valeur numérique finie, même unité, sinon retiré', async () => {
  const c = (libelle, valeur, unite = 'm') => ({ libelle, valeur, unite });
  const trois = [c('A', 1), c('B', 2.5), c('C', 0)];
  assert.deepEqual(validerChiffres(trois), trois);
  assert.equal(validerChiffres([...trois, c('D', 4), c('E', 5), c('F', 6)]).length, 6);
  assert.deepEqual(validerChiffres([c('  A  ', -3, ' m ') , c('B', 1), c('C', 2)])[0], { libelle: 'A', valeur: -3, unite: 'm' });
  for (const [mauvais, motif] of [
    [trois.slice(0, 2), '2 chiffres'],
    [[...trois, c('D', 4), c('E', 5), c('F', 6), c('G', 7)], '7 chiffres'],
    [[c('A', 1), c('B', 2), c('C', 3, 'km')], 'unités différentes'],
    [[c('A', 1), c('B', '2'), c('C', 3)], 'valeur en texte'],
    [[c('A', 1), c('B', Infinity), c('C', 3)], 'valeur infinie'],
    [[c('A', 1), c('B', NaN), c('C', 3)], 'valeur NaN'],
    [[c('A', 1), c('B', null), c('C', 3)], 'valeur nulle'],
    [[c('A', 1), { libelle: 'B', unite: 'm' }, c('C', 3)], 'valeur absente'],
    [[c('A', 1), c('', 2), c('C', 3)], 'libellé vide'],
    [[c('A', 1), c('x'.repeat(41), 2), c('C', 3)], 'libellé trop long'],
    [[c('A', 1), c('B', 2, ''), c('C', 3)], 'unité vide'],
    [[c('A', 1), 'B', c('C', 3)], 'élément en texte'],
    [{ 0: c('A', 1) }, 'objet'],
    ['trois', 'texte'],
    [null, 'null'],
    [undefined, 'absent'],
  ]) assert.equal(validerChiffres(mauvais), null, motif);
});

test('notions : 4 à 7 nœuds, 3 à 8 liens entre nœuds, relation courte, sinon retiré', async () => {
  const bonne = () => ({
    noeuds: ['Sparte', 'Athènes', 'Thèbes', 'Corinthe'],
    liens: [['Sparte', 'Athènes', 'rivales'], ['Athènes', 'Thèbes', 'voisines'], ['Thèbes', 'Corinthe', 'alliées']],
  });
  assert.deepEqual(validerNotions(bonne()), bonne());
  const modif = (fn) => { const n = bonne(); fn(n); return n; };
  const cinq = modif((n) => { n.noeuds.push('Delphes'); n.liens.push(['Delphes', 'Sparte', 'consultée par']); });
  assert.ok(validerNotions(cinq));
  const huit = modif((n) => {
    n.noeuds.push('E', 'F', 'G');
    n.liens.push(['E', 'F', 'x'], ['F', 'G', 'y'], ['G', 'E', 'z'], ['E', 'Sparte', 'w'], ['F', 'Athènes', 'v']);
  });
  assert.equal(validerNotions(huit).liens.length, 8);
  for (const [mauvais, motif] of [
    [modif((n) => { n.noeuds.pop(); n.liens.pop(); n.liens.push(['Sparte', 'Thèbes', 'x']); }), '3 nœuds'],
    [modif((n) => { n.noeuds.push('E', 'F', 'G', 'H'); }), '8 nœuds'],
    [modif((n) => { n.liens.pop(); }), '2 liens'],
    [modif((n) => { for (let i = 0; i < 6; i++) n.liens.push(['Sparte', 'Athènes', 'r' + i]); }), '9 liens'],
    [modif((n) => { n.liens[0][1] = 'Argos'; }), 'extrémité inconnue'],
    [modif((n) => { n.liens[0][0] = 'sparte'; }), 'extrémité à la casse différente'],
    [modif((n) => { n.liens[0][1] = 'Sparte'; }), 'lien d’un nœud à lui-même'],
    [modif((n) => { n.liens[2] = ['Sparte', 'Athènes', 'encore']; }), 'nœud sans lien'],
    [modif((n) => { n.liens[0][2] = 'une relation bien trop longue'; }), 'relation de plus de 3 mots'],
    [modif((n) => { n.liens[0][2] = ''; }), 'relation vide'],
    [modif((n) => { n.liens[0] = ['Sparte', 'Athènes']; }), 'lien à deux éléments'],
    [modif((n) => { n.liens[0] = { de: 'Sparte', a: 'Athènes' }; }), 'lien en objet'],
    [modif((n) => { n.noeuds[1] = 'SPARTE'; }), 'nœuds en double'],
    [modif((n) => { n.noeuds[0] = 12; }), 'nœud non texte'],
    [modif((n) => { n.noeuds = 'Sparte, Athènes'; }), 'nœuds en chaîne'],
    [modif((n) => { delete n.liens; }), 'liens absents'],
    [[], 'tableau'],
    [null, 'null'],
    ['réseau', 'texte'],
  ]) assert.equal(validerNotions(mauvais), null, motif);
});

test('saviezVous : une phrase de 20 à 300 caractères, sinon retirée', async () => {
  assert.equal(validerSaviezVous('  Une anecdote   surprenante. '), 'Une anecdote surprenante.');
  for (const mauvais of ['court', 'x'.repeat(301), 12, null, undefined, ['Une anecdote assez longue.']]) {
    assert.equal(validerSaviezVous(mauvais), null);
  }
});

test('chapitre IA : socle strict, champs enrichis invalides retirés sans échec, jamais de citation, frise mélangée', async () => {
  const gros = chapitreValide();
  gros.citation = { texte: 'Inventée', auteur: 'Personne', oeuvre: 'Rien', source: ['Site · Citations', 'https://exemple.test'] };
  gros.surprise = 'x';
  const complet = validerChapitreIA(gros, 'Titre du plan');
  assert.ok(complet.valeur, complet.raison);
  assert.ok(!('citation' in complet.valeur) && !('surprise' in complet.valeur));
  assert.deepEqual(complet.valeur.chiffres, EXEMPLE_CHAPITRE.chiffres);
  assert.deepEqual(complet.valeur.notions, EXEMPLE_CHAPITRE.notions);

  const abime = chapitreValide();
  abime.chiffres[1].unite = 'km';
  abime.notions.liens[0][1] = 'Inconnu';
  abime.saviezVous = 'court';
  const sans = validerChapitreIA(abime, 'Titre du plan');
  assert.ok(sans.valeur, 'un champ enrichi invalide ne fait pas échouer le chapitre');
  assert.deepEqual(Object.keys(sans.valeur), ['essentiel', 'reperes', 'exercices']);

  const absents = chapitreValide();
  delete absents.chiffres; delete absents.notions; delete absents.saviezVous;
  assert.deepEqual(Object.keys(validerChapitreIA(absents, 'Titre du plan').valeur), ['essentiel', 'reperes', 'exercices']);

  const partiel = chapitreValide();
  partiel.notions = 'réseau';
  assert.deepEqual(Object.keys(validerChapitreIA(partiel, 'Titre du plan').valeur), ['essentiel', 'reperes', 'exercices', 'chiffres', 'saviezVous']);

  // Le socle reste strict.
  for (const casse of [
    (c) => { c.essentiel.pop(); },
    (c) => { c.exercices.pop(); },
    (c) => { c.exercices[2].ordre[0] = 'Autre'; },
    (c) => { c.reperes[0] = ['seul']; },
  ]) {
    const c = chapitreValide();
    casse(c);
    assert.ok(validerChapitreIA(c, 'Titre du plan').raison);
  }
  assert.ok(validerChapitreIA(null, 'Titre').raison);
  assert.ok(validerChapitreIA([], 'Titre').raison);

  // Les éléments de la frise arrivent dans l'ordre : le serveur les mélange.
  const ordonne = chapitreValide();
  ordonne.exercices[2].elements = [...ordonne.exercices[2].ordre];
  for (let i = 0; i < 20; i++) {
    const f = validerChapitreIA(ordonne, 'Titre du plan').valeur.exercices[2];
    assert.notDeepEqual(f.elements, f.ordre);
    assert.deepEqual([...f.elements].sort(), [...f.ordre].sort());
  }
});

// --- GET /api/sujets ---

test('sujets : racines par vues décroissantes, 60 au plus, enfants par parent, public', async () => {
  toutVoir();
  assert.deepEqual((await appel(sujetsGet)).corps, { sujets: [] });
  const lignesAttendues = [];
  for (let i = 0; i < 65; i++) {
    const id = 's' + String(i).padStart(2, '0');
    const cree = `2026-10-19T08:${String(i % 60).padStart(2, '0')}:00.000Z`;
    insererSujet(id, { titre: 'Sujet ' + i, vues: i % 7, cree, resume: 'Résumé ' + i + ' '.padEnd(40, 'x') });
    lignesAttendues.push({ id, vues: i % 7, cree });
  }
  insererSujet('s05.enfant', { titre: 'Enfant', parent: 's05', niveau: 2, vues: 99 });
  insererSujet('s05.autre', { titre: 'Autre enfant', parent: 's05', niveau: 2, vues: 100 });
  const r = await appel(sujetsGet);
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['sujets']);
  assert.equal(r.corps.sujets.length, 60);
  assert.deepEqual(Object.keys(r.corps.sujets[0]), ['id', 'titre', 'resume', 'niveau', 'vues']);
  const attendu = lignesAttendues.sort((a, b) => b.vues - a.vues || (a.cree < b.cree ? 1 : a.cree > b.cree ? -1 : 0) || (a.id < b.id ? -1 : 1)).slice(0, 60).map((x) => x.id);
  assert.deepEqual(r.corps.sujets.map((s) => s.id), attendu);
  assert.ok(r.corps.sujets.every((s) => !s.id.includes('.')), 'aucun enfant parmi les racines');
  assert.equal(r.corps.sujets.find((s) => s.id === 's06').resume.slice(0, 9), 'Résumé 6 ');
  assert.equal(r.corps.sujets[0].niveau, 1);
  const enfants = await appel(sujetsGet, { requete: '?parent=s05' });
  assert.deepEqual(enfants.corps.sujets.map((s) => [s.id, s.vues, s.niveau]), [['s05.autre', 100, 2], ['s05.enfant', 99, 2]]);
  assert.deepEqual((await appel(sujetsGet, { requete: '?parent=inconnu' })).corps, { sujets: [] });
  assert.equal((await appel(sujetsGet, { requete: '?parent=' })).corps.sujets.length, 60, 'parent vide = racines');
  assert.ok(!JSON.stringify(r.corps).includes('"auteur"'));
});

// --- GET|POST /api/sujet ---

test('sujet POST : 401 sans connexion, 400 sur titre ou parent invalide, 413 trop gros, rien consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  const ia = iaPlan();
  const e = { DB: db, AI: ia };
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', corps: { titre: 'Les phares' } }), 401);
  for (const titre of ['', 'a', '  b ', 'x'.repeat(81), 12, null, undefined, ['Les phares'], '\u0000\u0001\u0002']) {
    erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre } }), 400);
  }
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: '!!! ???' } }), 400, /sans lettre/);
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: '日本の城' } }), 400, /sans lettre/);
  for (const parent of ['Pas Valide', 'a..b', 'x'.repeat(161), 12, ['a'], { a: 1 }, true]) {
    erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'Les phares', parent } }), 400);
  }
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'Les phares', parent: 'parent-inconnu' } }), 400, /parent/);
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'ok', bourrage: 'x'.repeat(3000) } }), 413);
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, brut: '{pas du json' }), 400);
  assert.equal(ia.appels.length, 0);
  assert.equal(wiki.appels.length, 0);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'sujet%'").length, 0);
  assert.equal(lignes('SELECT * FROM sujets').length, 0);
});

test('sujet POST : un sujet trop profond est refusé (400), titre de 2 caractères accepté', async () => {
  toutVoir();
  const j = await creerJoueur();
  const long = 'a'.repeat(40) + '.' + 'b'.repeat(40) + '.' + 'c'.repeat(40) + '.' + 'd'.repeat(30); // 153 caractères
  insererSujet(long, { niveau: 3 });
  const ia = iaPlan();
  erreurFr(await appel(sujetPost, { env: { DB: db, AI: ia }, methode: 'POST', jeton: j.jeton, corps: { titre: 'Un titre', parent: long } }), 400, /trop profond/);
  assert.equal(ia.appels.length, 0);
  const court = await appel(sujetPost, { env: { DB: db, AI: iaPlan() }, methode: 'POST', jeton: j.jeton, corps: { titre: 'Go' } });
  ok200(court);
  assert.equal(court.corps.sujet.id, 'go');
});

test('sujet POST : création d’un sujet racine ancré sur Wikipédia (forme, appel IA, ligne en base, quotas)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const ia = iaPlan();
  const r = await appel(sujetPost, { env: { DB: db, AI: ia }, methode: 'POST', jeton: j.jeton, corps: { titre: '  La tour   Eiffel ' } });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['sujet']);
  const s = r.corps.sujet;
  assert.deepEqual(Object.keys(s), CLES_SUJET);
  assert.equal(s.id, 'la-tour-eiffel');
  assert.equal(s.titre, 'La tour Eiffel');
  assert.equal(s.parent, null);
  assert.equal(s.niveau, 1);
  assert.equal(s.resume, EXEMPLE_PLAN.resume);
  assert.equal(s.plan.length, 8);
  assert.deepEqual(s.plan.map((c) => c.numero), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(s.plan[0], { numero: 1, ...EXEMPLE_PLAN.plan[0] });
  assert.deepEqual(s.approfondir, EXEMPLE_PLAN.approfondir);
  assert.equal(s.ancrage, 'wikipedia');
  assert.deepEqual(s.sources, [['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel']]);
  assert.deepEqual(Object.keys(s.image), ['src', 'alt', 'credit', 'page']);
  assert.equal(s.image.page, 'https://fr.wikipedia.org/wiki/Fichier:Tour_Eiffel_Wikimedia_Commons.jpg');
  assert.equal(s.brouillon, true);
  assert.ok(!('pageWiki' in s) && !('auteur' in s));
  // Un appel d'IA : premier modèle, 1 200 jetons, prompt du plan, titre et texte de Wikipédia fournis.
  assert.equal(ia.appels.length, 1);
  assert.equal(ia.appels[0].modele, MODELES[0]);
  assert.equal(ia.appels[0].entree.max_tokens, 1200);
  assert.equal(ia.appels[0].entree.messages[0].role, 'system');
  assert.equal(ia.appels[0].entree.messages[0].content, PROMPT_PLAN);
  const demande = ia.appels[0].entree.messages[1].content;
  assert.match(demande, /« La tour Eiffel »/);
  assert.match(demande, /Niveau : 1 \(découverte\)/);
  assert.match(demande, /page « Tour Eiffel »/);
  assert.ok(demande.includes('La tour Eiffel est décrit ici pour les tests.'));
  assert.ok(!demande.includes('NE PAS LIRE'));
  assert.ok(!demande.includes('Ce sujet précise'));
  // Ligne en base.
  const [ligne] = lignes('SELECT id, titre, parent, niveau, auteur, vues, cree FROM sujets');
  assert.deepEqual({ ...ligne, cree: typeof ligne.cree }, { id: 'la-tour-eiffel', titre: 'La tour Eiffel', parent: null, niveau: 1, auteur: j.id, vues: 0, cree: 'string' });
  assert.deepEqual(lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'sujet%' ORDER BY cle"), [
    { cle: 'sujet:joueur:' + j.id, n: 1 },
    { cle: 'sujet:total', n: 1 },
  ]);
});

test('sujet POST : un sujet déjà en cache ne génère rien et ne consomme aucun quota (même sans IA, même pour un autre lecteur)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const premier = await creerSujet(j);
  const appelsWiki = wiki.appels.length;
  const quotasAvant = lignes('SELECT cle, n FROM quotas ORDER BY cle');
  const ia = iaPlan();
  for (const [lecteur, titre, e] of [
    [j, 'La tour Eiffel', { DB: db, AI: ia }],
    [autre, '  LA  TOUR   EIFFEL  ', { DB: db, AI: ia }],
    [autre, 'La tour Éiffel !', { DB: db, AI: ia }],
    [autre, 'La tour Eiffel', { DB: db, AI: undefined }],
  ]) {
    const r = await appel(sujetPost, { env: e, methode: 'POST', jeton: lecteur.jeton, corps: { titre } });
    ok200(r);
    assert.deepEqual(r.corps.sujet, premier);
  }
  assert.equal(ia.appels.length, 0);
  assert.equal(wiki.appels.length, appelsWiki);
  assert.deepEqual(lignes('SELECT cle, n FROM quotas ORDER BY cle'), quotasAvant);
  assert.equal(lignes('SELECT * FROM sujets').length, 1);
  assert.equal(lignes('SELECT vues FROM sujets')[0].vues, 0, 'créer ou retrouver ne compte pas de vue');
});

test('sujet POST : sous-sujet (id parent.slug, niveau +1 plafonné à 3, contexte du parent) et parent obligatoirement existant', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  reinitWiki();
  const ia = iaPlan();
  const fils = await creerSujet(j, 'Gustave Eiffel', { parent: 'la-tour-eiffel', ia });
  assert.equal(fils.id, 'la-tour-eiffel.gustave-eiffel');
  assert.equal(fils.parent, 'la-tour-eiffel');
  assert.equal(fils.niveau, 2);
  assert.deepEqual(fils.sources, [['Wikipédia · Gustave Eiffel', 'https://fr.wikipedia.org/wiki/Gustave_Eiffel']]);
  assert.match(ia.appels[0].entree.messages[1].content, /Ce sujet précise : « La tour Eiffel »/);
  assert.match(ia.appels[0].entree.messages[1].content, /Niveau : 2 \(approfondissement\)/);
  assert.equal(wiki.appels[0].url.searchParams.get('srsearch'), 'Gustave Eiffel La tour Eiffel', 'le parent précise la recherche');
  const petit = await creerSujet(j, 'Les ateliers', { parent: fils.id });
  assert.equal(petit.id, 'la-tour-eiffel.gustave-eiffel.les-ateliers');
  assert.equal(petit.niveau, 3);
  const arriere = await creerSujet(j, 'Les rivets', { parent: petit.id });
  assert.equal(arriere.niveau, 3, 'plafonné à 3');
  assert.equal(arriere.id, 'la-tour-eiffel.gustave-eiffel.les-ateliers.les-rivets');
  // Même titre sous deux parents : deux sujets distincts.
  const ailleurs = await creerSujet(j, 'Gustave Eiffel');
  assert.equal(ailleurs.id, 'gustave-eiffel');
  assert.equal(ailleurs.niveau, 1);
  // Les enfants sont listés sous leur parent.
  const liste = await appel(sujetsGet, { requete: '?parent=la-tour-eiffel' });
  assert.deepEqual(liste.corps.sujets.map((s) => s.id), ['la-tour-eiffel.gustave-eiffel']);
});

test('sujet POST : sans Wikipédia, ancrage « aucun » (pas d’image ni de source), et l’IA est prévenue', async () => {
  toutVoir();
  const j = await creerJoueur();
  for (const panne of [500, 'reseau']) {
    viderBibliotheque();
    wiki.panne = panne;
    const ia = iaPlan();
    const s = await creerSujet(j, 'La tour Eiffel', { ia });
    assert.equal(s.ancrage, 'aucun');
    assert.equal(s.image, null);
    assert.deepEqual(s.sources, []);
    assert.equal(s.brouillon, true);
    assert.equal(ia.appels.length, 1);
    assert.match(ia.appels[0].entree.messages[1].content, /Aucun texte de référence/);
  }
  // Page trouvée mais sans image : ancrage conservé, image null.
  viderBibliotheque();
  const sans = await creerSujet(j, 'Maurice Koechlin');
  assert.equal(sans.ancrage, 'wikipedia');
  assert.equal(sans.image, null);
});

test('sujet POST : réponse invalide puis valide (repli sur le second modèle), ou deux invalides (502, rien en cache)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const trop = planValide();
  trop.plan.pop();
  const ia = fauxAI([enReponse(trop), enReponse(planValide())]);
  const s = await creerSujet(j, 'La tour Eiffel', { ia });
  assert.equal(s.plan.length, 8);
  assert.deepEqual(ia.appels.map((a) => a.modele), MODELES);
  assert.deepEqual(ia.appels.map((a) => a.entree.max_tokens), [1200, 1200]);
  // Texte sans JSON puis erreur du modèle.
  viderBibliotheque();
  const iaB = fauxAI([{ response: 'Désolé, je ne peux pas.' }, new Error('panne')]);
  erreurFr(await appel(sujetPost, { env: { DB: db, AI: iaB }, methode: 'POST', jeton: j.jeton, corps: { titre: 'Les phares' } }), 502);
  assert.equal(iaB.appels.length, 2);
  assert.equal(lignes('SELECT * FROM sujets').length, 0);
  const iaC = fauxAI([new Error('panne'), enReponse(planValide())]);
  ok200(await appel(sujetPost, { env: { DB: db, AI: iaC }, methode: 'POST', jeton: j.jeton, corps: { titre: 'Les phares' } }));
});

test('sujet POST : 503 sans IA pour un sujet absent du cache (aucun quota consommé)', async () => {
  toutVoir();
  const j = await creerJoueur();
  erreurFr(await appel(sujetPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: j.jeton, corps: { titre: 'Les phares' } }), 503);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'sujet%'").length, 0);
  assert.equal(wiki.appels.length, 0);
});

test('sujet POST : 10 par jour et par lecteur, 80 par jour au total (le cache n’en consomme pas)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const ia = iaPlan();
  const e = { DB: db, AI: ia };
  for (let i = 0; i < 10; i++) {
    ok200(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'Sujet ' + i } }));
  }
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'Sujet onze' } }), 429);
  assert.equal(ia.appels.length, 10);
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'sujet:total'")[0].n, 10, 'le refus d’un lecteur n’entame pas le total');
  // Quota épuisé : un sujet déjà en cache reste servi.
  const r = await appel(sujetPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'Sujet 3' } });
  ok200(r);
  assert.equal(r.corps.sujet.id, 'sujet-3');
  assert.equal(ia.appels.length, 10);
  ok200(await appel(sujetPost, { env: e, methode: 'POST', jeton: autre.jeton, corps: { titre: 'Sujet autre' } }));
  // Plafond global.
  db.base.prepare("UPDATE quotas SET n = 79 WHERE cle = 'sujet:total'").run();
  const dernier = await creerJoueur('Dernier');
  ok200(await appel(sujetPost, { env: e, methode: 'POST', jeton: dernier.jeton, corps: { titre: 'Sujet dernier' } }));
  const sans = await creerJoueur('Sans');
  erreurFr(await appel(sujetPost, { env: e, methode: 'POST', jeton: sans.jeton, corps: { titre: 'Sujet sans place' } }), 429);
  ok200(await appel(sujetPost, { env: e, methode: 'POST', jeton: sans.jeton, corps: { titre: 'Sujet dernier' } }));
});

test('sujet POST : deux lecteurs sur le même sujet en même temps, le premier enregistré gagne', async () => {
  toutVoir();
  const j = await creerJoueur();
  const ia = {
    async run() {
      insererSujet('la-tour-eiffel', { titre: 'La tour Eiffel', resume: 'Résumé du lecteur arrivé le premier. '.padEnd(50, 'x') });
      return enReponse(planValide());
    },
  };
  const r = await appel(sujetPost, { env: { DB: db, AI: ia }, methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.match(r.corps.sujet.resume, /^Résumé du lecteur arrivé le premier/);
  assert.equal(lignes('SELECT * FROM sujets').length, 1);
});

test('sujet GET : forme complète, une vue de plus à chaque lecture, 400 sans id, 404 inconnu, public', async () => {
  toutVoir();
  const j = await creerJoueur();
  const cree = await creerSujet(j);
  erreurFr(await appel(sujetGet), 400);
  erreurFr(await appel(sujetGet, { requete: '?id=' }), 400);
  erreurFr(await appel(sujetGet, { requete: '?id=inconnu' }), 404);
  for (let i = 1; i <= 3; i++) {
    const r = await appel(sujetGet, { requete: '?id=la-tour-eiffel' });
    ok200(r);
    assert.deepEqual(Object.keys(r.corps), ['sujet']);
    assert.deepEqual(Object.keys(r.corps.sujet), CLES_SUJET);
    assert.deepEqual(r.corps.sujet, cree);
    assert.equal(lignes('SELECT vues FROM sujets')[0].vues, i);
  }
  const liste = await appel(sujetsGet);
  assert.deepEqual(liste.corps.sujets, [{ id: 'la-tour-eiffel', titre: 'La tour Eiffel', resume: EXEMPLE_PLAN.resume, niveau: 1, vues: 3 }]);
  // Sous-sujet : parent renvoyé.
  const fils = await creerSujet(j, 'Gustave Eiffel', { parent: 'la-tour-eiffel' });
  const r = await appel(sujetGet, { requete: '?id=' + fils.id });
  assert.equal(r.corps.sujet.parent, 'la-tour-eiffel');
});

// --- GET /api/chapitre-ia ---

test('chapitre-ia : paramètres invalides 400, sujet ou numéro inconnu 404 (même sans connexion)', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  const ia = iaChapitre();
  const e = { DB: db, AI: ia };
  for (const requete of ['', '?sujet=la-tour-eiffel', '?n=1', '?sujet=la-tour-eiffel&n=abc', '?sujet=la-tour-eiffel&n=1.5',
    '?sujet=la-tour-eiffel&n=-1', '?sujet=la-tour-eiffel&n=', '?id=pas-un-id', '?id=ia:la-tour-eiffel', '?id=ia::1', '?id=ia:la-tour-eiffel:x']) {
    erreurFr(await appel(chapitreIaGet, { env: e, jeton: j.jeton, requete }), 400);
  }
  erreurFr(await appel(chapitreIaGet, { env: e, requete: '?sujet=inconnu&n=1' }), 404, /Sujet/);
  erreurFr(await appel(chapitreIaGet, { env: e, jeton: j.jeton, requete: '?id=ia:inconnu:1' }), 404, /Sujet/);
  for (const n of [0, 9, 99]) erreurFr(await appel(chapitreIaGet, { env: e, requete: `?sujet=la-tour-eiffel&n=${n}` }), 404, /Chapitre/);
  assert.equal(ia.appels.length, 0);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'chapitre%'").length, 0);
});

test('chapitre-ia : pas encore en cache, 401 sans connexion et 503 sans IA, sans quota consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  const ia = iaChapitre();
  erreurFr(await appel(chapitreIaGet, { env: { DB: db, AI: ia }, requete: '?sujet=la-tour-eiffel&n=1' }), 401);
  erreurFr(await appel(chapitreIaGet, { env: { DB: db, AI: ia }, jeton: 'abcdefghij12.' + 'a'.repeat(32), requete: '?sujet=la-tour-eiffel&n=1' }), 401);
  erreurFr(await appel(chapitreIaGet, { env: { DB: db, AI: undefined }, jeton: j.jeton, requete: '?sujet=la-tour-eiffel&n=1' }), 503);
  assert.equal(ia.appels.length, 0);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'chapitre%'").length, 0);
  assert.equal(lignes('SELECT * FROM chapitres_ia').length, 0);
});

test('chapitre-ia : génération ancrée (forme du chapitre, appel IA, mise en cache, quotas)', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  reinitWiki();
  const ia = iaChapitre();
  const r = await lireChapitre(j, 'la-tour-eiffel', 2, ia);
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['chapitre']);
  const c = r.corps.chapitre;
  assert.deepEqual(Object.keys(c), ['id', 'domaine', 'sujetId', 'sujetTitre', 'numero', 'titre', 'brouillon', 'ancrage', 'sources', 'figure',
    'essentiel', 'reperes', 'exercices', 'chiffres', 'notions', 'saviezVous']);
  assert.equal(c.id, 'ia:la-tour-eiffel:2');
  assert.equal(c.domaine, 'libre');
  assert.equal(c.sujetId, 'la-tour-eiffel');
  assert.equal(c.sujetTitre, 'La tour Eiffel');
  assert.equal(c.numero, 2);
  assert.equal(c.titre, EXEMPLE_PLAN.plan[1].titre, 'le titre vient du plan, pas de l’IA');
  assert.equal(c.brouillon, true);
  assert.equal(c.ancrage, 'wikipedia');
  assert.deepEqual(c.sources, [['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel']]);
  assert.deepEqual(Object.keys(c.figure), ['src', 'alt', 'credit', 'page']);
  assert.equal(c.figure.credit, CREDIT_IMAGE);
  assert.ok(!('citation' in c));
  assert.equal(c.essentiel.length, 4);
  assert.equal(c.reperes.length, 4);
  assert.deepEqual(c.exercices.map((e) => e.type), ['qcm', 'bluff', 'frise']);
  assert.deepEqual(c.exercices.map((e) => e.lib), ['Exercice 1 · question à choix', 'Exercice 2 · le Rival bluffe-t-il ?', 'Exercice 3 · frise']);
  for (const e of c.exercices) assert.deepEqual(e.sources, c.sources, 'sources recopiées dans chaque exercice');
  assert.deepEqual(c.chiffres, EXEMPLE_CHAPITRE.chiffres);
  assert.deepEqual(c.notions, EXEMPLE_CHAPITRE.notions);
  assert.equal(c.saviezVous, EXEMPLE_CHAPITRE.saviezVous);
  // Appel d'IA.
  assert.equal(ia.appels.length, 1);
  assert.equal(ia.appels[0].modele, MODELES[0]);
  assert.equal(ia.appels[0].entree.max_tokens, 3000);
  assert.equal(ia.appels[0].entree.messages[0].content, PROMPT_CHAPITRE);
  const demande = ia.appels[0].entree.messages[1].content;
  assert.match(demande, /« La tour Eiffel »/);
  assert.match(demande, /n° 2, « Le projet et le concours »/);
  for (const t of EXEMPLE_PLAN.plan) assert.ok(demande.includes(t.titre), 'le plan entier est fourni : ' + t.titre);
  assert.match(demande, /Texte de référence 1 · Wikipédia, page « Tour Eiffel »/);
  assert.ok(demande.includes('La tour Eiffel est décrit ici pour les tests.'));
  assert.ok(!demande.includes('NE PAS LIRE'));
  // En cache et quotas.
  const [ligne] = lignes('SELECT id, sujet, numero, vues FROM chapitres_ia');
  assert.deepEqual(ligne, { id: 'ia:la-tour-eiffel:2', sujet: 'la-tour-eiffel', numero: 2, vues: 0 });
  assert.deepEqual(JSON.parse(lignes('SELECT contenu FROM chapitres_ia')[0].contenu), c);
  assert.deepEqual(lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'chapitre%' ORDER BY cle"), [
    { cle: 'chapitre:joueur:' + j.id, n: 1 },
    { cle: 'chapitre:total', n: 1 },
  ]);
});

test('chapitre-ia : en cache, servi à tous (avec ?sujet&n ou ?id), sans IA ni Wikipédia ni quota, une vue de plus', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  const premier = (await lireChapitre(j, 'la-tour-eiffel', 3)).corps.chapitre;
  const appelsWiki = wiki.appels.length;
  const quotasAvant = lignes('SELECT cle, n FROM quotas ORDER BY cle');
  const ia = iaChapitre();
  const autre = await creerJoueur('Autre');
  const quotasAvantAutre = lignes('SELECT cle, n FROM quotas ORDER BY cle');
  for (const [e, jeton, requete] of [
    [{ DB: db, AI: ia }, undefined, '?sujet=la-tour-eiffel&n=3'],
    [{ DB: db, AI: ia }, autre.jeton, '?id=ia:la-tour-eiffel:3'],
    [{ DB: db, AI: undefined }, undefined, '?id=ia:la-tour-eiffel:3'],
    [{ DB: db, AI: undefined }, undefined, '?sujet=la-tour-eiffel&n=03'],
  ]) {
    const r = await appel(chapitreIaGet, { env: e, jeton, requete });
    ok200(r);
    assert.deepEqual(r.corps.chapitre, premier);
  }
  assert.equal(ia.appels.length, 0);
  assert.equal(wiki.appels.length, appelsWiki);
  assert.equal(lignes('SELECT vues FROM chapitres_ia')[0].vues, 4);
  assert.equal(lignes('SELECT * FROM chapitres_ia').length, 1);
  assert.notDeepEqual(quotasAvant, []);
  assert.deepEqual(lignes('SELECT cle, n FROM quotas ORDER BY cle'), quotasAvantAutre, 'aucun quota consommé par la lecture du cache');
});

test('chapitre-ia : une page propre au chapitre s’ajoute à celle du sujet (deux sources, texte et figure de la première)', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  reinitWiki();
  wiki.recherche = (q) => (q.includes('Koechlin') ? ['Maurice Koechlin', 'Tour Eiffel'] : ['Tour Eiffel']);
  const ia = iaChapitre();
  const r = await lireChapitre(j, 'la-tour-eiffel', 3, ia);
  ok200(r);
  const c = r.corps.chapitre;
  assert.deepEqual(c.sources.map((s) => s[0]), ['Wikipédia · Maurice Koechlin', 'Wikipédia · Tour Eiffel']);
  assert.equal(c.ancrage, 'wikipedia');
  assert.match(c.figure.src, /Tour_Eiffel_Wikimedia_Commons/, 'la première page avec image fournit la figure');
  for (const e of c.exercices) assert.deepEqual(e.sources, c.sources);
  const demande = ia.appels[0].entree.messages[1].content;
  assert.match(demande, /Texte de référence 1 · Wikipédia, page « Maurice Koechlin »/);
  assert.match(demande, /Texte de référence 2 · Wikipédia, page « Tour Eiffel »/);
  assert.ok(demande.indexOf('Maurice Koechlin est décrit') < demande.indexOf('La tour Eiffel est décrit'));
  assert.equal(wiki.appels.length, 3, 'recherche + page du chapitre + page du sujet');
  // Une recherche qui retombe sur la page du sujet ne la double pas.
  viderBibliotheque();
  await creerSujet(j);
  reinitWiki();
  const un = await lireChapitre(j, 'la-tour-eiffel', 1);
  assert.equal(un.corps.chapitre.sources.length, 1);
});

test('chapitre-ia : sans Wikipédia, ancrage « aucun », sans source ni figure, chapitre quand même écrit', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  wiki.panne = 500;
  const ia = iaChapitre();
  const r = await lireChapitre(j, 'la-tour-eiffel', 4, ia);
  ok200(r);
  const c = r.corps.chapitre;
  assert.equal(c.ancrage, 'aucun');
  assert.deepEqual(c.sources, []);
  assert.equal(c.figure, null);
  assert.equal(c.brouillon, true);
  for (const e of c.exercices) assert.deepEqual(e.sources, []);
  assert.match(ia.appels[0].entree.messages[1].content, /Aucun texte de référence/);
  assert.ok(!ia.appels[0].entree.messages[1].content.includes('=== Texte de référence'));
});

test('chapitre-ia : champs enrichis invalides retirés (le chapitre est servi), citation jamais gardée, frise remélangée', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  const brut = chapitreValide();
  brut.chiffres = [{ libelle: 'A', valeur: '12', unite: 'm' }, { libelle: 'B', valeur: 2, unite: 'm' }, { libelle: 'C', valeur: 3, unite: 'm' }];
  brut.notions = { noeuds: ['A', 'B', 'C'], liens: [['A', 'B', 'x']] };
  brut.saviezVous = 'Trop court';
  brut.citation = { texte: 'Inventée', auteur: 'Personne', oeuvre: 'Rien', source: ['Site', 'https://exemple.test'] };
  brut.exercices[2].elements = [...brut.exercices[2].ordre];
  const r = await lireChapitre(j, 'la-tour-eiffel', 5, fauxAI([enReponse(brut)]));
  ok200(r);
  const c = r.corps.chapitre;
  for (const cle of ['chiffres', 'notions', 'saviezVous', 'citation']) assert.ok(!(cle in c), cle);
  assert.notDeepEqual(c.exercices[2].elements, c.exercices[2].ordre);
  assert.deepEqual([...c.exercices[2].elements].sort(), [...c.exercices[2].ordre].sort());
  assert.equal(c.exercices.length, 3);
  assert.equal(lignes('SELECT * FROM chapitres_ia').length, 1);
});

test('chapitre-ia : socle invalide puis valide (repli, 3 000 jetons), deux invalides ou pannes (502, rien en cache)', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  const abime = chapitreValide();
  abime.exercices[2].ordre[0] = 'Un autre événement';
  const ia = fauxAI([enReponse(abime), enReponse(chapitreValide())]);
  const r = await lireChapitre(j, 'la-tour-eiffel', 6, ia);
  ok200(r);
  assert.deepEqual(ia.appels.map((a) => a.modele), MODELES);
  assert.deepEqual(ia.appels.map((a) => a.entree.max_tokens), [3000, 3000]);
  const iaB = fauxAI([enReponse(abime), { response: '{"essentiel": [' }]);
  erreurFr(await lireChapitre(j, 'la-tour-eiffel', 7, iaB), 502);
  assert.equal(iaB.appels.length, 2);
  const iaC = fauxAI([new Error('panne'), new Error('panne')]);
  erreurFr(await lireChapitre(j, 'la-tour-eiffel', 8, iaC), 502);
  assert.deepEqual(lignes('SELECT numero FROM chapitres_ia').map((x) => x.numero), [6]);
});

test('chapitre-ia : 15 par jour par lecteur, 100 par jour au total (le cache n’en consomme pas)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  insererSujet('s1');
  insererSujet('s2');
  const ia = iaChapitre();
  let generes = 0;
  for (const sujet of ['s1', 's2']) {
    for (let n = 1; n <= 8 && generes < 15; n++) {
      ok200(await lireChapitre(j, sujet, n, ia));
      generes += 1;
    }
  }
  assert.equal(generes, 15);
  assert.equal(ia.appels.length, 15);
  erreurFr(await lireChapitre(j, 's2', 8, ia), 429);
  assert.equal(ia.appels.length, 15);
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'chapitre:total'")[0].n, 15, 'le refus d’un lecteur n’entame pas le total');
  // Quota épuisé : le cache reste lisible, sans connexion.
  ok200(await lireChapitre(null, 's1', 1, ia));
  ok200(await lireChapitre(j, 's1', 2, ia));
  assert.equal(ia.appels.length, 15);
  ok200(await lireChapitre(autre, 's2', 8, ia));
  // Plafond global.
  db.base.prepare("UPDATE quotas SET n = 99 WHERE cle = 'chapitre:total'").run();
  const dernier = await creerJoueur('Dernier');
  insererSujet('s3');
  ok200(await lireChapitre(dernier, 's3', 1, ia));
  const sans = await creerJoueur('Sans');
  erreurFr(await lireChapitre(sans, 's3', 2, ia), 429);
  ok200(await lireChapitre(sans, 's3', 1, ia));
});

test('chapitre-ia : deux lecteurs sur le même chapitre en même temps, le premier enregistré gagne', async () => {
  toutVoir();
  const j = await creerJoueur();
  await creerSujet(j);
  const ia = {
    async run() {
      insererChapitre('la-tour-eiffel', 2, 'Titre du lecteur arrivé le premier');
      return enReponse(chapitreValide());
    },
  };
  const r = await lireChapitre(j, 'la-tour-eiffel', 2, ia);
  ok200(r);
  assert.equal(r.corps.chapitre.titre, 'Titre du lecteur arrivé le premier');
  assert.equal(lignes('SELECT * FROM chapitres_ia').length, 1);
});

// --- GET /api/melange ---

test('melange : cache vide, paramètres invalides 400, public sans quota', async () => {
  toutVoir();
  assert.deepEqual((await appel(melangeGet)).corps, { questions: [] });
  for (const requete of ['?n=0', '?n=21', '?n=abc', '?n=1.5', '?n=-3', '?n=', '?n=100', '?graine=abc', '?graine=1.5', '?graine=', '?graine=99999999999999999999']) {
    erreurFr(await appel(melangeGet, { requete }), 400);
  }
  assert.equal(lignes('SELECT * FROM quotas').length, 0);
});

test('melange : tirage déterministe selon la graine, forme des questions, n de 1 à 20', async () => {
  toutVoir();
  const chapitres = [];
  for (let s = 1; s <= 3; s++) for (let n = 1; n <= 4; n++) chapitres.push(insererChapitre('s' + s, n, `Titre ${s}.${n}`));
  const parId = new Map(chapitres.map((c) => [c.id, c]));
  const a = await appel(melangeGet, { requete: '?n=10&graine=42' });
  ok200(a);
  assert.deepEqual(Object.keys(a.corps), ['questions']);
  assert.equal(a.corps.questions.length, 10);
  assert.deepEqual(Object.keys(a.corps.questions[0]), ['chapitre', 'titre', 'sujetTitre', 'index', 'exercice']);
  for (const q of a.corps.questions) {
    const c = parId.get(q.chapitre);
    assert.ok(c, q.chapitre);
    assert.equal(q.titre, c.titre);
    assert.equal(q.sujetTitre, c.sujetTitre);
    assert.ok([0, 1, 2].includes(q.index));
    assert.deepEqual(q.exercice, c.exercices[q.index]);
  }
  assert.equal(new Set(a.corps.questions.map((q) => q.chapitre + '#' + q.index)).size, 10, 'sans remise');
  // Même graine, même tirage ; autre graine, autre tirage.
  const b = await appel(melangeGet, { requete: '?graine=42&n=10' });
  assert.deepEqual(b.corps, a.corps);
  const ids = (r) => r.corps.questions.map((q) => q.chapitre + '#' + q.index);
  const c1 = await appel(melangeGet, { requete: '?n=10&graine=43' });
  assert.notDeepEqual(ids(c1), ids(a));
  assert.notDeepEqual(ids(await appel(melangeGet, { requete: '?n=10&graine=-7' })), ids(a));
  // n par défaut 10, n=1, n=20 (36 questions disponibles), graine par défaut.
  assert.equal((await appel(melangeGet)).corps.questions.length, 10);
  assert.deepEqual((await appel(melangeGet)).corps, (await appel(melangeGet, { requete: '?graine=0' })).corps);
  assert.equal((await appel(melangeGet, { requete: '?n=1&graine=5' })).corps.questions.length, 1);
  assert.equal((await appel(melangeGet, { requete: '?n=20&graine=5' })).corps.questions.length, 20);
  assert.equal((await appel(melangeGet, { requete: '?n=20&graine=123456789012345' })).statut, 200);
  // Le tirage de n=5 n'est pas une troncature arbitraire : mêmes graines, mêmes préfixes.
  const cinq = await appel(melangeGet, { requete: '?n=5&graine=42' });
  assert.deepEqual(ids(cinq), ids(a).slice(0, 5));
  // Moins de questions que demandé : on en rend autant qu'il y en a.
  toutVider();
  insererChapitre('seul', 1);
  assert.equal((await appel(melangeGet, { requete: '?n=20&graine=1' })).corps.questions.length, 3);
});

test('melange : générateur et tirage purs', async () => {
  const g1 = generateur(7);
  const g2 = generateur(7);
  const suite = Array.from({ length: 5 }, () => g1());
  assert.deepEqual(suite, Array.from({ length: 5 }, () => g2()));
  assert.ok(suite.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(suite, Array.from({ length: 5 }, generateur(8)));
  assert.deepEqual(Array.from({ length: 3 }, generateur(-1)), Array.from({ length: 3 }, generateur(4294967295)));
  assert.equal(tirer(['a', 'b'], 20, 1).length, 6);
  assert.deepEqual(tirer([], 5, 1), []);
  assert.deepEqual(tirer(['a', 'b', 'c'], 4, 9), tirer(['a', 'b', 'c'], 4, 9));
  assert.ok(tirer(['a', 'b'], 6, 3).every((q) => ['a', 'b'].includes(q.chapitre) && q.index >= 0 && q.index <= 2));
});

// --- Duels ---

function questionsDuel() {
  return [
    { chapitre: 'ia:s1:1', index: 0 }, { chapitre: 'ia:s1:1', index: 1 }, { chapitre: 'ia:s1:2', index: 0 },
    { chapitre: 'ia:s1:2', index: 2 }, { chapitre: 'ia:s1:3', index: 1 },
  ];
}
function preparerDuels() {
  toutVoir();
  for (let n = 1; n <= 3; n++) insererChapitre('s1', n, 'Titre ' + n);
}
const creerDuel = async (joueur, corps = { questions: questionsDuel(), score: { justes: 3, n: 5, points: 80 } }) =>
  appel(duelPost, { methode: 'POST', jeton: joueur.jeton, corps });

test('duel POST : 401, 400 sur questions ou score invalides, 413, rien enregistré', async () => {
  preparerDuels();
  const j = await creerJoueur();
  const score = { justes: 3, n: 5, points: 80 };
  erreurFr(await appel(duelPost, { methode: 'POST', corps: { questions: questionsDuel(), score } }), 401);
  const q = questionsDuel;
  for (const [corps, motif] of [
    [{ score }, 'questions absentes'],
    [{ questions: q().slice(0, 4), score: { ...score, n: 4 } }, '4 questions'],
    [{ questions: [...q(), ...q(), ...q(), ...q(), { chapitre: 'ia:s1:3', index: 0 }], score: { ...score, n: 21 } }, '21 questions'],
    [{ questions: 'cinq', score }, 'questions en chaîne'],
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, index: 3 } : x)), score }, 'index 3'],
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, index: -1 } : x)), score }, 'index négatif'],
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, index: 0.5 } : x)), score }, 'index décimal'],
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, index: '0' } : x)), score }, 'index en texte'],
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, chapitre: 'hg-1' } : x)), score }, 'chapitre statique mal formé'],
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, chapitre: 12 } : x)), score }, 'chapitre non texte'],
    [{ questions: q().map((x, i) => (i === 0 ? 'ia:s1:1' : x)), score }, 'question en texte'],
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, chapitre: 'ia:s1:9' } : x)), score }, 'chapitre inconnu'],
    [{ questions: q() }, 'score absent'],
    [{ questions: q(), score: 3 }, 'score en nombre'],
    [{ questions: q(), score: { ...score, n: 4 } }, 'n différent du nombre de questions'],
    [{ questions: q(), score: { ...score, justes: 6 } }, 'justes > n'],
    [{ questions: q(), score: { ...score, justes: -1 } }, 'justes négatif'],
    [{ questions: q(), score: { ...score, justes: 1.5 } }, 'justes décimal'],
    [{ questions: q(), score: { ...score, justes: '3' } }, 'justes en texte'],
    [{ questions: q(), score: { ...score, points: -1001 } }, 'points négatifs'],
    [{ questions: q(), score: { ...score, points: 10001 } }, 'points hors plafond'],
    [{ questions: q(), score: { ...score, points: NaN } }, 'points NaN'],
    [{ questions: q(), score: { justes: 3, n: 5 } }, 'points absents'],
  ]) {
    const r = await creerDuel(j, corps);
    assert.equal(r.statut, 400, motif + ' ' + JSON.stringify(r.corps));
    assert.equal(typeof r.corps.erreur, 'string');
  }
  erreurFr(await creerDuel(j, { questions: q(), score, bourrage: 'x'.repeat(5000) }), 413);
  erreurFr(await appel(duelPost, { methode: 'POST', jeton: j.jeton, brut: '[1]' }), 400);
  assert.equal(lignes('SELECT * FROM duels').length, 0);
});

test('duel POST : crée un duel (id de 8 caractères), GET le rend jouable sans exposer d’identifiant', async () => {
  preparerDuels();
  const a = await creerJoueur('Alice');
  const r = await creerDuel(a);
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['id']);
  assert.match(r.corps.id, /^[a-z0-9]{8}$/);
  const [ligne] = lignes('SELECT id, createur, questions, scores FROM duels');
  assert.equal(ligne.id, r.corps.id);
  assert.equal(ligne.createur, a.id);
  assert.deepEqual(JSON.parse(ligne.questions), questionsDuel());
  assert.deepEqual(JSON.parse(ligne.scores).map((s) => [s.joueur, s.pseudo, s.justes, s.n, s.points]), [[a.id, 'Alice', 3, 5, 80]]);
  // Lecture publique.
  const g = await appel(duelGet, { requete: '?id=' + r.corps.id });
  ok200(g);
  assert.deepEqual(Object.keys(g.corps), ['duel']);
  const d = g.corps.duel;
  assert.deepEqual(Object.keys(d), ['id', 'createur', 'questions', 'scores', 'dejaJoue', 'titre', 'type', 'fin', 'termine', 'joueurs', 'classement']);
  assert.deepEqual([d.titre, d.type, d.fin, d.termine, d.joueurs], [null, 'duel', null, false, 1], 'un duel ordinaire reste un duel');
  assert.equal(d.id, r.corps.id);
  assert.equal(d.createur, 'Alice');
  assert.equal(d.questions.length, 5);
  assert.deepEqual(d.questions.map((x) => [x.chapitre, x.index]), questionsDuel().map((x) => [x.chapitre, x.index]));
  assert.deepEqual(d.questions, questionsDuel(), 'références {chapitre, index}, résolues par l’app');
  assert.deepEqual(d.scores.length, 1);
  assert.deepEqual(Object.keys(d.scores[0]), ['pseudo', 'justes', 'n', 'points', 'date']);
  assert.deepEqual({ ...d.scores[0], date: typeof d.scores[0].date }, { pseudo: 'Alice', justes: 3, n: 5, points: 80, date: 'string' });
  assert.ok(!JSON.stringify(g.corps).includes(a.id), 'aucun identifiant de joueur ne sort');
  // Erreurs de lecture.
  erreurFr(await appel(duelGet), 400);
  erreurFr(await appel(duelGet, { requete: '?id=trop-court' }), 400);
  erreurFr(await appel(duelGet, { requete: '?id=ABCDEFGH' }), 400);
  erreurFr(await appel(duelGet, { requete: '?id=abcd1234' }), 404);
  // Deux duels, deux identifiants.
  const r2 = await creerDuel(a);
  assert.notEqual(r2.corps.id, r.corps.id);
});

test('duel PUT : ajoute ou remplace le score du lecteur, 401, 400, 404', async () => {
  preparerDuels();
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const { id } = (await creerDuel(a)).corps;
  const put = (joueur, corps) => appel(duelPut, { methode: 'PUT', jeton: joueur && joueur.jeton, corps });
  const lireScores = async () => (await appel(duelGet, { requete: '?id=' + id })).corps.duel.scores;
  erreurFr(await put(null, { id, score: { justes: 1, n: 5, points: 10 } }), 401);
  const ajout = await put(b, { id, score: { justes: 4, n: 5, points: 95 } });
  assert.deepEqual(ajout.corps, { ok: true });
  assert.deepEqual((await lireScores()).map((s) => [s.pseudo, s.justes, s.points]), [['Alice', 3, 80], ['Bob', 4, 95]]);
  const remplace = await put(b, { id, score: { justes: 2, n: 5, points: 40 } });
  ok200(remplace);
  let scores = await lireScores();
  assert.deepEqual(scores.map((s) => [s.pseudo, s.justes, s.n, s.points]), [['Alice', 3, 5, 80], ['Bob', 2, 5, 40]], 'remplacé, pas ajouté');
  ok200(await put(a, { id, score: { justes: 5, n: 5, points: 140 } }));
  scores = await lireScores();
  assert.deepEqual(scores.map((s) => [s.pseudo, s.points]), [['Alice', 140], ['Bob', 40]]);
  // Un pseudo changé est repris au nouveau score.
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: b.jeton, corps: { pseudo: 'Robert', etat: {} } }));
  ok200(await put(b, { id, score: { justes: 5, n: 5, points: 150 } }));
  assert.deepEqual((await lireScores()).map((s) => s.pseudo), ['Alice', 'Robert']);
  // Erreurs.
  for (const corps of [
    { score: { justes: 1, n: 5, points: 10 } },
    { id: 12, score: { justes: 1, n: 5, points: 10 } },
    { id: 'court', score: { justes: 1, n: 5, points: 10 } },
    { id, score: { justes: 1, n: 4, points: 10 } },
    { id, score: { justes: 6, n: 5, points: 10 } },
    { id, score: { justes: 1, n: 5, points: -1001 } },
    { id, score: 'rien' },
    { id },
  ]) erreurFr(await put(b, corps), 400);
  erreurFr(await put(b, { id: 'abcd1234', score: { justes: 1, n: 5, points: 10 } }), 404);
  erreurFr(await appel(duelPut, { methode: 'PUT', jeton: b.jeton, brut: '{}', entetes: { 'content-length': '99999' } }), 413);
  assert.equal((await lireScores()).length, 2);
});

test('duel PUT : un score écrit par un autre lecteur pendant la mise à jour n’est pas perdu', async () => {
  preparerDuels();
  const a = await creerJoueur('Alice');
  const c = await creerJoueur('Carla');
  const { id } = (await creerDuel(a)).corps;
  let deja = false;
  const concurrent = {
    ...db,
    prepare(sql) {
      const st = db.prepare(sql);
      if (sql.startsWith('SELECT questions, scores FROM duels') && !deja) {
        const premier = st.first;
        st.first = async (...args) => {
          const ligne = await premier(...args);
          deja = true; // un autre lecteur écrit entre notre lecture et notre écriture
          const scores = JSON.parse(ligne.scores);
          scores.push({ joueur: 'zzzzzzzzzzzz', pseudo: 'Zoé', justes: 1, n: 5, points: 20, date: '2026-10-19T09:00:00.000Z' });
          db.base.prepare('UPDATE duels SET scores = ? WHERE id = ?').run(JSON.stringify(scores), id);
          return ligne;
        };
      }
      return st;
    },
  };
  const r = await appel(duelPut, { env: { DB: concurrent }, methode: 'PUT', jeton: c.jeton, corps: { id, score: { justes: 2, n: 5, points: 50 } } });
  ok200(r);
  assert.equal(deja, true);
  const scores = (await appel(duelGet, { requete: '?id=' + id })).corps.duel.scores;
  assert.deepEqual(scores.map((s) => s.pseudo), ['Alice', 'Zoé', 'Carla']);
});

test('duels GET : 401, les 20 derniers duels où le lecteur a joué, sans identifiant de joueur', async () => {
  preparerDuels();
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const c = await creerJoueur('Carla');
  erreurFr(await appel(duelsGet), 401);
  assert.deepEqual((await appel(duelsGet, { jeton: a.jeton })).corps, { duels: [] });
  const d1 = (await creerDuel(a)).corps.id;
  const d2 = (await creerDuel(b)).corps.id;
  ok200(await appel(duelPut, { methode: 'PUT', jeton: a.jeton, corps: { id: d2, score: { justes: 1, n: 5, points: 10 } } }));
  const mesDuels = async (joueur) => (await appel(duelsGet, { jeton: joueur.jeton })).corps.duels;
  const chezA = await mesDuels(a);
  assert.deepEqual(chezA.map((d) => d.id).sort(), [d1, d2].sort());
  assert.deepEqual(Object.keys(chezA[0]), ['id', 'createur', 'scores', 'cree']);
  assert.equal(chezA.find((d) => d.id === d2).createur, 'Bob');
  assert.deepEqual(chezA.find((d) => d.id === d2).scores.map((s) => s.pseudo), ['Bob', 'Alice']);
  assert.deepEqual((await mesDuels(b)).map((d) => d.id), [d2]);
  assert.deepEqual(await mesDuels(c), []);
  assert.ok(!JSON.stringify(chezA).includes(a.id) && !JSON.stringify(chezA).includes(b.id));
  // 20 au plus, les plus récents d'abord.
  db.base.exec('DELETE FROM duels');
  const ajout = db.base.prepare('INSERT INTO duels (id, createur, questions, scores, cree) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < 25; i++) {
    const scores = JSON.stringify([{ joueur: a.id, pseudo: 'Alice', justes: 1, n: 5, points: i, date: '2026-10-19T08:00:00.000Z' }]);
    ajout.run('duel' + String(i).padStart(4, '0'), a.id, '[]', scores, `2026-10-19T08:${String(i).padStart(2, '0')}:00.000Z`);
  }
  ajout.run('autre000', b.id, '[]', JSON.stringify([{ joueur: b.id, pseudo: 'Bob', justes: 1, n: 5, points: 1, date: 'x' }]), '2026-10-19T09:59:00.000Z');
  const vingt = await mesDuels(a);
  assert.equal(vingt.length, 20);
  assert.equal(vingt[0].id, 'duel0024');
  assert.equal(vingt[19].id, 'duel0005');
  assert.ok(vingt.every((d) => d.id.startsWith('duel')));
});

// =============================================================================
// V2 : parcours, paliers recoupés par deux IA, images, quiz
// =============================================================================

const NOM_LLAMA = 'llama-3.3-70b-instruct-fp8-fast';
const NOM_MISTRAL = 'mistral-small-3.1-24b-instruct';
const CLE_GLM = 'cle-glm-de-test';
const AVEC_GLM = { GLM_API_KEY: CLE_GLM };

// --- Fixtures ---

const palierBrut = () => structuredClone(EXEMPLE_PALIER);
const etapeBrute = () => structuredClone(EXEMPLE_ETAPE);
const programmeBrut = () => structuredClone(EXEMPLE_PROGRAMME);
const moduleBrut = () => structuredClone(EXEMPLE_MODULE);
const module2Brut = () => ({
  lecons: ['Le projet de Koechlin et Nouguier', 'Stephen Sauvestre et l’allure', 'Le concours de l’Exposition', 'Les premiers plans', 'Le calcul des efforts du vent', 'Les ateliers de Levallois-Perret'],
});
const leconBrute = () => structuredClone(EXEMPLE_LECON);
const prolongementBrut = () => structuredClone(EXEMPLE_PROLONGEMENT);
const etape2Brute = () => ({
  etape: 'Pour aller plus loin',
  paliers: [
    'Les ateliers de Levallois-Perret', 'Les calculs de résistance au vent', 'Le laboratoire du troisième étage',
    'Les premiers essais de télégraphie', 'Les ascenseurs hydrauliques', 'La tour pendant la guerre de 1914',
    'Les illuminations de la tour', 'Les restaurations du vingtième siècle', 'La tour et le cinéma',
    'Les répliques dans le monde',
  ],
});
const quizBrut = () => ({
  questions: Array.from({ length: 10 }, (_, i) => (i < 7
    ? {
      type: 'qcm',
      enonce: `Question numéro ${i + 1} sur la tour Eiffel, quelle est la bonne proposition ?`,
      reponses: [`Bonne proposition ${i + 1}`, `Proposition fausse ${i + 1}a`, `Proposition fausse ${i + 1}b`, `Proposition fausse ${i + 1}c`],
      bonne: i % 4,
      explication: `Pour la question ${i + 1}, la bonne réponse est établie par les sources ; les trois autres ne le sont pas.`,
    }
    : {
      type: 'vraifaux',
      affirmation: `Affirmation numéro ${i + 1} sur la tour Eiffel, vraie selon les sources.`,
      vrai: i % 2 === 0,
      explication: `Pour l’affirmation ${i + 1}, le verdict est établi par les sources consultées.`,
    })).map((q) => {
    // `bonne` désigne la place de la bonne proposition dans reponses : on la place là où elle est annoncée.
    if (q.type === 'qcm') {
      const [bonneRep, ...autres] = q.reponses;
      const reponses = [...autres];
      reponses.splice(q.bonne, 0, bonneRep);
      return { ...q, reponses };
    }
    return q;
  }),
});

// Scénario d'IA : réponses par étape (etape, palier, verif, quiz) ; chaque valeur est un objet, un texte brut,
// une Error, une fonction ({modele, via, messages, i}) ou une liste de ces choses (la dernière se répète).
function scenario(parts) {
  const appels = [];
  const n = {};
  const etapeDe = (systeme) => ({
    [PROMPT_ETAPE]: 'etape', [PROMPT_PALIER]: 'palier', [PROMPT_VERIFICATION]: 'verif', [PROMPT_QUIZ]: 'quiz',
    [PROMPT_PROGRAMME]: 'programme', [PROMPT_PROGRAMME_COURT]: 'programme2', [PROMPT_MODULE]: 'module', [PROMPT_LECON]: 'lecon',
    // Une leçon = deux moitiés (A : « lecon », B : « leconB »), chacune avec sa version courte (« leconA2 », « leconB2»).
    [PROMPT_LECON_A]: 'lecon', [PROMPT_LECON_B]: 'leconB', [PROMPT_LECON_A_COURT]: 'leconA2', [PROMPT_LECON_B_COURT]: 'leconB2',
    [PROMPT_PROLONGER]: 'prolonger', [PROMPT_VARIANTE]: 'variante',
  })[systeme] || 'inconnu';
  // Sans réponse prévue pour une étape : « programme2 » reprend « programme » ; « leconB », « leconA2 » et « leconB2 » reprennent « lecon ».
  const repli = { programme2: 'programme', leconB: 'lecon', leconA2: 'lecon', leconB2: 'lecon' };
  function repondre(via, modele, messages) {
    const etape = etapeDe(messages[0].content);
    const i = n[etape] = (n[etape] ?? -1) + 1;
    appels.push({ via, modele, etape, entree: { messages }, i });
    const v = parts[etape] !== undefined ? parts[etape] : parts[repli[etape]];
    if (v === undefined) throw new Error('étape non prévue : ' + etape);
    const choix = Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v;
    const valeur = typeof choix === 'function' ? choix({ modele, via, messages, i }) : choix;
    if (valeur instanceof Error) throw valeur;
    return typeof valeur === 'string' ? valeur : JSON.stringify(valeur);
  }
  return {
    appels,
    par: (etape) => appels.filter((a) => a.etape === etape),
    ai: {
      async run(modele, entree) {
        return { response: repondre('ai', modele, entree.messages), recu: entree };
      },
    },
    glm(u, init) {
      const corps = JSON.parse(init.body);
      try {
        return reponseWiki({ choices: [{ message: { content: repondre('glm', corps.model, corps.messages) } }] });
      } catch (e) {
        return new Response('erreur : ' + e.message, { status: 500 });
      }
    },
  };
}

// Vérificateur : signale les affirmations dont le texte correspond au motif.
const verifSi = (motif) => ({ messages }) => {
  const texte = messages[1].content;
  const liste = texte.slice(texte.indexOf('Affirmations à vérifier :')).split('\n');
  const nonConfirmees = [];
  for (const l of liste) {
    const m = /^(\d+)\. (.*)$/.exec(l);
    if (m && motif.test(m[2])) nonConfirmees.push(Number(m[1]));
  }
  return { nonConfirmees };
};
const verifNumeros = (...numeros) => ({ nonConfirmees: numeros });
const partiesStandard = () => ({
  etape: [etapeBrute()], palier: [palierBrut()], verif: [verifNumeros()], quiz: [quizBrut()],
  programme: [programmeBrut()], module: [moduleBrut()], lecon: [leconBrute()], prolonger: [prolongementBrut()],
});
const TOTAL = 25; // affirmations de EXEMPLE_PALIER : 7 phrases, 2 définitions, 3 dates, 4 chiffres, 1 histoire, 4 × 2 questions
const TOTAL_LECON = 35; // EXEMPLE_LECON : les 25 ci-dessus, 3 « à retenir », 1 moyen mnémotechnique, 2 rappels, 1 exemple et 3 cartes

const envDe = (sc, extra = {}) => ({ DB: db, AI: sc.ai, ...extra });
function brancher(sc) {
  ext.glm = sc.glm;
}

// Parcours de l'ancien format (étapes de 10 paliers, sans programme), inséré tel que l'ancienne création l'écrivait.
async function creerParcoursTest(joueur, titre = 'La tour Eiffel') {
  const id = slug(titre);
  const contenu = {
    resume: EXEMPLE_ETAPE.resume,
    image: {
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg',
      alt: 'Illustration de « Tour Eiffel »',
      credit: 'Image : Wikimédia',
      lien: 'https://fr.wikipedia.org/wiki/Fichier:Tour_Eiffel_Wikimedia_Commons.jpg',
    },
    motImage: EXEMPLE_ETAPE.motImage,
    etapes: [{ numero: 1, titre: EXEMPLE_ETAPE.etape, paliers: EXEMPLE_ETAPE.paliers.map((t, i) => ({ numero: i + 1, titre: t })) }],
    sources: [['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel'], ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower']],
  };
  db.base.prepare('INSERT INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES (?, ?, ?, ?, 0, ?)')
    .run(id, titre, JSON.stringify(contenu), joueur.id, '2026-10-19T08:00:00.000Z');
  return decoderParcours({ id, titre, contenu: JSON.stringify(contenu) });
}
function lirePalier(joueur, parcours, n, sc, extra = {}) {
  brancher(sc);
  return appel(palierGet, { env: envDe(sc, extra), jeton: joueur && joueur.jeton, requete: `?parcours=${parcours}&n=${n}` });
}
// Insertion directe d'un parcours (id, étapes) et d'un palier en cache.
function insererParcours(id, { titre = id, etapes = 1, vues = 0, cree = '2026-10-19T08:00:00.000Z', image = null } = {}) {
  const liste = [];
  for (let e = 1; e <= etapes; e++) {
    liste.push({ numero: e, titre: `Étape ${e}`, paliers: Array.from({ length: 10 }, (_, i) => ({ numero: (e - 1) * 10 + i + 1, titre: `Palier ${(e - 1) * 10 + i + 1} de ${titre}` })) });
  }
  const contenu = {
    resume: 'Un parcours inséré directement pour les tests, avec deux phrases. Il sert à vérifier les routes.',
    image,
    motImage: null,
    etapes: liste,
    sources: [['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel'], ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower']],
  };
  db.base.prepare('INSERT INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, titre, JSON.stringify(contenu), 'auteur', vues, cree);
}
function insererPalierTest(parcours, numero, { questions = validerRedaction(palierBrut()).valeur.questions } = {}) {
  const contenu = { id: `${parcours}:${numero}`, parcours, numero, etape: Math.ceil(numero / 10), titre: `Palier ${numero}`, questions };
  db.base.prepare('INSERT INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES (?, ?, ?, ?, 0, ?)')
    .run(contenu.id, parcours, numero, JSON.stringify(contenu), '2026-10-19T08:00:00.000Z');
  return contenu;
}
const MODULES_EXEMPLE = EXEMPLE_PROGRAMME.niveaux.flatMap((n) => n.modules); // 21 modules : 6 + 5 + 5 + 5
const NB_MODULES = MODULES_EXEMPLE.length;
const TITRE_MODULE_1 = typographierTexte(MODULES_EXEMPLE[0].titre); // « Qu’est-ce que la tour Eiffel ? », espace fine avant « ? »
const CLES_PARCOURS = ['id', 'titre', 'resume', 'image', 'etapes', 'sources', 'programme', 'modulesTotal'];
const CLES_LECON = ['id', 'parcours', 'numero', 'etape', 'niveau', 'module', 'titre', 'image', 'sections', 'definitions', 'frise', 'chiffres', 'notions', 'histoire', 'aRetenir', 'mnemo', 'avant', 'exemple', 'cartes', 'objectif', 'rappel', 'questions', 'sources', 'verification'];
const CLES_PALIER = ['id', 'parcours', 'numero', 'etape', 'titre', 'image', 'sections', 'definitions', 'frise', 'chiffres', 'notions', 'histoire', 'questions', 'sources', 'verification'];

// --- Fournisseurs ---

test('fournisseurs : rédacteur et vérificateur choisis selon les secrets présents', async () => {
  assert.equal(cleGLM({}), false);
  assert.equal(cleGLM({ GLM_API_KEY: '  ' }), false);
  assert.equal(cleGLM(AVEC_GLM), true);
  assert.equal(nomCourt(LLAMA), NOM_LLAMA);
  assert.equal(GLM_URL, 'https://api.z.ai/api/paas/v4/chat/completions');
  assert.deepEqual([REGLAGES.delaiIaMs, REGLAGES.budgetMs], [60000, 85000], 'un appel : 60 s ; un palier complet : moins de 90 s');
  const noms = (liste) => liste.map((f) => f.nom);
  // Sans GLM : Llama rédige (repli Mistral) ; Mistral vérifie Llama, Llama vérifie Mistral.
  const sans = { AI: {} };
  const [llama, mistral] = redacteurs(sans);
  assert.deepEqual(noms(redacteurs(sans)), [NOM_LLAMA, NOM_MISTRAL]);
  assert.deepEqual(noms(verificateurs(sans, llama)), [NOM_MISTRAL]);
  assert.deepEqual(noms(verificateurs(sans, mistral)), [NOM_LLAMA]);
  // Avec GLM : GLM rédige (repli Llama) ; Mistral vérifie GLM (repli Llama) ; GLM vérifie Workers AI.
  const avec = { AI: {}, ...AVEC_GLM };
  const [glm, llamaRepli] = redacteurs(avec);
  assert.deepEqual(noms(redacteurs(avec)), ['glm-4.7-flash', NOM_LLAMA]);
  assert.deepEqual(noms(verificateurs(avec, glm)), [NOM_MISTRAL, NOM_LLAMA]);
  assert.deepEqual(noms(verificateurs(avec, llamaRepli)), ['glm-4.7-flash', NOM_MISTRAL]);
  assert.equal(redacteurs({ AI: {}, GLM_API_KEY: CLE_GLM, GLM_MODELE: 'glm-4.5-flash' })[0].nom, 'glm-4.5-flash');
  for (const liste of [redacteurs(avec), redacteurs(sans)]) {
    for (const f of liste) assert.notDeepEqual(noms(verificateurs(avec, f)).slice(0, 1), [f.nom], 'jamais le même modèle en premier');
  }
});

test('GLM : appel compatible OpenAI (adresse, clé, corps, délai de 60 s) ; erreur HTTP et dépassement du délai', async () => {
  reinitExt();
  ext.glm = () => reponseWiki({ choices: [{ message: { content: 'Voici :\n```json\n{"ok": 1}\n```' } }] });
  const [glm] = redacteurs({ AI: {}, ...AVEC_GLM });
  const messages = [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }];
  const sortie = await glm.appeler(messages, { maxTokens: 123, temperature: 0.2, delaiMs: 1000 });
  assert.deepEqual(extraireObjet(sortie), { ok: 1 });
  const a = ext.appels[0];
  assert.equal(a.url.href, GLM_URL);
  assert.equal(a.init.method, 'POST');
  const entetes = new Headers(a.init.headers);
  assert.equal(entetes.get('authorization'), 'Bearer ' + CLE_GLM);
  assert.equal(entetes.get('content-type'), 'application/json');
  assert.equal(entetes.get('user-agent'), 'Koios/2.0 (https://koios.gregoire-muel.workers.dev)');
  assert.deepEqual(JSON.parse(a.init.body), {
    model: 'glm-4.7-flash', messages, max_tokens: 123, temperature: 0.2, stream: false, thinking: { type: 'disabled' },
  });
  assert.ok(a.init.signal instanceof AbortSignal && !a.init.signal.aborted, 'délai prévu');
  // Modèle choisi par GLM_MODELE.
  const [autre] = redacteurs({ AI: {}, ...AVEC_GLM, GLM_MODELE: ' glm-4.5-air ' });
  await autre.appeler(messages, { maxTokens: 10, delaiMs: 1000 });
  assert.equal(JSON.parse(ext.appels[1].init.body).model, 'glm-4.5-air');
  // Erreur HTTP.
  ext.glm = () => new Response('trop de requêtes', { status: 429 });
  await assert.rejects(() => glm.appeler(messages, { maxTokens: 10, delaiMs: 1000 }), /429/);
  // Le délai demandé ne dépasse jamais REGLAGES.delaiIaMs (60 s) ; ici abaissé pour que le test soit rapide.
  const avant = REGLAGES.delaiIaMs;
  REGLAGES.delaiIaMs = 30;
  try {
    ext.glm = (u, init) => bloquer(init);
    await assert.rejects(() => glm.appeler(messages, { maxTokens: 10, delaiMs: 600000 }), (e) => e.name === 'TimeoutError');
  } finally {
    REGLAGES.delaiIaMs = avant;
  }
  reinitExt();
});

test('Workers AI : modèle, jetons, température transmis ; délai dépassé ; aucune minuterie qui traîne', async () => {
  const vus = [];
  const ai = { async run(modele, entree) { vus.push([modele, entree]); return { response: '{"ok":true}' }; } };
  const [llama, mistral] = redacteurs({ AI: ai });
  const messages = [{ role: 'user', content: 'U' }];
  assert.deepEqual(extraireObjet(await llama.appeler(messages, { maxTokens: 99, temperature: 0.1, delaiMs: 1000 })), { ok: true });
  await mistral.appeler(messages, { maxTokens: 50, delaiMs: 1000 });
  assert.deepEqual(vus[0], [LLAMA, { messages, max_tokens: 99, temperature: 0.1 }]);
  assert.equal(vus[1][0], MISTRAL);
  assert.equal(vus[1][1].temperature, 0.3, 'température par défaut');
  const avant = REGLAGES.delaiIaMs;
  REGLAGES.delaiIaMs = 20;
  try {
    const bloque = redacteurs({ AI: { run: () => new Promise(() => {}) } })[0];
    await assert.rejects(() => bloque.appeler(messages, { maxTokens: 5, delaiMs: 600000 }), /délai/);
    const tombe = redacteurs({ AI: { run: async () => { await new Promise((r) => setTimeout(r, 60)); throw new Error('trop tard'); } } })[0];
    await assert.rejects(() => tombe.appeler(messages, { maxTokens: 5, delaiMs: 600000 }), /délai/);
    await new Promise((r) => setTimeout(r, 100)); // l'échec tardif ne fait pas planter le processus
  } finally {
    REGLAGES.delaiIaMs = avant;
  }
});

// --- Gemini, Grok : chaînes, repli, mémoire de l'épuisement ---

const CLE_GEMINI = 'AQ.cle-gemini-de-test';
const CLE_GROK = 'grok_cle-de-test';
const TOUTES = { AI: {}, GLM_API_KEY: CLE_GLM, GEMINI_API_KEY: CLE_GEMINI, GROK_API_KEY: CLE_GROK };
const MSG = [{ role: 'system', content: 'Sois bref' }, { role: 'user', content: 'Bonjour' }, { role: 'assistant', content: 'Salut' }, { role: 'user', content: 'Suite' }];
const reponseGemini = (texte) => reponseWiki({ candidates: [{ content: { parts: [{ text: 'réflexion', thought: true }, { text: texte }] } }] });
const reponseOpenAI = (texte) => reponseWiki({ choices: [{ message: { content: texte } }] });

test('fournisseurs : chaînes de rédaction et de vérification avec Gemini et Grok (famille différente, clés absentes ignorées)', async () => {
  reinitExt();
  const noms = (l) => l.map((f) => f.famille + ':' + f.nom);
  const rl = redacteurs(TOUTES);
  assert.deepEqual(rl.map((f) => f.famille), ['gemini', 'glm', 'grok', 'workers-ai']);
  assert.equal(rl[0].nom, 'gemini-3-flash-preview');
  assert.equal(rl[2].nom, 'grok-3-mini');
  assert.deepEqual(redacteurs({ AI: {}, GEMINI_API_KEY: CLE_GEMINI }).map((f) => f.famille), ['gemini', 'workers-ai']);
  assert.deepEqual(redacteurs({ AI: {}, GROK_API_KEY: CLE_GROK }).map((f) => f.famille), ['grok', 'workers-ai']);
  // Vérification : [cerebras, groq, mistral, gemini, glm, grok, mistral WAI, llama WAI] moins la famille du rédacteur.
  const fam = (l) => l.map((f) => f.famille);
  assert.deepEqual(fam(verificateurs(TOUTES, rl[0])), ['glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(fam(verificateurs(TOUTES, rl[1])), ['gemini', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(fam(verificateurs(TOUTES, rl[2])), ['gemini', 'glm', 'workers-ai', 'workers-ai']);
  assert.deepEqual(noms(verificateurs(TOUTES, rl[3])).map((n) => n.split(':')[0]), ['gemini', 'glm', 'grok', 'workers-ai']);
  assert.ok(!noms(verificateurs(TOUTES, rl[3])).includes('workers-ai:' + NOM_LLAMA), 'Llama ne se vérifie pas lui-même');
  for (const r of rl) for (const v of verificateurs(TOUTES, r)) assert.ok(v.famille !== r.famille || r.famille === 'workers-ai');
  assert.deepEqual(tousLesFournisseurs(TOUTES).map((f) => f.famille), ['gemini', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(tousLesFournisseurs({ AI: {} }).map((f) => f.famille), ['workers-ai', 'workers-ai']);
});

test('Gemini : adresse, en-tête x-goog-api-key, system -> systemInstruction, JSON forcé, réflexion coupée, sortie lisible', async () => {
  reinitExt();
  ext.gemini = () => reponseGemini('Voici {"ok": 2}');
  const [gem] = redacteurs({ AI: {}, GEMINI_API_KEY: CLE_GEMINI });
  const sortie = await gem.appeler(MSG, { maxTokens: 77, temperature: 0.1, delaiMs: 1000 });
  assert.deepEqual(extraireObjet(sortie), { ok: 2 });
  const a = ext.appels[0];
  assert.equal(a.url.href, GEMINI_BASE + 'gemini-3-flash-preview:generateContent');
  assert.equal(a.url.search, '', 'jamais de clé dans l’adresse');
  assert.equal(new Headers(a.init.headers).get('x-goog-api-key'), CLE_GEMINI);
  assert.deepEqual(JSON.parse(a.init.body), {
    contents: [
      { role: 'user', parts: [{ text: 'Bonjour' }] },
      { role: 'model', parts: [{ text: 'Salut' }] },
      { role: 'user', parts: [{ text: 'Suite' }] },
    ],
    generationConfig: { maxOutputTokens: 77, temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'minimal' } },
    systemInstruction: { parts: [{ text: 'Sois bref' }] },
  });
  assert.equal(corpsGemini(MSG, { maxTokens: 5, temperature: 0, modele: 'gemini-2.0-flash' }).generationConfig.thinkingConfig, undefined, 'pas de réflexion à couper en 2.0');
  assert.equal(corpsGemini([{ role: 'user', content: 'x' }], { maxTokens: 5, temperature: 0, modele: 'gemini-2.5-flash' }).systemInstruction, undefined);
  // Réponse sans texte (bloquée) : illisible, pas d'exception.
  ext.gemini = () => reponseWiki({ candidates: [{ finishReason: 'SAFETY' }] });
  assert.equal(extraireObjet(await gem.appeler(MSG, { maxTokens: 5, delaiMs: 1000 })), null);
  // Modèle refusé (404) ou quota du modèle (429) : modèle suivant, retenu ensuite.
  reinitExt();
  ext.gemini = (u) => (/3-flash-preview/.test(u.pathname) ? new Response('no', { status: 404 }) : /gemini-2\.5-flash:/.test(u.pathname) ? new Response('quota', { status: 429 }) : reponseGemini('{"ok":3}'));
  const [g2] = redacteurs({ AI: {}, GEMINI_API_KEY: CLE_GEMINI });
  assert.deepEqual(extraireObjet(await g2.appeler(MSG, { maxTokens: 5, delaiMs: 1000 })), { ok: 3 });
  assert.equal(ext.appels.length, 3);
  assert.equal(estEpuise('gemini'), false, 'un modèle de repli a répondu');
  assert.equal(g2.couple().modele, 'gemini-flash-latest');
  assert.equal(g2.nom, 'gemini-flash-latest', 'le badge montre le modèle qui a répondu');
  // Pas de modèle figé : le prochain appel repart du premier modèle non écarté (3-flash indisponible, 2.5 épuisé : flash-latest).
  assert.equal(redacteurs({ AI: {}, GEMINI_API_KEY: CLE_GEMINI })[0].nom, 'gemini-flash-latest');
  reinitExt();
  oublierEpuisements();
  reinitExt();
});

test('Grok : candidats xAI puis Groq (401, 403, 404 -> suivant), couple retenu', async () => {
  reinitExt();
  ext.grok = () => new Response('Incorrect API key', { status: 401 });
  ext.groq = (u, init) => (JSON.parse(init.body).model === 'llama-3.3-70b-versatile' ? reponseOpenAI('{"ok":4}') : new Response('?', { status: 404 }));
  const [gk] = redacteurs({ AI: {}, GROK_API_KEY: CLE_GROK });
  assert.deepEqual(extraireObjet(await gk.appeler(MSG, { maxTokens: 12, temperature: 0.2, delaiMs: 1000 })), { ok: 4 });
  assert.deepEqual(ext.appels.map((a) => [a.fournisseur, JSON.parse(a.init.body).model]), [['grok', 'grok-3-mini'], ['grok', 'grok-4-fast'], ['groq', 'llama-3.3-70b-versatile']]);
  assert.equal(ext.appels[0].url.href, XAI_URL);
  assert.equal(ext.appels[2].url.href, GROQ_URL);
  assert.equal(new Headers(ext.appels[2].init.headers).get('authorization'), 'Bearer ' + CLE_GROK);
  assert.deepEqual(gk.couple(), { url: GROQ_URL, modele: 'llama-3.3-70b-versatile' });
  // Couple retenu : le prochain appel ne repasse plus par xAI.
  ext.appels.length = 0;
  const [gk2] = redacteurs({ AI: {}, GROK_API_KEY: CLE_GROK });
  await gk2.appeler(MSG, { maxTokens: 12, delaiMs: 1000 });
  assert.deepEqual(ext.appels.map((a) => a.fournisseur), ['groq']);
  // xAI répond du premier coup.
  reinitExt();
  ext.grok = () => reponseOpenAI('{"ok":5}');
  assert.deepEqual(extraireObjet(await redacteurs({ AI: {}, GROK_API_KEY: CLE_GROK })[0].appeler(MSG, { maxTokens: 5, delaiMs: 1000 })), { ok: 5 });
  assert.equal(ext.appels.length, 1);
  // Tous refusés : échec sans clé dans le message.
  reinitExt();
  ext.grok = () => new Response('bad ' + CLE_GROK, { status: 401 });
  ext.groq = () => new Response('bad ' + CLE_GROK, { status: 401 });
  await assert.rejects(() => redacteurs({ AI: {}, GROK_API_KEY: CLE_GROK })[0].appeler(MSG, { maxTokens: 5, delaiMs: 1000 }), (e) => /401/.test(e.message) && !e.message.includes(CLE_GROK));
  reinitExt();
});

test('épuisement : 429 ou 4006 -> fournisseur écarté 10 minutes, puis réessayé ; cause affichée avec les noms', async () => {
  reinitExt();
  ext.glm = () => new Response('limite', { status: 429 });
  const env = { AI: { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } }, ...AVEC_GLM };
  const [glmF, llamaF] = redacteurs(env);
  await assert.rejects(() => glmF.appeler(MSG, { maxTokens: 5, delaiMs: 1000 }), (e) => e.epuise === true && e.fournisseur === 'GLM' && /429/.test(e.message));
  await assert.rejects(() => llamaF.appeler(MSG, { maxTokens: 5, delaiMs: 1000 }), (e) => e.epuise === true && e.fournisseur === 'Workers AI');
  assert.equal(estEpuise('glm'), true);
  assert.equal(estEpuise('workers-ai'), true);
  // Tous épuisés : on garde la chaîne complète (mieux vaut réessayer qu'abandonner).
  assert.equal(redacteurs(env).length, 2);
  // Avec Gemini en plus : GLM et Llama sont ignorés, Gemini seul reste ; la vérification saute aussi les épuisés.
  const toutes = { ...env, GEMINI_API_KEY: CLE_GEMINI, GROK_API_KEY: CLE_GROK };
  assert.deepEqual(redacteurs(toutes).map((f) => f.famille), ['gemini', 'grok']);
  assert.deepEqual(verificateurs(toutes, redacteurs(toutes)[0]).map((f) => f.famille), ['grok']);
  // Après 10 minutes, GLM revient.
  horloge.t += 10 * 60 * 1000 + 1000;
  assert.equal(estEpuise('glm'), false);
  assert.deepEqual(redacteurs(toutes).map((f) => f.famille), ['gemini', 'glm', 'grok', 'workers-ai']);
  reinitExt();
});

test('diagnostic : protégé par DIAG_KEY, teste tous les fournisseurs configurés, rapporte le couple, jamais de clé', async () => {
  reinitExt();
  ext.gemini = () => reponseGemini('{"ok":true}');
  ext.glm = () => new Response('limite ' + CLE_GLM, { status: 429 });
  ext.grok = () => new Response('non', { status: 401 });
  ext.groq = () => reponseOpenAI('{"ok":true}');
  const env = { ...TOUTES, DIAG_KEY: 'sésame', AI: { run: async () => ({ response: '{"ok":true}' }) } };
  erreurFr(await appel(diagnosticGet, { env, requete: '?cle=faux' }), 404);
  erreurFr(await appel(diagnosticGet, { env: { ...env, DIAG_KEY: undefined }, requete: '?cle=' }), 404);
  const r = await appel(diagnosticGet, { env, requete: '?cle=sésame' });
  ok200(r);
  assert.deepEqual(r.corps.resultats.map((x) => x.famille), ['gemini', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(r.corps.resultats.map((x) => x.etat), ['ok', 'echec', 'ok', 'ok', 'ok']);
  assert.equal(r.corps.resultats[0].couple.modele, 'gemini-3-flash-preview');
  assert.deepEqual(r.corps.resultats[2].couple, { url: GROQ_URL, modele: 'llama-3.3-70b-versatile' });
  assert.equal(r.corps.resultats[1].quota, 'épuisé');
  const texte = JSON.stringify(r.corps);
  for (const c of [CLE_GEMINI, CLE_GLM, CLE_GROK, 'sésame']) assert.ok(!texte.includes(c), 'aucune clé dans la réponse');
  reinitExt();
});

// --- Cerebras, Groq, Mistral (API officielles compatibles OpenAI) : ordre, cascade, mémoire, aucune clé dans les sorties ---

const CLE_CEREBRAS = 'csk-cle-cerebras-de-test';
const CLE_GROQ = 'gsk_cle-groq-de-test';
const CLE_MISTRAL = 'cle-mistral-de-test';
const TOUS = { ...TOUTES, CEREBRAS_API_KEY: CLE_CEREBRAS, GROQ_API_KEY: CLE_GROQ, MISTRAL_API_KEY: CLE_MISTRAL };
const COMPAT_TEST = {
  cerebras: { env: { AI: {}, CEREBRAS_API_KEY: CLE_CEREBRAS }, cle: CLE_CEREBRAS, url: CEREBRAS_URL, modeles: CEREBRAS_MODELES },
  groq: { env: { AI: {}, GROQ_API_KEY: CLE_GROQ }, cle: CLE_GROQ, url: GROQ_URL, modeles: GROQ_MODELES },
  mistral: { env: { AI: {}, MISTRAL_API_KEY: CLE_MISTRAL }, cle: CLE_MISTRAL, url: MISTRAL_URL, modeles: MISTRAL_MODELES },
};
const corpsDe = (a) => JSON.parse(a.init.body);
const modelesDe = (famille) => ext.appels.filter((a) => a.fournisseur === famille).map((a) => corpsDe(a).model);
// Faux fournisseur compatible OpenAI : `pannes` = { modèle: (corps) => Response } ; les autres modèles répondent {"ok":1}.
const fauxCompat = (pannes) => (u, init) => {
  const corps = JSON.parse(init.body);
  return pannes[corps.model] ? pannes[corps.model](corps) : reponseOpenAI('{"ok":1}');
};
const appelCompat = (famille, env = COMPAT_TEST[famille].env) => tousLesFournisseurs(env).find((f) => f.famille === famille).appeler(MSG, { maxTokens: 5, delaiMs: 1000 });

test('fournisseurs : ordre de rédaction gemini, cerebras, groq, mistral, glm, grok, llama ; vérification gemini, cerebras, groq, mistral, glm, grok, workers-ai', async () => {
  reinitExt();
  const fam = (l) => l.map((f) => f.famille);
  const rl = redacteurs(TOUS);
  assert.deepEqual(fam(rl), ['gemini', 'cerebras', 'groq', 'mistral', 'glm', 'grok', 'workers-ai']);
  assert.deepEqual(rl.map((f) => f.nom).slice(1, 4), ['gpt-oss-120b', 'llama-3.3-70b-versatile', 'mistral-medium-latest']);
  assert.equal(rl[6].modele, LLAMA);
  assert.deepEqual(fam(tousLesFournisseurs(TOUS)), ['gemini', 'cerebras', 'groq', 'mistral', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  // Vérification : autre famille que le rédacteur, dans l'ordre fixé.
  assert.deepEqual(fam(verificateurs(TOUS, rl[0])), ['cerebras', 'groq', 'mistral', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(fam(verificateurs(TOUS, rl[1])), ['gemini', 'groq', 'mistral', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(fam(verificateurs(TOUS, rl[2])), ['gemini', 'cerebras', 'mistral', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(fam(verificateurs(TOUS, rl[3])), ['gemini', 'cerebras', 'groq', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual(fam(verificateurs(TOUS, rl[5])), ['gemini', 'cerebras', 'groq', 'mistral', 'glm', 'workers-ai', 'workers-ai']);
  // Workers AI : son Mistral reste dans la famille 'workers-ai', distincte de la famille 'mistral' (API) : il ne vérifie pas le Llama de Workers AI
  // sous le même nom, et le Mistral de l'API ne vérifie pas un autre modèle Mistral de l'API.
  const verifLlama = verificateurs(TOUS, rl[6]);
  assert.deepEqual(verifLlama.map((f) => f.famille + ':' + f.modele), ['gemini:gemini-3-flash-preview', 'cerebras:gpt-oss-120b', 'groq:llama-3.3-70b-versatile', 'mistral:mistral-medium-latest', 'glm:glm-4.7-flash', 'grok:grok-3-mini', 'workers-ai:' + MISTRAL]);
  assert.ok(!fam(verificateurs(TOUS, rl[3])).includes('mistral'));
  // Clé absente : fournisseur absent (rédaction, vérification, diagnostic).
  for (const f of ['cerebras', 'groq', 'mistral']) {
    const sans = { ...TOUS };
    delete sans[{ cerebras: 'CEREBRAS_API_KEY', groq: 'GROQ_API_KEY', mistral: 'MISTRAL_API_KEY' }[f]];
    assert.ok(!fam(redacteurs(sans)).includes(f), f + ' sans clé : absent des rédacteurs');
    assert.ok(!fam(verificateurs(sans, redacteurs(sans)[0])).includes(f), f + ' sans clé : absent des vérificateurs');
    assert.ok(!fam(tousLesFournisseurs(sans)).includes(f));
  }
  assert.deepEqual(fam(redacteurs({ AI: {}, GROQ_API_KEY: '  ' })), ['workers-ai', 'workers-ai'], 'clé vide = pas de clé');
  assert.deepEqual(fam(redacteurs({ AI: {}, GROQ_API_KEY: CLE_GROQ, MISTRAL_API_KEY: CLE_MISTRAL })), ['groq', 'mistral', 'workers-ai']);
  reinitExt();
});

test('Cerebras, Groq, Mistral : adresse, Bearer, response_format json_object, modèles en cascade, sortie lisible', async () => {
  for (const [famille, c] of Object.entries(COMPAT_TEST)) {
    reinitExt();
    ext[famille] = () => reponseOpenAI('Voici {"ok": 7}');
    const [f] = redacteurs(c.env);
    assert.equal(f.famille, famille);
    assert.deepEqual(extraireObjet(await f.appeler(MSG, { maxTokens: 33, temperature: 0.2, delaiMs: 1000 })), { ok: 7 });
    const a = ext.appels[0];
    assert.equal(a.url.href, c.url);
    assert.equal(a.url.search, '', 'jamais de clé dans l’adresse');
    assert.equal(new Headers(a.init.headers).get('authorization'), 'Bearer ' + c.cle);
    assert.deepEqual(corpsDe(a), { model: c.modeles[0], messages: MSG, max_tokens: 33, temperature: 0.2, stream: false, response_format: { type: 'json_object' }, ...(/gpt-oss/.test(c.modeles[0]) ? { reasoning_effort: 'low' } : {}), ...(/qwen/.test(c.modeles[0]) && famille === 'groq' ? { reasoning_format: 'hidden' } : {}) });
    assert.deepEqual(f.couple(), { url: c.url, modele: c.modeles[0] });
    assert.equal(f.nom, c.modeles[0]);
  }
  reinitExt();
});

test('Cerebras, Groq, Mistral : 429 -> modèle suivant et mémoire PAR modèle ; « par jour » 3 h ; 404 ou 400 modèle inconnu 24 h ; 5xx sans marquer', async () => {
  for (const [famille, c] of Object.entries(COMPAT_TEST)) {
    reinitExt();
    const [m0, m1, m2] = c.modeles;
    const etats = () => Object.fromEntries(etatModelesCompat()[famille].map((m) => [m.modele, m.etat]));
    ext[famille] = fauxCompat({ [m0]: () => new Response('quota', { status: 429 }) });
    assert.deepEqual(extraireObjet(await appelCompat(famille)), { ok: 1 });
    assert.deepEqual(modelesDe(famille), [m0, m1]);
    assert.equal(etats()[m0], 'epuise');
    assert.equal(estEpuise(famille), false, 'un modèle reste : famille pas épuisée');
    assert.deepEqual(nomsEpuises(), [], 'et surtout pas marquée par la mémoire de famille');
    // 2e appel : le modèle marqué n'est pas rappelé.
    ext.appels.length = 0;
    await appelCompat(famille);
    assert.deepEqual(modelesDe(famille), [m1]);
    // Après 10 minutes on repart du meilleur.
    horloge.t += MIN10 + 1000;
    ext.appels.length = 0;
    await appelCompat(famille);
    assert.deepEqual(modelesDe(famille), [m0, m1]);
    // Quota « par jour » : 3 h. Modèle inconnu (404, 400) : 24 h. 5xx : suivant sans marquer.
    reinitExt();
    ext[famille] = fauxCompat({
      [m0]: () => new Response('{"error":{"message":"Rate limit reached ... on tokens per day (TPD)"}}', { status: 429 }),
      [m1]: () => new Response('{"error":{"message":"The model `x` does not exist","code":"model_not_found"}}', { status: c.modeles.length > 2 ? 404 : 400 }),
      ...(m2 ? { [m2]: () => new Response('boom', { status: 503 }) } : {}),
    });
    await assert.rejects(() => appelCompat(famille), (e) => e.fournisseur === NOMS_AFF[famille] && !e.cleRefusee && e.details.length === c.modeles.length);
    assert.equal(etats()[m0], 'epuise');
    assert.equal(etats()[m1], 'indisponible');
    if (m2) assert.equal(etats()[m2], 'ok', 'le 5xx n’est pas marqué');
    horloge.t += MIN10 + 1000;
    assert.equal(etats()[m0], 'epuise', '3 h pour un quota par jour');
    horloge.t += 3 * 60 * 60 * 1000;
    assert.deepEqual([etats()[m0], etats()[m1]], ['ok', 'indisponible']);
    horloge.t += 21 * 60 * 60 * 1000;
    assert.equal(etats()[m1], 'ok');
  }
  reinitExt();
});

const NOMS_AFF = { cerebras: 'Cerebras', groq: 'Groq', mistral: 'Mistral' };

test('Cerebras, Groq, Mistral : famille épuisée seulement si tous les modèles le sont (chacune sa mémoire) ; le suivant de la chaîne prend le relais', async () => {
  reinitExt();
  ext.cerebras = fauxCompat(Object.fromEntries(CEREBRAS_MODELES.map((m) => [m, () => new Response('quota', { status: 429 })])));
  ext.groq = fauxCompat({});
  await assert.rejects(() => appelCompat('cerebras'), (e) => e.epuise === true && e.statut === 429 && e.details.length === 3);
  assert.equal(modelesDe('cerebras').length, 3);
  assert.equal(estEpuise('cerebras'), true);
  assert.equal(estEpuise('groq'), false);
  assert.equal(estEpuise('mistral'), false);
  assert.deepEqual(nomsEpuises(), ['Cerebras']);
  // Tout est écarté : un nouvel appel échoue tout de suite, sans toucher au réseau.
  ext.appels.length = 0;
  await assert.rejects(() => appelCompat('cerebras'), (e) => e.epuise === true);
  assert.equal(ext.appels.length, 0);
  // La rédaction saute Cerebras et passe à Groq (la vérification aussi).
  const env = { AI: {}, CEREBRAS_API_KEY: CLE_CEREBRAS, GROQ_API_KEY: CLE_GROQ, MISTRAL_API_KEY: CLE_MISTRAL };
  assert.deepEqual(redacteurs(env).map((f) => f.famille), ['groq', 'mistral', 'workers-ai']);
  assert.deepEqual(verificateurs(env, redacteurs(env)[0]).map((f) => f.famille), ['mistral', 'workers-ai', 'workers-ai']);
  assert.equal(tousEpuises({ AI: undefined, CEREBRAS_API_KEY: CLE_CEREBRAS }), true);
  assert.equal(tousEpuises({ AI: undefined, CEREBRAS_API_KEY: CLE_CEREBRAS, GROQ_API_KEY: CLE_GROQ }), false);
  // Un modèle libéré après 10 minutes : la famille repart avec lui.
  horloge.t += MIN10 + 1000;
  assert.equal(estEpuise('cerebras'), false);
  reinitExt();
});

test('Cerebras, Groq, Mistral : 401 ou 403 -> famille ignorée 1 h (clé jamais dans le message) ; 400 hors modèle -> repli sans response_format, retenu', async () => {
  for (const [famille, c] of Object.entries(COMPAT_TEST)) {
    reinitExt();
    ext[famille] = () => new Response('bad key ' + c.cle, { status: 401 });
    await assert.rejects(() => appelCompat(famille), (e) => e.cleRefusee === true && e.cleInvalide === true && e.statut === 401
      && !e.message.includes(c.cle) && !JSON.stringify(e.details).includes(c.cle));
    assert.equal(ext.appels.length, 1, 'clé refusée : on ne tente pas les autres modèles');
    assert.equal(estIgnore(famille), true);
    assert.deepEqual(nomsIgnores(), [NOMS_AFF[famille]]);
    assert.ok(!redacteurs(c.env).some((f) => f.famille === famille), 'ignorée dans la rédaction');
    assert.ok(!verificateurs({ ...c.env, GEMINI_API_KEY: CLE_GEMINI }, redacteurs({ ...c.env, GEMINI_API_KEY: CLE_GEMINI })[0]).some((f) => f.famille === famille), 'et dans la vérification');
    horloge.t += 60 * 60 * 1000 + 1000;
    assert.equal(estIgnore(famille), false, 'reprise après 1 h');
    reinitExt();
    ext[famille] = () => new Response('forbidden', { status: 403 });
    await assert.rejects(() => appelCompat(famille), (e) => e.cleRefusee === true && e.statut === 403);
    assert.equal(estIgnore(famille), true);
    // 400 (response_format refusé) : même modèle sans ce champ, puis retenu pour ce modèle.
    reinitExt();
    ext[famille] = (u, init) => (JSON.parse(init.body).response_format ? new Response('{"error":{"message":"response_format is not allowed"}}', { status: 400 }) : reponseOpenAI('{"ok":8}'));
    assert.deepEqual(extraireObjet(await appelCompat(famille)), { ok: 8 });
    assert.deepEqual(ext.appels.map((a) => [corpsDe(a).model, !!corpsDe(a).response_format]), [[c.modeles[0], true], [c.modeles[0], false]]);
    ext.appels.length = 0;
    await appelCompat(famille);
    assert.deepEqual(ext.appels.map((a) => [corpsDe(a).model, !!corpsDe(a).response_format]), [[c.modeles[0], false]], 'plus de response_format pour ce modèle');
    assert.equal(estEpuise(famille) || estIgnore(famille), false);
  }
  reinitExt();
});

test('Cerebras, Groq, Mistral : fournisseurs indépendants (Groq épuisé ne touche ni Cerebras, ni Grok qui peut utiliser Groq)', async () => {
  reinitExt();
  ext.groq = fauxCompat(Object.fromEntries(GROQ_MODELES.map((m) => [m, () => new Response('quota', { status: 429 })])));
  await assert.rejects(() => appelCompat('groq'), (e) => e.epuise === true);
  assert.deepEqual([estEpuise('groq'), estEpuise('cerebras'), estEpuise('mistral'), estEpuise('grok')], [true, false, false, false]);
  reinitExt();
});

test('diagnostic : Cerebras, Groq, Mistral apparaissent (clé présente, état, couple, modèles) et jamais leurs clés, même coupées dans un message d’erreur', async () => {
  reinitExt();
  ext.gemini = () => reponseGemini('{"ok":true}');
  ext.glm = () => reponseOpenAI('{"ok":true}');
  ext.grok = () => new Response('non', { status: 401 });
  // Cerebras : 1er modèle 429 avec la clé dans le message, 2e répond. Groq : clé refusée (401) avec la clé dans le message.
  // Mistral : une clé que le message d'erreur place à cheval sur la coupure de 150 caractères.
  ext.cerebras = fauxCompat({ 'gpt-oss-120b': () => new Response('quota ' + CLE_CEREBRAS, { status: 429 }) });
  ext.groq = () => new Response('Invalid API Key ' + CLE_GROQ, { status: 401 });
  ext.mistral = () => new Response('x'.repeat(140) + CLE_MISTRAL + ' fin', { status: 503 });
  const env = { ...TOUS, DIAG_KEY: 'sésame', AI: { run: async () => ({ response: '{"ok":true}' }) } };
  const r = await appel(diagnosticGet, { env, requete: '?cle=sésame' });
  ok200(r);
  assert.deepEqual(r.corps.resultats.map((x) => x.famille), ['gemini', 'cerebras', 'groq', 'mistral', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.deepEqual([r.corps.cerebrasCle, r.corps.groqCle, r.corps.mistralCle], [true, true, true]);
  const [, cer, grq, mis] = r.corps.resultats;
  assert.equal(cer.etat, 'ok');
  assert.deepEqual(cer.couple, { url: CEREBRAS_URL, modele: 'llama-3.3-70b' });
  assert.deepEqual(cer.erreursModeles.map((x) => [x.modele, x.code]), [['gpt-oss-120b', 429]]);
  assert.equal(grq.etat, 'cle-invalide');
  assert.match(grq.erreur, /clé refusée/);
  assert.equal(mis.etat, 'echec');
  assert.deepEqual(r.corps.ignores.sort(), ['Grok', 'Groq']);
  assert.deepEqual(r.corps.modelesCompat.cerebras.map((m) => [m.modele, m.etat]), [['gpt-oss-120b', 'epuise'], ['llama-3.3-70b', 'ok'], ['qwen-3-32b', 'ok']]);
  assert.deepEqual(r.corps.modelesCompat.mistral.map((m) => m.etat), ['ok', 'ok']);
  const texte = JSON.stringify(r.corps);
  for (const cle of [CLE_CEREBRAS, CLE_GROQ, CLE_MISTRAL, CLE_GEMINI, CLE_GLM, CLE_GROK, 'sésame']) assert.ok(!texte.includes(cle), 'aucune clé dans le diagnostic');
  assert.ok(!texte.includes(CLE_MISTRAL.slice(0, 8)), 'pas même un début de clé');
  // Sans clé : la clé est annoncée absente et le fournisseur n'est pas essayé.
  reinitExt();
  ext.gemini = () => reponseGemini('{"ok":true}');
  const r2 = await appel(diagnosticGet, { env: { ...TOUTES, DIAG_KEY: 'sésame', AI: { run: async () => ({ response: '{"ok":true}' }) } }, requete: '?cle=sésame' });
  ok200(r2);
  assert.deepEqual([r2.corps.cerebrasCle, r2.corps.groqCle, r2.corps.mistralCle], [false, false, false]);
  assert.ok(!r2.corps.resultats.some((x) => ['cerebras', 'groq', 'mistral'].includes(x.famille)));
  // Aucune clé non plus dans les messages des erreurs (journaux) : clé coupée à la limite des 150 caractères.
  reinitExt();
  ext.mistral = () => new Response('y'.repeat(145) + CLE_MISTRAL, { status: 503 });
  await assert.rejects(() => appelCompat('mistral'), (e) => !e.message.includes(CLE_MISTRAL.slice(0, 5)) && !JSON.stringify(e.details).includes(CLE_MISTRAL.slice(0, 5)));
  reinitExt();
});

// --- Images ---

const photoUnsplash = (extra = {}) => ({
  id: 'u1',
  alt_description: 'a tower',
  urls: { regular: 'https://images.unsplash.com/photo-1?w=1080', small: 'https://images.unsplash.com/photo-1?w=400' },
  width: 4000,
  height: 3000,
  links: { html: 'https://unsplash.com/photos/u1' },
  user: { name: 'Paul Martin', links: { html: 'https://unsplash.com/@paul' } },
  ...extra,
});

test('images : Pexels n’existe plus (ni clé lue, ni appel) ; seules Commons et Unsplash fournissent des photos', async () => {
  reinitExt();
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const image = await imageDeTete({ PEXELS_KEY: 'cle-pexels', UNSPLASH_KEY: 'cle-unsplash' }, { motImage: 'Eiffel Tower', titre: 'La tour Eiffel', pages: [] });
  assert.equal(image.source, 'unsplash');
  assert.deepEqual(ext.appels.map((x) => x.fournisseur), ['unsplash'], 'la clé Pexels est ignorée');
  const sans = await imageDeTete({ PEXELS_KEY: 'cle-pexels' }, { motImage: 'Eiffel Tower', titre: 'La tour Eiffel', pages: [] });
  assert.equal(sans, null);
  assert.equal(ext.appels.length, 1, 'sans clé Unsplash : aucun appel');
  reinitExt();
});

test('images : Unsplash (adresse, Client-ID, content_filter, crédit avec liens vers le photographe et Unsplash, utm)', async () => {
  reinitExt();
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const image = await imageUnsplash({ UNSPLASH_KEY: 'cle-unsplash' }, 'Eiffel Tower Paris', 'La tour Eiffel');
  assert.deepEqual(image, {
    src: 'https://images.unsplash.com/photo-1?w=1080',
    alt: 'Photo illustrant « La tour Eiffel »',
    largeur: 1080,
    hauteur: 810,
    credit: 'Photo : Paul Martin sur Unsplash',
    lien: 'https://unsplash.com/photos/u1?utm_source=koios&utm_medium=referral',
    source: 'unsplash',
    auteur: 'Paul Martin',
    lienAuteur: 'https://unsplash.com/@paul?utm_source=koios&utm_medium=referral',
    lienSource: 'https://unsplash.com/?utm_source=koios&utm_medium=referral',
  });
  const a = ext.appels[0];
  assert.equal(a.url.origin + a.url.pathname, 'https://api.unsplash.com/search/photos');
  assert.deepEqual(Object.fromEntries(a.url.searchParams), {
    query: 'Eiffel Tower Paris', per_page: '3', orientation: 'landscape', content_filter: 'high',
  });
  assert.equal(new Headers(a.init.headers).get('authorization'), 'Client-ID cle-unsplash');
  // Adresses hors Unsplash refusées ; lien déjà paramétré : « & » ; photo sans lien vers le photographe écartée.
  ext.unsplash = () => reponseWiki({ results: [
    photoUnsplash({ urls: { regular: 'https://exemple.test/x.jpg' } }),
    photoUnsplash({ links: { html: 'http://unsplash.com/photos/u2' } }),
    photoUnsplash({ user: { name: 'Sans profil', links: {} } }),
    photoUnsplash({ links: { html: 'https://unsplash.com/photos/u3?ixid=abc' } }),
  ] });
  const u3 = await imageUnsplash({ UNSPLASH_KEY: 'k' }, 'Eiffel', 'T');
  assert.equal(u3.lien, 'https://unsplash.com/photos/u3?ixid=abc&utm_source=koios&utm_medium=referral');
  assert.equal(u3.auteur, 'Paul Martin');
  ext.appels.length = 0;
  assert.equal(await imageUnsplash({}, 'Eiffel', 'T'), null);
  assert.equal(ext.appels.length, 0);
  ext.unsplash = () => new Response('non', { status: 500 });
  assert.equal(await imageUnsplash({ UNSPLASH_KEY: 'k' }, 'Eiffel', 'T'), null);
  reinitExt();
});

test('images : Unsplash — links.download_location est appelé quand une photo est retenue (jamais pour une photo écartée)', async () => {
  reinitExt();
  const dl = 'https://api.unsplash.com/photos/u1/download?ixid=abc';
  ext.unsplash = (u) => (u.pathname.endsWith('/download') ? reponseWiki({ url: 'https://images.unsplash.com/photo-1' }) : reponseWiki({ results: [
    photoUnsplash({ urls: { regular: 'https://exemple.test/x.jpg' }, links: { html: 'https://unsplash.com/photos/ecartee', download_location: 'https://api.unsplash.com/photos/ecartee/download' } }),
    photoUnsplash({ links: { html: 'https://unsplash.com/photos/u1', download_location: dl } }),
  ] }));
  const image = await imageUnsplash({ UNSPLASH_KEY: 'cle-unsplash' }, 'Eiffel Tower', 'T');
  assert.equal(image.credit, 'Photo : Paul Martin sur Unsplash');
  assert.deepEqual(ext.appels.map((x) => x.url.pathname), ['/search/photos', '/photos/u1/download'], 'un seul appel de téléchargement, pour la photo retenue');
  assert.equal(ext.appels[1].url.search, '?ixid=abc');
  assert.equal(new Headers(ext.appels[1].init.headers).get('authorization'), 'Client-ID cle-unsplash');
  // Avec waitUntil : l'appel est confié à Workers, la réponse n'attend pas.
  ext.appels.length = 0;
  const promesses = [];
  assert.ok(await imageUnsplash({ UNSPLASH_KEY: 'k' }, 'Eiffel', 'T', { waitUntil: (p) => promesses.push(p) }));
  assert.equal(promesses.length, 1);
  await Promise.all(promesses);
  assert.equal(ext.appels.length, 2);
  // Adresse de téléchargement hors Unsplash : ignorée, la photo reste utilisable.
  ext.appels.length = 0;
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash({ links: { html: 'https://unsplash.com/photos/u1', download_location: 'https://exemple.test/download' } })] });
  assert.ok(await imageUnsplash({ UNSPLASH_KEY: 'k' }, 'Eiffel', 'T'));
  assert.equal(ext.appels.length, 1);
  // Une panne de l'appel de téléchargement ne retire pas la photo.
  ext.unsplash = (u) => (u.pathname.endsWith('/download') ? new Response('panne', { status: 500 }) : reponseWiki({ results: [photoUnsplash({ links: { html: 'https://unsplash.com/photos/u1', download_location: dl } })] }));
  assert.ok(await imageUnsplash({ UNSPLASH_KEY: 'k' }, 'Eiffel', 'T'));
  reinitExt();
});

// --- Wikimedia Commons ---

const fichierCommons = (index, { meta = {}, info = {}, page = {} } = {}) => ({
  pageid: 100 + index,
  ns: 6,
  title: `File:Photo_${index}_Eiffel_Tower_tour.jpg`,
  index,
  imageinfo: [{
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${index}/Photo_${index}.jpg/1200px-Photo_${index}.jpg`,
    thumbwidth: 1200,
    thumbheight: 800,
    url: `https://upload.wikimedia.org/wikipedia/commons/a/a${index}/Photo_${index}.jpg`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:Photo_${index}.jpg`,
    width: 3000,
    height: 2000,
    mime: 'image/jpeg',
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'Jeanne Dupont' }, ...meta },
    ...info,
  }],
  ...page,
});
// Commons renvoie les pages dans un objet indexé par identifiant : l'ordre vient du champ index.
const reponseCommons = (...fichiers) => reponseWiki({ batchcomplete: '', query: { pages: Object.fromEntries(fichiers.map((f) => [f.pageid, f])) } });
const sansResultat = () => reponseWiki({ batchcomplete: '' });

test('images : licenceLibre — domaine public, CC0, CC BY et CC BY-SA seulement', () => {
  for (const ok of ['Public domain', 'CC0', 'CC0 1.0', 'CC BY 2.0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC BY-SA 2.5', 'CC BY-SA 3.0 de', 'CC BY-SA', 'cc by-sa 4.0']) {
    assert.equal(licenceLibre(ok), true, ok);
  }
  for (const non of ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'CC BY-NC-SA 3.0', 'CC BY-NC-ND 4.0', 'CC BY-ND', 'CC BY-NC', 'GFDL', 'Copyrighted free use', 'Fair use', 'Attribution', '', null, undefined, 42]) {
    assert.equal(licenceLibre(non), false, String(non));
  }
});

test('images : texteDeHtml — balises retirées, entités décodées, espaces réduits', () => {
  assert.equal(texteDeHtml('<a href="//commons.wikimedia.org/wiki/User:Jeanne" title="User:Jeanne">Jeanne</a>'), 'Jeanne');
  assert.equal(texteDeHtml('<bdi>Jeanne &amp; Paul&#160;D&#233;pont</bdi>\n\n<span>(Own work)</span>'), 'Jeanne & Paul Dépont (Own work)');
  assert.equal(texteDeHtml('&lt;script&gt;x&lt;/script&gt;'), 'scriptx/script', 'un texte qui ressemble à du HTML n’en redevient pas');
  assert.equal(texteDeHtml('&#0;&#x110000;ok'), 'ok');
  assert.equal(texteDeHtml(undefined), null);
  assert.equal(texteDeHtml(12), null);
});

test('images : Commons — requête, User-Agent, licence non libre écartée, petite image écartée, crédit nettoyé du HTML', async () => {
  reinitExt();
  ext.commons = () => reponseCommons(
    fichierCommons(3, { meta: { Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Marie">Marie &amp; Paul <i>L&#233;vy</i></a>' } } }),
    fichierCommons(1, { meta: { LicenseShortName: { value: 'CC BY-NC 4.0' } } }), // licence non libre
    fichierCommons(2, { info: { width: 799, height: 532 } }), // trop petite
    fichierCommons(4, { meta: { NonFree: { value: 'true' } } }), // marquée non libre malgré la licence
  );
  const r = await chercherCommons('Eiffel Tower', 'La tour Eiffel');
  assert.equal(r.incertain, false);
  assert.deepEqual(r.image, {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Photo_3.jpg/1200px-Photo_3.jpg',
    alt: 'Photo illustrant « La tour Eiffel »',
    largeur: 1200,
    hauteur: 800,
    credit: 'Marie & Paul Lévy · CC BY-SA 4.0 · Wikimédia Commons',
    lien: 'https://commons.wikimedia.org/wiki/File:Photo_3.jpg',
    source: 'commons',
  }, 'le 3 est le premier valable : 1 (licence), 2 (799 px) sont écartés');
  const a = ext.appels[0];
  assert.equal(a.url.origin + a.url.pathname, 'https://commons.wikimedia.org/w/api.php');
  const p = Object.fromEntries(a.url.searchParams);
  assert.equal(p.action, 'query');
  assert.equal(p.format, 'json');
  assert.equal(p.generator, 'search');
  assert.equal(p.gsrnamespace, '6');
  assert.equal(p.gsrsearch, 'Eiffel Tower filetype:bitmap -hastemplate:"PD-algorithm"');
  assert.equal(p.prop, 'imageinfo');
  assert.equal(p.iiprop.split('|').sort().join('|'), 'extmetadata|mime|size|url');
  assert.equal(p.iiurlwidth, '1200');
  assert.equal(new Headers(a.init.headers).get('user-agent'), USER_AGENT_COMMONS);
  assert.equal(USER_AGENT_COMMONS, 'Koios/2 (https://koios.gregoire-muel.workers.dev)');
  assert.ok(a.init.signal instanceof AbortSignal);
  // Pas d'opérateur de recherche venu du visiteur.
  ext.appels.length = 0;
  await chercherCommons('tour "insource:x" -Eiffel incategory:Paris', 'T');
  assert.equal(ext.appels[0].url.searchParams.get('gsrsearch'), 'tour insource x Eiffel incategory Paris filetype:bitmap -hastemplate:"PD-algorithm"');
  reinitExt();
});

test('images : Commons — largeur d’au moins 800 px, types d’image, JPEG avant PNG, adresses Wikimedia, auteur', async () => {
  reinitExt();
  const un = (...f) => { ext.commons = () => reponseCommons(...f); return chercherCommons('Eiffel', 'T'); };
  assert.ok((await un(fichierCommons(1, { info: { width: 800, height: 533 } }))).image, '800 px suffisent');
  assert.equal((await un(fichierCommons(1, { info: { width: 799 } }))).image, null);
  assert.equal((await un(fichierCommons(1, { info: { width: undefined } }))).image, null, 'largeur inconnue : écartée');
  assert.equal((await un(fichierCommons(1, { info: { mime: 'image/gif' } }))).image, null);
  assert.equal((await un(fichierCommons(1, { info: { mime: 'image/svg+xml' } }))).image, null);
  // Les JPEG passent avant les PNG, quel que soit le rang ; sans JPEG, le PNG est pris.
  const png = fichierCommons(1, { info: { mime: 'image/png' } });
  const jpg = fichierCommons(2);
  assert.equal((await un(png, jpg)).image.lien, 'https://commons.wikimedia.org/wiki/File:Photo_2.jpg');
  assert.equal((await un(png)).image.lien, 'https://commons.wikimedia.org/wiki/File:Photo_1.jpg');
  // Adresses hors Wikimedia refusées.
  const sansMiniature = (await un(fichierCommons(1, { info: { thumburl: 'https://exemple.test/x.jpg', width: 1500, height: 1000 } }))).image;
  assert.equal(sansMiniature.src, 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Photo_1.jpg', 'sans miniature valable : l’original, s’il n’est pas énorme');
  assert.deepEqual([sansMiniature.largeur, sansMiniature.hauteur], [1500, 1000]);
  assert.equal((await un(fichierCommons(1, { info: { thumburl: 'https://exemple.test/x.jpg', width: 6000 } }))).image, null, 'ni miniature valable ni original raisonnable');
  assert.equal((await un(fichierCommons(1, { info: { descriptionurl: 'https://exemple.test/page' } }))).image, null);
  assert.equal((await un(fichierCommons(1, { info: { descriptionurl: 'http://commons.wikimedia.org/wiki/File:X.jpg' } }))).image, null);
  // Domaine public et CC0 : pas d'auteur exigé. CC BY et CC BY-SA : auteur obligatoire.
  const sansAuteur = (licence) => fichierCommons(1, { meta: { LicenseShortName: { value: licence }, Artist: { value: '<a href="x"> </a>' } } });
  assert.equal((await un(sansAuteur('Public domain'))).image.credit, 'Public domain · Wikimédia Commons');
  assert.equal((await un(sansAuteur('CC0'))).image.credit, 'CC0 · Wikimédia Commons');
  assert.equal((await un(sansAuteur('CC BY 4.0'))).image, null);
  assert.equal((await un(sansAuteur('CC BY-SA 3.0'))).image, null);
  // Auteur de plus de 80 caractères : coupé à 80, avec « … ».
  const long = (await un(fichierCommons(1, { meta: { Artist: { value: '<b>' + 'Auteur '.repeat(20) + '</b>' } } }))).image.credit;
  assert.equal(long.split(' · ')[0].length, 80);
  assert.ok(long.startsWith('Auteur Auteur') && long.split(' · ')[0].endsWith('…'));
  // Réponse en tableau (formatversion=2) : même résultat ; pages absentes, panne, JSON illisible : incertain seulement en cas de panne.
  ext.commons = () => reponseWiki({ query: { pages: [fichierCommons(2), fichierCommons(1)] } });
  assert.equal((await chercherCommons('Eiffel', 'T')).image.lien, 'https://commons.wikimedia.org/wiki/File:Photo_1.jpg', 'le champ index fixe l’ordre');
  ext.commons = sansResultat;
  assert.deepEqual(await chercherCommons('Eiffel', 'T'), { image: null, incertain: false });
  for (const rep of [() => new Response('non', { status: 429 }), () => new Response('<html>', { status: 200 })]) {
    ext.commons = rep;
    assert.deepEqual(await chercherCommons('Eiffel', 'T'), { image: null, incertain: true });
  }
  ext.commons = () => { throw new Error('réseau coupé'); };
  assert.deepEqual(await chercherCommons('Eiffel', 'T'), { image: null, incertain: true });
  ext.appels.length = 0;
  assert.deepEqual(await chercherCommons('   ', 'T'), { image: null, incertain: false });
  assert.equal(ext.appels.length, 0);
  reinitExt();
});

test('images : Commons — un fichier sans mot de la requête (titre ou description) est écarté, les autres sont classés par pertinence', async () => {
  reinitExt();
  const f = (i, titre, extra = {}) => fichierCommons(i, { page: { title: 'File:' + titre }, ...extra });
  const requete = 'gemstone faceted ruby sapphire';
  // Premier résultat hors sujet (un bijou de musée sans rapport) : il n'est pas pris.
  ext.commons = () => reponseCommons(f(1, 'Tiara of Queen Alexandra.jpg'), f(2, 'Cut Gemstone collection.jpg'), f(3, 'Faceted ruby and sapphire gemstones.jpg'));
  assert.equal((await chercherCommons(requete, 'Gemmologie')).image.lien, 'https://commons.wikimedia.org/wiki/File:Photo_3.jpg', 'le plus de mots dans le titre gagne');
  // Aucun fichier pertinent : pas d'image (l'app affiche alors la tuile d'icône).
  ext.commons = () => reponseCommons(f(1, 'Tiara of Queen Alexandra.jpg'), f(2, 'Eiffel Tower at night.jpg'));
  assert.deepEqual(await chercherCommons(requete, 'Gemmologie'), { image: null, incertain: false });
  // La description compte (1 point) ; le titre pèse plus (2 points).
  const description = (t) => ({ meta: { ImageDescription: { value: '<p>' + t + '</p>' } } });
  ext.commons = () => reponseCommons(f(1, 'IMG_2043.jpg', description('A large sapphire')), f(2, 'Sapphire.jpg'));
  assert.match((await chercherCommons(requete, 'G')).image.lien, /Photo_2\.jpg$/, 'le titre passe avant la description');
  ext.commons = () => reponseCommons(f(1, 'IMG_2043.jpg', description('A large faceted sapphire')), f(2, 'IMG_9.jpg'));
  assert.match((await chercherCommons(requete, 'G')).image.lien, /Photo_1\.jpg$/, 'description seule : acceptée');
  // À pertinence égale, le JPEG passe avant le PNG, puis l'ordre de la recherche.
  const png = f(1, 'Ruby.png', { info: { mime: 'image/png' } });
  ext.commons = () => reponseCommons(png, f(2, 'Ruby.jpg'));
  assert.match((await chercherCommons('ruby', 'R')).image.lien, /Photo_2\.jpg$/);
  // Pluriels et accents : « émeraudes » trouve « Emeraude ».
  ext.commons = () => reponseCommons(f(1, 'Emeraude brute.jpg'));
  assert.ok((await chercherCommons('émeraudes', 'E')).image);
  // Requête sans mot significatif (mots vides, deux lettres) : aucun tri possible, on garde le premier.
  ext.commons = () => reponseCommons(f(1, 'Quelque chose.jpg'));
  assert.ok((await chercherCommons('of an', 'x')).image);
  reinitExt();
  assert.deepEqual(motsSignificatifs('The Faceted Gemstones, rubis & Émeraude !'), ['faceted', 'gemstone', 'rubi', 'emeraude']);
  assert.equal(pertinence(['ruby'], { title: 'File:Ruby_ring.jpg' }, ''), 2);
  assert.equal(pertinence(['ruby'], { title: 'File:IMG.jpg' }, 'a ruby'), 1);
  assert.equal(pertinence(['ruby'], { title: 'File:IMG.jpg' }, 'rien'), 0);
});

const GET_IMAGE = (q, source) => `?q=${encodeURIComponent(q)}${source ? '&source=' + source : ''}`;
const ENV_IMAGE = () => ({ DB: db, UNSPLASH_KEY: 'cle-unsplash' });

test('image GET : source auto = Commons d’abord, Unsplash seulement sans résultat libre ; même forme de réponse', async () => {
  reinitExt();
  db.base.exec('DELETE FROM images');
  db.base.exec('DELETE FROM quotas');
  ext.commons = () => reponseCommons(fichierCommons(1));
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const r = await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('Eiffel Tower') });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['image']);
  assert.deepEqual(Object.keys(r.corps.image), ['src', 'alt', 'largeur', 'hauteur', 'credit', 'lien', 'source']);
  assert.equal(r.corps.image.source, 'commons');
  assert.deepEqual(ext.appels.map((x) => x.fournisseur), ['commons'], 'Unsplash n’est pas appelé quand Commons répond');
  // Aucune image libre sur Commons (licence NC) : repli Unsplash, avec les liens exigés et l'appel de téléchargement.
  reinitExt();
  ext.commons = () => reponseCommons(fichierCommons(1, { meta: { LicenseShortName: { value: 'CC BY-NC 2.0' } } }));
  ext.unsplash = (u) => (u.pathname.endsWith('/download') ? reponseWiki({}) : reponseWiki({ results: [photoUnsplash({ links: { html: 'https://unsplash.com/photos/u1', download_location: 'https://api.unsplash.com/photos/u1/download?ixid=z' } })] }));
  const repli = await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('Ambiance nordique') });
  ok200(repli);
  assert.deepEqual(ext.appels.map((x) => x.fournisseur + x.url.pathname), ['commons/w/api.php', 'unsplash/search/photos', 'unsplash/photos/u1/download']);
  assert.equal(repli.corps.image.source, 'unsplash');
  assert.equal(repli.corps.image.credit, 'Photo : Paul Martin sur Unsplash');
  assert.equal(repli.corps.image.lienAuteur, 'https://unsplash.com/@paul?utm_source=koios&utm_medium=referral');
  assert.equal(repli.corps.image.lienSource, 'https://unsplash.com/?utm_source=koios&utm_medium=referral');
  assert.equal(repli.corps.image.largeur, 1080);
  // Ni Commons ni Unsplash : null (mis en cache). Sans clé Unsplash : Commons seul.
  reinitExt();
  ext.commons = sansResultat;
  ext.unsplash = () => reponseWiki({ results: [] });
  assert.deepEqual((await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('Zzz introuvable') })).corps, { image: null });
  reinitExt();
  ext.commons = sansResultat;
  assert.deepEqual((await appel(imageGet, { env: { DB: db }, requete: GET_IMAGE('Sans clé unsplash') })).corps, { image: null });
  assert.deepEqual(ext.appels.map((x) => x.fournisseur), ['commons']);
  reinitExt();
});

test('image GET : source commons ou unsplash seule, défaut auto, source inconnue refusée, requête trop courte refusée', async () => {
  reinitExt();
  db.base.exec('DELETE FROM images');
  db.base.exec('DELETE FROM quotas');
  ext.commons = () => reponseCommons(fichierCommons(1));
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const c = await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('Eiffel', 'commons') });
  assert.equal(c.corps.image.source, 'commons');
  assert.deepEqual(ext.appels.map((x) => x.fournisseur), ['commons']);
  reinitExt();
  ext.commons = () => reponseCommons(fichierCommons(1));
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const u = await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('Eiffel', 'unsplash') });
  assert.equal(u.corps.image.source, 'unsplash');
  assert.deepEqual(ext.appels.map((x) => x.fournisseur), ['unsplash'], 'Commons n’est pas appelé');
  erreurFr(await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('Eiffel', 'pexels') }), 400);
  erreurFr(await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('Eiffel', 'COMMONS') }), 400);
  erreurFr(await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('x') }), 400);
  erreurFr(await appel(imageGet, { env: ENV_IMAGE(), requete: '' }), 400);
  // La requête est coupée à 80 caractères.
  reinitExt();
  ext.commons = sansResultat;
  ext.unsplash = () => reponseWiki({ results: [] });
  await appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE('mot '.repeat(40)) });
  assert.equal(ext.appels[0].url.searchParams.get('gsrsearch').replace(' filetype:bitmap -hastemplate:"PD-algorithm"', '').length <= 80, true);
  reinitExt();
});

test('image GET : cache par source et par requête (absence comprise), pas de cache en cas de panne, quota de 400 recherches', async () => {
  reinitExt();
  db.base.exec('DELETE FROM images');
  db.base.exec('DELETE FROM quotas');
  ext.commons = () => reponseCommons(fichierCommons(1, { page: { title: 'File:Eiffel Tower, Sujet en panne, Quota un.jpg' } }));
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const lire = (q, source) => appel(imageGet, { env: ENV_IMAGE(), requete: GET_IMAGE(q, source) });
  const premiere = await lire('Eiffel Tower', 'commons');
  assert.equal(ext.appels.length, 1);
  assert.deepEqual((await lire('eiffel tower', 'commons')).corps, premiere.corps, 'même requête (casse ignorée) : lue en cache');
  assert.equal(ext.appels.length, 1, 'aucun nouvel appel');
  // Même texte, autre source : autre entrée de cache, autre appel.
  assert.equal((await lire('Eiffel Tower', 'unsplash')).corps.image.source, 'unsplash');
  assert.equal((await lire('Eiffel Tower')).corps.image.source, 'commons', 'auto a sa propre entrée');
  assert.equal((await lire('Eiffel Tower', 'auto')).corps.image.source, 'commons');
  assert.deepEqual(lignes('SELECT requete FROM images ORDER BY requete').map((x) => x.requete), ['auto:eiffel tower', 'commons:eiffel tower', 'unsplash:eiffel tower']);
  const avant = ext.appels.length;
  await lire('Eiffel Tower', 'unsplash');
  await lire('Eiffel Tower');
  assert.equal(ext.appels.length, avant, 'chaque source relit son entrée');
  // L'absence de résultat est mise en cache ; une panne du fournisseur ne l'est pas.
  ext.commons = sansResultat;
  assert.deepEqual((await lire('Sujet introuvable', 'commons')).corps, { image: null });
  const n = ext.appels.length;
  await lire('Sujet introuvable', 'commons');
  assert.equal(ext.appels.length, n);
  assert.equal(lignes('SELECT contenu FROM images WHERE requete = ?', 'commons:sujet introuvable')[0].contenu, 'null');
  ext.commons = () => new Response('trop de requêtes', { status: 429 });
  assert.deepEqual((await lire('Sujet en panne', 'commons')).corps, { image: null });
  assert.equal(lignes('SELECT requete FROM images WHERE requete = ?', 'commons:sujet en panne').length, 0, 'pas de cache après une panne');
  ext.commons = () => reponseCommons(fichierCommons(1, { page: { title: 'File:Eiffel Tower, Sujet en panne, Quota un.jpg' } }));
  assert.equal((await lire('Sujet en panne', 'commons')).corps.image.source, 'commons', 'la panne passée n’empêche pas la bonne réponse');
  // Quota : 400 recherches nouvelles par jour ; au-delà, null sans appel ; le cache reste lisible.
  db.base.exec("DELETE FROM quotas WHERE cle = 'image:total'");
  db.base.prepare("INSERT INTO quotas (cle, n, jour) VALUES ('image:total', 399, ?)").run(aujourdhui());
  ext.appels.length = 0;
  assert.equal((await lire('Quota un', 'commons')).corps.image.source, 'commons');
  assert.deepEqual((await lire('Quota deux', 'commons')).corps, { image: null });
  assert.equal(ext.appels.length, 1, 'le 401e appel n’atteint pas Commons');
  assert.equal((await lire('Quota un', 'commons')).corps.image.source, 'commons', 'lecture en cache malgré le quota');
  assert.deepEqual(lignes('SELECT requete FROM images WHERE requete = ?', 'commons:quota deux'), [], 'le refus de quota n’est pas mis en cache');
  db.base.exec('DELETE FROM quotas');
  reinitExt();
});

test('image GET : chercherImage — auto signale une panne seulement si rien n’a été trouvé', async () => {
  reinitExt();
  ext.commons = () => new Response('panne', { status: 500 });
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const secours = await chercherImage({ UNSPLASH_KEY: 'k' }, 'auto', 'Eiffel');
  assert.equal(secours.image.source, 'unsplash');
  assert.equal(secours.incertain, false, 'Unsplash a répondu : l’image est sûre');
  ext.unsplash = () => reponseWiki({ results: [] });
  assert.deepEqual(await chercherImage({ UNSPLASH_KEY: 'k' }, 'auto', 'Eiffel'), { image: null, incertain: true }, 'Commons en panne et rien chez Unsplash : on ne retient pas l’absence');
  ext.commons = sansResultat;
  assert.deepEqual(await chercherImage({ UNSPLASH_KEY: 'k' }, 'auto', 'Eiffel'), { image: null, incertain: false });
  reinitExt();
});

test('images : photo de tête = Unsplash, sinon image de la page Wikipédia complétée par Commons (auteur, licence, lien) ; sinon rien', async () => {
  reinitExt();
  reinitWiki();
  const pages = [await lirePage('Tour Eiffel', OPTIONS_FR)];
  const cles = { UNSPLASH_KEY: 'u' };
  const tete = (env) => imageDeTete(env, { motImage: 'Eiffel Tower Paris', titre: 'La tour Eiffel', pages });
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  assert.match((await tete(cles)).credit, /sur Unsplash$/);
  ext.unsplash = () => new Response('panne', { status: 500 });
  ext.commons = () => reponseCommons(fichierCommons(7, { meta: { Artist: { value: '<a>Jeanne</a>' } } }));
  const wikimedia = await tete(cles);
  assert.equal(wikimedia.credit, 'Jeanne · CC BY-SA 4.0 · Wikimédia Commons');
  assert.equal(wikimedia.source, 'commons');
  assert.equal(wikimedia.alt, 'Illustration de « Tour Eiffel »');
  assert.match(wikimedia.lien, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  const c = ext.appels.filter((x) => x.fournisseur === 'commons').at(-1).url.searchParams;
  assert.equal(c.get('titles'), 'File:Tour Eiffel Wikimedia Commons.jpg');
  // Sans fiche libre (licence non libre, pas d'auteur, panne, fichier local à Wikipédia) : l'image n'est pas utilisée.
  for (const rep of [
    () => reponseCommons(fichierCommons(7, { meta: { LicenseShortName: { value: 'CC BY-NC 4.0' } } })),
    () => reponseCommons(fichierCommons(7, { meta: { Artist: { value: '' } } })),
    () => reponseCommons(fichierCommons(7, { meta: { Categories: { value: 'Photos|AI-generated images' } } })),
    () => reponseCommons(fichierCommons(7, { meta: { ImageDescription: { value: 'Image made with PD-algorithm' } } })),
    () => reponseWiki({ query: { pages: { '-1': { title: 'File:X', missing: '' } } } }),
    () => new Response('panne', { status: 500 }),
  ]) {
    ext.commons = rep;
    assert.equal(await tete(cles), null);
  }
  assert.equal(await imageDeTete({}, { motImage: 'x', titre: 'T', pages: [{ titre: 'Sans image', image: null }] }), null);
  assert.equal(await imageDesPages([]), null);
  assert.equal(await imageWikipedia({ lien: 'https://fr.wikipedia.org/wiki/Tour_Eiffel' }), null);
  // Requête : motImage, sinon le titre ; nettoyée.
  assert.equal(requeteImage('  Eiffel   Tower: Paris!! ', 'Titre'), 'Eiffel Tower Paris');
  assert.equal(requeteImage(null, 'La tour Eiffel'), 'La tour Eiffel');
  assert.equal(requeteImage('x'.repeat(200), 'T').length, 80);
  reinitExt();
});

// --- Wikipédia FR et EN ---

test('wiki v2 : anglais, 6 000 caractères, User-Agent 2.0, lien interlangue ; la v1.1 reste inchangée', async () => {
  reinitWiki();
  assert.equal(USER_AGENT_V2, 'Koios/2.0 (https://koios.gregoire-muel.workers.dev)');
  assert.equal(MAX_TEXTE_V2, 6000);
  wiki.rechercheEn = () => ['Eiffel Tower'];
  const en = await ancrer('Eiffel Tower', 'Eiffel Tower', OPTIONS_EN);
  const [recherche, lecture] = wiki.appels;
  assert.equal(recherche.url.origin + recherche.url.pathname, 'https://en.wikipedia.org/w/api.php');
  assert.deepEqual(Object.fromEntries(recherche.url.searchParams), { action: 'query', list: 'search', srsearch: 'Eiffel Tower', srlimit: '3', format: 'json', utf8: '1' });
  assert.equal(lecture.url.hostname, 'en.wikipedia.org');
  for (const a of wiki.appels) assert.equal(new Headers(a.init.headers).get('user-agent'), USER_AGENT_V2);
  assert.equal(en.langue, 'en');
  assert.ok(en.texte.length <= 6000 && en.texte.length > 5900, 'coupé à 6 000 caractères : ' + en.texte.length);
  assert.ok(!en.texte.includes('DO NOT READ'), 'fin d’article anglaise retirée');
  assert.equal(en.url, 'https://en.wikipedia.org/wiki/Eiffel_Tower');
  assert.equal(en.image.page, 'https://en.wikipedia.org/wiki/File:Eiffel_Tower_Wikimedia_Commons.jpg');
  assert.deepEqual(sourceDe(en), ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower']);
  // Français v2 : 6 000 caractères aussi ; v1.1 : toujours 7 000 et User-Agent 1.1.
  wiki.pages['Tour Eiffel'] = { extract: 'a'.repeat(20000), image: null };
  assert.equal((await lirePage('Tour Eiffel', OPTIONS_FR)).texte.length, 6000);
  assert.equal((await lirePage('Tour Eiffel')).texte.length, 7000);
  const v1 = wiki.appels[wiki.appels.length - 1];
  assert.equal(new Headers(v1.init.headers).get('user-agent'), USER_AGENT);
  assert.equal(v1.url.hostname, 'fr.wikipedia.org');
  assert.deepEqual(sourceDe({ titre: 'Tour Eiffel', url: 'https://fr.wikipedia.org/wiki/Tour_Eiffel' }), ['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel']);
  // Lien interlangue.
  reinitWiki();
  assert.equal(await titreEnDe('Tour Eiffel'), 'Eiffel Tower');
  assert.equal(await titreEnDe('Maurice Koechlin'), null);
  assert.equal(await titreEnDe(''), null);
  const ll = wiki.appels[0];
  assert.deepEqual(Object.fromEntries(ll.url.searchParams), { action: 'query', prop: 'langlinks', lllang: 'en', lllimit: '1', titles: 'Tour Eiffel', format: 'json', redirects: '1' });
  wiki.panne = 500;
  assert.equal(await titreEnDe('Tour Eiffel'), null);
  assert.equal(await lirePage('Eiffel Tower', OPTIONS_EN), null);
  reinitWiki();
});

test('références : une ligne de sources redonne la langue et le titre de la page', async () => {
  assert.deepEqual(referenceDe(['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel']), { langue: 'fr', titre: 'Tour Eiffel' });
  assert.deepEqual(referenceDe(['x', 'https://en.wikipedia.org/wiki/Caf%C3%A9_(drink)']), { langue: 'en', titre: 'Café (drink)' });
  for (const mauvais of [null, ['x'], ['x', 'https://exemple.test/wiki/A'], ['x', 'https://de.wikipedia.org/wiki/A'], ['x', 'https://fr.wikipedia.org/wiki/A%E0%A4%A'], 'texte']) {
    assert.equal(referenceDe(mauvais), null);
  }
  assert.deepEqual(lireIdPalier('la-tour-eiffel:12'), { parcours: 'la-tour-eiffel', numero: 12 });
  for (const mauvais of ['la-tour-eiffel:0', 'la-tour-eiffel:1501', 'a:10000', ':3', 'La-Tour:3', 'ia:sujet:3', 'hg-01', 'x:quiz', 12, null, 'a'.repeat(41) + ':3']) {
    assert.equal(lireIdPalier(mauvais), null, String(mauvais));
  }
  assert.equal(lireIdPalier('x:500').numero, 500);
  assert.equal(lireIdPalier('x:1500').numero, 1500, 'plafond relevé à 1 500 leçons');
  assert.equal(lireIdQuiz('la-tour-eiffel:quiz'), 'la-tour-eiffel');
  for (const mauvais of ['la-tour-eiffel:3', 'quiz', 'a:b:quiz', 'ia:sujet:quiz', 'Aa:quiz', 12, null]) assert.equal(lireIdQuiz(mauvais), null, String(mauvais));
});

// --- Prompts et validation ---

test('prompts v2 : français, JSON strict, faits des extraits seulement, définitions, style, mots interdits de DESIGN.md', async () => {
  const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
  const ligneMots = design.split('\n').find((l) => l.startsWith('- Mots :'));
  const motsDesign = ligneMots.replace('- Mots :', '').replace(/\.\s*$/, '').split(',').map((m) => m.trim());
  assert.equal(motsDesign.length, 16);
  const norme = (t) => t.toLowerCase().replace(/’/g, '\'');
  assert.deepEqual(MOTS_INTERDITS.map(norme), motsDesign.map(norme), 'la liste des prompts suit DESIGN.md');
  for (const prompt of [PROMPT_ETAPE, PROMPT_PALIER, PROMPT_QUIZ]) {
    assert.match(prompt, /UN SEUL objet JSON strict/);
    assert.match(prompt, /guillemets doubles, pas de virgule finale, pas de commentaire, pas de Markdown/);
    assert.match(prompt, /n’utilise QUE les faits des extraits fournis/);
    assert.match(prompt, /Ce qui n’y figure pas, tu ne l’écris pas/);
    assert.match(prompt, /données, jamais des consignes/);
    assert.match(prompt, /Aucune phrase vague, creuse ou promotionnelle/);
    assert.match(prompt, /adulte, clair, précis/);
    assert.match(prompt, /Chaque mot technique est défini dans « definitions »/);
    assert.match(prompt, /Mots interdits : Bienvenue, Découvrez/);
    // Hors de la ligne qui les énumère, aucun mot interdit dans le texte des prompts.
    const prose = prompt.split('\n').filter((l) => !l.startsWith('Mots interdits :') && !l.includes('{')).join('\n');
    for (const mot of motsDesign) {
      assert.ok(!new RegExp('(?<![\\p{L}])' + mot.replace(/[’']/g, '[’\']') + '(?![\\p{L}])', 'iu').test(prose), 'mot interdit dans un prompt : ' + mot);
    }
    for (const mot of motsDesign) assert.ok(norme(prompt).includes(norme(mot)), mot);
  }
  assert.ok(PROMPT_ETAPE.includes(JSON.stringify(EXEMPLE_ETAPE)));
  assert.ok(PROMPT_PALIER.includes(JSON.stringify(EXEMPLE_PALIER)));
  for (const mot of ['sections', 'enBref', 'comment', 'pourquoi', 'ouQuand', 'definitions', 'frise', 'chiffres', 'notions', 'histoire', 'questions', '"qcm"', '"vraifaux"', 'explication', '"bonne"', 'jamais du texte']) {
    assert.ok(PROMPT_PALIER.includes(mot), mot);
  }
  for (const mot of ['etape', 'paliers', 'resume', 'motImage', 'anglais', '10 titres']) assert.ok(PROMPT_ETAPE.includes(mot), mot);
  assert.match(PROMPT_VERIFICATION, /verdicts/);
  assert.match(PROMPT_VERIFICATION, /vrai[\s\S]*faux[\s\S]*incertain/);
  assert.match(PROMPT_VERIFICATION, /extraits ET tes connaissances sûres/);
  assert.match(PROMPT_VERIFICATION, /UN SEUL objet JSON strict/);
  assert.match(PROMPT_QUIZ, /10 questions/);
  // Les exemples respectent leurs propres règles.
  assert.ok(validerRedaction(EXEMPLE_PALIER).valeur, validerRedaction(EXEMPLE_PALIER).raison);
  assert.ok(validerEtape(EXEMPLE_ETAPE, { premiere: true }).valeur, validerEtape(EXEMPLE_ETAPE, { premiere: true }).raison);
  assert.ok(validerQuiz(quizBrut()).valeur, validerQuiz(quizBrut()).raison);
  assert.ok(validerQuiz({ questions: EXEMPLE_PALIER.questions.concat(quizBrut().questions) }).valeur);
});

test('filtre des mots promotionnels : sans accent ni casse, seulement ceux qui n’ont aucun autre sens', async () => {
  for (const promo of ['Bienvenue dans la tour', 'Découvrez la tour', 'N\'hésitez pas à lire', 'N’HÉSITEZ PAS', 'Au cœur de Paris', 'au coeur de la ville', 'Un monument incontournable', 'des sites incontournables', 'pour sublimer le fer', 'Un écrin de fer', 'un monument d’exception', 'Une beauté intemporelle', 'En savoir plus ici']) {
    assert.equal(contientInterdit(promo), true, promo);
  }
  for (const permis of ['Une expérience de physique en 1887', 'L’Univers est en expansion', 'La Passion selon saint Matthieu', 'Un véritable chef-d’œuvre', 'La sublimation de la glace', 'Un coeur de fer', 'incontournablement', 'Bienvenues']) {
    assert.equal(contientInterdit(permis), false, permis);
  }
});

test('validerRedaction : le palier de l’exemple est accepté, avec la forme interne attendue', async () => {
  const r = validerRedaction(palierBrut());
  assert.ok(r.valeur, r.raison);
  const b = r.valeur;
  assert.deepEqual(Object.keys(b), ['sections', 'definitions', 'frise', 'chiffres', 'notions', 'histoire', 'questions']);
  assert.deepEqual(Object.keys(b.sections), ['enBref', 'comment', 'pourquoi', 'ouQuand']);
  assert.equal(b.sections.enBref.length, 3);
  assert.equal(b.sections.ouQuand, null);
  assert.equal(b.definitions.length, 2);
  assert.equal(b.frise.length, 3);
  assert.deepEqual(b.chiffres, EXEMPLE_PALIER.chiffres);
  assert.deepEqual(b.notions, EXEMPLE_PALIER.notions);
  assert.equal(b.questions.length, 4);
  assert.deepEqual(b.questions.map((q) => q.type), ['qcm', 'qcm', 'vraifaux', 'qcm']);
  assert.deepEqual(Object.keys(b.questions[0]), ['type', 'enonce', 'reponses', 'bonne', 'explication']);
  assert.deepEqual(Object.keys(b.questions[2]), ['type', 'affirmation', 'vrai', 'explication']);
  assert.equal(aplatir(b).flatMap((u) => u.textes).length, TOTAL);
  // Champs inconnus écartés.
  const gros = { ...palierBrut(), surprise: 'x', citation: { texte: 'Inventée' } };
  assert.deepEqual(Object.keys(validerRedaction(gros).valeur), Object.keys(b));
});

test('validerRedaction : champs obligatoires stricts (enBref + une autre section, 2 définitions, 3 questions valides)', async () => {
  const modif = (fn) => { const p = palierBrut(); fn(p); return p; };
  const refus = (p, motif) => assert.ok(validerRedaction(p).raison, 'devrait être refusé : ' + motif);
  refus(null, 'null');
  refus([], 'tableau');
  refus(modif((p) => { delete p.sections; }), 'sections absentes');
  refus(modif((p) => { p.sections = 'texte'; }), 'sections en texte');
  refus(modif((p) => { p.sections.enBref = null; }), 'enBref nul');
  refus(modif((p) => { p.sections.enBref = ['Une seule phrase assez longue.']; }), 'enBref à 1 phrase');
  refus(modif((p) => { p.sections.enBref = Array(5).fill('Une phrase assez longue pour passer.'); }), 'enBref à 5 phrases');
  refus(modif((p) => { p.sections.enBref[0] = 'Court.'; }), 'phrase trop courte');
  refus(modif((p) => { p.sections.enBref[0] = 'x'.repeat(301); }), 'phrase trop longue');
  refus(modif((p) => { p.sections.enBref[0] = 12; }), 'phrase non texte');
  refus(modif((p) => { p.sections.enBref[0] = 'Bienvenue dans la tour de fer de Paris.'; }), 'mot promotionnel');
  refus(modif((p) => { p.sections.comment = null; p.sections.pourquoi = null; }), 'aucune autre section');
  refus(modif((p) => { delete p.definitions; }), 'définitions absentes');
  refus(modif((p) => { p.definitions.pop(); }), '1 définition');
  refus(modif((p) => { p.definitions[1].terme = 'x'; }), 'terme trop court : une seule valide');
  refus(modif((p) => { p.definitions[1] = 'Rivet : tige'; }), 'définition en texte');
  refus(modif((p) => { p.definitions = 'Rivet'; }), 'définitions en texte');
  refus(modif((p) => { p.questions = p.questions.slice(0, 2); }), '2 questions');
  refus(modif((p) => { p.questions = 'quatre'; }), 'questions en texte');
  refus(modif((p) => { delete p.questions; }), 'questions absentes');
  refus(modif((p) => { p.questions[0].bonne = 4; p.questions[1].bonne = -1; }), 'deux questions invalides sur quatre');
  assert.ok(validerRedaction(modif((p) => { p.sections.comment = null; })).valeur, 'comment nul : accepté');
  assert.ok(validerRedaction(modif((p) => { p.sections.ouQuand = p.sections.comment; p.sections.comment = null; p.sections.pourquoi = null; })).valeur, 'ouQuand suffit comme autre section');
  assert.ok(validerRedaction(modif((p) => { p.sections.enBref = Array(2).fill('Une phrase assez longue pour passer.'); })).valeur, '2 phrases : accepté');
  assert.ok(validerRedaction(modif((p) => { p.sections.enBref = Array(4).fill('Une phrase assez longue pour passer.'); })).valeur, '4 phrases : accepté');
  // Une section donnée en texte est découpée en phrases.
  const texte = modif((p) => { p.sections.enBref = 'La tour mesure 312 mètres. Elle est bâtie à Paris en 1889. Elle est en fer.'; });
  assert.equal(validerRedaction(texte).valeur.sections.enBref.length, 3);
  assert.deepEqual(decouperPhrases('Première phrase. Deuxième phrase ? Troisième… « Quatrième ». 5 mille.'), ['Première phrase.', 'Deuxième phrase ?', 'Troisième…', '« Quatrième ».', '5 mille.']);
});

test('validerRedaction : un champ facultatif invalide est retiré, sans échec', async () => {
  const modif = (fn) => { const p = palierBrut(); fn(p); return validerRedaction(p); };
  const section = modif((p) => {
    p.sections.comment = ['Une seule phrase assez longue.'];
    p.sections.pourquoi = Array(5).fill('Une phrase assez longue pour passer.');
    p.sections.ouQuand = ['Les travaux durent de 1887 à 1889.', 'La tour ouvre au public en 1889.'];
  });
  assert.ok(section.valeur, section.raison);
  assert.equal(section.valeur.sections.comment, null);
  assert.equal(section.valeur.sections.pourquoi, null);
  assert.equal(section.valeur.sections.ouQuand.length, 2);
  assert.ok(section.valeur.sections.enBref);
  const promo = modif((p) => { p.sections.comment[0] = 'Un monument incontournable pour tous les visiteurs.'; });
  assert.equal(promo.valeur.sections.comment, null, 'une phrase promotionnelle retire la section facultative');
  // Frise : 0 ou 3 à 6 dates.
  assert.deepEqual(modif((p) => { p.frise = []; }).valeur.frise, []);
  assert.deepEqual(modif((p) => { p.frise.pop(); }).valeur.frise, [], '2 dates : retirées');
  assert.deepEqual(modif((p) => { p.frise = Array(7).fill({ date: '1889', evenement: 'Un événement quelconque.' }); }).valeur.frise, [], '7 dates');
  assert.deepEqual(modif((p) => { p.frise[1].evenement = 'x'; }).valeur.frise, [], 'événement trop court');
  assert.deepEqual(modif((p) => { delete p.frise; }).valeur.frise, []);
  assert.equal(modif((p) => { p.frise = Array(6).fill({ date: '1889', evenement: 'Un événement quelconque.' }); }).valeur.frise.length, 6);
  // Chiffres : valeurs numériques, même unité, 0 ou 3 à 6.
  assert.deepEqual(modif((p) => { p.chiffres[1].valeur = '312'; }).valeur.chiffres, [], 'valeur en texte');
  assert.deepEqual(modif((p) => { p.chiffres[1].unite = 'km'; }).valeur.chiffres, [], 'unités différentes');
  assert.deepEqual(modif((p) => { p.chiffres = p.chiffres.slice(0, 2); }).valeur.chiffres, [], '2 chiffres');
  assert.deepEqual(modif((p) => { p.chiffres[0].valeur = null; }).valeur.chiffres, [], 'valeur nulle');
  assert.deepEqual(modif((p) => { p.chiffres = []; }).valeur.chiffres, []);
  // Notions : nœuds des liens existants.
  assert.equal(modif((p) => { p.notions.liens[0][1] = 'Inconnu'; }).valeur.notions, null);
  assert.equal(modif((p) => { p.notions.noeuds.pop(); p.notions.noeuds.pop(); }).valeur.notions, null);
  assert.equal(modif((p) => { delete p.notions; }).valeur.notions, null);
  // Histoire : 30 à 400 caractères, sinon null.
  assert.equal(modif((p) => { p.histoire = 'Trop court.'; }).valeur.histoire, null);
  assert.equal(modif((p) => { p.histoire = 'x'.repeat(401); }).valeur.histoire, null);
  assert.equal(modif((p) => { p.histoire = null; }).valeur.histoire, null);
  assert.equal(modif((p) => { p.histoire = 'Une histoire au cœur de Paris qui dure depuis longtemps.'; }).valeur.histoire, null, 'mot promotionnel');
  assert.ok(modif((p) => { p.histoire = 'Une anecdote assez longue pour être acceptée par la validation.'; }).valeur.histoire);
  // Définitions : une entrée invalide est écartée si 2 restent ; 5 gardées au plus ; doublons écartés.
  const trois = modif((p) => { p.definitions.push({ terme: 'Rivet', definition: 'Un doublon exact du terme précédent.' }, { terme: 'Autre', definition: 'x' }, { terme: 'Poutrelle', definition: 'Pièce de fer longue et étroite, utilisée dans les charpentes.' }); });
  assert.deepEqual(trois.valeur.definitions.map((d) => d.terme), ['Fer puddlé', 'Rivet', 'Poutrelle']);
  const sept = modif((p) => { p.definitions = Array.from({ length: 7 }, (_, i) => ({ terme: 'Terme ' + i, definition: 'Une définition assez longue pour être valide.' })); });
  assert.equal(sept.valeur.definitions.length, 5);
});

test('questions : bonne 0-3, types, explications, doublons ; les choix sont mélangés et bonne suit la bonne réponse', async () => {
  const qcm = () => structuredClone(EXEMPLE_PALIER.questions[0]);
  const vf = () => structuredClone(EXEMPLE_PALIER.questions[2]);
  const q = validerQuestion(qcm());
  assert.deepEqual(Object.keys(q), ['type', 'enonce', 'reponses', 'bonne', 'explication']);
  assert.ok(q.enonce.endsWith('\u202f?'), 'l’espace fine insécable avant « ? » est conservée');
  assert.equal(q.reponses[q.bonne], 'L’Exposition universelle de 1889');
  assert.deepEqual([...q.reponses].sort(), [...qcm().reponses].sort());
  const places = new Set();
  for (let i = 0; i < 60; i++) {
    const m = validerQuestion(qcm());
    assert.ok(m.bonne >= 0 && m.bonne <= 3);
    assert.equal(m.reponses[m.bonne], 'L’Exposition universelle de 1889');
    places.add(m.bonne);
  }
  assert.ok(places.size >= 3, 'la bonne réponse change de place : ' + [...places]);
  assert.deepEqual(validerQuestion(vf()), vf());
  assert.equal(validerQuestion({ ...vf(), type: 'vrai-faux' }).type, 'vraifaux', 'orthographe du type tolérée');
  const refus = (x, motif) => assert.equal(validerQuestion(x), null, motif);
  for (const bonne of [4, -1, '1', 1.5, null, undefined]) refus({ ...qcm(), bonne }, 'bonne = ' + bonne);
  refus({ ...qcm(), reponses: qcm().reponses.slice(0, 3) }, '3 choix');
  refus({ ...qcm(), reponses: ['A', 'a', 'B', 'C'] }, 'choix en double à la casse près');
  refus({ ...qcm(), reponses: ['A', 'B', 'C', 12] }, 'choix non texte');
  refus({ ...qcm(), reponses: ['A', 'B', 'C', ''] }, 'choix vide');
  refus({ ...qcm(), enonce: 'Court' }, 'énoncé court');
  refus({ ...qcm(), explication: 'Trop court.' }, 'explication courte');
  refus({ ...qcm(), explication: 'x'.repeat(501) }, 'explication longue');
  refus({ ...qcm(), explication: 'La réponse B est juste, car la tour date de 1889.' }, 'place d’un choix citée');
  refus({ ...qcm(), enonce: 'Quel est le choix 3 pour la tour Eiffel ?' }, 'place d’un choix dans l’énoncé');
  refus({ ...qcm(), type: 'bluff' }, 'type inconnu');
  refus({ ...vf(), vrai: 'faux' }, 'vrai non booléen');
  refus({ ...vf(), affirmation: 'Courte' }, 'affirmation courte');
  refus({ ...vf(), explication: 'Un excellent monument incontournable de la capitale.' }, 'mot promotionnel');
  refus(null, 'null');
  refus('texte', 'texte');
  assert.ok(validerQuestion({ ...qcm(), explication: 'La réponse a été donnée en 1889, comme le montrent les sources.' }), '« réponse a été » n’est pas une place de choix');
  assert.ok(validerQuestion({ ...qcm(), explication: 'Le choix de 1889 est fixé par les sources consultées pour ce palier.' }), '« choix de » non plus');
  // Doublons d’énoncé écartés ; extra au-delà de 4 ignorés.
  const dup = palierBrut();
  dup.questions = [dup.questions[0], dup.questions[0], dup.questions[1], dup.questions[2], dup.questions[3]];
  assert.deepEqual(validerRedaction(dup).valeur.questions.map((x) => x.type), ['qcm', 'qcm', 'vraifaux', 'qcm']);
  const cinq = palierBrut();
  cinq.questions.push({ ...cinq.questions[0], enonce: 'Une cinquième question sur la tour Eiffel ?' });
  assert.equal(validerRedaction(cinq).valeur.questions.length, 4);
  // Quiz direct : 5 valides au moins, 10 gardées.
  assert.ok(validerQuiz({ questions: quizBrut().questions.slice(0, 5) }).valeur);
  assert.ok(validerQuiz({ questions: quizBrut().questions.slice(0, 4) }).raison);
  assert.equal(validerQuiz({ questions: quizBrut().questions.concat(EXEMPLE_PALIER.questions) }).valeur.questions.length, 10);
  assert.ok(validerQuiz({}).raison);
  assert.ok(validerQuiz(null).raison);
});

test('validerEtape : 10 titres courts et différents, sans répéter l’existant ; resume et motImage à l’étape 1', async () => {
  const modif = (fn, options = { premiere: true }) => { const e = etapeBrute(); fn(e); return validerEtape(e, options); };
  const ok = validerEtape(etapeBrute(), { premiere: true });
  assert.ok(ok.valeur, ok.raison);
  assert.deepEqual(Object.keys(ok.valeur), ['etape', 'paliers', 'resume', 'motImage']);
  assert.equal(ok.valeur.etape, 'Les bases de la tour');
  assert.equal(ok.valeur.motImage, 'Eiffel Tower Paris');
  assert.equal(ok.valeur.paliers.length, 10);
  const suite = validerEtape(etape2Brute(), { existants: etapeBrute().paliers });
  assert.deepEqual(Object.keys(suite.valeur), ['etape', 'paliers'], 'ni resume ni motImage aux étapes suivantes');
  const refus = (r, motif) => assert.ok(r.raison, 'devrait être refusé : ' + motif);
  refus(validerEtape(null), 'null');
  refus(validerEtape([]), 'tableau');
  refus(modif((e) => { e.paliers.pop(); }), '9 titres');
  refus(modif((e) => { e.paliers.push('Un onzième titre'); }), '11 titres');
  refus(modif((e) => { e.paliers = 'dix titres'; }), 'paliers en texte');
  refus(modif((e) => { e.paliers[3] = 'ab'; }), 'titre trop court');
  refus(modif((e) => { e.paliers[3] = 'x'.repeat(61); }), 'titre trop long');
  refus(modif((e) => { e.paliers[3] = 12; }), 'titre non texte');
  refus(modif((e) => { e.paliers[3] = e.paliers[4].toUpperCase(); }), 'titres identiques à la casse près');
  refus(modif((e) => { e.paliers[3] = 'Un symbole mondial'; }), 'titres identiques');
  refus(modif((e) => { e.paliers[0] = 'Bienvenue dans la tour Eiffel'; }), 'mot promotionnel');
  refus(modif((e) => { delete e.resume; }), 'resume absent');
  refus(modif((e) => { e.resume = 'Une seule phrase assez longue pour passer la longueur minimale demandée.'; }), 'resume à 1 phrase');
  refus(modif((e) => { e.resume = 'Court. Deux phrases.'; }), 'resume trop court');
  refus(modif((e) => { e.resume = 'x'.repeat(401); }), 'resume trop long');
  refus(validerEtape(etape2Brute(), { existants: ['Les ateliers de Levallois-Perret'] }), 'titre déjà publié');
  refus(validerEtape(etape2Brute(), { existants: ['LES ATELIERS DE LEVALLOIS-PERRET'] }), 'titre déjà publié à la casse près');
  refus(validerEtape(etape2Brute(), { existants: ['Les ateliers de Levallois-Perret'.normalize('NFD')] }), 'titre déjà publié, accents décomposés');
  // Facultatifs : étape sans titre valide, motImage invalide -> null.
  assert.equal(modif((e) => { e.etape = 'x'; }).valeur.etape, null);
  for (const mot of ['Tour Eiffel à Paris', 'x', '', 12, 'a b c d e f g', 'Eiffel <script>']) {
    assert.equal(modif((e) => { e.motImage = mot; }).valeur.motImage, null, String(mot));
  }
  assert.equal(modif((e) => { e.motImage = '  Eiffel Tower  '; }).valeur.motImage, 'Eiffel Tower');
  // Titres donnés sous forme d’objets {titre}.
  const objets = modif((e) => { e.paliers = e.paliers.map((titre) => ({ titre })); });
  assert.equal(objets.valeur.paliers.length, 10);
});

test('validerVerification : liste de numéros uniques entre 1 et le total ; le reste est ignoré', async () => {
  assert.deepEqual(validerVerification({ nonConfirmees: [] }, 25).valeur, []);
  assert.deepEqual(validerVerification({ nonConfirmees: [5, 3, 5, '7', ' 9 ', 26, 0, -1, 2.5, 'x', null] }, 25).valeur, [3, 5, 7, 9]);
  for (const mauvais of [null, [], 'rien', {}, { nonConfirmees: 3 }, { nonConfirmees: 'aucune' }, { autre: [] }]) {
    assert.ok(validerVerification(mauvais, 25).raison, JSON.stringify(mauvais));
  }
});

test('evaluer : retire les affirmations non confirmées (et ce qui en dépend), compte et décide de réécrire', async () => {
  const viable = (b) => b.sections.enBref !== null && b.questions.length >= 1;
  const ev = (numeros, min = 2) => evaluer(validerRedaction(palierBrut()).valeur, numeros, min, viable);
  const textes = aplatir(validerRedaction(palierBrut()).valeur).flatMap((u) => u.textes);
  assert.equal(textes.length, TOTAL);
  // Ordre de la liste (numéro = rang + 1) : 3+2+2 phrases, 2 définitions, 3 dates, 4 chiffres, histoire,
  // puis chaque question (réponse, explication).
  assert.match(textes[0], /^La tour Eiffel est une tour de fer puddlé/);
  assert.equal(textes[7], 'Fer puddlé : Fer obtenu en brassant de la fonte en fusion pour en retirer le carbone.');
  assert.equal(textes[9], '1887 : Début du chantier de la tour.');
  assert.equal(textes[12], 'Chrysler Building (1930) : 319 m');
  assert.match(textes[16], /^Prévue pour être démontée/);
  assert.match(textes[17], /^Question : Pour quelle occasion .* Bonne réponse : L’Exposition universelle de 1889$/);
  assert.match(textes[18], /^Explication : La tour est bâtie/);
  assert.match(textes[21], /^Affirmation : La tour Eiffel devait rester debout .* Verdict : FAUSSE$/);

  const rien = ev([]);
  assert.deepEqual([rien.affirmations, rien.retirees, rien.ratio, rien.nbQuestions, rien.aRefaire, rien.viable], [25, 0, 0, 4, false, true]);
  assert.deepEqual(rien.rejets, []);
  assert.deepEqual(ev([0, 26, 99]).retirees, 0, 'numéros hors liste ignorés');

  // Une phrase, une définition, une date : sous 3 dates, toute la frise part.
  const un = ev([5, 8, 10]);
  assert.equal(un.brouillon.sections.comment.length, 1);
  assert.equal(un.brouillon.definitions.length, 1);
  assert.deepEqual(un.brouillon.frise, []);
  assert.equal(un.retirees, 1 + 1 + 3);
  assert.deepEqual(un.rejets, [textes[4], textes[7], textes[9]]);
  assert.equal(un.aRefaire, false);
  assert.deepEqual(un.brouillon.notions, EXEMPLE_PALIER.notions, 'les notions ne sont pas touchées');

  // Chiffres : 3 sur 4 restent, 2 sur 4 : tout part.
  assert.equal(ev([13]).brouillon.chiffres.length, 3);
  assert.equal(ev([13]).retirees, 1);
  assert.deepEqual(ev([13, 14]).brouillon.chiffres, []);
  assert.equal(ev([13, 14]).retirees, 4);
  assert.equal(ev([17]).brouillon.histoire, null);

  // Une explication (ou une réponse) non confirmée retire toute la question.
  const sansQ2 = ev([21]);
  assert.deepEqual(sansQ2.brouillon.questions.map((q) => q.type), ['qcm', 'vraifaux', 'qcm']);
  assert.equal(sansQ2.retirees, 2);
  assert.deepEqual(ev([22]).brouillon.questions.map((q) => q.type), ['qcm', 'qcm', 'qcm'], 'verdict du vrai/faux non confirmé');
  assert.equal(ev([18]).brouillon.questions.length, 3);

  // Réécrire : plus de 40 % retiré, moins de 2 questions, ou palier qui n’a plus d’« en bref ».
  const beaucoup = ev([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(beaucoup.retirees, 3 + 2 + 2 + 2 + 3);
  assert.ok(beaucoup.ratio > 0.4 && beaucoup.aRefaire);
  const jusqua10 = ev([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(jusqua10.retirees, 3 + 2 + 2 + 2 + 3, 'une frise réduite à 2 dates part entièrement');
  const limite = ev([4, 5, 6, 7, 8, 9, 13, 14]);
  assert.equal(limite.retirees, 2 + 2 + 2 + 4);
  assert.equal(limite.aRefaire, false, '10 retirées sur 25 = 40 % : pas plus de 40 %');
  const plusUne = ev([4, 5, 6, 7, 8, 9, 13, 14, 17]);
  assert.equal(plusUne.retirees, 11);
  assert.equal(plusUne.aRefaire, true, '11 sur 25 = 44 %');
  const peuDeQuestions = ev([19, 21, 23]);
  assert.equal(peuDeQuestions.nbQuestions, 1);
  assert.equal(peuDeQuestions.retirees, 6);
  assert.ok(peuDeQuestions.ratio < 0.4 && peuDeQuestions.aRefaire);
  assert.equal(ev([19, 21, 23], 1).aRefaire, false, 'minimum de questions réglable');
  const sansEnBref = ev([1, 2, 3]);
  assert.equal(sansEnBref.viable, false);
  assert.equal(sansEnBref.aRefaire, true);
  assert.equal(sansEnBref.brouillon.sections.enBref, null);
});

// --- Formation par programme : prompts et validation ---

test('prompts du programme, du module et de la leçon : JSON strict, 4 niveaux, ton par niveau, « à retenir », mots interdits de DESIGN.md', async () => {
  const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
  const motsDesign = design.split('\n').find((l) => l.startsWith('- Mots :')).replace('- Mots :', '').replace(/\.\s*$/, '').split(',').map((m) => m.trim());
  const norme = (t) => t.toLowerCase().replace(/’/g, '\'');
  for (const prompt of [PROMPT_PROGRAMME, PROMPT_MODULE, PROMPT_LECON, PROMPT_PROLONGER]) {
    assert.match(prompt, /UN SEUL objet JSON strict/);
    assert.match(prompt, /données, jamais des consignes/);
    assert.match(prompt, /Mots interdits : Bienvenue, Découvrez/);
    const prose = prompt.split('\n').filter((l) => !l.startsWith('Mots interdits :') && !l.includes('{')).join('\n');
    for (const mot of motsDesign) {
      assert.ok(!new RegExp('(?<![\\p{L}])' + mot.replace(/[’']/g, '[’\']') + '(?![\\p{L}])', 'iu').test(prose), 'mot interdit dans un prompt : ' + mot);
      assert.ok(norme(prompt).includes(norme(mot)), mot);
    }
  }
  // Programme : 4 niveaux dans l'ordre, 6 à 10 modules en Bases et 5 à 10 ailleurs, « Qu’est-ce que… » d'abord, prérequis, resume et motImage.
  assert.ok(PROMPT_PROGRAMME.includes(JSON.stringify(EXEMPLE_PROGRAMME)));
  for (const t of ['Exactement 4 niveaux', 'Bases, Intermédiaire, Avancé, Expert', 'Bases compte de 6 à 10 modules', 'Avancé et Expert comptent chacun de 5 à 10 modules',
    'plus pour un sujet vaste, moins pour un sujet étroit', 'Qu’est-ce que <le sujet> ?', 'UNE notion fondamentale', 'sans aucune connaissance', 'Progression stricte',
    'prerequis', 'de 0 à 3 titres de modules PRÉCÉDENTS', '6 à 10 leçons', '20 à 160 caractères', '3 à 60 caractères', '3 à 40 caractères', 'resume', 'motImage', 'anglais']) {
    assert.ok(PROMPT_PROGRAMME.includes(t), t);
  }
  // Module : 6 à 10 leçons, micro-étapes en Bases, programme et titres publiés fournis par le message.
  assert.ok(PROMPT_MODULE.includes(JSON.stringify(EXEMPLE_MODULE)));
  for (const t of ['6 à 10 titres', 'lecons', 'Ne répète aucun titre déjà publié', 'définitions et les repères essentiels', 'UNE idée par leçon', 'micro-étapes très progressives', 'Maîtrise']) assert.ok(PROMPT_MODULE.includes(t), t);
  // Leçon : mêmes règles que le palier, plus à retenir, moyen mnémotechnique, termes déjà définis, ton du niveau.
  assert.ok(PROMPT_LECON.includes(JSON.stringify(EXEMPLE_LECON)));
  for (const t of ['n’utilise QUE les faits des extraits fournis', 'sans phrase vague, creuse ou promotionnelle', 'aRetenir', 'mnemo', 'n’énonce jamais un fait nouveau',
    'Ne redéfinis pas ces termes', 'consigne de ton', 'sections', 'enBref', 'definitions', 'questions', '"qcm"', '"vraifaux"', 'jamais du texte',
    'quelqu’un qui découvre le sujet', 'n’emploie jamais de jargon non expliqué', 'soit défini dans « definitions » de cette leçon, soit dans la liste des termes déjà vus',
    'une analogie ou un exemple concret', 'avant', '« Avant de commencer »', 'de 0 à 3 rappels', 'exemple', '1 à 3 phrases', 'cartes', 'de 2 à 4 cartes de révision',
    '"recto"', '"verso"', 'enBref (l’essentiel) vaut une liste de 2 à 3 phrases', 'une liste de 2 à 6 phrases', 'liste de 2 à 6 objets', 'Une seule définition est permise']) {
    assert.ok(norme(PROMPT_LECON).includes(norme(t)), t);
  }
  // Prolongement : 3 à 5 modules d'un niveau « Maîtrise », sans rien répéter.
  assert.ok(PROMPT_PROLONGER.includes(JSON.stringify(EXEMPLE_PROLONGEMENT)));
  for (const t of ['3 à 5 NOUVEAUX modules', 'Maîtrise', 'Ne répète RIEN', 'plus loin en précision', 'titres de toutes les leçons déjà publiées', 'modules']) assert.ok(PROMPT_PROLONGER.includes(t), t);
  assert.equal(TON_NIVEAU.length, 5);
  assert.match(TON_NIVEAU[1], /^Bases : pars de zéro\..*Définis tout mot technique\. Phrases très simples/);
  assert.match(TON_MAITRISE, /^Maîtrise : va plus loin que le niveau expert/);
  assert.equal(tonDuNiveau(4), TON_NIVEAU[4]);
  assert.equal(tonDuNiveau(5), TON_MAITRISE);
  assert.equal(tonDuNiveau(9), TON_MAITRISE);
  assert.equal(PALIER_MAX, 1500);
  assert.match(TON_NIVEAU[2], /^Intermédiaire : relie les notions.*causes.*enchaînements/);
  assert.match(TON_NIVEAU[3], /^Avancé : .*cas.*nuances.*débats/);
  assert.match(TON_NIVEAU[4], /^Expert : .*sources.*controverses.*limites des connaissances/);
  assert.match(PROMPT_VERIFICATION, /Moyen mnémotechnique/);
  assert.match(PROMPT_VERIFICATION, /Carte : … Réponse : …/);
  assert.match(PROMPT_VERIFICATION, /Exemple : …/);
  assert.match(PROMPT_VERIFICATION, /Rappel : …/);
  // Les exemples respectent leurs propres règles.
  assert.ok(validerProgramme(EXEMPLE_PROGRAMME).valeur, validerProgramme(EXEMPLE_PROGRAMME).raison);
  assert.ok(validerModule(EXEMPLE_MODULE).valeur, validerModule(EXEMPLE_MODULE).raison);
  assert.ok(validerProlongement(EXEMPLE_PROLONGEMENT, { programme: validerProgramme(EXEMPLE_PROGRAMME).valeur }).valeur);
  assert.ok(validerRedaction(EXEMPLE_LECON, { lecon: true }).valeur, validerRedaction(EXEMPLE_LECON, { lecon: true }).raison);
  assert.equal(MESSAGE_FIN, 'Formation terminée : tu as fait le tour de ce sujet.');
});

test('validerProgramme : 4 niveaux, 6 à 10 modules en Bases et 5 à 10 ailleurs, titres et objectifs aux bonnes longueurs, aucun titre en double ; modules numérotés ; prérequis', async () => {
  const modif = (fn) => { const b = programmeBrut(); fn(b); return validerProgramme(b); };
  const modulesDe5 = (n, pre = 'Module de test') => Array.from({ length: n }, (_, i) => ({ titre: `${pre} ${i}`, objectif: 'Un objectif assez long pour être valide.' }));
  const ok = validerProgramme(programmeBrut());
  assert.ok(ok.valeur, ok.raison);
  assert.deepEqual(Object.keys(ok.valeur), ['niveaux', 'resume', 'motImage']);
  assert.equal(ok.valeur.motImage, 'Eiffel Tower Paris');
  assert.deepEqual(ok.valeur.niveaux.map((n) => n.numero), [1, 2, 3, 4]);
  assert.deepEqual(ok.valeur.niveaux.map((n) => n.modules.length), [6, 5, 5, 5]);
  assert.deepEqual(ok.valeur.niveaux.flatMap((n) => n.modules.map((m) => m.numero)), nombres(1, 21), 'modules numérotés globalement');
  assert.deepEqual(modulesDe(ok.valeur).map((m) => m.niveau.numero), [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
  const refus = (r, motif) => assert.ok(r.raison, 'devrait être refusé : ' + motif);
  refus(validerProgramme(null), 'null');
  refus(validerProgramme([]), 'tableau');
  refus(modif((b) => { b.niveaux.pop(); }), '3 niveaux');
  refus(modif((b) => { b.niveaux.push(structuredClone(b.niveaux[0])); }), '5 niveaux');
  refus(modif((b) => { b.niveaux = 'quatre'; }), 'niveaux en texte');
  refus(modif((b) => { b.niveaux[1] = 'Intermédiaire'; }), 'niveau en texte');
  refus(modif((b) => { b.niveaux[1].titre = 'ab'; }), 'titre de niveau trop court');
  refus(modif((b) => { b.niveaux[1].titre = 'x'.repeat(41); }), 'titre de niveau trop long');
  refus(modif((b) => { b.niveaux[1].titre = b.niveaux[0].titre.toUpperCase(); }), 'titres de niveau en double');
  // Bornes par niveau : Bases 6 à 10, Intermédiaire, Avancé et Expert 5 à 10.
  refus(modif((b) => { b.niveaux[0].modules.pop(); }), 'Bases : 5 modules');
  refus(modif((b) => { b.niveaux[2].modules.pop(); }), 'Avancé : 4 modules');
  refus(modif((b) => { b.niveaux[3].modules.length = 0; }), 'Expert : aucun module');
  refus(modif((b) => { b.niveaux[2].modules = modulesDe5(11); }), 'Avancé : 11 modules');
  refus(modif((b) => { b.niveaux[0].modules = modulesDe5(11, 'Base'); }), 'Bases : 11 modules');
  assert.equal(modif((b) => { b.niveaux[0].modules = modulesDe5(10, 'Base'); }).valeur.niveaux[0].modules.length, 10, 'Bases : 10 modules');
  assert.equal(modif((b) => { b.niveaux[3].modules = modulesDe5(10, 'Expert'); }).valeur.niveaux[3].modules.length, 10, 'Expert : 10 modules');
  assert.equal(modif((b) => { b.niveaux[1].modules = modulesDe5(5, 'Inter'); }).valeur.niveaux[1].modules.length, 5, 'Intermédiaire : 5 modules');
  refus(modif((b) => { b.niveaux[0].modules[0].titre = 'ab'; }), 'titre de module trop court');
  refus(modif((b) => { b.niveaux[0].modules[0].titre = 'x'.repeat(61); }), 'titre de module trop long');
  refus(modif((b) => { b.niveaux[0].modules[0].objectif = 'Trop court.'; }), 'objectif trop court');
  refus(modif((b) => { b.niveaux[0].modules[0].objectif = 'x'.repeat(161); }), 'objectif trop long');
  refus(modif((b) => { delete b.niveaux[0].modules[0].objectif; }), 'objectif absent');
  refus(modif((b) => { b.niveaux[0].modules[0].titre = 12; }), 'titre non texte');
  refus(modif((b) => { b.niveaux[0].modules[1] = 'Une tour pour 1889'; }), 'module en texte');
  refus(modif((b) => { b.niveaux[3].modules[0].titre = b.niveaux[0].modules[0].titre.toUpperCase(); }), 'titre de module en double, à la casse près');
  refus(modif((b) => { b.niveaux[3].modules[0].titre = 'Le vocabulaire de la tour'.normalize('NFD'); }), 'titre de module en double, accents décomposés');
  refus(modif((b) => { b.niveaux[0].modules[0].titre = 'Un monument incontournable'; }), 'mot promotionnel');
  refus(modif((b) => { b.niveaux[0].modules[0].objectif = 'Découvrez la tour de fer et son histoire à Paris.'; }), 'mot promotionnel dans l’objectif');
  refus(modif((b) => { delete b.resume; }), 'resume absent');
  refus(modif((b) => { b.resume = 'Une seule phrase assez longue pour passer la longueur minimale demandée.'; }), 'resume à 1 phrase');
  // Prérequis : 0 à 3 titres de modules précédents ; un titre inconnu ou qui ne précède pas est retiré, sans rejet.
  const mods = ok.valeur.niveaux.flatMap((n) => n.modules);
  assert.deepEqual(mods[0].prerequis, []);
  assert.deepEqual(mods[1].prerequis, ['Qu’est-ce que la tour Eiffel ?']);
  assert.deepEqual(mods[5].prerequis, ['Le vocabulaire de la tour', 'Gustave Eiffel, l’ingénieur']);
  assert.deepEqual(mods.map((m) => m.prerequis.length > 3), mods.map(() => false));
  const pre = (fn) => modif((b) => { fn(b.niveaux[0].modules); }).valeur.niveaux[0].modules;
  assert.deepEqual(pre((m) => { m[2].prerequis = ['Inconnu du programme', 'Le vocabulaire de la tour']; })[2].prerequis, ['Le vocabulaire de la tour'], 'titre inconnu retiré');
  assert.deepEqual(pre((m) => { m[2].prerequis = ['Une tour pour 1889', 'Gustave Eiffel, l’ingénieur']; })[2].prerequis, [], 'modules suivants retirés (ils ne précèdent pas)');
  assert.deepEqual(pre((m) => { m[2].prerequis = [m[2].titre]; })[2].prerequis, [], 'un module n’est pas son propre prérequis');
  assert.deepEqual(pre((m) => { m[1].prerequis = ['LE VOCABULAIRE DE LA TOUR']; })[1].prerequis, [], 'le module lui-même, même à la casse près');
  assert.deepEqual(pre((m) => { m[4].prerequis = ['QU’EST-CE QUE LA TOUR EIFFEL ?', 'le vocabulaire de la tour', 'Les grands repères', 'Une tour pour 1889']; })[4].prerequis,
    ['Qu’est-ce que la tour Eiffel ?', 'Le vocabulaire de la tour', 'Les grands repères'], '3 au plus, accents et casse tolérés, titre du programme restitué');
  assert.deepEqual(pre((m) => { m[2].prerequis = [m[0].titre, m[0].titre]; })[2].prerequis, [mods[0].titre], 'sans doublon');
  assert.deepEqual(pre((m) => { m[2].prerequis = 'Les grands repères'; })[2].prerequis, [], 'pas une liste');
  assert.deepEqual(pre((m) => { m[2].prerequis = [12, null, {}]; })[2].prerequis, [], 'éléments qui ne sont pas des titres');
  assert.deepEqual(pre((m) => { delete m[2].prerequis; })[2].prerequis, [], 'absent');
  assert.ok(modif((b) => { b.niveaux[1].modules[0].prerequis = ['Le fer : le matériau de la tour']; }).valeur.niveaux[1].modules[0].prerequis.length === 1, 'un prérequis peut venir du niveau précédent');
  // Titres libres de niveau (3 à 40 caractères) ; motImage invalide -> null.
  assert.ok(modif((b) => { b.niveaux[0].titre = 'Les fondations'; b.niveaux[3].titre = 'Au plus haut niveau'; }).valeur);
  assert.equal(modif((b) => { b.motImage = 'Tour Eiffel à Paris'; }).valeur.motImage, null);
  assert.equal(modif((b) => { delete b.motImage; }).valeur.motImage, null);
});

test('validerModule : 6 à 10 titres de leçons courts et différents, sans répéter ceux qui sont publiés', async () => {
  const modif = (fn, options = {}) => { const b = moduleBrut(); fn(b); return validerModule(b, options); };
  const ok = validerModule(moduleBrut());
  assert.ok(ok.valeur, ok.raison);
  assert.deepEqual(ok.valeur, { paliers: EXEMPLE_MODULE.lecons });
  assert.equal(validerModule(module2Brut(), { existants: EXEMPLE_MODULE.lecons }).valeur.paliers.length, 6);
  assert.equal(modif((b) => { b.lecons = EXEMPLE_PROGRAMME.niveaux.flatMap((n) => n.modules.map((m) => m.titre)).slice(0, 10); }).valeur.paliers.length, 10);
  const refus = (r, motif) => assert.ok(r.raison, 'devrait être refusé : ' + motif);
  refus(validerModule(null), 'null');
  refus(modif((b) => { b.lecons = b.lecons.slice(0, 5); }), '5 titres');
  refus(modif((b) => { b.lecons = []; }), 'aucun titre');
  refus(modif((b) => { b.lecons = [...b.lecons, ...b.lecons.map((t) => t + ' (suite)')]; }), '12 titres');
  refus(modif((b) => { b.lecons = 'cinq titres'; }), 'lecons en texte');
  refus(modif((b) => { b.lecons[2] = 'ab'; }), 'titre trop court');
  refus(modif((b) => { b.lecons[2] = 'x'.repeat(61); }), 'titre trop long');
  refus(modif((b) => { b.lecons[2] = b.lecons[3].toUpperCase(); }), 'titres identiques à la casse près');
  refus(modif((b) => { b.lecons[2] = 'Bienvenue dans la tour'; }), 'mot promotionnel');
  refus(modif(() => {}, { existants: ['LE VOCABULAIRE DE LA TOUR'] }), 'titre déjà publié');
  assert.equal(modif((b) => { b.paliers = b.lecons; delete b.lecons; }).valeur.paliers.length, 6, 'ancien nom de champ toléré');
  assert.equal(modif((b) => { b.lecons = b.lecons.map((titre) => ({ titre })); }).valeur.paliers.length, 6, 'titres donnés sous forme d’objets');
});

test('validerRedaction en mode leçon : aRetenir obligatoire (2 à 4 phrases), mnemo facultatif ; le mode palier est inchangé', async () => {
  const lecon = (fn) => { const b = leconBrute(); fn(b); return validerRedaction(b, { lecon: true }); };
  const r = validerRedaction(leconBrute(), { lecon: true });
  assert.ok(r.valeur, r.raison);
  assert.deepEqual(Object.keys(r.valeur), ['sections', 'definitions', 'frise', 'chiffres', 'notions', 'histoire', 'aRetenir', 'mnemo', 'avant', 'exemple', 'cartes', 'objectif', 'rappel', 'questions']);
  assert.deepEqual(r.valeur.aRetenir, EXEMPLE_LECON.aRetenir);
  assert.deepEqual(r.valeur.avant, EXEMPLE_LECON.avant);
  assert.equal(r.valeur.exemple, EXEMPLE_LECON.exemple);
  assert.deepEqual(r.valeur.cartes, EXEMPLE_LECON.cartes);
  assert.equal(r.valeur.mnemo, EXEMPLE_LECON.mnemo);
  assert.equal(aplatir(r.valeur).flatMap((u) => u.textes).length, TOTAL_LECON);
  const refus = (x, motif) => assert.ok(x.raison, 'devrait être refusé : ' + motif);
  refus(lecon((b) => { delete b.aRetenir; }), 'aRetenir absent');
  refus(lecon((b) => { b.aRetenir = 'Une phrase assez longue pour passer.'; }), 'aRetenir en texte');
  refus(lecon((b) => { b.aRetenir = ['Une seule phrase assez longue.']; }), '1 phrase');
  refus(lecon((b) => { b.aRetenir = []; }), 'aRetenir vide');
  refus(lecon((b) => { b.aRetenir = ['Courte.', 'Une phrase assez longue pour passer.']; }), '1 phrase valide sur 2');
  refus(lecon((b) => { b.aRetenir = ['x'.repeat(161), 'y'.repeat(161)]; }), 'phrases trop longues');
  refus(lecon((b) => { b.aRetenir = ['Bienvenue dans la tour de fer de Paris.', 'Une phrase assez longue pour passer.']; }), 'mot promotionnel');
  assert.equal(lecon((b) => { b.aRetenir = Array.from({ length: 6 }, (_, i) => 'Une phrase assez longue numéro ' + i + '.'); }).valeur.aRetenir.length, 4, '4 gardées au plus');
  assert.equal(lecon((b) => { b.aRetenir = ['Une phrase assez longue pour passer.', 'Courte.', 'Une autre phrase assez longue pour passer.']; }).valeur.aRetenir.length, 2, 'les phrases invalides sont écartées');
  assert.equal(lecon((b) => { b.aRetenir = ['Une phrase assez longue pour passer.', 'Une phrase assez longue pour passer.']; }).raison !== undefined, true, 'doublons');
  // mnemo : 20 à 200 caractères, sinon null ; absent -> null.
  assert.equal(lecon((b) => { b.mnemo = null; }).valeur.mnemo, null);
  assert.equal(lecon((b) => { delete b.mnemo; }).valeur.mnemo, null);
  assert.equal(lecon((b) => { b.mnemo = 'Trop court'; }).valeur.mnemo, null);
  assert.equal(lecon((b) => { b.mnemo = 'x'.repeat(201); }).valeur.mnemo, null);
  assert.equal(lecon((b) => { b.mnemo = 12; }).valeur.mnemo, null);
  assert.equal(lecon((b) => { b.mnemo = 'Un moyen au cœur de la mémoire, incontournable pour tous.'; }).valeur.mnemo, null, 'mot promotionnel');
  assert.equal(lecon((b) => { b.mnemo = 'x'.repeat(200); }).valeur.mnemo.length, 200);
  // Sections d'une leçon : enBref de 2 à 3 phrases, les autres de 2 à 6 (un palier garde 2 à 4 partout).
  const phr = (n) => Array.from({ length: n }, (_, i) => `Phrase numéro ${i + 1} de la section, assez longue.`);
  assert.equal(lecon((b) => { b.sections.comment = phr(6); }).valeur.sections.comment.length, 6, 'comment : 6 phrases');
  assert.equal(lecon((b) => { b.sections.pourquoi = phr(6); b.sections.ouQuand = phr(5); }).valeur.sections.ouQuand.length, 5);
  refus(lecon((b) => { b.sections.enBref = phr(4); }), 'enBref : 4 phrases');
  refus(lecon((b) => { b.sections.enBref = phr(1); }), 'enBref : 1 phrase');
  assert.equal(lecon((b) => { b.sections.enBref = phr(2); }).valeur.sections.enBref.length, 2);
  assert.equal(lecon((b) => { b.sections.comment = phr(7); }).valeur.sections.comment, null, 'comment : 7 phrases, section retirée sans rejet');
  assert.equal(lecon((b) => { b.sections.comment = phr(1); }).valeur.sections.comment, null, 'comment : 1 phrase, retirée');
  assert.equal(validerRedaction((() => { const b = palierBrut(); b.sections.comment = phr(5); return b; })()).valeur.sections.comment, null, 'palier : 2 à 4 phrases seulement');
  assert.equal(validerRedaction((() => { const b = palierBrut(); b.sections.enBref = phr(4); return b; })()).valeur.sections.enBref.length, 4);
  // Définitions d'une leçon : 6 au plus (5 pour un palier).
  const defs = (n) => Array.from({ length: n }, (_, i) => ({ terme: `Terme ${i + 1}`, definition: `Définition numéro ${i + 1}, assez longue.` }));
  assert.equal(lecon((b) => { b.definitions = defs(8); }).valeur.definitions.length, 6, '6 définitions au plus');
  assert.equal(validerRedaction((() => { const b = palierBrut(); b.definitions = defs(8); return b; })()).valeur.definitions.length, 5);
  // avant : 0 à 3 rappels de 20 à 160 caractères, les invalides écartés sans rejet.
  assert.deepEqual(lecon((b) => { delete b.avant; }).valeur.avant, []);
  assert.deepEqual(lecon((b) => { b.avant = 'un rappel assez long pour passer, en texte'; }).valeur.avant, []);
  assert.deepEqual(lecon((b) => { b.avant = []; }).valeur.avant, []);
  assert.equal(lecon((b) => { b.avant = phr(5).map((t) => t + ' Un rappel.'); }).valeur.avant.length, 3, '3 rappels au plus');
  assert.deepEqual(lecon((b) => { b.avant = ['Trop court.', 'Un rappel assez long pour passer le seuil.', 'x'.repeat(161), 12, 'Bienvenue dans un rappel promotionnel assez long.']; }).valeur.avant, ['Un rappel assez long pour passer le seuil.']);
  assert.equal(lecon((b) => { b.avant = ['Un rappel assez long pour passer.', 'UN RAPPEL ASSEZ LONG POUR PASSER.']; }).valeur.avant.length, 1, 'sans doublon');
  // exemple : 1 à 3 phrases (liste ou texte), sinon null ; jamais de rejet.
  assert.equal(lecon((b) => { b.exemple = null; }).valeur.exemple, null);
  assert.equal(lecon((b) => { delete b.exemple; }).valeur.exemple, null);
  assert.equal(lecon((b) => { b.exemple = 'Une seule phrase d’exemple suffit.'; }).valeur.exemple, 'Une seule phrase d’exemple suffit.');
  assert.equal(lecon((b) => { b.exemple = ['Première phrase d’exemple.', 'Seconde phrase d’exemple.']; }).valeur.exemple, 'Première phrase d’exemple. Seconde phrase d’exemple.');
  assert.equal(lecon((b) => { b.exemple = 'Une phrase. Une autre phrase. Encore une phrase. Et une quatrième phrase.'; }).valeur.exemple, null, '4 phrases');
  assert.equal(lecon((b) => { b.exemple = ''; }).valeur.exemple, null);
  assert.equal(lecon((b) => { b.exemple = 12; }).valeur.exemple, null);
  assert.equal(lecon((b) => { b.exemple = 'Un exemple incontournable pour tous.'; }).valeur.exemple, null, 'mot promotionnel');
  assert.equal(lecon((b) => { b.exemple = 'x'.repeat(301); }).valeur.exemple, null);
  // cartes : 2 à 4 {recto 10 à 120, verso 5 à 200} ; les invalides sont écartées, moins de 2 valides : aucune.
  const carte = (i) => ({ recto: `Question de la carte numéro ${i} ?`, verso: `Réponse de la carte ${i}.` });
  assert.deepEqual(lecon((b) => { delete b.cartes; }).valeur.cartes, []);
  assert.deepEqual(lecon((b) => { b.cartes = 'des cartes'; }).valeur.cartes, []);
  assert.deepEqual(lecon((b) => { b.cartes = [carte(1)]; }).valeur.cartes, [], '1 carte : aucune');
  assert.equal(lecon((b) => { b.cartes = [carte(1), carte(2)]; }).valeur.cartes.length, 2);
  assert.equal(lecon((b) => { b.cartes = [1, 2, 3, 4, 5, 6].map(carte); }).valeur.cartes.length, 4, '4 cartes au plus');
  assert.deepEqual(lecon((b) => { b.cartes = [carte(1), { recto: 'Court ?', verso: 'Une réponse correcte.' }, carte(2), { recto: 'Une question assez longue ?', verso: 'Non' }, { recto: 'x'.repeat(121), verso: 'Une réponse correcte.' }, { recto: 'Une question assez longue ?', verso: 'x'.repeat(201) }, 'texte', null]; }).valeur.cartes, [carte(1), carte(2)], 'invalides écartées');
  assert.equal(lecon((b) => { b.cartes = [carte(1), { ...carte(2), recto: carte(1).recto.toUpperCase() }]; }).valeur.cartes.length, 0, 'recto en double : une seule carte reste, donc aucune');
  assert.equal(lecon((b) => { b.cartes = [carte(1), { recto: 'Une carte incontournable ?', verso: 'Une réponse correcte.' }]; }).valeur.cartes.length, 0, 'mot promotionnel');
  assert.equal(lecon((b) => { b.cartes = [{ recto: 'x'.repeat(120), verso: 'y'.repeat(200) }, carte(2)]; }).valeur.cartes.length, 2, 'bornes comprises');
  // Une seule définition suffit en mode leçon (les termes déjà définis ne reviennent pas) ; deux en mode palier.
  assert.equal(lecon((b) => { b.definitions.pop(); }).valeur.definitions.length, 1);
  refus(lecon((b) => { b.definitions = []; }), 'aucune définition');
  assert.ok(validerRedaction((() => { const b = palierBrut(); b.definitions.pop(); return b; })()).raison, 'mode palier : 2 définitions');
  // Mode palier : ni aRetenir, ni mnemo, ni avant, exemple ou cartes, même si l'IA en écrit.
  const palier = validerRedaction(leconBrute());
  assert.deepEqual(Object.keys(palier.valeur), ['sections', 'definitions', 'frise', 'chiffres', 'notions', 'histoire', 'questions']);
});

test('evaluer en mode leçon : un « à retenir » non confirmé est retiré, un moyen mnémotechnique non confirmé devient null', async () => {
  const viable = (b) => b.sections.enBref !== null && b.questions.length >= 1;
  const ev = (numeros) => evaluer(validerRedaction(leconBrute(), { lecon: true }).valeur, numeros, 2, viable);
  const textes = aplatir(validerRedaction(leconBrute(), { lecon: true }).valeur).flatMap((u) => u.textes);
  assert.equal(textes.length, TOTAL_LECON);
  // Ordre : 17 = histoire, 18 à 20 = à retenir, 21 = mnémo, puis les questions (22 à 29).
  assert.match(textes[17], /^La tour est bâtie pour l’Exposition universelle de 1889/);
  assert.equal(textes[20], 'Moyen mnémotechnique : ' + EXEMPLE_LECON.mnemo);
  assert.match(textes[21], /^Question : Pour quelle occasion/);
  const rien = ev([]);
  assert.deepEqual([rien.affirmations, rien.retirees, rien.aRefaire], [TOTAL_LECON, 0, false]);
  assert.deepEqual(rien.brouillon.aRetenir, EXEMPLE_LECON.aRetenir);
  const un = ev([19]);
  assert.deepEqual(un.brouillon.aRetenir, [EXEMPLE_LECON.aRetenir[0], EXEMPLE_LECON.aRetenir[2]]);
  assert.equal(un.brouillon.mnemo, EXEMPLE_LECON.mnemo);
  assert.deepEqual(un.rejets, [EXEMPLE_LECON.aRetenir[1]]);
  const sansMnemo = ev([21]);
  assert.equal(sansMnemo.brouillon.mnemo, null);
  assert.deepEqual(sansMnemo.brouillon.aRetenir, EXEMPLE_LECON.aRetenir);
  assert.equal(sansMnemo.retirees, 1);
  assert.deepEqual(Object.keys(sansMnemo.brouillon), ['sections', 'definitions', 'frise', 'chiffres', 'notions', 'histoire', 'aRetenir', 'mnemo', 'avant', 'exemple', 'cartes', 'objectif', 'rappel', 'questions']);
  const tout = ev([18, 19, 20, 21]);
  assert.deepEqual([tout.brouillon.aRetenir, tout.brouillon.mnemo, tout.retirees, tout.viable], [[], null, 4, true]);
  // Rappels, exemple et cartes viennent après les questions (29 premières affirmations inchangées) : 30 et 31 = rappels,
  // 32 = exemple, 33 à 35 = cartes. Non confirmés : rappel retiré, exemple null, carte retirée.
  assert.match(textes[29], /^Rappel : Une exposition universelle est une grande foire/);
  assert.match(textes[30], /^Rappel : Un ingénieur est un spécialiste/);
  assert.equal(textes[31], 'Exemple : ' + EXEMPLE_LECON.exemple);
  assert.equal(textes[32], 'Carte : Pour quelle occasion la tour est-elle bâtie ? Réponse : Pour l’Exposition universelle de 1889, à Paris.');
  const rappel = ev([30]);
  assert.deepEqual(rappel.brouillon.avant, [EXEMPLE_LECON.avant[1]]);
  assert.deepEqual(rappel.rejets, [textes[29]]);
  const sansExemple = ev([32]);
  assert.equal(sansExemple.brouillon.exemple, null);
  assert.deepEqual(sansExemple.brouillon.cartes, EXEMPLE_LECON.cartes);
  const carteRetiree = ev([34]);
  assert.deepEqual(carteRetiree.brouillon.cartes, [EXEMPLE_LECON.cartes[0], EXEMPLE_LECON.cartes[2]]);
  assert.equal(carteRetiree.retirees, 1);
  assert.equal(carteRetiree.aRefaire, false);
  const nouveau = ev([30, 31, 32, 33, 34, 35]);
  assert.deepEqual([nouveau.brouillon.avant, nouveau.brouillon.exemple, nouveau.brouillon.cartes, nouveau.retirees, nouveau.viable], [[], null, [], 6, true]);
  assert.equal(nouveau.aRefaire, false, '6 sur 35 : sous le seuil de 40 %');
  const beaucoup = ev(nombres(1, 16));
  assert.equal(beaucoup.aRefaire, true, 'plus de 40 % retiré : nouvelle rédaction');
  // Un palier de l'ancien format n'a ni rappel ni exemple ni carte.
  assert.deepEqual(aplatir(validerRedaction(palierBrut()).valeur).filter((u) => ['avant', 'exemple', 'carte'].includes(u.genre)), []);
});

// --- POST|GET /api/parcours ---

const WIKI_CREATION = { fr: 3, en: 2 }; // recherche FR + lecture FR + lien interlangue ; recherche EN + lecture EN
const hotes = (appels) => appels.map((a) => a.url.hostname).sort();

test('parcours POST : 401 sans connexion, 400 sur titre invalide, 413, 503 sans IA ; rien consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  const e = envDe(sc);
  erreurFr(await appel(parcoursPost, { env: e, methode: 'POST', corps: { titre: 'La tour Eiffel' } }), 401);
  for (const titre of ['', 'a', '  b ', 'x'.repeat(81), 12, null, undefined, ['La tour'], '\u0000\u0001\u0002']) {
    erreurFr(await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre } }), 400);
  }
  erreurFr(await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: '!!! ???' } }), 400, /sans lettre/);
  erreurFr(await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'ok', bourrage: 'x'.repeat(3000) } }), 413);
  erreurFr(await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, brut: '{pas du json' }), 400);
  erreurFr(await appel(parcoursPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } }), 503, /IA absente/);
  assert.equal(sc.appels.length, 0);
  assert.equal(wiki.appels.length, 0);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'parcours%'").length, 0);
  assert.equal(lignes('SELECT * FROM parcours').length, 0);
});

test('parcours POST : création sans GLM (Llama écrit programme et module 1, image de la page Wikipédia), forme, appels et quotas', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  ext.commons = () => reponseCommons(fichierCommons(1));
  const r = await appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { titre: '  La tour   Eiffel ' } });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['parcours']);
  const p = r.corps.parcours;
  assert.deepEqual(Object.keys(p), CLES_PARCOURS);
  assert.equal(p.id, 'la-tour-eiffel');
  assert.equal(p.titre, 'La tour Eiffel');
  assert.equal(p.resume, EXEMPLE_PROGRAMME.resume);
  // Programme d'ensemble : 4 niveaux, modules numérotés globalement de 1 à 21 (6 + 5 + 5 + 5).
  assert.equal(p.modulesTotal, NB_MODULES);
  assert.deepEqual(Object.keys(p.programme), ['niveaux']);
  assert.equal(p.programme.niveaux.length, 4);
  assert.deepEqual(p.programme.niveaux.map((n) => n.numero), [1, 2, 3, 4]);
  assert.deepEqual(p.programme.niveaux.map((n) => n.titre.replace('\u00a0', ' ')), EXEMPLE_PROGRAMME.niveaux.map((n) => n.titre), 'espace insécable avant « : »');
  assert.deepEqual(Object.keys(p.programme.niveaux[0]), ['numero', 'titre', 'modules']);
  assert.deepEqual(Object.keys(p.programme.niveaux[0].modules[0]), ['numero', 'titre', 'objectif', 'prerequis', 'essentiel']);
  assert.deepEqual(p.programme.niveaux.flatMap((n) => n.modules.map((m) => m.numero)), nombres(1, NB_MODULES));
  assert.deepEqual(p.programme.niveaux[1].modules[0], { numero: 7, ...EXEMPLE_PROGRAMME.niveaux[1].modules[0] });
  assert.deepEqual(p.programme.niveaux[0].modules[1].prerequis, [TITRE_MODULE_1], 'prérequis typographiés comme les titres');
  // Module 1 ouvert : étape 1 = module 1, ses leçons sont numérotées à partir de 1.
  assert.equal(p.etapes.length, 1);
  assert.deepEqual(Object.keys(p.etapes[0]), ['numero', 'titre', 'niveau', 'objectif', 'paliers']);
  assert.deepEqual([p.etapes[0].numero, p.etapes[0].titre, p.etapes[0].niveau], [1, TITRE_MODULE_1, 1]);
  assert.equal(p.etapes[0].objectif, EXEMPLE_PROGRAMME.niveaux[0].modules[0].objectif);
  assert.deepEqual(p.etapes[0].paliers, EXEMPLE_MODULE.lecons.map((titre, i) => ({ numero: i + 1, titre })));
  assert.equal(p.image.credit, 'Jeanne Dupont · CC BY-SA 4.0 · Wikimédia Commons');
  assert.equal(p.image.source, 'commons');
  assert.equal(p.image.alt, 'Illustration de « Tour Eiffel »');
  assert.deepEqual(p.sources, [
    ['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel'],
    ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower'],
  ]);
  assert.ok(!('motImage' in p) && !('auteur' in p));
  // Wikipédia FR et EN, avec le User-Agent 2.0 ; le texte anglais est coupé à 6 000 caractères. Un seul jeu de pages.
  assert.deepEqual(hotes(wiki.appels), [...Array(WIKI_CREATION.en).fill('en.wikipedia.org'), ...Array(WIKI_CREATION.fr).fill('fr.wikipedia.org')]);
  for (const a of wiki.appels) assert.equal(new Headers(a.init.headers).get('user-agent'), USER_AGENT_V2);
  // Deux appels d'IA, dans l'ordre : le programme d'ensemble, puis les leçons du module 1 (Llama).
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['programme', 'ai', LLAMA], ['module', 'ai', LLAMA]]);
  const [prog, mod] = sc.appels;
  assert.equal(prog.entree.messages[0].content, PROMPT_PROGRAMME);
  const demande = prog.entree.messages[1].content;
  assert.match(demande, /Parcours : « La tour Eiffel »/);
  assert.match(demande, /=== Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel » ===/);
  assert.match(demande, /=== Extrait 2 · Wikipedia \(en\), page « Eiffel Tower » ===/);
  assert.ok(demande.includes('La tour Eiffel est décrit ici pour les tests.'));
  assert.ok(!demande.includes('NE PAS LIRE') && !demande.includes('DO NOT READ'));
  assert.ok(demande.length < 6000 * 2 + 1200, 'au plus 6 000 caractères par langue');
  assert.equal(mod.entree.messages[0].content, PROMPT_MODULE);
  const m1 = mod.entree.messages[1].content;
  assert.match(m1, /Programme d’ensemble :\nNiveau 1 · Bases : les repères\n  Module 1 · Qu’est-ce que la tour Eiffel \? \(module à écrire\)\n  Module 2 · Le vocabulaire de la tour\n/);
  assert.match(m1, /Module à écrire : n° 1, « Qu’est-ce que la tour Eiffel \? »/);
  assert.match(m1, /Niveau : n° 1, « Bases : les repères »/);
  assert.match(m1, /Objectif du module : Dire ce qu’est la tour/);
  assert.ok(!m1.includes('Prérequis du module'), 'le module 1 n’a aucun prérequis');
  assert.ok(!m1.includes('déjà publiés'), 'aucun titre publié pour le module 1');
  assert.match(m1, /Extrait 1 · Wikipédia \(fr\)/);
  assert.deepEqual(ext.appels.map((a) => a.fournisseur).filter((f) => f !== 'commons'), [], 'ni GLM ni Unsplash sans clé');
  // Base et quotas : un seul quota pour toute la création.
  const [ligne] = lignes('SELECT id, titre, auteur, vues FROM parcours');
  assert.deepEqual(ligne, { id: 'la-tour-eiffel', titre: 'La tour Eiffel', auteur: j.id, vues: 0 });
  const stocke = JSON.parse(lignes('SELECT contenu FROM parcours')[0].contenu);
  assert.deepEqual(Object.keys(stocke), ['resume', 'image', 'motImage', 'etapes', 'sources', 'programme']);
  assert.equal(stocke.motImage, 'Eiffel Tower Paris');
  assert.deepEqual(stocke.programme, p.programme);
  assert.deepEqual(lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'parcours%' ORDER BY cle"), [
    { cle: 'parcours:joueur:' + j.id, n: 1 },
    { cle: 'parcours:total', n: 1 },
  ]);
});

test('parcours POST : GLM écrit programme et module (modèle choisi par GLM_MODELE), la photo de tête vient d’Unsplash', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  ext.glm = sc.glm;
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const e = envDe(sc, { ...AVEC_GLM, GLM_MODELE: 'glm-4.5-air', PEXELS_KEY: 'cle-pexels', UNSPLASH_KEY: 'cle-unsplash' });
  const r = await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['programme', 'glm', 'glm-4.5-air'], ['module', 'glm', 'glm-4.5-air']]);
  assert.deepEqual(ext.appels.map((a) => a.fournisseur), ['glm', 'glm', 'unsplash']);
  assert.equal(ext.appels[2].url.searchParams.get('query'), 'Eiffel Tower Paris', 'requête d’image en anglais (motImage)');
  assert.equal(r.corps.parcours.image.source, 'unsplash');
  assert.equal(r.corps.parcours.image.credit, 'Photo : Paul Martin sur Unsplash');
  assert.equal(r.corps.parcours.resume, EXEMPLE_PROGRAMME.resume);
});

test('parcours POST : GLM en panne (repli sur Llama), Unsplash sans résultat puis image Wikipédia créditée par Commons', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario({ ...partiesStandard(), programme: [new Error('GLM saturé'), programmeBrut()] });
  ext.glm = sc.glm;
  ext.unsplash = () => reponseWiki({ results: [] });
  ext.commons = () => reponseCommons(fichierCommons(1));
  const e = envDe(sc, { ...AVEC_GLM, UNSPLASH_KEY: 'u' });
  const r = await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['programme', 'glm', 'glm-4.7-flash'], ['programme', 'ai', LLAMA], ['module', 'glm', 'glm-4.7-flash']]);
  assert.deepEqual(ext.appels.map((a) => a.fournisseur), ['glm', 'glm', 'unsplash', 'commons']);
  assert.equal(r.corps.parcours.image.credit, 'Jeanne Dupont · CC BY-SA 4.0 · Wikimédia Commons');
  // Aucune photo en ligne ni image Wikipédia : image nulle, le parcours existe quand même.
  viderBibliotheque();
  wiki.pages['Tour Eiffel'].image = null;
  wiki.pagesEn['Eiffel Tower'].image = null;
  ext.unsplash = () => new Response('panne', { status: 500 });
  const sans = await appel(parcoursPost, { env: envDe(scenario(partiesStandard()), { UNSPLASH_KEY: 'u' }), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(sans);
  assert.equal(sans.corps.parcours.image, null);
});

test('parcours POST : un parcours en cache est renvoyé sans IA, sans Wikipédia, sans quota (même sans IA, même pour un autre lecteur)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const premier = await creerParcoursTest(j);
  const appelsWiki = wiki.appels.length;
  const quotasAvant = lignes('SELECT cle, n FROM quotas ORDER BY cle');
  const sc = scenario(partiesStandard());
  for (const [lecteur, titre, e] of [
    [j, 'La tour Eiffel', envDe(sc)],
    [autre, '  LA  TOUR   EIFFEL  ', envDe(sc)],
    [autre, 'La tour Éiffel !', envDe(sc)],
    [autre, 'La tour Eiffel', { DB: db, AI: undefined }],
  ]) {
    const r = await appel(parcoursPost, { env: e, methode: 'POST', jeton: lecteur.jeton, corps: { titre } });
    ok200(r);
    assert.deepEqual(r.corps.parcours, premier);
  }
  assert.equal(sc.appels.length, 0);
  assert.equal(wiki.appels.length, appelsWiki);
  assert.deepEqual(lignes('SELECT cle, n FROM quotas ORDER BY cle'), quotasAvant);
  assert.equal(lignes('SELECT * FROM parcours').length, 1);
  assert.equal(lignes('SELECT vues FROM parcours')[0].vues, 0, 'créer ou retrouver ne compte pas de vue');
});

test('parcours POST : aucune source (422), programme ou module invalide, IA en panne (502) ; rien n’est enregistré', async () => {
  toutVoir();
  const j = await creerJoueur();
  const post = (sc, titre = 'La tour Eiffel') => appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { titre } });
  // Wikipédia injoignable, ou aucune page qui ressemble au titre.
  for (const panne of [500, 'reseau']) {
    wiki.panne = panne;
    const sc = scenario(partiesStandard());
    erreurFr(await post(sc), 422, /aucune source/);
    assert.equal(sc.appels.length, 0, 'l’IA n’écrit pas sans source');
  }
  reinitWiki();
  erreurFr(await post(scenario(partiesStandard()), 'Zorglub inconnu'), 422);
  // Programme invalide deux fois (Llama puis Mistral), ou texte sans JSON, ou pannes.
  const trois = programmeBrut();
  trois.niveaux.pop();
  const sc1 = scenario({ ...partiesStandard(), programme: [trois] });
  erreurFr(await post(sc1), 502, /n’a pas réussi/);
  // Chaque rédacteur essaie le programme complet, puis le programme court.
  assert.deepEqual(sc1.appels.map((a) => [a.etape, a.modele]), [['programme', LLAMA], ['programme2', LLAMA], ['programme', MISTRAL], ['programme2', MISTRAL]]);
  const sc2 = scenario({ ...partiesStandard(), programme: ['Désolé, je ne peux pas.', new Error('panne')] });
  erreurFr(await post(sc2), 502);
  assert.equal(sc2.appels.length, 3, 'Llama illisible (complet, court), Mistral en panne : pas de programme court');
  const repli = scenario({ ...partiesStandard(), programme: [trois, programmeBrut()] });
  ok200(await post(repli));
  assert.deepEqual(repli.appels.map((a) => [a.etape, a.modele]), [['programme', LLAMA], ['programme2', LLAMA], ['programme', MISTRAL], ['module', LLAMA]]);
  assert.equal(lignes('SELECT * FROM parcours').length, 1);
  // Liste de leçons invalide (4 titres) deux fois : rien n'est enregistré, même si le programme était bon.
  viderBibliotheque();
  const quatre = moduleBrut();
  quatre.lecons = quatre.lecons.slice(0, 4);
  const sc3 = scenario({ ...partiesStandard(), module: [quatre] });
  erreurFr(await post(sc3), 502);
  assert.deepEqual(sc3.appels.map((a) => a.etape), ['programme', 'module', 'module']);
  assert.equal(lignes('SELECT * FROM parcours').length, 0);
  // Résumé à une phrase : programme refusé.
  const court = programmeBrut();
  court.resume = 'Une seule phrase assez longue pour passer la longueur minimale demandée.';
  erreurFr(await post(scenario({ ...partiesStandard(), programme: [court] })), 502);
  assert.equal(lignes('SELECT * FROM parcours').length, 0);
});

test('parcours POST : un motImage invalide est retiré (la photo est cherchée avec le titre), le parcours est quand même créé', async () => {
  toutVoir();
  const j = await creerJoueur();
  const brut = programmeBrut();
  brut.motImage = 'Tour Eiffel à Paris, très belle !';
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const sc = scenario({ ...partiesStandard(), programme: [brut] });
  const r = await appel(parcoursPost, { env: envDe(sc, { UNSPLASH_KEY: 'u' }), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.equal(ext.appels[0].url.searchParams.get('query'), 'La tour Eiffel');
  assert.equal(r.corps.parcours.etapes[0].titre, TITRE_MODULE_1, 'le titre de l’étape est celui du module');
  assert.equal(JSON.parse(lignes('SELECT contenu FROM parcours')[0].contenu).motImage, null);
});

test('parcours POST : la typographie française est appliquée au programme et à l’étape', async () => {
  toutVoir();
  const j = await creerJoueur();
  const brut = programmeBrut();
  brut.niveaux[0].titre = 'Bases : les repères';
  brut.niveaux[0].modules[1].objectif = 'Comprendre pourquoi la tour est bâtie : pour l’Exposition de 1889 ?';
  const mod = moduleBrut();
  mod.lecons[1] = 'Où et quand : un lieu ?';
  const sc = scenario({ ...partiesStandard(), programme: [brut], module: [mod] });
  const r = await appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  const p = r.corps.parcours;
  assert.equal(p.programme.niveaux[0].titre, 'Bases : les repères');
  assert.equal(p.programme.niveaux[0].modules[1].objectif, 'Comprendre pourquoi la tour est bâtie : pour l’Exposition de 1889 ?');
  assert.equal(p.etapes[0].paliers[1].titre, 'Où et quand : un lieu ?');
});

test('parcours POST : 10 par jour et par lecteur, 80 par jour au total (le cache n’en consomme pas)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const sc = scenario(partiesStandard());
  const e = envDe(sc);
  const lancer = (lecteur, titre) => appel(parcoursPost, { env: e, methode: 'POST', jeton: lecteur.jeton, corps: { titre } });
  for (let i = 0; i < 10; i++) ok200(await lancer(j, 'La tour Eiffel ' + i));
  erreurFr(await lancer(j, 'La tour Eiffel onze'), 429);
  assert.equal(sc.par('programme').length, 10);
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'parcours:total'")[0].n, 10, 'le refus d’un lecteur n’entame pas le total');
  const cache = await lancer(j, 'La tour Eiffel 3');
  ok200(cache);
  assert.equal(cache.corps.parcours.id, 'la-tour-eiffel-3');
  ok200(await lancer(autre, 'La tour Eiffel autre'));
  db.base.prepare("UPDATE quotas SET n = 79 WHERE cle = 'parcours:total'").run();
  const dernier = await creerJoueur('Dernier');
  ok200(await lancer(dernier, 'La tour Eiffel dernier'));
  const sans = await creerJoueur('Sans');
  erreurFr(await lancer(sans, 'La tour Eiffel sans place'), 429);
  ok200(await lancer(sans, 'La tour Eiffel dernier'));
});

test('parcours POST : deux lecteurs sur le même parcours en même temps, le premier enregistré gagne', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario({
    ...partiesStandard(),
    programme: [() => {
      insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
      return programmeBrut();
    }],
  });
  const r = await appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.match(r.corps.parcours.resume, /^Un parcours inséré directement/);
  assert.equal(lignes('SELECT * FROM parcours').length, 1);
});

test('parcours GET : un parcours (une vue de plus), 400 sans id, 404 inconnu ; la liste des 60 plus lus', async () => {
  toutVoir();
  const j = await creerJoueur();
  const cree = await creerParcoursTest(j);
  erreurFr(await appel(parcoursGet, { requete: '?id=' }), 400);
  erreurFr(await appel(parcoursGet, { requete: '?id=inconnu' }), 404, /Parcours introuvable/);
  erreurFr(await appel(parcoursGet, { requete: '?id=Pas%20Valide' }), 404);
  for (let i = 1; i <= 3; i++) {
    const r = await appel(parcoursGet, { requete: '?id=la-tour-eiffel' });
    ok200(r);
    assert.deepEqual(Object.keys(r.corps), ['parcours']);
    assert.deepEqual(r.corps.parcours, cree);
    assert.equal(lignes('SELECT vues FROM parcours')[0].vues, i);
  }
  // Liste : par vues décroissantes, 60 au plus, public, sans contenu complet.
  toutVider();
  assert.deepEqual((await appel(parcoursGet)).corps, { parcours: [] });
  const attendus = [];
  for (let i = 0; i < 65; i++) {
    const id = 'p' + String(i).padStart(2, '0');
    const cree2 = `2026-10-19T08:${String(i % 60).padStart(2, '0')}:00.000Z`;
    insererParcours(id, { titre: 'Parcours ' + i, etapes: 1 + (i % 3), vues: i % 7, cree: cree2, image: i === 5 ? { src: 'https://exemple.test/i.jpg', alt: 'a', credit: 'c', lien: 'l' } : null });
    attendus.push({ id, vues: i % 7, cree: cree2 });
  }
  db.base.prepare("INSERT INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES ('casse', 'Cassé', 'pas du json', 'a', 0, '2000-01-01T00:00:00.000Z')").run();
  const liste = await appel(parcoursGet);
  ok200(liste);
  assert.deepEqual(Object.keys(liste.corps), ['parcours']);
  assert.equal(liste.corps.parcours.length, 60);
  assert.deepEqual(Object.keys(liste.corps.parcours[0]), ['id', 'titre', 'image', 'vues', 'paliers', 'lecons', 'modules', 'ouverts', 'niveauAtteint']);
  const ordre = attendus.sort((a, b) => b.vues - a.vues || (a.cree < b.cree ? 1 : a.cree > b.cree ? -1 : 0) || (a.id < b.id ? -1 : 1)).slice(0, 60);
  assert.deepEqual(liste.corps.parcours.map((x) => x.id), ordre.map((x) => x.id));
  const vues = liste.corps.parcours.map((x) => x.vues);
  assert.deepEqual(vues, [...vues].sort((a, b) => b - a));
  const p05 = liste.corps.parcours.find((x) => x.id === 'p05');
  assert.deepEqual(p05.image, { src: 'https://exemple.test/i.jpg', alt: 'a', credit: 'c', lien: 'l' });
  assert.equal(p05.paliers, 10 * (1 + (5 % 3)));
  assert.ok(!JSON.stringify(liste.corps).includes('"resume"') && !JSON.stringify(liste.corps).includes('auteur'));
  // Un contenu illisible est écarté de la liste, sans la faire échouer.
  toutVider();
  insererParcours('bon', { titre: 'Bon' });
  db.base.prepare("INSERT INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES ('casse', 'Cassé', 'pas du json', 'a', 99, '2026-10-19T09:00:00.000Z')").run();
  assert.deepEqual((await appel(parcoursGet)).corps.parcours.map((x) => x.id), ['bon']);
});

// --- GET /api/palier ---

const dernier = (liste) => liste[liste.length - 1];
const quotasPalier = () => lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'palier%' ORDER BY cle");
const nombres = (de, a) => Array.from({ length: a - de + 1 }, (_, i) => de + i);
async function prepare() {
  toutVoir();
  const j = await creerJoueur();
  await creerParcoursTest(j);
  wiki.appels.length = 0;
  return j;
}

test('palier GET : Gemini 429 -> GLM rédige, Grok vérifie ; Gemini mis de côté', async () => {
  const j = await prepare();
  reinitExt();
  const sc = scenario(partiesStandard());
  ext.gemini = () => new Response('RESOURCE_EXHAUSTED', { status: 429 });
  ext.grok = (u, init) => sc.glm(u, init);
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc, { GEMINI_API_KEY: CLE_GEMINI, GROK_API_KEY: CLE_GROK, ...AVEC_GLM });
  ok200(r);
  assert.deepEqual(r.corps.palier.verification.ia, ['glm-4.7-flash', 'grok-3-mini']);
  assert.equal(estEpuise('gemini'), true);
  // Gemini essaie ses 9 modèles (chacun a son quota), puis plus rien : il est mis de côté.
  assert.deepEqual(ext.appels.map((a) => a.fournisseur).filter((f) => f !== 'commons'), ['gemini', 'gemini', 'gemini', 'gemini', 'gemini', 'gemini', 'gemini', 'gemini', 'gemini', 'glm', 'grok']);
  reinitExt();
});

test('causes d’échec : quota gratuit de GLM épuisé ; Workers AI épuisé', async () => {
  const j = await prepare();
  reinitExt();
  const sc = scenario(partiesStandard());
  sc.glm = () => new Response('limite', { status: 429 });
  sc.ai = { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } };
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 1, sc, AVEC_GLM), 502, /\(cause : quota gratuit de GLM épuisé ; Workers AI épuisé\)/);
  assert.equal(estEpuise('glm') && estEpuise('workers-ai'), true);
  reinitExt();
});

test('palier GET : paramètres invalides 400, parcours ou palier hors plan 404, 401 sans connexion, 503 sans IA ; rien consommé', async () => {
  const j = await prepare();
  const sc = scenario(partiesStandard());
  for (const requete of ['', '?parcours=la-tour-eiffel', '?n=1', '?parcours=la-tour-eiffel&n=abc', '?parcours=la-tour-eiffel&n=1.5',
    '?parcours=la-tour-eiffel&n=-1', '?parcours=la-tour-eiffel&n=', '?parcours=la-tour-eiffel&n=0', '?parcours=la-tour-eiffel&n=1501',
    '?parcours=la-tour-eiffel&n=10000', '?parcours=la-tour-eiffel&n=00001']) {
    erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete }), 400);
  }
  erreurFr(await appel(palierGet, { env: envDe(sc), requete: '?parcours=inconnu&n=1' }), 404, /Parcours/);
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=Pas%20Valide&n=1' }), 404, /Parcours/);
  // Une seule étape à la fois : 20 est la dernière ouverte (étape 2), 21 est trop loin.
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=21' }), 404, /Leçon introuvable/);
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=500' }), 404, /Leçon introuvable/);
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=1500' }), 404, /Leçon introuvable/, 'plafond relevé à 1 500');
  // Pas encore en cache : connexion, puis IA.
  erreurFr(await appel(palierGet, { env: envDe(sc), requete: '?parcours=la-tour-eiffel&n=1' }), 401);
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: 'abcdefghij12.' + 'a'.repeat(32), requete: '?parcours=la-tour-eiffel&n=1' }), 401);
  erreurFr(await appel(palierGet, { env: envDe(sc), requete: '?parcours=la-tour-eiffel&n=20' }), 401);
  erreurFr(await appel(palierGet, { env: { DB: db, AI: undefined }, jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=1' }), 503, /IA absente/);
  assert.equal(sc.appels.length, 0);
  assert.equal(wiki.appels.length, 0);
  assert.equal(quotasPalier().length, 0);
  assert.equal(lignes('SELECT * FROM paliers').length, 0);
});

test('palier GET : génération (Llama écrit, Mistral vérifie) : forme, appels, sources, image, base et quotas', async () => {
  const j = await prepare();
  const sc = scenario(partiesStandard());
  ext.commons = () => reponseCommons(fichierCommons(1));
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['palier']);
  const p = r.corps.palier;
  assert.deepEqual(Object.keys(p), CLES_PALIER);
  assert.equal(p.id, 'la-tour-eiffel:1');
  assert.equal(p.parcours, 'la-tour-eiffel');
  assert.equal(p.numero, 1);
  assert.equal(p.etape, 1);
  assert.equal(p.titre, EXEMPLE_ETAPE.paliers[0]);
  assert.deepEqual(Object.keys(p.image), ['src', 'alt', 'largeur', 'hauteur', 'credit', 'lien', 'source']);
  assert.equal(p.image.credit, 'Jeanne Dupont · CC BY-SA 4.0 · Wikimédia Commons');
  assert.equal(p.image.lien, 'https://commons.wikimedia.org/wiki/File:Photo_1.jpg');
  assert.deepEqual(Object.keys(p.sections), ['enBref', 'comment', 'pourquoi', 'ouQuand']);
  assert.equal(p.sections.enBref, EXEMPLE_PALIER.sections.enBref.join(' '));
  assert.equal(p.sections.comment, EXEMPLE_PALIER.sections.comment.join(' '));
  assert.equal(p.sections.ouQuand, null);
  assert.deepEqual(p.definitions, EXEMPLE_PALIER.definitions);
  assert.deepEqual(p.frise, EXEMPLE_PALIER.frise);
  assert.deepEqual(p.chiffres, EXEMPLE_PALIER.chiffres);
  assert.deepEqual(p.notions, EXEMPLE_PALIER.notions);
  assert.equal(p.histoire, EXEMPLE_PALIER.histoire);
  assert.deepEqual(p.questions.map((q) => q.type), ['qcm', 'qcm', 'vraifaux', 'qcm']);
  assert.equal(p.questions[0].reponses[p.questions[0].bonne], 'L’Exposition universelle de 1889');
  assert.equal(p.questions[3].reponses[p.questions[3].bonne], 'Le Chrysler Building');
  assert.deepEqual(p.questions[2], EXEMPLE_PALIER.questions[2]);
  assert.deepEqual(p.sources, [
    ['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel'],
    ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower'],
  ]);
  assert.deepEqual(p.verification, { ia: [NOM_LLAMA, NOM_MISTRAL], affirmations: TOTAL, retirees: 0, statut: 'recoupe' });
  // Deux appels, dans l'ordre : rédaction (Llama), vérification (Mistral).
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['palier', 'ai', LLAMA], ['verif', 'ai', MISTRAL]]);
  const [ecriture, verif] = sc.appels;
  assert.equal(ecriture.entree.messages[0].content, PROMPT_PALIER);
  const demande = ecriture.entree.messages[1].content;
  assert.match(demande, /Parcours : « La tour Eiffel »/);
  assert.match(demande, /Étape n° 1 : « Les bases de la tour »/);
  assert.match(demande, /Palier à écrire : n° 1, « Une tour pour l’Exposition de 1889 »/);
  for (const t of EXEMPLE_ETAPE.paliers) assert.ok(demande.includes(t), 'le plan de l’étape est fourni : ' + t);
  assert.match(demande, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.match(demande, /Extrait 2 · Wikipedia \(en\), page « Eiffel Tower »/);
  assert.ok(!/Extrait 3/.test(demande), 'les pages de référence en double ne sont pas répétées');
  assert.ok(demande.includes('La tour Eiffel est décrit ici pour les tests.'));
  assert.ok(!demande.includes('NE PAS LIRE') && !demande.includes('DO NOT READ'));
  assert.ok(!demande.includes('contenait des affirmations'), 'pas de rappel à la première rédaction');
  assert.equal(verif.entree.messages[0].content, PROMPT_VERIFICATION);
  const v = verif.entree.messages[1].content;
  assert.match(v, /Extrait 1 · Wikipédia \(fr\)/);
  assert.match(v, /Affirmations à vérifier :\n1\. La tour Eiffel est une tour de fer puddlé/);
  assert.match(v, /\n18\. Question : Pour quelle occasion la tour Eiffel est-elle bâtie \? Bonne réponse : L’Exposition universelle de 1889\n19\. Explication : /);
  assert.match(v, /\n22\. Affirmation : La tour Eiffel devait rester debout définitivement dès 1889\. Verdict : FAUSSE\n/);
  assert.match(v, /\n25\. Explication : /);
  assert.ok(!/\n26\. /.test(v));
  // Wikipédia : une recherche FR + EN + lien interlangue (palier), plus les pages de référence (2 lectures).
  assert.deepEqual(ext.appels.map((a) => a.fournisseur), ['commons'], 'seul appel externe : la fiche Commons de l’image de la page');
  // Base et quotas.
  const [ligne] = lignes('SELECT id, parcours, numero, vues FROM paliers');
  assert.deepEqual(ligne, { id: 'la-tour-eiffel:1', parcours: 'la-tour-eiffel', numero: 1, vues: 0 });
  assert.deepEqual(JSON.parse(lignes('SELECT contenu FROM paliers')[0].contenu), p);
  assert.deepEqual(quotasPalier(), [{ cle: 'palier:joueur:' + j.id, n: 1 }, { cle: 'palier:total', n: 1 }]);
});

test('palier GET : un palier plus précis lit sa page (FR, EN) puis celles du parcours, 4 extraits au plus', async () => {
  const j = await prepare();
  const sc = scenario(partiesStandard());
  ext.commons = () => reponseCommons(fichierCommons(2));
  const r = await lirePalier(j, 'la-tour-eiffel', 2, sc);
  ok200(r);
  const demande = sc.appels[0].entree.messages[1].content;
  assert.match(demande, /Extrait 1 · Wikipédia \(fr\), page « Gustave Eiffel »/);
  assert.match(demande, /Extrait 2 · Wikipedia \(en\), page « Gustave Eiffel »/);
  assert.match(demande, /Extrait 3 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.match(demande, /Extrait 4 · Wikipedia \(en\), page « Eiffel Tower »/);
  assert.ok(!/Extrait 5/.test(demande));
  assert.deepEqual(r.corps.palier.sources.map((s) => s[0]), ['Wikipédia · Gustave Eiffel', 'Wikipedia (en) · Gustave Eiffel', 'Wikipédia · Tour Eiffel', 'Wikipedia (en) · Eiffel Tower']);
  assert.equal(r.corps.palier.image.lien, 'https://commons.wikimedia.org/wiki/File:Photo_2.jpg', 'image de la page la plus précise');
  assert.equal(ext.appels.find((x) => x.fournisseur === 'commons').url.searchParams.get('titles'), 'File:Gustave Eiffel.jpg');
  // Titre trop vague pour une page propre : les pages du parcours suffisent.
  const vague = await lirePalier(j, 'la-tour-eiffel', 10, scenario(partiesStandard()));
  ok200(vague);
  assert.deepEqual(vague.corps.palier.sources.map((s) => s[0]), ['Wikipédia · Tour Eiffel', 'Wikipedia (en) · Eiffel Tower']);
});

test('palier GET : GLM rédige, Mistral vérifie ; GLM en panne : Llama rédige et GLM vérifie ; vérificateur en panne : repli sur Llama', async () => {
  const j = await prepare();
  const sc = scenario(partiesStandard());
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc, AVEC_GLM);
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['palier', 'glm', 'glm-4.7-flash'], ['verif', 'ai', MISTRAL]]);
  assert.deepEqual(r.corps.palier.verification.ia, ['glm-4.7-flash', NOM_MISTRAL]);
  // GLM tombe : Llama rédige, et GLM (autre fournisseur) vérifie.
  const sc2 = scenario({ ...partiesStandard(), palier: [new Error('GLM saturé'), palierBrut()] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2, AVEC_GLM);
  ok200(r2);
  assert.deepEqual(sc2.appels.map((a) => [a.etape, a.via, a.modele]), [['palier', 'glm', 'glm-4.7-flash'], ['palier', 'ai', LLAMA], ['verif', 'glm', 'glm-4.7-flash']]);
  assert.deepEqual(r2.corps.palier.verification.ia, [NOM_LLAMA, 'glm-4.7-flash']);
  // Mistral tombe : Llama vérifie GLM.
  const sc3 = scenario({ ...partiesStandard(), verif: [new Error('Mistral indisponible'), verifNumeros()] });
  const r3 = await lirePalier(j, 'la-tour-eiffel', 3, sc3, AVEC_GLM);
  ok200(r3);
  assert.deepEqual(sc3.appels.map((a) => a.modele), ['glm-4.7-flash', MISTRAL, LLAMA]);
  assert.deepEqual(r3.corps.palier.verification.ia, ['glm-4.7-flash', NOM_LLAMA]);
  // Sans GLM : Llama écrit une réponse sans JSON, Mistral écrit, Llama vérifie Mistral.
  const sc4 = scenario({ ...partiesStandard(), palier: ['Je ne peux pas répondre à cette demande.', palierBrut()] });
  const r4 = await lirePalier(j, 'la-tour-eiffel', 4, sc4);
  ok200(r4);
  assert.deepEqual(sc4.appels.map((a) => [a.etape, a.modele]), [['palier', LLAMA], ['palier', MISTRAL], ['verif', LLAMA]]);
  assert.deepEqual(r4.corps.palier.verification.ia, [NOM_MISTRAL, NOM_LLAMA]);
  // Jamais le même modèle des deux côtés.
  for (const rep of [r, r2, r3, r4]) assert.notEqual(rep.corps.palier.verification.ia[0], rep.corps.palier.verification.ia[1]);
});

test('palier GET : les affirmations non confirmées sont retirées (statut « partiel »), une question non confirmée disparaît', async () => {
  const j = await prepare();
  const brut = palierBrut();
  brut.sections.comment[1] = 'Les ouvriers boivent du vin rouge LUNE chaque soir sur le chantier.';
  brut.definitions[1].definition = 'Fromage de LUNE servi sur le chantier de la tour Eiffel.';
  brut.questions[1].explication = 'La structure est en LUNE, une matière imaginaire pour ce test.';
  const sc = scenario({ ...partiesStandard(), palier: [brut], verif: [verifSi(/LUNE/)] });
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  const p = r.corps.palier;
  assert.equal(p.sections.comment, EXEMPLE_PALIER.sections.comment[0]);
  assert.deepEqual(p.definitions, [EXEMPLE_PALIER.definitions[0]]);
  assert.deepEqual(p.questions.map((q) => q.type), ['qcm', 'vraifaux', 'qcm']);
  assert.deepEqual(p.verification, { ia: [NOM_LLAMA, NOM_MISTRAL], affirmations: TOTAL, retirees: 1 + 1 + 2, statut: 'partiel' });
  assert.ok(!JSON.stringify(p).includes('LUNE'), 'rien de ce qui n’est pas confirmé ne reste');
  assert.equal(sc.appels.length, 2, 'moins de 40 % retiré et assez de questions : pas de nouvelle rédaction');
  assert.equal(p.frise.length, 3);
});

test('palier GET : plus de 40 % retiré ou moins de 2 questions : nouvelle rédaction (le rappel des rejets est fourni), on garde la meilleure', async () => {
  const j = await prepare();
  const seconde = () => { const b = palierBrut(); b.sections.enBref[0] = 'Seconde rédaction, plus fidèle aux extraits fournis.'; return b; };
  // 1. Plus de 40 % retiré : la seconde rédaction, entièrement confirmée, l’emporte.
  const sc = scenario({ ...partiesStandard(), palier: [palierBrut(), seconde()], verif: [verifNumeros(...nombres(4, 14)), verifNumeros()] });
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['palier', 'verif', 'palier', 'verif']);
  assert.match(sc.par('palier')[1].entree.messages[1].content, /contenait des affirmations introuvables dans les extraits/);
  assert.match(sc.par('palier')[1].entree.messages[1].content, /- Les pièces de fer sont fabriquées en atelier/);
  assert.ok(!sc.par('palier')[0].entree.messages[1].content.includes('contenait des affirmations'));
  assert.match(r.corps.palier.sections.enBref, /^Seconde rédaction/);
  assert.deepEqual([r.corps.palier.verification.retirees, r.corps.palier.verification.statut], [0, 'recoupe']);
  assert.deepEqual(quotasPalier()[0], { cle: 'palier:joueur:' + j.id, n: 1 }, 'un seul quota pour les deux rédactions');
  // 2. Seconde rédaction pire : on garde la première (13 retirées sur 25).
  const sc2 = scenario({ ...partiesStandard(), palier: [palierBrut(), seconde()], verif: [verifNumeros(...nombres(4, 14)), verifNumeros(...nombres(4, 17))] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2);
  ok200(r2);
  assert.equal(sc2.appels.length, 4);
  assert.match(r2.corps.palier.sections.enBref, /^La tour Eiffel est une tour de fer puddlé/);
  assert.deepEqual([r2.corps.palier.verification.retirees, r2.corps.palier.verification.statut], [13, 'partiel']);
  assert.deepEqual(r2.corps.palier.frise, []);
  assert.deepEqual(r2.corps.palier.chiffres, []);
  // 3. Moins de 2 questions : nouvelle rédaction.
  const sc3 = scenario({ ...partiesStandard(), palier: [palierBrut(), seconde()], verif: [verifNumeros(19, 21, 23), verifNumeros()] });
  const r3 = await lirePalier(j, 'la-tour-eiffel', 3, sc3);
  ok200(r3);
  assert.equal(sc3.appels.length, 4);
  assert.equal(r3.corps.palier.questions.length, 4);
  // 4. Pile 40 % (10 sur 25) : pas de nouvelle rédaction.
  const sc4 = scenario({ ...partiesStandard(), verif: [verifNumeros(4, 5, 6, 7, 8, 9, 13, 14)] });
  const r4 = await lirePalier(j, 'la-tour-eiffel', 4, sc4);
  ok200(r4);
  assert.equal(sc4.appels.length, 2);
  assert.equal(r4.corps.palier.verification.retirees, 10);
});

test('palier GET : sans vérification possible, ou palier sans « en bref », ou rédaction impossible : 502 et rien en cache', async () => {
  const j = await prepare();
  // Vérificateur muet : le brouillon n’est jamais publié.
  const sc = scenario({ ...partiesStandard(), verif: ['pas du JSON'] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 1, sc), 502, /recouper/);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['palier', 'verif', 'palier', 'verif']);
  // « En bref » entièrement retiré, deux fois.
  const sc2 = scenario({ ...partiesStandard(), verif: [verifNumeros(1, 2, 3)] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 1, sc2), 502);
  assert.equal(sc2.appels.length, 4);
  // Rédaction invalide ou en panne partout.
  const casse = palierBrut();
  casse.questions = casse.questions.slice(0, 2);
  const sc3 = scenario({ ...partiesStandard(), palier: [casse, new Error('panne')] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 1, sc3), 502);
  assert.deepEqual(sc3.appels.map((a) => a.etape), ['palier', 'palier', 'palier', 'palier']);
  assert.equal(lignes('SELECT * FROM paliers').length, 0);
  // Un palier non viable puis un palier viable : le second est gardé.
  const sc4 = scenario({ ...partiesStandard(), verif: [verifNumeros(1, 2, 3), verifNumeros()] });
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, sc4));
  assert.equal(sc4.appels.length, 4);
  // Wikipédia injoignable : aucune source, l’IA n’écrit pas (le cache des sources est vide).
  db.base.exec('DELETE FROM sources_cache');
  wiki.panne = 500;
  const sc5 = scenario(partiesStandard());
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 2, sc5), 502, /sources/);
  assert.equal(sc5.appels.length, 0);
});

test('palier GET : en cache, servi à tous (sans connexion, sans IA, sans Wikipédia, sans quota), une vue de plus', async () => {
  const j = await prepare();
  const premier = (await lirePalier(j, 'la-tour-eiffel', 1, scenario(partiesStandard()))).corps.palier;
  const appelsWiki = wiki.appels.length;
  const autre = await creerJoueur('Autre');
  const quotasAvant = lignes('SELECT cle, n FROM quotas ORDER BY cle');
  const sc = scenario(partiesStandard());
  for (const [e, jeton, requete] of [
    [envDe(sc), undefined, '?parcours=la-tour-eiffel&n=1'],
    [envDe(sc), autre.jeton, '?parcours=la-tour-eiffel&n=1'],
    [{ DB: db, AI: undefined }, undefined, '?parcours=la-tour-eiffel&n=01'],
  ]) {
    const r = await appel(palierGet, { env: e, jeton, requete });
    ok200(r);
    assert.deepEqual(r.corps.palier, premier);
  }
  assert.equal(sc.appels.length, 0);
  assert.equal(wiki.appels.length, appelsWiki);
  assert.equal(lignes('SELECT vues FROM paliers')[0].vues, 3);
  assert.equal(lignes('SELECT * FROM paliers').length, 1);
  assert.deepEqual(lignes('SELECT cle, n FROM quotas ORDER BY cle'), quotasAvant);
});

test('palier GET : au-delà du plan, le plan de l’étape suivante est écrit d’abord (10 paliers plus pointus, sans répéter les titres)', async () => {
  const j = await prepare();
  const sc = scenario({ ...partiesStandard(), etape: [etape2Brute()] });
  const r = await lirePalier(j, 'la-tour-eiffel', 11, sc);
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['etape', 'palier', 'verif']);
  const plan = sc.par('etape')[0].entree.messages;
  assert.equal(plan[0].content, PROMPT_ETAPE);
  assert.match(plan[1].content, /Parcours : « La tour Eiffel »/);
  assert.match(plan[1].content, /Étape à écrire : n° 2/);
  assert.match(plan[1].content, /Titres déjà publiés \(à ne pas répéter\) :/);
  for (const t of EXEMPLE_ETAPE.paliers) assert.ok(plan[1].content.includes('- ' + t), t);
  assert.match(plan[1].content, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.match(plan[1].content, /Extrait 2 · Wikipedia \(en\), page « Eiffel Tower »/);
  assert.equal(sc.par('etape')[0].entree.messages.length, 2);
  // L’étape est enregistrée dans le parcours (numéros 11 à 20) et le palier 11 en fait partie.
  const parcours = (await appel(parcoursGet, { requete: '?id=la-tour-eiffel' })).corps.parcours;
  assert.equal(parcours.etapes.length, 2);
  assert.deepEqual(parcours.etapes[1], {
    numero: 2,
    titre: 'Pour aller plus loin',
    paliers: etape2Brute().paliers.map((titre, i) => ({ numero: 11 + i, titre })),
  });
  assert.equal(r.corps.palier.numero, 11);
  assert.equal(r.corps.palier.etape, 2);
  assert.equal(r.corps.palier.titre, 'Les ateliers de Levallois-Perret');
  assert.match(sc.par('palier')[0].entree.messages[1].content, /Étape n° 2 : « Pour aller plus loin »/);
  assert.match(sc.par('palier')[0].entree.messages[1].content, /Palier à écrire : n° 11, « Les ateliers de Levallois-Perret »/);
  // Un seul quota pour le plan et le palier ; le palier suivant n’écrit pas de nouveau plan.
  assert.deepEqual(quotasPalier(), [{ cle: 'palier:joueur:' + j.id, n: 1 }, { cle: 'palier:total', n: 1 }]);
  const r12 = await lirePalier(j, 'la-tour-eiffel', 12, sc);
  ok200(r12);
  assert.equal(sc.par('etape').length, 1);
  assert.equal(r12.corps.palier.etape, 2);
  const liste = await appel(parcoursGet);
  assert.equal(liste.corps.parcours[0].paliers, 20);
  // Le palier 21 est désormais hors plan : étape 3 possible dès que le plan de l’étape 2 existe.
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=31' }), 404);
  const sc3 = scenario({ ...partiesStandard(), etape: [{ etape: 'Troisième étape', paliers: etape2Brute().paliers.map((t) => t + ' (suite)') }] });
  const r21 = await lirePalier(j, 'la-tour-eiffel', 21, sc3);
  ok200(r21);
  assert.equal(r21.corps.palier.etape, 3);
  assert.deepEqual(sc3.par('etape')[0].entree.messages[1].content.match(/- /g).length, 20, 'les 20 titres déjà publiés sont fournis');
});

test('palier GET : plan d’étape invalide (502, parcours inchangé) ; plan écrit mais palier raté : le plan reste, la suite ne le réécrit pas', async () => {
  const j = await prepare();
  const repete = etape2Brute();
  repete.paliers[0] = EXEMPLE_ETAPE.paliers[0];
  const sc = scenario({ ...partiesStandard(), etape: [repete] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 11, sc), 502);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['etape', 'etape']);
  assert.equal((await appel(parcoursGet, { requete: '?id=la-tour-eiffel' })).corps.parcours.etapes.length, 1);
  assert.equal(lignes('SELECT * FROM paliers').length, 0);
  // Plan correct, palier impossible à écrire.
  const sc2 = scenario({ ...partiesStandard(), etape: [etape2Brute()], palier: [new Error('panne')] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 11, sc2), 502);
  assert.equal((await appel(parcoursGet, { requete: '?id=la-tour-eiffel' })).corps.parcours.etapes.length, 2, 'le plan est gardé');
  // Nouvel essai : seulement le palier.
  const sc3 = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 11, sc3));
  assert.deepEqual(sc3.appels.map((a) => a.etape), ['palier', 'verif']);
  // Wikipédia injoignable : pas de plan possible sans sources.
  wiki.panne = 500;
  const sc4 = scenario({ ...partiesStandard(), etape: [etape2Brute()] });
  const r = await lirePalier(j, 'la-tour-eiffel', 21, sc4);
  erreurFr(r, 502, /sources/);
  assert.equal(sc4.appels.length, 0);
});

test('palier GET : deux lecteurs écrivent la même étape ou le même palier en même temps : le premier enregistré gagne', async () => {
  const j = await prepare();
  const autre = (id) => {
    const ligne = db.base.prepare('SELECT contenu FROM parcours WHERE id = ?').get(id);
    const c = JSON.parse(ligne.contenu);
    c.etapes.push({ numero: 2, titre: 'Écrite par un autre lecteur', paliers: nombres(11, 20).map((numero) => ({ numero, titre: 'Titre de l’autre lecteur ' + numero })) });
    db.base.prepare('UPDATE parcours SET contenu = ? WHERE id = ?').run(JSON.stringify(c), id);
  };
  const sc = scenario({ ...partiesStandard(), etape: [() => { autre('la-tour-eiffel'); return etape2Brute(); }] });
  const r = await lirePalier(j, 'la-tour-eiffel', 11, sc);
  ok200(r);
  assert.equal(r.corps.palier.titre, 'Titre de l’autre lecteur 11');
  const parcours = (await appel(parcoursGet, { requete: '?id=la-tour-eiffel' })).corps.parcours;
  assert.equal(parcours.etapes.length, 2);
  assert.equal(parcours.etapes[1].titre, 'Écrite par un autre lecteur');
  // Même palier.
  const sc2 = scenario({
    ...partiesStandard(),
    verif: [() => { insererPalierTest('la-tour-eiffel', 3); return verifNumeros(); }],
  });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 3, sc2);
  ok200(r2);
  assert.equal(r2.corps.palier.titre, 'Palier 3', 'le palier enregistré le premier est servi');
  assert.equal(lignes("SELECT * FROM paliers WHERE id = 'la-tour-eiffel:3'").length, 1);
});

test('palier GET : 30 par jour et par lecteur, 300 par jour au total (le cache n’en consomme pas)', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  insererParcours('p1', { titre: 'Parcours un', etapes: 3 });
  const sc = scenario(partiesStandard());
  for (let n = 1; n <= 30; n++) ok200(await lirePalier(j, 'p1', n, sc));
  assert.equal(sc.par('palier').length, 30);
  insererParcours('p2', { titre: 'Parcours deux' });
  erreurFr(await lirePalier(j, 'p2', 1, sc), 429);
  assert.equal(sc.par('palier').length, 30);
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'palier:total'")[0].n, 30, 'le refus d’un lecteur n’entame pas le total');
  // Quota épuisé : le cache reste lisible, sans connexion.
  ok200(await lirePalier(null, 'p1', 5, sc));
  ok200(await lirePalier(j, 'p1', 6, sc));
  assert.equal(sc.par('palier').length, 30);
  ok200(await lirePalier(autre, 'p2', 1, sc));
  // Plafond global.
  db.base.prepare("UPDATE quotas SET n = 299 WHERE cle = 'palier:total'").run();
  const dernierLecteur = await creerJoueur('Dernier');
  ok200(await lirePalier(dernierLecteur, 'p2', 2, sc));
  const sans = await creerJoueur('Sans');
  erreurFr(await lirePalier(sans, 'p2', 3, sc), 429);
  ok200(await lirePalier(sans, 'p2', 2, sc));
});

// --- Formation par programme : leçons, ouverture des modules, fin ---

// Parcours à programme inséré directement : `ouverts` modules déjà ouverts, `lecons` leçons chacun.
function insererProgramme(id, { titre = id, ouverts = 1, lecons = 5, vues = 0 } = {}) {
  const programme = { niveaux: validerProgramme(EXEMPLE_PROGRAMME).valeur.niveaux };
  const etapes = modulesDe(programme).slice(0, ouverts).map((m, i) => ({
    numero: m.numero,
    titre: m.titre,
    niveau: m.niveau.numero,
    objectif: m.objectif,
    paliers: Array.from({ length: lecons }, (_, k) => ({ numero: i * lecons + k + 1, titre: `Leçon ${i * lecons + k + 1} du module ${m.numero}` })),
  }));
  const contenu = {
    resume: EXEMPLE_PROGRAMME.resume,
    image: null,
    motImage: null,
    etapes,
    sources: [['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel'], ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower']],
    programme,
  };
  db.base.prepare('INSERT INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, titre, JSON.stringify(contenu), 'auteur', vues, '2026-10-19T08:00:00.000Z');
}
const lireParcours = async (id) => (await appel(parcoursGet, { requete: '?id=' + id })).corps.parcours;
async function prepareProgramme() {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  ok200(await appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } }));
  wiki.appels.length = 0;
  return j;
}

test('leçon (parcours à programme) : forme, niveau et module, « à retenir », mnémo, appels, vérification et quotas', async () => {
  const j = await prepareProgramme();
  const sc = scenario(partiesStandard());
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  const p = r.corps.palier;
  assert.deepEqual(Object.keys(p), CLES_LECON);
  assert.deepEqual([p.id, p.parcours, p.numero, p.etape, p.titre], ['la-tour-eiffel:1', 'la-tour-eiffel', 1, 1, EXEMPLE_MODULE.lecons[0]]);
  assert.deepEqual(p.niveau, { numero: 1, titre: 'Bases : les repères' });
  assert.deepEqual(p.module, { numero: 1, titre: TITRE_MODULE_1 });
  assert.deepEqual(p.aRetenir, EXEMPLE_LECON.aRetenir);
  assert.deepEqual(p.avant, EXEMPLE_LECON.avant);
  assert.equal(p.exemple.replace(/[\u00a0\u202f]/g, ' '), EXEMPLE_LECON.exemple.replace(/[\u00a0\u202f]/g, ' '));
  assert.equal(p.cartes.length, 3);
  assert.equal(p.cartes[0].recto.replace(/[\u00a0\u202f]/g, ' '), EXEMPLE_LECON.cartes[0].recto);
  assert.equal(p.mnemo.replace(/[\u00a0\u202f]/g, ' '), EXEMPLE_LECON.mnemo.replace(/[\u00a0\u202f]/g, ' '), 'typographie française appliquée');
  assert.equal(p.definitions.length, 2);
  assert.equal(p.sections.enBref, EXEMPLE_PALIER.sections.enBref.join(' '));
  assert.deepEqual(p.verification, { ia: [NOM_LLAMA, NOM_MISTRAL], affirmations: TOTAL_LECON, retirees: 0, statut: 'recoupe' });
  // Deux appels : rédaction de la leçon (prompt de leçon, Llama), vérification (Mistral).
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['lecon', 'ai', LLAMA], ['leconB', 'ai', LLAMA], ['verif', 'ai', MISTRAL]]);
  const [ecriture, ecritureB, verif] = sc.appels;
  assert.equal(ecriture.entree.messages[0].content, PROMPT_LECON_A);
  assert.equal(ecritureB.entree.messages[0].content, PROMPT_LECON_B);
  assert.match(ecritureB.entree.messages[1].content, /Écris la partie B de la leçon en JSON : seulement les champs demandés\.$/);
  const demande = ecriture.entree.messages[1].content;
  assert.match(demande, /Parcours : « La tour Eiffel »/);
  assert.match(demande, /Niveau n° 1 : « Bases\s: les repères »\nConsigne de ton : Bases : pars de zéro\. Le lecteur ne connaît rien au sujet\. Définis tout mot technique\. Phrases très simples/);
  assert.match(demande, /Module n° 1 : « Qu’est-ce que la tour Eiffel.\? »\nObjectif du module : Dire ce qu’est la tour/);
  assert.ok(!demande.includes('Prérequis du module'), 'aucun prérequis pour le module 1');
  assert.match(demande, /C’est la toute première leçon de la formation/);
  for (const [i, t] of EXEMPLE_MODULE.lecons.entries()) assert.ok(demande.includes(`${i + 1}. ${t}`), 'leçons du module : ' + t);
  assert.match(demande, /Palier à écrire : n° 1, « Le vocabulaire de la tour »/);
  assert.ok(!demande.includes('Termes déjà définis'), 'aucun terme défini pour la première leçon');
  assert.match(demande, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  // Vérification : 35 affirmations, dont les 3 « à retenir », le moyen mnémotechnique, 2 rappels, l’exemple et 3 cartes.
  const v = verif.entree.messages[1].content;
  assert.match(v, /\n18\. La tour est bâtie pour l’Exposition universelle de 1889, à Paris\.\n19\. Sa structure/);
  assert.match(v, /\n21\. Moyen mnémotechnique : Pour fixer 1889/);
  assert.match(v, /\n29\. Explication : /);
  assert.match(v, /\n30\. Rappel : Une exposition universelle/);
  assert.match(v, /\n32\. Exemple : On peut comparer la tour à un jeu de construction/);
  assert.match(v, /\n33\. Carte : Pour quelle occasion la tour est-elle bâtie ?/);
  assert.match(v, /\n35\. Carte : /);
  assert.ok(!/\n36\. /.test(v));
  assert.deepEqual(JSON.parse(lignes('SELECT contenu FROM paliers')[0].contenu), p);
  assert.deepEqual(quotasPalier(), [{ cle: 'palier:joueur:' + j.id, n: 1 }, { cle: 'palier:total', n: 1 }]);
  // Budget de la leçon : deux appels de 2 200 jetons au plus (3 500 pour un palier de l'ancien format), vérification de 400.
  const jetons = [];
  const scJ = scenario(partiesStandard());
  const ai = { run: (modele, entree) => { jetons.push(entree.max_tokens); return scJ.ai.run(modele, entree); } };
  ok200(await lirePalier(j, 'la-tour-eiffel', 2, scJ, { AI: ai }));
  assert.deepEqual(jetons, [2200, 2200, 700], 'deux moitiés de 2 200 jetons, vérification de 700');
});

test('leçon : les termes déjà définis par les leçons précédentes sont fournis (200 au plus, noms seulement), pas les suivantes', async () => {
  const j = await prepareProgramme();
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, scenario(partiesStandard())));
  const sc = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 2, sc));
  const demande = sc.appels[0].entree.messages[1].content;
  assert.match(demande, /Termes déjà définis dans les leçons précédentes \(ne les redéfinis pas, appuie-toi dessus\) :\n- Fer puddlé\n- Rivet\n/);
  assert.ok(!demande.includes('Un fer obtenu') && !demande.includes('Tige métallique'), 'les noms seulement, pas les définitions');
  // La leçon 1 ne voit pas la leçon 2 déjà en cache.
  const sc1 = scenario(partiesStandard());
  db.base.prepare('DELETE FROM paliers WHERE numero = 1').run();
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, sc1));
  assert.ok(!sc1.appels[0].entree.messages[1].content.includes('Termes déjà définis'));
  // 200 termes au plus, les plus récents d'abord, sans doublon.
  for (const n of [3, 4, 5, 8]) {
    const contenu = { id: `la-tour-eiffel:${n}`, definitions: Array.from({ length: 120 }, (_, i) => ({ terme: `Terme ${n}-${i}`, definition: 'x' })) };
    db.base.prepare('INSERT OR REPLACE INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES (?, ?, ?, ?, 0, ?)')
      .run(contenu.id, 'la-tour-eiffel', n, n === 3 ? 'pas du json' : JSON.stringify(contenu), '2026-10-19T08:00:00.000Z');
  }
  db.base.prepare("INSERT INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES ('autre:1', 'autre', 1, ?, 0, 'x')").run(JSON.stringify({ definitions: [{ terme: 'Autre parcours' }] }));
  const sc40 = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 6, sc40));
  const liste = sc40.appels[0].entree.messages[1].content.split('Termes déjà définis dans les leçons précédentes (ne les redéfinis pas, appuie-toi dessus) :\n')[1].split('\n=== Extrait')[0].trim().split('\n');
  assert.equal(liste.length, 200);
  assert.ok(liste.every((l) => l.startsWith('- ')));
  assert.deepEqual([liste[0], liste[119], liste[120], liste[199]], ['- Terme 5-0', '- Terme 5-119', '- Terme 4-0', '- Terme 4-79'], 'les plus récents d’abord');
  assert.ok(!liste.some((l) => l.startsWith('- Terme 8-') || l.includes('Autre parcours')), 'seulement les leçons antérieures du même parcours');
  // Parcours de l'ancien format : pas de termes, prompt de palier.
  await creerParcoursTest(j, 'Ancien format');
  const scA = scenario(partiesStandard());
  ok200(await lirePalier(j, 'ancien-format', 1, scA));
  assert.equal(scA.appels[0].entree.messages[0].content, PROMPT_PALIER);
  assert.ok(!scA.appels[0].entree.messages[1].content.includes('Termes déjà définis'));
});

test('leçon : « à retenir » et moyen mnémotechnique passent par la vérification (non confirmés : retirés)', async () => {
  const j = await prepareProgramme();
  const brut = leconBrute();
  brut.aRetenir[1] = 'Les ouvriers boivent du vin rouge LUNE chaque soir sur le chantier.';
  brut.mnemo = 'Pense à la LUNE posée sur la pointe de la tour, comme un chapeau.';
  const sc = scenario({ ...partiesStandard(), lecon: [brut], verif: [verifSi(/LUNE/)] });
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  const p = r.corps.palier;
  assert.deepEqual(p.aRetenir, [EXEMPLE_LECON.aRetenir[0], EXEMPLE_LECON.aRetenir[2]]);
  assert.equal(p.mnemo, null);
  assert.deepEqual(p.verification, { ia: [NOM_LLAMA, NOM_MISTRAL], affirmations: TOTAL_LECON, retirees: 2, statut: 'partiel' });
  assert.ok(!JSON.stringify(p).includes('LUNE'));
  assert.equal(sc.appels.length, 3, 'moins de 40 % retiré : pas de nouvelle rédaction (deux moitiés + vérification)');
  // Mnémo confirmé : il reste. Mnémo invalide dès la rédaction : null, sans refus.
  const sc2 = scenario({ ...partiesStandard(), lecon: [{ ...leconBrute(), mnemo: 'Court' }] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2);
  ok200(r2);
  assert.equal(r2.corps.palier.mnemo, null);
  assert.equal(r2.corps.palier.verification.affirmations, TOTAL_LECON - 1);
  // Sans « à retenir » valable : la leçon est publiée sans ce bloc (il ne fait pas échouer la moitié A).
  const sans = leconBrute();
  delete sans.aRetenir;
  const sc3 = scenario({ ...partiesStandard(), lecon: [sans] });
  const r3 = await lirePalier(j, 'la-tour-eiffel', 3, sc3);
  ok200(r3);
  assert.deepEqual(sc3.appels.map((a) => [a.etape, a.modele]), [['lecon', LLAMA], ['leconB', LLAMA], ['verif', MISTRAL]]);
  assert.deepEqual(r3.corps.palier.aRetenir, []);
});

test('module : la leçon suivante hors plan ouvre le module suivant (numéros qui continuent, niveau, objectif), un seul quota', async () => {
  const j = await prepareProgramme();
  assert.equal((await lireParcours('la-tour-eiffel')).etapes[0].paliers.length, 6);
  const sc = scenario({ ...partiesStandard(), module: [module2Brut()] });
  const r = await lirePalier(j, 'la-tour-eiffel', 7, sc);
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['module', 'lecon', 'leconB', 'verif']);
  const mod = sc.par('module')[0].entree.messages;
  assert.equal(mod[0].content, PROMPT_MODULE);
  assert.match(mod[1].content, /Module à écrire : n° 2, « Le vocabulaire de la tour »/);
  assert.match(mod[1].content, /Module 1 · Qu’est-ce que la tour Eiffel.\?\n  Module 2 · Le vocabulaire de la tour \(module à écrire\)/);
  assert.match(mod[1].content, /Objectif du module : Connaître les mots de base.: fer, rivet, ingénieur, exposition\./);
  assert.match(mod[1].content, /Prérequis du module \(déjà vus\) : « Qu’est-ce que la tour Eiffel.\? »\n/);
  assert.match(mod[1].content, /Titres de leçons déjà publiés \(à ne pas répéter\) :\n- Le vocabulaire de la tour\n/);
  for (const t of EXEMPLE_MODULE.lecons) assert.ok(mod[1].content.includes('- ' + t), t);
  assert.match(mod[1].content, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  // L'étape 2 est enregistrée : leçons 7 à 12 ; la leçon 7 en fait partie.
  const p = await lireParcours('la-tour-eiffel');
  assert.equal(p.etapes.length, 2);
  assert.deepEqual(p.etapes[1], {
    numero: 2,
    titre: 'Le vocabulaire de la tour',
    niveau: 1,
    objectif: typographierTexte(MODULES_EXEMPLE[1].objectif),
    paliers: module2Brut().lecons.map((titre, i) => ({ numero: 7 + i, titre })),
  });
  assert.deepEqual(r.corps.palier.module, { numero: 2, titre: 'Le vocabulaire de la tour' });
  assert.equal(r.corps.palier.etape, 2);
  assert.equal(r.corps.palier.numero, 7);
  assert.equal(r.corps.palier.titre, 'Le projet de Koechlin et Nouguier');
  const msgLecon = sc.par('lecon')[0].entree.messages[1].content;
  assert.match(msgLecon, /Module n° 2 : « Le vocabulaire de la tour »\nObjectif du module : Connaître/);
  assert.match(msgLecon, /Prérequis du module \(déjà vus\) : « Qu’est-ce que la tour Eiffel.\? »\nLeçons du module :/);
  assert.match(msgLecon, /\n7\. Le projet de Koechlin et Nouguier\n8\. Stephen Sauvestre/);
  assert.match(msgLecon, /Leçons publiées juste avant \(déjà lues par le lecteur\) :\n- Le vocabulaire de la tour\n- Où et quand elle est bâtie\n/);
  assert.ok(msgLecon.indexOf('- Ce qu’il faut retenir') > 0 && msgLecon.indexOf('- Ce qu’il faut retenir') < msgLecon.indexOf('Palier à écrire'), 'les 6 leçons du module 1 précèdent la leçon 7');
  assert.deepEqual(quotasPalier(), [{ cle: 'palier:joueur:' + j.id, n: 1 }, { cle: 'palier:total', n: 1 }]);
  assert.equal((await appel(parcoursGet)).corps.parcours[0].paliers, 12, 'la liste compte les leçons connues');
  // La leçon 8 n'ouvre rien ; la 13 ouvre le module 3.
  const sc8 = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 8, sc8));
  assert.equal(sc8.par('module').length, 0);
  const sc13 = scenario({ ...partiesStandard(), module: [{ lecons: ['Les débuts de l’entreprise', 'Les ponts et viaducs', 'La statue de la Liberté', 'Le laboratoire d’aérodynamique', 'Les dernières années', 'Le bilan de la carrière'] }] });
  const r13 = await lirePalier(j, 'la-tour-eiffel', 13, sc13);
  ok200(r13);
  assert.deepEqual([r13.corps.palier.etape, r13.corps.palier.module.titre, r13.corps.palier.numero], [3, 'Les grands repères', 13]);
  assert.equal((await lireParcours('la-tour-eiffel')).etapes[2].paliers[5].numero, 18);
});

test('module : le niveau change avec le module (ton du niveau dans la leçon) ; la numérotation suit le nombre réel de leçons', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 6, lecons: 7 });
  const sc = scenario({ ...partiesStandard(), module: [{ lecons: Array.from({ length: 10 }, (_, i) => 'Leçon du module sept ' + (i + 1)) }] });
  const r = await lirePalier(j, 'prog', 43, sc);
  ok200(r);
  const p = await lireParcours('prog');
  assert.deepEqual(p.etapes[6].paliers.map((x) => x.numero), nombres(43, 52));
  assert.deepEqual([p.etapes[6].niveau, p.etapes[6].titre], [2, 'Le projet et ses auteurs']);
  assert.match(sc.par('lecon')[0].entree.messages[1].content, /Prérequis du module \(déjà vus\) : « Gustave Eiffel, l’ingénieur »/);
  assert.deepEqual(r.corps.palier.niveau, { numero: 2, titre: 'Intermédiaire : la construction' });
  assert.match(sc.par('lecon')[0].entree.messages[1].content, /Niveau n° 2 : « Intermédiaire : la construction »\nConsigne de ton : Intermédiaire : relie les notions/);
  assert.match(sc.par('module')[0].entree.messages[1].content, /Niveau : n° 2, « Intermédiaire : la construction »/);
  // Tons des quatre niveaux, d'après le niveau du module.
  for (const [ouverts, niveau, ton] of [[11, 3, 'Avancé : travaille'], [16, 4, 'Expert : appuie-toi']]) {
    toutVoir();
    const j2 = await creerJoueur();
    insererProgramme('prog', { titre: 'La tour Eiffel', ouverts, lecons: 5 });
    const s2 = scenario(partiesStandard());
    const r2 = await lirePalier(j2, 'prog', ouverts * 5 + 1, s2);
    ok200(r2);
    assert.equal(r2.corps.palier.niveau.numero, niveau);
    assert.ok(s2.par('lecon')[0].entree.messages[1].content.includes('Consigne de ton : ' + ton), ton);
  }
});

test('module : trop loin 404, module plus court que la leçon demandée 404 (le module reste), module invalide 502 (rien d’enregistré)', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 2, lecons: 5 });
  const sc = scenario(partiesStandard());
  // Seul le module qui suit peut s'ouvrir : 10 leçons connues, 11 à 20 permis, 21 trop loin.
  erreurFr(await lirePalier(j, 'prog', 21, sc), 404, /Leçon introuvable : lis d’abord les leçons précédentes/);
  erreurFr(await lirePalier(j, 'prog', 500, sc), 404, /Leçon introuvable/);
  assert.equal(sc.appels.length, 0);
  assert.equal(quotasPalier().length, 0);
  // Liste de leçons invalide, puis en panne : 502, le parcours reste inchangé.
  const court = moduleBrut();
  court.lecons.length = 5;
  const sc1 = scenario({ ...partiesStandard(), module: [court] });
  erreurFr(await lirePalier(j, 'prog', 11, sc1), 502, /suite de ce parcours/);
  assert.deepEqual(sc1.appels.map((a) => [a.etape, a.modele]), [['module', LLAMA], ['module', MISTRAL]]);
  assert.equal((await lireParcours('prog')).etapes.length, 2);
  // Un titre déjà publié est refusé.
  const repete = module2Brut();
  repete.lecons[0] = 'Leçon 3 du module 1';
  erreurFr(await lirePalier(j, 'prog', 11, scenario({ ...partiesStandard(), module: [repete] })), 502);
  // Wikipédia injoignable : pas de liste de leçons sans sources.
  wiki.panne = 500;
  const sc2 = scenario(partiesStandard());
  erreurFr(await lirePalier(j, 'prog', 11, sc2), 502, /sources/);
  assert.equal(sc2.appels.length, 0);
  wiki.panne = null;
  // Le module ouvert compte 6 leçons : la 17 n'existe pas (le module 3 est tout de même enregistré).
  const sc3 = scenario({ ...partiesStandard(), module: [module2Brut()] });
  erreurFr(await lirePalier(j, 'prog', 17, sc3), 404, /Leçon introuvable : lis d’abord les leçons précédentes/);
  assert.deepEqual(sc3.appels.map((a) => a.etape), ['module']);
  const p = await lireParcours('prog');
  assert.deepEqual([p.etapes.length, p.etapes[2].paliers.map((x) => x.numero)], [3, nombres(11, 16)]);
  assert.equal(lignes('SELECT * FROM paliers').length, 0);
  ok200(await lirePalier(j, 'prog', 11, scenario(partiesStandard())));
});

test('fin de formation : tous les modules ouverts, la leçon suivante répond 404 « Formation terminée » (public, sans IA, sans quota)', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 20, lecons: 5 });
  const sc = scenario({ ...partiesStandard(), module: [module2Brut()] });
  // Le dernier module (21) s'ouvre : 101 à 106.
  const r = await lirePalier(j, 'prog', 101, sc);
  ok200(r);
  const p = await lireParcours('prog');
  assert.equal(p.etapes.length, 21);
  assert.equal(p.modulesTotal, 21);
  assert.deepEqual([r.corps.palier.niveau.numero, r.corps.palier.module.numero], [4, 21]);
  // Plus rien après : même message sans connexion, quel que soit le numéro demandé au-delà.
  const quotas = lignes('SELECT cle, n FROM quotas ORDER BY cle');
  const sc2 = scenario(partiesStandard());
  for (const [jeton, n] of [[j.jeton, 107], [undefined, 107], [j.jeton, 112], [j.jeton, 500]]) {
    const rep = await appel(palierGet, { env: envDe(sc2), jeton, requete: `?parcours=prog&n=${n}` });
    erreurFr(rep, 404, /^Formation terminée : tu as fait le tour de ce sujet\.$/);
  }
  const rep = await appel(palierGet, { env: { DB: db, AI: undefined }, requete: '?parcours=prog&n=107' });
  assert.deepEqual([rep.statut, rep.corps], [404, { erreur: MESSAGE_FIN }]);
  assert.equal(sc2.appels.length, 0);
  assert.deepEqual(lignes('SELECT cle, n FROM quotas ORDER BY cle'), quotas);
  // Les leçons existantes restent lisibles.
  ok200(await lirePalier(j, 'prog', 60, sc2));
  // Tant qu'il reste un module à ouvrir, c'est le garde habituel : 10 de plus au plus.
  insererProgramme('autre', { titre: 'Autre', ouverts: 11, lecons: 5 });
  erreurFr(await lirePalier(j, 'autre', 66, scenario(partiesStandard())), 404, /Leçon introuvable : lis d’abord/);
});

test('parcours à programme : GET renvoie programme et modulesTotal ; l’ancien format renvoie programme null et modulesTotal 0', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 2, lecons: 5, vues: 3 });
  insererParcours('ancien', { titre: 'Ancien', etapes: 2, vues: 1 });
  const p = await lireParcours('prog');
  assert.deepEqual(Object.keys(p), CLES_PARCOURS);
  assert.equal(p.modulesTotal, NB_MODULES);
  assert.equal(p.programme.niveaux.length, 4);
  assert.equal(p.programme.niveaux[0].modules[0].objectif, EXEMPLE_PROGRAMME.niveaux[0].modules[0].objectif);
  assert.equal(p.etapes.length, 2);
  const a = await lireParcours('ancien');
  assert.deepEqual(Object.keys(a), CLES_PARCOURS);
  assert.deepEqual([a.programme, a.modulesTotal, a.etapes.length], [null, 0, 2]);
  assert.deepEqual(a.etapes[1], { numero: 2, titre: 'Étape 2', paliers: nombres(11, 20).map((numero) => ({ numero, titre: `Palier ${numero} de Ancien` })) });
  // Liste : inchangée (même clés), nombre de leçons connues.
  const liste = (await appel(parcoursGet)).corps.parcours;
  assert.deepEqual(Object.keys(liste[0]), ['id', 'titre', 'image', 'vues', 'paliers', 'lecons', 'modules', 'ouverts', 'niveauAtteint']);
  assert.deepEqual(liste.map((x) => [x.id, x.paliers]), [['prog', 10], ['ancien', 20]]);
  // Ancien format : une leçon hors plan écrit encore une étape de 10 paliers, sans fin (aucune « formation terminée »).
  const sc = scenario({ ...partiesStandard(), etape: [etape2Brute()] });
  const r = await lirePalier(j, 'ancien', 21, sc);
  ok200(r);
  assert.deepEqual(sc.appels.map((x) => x.etape), ['etape', 'palier', 'verif']);
  assert.equal(sc.par('etape')[0].entree.messages[0].content, PROMPT_ETAPE);
  assert.deepEqual(Object.keys(r.corps.palier), CLES_PALIER);
  assert.equal((await lireParcours('ancien')).etapes.length, 3);
  assert.equal((await lireParcours('ancien')).modulesTotal, 0);
});

test('création d’un parcours : le programme (50 s) puis le module 1 (30 s) respectent les délais et le temps restant', async () => {
  toutVoir();
  const j = await creerJoueur();
  const delais = [];
  const vrai = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...reste) => { delais.push(ms); return vrai(fn, ms, ...reste); };
  try {
    ok200(await appel(parcoursPost, { env: envDe(scenario(partiesStandard())), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } }));
    const longs = delais.filter((d) => d > 1000);
    assert.equal(longs.length, 2, longs.join(' '));
    assert.ok(longs[0] <= REGLAGES.delaiProgrammeMs && longs[0] > 49000, 'programme : ' + longs[0]);
    assert.ok(longs[1] <= REGLAGES.delaiPlanMs && longs[1] > 29000, 'module : ' + longs[1]);
    assert.deepEqual([REGLAGES.delaiProgrammeMs, REGLAGES.delaiPlanMs, REGLAGES.budgetMs], [50000, 30000, 85000]);
    // Un programme de 50 s : il reste 35 s, le module garde ses 30 s ; un programme de 60 s : 25 s restent.
    viderBibliotheque();
    delais.length = 0;
    const lent = scenario({ ...partiesStandard(), programme: [() => { horloge.t += 60000; return programmeBrut(); }] });
    ok200(await appel(parcoursPost, { env: envDe(lent), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } }));
    const apres = delais.filter((d) => d > 1000);
    assert.ok(apres[1] <= 25000 && apres[1] > 24000, 'module après 60 s : ' + apres[1]);
    // Plus de temps du tout : pas d'appel pour le module, 502.
    viderBibliotheque();
    horloge.t = 0;
    const epuise = scenario({ ...partiesStandard(), programme: [() => { horloge.t += 82000; return programmeBrut(); }] });
    erreurFr(await appel(parcoursPost, { env: envDe(epuise), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } }), 502);
    assert.deepEqual(epuise.appels.map((a) => a.etape), ['programme']);
  } finally {
    globalThis.setTimeout = vrai;
    horloge.t = 0;
  }
});

// --- Délais ---

test('délais : aucun appel d’IA ne dépasse 60 s et le temps restant les raccourcit ; sans temps, pas d’appel', async () => {
  const j = await prepare();
  const delais = [];
  const vrai = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...reste) => { delais.push(ms); return vrai(fn, ms, ...reste); };
  try {
    // Rédaction rapide : deux minuteries de 60 s au plus (rédaction, vérification).
    ok200(await lirePalier(j, 'la-tour-eiffel', 1, scenario(partiesStandard())));
    const longs = delais.filter((d) => d > 1000);
    assert.equal(longs.length, 2, longs.join(' '));
    assert.ok(longs.every((d) => d <= 60000));
    assert.ok(longs[0] > 59000, 'la rédaction dispose de 60 s quand le palier démarre');
    // Rédaction de 50 s : la vérification n’a plus que le temps restant (environ 35 s).
    delais.length = 0;
    const lente = scenario({ ...partiesStandard(), palier: [() => { horloge.t += 50000; return palierBrut(); }] });
    ok200(await lirePalier(j, 'la-tour-eiffel', 2, lente));
    const apres = delais.filter((d) => d > 1000);
    assert.equal(apres.length, 2);
    assert.ok(apres[1] <= REGLAGES.delaiVerifMs && apres[1] > 24000, 'vérification : ' + apres[1] + ' (25 s au plus)');
    // Wikipédia déjà trop lent : plus de temps pour écrire, aucun appel d’IA.
    horloge.t = 0;
    wiki.avance = 82000;
    const sans = scenario(partiesStandard());
    erreurFr(await lirePalier(j, 'la-tour-eiffel', 3, sans), 502);
    assert.equal(sans.appels.length, 0);
  } finally {
    globalThis.setTimeout = vrai;
    horloge.t = 0;
    wiki.avance = 0;
  }
});

test('délais : pas de nouvelle rédaction s’il reste moins de 45 s ; sinon on réécrit, le palier complet tient sous 85 s', async () => {
  const j = await prepare();
  try {
    // La rédaction a pris 50 s : retirer 52 % ne suffit pas pour réécrire, on garde le palier partiel.
    const lente = scenario({ ...partiesStandard(), palier: [() => { horloge.t += 50000; return palierBrut(); }], verif: [verifNumeros(...nombres(4, 20))] });
    const r = await lirePalier(j, 'la-tour-eiffel', 1, lente);
    ok200(r);
    assert.equal(lente.appels.length, 2);
    assert.equal(r.corps.palier.verification.statut, 'partiel');
    assert.equal(r.corps.palier.verification.retirees, 18);
    // 10 s + 10 s : il reste 65 s, on réécrit.
    horloge.t = 0;
    const vive = scenario({
      ...partiesStandard(),
      palier: [() => { horloge.t += 10000; return palierBrut(); }],
      verif: [() => { horloge.t += 10000; return verifNumeros(...nombres(4, 20)); }, verifNumeros()],
    });
    const r2 = await lirePalier(j, 'la-tour-eiffel', 2, vive);
    ok200(r2);
    assert.equal(vive.appels.length, 4);
    assert.equal(r2.corps.palier.verification.statut, 'recoupe');
    assert.equal(REGLAGES.budgetMs, 85000);
    assert.ok(REGLAGES.budgetMs + 5000 <= 90000);
  } finally {
    horloge.t = 0;
  }
});

test('délais : une IA qui ne répond jamais est abandonnée (502), sans bloquer ni rien enregistrer', async () => {
  const j = await prepare();
  const avant = { ...REGLAGES };
  REGLAGES.delaiIaMs = 30;
  REGLAGES.delaiMinMs = 5;
  try {
    let appels = 0;
    const ai = { run: () => { appels += 1; return new Promise(() => {}); } };
    erreurFr(await appel(palierGet, { env: { DB: db, AI: ai }, jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=1' }), 502);
    assert.equal(appels, 4, 'Llama puis Mistral, deux fois');
    assert.equal(lignes('SELECT * FROM paliers').length, 0);
    // Vérificateur qui ne répond jamais : le palier n’est pas publié.
    const sc = scenario(partiesStandard());
    const mixte = { run: (modele, entree) => (entree.messages[0].content === PROMPT_VERIFICATION ? new Promise(() => {}) : sc.ai.run(modele, entree)) };
    erreurFr(await appel(palierGet, { env: { DB: db, AI: mixte }, jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=1' }), 502);
    assert.equal(lignes('SELECT * FROM paliers').length, 0);
    // GLM qui ne répond jamais : repli sur Llama.
    ext.glm = (u, init) => bloquer(init);
    const sc2 = scenario(partiesStandard());
    const r = await appel(palierGet, { env: { DB: db, AI: sc2.ai, ...AVEC_GLM }, jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=2' });
    ok200(r);
    assert.deepEqual(r.corps.palier.verification.ia[0], NOM_LLAMA);
    // La vérification par GLM (qui ne répond pas) retombe sur Mistral.
    assert.deepEqual(sc2.appels.map((a) => a.modele), [LLAMA, MISTRAL]);
    assert.equal(r.corps.palier.verification.ia[1], NOM_MISTRAL);
  } finally {
    Object.assign(REGLAGES, avant);
    reinitExt();
  }
});

// --- Leçon : rappels, exemple et cartes vérifiés ; budget de temps ---

test('leçon : avant, exemple et cartes passent par la vérification (non confirmés : rappel et carte retirés, exemple null)', async () => {
  const j = await prepareProgramme();
  const brut = leconBrute();
  brut.avant[1] = 'Les ouvriers boivent du vin rouge LUNE chaque soir sur le chantier.';
  brut.exemple = 'On peut comparer la tour à une LUNE posée sur Paris, visible de partout.';
  brut.cartes[1] = { recto: 'Qui habite sur la LUNE selon les sources ?', verso: 'Les ouvriers du chantier, chaque soir.' };
  const sc = scenario({ ...partiesStandard(), lecon: [brut], verif: [verifSi(/LUNE/)] });
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  const p = r.corps.palier;
  assert.equal(p.avant.length, EXEMPLE_LECON.avant.length - 1);
  assert.equal(p.exemple, null);
  assert.equal(p.cartes.length, 2);
  assert.ok(!JSON.stringify(p).includes('LUNE'));
  assert.equal(sc.appels.length, 3, 'peu de retraits : pas de nouvelle rédaction');
  // Champs invalides dès la rédaction : retirés sans refuser la leçon.
  const sc2 = scenario({ ...partiesStandard(), lecon: [{ ...leconBrute(), avant: 'rien', exemple: 12, cartes: [{ recto: 'x', verso: 'y' }] }] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2);
  ok200(r2);
  assert.deepEqual([r2.corps.palier.avant, r2.corps.palier.exemple, r2.corps.palier.cartes], [[], null, []]);
});

test('délais : une leçon complète (5 000 jetons) tient sous 85 s ; une rédaction de 50 s laisse 35 s à la vérification, sans réécriture', async () => {
  const j = await prepareProgramme();
  try {
    const lente = scenario({ ...partiesStandard(), lecon: [() => { horloge.t += 50000; return leconBrute(); }], leconB: [leconBrute()], verif: [() => { horloge.t += 20000; return verifNumeros(...nombres(4, 22)); }] });
    const r = await lirePalier(j, 'la-tour-eiffel', 1, lente);
    ok200(r);
    // 50 s + 20 s = 70 s écoulés : 15 s restent, pas de seconde rédaction même avec plus de 40 % retiré ; la meilleure est gardée.
    assert.equal(lente.appels.length, 3);
    assert.equal(r.corps.palier.verification.statut, 'partiel');
    assert.ok(horloge.t <= 85000);
    horloge.t = 0;
    const vive = scenario({ ...partiesStandard(), lecon: [() => { horloge.t += 15000; return leconBrute(); }], leconB: [leconBrute()], verif: [() => { horloge.t += 10000; return verifNumeros(...nombres(4, 22)); }, verifNumeros()] });
    const r2 = await lirePalier(j, 'la-tour-eiffel', 2, vive);
    ok200(r2);
    assert.equal(vive.appels.length, 6, 'deux tours : deux moitiés + vérification, deux fois');
    assert.equal(r2.corps.palier.verification.statut, 'recoupe');
  } finally {
    horloge.t = 0;
  }
});

// --- Leçon en deux moitiés (A et B en parallèle), repli court, causes d'échec ---

// IA dont certains prompts ne répondent jamais (ou mettent trop de temps) : les autres passent par le scénario.
const aiBloquee = (sc, ...prompts) => ({
  run: (modele, entree) => (prompts.includes(entree.messages[0].content) ? new Promise(() => {}) : sc.ai.run(modele, entree)),
});
const avecDelaisCourts = async (fn) => {
  const avant = { ...REGLAGES };
  REGLAGES.delaiIaMs = 30;
  REGLAGES.delaiMoitieMs = 30;
  REGLAGES.delaiProgrammeMs = 30;
  REGLAGES.delaiVerifMs = 30;
  REGLAGES.delaiMinMs = 5;
  try {
    await fn();
  } finally {
    Object.assign(REGLAGES, avant);
  }
};

test('leçon en deux moitiés : A (sections, avant, exemple, définitions…) et B (frise, chiffres, notions, cartes, questions)', async () => {
  const brut = leconBrute();
  const a = validerMoitieA(brut).valeur;
  assert.deepEqual(Object.keys(a).sort(), ['aRetenir', 'avant', 'definitions', 'exemple', 'histoire', 'mnemo', 'objectif', 'rappel', 'sections']);
  const b = validerMoitieB(brut).valeur;
  assert.deepEqual(Object.keys(b).sort(), ['cartes', 'chiffres', 'frise', 'notions', 'questions']);
  assert.equal(b.questions.length, 4);
  // A : sections et définitions obligatoires ; le reste ne bloque jamais.
  assert.ok(validerMoitieA({ ...brut, sections: { enBref: ['Une seule phrase assez longue.'] } }).raison);
  assert.ok(validerMoitieA({ ...brut, definitions: [] }).raison);
  const nu = validerMoitieA({ sections: brut.sections, definitions: brut.definitions }).valeur;
  assert.deepEqual([nu.avant, nu.exemple, nu.mnemo, nu.histoire, nu.aRetenir], [[], null, null, null, []]);
  const court = validerMoitieA(brut, { court: true }).valeur;
  assert.deepEqual([court.avant, court.exemple, court.mnemo, court.histoire], [[], null, null, null]);
  // B : au moins une question qcm valide ; frise, chiffres, notions et cartes ne bloquent jamais.
  assert.ok(validerMoitieB({ ...brut, questions: [] }).raison);
  assert.ok(validerMoitieB({ ...brut, questions: [brut.questions[2]] }).raison, 'un vrai ou faux seul ne suffit pas');
  const un = validerMoitieB({ questions: [brut.questions[0], { type: 'qcm' }] }).valeur;
  assert.deepEqual([un.questions.length, un.frise, un.chiffres, un.notions, un.cartes], [1, [], [], null, []]);
  const courtB = validerMoitieB(brut, { court: true }).valeur;
  assert.deepEqual([courtB.frise, courtB.chiffres, courtB.notions, courtB.cartes], [[], [], null, []]);
  // Les prompts des moitiés ne demandent que leurs champs.
  for (const champ of ['avant', 'sections', 'exemple', 'definitions', 'histoire', 'aRetenir', 'mnemo']) assert.ok(PROMPT_LECON_A.includes(`- ${champ} :`), champ);
  for (const champ of ['frise', 'chiffres', 'notions', 'cartes', 'questions']) assert.ok(PROMPT_LECON_B.includes(`- ${champ} :`), champ);
  assert.ok(!PROMPT_LECON_A.includes('- questions :') && !PROMPT_LECON_B.includes('- sections :'));
  assert.ok(!PROMPT_LECON_A_COURT.includes('- avant :') && !PROMPT_LECON_A_COURT.includes('- exemple :'));
  assert.ok(PROMPT_LECON_B_COURT.includes('exactement 2 objets') && !PROMPT_LECON_B_COURT.includes('- notions :'));
});

test('leçon : une moitié A qui ne répond pas est retentée avec un prompt court (sans avant ni exemple) ; la leçon est publiée', async () => {
  await avecDelaisCourts(async () => {
    const j = await prepareProgramme();
    const sc = scenario(partiesStandard());
    const r = await lirePalier(j, 'la-tour-eiffel', 1, sc, { AI: aiBloquee(sc, PROMPT_LECON_A) });
    ok200(r);
    const p = r.corps.palier;
    assert.deepEqual([p.avant, p.exemple, p.mnemo, p.histoire], [[], null, null, null]);
    assert.ok(p.sections.enBref && p.definitions.length >= 1 && p.questions.length === 4 && p.cartes.length === 3);
    const etapes = sc.appels.map((a) => a.etape);
    assert.ok(etapes.includes('leconB') && etapes.includes('leconA2') && etapes.includes('verif'), etapes.join());
    assert.ok(!etapes.includes('leconB2'));
    assert.equal(sc.par('leconA2')[0].entree.messages[0].content, PROMPT_LECON_A_COURT);
    // Même A court en échec : pas de leçon, et la cause est affichée.
    db.base.prepare('DELETE FROM paliers').run();
    const sc2 = scenario(partiesStandard());
    const r2 = await lirePalier(j, 'la-tour-eiffel', 1, sc2, { AI: aiBloquee(sc2, PROMPT_LECON_A, PROMPT_LECON_A_COURT) });
    erreurFr(r2, 502, /\(cause : délai dépassé\)/);
    assert.equal(lignes('SELECT * FROM paliers').length, 0);
  });
});

test('leçon : une moitié B lente ou invalide ne bloque pas ; au moins une question qcm valide suffit, sinon B court (2 questions)', async () => {
  const j = await prepareProgramme();
  // B sans aucune question valide : B court, 2 questions, ni frise, ni cartes, ni notions.
  const sansQuestion = { ...leconBrute(), questions: [{ type: 'qcm', enonce: 'x' }] };
  const court = { ...leconBrute(), questions: leconBrute().questions.slice(0, 2) };
  const sc = scenario({ ...partiesStandard(), leconB: [sansQuestion], leconB2: [court] });
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['lecon', 'leconB', 'leconB2', 'verif'], 'B échoue chez Llama : sa version courte est écrite par le même modèle (jamais un autre rédacteur)');
  const p = r.corps.palier;
  assert.equal(p.questions.length, 2);
  assert.deepEqual([p.frise, p.chiffres, p.notions, p.cartes], [[], [], null, []]);
  assert.equal(sc.par('leconB2')[0].entree.messages[0].content, PROMPT_LECON_B_COURT);
  assert.ok(p.sections.enBref && p.avant.length && p.exemple, 'la moitié A est conservée');
  // Une seule question qcm valide dans B : publiée telle quelle (frise, cartes… restent), sans B court.
  const une = { ...leconBrute(), questions: [leconBrute().questions[0], { type: 'qcm', enonce: 'x' }, 'n’importe quoi'] };
  const sc2 = scenario({ ...partiesStandard(), leconB: [une] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2);
  ok200(r2);
  assert.equal(r2.corps.palier.questions.length, 1);
  assert.equal(r2.corps.palier.cartes.length, 3);
  assert.ok(!sc2.appels.some((a) => a.etape === 'leconB2'));
  // B court en échec aussi : pas de leçon (aucune question), cause « réponse illisible ».
  const sc3 = scenario({ ...partiesStandard(), leconB: [sansQuestion], leconB2: ['pas du json'] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 3, sc3), 502, /\(cause : réponse illisible\)/);
  // B qui ne répond pas (délai) : B court répond ; la leçon est publiée.
  await avecDelaisCourts(async () => {
    const sc4 = scenario({ ...partiesStandard(), leconB2: [court] });
    const r4 = await lirePalier(j, 'la-tour-eiffel', 4, sc4, { AI: aiBloquee(sc4, PROMPT_LECON_B) });
    ok200(r4);
    assert.equal(r4.corps.palier.questions.length, 2);
    assert.deepEqual(r4.corps.palier.cartes, []);
  });
});

test('leçon : les deux moitiés partent ensemble (parallèle), même contexte ; le badge ne garde que ce qui est confirmé', async () => {
  const j = await prepareProgramme();
  const vues = [];
  const sc = scenario({ ...partiesStandard() });
  let enCours = 0;
  let max = 0;
  const ai = {
    async run(modele, entree) {
      const sys = entree.messages[0].content;
      if (sys === PROMPT_LECON_A || sys === PROMPT_LECON_B) {
        enCours += 1;
        max = Math.max(max, enCours);
        vues.push(entree.messages[1].content.replace(/\nÉcris la partie [AB][^\n]*$/, ''));
        await new Promise((r) => setTimeout(r, 20));
        enCours -= 1;
      }
      return sc.ai.run(modele, entree);
    },
  };
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, sc, { AI: ai }));
  assert.equal(max, 2, 'A et B en même temps');
  assert.equal(vues.length, 2);
  assert.equal(vues[0], vues[1], 'même plan, même glossaire, mêmes extraits');
  // Une carte et une question de B non confirmées sont retirées ; le badge est « partiel ».
  const brut = leconBrute();
  brut.cartes[0] = { recto: 'Qui habite sur la LUNE selon les sources ?', verso: 'Les ouvriers du chantier, chaque soir.' };
  brut.avant[0] = 'Les ouvriers boivent du vin rouge LUNE chaque soir sur le chantier.';
  const sc2 = scenario({ ...partiesStandard(), leconB: [brut], verif: [verifSi(/LUNE/)] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2);
  ok200(r2);
  assert.ok(!JSON.stringify(r2.corps.palier).includes('LUNE'));
  assert.equal(r2.corps.palier.cartes.length, 2);
  assert.equal(r2.corps.palier.verification.statut, 'partiel');
  assert.equal(r2.corps.palier.verification.retirees, 1, 'seule la carte de B est dans l’appel B ; le rappel vient de A (sain)');
});

test('leçon : la vérification est légère (700 jetons, extraits tronqués à 5 000 caractères)', async () => {
  const j = await prepareProgramme();
  const grosse = 'Phrase longue sur la tour. '.repeat(500); // 13 500 caractères
  for (const cle of Object.keys(wiki.pages)) wiki.pages[cle].texte = grosse;
  const sc = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, sc));
  const verif = sc.par('verif')[0].entree.messages[1].content;
  const extraits = [...verif.matchAll(/=== Extrait \d+[^\n]*===\n([\s\S]*?)\n=== Fin de l’extrait/g)].map((m) => m[1]);
  assert.ok(extraits.length >= 1 && extraits.every((t) => t.length <= 5000), extraits.map((t) => t.length).join());
  const redaction = sc.par('lecon')[0].entree.messages[1].content;
  const entiers = [...redaction.matchAll(/=== Extrait \d+[^\n]*===\n([\s\S]*?)\n=== Fin de l’extrait/g)].map((m) => m[1].length);
  assert.ok(Math.max(...entiers) > 5000, 'la rédaction garde les extraits entiers : ' + entiers.join());
});

test('leçon : la cause de l’échec s’affiche dans le message 502 (délai, réponse illisible, contrôle de la 2e IA, trop de retraits)', async () => {
  const j = await prepareProgramme();
  const message = (r) => JSON.parse(JSON.stringify(r.corps)).erreur;
  // Réponse illisible : A comme B ne rendent pas de JSON.
  const sc1 = scenario({ ...partiesStandard(), lecon: ['Désolé, je ne peux pas.'] });
  const r1 = await lirePalier(j, 'la-tour-eiffel', 1, sc1);
  erreurFr(r1, 502, /cette leçon \(cause : réponse illisible\)\. Réessaie dans un moment\.$/);
  // Contrôle de la 2e IA en panne.
  const sc2 = scenario({ ...partiesStandard(), verif: [new Error('panne')] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 1, sc2), 502, /\(cause : contrôle de la 2e IA indisponible\)/);
  // Tout est retiré (même après une 2e rédaction) : trop d'affirmations non confirmées.
  const sc3 = scenario({ ...partiesStandard(), verif: [verifNumeros(...nombres(1, TOTAL_LECON))] });
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 1, sc3), 502, /\(cause : trop d’affirmations non confirmées\)/);
  // Délai dépassé.
  await avecDelaisCourts(async () => {
    const sc4 = scenario(partiesStandard());
    const r4 = await lirePalier(j, 'la-tour-eiffel', 1, sc4, { AI: aiBloquee(sc4, PROMPT_LECON_A, PROMPT_LECON_B, PROMPT_LECON_A_COURT, PROMPT_LECON_B_COURT) });
    erreurFr(r4, 502, /\(cause : délai dépassé\)/);
    assert.ok(!/undefined|Error|stack/i.test(message(r4)), 'texte seulement, rien de technique');
  });
  // Sources injoignables (le cache des sources est vide).
  db.base.exec('DELETE FROM sources_cache');
  wiki.panne = 500;
  erreurFr(await lirePalier(j, 'la-tour-eiffel', 1, scenario(partiesStandard())), 502, /\(cause : sources injoignables\)/);
  wiki.panne = null;
  assert.equal(lignes('SELECT * FROM paliers').length, 0);
});

test('programme : si le programme complet échoue (délai, illisible), un programme plus court (6 + 5 + 5 + 5 modules) est tenté avant d’abandonner', async () => {
  toutVoir();
  const j = await creerJoueur();
  const post = (sc, extra = {}) => appel(parcoursPost, { env: envDe(sc, extra), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  assert.ok(PROMPT_PROGRAMME_COURT.includes('Programme court : Bases compte exactement 6 modules') && !PROMPT_PROGRAMME_COURT.includes('Bases compte de 6 à 10'));
  assert.ok(PROMPT_PROGRAMME_COURT.includes(JSON.stringify(EXEMPLE_PROGRAMME)));
  // Programme complet illisible : le court réussit, avec le même rédacteur.
  const sc = scenario({ ...partiesStandard(), programme: ['Désolé, je ne peux pas.'], programme2: [programmeBrut()] });
  ok200(await post(sc));
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.modele]), [['programme', LLAMA], ['programme2', LLAMA], ['module', LLAMA]]);
  assert.equal(sc.par('programme2')[0].entree.messages[0].content, PROMPT_PROGRAMME_COURT);
  assert.match(sc.par('programme2')[0].entree.messages[1].content, /Écris le programme d’ensemble en JSON/);
  // Programme complet qui ne répond pas (délai) : le court répond.
  await avecDelaisCourts(async () => {
    viderBibliotheque();
    const sc2 = scenario(partiesStandard());
    ok200(await post(sc2, { AI: aiBloquee(sc2, PROMPT_PROGRAMME) }));
    assert.ok(sc2.appels.some((a) => a.etape === 'programme2'));
    // Tout échoue : 502 avec la cause.
    viderBibliotheque();
    const sc3 = scenario(partiesStandard());
    erreurFr(await post(sc3, { AI: aiBloquee(sc3, PROMPT_PROGRAMME, PROMPT_PROGRAMME_COURT) }), 502, /ce parcours \(cause : délai dépassé\)\. Réessaie, ou change la formulation\.$/);
    assert.equal(lignes('SELECT * FROM parcours').length, 0);
  });
});

// --- « Aller plus loin » : POST /api/parcours { id, prolonger: true } ---

// Ouvre tous les modules d'un parcours inséré (5 leçons chacun), comme si le lecteur avait tout parcouru.
function ouvrirTout(id, lecons = 5) {
  const ligne = db.base.prepare('SELECT contenu FROM parcours WHERE id = ?').get(id);
  const c = JSON.parse(ligne.contenu);
  c.etapes = modulesDe(c.programme).map((m, i) => ({
    numero: m.numero, titre: m.titre, niveau: m.niveau.numero, objectif: m.objectif,
    paliers: Array.from({ length: lecons }, (_, k) => ({ numero: i * lecons + k + 1, titre: `Leçon ${i * lecons + k + 1} du module ${m.numero}` })),
  }));
  db.base.prepare('UPDATE parcours SET contenu = ? WHERE id = ?').run(JSON.stringify(c), id);
}
const prolonger = (jeton, corps, sc, extra = {}) => {
  brancher(sc);
  return appel(parcoursPost, { env: envDe(sc, extra), methode: 'POST', jeton, corps });
};
const quotasProlonger = () => lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'prolonger%' ORDER BY cle");
const prolongement2 = () => ({
  modules: [
    { titre: 'Les plans de 1885 retrouvés', objectif: 'Comparer les plans de 1885 aux premiers dessins du projet.', prerequis: ['Les plans de 1884 et leurs variantes'] },
    { titre: 'Le vent et la structure', objectif: 'Étudier les essais menés sur la résistance de la tour au vent.', prerequis: [] },
    { titre: 'La presse étrangère de 1889', objectif: 'Lire les comptes rendus de la presse étrangère sur le chantier.', prerequis: ['La tour et la presse de 1889', 'Titre inconnu du programme'] },
    { titre: 'Les visiteurs du premier été', objectif: 'Compter et décrire les premiers visiteurs de la tour en 1889.', prerequis: ['Les chiffres de l’époque'] },
  ],
});

test('prolonger : 401, 400, 404, ancien format 400, programme pas terminé 409, 503 sans IA ; rien consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 20, lecons: 5 }); // il reste le module 21
  insererProgramme('fini', { titre: 'Formation finie', ouverts: 21, lecons: 5 });
  insererParcours('ancien', { titre: 'Ancien' });
  const sc = scenario(partiesStandard());
  erreurFr(await prolonger(undefined, { id: 'fini', prolonger: true }, sc), 401);
  for (const id of [undefined, null, '', 12, ['fini'], 'Pas Valide', 'x'.repeat(41)]) {
    erreurFr(await prolonger(j.jeton, { id, prolonger: true }, sc), 400, /Identifiant/);
  }
  erreurFr(await prolonger(j.jeton, { id: 'inconnu', prolonger: true }, sc), 404);
  erreurFr(await prolonger(j.jeton, { id: 'ancien', prolonger: true }, sc), 400, /sans fin/);
  erreurFr(await prolonger(j.jeton, { id: 'prog', prolonger: true }, sc), 409, /pas terminé/);
  erreurFr(await appel(parcoursPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: j.jeton, corps: { id: 'fini', prolonger: true } }), 503, /IA absente/);
  // « prolonger » doit valoir vrai : sinon c'est une création, qui lit le titre.
  erreurFr(await prolonger(j.jeton, { id: 'fini', prolonger: 'oui' }, sc), 400, /Titre/);
  erreurFr(await prolonger(j.jeton, { id: 'fini' }, sc), 400, /Titre/);
  assert.equal(sc.appels.length, 0);
  assert.equal(wiki.appels.length, 0);
  assert.deepEqual(quotasProlonger(), []);
  assert.equal(JSON.parse(lignes("SELECT contenu FROM parcours WHERE id = 'prog'")[0].contenu).programme.niveaux.length, 4);
});

test('prolonger : 3 à 5 modules d’un niveau « Maîtrise 1 » ajoutés au programme pour tous, les modules à ouvrir restent à venir', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 21, lecons: 5 });
  const sc = scenario(partiesStandard());
  const r = await prolonger(j.jeton, { id: 'prog', prolonger: true }, sc);
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['parcours']);
  const p = r.corps.parcours;
  assert.deepEqual(Object.keys(p), CLES_PARCOURS);
  assert.equal(p.programme.niveaux.length, 5);
  assert.equal(p.modulesTotal, 24, '21 + 3');
  assert.equal(p.etapes.length, 21, 'aucun module ouvert d’office');
  const niveau = p.programme.niveaux[4];
  assert.deepEqual([niveau.numero, niveau.titre], [5, 'Maîtrise 1']);
  assert.deepEqual(niveau.modules.map((m) => m.numero), [22, 23, 24]);
  assert.deepEqual(niveau.modules.map((m) => m.titre), EXEMPLE_PROLONGEMENT.modules.map((m) => m.titre));
  assert.deepEqual(Object.keys(niveau.modules[0]), ['numero', 'titre', 'objectif', 'prerequis']);
  assert.deepEqual(niveau.modules[0].prerequis, EXEMPLE_PROLONGEMENT.modules[0].prerequis);
  // Un appel d'IA, avec le programme existant et les titres de toutes les leçons publiées.
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['prolonger', 'ai', LLAMA]]);
  assert.equal(sc.appels[0].entree.messages[0].content, PROMPT_PROLONGER);
  const demande = sc.appels[0].entree.messages[1].content;
  assert.match(demande, /Programme existant \(21 modules\) :\nNiveau 1 · Bases : les repères\n/);
  assert.match(demande, /Niveau 4 · Expert : sources et limites\n/);
  assert.match(demande, /Titres des 105 leçons déjà publiées, à ne pas répéter :\n- Leçon 1 du module 1\n/);
  assert.ok(demande.includes('- Leçon 105 du module 21') && demande.includes('- Leçon 53 du module 11'));
  assert.match(demande, /Niveau à écrire : n° 5, « Maîtrise 1 »/);
  assert.match(demande, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.deepEqual(quotasProlonger(), [{ cle: 'prolonger:joueur:' + j.id, n: 1 }, { cle: 'prolonger:total', n: 1 }]);
  assert.equal(lignes("SELECT cle FROM quotas WHERE cle LIKE 'parcours%' OR cle LIKE 'palier%'").length, 0, 'ni création ni leçon comptées');
  // Enregistré pour tous (lecture publique), sans régénération pour qui le redemande.
  const lu = await lireParcours('prog');
  assert.deepEqual([lu.modulesTotal, lu.programme.niveaux.length], [24, 5]);
  assert.equal(JSON.parse(lignes("SELECT contenu FROM parcours WHERE id = 'prog'")[0].contenu).programme.niveaux[4].titre, 'Maîtrise 1');
  // Le programme est de nouveau « à ouvrir » : une 2e demande est refusée (409) tant que les modules ne sont pas ouverts.
  const sc2 = scenario(partiesStandard());
  erreurFr(await prolonger(autre.jeton, { id: 'prog', prolonger: true }, sc2), 409);
  assert.equal(sc2.appels.length, 0);
  assert.deepEqual(quotasProlonger(), [{ cle: 'prolonger:joueur:' + j.id, n: 1 }, { cle: 'prolonger:total', n: 1 }]);
  // Le module 22 s'ouvre comme les autres : ton « Maîtrise », niveau 5, prérequis.
  const sc3 = scenario({ ...partiesStandard(), module: [module2Brut()] });
  const r3 = await lirePalier(autre, 'prog', 106, sc3);
  ok200(r3);
  assert.deepEqual(r3.corps.palier.niveau, { numero: 5, titre: 'Maîtrise 1' });
  assert.deepEqual(r3.corps.palier.module, { numero: 22, titre: EXEMPLE_PROLONGEMENT.modules[0].titre });
  const msgMod = sc3.par('module')[0].entree.messages[1].content;
  assert.match(msgMod, /Module 22 · Les plans de 1884 et leurs variantes \(module à écrire\)/);
  assert.match(msgMod, /Niveau : n° 5, « Maîtrise 1 »/);
  assert.match(msgMod, /Prérequis du module \(déjà vus\) : « Le projet et ses auteurs », « Les archives de l’entreprise »/);
  const msgLecon = sc3.par('lecon')[0].entree.messages[1].content;
  assert.match(msgLecon, /Niveau n° 5 : « Maîtrise 1 »\nConsigne de ton : Maîtrise : va plus loin que le niveau expert/);
  assert.ok(!msgLecon.includes('Consigne de ton : Bases'), 'jamais le ton des Bases pour un niveau Maîtrise');
  assert.equal(sc3.par('module')[0].entree.messages[0].content, PROMPT_MODULE);
  // Formation terminée seulement quand les trois modules sont ouverts.
  ouvrirTout('prog');
  const lu2 = await lireParcours('prog');
  assert.equal(lu2.etapes.length, 24);
  erreurFr(await lirePalier(j, 'prog', 121, scenario(partiesStandard())), 404, /^Formation terminée/);
});

test('prolonger : un deuxième « Aller plus loin » ajoute « Maîtrise 2 », sans répéter un titre existant ; liste invalide : repli puis 502', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 21, lecons: 5 });
  ok200(await prolonger(j.jeton, { id: 'prog', prolonger: true }, scenario(partiesStandard())));
  ouvrirTout('prog');
  const sc = scenario({ ...partiesStandard(), prolonger: [prolongement2()] });
  const r = await prolonger(j.jeton, { id: 'prog', prolonger: true }, sc);
  ok200(r);
  const p = r.corps.parcours;
  assert.equal(p.programme.niveaux.length, 6);
  assert.deepEqual([p.programme.niveaux[5].numero, p.programme.niveaux[5].titre], [6, 'Maîtrise 2']);
  assert.deepEqual(p.programme.niveaux[5].modules.map((m) => m.numero), [25, 26, 27, 28]);
  assert.equal(p.modulesTotal, 28);
  // Prérequis : titres inconnus retirés, modules du niveau précédent acceptés.
  assert.deepEqual(p.programme.niveaux[5].modules.map((m) => m.prerequis), [['Les plans de 1884 et leurs variantes'], [], ['La tour et la presse de 1889'], ['Les chiffres de l’époque']]);
  // Les titres des leçons publiées et de tous les niveaux précédents sont fournis.
  const demande = sc.appels[0].entree.messages[1].content;
  assert.match(demande, /Programme existant \(24 modules\)/);
  assert.match(demande, /Niveau 5 · Maîtrise 1\n  Module 22 · Les plans de 1884 et leurs variantes\n/);
  assert.match(demande, /Niveau à écrire : n° 6, « Maîtrise 2 »/);
  assert.deepEqual(quotasProlonger()[0].n, 2);
  // Invalide (titre déjà pris, 2 modules, 6 modules) : Mistral reprend, puis 502 et rien d'enregistré.
  ouvrirTout('prog');
  const repete = prolongement2();
  repete.modules[1].titre = 'LE VENT ET LA STRUCTURE'; // existe déjà dans Maîtrise 2
  const deux = { modules: prolongement2().modules.slice(0, 2) };
  const six = { modules: [...prolongement2().modules, ...EXEMPLE_PROLONGEMENT.modules.map((m) => ({ ...m, titre: m.titre + ' bis' }))].slice(0, 6) };
  db.base.prepare('DELETE FROM quotas').run();
  const scMauvais = scenario({ ...partiesStandard(), prolonger: [repete, deux] });
  erreurFr(await prolonger(j.jeton, { id: 'prog', prolonger: true }, scMauvais), 502, /suite de cette formation/);
  assert.deepEqual(scMauvais.appels.map((a) => [a.etape, a.modele]), [['prolonger', LLAMA], ['prolonger', MISTRAL]]);
  assert.equal(JSON.parse(lignes("SELECT contenu FROM parcours WHERE id = 'prog'")[0].contenu).programme.niveaux.length, 6);
  db.base.prepare('DELETE FROM quotas').run();
  const scSix = scenario({ ...partiesStandard(), prolonger: [six, 'pas du json'] });
  erreurFr(await prolonger(j.jeton, { id: 'prog', prolonger: true }, scSix), 502);
  db.base.prepare('DELETE FROM quotas').run();
  const scRepli = scenario({ ...partiesStandard(), prolonger: [deux, prolongementApres()] });
  const rRepli = await prolonger(j.jeton, { id: 'prog', prolonger: true }, scRepli);
  ok200(rRepli);
  assert.equal(rRepli.corps.parcours.programme.niveaux[6].titre, 'Maîtrise 3');
  assert.deepEqual(scRepli.appels.map((a) => a.modele), [LLAMA, MISTRAL]);
  // Wikipédia injoignable : 502 sans appel d'IA.
  ouvrirTout('prog');
  wiki.panne = 500;
  db.base.prepare('DELETE FROM quotas').run();
  const scW = scenario(partiesStandard());
  erreurFr(await prolonger(j.jeton, { id: 'prog', prolonger: true }, scW), 502, /sources/);
  assert.equal(scW.appels.length, 0);
});
function prolongementApres() {
  return { modules: [1, 2, 3].map((i) => ({ titre: `Module de maîtrise numéro ${i}`, objectif: 'Un objectif assez long pour être valide.', prerequis: [] })) };
}

test('prolonger : 5 par jour et par lecteur, 40 par jour au total ; le refus d’un lecteur ne touche pas le total', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 21, lecons: 5 });
  const nouveau = (i) => ({ modules: [1, 2, 3].map((k) => ({ titre: `Module ${i}-${k} de maîtrise`, objectif: 'Un objectif assez long pour être valide.', prerequis: [] })) });
  for (let i = 1; i <= 5; i++) {
    ok200(await prolonger(j.jeton, { id: 'prog', prolonger: true }, scenario({ ...partiesStandard(), prolonger: [nouveau(i)] })));
    ouvrirTout('prog');
  }
  assert.deepEqual(quotasProlonger(), [{ cle: 'prolonger:joueur:' + j.id, n: 5 }, { cle: 'prolonger:total', n: 5 }]);
  const sc = scenario({ ...partiesStandard(), prolonger: [nouveau(6)] });
  erreurFr(await prolonger(j.jeton, { id: 'prog', prolonger: true }, sc), 429, /5 formations/);
  assert.equal(sc.appels.length, 0);
  assert.deepEqual(quotasProlonger(), [{ cle: 'prolonger:joueur:' + j.id, n: 6 }, { cle: 'prolonger:total', n: 5 }], 'le refus compte le lecteur, jamais le total');
  // Un autre lecteur peut encore prolonger ; plafond global à 40.
  db.base.prepare("UPDATE quotas SET n = 39 WHERE cle = 'prolonger:total'").run();
  ok200(await prolonger(autre.jeton, { id: 'prog', prolonger: true }, scenario({ ...partiesStandard(), prolonger: [nouveau(7)] })));
  ouvrirTout('prog');
  const dernier = await creerJoueur('Dernier');
  erreurFr(await prolonger(dernier.jeton, { id: 'prog', prolonger: true }, scenario({ ...partiesStandard(), prolonger: [nouveau(8)] })), 429, /débordée/);
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'prolonger:total'")[0].n, 41, 'au-delà de 40, refusé');
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'prolonger:joueur:" + dernier.id + "'")[0].n, 1, 'le lecteur est compté avant le plafond global');
});

test('prolonger : deux lecteurs en même temps, le premier enregistré gagne (un seul niveau ajouté)', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererProgramme('prog', { titre: 'La tour Eiffel', ouverts: 21, lecons: 5 });
  const ecritParUnAutre = () => {
    const ligne = db.base.prepare('SELECT contenu FROM parcours WHERE id = ?').get('prog');
    const c = JSON.parse(ligne.contenu);
    c.programme.niveaux.push({ numero: 5, titre: 'Maîtrise 1', modules: [{ numero: 22, titre: 'Écrit par un autre lecteur', objectif: 'Un module écrit en premier par un autre lecteur.', prerequis: [] }] });
    db.base.prepare('UPDATE parcours SET contenu = ? WHERE id = ?').run(JSON.stringify(c), 'prog');
  };
  const sc = scenario({ ...partiesStandard(), prolonger: [() => { ecritParUnAutre(); return prolongement2(); }] });
  const r = await prolonger(j.jeton, { id: 'prog', prolonger: true }, sc);
  ok200(r);
  const p = r.corps.parcours;
  assert.equal(p.programme.niveaux.length, 5, 'un seul niveau ajouté');
  assert.deepEqual(p.programme.niveaux[4].modules.map((m) => m.titre), ['Écrit par un autre lecteur'], 'celui du premier enregistré');
  assert.equal(p.modulesTotal, 22);
  assert.equal((await lireParcours('prog')).modulesTotal, 22);
});

test('prolonger : validerProlongement (3 à 5 modules, titres neufs, prérequis existants), titreMaitrise et numéros', async () => {
  const programme = validerProgramme(EXEMPLE_PROGRAMME).valeur;
  assert.equal(titreMaitrise(programme), 'Maîtrise 1');
  const ok = validerProlongement(prolongementBrut(), { programme });
  assert.ok(ok.valeur, ok.raison);
  assert.deepEqual(Object.keys(ok.valeur), ['niveau']);
  assert.deepEqual(ok.valeur.niveau.modules.map((m) => m.numero), [22, 23, 24]);
  const avec = { niveaux: [...programme.niveaux, ok.valeur.niveau] };
  assert.equal(titreMaitrise(avec), 'Maîtrise 2');
  assert.equal(validerProlongement(prolongement2(), { programme: avec }).valeur.niveau.numero, 6);
  const modif = (fn, pr = programme) => { const b = prolongementBrut(); fn(b); return validerProlongement(b, { programme: pr }); };
  const refus = (r, motif) => assert.ok(r.raison, 'devrait être refusé : ' + motif);
  refus(validerProlongement(null, { programme }), 'null');
  refus(modif((b) => { b.modules.pop(); b.modules.pop(); }), '1 module');
  refus(modif((b) => { b.modules.pop(); }), '2 modules');
  refus(modif((b) => { b.modules = Array.from({ length: 6 }, (_, i) => ({ titre: 'Module de test ' + i, objectif: 'Un objectif assez long pour être valide.' })); }), '6 modules');
  assert.equal(modif((b) => { b.modules = Array.from({ length: 5 }, (_, i) => ({ titre: 'Module de test ' + i, objectif: 'Un objectif assez long pour être valide.' })); }).valeur.niveau.modules.length, 5);
  refus(modif((b) => { b.modules = 'trois'; }), 'modules en texte');
  refus(modif((b) => { b.modules[0].titre = 'Un chantier de deux ans'; b.modules[1].titre = MODULES_EXEMPLE[3].titre.toUpperCase(); }), 'titre déjà dans le programme');
  refus(modif((b) => { b.modules[1].titre = b.modules[0].titre; }), 'titre en double dans le lot');
  refus(modif((b) => { b.modules[0].objectif = 'Court.'; }), 'objectif trop court');
  refus(modif((b) => { b.modules[0].titre = 'ab'; }), 'titre trop court');
  refus(modif((b) => { b.modules[0].titre = 'Un module incontournable'; }), 'mot promotionnel');
  assert.deepEqual(modif((b) => { b.modules[0].prerequis = ['Inconnu', 'Le vocabulaire de la tour', 'Les grands repères', 'Une tour pour 1889', 'Limites des connaissances']; }).valeur.niveau.modules[0].prerequis,
    ['Le vocabulaire de la tour', 'Les grands repères', 'Une tour pour 1889'], '3 au plus, inconnus retirés');
  assert.deepEqual(modif((b) => { b.modules[0].prerequis = [b.modules[1].titre]; }).valeur.niveau.modules[0].prerequis, [], 'un module du lot ne précède pas le premier');
  assert.deepEqual(modif((b) => { b.modules[2].prerequis = [b.modules[0].titre]; }).valeur.niveau.modules[2].prerequis, [EXEMPLE_PROLONGEMENT.modules[0].titre], 'un module du lot peut suivre un module précédent du lot');
});

// --- Bibliothèque : GET /api/parcours?q= ---

test('parcours GET ?q= : recherche dans les titres sans accents ni casse, 30 résultats triés par vues, avec leçons écrites, modules, niveaux et image', async () => {
  toutVoir();
  insererProgramme('la-gemmologie', { titre: 'La gemmologie', ouverts: 2, lecons: 5, vues: 7 });
  insererProgramme('gemmologie-et-joaillerie', { titre: 'Gemmologie et joaillerie', ouverts: 1, lecons: 6, vues: 40 });
  insererParcours('histoire-de-l-art', { titre: 'Histoire de l’art', etapes: 1, vues: 99, image: { src: 'https://upload.wikimedia.org/x.jpg', credit: 'Auteur · CC BY-SA 4.0 · Wikimédia Commons', lien: 'https://commons.wikimedia.org/wiki/File:x.jpg', source: 'commons' } });
  insererParcours('les-pierres-precieuses', { titre: 'Les pierres précieuses', etapes: 1, vues: 3 });
  for (let n = 1; n <= 3; n++) insererPalierTest('la-gemmologie', n);
  insererPalierTest('gemmologie-et-joaillerie', 1);
  const q = async (texte) => (await appel(parcoursGet, { requete: '?q=' + encodeURIComponent(texte) })).corps.parcours;
  const r = await appel(parcoursGet, { requete: '?q=GEMMOLOGIE' });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['parcours']);
  assert.deepEqual(r.corps.parcours.map((x) => x.id), ['gemmologie-et-joaillerie', 'la-gemmologie'], 'les plus suivies d’abord');
  assert.deepEqual(Object.keys(r.corps.parcours[0]), ['id', 'titre', 'image', 'vues', 'paliers', 'lecons', 'modules', 'ouverts', 'niveauAtteint', 'niveaux']);
  const [g, l] = r.corps.parcours;
  assert.deepEqual([g.titre, g.vues, g.paliers, g.lecons, g.modules, g.niveaux.length], ['Gemmologie et joaillerie', 40, 6, 1, 21, 4]);
  assert.deepEqual([l.paliers, l.lecons, l.modules], [10, 3, 21]);
  assert.deepEqual(g.niveaux[0], { numero: 1, titre: 'Bases : les repères' });
  // Sans accents, sans casse, mots dans le désordre, mot partiel.
  assert.deepEqual((await q('gemologie')).length, 0, 'une faute n’est pas corrigée');
  assert.deepEqual((await q('Pierres PRÉCIEUSES')).map((x) => x.id), ['les-pierres-precieuses']);
  assert.deepEqual((await q('precieuses pierres')).map((x) => x.id), ['les-pierres-precieuses']);
  assert.deepEqual((await q('gemmo')).map((x) => x.id), ['gemmologie-et-joaillerie', 'la-gemmologie']);
  assert.deepEqual((await q('histoire art')).map((x) => x.id), ['histoire-de-l-art']);
  assert.deepEqual((await q('  joaillerie  ')).map((x) => x.id), ['gemmologie-et-joaillerie']);
  const art = (await q('l’art'))[0];
  assert.equal(art.image.credit, 'Auteur · CC BY-SA 4.0 · Wikimédia Commons');
  assert.deepEqual([art.modules, art.niveaux, art.lecons], [0, [], 0], 'ancien format : pas de programme');
  // Rien ne correspond : liste vide, pas d'erreur. Les caractères spéciaux de LIKE ne sont pas des jokers.
  assert.deepEqual(await q('zzzz'), []);
  assert.deepEqual(await q('100%'), []);
  assert.deepEqual(await q('g_mmologie'), [], 'le tiret bas n’est pas un joker');
  assert.deepEqual((await q('gemmologie\' OR 1=1 --')).length, 0, 'injection SQL sans effet');
  // 400 : moins de 2 lettres, que des signes.
  for (const mauvais of ['', ' ', 'a', ' a ', '!!', '%', '_']) {
    erreurFr(await appel(parcoursGet, { requete: '?q=' + encodeURIComponent(mauvais) }), 400, /2 lettres/);
  }
  // Une recherche ne compte pas de vue ; sans q, la liste habituelle est inchangée.
  assert.deepEqual(lignes('SELECT SUM(vues) AS v FROM parcours'), [{ v: 7 + 40 + 99 + 3 }]);
  const liste = (await appel(parcoursGet)).corps.parcours;
  assert.deepEqual(Object.keys(liste[0]), ['id', 'titre', 'image', 'vues', 'paliers', 'lecons', 'modules', 'ouverts', 'niveauAtteint']);
  assert.equal(liste.length, 4);
});

test('parcours GET ?q= : 30 résultats au plus, ligne illisible écartée', async () => {
  toutVoir();
  for (let i = 1; i <= 35; i++) insererParcours('volcan-' + String(i).padStart(2, '0'), { titre: 'Volcan ' + i, etapes: 1, vues: i });
  db.base.prepare("INSERT INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES ('volcan-casse', 'Volcan cassé', 'pas du json', 'a', 1000, 'x')").run();
  const r = await appel(parcoursGet, { requete: '?q=volcan' });
  ok200(r);
  assert.equal(r.corps.parcours.length, 30);
  assert.ok(!r.corps.parcours.some((x) => x.id === 'volcan-casse'));
  assert.deepEqual(r.corps.parcours.slice(0, 2).map((x) => x.vues), [35, 34]);
});

test('parcours POST : une formation qui existe n’est jamais régénérée (même titre, autres majuscules ou accents), sans IA ni quota', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const sc = scenario(partiesStandard());
  const r1 = await appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r1);
  assert.equal(sc.appels.length, 2);
  const avant = lignes('SELECT contenu FROM parcours')[0].contenu;
  for (const titre of ['LA TOUR EIFFEL', 'la   tour  eiffel', '  La tour Eiffel  ']) {
    const sc2 = scenario(partiesStandard());
    const r2 = await appel(parcoursPost, { env: envDe(sc2), methode: 'POST', jeton: autre.jeton, corps: { titre } });
    ok200(r2);
    assert.equal(r2.corps.parcours.id, 'la-tour-eiffel');
    assert.equal(sc2.appels.length, 0);
  }
  assert.equal(lignes('SELECT contenu FROM parcours')[0].contenu, avant, 'le contenu n’a pas changé');
  assert.equal(lignes('SELECT COUNT(*) AS n FROM parcours')[0].n, 1);
  assert.deepEqual(lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'parcours%' ORDER BY cle"), [{ cle: 'parcours:joueur:' + j.id, n: 1 }, { cle: 'parcours:total', n: 1 }]);
});

// --- Fiche d'un module : GET /api/fiche ---

test('fiche GET : « À retenir » et définitions des leçons écrites d’un module, lecture seule et publique ; 400 sinon', async () => {
  toutVoir();
  const fiche = (requete) => appel(ficheGet, { requete });
  const lecon = (n, extra = {}) => {
    const c = { id: `prog:${n}`, parcours: 'prog', numero: n, titre: `Leçon ${n}`, aRetenir: [`Retenir ${n}a`, `Retenir ${n}b`], definitions: [{ terme: `Terme ${n}`, definition: `Définition ${n}.` }], ...extra };
    db.base.prepare('INSERT INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES (?, ?, ?, ?, 0, ?)').run(c.id, 'prog', n, JSON.stringify(c), 'x');
  };
  for (const n of [1, 2, 3, 5]) lecon(n);
  lecon(4, { aRetenir: 'pas une liste', definitions: [{ terme: 'Sans définition' }, null, 'x', { terme: ' Bon ', definition: ' Valide. ' }] });
  db.base.prepare("INSERT INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES ('prog:6', 'prog', 6, 'pas du json', 0, 'x')").run();
  db.base.prepare("INSERT INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES ('autre:2', 'autre', 2, '{\"titre\":\"Autre\"}', 0, 'x')").run();
  const r = await fiche('?parcours=prog&de=2&a=5');
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['lecons']);
  assert.deepEqual(r.corps.lecons.map((x) => x.numero), [2, 3, 4, 5], 'les leçons non écrites, illisibles ou d’un autre parcours sont absentes');
  assert.deepEqual(r.corps.lecons[0], { numero: 2, titre: 'Leçon 2', aRetenir: ['Retenir 2a', 'Retenir 2b'], definitions: [{ terme: 'Terme 2', definition: 'Définition 2.' }] });
  assert.deepEqual(r.corps.lecons[2].aRetenir, []);
  assert.deepEqual(r.corps.lecons[2].definitions, [{ terme: 'Bon', definition: 'Valide.' }]);
  assert.deepEqual((await fiche('?parcours=prog&de=6&a=9')).corps.lecons, [], 'leçon illisible écartée');
  assert.deepEqual((await fiche('?parcours=inconnu&de=1&a=3')).corps.lecons, []);
  assert.deepEqual((await fiche('?parcours=prog&de=1500&a=1500')).corps.lecons, []);
  assert.equal((await fiche('?parcours=prog&de=1&a=20')).statut, 200, '20 leçons au plus');
  for (const requete of ['', '?parcours=prog', '?parcours=prog&de=1', '?de=1&a=3', '?parcours=prog&de=0&a=3', '?parcours=prog&de=3&a=2', '?parcours=prog&de=1&a=21',
    '?parcours=prog&de=1&a=1501', '?parcours=prog&de=x&a=3', '?parcours=prog&de=1.5&a=3', '?parcours=prog&de=-1&a=3', '?parcours=Pas%20Valide&de=1&a=3', '?parcours=prog&de=1&a=']) {
    erreurFr(await fiche(requete), 400);
  }
  assert.deepEqual(lignes('SELECT SUM(vues) AS v FROM paliers'), [{ v: 0 }], 'aucune vue comptée');
  assert.equal(lignes('SELECT * FROM quotas').length, 0, 'aucun quota');
  const rep = await worker.fetch(new Request('https://koios.test/api/fiche?parcours=prog&de=1&a=3'), { DB: db, ASSETS: {} }, { waitUntil() {} });
  assert.equal(rep.status, 200);
  assert.equal((await worker.fetch(new Request('https://koios.test/api/fiche?parcours=prog&de=1&a=3', { method: 'POST', body: '{}' }), { DB: db, ASSETS: {} }, { waitUntil() {} })).status, 405);
});

// --- Front : plus de redirection vers le parcours vérifié, sources repliées ---

test('app : creerParcours ne redirige plus vers un parcours vérifié ; sources repliées ; onglet Cartes ; Aller plus loin', async () => {
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const creer = app.slice(app.indexOf('function creerParcours('), app.indexOf('/* ---------- Mise en page'));
  assert.ok(!/location\.hash\s*=\s*"#\/p\/"\s*\+\s*v\.id/.test(creer), 'plus de redirection vers v-xx');
  assert.ok(!creer.includes('chargerListeVerifies'), 'creerParcours ne consulte plus la liste des parcours vérifiés');
  assert.match(creer, /api\("POST", "parcours", \{ titre: titre \}/);
  assert.match(app, /el\("details", \{ "class": "sources-pliees"/);
  assert.match(app, /Aller plus loin/);
  assert.match(app, /prolonger: true/);
  assert.match(app, /\["cartes", "Cartes"\]/);
  assert.match(app, /aria-pressed/);
  assert.ok(!app.includes('innerHTML = x') && !/\.innerHTML\s*=\s*(?!"")[^;]*(?:l\.|j\.|p\.|t\.)/.test(app.replace(/innerHTML = ""/g, '')), 'rien du serveur par innerHTML');
});

// --- GET /api/quiz ---

test('quiz GET : paramètres invalides 400, parcours inconnu 404, cache vide : liste vide ; public, sans quota', async () => {
  toutVoir();
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  erreurFr(await appel(quizGet), 400);
  erreurFr(await appel(quizGet, { requete: '?parcours=' }), 400);
  erreurFr(await appel(quizGet, { requete: '?parcours=inconnu' }), 404, /Parcours/);
  erreurFr(await appel(quizGet, { requete: '?parcours=Pas%20Valide' }), 404);
  for (const requete of ['&n=0', '&n=21', '&n=abc', '&n=1.5', '&n=-3', '&n=', '&n=100', '&graine=abc', '&graine=1.5', '&graine=', '&graine=99999999999999999999']) {
    erreurFr(await appel(quizGet, { requete: '?parcours=la-tour-eiffel' + requete }), 400);
  }
  assert.deepEqual((await appel(quizGet, { requete: '?parcours=la-tour-eiffel' })).corps, { questions: [] });
  assert.equal(lignes('SELECT * FROM quotas').length, 0);
});

test('quiz GET : tirage déterministe selon la graine parmi les questions des paliers en cache du parcours', async () => {
  toutVoir();
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  insererParcours('autre', { titre: 'Autre' });
  const contenus = new Map();
  for (const n of [1, 2, 3]) contenus.set(`la-tour-eiffel:${n}`, insererPalierTest('la-tour-eiffel', n));
  insererPalierTest('autre', 1);
  const a = await appel(quizGet, { requete: '?parcours=la-tour-eiffel&n=10&graine=42' });
  ok200(a);
  assert.deepEqual(Object.keys(a.corps), ['questions']);
  assert.equal(a.corps.questions.length, 10);
  assert.deepEqual(Object.keys(a.corps.questions[0]), ['palier', 'titre', 'index', 'question']);
  for (const q of a.corps.questions) {
    const c = contenus.get(q.palier);
    assert.ok(c, 'un palier de ce parcours : ' + q.palier);
    assert.equal(q.titre, c.titre);
    assert.ok(q.index >= 0 && q.index < 4);
    assert.deepEqual(q.question, c.questions[q.index]);
  }
  assert.equal(new Set(a.corps.questions.map((q) => q.palier + '#' + q.index)).size, 10, 'sans remise');
  assert.deepEqual((await appel(quizGet, { requete: '?graine=42&n=10&parcours=la-tour-eiffel' })).corps, a.corps, 'même graine, même tirage');
  const ids = (r) => r.corps.questions.map((q) => q.palier + '#' + q.index);
  assert.notDeepEqual(ids(await appel(quizGet, { requete: '?parcours=la-tour-eiffel&n=10&graine=43' })), ids(a));
  assert.notDeepEqual(ids(await appel(quizGet, { requete: '?parcours=la-tour-eiffel&n=10&graine=-7' })), ids(a));
  assert.equal((await appel(quizGet, { requete: '?parcours=la-tour-eiffel' })).corps.questions.length, 10, 'n par défaut : 10');
  assert.deepEqual((await appel(quizGet, { requete: '?parcours=la-tour-eiffel' })).corps, (await appel(quizGet, { requete: '?parcours=la-tour-eiffel&graine=0' })).corps);
  assert.equal((await appel(quizGet, { requete: '?parcours=la-tour-eiffel&n=1&graine=5' })).corps.questions.length, 1);
  assert.equal((await appel(quizGet, { requete: '?parcours=la-tour-eiffel&n=20&graine=5' })).corps.questions.length, 12, '12 questions en cache');
  assert.deepEqual(ids(await appel(quizGet, { requete: '?parcours=la-tour-eiffel&n=5&graine=42' })), ids(a).slice(0, 5));
  // Les questions d’un autre parcours ne sortent pas ; un seul palier : 4 questions (moins de 5 : quiz direct).
  assert.ok(ids(await appel(quizGet, { requete: '?parcours=autre&n=20' })).every((x) => x.startsWith('autre:1#')));
  assert.equal((await appel(quizGet, { requete: '?parcours=autre&n=20' })).corps.questions.length, 4);
  assert.equal(lignes('SELECT * FROM quotas').length, 0);
  // Tirage pur.
  assert.deepEqual(tirerParmi(['a', 'b', 'c', 'd'], 2, 7), tirerParmi(['a', 'b', 'c', 'd'], 2, 7));
  assert.equal(tirerParmi(['a', 'b'], 9, 1).length, 2);
  assert.deepEqual(tirerParmi([], 3, 1), []);
  const pool = ['a', 'b', 'c'];
  tirerParmi(pool, 3, 1);
  assert.deepEqual(pool, ['a', 'b', 'c'], 'le pool n’est pas modifié');
});

// --- POST /api/quiz-direct ---

const quotasQuiz = () => lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'quizdirect%' ORDER BY cle");
const postQuiz = (sc, joueur, parcours = 'la-tour-eiffel', extra = {}) =>
  appel(quizDirectPost, { env: envDe(sc, extra), methode: 'POST', jeton: joueur && joueur.jeton, corps: { parcours } });

test('quiz-direct POST : 401, 400, 404, 503 ; rien consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  const sc = scenario(partiesStandard());
  erreurFr(await postQuiz(sc, null), 401);
  for (const parcours of [undefined, null, '', 12, ['la-tour-eiffel'], 'Pas Valide', 'x'.repeat(41)]) {
    erreurFr(await appel(quizDirectPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { parcours } }), 400);
  }
  erreurFr(await postQuiz(sc, j, 'inconnu'), 404);
  erreurFr(await appel(quizDirectPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: j.jeton, corps: { parcours: 'la-tour-eiffel' } }), 503, /IA absente/);
  erreurFr(await appel(quizDirectPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { parcours: 'la-tour-eiffel', bourrage: 'x'.repeat(3000) } }), 413);
  assert.equal(sc.appels.length, 0);
  assert.equal(quotasQuiz().length, 0);
  assert.equal(lignes('SELECT * FROM quiz_direct').length, 0);
});

test('quiz-direct POST : 10 questions écrites d’après les sources du parcours, recoupées, mises en cache par parcours', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  await creerParcoursTest(j);
  wiki.appels.length = 0;
  const sc = scenario(partiesStandard());
  const r = await postQuiz(sc, j);
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['questions']);
  const qs = r.corps.questions;
  assert.equal(qs.length, 10);
  assert.deepEqual(Object.keys(qs[0]), ['palier', 'titre', 'index', 'question']);
  assert.deepEqual(qs.map((q) => q.index), nombres(0, 9));
  assert.ok(qs.every((q) => q.palier === 'la-tour-eiffel:quiz' && q.titre === 'La tour Eiffel'));
  assert.deepEqual(qs.slice(0, 7).map((q) => q.question.type), Array(7).fill('qcm'));
  assert.deepEqual(qs.slice(7).map((q) => q.question.type), ['vraifaux', 'vraifaux', 'vraifaux']);
  assert.equal(qs[0].question.reponses[qs[0].question.bonne], 'Bonne proposition 1');
  assert.ok(qs.every((q) => q.question.explication.length >= 20));
  // Appels : écriture (Llama), vérification (Mistral) ; extraits = pages du parcours (FR et EN).
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.modele]), [['quiz', LLAMA], ['verif', MISTRAL]]);
  const demande = sc.appels[0].entree.messages[1].content;
  assert.equal(sc.appels[0].entree.messages[0].content, PROMPT_QUIZ);
  assert.match(demande, /Parcours : « La tour Eiffel »/);
  assert.match(demande, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.match(demande, /Extrait 2 · Wikipedia \(en\), page « Eiffel Tower »/);
  assert.match(sc.appels[1].entree.messages[1].content, /\n20\. Explication : /);
  // Cache par parcours.
  const [ligne] = lignes('SELECT parcours, contenu FROM quiz_direct');
  assert.equal(ligne.parcours, 'la-tour-eiffel');
  const stocke = JSON.parse(ligne.contenu);
  assert.deepEqual(Object.keys(stocke), ['questions', 'sources', 'verification']);
  assert.deepEqual(stocke.verification, { ia: [NOM_LLAMA, NOM_MISTRAL], affirmations: 20, retirees: 0, statut: 'recoupe' });
  assert.equal(stocke.sources.length, 2);
  assert.deepEqual(quotasQuiz(), [{ cle: 'quizdirect:joueur:' + j.id, n: 1 }]);
  // Un autre lecteur, même sans IA : le quiz en cache, sans quota.
  const apres = await appel(quizDirectPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: autre.jeton, corps: { parcours: 'la-tour-eiffel' } });
  ok200(apres);
  assert.deepEqual(apres.corps, r.corps);
  assert.deepEqual(quotasQuiz(), [{ cle: 'quizdirect:joueur:' + j.id, n: 1 }]);
  assert.equal(lignes('SELECT * FROM quiz_direct').length, 1);
});

test('quiz-direct POST : retraits, nouvelle rédaction sous 5 questions, deux échecs : 502 ; GLM rédige si la clé existe', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  // 3 questions non confirmées sur 10 : 30 %, il en reste 7.
  const sc = scenario({ ...partiesStandard(), verif: [verifNumeros(2, 6, 10)] });
  const r = await postQuiz(sc, j);
  ok200(r);
  assert.equal(r.corps.questions.length, 7);
  assert.deepEqual(r.corps.questions.map((q) => q.index), nombres(0, 6), 'index renumérotés');
  assert.equal(sc.appels.length, 2);
  const stocke = JSON.parse(lignes('SELECT contenu FROM quiz_direct')[0].contenu);
  assert.deepEqual([stocke.verification.affirmations, stocke.verification.retirees, stocke.verification.statut], [20, 6, 'partiel']);
  // 7 questions non confirmées : il en reste 3 (< 5) et 70 % retiré : on réécrit.
  toutVider();
  const j2 = await creerJoueur();
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  const sc2 = scenario({ ...partiesStandard(), verif: [verifNumeros(2, 4, 6, 8, 10, 12, 14), verifNumeros()] });
  const r2 = await postQuiz(sc2, j2);
  ok200(r2);
  assert.equal(r2.corps.questions.length, 10);
  assert.deepEqual(sc2.appels.map((a) => a.etape), ['quiz', 'verif', 'quiz', 'verif']);
  assert.match(sc2.par('quiz')[1].entree.messages[1].content, /contenait des affirmations introuvables/);
  // Quiz invalide (4 questions seulement), deux fois.
  toutVider();
  const j3 = await creerJoueur();
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  const court = { questions: quizBrut().questions.slice(0, 4) };
  const sc3 = scenario({ ...partiesStandard(), quiz: [court] });
  erreurFr(await postQuiz(sc3, j3), 502);
  assert.equal(sc3.appels.length, 4);
  assert.equal(lignes('SELECT * FROM quiz_direct').length, 0);
  // Avec la clé GLM : GLM écrit, Mistral vérifie.
  const sc4 = scenario(partiesStandard());
  ext.glm = sc4.glm;
  ok200(await postQuiz(sc4, j3, 'la-tour-eiffel', AVEC_GLM));
  assert.deepEqual(sc4.appels.map((a) => [a.etape, a.via]), [['quiz', 'glm'], ['verif', 'ai']]);
  assert.deepEqual(JSON.parse(lignes('SELECT contenu FROM quiz_direct')[0].contenu).verification.ia, ['glm-4.7-flash', NOM_MISTRAL]);
});

test('quiz-direct POST : 10 par jour et par lecteur (le cache n’en consomme pas) ; deux lecteurs en même temps : le premier gagne', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  for (let i = 1; i <= 11; i++) insererParcours('p' + i, { titre: 'Parcours ' + i });
  const sc = scenario(partiesStandard());
  for (let i = 1; i <= 10; i++) ok200(await postQuiz(sc, j, 'p' + i));
  erreurFr(await postQuiz(sc, j, 'p11'), 429);
  assert.equal(sc.par('quiz').length, 10);
  ok200(await postQuiz(sc, j, 'p3'));
  assert.equal(sc.par('quiz').length, 10);
  ok200(await postQuiz(sc, autre, 'p11'));
  assert.deepEqual(quotasQuiz(), [{ cle: 'quizdirect:joueur:' + autre.id, n: 1 }, { cle: 'quizdirect:joueur:' + j.id, n: 11 }].sort((a, b) => (a.cle < b.cle ? -1 : 1)));
  // Concurrence.
  toutVoir();
  const k = await creerJoueur();
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  const gagnant = { questions: validerQuiz(quizBrut()).valeur.questions.slice(0, 6).map((q) => ({ ...q, explication: 'Le lecteur arrivé le premier a écrit cette explication.' })), sources: [], verification: {} };
  const sc2 = scenario({ ...partiesStandard(), verif: [() => {
    db.base.prepare('INSERT INTO quiz_direct (parcours, contenu, cree) VALUES (?, ?, ?)').run('la-tour-eiffel', JSON.stringify(gagnant), 'x');
    return verifNumeros();
  }] });
  const r = await postQuiz(sc2, k);
  ok200(r);
  assert.equal(r.corps.questions.length, 6);
  assert.match(r.corps.questions[0].question.explication, /arrivé le premier/);
});

// --- Duels : références de paliers et de quiz ---

test('duel POST : accepte les références {chapitre: "<parcours>:<k>", index} et {chapitre: "<parcours>:quiz", index} existantes', async () => {
  toutVoir();
  const a = await creerJoueur('Alice');
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  insererPalierTest('la-tour-eiffel', 1);
  insererPalierTest('la-tour-eiffel', 2, { questions: validerRedaction(palierBrut()).valeur.questions.slice(0, 2) });
  db.base.prepare('INSERT INTO quiz_direct (parcours, contenu, cree) VALUES (?, ?, ?)')
    .run('la-tour-eiffel', JSON.stringify({ questions: validerQuiz(quizBrut()).valeur.questions }), 'x');
  const q = (chapitre, index) => ({ chapitre, index });
  const score = { justes: 3, n: 5, points: 80 };
  const duel = (questions, s = score) => appel(duelPost, { methode: 'POST', jeton: a.jeton, corps: { questions, score: s } });
  const bonnes = [q('la-tour-eiffel:1', 0), q('la-tour-eiffel:1', 3), q('la-tour-eiffel:2', 1), q('la-tour-eiffel:quiz', 0), q('la-tour-eiffel:quiz', 9)];
  const r = await duel(bonnes);
  ok200(r);
  assert.match(r.corps.id, /^[a-z0-9]{8}$/);
  const g = await appel(duelGet, { requete: '?id=' + r.corps.id });
  assert.deepEqual(g.corps.duel.questions, bonnes, 'références renvoyées telles quelles, l’app retrouve les questions');
  // Mélange avec un chapitre IA et un chapitre vérifié.
  insererChapitre('s1', 1);
  ok200(await duel([q('ia:s1:1', 2), q('hg-01', 1), q('la-tour-eiffel:1', 2), q('la-tour-eiffel:quiz', 5), q('la-tour-eiffel:2', 0)]));
  // Refus : palier absent, question absente du palier, index hors limites, identifiants mal formés.
  const fond = [q('la-tour-eiffel:1', 0), q('la-tour-eiffel:1', 1), q('la-tour-eiffel:1', 2), q('la-tour-eiffel:quiz', 1)];
  for (const [mauvaise, motif] of [
    [q('la-tour-eiffel:3', 0), 'palier absent du cache'],
    [q('la-tour-eiffel:2', 2), 'le palier 2 n’a que 2 questions'],
    [q('la-tour-eiffel:1', 4), 'index 4'],
    [q('la-tour-eiffel:1', -1), 'index négatif'],
    [q('la-tour-eiffel:1', 1.5), 'index décimal'],
    [q('la-tour-eiffel:quiz', 10), 'index 10 du quiz'],
    [q('autre:quiz', 0), 'quiz absent'],
    [q('autre:1', 0), 'parcours absent'],
    [q('la-tour-eiffel:0', 0), 'palier 0'],
    [q('la-tour-eiffel:501', 0), 'palier 501'],
    [q('La-Tour:1', 0), 'majuscules'],
    [q('la tour:1', 0), 'espace'],
    [q('la-tour-eiffel:1:2', 0), 'trop de segments'],
    [q('la-tour-eiffel:', 0), 'palier vide'],
    [q(':1', 0), 'parcours vide'],
    [q('a'.repeat(41) + ':1', 0), 'parcours trop long'],
    [q('la-tour-eiffel:quizz', 0), 'quiz mal écrit'],
  ]) {
    const rep = await duel([mauvaise, ...fond]);
    assert.equal(rep.statut, 400, motif + ' ' + JSON.stringify(rep.corps));
    assert.equal(typeof rep.corps.erreur, 'string');
  }
  assert.equal(lignes('SELECT * FROM duels').length, 2);
});

// --- GET /api/glossaire ---

function insererLecon(parcours, numero, contenu) {
  db.base.prepare('INSERT OR REPLACE INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES (?, ?, ?, ?, 0, ?)')
    .run(`${parcours}:${numero}`, parcours, numero, typeof contenu === 'string' ? contenu : JSON.stringify({ id: `${parcours}:${numero}`, numero, ...contenu }), '2026-10-19T08:00:00.000Z');
}
const glossaire = (requete, options = {}) => appel(glossaireGet, { requete, ...options });

test('glossaire GET : parcours inconnu ou sans leçon en cache : liste vide, sans connexion ni quota ni IA', async () => {
  toutVoir();
  const ia = fauxAI([]);
  for (const requete of ['?parcours=inconnu&jusqua=5', '?parcours=la-tour-eiffel&jusqua=1']) {
    const r = await glossaire(requete, { env: { DB: db, AI: ia } });
    ok200(r);
    assert.deepEqual(r.corps, { termes: [] });
    assert.match(r.type, /application\/json/);
  }
  insererLecon('la-tour-eiffel', 1, { titre: 'Sans définition', sections: { enBref: 'x' } });
  assert.deepEqual((await glossaire('?parcours=la-tour-eiffel&jusqua=9')).corps, { termes: [] });
  assert.equal(ia.appels.length, 0);
  assert.equal(lignes('SELECT * FROM quotas').length, 0);
});

test('glossaire GET : un nom de mois n’écarte un terme que s’il est suivi d’un chiffre (« Mars » la planète reste)', async () => {
  toutVoir();
  insererLecon('systeme-solaire', 1, {
    titre: 'Les planètes',
    definitions: [{ terme: 'Mars', definition: 'Quatrième planète du Système solaire.' }, { terme: 'Mai', definition: 'Un nom propre quelconque.' }],
    reperes: [{ terme: 'Mars 1889', definition: 'Une date.' }, { terme: 'mai 68', definition: 'Une date.' }, { terme: '12 octobre 1492', definition: 'Une date.' }, { terme: 'vers 800', definition: 'Une date.' }, { terme: 'Juin', definition: 'Le mois seul reste un mot.' }],
  });
  const r = await glossaire('?parcours=systeme-solaire&jusqua=9');
  ok200(r);
  assert.deepEqual(r.corps.termes.map((x) => x.terme), ['Juin', 'Mai', 'Mars']);
});

test('glossaire GET : tri français, dédoublonnage sans accents ni casse (première leçon gardée), définitions et repères sans les dates, borne jusqua', async () => {
  toutVoir();
  insererLecon('la-tour-eiffel', 1, {
    titre: 'Une tour pour 1889',
    definitions: [{ terme: 'Rivet', definition: 'Tige métallique à tête.' }, { terme: 'Écrou', definition: 'Pièce taraudée.' }, { terme: 'Zinc', definition: 'Un métal.' }],
    reperes: [{ terme: '31 mars 1889', definition: 'Fin du chantier.' }],
  });
  insererLecon('la-tour-eiffel', 2, {
    titre: 'Gustave Eiffel',
    definitions: [{ terme: 'rivet', definition: 'Doublon en minuscules : ignoré.' }, { terme: 'ECROU', definition: 'Doublon sans accent : ignoré.' }, { terme: 'Fer puddlé', definition: 'Fer brassé en fusion.' }, { terme: 'Abside', definition: 'Fond d’une église.' }],
    reperes: [{ terme: 'Fer puddlé', definition: 'Doublon avec espace insécable : ignoré.' }],
  });
  insererLecon('la-tour-eiffel', 3, { titre: 'La radio', definitions: [{ terme: 'Antenne', definition: 'Reçoit les ondes.' }] });
  insererLecon('la-tour-eiffel', 4, { titre: 'Trop loin', definitions: [{ terme: 'Zéro', definition: 'Pas lu avec jusqua=3.' }] });
  insererLecon('autre-parcours', 1, { titre: 'Autre', definitions: [{ terme: 'Étranger', definition: 'D’un autre parcours.' }] });
  const r = await glossaire('?parcours=la-tour-eiffel&jusqua=3');
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['termes']);
  assert.deepEqual(r.corps.termes.map((x) => x.terme), ['Abside', 'Antenne', 'Écrou', 'Fer puddlé', 'Rivet', 'Zinc']);
  assert.ok(!r.corps.termes.some((x) => x.terme === '31 mars 1889'), 'une date de repère n’est pas un mot du glossaire');
  assert.deepEqual(r.corps.termes.find((x) => x.terme === 'Zinc'), { terme: 'Zinc', definition: 'Un métal.', numero: 1, titre: 'Une tour pour 1889' });
  assert.deepEqual(r.corps.termes.map((x) => x.numero), [2, 3, 1, 2, 1, 1]);
  assert.equal(r.corps.termes.find((x) => x.terme === 'Rivet').definition, 'Tige métallique à tête.', 'la première leçon l’emporte');
  assert.equal(r.corps.termes.find((x) => x.terme === 'Écrou').titre, 'Une tour pour 1889');
  assert.ok(!r.corps.termes.some((x) => x.terme === 'Zéro' || x.terme === 'Étranger'), 'ni les leçons au-delà de jusqua ni un autre parcours');
  // La borne change le résultat : jusqua=1 ne voit que la leçon 1, jusqua=4 voit aussi la leçon 4.
  assert.deepEqual((await glossaire('?parcours=la-tour-eiffel&jusqua=1')).corps.termes.map((x) => x.terme), ['Écrou', 'Rivet', 'Zinc']);
  assert.deepEqual((await glossaire('?parcours=la-tour-eiffel&jusqua=500')).corps.termes.map((x) => x.terme).slice(-2), ['Zéro', 'Zinc']);
  // « é » se range avec « e », pas après « z » ; les majuscules ne comptent pas.
  insererLecon('tri', 1, { titre: 'Tri', definitions: [{ terme: 'zèbre', definition: 'a' }, { terme: 'Élan', definition: 'b' }, { terme: 'éléphant', definition: 'c' }, { terme: 'Eau', definition: 'd' }, { terme: 'ane', definition: 'e' }] });
  assert.deepEqual((await glossaire('?parcours=tri&jusqua=1')).corps.termes.map((x) => x.terme), ['ane', 'Eau', 'Élan', 'éléphant', 'zèbre']);
});

test('glossaire GET : lecture seule (aucune vue comptée), ligne illisible ou champs mal formés ignorés, titre absent', async () => {
  toutVoir();
  insererLecon('lecture', 1, { titre: 'Bonne', definitions: [{ terme: 'Bon', definition: 'Valide.' }, { terme: 'Sans définition' }, { definition: 'Sans terme.' }, { terme: '  ', definition: 'Terme vide.' }, { terme: 'Vide', definition: '  ' }, null, 'texte', { terme: 12, definition: 'Nombre.' }] });
  insererLecon('lecture', 2, 'pas du json');
  insererLecon('lecture', 3, { definitions: 'pas une liste', reperes: { terme: 'Objet', definition: 'Pas une liste.' } });
  insererLecon('lecture', 4, { definitions: [{ terme: 'Sans titre', definition: 'La leçon n’a pas de titre.' }] });
  const r = await glossaire('?parcours=lecture&jusqua=10');
  ok200(r);
  assert.deepEqual(r.corps.termes, [
    { terme: 'Bon', definition: 'Valide.', numero: 1, titre: 'Bonne' },
    { terme: 'Sans titre', definition: 'La leçon n’a pas de titre.', numero: 4, titre: '' },
  ]);
  assert.deepEqual(lignes('SELECT SUM(vues) AS v FROM paliers'), [{ v: 0 }]);
});

test('glossaire GET : paramètres invalides 400 ; parcours bien formé mais inconnu : liste vide', async () => {
  toutVoir();
  for (const requete of ['', '?parcours=la-tour-eiffel', '?jusqua=3', '?parcours=&jusqua=3', '?parcours=la-tour-eiffel&jusqua=',
    '?parcours=la-tour-eiffel&jusqua=abc', '?parcours=la-tour-eiffel&jusqua=1.5', '?parcours=la-tour-eiffel&jusqua=-1',
    '?parcours=la-tour-eiffel&jusqua=0', '?parcours=la-tour-eiffel&jusqua=1501', '?parcours=la-tour-eiffel&jusqua=10000',
    '?parcours=la-tour-eiffel&jusqua=00001', '?parcours=Pas%20Valide&jusqua=1', '?parcours=' + 'a'.repeat(41) + '&jusqua=1']) {
    erreurFr(await glossaire(requete), 400);
  }
  for (const k of ['1', '500', '007', '1000', '1500']) ok200(await glossaire('?parcours=inconnu&jusqua=' + k));
  // POST non permis.
  const rep = await worker.fetch(new Request('https://koios.test/api/glossaire?parcours=x&jusqua=1', { method: 'POST', body: '{}' }), { DB: db, ASSETS: {} }, { waitUntil() {} });
  assert.equal(rep.status, 405);
});

// =============================================================================
// Quiz de culture générale : blocs, question du jour, salons, tournoi
// =============================================================================

const quotasQg = () => lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'quizgeneral%' ORDER BY cle");
const postQg = (sc, joueur, corps, extra = {}) =>
  appel(quizGeneralPost, { env: envDe(sc, extra), methode: 'POST', jeton: joueur && joueur.jeton, corps });
// Une page Wikipédia (FR et EN) au nom du thème, pour que la recherche la trouve.
function pageDeTheme(theme) {
  wiki.pages[theme] = { extract: texteWiki(theme, 700), image: null };
  wiki.pagesEn[theme] = { extract: texteWiki(theme + ' (en)', 700), image: null };
}

test('quiz-general POST : 401, 400 (sujet, n, regenerer, apres), 503, 413 ; rien consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  erreurFr(await postQg(sc, null, { sujet: 'La tour Eiffel', n: 10 }), 401);
  for (const sujet of [undefined, null, '', 'a', '   ', 12, ['x'], 'x'.repeat(81), '!!! ???']) {
    erreurFr(await postQg(sc, j, { sujet, n: 10 }), 400, /Sujet/);
  }
  for (const n of [undefined, null, 0, 5, 15, 60, '10', 10.5, [10], 100]) {
    erreurFr(await postQg(sc, j, { sujet: 'La tour Eiffel', n }), 400, /10, 20, 30, 40 ou 50/);
  }
  erreurFr(await postQg(sc, j, { sujet: 'La tour Eiffel', n: 10, regenerer: 'oui' }), 400, /regenerer/);
  for (const apres of [-1, 1.5, '2', 10000, null]) erreurFr(await postQg(sc, j, { sujet: 'La tour Eiffel', n: 10, regenerer: true, apres }), 400, /apres/);
  erreurFr(await postQg(sc, j, { sujet: 'La tour Eiffel', n: 50, regenerer: true, apres: 9996 }), 400, /tour de ce sujet/);
  erreurFr(await appel(quizGeneralPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: j.jeton, corps: { sujet: 'La tour Eiffel', n: 10 } }), 503, /IA absente/);
  erreurFr(await appel(quizGeneralPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { sujet: 'La tour Eiffel', n: 10, bourrage: 'x'.repeat(3000) } }), 413);
  assert.equal(sc.appels.length, 0);
  assert.equal(quotasQg().length, 0);
  assert.equal(lignes('SELECT * FROM quiz_general').length, 0);
});

test('quiz-general POST : écrit UN bloc par requête (le front rappelle), cache partagé, non-répétition dans le message', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const sc = scenario(partiesStandard());
  const r1 = await postQg(sc, j, { sujet: 'La tour Eiffel', n: 30 });
  ok200(r1);
  assert.deepEqual(Object.keys(r1.corps), ['questions', 'manquants', 'blocs']);
  assert.equal(r1.corps.manquants, 2);
  assert.deepEqual(r1.corps.blocs, [1, 2, 3]);
  assert.equal(r1.corps.questions.length, 10);
  assert.deepEqual(Object.keys(r1.corps.questions[0]), ['palier', 'titre', 'index', 'question']);
  assert.ok(r1.corps.questions.every((q, i) => q.palier === 'qg:la-tour-eiffel:1' && q.titre === 'La tour Eiffel' && q.index === i));
  assert.deepEqual(r1.corps.questions.slice(0, 7).map((q) => q.question.type), Array(7).fill('qcm'));
  assert.deepEqual(r1.corps.questions.slice(7).map((q) => q.question.type), Array(3).fill('vraifaux'));
  assert.ok(r1.corps.questions.every((q) => q.question.explication.length >= 20), 'chaque réponse a son explication');
  // Écriture puis vérification par l'autre IA, extraits FR et EN du sujet ; le 1er bloc ne reçoit pas de liste.
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.modele]), [['quiz', LLAMA], ['verif', MISTRAL]]);
  assert.equal(sc.appels[0].entree.messages[0].content, PROMPT_QUIZ);
  const demande1 = sc.appels[0].entree.messages[1].content;
  assert.match(demande1, /Parcours : « La tour Eiffel »/);
  assert.match(demande1, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.match(demande1, /Extrait 2 · Wikipedia \(en\), page « Eiffel Tower »/);
  assert.match(demande1, /faciles, moyennes et difficiles/);
  assert.doesNotMatch(demande1, /déjà écrites/);
  const r2 = await postQg(sc, j, { sujet: 'La tour Eiffel', n: 30 });
  assert.equal(r2.corps.manquants, 1);
  assert.equal(r2.corps.questions.length, 20);
  assert.deepEqual([...new Set(r2.corps.questions.map((q) => q.palier))], ['qg:la-tour-eiffel:1', 'qg:la-tour-eiffel:2']);
  // Non-répétition : le bloc 2 reçoit les énoncés du bloc 1.
  const demande2 = sc.par('quiz')[1].entree.messages[1].content;
  assert.match(demande2, /Questions déjà écrites sur ce sujet/);
  assert.match(demande2, /- Question numéro 1 sur la tour Eiffel/);
  assert.match(demande2, /- Affirmation numéro 8 sur la tour Eiffel/, 'les vrai ou faux aussi');
  const r3 = await postQg(sc, j, { sujet: 'La tour Eiffel', n: 30 });
  assert.equal(r3.corps.manquants, 0);
  assert.equal(r3.corps.questions.length, 30);
  assert.deepEqual(lignes('SELECT id, sujet, bloc FROM quiz_general ORDER BY bloc'), [1, 2, 3].map((k) => ({ id: 'la-tour-eiffel:' + k, sujet: 'La tour Eiffel', bloc: k })));
  assert.match(sc.par('quiz')[2].entree.messages[1].content, /- Question numéro 1 sur la tour Eiffel/);
  const stocke = JSON.parse(lignes("SELECT contenu FROM quiz_general WHERE id = 'la-tour-eiffel:1'")[0].contenu);
  assert.deepEqual(Object.keys(stocke), ['questions', 'sources', 'verification']);
  assert.deepEqual(stocke.verification, { ia: [NOM_LLAMA, NOM_MISTRAL], affirmations: 20, retirees: 0, statut: 'recoupe' });
  assert.deepEqual(quotasQg(), [{ cle: 'quizgeneral:joueur:' + j.id, n: 3 }, { cle: 'quizgeneral:total', n: 3 }].sort((a, b) => (a.cle < b.cle ? -1 : 1)));
  // Tout est en cache : un autre lecteur, même sans IA, reçoit les 30 questions sans rien consommer. Même sujet écrit autrement.
  const avant = sc.appels.length;
  const cache = await appel(quizGeneralPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: autre.jeton, corps: { sujet: '  la TOUR Eiffel ', n: 30 } });
  ok200(cache);
  assert.deepEqual(cache.corps, r3.corps);
  const moins = await appel(quizGeneralPost, { env: { DB: db, AI: undefined }, methode: 'POST', jeton: autre.jeton, corps: { sujet: 'La tour Eiffel', n: 10 } });
  assert.equal(moins.corps.questions.length, 10);
  assert.equal(sc.appels.length, avant);
  assert.equal(quotasQg().length, 2);
});

test('quiz-general POST : retraits de la vérification (un bloc peut compter moins de 10 questions), 502 si l’IA échoue deux fois', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario({ ...partiesStandard(), verif: [verifNumeros(2, 6, 10)] });
  const r = await postQg(sc, j, { sujet: 'La tour Eiffel', n: 10 });
  ok200(r);
  assert.equal(r.corps.questions.length, 7);
  assert.deepEqual(r.corps.questions.map((q) => q.index), nombres(0, 6));
  assert.equal(r.corps.manquants, 0);
  toutVider();
  const court = { questions: quizBrut().questions.slice(0, 4) };
  const sc2 = scenario({ ...partiesStandard(), quiz: [court] });
  const j2 = await creerJoueur('Deux');
  erreurFr(await postQg(sc2, j2, { sujet: 'La tour Eiffel', n: 10 }), 502);
  assert.equal(lignes('SELECT * FROM quiz_general').length, 0);
});

test('quiz-general POST : régénérer prend les blocs suivants, au-delà de 5 des blocs neufs 6, 7…', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  const q = (corps) => postQg(sc, j, { sujet: 'La tour Eiffel', ...corps });
  ok200(await q({ n: 10 }));
  // Sans « apres » : les blocs qui suivent les n / 10 premiers.
  const r2 = await q({ n: 10, regenerer: true });
  assert.deepEqual(r2.corps.blocs, [2]);
  assert.ok(r2.corps.questions.every((x) => x.palier === 'qg:la-tour-eiffel:2'));
  assert.equal(r2.corps.manquants, 0);
  const r3 = await q({ n: 20, regenerer: true, apres: 2 });
  assert.deepEqual(r3.corps.blocs, [3, 4]);
  assert.equal(r3.corps.manquants, 1);
  assert.equal((await q({ n: 20, regenerer: true, apres: 2 })).corps.manquants, 0);
  // Le bloc 5 puis, au-delà, des blocs neufs numérotés 6, 7… sans limite.
  const r6 = await q({ n: 10, regenerer: true, apres: 5 });
  assert.deepEqual(r6.corps.blocs, [6]);
  assert.ok(r6.corps.questions.every((x) => x.palier === 'qg:la-tour-eiffel:6'));
  const r12 = await q({ n: 30, regenerer: true, apres: 11 });
  assert.deepEqual(r12.corps.blocs, [12, 13, 14]);
  assert.equal(r12.corps.questions.length, 10);
  assert.deepEqual(lignes('SELECT bloc FROM quiz_general ORDER BY bloc').map((x) => x.bloc), [1, 2, 3, 4, 6, 12]);
  // Chaque bloc neuf reçoit les énoncés de tous les blocs déjà écrits.
  const dernier = sc.par('quiz').at(-1).entree.messages[1].content;
  assert.match(dernier, /Questions déjà écrites/);
  // Les mêmes blocs sans « regenerer » : les premiers, déjà en cache.
  const retour = await q({ n: 20 });
  assert.deepEqual(retour.corps.blocs, [1, 2]);
  assert.equal(retour.corps.manquants, 0);
});

test('quiz-general POST : 25 blocs nouveaux par lecteur et par jour, 150 en tout ; un bloc en cache ne coûte rien', async () => {
  toutVoir();
  const j = await creerJoueur();
  const autre = await creerJoueur('Autre');
  const sc = scenario(partiesStandard());
  db.base.prepare('INSERT INTO quotas (cle, n, jour) VALUES (?, ?, ?)').run('quizgeneral:joueur:' + j.id, 24, aujourdhui());
  ok200(await postQg(sc, j, { sujet: 'La tour Eiffel', n: 10 }));
  erreurFr(await postQg(sc, j, { sujet: 'La tour Eiffel', n: 20 }), 429, /25 blocs/);
  // Ce qui est en cache reste servi.
  const cache = await postQg(sc, j, { sujet: 'La tour Eiffel', n: 10 });
  ok200(cache);
  assert.equal(cache.corps.questions.length, 10);
  assert.equal(sc.par('quiz').length, 1);
  // Plafond total : un autre lecteur est refusé, sans consommer son propre quota de lecteur... ni écrire.
  db.base.prepare("UPDATE quotas SET n = 150 WHERE cle = 'quizgeneral:total'").run();
  erreurFr(await postQg(sc, autre, { sujet: 'Gustave Eiffel', n: 10 }), 429, /débordé/);
  assert.equal(sc.par('quiz').length, 1);
  // Le lendemain : les compteurs repartent à zéro.
  db.base.prepare("UPDATE quotas SET jour = '2000-01-01'").run();
  ok200(await postQg(sc, j, { sujet: 'La tour Eiffel', n: 20 }));
});

test('quiz-general POST : aucune source sur Wikipédia : 422 « Je ne trouve aucune source fiable sur ce sujet. », rien consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  const r = await postQg(sc, j, { sujet: 'Zzzqx wvut', n: 10 });
  erreurFr(r, 422);
  assert.equal(r.corps.erreur, 'Je ne trouve aucune source fiable sur ce sujet.');
  assert.equal(sc.appels.length, 0);
  assert.equal(quotasQg().length, 0);
  assert.equal(lignes('SELECT * FROM quiz_general').length, 0);
});

test('quiz-general POST : deux lecteurs sur le même bloc en même temps : le premier enregistré gagne', async () => {
  toutVoir();
  const j = await creerJoueur();
  const gagnant = { questions: validerQuiz(quizBrut()).valeur.questions.slice(0, 6).map((q) => ({ ...q, explication: 'Le lecteur arrivé le premier a écrit cette explication.' })), sources: [], verification: {} };
  const sc = scenario({ ...partiesStandard(), verif: [() => {
    db.base.prepare('INSERT INTO quiz_general (id, sujet, bloc, contenu, cree) VALUES (?, ?, ?, ?, ?)').run('la-tour-eiffel:1', 'La tour Eiffel', 1, JSON.stringify(gagnant), 'x');
    return verifNumeros();
  }] });
  const r = await postQg(sc, j, { sujet: 'La tour Eiffel', n: 10 });
  ok200(r);
  assert.equal(r.corps.questions.length, 6);
  assert.match(r.corps.questions[0].question.explication, /arrivé le premier/);
});

test('quiz-general GET : un bloc en cache (sujet, jour ou tournoi), public ; 400 et 404', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  ok200(await postQg(sc, j, { sujet: 'La tour Eiffel', n: 10 }));
  const g = await appel(quizGeneralGet, { requete: '?bloc=la-tour-eiffel:1' });
  ok200(g);
  assert.deepEqual(Object.keys(g.corps), ['questions']);
  assert.equal(g.corps.questions.length, 10);
  assert.equal(g.corps.questions[3].palier, 'qg:la-tour-eiffel:1');
  for (const bloc of [undefined, '', 'la-tour-eiffel', 'la-tour-eiffel:0', 'la-tour-eiffel:10000', 'Pas Valide:1', 'jour:2026-13-40', 'tournoi:hier', 'x:1;DROP']) {
    erreurFr(await appel(quizGeneralGet, { requete: bloc === undefined ? '' : '?bloc=' + encodeURIComponent(bloc) }), 400);
  }
  erreurFr(await appel(quizGeneralGet, { requete: '?bloc=autre:1' }), 404);
  erreurFr(await appel(quizGeneralGet, { requete: '?bloc=jour:2026-10-19' }), 404);
});

test('lib/general : identifiants de blocs, références qg, thèmes, semaine, classement', async () => {
  assert.equal(lireIdBloc('phares:3'), 'phares:3');
  assert.equal(lireIdBloc('jour:2026-10-19'), 'jour:2026-10-19');
  assert.equal(lireIdBloc('tournoi:2026-10-19'), 'tournoi:2026-10-19');
  for (const mauvais of ['phares:0', 'phares:12345', 'phares', 'jour:2026-02-31', 'a:b', '', null, 5, 'PHARES:1']) assert.equal(lireIdBloc(mauvais), null, String(mauvais));
  assert.equal(lireRefQg('qg:phares:2'), 'phares:2');
  assert.equal(lireRefQg('qg:tournoi:2026-10-19'), 'tournoi:2026-10-19');
  for (const mauvais of ['phares:2', 'qg:jour:2026-10-19', 'qg:phares', 'qg:', 'ia:phares:2', 'qg:phares:2:3', undefined]) assert.equal(lireRefQg(mauvais), null, String(mauvais));
  // Thèmes : une soixantaine, tous différents, un par jour de l'année (modulo), aucun mot interdit.
  assert.ok(THEMES.length >= 55 && THEMES.length <= 70);
  assert.equal(new Set(THEMES.map((x) => x.toLowerCase())).size, THEMES.length);
  assert.ok(THEMES.every((x) => x.length >= 3 && x.length <= 40 && !contientInterdit(x)));
  assert.equal(themeDuJour('2026-01-01'), THEMES[0]);
  assert.equal(themeDuJour('2026-01-02'), THEMES[1]);
  assert.equal(themeDuJour('2026-03-02'), THEMES[60 % THEMES.length], 'jour 61 de l’année');
  assert.notEqual(themeDuJour('2026-10-19'), themeDuJour('2026-10-20'));
  // Semaine : du lundi 00:00 au dimanche 23:59:59.999 (UTC).
  assert.equal(lundiDe('2026-10-19'), '2026-10-19'); // un lundi
  assert.equal(lundiDe('2026-10-25'), '2026-10-19'); // le dimanche d'après
  assert.equal(lundiDe('2026-10-26'), '2026-10-26');
  assert.equal(lundiDe('2026-01-01'), '2025-12-29');
  assert.equal(finDeSemaine('2026-10-19'), '2026-10-25T23:59:59.999Z');
  assert.equal(themeDeLaSemaine('2026-10-19'), themeDeLaSemaine('2026-10-19'));
  assert.notEqual(themeDeLaSemaine('2026-10-19'), themeDeLaSemaine('2026-10-26'));
  // Classement : par points, puis bonnes réponses, puis date ; jamais d'identifiant.
  const c = classer([
    { joueur: 'a', pseudo: 'A', justes: 3, n: 5, points: 30, date: '2026-10-19T10:00:00Z' },
    { joueur: 'b', pseudo: 'B', justes: 5, n: 5, points: 50, date: '2026-10-19T11:00:00Z' },
    { joueur: 'c', pseudo: 'C', justes: 4, n: 5, points: 30, date: '2026-10-19T09:00:00Z' },
  ], 'a');
  assert.deepEqual(c.map((x) => [x.rang, x.pseudo, x.moi]), [[1, 'B', undefined], [2, 'C', undefined], [3, 'A', true]]);
  assert.ok(!JSON.stringify(c).includes('"joueur"'));
});

// --- GET /api/jour ---

const quotaJour = () => lignes("SELECT n FROM quotas WHERE cle = 'quizjour:tentatives'").map((x) => x.n);

test('jour GET : thème du jour, question écrite à la première requête puis servie à tous (cache), sans quota de lecteur', async () => {
  toutVoir();
  const date = jourUtc();
  const theme = themeDuJour(date);
  pageDeTheme(theme);
  const sc = scenario(partiesStandard());
  const r = await appel(jourGet, { env: envDe(sc) });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['date', 'theme', 'question']);
  assert.equal(r.corps.date, date);
  assert.equal(r.corps.theme, theme);
  assert.deepEqual(Object.keys(r.corps.question), ['palier', 'titre', 'index', 'question']);
  assert.equal(r.corps.question.palier, 'jour:' + date);
  assert.equal(r.corps.question.titre, theme);
  assert.equal(r.corps.question.index, 0);
  assert.equal(r.corps.question.question.type, 'qcm', 'la 1re question à choix');
  assert.ok(r.corps.question.question.explication.length >= 20);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['quiz', 'verif']);
  assert.match(sc.appels[0].entree.messages[1].content, new RegExp(`Parcours : « ${theme} »`));
  const [ligne] = lignes('SELECT id, sujet, bloc, contenu FROM quiz_general');
  assert.deepEqual([ligne.id, ligne.sujet, ligne.bloc], ['jour:' + date, theme, 0]);
  assert.equal(JSON.parse(ligne.contenu).questions.length, 1);
  assert.deepEqual(quotaJour(), [1]);
  // Cache : même réponse, sans IA, sans tentative de plus. Aucune connexion nécessaire.
  const apres = await appel(jourGet, { env: { DB: db, AI: undefined } });
  assert.deepEqual(apres.corps, r.corps);
  assert.deepEqual(quotaJour(), [1]);
  // Lisible comme les autres blocs (pour revoir ses erreurs).
  assert.equal((await appel(quizGeneralGet, { requete: '?bloc=jour:' + date })).corps.questions[0].question.enonce, r.corps.question.question.enonce);
});

test('jour GET : ?date= acceptée la veille ou le lendemain (UTC), ignorée sinon', async () => {
  toutVoir();
  const dec = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const sc = scenario(partiesStandard());
  for (const d of [dec(-1), dec(1)]) {
    pageDeTheme(themeDuJour(d));
    const r = await appel(jourGet, { env: envDe(sc), requete: '?date=' + d });
    assert.equal(r.corps.date, d);
    assert.equal(r.corps.theme, themeDuJour(d));
  }
  for (const d of [dec(-5), dec(30), '2026-02-31', 'hier', '']) {
    const r = await appel(jourGet, { env: { DB: db, AI: undefined }, requete: '?date=' + d });
    ok200(r);
    assert.equal(r.corps.date, jourUtc());
  }
});

test('jour GET : en cas d’échec, repli sur le pool vérifié, jamais d’erreur ; plafond global de 5 tentatives par jour', async () => {
  toutVoir();
  const date = jourUtc();
  pageDeTheme(themeDuJour(date));
  const pool = [{ palier: 'v-hg:1', titre: 'De la Révolution', index: 0, question: { type: 'qcm', enonce: 'Question du pool ?', reponses: ['a', 'b', 'c', 'd'], bonne: 0, explication: 'Parce que le pool le dit.' } },
    { palier: 'v-hg:1', titre: 'De la Révolution', index: 1, question: { type: 'ordre', enonce: 'x', elements: [], ordre: [] } }];
  const assets = { fetch: async (requete) => (new URL(requete.url).pathname === '/contenu/questions.json' ? new Response(JSON.stringify(pool)) : new Response('non', { status: 404 })) };
  const court = { questions: quizBrut().questions.slice(0, 4) };
  const sc = scenario({ ...partiesStandard(), quiz: [court] });
  const env2 = envDe(sc, { ASSETS: assets });
  const echec = async () => {
    const r = await appel(jourGet, { env: env2 });
    ok200(r);
    assert.deepEqual(r.corps, { date, theme: null, question: { palier: 'v-hg:1', titre: 'De la Révolution', index: 0, question: pool[0].question }, repli: true });
  };
  await echec();
  const parTentative = sc.appels.length;
  assert.ok(parTentative >= 2);
  for (let i = 0; i < 4; i++) await echec();
  assert.equal(sc.appels.length, parTentative * 5);
  assert.equal(lignes('SELECT * FROM quiz_general').length, 0);
  // 6e requête : plus de tentative, le repli répond tout de suite.
  await echec();
  await echec();
  assert.equal(sc.appels.length, parTentative * 5, 'plafond global atteint : plus aucun appel d’IA');
  // Sans IA ni pool : question null, 200 quand même (l'app a son propre pool).
  const nu = await appel(jourGet, { env: { DB: db, AI: undefined } });
  assert.deepEqual(nu.corps, { date, theme: null, question: null, repli: true });
  // Pool illisible : même chose.
  const casse = await appel(jourGet, { env: { DB: db, AI: undefined, ASSETS: { fetch: async () => new Response('<html>', { status: 200 }) } } });
  assert.equal(casse.corps.question, null);
  // Un thème sans page Wikipédia : repli aussi.
  toutVider();
  wiki.pages = {};
  wiki.pagesEn = {};
  const sansSource = await appel(jourGet, { env: envDe(scenario(partiesStandard()), { ASSETS: assets }) });
  assert.equal(sansSource.corps.repli, true);
});

// --- Duels : références qg, salons ---

const refsBloc = (k, de = 0, a = 9, slugSujet = 'la-tour-eiffel') => nombres(de, a).map((index) => ({ chapitre: `qg:${slugSujet}:${k}`, index }));
async function preparerBlocs(joueur, n = 30, sujet = 'La tour Eiffel') {
  const sc = scenario(partiesStandard());
  for (let i = 0; i < n / 10; i++) ok200(await postQg(sc, joueur, { sujet, n }));
  return sc;
}
const creerSalon = (joueur, corps) => appel(duelPost, { methode: 'POST', jeton: joueur.jeton, corps });
const scoreSalon = (n, justes = 3, points = 50) => ({ justes, n, points });

test('duel POST : accepte les références qg:<slug>:<k> existantes ; bloc ou question inconnus : 400', async () => {
  toutVoir();
  const a = await creerJoueur('Alice');
  await preparerBlocs(a, 20);
  const ok = await creerSalon(a, { questions: [...refsBloc(1, 0, 4), ...refsBloc(2, 8, 9)], score: scoreSalon(7) });
  ok200(ok);
  assert.deepEqual(JSON.parse(lignes('SELECT questions FROM duels')[0].questions).slice(-1), [{ chapitre: 'qg:la-tour-eiffel:2', index: 9 }]);
  assert.equal(lignes('SELECT * FROM salons').length, 0, 'un duel ordinaire n’a pas de ligne salons');
  for (const questions of [
    [...refsBloc(1, 0, 3), { chapitre: 'qg:la-tour-eiffel:1', index: 10 }],
    [...refsBloc(1, 0, 3), { chapitre: 'qg:la-tour-eiffel:3', index: 0 }],
    [...refsBloc(1, 0, 3), { chapitre: 'qg:autre:1', index: 0 }],
    [...refsBloc(1, 0, 3), { chapitre: 'qg:jour:2026-10-19', index: 0 }],
    [...refsBloc(1, 0, 3), { chapitre: 'qg:tournoi:2026-10-19', index: 0 }],
    [...refsBloc(1, 0, 3), { chapitre: 'qg:la-tour-eiffel:1:2', index: 0 }],
  ]) {
    const r = await creerSalon(a, { questions, score: scoreSalon(5) });
    assert.equal(r.statut, 400, JSON.stringify(questions.at(-1)));
  }
  assert.equal(lignes('SELECT * FROM duels').length, 1);
});

test('duel POST : salon (titre, 5 à 50 questions, score facultatif, fin) ; type, titre ou fin invalides : 400 ; anciens duels intacts', async () => {
  toutVoir();
  const a = await creerJoueur('Alice');
  await preparerBlocs(a, 50);
  const cinquante = [1, 2, 3, 4, 5].flatMap((k) => refsBloc(k));
  // Salon de 50 questions créé avant d'être joué : aucun score, le lien suffit.
  const r = await creerSalon(a, { questions: cinquante, type: 'salon', titre: '  La tour   Eiffel ' });
  ok200(r);
  const [ligne] = lignes('SELECT * FROM salons');
  assert.deepEqual({ ...ligne, cree: typeof ligne.cree }, { id: r.corps.id, titre: 'La tour Eiffel', type: 'salon', fin: null, cree: 'string' });
  assert.equal(lignes('SELECT scores FROM duels')[0].scores, '[]');
  let d = (await appel(duelGet, { requete: '?id=' + r.corps.id })).corps.duel;
  assert.deepEqual([d.titre, d.type, d.fin, d.termine, d.joueurs, d.dejaJoue, d.createur, d.questions.length], ['La tour Eiffel', 'salon', null, false, 0, false, 'Alice', 50]);
  assert.deepEqual(d.classement, []);
  // Un duel ordinaire reste limité à 20 questions et exige son score.
  assert.equal((await creerSalon(a, { questions: cinquante.slice(0, 21), score: scoreSalon(21) })).statut, 400);
  assert.equal((await creerSalon(a, { questions: cinquante.slice(0, 20) })).statut, 400, 'score obligatoire pour un duel');
  assert.equal((await creerSalon(a, { questions: cinquante.slice(0, 20), score: scoreSalon(20) })).statut, 200);
  assert.equal((await creerSalon(a, { questions: cinquante.concat(refsBloc(1, 0, 0)), type: 'salon' })).statut, 400, '51 questions');
  assert.equal((await creerSalon(a, { questions: cinquante.slice(0, 4), type: 'salon' })).statut, 400, '4 questions');
  assert.equal((await creerSalon(a, { questions: cinquante.slice(0, 21), type: 'salon', score: scoreSalon(20) })).statut, 400, 'score à la taille du salon');
  // Un salon qui porte aussi son score (créé après avoir joué) : le créateur est au classement.
  const avecScore = await creerSalon(a, { questions: cinquante.slice(0, 30), type: 'salon', titre: 'Avec score', score: scoreSalon(30, 20, 200) });
  ok200(avecScore);
  d = (await appel(duelGet, { requete: '?id=' + avecScore.corps.id, jeton: a.jeton })).corps.duel;
  assert.deepEqual([d.joueurs, d.dejaJoue, d.classement[0].pseudo, d.classement[0].moi], [1, true, 'Alice', true]);
  // Titre, type, fin invalides.
  const q = cinquante.slice(0, 10);
  for (const extra of [{ type: 'tournoi' }, { type: 'Salon' }, { type: 3 }, { titre: 'x'.repeat(61) }, { titre: '' }, { titre: 5 }, { titre: '   ' },
    { fin: 'demain' }, { fin: 5 }, { fin: '2020-01-01T00:00:00Z' }, { fin: new Date(Date.now() + 40 * 86400000).toISOString() }]) {
    const rep = await creerSalon(a, { questions: q, type: 'salon', ...extra });
    assert.equal(rep.statut, 400, JSON.stringify(extra));
  }
  assert.equal((await creerSalon(a, { questions: q, type: 'salon', titre: 'x'.repeat(60) })).statut, 200);
  // Fin : un salon peut avoir une fin proche ; la date est gardée en ISO.
  const fin = new Date(Date.now() + 3 * 86400000);
  const avecFin = await creerSalon(a, { questions: q, type: 'salon', fin: fin.toISOString() });
  ok200(avecFin);
  assert.equal(lignes('SELECT fin FROM salons WHERE id = ?', avecFin.corps.id)[0].fin, fin.toISOString());
  // Les anciens duels (sans ligne salons) se lisent comme avant.
  const vieux = 'vieux123';
  db.base.prepare('INSERT INTO duels (id, createur, questions, scores, cree) VALUES (?, ?, ?, ?, ?)')
    .run(vieux, a.id, JSON.stringify(cinquante.slice(0, 5)), JSON.stringify([{ joueur: a.id, pseudo: 'Alice', justes: 2, n: 5, points: 20, date: '2026-10-01T10:00:00.000Z' }]), '2026-10-01T10:00:00.000Z');
  const v = (await appel(duelGet, { requete: '?id=' + vieux })).corps.duel;
  assert.deepEqual([v.titre, v.type, v.fin, v.termine, v.joueurs, v.createur], [null, 'duel', null, false, 1, 'Alice']);
  ok200(await appel(duelPut, { methode: 'PUT', jeton: a.jeton, corps: { id: vieux, score: { justes: 4, n: 5, points: 60 } } }));
});

test('duel : un salon accueille des joueurs sans limite, classement trié par points avec rang, PUT remplace ; après la fin : 409', async () => {
  toutVoir();
  const a = await creerJoueur('Alice');
  await preparerBlocs(a, 10);
  const { corps: { id } } = await creerSalon(a, { questions: refsBloc(1), type: 'salon', titre: 'Les copains' });
  const joueurs = [];
  for (let i = 0; i < 30; i++) joueurs.push(await creerJoueur('Joueur ' + i));
  for (const [i, jr] of joueurs.entries()) {
    ok200(await appel(duelPut, { methode: 'PUT', jeton: jr.jeton, corps: { id, score: { justes: i % 11, n: 10, points: i % 11 * 5 } } }));
  }
  const g = (await appel(duelGet, { requete: '?id=' + id, jeton: joueurs[9].jeton })).corps.duel;
  assert.equal(g.joueurs, 30);
  assert.equal(g.classement.length, 30);
  assert.equal(g.scores.length, 30);
  const points = g.classement.map((x) => x.points);
  assert.deepEqual(points, [...points].sort((x, y) => y - x));
  assert.deepEqual(g.classement.map((x) => x.rang), nombres(1, 30));
  assert.equal(g.classement.filter((x) => x.moi).length, 1);
  assert.equal(g.classement.find((x) => x.moi).pseudo, 'Joueur 9');
  assert.ok(!JSON.stringify(g).includes(joueurs[9].id));
  // Rejouer remplace le score d'un salon.
  ok200(await appel(duelPut, { methode: 'PUT', jeton: joueurs[0].jeton, corps: { id, score: { justes: 10, n: 10, points: 100 } } }));
  const apres = (await appel(duelGet, { requete: '?id=' + id })).corps.duel;
  assert.deepEqual([apres.joueurs, apres.classement[0].pseudo, apres.classement[0].points], [30, 'Joueur 0', 100]);
  // La fin passe : les scores ne changent plus, le classement reste visible.
  db.base.prepare('UPDATE salons SET fin = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), id);
  erreurFr(await appel(duelPut, { methode: 'PUT', jeton: joueurs[0].jeton, corps: { id, score: { justes: 0, n: 10, points: 0 } } }), 409, /terminé/);
  erreurFr(await appel(duelPut, { methode: 'PUT', jeton: a.jeton, corps: { id, score: { justes: 5, n: 10, points: 5 } } }), 409);
  const fini = (await appel(duelGet, { requete: '?id=' + id })).corps.duel;
  assert.equal(fini.termine, true);
  assert.equal(fini.classement.length, 30);
  assert.equal(fini.classement[0].points, 100);
});

test('duels GET : les salons que j’ai créés (même sans score) ou rejoints, avec titre et type ; les anciens duels gardent leur forme', async () => {
  toutVoir();
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  await preparerBlocs(a, 10);
  const duel = await creerSalon(a, { questions: refsBloc(1, 0, 4), score: scoreSalon(5) });
  const salon = await creerSalon(b, { questions: refsBloc(1), type: 'salon', titre: 'Salon de Bob' });
  const liste = async (jr) => (await appel(duelsGet, { jeton: jr.jeton })).corps.duels;
  assert.deepEqual((await liste(a)).map((d) => d.id), [duel.corps.id]);
  assert.deepEqual(Object.keys((await liste(a))[0]), ['id', 'createur', 'scores', 'cree']);
  assert.deepEqual((await liste(b)).map((d) => [d.id, d.titre, d.type, d.fin, d.scores.length]), [[salon.corps.id, 'Salon de Bob', 'salon', null, 0]]);
  ok200(await appel(duelPut, { methode: 'PUT', jeton: a.jeton, corps: { id: salon.corps.id, score: scoreSalon(10, 6, 60) } }));
  assert.deepEqual((await liste(a)).map((d) => d.id).sort(), [duel.corps.id, salon.corps.id].sort());
  assert.ok(!JSON.stringify(await liste(a)).includes(b.id));
});

// --- GET /api/tournoi ---

test('tournoi GET : créé à la première requête de la semaine (10 questions sur le thème de la semaine), puis partagé ; public', async () => {
  toutVoir();
  const lundi = lundiDe(jourUtc());
  const theme = themeDeLaSemaine(lundi);
  pageDeTheme(theme);
  const sc = scenario(partiesStandard());
  const r = await appel(tournoiGet, { env: envDe(sc) });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['tournoi']);
  const t = r.corps.tournoi;
  assert.deepEqual(Object.keys(t), ['id', 'titre', 'theme', 'debut', 'fin', 'termine', 'questions', 'joueurs', 'classement', 'moi', 'dejaJoue']);
  assert.match(t.id, /^[a-z0-9]{8}$/);
  assert.equal(t.theme, theme);
  assert.equal(t.titre, `Tournoi : ${theme}`.slice(0, 60));
  assert.equal(t.debut, lundi + 'T00:00:00.000Z');
  assert.equal(t.fin, finDeSemaine(lundi));
  assert.match(t.fin, /T23:59:59\.999Z$/);
  assert.equal(new Date(t.fin).getUTCDay(), 0, 'un dimanche');
  assert.deepEqual([t.termine, t.questions, t.joueurs, t.classement, t.moi, t.dejaJoue], [false, 10, 0, [], null, false]);
  assert.deepEqual(sc.appels.map((a) => a.etape), ['quiz', 'verif']);
  assert.match(sc.appels[0].entree.messages[1].content, new RegExp(`Parcours : « ${theme} »`));
  // Un duel de type tournoi, ses 10 questions en cache sous tournoi:<lundi>.
  const [duelLigne] = lignes('SELECT id, createur, questions, scores FROM duels');
  assert.equal(duelLigne.id, t.id);
  assert.deepEqual(JSON.parse(duelLigne.questions), nombres(0, 9).map((index) => ({ chapitre: `qg:tournoi:${lundi}`, index })));
  assert.deepEqual(lignes('SELECT type, fin FROM salons'), [{ type: 'tournoi', fin: t.fin }]);
  assert.deepEqual(lignes('SELECT id, sujet FROM quiz_general'), [{ id: 'tournoi:' + lundi, sujet: theme }]);
  const qs = (await appel(quizGeneralGet, { requete: '?bloc=tournoi:' + lundi })).corps.questions;
  assert.equal(qs.length, 10);
  assert.equal(qs[0].palier, `qg:tournoi:${lundi}`);
  // Deuxième requête, sans IA : le même tournoi.
  const encore = await appel(tournoiGet, { env: { DB: db, AI: undefined } });
  assert.deepEqual(encore.corps, r.corps);
  assert.equal(lignes('SELECT * FROM duels').length, 1);
  // Le duel se lit comme un salon : titre koios, type tournoi.
  const d = (await appel(duelGet, { requete: '?id=' + t.id })).corps.duel;
  assert.deepEqual([d.type, d.createur, d.titre, d.fin, d.questions.length], ['tournoi', 'Koîos', t.titre, t.fin, 10]);
});

test('tournoi : classement limité à soi et ses amis (rangs réels), ma place, une seule partie par joueur, plus de score après la fin', async () => {
  toutVoir();
  const lundi = lundiDe(jourUtc());
  pageDeTheme(themeDeLaSemaine(lundi));
  const sc = scenario(partiesStandard());
  const { corps: { tournoi: t } } = await appel(tournoiGet, { env: envDe(sc) });
  const joueurs = [];
  for (let i = 0; i < 14; i++) joueurs.push(await creerJoueur('Joueur ' + i));
  for (const [i, jr] of joueurs.entries()) {
    ok200(await appel(duelPut, { methode: 'PUT', jeton: jr.jeton, corps: { id: t.id, score: { justes: i % 10, n: 10, points: i * 3 } } }));
  }
  // Anonyme : le nombre de joueurs, mais aucun pseudo.
  const vu = (await appel(tournoiGet, { env: { DB: db, AI: undefined } })).corps.tournoi;
  assert.equal(vu.joueurs, 14);
  assert.deepEqual(vu.classement, []);
  assert.deepEqual([vu.moi, vu.dejaJoue], [null, false]);
  assert.ok(!JSON.stringify(vu).includes(joueurs[0].id));
  // Un joueur sans ami ne voit que lui, à son vrai rang (hors des 10 premiers ou dedans).
  const hors = (await appel(tournoiGet, { env: { DB: db, AI: undefined }, jeton: joueurs[1].jeton })).corps.tournoi;
  assert.deepEqual(hors.moi, { rang: 13, pseudo: 'Joueur 1', justes: 1, n: 10, points: 3 });
  assert.equal(hors.dejaJoue, true);
  assert.deepEqual(hors.classement.map((x) => [x.rang, x.pseudo, x.moi === true]), [[13, 'Joueur 1', true]], 'seulement moi, à mon rang réel');
  const dedans = (await appel(tournoiGet, { env: { DB: db, AI: undefined }, jeton: joueurs[10].jeton })).corps.tournoi;
  assert.equal(dedans.moi.rang, 4);
  assert.deepEqual(dedans.classement.map((x) => [x.rang, x.pseudo, x.moi === true]), [[4, 'Joueur 10', true]]);
  // Avec deux amis (les rangs 1 et 2) : eux, puis moi à mon rang réel ; les autres restent cachés.
  for (const ami of [joueurs[13], joueurs[12]]) db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', '2026-10-20T08:00:00Z')").run(joueurs[10].id, ami.id);
  const avecAmis = (await appel(tournoiGet, { env: { DB: db, AI: undefined }, jeton: joueurs[10].jeton })).corps.tournoi;
  assert.deepEqual(avecAmis.classement.map((x) => [x.rang, x.pseudo]), [[1, 'Joueur 13'], [2, 'Joueur 12'], [4, 'Joueur 10']]);
  assert.equal(avecAmis.joueurs, 14);
  assert.ok(!JSON.stringify(avecAmis).includes('Joueur 11'));
  // L'amitié est dans les deux sens : l'ami me voit aussi.
  const reciproque = (await appel(tournoiGet, { env: { DB: db, AI: undefined }, jeton: joueurs[13].jeton })).corps.tournoi;
  assert.deepEqual(reciproque.classement.map((x) => x.pseudo), ['Joueur 13', 'Joueur 10']);
  // Une seule partie par joueur.
  erreurFr(await appel(duelPut, { methode: 'PUT', jeton: joueurs[0].jeton, corps: { id: t.id, score: { justes: 10, n: 10, points: 999 } } }), 409, /déjà joué/);
  // Après la fin (dimanche 23:59) : plus de nouveau score, le classement reste visible.
  db.base.prepare('UPDATE salons SET fin = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), t.id);
  const nouveau = await creerJoueur('Retardataire');
  erreurFr(await appel(duelPut, { methode: 'PUT', jeton: nouveau.jeton, corps: { id: t.id, score: { justes: 10, n: 10, points: 999 } } }), 409, /tournoi est terminé/);
  const fini = (await appel(tournoiGet, { env: { DB: db, AI: undefined } })).corps.tournoi;
  assert.equal(fini.termine, true);
  assert.equal(fini.joueurs, 14);
  assert.equal(fini.classement.length, 0, 'anonyme : aucun pseudo');
  const g = (await appel(duelGet, { requete: '?id=' + t.id })).corps.duel;
  assert.equal(g.termine, true);
  assert.deepEqual([g.classement.length, g.scores.length, g.joueurs], [0, 0, 14]);
  // La route duel applique la même règle que la route tournoi.
  const gAmis = (await appel(duelGet, { requete: '?id=' + t.id, jeton: joueurs[10].jeton })).corps.duel;
  assert.deepEqual(gAmis.classement.map((x) => [x.rang, x.pseudo]), [[1, 'Joueur 13'], [2, 'Joueur 12'], [4, 'Joueur 10']]);
  assert.deepEqual(gAmis.scores.map((x) => x.pseudo), ['Joueur 10', 'Joueur 13', 'Joueur 12'].sort((x, y) => gAmis.scores.map((z) => z.pseudo).indexOf(x) - gAmis.scores.map((z) => z.pseudo).indexOf(y)));
  assert.equal(gAmis.dejaJoue, true);
  // Mes duels : un tournoi y montre aussi seulement moi et mes amis.
  const mes = (await appel(duelsGet, { jeton: joueurs[10].jeton })).corps.duels.find((x) => x.id === t.id);
  assert.deepEqual(mes.scores.map((x) => x.pseudo).sort(), ['Joueur 10', 'Joueur 12', 'Joueur 13']);
  // On ne crée pas de tournoi par POST /api/duel.
  const a = joueurs[0];
  assert.equal((await appel(duelPost, { methode: 'POST', jeton: a.jeton, corps: { questions: nombres(0, 9).map((index) => ({ chapitre: `qg:tournoi:${lundi}`, index })), type: 'tournoi', score: { justes: 1, n: 10, points: 1 } } })).statut, 400);
});

test('tournoi GET : échec d’écriture ou plafond global de 5 tentatives par jour : {tournoi: null}, jamais d’erreur ; sans IA, idem', async () => {
  toutVoir();
  pageDeTheme(themeDeLaSemaine(lundiDe(jourUtc())));
  const court = { questions: quizBrut().questions.slice(0, 4) };
  const sc = scenario({ ...partiesStandard(), quiz: [court] });
  const echec = async () => {
    const r = await appel(tournoiGet, { env: envDe(sc) });
    ok200(r);
    assert.deepEqual(r.corps, { tournoi: null });
  };
  await echec();
  const parTentative = sc.appels.length;
  for (let i = 0; i < 4; i++) await echec();
  assert.equal(sc.appels.length, parTentative * 5);
  await echec();
  assert.equal(sc.appels.length, parTentative * 5, 'plafond atteint : plus aucun appel');
  assert.deepEqual(lignes("SELECT n FROM quotas WHERE cle = 'tournoi:tentatives'").length, 1);
  assert.equal(lignes('SELECT * FROM duels').length, 0);
  toutVoir();
  assert.deepEqual((await appel(tournoiGet, { env: { DB: db, AI: undefined } })).corps, { tournoi: null });
});

test('worker : /api/quiz-general, /api/jour et /api/tournoi sont routés ; méthodes absentes 405', async () => {
  toutVoir();
  const ctx = { waitUntil() {} };
  const assets = { fetch: async () => new Response('non', { status: 404 }) };
  const e = { DB: db, AI: undefined, ASSETS: assets };
  const via = async (chemin, init) => {
    const r = await worker.fetch(new Request('https://koios.test' + chemin, init), e, ctx);
    const texte = await r.text();
    let corps;
    try { corps = JSON.parse(texte); } catch { corps = texte; }
    return { statut: r.status, corps };
  };
  assert.deepEqual(await via('/api/quiz-general', { method: 'POST', body: '{}' }), { statut: 401, corps: { erreur: 'Connexion requise.' } });
  assert.equal((await via('/api/quiz-general?bloc=zz:1')).statut, 404);
  assert.equal((await via('/api/quiz-general', { method: 'DELETE' })).statut, 405);
  const jour = await via('/api/jour');
  assert.deepEqual([jour.statut, jour.corps.repli, jour.corps.question], [200, true, null]);
  assert.deepEqual(await via('/api/tournoi'), { statut: 200, corps: { tournoi: null } });
  assert.equal((await via('/api/jour', { method: 'POST', body: '{}' })).statut, 405);
  assert.equal((await via('/api/tournoi', { method: 'PUT', body: '{}' })).statut, 405);
  assert.equal((await via('/api/quiz_general')).statut, 404);
});

// --- Worker : routes v2 ---

test('worker v2 : /api/parcours, palier, quiz, quiz-direct et glossaire sont routés (tiret accepté) ; méthodes absentes 405', async () => {
  toutVoir();
  const ctx = { waitUntil() {} };
  const assets = { fetch: async (requete) => new Response('fichier ' + new URL(requete.url).pathname, { status: 200 }) };
  const e = { DB: db, AI: undefined, ASSETS: assets };
  const via = async (chemin, init) => {
    const r = await worker.fetch(new Request('https://koios.test' + chemin, init), e, ctx);
    const texte = await r.text();
    let corps;
    try { corps = JSON.parse(texte); } catch { corps = texte; }
    return { statut: r.status, corps };
  };
  assert.deepEqual(await via('/api/parcours'), { statut: 200, corps: { parcours: [] } });
  assert.deepEqual(await via('/api/parcours?id=zz'), { statut: 404, corps: { erreur: 'Parcours introuvable.' } });
  assert.deepEqual(await via('/api/palier?parcours=zz&n=1'), { statut: 404, corps: { erreur: 'Parcours introuvable.' } });
  assert.deepEqual(await via('/api/palier/?parcours=zz&n=1'), { statut: 404, corps: { erreur: 'Parcours introuvable.' } });
  assert.deepEqual(await via('/api/quiz?parcours=zz'), { statut: 404, corps: { erreur: 'Parcours introuvable.' } });
  assert.deepEqual(await via('/api/glossaire?parcours=zz&jusqua=3'), { statut: 200, corps: { termes: [] } });
  assert.deepEqual(await via('/api/glossaire/?parcours=zz&jusqua=3'), { statut: 200, corps: { termes: [] } });
  assert.equal((await via('/api/glossaire')).statut, 400);
  assert.deepEqual(await via('/api/glossaire', { method: 'POST', body: '{}' }), { statut: 405, corps: { erreur: 'Méthode non permise.' } });
  assert.deepEqual(await via('/api/quiz-direct', { method: 'POST', body: '{}' }), { statut: 401, corps: { erreur: 'Connexion requise.' } });
  assert.deepEqual(await via('/api/quiz-direct'), { statut: 405, corps: { erreur: 'Méthode non permise.' } });
  assert.deepEqual(await via('/api/palier', { method: 'POST', body: '{}' }), { statut: 405, corps: { erreur: 'Méthode non permise.' } });
  assert.deepEqual(await via('/api/parcours', { method: 'DELETE' }), { statut: 405, corps: { erreur: 'Méthode non permise.' } });
  assert.deepEqual(await via('/api/parcours', { method: 'POST', body: '{}' }), { statut: 401, corps: { erreur: 'Connexion requise.' } });
  for (const chemin of ['/api/Quiz-Direct', '/api/quiz_direct', '/api/quiz-direct/x', '/api/paliers']) {
    assert.deepEqual(await via(chemin), { statut: 404, corps: { erreur: 'Adresse inconnue.' } }, chemin);
  }
});

// --- Worker : routage ---

test('worker : le motif de route accepte le tiret ; adresses inconnues 404, méthodes absentes 405, le reste va aux fichiers', async () => {
  toutVoir();
  const ctx = { waitUntil() {} };
  const assets = { fetch: async (requete) => new Response('fichier ' + new URL(requete.url).pathname, { status: 200 }) };
  const e = { DB: db, AI: undefined, ASSETS: assets };
  const via = async (chemin, init) => {
    const r = await worker.fetch(new Request('https://koios.test' + chemin, init), e, ctx);
    const texte = await r.text();
    let corps;
    try { corps = JSON.parse(texte); } catch { corps = texte; }
    return { statut: r.status, corps };
  };
  assert.deepEqual(await via('/api/chapitre-ia?sujet=inconnu&n=1'), { statut: 404, corps: { erreur: 'Sujet introuvable.' } });
  assert.deepEqual(await via('/api/chapitre-ia/?sujet=inconnu&n=1'), { statut: 404, corps: { erreur: 'Sujet introuvable.' } });
  assert.deepEqual(await via('/api/sujets'), { statut: 200, corps: { sujets: [] } });
  assert.deepEqual(await via('/api/sujet?id=zz'), { statut: 404, corps: { erreur: 'Sujet introuvable.' } });
  assert.deepEqual(await via('/api/melange?n=3'), { statut: 200, corps: { questions: [] } });
  assert.deepEqual(await via('/api/duel?id=abcd1234'), { statut: 404, corps: { erreur: 'Duel introuvable.' } });
  assert.deepEqual(await via('/api/duels'), { statut: 401, corps: { erreur: 'Connexion requise.' } });
  assert.equal((await via('/api/sujet', { method: 'POST', body: '{}' })).statut, 401);
  assert.deepEqual(await via('/api/sujets', { method: 'POST', body: '{}' }), { statut: 405, corps: { erreur: 'Méthode non permise.' } });
  assert.deepEqual(await via('/api/duels', { method: 'DELETE' }), { statut: 405, corps: { erreur: 'Méthode non permise.' } });
  for (const chemin of ['/api/inconnue', '/api/constructor', '/api/Chapitre-IA', '/api/chapitre_ia', '/api/sujet/un/deux', '/api/']) {
    assert.deepEqual(await via(chemin), { statut: 404, corps: { erreur: 'Adresse inconnue.' } }, chemin);
  }
  assert.deepEqual(await via('/app.js'), { statut: 200, corps: 'fichier /app.js' });
  assert.deepEqual(await via('/'), { statut: 200, corps: 'fichier /' });
});

// =============================================================================
// Formation à plusieurs (groupes) et jeu en direct (parties)
// =============================================================================

const semerFormation = (id = 'les-phares', titre = 'Les phares') => db.base.prepare(
  'INSERT OR REPLACE INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES (?, ?, ?, ?, 0, ?)',
).run(id, titre, '{}', 'x', 'now');
const postGroupe = (joueur, corps, requete = '', e = env) => appel(groupePost, { env: e, methode: 'POST', jeton: joueur && joueur.jeton, corps, requete });
const getGroupe = (id, joueur) => appel(groupeGet, { requete: '?id=' + id, jeton: joueur && joueur.jeton });
const suivreProgres = async (joueur, parcours, suivi, xp = 0) => ok200(await appel(progressionPut, {
  methode: 'PUT', jeton: joueur.jeton, corps: { pseudo: joueur.pseudo, etat: { version: 2, xp, parcours: { [parcours]: suivi } } },
}));

test('groupe POST : création (connexion, nom 2 à 40, formation existante), le créateur est inscrit', async () => {
  toutVider();
  semerFormation();
  const a = await creerJoueur('Alice');
  erreurFr(await postGroupe(null, { nom: 'Les phares', parcours: 'les-phares' }), 401);
  for (const nom of [undefined, null, '', 'x', '   ', 12, ['a'], 'x'.repeat(41)]) {
    erreurFr(await postGroupe(a, { nom, parcours: 'les-phares' }), 400, /Nom de groupe/);
  }
  for (const parcours of [undefined, null, 5, '', 'Les Phares', 'a b', 'x'.repeat(41), '../etc']) {
    erreurFr(await postGroupe(a, { nom: 'Les phares', parcours }), 400, /Formation attendue/);
  }
  erreurFr(await postGroupe(a, { nom: 'Les phares', parcours: 'inconnue' }), 404, /n’existe pas/);
  erreurFr(await postGroupe(a, { nom: 'Les phares', parcours: 'v-zz' }), 404);
  assert.equal(lignes('SELECT * FROM groupes').length, 0);
  const r = await postGroupe(a, { nom: '  Les   phares  entre amis ', parcours: 'les-phares' });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['id']);
  assert.match(r.corps.id, /^[a-z0-9]{8}$/);
  assert.deepEqual(lignes('SELECT nom, parcours, createur FROM groupes'), [{ nom: 'Les phares entre amis', parcours: 'les-phares', createur: a.id }]);
  assert.deepEqual(lignes('SELECT groupe, joueur FROM groupe_membres'), [{ groupe: r.corps.id, joueur: a.id }]);
  erreurFr(await appel(groupePost, { methode: 'POST', jeton: a.jeton, corps: { id: r.corps.id } }), 400, /Action inconnue/);
  erreurFr(await appel(groupePost, { methode: 'POST', jeton: a.jeton, brut: '{pas du json' }), 400);
});

test('groupe POST : une formation vérifiée du catalogue est acceptée quand le catalogue répond', async () => {
  toutVider();
  const a = await creerJoueur('Alice');
  const catalogue = { parcours: [{ id: 'v-hg', titre: 'Histoire et géographie' }] };
  const avecAssets = { DB: db, AI: undefined, ASSETS: { fetch: async () => new Response(JSON.stringify(catalogue), { status: 200 }) } };
  ok200(await postGroupe(a, { nom: 'Histoire à deux', parcours: 'v-hg' }, '', avecAssets));
  erreurFr(await postGroupe(a, { nom: 'Histoire à deux', parcours: 'v-ab' }, '', avecAssets), 404);
  const casse = { DB: db, AI: undefined, ASSETS: { fetch: async () => new Response('<html>', { status: 200 }) } };
  erreurFr(await postGroupe(a, { nom: 'Histoire à deux', parcours: 'v-hg' }, '', casse), 404);
  erreurFr(await postGroupe(a, { nom: 'Histoire à deux', parcours: 'v-hg' }), 404);
});

test('groupe POST : quota de créations par jour et plafond de groupes suivis', async () => {
  toutVider();
  semerFormation();
  const a = await creerJoueur('Alice');
  for (let i = 0; i < 10; i++) ok200(await postGroupe(a, { nom: 'Groupe ' + i, parcours: 'les-phares' }));
  erreurFr(await postGroupe(a, { nom: 'Groupe de trop', parcours: 'les-phares' }), 429, /Reviens demain/);
  db.base.exec("DELETE FROM quotas");
  for (let i = 10; i < 20; i++) ok200(await postGroupe(a, { nom: 'Groupe ' + i, parcours: 'les-phares' }));
  db.base.exec("DELETE FROM quotas");
  erreurFr(await postGroupe(a, { nom: 'Le vingt et unième', parcours: 'les-phares' }), 409, /20 groupes/);
  const b = await creerJoueur('Bob');
  const id = lignes('SELECT id FROM groupes LIMIT 1')[0].id;
  ok200(await postGroupe(b, { id, rejoindre: true }));
  const liste = await appel(groupeGet, { jeton: a.jeton });
  assert.equal(liste.corps.groupes.length, 20);
});

test('groupe POST : rejoindre (corps ou ?action=), idempotent, plafond de 12, quitter, groupe vide supprimé', async () => {
  toutVider();
  semerFormation();
  const a = await creerJoueur('Alice');
  const id = (await postGroupe(a, { nom: 'Les phares', parcours: 'les-phares' })).corps.id;
  const autres = [];
  for (let i = 0; i < 11; i++) autres.push(await creerJoueur('Joueur' + i));
  // Rejoindre : par le corps et par l'adresse.
  erreurFr(await postGroupe(null, { id, rejoindre: true }), 401);
  erreurFr(await postGroupe(autres[0], { id: 'court', rejoindre: true }), 400, /8 caractères/);
  erreurFr(await postGroupe(autres[0], { id: 'abcdefgh', rejoindre: true }), 404);
  assert.deepEqual((await postGroupe(autres[0], { id, rejoindre: true })).corps, { ok: true, id });
  assert.deepEqual((await postGroupe(autres[1], undefined, `?id=${id}&action=rejoindre`)).corps, { ok: true, id });
  assert.deepEqual((await postGroupe(autres[1], undefined, `?id=${id}&action=rejoindre`)).corps, { ok: true, id, dejaMembre: true });
  assert.equal(lignes('SELECT * FROM groupe_membres').length, 3);
  for (const j of autres.slice(2, 11)) ok200(await postGroupe(j, { id, rejoindre: true }));
  assert.equal(lignes('SELECT * FROM groupe_membres').length, 12);
  // Le 13e est refusé, un membre qui revient est reconnu.
  const treize = await creerJoueur('Treize');
  erreurFr(await postGroupe(treize, { id, rejoindre: true }), 409, /complet : 12 membres/);
  assert.equal((await postGroupe(autres[0], { id, rejoindre: true })).corps.dejaMembre, true);
  let g = (await getGroupe(id)).corps.groupe;
  assert.deepEqual([g.membres, g.complet, g.max], [12, true, 12]);
  // Quitter libère une place.
  ok200(await postGroupe(autres[0], { id, quitter: true }));
  ok200(await postGroupe(autres[0], undefined, `?id=${id}&action=quitter`)); // déjà parti : rien ne casse
  g = (await getGroupe(id)).corps.groupe;
  assert.deepEqual([g.membres, g.complet], [11, false]);
  ok200(await postGroupe(treize, { id, rejoindre: true }));
  erreurFr(await postGroupe(autres[0], { id, rejoindre: true }), 409, /complet/);
  erreurFr(await postGroupe(treize, { id: 'abcdefgh', quitter: true }), 404);
  // Le dernier qui part éteint le groupe.
  for (const j of [a, ...autres.slice(1), treize]) ok200(await postGroupe(j, { id, quitter: true }));
  assert.equal(lignes('SELECT * FROM groupes').length, 0);
  assert.equal(lignes('SELECT * FROM groupe_membres').length, 0);
  erreurFr(await getGroupe(id), 404);
});

test('groupe GET : lecture publique, progression du groupe, rangs, aucun identifiant ni clé qui fuit', async () => {
  toutVider();
  semerFormation();
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const c = await creerJoueur('Camille');
  const id = (await postGroupe(a, { nom: 'Les phares', parcours: 'les-phares' })).corps.id;
  ok200(await postGroupe(b, { id, rejoindre: true }));
  ok200(await postGroupe(c, { id, rejoindre: true }));
  // Avant tout envoi de progression : trois membres à zéro, à égalité.
  let g = (await getGroupe(id)).corps.groupe;
  assert.deepEqual(g.classement.map((m) => [m.rang, m.pseudo, m.lecons, m.xp, m.activite]), [[1, 'Alice', 0, 0, null], [1, 'Bob', 0, 0, null], [1, 'Camille', 0, 0, null]]);
  // L'envoi existant de la progression suffit : le groupe lit joueurs.etat.
  await suivreProgres(a, 'les-phares', { titre: 'Les phares', fait: 4, xp: 120, date: '2026-10-19T10:00:00.000Z' }, 300);
  await suivreProgres(b, 'les-phares', { fait: [1, 2, 3, 3, 9999, 'x'], xp: 80 }, 80);
  await suivreProgres(c, 'autre-formation', { fait: 12, xp: 500 }, 500); // une autre formation ne compte pas ici
  const r = await getGroupe(id, b);
  ok200(r);
  g = r.corps.groupe;
  assert.deepEqual(Object.keys(g), ['id', 'nom', 'parcours', 'parcoursTitre', 'createur', 'max', 'complet', 'dejaMembre', 'membres', 'classement']);
  assert.deepEqual([g.nom, g.parcours, g.parcoursTitre, g.createur, g.dejaMembre, g.membres], ['Les phares', 'les-phares', 'Les phares', 'Alice', true, 3]);
  assert.deepEqual(g.classement, [
    { rang: 1, pseudo: 'Alice', lecons: 4, xp: 120, activite: '2026-10-19T10:00:00.000Z' },
    { rang: 2, pseudo: 'Bob', lecons: 3, xp: 80, activite: null, moi: true },
    { rang: 3, pseudo: 'Camille', lecons: 0, xp: 0, activite: null },
  ]);
  // Public : sans connexion, mêmes membres, pas de « moi », dejaMembre faux.
  const publique = await getGroupe(id);
  assert.equal(publique.corps.groupe.dejaMembre, false);
  assert.ok(publique.corps.groupe.classement.every((m) => !('moi' in m)));
  // Aucune fuite : ni identifiant de joueur, ni clé, ni hash dans la réponse.
  const tout = JSON.stringify([r.corps, publique.corps]);
  for (const j of [a, b, c]) {
    assert.ok(!tout.includes(j.id), 'identifiant de joueur');
    assert.ok(!tout.includes(j.cle), 'clé');
  }
  for (const h of lignes('SELECT cle_hash FROM joueurs')) assert.ok(!tout.includes(h.cle_hash));
  assert.ok(!/"(id|joueur|createur_id|jid)":"[a-z0-9]{12}"/.test(tout));
  erreurFr(await getGroupe('nimportequoi'), 400, /8 caractères/);
  erreurFr(await getGroupe('abcdefgh'), 404);
  // Égalité parfaite : même rang ; départage par les leçons puis l'XP.
  await suivreProgres(c, 'les-phares', { fait: 3, xp: 80 }, 80);
  g = (await getGroupe(id)).corps.groupe;
  assert.deepEqual(g.classement.map((m) => [m.rang, m.pseudo]), [[1, 'Alice'], [2, 'Bob'], [2, 'Camille']]);
  await suivreProgres(c, 'les-phares', { fait: 3, xp: 90 }, 90);
  assert.deepEqual((await getGroupe(id)).corps.groupe.classement.map((m) => [m.rang, m.pseudo]), [[1, 'Alice'], [2, 'Camille'], [3, 'Bob']]);
});

test('groupe : un état illisible ou hostile ne casse pas le classement, et tout est borné', async () => {
  toutVider();
  semerFormation();
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const id = (await postGroupe(a, { nom: 'Les phares', parcours: 'les-phares' })).corps.id;
  ok200(await postGroupe(b, { id, rejoindre: true }));
  db.base.prepare('UPDATE joueurs SET etat = ? WHERE id = ?').run('{pas du json', a.id);
  await suivreProgres(b, 'les-phares', { fait: 99999, xp: 1e12, date: 'jamais' });
  const g = (await getGroupe(id)).corps.groupe;
  assert.deepEqual(g.classement.map((m) => [m.pseudo, m.lecons, m.xp, m.activite]), [['Bob', 1500, 1000000, null], ['Alice', 0, 0, null]]);
  assert.deepEqual(lireSuivi('{"fait":"x","xp":-4,"date":5}'), { lecons: 0, xp: 0, activite: null });
  assert.deepEqual(lireSuivi(null), { lecons: 0, xp: 0, activite: null });
  assert.deepEqual(lireSuivi('[1]'), { lecons: 0, xp: 0, activite: null });
  assert.deepEqual(classerMembres([]), []);
});

test('groupe GET sans id : mes groupes (connexion), du plus récent au plus ancien', async () => {
  toutVider();
  semerFormation();
  semerFormation('les-volcans', 'Les volcans');
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  erreurFr(await appel(groupeGet, {}), 401);
  const g1 = (await postGroupe(a, { nom: 'Phares', parcours: 'les-phares' })).corps.id;
  const g2 = (await postGroupe(a, { nom: 'Volcans', parcours: 'les-volcans' })).corps.id;
  db.base.prepare('UPDATE groupe_membres SET rejoint = ? WHERE groupe = ?').run('2000-01-01T00:00:00.000Z', g1);
  ok200(await postGroupe(b, { id: g2, rejoindre: true }));
  const r = await appel(groupeGet, { jeton: a.jeton });
  assert.deepEqual(r.corps.groupes, [{ id: g2, nom: 'Volcans', parcours: 'les-volcans', membres: 2 }, { id: g1, nom: 'Phares', parcours: 'les-phares', membres: 1 }]);
  assert.deepEqual((await appel(groupeGet, { jeton: b.jeton })).corps.groupes.map((g) => g.id), [g2]);
  assert.ok(!JSON.stringify(r.corps).includes(a.id));
});

// --- Jeu en direct ---

let heure = Date.UTC(2026, 9, 19, 12, 0, 0);
const envP = { DB: db, AI: undefined, maintenant: () => heure };
const qcmP = (i) => ({ type: 'qcm', enonce: `Question ${i} ?`, reponses: [`A${i}`, `B${i}`, `C${i}`, `D${i}`], bonne: i % 4, explication: `Explication secrète ${i}.` });
const vfP = (i) => ({ type: 'vraifaux', affirmation: `Affirmation ${i}.`, vrai: i % 2 === 0, explication: `Explication vrai ou faux ${i}.` });
// Bloc de 10 questions : 0 à 6 à choix (bonne = i % 4), 7 à 9 vrai ou faux (vrai si i pair, donc 8).
function semerBlocP(id, extra = {}) {
  const questions = [...nombres(0, 6).map(qcmP), ...nombres(7, 9).map(vfP)];
  db.base.prepare('INSERT OR REPLACE INTO quiz_general (id, sujet, bloc, contenu, cree) VALUES (?, ?, ?, ?, ?)')
    .run(id, 'Sujet test', 1, JSON.stringify({ questions: extra.questions || questions, sources: [], verification: {} }), 'now');
}
const refsP = (n = 6, bloc = 'sujet-test:1') => nombres(0, n - 1).map((index) => ({ chapitre: `qg:${bloc}`, index }));
const postPartie = (joueur, corps) => appel(partiePost, { env: envP, methode: 'POST', jeton: joueur && joueur.jeton, corps });
const getPartie = async (id, joueur) => {
  const r = await appel(partieGet, { env: envP, requete: '?id=' + id, jeton: joueur && joueur.jeton });
  ok200(r);
  return r.corps.partie;
};
async function nouvellePartie(createur, n = 6, titre = 'Partie test') {
  const r = await postPartie(createur, { action: 'creer', questions: refsP(n), titre });
  ok200(r);
  return r.corps.id;
}
const reponse = (id, indice, choix) => ({ action: 'repondre', id, indice, choix });

test('partie : code de 6 caractères sans O, 0, I, 1 ; saisie tolérante', async () => {
  for (let i = 0; i < 300; i++) assert.match(codePartie(), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(new Set(Array.from({ length: 200 }, codePartie)).size > 190, true);
  assert.equal(lireCode(' ab c2de '), 'ABC2DE');
  for (const mauvais of ['ABCDE', 'ABCDEFG', 'ABCDE0', 'ABCDEO', 'ABCDEI', 'ABCDE1', 'ABCDÉF', 12, null, undefined, '']) assert.equal(lireCode(mauvais), null, String(mauvais));
});

test('partie : points = 100 + bonus de rapidité linéaire sur 20 s (50 au plus), 0 si faux ; le SQL calcule la même chose', async () => {
  assert.deepEqual([0, 5000, 10000, 15000, 19999, 20000, 99999, -50].map((ms) => pointsReponse(true, ms)), [150, 138, 125, 113, 100, 100, 100, 150]);
  assert.equal(pointsReponse(false, 0), 0);
  for (const ms of [0, 1, 199, 200, 201, 5000, 7777, 10000, 19800, 19999, 20000]) {
    const sql = db.base.prepare(`SELECT ${SQL_POINTS} AS p FROM (SELECT 1 AS juste, ${ms} AS ms) r`).get().p;
    assert.equal(sql, pointsReponse(true, ms), 'ms = ' + ms);
  }
  assert.equal(db.base.prepare(`SELECT ${SQL_POINTS} AS p FROM (SELECT 0 AS juste, 0 AS ms) r`).get().p, 0);
});

test('partie : avancer() est une fonction de l’heure (question 20 s, résultat 5 s, puis la suivante, puis la fin)', async () => {
  const p = { etat: 'question', indice: 0, debut_question: 1000 };
  const a = (t, base = p) => { const v = avancer(base, 3, t); return [v.etat, v.indice, v.ecoule]; };
  assert.deepEqual(a(1000), ['question', 0, 0]);
  assert.deepEqual(a(20999), ['question', 0, 19999]);
  assert.deepEqual(a(21000), ['resultat', 0, 20000]);
  assert.deepEqual(a(25999), ['resultat', 0, 24999]);
  assert.deepEqual(a(26000), ['question', 1, 0]);
  assert.deepEqual(a(1000 + 2 * CYCLE + 5), ['question', 2, 5]);
  assert.equal(avancer(p, 3, 1000 + 3 * CYCLE).etat, 'fini');
  assert.equal(avancer(p, 3, 1000 + 99 * CYCLE).etat, 'fini');
  assert.deepEqual(a(500), ['question', 0, 0], 'une heure en retard ne recule pas');
  assert.equal(avancer({ etat: 'attente', indice: 0, debut_question: 0 }, 3, 99999999).etat, 'attente');
  assert.equal(avancer({ etat: 'fini', indice: 2, debut_question: 5 }, 3, 99999999).etat, 'fini');
});

test('partie POST creer : connexion, 5 à 20 références jouables, titre, quota ; id = code', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  erreurFr(await postPartie(null, { action: 'creer', questions: refsP() }), 401);
  erreurFr(await postPartie(a, { action: 'inconnue' }), 400, /Action inconnue/);
  erreurFr(await postPartie(a, { questions: refsP() }), 400, /Action inconnue/);
  for (const questions of [undefined, [], refsP(4), refsP(10).concat(refsP(10, 'sujet-test:1')).concat(refsP(1)), 'x', [{ chapitre: 'qg:sujet-test:1', index: 99 }, ...refsP(5)]]) {
    erreurFr(await postPartie(a, { action: 'creer', questions }), 400);
  }
  erreurFr(await postPartie(a, { action: 'creer', questions: refsP(5, 'inconnu:1') }), 400, /Question inconnue/);
  // Les chapitres vérifiés et IA ne sont pas jouables en direct.
  erreurFr(await postPartie(a, { action: 'creer', questions: [...refsP(4), { chapitre: 'hg-01', index: 0 }] }), 400, /formation, de quiz ou de tournoi/);
  for (const titre of ['', '   ', 5, 'x'.repeat(61)]) erreurFr(await postPartie(a, { action: 'creer', questions: refsP(), titre }), 400, /Titre/);
  assert.equal(lignes('SELECT * FROM parties').length, 0);
  const r = await postPartie(a, { action: 'creer', questions: refsP(6), titre: '  Culture   générale ' });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['id', 'code']);
  assert.equal(r.corps.id, r.corps.code);
  assert.match(r.corps.id, /^[A-HJ-NP-Z2-9]{6}$/);
  const [ligne] = lignes('SELECT * FROM parties');
  assert.deepEqual([ligne.id, ligne.createur, ligne.titre, ligne.etat, ligne.indice, ligne.debut_question], [r.corps.id, a.id, 'Culture générale', 'attente', 0, 0]);
  assert.deepEqual(JSON.parse(ligne.questions), refsP(6));
  assert.deepEqual(lignes('SELECT partie, joueur, points FROM parties_joueurs'), [{ partie: r.corps.id, joueur: a.id, points: 0 }]);
  const sans = await postPartie(a, { action: 'creer', questions: refsP(5) });
  ok200(sans);
  assert.equal((await getPartie(sans.corps.id)).titre, 'Partie en direct');
  assert.equal(lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'partie:%'")[0].n, 2);
});

test('partie POST creer : palier, quiz direct et tournoi acceptés ; question d’un autre type refusée', async () => {
  toutVider();
  const a = await creerJoueur('Alice');
  const lecon = { questions: [qcmP(0), qcmP(1), vfP(2), qcmP(3)] };
  db.base.prepare('INSERT INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES (?, ?, ?, ?, 0, ?)').run('les-phares:1', 'les-phares', 1, JSON.stringify(lecon), 'now');
  db.base.prepare('INSERT INTO quiz_direct (parcours, contenu, cree) VALUES (?, ?, ?)').run('les-phares', JSON.stringify({ questions: nombres(0, 9).map(qcmP) }), 'now');
  semerBlocP('tournoi:2026-10-19');
  const refs = [
    { chapitre: 'les-phares:1', index: 0 }, { chapitre: 'les-phares:1', index: 2 },
    { chapitre: 'les-phares:quiz', index: 9 }, { chapitre: 'qg:tournoi:2026-10-19', index: 8 }, { chapitre: 'qg:tournoi:2026-10-19', index: 3 },
  ];
  const r = await postPartie(a, { action: 'creer', questions: refs });
  ok200(r);
  const id = r.corps.id;
  const b = await creerJoueur('Bob');
  ok200(await postPartie(b, { action: 'rejoindre', id }));
  ok200(await postPartie(a, { action: 'demarrer', id }));
  const types = [];
  for (let i = 0; i < 5; i++) {
    types.push((await getPartie(id, b)).question.type);
    heure += CYCLE;
  }
  assert.deepEqual(types, ['qcm', 'vraifaux', 'qcm', 'vraifaux', 'qcm']);
  // Une question « ordre » (mini-jeu) ne se joue pas en direct.
  semerBlocP('sujet-test:2', { questions: [...nombres(0, 8).map(qcmP), { type: 'ordre', enonce: 'Range', elements: ['a', 'b'], ordre: ['a', 'b'], explication: '' }] });
  erreurFr(await postPartie(a, { action: 'creer', questions: [...refsP(4, 'sujet-test:2'), { chapitre: 'qg:sujet-test:2', index: 9 }] }), 400, /autre type/);
  heure += 3600000;
});

test('partie POST rejoindre : par code (casse libre), idempotent, 12 joueurs au plus, jamais après le début', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const id = await nouvellePartie(a);
  const joueurs = [];
  for (let i = 0; i < 11; i++) joueurs.push(await creerJoueur('Joueur' + i));
  erreurFr(await postPartie(null, { action: 'rejoindre', id }), 401);
  for (const mauvais of [undefined, 'ABC', 'ABCDE0', 42]) erreurFr(await postPartie(joueurs[0], { action: 'rejoindre', id: mauvais }), 400, /Code de partie/);
  erreurFr(await postPartie(joueurs[0], { action: 'rejoindre', id: 'ZZZZZZ' }), 404, /n’existe pas/);
  assert.deepEqual((await postPartie(joueurs[0], { action: 'rejoindre', id: id.toLowerCase() })).corps, { ok: true, id });
  assert.equal((await postPartie(joueurs[0], { action: 'rejoindre', id })).corps.dejaJoueur, true);
  for (const j of joueurs.slice(1)) ok200(await postPartie(j, { action: 'rejoindre', id }));
  assert.equal(lignes('SELECT * FROM parties_joueurs').length, 12);
  const treize = await creerJoueur('Treize');
  erreurFr(await postPartie(treize, { action: 'rejoindre', id }), 409, /complète : 12 joueurs/);
  ok200(await postPartie(a, { action: 'demarrer', id }));
  erreurFr(await postPartie(treize, { action: 'rejoindre', id }), 409, /déjà commencé/);
  assert.equal((await postPartie(joueurs[0], { action: 'rejoindre', id })).corps.dejaJoueur, true, 'un joueur déjà dedans reste accepté');
  // Partie à 3 : un retardataire est refusé même sans plafond.
  const id2 = await nouvellePartie(a);
  ok200(await postPartie(a, { action: 'demarrer', id: id2 }));
  erreurFr(await postPartie(joueurs[1], { action: 'rejoindre', id: id2 }), 409, /déjà commencé/);
  heure += 3600000;
});

test('partie POST demarrer : le créateur seulement, une seule fois ; la question 1 démarre à l’heure du serveur', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const id = await nouvellePartie(a);
  ok200(await postPartie(b, { action: 'rejoindre', id }));
  erreurFr(await postPartie(null, { action: 'demarrer', id }), 401);
  erreurFr(await postPartie(b, { action: 'demarrer', id }), 403, /créateur/);
  const etranger = await creerJoueur('Etranger');
  erreurFr(await postPartie(etranger, { action: 'demarrer', id }), 403);
  erreurFr(await postPartie(a, { action: 'demarrer', id: 'ZZZZZZ' }), 404);
  assert.equal((await getPartie(id)).etat, 'attente');
  assert.equal(lignes('SELECT etat FROM parties')[0].etat, 'attente');
  erreurFr(await postPartie(a, reponse(id, 0, 0)), 409, /pas encore commencé/);
  ok200(await postPartie(a, { action: 'demarrer', id }));
  assert.deepEqual(lignes('SELECT etat, indice, debut_question FROM parties'), [{ etat: 'question', indice: 0, debut_question: heure }]);
  erreurFr(await postPartie(a, { action: 'demarrer', id }), 409, /déjà commencé/);
  heure += 3600000;
});

test('partie GET : la question n’a ni bonne réponse ni explication avant le résultat, et n’est montrée qu’aux joueurs', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const spectateur = await creerJoueur('Spectateur');
  const id = await nouvellePartie(a);
  ok200(await postPartie(b, { action: 'rejoindre', id }));
  // Salle d'attente : pseudos seulement, pas de question.
  let p = await getPartie(id, b);
  assert.deepEqual(Object.keys(p), ['id', 'code', 'titre', 'createur', 'etat', 'indice', 'total', 'restant', 'duree', 'max', 'joueurs', 'moi']);
  assert.deepEqual([p.etat, p.total, p.restant, p.duree, p.max, p.createur, p.titre], ['attente', 6, 0, 20000, 12, 'Alice', 'Partie test']);
  assert.deepEqual(p.joueurs, [{ pseudo: 'Alice', createur: true }, { pseudo: 'Bob', moi: true }]);
  assert.deepEqual(p.moi, { joueur: true, createur: false });
  ok200(await postPartie(a, { action: 'demarrer', id }));
  heure += 4000;
  p = await getPartie(id, b);
  assert.deepEqual([p.etat, p.indice, p.restant], ['question', 0, 16000]);
  assert.deepEqual(p.question, { type: 'qcm', enonce: 'Question 0 ?', reponses: ['A0', 'B0', 'C0', 'D0'] });
  const brut = JSON.stringify(p);
  assert.ok(!/bonne|explication|secrète/i.test(brut), 'aucune trace de la réponse avant le résultat');
  assert.deepEqual(p.joueurs.map((j) => Object.keys(j).sort()), [['createur', 'pseudo', 'repondu'], ['moi', 'pseudo', 'repondu']], 'ni points ni bonnes réponses pendant la question');
  // Hors partie : l'état, pas la question.
  for (const lecteur of [null, spectateur]) {
    const vu = await getPartie(id, lecteur);
    assert.equal(vu.etat, 'question');
    assert.equal('question' in vu, false);
    assert.equal(vu.moi.joueur, false);
  }
  // Après la réponse, toujours pas de réponse correcte avant la fin des 20 s.
  ok200(await postPartie(b, reponse(id, 0, 2)));
  p = await getPartie(id, b);
  assert.deepEqual([p.moi.repondu, p.moi.choix, 'juste' in p.moi, 'gain' in p.moi], [true, 2, false, false]);
  assert.ok(!/bonne|explication|secrète/i.test(JSON.stringify(p)));
  assert.equal(p.joueurs.find((j) => j.moi).repondu, true);
  // Au résultat : bonne réponse, explication, points, classement provisoire.
  heure += 16000;
  p = await getPartie(id, b);
  assert.equal(p.etat, 'resultat');
  assert.equal(p.restant, 5000 - 0);
  assert.deepEqual(p.question, { type: 'qcm', enonce: 'Question 0 ?', reponses: ['A0', 'B0', 'C0', 'D0'], bonne: 0, explication: 'Explication secrète 0.' });
  assert.deepEqual([p.moi.choix, p.moi.juste, p.moi.gain], [2, false, 0]);
  assert.deepEqual(p.joueurs.map((j) => [j.rang, j.pseudo, j.points, j.justes]), [[1, 'Alice', 0, 0], [1, 'Bob', 0, 0]]);
  heure += 3600000;
});

test('partie POST repondre : une réponse par question, refusée hors délai ou pour une autre question, points avec bonus', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const c = await creerJoueur('Camille');
  const d = await creerJoueur('Dora');
  const dehors = await creerJoueur('Dehors');
  const id = await nouvellePartie(a);
  for (const j of [b, c, d]) ok200(await postPartie(j, { action: 'rejoindre', id }));
  ok200(await postPartie(a, { action: 'demarrer', id }));
  const debut = heure;
  erreurFr(await postPartie(null, reponse(id, 0, 0)), 401);
  erreurFr(await postPartie(dehors, reponse(id, 0, 0)), 403, /ne joues pas/);
  for (const corps of [{ indice: '0', choix: 0 }, { indice: 0, choix: '1' }, { indice: -1, choix: 0 }, { indice: 0, choix: -1 }, { indice: 0.5, choix: 0 }, { indice: 0 }]) {
    erreurFr(await postPartie(b, { action: 'repondre', id, ...corps }), 400, /entiers/);
  }
  erreurFr(await postPartie(b, reponse(id, 0, 4)), 400, /choix n’existe pas/);
  erreurFr(await postPartie(b, reponse(id, 1, 0)), 409, /Trop tard/, 'mauvaise question');
  // Alice répond tout de suite et juste (0 ms : 150), Bob à 10 s et juste (125), Camille à 19,999 s et juste (100), Dora se trompe.
  ok200(await postPartie(a, reponse(id, 0, 0)));
  erreurFr(await postPartie(a, reponse(id, 0, 1)), 409, /déjà répondu/);
  heure = debut + 10000;
  ok200(await postPartie(b, reponse(id, 0, 0)));
  heure = debut + 19999;
  ok200(await postPartie(c, reponse(id, 0, 0)));
  ok200(await postPartie(d, reponse(id, 0, 3)));
  assert.deepEqual(lignes('SELECT joueur, choix, ms, juste FROM parties_reponses ORDER BY ms').map((r) => [r.ms, r.choix, r.juste]), [[0, 0, 1], [10000, 0, 1], [19999, 0, 1], [19999, 3, 0]]);
  assert.deepEqual(lignes('SELECT points FROM parties_joueurs ORDER BY rowid').map((r) => r.points), [150, 125, 100, 0]);
  // Hors délai : pile à 20 s, la question est finie.
  heure = debut + 20000;
  erreurFr(await postPartie(a, reponse(id, 0, 0)), 409, /Trop tard/);
  heure = debut + 22000;
  erreurFr(await postPartie(d, reponse(id, 0, 0)), 409, /Trop tard/);
  assert.equal(lignes('SELECT * FROM parties_reponses').length, 4, 'rien n’a été écrit hors délai');
  // Résultat : classement provisoire et gain de chacun.
  const p = await getPartie(id, b);
  assert.equal(p.etat, 'resultat');
  assert.deepEqual(p.joueurs.map((j) => [j.rang, j.pseudo, j.points, j.justes]), [[1, 'Alice', 150, 1], [2, 'Bob', 125, 1], [3, 'Camille', 100, 1], [4, 'Dora', 0, 0]]);
  assert.deepEqual([p.moi.juste, p.moi.gain], [true, 125]);
  assert.equal((await getPartie(id, d)).moi.gain, 0);
  // Question 2 : on ne peut plus répondre à la 1re ; un joueur qui ne répond pas garde ses points et gagne 0.
  heure = debut + CYCLE + 100;
  erreurFr(await postPartie(a, reponse(id, 0, 0)), 409, /Trop tard/);
  ok200(await postPartie(a, reponse(id, 1, 1)));
  assert.equal(lignes("SELECT points FROM parties_joueurs WHERE joueur = ?", a.id)[0].points, 300);
  heure += 3600000;
});

test('partie : un vrai ou faux se joue avec 0 = Vrai, 1 = Faux', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const id = (await postPartie(a, { action: 'creer', questions: nombres(5, 9).map((index) => ({ chapitre: 'qg:sujet-test:1', index })) })).corps.id;
  ok200(await postPartie(a, { action: 'demarrer', id }));
  const debut = heure;
  // Question 5 (qcm 5, bonne = 1), puis 6 (qcm, bonne = 2), 7 (faux), 8 (vrai), 9 (faux).
  ok200(await postPartie(a, reponse(id, 0, 1)));
  heure = debut + 3 * CYCLE;
  let p = await getPartie(id, a);
  assert.deepEqual([p.indice, p.question], [3, { type: 'vraifaux', affirmation: 'Affirmation 8.' }]);
  erreurFr(await postPartie(a, reponse(id, 3, 2)), 400, /n’existe pas/);
  ok200(await postPartie(a, reponse(id, 3, 0))); // « Vrai » : juste
  heure = debut + 3 * CYCLE + 21000;
  p = await getPartie(id, a);
  assert.deepEqual([p.question.bonne, p.question.explication, p.moi.juste], [0, 'Explication vrai ou faux 8.', true]);
  heure = debut + 4 * CYCLE;
  ok200(await postPartie(a, reponse(id, 4, 0))); // « Vrai » à « Affirmation 9 » : faux
  heure = debut + 4 * CYCLE + 21000;
  p = await getPartie(id, a);
  assert.deepEqual([p.question.bonne, p.moi.juste, p.moi.gain], [1, false, 0]);
  heure += 3600000;
});

test('partie GET : l’état avance avec l’heure, jusqu’au classement final ; sans tâche de fond, de façon idempotente', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const id = await nouvellePartie(a, 5);
  ok200(await postPartie(b, { action: 'rejoindre', id }));
  ok200(await postPartie(a, { action: 'demarrer', id }));
  const debut = heure;
  const etatDb = () => lignes('SELECT etat, indice, debut_question FROM parties')[0];
  const attendu = (t) => { heure = debut + t; };
  attendu(0);
  assert.deepEqual([(await getPartie(id, a)).etat, (await getPartie(id, a)).restant], ['question', 20000]);
  attendu(19999);
  assert.equal((await getPartie(id, a)).etat, 'question');
  assert.deepEqual(etatDb(), { etat: 'question', indice: 0, debut_question: debut });
  attendu(20000);
  let p = await getPartie(id, a);
  assert.deepEqual([p.etat, p.indice, p.restant], ['resultat', 0, 5000]);
  assert.deepEqual(etatDb(), { etat: 'resultat', indice: 0, debut_question: debut });
  attendu(24999);
  assert.deepEqual([(await getPartie(id, a)).etat, (await getPartie(id, a)).restant], ['resultat', 1]);
  attendu(CYCLE);
  p = await getPartie(id, a);
  assert.deepEqual([p.etat, p.indice, p.restant, p.question.enonce], ['question', 1, 20000, 'Question 1 ?']);
  assert.deepEqual(etatDb(), { etat: 'question', indice: 1, debut_question: debut + CYCLE });
  // Idempotent : relire 5 fois à la même heure ne change rien.
  const avant = JSON.stringify(etatDb());
  for (let i = 0; i < 5; i++) await getPartie(id, a);
  assert.equal(JSON.stringify(etatDb()), avant);
  // Personne n'a appelé pendant plusieurs questions : la lecture suivante rattrape tout d'un coup.
  attendu(3 * CYCLE + 21000);
  p = await getPartie(id, b);
  assert.deepEqual([p.etat, p.indice], ['resultat', 3]);
  assert.deepEqual(etatDb(), { etat: 'resultat', indice: 3, debut_question: debut + 3 * CYCLE });
  // Réponses de Bob à la dernière question, puis la fin.
  attendu(4 * CYCLE + 1000);
  ok200(await postPartie(b, reponse(id, 4, 0))); // question 4 = index 4 : bonne = 0, juste, ms = 1000
  attendu(5 * CYCLE - 1);
  assert.equal((await getPartie(id, a)).etat, 'resultat');
  attendu(5 * CYCLE);
  p = await getPartie(id, a);
  assert.deepEqual([p.etat, p.indice, p.restant, 'question' in p], ['fini', 4, 0, false]);
  assert.deepEqual(p.joueurs.map((j) => [j.rang, j.pseudo, j.points, j.justes]), [[1, 'Bob', 100 + pointsReponse(true, 1000) - 100, 1], [2, 'Alice', 0, 0]]);
  assert.equal(p.joueurs[0].points, 148);
  assert.equal(etatDb().etat, 'fini');
  // Une fois finie, la partie ne bouge plus et refuse les réponses.
  attendu(99 * CYCLE);
  assert.equal((await getPartie(id, a)).etat, 'fini');
  erreurFr(await postPartie(b, reponse(id, 4, 0)), 409, /Trop tard/);
  assert.deepEqual(Object.keys(p.joueurs[0]), ['rang', 'pseudo', 'points', 'justes']);
  heure += 3600000;
});

test('partie : deux lectures simultanées au même seuil donnent le même état et une seule écriture gagnante', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const id = await nouvellePartie(a, 5);
  ok200(await postPartie(a, { action: 'demarrer', id }));
  const debut = heure;
  heure = debut + 20000;
  const lectures = await Promise.all([1, 2, 3, 4].map(() => appel(partieGet, { env: envP, requete: '?id=' + id, jeton: a.jeton })));
  for (const l of lectures) {
    ok200(l);
    assert.deepEqual([l.corps.partie.etat, l.corps.partie.indice], ['resultat', 0]);
  }
  assert.deepEqual(lignes('SELECT etat, indice, debut_question FROM parties'), [{ etat: 'resultat', indice: 0, debut_question: debut }]);

  // Course déterministe : un autre Worker avance la partie entre la lecture et l'écriture de celui-ci.
  heure = debut + CYCLE + 100; // la question 2 devrait démarrer
  let simule = false;
  const dbCourse = {
    ...db,
    prepare(sql) {
      const st = db.prepare(sql);
      if (!/^UPDATE parties SET etat = \?/.test(sql)) return st;
      return {
        bind(...p) { st.bind(...p); return this; },
        async run() {
          if (!simule) { // l'autre Worker a déjà écrit la même avance
            simule = true;
            db.base.prepare("UPDATE parties SET etat = 'question', indice = 1, debut_question = ? WHERE id = ?").run(debut + CYCLE, id);
          }
          return st.run();
        },
      };
    },
  };
  const course = await appel(partieGet, { env: { DB: dbCourse, AI: undefined, maintenant: () => heure }, requete: '?id=' + id, jeton: a.jeton });
  ok200(course);
  assert.equal(simule, true, 'la course a bien eu lieu');
  assert.deepEqual([course.corps.partie.etat, course.corps.partie.indice, course.corps.partie.restant], ['question', 1, 19900]);
  assert.deepEqual(lignes('SELECT etat, indice, debut_question FROM parties'), [{ etat: 'question', indice: 1, debut_question: debut + CYCLE }]);
  heure += 3600000;
});

test('partie : deux envois simultanés de la même réponse ne comptent qu’une fois', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const id = await nouvellePartie(a, 5);
  ok200(await postPartie(a, { action: 'demarrer', id }));
  const envois = await Promise.all([postPartie(a, reponse(id, 0, 0)), postPartie(a, reponse(id, 0, 0)), postPartie(a, reponse(id, 0, 0))]);
  assert.deepEqual(envois.map((r) => r.statut).sort(), [200, 409, 409]);
  assert.equal(lignes('SELECT * FROM parties_reponses').length, 1);
  assert.equal(lignes('SELECT points FROM parties_joueurs')[0].points, 150);
  heure += 3600000;
});

test('partie GET : 400 sur un code invalide, 404 inconnue, public ; une partie de plus de 24 h est effacée à la création suivante', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  erreurFr(await appel(partieGet, { env: envP, requete: '?id=abc' }), 400, /Code de partie/);
  erreurFr(await appel(partieGet, { env: envP }), 400);
  erreurFr(await appel(partieGet, { env: envP, requete: '?id=ZZZZZZ' }), 404);
  const vieille = await nouvellePartie(a);
  ok200(await postPartie(a, { action: 'demarrer', id: vieille }));
  ok200(await appel(partieGet, { env: envP, requete: '?id=' + vieille.toLowerCase() }));
  db.base.prepare('UPDATE parties SET cree = ? WHERE id = ?').run(new Date(Date.now() - 25 * 3600000).toISOString(), vieille);
  const neuve = await nouvellePartie(a);
  assert.deepEqual(lignes('SELECT id FROM parties').map((r) => r.id), [neuve]);
  assert.equal(lignes('SELECT * FROM parties_joueurs').length, 1);
  assert.equal(lignes('SELECT * FROM parties_reponses').length, 0);
  erreurFr(await appel(partieGet, { env: envP, requete: '?id=' + vieille }), 404);
  heure += 3600000;
});

test('partie : quota de créations par jour, et aucun identifiant de joueur dans les réponses', async () => {
  toutVider();
  semerBlocP('sujet-test:1');
  const a = await creerJoueur('Alice');
  const b = await creerJoueur('Bob');
  const id = await nouvellePartie(a);
  ok200(await postPartie(b, { action: 'rejoindre', id }));
  ok200(await postPartie(a, { action: 'demarrer', id }));
  ok200(await postPartie(b, reponse(id, 0, 0)));
  const tout = [];
  for (const t of [0, 21000, 6 * CYCLE]) {
    tout.push(JSON.stringify((await appel(partieGet, { env: { ...envP, maintenant: () => lignes('SELECT debut_question FROM parties')[0].debut_question + t }, requete: '?id=' + id, jeton: b.jeton })).corps));
  }
  const brut = tout.join('');
  for (const j of [a, b]) {
    assert.ok(!brut.includes(j.id));
    assert.ok(!brut.includes(j.cle));
  }
  for (let i = 0; i < 19; i++) ok200(await postPartie(a, { action: 'creer', questions: refsP(5) }));
  erreurFr(await postPartie(a, { action: 'creer', questions: refsP(5) }), 429, /Reviens demain/);
  heure += 3600000;
});


// --- Lot 3c : révision espacée, série, badges, cours vérifiés, variantes ---

test('révision espacée : cinq boîtes (1, 3, 7, 16, 35 jours), « Je savais » monte, « À revoir » revient en boîte 1', () => {
  assert.deepEqual(L.INTERVALLES, [1, 3, 7, 16, 35]);
  let e;
  const attendu = [[2, '2026-03-04'], [3, '2026-03-08'], [4, '2026-03-17'], [5, '2026-04-05'], [5, '2026-04-05']];
  let jour = '2026-03-01';
  const jours = [3, 7, 16, 35, 35];
  attendu.forEach(([boite], k) => {
    const r = L.repondre(e, true, jour);
    e = r.entree;
    assert.equal(e.boite, boite);
    assert.equal(e.prochaine, L.plusJours(jour, jours[k]));
    jour = e.prochaine;
  });
  const rate = L.repondre(e, false, '2026-05-01');
  assert.deepEqual(rate.entree, { boite: 1, prochaine: '2026-05-02', xp: rate.entree.xp });
  assert.equal(rate.xp, 0);
  assert.deepEqual(L.nouvelleEntree('2026-03-01'), { boite: 1, prochaine: '2026-03-02' });
  assert.equal(L.plusJours('2026-03-30', 3), '2026-04-02');
});

test('révision espacée : 1 XP par bonne réponse, une fois par jour et par élément ; file du jour ; fusion', () => {
  const a = L.repondre(undefined, true, '2026-03-01');
  assert.equal(a.xp, 1);
  const b = L.repondre(a.entree, true, '2026-03-01');
  assert.equal(b.xp, 0, 'pas deux fois le même jour');
  assert.equal(L.repondre(b.entree, true, '2026-03-02').xp, 1);
  const etat = {
    cartes: { 'f:1:1': { vu: 1, ok: null }, 'f:1:2': { vu: 1, ok: true }, 'f:2:1': { vu: 1, ok: false } },
    erreurs: [{ palier: 'f:1', index: 3, titre: 'x' }, { palier: 'f:1', index: -1, titre: 'ordre' }],
    revisions: { 'f:1:1': { boite: 1, prochaine: '2026-03-02' }, 'f:2:1': { boite: 3, prochaine: '2026-03-01' }, 'fantome:1:1': { boite: 2, prochaine: '2026-03-01' } },
  };
  const file = L.fileDuJour(etat, '2026-03-01').map((x) => x.cle);
  assert.deepEqual(file, ['f:1#3', 'f:1:2', 'f:2:1'], 'échus seulement, boîtes basses d’abord, sans l’ordre ni les fantômes');
  assert.deepEqual(L.prochaineRevision(etat, '2026-03-01'), { date: '2026-03-02', jours: 1, n: 1 });
  L.elaguerRevisions(etat);
  assert.ok(!('fantome:1:1' in etat.revisions));
  const m = L.fusionnerRevisions(
    { x: { boite: 2, prochaine: '2026-03-10' }, y: { boite: 4, prochaine: '2026-03-10' }, z: { boite: 1, prochaine: '2026-03-02' } },
    { x: { boite: 2, prochaine: '2026-03-20' }, y: { boite: 3, prochaine: '2026-04-30' }, w: { boite: 9, prochaine: 'n' } },
  );
  assert.deepEqual(m.x, { boite: 2, prochaine: '2026-03-20' }, 'même boîte : la date la plus lointaine');
  assert.deepEqual(m.y, { boite: 4, prochaine: '2026-03-10' }, 'sinon la plus grande boîte');
  assert.deepEqual(m.z, { boite: 1, prochaine: '2026-03-02' });
  assert.ok(!m.w);
});

test('série : ancien format (une chaîne par jour) lu, jours actifs, série actuelle et meilleure série, fusion', () => {
  const vieux = { '2026-03-01': 'juste', '2026-03-02': 'faux', '2026-03-03': 'juste', '2026-03-10': 'juste' };
  assert.deepEqual(L.jourNormal('juste'), { jour: 'juste' });
  assert.deepEqual(L.jourNormal('faux'), { jour: 'faux' });
  assert.deepEqual(L.normaliserJours(vieux)['2026-03-02'], { jour: 'faux' });
  assert.equal(L.serieActuelle(vieux, '2026-03-03'), 3);
  assert.equal(L.serieActuelle(vieux, '2026-03-04'), 3, 'aujourd’hui pas encore joué : on compte jusqu’à hier');
  assert.equal(L.serieActuelle(vieux, '2026-03-05'), 0);
  assert.equal(L.meilleureSerie(vieux), 3);
  const neuf = { '2026-03-04': { lecon: 1 }, '2026-03-05': { revision: 1 }, '2026-03-06': { quiz: 1, jour: 'juste' }, '2026-03-07': {} };
  const tous = L.fusionnerJours(vieux, neuf);
  assert.equal(L.serieActuelle(tous, '2026-03-06'), 6, 'ancien et nouveau format se suivent');
  assert.ok(!('2026-03-07' in tous), 'un jour sans rien de fait n’est pas actif');
  const f = L.fusionnerJours({ '2026-03-01': { lecon: 1, jour: 'faux' } }, { '2026-03-01': { quiz: 1, jour: 'juste' } });
  assert.deepEqual(f['2026-03-01'], { lecon: 1, quiz: 1, jour: 'juste' });
});

test('badges : 13 badges calculés sur les données réelles, conditions et progression', () => {
  const vide = L.calculerBadges({ parcours: {}, jours: {}, cartes: {}, xp: 0, faits: {} }, '2026-03-01');
  assert.equal(vide.length, 13);
  assert.equal(L.BADGES.length, 13);
  assert.ok(vide.every((b) => !b.obtenu && b.nom && b.icone && b.condition && b.teinte));
  const jours = {};
  for (let i = 0; i < 7; i++) jours[L.plusJours('2026-03-01', i)] = { revision: 1 };
  const cartes = {};
  for (let i = 0; i < 100; i++) cartes[`f:1:${i + 1}`] = { vu: 1, ok: i % 2 === 0 };
  cartes['f:9:9'] = { vu: 1, ok: null };
  const etat = { parcours: { a: { fait: 8, mods: 1, bases: 0 }, b: { fait: 3, bases: 1 } }, jours, cartes, xp: 999, faits: { duel: '2026-03-01' } };
  const par = Object.fromEntries(L.calculerBadges(etat, '2026-03-07').map((b) => [b.id, b]));
  assert.ok(par['lecon-1'].obtenu && par['lecons-10'].obtenu === true, '11 leçons');
  assert.ok(!par['lecons-50'].obtenu && par['lecons-50'].valeur === 11 && par['lecons-50'].cible === 50);
  assert.ok(par['module-1'].obtenu && par.bases.obtenu);
  assert.ok(par['serie-3'].obtenu && par['serie-7'].obtenu && !par['serie-30'].obtenu);
  assert.ok(par['cartes-100'].obtenu === false && par['cartes-100'].valeur === 100 === false || par['cartes-100'].valeur <= 100);
  assert.ok(par.duel.obtenu && !par.direct.obtenu && !par['xp-1000'].obtenu);
  etat.xp = 1000; etat.faits.direct = '2026-03-02'; cartes['f:1:101'] = { vu: 1, ok: true };
  const apres = Object.fromEntries(L.calculerBadges(etat, '2026-03-07').map((b) => [b.id, b]));
  assert.ok(apres['xp-1000'].obtenu && apres.direct.obtenu && apres['cartes-100'].obtenu);
  assert.deepEqual(L.fusionnerBadges({ a: '2026-03-02' }, { a: '2026-03-01', b: '' }), { a: '2026-03-01', b: '' });
  assert.equal(L.fusionnerBadges(null, undefined), null);
});

test('cours vérifiés : un titre avec le mot clé d’un domaine ouvre ce domaine (sans accents, mot entier)', () => {
  const attendu = {
    'Gemmologie': 'v-gj', 'La GEMMOLOGIE et la joaillerie': 'v-gj', 'Les pierres précieuses': 'v-gj', 'Joaillerie ancienne': 'v-gj',
    'Histoire de Rome': 'v-hg', 'Géographie de la France': 'v-hg', 'Sciences cognitives': 'v-sn', 'La nature en ville': 'v-sn',
    'Street art': 'v-ac', 'Culture japonaise': 'v-ac', 'Histoire de l’art': 'v-ac',
    'Le mont Blanc': null, 'Le cinéma de Kubrick': null, 'L’agriculture': null, 'Smart': null, 'Les volcans': null,
  };
  for (const [titre, id] of Object.entries(attendu)) assert.equal(L.domaineVerifie(titre), id, titre);
});

test('variante : prompt, consignes et validation (sections, mode simple plus court)', () => {
  assert.match(PROMPT_VARIANTE, /UN SEUL objet JSON strict/);
  assert.match(PROMPT_VARIANTE, /n’utilise QUE les faits des extraits fournis/);
  const design = readFileSync(new URL('../DESIGN.md', import.meta.url), 'utf8');
  const mots = design.split('\n').find((l) => l.startsWith('- Mots :')).replace('- Mots :', '').replace(/\.\s*$/, '').split(',').map((m) => m.trim());
  const proses = [PROMPT_VARIANTE, ...Object.values(CONSIGNES_VARIANTE)].flatMap((t) => t.split('\n').filter((l) => !l.startsWith('Mots interdits :') && !l.includes('{')));
  for (const mot of mots) for (const l of proses) assert.ok(!new RegExp('(?<![\\p{L}])' + mot.replace(/[’']/g, '[’\']') + '(?![\\p{L}])', 'iu').test(l), 'mot interdit : ' + mot);
  const ok = { sections: { enBref: ['La tour est en fer.', 'Elle date de 1889.'], comment: ['On la monte avec des rivets.', 'Il y en a beaucoup.'], pourquoi: null, ouQuand: null } };
  const r = validerVariante(ok, { mode: 'simple', cles: ['enBref', 'comment'] });
  assert.ok(r.valeur, r.raison);
  assert.deepEqual(Object.keys(r.valeur.sections), ['enBref', 'comment', 'pourquoi', 'ouQuand']);
  const courte = { sections: { enBref: ['Elle est en fer.', 'Elle date.'] } };
  assert.ok(validerVariante(courte, { mode: 'simple', cles: ['enBref'] }).valeur);
  assert.ok(validerVariante(courte, { mode: 'expert', cles: ['enBref'] }).raison, 'phrases trop courtes refusées en expert');
  assert.ok(validerVariante({ sections: { enBref: ['Une seule phrase assez longue.'] } }, { mode: 'simple' }).raison, 'enBref : 2 phrases au moins');
  const inconnue = { sections: { ...ok.sections, pourquoi: ['Phrase ajoutée en trop.', 'Autre phrase ajoutée.'] } };
  assert.equal(validerVariante(inconnue, { mode: 'simple', cles: ['enBref', 'comment'] }).valeur.sections.pourquoi, null, 'une section absente de la leçon reste absente');
});

const varianteBrute = () => ({
  sections: {
    enBref: ['La tour Eiffel est une grande tour de fer.', 'Elle se trouve à Paris.'],
    comment: ['Des ouvriers assemblent le fer avec des rivets.', 'Il y a 2,5 millions de rivets.'],
    pourquoi: null, ouQuand: null,
  },
});
function insererLeconVariante(parcours = 'la-tour-eiffel') {
  insererParcours(parcours, { titre: 'La tour Eiffel' });
  const contenu = {
    id: `${parcours}:1`, parcours, numero: 1, etape: 1, titre: 'Une tour de fer',
    sections: { enBref: 'La tour est en fer puddlé. Elle date de 1889.', comment: 'Le fer est assemblé par des rivets. Les pièces sont nombreuses.', pourquoi: null, ouQuand: null },
    definitions: [{ terme: 'Rivet', definition: 'Tige métallique à tête.' }],
    sources: [['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel'], ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower']],
    questions: [],
  };
  db.base.prepare('INSERT INTO paliers (id, parcours, numero, contenu, vues, cree) VALUES (?, ?, 1, ?, 0, ?)').run(contenu.id, parcours, JSON.stringify(contenu), '2026-10-19T08:00:00.000Z');
}
const postVariante = (j, sc, corps) => { brancher(sc); return appel(variantePost, { env: envDe(sc), methode: 'POST', jeton: j && j.jeton, corps }); };
const quotasVariante = () => lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'variante%' ORDER BY cle");

test('variante POST : 401, 400 (parcours, v-xx refusé, n, mode), 404, 503 ; rien consommé', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario({ variante: [varianteBrute()], verif: [verifNumeros()] });
  erreurFr(await postVariante(null, sc, { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' }), 401);
  erreurFr(await postVariante(j, sc, { parcours: 'Pas valide!', n: 1, mode: 'simple' }), 400);
  erreurFr(await postVariante(j, sc, { parcours: 'v-gj', n: 1, mode: 'simple' }), 400, /cours vérifiés/);
  erreurFr(await postVariante(j, sc, { parcours: 'la-tour-eiffel', n: 0, mode: 'simple' }), 400);
  erreurFr(await postVariante(j, sc, { parcours: 'la-tour-eiffel', n: '1', mode: 'simple' }), 400);
  erreurFr(await postVariante(j, sc, { parcours: 'la-tour-eiffel', n: 1, mode: 'normal' }), 400, /simple ou expert/);
  erreurFr(await postVariante(j, sc, { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' }), 404, /Parcours/);
  insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
  erreurFr(await postVariante(j, sc, { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' }), 404, /Leçon introuvable/);
  insererLeconVariante('autre-sujet');
  insererLeconVariante('la-tour-eiffel-2');
  const sansIA = await appel(variantePost, { env: { DB: db }, methode: 'POST', jeton: j.jeton, corps: { parcours: 'autre-sujet', n: 1, mode: 'simple' } });
  erreurFr(sansIA, 503);
  assert.deepEqual(quotasVariante(), []);
  assert.equal(sc.appels.length, 0);
});

test('variante POST : réécriture à partir de la leçon et des extraits, vérifiée par la 2e IA, mise en cache', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererLeconVariante();
  const sc = scenario({ variante: [varianteBrute()], verif: [verifNumeros()] });
  const r = await postVariante(j, sc, { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' });
  ok200(r);
  const v = r.corps.variante;
  assert.deepEqual(Object.keys(v), ['id', 'parcours', 'n', 'mode', 'sections', 'verification']);
  assert.equal(v.id, 'la-tour-eiffel:1:simple');
  assert.equal(v.sections.enBref, varianteBrute().sections.enBref.join(' '));
  assert.equal(v.sections.pourquoi, null);
  assert.deepEqual(v.verification, { ia: [NOM_LLAMA, NOM_MISTRAL], affirmations: 4, retirees: 0, statut: 'recoupe' });
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.modele]), [['variante', LLAMA], ['verif', MISTRAL]]);
  const demande = sc.appels[0].entree.messages[1].content;
  assert.equal(sc.appels[0].entree.messages[0].content, PROMPT_VARIANTE);
  assert.match(demande, /Mode demandé : simple/);
  assert.ok(demande.includes(CONSIGNES_VARIANTE.simple));
  assert.ok(demande.includes('La tour est en fer puddlé. Elle date de 1889.'), 'le texte actuel de la leçon');
  assert.ok(demande.includes('Rivet : Tige métallique à tête.'));
  assert.match(demande, /Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.equal(lignes('SELECT id FROM variantes')[0].id, 'la-tour-eiffel:1:simple');
  assert.deepEqual(quotasVariante(), [{ cle: 'variante:joueur:' + j.id, n: 1 }, { cle: 'variante:total', n: 1 }]);
  // En cache : servie à un autre lecteur, sans IA ni quota.
  const autre = await creerJoueur('Camille');
  const sc2 = scenario({});
  const r2 = await postVariante(autre, sc2, { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' });
  ok200(r2);
  assert.deepEqual(r2.corps.variante, v);
  assert.equal(sc2.appels.length, 0);
  assert.equal(quotasVariante().length, 2);
  assert.deepEqual(quotasVariante().map((q) => q.n), [1, 1]);
  // Autre mode : nouvelle ligne, consigne experte.
  const sc3 = scenario({ variante: [{ sections: { enBref: ['La tour Eiffel mesure 312 mètres à l’origine.', 'Elle est bâtie en fer puddlé.'], comment: ['Chaque pièce est posée avec précision.', 'Les rivets assemblent les pièces.'], pourquoi: null, ouQuand: null } }], verif: [verifNumeros()] });
  ok200(await postVariante(j, sc3, { parcours: 'la-tour-eiffel', n: 1, mode: 'expert' }));
  assert.ok(sc3.appels[0].entree.messages[1].content.includes(CONSIGNES_VARIANTE.expert));
  assert.equal(lignes('SELECT id FROM variantes').length, 2);
});

test('variante POST : une phrase non confirmée est retirée (statut partiel) ; sans extraits ou rédaction invalide : 502, rien en cache', async () => {
  toutVoir();
  const j = await creerJoueur();
  insererLeconVariante();
  const sc = scenario({ variante: [varianteBrute()], verif: [verifSi(/2,5 millions/)] });
  const r = await postVariante(j, sc, { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' });
  ok200(r);
  assert.equal(r.corps.variante.verification.statut, 'partiel');
  assert.equal(r.corps.variante.verification.retirees, 1);
  assert.ok(!r.corps.variante.sections.comment.includes('2,5 millions'));
  assert.ok(r.corps.variante.sections.comment.includes('rivets'));
  // Plus de 40 % retiré : nouvelle rédaction (on garde la meilleure).
  toutVoir();
  const j2 = await creerJoueur();
  insererLeconVariante();
  const sc2 = scenario({ variante: [varianteBrute()], verif: [verifSi(/./), verifNumeros()] });
  ok200(await postVariante(j2, sc2, { parcours: 'la-tour-eiffel', n: 1, mode: 'expert' }));
  assert.equal(sc2.par('variante').length, 2);
  assert.match(sc2.par('variante')[1].entree.messages[1].content, /affirmations introuvables/);
  // Rien d’utilisable.
  toutVoir();
  const j3 = await creerJoueur();
  insererLeconVariante();
  const mauvais = scenario({ variante: [{ sections: { enBref: ['Trop court'] } }], verif: [verifNumeros()] });
  erreurFr(await postVariante(j3, mauvais, { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' }), 502);
  wiki.pages = {}; wiki.pagesEn = {};
  erreurFr(await postVariante(j3, scenario({}), { parcours: 'la-tour-eiffel', n: 1, mode: 'simple' }), 502, /sources/);
  assert.equal(lignes('SELECT id FROM variantes').length, 0);
});

test('variante POST : 15 par jour et par lecteur, 150 par jour au total (le cache n’en consomme pas)', async () => {
  toutVoir();
  const j = await creerJoueur();
  for (let k = 1; k <= 16; k++) {
    insererLeconVariante(`sujet-${k}`);
  }
  const sc = scenario({ variante: [varianteBrute()], verif: [verifNumeros()] });
  for (let k = 1; k <= 15; k++) ok200(await postVariante(j, sc, { parcours: `sujet-${k}`, n: 1, mode: 'simple' }));
  erreurFr(await postVariante(j, sc, { parcours: 'sujet-16', n: 1, mode: 'simple' }), 429, /15 versions/);
  ok200(await postVariante(j, sc, { parcours: 'sujet-3', n: 1, mode: 'simple' }));
  const k2 = await creerJoueur('Camille');
  db.base.prepare("UPDATE quotas SET n = 150 WHERE cle = 'variante:total'").run();
  erreurFr(await postVariante(k2, sc, { parcours: 'sujet-16', n: 1, mode: 'simple' }), 429, /débordée/);
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'variante:joueur:" + k2.id + "'")[0].n, 1);
});

// =============================================================================
// Lot 5 : Gemini rapide, clé personnelle, génération de nuit, bibliothèque, qualité des leçons
// =============================================================================

// Adaptateurs : un scénario (messages au format chat) répond comme Gemini ou comme l'API Messages de Claude.
const messagesDeGemini = (corps) => [
  { role: 'system', content: corps.systemInstruction ? corps.systemInstruction.parts[0].text : '' },
  ...corps.contents.map((x) => ({ role: x.role === 'model' ? 'assistant' : 'user', content: x.parts[0].text })),
];
const textesDeScenario = async (sc, u, messages) => {
  const r = sc.glm(u, { body: JSON.stringify({ model: u.pathname, messages }) });
  if (r.status !== 200) return { r };
  return { texte: (await r.json()).choices[0].message.content };
};
const geminiVers = (sc) => async (u, init) => {
  const { r, texte } = await textesDeScenario(sc, u, messagesDeGemini(JSON.parse(init.body)));
  return r || reponseGemini(texte);
};
const claudeVers = (sc) => async (u, init) => {
  const c = JSON.parse(init.body);
  const { r, texte } = await textesDeScenario(sc, u, [{ role: 'system', content: c.system || '' }, ...c.messages]);
  return r || reponseWiki({ content: [{ type: 'text', text: texte }] });
};
const CLE_PERSO = 'AIzaSy-cle-perso-de-test-0123456789';
const CLE_CLAUDE = 'sk-ant-api03-cle-claude-de-test-0123';
// Tout le contenu de la base, en texte : la clé personnelle ne doit y figurer nulle part.
const toutesLesTables = () => lignes("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  .map((t) => JSON.stringify(lignes(`SELECT * FROM ${t.name}`))).join('\n');
// Capte tout ce que le code écrit dans la console pendant `fn`.
async function captant(fn) {
  const journal = [];
  const anciens = [console.warn, console.error, console.log];
  console.warn = console.error = console.log = (...a) => journal.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  try { return { valeur: await fn(), journal }; } finally { [console.warn, console.error, console.log] = anciens; }
}

// --- A. Gemini rapide, diagnostic lisible --------------------------------------

test('Gemini (lot 5) : cascade des 9 modèles, du meilleur au moins bon ; réflexion coupée sur toute la série flash', async () => {
  assert.deepEqual(GEMINI_MODELES, ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']);
  const cfg = (modele, extra = {}) => corpsGemini(MSG, { maxTokens: 5, temperature: 0, modele, ...extra }).generationConfig.thinkingConfig;
  assert.deepEqual(cfg('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.deepEqual(cfg('gemini-flash-latest'), { thinkingLevel: 'minimal' });
  assert.deepEqual(cfg('gemini-3-flash-preview'), { thinkingLevel: 'minimal' });
  assert.equal(cfg('gemini-2.0-flash'), undefined);
  assert.equal(cfg('gemini-flash-latest', { sansReflexion: true }), undefined, 'repli : même corps sans thinkingConfig');
});

test('Gemini : un 400 dû à thinkingConfig est retenté sur le même modèle SANS ce champ, avant de passer au suivant', async () => {
  reinitExt();
  ext.gemini = (u, init) => (JSON.parse(init.body).generationConfig.thinkingConfig
    ? new Response('{"error":{"message":"Unknown name thinkingConfig"}}', { status: 400 }) : reponseGemini('{"ok":6}'));
  const [g] = redacteurs({ AI: {}, GEMINI_API_KEY: CLE_GEMINI });
  assert.deepEqual(extraireObjet(await g.appeler(MSG, { maxTokens: 5, delaiMs: 1000 })), { ok: 6 });
  assert.deepEqual(ext.appels.map((a) => a.url.pathname.split('/').pop()), ['gemini-3-flash-preview:generateContent', 'gemini-3-flash-preview:generateContent']);
  assert.ok(JSON.parse(ext.appels[0].init.body).generationConfig.thinkingConfig);
  assert.equal(JSON.parse(ext.appels[1].init.body).generationConfig.thinkingConfig, undefined);
  assert.deepEqual(g.erreursModeles.map((x) => [x.modele, x.statut, !!x.sansReflexion]), [['gemini-3-flash-preview', 400, false]]);
  reinitExt();
});

test('diagnostic : Gemini liste l’erreur de CHAQUE modèle candidat ; Grok 401 partout = « cle-invalide », ignoré 1 h', async () => {
  reinitExt();
  ext.gemini = (u) => (/3-flash-preview/.test(u.pathname) ? new Response('{"error":{"message":"model overloaded ' + CLE_GEMINI + '"}}', { status: 404 })
    : /gemini-2\.5-flash:/.test(u.pathname) ? new Response('quota', { status: 429 }) : reponseGemini('{"ok":true}'));
  ext.grok = () => new Response('bad ' + CLE_GROK, { status: 401 });
  ext.groq = () => new Response('bad', { status: 401 });
  const env = { ...TOUTES, DIAG_KEY: 'sésame', AI: { run: async () => ({ response: '{"ok":true}' }) } };
  ext.glm = () => reponseOpenAI('{"ok":true}');
  const r = await appel(diagnosticGet, { env, requete: '?cle=sésame' });
  ok200(r);
  const [gem, , grk] = r.corps.resultats;
  assert.equal(gem.etat, 'ok');
  assert.deepEqual(gem.erreursModeles.map((x) => [x.modele, x.code]), [['gemini-3-flash-preview', 404], ['gemini-2.5-flash', 429]]);
  assert.match(gem.erreursModeles[0].message, /overloaded/);
  assert.equal(grk.etat, 'cle-invalide');
  assert.match(grk.erreur, /clé invalide/);
  assert.deepEqual(r.corps.ignores, ['Grok']);
  const texte = JSON.stringify(r.corps);
  for (const c of [CLE_GEMINI, CLE_GROK, CLE_GLM]) assert.ok(!texte.includes(c), 'aucune clé dans le diagnostic');
  // Ignoré : plus dans les chaînes de rédaction ni de vérification pendant 1 h, puis il revient.
  assert.equal(estIgnore('grok'), true);
  const toutes = { AI: {}, GEMINI_API_KEY: CLE_GEMINI, GROK_API_KEY: CLE_GROK, GLM_API_KEY: CLE_GLM };
  assert.deepEqual(redacteurs(toutes).map((f) => f.famille), ['gemini', 'glm', 'workers-ai']);
  assert.ok(!verificateurs(toutes, redacteurs(toutes)[0]).some((f) => f.famille === 'grok'));
  horloge.t += 60 * 60 * 1000 + 1000;
  assert.equal(estIgnore('grok'), false);
  assert.ok(redacteurs(toutes).some((f) => f.famille === 'grok'));
  reinitExt();
});

// --- B. Clé personnelle -----------------------------------------------------------

test('clé perso : lecture de l’en-tête x-cle-ia (fournisseurs gemini, glm, claude), masquage, jamais dans un message', async () => {
  const req = (v) => new Request('https://koios.test/api/x', { headers: v === undefined ? {} : { 'x-cle-ia': v } });
  assert.equal(lireClePerso(req()), null);
  assert.deepEqual(lireClePerso(req('gemini:' + CLE_PERSO)), { fournisseur: 'gemini', cle: CLE_PERSO });
  assert.deepEqual(lireClePerso(req('glm:abc123.def456ghi')), { fournisseur: 'glm', cle: 'abc123.def456ghi' });
  assert.equal(lireClePerso(req('claude:' + CLE_CLAUDE)).fournisseur, 'claude');
  for (const mauvais of ['grok:abcdefghijkl', 'gemini:', 'gemini:court', 'sans-deux-points', 'gemini:' + 'a'.repeat(500), 'gemini:cle avec espace!!']) {
    assert.throws(() => lireClePerso(req(mauvais)), (e) => e.statut === 400 && !e.message.includes('abcdefghijkl') && !e.message.includes('court'));
  }
  const r = req('gemini:' + CLE_PERSO);
  const m = masquer('Erreur avec ' + CLE_PERSO + ' et gemini:' + CLE_PERSO, r);
  assert.ok(!m.includes(CLE_PERSO));
  assert.equal(masquer('rien à masquer', r), 'rien à masquer');
  // Le fournisseur perso garde sa clé hors des propriétés énumérables.
  const f = fournisseurPerso({ clePerso: { fournisseur: 'gemini', cle: CLE_PERSO } });
  assert.ok(!JSON.stringify(f).includes(CLE_PERSO));
  assert.equal(f.secret, CLE_PERSO);
  assert.equal(fournisseurPerso({}), null);
});

test('clé perso Gemini : rédige en premier, vérification par la famille du serveur ; clé jamais renvoyée, enregistrée ni journalisée', async () => {
  const j = await prepareProgramme();
  const sc = scenario(partiesStandard());
  ext.gemini = geminiVers(sc);
  ext.glm = sc.glm;
  const { valeur: r, journal } = await captant(() => appel(palierGet, {
    env: envDe(sc, AVEC_GLM), jeton: j.jeton, entetes: { 'x-cle-ia': 'gemini:' + CLE_PERSO }, requete: '?parcours=la-tour-eiffel&n=1',
  }));
  ok200(r);
  const gem = ext.appels.filter((a) => a.fournisseur === 'gemini');
  assert.equal(gem.length, 2, 'les deux moitiés de la leçon');
  for (const a of gem) assert.equal(new Headers(a.init.headers).get('x-goog-api-key'), CLE_PERSO);
  const glmAppels = ext.appels.filter((a) => a.fournisseur === 'glm');
  assert.equal(glmAppels.length, 1, 'la vérification vient du serveur, d’une autre famille');
  assert.equal(sc.par('verif').length, 1);
  assert.equal(new Headers(glmAppels[0].init.headers).get('authorization'), 'Bearer ' + CLE_GLM, 'la clé perso ne part jamais vers un autre fournisseur');
  assert.deepEqual(r.corps.palier.verification.ia, ['gemini-3-flash-preview', 'glm-4.7-flash']);
  assert.equal(r.corps.palier.verification.statut, 'recoupe');
  // Jamais renvoyée, jamais en base, jamais dans le journal.
  assert.ok(!JSON.stringify(r.corps).includes(CLE_PERSO), 'pas dans la réponse');
  assert.ok(!toutesLesTables().includes(CLE_PERSO), 'pas en base');
  assert.ok(!journal.join('\n').includes(CLE_PERSO), 'pas dans le journal');
  assert.ok(!JSON.stringify(ext.appels.map((a) => [String(a.url), a.init.body])).includes(CLE_PERSO), 'ni dans une adresse ni dans un corps de requête');
});

test('clé perso : une erreur du fournisseur qui recopie la clé ne la laisse sortir ni dans la réponse ni dans le journal (repli sur le serveur)', async () => {
  const j = await prepareProgramme();
  const sc = scenario(partiesStandard());
  ext.gemini = () => new Response('{"error":{"message":"panne interne pour ' + CLE_PERSO + '"}}', { status: 500 });
  ext.glm = sc.glm;
  const { valeur: r, journal } = await captant(() => appel(palierGet, {
    env: envDe(sc, AVEC_GLM), jeton: j.jeton, entetes: { 'x-cle-ia': 'gemini:' + CLE_PERSO }, requete: '?parcours=la-tour-eiffel&n=2',
  }));
  ok200(r);
  assert.ok(ext.appels.some((a) => a.fournisseur === 'glm'), 'panne (5xx) : la chaîne du serveur prend le relais');
  const sortie = JSON.stringify(r.corps) + journal.join('\n') + toutesLesTables();
  assert.ok(!sortie.includes(CLE_PERSO));
  assert.ok(journal.join('\n').includes('***'), 'le message de panne est journalisé, clé masquée');
  // Même une erreur qui recopie la clé est masquée par l'enveloppe.
  const faux = await appel(({ request }) => enveloppe(async () => { throw new ErreurHttp(418, 'Rien pour gemini:' + CLE_PERSO + ' ni ' + CLE_PERSO); })({ request }), { entetes: { 'x-cle-ia': 'gemini:' + CLE_PERSO } });
  assert.equal(faux.statut, 418);
  assert.ok(!JSON.stringify(faux.corps).includes(CLE_PERSO));
});

test('clé perso refusée (400 « API key not valid », 401, 403) : « Ta clé est refusée par Gemini. », sans retomber sur les clés du serveur', async () => {
  const j = await prepareProgramme();
  const sc = scenario(partiesStandard());
  for (const [statut, corps] of [[400, '{"error":{"status":"INVALID_ARGUMENT","message":"API key not valid. Please pass a valid API key.","details":[{"reason":"API_KEY_INVALID"}]}}'], [403, 'PERMISSION_DENIED'], [401, 'unauthorized']]) {
    reinitExt();
    ext.gemini = () => new Response(corps, { status: statut });
    ext.glm = sc.glm;
    const r = await appel(palierGet, { env: envDe(sc, AVEC_GLM), jeton: j.jeton, entetes: { 'x-cle-ia': 'gemini:' + CLE_PERSO }, requete: '?parcours=la-tour-eiffel&n=3' });
    erreurFr(r, 403, /^Ta clé est refusée par Gemini\./);
    assert.ok(!JSON.stringify(r.corps).includes(CLE_PERSO));
    assert.equal(ext.appels.filter((a) => a.fournisseur === 'glm').length, 0, 'aucun repli silencieux sur GLM');
    assert.equal(lignes("SELECT id FROM paliers WHERE id = 'la-tour-eiffel:3'").length, 0, 'rien n’est publié');
  }
  // GLM et Claude : 401 = clé refusée.
  reinitExt();
  ext.glm = () => new Response('{"error":"bad key"}', { status: 401 });
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, entetes: { 'x-cle-ia': 'glm:abcdefgh.ijklmnop' }, requete: '?parcours=la-tour-eiffel&n=3' }), 403, /refusée par GLM/);
  reinitExt();
  ext.claude = () => new Response('{"type":"error","error":{"type":"authentication_error"}}', { status: 401 });
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, entetes: { 'x-cle-ia': 'claude:' + CLE_CLAUDE }, requete: '?parcours=la-tour-eiffel&n=3' }), 403, /refusée par Claude/);
  // Quota du lecteur (429) : pas un refus de clé, et le serveur n'est pas marqué épuisé.
  reinitExt();
  ext.gemini = () => new Response('quota', { status: 429 });
  const f = fournisseurPerso({ clePerso: { fournisseur: 'gemini', cle: CLE_PERSO } });
  await assert.rejects(() => f.appeler(MSG, { maxTokens: 5, delaiMs: 1000 }), (e) => e.epuise === true && !e.cleRefusee);
  assert.equal(estEpuise('gemini'), false, 'le quota de ta clé n’est pas celui du serveur');
  reinitExt();
});

test('Claude (clé perso) : API Messages, en-têtes, system séparé, modèle claude-haiku-5-5 ; sans autre famille disponible : badge « seule »', async () => {
  const j = await prepareProgramme();
  const sc = scenario(partiesStandard());
  ext.claude = claudeVers(sc);
  marquerEpuise('workers-ai'); // plus aucune autre famille disponible
  const { valeur: r } = await captant(() => appel(palierGet, {
    env: envDe(sc), jeton: j.jeton, entetes: { 'x-cle-ia': 'claude:' + CLE_CLAUDE }, requete: '?parcours=la-tour-eiffel&n=4',
  }));
  ok200(r);
  const a = ext.appels.find((x) => x.fournisseur === 'claude');
  assert.equal(String(a.url), CLAUDE_URL);
  const h = new Headers(a.init.headers);
  assert.equal(h.get('x-api-key'), CLE_CLAUDE);
  assert.equal(h.get('anthropic-version'), '2023-06-01');
  const corps = JSON.parse(a.init.body);
  assert.equal(corps.model, CLAUDE_MODELE);
  assert.equal(CLAUDE_MODELE, 'claude-haiku-5-5');
  assert.equal(typeof corps.system, 'string');
  assert.ok(corps.messages.every((m) => m.role === 'user' || m.role === 'assistant'), 'pas de message system dans messages');
  assert.deepEqual(corpsClaude(MSG, { maxTokens: 9, temperature: 0 }).messages.map((m) => m.role), ['user', 'assistant', 'user']);
  // Pas d'autre famille : publiée, mais avec « Une seule IA » (aucun appel de vérification, rien d'annoncé comme recoupé).
  assert.equal(sc.par('verif').length, 0);
  assert.equal(r.corps.palier.verification.statut, 'seule');
  assert.deepEqual(r.corps.palier.verification.ia, [CLAUDE_MODELE]);
  assert.equal(r.corps.palier.verification.retirees, 0);
  assert.ok(r.corps.palier.questions.length >= 3);
  // Jamais dans la bibliothèque partagée : renvoyée seulement à celui qui l'a demandée, avec un message clair.
  assert.equal(r.corps.palier.nonEnregistree, true);
  assert.match(r.corps.message, /pas enregistrée dans la bibliothèque/);
  assert.equal(lignes("SELECT id FROM paliers WHERE id = 'la-tour-eiffel:4'").length, 0, 'rien dans paliers');
  assert.ok(!JSON.stringify(r.corps).includes(CLE_CLAUDE) && !toutesLesTables().includes(CLE_CLAUDE));
  reinitExt();
});

test('POST /api/cle-ia : essai minuscule de la clé, refus clair, connexion requise, rien renvoyé', async () => {
  reinitExt();
  const j = await creerJoueur('Camille');
  const env2 = { DB: db };
  const h = (v) => ({ 'x-cle-ia': v });
  erreurFr(await appel(cleIaPost, { env: env2, methode: 'POST', entetes: h('gemini:' + CLE_PERSO), corps: {} }), 401);
  erreurFr(await appel(cleIaPost, { env: env2, methode: 'POST', jeton: j.jeton, corps: {} }), 400, /Colle d’abord ta clé/);
  erreurFr(await appel(cleIaPost, { env: env2, methode: 'POST', jeton: j.jeton, entetes: h('mauvais'), corps: {} }), 400);
  ext.gemini = () => reponseGemini('{"ok":true}');
  const ok = await appel(cleIaPost, { env: env2, methode: 'POST', jeton: j.jeton, entetes: h('gemini:' + CLE_PERSO), corps: {} });
  ok200(ok);
  assert.deepEqual(ok.corps, { ok: true, fournisseur: 'gemini' });
  assert.equal(JSON.parse(ext.appels[0].init.body).generationConfig.maxOutputTokens, 20, 'appel minuscule');
  ext.gemini = () => new Response('API key not valid', { status: 400 });
  erreurFr(await appel(cleIaPost, { env: env2, methode: 'POST', jeton: j.jeton, entetes: h('gemini:' + CLE_PERSO), corps: {} }), 403, /^Ta clé est refusée par Gemini\.$/);
  ext.gemini = () => new Response('oups ' + CLE_PERSO, { status: 500 });
  const panne = await appel(cleIaPost, { env: env2, methode: 'POST', jeton: j.jeton, entetes: h('gemini:' + CLE_PERSO), corps: {} });
  erreurFr(panne, 502);
  assert.ok(!JSON.stringify(panne.corps).includes(CLE_PERSO));
  reinitExt();
});

test('contenu créé avec une clé perso : visible dans la bibliothèque et lisible par un autre lecteur sans aucune IA', async () => {
  toutVoir();
  const a = await creerJoueur('Autrice');
  const b = await creerJoueur('Lecteur');
  const sc = scenario(partiesStandard());
  ext.gemini = geminiVers(sc);
  ext.glm = sc.glm;
  const envA = envDe(sc, AVEC_GLM);
  const cle = { 'x-cle-ia': 'gemini:' + CLE_PERSO };
  // A crée la formation avec sa clé : programme et plan du module 1 sont écrits par Gemini (sa clé).
  const cree = await appel(parcoursPost, { env: envA, methode: 'POST', jeton: a.jeton, entetes: cle, corps: { titre: 'La tour Eiffel' } });
  ok200(cree);
  assert.ok(ext.appels.filter((x) => x.fournisseur === 'gemini').length >= 2, 'la clé perso rédige le programme et le module');
  assert.equal(lignes("SELECT id, auteur FROM parcours WHERE id = 'la-tour-eiffel'")[0].auteur, a.id, 'dans la table partagée');
  // A lit la leçon 1 avec sa clé.
  ok200(await appel(palierGet, { env: envA, jeton: a.jeton, entetes: cle, requete: '?parcours=la-tour-eiffel&n=1' }));
  // B (sans clé, sans IA) trouve la formation dans la bibliothèque et lit la leçon : elle est servie par le cache.
  const sansIA = { DB: db };
  const recherche = await appel(parcoursGet, { env: sansIA, requete: '?q=tour+eiffel' });
  ok200(recherche);
  const x = recherche.corps.parcours.find((p) => p.id === 'la-tour-eiffel');
  assert.ok(x, 'visible dans la bibliothèque');
  assert.equal(x.lecons, 1);
  assert.equal(x.ouverts, 1);
  assert.deepEqual(x.niveauAtteint, { numero: 1, titre: typographierTexte('Bases : les repères') });
  const liste = await appel(parcoursGet, { env: sansIA });
  assert.equal(liste.corps.parcours.find((p) => p.id === 'la-tour-eiffel').lecons, 1);
  const lu = await appel(palierGet, { env: sansIA, jeton: b.jeton, requete: '?parcours=la-tour-eiffel&n=1' });
  ok200(lu);
  assert.equal(lu.corps.palier.id, 'la-tour-eiffel:1');
  assert.ok(!JSON.stringify([cree.corps, lu.corps, recherche.corps, liste.corps]).includes(CLE_PERSO));
  assert.ok(!toutesLesTables().includes(CLE_PERSO));
  reinitExt();
});

// --- C. Génération de nuit ----------------------------------------------------------

const ADMIN = 'cle-admin-de-test-0123456789';
const enteteAdmin = { 'x-admin-cle': ADMIN };
const envAdmin = (extra = {}) => ({ DB: db, ADMIN_KEY: ADMIN, ...extra });

test('admin : 403 sans clé, avec une mauvaise clé, ou sans secret côté serveur — même réponse, aucun indice', async () => {
  toutVoir();
  const refus = [];
  for (const [handler, base] of [[adminGet, {}], [adminPost, { methode: 'POST', corps: { action: 'pause' } }], [adminPost, { methode: 'POST', corps: { action: 'debloquer', parcours: 'la-tour-eiffel' } }]]) {
    refus.push(await appel(handler, { ...base, env: envAdmin() }));
    refus.push(await appel(handler, { ...base, env: envAdmin(), entetes: { 'x-admin-cle': 'mauvaise' } }));
    refus.push(await appel(handler, { ...base, env: envAdmin(), entetes: { 'x-admin-cle': ADMIN + 'x' } }));
    refus.push(await appel(handler, { ...base, env: envAdmin(), entetes: { 'x-admin-cle': ADMIN.slice(0, -1) } }));
    refus.push(await appel(handler, { ...base, env: envAdmin({ ADMIN_KEY: undefined }), entetes: enteteAdmin }));
    refus.push(await appel(handler, { ...base, env: envAdmin({ ADMIN_KEY: '' }), entetes: { 'x-admin-cle': '' } }));
  }
  for (const r of refus) erreurFr(r, 403, /^Accès refusé\.$/);
  assert.equal(new Set(refus.map((r) => JSON.stringify(r.corps))).size, 1, 'toutes les réponses sont identiques');
  assert.ok(!JSON.stringify(refus).includes(ADMIN));
  assert.equal(lignes('SELECT * FROM file_attente').length, 0, 'rien n’a été mis en file');
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'file:%'").length, 0, 'ni pause ni autre réglage modifié');
  // Comparaison à temps constant : vraie seulement pour deux textes identiques non vides, quelle que soit la longueur.
  assert.equal(await secretsEgaux('a', 'a'), true);
  assert.equal(await secretsEgaux('a', 'ab'), false);
  assert.equal(await secretsEgaux('', ''), false);
  assert.equal(await secretsEgaux(undefined, 'a'), false);
  // Avec la bonne clé : 200.
  const ok = await appel(adminGet, { env: envAdmin(), entetes: enteteAdmin });
  ok200(ok);
  assert.deepEqual(ok.corps.taches, { attente: 0, en_cours: 0, fait: 0, echec: 0 });
  assert.equal(ok.corps.pause, false);
  assert.ok(!JSON.stringify(ok.corps).includes(ADMIN));
});

test('file de nuit : « debloquer » met en file leçons puis modules, dans l’ordre, sans doublon ; pause, reprendre, vider', async () => {
  await prepareProgramme();
  const poster = (corps) => appel(adminPost, { env: envAdmin(), methode: 'POST', entetes: enteteAdmin, corps });
  erreurFr(await poster({ action: 'inconnue' }), 400);
  erreurFr(await poster({ action: 'debloquer' }), 400);
  erreurFr(await poster({ action: 'debloquer', parcours: 'inconnu' }), 404);
  const d = await poster({ action: 'debloquer', parcours: 'la-tour-eiffel' });
  ok200(d);
  // Module 1 ouvert (6 leçons) : 6 leçons à écrire, puis 20 modules à ouvrir (21 au programme).
  const attendues = 6 + (NB_MODULES - 1);
  assert.equal(d.corps.ajoutees, attendues);
  assert.deepEqual(d.corps.taches, { attente: attendues, en_cours: 0, fait: 0, echec: 0 });
  assert.deepEqual(d.corps.formation, { id: 'la-tour-eiffel', programme: true, pretes: 0, total: 6, modules: NB_MODULES, ouverts: 1, enFile: attendues });
  const file = lignes('SELECT type, numero FROM file_attente ORDER BY id');
  assert.deepEqual(file.slice(0, 6), [1, 2, 3, 4, 5, 6].map((numero) => ({ type: 'lecon', numero })));
  assert.deepEqual(file.slice(6, 9), [2, 3, 4].map((numero) => ({ type: 'module', numero })), 'modules dans l’ordre des niveaux : Bases d’abord');
  // Deuxième appel : aucun doublon.
  assert.equal((await poster({ action: 'debloquer', parcours: 'la-tour-eiffel' })).corps.ajoutees, 0);
  assert.equal(lignes('SELECT COUNT(*) AS n FROM file_attente')[0].n, attendues);
  // Pause, reprise.
  assert.equal((await poster({ action: 'pause' })).corps.pause, true);
  assert.equal((await appel(adminGet, { env: envAdmin(), entetes: enteteAdmin })).corps.pause, true);
  assert.equal((await poster({ action: 'reprendre' })).corps.pause, false);
  // Vider : les tâches en attente disparaissent.
  const v = await poster({ action: 'vider' });
  ok200(v);
  assert.equal(v.corps.retirees, attendues);
  assert.equal(lignes('SELECT COUNT(*) AS n FROM file_attente')[0].n, 0);
  // Une formation sans programme ne se débloque pas.
  const old = await creerJoueur('Ancien');
  await creerParcoursTest(old, 'Le vieux format');
  erreurFr(await poster({ action: 'debloquer', parcours: 'le-vieux-format' }), 400, /sans fin/);
});

test('file de nuit (faux fournisseur) : 2 tâches par passage, mêmes tables, module ouvert puis ses leçons, aucun double travail', async () => {
  await prepareProgramme();
  const envA = envAdmin();
  ok200(await appel(adminPost, { env: envA, methode: 'POST', entetes: enteteAdmin, corps: { action: 'debloquer', parcours: 'la-tour-eiffel' } }));
  // La leçon 1 est déjà écrite « à la demande » avant le passage de nuit.
  const scJour = scenario(partiesStandard());
  const j = await creerJoueur('Lecteur');
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, scJour));
  assert.equal(lignes("SELECT etat FROM file_attente WHERE type = 'lecon' AND numero = 1")[0].etat, 'fait', 'la génération à la demande marque la tâche faite');
  const avant = lignes("SELECT contenu FROM paliers WHERE id = 'la-tour-eiffel:1'")[0].contenu;

  // Passage 1 : prend 2 tâches (leçons 2 et 3), écrites avec la même fonction que la demande.
  const sc = scenario({ ...partiesStandard(), module: [module2Brut()] });
  brancher(sc);
  const envNuit = { DB: db, AI: sc.ai };
  const b1 = await traiterFile(envNuit);
  assert.deepEqual([b1.prises, b1.faites, b1.echecs, b1.pause, b1.epuises], [2, 2, 0, false, false]);
  assert.deepEqual(lignes("SELECT numero FROM paliers WHERE parcours = 'la-tour-eiffel' ORDER BY numero").map((x) => x.numero), [1, 2, 3]);
  assert.equal(lignes("SELECT contenu FROM paliers WHERE id = 'la-tour-eiffel:1'")[0].contenu, avant, 'la leçon déjà écrite n’est pas écrasée');
  const l2 = JSON.parse(lignes("SELECT contenu FROM paliers WHERE id = 'la-tour-eiffel:2'")[0].contenu);
  assert.deepEqual(Object.keys(l2), CLES_LECON, 'même forme que la génération à la demande');
  assert.deepEqual(l2.verification.ia, [NOM_LLAMA, NOM_MISTRAL]);
  assert.equal(sc.par('verif').length, 2);
  // Passages 2 et 3 : leçons 4, 5, puis 6 et le module 2.
  assert.equal((await traiterFile(envNuit)).faites, 2);
  const b3 = await traiterFile(envNuit);
  assert.equal(b3.faites, 2, 'leçon 6, puis le module 2 (les leçons passent avant les modules)');
  assert.equal(lignes("SELECT etat FROM file_attente WHERE type = 'module' AND numero = 2")[0].etat, 'fait');
  assert.equal(sc.par('module').length, 1);
  const lire = (await appel(parcoursGet, { env: { DB: db }, requete: '?id=la-tour-eiffel' })).corps.parcours;
  assert.equal(lire.etapes.length, 2, 'le module 2 est ouvert dans la même table parcours');
  assert.deepEqual(lire.etapes[1].paliers.map((p) => p.numero), [7, 8, 9, 10, 11, 12]);
  // Les leçons du module 2 sont mises en file à son ouverture, et passent avant le module 3.
  assert.deepEqual(lignes("SELECT numero FROM file_attente WHERE type = 'lecon' AND etat = 'attente' ORDER BY id").map((x) => x.numero), [7, 8, 9, 10, 11, 12]);
  const b4 = await traiterFile(envNuit);
  assert.equal(b4.faites, 2);
  assert.deepEqual(lignes('SELECT numero FROM paliers ORDER BY numero').map((x) => x.numero), [1, 2, 3, 4, 5, 6, 7, 8]);
  // Un lecteur voit ces leçons instantanément (cache), sans IA.
  const lu = await appel(palierGet, { env: { DB: db }, jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=8' });
  ok200(lu);
  assert.equal(lu.corps.palier.numero, 8);
  // Le bilan de l'admin.
  const etat = (await appel(adminGet, { env: envA, entetes: enteteAdmin, requete: '?parcours=la-tour-eiffel' })).corps;
  assert.equal(etat.taches.fait, 9, 'leçons 1 à 8 et module 2');
  assert.equal(etat.formation.pretes, 8);
  assert.equal(etat.formation.total, 12);
  assert.equal(etat.formation.ouverts, 2);
  // Export pour audit : 403 sans clé (même réponse), 404 inconnu, contenu correct avec la clé, aucun secret.
  const refusExport = [await appel(adminGet, { env: envA, requete: '?export=la-tour-eiffel' }), await appel(adminGet, { env: envA, entetes: { 'x-admin-cle': 'mauvaise' }, requete: '?export=la-tour-eiffel' })];
  for (const r of refusExport) erreurFr(r, 403, /^Accès refusé\.$/);
  erreurFr(await appel(adminGet, { env: envA, entetes: enteteAdmin, requete: '?export=inconnu' }), 404);
  const exp = await appel(adminGet, { env: envA, entetes: enteteAdmin, requete: '?export=la-tour-eiffel' });
  ok200(exp);
  assert.equal(exp.corps.id, 'la-tour-eiffel');
  assert.equal(typeof exp.corps.titre, 'string');
  assert.ok(exp.corps.programme && Array.isArray(exp.corps.programme.niveaux), 'programme présent');
  assert.deepEqual(exp.corps.lecons.map((x) => x.numero), [1, 2, 3, 4, 5, 6, 7, 8]);
  const e2 = exp.corps.lecons.find((x) => x.numero === 2);
  assert.equal(e2.verification.statut, l2.verification.statut);
  assert.deepEqual(e2.verification.ia, [NOM_LLAMA, NOM_MISTRAL]);
  assert.equal(e2.modele, NOM_LLAMA);
  assert.deepEqual(e2.contenu, l2);
  assert.ok(!JSON.stringify(exp.corps).includes(ADMIN), 'aucune clé dans l’export');
});

test('file de nuit : échec = essai de plus, 3 essais au plus puis « echec » ; interrompue = reprise après 6 min ; pause = rien', async () => {
  await prepareProgramme();
  const envNuit = (sc) => ({ DB: db, AI: sc.ai });
  await debloquer(envAdmin(), 'la-tour-eiffel');
  db.base.exec("DELETE FROM file_attente WHERE NOT (type = 'lecon' AND numero = 1)"); // une seule tâche : la leçon 1
  const panne = scenario({ ...partiesStandard(), lecon: [new Error('Workers AI en panne')] });
  brancher(panne);
  const etats = [];
  for (let i = 0; i < 3; i++) {
    const b = await traiterFile(envNuit(panne));
    etats.push([b.prises, b.faites, b.echecs, lignes('SELECT etat, essais FROM file_attente')[0]]);
  }
  assert.deepEqual(etats, [
    [1, 0, 0, { etat: 'attente', essais: 1 }],
    [1, 0, 0, { etat: 'attente', essais: 2 }],
    [1, 0, 1, { etat: 'echec', essais: 3 }],
  ]);
  assert.match(lignes('SELECT erreur FROM file_attente')[0].erreur, /Le Rival n’a pas réussi|cause/);
  assert.equal(lignes('SELECT COUNT(*) AS n FROM paliers')[0].n, 0, 'rien n’est publié sur un échec');
  assert.equal((await traiterFile(envNuit(panne))).prises, 0, 'une tâche en échec n’est plus prise');
  // Le bilan de l'admin montre l'échec et la dernière erreur.
  const e = await etatFile(envAdmin());
  assert.equal(e.taches.echec, 1);
  assert.equal(e.derniereErreur.numero, 1);
  // « debloquer » remet la tâche en échec dans la file, avec le reste de la formation.
  assert.equal(await debloquer(envAdmin(), 'la-tour-eiffel'), 6 + (NB_MODULES - 1));
  assert.deepEqual(lignes("SELECT etat, essais FROM file_attente WHERE type = 'lecon' AND numero = 1")[0], { etat: 'attente', essais: 0 });
  // Tâche interrompue (« en_cours » depuis plus de 6 minutes) : reprise, l'essai compte.
  db.base.exec('DELETE FROM file_attente');
  db.base.exec("INSERT INTO file_attente (parcours, type, numero, etat, essais, maj) VALUES ('la-tour-eiffel', 'lecon', 1, 'en_cours', 0, '2026-01-01T00:00:00.000Z')");
  db.base.exec("INSERT INTO file_attente (parcours, type, numero, etat, essais, maj) VALUES ('la-tour-eiffel', 'lecon', 2, 'en_cours', 0, '" + new Date().toISOString() + "')");
  const bonne = scenario(partiesStandard());
  brancher(bonne);
  const b = await traiterFile(envNuit(bonne));
  assert.equal(b.reprises, 1, 'seule la vieille tâche est reprise');
  assert.equal(b.faites, 1);
  assert.equal(lignes('SELECT etat FROM file_attente WHERE numero = 1')[0].etat, 'fait');
  assert.equal(lignes('SELECT essais FROM file_attente WHERE numero = 1')[0].essais, 1, 'la reprise compte comme un essai');
  assert.equal(lignes('SELECT etat FROM file_attente WHERE numero = 2')[0].etat, 'en_cours', 'la tâche récente n’est pas touchée');
  // Pause : rien n'est pris, rien n'est consommé.
  db.base.exec("UPDATE file_attente SET etat = 'attente' WHERE numero = 2");
  await definirPause(envAdmin(), true);
  const aucun = scenario(partiesStandard());
  const bp = await traiterFile(envNuit(aucun));
  assert.deepEqual([bp.pause, bp.prises, aucun.appels.length], [true, 0, 0]);
  await definirPause(envAdmin(), false);
  assert.equal((await traiterFile(envNuit(aucun))).faites, 1);
});

test('file de nuit : tous les fournisseurs du serveur épuisés = rien consommé, tâches laissées en attente, essais intacts', async () => {
  await prepareProgramme();
  await debloquer(envAdmin(), 'la-tour-eiffel');
  const sc = scenario(partiesStandard());
  const envNuit = { DB: db, AI: sc.ai };
  // 1) Déjà connus épuisés : le passage ne tente rien.
  marquerEpuise('workers-ai');
  assert.equal(tousEpuises(envNuit), true);
  const b = await traiterFile(envNuit);
  assert.deepEqual([b.epuises, b.prises, sc.appels.length], [true, 0, 0]);
  assert.equal(lignes("SELECT COUNT(*) AS n FROM file_attente WHERE etat = 'attente'")[0].n, 6 + NB_MODULES - 1);
  assert.equal((await etatFile(envAdmin())).epuises.includes('Workers AI'), true, 'l’admin voit les fournisseurs épuisés');
  // 2) Épuisés pendant le passage (4006 de Workers AI) : l'essai ne compte pas.
  oublierEpuisements();
  const quota = scenario({ ...partiesStandard(), lecon: [new Error('4006: you have used up your daily free allocation of 10,000 neurons')] });
  const b2 = await traiterFile({ DB: db, AI: quota.ai });
  assert.equal(b2.epuises, true);
  assert.equal(b2.reportees, 1);
  assert.deepEqual(lignes("SELECT etat, essais FROM file_attente WHERE type = 'lecon' AND numero = 1")[0], { etat: 'attente', essais: 0 });
  assert.equal(lignes("SELECT COUNT(*) AS n FROM file_attente WHERE etat = 'en_cours'")[0].n, 0);
  assert.equal(lignes('SELECT COUNT(*) AS n FROM paliers')[0].n, 0);
  oublierEpuisements();
});

test('file de nuit : les tâches utilisent les clés du serveur', async () => {
  await prepareProgramme();
  await debloquer(envAdmin(), 'la-tour-eiffel');
  db.base.exec("DELETE FROM file_attente WHERE NOT (type = 'lecon' AND numero = 2)");
  const sc = scenario(partiesStandard());
  ext.gemini = geminiVers(sc);
  ext.glm = sc.glm;
  const b = await traiterFile({ DB: db, AI: sc.ai, GEMINI_API_KEY: CLE_GEMINI, GLM_API_KEY: CLE_GLM });
  assert.equal(b.faites, 1);
  assert.equal(new Headers(ext.appels.find((a) => a.fournisseur === 'gemini').init.headers).get('x-goog-api-key'), CLE_GEMINI);
  reinitExt();
});

test('relecture lot 5 : module ouvert à la demande — ses leçons sont mises en file quand sa tâche de nuit existe', async () => {
  const j = await prepareProgramme();
  await debloquer(envAdmin(), 'la-tour-eiffel');
  db.base.exec("DELETE FROM file_attente WHERE NOT (type = 'module' AND numero = 2)");
  const sc = scenario({ ...partiesStandard(), module: [module2Brut()] });
  ok200(await lirePalier(j, 'la-tour-eiffel', 7, sc)); // 7 = première leçon du module 2 : le module s'ouvre à la demande
  assert.equal(lignes("SELECT etat FROM file_attente WHERE type = 'module' AND numero = 2")[0].etat, 'fait');
  assert.deepEqual(lignes("SELECT numero FROM file_attente WHERE type = 'lecon' AND etat = 'attente' ORDER BY numero").map((x) => x.numero), [8, 9, 10, 11, 12]);
  assert.equal(lignes("SELECT etat FROM file_attente WHERE type = 'lecon' AND numero = 7")[0].etat, 'fait');
});

test('relecture lot 5 : une tâche de nuit en cours (moins de 2 min) bloque la génération à la demande ; plus vieille, elle ne bloque plus', async () => {
  const j = await prepareProgramme();
  const maintenantIso = new Date().toISOString();
  db.base.prepare("INSERT INTO file_attente (parcours, type, numero, etat, essais, maj) VALUES ('la-tour-eiffel', 'lecon', 2, 'en_cours', 0, ?)").run(maintenantIso);
  const sc = scenario(partiesStandard());
  const r = await lirePalier(j, 'la-tour-eiffel', 2, sc);
  erreurFr(r, 409, /en cours d’écriture, réessaie dans un instant/);
  assert.equal(sc.par('lecon').length + sc.par('verif').length, 0, 'aucune génération relancée');
  db.base.prepare("UPDATE file_attente SET maj = ? WHERE numero = 2").run(new Date(Date.now() - 3 * 60 * 1000).toISOString());
  ok200(await lirePalier(j, 'la-tour-eiffel', 2, sc));
});

test('relecture lot 5 : en-tête x-cle-ia mal formé ignoré en lecture du cache ; refusé seulement quand il faut générer', async () => {
  const j = await prepareProgramme();
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, scenario(partiesStandard())));
  const sc = scenario(partiesStandard());
  const lu = await appel(palierGet, { env: envDe(sc), jeton: j.jeton, entetes: { 'x-cle-ia': 'pas une clé valide !' }, requete: '?parcours=la-tour-eiffel&n=1' });
  ok200(lu);
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, entetes: { 'x-cle-ia': 'pas une clé valide !' }, requete: '?parcours=la-tour-eiffel&n=2' }), 400);
});

test('relecture lot 5 : une clé GLM personnelle n’essaie que les adresses z.ai, jamais open.bigmodel.cn', async () => {
  const j = await prepareProgramme();
  reinitExt();
  ext.glm = () => new Response('oups', { status: 500 });
  const sc = scenario(partiesStandard());
  await appel(palierGet, { env: envDe(sc), jeton: j.jeton, entetes: { 'x-cle-ia': 'glm:abcdefgh.ijklmnop' }, requete: '?parcours=la-tour-eiffel&n=3' });
  const glm = ext.appels.filter((a) => a.fournisseur === 'glm');
  assert.ok(glm.length > 0);
  assert.ok(glm.every((a) => String(a.url).includes('api.z.ai')), 'z.ai seulement');
  reinitExt();
});

test('relecture lot 5 : admin — 20 essais par jour et par adresse ; diagnostic — clé par en-tête x-diag-cle, temps constant', async () => {
  toutVoir();
  const ip = '198.51.100.99';
  let dernier;
  for (let i = 0; i < 20; i++) dernier = await appel(adminGet, { env: envAdmin(), entetes: { 'x-admin-cle': 'mauvaise' }, ip });
  erreurFr(dernier, 403, /^Accès refusé\.$/);
  // 21e essai : refusé même avec la bonne clé, avec le même message.
  erreurFr(await appel(adminGet, { env: envAdmin(), entetes: enteteAdmin, ip }), 403, /^Accès refusé\.$/);
  ok200(await appel(adminGet, { env: envAdmin(), entetes: enteteAdmin, ip: '198.51.100.100' }));
  const e = { ...env, DIAG_KEY: 'sésame' };
  erreurFr(await appel(diagnosticGet, { env: e, entetes: { 'x-diag-cle': 'faux' } }), 404);
  ok200(await appel(diagnosticGet, { env: e, entetes: { 'x-diag-cle': 'sésame' } }));
  ok200(await appel(diagnosticGet, { env: e, requete: '?cle=sésame' }));
});

test('relecture lot 5 : plafond quotidien de 300 tâches', async () => {
  await prepareProgramme();
  await debloquer(envAdmin(), 'la-tour-eiffel');
  const jour = new Date().toISOString().slice(0, 10);
  db.base.prepare('INSERT OR REPLACE INTO quotas (cle, n, jour) VALUES (?, ?, ?)').run('file:jour', 300, jour);
  const sc = scenario(partiesStandard());
  brancher(sc);
  const b = await traiterFile({ DB: db, AI: sc.ai });
  assert.equal(b.prises, 0);
  assert.equal(b.plafond, true);
  assert.equal(lignes("SELECT etat FROM file_attente WHERE etat != 'attente'").length, 0, 'tout reste en attente');
});

// --- C2. Cascade Gemini par modèle, fenêtre nuit / jour ------------------------------

const GEM = { cle: { AI: {}, GEMINI_API_KEY: CLE_GEMINI } };
const modelesAppeles = () => ext.appels.filter((a) => a.fournisseur === 'gemini').map((a) => a.url.pathname.split('/').pop().replace(':generateContent', ''));
const etatsGemini = () => Object.fromEntries(etatModelesGemini().map((m) => [m.modele, m.etat]));
// Faux Gemini : `pannes` = { modèle: () => Response } ; les autres modèles répondent.
const fauxGemini = (pannes) => (u) => {
  const modele = u.pathname.split('/').pop().replace(':generateContent', '');
  return pannes[modele] ? pannes[modele]() : reponseGemini('{"ok":1}');
};
const appelGemini = () => tousLesFournisseurs(GEM.cle).find((f) => f.famille === 'gemini').appeler(MSG, { maxTokens: 5, delaiMs: 1000 });
const MIN10 = 10 * 60 * 1000;

test('cascade Gemini : 429 -> modèle marqué épuisé 10 min et suivant dans le même appel ; l’appel suivant repart du meilleur disponible', async () => {
  reinitExt();
  ext.gemini = fauxGemini({ 'gemini-3-flash-preview': () => new Response('quota', { status: 429 }) });
  assert.deepEqual(extraireObjet(await appelGemini()), { ok: 1 });
  assert.deepEqual(modelesAppeles(), ['gemini-3-flash-preview', 'gemini-2.5-flash']);
  assert.equal(etatsGemini()['gemini-3-flash-preview'], 'epuise');
  assert.equal(estEpuise('gemini'), false, 'la famille n’est pas épuisée tant qu’un modèle reste');
  // 2e appel : le modèle marqué n'est pas rappelé, on ne reste pas figé sur le modèle de repli non plus.
  ext.appels.length = 0;
  await appelGemini();
  assert.deepEqual(modelesAppeles(), ['gemini-2.5-flash']);
  // Après 10 minutes, on repart du meilleur.
  horloge.t += MIN10 + 1000;
  ext.appels.length = 0;
  await appelGemini();
  assert.deepEqual(modelesAppeles(), ['gemini-3-flash-preview', 'gemini-2.5-flash'], 'il répond 429 de nouveau : remarqué, le suivant répond');
  assert.equal(etatsGemini()['gemini-3-flash-preview'], 'epuise');
  reinitExt();
});

test('cascade Gemini : quota « par jour » = 3 h ; modèle inconnu (404 ou 400) = indisponible 24 h ; 5xx = suivant sans marquer', async () => {
  reinitExt();
  ext.gemini = fauxGemini({
    'gemini-3-flash-preview': () => new Response('{"error":{"message":"Quota exceeded ... GenerateRequestsPerDayPerProjectPerModel-FreeTier"}}', { status: 429 }),
    'gemini-2.5-flash': () => new Response('not found', { status: 404 }),
    'gemini-flash-latest': () => new Response('{"error":{"message":"models/gemini-flash-latest is not found for API version v1beta"}}', { status: 400 }),
    'gemini-flash-lite-latest': () => new Response('boom', { status: 503 }),
  });
  await appelGemini();
  assert.deepEqual(modelesAppeles(), ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite']);
  assert.deepEqual(etatsGemini(), {
    'gemini-3-flash-preview': 'epuise', 'gemini-2.5-flash': 'indisponible', 'gemini-flash-latest': 'indisponible',
    'gemini-flash-lite-latest': 'ok', 'gemini-3.5-flash-lite': 'ok', 'gemini-3.1-flash-lite': 'ok', 'gemini-2.5-flash-lite': 'ok',
    'gemini-2.0-flash': 'ok', 'gemini-2.0-flash-lite': 'ok',
  });
  // Le 5xx n'est pas marqué : il est retenté à l'appel suivant, les autres sont sautés.
  ext.appels.length = 0;
  await appelGemini();
  assert.deepEqual(modelesAppeles(), ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite']);
  // Après 3 h (et 10 min), le modèle « par jour » revient ; l'indisponible reste écarté jusqu'à 24 h.
  horloge.t += MIN10 + 1000;
  assert.equal(etatsGemini()['gemini-3-flash-preview'], 'epuise');
  horloge.t += 3 * 60 * 60 * 1000;
  assert.deepEqual([etatsGemini()['gemini-3-flash-preview'], etatsGemini()['gemini-2.5-flash']], ['ok', 'indisponible']);
  horloge.t += 21 * 60 * 60 * 1000;
  assert.equal(etatsGemini()['gemini-2.5-flash'], 'ok');
  reinitExt();
});

test('cascade Gemini : famille épuisée seulement si tous les modèles le sont ; le diagnostic liste l’état de chacun sans appeler les modèles marqués', async () => {
  reinitExt();
  const toutes429 = Object.fromEntries(GEMINI_MODELES.map((m) => [m, () => new Response('quota', { status: 429 })]));
  ext.gemini = fauxGemini(toutes429);
  await assert.rejects(() => appelGemini(), (e) => e.epuise === true && e.details.length === 9);
  assert.equal(modelesAppeles().length, 9);
  assert.equal(estEpuise('gemini'), true);
  assert.deepEqual(nomsEpuises(), ['Gemini']);
  assert.equal(tousEpuises({ AI: undefined, GEMINI_API_KEY: CLE_GEMINI }), true);
  // Tout est marqué : un nouvel appel échoue tout de suite, sans toucher à Gemini.
  ext.appels.length = 0;
  await assert.rejects(() => appelGemini(), (e) => e.epuise === true);
  assert.equal(ext.appels.length, 0);
  // Diagnostic : l'état de chaque modèle, aucun appel à un modèle marqué.
  const env = { ...GEM.cle, DIAG_KEY: 'sésame' };
  const d = await appel(diagnosticGet, { env, requete: '?cle=sésame' });
  ok200(d);
  assert.equal(modelesAppeles().length, 0, 'aucun modèle marqué n’est appelé par le diagnostic');
  assert.deepEqual(d.corps.modelesGemini.map((m) => [m.modele, m.etat]), GEMINI_MODELES.map((m) => [m, 'epuise']));
  assert.ok(d.corps.modelesGemini.every((m) => /^\d{4}-\d\d-\d\dT/.test(m.jusqua)));
  // Un seul modèle libéré : la famille repart avec lui.
  horloge.t += MIN10 + 1000;
  ext.gemini = fauxGemini({ ...toutes429, 'gemini-2.0-flash-lite': () => reponseGemini('{"ok":2}') });
  marquerModeleGemini('gemini-3-flash-preview', 'epuise', MIN10); // un seul modèle écarté parmi les neuf
  assert.equal(estEpuise('gemini'), false);
  reinitExt();
});

test('cascade Gemini : clé personnelle sans mémoire partagée ; réflexion coupée avec repli conservés dans la cascade', async () => {
  reinitExt();
  ext.gemini = fauxGemini({ 'gemini-3-flash-preview': () => new Response('quota', { status: 429 }) });
  const perso = fournisseurPerso({ clePerso: { fournisseur: 'gemini', cle: CLE_PERSO } });
  await perso.appeler(MSG, { maxTokens: 5, delaiMs: 1000 });
  assert.deepEqual(modelesAppeles(), ['gemini-3-flash-preview', 'gemini-2.5-flash']);
  assert.deepEqual(etatsGemini()['gemini-3-flash-preview'], 'ok', 'le quota d’une clé personnelle n’écarte rien pour le serveur');
  reinitExt();
});

test('file : hors de la nuit (0 à 5 h UTC) le cron ne travaille pas, sauf « Travailler aussi en journée » ; état et action de l’admin', async () => {
  await prepareProgramme();
  await debloquer(envAdmin(), 'la-tour-eiffel');
  const sc = scenario(partiesStandard());
  brancher(sc);
  const envNuit = { DB: db, AI: sc.ai };
  const a = (h, m = 0) => ({ maintenant: new Date(Date.UTC(2026, 9, 20, h, m)) });
  // Journée : rien n'est pris ni appelé.
  for (const h of [6, 12, 23]) {
    const b = await traiterFile(envNuit, a(h));
    assert.deepEqual([b.horsFenetre, b.prises, b.pause], [true, 0, false], 'à ' + h + ' h UTC');
  }
  assert.equal(sc.appels.length, 0);
  assert.equal(lignes("SELECT COUNT(*) AS n FROM file_attente WHERE etat != 'attente'")[0].n, 0);
  // Nuit : 0 h et 5 h 55 UTC travaillent.
  assert.equal((await traiterFile(envNuit, a(0, 0))).prises, 2);
  assert.equal((await traiterFile(envNuit, a(5, 55))).prises, 2);
  assert.equal((await traiterFile(envNuit, a(6, 0))).horsFenetre, true);
  // Admin : état renvoyé par GET, action « jour » true/false (booléen obligatoire).
  const poster = (corps) => appel(adminPost, { env: envAdmin(), methode: 'POST', entetes: enteteAdmin, corps });
  assert.equal((await appel(adminGet, { env: envAdmin(), entetes: enteteAdmin })).corps.jour, false);
  erreurFr(await poster({ action: 'jour' }), 400);
  erreurFr(await poster({ action: 'jour', valeur: 'oui' }), 400);
  assert.equal(await enJournee(envAdmin()), false);
  const on = await poster({ action: 'jour', valeur: true });
  ok200(on);
  assert.equal(on.corps.jour, true);
  assert.equal((await appel(adminGet, { env: envAdmin(), entetes: enteteAdmin })).corps.jour, true);
  // Autorisé : le cron travaille aussi à midi.
  const b = await traiterFile(envNuit, a(12));
  assert.deepEqual([b.horsFenetre, b.prises], [false, 2]);
  // La pause reste prioritaire en journée.
  await definirPause(envAdmin(), true);
  assert.equal((await traiterFile(envNuit, a(12))).pause, true);
  await definirPause(envAdmin(), false);
  // Retour à « non ».
  assert.equal((await poster({ action: 'jour', valeur: false })).corps.jour, false);
  assert.equal((await traiterFile(envNuit, a(12))).horsFenetre, true);
  await definirJournee(envAdmin(), false);
  // Par défaut (sans horloge fournie) la fenêtre se juge sur l'heure UTC courante : cohérent avec traiterFileReel.
  const maintenant = new Date(Date.now());
  const attendu = maintenant.getUTCHours() <= 5;
  assert.equal((await traiterFileReel(envNuit)).horsFenetre, !attendu);
  // Le cron se réveille toute la journée ; le plafond est de 300 par jour.
  assert.match(readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8'), /^crons = \["\*\/5 \* \* \* \*"\]$/m);
  assert.equal(PLAFOND_JOUR, 300);
});

// --- D. Bibliothèque et profondeur ---------------------------------------------------

test('programme : « essentiel » facultatif, environ 40 %, au moins 2 par niveau ; anciens programmes inchangés', async () => {
  const p = validerProgramme(programmeBrut()).valeur;
  const marques = p.niveaux.map((n) => n.modules.filter((m) => m.essentiel === true).length);
  assert.ok(marques.every((n) => n >= 2), 'au moins 2 par niveau : ' + marques);
  const total = marques.reduce((a, b) => a + b, 0);
  assert.ok(total / NB_MODULES >= 0.3 && total / NB_MODULES <= 0.55, 'environ 40 % : ' + total);
  assert.ok(p.niveaux.every((n) => n.modules.every((m) => m.essentiel === undefined || m.essentiel === true)), 'jamais essentiel: false');
  assert.deepEqual(modulesDe(p).map((m) => m.numero), Array.from({ length: NB_MODULES }, (_, i) => i + 1), 'les numéros globaux ne changent pas');
  // L'IA a marqué un seul module : chaque niveau en compte 2 au moins (les premiers du niveau complètent).
  const peu = programmeBrut();
  for (const n of peu.niveaux) for (const m of n.modules) delete m.essentiel;
  peu.niveaux[0].modules[2].essentiel = true;
  const v = validerProgramme(peu).valeur;
  assert.deepEqual(v.niveaux.map((n) => n.modules.filter((m) => m.essentiel).length), [2, 2, 2, 2]);
  assert.deepEqual(v.niveaux[0].modules.map((m) => !!m.essentiel), [true, false, true, false, false, false], 'le marquage de l’IA est gardé, les premiers complètent');
  // Un ancien programme (aucun marquage) reste tel quel.
  const ancien = programmeBrut();
  for (const n of ancien.niveaux) for (const m of n.modules) delete m.essentiel;
  const a = validerProgramme(ancien).valeur;
  assert.ok(a.niveaux.every((n) => n.modules.every((m) => !('essentiel' in m))));
  // « Aller plus loin » : les modules ajoutés ne sont jamais marqués (Complet seulement).
  const prolonge = prolongementBrut();
  prolonge.modules[0].essentiel = true;
  assert.ok(validerProlongement(prolonge, { programme: p }).valeur.niveau.modules.every((m) => !('essentiel' in m)));
  assert.match(PROMPT_PROGRAMME, /"essentiel": true sur environ 40 % des modules \(au moins 2 par niveau\)/);
  assert.match(PROMPT_PROGRAMME_COURT, /essentiel/);
});

// --- E. Qualité des leçons ------------------------------------------------------------

test('leçon : objectif mesurable et rappel facultatifs (jamais bloquants), non vérifiés comme des faits ; questions de compréhension et d’application', async () => {
  const a = validerMoitieA(leconBrute());
  assert.equal(a.valeur.objectif, EXEMPLE_LECON.objectif);
  assert.equal(a.valeur.rappel, EXEMPLE_LECON.rappel);
  assert.match(EXEMPLE_LECON.objectif, /^À la fin, tu sauras/);
  // Invalides ou absents : la leçon n'échoue jamais.
  for (const mauvais of [undefined, null, 5, 'court', 'x'.repeat(301), 'Bienvenue : à la fin, tu sauras tout sur cette tour incontournable.']) {
    const brut = leconBrute();
    brut.objectif = mauvais;
    brut.rappel = mauvais;
    const r = validerMoitieA(brut);
    assert.ok(r.valeur, String(mauvais));
    assert.equal(r.valeur.objectif, null);
    assert.equal(r.valeur.rappel, null);
  }
  const sans = leconBrute();
  delete sans.objectif;
  delete sans.rappel;
  assert.ok(validerMoitieA(sans).valeur && validerRedaction(sans, { lecon: true }).valeur);
  assert.equal(validerMoitieA(leconBrute(), { court: true }).valeur.objectif, null, 'la version courte ne les demande pas');
  // Les prompts les demandent (moitié A), sans allonger les limites de jetons.
  for (const prompt of [PROMPT_LECON, PROMPT_LECON_A]) {
    assert.match(prompt, /objectif : une phrase[^\n]*À la fin, tu sauras/);
    assert.match(prompt, /rappel : 1 à 2 phrases[^\n]*vues juste avant/);
  }
  assert.ok(!PROMPT_LECON_A_COURT.includes('objectif :'));
  assert.ok(!PROMPT_LECON_B.includes('objectif :'));
  for (const prompt of [PROMPT_LECON, PROMPT_LECON_B, PROMPT_LECON_B_COURT, PROMPT_PALIER]) assert.match(prompt, /compréhension/);
  for (const prompt of [PROMPT_LECON, PROMPT_LECON_B]) assert.match(prompt, /d’application/);
  // Ils ne sont pas des affirmations de fait à vérifier : le nombre d'affirmations d'une leçon ne change pas.
  assert.equal(aplatir(validerRedaction(leconBrute(), { lecon: true }).valeur).flatMap((u) => u.textes).length, TOTAL_LECON);
});

test('leçon écrite : objectif et rappel sont conservés par la vérification et publiés avec la leçon', async () => {
  const j = await prepareProgramme();
  const sc = scenario(partiesStandard());
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  assert.equal(r.corps.palier.objectif.replace(/[  ]/g, ' '), EXEMPLE_LECON.objectif);
  assert.equal(r.corps.palier.rappel.replace(/[  ]/g, ' '), EXEMPLE_LECON.rappel);
  // Même quand une affirmation est retirée par le vérificateur.
  const sc2 = scenario({ ...partiesStandard(), verif: [verifNumeros(1)] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2);
  ok200(r2);
  assert.ok(r2.corps.palier.objectif && r2.corps.palier.rappel);
  assert.equal(r2.corps.palier.verification.statut, 'partiel');
});


// --- Robustesse ------------------------------------------------------------

test('une panne de la base donne un JSON français 503, pas une page d’erreur', async () => {
  const cassee = { prepare() { throw new Error('D1 injoignable'); }, batch: async () => [] };
  const r = await appel(cercleGet, { env: { DB: cassee }, jeton: 'abcdefghij12.' + 'a'.repeat(32) });
  erreurFr(r, 503, /momentanément indisponible/);
});

test('initBase n’exécute les CREATE TABLE qu’une fois pour toute la série', async () => {
  assert.equal(db.compteurs.batchs, 1);
});

test('aucun secret dans le code', async () => {
  const fichiers = ['../lib/api.js', '../lib/libre.js', '../lib/wiki.js', '../lib/sujets.js', '../lib/questions.js', '../worker.js',
    '../functions/api/etat.js', '../functions/api/joueur.js', '../functions/api/progression.js', '../functions/api/cercle.js',
    '../functions/api/libre.js', '../functions/api/signalement.js', '../functions/api/sujets.js', '../functions/api/sujet.js',
    '../functions/api/chapitre-ia.js', '../functions/api/melange.js', '../functions/api/duel.js', '../functions/api/duels.js',
    '../lib/fournisseurs.js', '../lib/images.js', '../lib/paliers.js', '../functions/api/parcours.js',
    '../functions/api/palier.js', '../functions/api/quiz.js', '../functions/api/quiz-direct.js', '../functions/api/glossaire.js',
    '../functions/api/image.js', '../functions/api/quiz-general.js', '../functions/api/jour.js', '../functions/api/tournoi.js',
    '../lib/general.js', '../lib/groupes.js', '../lib/parties.js', '../functions/api/groupe.js', '../functions/api/partie.js', '../scripts/serveur_local.mjs', '../wrangler.toml',
    '../lib/generation.js', '../lib/sources.js', '../lib/nuit.js', '../functions/api/admin.js', '../functions/api/cle-ia.js', '../functions/api/diagnostic.js', '../functions/api/compte.js', '../functions/api/amis.js', '../lib/comptes.js'];
  for (const f of fichiers) {
    const texte = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/(api[_-]?key|secret|token|password|mot de passe)\s*[:=]\s*['"][^'"]{8,}/i.test(texte), f);
  }
});

// =============================================================================
// Audit des leçons : ancrage sur sources, vérification à 3 verdicts, seuil et réécriture, admin « reecrire », rédacteur unique
// =============================================================================

// Vérificateur à verdicts : pour chaque affirmation dont le texte correspond à un motif, [motif, 'faux' | 'incertain', correction].
const verdictsSi = (...regles) => ({ messages }) => {
  const texte = messages[1].content;
  const liste = texte.slice(texte.indexOf('Affirmations à vérifier :')).split('\n');
  const verdicts = [];
  for (const l of liste) {
    const m = /^(\d+)\. (.*)$/.exec(l);
    if (!m) continue;
    const regle = regles.find(([motif]) => motif.test(m[2]));
    if (regle) verdicts.push({ n: Number(m[1]), v: regle[1], ...(regle[2] ? { c: regle[2] } : {}) });
  }
  return { verdicts };
};
const verdictsNumeros = (verdict, ...numeros) => ({ verdicts: numeros.map((n) => ({ n, v: verdict })) });
const CORRECTION_COMMENT = 'Les pièces de fer sont préparées en atelier à Levallois-Perret, puis assemblées sur le chantier.';

test('validerVerdicts : trois verdicts, correction seulement pour « faux », « vrai » ignoré, ancienne forme acceptée', async () => {
  const v = validerVerdicts({ verdicts: [
    { n: 2, v: 'faux', c: '  Une   correction  ' }, { n: 5, v: 'incertain', c: 'ignorée' }, { n: 7, v: 'vrai' }, { n: 2, v: 'incertain' },
    { n: 99, v: 'faux' }, { n: 0, v: 'faux' }, { n: '9', v: 'Fausse' }, { n: 11, v: 'bizarre' }, null, 'x',
  ] }, 25).valeur;
  assert.deepEqual(v, [
    { n: 2, verdict: 'faux', correction: 'Une correction' },
    { n: 5, verdict: 'incertain', correction: null },
    { n: 9, verdict: 'faux', correction: null },
    { n: 11, verdict: 'incertain', correction: null },
  ]);
  assert.deepEqual(validerVerdicts({ verdicts: [] }, 25).valeur, []);
  assert.deepEqual(validerVerdicts({ nonConfirmees: [3, 1] }, 25).valeur, [{ n: 1, verdict: 'faux', correction: null }, { n: 3, verdict: 'faux', correction: null }]);
  for (const mauvais of [null, [], 'rien', {}, { verdicts: 3 }, { autre: [] }]) assert.ok(validerVerdicts(mauvais, 25).raison, JSON.stringify(mauvais));
});

test('evaluer : « faux » remplace par la correction, sinon retire ; « incertain » garde si les extraits soutiennent, sinon retire', async () => {
  const viable = (b) => b.sections.enBref !== null && b.questions.length >= 1;
  const brouillon = () => validerRedaction(leconBrute(), { lecon: true }).valeur;
  const textes = aplatir(brouillon()).flatMap((u) => u.textes);
  assert.equal(textes.length, TOTAL_LECON);
  const ev = (verdicts, options = {}) => evaluer(brouillon(), verdicts, 2, viable, options);
  // faux + correction : la phrase est remplacée (même section, même rang), rien n'est retiré.
  const a = ev([{ n: 4, verdict: 'faux', correction: CORRECTION_COMMENT }]);
  assert.equal(a.brouillon.sections.comment[0], CORRECTION_COMMENT);
  assert.equal(a.brouillon.sections.comment.length, 2);
  assert.deepEqual([a.retirees, a.corrigees, a.affirmations], [0, 1, TOTAL_LECON]);
  assert.equal(a.aRefaire, false);
  assert.deepEqual(a.rejets, [`« ${textes[3]} » est faux. Correction : ${CORRECTION_COMMENT}`]);
  // faux sans correction, ou correction invalide (trop courte) : la phrase est retirée.
  for (const correction of [null, 'Trop court.']) {
    const b = ev([{ n: 4, verdict: 'faux', correction }]);
    assert.equal(b.brouillon.sections.comment.length, 1);
    assert.deepEqual([b.retirees, b.corrigees], [1, 0]);
  }
  // Définition : la correction est la définition seule (le préfixe « terme : » est ignoré). Carte : le verso.
  const d = ev([{ n: 8, verdict: 'faux', correction: 'Fer puddlé : Fer affiné en brassant la fonte en fusion jusqu’à en retirer le carbone.' }]);
  assert.deepEqual(d.brouillon.definitions[0], { terme: 'Fer puddlé', definition: 'Fer affiné en brassant la fonte en fusion jusqu’à en retirer le carbone.' });
  const iCarte = textes.findIndex((t) => t.startsWith('Carte : Qu’est-ce qu’un rivet'));
  const c = ev([{ n: iCarte + 1, verdict: 'faux', correction: 'Une tige métallique à tête, écrasée à chaud pour assembler deux pièces.' }]);
  assert.equal(c.brouillon.cartes[1].verso, 'Une tige métallique à tête, écrasée à chaud pour assembler deux pièces.');
  assert.equal(c.brouillon.cartes[1].recto, 'Qu’est-ce qu’un rivet ?');
  // Un chiffre ou une bonne réponse de question ne se corrigent pas : retirés.
  assert.equal(ev([{ n: 13, verdict: 'faux', correction: 'Une phrase de correction assez longue.' }]).retirees >= 1, true);
  // incertain : gardé si les extraits soutiennent la phrase, retiré sinon.
  const pages = [{ langue: 'fr', titre: 'Rivet', texte: 'Les pièces de fer sont fabriquées en atelier, puis assemblées sur le chantier à Paris.' }];
  const gardee = ev([{ n: 4, verdict: 'incertain', correction: null }], { pages });
  assert.deepEqual([gardee.retirees, gardee.corrigees, gardee.rejets], [0, 0, []]);
  const retiree = ev([{ n: 5, verdict: 'incertain', correction: null }], { pages });
  assert.equal(retiree.brouillon.sections.comment.length, 1);
  assert.equal(retiree.retirees, 1);
  assert.equal(ev([{ n: 4, verdict: 'incertain', correction: null }]).retirees, 1, 'sans extraits : retiré');
  assert.equal(soutenue('Le premier niveau est à 57 mètres de haut.', [{ texte: 'Le premier niveau est situé à 57 mètres de haut.' }]), true);
  assert.equal(soutenue('Le premier niveau est à 58 mètres de haut.', [{ texte: 'Le premier niveau est situé à 57 mètres de haut.' }]), false, 'un nombre absent des extraits');
  // Ancienne forme (liste de numéros) : « faux » sans correction.
  assert.equal(ev([4]).retirees, 1);
  // Seuil : plus de 20 % retirés ou corrigés -> à refaire (leçons) ; 40 % pour les anciennes formes.
  const huit = [8, 9, 10, 11, 12, 13, 14, 15].map((n) => ({ n, verdict: 'faux', correction: null }));
  assert.equal(ev(huit, { seuil: SEUIL_LECON }).aRefaire, true);
  assert.equal(ev(huit).aRefaire, false, 'seuil de 40 % par défaut');
  // Section de base vide : à refaire, et dit laquelle.
  const vide = ev([4, 5].map((n) => ({ n, verdict: 'faux', correction: null })), { sectionsBase: SECTIONS_BASE });
  assert.deepEqual(vide.basesVides, ['comment']);
  assert.equal(vide.aRefaire, true);
  assert.match(vide.rejets[0], /La section « comment » est vide/);
  // Phrase centrale (première phrase de enBref) : jamais retirée sans remplacement. Gardée, elle oblige à réécrire.
  const centrale = ev([{ n: 1, verdict: 'faux', correction: null }], { proteger: true });
  assert.equal(centrale.brouillon.sections.enBref.length, 3);
  assert.deepEqual([centrale.retirees, centrale.centrales, centrale.aRefaire], [0, 1, true]);
  assert.equal(ev([{ n: 1, verdict: 'faux', correction: null }]).brouillon.sections.enBref.length, 2, 'sans protection (paliers, quiz) : retirée');
  const remplacee = ev([{ n: 1, verdict: 'faux', correction: 'La tour Eiffel est une tour de fer puddlé, haute de 300 mètres à l’origine.' }], { proteger: true });
  assert.match(remplacee.brouillon.sections.enBref[0], /300 mètres/);
  assert.deepEqual([remplacee.centrales, remplacee.corrigees], [0, 1]);
  // Définition du titre : protégée aussi.
  const defTitre = ev([{ n: 8, verdict: 'faux', correction: null }], { proteger: true, titre: 'Qu’est-ce que le fer puddlé ?' });
  assert.deepEqual([defTitre.brouillon.definitions.length, defTitre.centrales], [2, 1]);
});

test('leçon : un verdict « faux » avec correction remplace la phrase dans la leçon publiée ; une seule rédaction et une seule vérification', async () => {
  const j = await prepareProgramme();
  const sc = scenario({ ...partiesStandard(), verif: [verdictsSi([/^Les pièces de fer sont fabriquées en atelier/, 'faux', CORRECTION_COMMENT], [/^Rappel : Un ingénieur/, 'vrai'])] });
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  const p = r.corps.palier;
  assert.ok(p.sections.comment.includes('Levallois-Perret'), 'la correction est dans la leçon');
  assert.ok(!p.sections.comment.includes('fabriquées en atelier'), 'la phrase fausse a disparu');
  assert.deepEqual([p.verification.retirees, p.verification.corrigees, p.verification.statut], [0, 1, 'recoupe']);
  assert.ok(!p.verification.aRevoir);
  assert.equal(sc.par('lecon').length, 1, 'pas de réécriture : 1 phrase sur 35 corrigée');
  assert.equal(sc.par('verif').length, 1);
  assert.match(sc.par('verif')[0].entree.messages[0].content, /incertain/);
});

test('leçon : plus de 20 % retiré -> réécrite une fois avec la liste des erreurs ; encore mauvaise -> publiée « à revoir » et remise en file', async () => {
  const j = await prepareProgramme();
  // 1er tour : 9 affirmations sur 35 (26 %) retirées ; 2e tour : tout est bon.
  const sc = scenario({ ...partiesStandard(), verif: [verdictsNumeros('faux', 8, 9, 10, 11, 12, 13, 14, 15, 16), verdictsNumeros('faux')] });
  const r = await lirePalier(j, 'la-tour-eiffel', 1, sc);
  ok200(r);
  assert.equal(sc.par('lecon').length, 2, 'écrite deux fois');
  assert.equal(sc.par('verif').length, 2);
  assert.match(sc.par('lecon')[1].entree.messages[1].content, /Une première rédaction contenait des affirmations introuvables dans les extraits, fausses/);
  assert.match(sc.par('lecon')[1].entree.messages[1].content, /- Fer puddlé : Fer obtenu en brassant/);
  assert.deepEqual([r.corps.palier.verification.statut, r.corps.palier.verification.retirees], ['recoupe', 0]);
  assert.ok(!r.corps.palier.verification.aRevoir);
  assert.equal(lignes("SELECT * FROM file_attente WHERE type = 'reecriture'").length, 0);

  // Encore mauvaise au 2e tour : publiée, marquée « à revoir », et la file de nuit la reprendra.
  const sc2 = scenario({ ...partiesStandard(), verif: [verdictsNumeros('faux', 8, 9, 10, 11, 12, 13, 14, 15, 16)] });
  const r2 = await lirePalier(j, 'la-tour-eiffel', 2, sc2);
  ok200(r2);
  assert.equal(sc2.par('lecon').length, 2, 'une seule réécriture');
  assert.deepEqual([r2.corps.palier.verification.aRevoir, r2.corps.palier.verification.statut], [true, 'partiel']);
  assert.ok(r2.corps.palier.verification.retirees >= 9);
  assert.deepEqual(lignes("SELECT numero, etat FROM file_attente WHERE type = 'reecriture'"), [{ numero: 2, etat: 'attente' }]);
  assert.equal(lignes("SELECT COUNT(*) AS n FROM paliers WHERE id = 'la-tour-eiffel:2'")[0].n, 1);

  // Section de base vide (comment) : même chemin, même issue.
  const sc3 = scenario({ ...partiesStandard(), verif: [verdictsNumeros('faux', 4, 5)] });
  const r3 = await lirePalier(j, 'la-tour-eiffel', 3, sc3);
  ok200(r3);
  assert.equal(sc3.par('lecon').length, 2);
  assert.match(sc3.par('lecon')[1].entree.messages[1].content, /La section « comment » est vide/);
  assert.equal(r3.corps.palier.verification.aRevoir, true);
  assert.equal(r3.corps.palier.sections.comment, null);

  // Phrase centrale fausse sans correction : gardée (jamais retirée sans remplacement), la leçon est « à revoir ».
  const sc4 = scenario({ ...partiesStandard(), verif: [verdictsNumeros('faux', 1)] });
  const r4 = await lirePalier(j, 'la-tour-eiffel', 4, sc4);
  ok200(r4);
  assert.match(r4.corps.palier.sections.enBref, /^La tour Eiffel est une tour de fer puddlé/);
  assert.equal(r4.corps.palier.verification.aRevoir, true);
  // Avec une correction : remplacée, rien à revoir.
  const sc5 = scenario({ ...partiesStandard(), verif: [verdictsSi([/^La tour Eiffel est une tour de fer puddlé/, 'faux', 'La tour Eiffel est une tour de fer puddlé, haute de 300 mètres à l’origine.'])] });
  const r5 = await lirePalier(j, 'la-tour-eiffel', 5, sc5);
  ok200(r5);
  assert.match(r5.corps.palier.sections.enBref, /^La tour Eiffel est une tour de fer puddlé, haute de 300 mètres/);
  assert.ok(!r5.corps.palier.verification.aRevoir);
});

test('leçon : les prompts interdisent les généralisations ; première leçon « Qu’est-ce que X ? » du niveau Bases : enBref définit X', async () => {
  for (const prompt of [PROMPT_LECON, PROMPT_LECON_A, PROMPT_LECON_B, PROMPT_PALIER]) {
    assert.match(prompt, /Pas de généralisation/);
    assert.match(prompt, /toutes les pierres/);
    assert.match(prompt, /4 C du diamant/);
  }
  assert.match(PROMPT_VERIFICATION, /généralise sans source/);
  const j = await prepareProgramme();
  const sc = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, sc));
  const premier = sc.par('lecon')[0].entree.messages[1].content;
  assert.match(premier, /Consigne de cette leçon : c’est la première leçon d’un module « Qu’est-ce que… » au niveau Bases\. La première phrase de enBref définit « la tour Eiffel » en une phrase simple/);
  const second = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 2, second));
  assert.ok(!second.par('lecon')[0].entree.messages[1].content.includes('Consigne de cette leçon'), 'seulement la première leçon du module');
  assert.equal(sujetDefini({ numero: 2 }, { titre: 'Qu’est-ce que X ?', paliers: [{ numero: 1 }] }, { numero: 1 }), null, 'seulement le niveau Bases');
  assert.equal(sujetDefini({ numero: 1 }, { titre: 'Les phares', paliers: [{ numero: 1 }] }, { numero: 1 }), null);
  assert.equal(sujetDefini({ numero: 1 }, { titre: 'Qu’est-ce qu’une gemme ?', paliers: [{ numero: 4 }] }, { numero: 4 }), 'une gemme');
});

test('sources : extraits FR puis EN si le français est maigre, mis en cache 30 jours dans sources_cache', async () => {
  toutVoir();
  const e = { DB: db };
  assert.equal(DUREE_CACHE_MS, 30 * 24 * 60 * 60 * 1000);
  // Français maigre (800 caractères) : la page anglaise s'ajoute.
  const a = await pagesAncrees(e, 'Tour Eiffel', 'Tour Eiffel');
  assert.deepEqual(a.map((p) => p.langue), ['fr', 'en']);
  const n1 = wiki.appels.length;
  assert.ok(n1 >= 4);
  const lignesCache = lignes('SELECT cle, cree FROM sources_cache');
  assert.equal(lignesCache.length, 1);
  assert.equal(lignesCache[0].cle, 'ancre:tour eiffel|tour eiffel');
  // Deuxième demande : servie par le cache, aucune requête Wikipédia.
  const b = await pagesAncrees(e, 'Tour Eiffel', 'Tour Eiffel');
  assert.deepEqual(b, a);
  assert.equal(wiki.appels.length, n1);
  // Plus de 30 jours : relue et réécrite.
  db.base.prepare('UPDATE sources_cache SET cree = ?').run(new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString());
  await pagesAncrees(e, 'Tour Eiffel', 'Tour Eiffel');
  assert.ok(wiki.appels.length > n1);
  assert.ok(Date.now() - Date.parse(lignes('SELECT cree FROM sources_cache')[0].cree) < 60000);
  // Moins de 30 jours : encore servie par le cache.
  db.base.prepare('UPDATE sources_cache SET cree = ?').run(new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString());
  const n2 = wiki.appels.length;
  await pagesAncrees(e, 'Tour Eiffel', 'Tour Eiffel');
  assert.equal(wiki.appels.length, n2);
  // Français riche : pas de page anglaise.
  db.base.exec('DELETE FROM sources_cache');
  wiki.pages['Tour Eiffel'].extract = texteWiki('La tour Eiffel', 3000);
  wiki.appels.length = 0;
  assert.deepEqual((await pagesAncrees(e, 'Tour Eiffel', 'Tour Eiffel')).map((p) => p.langue), ['fr']);
  assert.ok(wiki.appels.every((x) => x.url.hostname === 'fr.wikipedia.org'), 'aucune requête anglaise');
  // Réseau coupé : rien n'est mis en cache (un échec passager ne dure pas 30 jours).
  db.base.exec('DELETE FROM sources_cache');
  wiki.panne = 500;
  assert.deepEqual(await pagesAncrees(e, 'Tour Eiffel', 'Tour Eiffel'), []);
  assert.equal(lignes('SELECT * FROM sources_cache').length, 0);
  wiki.panne = null;
  // Page de référence : mise en cache à part.
  db.base.exec('DELETE FROM sources_cache');
  wiki.appels.length = 0;
  const ref = await pageDeReference(e, { langue: 'fr', titre: 'Gustave Eiffel' });
  assert.equal(ref.titre, 'Gustave Eiffel');
  assert.deepEqual(lignes('SELECT cle FROM sources_cache').map((x) => x.cle), ['page:fr:gustave eiffel']);
  const n3 = wiki.appels.length;
  assert.equal((await pageDeReference(e, { langue: 'fr', titre: 'Gustave Eiffel' })).titre, 'Gustave Eiffel');
  assert.equal(wiki.appels.length, n3);
  // Sans base : on lit Wikipédia sans cache, sans erreur.
  assert.equal((await pagesAncrees({}, 'Tour Eiffel', 'Tour Eiffel')).length >= 1, true);
  reinitWiki();
});

test('leçon : le rédacteur et le vérificateur reçoivent les mêmes extraits ; la 2e leçon réutilise le cache des sources', async () => {
  const j = await prepareProgramme();
  db.base.exec('DELETE FROM sources_cache');
  wiki.appels.length = 0;
  const sc = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 1, sc));
  const redaction = sc.par('lecon')[0].entree.messages[1].content;
  const verif = sc.par('verif')[0].entree.messages[1].content;
  const extraits = (t) => [...t.matchAll(/=== Extrait \d+ · ([^,]+), page « ([^»]+) » ===/g)].map((m) => m[1] + '/' + m[2].trim());
  assert.ok(extraits(redaction).length >= 2);
  assert.deepEqual(extraits(verif), extraits(redaction));
  assert.ok(lignes('SELECT * FROM sources_cache').length >= 2, 'recherche et page de référence en cache');
  const premiere = wiki.appels.length;
  assert.ok(premiere > 0);
  wiki.appels.length = 0;
  const sc2 = scenario(partiesStandard());
  ok200(await lirePalier(j, 'la-tour-eiffel', 2, sc2));
  assert.ok(wiki.appels.length < premiere, 'les pages de référence ne sont plus relues');
  assert.ok(!wiki.appels.some((a) => ['Tour Eiffel', 'Eiffel Tower'].includes(a.url.searchParams.get('titles'))), 'ni la page française ni la page anglaise du sujet');
});

test('admin « reecrire » : met en file les leçons partiel > 20 % ou « à revoir » ; la nouvelle version remplace l’ancienne (vues gardées)', async () => {
  await prepareProgramme();
  const poster = (corps, e = envAdmin()) => appel(adminPost, { env: e, methode: 'POST', entetes: enteteAdmin, corps });
  const verif = { 1: { statut: 'partiel', affirmations: 35, retirees: 12 }, 2: { statut: 'partiel', affirmations: 35, retirees: 3 }, 3: { statut: 'partiel', affirmations: 35, retirees: 2, aRevoir: true }, 4: { statut: 'recoupe', affirmations: 35, retirees: 0 }, 5: { statut: 'partiel', affirmations: 35, retirees: 7 } };
  for (const [n, v] of Object.entries(verif)) {
    insererPalierTest('la-tour-eiffel', Number(n));
    const c = JSON.parse(lignes('SELECT contenu FROM paliers WHERE numero = ?', Number(n))[0].contenu);
    db.base.prepare('UPDATE paliers SET contenu = ?, vues = ? WHERE numero = ?').run(JSON.stringify({ ...c, verification: { ia: ['a', 'b'], ...v } }), 7, Number(n));
  }
  const avant = (n) => lignes('SELECT contenu FROM paliers WHERE numero = ?', n)[0].contenu;
  const [c2, c4, c5] = [avant(2), avant(4), avant(5)];
  // Accès refusé sans clé ; paramètres invalides.
  erreurFr(await appel(adminPost, { env: envAdmin(), methode: 'POST', corps: { action: 'reecrire', parcours: 'la-tour-eiffel' } }), 403);
  erreurFr(await poster({ action: 'reecrire' }), 400);
  erreurFr(await poster({ action: 'reecrire', parcours: 'inconnu' }), 404);
  assert.equal(lignes('SELECT COUNT(*) AS n FROM file_attente')[0].n, 0);
  // 12/35 = 34 % et « à revoir » sont faibles ; 3/35 = 9 % non ; 7/35 = 20 % pile non (il faut dépasser 20 %).
  const r = await poster({ action: 'reecrire', parcours: 'la-tour-eiffel' });
  ok200(r);
  assert.deepEqual([r.corps.ajoutees, r.corps.faibles], [2, [1, 3]]);
  assert.deepEqual(lignes("SELECT type, numero, etat FROM file_attente ORDER BY numero"), [{ type: 'reecriture', numero: 1, etat: 'attente' }, { type: 'reecriture', numero: 3, etat: 'attente' }]);
  assert.equal(r.corps.formation.enFile, 2);
  assert.equal((await poster({ action: 'reecrire', parcours: 'la-tour-eiffel' })).corps.ajoutees, 0, 'pas de doublon');
  // Le cron les écrit avec les clés du serveur : la nouvelle version remplace l'ancienne.
  const sc = scenario(partiesStandard());
  brancher(sc);
  const b = await traiterFile({ DB: db, AI: sc.ai });
  assert.deepEqual([b.prises, b.faites, b.echecs], [2, 2, 0]);
  const l1 = JSON.parse(avant(1));
  assert.deepEqual(Object.keys(l1), CLES_LECON);
  assert.equal(l1.verification.statut, 'recoupe');
  assert.equal(lignes('SELECT vues FROM paliers WHERE numero = 1')[0].vues, 7, 'les vues sont conservées');
  assert.equal(lignes('SELECT COUNT(*) AS n FROM paliers WHERE parcours = ?', 'la-tour-eiffel')[0].n, 5, 'aucune leçon en double');
  assert.equal(JSON.parse(avant(3)).verification.aRevoir, undefined);
  assert.deepEqual([avant(2), avant(4), avant(5)], [c2, c4, c5], 'les leçons non faibles ne sont pas touchées');
  assert.deepEqual(lignes('SELECT numero, etat FROM file_attente ORDER BY numero'), [{ numero: 1, etat: 'fait' }, { numero: 3, etat: 'fait' }]);
  // Plus aucune leçon faible : rien à remettre en file.
  const r2 = await poster({ action: 'reecrire', parcours: 'la-tour-eiffel' });
  assert.deepEqual([r2.corps.ajoutees, r2.corps.faibles], [0, []]);
  // Une réécriture « à revoir » et plus abîmée que l'ancienne ne l'écrase pas.
  db.base.prepare('UPDATE paliers SET contenu = ? WHERE numero = 3').run(JSON.stringify({ ...JSON.parse(avant(3)), verification: { ia: ['a', 'b'], statut: 'partiel', affirmations: 35, retirees: 2, aRevoir: true } }));
  const ancien3 = avant(3);
  assert.equal((await poster({ action: 'reecrire', parcours: 'la-tour-eiffel' })).corps.ajoutees, 1, 'une tâche faite est remise en attente');
  const pire = scenario({ ...partiesStandard(), verif: [verdictsNumeros('faux', 8, 9, 10, 11, 12, 13, 14, 15, 16)] });
  brancher(pire);
  assert.equal((await traiterFile({ DB: db, AI: pire.ai })).faites, 1);
  assert.equal(avant(3), ancien3, 'la version pire n’écrase pas l’ancienne');
  // Avec le bouton d'export : la vérification montre « à revoir ».
  const exp = await appel(adminGet, { env: envAdmin(), entetes: enteteAdmin, requete: '?export=la-tour-eiffel' });
  assert.equal(exp.corps.lecons.find((x) => x.numero === 3).verification.aRevoir, true);
});

test('rédacteur : une leçon n’a qu’un seul modèle pour les parties A et B (jamais de mélange), le meilleur disponible', async () => {
  const j = await prepareProgramme();
  const modeleDe = (u) => /\/([^/:]+):generateContent$/.exec(u.pathname)[1];
  // Gemini : la partie B reçoit un 429 de gemini-3-flash-preview et descendrait la cascade ; B est refaite avec le modèle de A.
  const sc = scenario(partiesStandard());
  const vers = geminiVers(sc);
  let dejaRefusee = false;
  ext.gemini = async (u, init) => {
    const messages = messagesDeGemini(JSON.parse(init.body));
    if (messages[0].content === PROMPT_LECON_B && modeleDe(u) === 'gemini-3-flash-preview' && !dejaRefusee) {
      dejaRefusee = true;
      return new Response('RESOURCE_EXHAUSTED', { status: 429 });
    }
    return vers(u, init);
  };
  const r = await appel(palierGet, { env: envDe(sc, { GEMINI_API_KEY: CLE_GEMINI }), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=1' });
  ok200(r);
  const gem = ext.appels.filter((a) => a.fournisseur === 'gemini').map((a) => [messagesDeGemini(JSON.parse(a.init.body))[0].content === PROMPT_LECON_B ? 'B' : 'A', modeleDe(a.url)]);
  assert.deepEqual(gem.filter(([p]) => p === 'A'), [['A', 'gemini-3-flash-preview']]);
  assert.deepEqual(gem.filter(([p]) => p === 'B').pop(), ['B', 'gemini-3-flash-preview'], 'B refaite avec le modèle de A');
  assert.ok(gem.filter(([p]) => p === 'B').some(([, m]) => m === 'gemini-2.5-flash'), 'B avait d’abord été écrite par un autre modèle');
  assert.deepEqual(r.corps.palier.verification.ia, ['gemini-3-flash-preview', NOM_MISTRAL]);
  reinitExt();
  // La partie B ne peut pas être refaite par le modèle de A : on passe au fournisseur suivant (Llama écrit A et B), jamais un mélange.
  const sc2 = scenario(partiesStandard());
  const vers2 = geminiVers(sc2);
  let premiereB = true;
  ext.gemini = async (u, init) => {
    const messages = messagesDeGemini(JSON.parse(init.body));
    if (messages[0].content === PROMPT_LECON_B && modeleDe(u) === 'gemini-3-flash-preview') {
      if (premiereB) { premiereB = false; return new Response('RESOURCE_EXHAUSTED', { status: 429 }); }
      return new Response('boom', { status: 503 });
    }
    return vers2(u, init);
  };
  const r2 = await appel(palierGet, { env: envDe(sc2, { GEMINI_API_KEY: CLE_GEMINI }), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=2' });
  ok200(r2);
  assert.equal(r2.corps.palier.verification.ia[0], NOM_LLAMA);
  const parAi = sc2.appels.filter((a) => a.via === 'ai' && a.etape !== 'verif');
  assert.deepEqual(parAi.map((a) => a.etape).sort(), ['lecon', 'leconB']);
  assert.ok(parAi.every((a) => a.modele === LLAMA));
  reinitExt();
});

test('Mistral (API) : un 429 écarte le modèle 60 s (limite par seconde du palier gratuit), pas 10 min ; « par jour » reste 3 h ; Cerebras reste 10 min', async () => {
  reinitExt();
  const etat = (famille, modele) => etatModelesCompat()[famille].find((m) => m.modele === modele).etat;
  const [m0, m1] = COMPAT_TEST.mistral.modeles;
  ext.mistral = fauxCompat({ [m0]: () => new Response('{"message":"Rate limit exceeded"}', { status: 429 }) });
  assert.deepEqual(extraireObjet(await appelCompat('mistral')), { ok: 1 });
  assert.deepEqual(modelesDe('mistral'), [m0, m1]);
  assert.equal(EPUISEMENT_MISTRAL_MS, 60000);
  assert.equal(etat('mistral', m0), 'epuise');
  horloge.t += 59000;
  assert.equal(etat('mistral', m0), 'epuise', 'encore écarté après 59 s');
  horloge.t += 2000;
  assert.equal(etat('mistral', m0), 'ok', 'de nouveau utilisable après 61 s');
  ext.appels.length = 0;
  await appelCompat('mistral');
  assert.deepEqual(modelesDe('mistral'), [m0, m1], 'on repart du meilleur modèle');
  // Quota « par jour » : 3 h.
  reinitExt();
  ext.mistral = fauxCompat({ [m0]: () => new Response('{"message":"tokens per day exceeded"}', { status: 429 }) });
  await appelCompat('mistral');
  horloge.t += 61000;
  assert.equal(etat('mistral', m0), 'epuise');
  // Cerebras : toujours 10 minutes.
  reinitExt();
  const [c0] = COMPAT_TEST.cerebras.modeles;
  ext.cerebras = fauxCompat({ [c0]: () => new Response('quota', { status: 429 }) });
  await appelCompat('cerebras');
  horloge.t += 61000;
  assert.equal(etat('cerebras', c0), 'epuise');
  reinitExt();
});

test('Claude (clé du serveur CLAUDE_API_KEY) : actif seulement avec la clé, PREMIER pour la rédaction, vérifié par une autre famille', async () => {
  reinitExt();
  const fam = (l) => l.map((f) => f.famille);
  const AVEC = { ...TOUS, CLAUDE_API_KEY: CLE_CLAUDE };
  assert.equal(cleClaude({}), false);
  assert.equal(cleClaude({ CLAUDE_API_KEY: ' ' }), false);
  assert.equal(cleClaude(AVEC), true);
  // Sans la clé : aucun Claude nulle part.
  assert.ok(!fam(redacteurs(TOUS)).includes('claude'));
  assert.ok(!fam(tousLesFournisseurs(TOUS)).includes('claude'));
  // Avec la clé : premier rédacteur, avant Gemini.
  const rl = redacteurs(AVEC);
  assert.deepEqual(fam(rl), ['claude', 'gemini', 'cerebras', 'groq', 'mistral', 'glm', 'grok', 'workers-ai']);
  assert.equal(rl[0].modele, CLAUDE_MODELE);
  assert.deepEqual(fam(tousLesFournisseurs(AVEC)).slice(0, 2), ['claude', 'gemini']);
  // Vérification : une autre famille, Gemini d'abord, Claude jamais en vérificateur d'un autre ni de lui-même.
  assert.deepEqual(fam(verificateurs(AVEC, rl[0])), ['gemini', 'cerebras', 'groq', 'mistral', 'glm', 'grok', 'workers-ai', 'workers-ai']);
  assert.ok(!fam(verificateurs(AVEC, rl[1])).includes('claude'));
  // La clé personnelle Claude passe avant celle du serveur ; la clé du serveur ne s'affiche pas.
  const avecPerso = redacteurs({ ...AVEC, clePerso: { fournisseur: 'claude', cle: 'sk-ant-api03-perso-de-test' } });
  assert.deepEqual(fam(avecPerso).slice(0, 3), ['claude', 'claude', 'gemini']);
  // Appel : API Messages, clé dans x-api-key, modèle claude-haiku-5-5.
  const sc = scenario(partiesStandard());
  ext.claude = claudeVers(sc);
  const j = await prepareProgramme();
  ext.claude = claudeVers(sc);
  const r = await appel(palierGet, { env: envDe(sc, { CLAUDE_API_KEY: CLE_CLAUDE }), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=1' });
  ok200(r);
  const a = ext.appels.filter((x) => x.fournisseur === 'claude');
  assert.equal(a.length, 2, 'les deux moitiés de la leçon');
  assert.equal(new Headers(a[0].init.headers).get('x-api-key'), CLE_CLAUDE);
  assert.equal(JSON.parse(a[0].init.body).model, 'claude-haiku-5-5');
  assert.deepEqual(r.corps.palier.verification.ia, ['claude-haiku-5-5', NOM_MISTRAL], 'vérifiée par une autre famille');
  assert.ok(!JSON.stringify(r.corps).includes(CLE_CLAUDE));
  assert.ok(!toutesLesTables().includes(CLE_CLAUDE));
  // 429 : Claude est mis de côté 10 min, les autres prennent le relais ; 401 : ignoré 1 h.
  reinitExt();
  ext.claude = () => new Response('{"type":"error","error":{"type":"rate_limit_error"}}', { status: 429 });
  await assert.rejects(() => redacteurs(AVEC)[0].appeler(MSG, { maxTokens: 5, delaiMs: 1000 }), (e) => e.epuise === true && e.fournisseur === 'Claude');
  assert.equal(estEpuise('claude'), true);
  assert.ok(nomsEpuises().includes('Claude'));
  assert.ok(!fam(redacteurs(AVEC)).includes('claude') || fam(redacteurs(AVEC))[0] !== 'claude', 'épuisé : il ne passe plus en premier');
  oublierEpuisements();
  ext.claude = () => new Response('{"type":"error","error":{"type":"authentication_error"}}', { status: 401 });
  await assert.rejects(() => redacteurs(AVEC)[0].appeler(MSG, { maxTokens: 5, delaiMs: 1000 }), (e) => e.cleRefusee === true && e.cleInvalide === true);
  assert.equal(estIgnore('claude'), true);
  assert.ok(!fam(redacteurs(AVEC)).includes('claude'));
  reinitExt();
});

test('diagnostic : Claude apparaît en premier (clé présente, état), jamais sa clé', async () => {
  reinitExt();
  ext.claude = (u, init) => reponseWiki({ content: [{ type: 'text', text: '{"ok":true}' }], echo: new Headers(init.headers).get('x-api-key') });
  ext.gemini = () => reponseGemini('{"ok":true}');
  const env = { ...TOUTES, CLAUDE_API_KEY: CLE_CLAUDE, DIAG_KEY: 'sésame', AI: { run: async () => ({ response: '{"ok":true}' }) } };
  const r = await appel(diagnosticGet, { env, requete: '?cle=sésame' });
  ok200(r);
  assert.equal(r.corps.claudeCle, true);
  assert.deepEqual(r.corps.resultats.slice(0, 2).map((x) => [x.famille, x.etat]), [['claude', 'ok'], ['gemini', 'ok']]);
  assert.equal(r.corps.resultats[0].nom, 'claude-haiku-5-5');
  const texte = JSON.stringify(r.corps);
  assert.ok(!texte.includes(CLE_CLAUDE), 'aucune clé dans le diagnostic');
  // Clé refusée : « cle-invalide », Claude ignoré 1 h. Sans clé : annoncé absent et pas essayé.
  reinitExt();
  ext.claude = () => new Response('Invalid ' + CLE_CLAUDE, { status: 401 });
  ext.gemini = () => reponseGemini('{"ok":true}');
  const r2 = await appel(diagnosticGet, { env, requete: '?cle=sésame' });
  assert.equal(r2.corps.resultats[0].etat, 'cle-invalide');
  assert.ok(r2.corps.ignores.includes('Claude'));
  assert.ok(!JSON.stringify(r2.corps).includes(CLE_CLAUDE));
  reinitExt();
  ext.gemini = () => reponseGemini('{"ok":true}');
  const r3 = await appel(diagnosticGet, { env: { ...TOUTES, DIAG_KEY: 'sésame', AI: { run: async () => ({ response: '{"ok":true}' }) } }, requete: '?cle=sésame' });
  assert.equal(r3.corps.claudeCle, false);
  assert.ok(!r3.corps.resultats.some((x) => x.famille === 'claude'));
  reinitExt();
});

// =============================================================================
// Lot 6 : comptes, admin, codes d'amis, vie privée
// =============================================================================

const MDP = 'un mot de passe solide';
const postCompte = (corps, options = {}) => appel(comptePost, { methode: 'POST', ip: nouvelleIp(), corps, ...options });
async function creerCompte(pseudo = 'greg', { prenom = 'Grégoire', nom = 'Muel', mdp = MDP, ip, jeton } = {}) {
  const r = await appel(comptePost, { methode: 'POST', ip: ip || nouvelleIp(), jeton, corps: { action: 'inscrire', prenom, nom, pseudo, mdp } });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  return { ...r.corps, mdp, jeton: `${r.corps.id}.${r.corps.cle}` };
}
const connexion = (pseudo, mdp = MDP, options = {}) => postCompte({ action: 'connecter', pseudo, mdp }, options);
const ligneJoueur = (id) => lignes('SELECT * FROM joueurs WHERE id = ?', id)[0];
// Tout le contenu des tables sous forme de texte : pour vérifier qu'un secret ou un identifiant n'y est plus.
const toutLeTexte = () => JSON.stringify(
  lignes("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((t) => lignes(`SELECT * FROM ${t.name}`)),
);
const sansSecret = (corps) => {
  const texte = JSON.stringify(corps);
  assert.ok(!/pbkdf2/.test(texte), 'aucun hash dans la réponse');
  assert.ok(!/"[a-z_]*(hash|secours_hash|reinit)[a-z_]*"\s*:/i.test(texte), 'aucune clé de hash dans la réponse');
};
// Un compte promu admin directement dans la base (la promotion par clé est testée à part).
const faireAdmin = (compte) => db.base.prepare("UPDATE joueurs SET role = 'admin' WHERE id = ?").run(compte.id);
const unJourEnMs = 86400000;

// --- Mots de passe et phrase de secours ---------------------------------------------------------------------

test('mot de passe : PBKDF2 « pbkdf2$100000$sel$hash », sel différent à chaque fois, vérification juste, hash illisible jamais valable', async () => {
  const a = await hacherMdp('un mot de passe solide');
  const b = await hacherMdp('un mot de passe solide');
  assert.match(a, /^pbkdf2\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notEqual(a, b, 'le sel est aléatoire');
  assert.ok(!a.includes('solide'));
  assert.equal(await verifierMdp('un mot de passe solide', a), true);
  assert.equal(await verifierMdp('un mot de passe solidE', a), false);
  assert.equal(await verifierMdp('', a), false);
  assert.equal(await verifierMdp(undefined, a), false);
  assert.equal(await verifierMdp('x'.repeat(200), a), false);
  // Accents : la forme composée et la forme décomposée sont le même mot de passe.
  const accents = await hacherMdp('Café crème 2026');
  assert.equal(await verifierMdp('Café crème 2026', accents), true);
  // Un hash absent, tronqué, avec trop d'itérations ou d'un autre format ne valide rien.
  for (const mauvais of [null, undefined, '', 'pbkdf2$100000$zz$zz', a.replace('100000', '100001'), a.replace('100000', '999999'), a.replace('pbkdf2', 'sha1'), a.slice(0, -1), 42]) {
    assert.equal(await verifierMdp('un mot de passe solide', mauvais), false, String(mauvais));
  }
  assert.equal(await verifierContreLeurre('un mot de passe solide'), false);
});

test('phrase de secours : 12 mots d’une liste fixe de 256 mots, tirage différent à chaque fois, comparaison sans casse ni accents', async () => {
  assert.equal(MOTS_SECOURS.length, 256);
  assert.equal(new Set(MOTS_SECOURS).size, 256);
  assert.ok(MOTS_SECOURS.every((m) => /^[a-z]{3,10}$/.test(m)), 'des mots simples, sans accent');
  const phrases = new Set();
  for (let i = 0; i < 20; i++) {
    const p = phraseDeSecours();
    const mots = p.split(' ');
    assert.equal(mots.length, 12);
    assert.ok(mots.every((m) => MOTS_SECOURS.includes(m)));
    phrases.add(p);
  }
  assert.equal(phrases.size, 20);
  assert.equal(normaliserPhrase('  Café   LUNE,  étoile '), 'cafe lune etoile');
  assert.equal(normaliserPhrase(42), '');
});

test('pseudo de compte : 3 à 20 caractères, lettres, chiffres, _ . -, minuscules pour l’unicité, pseudos réservés refusés', async () => {
  assert.deepEqual(pseudoCompte('Greg_M.9-x'), { pseudo: 'Greg_M.9-x', cle: 'greg_m.9-x' });
  assert.deepEqual(pseudoCompte('  Éloïse '), { pseudo: 'Éloïse', cle: 'éloïse' });
  for (const mauvais of ['ab', 'a'.repeat(21), 'deux mots', 'a@b.fr', 'x<y', '😀😀😀', '', '   ', null, 12, ['abc'], 'Грег']) {
    assert.throws(() => pseudoCompte(mauvais), (e) => e instanceof ErreurHttp && e.statut === 400, String(mauvais));
  }
  assert.equal(pseudoCompte('a'.repeat(20)).pseudo.length, 20);
  for (const reserve of ['admin', 'ADMIN', 'Koios', 'Koîos', 'support']) {
    assert.throws(() => pseudoCompte(reserve), (e) => e instanceof ErreurHttp && e.statut === 409, reserve);
  }
});

// --- Inscription -------------------------------------------------------------------------------------------

test('compte inscrire : crée le compte, renvoie une session et la phrase de secours une seule fois, ne garde que des hash', async () => {
  toutVider();
  const ip = '192.0.2.77';
  const r = await postCompte({ action: 'inscrire', prenom: ' Grégoire ', nom: 'Muel', pseudo: 'Greg_M', mdp: MDP }, { ip });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.deepEqual(Object.keys(r.corps).sort(), ['cle', 'id', 'nom', 'phrase', 'prenom', 'pseudo', 'role']);
  assert.match(r.corps.id, /^[a-z0-9]{12}$/);
  assert.match(r.corps.cle, /^[a-z0-9]{32}$/);
  assert.deepEqual([r.corps.pseudo, r.corps.prenom, r.corps.nom, r.corps.role], ['Greg_M', 'Grégoire', 'Muel', 'joueur']);
  assert.equal(r.corps.phrase.split(' ').length, 12);
  const j = ligneJoueur(r.corps.id);
  assert.equal(j.pseudo_cle, 'greg_m');
  assert.equal(j.cle_hash, null, 'pas d’ancienne clé de profil');
  assert.equal(j.role, 'joueur');
  assert.equal(j.bloque, 0);
  assert.match(j.mdp_hash, /^pbkdf2\$100000\$/);
  assert.match(j.secours_hash, /^pbkdf2\$100000\$/);
  assert.equal(await verifierMdp(MDP, j.mdp_hash), true);
  assert.equal(await verifierMdp(normaliserPhrase(r.corps.phrase), j.secours_hash), true);
  // La session : seule l'empreinte de la clé est gardée.
  assert.deepEqual(lignes('SELECT cle_hash, joueur_id FROM sessions'), [{ cle_hash: await sha256Hex(r.corps.cle), joueur_id: r.corps.id }]);
  // Ni le mot de passe, ni la phrase, ni la clé, ni l'IP ne sont gardés en clair.
  const tout = toutLeTexte();
  for (const secret of [MDP, r.corps.phrase, r.corps.cle, ip]) assert.ok(!tout.includes(secret), 'secret stocké en clair');
  assert.deepEqual(lignes('SELECT cle FROM quotas').map((q) => q.cle), ['inscrire:' + (await sha256Hex(ip))]);
  // La session ouvre les routes protégées.
  assert.equal((await appel(progressionGet, { jeton: `${r.corps.id}.${r.corps.cle}` })).statut, 200);
});

test('compte inscrire : champs invalides refusés en 400 sans rien créer, corps illisible 400, trop gros 413', async () => {
  toutVider();
  const bon = { action: 'inscrire', prenom: 'Greg', nom: 'Muel', pseudo: 'greg', mdp: MDP };
  for (const mauvais of [
    { pseudo: 'ab' }, { pseudo: 'a'.repeat(21) }, { pseudo: 'avec espace' }, { pseudo: 'x@y' }, { pseudo: 12 }, { pseudo: undefined },
    { prenom: '' }, { prenom: '   ' }, { prenom: 'x'.repeat(41) }, { prenom: 5 }, { prenom: undefined },
    { nom: '' }, { nom: 'x'.repeat(41) }, { nom: null }, { nom: undefined },
    { mdp: 'court' }, { mdp: '123456789' }, { mdp: 'x'.repeat(129) }, { mdp: 1234567890 }, { mdp: undefined },
  ]) {
    erreurFr(await postCompte({ ...bon, ...mauvais }), 400);
  }
  assert.equal(lignes('SELECT * FROM joueurs').length, 0);
  assert.equal(lignes('SELECT * FROM sessions').length, 0);
  // Dix caractères au plus pile, 128 au plus pile : acceptés.
  assert.equal((await postCompte({ ...bon, mdp: '0123456789' })).statut, 200);
  assert.equal((await postCompte({ ...bon, pseudo: 'autre', mdp: 'é'.repeat(128) })).statut, 200);
  erreurFr(await appel(comptePost, { methode: 'POST', brut: '{pas du json' }), 400);
  erreurFr(await appel(comptePost, { methode: 'POST', brut: '[1]' }), 400);
  erreurFr(await appel(comptePost, { methode: 'POST', corps: { action: 'inscrire', mdp: 'x'.repeat(5000) } }), 413);
  erreurFr(await postCompte({ action: 'inconnue' }), 400, /Action inconnue/);
  erreurFr(await postCompte({}), 400, /Action inconnue/);
  erreurFr(await postCompte({ action: 'inscrire', prenom: 'G', nom: 'M', pseudo: 'koios', mdp: MDP }), 409, /réservé/);
});

test('compte inscrire : doublon de pseudo refusé (sans tenir compte de la casse), l’index unique tient même en cas de course', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  for (const pseudo of ['Greg', 'greg', 'GREG', 'gReG']) {
    erreurFr(await postCompte({ action: 'inscrire', prenom: 'Un', nom: 'Autre', pseudo, mdp: MDP }), 409, /déjà pris/);
  }
  assert.equal(lignes('SELECT * FROM joueurs').length, 1);
  assert.equal(ligneJoueur(a.id).pseudo, 'Greg');
  // Deux inscriptions simultanées : une seule passe, l'autre reçoit 409 (et non un 503).
  const [x, y] = await Promise.all([1, 2].map(() => postCompte({ action: 'inscrire', prenom: 'U', nom: 'N', pseudo: 'course', mdp: MDP })));
  assert.deepEqual([x.statut, y.statut].sort(), [200, 409]);
  assert.equal(lignes("SELECT * FROM joueurs WHERE pseudo_cle = 'course'").length, 1);
  // L'index unique, lui, refuse aussi une écriture directe ; les profils sans compte (pseudo_cle nul) peuvent se répéter.
  assert.throws(() => db.base.prepare("INSERT INTO joueurs (id, pseudo_cle) VALUES ('zzzzzzzzzzzz', 'greg')").run(), /UNIQUE/);
  db.base.prepare("INSERT INTO joueurs (id, pseudo) VALUES ('aaaaaaaaaaaa', 'Greg')").run();
  db.base.prepare("INSERT INTO joueurs (id, pseudo) VALUES ('bbbbbbbbbbbb', 'Greg')").run();
});

test('compte inscrire : 20 inscriptions par jour et par IP, la 21e reçoit 429 ; une autre IP passe', async () => {
  toutVider();
  const ip = '192.0.2.150';
  for (let i = 0; i < 20; i++) {
    const r = await postCompte({ action: 'inscrire', prenom: 'P', nom: 'N', pseudo: 'joueur' + i, mdp: MDP }, { ip });
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
  }
  erreurFr(await postCompte({ action: 'inscrire', prenom: 'P', nom: 'N', pseudo: 'de-trop', mdp: MDP }, { ip }), 429);
  assert.equal((await postCompte({ action: 'inscrire', prenom: 'P', nom: 'N', pseudo: 'ailleurs', mdp: MDP }, { ip: '192.0.2.151' })).statut, 200);
  assert.equal(lignes("SELECT * FROM joueurs WHERE pseudo_cle = 'de-trop'").length, 0);
});

test('compte inscrire : avec la clé d’un ancien profil, le profil est complété (progression gardée) et son ancienne clé ne marche plus', async () => {
  toutVider();
  const ancien = await creerJoueur('Vieux');
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: ancien.jeton, corps: { etat: { xp: 320, parcours: { a: { fait: [1, 2, 3] } } } } }));
  const r = await postCompte({ action: 'inscrire', prenom: 'Vieux', nom: 'Profil', pseudo: 'vieux', mdp: MDP }, { jeton: ancien.jeton });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.equal(r.corps.id, ancien.id, 'même profil');
  assert.equal(lignes('SELECT * FROM joueurs').length, 1);
  const j = ligneJoueur(ancien.id);
  assert.deepEqual([j.points, j.valides, j.pseudo, j.pseudo_cle, j.cle_hash], [320, 3, 'vieux', 'vieux', null]);
  const nouveau = `${r.corps.id}.${r.corps.cle}`;
  const p = await appel(progressionGet, { jeton: nouveau });
  assert.equal(p.corps.etat.xp, 320, 'la progression est gardée');
  erreurFr(await appel(progressionGet, { jeton: ancien.jeton }), 401); // l'ancienne clé est révoquée
  // Un compte ne peut pas en créer un deuxième.
  erreurFr(await postCompte({ action: 'inscrire', prenom: 'V', nom: 'P', pseudo: 'deuxieme', mdp: MDP }, { jeton: nouveau }), 409, /déjà un compte/);
  // Une clé périmée ou fausse est ignorée : c'est une inscription ordinaire.
  const neuf = await postCompte({ action: 'inscrire', prenom: 'N', nom: 'N', pseudo: 'neuf', mdp: MDP }, { jeton: ancien.jeton });
  assert.equal(neuf.statut, 200);
  assert.notEqual(neuf.corps.id, ancien.id);
  // Un profil bloqué ne peut pas s'inscrire.
  const bloque = await creerJoueur('Bloque');
  db.base.prepare('UPDATE joueurs SET bloque = 1 WHERE id = ?').run(bloque.id);
  erreurFr(await postCompte({ action: 'inscrire', prenom: 'B', nom: 'B', pseudo: 'bloque', mdp: MDP }, { jeton: bloque.jeton }), 403);
});

// --- Connexion -------------------------------------------------------------------------------------------

test('compte connecter : bon mot de passe -> nouvelle session par appareil ; pseudo sans casse ; la réponse ne contient aucun hash', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const r1 = await connexion('greg');
  const r2 = await connexion('  GREG ');
  for (const r of [r1, r2]) {
    assert.equal(r.statut, 200, JSON.stringify(r.corps));
    assert.deepEqual(Object.keys(r.corps).sort(), ['cle', 'id', 'nom', 'prenom', 'pseudo', 'role']);
    assert.equal(r.corps.id, a.id);
    sansSecret(r.corps);
  }
  assert.notEqual(r1.corps.cle, r2.corps.cle);
  assert.equal(lignes('SELECT * FROM sessions').length, 3, 'une session par appareil');
  for (const jeton of [a.jeton, `${r1.corps.id}.${r1.corps.cle}`, `${r2.corps.id}.${r2.corps.cle}`]) assert.equal((await appel(progressionGet, { jeton })).statut, 200);
  assert.ok(ligneJoueur(a.id).vu, 'dernière activité notée');
});

test('compte connecter : mauvais mot de passe et pseudo inconnu reçoivent la même réponse 401', async () => {
  toutVider();
  await creerCompte('Greg');
  const faux = await connexion('greg', 'pas le bon mot de passe');
  const inconnu = await connexion('personne', MDP);
  const vide = await connexion('', '');
  const types = await postCompte({ action: 'connecter', pseudo: { a: 1 }, mdp: ['x'] });
  for (const r of [faux, inconnu, vide, types]) erreurFr(r, 401, /Pseudo ou mot de passe incorrect/);
  assert.deepEqual(faux.corps, inconnu.corps);
  assert.equal(lignes('SELECT * FROM sessions').length, 1, 'aucune session créée par un échec');
});

test('compte connecter : 10 échecs par jour par pseudo et par IP, puis 429 même avec le bon mot de passe ; autre IP et autre pseudo non touchés', async () => {
  toutVider();
  await creerCompte('Greg');
  await creerCompte('Autre');
  const ip = '192.0.2.201';
  for (let i = 0; i < 10; i++) erreurFr(await connexion('greg', 'mauvais mot de passe ' + i, { ip }), 401);
  erreurFr(await connexion('greg', MDP, { ip }), 429, /Trop d’essais/);
  erreurFr(await connexion('Greg', MDP, { ip }), 429, 'la casse ne contourne pas la limite');
  assert.equal((await connexion('autre', MDP, { ip })).statut, 200, 'un autre pseudo depuis la même IP');
  assert.equal((await connexion('greg', MDP, { ip: '192.0.2.202' })).statut, 200, 'le même pseudo depuis une autre IP');
  // Un pseudo qui n'existe pas est limité de la même façon (pas d'indice sur son existence).
  for (let i = 0; i < 10; i++) erreurFr(await connexion('fantome', 'x' + i, { ip }), 401);
  erreurFr(await connexion('fantome', MDP, { ip }), 429);
  // Les compteurs portent l'empreinte de l'IP, jamais l'adresse.
  const cles = lignes("SELECT cle FROM quotas WHERE cle LIKE 'echec:%'").map((q) => q.cle);
  assert.ok(cles.length >= 3);
  assert.ok(!cles.some((c) => c.includes('192.0.2')), 'IP en clair');
  assert.ok(cles.some((c) => c.includes(sha256Court(ip))), 'empreinte de l’IP');
  // Le lendemain, le compteur repart à zéro.
  db.base.prepare("UPDATE quotas SET jour = '2000-01-01' WHERE cle LIKE 'echec:%'").run();
  assert.equal((await connexion('greg', MDP, { ip })).statut, 200);
});

test('compte connecter : 100 échecs par jour par pseudo, toutes IP confondues (devinette répartie) ; une réussite efface le compteur de l’IP', async () => {
  toutVider();
  await creerCompte('Greg');
  db.base.prepare("INSERT INTO quotas (cle, n, jour) VALUES ('echec:conn:greg', 100, ?)").run(aujourdhui());
  erreurFr(await connexion('greg', MDP, { ip: '192.0.2.210' }), 429);
  assert.equal((await connexion('autre-pseudo', MDP, { ip: '192.0.2.210' })).statut, 401);
  toutVider();
  await creerCompte('Greg');
  const ip = '192.0.2.211';
  for (let i = 0; i < 9; i++) erreurFr(await connexion('greg', 'mauvais ' + i, { ip }), 401);
  assert.equal((await connexion('greg', MDP, { ip })).statut, 200);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle LIKE 'echec:conn:greg:%'").length, 0, 'compteur de l’IP effacé');
  for (let i = 0; i < 9; i++) erreurFr(await connexion('greg', 'encore mauvais ' + i, { ip }), 401);
  assert.equal((await connexion('greg', MDP, { ip })).statut, 200, 'neuf nouveaux échecs ne bloquent pas');
});

const sha256Court = (ip) => createHash('sha256').update(ip).digest('hex');

test('compte bloqué : 403 partout (routes à connexion et routes ouvertes), seulement après le bon mot de passe à la connexion', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const ami = await creerCompte('Ami');
  assert.equal((await appel(progressionGet, { jeton: a.jeton })).statut, 200);
  db.base.prepare('UPDATE joueurs SET bloque = 1 WHERE id = ?').run(a.id);
  const duel = db.base.prepare("INSERT INTO duels (id, createur, questions, scores, cree) VALUES ('abcd1234', ?, '[]', '[]', '2026-10-20')");
  duel.run(ami.id);
  const cas = [
    [progressionGet, {}], [progressionPut, { methode: 'PUT', corps: { etat: {} } }], [cercleGet, {}], [duelsGet, {}], [compteGet, {}],
    [amisGet, {}], [amisPost, { methode: 'POST', corps: { action: 'inviter' } }], [signalementPost, { methode: 'POST', corps: { chapitre: 'a', exercice: 0, message: 'x' } }],
    [librePost, { methode: 'POST', corps: { sujet: 'Les phares' }, env: { DB: db, AI: fauxAI([enReponse(valide())]) } }],
    [duelGet, { requete: '?id=abcd1234' }], [partieGet, { requete: '?id=ABCDEF' }], [groupeGet, { requete: '?id=abcd1234' }], [tournoiGet, {}],
    [groupePost, { methode: 'POST', corps: { nom: 'Les phares', parcours: 'phares' } }],
    [comptePost, { methode: 'POST', corps: { action: 'mdp', ancien: MDP, nouveau: 'un autre mot de passe' } }],
    [comptePost, { methode: 'POST', corps: { action: 'supprimer', mdp: MDP } }],
  ];
  for (const [handler, options] of cas) erreurFr(await appel(handler, { ...options, jeton: a.jeton }), 403, /bloqué/);
  // Connexion : mauvais mot de passe -> 401 (rien n'est révélé), bon mot de passe -> 403.
  erreurFr(await connexion('greg', 'mauvais mot de passe'), 401);
  erreurFr(await connexion('greg'), 403, /bloqué/);
  // Il ne peut ni se faire passer par secours, ni s'inscrire avec sa clé.
  erreurFr(await postCompte({ action: 'secours', pseudo: 'greg', phrase: a.phrase, nouveauMdp: 'un nouveau mot de passe' }), 403, /bloqué/);
  assert.equal(await verifierMdp(MDP, ligneJoueur(a.id).mdp_hash), true, 'mot de passe inchangé');
  // Débloqué, tout repart (sa session existe encore).
  db.base.prepare('UPDATE joueurs SET bloque = 0 WHERE id = ?').run(a.id);
  assert.equal((await appel(progressionGet, { jeton: a.jeton })).statut, 200);
  // Un ami ne voit pas non plus un compte bloqué dans sa liste.
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', '2026-10-20')").run(a.id, ami.id);
  assert.equal((await appel(amisGet, { jeton: ami.jeton })).corps.amis.length, 1);
  db.base.prepare('UPDATE joueurs SET bloque = 1 WHERE id = ?').run(a.id);
  assert.equal((await appel(amisGet, { jeton: ami.jeton })).corps.amis.length, 0);
  assert.equal((await appel(cercleGet, { jeton: ami.jeton })).corps.joueurs.length, 1);
});

// --- Sessions ---------------------------------------------------------------------------------------------

test('session : clé et identifiant doivent aller ensemble, 180 jours d’inactivité au plus, activité notée au plus une fois par heure', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Autre');
  // La clé d'un autre compte, ou un identifiant qui ne va pas avec elle : 401.
  erreurFr(await appel(progressionGet, { jeton: `${b.id}.${a.cle}` }), 401);
  erreurFr(await appel(progressionGet, { jeton: `${a.id}.${b.cle}` }), 401);
  erreurFr(await appel(progressionGet, { jeton: `${a.id}.${'0'.repeat(32)}` }), 401);
  // Expiration.
  const cleHash = await sha256Hex(a.cle);
  const il = (jours) => new Date(Date.now() - jours * unJourEnMs).toISOString();
  db.base.prepare('UPDATE sessions SET vu = ? WHERE cle_hash = ?').run(il(179), cleHash);
  assert.equal((await appel(progressionGet, { jeton: a.jeton })).statut, 200, 'à 179 jours : encore valable');
  assert.ok(Date.parse(lignes('SELECT vu FROM sessions WHERE cle_hash = ?', cleHash)[0].vu) > Date.now() - 60000, 'l’activité repousse l’expiration');
  db.base.prepare('UPDATE sessions SET vu = ? WHERE cle_hash = ?').run(il(181), cleHash);
  erreurFr(await appel(progressionGet, { jeton: a.jeton }), 401);
  assert.equal(lignes('SELECT * FROM sessions WHERE cle_hash = ?', cleHash).length, 0, 'session expirée effacée');
  // Pas d'écriture à chaque requête : la date ne bouge pas dans l'heure.
  const k = await sha256Hex(b.cle);
  const recent = new Date(Date.now() - 600000).toISOString();
  db.base.prepare('UPDATE sessions SET vu = ? WHERE cle_hash = ?').run(recent, k);
  await appel(progressionGet, { jeton: b.jeton });
  assert.equal(lignes('SELECT vu FROM sessions WHERE cle_hash = ?', k)[0].vu, recent);
  // Vingt appareils au plus par compte : les plus anciennes sessions partent.
  for (let i = 0; i < 22; i++) assert.equal((await connexion('autre')).statut, 200);
  assert.equal(lignes('SELECT * FROM sessions WHERE joueur_id = ?', b.id).length, 20);
});

test('session : un ancien profil garde sa clé tant qu’il n’a pas de compte ; sessions et anciennes clés se vérifient à temps constant', async () => {
  toutVider();
  const ancien = await creerJoueur('Vieux');
  assert.equal((await appel(progressionGet, { jeton: ancien.jeton })).statut, 200);
  const g = (await appel(compteGet, { jeton: ancien.jeton })).corps;
  assert.equal(g.compte, false);
  assert.equal(g.pseudo, 'Vieux');
  assert.equal(g.motDePasse, false);
  // Le code compare des empreintes de même longueur avec le même outil que ADMIN_KEY.
  assert.equal(egalConstant('a'.repeat(64), 'a'.repeat(64)), true);
  assert.equal(egalConstant('a'.repeat(64), 'a'.repeat(63) + 'b'), false);
  assert.equal(egalConstant('a', 'ab'), false);
  assert.equal(egalConstant(null, null), false);
  const source = readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8');
  assert.ok(source.includes('ecart |= a.charCodeAt(i) ^ b.charCodeAt(i)'), 'comparaison sans sortie anticipée');
});

test('compte deconnecter : efface la session de cet appareil seulement, répond 200 même sans session', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const autre = await connexion('greg');
  const jetonAutre = `${autre.corps.id}.${autre.corps.cle}`;
  const r = await postCompte({ action: 'deconnecter' }, { jeton: a.jeton });
  assert.deepEqual(r.corps, { ok: true });
  erreurFr(await appel(progressionGet, { jeton: a.jeton }), 401);
  assert.equal((await appel(progressionGet, { jeton: jetonAutre })).statut, 200, 'l’autre appareil reste connecté');
  assert.deepEqual((await postCompte({ action: 'deconnecter' })).corps, { ok: true });
  assert.deepEqual((await postCompte({ action: 'deconnecter' }, { jeton: `${a.id}.${'z'.repeat(32)}` })).corps, { ok: true });
  assert.equal(lignes('SELECT * FROM sessions').length, 1);
  // La clé d'une session ne peut pas effacer la session d'un autre compte.
  const b = await creerCompte('Autre');
  await postCompte({ action: 'deconnecter' }, { jeton: `${a.id}.${b.cle}` });
  assert.equal((await appel(progressionGet, { jeton: b.jeton })).statut, 200);
});

// --- GET compte ---------------------------------------------------------------------------------------------

test('compte GET : profil du compte sans aucun hash ; 401 sans session ; config publique : Google seulement si GOOGLE_CLIENT_ID existe', async () => {
  toutVider();
  const a = await creerCompte('Greg', { prenom: 'Grégoire', nom: 'Muel' });
  const r = await appel(compteGet, { jeton: a.jeton });
  assert.equal(r.statut, 200);
  assert.deepEqual(r.corps, { compte: true, pseudo: 'Greg', prenom: 'Grégoire', nom: 'Muel', role: 'joueur', google: false, motDePasse: true, cree: r.corps.cree, bonus: 0, codes: [] });
  sansSecret(r.corps);
  assert.ok(!JSON.stringify(r.corps).includes(a.id), 'pas d’identifiant');
  erreurFr(await appel(compteGet), 401);
  erreurFr(await appel(compteGet, { jeton: `${a.id}.${'z'.repeat(32)}` }), 401);
  assert.deepEqual((await appel(compteGet, { requete: '?config=1' })).corps, { google: null });
  assert.deepEqual((await appel(compteGet, { requete: '?config=1', env: { DB: db, GOOGLE_CLIENT_ID: 'id-client.apps.googleusercontent.com' } })).corps, { google: 'id-client.apps.googleusercontent.com' });
  assert.deepEqual((await appel(compteGet, { requete: '?config=1', env: { DB: undefined } })).corps, { google: null }, 'la config ne demande pas la base');
});

test('progression : le pseudo d’un compte ne se change pas par la synchronisation (il est unique) ; celui d’un ancien profil si', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: a.jeton, corps: { pseudo: 'Usurpateur', ton: 'sobre', etat: { xp: 5 } } }));
  assert.deepEqual((await appel(progressionGet, { jeton: a.jeton })).corps, { pseudo: 'Greg', ton: 'sobre', etat: { xp: 5 } });
  assert.equal(ligneJoueur(a.id).pseudo_cle, 'greg');
});

// --- Phrase de secours -------------------------------------------------------------------------------------

test('compte secours : la phrase (sans casse ni accents) donne un nouveau mot de passe, efface toutes les sessions et ouvre une nouvelle', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const autre = await connexion('greg'); // un deuxième appareil
  const NOUVEAU = 'le tout nouveau mot de passe';
  const phrase = a.phrase.toUpperCase().replace(/ /g, '  ');
  const r = await postCompte({ action: 'secours', pseudo: 'GREG', phrase, nouveauMdp: NOUVEAU });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.deepEqual(Object.keys(r.corps).sort(), ['cle', 'id', 'nom', 'prenom', 'pseudo', 'role']);
  sansSecret(r.corps);
  // Anciennes sessions effacées (tous les appareils), nouvelle session valable.
  erreurFr(await appel(progressionGet, { jeton: a.jeton }), 401);
  erreurFr(await appel(progressionGet, { jeton: `${autre.corps.id}.${autre.corps.cle}` }), 401);
  assert.equal((await appel(progressionGet, { jeton: `${r.corps.id}.${r.corps.cle}` })).statut, 200);
  assert.equal(lignes('SELECT * FROM sessions').length, 1);
  // L'ancien mot de passe ne marche plus, le nouveau oui ; la phrase reste valable (même phrase, pas de rotation).
  erreurFr(await connexion('greg', MDP), 401);
  assert.equal((await connexion('greg', NOUVEAU)).statut, 200);
  assert.equal((await postCompte({ action: 'secours', pseudo: 'greg', phrase: a.phrase, nouveauMdp: 'encore un autre mot de passe' })).statut, 200);
  assert.ok(!toutLeTexte().includes(NOUVEAU));
});

test('compte secours : mauvaise phrase, phrase d’un autre compte, pseudo inconnu -> même 401 ; nouveau mot de passe trop court -> 400 sans compter', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Autre');
  const NOUVEAU = 'le tout nouveau mot de passe';
  const refus = [
    await postCompte({ action: 'secours', pseudo: 'greg', phrase: 'une phrase fausse', nouveauMdp: NOUVEAU }),
    await postCompte({ action: 'secours', pseudo: 'greg', phrase: b.phrase, nouveauMdp: NOUVEAU }),
    await postCompte({ action: 'secours', pseudo: 'inconnu', phrase: a.phrase, nouveauMdp: NOUVEAU }),
    await postCompte({ action: 'secours', pseudo: 'greg', phrase: '', nouveauMdp: NOUVEAU }),
    await postCompte({ action: 'secours', pseudo: 'greg', phrase: 12, nouveauMdp: NOUVEAU }),
    await postCompte({ action: 'secours', pseudo: 'greg', phrase: MDP, nouveauMdp: NOUVEAU }), // le mot de passe n'est pas la phrase
  ];
  for (const r of refus) erreurFr(r, 401, /Pseudo ou phrase de secours incorrect/);
  assert.equal(await verifierMdp(MDP, ligneJoueur(a.id).mdp_hash), true, 'mot de passe inchangé');
  assert.equal(lignes('SELECT * FROM sessions WHERE joueur_id = ?', a.id).length, 1, 'sessions intactes');
  for (const court of ['court', '', undefined, 'x'.repeat(129), 1234567890]) {
    erreurFr(await postCompte({ action: 'secours', pseudo: 'greg', phrase: a.phrase, nouveauMdp: court }), 400);
  }
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'echec:secours:greg'")[0].n, 5, 'seuls les vrais essais ratés comptent (pas les 400)');
  assert.equal(lignes("SELECT n FROM quotas WHERE cle = 'echec:secours:inconnu'")[0].n, 1);
});

test('compte secours : 10 échecs par jour par pseudo et par IP, puis 429 même avec la bonne phrase ; la connexion a son propre compteur', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const ip = '192.0.2.220';
  const NOUVEAU = 'le tout nouveau mot de passe';
  for (let i = 0; i < 10; i++) erreurFr(await postCompte({ action: 'secours', pseudo: 'greg', phrase: 'phrase fausse ' + i, nouveauMdp: NOUVEAU }, { ip }), 401);
  erreurFr(await postCompte({ action: 'secours', pseudo: 'greg', phrase: a.phrase, nouveauMdp: NOUVEAU }, { ip }), 429, /Trop d’essais/);
  assert.equal(await verifierMdp(MDP, ligneJoueur(a.id).mdp_hash), true);
  // Dix mots de passe faux plus tôt n'empêchaient pas le secours : les deux compteurs sont séparés.
  assert.equal((await connexion('greg', MDP, { ip })).statut, 200);
  // Une autre IP peut utiliser la phrase.
  assert.equal((await postCompte({ action: 'secours', pseudo: 'greg', phrase: a.phrase, nouveauMdp: NOUVEAU }, { ip: '192.0.2.221' })).statut, 200);
  // Et inversement : trop de mots de passe faux ne bloquent pas le secours.
  const ip2 = '192.0.2.222';
  for (let i = 0; i < 10; i++) erreurFr(await connexion('greg', 'faux ' + i, { ip: ip2 }), 401);
  erreurFr(await connexion('greg', NOUVEAU, { ip: ip2 }), 429);
  assert.equal((await postCompte({ action: 'secours', pseudo: 'greg', phrase: a.phrase, nouveauMdp: 'et un dernier mot de passe' }, { ip: ip2 })).statut, 200);
});

// --- Changer le mot de passe, supprimer ------------------------------------------------------------------------

test('compte mdp : change le mot de passe, garde cette session, efface les autres ; ancien faux 401 ; 10 échecs par jour puis 429', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const autre = await connexion('greg');
  const NOUVEAU = 'un autre mot de passe encore';
  erreurFr(await postCompte({ action: 'mdp', ancien: MDP, nouveau: NOUVEAU }), 401, /Connexion requise/);
  for (const court of ['court', '', undefined, 'x'.repeat(129)]) erreurFr(await postCompte({ action: 'mdp', ancien: MDP, nouveau: court }, { jeton: a.jeton }), 400);
  erreurFr(await postCompte({ action: 'mdp', ancien: 'faux mot de passe', nouveau: NOUVEAU }, { jeton: a.jeton }), 401, /Mot de passe incorrect/);
  erreurFr(await postCompte({ action: 'mdp', nouveau: NOUVEAU }, { jeton: a.jeton }), 401);
  assert.equal(await verifierMdp(MDP, ligneJoueur(a.id).mdp_hash), true);
  const r = await postCompte({ action: 'mdp', ancien: MDP, nouveau: NOUVEAU }, { jeton: a.jeton });
  assert.deepEqual(r.corps, { ok: true });
  assert.equal(await verifierMdp(NOUVEAU, ligneJoueur(a.id).mdp_hash), true);
  assert.equal((await appel(progressionGet, { jeton: a.jeton })).statut, 200, 'cet appareil reste connecté');
  erreurFr(await appel(progressionGet, { jeton: `${autre.corps.id}.${autre.corps.cle}` }), 401);
  erreurFr(await connexion('greg', MDP), 401);
  assert.equal((await connexion('greg', NOUVEAU)).statut, 200);
  // Limite d'échecs par compte : une session volée ne sert pas à deviner le mot de passe.
  for (let i = 0; i < 10; i++) erreurFr(await postCompte({ action: 'mdp', ancien: 'faux ' + i, nouveau: MDP }, { jeton: a.jeton }), 401);
  erreurFr(await postCompte({ action: 'mdp', ancien: NOUVEAU, nouveau: MDP }, { jeton: a.jeton }), 429);
  assert.equal(await verifierMdp(NOUVEAU, ligneJoueur(a.id).mdp_hash), true);
  // Un ancien profil n'a pas de mot de passe à changer.
  const vieux = await creerJoueur('Vieux');
  erreurFr(await postCompte({ action: 'mdp', ancien: 'x', nouveau: NOUVEAU }, { jeton: vieux.jeton }), 400, /compte/);
});

test('compte supprimer : mot de passe exigé (401 sinon, 10 échecs puis 429), efface compte, sessions, progression, amitiés, demandes ; les formations restent, anonymes', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Ami');
  const c = await creerCompte('Autre');
  const d = await creerCompte('Etranger');
  // Du contenu lié à Greg : progression, formation, sujet, duel et scores, groupe, partie, amitiés, demande, invitation, code, brouillon, signalement.
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: a.jeton, corps: { etat: { xp: 99, parcours: { x: { fait: [1] } } } } }));
  db.base.prepare("INSERT INTO parcours (id, titre, contenu, auteur, vues, cree) VALUES ('la-mer', 'La mer', '{}', ?, 0, '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO sujets (id, titre, parent, niveau, contenu, auteur, vues, cree) VALUES ('s1', 'Sujet', NULL, 1, '{}', ?, 0, '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO brouillons (joueur, sujet, contenu, cree) VALUES (?, 's', '{}', '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO signalements (joueur, chapitre, exercice, message, cree) VALUES (?, 'hg-01', 0, 'oups', '2026-10-20')").run(a.id);
  const scores = [{ joueur: a.id, pseudo: 'Greg', justes: 1, n: 5, points: 10, date: '2026-10-20' }, { joueur: b.id, pseudo: 'Ami', justes: 3, n: 5, points: 30, date: '2026-10-20' }];
  db.base.prepare("INSERT INTO duels (id, createur, questions, scores, cree) VALUES ('duelaaaa', ?, '[]', ?, '2026-10-20')").run(a.id, JSON.stringify(scores));
  db.base.prepare("INSERT INTO duels (id, createur, questions, scores, cree) VALUES ('duelbbbb', ?, '[]', ?, '2026-10-20')").run(b.id, JSON.stringify(scores));
  db.base.prepare("INSERT INTO groupes (id, nom, parcours, createur, cree) VALUES ('grpseul1', 'Seul', 'la-mer', ?, '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO groupe_membres (groupe, joueur, rejoint) VALUES ('grpseul1', ?, '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO groupes (id, nom, parcours, createur, cree) VALUES ('grpduo01', 'Duo', 'la-mer', ?, '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO groupe_membres (groupe, joueur, rejoint) VALUES ('grpduo01', ?, '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO groupe_membres (groupe, joueur, rejoint) VALUES ('grpduo01', ?, '2026-10-20')").run(b.id);
  db.base.prepare("INSERT INTO parties (id, createur, titre, questions, etat, indice, debut_question, cree) VALUES ('PARTAA', ?, 't', '[]', 'attente', 0, 0, '2026-10-20')").run(a.id);
  db.base.prepare("INSERT INTO parties_joueurs (partie, joueur, points) VALUES ('PARTAA', ?, 0)").run(a.id);
  db.base.prepare("INSERT INTO parties_joueurs (partie, joueur, points) VALUES ('PARTAA', ?, 0)").run(b.id);
  db.base.prepare("INSERT INTO parties_reponses (partie, joueur, indice, choix, ms, juste) VALUES ('PARTAA', ?, 0, 1, 100, 1)").run(b.id);
  db.base.prepare("INSERT INTO parties (id, createur, titre, questions, etat, indice, debut_question, cree) VALUES ('PARTBB', ?, 't', '[]', 'attente', 0, 0, '2026-10-20')").run(b.id);
  db.base.prepare("INSERT INTO parties_joueurs (partie, joueur, points) VALUES ('PARTBB', ?, 0)").run(a.id);
  db.base.prepare("INSERT INTO parties_reponses (partie, joueur, indice, choix, ms, juste) VALUES ('PARTBB', ?, 0, 1, 100, 1)").run(a.id);
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', '2026-10-20')").run(a.id, b.id);
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'demande', '2026-10-20')").run(c.id, a.id);
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'demande', '2026-10-20')").run(a.id, d.id);
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', '2026-10-20')").run(b.id, c.id);
  db.base.prepare("INSERT INTO invitations (jeton_hash, joueur_id, cree, expire, usages_max, usages) VALUES ('h', ?, '2026-10-20', '2099-01-01', 5, 0)").run(a.id);
  db.base.prepare("INSERT INTO codes (code, bonus, jours, usages_max, usages, cree, revoque) VALUES ('abcdefgh', 3, 30, 5, 1, '2026-10-20', 0)").run();
  db.base.prepare("INSERT INTO codes_utilises (code, joueur_id, expire) VALUES ('abcdefgh', ?, '2099-01-01')").run(a.id);
  ok200(await appel(amisGet, { jeton: a.jeton }));
  const jetonAutre = (await connexion('greg')).corps;
  const quotasAvant = lignes('SELECT cle FROM quotas').length;
  assert.ok(quotasAvant > 0);

  // Refus : pas de session, pas de mot de passe, mauvais mot de passe.
  erreurFr(await postCompte({ action: 'supprimer', mdp: MDP }), 401);
  erreurFr(await postCompte({ action: 'supprimer' }, { jeton: a.jeton }), 401, /Mot de passe incorrect/);
  erreurFr(await postCompte({ action: 'supprimer', mdp: 'faux' }, { jeton: a.jeton }), 401, /Mot de passe incorrect/);
  erreurFr(await postCompte({ action: 'supprimer', mdp: NOUVEAU_SANS }, { jeton: a.jeton }), 401);
  assert.ok(ligneJoueur(a.id), 'rien n’est effacé après un refus');
  for (let i = 0; i < 7; i++) erreurFr(await postCompte({ action: 'supprimer', mdp: 'faux ' + i }, { jeton: a.jeton }), 401);
  erreurFr(await postCompte({ action: 'supprimer', mdp: MDP }, { jeton: a.jeton }), 429);
  assert.ok(ligneJoueur(a.id), '10 échecs : même le bon mot de passe est refusé');
  db.base.prepare("UPDATE quotas SET jour = '2000-01-01' WHERE cle LIKE 'echec:mdp:%'").run();

  const r = await postCompte({ action: 'supprimer', mdp: MDP }, { jeton: a.jeton });
  assert.deepEqual(r.corps, { ok: true });
  // Plus rien du compte.
  assert.equal(ligneJoueur(a.id), undefined);
  erreurFr(await appel(progressionGet, { jeton: a.jeton }), 401);
  erreurFr(await appel(progressionGet, { jeton: `${jetonAutre.id}.${jetonAutre.cle}` }), 401);
  erreurFr(await connexion('greg'), 401);
  const tout = toutLeTexte();
  assert.ok(!tout.includes(a.id), 'identifiant retrouvé quelque part');
  assert.ok(!/"pseudo":"Greg"/.test(tout) && !tout.includes('Greg'), 'pseudo retrouvé quelque part');
  assert.ok(!tout.includes(await sha256Hex(a.cle)));
  assert.equal(lignes('SELECT * FROM amities').length, 1, 'seule l’amitié entre deux autres comptes reste');
  assert.equal(lignes('SELECT * FROM invitations').length, 0);
  assert.equal(lignes('SELECT * FROM codes_utilises').length, 0);
  assert.equal(lignes('SELECT * FROM brouillons').length + lignes('SELECT * FROM signalements').length, 0);
  assert.deepEqual(lignes('SELECT id, auteur FROM parcours'), [{ id: 'la-mer', auteur: null }], 'la formation reste, sans auteur');
  assert.deepEqual(lignes('SELECT id, auteur FROM sujets'), [{ id: 's1', auteur: null }]);
  // Duels : la ligne de score de Greg part, celle des autres reste ; le duel créé par lui reste, sans créateur.
  assert.deepEqual(lignes('SELECT id, createur, scores FROM duels ORDER BY id').map((x) => [x.id, x.createur === null || x.createur === b.id, JSON.parse(x.scores).map((s) => s.pseudo)]), [['duelaaaa', true, ['Ami']], ['duelbbbb', true, ['Ami']]]);
  assert.equal((await appel(duelGet, { requete: '?id=duelaaaa' })).corps.duel.createur, 'Un joueur');
  // Groupes : le groupe sans autre membre disparaît, l'autre reste.
  assert.deepEqual(lignes('SELECT id, createur FROM groupes'), [{ id: 'grpduo01', createur: null }]);
  assert.deepEqual(lignes('SELECT groupe, joueur FROM groupe_membres'), [{ groupe: 'grpduo01', joueur: b.id }]);
  // Parties : celles qu'il a créées disparaissent avec leurs lignes, sa participation aux autres aussi.
  assert.deepEqual(lignes('SELECT id FROM parties').map((x) => x.id), ['PARTBB']);
  assert.deepEqual(lignes('SELECT partie, joueur FROM parties_joueurs'), []);
  assert.deepEqual(lignes('SELECT * FROM parties_reponses'), []);
  // Quotas à son nom effacés ; les autres comptes ne sont pas touchés.
  assert.ok(!lignes('SELECT cle FROM quotas').some((q) => q.cle.endsWith(':' + a.id)));
  for (const autreCompte of [b, c, d]) assert.ok(ligneJoueur(autreCompte.id));
  assert.equal((await appel(progressionGet, { jeton: b.jeton })).statut, 200);
  // Les demandes envoyées ou reçues ont disparu ; le pseudo est de nouveau libre.
  assert.deepEqual((await appel(amisGet, { jeton: c.jeton })).corps.recues, []);
  assert.deepEqual((await appel(amisGet, { jeton: d.jeton })).corps.recues, []);
  assert.equal((await postCompte({ action: 'inscrire', prenom: 'G', nom: 'M', pseudo: 'greg', mdp: MDP })).statut, 200);
});
const NOUVEAU_SANS = 'le bon mot de passe est ' + MDP.length;

test('compte supprimer : un ancien profil confirme avec confirmer: true ; sinon 400', async () => {
  toutVider();
  const vieux = await creerJoueur('Vieux');
  erreurFr(await postCompte({ action: 'supprimer' }, { jeton: vieux.jeton }), 400, /Confirme/);
  erreurFr(await postCompte({ action: 'supprimer', confirmer: 'oui' }, { jeton: vieux.jeton }), 400);
  assert.ok(ligneJoueur(vieux.id));
  assert.deepEqual((await postCompte({ action: 'supprimer', confirmer: true }, { jeton: vieux.jeton })).corps, { ok: true });
  assert.equal(lignes('SELECT * FROM joueurs').length, 0);
});

// --- Google -------------------------------------------------------------------------------------------------------

const CLIENT_GOOGLE = 'client-test.apps.googleusercontent.com';
const envGoogle = { DB: db, GOOGLE_CLIENT_ID: CLIENT_GOOGLE };
const JETON_GOOGLE = 'eyJhbGciOiJSUzI1NiJ9.' + 'a'.repeat(60) + '.' + 'b'.repeat(40);
const infoGoogle = (autre = {}) => ({
  aud: CLIENT_GOOGLE, iss: 'https://accounts.google.com', sub: '110248495921238986420', email: 'greg@example.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 3000), ...autre,
});
const reponseGoogle = (obj, statut = 200) => () => new Response(JSON.stringify(obj), { status: statut, headers: { 'content-type': 'application/json' } });
const postGoogle = (corps, options = {}) => appel(comptePost, { env: envGoogle, methode: 'POST', ip: nouvelleIp(), corps: { action: 'google', jeton: JETON_GOOGLE, ...corps }, ...options });

test('compte google : refusé sans GOOGLE_CLIENT_ID ; le jeton est vérifié (aud, iss, email_verified, exp) avant toute création', async () => {
  toutVider();
  reinitExt();
  ext.google = reponseGoogle(infoGoogle());
  erreurFr(await appel(comptePost, { methode: 'POST', corps: { action: 'google', jeton: JETON_GOOGLE } }), 404, /Google/);
  assert.equal(ext.appels.length, 0, 'sans identifiant client, Google n’est même pas appelé');
  for (const mauvais of [
    infoGoogle({ aud: 'un-autre-client' }), infoGoogle({ iss: 'https://evil.example' }), infoGoogle({ email_verified: 'false' }), infoGoogle({ email_verified: undefined }),
    infoGoogle({ exp: String(Math.floor(Date.now() / 1000) - 10) }), infoGoogle({ exp: 'demain' }), infoGoogle({ sub: undefined }), infoGoogle({ sub: 'pas-un-nombre' }),
  ]) {
    ext.google = reponseGoogle(mauvais);
    erreurFr(await postGoogle({}), 401, /Google refusée/);
  }
  ext.google = reponseGoogle({ error: 'invalid_token' }, 400);
  erreurFr(await postGoogle({}), 401, /Google refusée/);
  ext.google = () => new Response('<html>pas du json</html>', { status: 200 });
  erreurFr(await postGoogle({}), 401);
  ext.google = () => { throw new Error('réseau coupé'); };
  erreurFr(await postGoogle({}), 503, /Google ne répond pas/);
  // Jetons mal formés : refusés sans appeler Google.
  ext.appels = [];
  for (const mauvais of [undefined, '', 'court', 'x'.repeat(3000) + '#', 'avec espace ' + 'a'.repeat(30), 12, { a: 1 }]) erreurFr(await postGoogle({ jeton: mauvais }), 401);
  assert.equal(ext.appels.length, 0);
  assert.equal(lignes('SELECT * FROM joueurs').length, 0);
  // Ce qui part vers Google : le jeton, en paramètre id_token, en GET, et rien d'autre.
  ext.google = reponseGoogle(infoGoogle());
  ext.appels = [];
  await postGoogle({});
  assert.equal(ext.appels[0].url.origin + ext.appels[0].url.pathname, 'https://oauth2.googleapis.com/tokeninfo');
  assert.equal(ext.appels[0].url.searchParams.get('id_token'), JETON_GOOGLE);
  assert.ok(!ext.appels[0].init.method || ext.appels[0].init.method === 'GET');
  reinitExt();
});

test('compte google : premier passage -> {aCompleter}, puis pseudo/prénom/nom créent le compte ; ensuite connexion directe ; compte bloqué 403', async () => {
  toutVider();
  reinitExt();
  ext.google = reponseGoogle(infoGoogle());
  const premier = await postGoogle({});
  assert.deepEqual(premier.corps, { aCompleter: true });
  assert.equal(lignes('SELECT * FROM joueurs').length, 0, 'rien n’est créé avant le pseudo');
  for (const mauvais of [{ pseudo: 'ab', prenom: 'G', nom: 'M' }, { pseudo: 'greg', prenom: '', nom: 'M' }, { pseudo: 'greg', prenom: 'G' }, { pseudo: 'greg', nom: 'M' }]) {
    erreurFr(await postGoogle(mauvais), 400);
  }
  const cree = await postGoogle({ pseudo: 'GregG', prenom: 'Grégoire', nom: 'Muel' });
  assert.equal(cree.statut, 200, JSON.stringify(cree.corps));
  assert.deepEqual(Object.keys(cree.corps).sort(), ['cle', 'id', 'nom', 'prenom', 'pseudo', 'role']);
  assert.ok(!('phrase' in cree.corps), 'pas de phrase de secours : pas de mot de passe');
  const j = ligneJoueur(cree.corps.id);
  assert.deepEqual([j.google_sub, j.pseudo_cle, j.mdp_hash, j.secours_hash], ['110248495921238986420', 'gregg', null, null]);
  assert.equal((await appel(progressionGet, { jeton: `${cree.corps.id}.${cree.corps.cle}` })).statut, 200);
  const g = (await appel(compteGet, { jeton: `${cree.corps.id}.${cree.corps.cle}` })).corps;
  assert.deepEqual([g.google, g.motDePasse, g.compte], [true, false, true]);
  // Retour : connexion directe, sans rien redemander.
  const retour = await postGoogle({});
  assert.equal(retour.statut, 200);
  assert.equal(retour.corps.id, cree.corps.id);
  assert.equal(lignes('SELECT * FROM sessions').length, 2);
  // Pas de connexion par mot de passe ni par phrase pour ce compte.
  erreurFr(await connexion('GregG', MDP), 401);
  erreurFr(await postCompte({ action: 'secours', pseudo: 'gregg', phrase: 'a b c', nouveauMdp: MDP }), 401);
  erreurFr(await postCompte({ action: 'mdp', ancien: MDP, nouveau: 'un autre mot de passe' }, { jeton: `${cree.corps.id}.${cree.corps.cle}` }), 400, /Google/);
  // Un autre compte Google ne peut pas prendre le même pseudo ; un pseudo de compte à mot de passe non plus.
  ext.google = reponseGoogle(infoGoogle({ sub: '999999999999999999999' }));
  erreurFr(await postGoogle({ pseudo: 'gregg', prenom: 'X', nom: 'Y' }), 409, /déjà pris/);
  // Bloqué : 403.
  ext.google = reponseGoogle(infoGoogle());
  db.base.prepare('UPDATE joueurs SET bloque = 1 WHERE id = ?').run(cree.corps.id);
  erreurFr(await postGoogle({}), 403, /bloqué/);
  reinitExt();
});

test('compte google : un ancien profil est complété avec Google (progression gardée) ; suppression avec un jeton Google frais', async () => {
  toutVider();
  reinitExt();
  ext.google = reponseGoogle(infoGoogle());
  const vieux = await creerJoueur('Vieux');
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: vieux.jeton, corps: { etat: { xp: 77 } } }));
  const r = await postGoogle({ pseudo: 'vieux', prenom: 'V', nom: 'P' }, { jeton: vieux.jeton });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.equal(r.corps.id, vieux.id);
  const jeton = `${r.corps.id}.${r.corps.cle}`;
  assert.equal((await appel(progressionGet, { jeton })).corps.etat.xp, 77);
  erreurFr(await appel(progressionGet, { jeton: vieux.jeton }), 401);
  // Suppression : exige un jeton Google qui désigne le même compte.
  erreurFr(await postCompte({ action: 'supprimer' }, { jeton, env: envGoogle }), 401);
  ext.google = reponseGoogle(infoGoogle({ sub: '555555555555' }));
  erreurFr(await postCompte({ action: 'supprimer', jeton: JETON_GOOGLE }, { jeton, env: envGoogle }), 401);
  assert.ok(ligneJoueur(vieux.id));
  ext.google = reponseGoogle(infoGoogle());
  assert.deepEqual((await postCompte({ action: 'supprimer', jeton: JETON_GOOGLE }, { jeton, env: envGoogle })).corps, { ok: true });
  assert.equal(lignes('SELECT * FROM joueurs').length, 0);
  reinitExt();
});

// --- Admin ------------------------------------------------------------------------------------------------------

const CLE_ADMIN = 'cle-admin-de-test-' + 'x'.repeat(10);
const envCle = { DB: db, ADMIN_KEY: CLE_ADMIN };
const adminAvec = (handler, options = {}) => appel(handler, { env: envCle, ip: nouvelleIp(), ...options });
const postAdmin = (corps, options = {}) => adminAvec(adminPost, { methode: 'POST', corps, ...options });

test('admin par session : un compte admin entre sans clé ; un compte ordinaire, un anonyme, un profil sans compte reçoivent 403', async () => {
  toutVider();
  const chef = await creerCompte('Chef');
  const simple = await creerCompte('Simple');
  const vieux = await creerJoueur('Vieux');
  faireAdmin(chef);
  assert.equal((await adminAvec(adminGet, { jeton: chef.jeton })).statut, 200);
  assert.equal((await postAdmin({ action: 'pause' }, { jeton: chef.jeton })).statut, 200);
  assert.equal((await adminAvec(adminGet, { jeton: chef.jeton, requete: '?comptes=1' })).statut, 200);
  for (const options of [{ jeton: simple.jeton }, {}, { jeton: vieux.jeton }, { jeton: `${chef.id}.${'z'.repeat(32)}` }, { jeton: simple.jeton, entetes: { 'x-admin-cle': 'mauvaise' } }]) {
    erreurFr(await adminAvec(adminGet, options), 403, /Accès refusé/);
    erreurFr(await adminAvec(adminGet, { ...options, requete: '?comptes=1' }), 403);
    erreurFr(await adminAvec(adminGet, { ...options, requete: '?codes=1' }), 403);
    erreurFr(await postAdmin({ action: 'bloquer', pseudo: 'simple' }, options), 403);
    erreurFr(await postAdmin({ action: 'creer_code', bonus: 5, jours: 7, usages: 3 }, options), 403);
    erreurFr(await postAdmin({ action: 'reinitialiser', pseudo: 'simple' }, options), 403);
  }
  assert.equal(ligneJoueur(simple.id).bloque, 0);
  // La clé x-admin-cle reste acceptée (avec ou sans session), et la session d'un admin bloqué ne vaut plus rien.
  assert.equal((await adminAvec(adminGet, { entetes: { 'x-admin-cle': CLE_ADMIN } })).statut, 200);
  assert.equal((await adminAvec(adminGet, { jeton: simple.jeton, entetes: { 'x-admin-cle': CLE_ADMIN } })).statut, 200);
  db.base.prepare('UPDATE joueurs SET bloque = 1 WHERE id = ?').run(chef.id);
  erreurFr(await adminAvec(adminGet, { jeton: chef.jeton }), 403);
  assert.equal((await adminAvec(adminGet, { jeton: chef.jeton, entetes: { 'x-admin-cle': CLE_ADMIN } })).statut, 200, 'la clé reste valable');
  // Un rôle ne s'obtient pas en le demandant : aucune route ne permet de se donner le rôle admin sans la clé.
  erreurFr(await postAdmin({ action: 'promouvoir' }, { jeton: simple.jeton }), 403);
  assert.equal(ligneJoueur(simple.id).role, 'joueur');
});

test('admin promouvoir : exige un compte connecté ET la clé ADMIN_KEY (limitée à 20 essais par jour) ; le compte devient admin', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const vieux = await creerJoueur('Vieux');
  const ip = '192.0.2.230';
  erreurFr(await postAdmin({ action: 'promouvoir' }, { entetes: { 'x-admin-cle': CLE_ADMIN }, ip }), 401, /Connecte-toi/);
  erreurFr(await postAdmin({ action: 'promouvoir' }, { jeton: vieux.jeton, entetes: { 'x-admin-cle': CLE_ADMIN }, ip }), 401);
  erreurFr(await postAdmin({ action: 'promouvoir' }, { jeton: a.jeton, ip }), 403);
  erreurFr(await postAdmin({ action: 'promouvoir' }, { jeton: a.jeton, entetes: { 'x-admin-cle': CLE_ADMIN + 'x' }, ip }), 403);
  erreurFr(await postAdmin({ action: 'promouvoir' }, { jeton: a.jeton, entetes: { 'x-admin-cle': '' }, ip }), 403);
  erreurFr(await appel(adminPost, { env: { DB: db }, methode: 'POST', corps: { action: 'promouvoir' }, jeton: a.jeton, entetes: { 'x-admin-cle': 'x' }, ip }), 403, 'sans ADMIN_KEY : jamais accepté');
  assert.equal(ligneJoueur(a.id).role, 'joueur');
  const r = await postAdmin({ action: 'promouvoir' }, { jeton: a.jeton, entetes: { 'x-admin-cle': CLE_ADMIN }, ip });
  assert.deepEqual(r.corps, { ok: true, role: 'admin' });
  assert.equal(ligneJoueur(a.id).role, 'admin');
  assert.equal((await appel(compteGet, { jeton: a.jeton })).corps.role, 'admin');
  // Désormais, plus besoin de la clé.
  assert.equal((await adminAvec(adminGet, { jeton: a.jeton, ip })).statut, 200);
  // La limite de 20 mauvais essais par adresse bloque aussi la bonne clé.
  const b = await creerCompte('Autre');
  const ip2 = '192.0.2.231';
  for (let i = 0; i < 20; i++) erreurFr(await postAdmin({ action: 'promouvoir' }, { jeton: b.jeton, entetes: { 'x-admin-cle': 'faux' + i }, ip: ip2 }), 403);
  erreurFr(await postAdmin({ action: 'promouvoir' }, { jeton: b.jeton, entetes: { 'x-admin-cle': CLE_ADMIN }, ip: ip2 }), 403);
  assert.equal(ligneJoueur(b.id).role, 'joueur');
});

test('admin comptes : liste (50 par page) avec pseudo, prénom, nom, créé, vu, leçons, XP, bloqué, rôle ; aucun hash, aucun identifiant ; recherche', async () => {
  toutVider();
  const chef = await creerCompte('Chef');
  faireAdmin(chef);
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: chef.jeton, corps: { etat: { xp: 120, parcours: { a: { fait: [1, 2] } } } } }));
  const ajout = db.base.prepare("INSERT INTO joueurs (id, pseudo, pseudo_cle, prenom, nom, mdp_hash, secours_hash, cree, role, bloque) VALUES (?, ?, ?, ?, ?, 'pbkdf2$100000$aa$bb', 'pbkdf2$100000$cc$dd', ?, 'joueur', ?)");
  for (let i = 0; i < 55; i++) ajout.run('id' + String(i).padStart(10, '0'), 'Joueur' + i, 'joueur' + i, i === 7 ? 'Zoé' : 'Prénom' + i, i === 8 ? 'Du_Pont' : 'Nom' + i, `2026-10-1${i % 10}T10:00:00Z`, i === 3 ? 1 : 0);
  db.base.prepare("INSERT INTO joueurs (id, pseudo) VALUES ('profilsanscompte', 'Ancien')").run();
  const p1 = (await adminAvec(adminGet, { jeton: chef.jeton, requete: '?comptes=1' })).corps;
  assert.deepEqual([p1.page, p1.parPage, p1.total, p1.comptes.length], [0, 50, 56, 50]);
  const p2 = (await adminAvec(adminGet, { jeton: chef.jeton, requete: '?comptes=1&page=1' })).corps;
  assert.deepEqual([p2.page, p2.comptes.length], [1, 6]);
  const tous = [...p1.comptes, ...p2.comptes];
  assert.equal(new Set(tous.map((c) => c.pseudo)).size, 56, 'pas de doublon entre les pages');
  assert.ok(!tous.some((c) => c.pseudo === 'Ancien'), 'les profils sans compte ne sont pas des comptes');
  const moi = tous.find((c) => c.pseudo === 'Chef');
  assert.deepEqual(Object.keys(moi).sort(), ['bloque', 'cree', 'lecons', 'nom', 'prenom', 'pseudo', 'role', 'vu', 'xp']);
  assert.deepEqual([moi.prenom, moi.nom, moi.role, moi.bloque, moi.lecons, moi.xp], ['Grégoire', 'Muel', 'admin', false, 2, 120]);
  assert.equal(tous.find((c) => c.pseudo === 'Joueur3').bloque, true);
  const texte = JSON.stringify([p1, p2]);
  assert.ok(!/pbkdf2|hash|secours|reinit|id0000/i.test(texte), 'ni hash, ni identifiant, ni secret');
  // Recherche : pseudo, prénom ou nom, sans casse ; les caractères % et _ ne sont pas des jokers.
  const q = async (terme) => (await adminAvec(adminGet, { jeton: chef.jeton, requete: '?comptes=1&q=' + encodeURIComponent(terme) })).corps;
  assert.deepEqual((await q('joueur1')).comptes.map((c) => c.pseudo).sort(), ['Joueur1', 'Joueur10', 'Joueur11', 'Joueur12', 'Joueur13', 'Joueur14', 'Joueur15', 'Joueur16', 'Joueur17', 'Joueur18', 'Joueur19']);
  assert.deepEqual((await q('ZOÉ')).comptes.map((c) => c.pseudo), ['Joueur7']);
  assert.equal((await q('zoé')).total, 1);
  assert.equal((await q('du_pont')).total, 1);
  assert.equal((await q('du%pont')).total, 0);
  assert.equal((await q('%')).total, 0);
  assert.equal((await q('_')).total, 1, 'le tiret bas est cherché tel quel (Du_Pont)');
  assert.equal((await q('introuvable')).total, 0);
  assert.deepEqual((await q('introuvable')).comptes, []);
  // Page absurde : vide, sans erreur.
  assert.deepEqual((await adminAvec(adminGet, { jeton: chef.jeton, requete: '?comptes=1&page=abc' })).corps.page, 0);
  assert.deepEqual((await adminAvec(adminGet, { jeton: chef.jeton, requete: '?comptes=1&page=99999' })).corps.comptes, []);
});

test('admin bloquer / débloquer : par pseudo exact ; efface les sessions ; 404 si inconnu ; jamais soi-même ; « debloquer » avec une formation reste la génération', async () => {
  toutVider();
  const chef = await creerCompte('Chef');
  faireAdmin(chef);
  const cible = await creerCompte('Cible');
  const cible2 = await connexion('cible');
  erreurFr(await postAdmin({ action: 'bloquer', pseudo: 'inconnu' }, { jeton: chef.jeton }), 404);
  erreurFr(await postAdmin({ action: 'bloquer' }, { jeton: chef.jeton }), 404);
  erreurFr(await postAdmin({ action: 'bloquer', pseudo: 'cib' }, { jeton: chef.jeton }), 404);
  erreurFr(await postAdmin({ action: 'bloquer', pseudo: 'chef' }, { jeton: chef.jeton }), 400, /propre compte/);
  assert.equal(ligneJoueur(chef.id).bloque, 0);
  const r = await postAdmin({ action: 'bloquer', pseudo: 'CIBLE' }, { jeton: chef.jeton });
  assert.deepEqual(r.corps, { ok: true, pseudo: 'Cible', bloque: true });
  assert.equal(ligneJoueur(cible.id).bloque, 1);
  assert.equal(lignes('SELECT * FROM sessions WHERE joueur_id = ?', cible.id).length, 0, 'sessions effacées');
  erreurFr(await appel(progressionGet, { jeton: cible.jeton }), 401);
  erreurFr(await appel(progressionGet, { jeton: `${cible2.corps.id}.${cible2.corps.cle}` }), 401);
  erreurFr(await connexion('cible'), 403);
  const d = await postAdmin({ action: 'debloquer', pseudo: 'cible' }, { jeton: chef.jeton });
  assert.deepEqual(d.corps, { ok: true, pseudo: 'Cible', bloque: false });
  assert.equal((await connexion('cible')).statut, 200);
  // Avec la clé seule (sans compte), on peut bloquer ; « debloquer » avec parcours met toujours une formation en file.
  assert.equal((await postAdmin({ action: 'bloquer', pseudo: 'cible' }, { entetes: { 'x-admin-cle': CLE_ADMIN } })).statut, 200);
  assert.equal(ligneJoueur(cible.id).bloque, 1);
  const gen = await postAdmin({ action: 'debloquer', parcours: 'formation-inexistante' }, { jeton: chef.jeton });
  assert.notEqual(gen.corps.bloque, true);
  assert.equal(ligneJoueur(cible.id).bloque, 1, 'la génération ne débloque aucun compte');
});

test('admin reinitialiser : code temporaire de 8 caractères valable 24 h, gardé haché ; il sert de phrase dans secours, une seule fois', async () => {
  toutVider();
  const chef = await creerCompte('Chef');
  faireAdmin(chef);
  const cible = await creerCompte('Cible');
  erreurFr(await postAdmin({ action: 'reinitialiser', pseudo: 'inconnu' }, { jeton: chef.jeton }), 404);
  const r = await postAdmin({ action: 'reinitialiser', pseudo: 'cible' }, { jeton: chef.jeton });
  assert.equal(r.statut, 200);
  assert.deepEqual(Object.keys(r.corps).sort(), ['code', 'expire', 'ok', 'pseudo']);
  assert.match(r.corps.code, /^[a-z0-9]{8}$/);
  const duree = Date.parse(r.corps.expire) - Date.now();
  assert.ok(duree > 23.9 * 3600000 && duree <= 24 * 3600000 + 1000, 'valable 24 h');
  assert.ok(!toutLeTexte().includes(r.corps.code), 'le code n’est pas gardé en clair');
  assert.match(ligneJoueur(cible.id).reinit_hash, /^pbkdf2\$/);
  // Mauvais code : refusé. Bon code (même en majuscules) : nouveau mot de passe, sessions effacées, code consommé.
  erreurFr(await postCompte({ action: 'secours', pseudo: 'cible', phrase: 'abcd1234', nouveauMdp: 'un mot de passe tout neuf' }), 401);
  const ok = await postCompte({ action: 'secours', pseudo: 'cible', phrase: r.corps.code.toUpperCase(), nouveauMdp: 'un mot de passe tout neuf' });
  assert.equal(ok.statut, 200, JSON.stringify(ok.corps));
  erreurFr(await appel(progressionGet, { jeton: cible.jeton }), 401);
  assert.equal((await connexion('cible', 'un mot de passe tout neuf')).statut, 200);
  assert.equal(ligneJoueur(cible.id).reinit_hash, null);
  erreurFr(await postCompte({ action: 'secours', pseudo: 'cible', phrase: r.corps.code, nouveauMdp: 'et encore un autre mot de passe' }), 401, 'usage unique');
  // Un code expiré ne vaut plus rien ; le code d'un compte ne marche pas pour un autre.
  const r2 = await postAdmin({ action: 'reinitialiser', pseudo: 'cible' }, { jeton: chef.jeton });
  db.base.prepare('UPDATE joueurs SET reinit_fin = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), cible.id);
  erreurFr(await postCompte({ action: 'secours', pseudo: 'cible', phrase: r2.corps.code, nouveauMdp: 'et encore un autre mot de passe' }), 401);
  const r3 = await postAdmin({ action: 'reinitialiser', pseudo: 'cible' }, { jeton: chef.jeton });
  erreurFr(await postCompte({ action: 'secours', pseudo: 'chef', phrase: r3.corps.code, nouveauMdp: 'et encore un autre mot de passe' }), 401);
  // La phrase de secours d'origine reste valable tant que le code n'est pas utilisé.
  assert.equal((await postCompte({ action: 'secours', pseudo: 'cible', phrase: cible.phrase, nouveauMdp: 'et encore un autre mot de passe' })).statut, 200);
});

// --- Codes d'amis et limites de création --------------------------------------------------------------------------

test('admin codes : création validée (bonus, jours, usages), liste, révocation ; 403 hors admin', async () => {
  toutVider();
  const chef = await creerCompte('Chef');
  faireAdmin(chef);
  for (const mauvais of [{ bonus: 0 }, { bonus: 501 }, { bonus: 1.5 }, { bonus: '5' }, { bonus: undefined }, { jours: 0 }, { jours: 366 }, { jours: undefined }, { usages: 0 }, { usages: 1001 }, { usages: null }]) {
    erreurFr(await postAdmin({ action: 'creer_code', bonus: 5, jours: 30, usages: 10, ...mauvais }, { jeton: chef.jeton }), 400);
  }
  assert.equal(lignes('SELECT * FROM codes').length, 0);
  const r = await postAdmin({ action: 'creer_code', bonus: 5, jours: 30, usages: 10 }, { jeton: chef.jeton });
  assert.equal(r.statut, 200);
  assert.match(r.corps.code, /^[a-z0-9]{8}$/);
  assert.deepEqual([r.corps.bonus, r.corps.jours, r.corps.usages], [5, 30, 10]);
  const liste = (await adminAvec(adminGet, { jeton: chef.jeton, requete: '?codes=1' })).corps.codes;
  assert.deepEqual(liste.map(({ cree, ...x }) => x), [{ code: r.corps.code, bonus: 5, jours: 30, usagesMax: 10, usages: 0, revoque: false }]);
  const rev = await postAdmin({ action: 'revoquer_code', code: r.corps.code.toUpperCase() }, { jeton: chef.jeton });
  assert.equal(rev.statut, 200);
  assert.equal(rev.corps.codes[0].revoque, true);
  erreurFr(await postAdmin({ action: 'revoquer_code', code: 'inconnu12' }, { jeton: chef.jeton }), 404);
  erreurFr(await postAdmin({ action: 'revoquer_code' }, { jeton: chef.jeton }), 404);
  const simple = await creerCompte('Simple');
  erreurFr(await postAdmin({ action: 'revoquer_code', code: r.corps.code }, { jeton: simple.jeton }), 403);
});

test('compte code : le joueur utilise un code (une fois), le plafond d’usages tient, un code faux ou révoqué reçoit 404 et 10 essais ratés bloquent', async () => {
  toutVider();
  const chef = await creerCompte('Chef');
  faireAdmin(chef);
  const a = await creerCompte('Greg');
  const b = await creerCompte('Bea');
  const c = await creerCompte('Cyril');
  const { corps: { code } } = await postAdmin({ action: 'creer_code', bonus: 4, jours: 10, usages: 2 }, { jeton: chef.jeton });
  erreurFr(await postCompte({ action: 'code', code }), 401);
  const r = await postCompte({ action: 'code', code: code.toUpperCase().replace(/^(.{4})/, '$1-') }, { jeton: a.jeton });
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.deepEqual([r.corps.ok, r.corps.bonus, r.corps.total], [true, 4, 4]);
  const duree = Date.parse(r.corps.expire) - Date.now();
  assert.ok(duree > 9.9 * unJourEnMs && duree <= 10 * unJourEnMs + 1000);
  erreurFr(await postCompte({ action: 'code', code }, { jeton: a.jeton }), 409, /déjà utilisé/);
  assert.deepEqual((await appel(compteGet, { jeton: a.jeton })).corps.codes.map((x) => x.bonus), [4]);
  assert.equal((await appel(compteGet, { jeton: a.jeton })).corps.bonus, 4);
  assert.equal((await postCompte({ action: 'code', code }, { jeton: b.jeton })).statut, 200);
  erreurFr(await postCompte({ action: 'code', code }, { jeton: c.jeton }), 404, /pas valable/);
  assert.equal(lignes('SELECT usages FROM codes')[0].usages, 2, 'le plafond tient');
  // Faux code, code vide, code d'un autre format : 404 sans indice ; 10 essais ratés par jour puis 429.
  const d = await creerCompte('Dora');
  for (const faux of ['abcd1234', '', undefined, 12, 'x'.repeat(100), '../../etc']) erreurFr(await postCompte({ action: 'code', code: faux }, { jeton: d.jeton }), 404);
  for (let i = 0; i < 4; i++) erreurFr(await postCompte({ action: 'code', code: 'faux' + i }, { jeton: d.jeton }), 404);
  const { corps: { code: bon } } = await postAdmin({ action: 'creer_code', bonus: 1, jours: 1, usages: 5 }, { jeton: chef.jeton });
  erreurFr(await postCompte({ action: 'code', code: bon }, { jeton: d.jeton }), 429);
  assert.equal(lignes('SELECT * FROM codes_utilises WHERE joueur_id = ?', d.id).length, 0);
  // Révoqué : plus utilisable, et son bonus disparaît chez ceux qui l'avaient.
  const e = await creerCompte('Eva');
  await postAdmin({ action: 'revoquer_code', code }, { jeton: chef.jeton });
  erreurFr(await postCompte({ action: 'code', code }, { jeton: e.jeton }), 404);
  assert.equal((await appel(compteGet, { jeton: a.jeton })).corps.bonus, 0);
  assert.equal(await bonusActif(env, a.id), 0);
});

test('limites de création : limite de base + bonus des codes actifs ; sans bonus après expiration ou révocation ; un admin n’a pas de limite', async () => {
  toutVider();
  const chef = await creerCompte('Chef');
  faireAdmin(chef);
  const a = await creerCompte('Greg');
  const ia = fauxAI([enReponse(valide())]);
  const e = { DB: db, AI: ia };
  const libre = (joueur, i) => appel(librePost, { env: e, methode: 'POST', jeton: joueur.jeton, corps: { sujet: 'Sujet ' + i } });
  for (let i = 0; i < 5; i++) assert.equal((await libre(a, i)).statut, 200);
  erreurFr(await libre(a, 6), 429);
  // Un code de +3 : la limite passe de 5 à 8 (le compteur du jour est conservé).
  const { corps: { code } } = await postAdmin({ action: 'creer_code', bonus: 3, jours: 5, usages: 5 }, { jeton: chef.jeton });
  assert.equal((await postCompte({ action: 'code', code }, { jeton: a.jeton })).statut, 200);
  db.base.prepare("UPDATE quotas SET n = 5 WHERE cle = ?").run('libre:joueur:' + a.id);
  for (let i = 0; i < 3; i++) assert.equal((await libre(a, 10 + i)).statut, 200, 'bonus ' + i);
  erreurFr(await libre(a, 20), 429);
  // Les bonus s'ajoutent entre eux.
  const { corps: { code: code2 } } = await postAdmin({ action: 'creer_code', bonus: 2, jours: 5, usages: 5 }, { jeton: chef.jeton });
  assert.equal((await postCompte({ action: 'code', code: code2 }, { jeton: a.jeton })).statut, 200);
  db.base.prepare("UPDATE quotas SET n = 8 WHERE cle = ?").run('libre:joueur:' + a.id);
  for (let i = 0; i < 2; i++) assert.equal((await libre(a, 30 + i)).statut, 200);
  erreurFr(await libre(a, 40), 429);
  // Expiré : retour à la limite de base.
  db.base.prepare('UPDATE codes_utilises SET expire = ?').run(new Date(Date.now() - 1000).toISOString());
  db.base.prepare("UPDATE quotas SET n = 5 WHERE cle = ?").run('libre:joueur:' + a.id);
  erreurFr(await libre(a, 50), 429);
  assert.equal(await bonusActif(env, a.id), 0);
  // Le bonus d'un joueur ne profite pas aux autres.
  const b = await creerCompte('Bea');
  for (let i = 0; i < 5; i++) assert.equal((await libre(b, 60 + i)).statut, 200);
  erreurFr(await libre(b, 70), 429);
  // Admin : pas de limite par joueur (au-delà de 5, aucune erreur) ; la limite globale reste.
  for (let i = 0; i < 12; i++) assert.equal((await libre(chef, 80 + i)).statut, 200, 'admin ' + i);
  assert.equal(lignes("SELECT * FROM quotas WHERE cle = ?", 'libre:joueur:' + chef.id).length, 0, 'pas de compteur pour un admin');
});

test('limites de création : toutes les routes qui créent avec l’IA passent par quotaJoueur (limite de base + bonus, admin sans limite)', async () => {
  toutVider();
  const source = (f) => readFileSync(new URL('../functions/api/' + f, import.meta.url), 'utf8');
  for (const f of ['libre.js', 'parcours.js', 'sujet.js', 'chapitre-ia.js', 'palier.js', 'quiz-direct.js', 'quiz-general.js', 'variante.js']) {
    const texte = source(f);
    assert.ok(/quotaJoueur\(env, joueur, '[a-z]+:joueur:'/.test(texte), f);
    assert.ok(!/await quota\(env, '[a-z]+:joueur:'/.test(texte), f + ' : un quota par joueur échappe aux codes');
  }
  const a = await creerCompte('Greg');
  const ligne = { id: a.id, role: 'joueur' };
  for (let i = 0; i < 3; i++) assert.equal(await quotaJoueur(env, ligne, 'essai:joueur:x', 3), true);
  assert.equal(await quotaJoueur(env, ligne, 'essai:joueur:x', 3), false);
  db.base.prepare("INSERT INTO codes (code, bonus, jours, usages_max, usages, cree, revoque) VALUES ('bonus001', 2, 1, 9, 1, '2026-10-20', 0)").run();
  db.base.prepare("INSERT INTO codes_utilises (code, joueur_id, expire) VALUES ('bonus001', ?, ?)").run(a.id, new Date(Date.now() + unJourEnMs).toISOString());
  assert.equal(await quotaJoueur(env, ligne, 'essai:joueur:x', 3), true); // 5e appel : 5 <= 3 + 2
  assert.equal(await quotaJoueur(env, ligne, 'essai:joueur:x', 3), false);
  for (let i = 0; i < 10; i++) assert.equal(await quotaJoueur(env, { id: a.id, role: 'admin' }, 'essai:joueur:y', 1), true);
});

// --- Amis : recherche du pseudo exact, demandes, invitations --------------------------------------------------------

const postAmis = (corps, jeton, options = {}) => appel(amisPost, { methode: 'POST', jeton, corps, ...options });
const amitie = (x, y) => lignes('SELECT a, b, etat FROM amities WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', x.id, y.id, y.id, x.id);

test('amis : réservé aux comptes (401 sans session, 403 pour un ancien profil), actions inconnues 400', async () => {
  toutVider();
  const vieux = await creerJoueur('Vieux');
  const a = await creerCompte('Greg');
  erreurFr(await appel(amisGet), 401);
  erreurFr(await postAmis({ action: 'inviter' }), 401);
  erreurFr(await appel(amisGet, { jeton: vieux.jeton }), 403, /compte/);
  erreurFr(await postAmis({ action: 'demander', pseudo: 'greg' }, vieux.jeton), 403);
  erreurFr(await postAmis({ action: 'inviter' }, vieux.jeton), 403);
  erreurFr(await postAmis({ action: 'inconnue' }, a.jeton), 400, /Action inconnue/);
  erreurFr(await postAmis({}, a.jeton), 400);
  erreurFr(await appel(amisPost, { methode: 'POST', jeton: a.jeton, brut: 'pas du json' }), 400);
  assert.deepEqual((await appel(amisGet, { jeton: a.jeton })).corps, { amis: [], recues: [], envoyees: [] });
});

test('amis demander : le pseudo EXACT (sans casse) envoie une demande ; un pseudo partiel, inconnu ou le sien est refusé ; rien ne révèle d’autre pseudo', async () => {
  toutVider();
  const a = await creerCompte('Greg_M');
  const b = await creerCompte('Beatrice');
  await creerCompte('Beatrix');
  // Pas de recherche partielle : « beat », « Beatri », « be%» ne trouvent rien.
  for (const partiel of ['beat', 'Beatri', 'be%', '%', '_', 'Bea*', '', '   ', undefined, 12, ['Beatrice'], { pseudo: 'Beatrice' }]) {
    erreurFr(await postAmis({ action: 'demander', pseudo: partiel }, a.jeton), 404, /Aucun joueur/);
  }
  erreurFr(await postAmis({ action: 'demander', pseudo: 'greg_m' }, a.jeton), 400, /propre pseudo/);
  assert.equal(lignes('SELECT * FROM amities').length, 0);
  const r = await postAmis({ action: 'demander', pseudo: 'bEATRICE' }, a.jeton);
  assert.deepEqual(r.corps, { ok: true, etat: 'demande', pseudo: 'Beatrice' });
  assert.deepEqual(amitie(a, b), [{ a: a.id, b: b.id, etat: 'demande' }]);
  // La même demande refaite ne change rien.
  assert.deepEqual((await postAmis({ action: 'demander', pseudo: 'beatrice' }, a.jeton)).corps, { ok: true, etat: 'demande', pseudo: 'Beatrice' });
  assert.equal(lignes('SELECT * FROM amities').length, 1);
  // L'un voit la demande envoyée, l'autre la demande reçue ; aucun n'est « ami » ; personne d'autre n'apparaît.
  assert.deepEqual((await appel(amisGet, { jeton: a.jeton })).corps, { amis: [], recues: [], envoyees: [{ pseudo: 'Beatrice' }] });
  assert.deepEqual((await appel(amisGet, { jeton: b.jeton })).corps, { amis: [], recues: [{ pseudo: 'Greg_M' }], envoyees: [] });
  const cercleB = (await appel(cercleGet, { jeton: b.jeton })).corps.joueurs;
  assert.deepEqual(cercleB.map((x) => x.pseudo), ['Beatrice'], 'une demande en attente ne donne pas accès au classement');
  // Compte bloqué : introuvable comme un pseudo inconnu.
  db.base.prepare("UPDATE joueurs SET bloque = 1 WHERE pseudo_cle = 'beatrix'").run();
  erreurFr(await postAmis({ action: 'demander', pseudo: 'beatrix' }, a.jeton), 404);
  // Un ancien profil (sans pseudo de compte) ne se trouve pas non plus par son nom.
  await creerJoueur('Vieux');
  erreurFr(await postAmis({ action: 'demander', pseudo: 'Vieux' }, a.jeton), 404);
});

test('amis demander : 30 recherches par jour, puis 429 ; 50 demandes en attente au plus', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  for (let i = 0; i < 30; i++) erreurFr(await postAmis({ action: 'demander', pseudo: 'inconnu' + i }, a.jeton), 404);
  erreurFr(await postAmis({ action: 'demander', pseudo: 'inconnu' }, a.jeton), 429);
  const b = await creerCompte('Bea');
  erreurFr(await postAmis({ action: 'demander', pseudo: 'bea' }, a.jeton), 429, 'la limite compte aussi les pseudos trouvés');
  assert.equal((await postAmis({ action: 'demander', pseudo: 'greg' }, b.jeton)).statut, 200, 'une autre personne a sa propre limite');
  // 50 demandes en attente.
  toutVider();
  const c = await creerCompte('Cyril');
  const ajout = db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'demande', '2026-10-20')");
  for (let i = 0; i < 50; i++) ajout.run(c.id, 'cible' + String(i).padStart(7, '0'));
  const e = await creerCompte('Eva');
  erreurFr(await postAmis({ action: 'demander', pseudo: 'eva' }, c.jeton), 409, /en attente/);
  assert.equal(amitie(c, e).length, 0);
});

test('amis accepter / refuser / retirer : seul le destinataire accepte ou refuse ; l’amitié est réciproque ; retirer supprime dans les deux sens', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Bea');
  const c = await creerCompte('Cyril');
  await postAmis({ action: 'demander', pseudo: 'bea' }, a.jeton);
  // L'auteur de la demande ne peut pas l'accepter lui-même, un tiers non plus.
  erreurFr(await postAmis({ action: 'accepter', pseudo: 'bea' }, a.jeton), 404);
  erreurFr(await postAmis({ action: 'accepter', pseudo: 'greg' }, c.jeton), 404);
  erreurFr(await postAmis({ action: 'refuser', pseudo: 'greg' }, c.jeton), 404);
  erreurFr(await postAmis({ action: 'accepter', pseudo: 'inconnu' }, b.jeton), 404);
  erreurFr(await postAmis({ action: 'accepter' }, b.jeton), 404);
  assert.equal(amitie(a, b)[0].etat, 'demande');
  assert.deepEqual((await postAmis({ action: 'accepter', pseudo: 'GREG' }, b.jeton)).corps, { ok: true });
  assert.equal(amitie(a, b)[0].etat, 'ami');
  assert.equal(amitie(a, b).length, 1);
  erreurFr(await postAmis({ action: 'accepter', pseudo: 'greg' }, b.jeton), 404, 'déjà acceptée');
  erreurFr(await postAmis({ action: 'demander', pseudo: 'bea' }, a.jeton), 409, /déjà amis/);
  erreurFr(await postAmis({ action: 'demander', pseudo: 'greg' }, b.jeton), 409, /déjà amis/);
  const amisA = (await appel(amisGet, { jeton: a.jeton })).corps;
  const amisB = (await appel(amisGet, { jeton: b.jeton })).corps;
  assert.deepEqual(amisA, { amis: [{ pseudo: 'Bea', points: 0, valides: 0 }], recues: [], envoyees: [] });
  assert.deepEqual(amisB.amis, [{ pseudo: 'Greg', points: 0, valides: 0 }]);
  assert.ok(!JSON.stringify([amisA, amisB]).includes(a.id), 'jamais d’identifiant');
  assert.deepEqual((await appel(amisGet, { jeton: c.jeton })).corps, { amis: [], recues: [], envoyees: [] });
  // Refuser : la demande disparaît (et peut être refaite).
  await postAmis({ action: 'demander', pseudo: 'cyril' }, b.jeton);
  assert.deepEqual((await postAmis({ action: 'refuser', pseudo: 'bea' }, c.jeton)).corps, { ok: true });
  assert.equal(amitie(b, c).length, 0);
  erreurFr(await postAmis({ action: 'refuser', pseudo: 'bea' }, c.jeton), 404);
  // Demandes croisées : la seconde accepte la première.
  await postAmis({ action: 'demander', pseudo: 'cyril' }, b.jeton);
  assert.deepEqual((await postAmis({ action: 'demander', pseudo: 'bea' }, c.jeton)).corps, { ok: true, etat: 'ami', pseudo: 'Bea' });
  assert.deepEqual(amitie(b, c).map((x) => x.etat), ['ami']);
  // Retirer : un ami disparaît des deux côtés ; annuler une demande envoyée aussi ; 404 sinon.
  assert.deepEqual((await postAmis({ action: 'retirer', pseudo: 'Greg' }, b.jeton)).corps, { ok: true });
  assert.equal(amitie(a, b).length, 0);
  assert.deepEqual((await appel(amisGet, { jeton: a.jeton })).corps.amis, []);
  erreurFr(await postAmis({ action: 'retirer', pseudo: 'greg' }, b.jeton), 404);
  erreurFr(await postAmis({ action: 'retirer', pseudo: 'inconnu' }, b.jeton), 404);
  await postAmis({ action: 'demander', pseudo: 'greg' }, b.jeton);
  assert.deepEqual((await postAmis({ action: 'retirer', pseudo: 'greg' }, b.jeton)).corps, { ok: true });
  assert.equal(amitie(a, b).length, 0);
});

test('amis invitation : lien aléatoire de 24 caractères (seule l’empreinte est gardée), 7 jours, 5 usages ; on devient ami de celui qui invite', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Bea');
  erreurFr(await postAmis({ action: 'rejoindre', jeton: 'a'.repeat(24) }, b.jeton), 404, /plus valable/);
  const r = await postAmis({ action: 'inviter' }, a.jeton);
  assert.equal(r.statut, 200);
  assert.deepEqual(Object.keys(r.corps).sort(), ['expire', 'jeton', 'usagesMax']);
  assert.match(r.corps.jeton, /^[a-z0-9]{24}$/);
  assert.equal(r.corps.usagesMax, 5);
  const duree = Date.parse(r.corps.expire) - Date.now();
  assert.ok(duree > 6.99 * unJourEnMs && duree <= 7 * unJourEnMs + 1000, '7 jours');
  const [ligne] = lignes('SELECT * FROM invitations');
  assert.equal(ligne.jeton_hash, await sha256Hex(r.corps.jeton));
  assert.equal(ligne.joueur_id, a.id);
  assert.ok(!toutLeTexte().includes(r.corps.jeton), 'le jeton n’est pas gardé en clair');
  // Deux liens différents.
  assert.notEqual((await postAmis({ action: 'inviter' }, a.jeton)).corps.jeton, r.corps.jeton);
  // Utilisation.
  erreurFr(await postAmis({ action: 'rejoindre', jeton: r.corps.jeton }, a.jeton), 400, /propre lien/);
  const ok = await postAmis({ action: 'rejoindre', jeton: r.corps.jeton }, b.jeton);
  assert.deepEqual(ok.corps, { ok: true, pseudo: 'Greg' });
  assert.deepEqual(amitie(a, b).map((x) => x.etat), ['ami']);
  assert.equal(lignes('SELECT usages FROM invitations WHERE jeton_hash = ?', ligne.jeton_hash)[0].usages, 1);
  assert.deepEqual((await appel(amisGet, { jeton: b.jeton })).corps.amis.map((x) => x.pseudo), ['Greg']);
  // Déjà amis : pas d'usage de plus.
  assert.deepEqual((await postAmis({ action: 'rejoindre', jeton: r.corps.jeton }, b.jeton)).corps, { ok: true, dejaAmis: true, pseudo: 'Greg' });
  assert.equal(lignes('SELECT usages FROM invitations WHERE jeton_hash = ?', ligne.jeton_hash)[0].usages, 1);
  // Une demande en attente entre eux devient une amitié sans doublon.
  const c = await creerCompte('Cyril');
  await postAmis({ action: 'demander', pseudo: 'greg' }, c.jeton);
  assert.equal((await postAmis({ action: 'rejoindre', jeton: r.corps.jeton }, c.jeton)).statut, 200);
  assert.deepEqual(amitie(a, c).map((x) => x.etat), ['ami']);
  // Un ancien profil ne peut pas rejoindre ; sans session non plus.
  const vieux = await creerJoueur('Vieux');
  erreurFr(await postAmis({ action: 'rejoindre', jeton: r.corps.jeton }, vieux.jeton), 403);
  erreurFr(await postAmis({ action: 'rejoindre', jeton: r.corps.jeton }), 401);
});

test('amis invitation : 5 usages au plus, expirée = refusée, format et jeton inconnu = 404, 20 refus par jour puis 429, 10 liens par jour', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const { corps: { jeton } } = await postAmis({ action: 'inviter' }, a.jeton);
  const invites = [];
  for (let i = 0; i < 6; i++) invites.push(await creerCompte('Invite' + i));
  for (let i = 0; i < 5; i++) assert.equal((await postAmis({ action: 'rejoindre', jeton }, invites[i].jeton)).statut, 200, 'invité ' + i);
  erreurFr(await postAmis({ action: 'rejoindre', jeton }, invites[5].jeton), 404, /plus valable/);
  assert.equal(amitie(a, invites[5]).length, 0);
  assert.equal((await appel(amisGet, { jeton: a.jeton })).corps.amis.length, 5);
  // Expirée.
  const { corps: { jeton: vieux } } = await postAmis({ action: 'inviter' }, a.jeton);
  db.base.prepare('UPDATE invitations SET expire = ? WHERE jeton_hash = ?').run(new Date(Date.now() - 1000).toISOString(), await sha256Hex(vieux));
  erreurFr(await postAmis({ action: 'rejoindre', jeton: vieux }, invites[5].jeton), 404);
  // Formats refusés sans toucher à la base ; refus comptés.
  const b = invites[5];
  for (const mauvais of [undefined, '', 'court', 'A'.repeat(24), 'a'.repeat(25), 12, ['x'], { a: 1 }, 'a'.repeat(23) + '-']) erreurFr(await postAmis({ action: 'rejoindre', jeton: mauvais }, b.jeton), 404);
  // 11 refus plus haut (usages épuisés, expirée, 9 formats) + 9 ici = 20 ; puis 429, même avec un lien valable.
  const { corps: { jeton: bon } } = await postAmis({ action: 'inviter' }, a.jeton);
  for (let i = 0; i < 9; i++) erreurFr(await postAmis({ action: 'rejoindre', jeton: 'z'.repeat(23) + String(i) }, b.jeton), 404);
  erreurFr(await postAmis({ action: 'rejoindre', jeton: bon }, b.jeton), 429);
  assert.equal(amitie(a, b).length, 0);
  // 10 liens par jour.
  toutVider();
  const c = await creerCompte('Cyril');
  for (let i = 0; i < 10; i++) assert.equal((await postAmis({ action: 'inviter' }, c.jeton)).statut, 200);
  erreurFr(await postAmis({ action: 'inviter' }, c.jeton), 429);
  // Le lien d'un compte bloqué ne marche plus.
  const d = await creerCompte('Dora');
  const e = await creerCompte('Eva');
  const lien = (await postAmis({ action: 'inviter' }, d.jeton)).corps.jeton;
  db.base.prepare('UPDATE joueurs SET bloque = 1 WHERE id = ?').run(d.id);
  erreurFr(await postAmis({ action: 'rejoindre', jeton: lien }, e.jeton), 404);
});

// --- Vie privée : rien n'est listé à un non-admin -------------------------------------------------------------------

test('cercle : toi et tes amis seulement, par XP ; 401 sans session ; jamais d’identifiant, de clé ni de joueur inconnu', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Bea');
  const c = await creerCompte('Cyril');
  const etranger = await creerCompte('Etranger');
  const vieux = await creerJoueur('Vieux');
  for (const [j, xp] of [[a, 100], [b, 300], [c, 50], [etranger, 9999], [vieux, 5000]]) {
    ok200(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: { xp, parcours: { p: { fait: [1, 2] } } } } }));
  }
  erreurFr(await appel(cercleGet), 401);
  erreurFr(await appel(cercleGet, { jeton: `${a.id}.${'z'.repeat(32)}` }), 401);
  // Seul : lui-même.
  assert.deepEqual((await appel(cercleGet, { jeton: a.jeton })).corps, { joueurs: [{ pseudo: 'Greg', points: 100, valides: 2, moi: true }] });
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', '2026-10-20')").run(a.id, b.id);
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', '2026-10-20')").run(c.id, a.id);
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'demande', '2026-10-20')").run(etranger.id, a.id);
  const r = await appel(cercleGet, { jeton: a.jeton });
  assert.deepEqual(r.corps.joueurs.map((x) => [x.pseudo, x.points, x.moi === true]), [['Bea', 300, false], ['Greg', 100, true], ['Cyril', 50, false]]);
  for (const j of r.corps.joueurs) assert.ok(Object.keys(j).every((k) => ['pseudo', 'points', 'valides', 'moi'].includes(k)));
  const texte = JSON.stringify(r.corps);
  for (const interdit of [a.id, b.id, a.cle, 'Etranger', 'Vieux', 'hash']) assert.ok(!texte.includes(interdit), interdit);
  // L'amitié est réciproque mais pas transitive : Bea voit Greg, pas Cyril.
  assert.deepEqual((await appel(cercleGet, { jeton: b.jeton })).corps.joueurs.map((x) => x.pseudo), ['Bea', 'Greg']);
  // Un ancien profil ne voit que lui.
  assert.deepEqual((await appel(cercleGet, { jeton: vieux.jeton })).corps.joueurs.map((x) => x.pseudo), ['Vieux']);
  // Plus d'amitié, plus de classement.
  await postAmis({ action: 'retirer', pseudo: 'bea' }, a.jeton);
  assert.deepEqual((await appel(cercleGet, { jeton: a.jeton })).corps.joueurs.map((x) => x.pseudo), ['Greg', 'Cyril']);
});

test('vie privée : aucune route publique ne liste les joueurs ni ne renvoie d’identifiant, de clé ou de hash à un non-admin', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Bea');
  db.base.prepare("INSERT INTO amities (a, b, etat, cree) VALUES (?, ?, 'ami', '2026-10-20')").run(a.id, b.id);
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: a.jeton, corps: { etat: { xp: 10 } } }));
  const hashes = lignes('SELECT mdp_hash, secours_hash FROM joueurs').flatMap((x) => [x.mdp_hash, x.secours_hash]);
  const lectures = [
    [cercleGet, { jeton: a.jeton }], [amisGet, { jeton: a.jeton }], [compteGet, { jeton: a.jeton }], [progressionGet, { jeton: a.jeton }],
    [duelsGet, { jeton: a.jeton }], [groupeGet, { jeton: a.jeton }], [tournoiGet, { jeton: a.jeton }], [sujetsGet, {}], [parcoursGet, {}], [melangeGet, {}],
    [adminGet, { jeton: a.jeton, requete: '?comptes=1' }], [adminGet, { jeton: a.jeton, requete: '?codes=1' }], [adminGet, { jeton: a.jeton }],
    [adminGet, { requete: '?comptes=1&q=greg' }],
  ];
  for (const [handler, options] of lectures) {
    const r = await appel(handler, { env: { DB: db, ADMIN_KEY: CLE_ADMIN }, ...options });
    const texte = JSON.stringify(r.corps);
    for (const secret of [a.id, b.id, a.cle, b.cle, ...hashes, 'pbkdf2']) assert.ok(!texte.includes(secret), `${handler.name || 'route'} : ${secret.slice(0, 12)}`);
    assert.ok(![200, 401, 403, 503].every((s) => s !== r.statut), 'statut attendu');
    if (options.requete && options.requete.includes('comptes')) erreurFr(r, 403);
  }
  // Seules routes qui listent des joueurs hors du cercle : l'admin (comptes) et les jeux par lien ou par code (salon, groupe, partie).
  const source = (f) => readFileSync(new URL('../functions/api/' + f, import.meta.url), 'utf8');
  assert.ok(!/FROM joueurs[^`']*ORDER BY[^`']*LIMIT 50/.test(source('cercle.js')), 'plus de liste globale');
  assert.ok(source('cercle.js').includes('amities'));
});

test('duel, salon, groupe et partie restent fonctionnels avec des comptes : le lien ou le code ouvre le jeu, sans être ami', async () => {
  toutVider();
  const a = await creerCompte('Greg');
  const b = await creerCompte('Bea'); // pas amie de Greg
  semerBlocP('sujet-test:1');
  // Salon (lien) : créé par Greg, joué par Bea, visible de tous ceux qui ont le lien.
  const cree = await appel(duelPost, { methode: 'POST', jeton: a.jeton, corps: { questions: refsP(5), type: 'salon', titre: 'Salon privé' } });
  ok200(cree);
  ok200(await appel(duelPut, { methode: 'PUT', jeton: a.jeton, corps: { id: cree.corps.id, score: { justes: 3, n: 5, points: 30 } } }));
  ok200(await appel(duelPut, { methode: 'PUT', jeton: b.jeton, corps: { id: cree.corps.id, score: { justes: 4, n: 5, points: 40 } } }));
  const vu = (await appel(duelGet, { requete: '?id=' + cree.corps.id, jeton: b.jeton })).corps.duel;
  assert.deepEqual(vu.classement.map((x) => [x.rang, x.pseudo]), [[1, 'Bea'], [2, 'Greg']]);
  assert.equal(vu.createur, 'Greg');
  assert.equal(vu.dejaJoue, true);
  assert.ok(!JSON.stringify(vu).includes(a.id));
  assert.deepEqual((await appel(duelsGet, { jeton: a.jeton })).corps.duels.map((x) => x.id), [cree.corps.id]);
  // Groupe (lien) : créé par Greg, rejoint par Bea.
  semerFormation();
  const g = await postGroupe(a, { nom: 'Les marins', parcours: 'les-phares' });
  ok200(g);
  ok200(await postGroupe(b, { id: g.corps.id, rejoindre: true }));
  const gg = (await getGroupe(g.corps.id, b)).corps.groupe;
  assert.deepEqual(gg.classement.map((x) => x.pseudo).sort(), ['Bea', 'Greg']);
  assert.deepEqual([gg.dejaMembre, gg.membres, gg.createur], [true, 2, 'Greg']);
  assert.deepEqual((await appel(groupeGet, { jeton: b.jeton })).corps.groupes.map((x) => x.id), [g.corps.id]);
  assert.ok(!JSON.stringify(gg).includes(b.id));
  // Partie (code) : Bea la rejoint avec le code, sans être amie.
  const code = await nouvellePartie(a);
  ok200(await postPartie(b, { action: 'rejoindre', id: code }));
  const pv = await getPartie(code, b);
  assert.deepEqual(pv.joueurs.map((x) => x.pseudo).sort(), ['Bea', 'Greg']);
  assert.deepEqual(pv.moi, { joueur: true, createur: false });
  assert.equal(pv.createur, 'Greg');
  assert.ok(!JSON.stringify(pv).includes(a.id));
  const anonyme = await getPartie(code);
  assert.deepEqual(anonyme.moi, { joueur: false, createur: false });
  assert.ok(!('question' in anonyme));
});

// --- Migration d'une base plus ancienne ----------------------------------------------------------------------------

test('migrerBase : une base d’avant les comptes reçoit les colonnes et les index sans perdre un joueur ; deuxième passage sans effet', async () => {
  const ancienne = fauxD1();
  ancienne.base.exec(`CREATE TABLE joueurs (id TEXT PRIMARY KEY, cle_hash TEXT, pseudo TEXT, ton TEXT DEFAULT 'taquin', etat TEXT DEFAULT '{}', points INTEGER DEFAULT 0, valides INTEGER DEFAULT 0, cree TEXT, maj TEXT)`);
  ancienne.base.prepare("INSERT INTO joueurs (id, cle_hash, pseudo, points, valides, cree) VALUES ('ancien000001', 'hash-ancien', 'Vieux', 42, 3, '2026-10-01')").run();
  const e = { DB: ancienne };
  await migrerBase(e);
  const colonnes = ancienne.base.prepare("SELECT name FROM pragma_table_info('joueurs')").all().map((c) => c.name);
  assert.deepEqual(colonnes, ['id', 'cle_hash', 'pseudo', 'ton', 'etat', 'points', 'valides', 'cree', 'maj', ...COLONNES_COMPTE.map((c) => c[0])]);
  const vieux = ancienne.base.prepare("SELECT * FROM joueurs WHERE id = 'ancien000001'").get();
  assert.deepEqual([vieux.cle_hash, vieux.pseudo, vieux.points, vieux.valides, vieux.role, vieux.bloque, vieux.pseudo_cle, vieux.mdp_hash], ['hash-ancien', 'Vieux', 42, 3, 'joueur', 0, null, null]);
  const index = ancienne.base.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'joueurs' AND name LIKE 'idx_%' ORDER BY name").all().map((i) => i.name);
  assert.deepEqual(index, ['idx_joueurs_google_sub', 'idx_joueurs_pseudo_cle']);
  await migrerBase(e);
  assert.equal(ancienne.base.prepare('SELECT COUNT(*) AS n FROM joueurs').get().n, 1);
  // L'index unique est actif : deux pseudo_cle identiques refusés, plusieurs nuls acceptés.
  ancienne.base.prepare("UPDATE joueurs SET pseudo_cle = 'vieux' WHERE id = 'ancien000001'").run();
  assert.throws(() => ancienne.base.prepare("INSERT INTO joueurs (id, pseudo_cle) VALUES ('autre0000001', 'vieux')").run(), /UNIQUE/);
  ancienne.base.prepare("INSERT INTO joueurs (id) VALUES ('nul000000001')").run();
  ancienne.base.prepare("INSERT INTO joueurs (id) VALUES ('nul000000002')").run();
  // Une colonne ajoutée entre-temps par un autre isolat ne fait pas échouer la migration.
  const concurrente = { DB: { prepare: (sql) => (/^ALTER/.test(sql) ? { run: async () => { throw new Error('duplicate column name: prenom'); } } : ancienne.prepare(sql)) } };
  ancienne.base.exec('DROP INDEX idx_joueurs_google_sub');
  await migrerBase(concurrente);
});

// --- Journaux ---------------------------------------------------------------------------------------------------

test('aucun mot de passe, phrase de secours, code ni jeton dans les journaux ou les messages d’erreur', async () => {
  toutVider();
  const journal = [];
  const gardes = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(gardes)) console[k] = (...args) => { journal.push(args.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
  const secrets = ['sécret-de-journal-123', 'phrase tres secrete', 'abcd1234secret'];
  try {
    const a = await creerCompte('Greg', { mdp: secrets[0] });
    await connexion('greg', secrets[1]);
    await postCompte({ action: 'secours', pseudo: 'greg', phrase: secrets[1], nouveauMdp: secrets[2] + 'xxxx' });
    await postCompte({ action: 'mdp', ancien: secrets[1], nouveau: secrets[2] + 'yyyy' }, { jeton: a.jeton });
    await postCompte({ action: 'code', code: secrets[2] }, { jeton: a.jeton });
    await postCompte({ action: 'supprimer', mdp: secrets[1] }, { jeton: a.jeton });
    await postAmis({ action: 'rejoindre', jeton: secrets[2] }, a.jeton);
    // Une panne de base pendant une connexion : message générique, rien du mot de passe.
    const cassee = { prepare() { throw new Error('D1 injoignable'); }, batch: async () => [] };
    const panne = await appel(comptePost, { env: { DB: cassee }, methode: 'POST', corps: { action: 'connecter', pseudo: 'greg', mdp: secrets[0] } });
    assert.equal(panne.statut, 503);
    assert.ok(!JSON.stringify(panne.corps).includes(secrets[0]));
    ext.google = reponseGoogle(infoGoogle());
    await postGoogle({});
    ext.google = null;
  } finally {
    Object.assign(console, gardes);
  }
  for (const ligne of journal) for (const s of secrets) assert.ok(!ligne.includes(s), 'secret dans le journal : ' + ligne.slice(0, 80));
  const sources = ['compte.js', 'amis.js', 'admin.js'].map((f) => readFileSync(new URL('../functions/api/' + f, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/console\.(log|warn|error|info)/.test(sources), 'les routes de comptes n’écrivent rien dans les journaux');
});

// --- Exécution -------------------------------------------------------------

let echecs = 0;
const muet = console.warn;
const muetErreur = console.error;
for (const [nom, fn] of tests) {
  console.warn = () => {};
  console.error = () => {};
  try {
    await fn();
    console.warn = muet;
    console.error = muetErreur;
    console.log('  ok   ' + nom);
  } catch (e) {
    console.warn = muet;
    console.error = muetErreur;
    echecs += 1;
    console.log('  ECHEC ' + nom + '\n        ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 6).join('\n        '));
  }
}
console.log(`\n${tests.length - echecs}/${tests.length} tests passent.`);
process.exit(echecs ? 1 : 0);
