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
  CREDIT_IMAGE, MAX_TEXTE, USER_AGENT, ancrer, chercher, choisirTitre, lirePage, nettoyerRequete, tronquer,
} from '../lib/wiki.js';
import { generateur, tirer } from '../lib/questions.js';
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
  for (const t of ['joueurs', 'brouillons', 'signalements', 'quotas', 'sujets', 'chapitres_ia', 'duels']) db.base.exec(`DELETE FROM ${t}`);
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
  assert.deepEqual(noms, ['brouillons', 'chapitres_ia', 'duels', 'joueurs', 'quotas', 'signalements', 'sujets']);
  const index = lignes("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  assert.deepEqual(index, [
    { name: 'idx_chapitres_ia_sujet', tbl_name: 'chapitres_ia' },
    { name: 'idx_sujets_parent', tbl_name: 'sujets' },
  ]);
  const colonnes = (t) => lignes(`SELECT name FROM pragma_table_info('${t}')`).map((c) => c.name);
  assert.deepEqual(colonnes('sujets'), ['id', 'titre', 'parent', 'niveau', 'contenu', 'auteur', 'vues', 'cree']);
  assert.deepEqual(colonnes('chapitres_ia'), ['id', 'sujet', 'numero', 'contenu', 'vues', 'cree']);
  assert.deepEqual(colonnes('duels'), ['id', 'createur', 'questions', 'scores', 'cree']);
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

test('progression : PUT calcule points (0-40 par chapitre) et valides, puis GET relit l’état', async () => {
  toutVider();
  const j = await creerJoueur('Greg');
  const etat = {
    version: 1,
    chapitres: {
      'hg-01': { points: 30, valide: true },
      'hg-02': { points: 99, valide: true },
      'hg-03': { points: -7, valide: false },
      'gj-01': { points: '25', valide: 'true' },
      'gj-02': { points: 12.9, valide: true },
      'gj-03': null,
      'gj-04': { valide: true },
    },
    reglages: { son: true },
  };
  const r = await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat } });
  assert.deepEqual(r.corps, { ok: true });
  const [ligne] = lignes('SELECT points, valides, pseudo, ton FROM joueurs');
  assert.deepEqual(ligne, { points: 30 + 40 + 0 + 0 + 12, valides: 4, pseudo: 'Greg', ton: 'taquin' });
  assert.deepEqual((await appel(progressionGet, { jeton: j.jeton })).corps.etat, etat);
  const vide = await appel(progressionPut, { methode: 'PUT', jeton: j.jeton, corps: { etat: { autre: 1 } } });
  assert.equal(vide.statut, 200);
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
