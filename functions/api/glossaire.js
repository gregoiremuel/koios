// GET /api/glossaire?parcours=<id>&jusqua=<k> : les mots définis dans les leçons 1 à k d'un parcours (k de 1 à 500).
// Public, sans connexion ni quota. Lit seulement le cache (table paliers) : ne génère rien et ne compte pas de vue.
// Reprend `definitions` et `reperes` de chaque leçon. Un terme qui revient (sans accents ni casse) garde la première
// leçon où il apparaît. Tri alphabétique français. Parcours inconnu : liste vide.
import { ErreurHttp, enveloppe, exigerBase, json } from '../../lib/api.js';
import { ID_PARCOURS, PALIER_MAX } from '../../lib/paliers.js';

// Clé de comparaison d'un terme : sans accents, sans casse, espaces (même insécables) et apostrophes unifiés.
function cle(terme) {
  return terme
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Tableau de { terme, definition } lu dans un extrait JSON (texte renvoyé par json_extract) ; le reste est ignoré.
function lireListe(texte) {
  if (typeof texte !== 'string') return [];
  let liste;
  try {
    liste = JSON.parse(texte);
  } catch {
    return [];
  }
  return Array.isArray(liste) ? liste : [];
}

// Une date n'est pas un mot à définir : « 1889 », « vers 800 », « mars 1889 ». Un nom de mois seul reste un mot (« Mars », la planète).
const DATE_TERME = /^\s*(\d|vers\s+\d|(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)\s+\d)/iu;

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const p = new URL(request.url).searchParams;
  const parcours = p.get('parcours');
  const brutK = p.get('jusqua');
  if (!parcours || brutK === null) throw new ErreurHttp(400, 'Indique le parcours et la leçon jusqu’où lire (jusqua).');
  if (!ID_PARCOURS.test(parcours)) throw new ErreurHttp(400, 'Identifiant de parcours invalide.');
  if (!/^\d{1,3}$/.test(brutK) || Number(brutK) < 1 || Number(brutK) > PALIER_MAX) {
    throw new ErreurHttp(400, `jusqua invalide : un entier de 1 à ${PALIER_MAX}.`);
  }

  // json_valid écarte une ligne illisible au lieu de faire échouer toute la requête.
  const { results } = await env.DB.prepare(
    `SELECT numero,
            json_extract(contenu, '$.titre') AS titre,
            json_extract(contenu, '$.definitions') AS definitions,
            json_extract(contenu, '$.reperes') AS reperes
       FROM paliers
      WHERE parcours = ? AND numero <= ? AND json_valid(contenu)
      ORDER BY numero`,
  )
    .bind(parcours, Number(brutK))
    .all();

  const vus = new Set();
  const termes = [];
  for (const r of results || []) {
    const titre = typeof r.titre === 'string' ? r.titre : '';
    for (const d of [...lireListe(r.definitions), ...lireListe(r.reperes)]) {
      if (!d || typeof d.terme !== 'string' || typeof d.definition !== 'string') continue;
      const terme = d.terme.trim();
      if (DATE_TERME.test(terme)) continue; // les dates des repères ne sont pas des mots à définir
      const definition = d.definition.trim();
      const k = cle(terme);
      if (!k || !definition || vus.has(k)) continue;
      vus.add(k);
      termes.push({ terme, definition, numero: r.numero, titre });
    }
  }
  termes.sort((a, b) => a.terme.localeCompare(b.terme, 'fr', { sensitivity: 'base' }) || a.numero - b.numero);
  return json({ termes });
});
