// Documents de référence (lot 10A). Réservé à l'admin (session d'un compte admin, ou clé x-admin-cle). Le texte des PDF est extrait HORS Worker
// (pdf.js dans le navigateur de l'admin, ou scripts/importer_pdf.mjs) puis envoyé par paquets d'environ 50 ko ; le Worker découpe en morceaux.
//   GET    /api/documents                : liste {documents: [{id, titre, fichier, editeur, niveau, parcours, formation, pages, morceaux, octets, actif, cree}], octets, max}.
//   POST   /api/documents {titre, fichier?, editeur?, niveau?, parcours?, pagesTotal?, pages: [{page, texte}]} : crée le document avec ce premier paquet
//          (409 si un document de même `fichier` existe déjà ; 400 « pas de texte extractible » si le paquet n'a aucun mot).
//   POST   /api/documents {id, pages: [...]}   : ajoute un paquet à un document existant (les morceaux se continuent).
//   POST   /api/documents {action: 'modifier', id, actif?, parcours?, editeur?, niveau?} : active ou désactive, relie à une formation (null = tout sujet).
//   DELETE /api/documents?id=N            : supprime le document et ses morceaux.
// Plafonds : 2 Mo de texte par document, 20 Mo au total, 60 000 caractères par paquet. Aucun secret.
import {
  ErreurHttp, enveloppe, exigerBase, json, lireJSON, nettoyer,
} from '../../lib/api.js';
import {
  DOC_OCTETS_MAX, PAQUET_CARACTERES_MAX, TOTAL_OCTETS_MAX, decouper,
} from '../../lib/documents.js';
import { ID_PARCOURS } from '../../lib/paliers.js';
import { exigerAdmin } from './admin.js';

const PAQUET_OCTETS = 200000; // corps JSON d'un paquet (60 000 caractères, accents et échappements compris)
const OCTETS = 'COALESCE(SUM(LENGTH(CAST(texte AS BLOB))), 0)';

function lireParcours(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !ID_PARCOURS.test(v)) throw new ErreurHttp(400, 'Formation : identifiant de 1 à 40 caractères (a-z, 0-9, tiret) attendu.');
  return v;
}
function lireNiveau(v) {
  if (v === undefined || v === null || v === '') return null;
  if (!Number.isInteger(v) || v < 1 || v > 4) throw new ErreurHttp(400, 'Niveau : un entier de 1 à 4 attendu.');
  return v;
}
function lireTexteCourt(v, nom, max) {
  if (v === undefined || v === null || v === '') return null;
  const t = nettoyer(v);
  if (t === null || Array.from(t).length > max) throw new ErreurHttp(400, `${nom} : ${max} caractères au plus.`);
  return t || null;
}

function lirePages(corps) {
  if (!Array.isArray(corps.pages) || !corps.pages.length || corps.pages.length > 200) throw new ErreurHttp(400, 'Pages attendues : une liste de 1 à 200 pages {page, texte}.');
  let total = 0;
  const pages = [];
  for (const p of corps.pages) {
    if (!p || typeof p !== 'object' || !Number.isInteger(p.page) || p.page < 1 || p.page > 100000 || typeof p.texte !== 'string') {
      throw new ErreurHttp(400, 'Chaque page est {page: entier, texte: chaîne}.');
    }
    total += p.texte.length;
    if (total > PAQUET_CARACTERES_MAX) throw new ErreurHttp(413, `Paquet trop gros : ${PAQUET_CARACTERES_MAX} caractères au plus.`);
    pages.push({ page: p.page, texte: p.texte });
  }
  return pages;
}

