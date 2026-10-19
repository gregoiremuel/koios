// Tests de l'API Koîos : appelle les handlers avec un faux env.
// Base simulée : SQLite en mémoire (node:sqlite, intégré à Node 22) derrière l'interface D1
// (prepare / bind / first / all / run / batch), donc le SQL des routes est vraiment exécuté (scripts/faux_d1.mjs).
// IA simulée : renvoie ce qu'on lui prépare. Wikipédia simulé : `fetch` global remplacé.
// Lancer : node scripts/test_api.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TABLES, initBase, quota, sha256Hex } from '../lib/api.js';
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
  GLM_URL, LLAMA, MISTRAL, REGLAGES, cleGLM, nomCourt, redacteurs, verificateurs,
} from '../lib/fournisseurs.js';
import {
  CREDIT_WIKIMEDIA, imageDeTete, imagePexels, imageUnsplash, requeteImage,
} from '../lib/images.js';
import {
  EXEMPLE_ETAPE, EXEMPLE_PALIER, MOTS_INTERDITS, PROMPT_ETAPE, PROMPT_PALIER, PROMPT_QUIZ, PROMPT_VERIFICATION,
  aplatir, contientInterdit, decouperPhrases, evaluer, lireIdPalier, lireIdQuiz, referenceDe, validerEtape,
  validerQuestion, validerQuiz, validerRedaction, validerVerification,
} from '../lib/paliers.js';
import worker from '../worker.js';
import { onRequestGet as etatGet } from '../functions/api/etat.js';
import { onRequestPost as joueurPost } from '../functions/api/joueur.js';
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
import { onRequestGet as palierGet } from '../functions/api/palier.js';
import { onRequestGet as quizGet } from '../functions/api/quiz.js';
import { onRequestPost as quizDirectPost } from '../functions/api/quiz-direct.js';
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
  for (const t of ['joueurs', 'brouillons', 'signalements', 'quotas', 'sujets', 'chapitres_ia', 'duels', 'parcours', 'paliers', 'quiz_direct']) {
    db.base.exec(`DELETE FROM ${t}`);
  }
}
const lignes = (sql, ...p) => db.base.prepare(sql).all(...p).map((r) => ({ ...r }));
const aujourdhui = () => new Date().toISOString().slice(0, 10);

const tests = [];
const test = (nom, fn) => tests.push([nom, fn]);

function erreurFr(r, statut, extrait) {
  assert.equal(r.statut, statut, JSON.stringify(r.corps));
  assert.match(r.type, /application\/json/);
  assert.equal(typeof r.corps.erreur, 'string');
  if (extrait) assert.match(r.corps.erreur, extrait);
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
  assert.deepEqual(noms, ['brouillons', 'chapitres_ia', 'duels', 'joueurs', 'paliers', 'parcours', 'quiz_direct', 'quotas', 'signalements', 'sujets']);
  const index = lignes("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  assert.deepEqual(index, [
    { name: 'idx_chapitres_ia_sujet', tbl_name: 'chapitres_ia' },
    { name: 'idx_paliers_parcours', tbl_name: 'paliers' },
    { name: 'idx_sujets_parent', tbl_name: 'sujets' },
  ]);
  const colonnes = (t) => lignes(`SELECT name FROM pragma_table_info('${t}')`).map((c) => c.name);
  assert.deepEqual(colonnes('sujets'), ['id', 'titre', 'parent', 'niveau', 'contenu', 'auteur', 'vues', 'cree']);
  assert.deepEqual(colonnes('chapitres_ia'), ['id', 'sujet', 'numero', 'contenu', 'vues', 'cree']);
  assert.deepEqual(colonnes('duels'), ['id', 'createur', 'questions', 'scores', 'cree']);
  assert.deepEqual(colonnes('parcours'), ['id', 'titre', 'contenu', 'auteur', 'vues', 'cree']);
  assert.deepEqual(colonnes('paliers'), ['id', 'parcours', 'numero', 'contenu', 'vues', 'cree']);
  assert.deepEqual(colonnes('quiz_direct'), ['parcours', 'contenu', 'cree']);
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
      'la-tour-eiffel': { fait: [1, 2, 3, 3, '4', 0, 501, 'x', 2.5, null] }, // 1, 2, 3 et 4
      'mont-blanc': { fait: { 1: true, 2: false, 3: 1, 600: true, abc: true } }, // 1 et 3
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
  // Paliers terminés : 500 par parcours au plus, 100 000 au total ; parcours en liste ignoré.
  const grand = { xp: 1, parcours: { a: { fait: Array.from({ length: 900 }, (_, i) => i + 1) }, b: { fait: 9999 } } };
  ok200(await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: grand } }));
  assert.equal(lignes('SELECT valides FROM joueurs')[0].valides, 1000);
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

