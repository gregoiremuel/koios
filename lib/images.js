// Images de l'API v2 : Unsplash et Wikimedia Commons seulement (une image de page Wikipédia n'est gardée que si sa
// fiche Commons donne l'auteur et une licence libre). Une image = { src, alt, credit, lien, source } (Unsplash et Commons
// ajoutent largeur et hauteur ; Unsplash, les liens du photographe et d'Unsplash exigés par ses règles).
// Toute erreur (réseau, délai, réponse inattendue) donne null.
// La clé vient de env.UNSPLASH_KEY ; Commons n'en demande pas ; aucune clé n'est dans le code.

import { longueur, nettoyer } from './api.js';
import { USER_AGENT_V2 } from './wiki.js';

export const DELAI_IMAGE_MS = 6000;
export const CREDIT_WIKIMEDIA = 'Image : Wikimédia';
export const SOURCES_IMAGE = ['auto', 'commons', 'unsplash'];
// Politique Wikimedia : un User-Agent qui dit qui appelle et où le joindre.
export const USER_AGENT_COMMONS = 'Koios/2 (https://koios.gregoire-muel.workers.dev)';
export const API_COMMONS = 'https://commons.wikimedia.org/w/api.php';
export const LARGEUR_MIN_COMMONS = 800;
const LARGEUR_UNSPLASH = 1080; // urls.regular
const UTM = 'utm_source=koios&utm_medium=referral';

// { json, echec } : echec = vrai quand le fournisseur n'a pas répondu proprement (réseau, délai, HTTP, JSON illisible).
async function lireJSONExterne(url, entetes) {
  try {
    const reponse = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT_V2, ...entetes },
      signal: AbortSignal.timeout(DELAI_IMAGE_MS),
    });
    if (!reponse.ok) {
      console.warn('Images : réponse', reponse.status);
      return { json: null, echec: true };
    }
    const json = JSON.parse(await reponse.text());
    return json && typeof json === 'object' ? { json, echec: false } : { json: null, echec: true };
  } catch (e) {
    console.warn('Images : échec', e && e.message);
    return { json: null, echec: true };
  }
}

async function appelerJSON(url, entetes) {
  return (await lireJSONExterne(url, entetes)).json;
}

const adresse = (v, hote, max = 600) => {
  if (typeof v !== 'string' || v.length > max) return null;
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

const avecUtm = (u) => u + (u.includes('?') ? '&' : '?') + UTM;
const entier = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : null);

// Règles de l'API Unsplash : photo servie depuis images.unsplash.com (jamais copiée), crédit avec un lien vers le
// photographe et un lien vers Unsplash (tous deux avec utm_source=koios&utm_medium=referral), et appel de
// links.download_location dès qu'une photo est retenue.
async function signalerTelechargement(env, emplacement, attendre) {
  const url = adresse(emplacement, 'api.unsplash.com');
  if (!url) return;
  const appel = appelerJSON(url, { authorization: 'Client-ID ' + env.UNSPLASH_KEY }).catch(() => null);
  if (typeof attendre === 'function') attendre(appel);
  else await appel;
}

