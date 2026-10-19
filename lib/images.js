// Images de l'API v2 : Pexels, Unsplash, repli sur l'image de la page Wikipédia.
// Une image = { src, alt, credit, lien }. Toute erreur (réseau, délai, réponse inattendue) donne null.
// Les clés viennent de env.PEXELS_KEY et env.UNSPLASH_KEY ; aucune n'est dans le code.

import { longueur, nettoyer } from './api.js';
import { USER_AGENT_V2 } from './wiki.js';

export const DELAI_IMAGE_MS = 6000;
export const CREDIT_WIKIMEDIA = 'Image : Wikimédia';
const UTM = 'utm_source=koios&utm_medium=referral';

async function appelerJSON(url, entetes) {
  try {
    const reponse = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT_V2, ...entetes },
      signal: AbortSignal.timeout(DELAI_IMAGE_MS),
    });
    if (!reponse.ok) {
      console.warn('Images : réponse', reponse.status);
      return null;
    }
    const json = JSON.parse(await reponse.text());
    return json && typeof json === 'object' ? json : null;
  } catch (e) {
    console.warn('Images : échec', e && e.message);
    return null;
  }
}

const adresse = (v, hote) => {
  if (typeof v !== 'string' || v.length > 600) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname === hote ? u.href : null;
  } catch {
    return null;
  }
};

function auteurDe(v) {
  const a = nettoyer(v);
  return a !== null && longueur(a) >= 1 && longueur(a) <= 80 ? a : null;
}

// Requête de recherche : mots simples, 80 caractères au plus.
export function requeteImage(motImage, titre) {
  const brut = typeof motImage === 'string' && motImage.trim() ? motImage : titre;
  return String(brut || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s'’-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
}

export async function imagePexels(env, requete, titre) {
  if (!env.PEXELS_KEY || !requete) return null;
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', requete);
  url.searchParams.set('per_page', '3');
  url.searchParams.set('orientation', 'landscape');
  const json = await appelerJSON(url.toString(), { authorization: env.PEXELS_KEY });
  const photos = json && Array.isArray(json.photos) ? json.photos : [];
  for (const p of photos) {
    if (!p || typeof p !== 'object' || !p.src || typeof p.src !== 'object') continue;
    const src = adresse(p.src.landscape || p.src.large, 'images.pexels.com');
    const lien = adresse(p.url, 'www.pexels.com');
    const auteur = auteurDe(p.photographer);
    if (src && lien && auteur) {
      return { src, alt: `Photo illustrant « ${titre} »`, credit: `Photo : ${auteur} sur Pexels`, lien };
    }
  }
  return null;
}

export async function imageUnsplash(env, requete, titre) {
  if (!env.UNSPLASH_KEY || !requete) return null;
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', requete);
  url.searchParams.set('per_page', '3');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');
  const json = await appelerJSON(url.toString(), { authorization: 'Client-ID ' + env.UNSPLASH_KEY });
  const resultats = json && Array.isArray(json.results) ? json.results : [];
  for (const r of resultats) {
    if (!r || typeof r !== 'object' || !r.urls || typeof r.urls !== 'object') continue;
    const src = adresse(r.urls.regular || r.urls.small, 'images.unsplash.com');
    const page = adresse(r.links && r.links.html, 'unsplash.com');
    const auteur = auteurDe(r.user && r.user.name);
    if (src && page && auteur) {
      return {
        src,
        alt: `Photo illustrant « ${titre} »`,
        credit: `Photo : ${auteur} sur Unsplash`,
        lien: page + (page.includes('?') ? '&' : '?') + UTM,
      };
    }
  }
  return null;
}

// Image d'une page de lib/wiki.js (vignette Wikimédia) : { src, alt, credit, lien }, ou null.
export function imageDePage(page) {
  const i = page && page.image;
  if (!i || typeof i.src !== 'string' || typeof i.page !== 'string') return null;
  return { src: i.src, alt: i.alt, credit: CREDIT_WIKIMEDIA, lien: i.page };
}

// Première image Wikipédia parmi les pages données (les plus précises d'abord).
export function imageDesPages(pages) {
  for (const p of pages || []) {
    const i = imageDePage(p);
    if (i) return i;
  }
  return null;
}

// Photo de tête d'un parcours : Pexels si la clé existe, sinon Unsplash si la clé existe, sinon l'image
// de la page Wikipédia. Un fournisseur sans résultat (ou en panne) laisse la main au suivant.
export async function imageDeTete(env, { motImage, titre, pages }) {
  const requete = requeteImage(motImage, titre);
  return (await imagePexels(env, requete, titre))
    || (await imageUnsplash(env, requete, titre))
    || imageDesPages(pages);
}