test('cercle : 50 premiers par points décroissants, sans id ni clé', async () => {
  toutVider();
  const ajout = db.base.prepare('INSERT INTO joueurs (id, cle_hash, pseudo, points, valides, cree) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 55; i++) ajout.run(`id${String(i).padStart(10, '0')}`, 'hash-secret-' + i, 'J' + i, i * 3, i % 5, '2026-10-18T10:00:00Z');
  const r = await appel(cercleGet);
  assert.equal(r.statut, 200);
  assert.equal(r.corps.joueurs.length, 50);
  assert.deepEqual(r.corps.joueurs[0], { pseudo: 'J54', points: 162, valides: 4 });
  const pts = r.corps.joueurs.map((j) => j.points);
  assert.deepEqual(pts, [...pts].sort((a, b) => b - a));
  assert.equal(pts[49], 5 * 3);
  for (const j of r.corps.joueurs) assert.deepEqual(Object.keys(j).sort(), ['points', 'pseudo', 'valides']);
  assert.ok(!JSON.stringify(r.corps).includes('hash-secret'));
  assert.ok(!JSON.stringify(r.corps).includes('id0000'));
});

test('cercle : liste vide quand personne n’a joué', async () => {
  toutVider();
  assert.deepEqual((await appel(cercleGet)).corps, { joueurs: [] });
});

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
// Fournisseurs externes simulés (GLM, Pexels, Unsplash) : chacun est une fonction (url, init) -> Response, ou null (non prévu).
const ext = { appels: [], glm: null, pexels: null, unsplash: null };
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
  ext.pexels = null;
  ext.unsplash = null;
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
const FOURNISSEURS = { 'api.z.ai': 'glm', 'api.pexels.com': 'pexels', 'api.unsplash.com': 'unsplash' };
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
  for (const t of ['quotas', 'sujets', 'chapitres_ia', 'duels', 'parcours', 'paliers', 'quiz_direct']) db.base.exec(`DELETE FROM ${t}`);
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
  assert.deepEqual(Object.keys(d), ['id', 'createur', 'questions', 'scores', 'dejaJoue']);
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
  })[systeme] || 'inconnu';
  function repondre(via, modele, messages) {
    const etape = etapeDe(messages[0].content);
    const i = n[etape] = (n[etape] ?? -1) + 1;
    appels.push({ via, modele, etape, entree: { messages }, i });
    const v = parts[etape];
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
const partiesStandard = () => ({ etape: [etapeBrute()], palier: [palierBrut()], verif: [verifNumeros()], quiz: [quizBrut()] });
const TOTAL = 25; // affirmations de EXEMPLE_PALIER : 7 phrases, 2 définitions, 3 dates, 4 chiffres, 1 histoire, 4 × 2 questions

const envDe = (sc, extra = {}) => ({ DB: db, AI: sc.ai, ...extra });
function brancher(sc) {
  ext.glm = sc.glm;
}

async function creerParcoursTest(joueur, titre = 'La tour Eiffel', parts = {}) {
  const sc = scenario({ ...partiesStandard(), ...parts });
  const r = await appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: joueur.jeton, corps: { titre } });
  ok200(r);
  return r.corps.parcours;
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
const CLES_PARCOURS = ['id', 'titre', 'resume', 'image', 'etapes', 'sources'];
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