// { image, incertain } : incertain = le fournisseur n'a pas répondu proprement (ne pas retenir l'absence de résultat).
// options.waitUntil : laisse l'appel de téléchargement se terminer après la réponse (Workers).
export async function chercherUnsplash(env, requete, titre, options) {
  if (!env.UNSPLASH_KEY || !requete) return { image: null, incertain: false };
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', requete);
  url.searchParams.set('per_page', '3');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');
  const { json, echec } = await lireJSONExterne(url.toString(), { authorization: 'Client-ID ' + env.UNSPLASH_KEY });
  const resultats = json && Array.isArray(json.results) ? json.results : [];
  for (const r of resultats) {
    if (!r || typeof r !== 'object' || !r.urls || typeof r.urls !== 'object') continue;
    const src = adresse(r.urls.regular || r.urls.small, 'images.unsplash.com');
    const page = adresse(r.links && r.links.html, 'unsplash.com');
    const profil = adresse(r.user && r.user.links && r.user.links.html, 'unsplash.com');
    const auteur = auteurDe(r.user && r.user.name);
    if (!src || !page || !profil || !auteur) continue;
    const l = entier(r.width), h = entier(r.height);
    const largeur = l && h ? Math.min(l, LARGEUR_UNSPLASH) : null;
    await signalerTelechargement(env, r.links.download_location, options && options.waitUntil);
    return {
      image: {
        src,
        alt: `Photo illustrant « ${titre} »`,
        largeur,
        hauteur: largeur ? Math.round((largeur * h) / l) : null,
        credit: `Photo : ${auteur} sur Unsplash`,
        lien: avecUtm(page),
        source: 'unsplash',
        auteur,
        lienAuteur: avecUtm(profil),
        lienSource: avecUtm('https://unsplash.com/'),
      },
      incertain: false,
    };
  }
  return { image: null, incertain: echec };
}

export async function imageUnsplash(env, requete, titre, options) {
  return (await chercherUnsplash(env, requete, titre, options)).image;
}

// --- Wikimedia Commons : images libres de droits, d'au moins 800 px de large ---

// Licences réutilisables seulement : domaine public, CC0, CC BY et CC BY-SA (versions et portages compris).
// Toute autre mention (NC, ND, droit d'auteur, usage équitable, texte libre) écarte l'image.
const LICENCES_LIBRES = [
  /^(public domain|domaine public)$/i,
  /^cc0(?:[ -]\d\.\d)?(?: universal)?$/i,
  /^cc[ -]by(?:[ -]sa)?(?:[ -]\d(?:\.\d)?(?:[ -][a-z]{2,3})?)?$/i,
];
const SANS_ATTRIBUTION = /^(public domain|domaine public|cc0)/i;
const TYPES_COMMONS = ['image/jpeg', 'image/png', 'image/webp'];
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const licenceLibre = (nom) => typeof nom === 'string' && LICENCES_LIBRES.some((re) => re.test(nom.trim()));

// Texte brut d'un champ extmetadata (HTML) : balises retirées, entités décodées, espaces réduits.
export function texteDeHtml(valeur) {
  if (typeof valeur !== 'string') return null;
  const brut = valeur
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|([a-z]{2,5}));/gi, (m, hexa, dec, nom) => {
      if (nom) return Object.hasOwn(ENTITES, nom.toLowerCase()) ? ENTITES[nom.toLowerCase()] : m;
      const code = hexa ? parseInt(hexa, 16) : parseInt(dec, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/[<>]/g, '');
  return nettoyer(brut);
}

function auteurCommons(artist) {
  const t = texteDeHtml(artist);
  if (!t) return null;
  return longueur(t) > 80 ? Array.from(t).slice(0, 79).join('').trimEnd() + '…' : t;
}

const champ = (meta, nom) => (meta && typeof meta === 'object' && meta[nom] && typeof meta[nom] === 'object' ? meta[nom].value : undefined);

// Images générées par une IA : modèle « PD-algorithm » ou mention « AI-generated » dans les catégories ou la description.
const IMAGE_IA = /ai[\s_-]*generated|pd-algorithm/i;
const FILTRE_EXTMETADATA = 'Artist|LicenseShortName|NonFree|Categories|ImageDescription';