async function lister(env) {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.titre, d.fichier, d.editeur, d.niveau, d.parcours, d.pages, d.cree, d.actif, p.titre AS formation,
       (SELECT COUNT(*) FROM doc_morceaux m WHERE m.doc_id = d.id) AS morceaux,
       (SELECT ${OCTETS} FROM doc_morceaux WHERE doc_id = d.id) AS octets
     FROM documents d LEFT JOIN parcours p ON p.id = d.parcours ORDER BY d.id`,
  ).all();
  const documents = (results || []).map((d) => ({
    id: d.id, titre: d.titre, fichier: d.fichier, editeur: d.editeur, niveau: d.niveau, parcours: d.parcours, formation: d.formation || null,
    pages: d.pages, morceaux: d.morceaux, octets: d.octets, actif: !!d.actif, cree: d.cree,
  }));
  return { documents, octets: documents.reduce((s, d) => s + d.octets, 0), max: TOTAL_OCTETS_MAX, maxDocument: DOC_OCTETS_MAX };
}

async function ajouter(env, corps) {
  const pages = lirePages(corps);
  let id = corps.id;
  let depart = 0;
  let pagesTotal = Number.isInteger(corps.pagesTotal) && corps.pagesTotal > 0 && corps.pagesTotal <= 100000 ? corps.pagesTotal : 0;
  const maxPage = Math.max(...pages.map((p) => p.page));
  let doc = null;
  if (id !== undefined) {
    if (!Number.isInteger(id)) throw new ErreurHttp(400, 'Identifiant de document : un entier attendu.');
    doc = await env.DB.prepare('SELECT id, pages FROM documents WHERE id = ?').bind(id).first();
    if (!doc) throw new ErreurHttp(404, 'Document introuvable.');
    const suite = await env.DB.prepare('SELECT COALESCE(MAX(n) + 1, 0) AS depart FROM doc_morceaux WHERE doc_id = ?').bind(id).first();
    depart = suite.depart;
  }
  const morceaux = decouper(pages, { depart });
  if (!morceaux.length) throw new ErreurHttp(400, 'Pas de texte extractible dans ces pages (un PDF fait d’images n’a pas de texte ; il faudrait une reconnaissance de caractères, que Koîos ne fait pas).');
  const octets = morceaux.reduce((s, m) => s + new TextEncoder().encode(m.texte).length, 0);
  const deja = id === undefined ? 0 : (await env.DB.prepare(`SELECT ${OCTETS} AS o FROM doc_morceaux WHERE doc_id = ?`).bind(id).first()).o;
  if (deja + octets > DOC_OCTETS_MAX) throw new ErreurHttp(413, 'Document trop gros : 2 Mo de texte au plus.');
  const tous = (await env.DB.prepare(`SELECT ${OCTETS} AS o FROM doc_morceaux`).first()).o;
  if (tous + octets > TOTAL_OCTETS_MAX) throw new ErreurHttp(413, 'Place épuisée : 20 Mo de texte au total.');

  if (id === undefined) {
    const titre = lireTexteCourt(corps.titre, 'Titre', 200);
    if (!titre) throw new ErreurHttp(400, 'Titre du document attendu.');
    const fichier = lireTexteCourt(corps.fichier, 'Fichier', 200);
    if (fichier) {
      const existe = await env.DB.prepare('SELECT id FROM documents WHERE fichier = ?').bind(fichier).first();
      if (existe) throw new ErreurHttp(409, `Ce fichier est déjà là (document ${existe.id}).`);
    }
    const r = await env.DB.prepare(
      'INSERT INTO documents (parcours, titre, fichier, pages, cree, actif, editeur, niveau) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
    ).bind(lireParcours(corps.parcours), titre, fichier, Math.max(pagesTotal, maxPage), new Date().toISOString(), lireTexteCourt(corps.editeur, 'Éditeur', 120), lireNiveau(corps.niveau)).run();
    id = r.meta && r.meta.last_row_id;
    if (!id) id = (await env.DB.prepare('SELECT MAX(id) AS id FROM documents').first()).id;
  } else {
    pagesTotal = Math.max(pagesTotal, maxPage, doc.pages || 0);
    await env.DB.prepare('UPDATE documents SET pages = ? WHERE id = ?').bind(pagesTotal, id).run();
  }
  await env.DB.batch(morceaux.map((m) => env.DB.prepare('INSERT INTO doc_morceaux (doc_id, n, page, texte, mots) VALUES (?, ?, ?, ?, ?)').bind(id, m.n, m.page, m.texte, m.mots)));
  return { ok: true, id, morceauxAjoutes: morceaux.length, octets };
}

async function modifier(env, corps) {
  if (!Number.isInteger(corps.id)) throw new ErreurHttp(400, 'Identifiant de document : un entier attendu.');
  const doc = await env.DB.prepare('SELECT id FROM documents WHERE id = ?').bind(corps.id).first();
  if (!doc) throw new ErreurHttp(404, 'Document introuvable.');
  const champs = [];
  const valeurs = [];
  if (corps.actif !== undefined) {
    if (typeof corps.actif !== 'boolean') throw new ErreurHttp(400, 'actif : true ou false attendu.');
    champs.push('actif = ?');
    valeurs.push(corps.actif ? 1 : 0);
  }
  if (corps.parcours !== undefined) { champs.push('parcours = ?'); valeurs.push(lireParcours(corps.parcours)); }
  if (corps.editeur !== undefined) { champs.push('editeur = ?'); valeurs.push(lireTexteCourt(corps.editeur, 'Éditeur', 120)); }
  if (corps.niveau !== undefined) { champs.push('niveau = ?'); valeurs.push(lireNiveau(corps.niveau)); }
  if (!champs.length) throw new ErreurHttp(400, 'Rien à modifier : actif, parcours, editeur ou niveau.');
  await env.DB.prepare(`UPDATE documents SET ${champs.join(', ')} WHERE id = ?`).bind(...valeurs, corps.id).run();
  return { ok: true, ...(await lister(env)) };
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  await exigerAdmin(request, env);
  return json(await lister(env));
});

export const onRequestPost = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  await exigerAdmin(request, env);
  const corps = await lireJSON(request, PAQUET_OCTETS);
  if (corps.action === 'modifier') return json(await modifier(env, corps));
  if (corps.action !== undefined) throw new ErreurHttp(400, 'Action inconnue : modifier (ou aucune action pour ajouter un paquet).');
  return json(await ajouter(env, corps));
});

export const onRequestDelete = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  await exigerAdmin(request, env);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) throw new ErreurHttp(400, 'Identifiant de document attendu.');
  const doc = await env.DB.prepare('SELECT id FROM documents WHERE id = ?').bind(id).first();
  if (!doc) throw new ErreurHttp(404, 'Document introuvable.');
  await env.DB.batch([env.DB.prepare('DELETE FROM doc_morceaux WHERE doc_id = ?').bind(id), env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id)]);
  return json({ ok: true, ...(await lister(env)) });
});
