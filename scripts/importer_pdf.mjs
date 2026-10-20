#!/usr/bin/env node
// Import de PDF comme documents de référence (lot 10A). Le texte est extrait ICI avec `pdftotext -layout` (poppler), jamais par le Worker.
//
//   node scripts/importer_pdf.mjs <dossier>... [--sortie fichier.json] [--parcours id] [--editeur "Nom"] [--niveau N]
//                                 [--url https://…] [--cle CLE_ADMIN]
//
// - Sans --url : rien n'est envoyé en ligne. Avec --sortie, le JSON des documents est écrit ; le compte rendu dit le nombre de morceaux par PDF.
// - Avec --url (et --cle) : chaque document est envoyé à POST /api/documents par paquets d'environ 50 ko. La clé admin se passe en argument
//   (ou dans la variable d'environnement ADMIN_KEY) : elle n'est jamais écrite sur le disque ni affichée.
// - --niveau N : niveau (1 à 4) de tous les PDF. Sans lui, le niveau se déduit du nom (Module / Tableau Niv 1 = 1 ; Livret Niveau I = 2 ; Niveau II = 3).
// - Un PDF sans texte (pages-images) est signalé « pas de texte extractible » : pas d'OCR.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decouper } from '../lib/documents.js';

const args = process.argv.slice(2);
const options = {};
const dossiers = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) options[args[i].slice(2)] = args[++i];
  else dossiers.push(args[i]);
}
if (!dossiers.length) {
  console.error('Usage : node scripts/importer_pdf.mjs <dossier>... [--sortie f.json] [--parcours id] [--editeur "Nom"] [--niveau N] [--url https://… --cle CLE]');
  process.exit(2);
}
const niveauForce = options.niveau === undefined ? null : Number(options.niveau);
if (niveauForce !== null && !(Number.isInteger(niveauForce) && niveauForce >= 1 && niveauForce <= 4)) {
  console.error('--niveau : un entier de 1 à 4.');
  process.exit(2);
}
const cle = options.cle || process.env.ADMIN_KEY || '';
const PAQUET = 50000;

// Niveau déduit du nom du fichier (le plus précis d'abord).
export function niveauDuNom(nom) {
  if (/Niveau[_ -]?II\b/i.test(nom)) return 3;
  if (/Niveau[_ -]?I\b/i.test(nom)) return 2;
  if (/Module|Tableau|Niv[_ -]?1/i.test(nom)) return 1;
  return null;
}
const nettoyerNom = (f) => f.replace(/^[0-9a-f]{8}-/, '');
const titreDe = (f) => nettoyerNom(f).replace(/\.pdf$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

function pdfsDe(dossier) {
  const sortie = [];
  for (const nom of readdirSync(dossier).sort()) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isFile() && /\.pdf$/i.test(nom)) sortie.push(chemin);
  }
  return sortie;
}

function lire(chemin) {
  const brut = execFileSync('pdftotext', ['-layout', chemin, '-'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const pages = brut.split('\f');
  if (pages.length && !pages[pages.length - 1].trim()) pages.pop();
  const nom = basename(chemin);
  const garde = pages.map((texte, i) => ({ page: i + 1, texte: texte.replace(/[ \t]+$/gm, '').trim() })).filter((p) => p.texte);
  return {
    titre: titreDe(nom),
    fichier: nettoyerNom(nom),
    parcours: options.parcours || null,
    editeur: options.editeur || null,
    niveau: niveauForce !== null ? niveauForce : niveauDuNom(nom),
    pagesTotal: pages.length,
    pages: garde,
  };
}

function paquets(pages) {
  const sortie = [];
  let cur = [];
  let n = 0;
  for (const p of pages) {
    let t = p.texte;
    while (t.length) {
      const part = t.slice(0, PAQUET);
      t = t.slice(PAQUET);
      if (n + part.length > PAQUET && cur.length) { sortie.push(cur); cur = []; n = 0; }
      cur.push({ page: p.page, texte: part });
      n += part.length;
    }
  }
  if (cur.length) sortie.push(cur);
  return sortie;
}

async function envoyer(base, doc) {
  let id = null;
  for (const lot of paquets(doc.pages)) {
    const corps = id ? { id, pages: lot } : {
      titre: doc.titre, fichier: doc.fichier, parcours: doc.parcours, editeur: doc.editeur, niveau: doc.niveau, pagesTotal: doc.pagesTotal, pages: lot,
    };
    const r = await fetch(`${base.replace(/\/$/, '')}/api/documents`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-cle': cle }, body: JSON.stringify(corps),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409) return 'déjà présent';
    if (!r.ok) throw new Error(`${r.status} ${j.erreur || ''}`.trim());
    id = j.id;
  }
  return `envoyé (document ${id})`;
}

const documents = [];
let total = 0;
for (const dossier of dossiers) {
  for (const chemin of pdfsDe(dossier)) {
    const doc = lire(chemin);
    if (!doc.pages.length) {
      console.log(`${doc.fichier} : pas de texte extractible (PDF fait d'images), ignoré`);
      continue;
    }
    doc.morceaux = decouper(doc.pages).length;
    total += doc.morceaux;
    documents.push(doc);
    console.log(`${doc.fichier} : ${doc.pagesTotal} pages, ${doc.morceaux} morceaux, niveau ${doc.niveau === null ? 'tous' : doc.niveau}`);
  }
}
console.log(`${documents.length} documents, ${total} morceaux.`);
if (options.sortie) {
  writeFileSync(options.sortie, JSON.stringify({ documents }, null, 1));
  console.log(`JSON écrit : ${options.sortie} (rien n'a été envoyé en ligne).`);
}
if (options.url) {
  if (!cle) { console.error('Clé admin manquante : --cle ou ADMIN_KEY.'); process.exit(2); }
  for (const doc of documents) console.log(`${doc.fichier} : ${await envoyer(options.url, doc).catch((e) => `échec (${e.message})`)}`);
}
