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

// =============================================================================
// V1.1 : sujets, chapitres IA ancrés, mélange, duels
// =============================================================================

// --- Wikipédia simulé : `fetch` global remplacé (tout autre hôte est refusé) ---

const texteWiki = (sujet, n = 600) => `${sujet} est décrit ici pour les tests. `.repeat(Math.ceil(n / 30)).slice(0, n);
const wiki = { appels: [], pages: {}, recherche: null, panne: null };

function reinitWiki() {
  wiki.appels = [];
  wiki.panne = null;
  wiki.recherche = null;
  wiki.pages = {
    'Tour Eiffel': { extract: texteWiki('La tour Eiffel', 800) + '\n\n\n== Notes et références ==\nNE PAS LIRE', image: 'Tour_Eiffel_Wikimedia_Commons.jpg' },
    'Gustave Eiffel': { extract: texteWiki('Gustave Eiffel', 500), image: 'Gustave_Eiffel.jpg' },
    'Maurice Koechlin': { extract: texteWiki('Maurice Koechlin', 500), image: null },
  };
}
reinitWiki();

const reponseWiki = (objet) => new Response(JSON.stringify(objet), { status: 200, headers: { 'content-type': 'application/json' } });
function pageWikiJson(titre, p) {
  const sortie = { pageid: 1000, ns: 0, title: titre, extract: p.extract };
  if (!p.sansUrl) sortie.fullurl = 'https://fr.wikipedia.org/wiki/' + titre.replace(/ /g, '_');
  if (p.image) {
    sortie.pageimage = p.image;
    sortie.thumbnail = { source: p.vignette || `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${p.image}/800px-${p.image}`, width: 800, height: 600 };
  }
  return sortie;
}
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  wiki.appels.push({ url: u, init });
  if (u.hostname !== 'fr.wikipedia.org') throw new Error('hôte inattendu : ' + u.hostname);
  if (wiki.panne === 'reseau') throw new Error('réseau coupé');
  if (wiki.panne === 'delai') throw new DOMException('délai dépassé', 'TimeoutError');
  if (typeof wiki.panne === 'number') return new Response('panne', { status: wiki.panne });
  if (wiki.panne === 'json') return new Response('<html>pas du json</html>', { status: 200 });
  const p = u.searchParams;
  if (p.get('list') === 'search') {
    const q = p.get('srsearch');
    const titres = wiki.recherche ? wiki.recherche(q) : Object.keys(wiki.pages).filter((t) => q.toLowerCase().includes(t.toLowerCase()));
    return reponseWiki({ query: { search: titres.slice(0, 3).map((title) => ({ ns: 0, title })) } });
  }
  const titre = p.get('titles');
  const page = wiki.pages[titre];
  if (!page) return reponseWiki({ query: { pages: { '-1': { ns: 0, title: titre, missing: '' } } } });
  return reponseWiki({ query: { pages: { 1000: pageWikiJson(titre, page) } } });
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
const toutVoir = () => { toutVider(); reinitWiki(); };
// Repart d'une bibliothèque vide en gardant les joueurs.
const viderBibliotheque = () => {
  for (const t of ['quotas', 'sujets', 'chapitres_ia', 'duels']) db.base.exec(`DELETE FROM ${t}`);
  reinitWiki();
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
    [{ questions: q().map((x, i) => (i === 0 ? { ...x, chapitre: 'hg-01' } : x)), score }, 'chapitre statique'],
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
    [{ questions: q(), score: { ...score, points: -1 } }, 'points négatifs'],
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
  assert.deepEqual(Object.keys(d), ['id', 'createur', 'questions', 'scores']);
  assert.equal(d.id, r.corps.id);
  assert.equal(d.createur, 'Alice');
  assert.equal(d.questions.length, 5);
  assert.deepEqual(d.questions.map((x) => [x.chapitre, x.index]), questionsDuel().map((x) => [x.chapitre, x.index]));
  assert.deepEqual(Object.keys(d.questions[0]), ['chapitre', 'titre', 'sujetTitre', 'index', 'exercice']);
  assert.deepEqual(d.questions.map((x) => x.exercice.type), ['qcm', 'bluff', 'qcm', 'frise', 'bluff']);
  assert.equal(d.questions[0].titre, 'Titre 1');
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
    { id, score: { justes: 1, n: 5, points: -1 } },
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
