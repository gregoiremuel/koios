// Extraits encyclopédiques d'une leçon (Wikipédia FR, puis EN si le français est maigre), mis en cache dans D1 (table
// sources_cache) pendant 30 jours. Le rédacteur et le vérificateur reçoivent les mêmes extraits.
// Réutilise lib/wiki.js (ancrer, lirePage, titreEnDe). Toute panne du cache est ignorée : elle ne fait jamais échouer une leçon.
// Une page n'est mise en cache que si la recherche française a abouti : un échec passager du réseau ne s'enregistre pas pour 30 jours.
// Aucun secret.
import {
  OPTIONS_EN, OPTIONS_FR, ancrer, lirePage, optionsDe, sansAccents, titreEnDe,
} from './wiki.js';

export const DUREE_CACHE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
export const TEXTE_MAIGRE = 2000; // en dessous, la page française est maigre : on ajoute la page anglaise

const normaliser = (s) => sansAccents(String(s === undefined || s === null ? '' : s)).replace(/[^a-z0-9]+/g, ' ').trim();

const pageOk = (p) => !!p && typeof p === 'object' && typeof p.titre === 'string' && typeof p.texte === 'string'
  && typeof p.url === 'string' && (p.langue === 'fr' || p.langue === 'en');

// Pages en cache et encore valables (moins de 30 jours), sinon null.
export async function lireCache(env, cle) {
  if (!env || !env.DB) return null;
  try {
    const l = await env.DB.prepare('SELECT contenu, cree FROM sources_cache WHERE cle = ?').bind(cle).first();
    if (!l || !(Date.now() - Date.parse(l.cree) < DUREE_CACHE_MS)) return null;
    const pages = JSON.parse(l.contenu);
    return Array.isArray(pages) && pages.length && pages.every(pageOk) ? pages : null;
  } catch (e) {
    console.warn('cache des sources : lecture impossible', e && e.message);
    return null;
  }
}

export async function ecrireCache(env, cle, pages) {
  if (!env || !env.DB || !pages.length) return;
  try {
    await env.DB.prepare('INSERT OR REPLACE INTO sources_cache (cle, contenu, cree) VALUES (?, ?, ?)')
      .bind(cle, JSON.stringify(pages), new Date().toISOString())
      .run();
  } catch (e) {
    console.warn('cache des sources : écriture impossible', e && e.message);
  }
}

// Extraits sur `requete` : page française, plus la page anglaise quand le français est absent ou maigre (moins de TEXTE_MAIGRE
// caractères). `titreVoulu` sert à choisir la page (voir ancrer). Mis en cache 30 jours.
export async function pagesAncrees(env, requete, titreVoulu = requete) {
  const cle = `ancre:${normaliser(requete)}|${normaliser(titreVoulu)}`;
  const cachees = await lireCache(env, cle);
  if (cachees) return cachees;
  const fr = await ancrer(requete, titreVoulu, OPTIONS_FR);
  const pages = fr ? [fr] : [];
  if (!fr || fr.texte.length < TEXTE_MAIGRE) {
    let en = await ancrer(requete, titreVoulu, OPTIONS_EN);
    if (!en && fr) {
      const titreEn = await titreEnDe(fr.titre);
      en = titreEn ? await lirePage(titreEn, OPTIONS_EN) : null;
    }
    if (en) pages.push(en);
  }
  if (fr) await ecrireCache(env, cle, pages);
  return pages;
}

// Une page de référence ({langue, titre}), lue une fois puis gardée 30 jours.
export async function pageDeReference(env, ref) {
  const cle = `page:${ref.langue}:${normaliser(ref.titre)}`;
  const cachees = await lireCache(env, cle);
  if (cachees) return cachees[0];
  const page = await lirePage(ref.titre, optionsDe(ref.langue));
  if (page) await ecrireCache(env, cle, [page]);
  return page;
}