// --- Images ---

const photoPexels = (extra = {}) => ({
  id: 1,
  url: 'https://www.pexels.com/photo/tour-1/',
  photographer: 'Jeanne Dupont',
  photographer_url: 'https://www.pexels.com/@jeanne',
  src: {
    original: 'https://images.pexels.com/photos/1/original.jpeg',
    large: 'https://images.pexels.com/photos/1/large.jpeg',
    landscape: 'https://images.pexels.com/photos/1/landscape.jpeg',
  },
  ...extra,
});
const photoUnsplash = (extra = {}) => ({
  id: 'u1',
  alt_description: 'a tower',
  urls: { regular: 'https://images.unsplash.com/photo-1?w=1080', small: 'https://images.unsplash.com/photo-1?w=400' },
  links: { html: 'https://unsplash.com/photos/u1' },
  user: { name: 'Paul Martin', links: { html: 'https://unsplash.com/@paul' } },
  ...extra,
});

test('images : Pexels (adresse, clé, requête en anglais, crédit et lien)', async () => {
  reinitExt();
  ext.pexels = () => reponseWiki({ photos: [photoPexels()] });
  const image = await imagePexels({ PEXELS_KEY: 'cle-pexels' }, 'Eiffel Tower Paris', 'La tour Eiffel');
  assert.deepEqual(image, {
    src: 'https://images.pexels.com/photos/1/landscape.jpeg',
    alt: 'Photo illustrant « La tour Eiffel »',
    credit: 'Photo : Jeanne Dupont sur Pexels',
    lien: 'https://www.pexels.com/photo/tour-1/',
  });
  const a = ext.appels[0];
  assert.equal(a.url.origin + a.url.pathname, 'https://api.pexels.com/v1/search');
  assert.deepEqual(Object.fromEntries(a.url.searchParams), { query: 'Eiffel Tower Paris', per_page: '3', orientation: 'landscape' });
  assert.equal(new Headers(a.init.headers).get('authorization'), 'cle-pexels', 'la clé seule, sans « Bearer »');
  assert.ok(a.init.signal instanceof AbortSignal);
  // Sans clé : aucun appel. Photos inutilisables : la première valable est prise.
  ext.appels.length = 0;
  assert.equal(await imagePexels({}, 'Eiffel', 'T'), null);
  assert.equal(ext.appels.length, 0);
  ext.pexels = () => reponseWiki({ photos: [
    photoPexels({ src: { landscape: 'https://exemple.test/x.jpeg' } }),
    photoPexels({ url: 'javascript:alert(1)' }),
    photoPexels({ photographer: '' }),
    null,
    photoPexels({ photographer: 'Marie', src: { large: 'https://images.pexels.com/photos/2/large.jpeg' } }),
  ] });
  assert.equal((await imagePexels({ PEXELS_KEY: 'k' }, 'Eiffel', 'T')).credit, 'Photo : Marie sur Pexels');
  for (const rep of [() => new Response('non', { status: 403 }), () => reponseWiki({ photos: [] }), () => reponseWiki({}), () => new Response('<html>', { status: 200 })]) {
    ext.pexels = rep;
    assert.equal(await imagePexels({ PEXELS_KEY: 'k' }, 'Eiffel', 'T'), null);
  }
  reinitExt();
});