// Une réponse imageinfo -> image, ou null si la licence, la taille, le type ou les adresses ne conviennent pas.
function imageDeCommons(page, titre) {
  const info = page && Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
  if (!info || typeof info !== 'object') return null;
  if (!entier(info.width) || info.width < LARGEUR_MIN_COMMONS) return null;
  if (!TYPES_COMMONS.includes(info.mime)) return null;
  const meta = info.extmetadata;
  if (IMAGE_IA.test(String(champ(meta, 'Categories') || '')) || IMAGE_IA.test(String(champ(meta, 'ImageDescription') || ''))) return null;
  const licence = texteDeHtml(champ(meta, 'LicenseShortName'));
  if (!licence || !licenceLibre(licence) || texteDeHtml(champ(meta, 'NonFree')) === 'true') return null;
  const auteur = auteurCommons(champ(meta, 'Artist'));
  if (!auteur && !SANS_ATTRIBUTION.test(licence)) return null; // CC BY et BY-SA exigent le nom de l'auteur
  const miniature = info.thumburl ? adresse(info.thumburl, 'upload.wikimedia.org', 1000) : null;
  const src = miniature || (info.width <= 2000 ? adresse(info.url, 'upload.wikimedia.org', 1000) : null);
  const lien = adresse(info.descriptionurl, 'commons.wikimedia.org', 1000);
  if (!src || !lien) return null;
  const l = miniature ? entier(info.thumbwidth) : entier(info.width);
  const h = miniature ? entier(info.thumbheight) : entier(info.height);
  return {
    src,
    alt: `Photo illustrant « ${titre} »`,
    largeur: l && h ? l : null,
    hauteur: l && h ? h : null,
    credit: [auteur, licence, 'Wikimédia Commons'].filter(Boolean).join(' · '),
    lien,
    source: 'commons',
  };
}

// --- Pertinence : le titre du fichier ou sa description doit contenir un mot de la requête ---
const MOTS_VIDES = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'under', 'near', 'about', 'photo', 'picture', 'image', 'file',
  'les', 'des', 'une', 'aux', 'dans', 'sur', 'sous', 'avec', 'pour', 'par', 'est', 'sont', 'qui', 'que', 'quoi', 'del', 'der', 'die', 'das',
]);
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const racine = (m) => (m.length > 3 && m.endsWith('s') ? m.slice(0, -1) : m);
// Mots significatifs d'un texte : minuscules, sans accents, 3 lettres au moins, hors mots vides, pluriels ramenés au singulier.
export function motsSignificatifs(texte) {
  const mots = sansAccents(texte).split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m)).map(racine);
  return [...new Set(mots)];
}
// Note d'un fichier : 2 points par mot de la requête dans le titre du fichier, 1 par mot dans sa description. 0 = hors sujet.
export function pertinence(mots, page, description) {
  const titreFichier = String(page && page.title || '').replace(/^[^:]+:/, '').replace(/\.[a-z0-9]{2,5}$/i, '');
  const dansTitre = new Set(motsSignificatifs(titreFichier));
  const dansDescription = new Set(motsSignificatifs(description || ''));
  let note = 0;
  for (const m of mots) note += (dansTitre.has(m) ? 2 : 0) + (dansDescription.has(m) ? 1 : 0);
  return note;
}

