// GET /api/fiche?parcours=<id>&de=<a>&a=<z> : la fiche d'un module, c'est-à-dire pour chaque leçon écrite de a à z
// (z - a + 1 = 20 leçons au plus) son titre, ses « À retenir » et ses définitions.
// Public, sans connexion ni quota. Lit seulement le cache (table paliers) : aucune IA, rien n'est généré, aucune vue comptée.
import { ErreurHttp, enveloppe, exigerBase, json } from '../../lib/api.js';
import { ID_PARCOURS, PALIER_MAX } from '../../lib/paliers.js';

const LECONS_MAX = 20;

// Tableau lu dans un extrait JSON (texte renvoyé par json_extract) ; le reste est ignoré.
function lireListe(texte) {
  if (typeof texte !== 'string') return [];
  try {
    const liste = JSON.parse(texte);
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

function entier(brut) {
  return typeof brut === 'string' && /^\d{1,4}$/.test(brut) ? Number(brut) : NaN;
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const p = new URL(request.url).searchParams;
  const parcours = p.get('parcours');
  const de = entier(p.get('de'));
  const a = entier(p.get('a'));
  if (!parcours || p.get('de') === null || p.get('a') === null) {
    throw new ErreurHttp(400, 'Indique le parcours et les leçons à lire (de, a).');
  }
  if (!ID_PARCOURS.test(parcours)) throw new ErreurHttp(400, 'Identifiant de parcours invalide.');
  if (!(de >= 1 && a >= de && a <= PALIER_MAX && a - de < LECONS_MAX)) {
    throw new ErreurHttp(400, `de et a invalides : des entiers de 1 à ${PALIER_MAX}, ${LECONS_MAX} leçons au plus.`);
  }

  // json_valid écarte une ligne illisible au lieu de faire échouer toute la requête.
  const { results } = await env.DB.prepare(
    `SELECT numero,
            json_extract(contenu, '$.titre') AS titre,
            json_extract(contenu, '$.aRetenir') AS retenir,
            json_extract(contenu, '$.definitions') AS definitions
       FROM paliers
      WHERE parcours = ? AND numero BETWEEN ? AND ? AND json_valid(contenu)
      ORDER BY numero`,
  )
    .bind(parcours, de, a)
    .all();

  const lecons = (results || []).map((r) => ({
    numero: r.numero,
    titre: typeof r.titre === 'string' ? r.titre : '',
    aRetenir: lireListe(r.retenir).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()),
    definitions: lireListe(r.definitions)
      .filter((d) => d && typeof d.terme === 'string' && typeof d.definition === 'string' && d.terme.trim() && d.definition.trim())
      .map((d) => ({ terme: d.terme.trim(), definition: d.definition.trim() })),
  }));
  return json({ lecons });
});