test('images : Unsplash (adresse, Client-ID, content_filter, crédit avec lien utm)', async () => {
  reinitExt();
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const image = await imageUnsplash({ UNSPLASH_KEY: 'cle-unsplash' }, 'Eiffel Tower Paris', 'La tour Eiffel');
  assert.deepEqual(image, {
    src: 'https://images.unsplash.com/photo-1?w=1080',
    alt: 'Photo illustrant « La tour Eiffel »',
    credit: 'Photo : Paul Martin sur Unsplash',
    lien: 'https://unsplash.com/photos/u1?utm_source=koios&utm_medium=referral',
  });
  const a = ext.appels[0];
  assert.equal(a.url.origin + a.url.pathname, 'https://api.unsplash.com/search/photos');
  assert.deepEqual(Object.fromEntries(a.url.searchParams), {
    query: 'Eiffel Tower Paris', per_page: '3', orientation: 'landscape', content_filter: 'high',
  });
  assert.equal(new Headers(a.init.headers).get('authorization'), 'Client-ID cle-unsplash');
  // Adresses hors Unsplash refusées ; lien déjà paramétré : « & ».
  ext.unsplash = () => reponseWiki({ results: [
    photoUnsplash({ urls: { regular: 'https://exemple.test/x.jpg' } }),
    photoUnsplash({ links: { html: 'http://unsplash.com/photos/u2' } }),
    photoUnsplash({ links: { html: 'https://unsplash.com/photos/u3?ixid=abc' } }),
  ] });
  assert.equal((await imageUnsplash({ UNSPLASH_KEY: 'k' }, 'Eiffel', 'T')).lien, 'https://unsplash.com/photos/u3?ixid=abc&utm_source=koios&utm_medium=referral');
  ext.appels.length = 0;
  assert.equal(await imageUnsplash({}, 'Eiffel', 'T'), null);
  assert.equal(ext.appels.length, 0);
  ext.unsplash = () => new Response('non', { status: 500 });
  assert.equal(await imageUnsplash({ UNSPLASH_KEY: 'k' }, 'Eiffel', 'T'), null);
  reinitExt();
});