// { image, incertain } : recherche de fichiers (espace 6) de type bitmap. Seuls les fichiers dont le titre ou la
// description contient un mot de la requête sont gardés (sans mot significatif dans la requête, aucun tri n'est possible :
// on garde tout) ; ils sont classés par pertinence, puis les JPEG avant les PNG et WebP (photos plutôt que schémas), puis par rang.
export async function chercherCommons(requete, titre) {
  const mots = requeteImage(requete, requete).replace(/(^|\s)-+/g, '$1').trim(); // ni opérateurs de recherche ni exclusions
  if (!mots) return { image: null, incertain: false };
  const url = new URL(API_COMMONS);
  const parametres = {
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${mots} filetype:bitmap -hastemplate:"PD-algorithm"`, gsrlimit: '10',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1200', iiextmetadatafilter: FILTRE_EXTMETADATA,
  };
  for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
  const { json, echec } = await lireJSONExterne(url.toString(), { 'user-agent': USER_AGENT_COMMONS });
  const pages = json && json.query && json.query.pages;
  const liste = (Array.isArray(pages) ? pages : Object.values(pages && typeof pages === 'object' ? pages : {}))
    .filter((p) => p && typeof p === 'object')
    .sort((a, b) => (a.index || 0) - (b.index || 0));
  const significatifs = motsSignificatifs(mots);
  const valables = [];
  for (const p of liste) {
    const image = imageDeCommons(p, titre);
    if (!image) continue;
    const note = pertinence(significatifs, p, texteDeHtml(champ(p.imageinfo[0].extmetadata, 'ImageDescription')));
    if (significatifs.length && note === 0) continue; // hors sujet
    valables.push({ image, note, jpeg: p.imageinfo[0].mime === 'image/jpeg', rang: valables.length });
  }
  valables.sort((a, b) => b.note - a.note || Number(b.jpeg) - Number(a.jpeg) || a.rang - b.rang);
  const choix = valables[0];
  return { image: choix ? choix.image : null, incertain: echec };
}

// Recherche selon la source demandée : commons, unsplash, ou auto (Commons d'abord, puis Unsplash).
export async function chercherImage(env, source, requete, options) {
  if (source === 'commons') return chercherCommons(requete, requete);
  if (source === 'unsplash') return chercherUnsplash(env, requete, requete, options);
  const commons = await chercherCommons(requete, requete);
  if (commons.image) return commons;
  const unsplash = await chercherUnsplash(env, requete, requete, options);
  return { image: unsplash.image, incertain: !unsplash.image && (commons.incertain || unsplash.incertain) };
}

// Image d'une page de lib/wiki.js (vignette Wikimédia) : { src, alt, credit, lien }, ou null.
export function imageDePage(page) {
  const i = page && page.image;
  if (!i || typeof i.src !== 'string' || typeof i.page !== 'string') return null;
  return { src: i.src, alt: i.alt, credit: CREDIT_WIKIMEDIA, lien: i.page };
}

// Image d'une page Wikipédia complétée par sa fiche Commons : auteur, licence et page du fichier (même contrôle que
// les images de Commons : licence libre, 800 px au moins, pas d'image générée par une IA). Sans fiche Commons qui
// convienne (image locale à Wikipédia, licence non libre, auteur inconnu, panne), l'image n'est pas utilisée : null.
export async function imageWikipedia(image) {
  const m = image && typeof image.lien === 'string' ? /\/wiki\/(?:Fichier|File):([^?#]+)$/.exec(image.lien) : null;
  if (!m) return null;
  let nom;
  try { nom = decodeURIComponent(m[1]).replace(/_/g, ' '); } catch { return null; }
  const url = new URL(API_COMMONS);
  const parametres = {
    action: 'query', format: 'json', titles: `File:${nom}`,
    prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1200', iiextmetadatafilter: FILTRE_EXTMETADATA,
  };
  for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
  const { json } = await lireJSONExterne(url.toString(), { 'user-agent': USER_AGENT_COMMONS });
  const pages = json && json.query && json.query.pages;
  const fiche = (Array.isArray(pages) ? pages : Object.values(pages && typeof pages === 'object' ? pages : {}))
    .find((p) => p && typeof p === 'object' && Array.isArray(p.imageinfo));
  const complete = fiche ? imageDeCommons(fiche, nom) : null;
  return complete ? { ...complete, alt: image.alt || complete.alt } : null;
}

// Première image Wikipédia utilisable parmi les pages données (les plus précises d'abord), avec son crédit complet.
export async function imageDesPages(pages) {
  for (const p of pages || []) {
    const i = imageDePage(p);
    if (!i) continue;
    const complete = await imageWikipedia(i);
    if (complete) return complete;
  }
  return null;
}

// Photo de tête d'un parcours : Unsplash si la clé existe, sinon l'image de la page Wikipédia (crédit complété par
// Commons). Un fournisseur sans résultat (ou en panne) laisse la main au suivant.
export async function imageDeTete(env, { motImage, titre, pages }) {
  const requete = requeteImage(motImage, titre);
  return (await imageUnsplash(env, requete, titre))
    || (await imageDesPages(pages));
}