test('images : photo de tête = Pexels, sinon Unsplash, sinon image de la page Wikipédia ; un fournisseur sans résultat passe la main', async () => {
  reinitExt();
  reinitWiki();
  const pages = [await lirePage('Tour Eiffel', OPTIONS_FR)];
  const pexelsOk = () => reponseWiki({ photos: [photoPexels()] });
  const unsplashOk = () => reponseWiki({ results: [photoUnsplash()] });
  const cles = { PEXELS_KEY: 'p', UNSPLASH_KEY: 'u' };
  const tete = (env) => imageDeTete(env, { motImage: 'Eiffel Tower Paris', titre: 'La tour Eiffel', pages });
  ext.pexels = pexelsOk;
  ext.unsplash = unsplashOk;
  assert.match((await tete(cles)).credit, /sur Pexels$/);
  assert.deepEqual(ext.appels.map((x) => x.fournisseur), ['pexels'], 'Pexels suffit : Unsplash n’est pas appelé');
  assert.match((await tete({ UNSPLASH_KEY: 'u' })).credit, /sur Unsplash$/);
  ext.pexels = () => reponseWiki({ photos: [] });
  assert.match((await tete(cles)).credit, /sur Unsplash$/, 'Pexels sans résultat : Unsplash');
  ext.unsplash = () => new Response('panne', { status: 500 });
  const wikimedia = await tete(cles);
  assert.deepEqual(wikimedia, {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg',
    alt: 'Illustration de « Tour Eiffel »',
    credit: 'Image : Wikimédia',
    lien: 'https://fr.wikipedia.org/wiki/Fichier:Tour_Eiffel_Wikimedia_Commons.jpg',
  });
  assert.equal(CREDIT_WIKIMEDIA, 'Image : Wikimédia');
  ext.appels.length = 0;
  assert.deepEqual(await tete({}), wikimedia, 'sans clé : image Wikipédia, aucun appel');
  assert.equal(ext.appels.length, 0);
  assert.equal(await imageDeTete({}, { motImage: 'x', titre: 'T', pages: [{ titre: 'Sans image', image: null }] }), null);
  assert.equal(await imageDeTete({}, { motImage: 'x', titre: 'T', pages: [] }), null);
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
  for (const mauvais of ['la-tour-eiffel:0', 'la-tour-eiffel:501', 'a:1000', ':3', 'La-Tour:3', 'ia:sujet:3', 'hg-01', 'x:quiz', 12, null, 'a'.repeat(41) + ':3']) {
    assert.equal(lireIdPalier(mauvais), null, String(mauvais));
  }
  assert.equal(lireIdPalier('x:500').numero, 500);
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
  assert.match(PROMPT_VERIFICATION, /nonConfirmees/);
  assert.match(PROMPT_VERIFICATION, /Ce que tu sais en dehors des extraits ne compte pas/);
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

test('parcours POST : création sans GLM (Llama écrit le plan, image de la page Wikipédia), forme, appels et quotas', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  const r = await appel(parcoursPost, { env: envDe(sc), methode: 'POST', jeton: j.jeton, corps: { titre: '  La tour   Eiffel ' } });
  ok200(r);
  assert.deepEqual(Object.keys(r.corps), ['parcours']);
  const p = r.corps.parcours;
  assert.deepEqual(Object.keys(p), CLES_PARCOURS);
  assert.equal(p.id, 'la-tour-eiffel');
  assert.equal(p.titre, 'La tour Eiffel');
  assert.equal(p.resume, EXEMPLE_ETAPE.resume);
  assert.equal(p.etapes.length, 1);
  assert.deepEqual(Object.keys(p.etapes[0]), ['numero', 'titre', 'paliers']);
  assert.equal(p.etapes[0].numero, 1);
  assert.equal(p.etapes[0].titre, 'Les bases de la tour');
  assert.deepEqual(p.etapes[0].paliers, EXEMPLE_ETAPE.paliers.map((titre, i) => ({ numero: i + 1, titre })));
  assert.deepEqual(p.image, {
    src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg',
    alt: 'Illustration de « Tour Eiffel »',
    credit: 'Image : Wikimédia',
    lien: 'https://fr.wikipedia.org/wiki/Fichier:Tour_Eiffel_Wikimedia_Commons.jpg',
  });
  assert.deepEqual(p.sources, [
    ['Wikipédia · Tour Eiffel', 'https://fr.wikipedia.org/wiki/Tour_Eiffel'],
    ['Wikipedia (en) · Eiffel Tower', 'https://en.wikipedia.org/wiki/Eiffel_Tower'],
  ]);
  assert.ok(!('motImage' in p) && !('auteur' in p));
  // Wikipédia FR et EN, avec le User-Agent 2.0 ; le texte anglais est coupé à 6 000 caractères.
  assert.deepEqual(hotes(wiki.appels), [...Array(WIKI_CREATION.en).fill('en.wikipedia.org'), ...Array(WIKI_CREATION.fr).fill('fr.wikipedia.org')]);
  for (const a of wiki.appels) assert.equal(new Headers(a.init.headers).get('user-agent'), USER_AGENT_V2);
  // Un appel d'IA : Llama, plan d'étape.
  assert.equal(sc.appels.length, 1);
  const [a] = sc.appels;
  assert.deepEqual([a.etape, a.via, a.modele], ['etape', 'ai', LLAMA]);
  assert.equal(a.entree.messages[0].content, PROMPT_ETAPE);
  const demande = a.entree.messages[1].content;
  assert.match(demande, /Parcours : « La tour Eiffel »/);
  assert.match(demande, /Étape à écrire : n° 1/);
  assert.match(demande, /=== Extrait 1 · Wikipédia \(fr\), page « Tour Eiffel » ===/);
  assert.match(demande, /=== Extrait 2 · Wikipedia \(en\), page « Eiffel Tower » ===/);
  assert.ok(demande.includes('La tour Eiffel est décrit ici pour les tests.'));
  assert.ok(!demande.includes('NE PAS LIRE') && !demande.includes('DO NOT READ'));
  assert.ok(demande.length < 6000 * 2 + 1200, 'au plus 6 000 caractères par langue');
  assert.deepEqual(ext.appels, [], 'ni GLM, ni Pexels, ni Unsplash sans clé');
  // Base et quotas.
  const [ligne] = lignes('SELECT id, titre, auteur, vues FROM parcours');
  assert.deepEqual(ligne, { id: 'la-tour-eiffel', titre: 'La tour Eiffel', auteur: j.id, vues: 0 });
  const stocke = JSON.parse(lignes('SELECT contenu FROM parcours')[0].contenu);
  assert.deepEqual(Object.keys(stocke), ['resume', 'image', 'motImage', 'etapes', 'sources']);
  assert.equal(stocke.motImage, 'Eiffel Tower Paris');
  assert.deepEqual(lignes("SELECT cle, n FROM quotas WHERE cle LIKE 'parcours%' ORDER BY cle"), [
    { cle: 'parcours:joueur:' + j.id, n: 1 },
    { cle: 'parcours:total', n: 1 },
  ]);
});

test('parcours POST : GLM écrit le plan (modèle choisi par GLM_MODELE), la photo de tête vient de Pexels', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario(partiesStandard());
  ext.glm = sc.glm;
  ext.pexels = () => reponseWiki({ photos: [photoPexels()] });
  const e = envDe(sc, { ...AVEC_GLM, GLM_MODELE: 'glm-4.5-air', PEXELS_KEY: 'cle-pexels', UNSPLASH_KEY: 'cle-unsplash' });
  const r = await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => [a.etape, a.via, a.modele]), [['etape', 'glm', 'glm-4.5-air']]);
  assert.deepEqual(ext.appels.map((a) => a.fournisseur), ['glm', 'pexels'], 'Unsplash n’est pas appelé quand Pexels répond');
  assert.equal(ext.appels[1].url.searchParams.get('query'), 'Eiffel Tower Paris', 'requête d’image en anglais (motImage)');
  assert.deepEqual(r.corps.parcours.image, {
    src: 'https://images.pexels.com/photos/1/landscape.jpeg',
    alt: 'Photo illustrant « La tour Eiffel »',
    credit: 'Photo : Jeanne Dupont sur Pexels',
    lien: 'https://www.pexels.com/photo/tour-1/',
  });
  assert.equal(r.corps.parcours.resume, EXEMPLE_ETAPE.resume);
});

test('parcours POST : GLM en panne (repli sur Llama) et Unsplash quand Pexels n’a rien', async () => {
  toutVoir();
  const j = await creerJoueur();
  const sc = scenario({ ...partiesStandard(), etape: [new Error('GLM saturé'), etapeBrute()] });
  ext.glm = sc.glm;
  ext.pexels = () => reponseWiki({ photos: [] });
  ext.unsplash = () => reponseWiki({ results: [photoUnsplash()] });
  const e = envDe(sc, { ...AVEC_GLM, PEXELS_KEY: 'p', UNSPLASH_KEY: 'u' });
  const r = await appel(parcoursPost, { env: e, methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.deepEqual(sc.appels.map((a) => [a.via, a.modele]), [['glm', 'glm-4.7-flash'], ['ai', LLAMA]]);
  assert.deepEqual(ext.appels.map((a) => a.fournisseur), ['glm', 'pexels', 'unsplash']);
  assert.equal(r.corps.parcours.image.credit, 'Photo : Paul Martin sur Unsplash');
  assert.equal(r.corps.parcours.image.lien, 'https://unsplash.com/photos/u1?utm_source=koios&utm_medium=referral');
  // Aucune photo en ligne ni image Wikipédia : image nulle, le parcours existe quand même.
  viderBibliotheque();
  wiki.pages['Tour Eiffel'].image = null;
  wiki.pagesEn['Eiffel Tower'].image = null;
  ext.pexels = () => new Response('panne', { status: 500 });
  ext.unsplash = () => new Response('panne', { status: 500 });
  const sans = await appel(parcoursPost, { env: envDe(scenario(partiesStandard()), { PEXELS_KEY: 'p', UNSPLASH_KEY: 'u' }), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
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

test('parcours POST : aucune source (422), plan invalide ou IA en panne (502) ; rien n’est enregistré', async () => {
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
  // Plan invalide deux fois (Llama puis Mistral), ou texte sans JSON, ou pannes.
  const neuf = etapeBrute();
  neuf.paliers.pop();
  const sc1 = scenario({ ...partiesStandard(), etape: [neuf] });
  erreurFr(await post(sc1), 502);
  assert.deepEqual(sc1.appels.map((a) => a.modele), [LLAMA, MISTRAL]);
  const sc2 = scenario({ ...partiesStandard(), etape: ['Désolé, je ne peux pas.', new Error('panne')] });
  erreurFr(await post(sc2), 502);
  assert.equal(sc2.appels.length, 2);
  const repli = scenario({ ...partiesStandard(), etape: [neuf, etapeBrute()] });
  ok200(await post(repli));
  assert.deepEqual(repli.appels.map((a) => a.modele), [LLAMA, MISTRAL]);
  assert.equal(lignes('SELECT * FROM parcours').length, 1);
  // Résumé à une phrase : plan refusé.
  viderBibliotheque();
  const court = etapeBrute();
  court.resume = 'Une seule phrase assez longue pour passer la longueur minimale demandée.';
  erreurFr(await post(scenario({ ...partiesStandard(), etape: [court] })), 502);
  assert.equal(lignes('SELECT * FROM parcours').length, 0);
});

test('parcours POST : un motImage invalide est retiré (la photo est cherchée avec le titre), le parcours est quand même créé', async () => {
  toutVoir();
  const j = await creerJoueur();
  const brut = etapeBrute();
  brut.motImage = 'Tour Eiffel à Paris, très belle !';
  brut.etape = 'x';
  ext.pexels = () => reponseWiki({ photos: [photoPexels()] });
  const sc = scenario({ ...partiesStandard(), etape: [brut] });
  const r = await appel(parcoursPost, { env: envDe(sc, { PEXELS_KEY: 'p' }), methode: 'POST', jeton: j.jeton, corps: { titre: 'La tour Eiffel' } });
  ok200(r);
  assert.equal(ext.appels[0].url.searchParams.get('query'), 'La tour Eiffel');
  assert.equal(r.corps.parcours.etapes[0].titre, 'Étape 1', 'titre d’étape invalide : « Étape 1 »');
  assert.equal(JSON.parse(lignes('SELECT contenu FROM parcours')[0].contenu).motImage, null);
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
  assert.equal(sc.par('etape').length, 10);
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
    etape: [() => {
      insererParcours('la-tour-eiffel', { titre: 'La tour Eiffel' });
      return etapeBrute();
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
  assert.deepEqual(Object.keys(liste.corps.parcours[0]), ['id', 'titre', 'image', 'vues', 'paliers']);
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

test('palier GET : paramètres invalides 400, parcours ou palier hors plan 404, 401 sans connexion, 503 sans IA ; rien consommé', async () => {
  const j = await prepare();
  const sc = scenario(partiesStandard());
  for (const requete of ['', '?parcours=la-tour-eiffel', '?n=1', '?parcours=la-tour-eiffel&n=abc', '?parcours=la-tour-eiffel&n=1.5',
    '?parcours=la-tour-eiffel&n=-1', '?parcours=la-tour-eiffel&n=', '?parcours=la-tour-eiffel&n=0', '?parcours=la-tour-eiffel&n=501',
    '?parcours=la-tour-eiffel&n=1000', '?parcours=la-tour-eiffel&n=0001']) {
    erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete }), 400);
  }
  erreurFr(await appel(palierGet, { env: envDe(sc), requete: '?parcours=inconnu&n=1' }), 404, /Parcours/);
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=Pas%20Valide&n=1' }), 404, /Parcours/);
  // Une seule étape à la fois : 20 est la dernière ouverte (étape 2), 21 est trop loin.
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=21' }), 404, /Palier introuvable/);
  erreurFr(await appel(palierGet, { env: envDe(sc), jeton: j.jeton, requete: '?parcours=la-tour-eiffel&n=500' }), 404, /Palier introuvable/);
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
  assert.deepEqual(Object.keys(p.image), ['src', 'alt', 'credit', 'lien']);
  assert.equal(p.image.credit, 'Image : Wikimédia');
  assert.equal(p.image.lien, 'https://fr.wikipedia.org/wiki/Fichier:Tour_Eiffel_Wikimedia_Commons.jpg');
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
  assert.deepEqual(ext.appels, []);
  // Base et quotas.
  const [ligne] = lignes('SELECT id, parcours, numero, vues FROM paliers');
  assert.deepEqual(ligne, { id: 'la-tour-eiffel:1', parcours: 'la-tour-eiffel', numero: 1, vues: 0 });
  assert.deepEqual(JSON.parse(lignes('SELECT contenu FROM paliers')[0].contenu), p);
  assert.deepEqual(quotasPalier(), [{ cle: 'palier:joueur:' + j.id, n: 1 }, { cle: 'palier:total', n: 1 }]);
});

test('palier GET : un palier plus précis lit sa page (FR, EN) puis celles du parcours, 4 extraits au plus', async () => {
  const j = await prepare();
  const sc = scenario(partiesStandard());
  const r = await lirePalier(j, 'la-tour-eiffel', 2, sc);
  ok200(r);
  const demande = sc.appels[0].entree.messages[1].content;
  assert.match(demande, /Extrait 1 · Wikipédia \(fr\), page « Gustave Eiffel »/);
  assert.match(demande, /Extrait 2 · Wikipedia \(en\), page « Gustave Eiffel »/);
  assert.match(demande, /Extrait 3 · Wikipédia \(fr\), page « Tour Eiffel »/);
  assert.match(demande, /Extrait 4 · Wikipedia \(en\), page « Eiffel Tower »/);
  assert.ok(!/Extrait 5/.test(demande));
  assert.deepEqual(r.corps.palier.sources.map((s) => s[0]), ['Wikipédia · Gustave Eiffel', 'Wikipedia (en) · Gustave Eiffel', 'Wikipédia · Tour Eiffel', 'Wikipedia (en) · Eiffel Tower']);
  assert.equal(r.corps.palier.image.lien, 'https://fr.wikipedia.org/wiki/Fichier:Gustave_Eiffel.jpg', 'image de la page la plus précise');
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
  // Wikipédia injoignable : aucune source, l’IA n’écrit pas.
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
    assert.ok(apres[1] <= 35000 && apres[1] > 30000, 'vérification : ' + apres[1]);
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
    const lente = scenario({ ...partiesStandard(), palier: [() => { horloge.t += 50000; return palierBrut(); }], verif: [verifNumeros(...nombres(4, 14))] });
    const r = await lirePalier(j, 'la-tour-eiffel', 1, lente);
    ok200(r);
    assert.equal(lente.appels.length, 2);
    assert.equal(r.corps.palier.verification.statut, 'partiel');
    assert.equal(r.corps.palier.verification.retirees, 13);
    // 10 s + 10 s : il reste 65 s, on réécrit.
    horloge.t = 0;
    const vive = scenario({
      ...partiesStandard(),
      palier: [() => { horloge.t += 10000; return palierBrut(); }],
      verif: [() => { horloge.t += 10000; return verifNumeros(...nombres(4, 14)); }, verifNumeros()],
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

// --- Worker : routes v2 ---

test('worker v2 : /api/parcours, palier, quiz et quiz-direct sont routés (tiret accepté) ; méthodes absentes 405', async () => {
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

// --- Robustesse ------------------------------------------------------------

test('une panne de la base donne un JSON français 503, pas une page d’erreur', async () => {
  const cassee = { prepare() { throw new Error('D1 injoignable'); }, batch: async () => [] };
  const r = await appel(cercleGet, { env: { DB: cassee } });
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
    '../functions/api/palier.js', '../functions/api/quiz.js', '../functions/api/quiz-direct.js',
    '../scripts/serveur_local.mjs', '../wrangler.toml'];
  for (const f of fichiers) {
    const texte = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!/(api[_-]?key|secret|token|password|mot de passe)\s*[:=]\s*['"][^'"]{8,}/i.test(texte), f);
  }
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
