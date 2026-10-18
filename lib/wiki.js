// Ancrage Wikipédia (français) : point de départ des sujets et chapitres IA, jamais une preuve.
// Toute erreur (réseau, délai, réponse inattendue) donne null : l'appelant écrit alors « ancrage: "aucun" ».
// Aucune dépendance, aucun secret. Importé par lib/sujets.js.

export const API_WIKI = 'https://fr.wikipedia.org/w/api.php';
export const USER_AGENT = 'Koios/1.1 (https://koios.gregoire-muel.workers.dev)';
export const DELAI_MS = 6000;
export const MAX_TEXTE = 7000;
export const CREDIT_IMAGE = 'Image : Wikimédia, auteur et licence sur la page du fichier';

// En dessous, la page est une homonymie ou une ébauche : elle n'apprend rien à l'IA.
const MIN_TEXTE = 200;

// Appelle l'API MediaWiki. Renvoie l'objet JSON, ou null.
async function appeler(parametres) {
  const url = new URL(API_WIKI);
  for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
  try {
    const reponse = await fetch(url.toString(), {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!reponse.ok) {
      console.warn('Wikipédia : réponse', reponse.status);
      return null;
    }
    const json = JSON.parse(await reponse.text());
    return json && typeof json === 'object' ? json : null;
  } catch (e) {
    console.warn('Wikipédia : échec', e && e.message);
    return null;
  }
}

// Requête de recherche : lettres, chiffres, espaces, apostrophes et traits d'union internes seulement
// (pas d'opérateurs de recherche venus du joueur), 100 caractères au plus.
export function nettoyerRequete(requete) {
  if (typeof requete !== 'string') return '';
  return requete
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s'’-]+/gu, ' ')
    .replace(/(^|\s)-+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim();
}

// Jusqu'à 3 titres de pages, par pertinence décroissante.
export async function chercher(requete) {
  const q = nettoyerRequete(requete);
  if (!q) return [];
  const json = await appeler({
    action: 'query',
    list: 'search',
    srsearch: q,
    srlimit: '3',
    format: 'json',
    utf8: '1',
  });
  const trouves = json && json.query && json.query.search;
  if (!Array.isArray(trouves)) return [];
  return trouves.map((t) => t && t.title).filter((t) => typeof t === 'string' && t).slice(0, 3);
}

const MOTS_VIDES = new Set([
  'les', 'des', 'une', 'aux', 'dans', 'sur', 'pour', 'par', 'avec', 'sans', 'est', 'sont', 'que', 'qui',
  'ses', 'son', 'leur', 'leurs', 'ces', 'cette', 'entre', 'vers', 'chez', 'sous', 'plus', 'comme', 'the', 'and',
]);

export function sansAccents(texte) {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss');
}

// Radicaux de 5 lettres : « hoplites » et « Hoplite » se rejoignent.
function radicaux(texte) {
  return sansAccents(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length >= 3 && !MOTS_VIDES.has(m))
    .map((m) => m.slice(0, 5));
}

// Parmi les titres trouvés, celui qui partage le plus de mots avec la requête.
// Aucun mot en commun : null (mieux vaut pas d'ancrage qu'un ancrage hors sujet).
export function choisirTitre(requete, titres) {
  const voulus = new Set(radicaux(requete));
  let meilleur = null;
  let score = 0;
  for (const titre of titres) {
    const dans = new Set(radicaux(titre));
    let n = 0;
    for (const r of voulus) if (dans.has(r)) n += 1;
    if (n > score) {
      score = n;
      meilleur = titre;
    }
  }
  return meilleur;
}

// Texte brut de Wikipédia : sans fin d'article (notes, voir aussi…), 7 000 caractères au plus.
export function tronquer(texte) {
  let t = texte.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const fin = t.search(/\n=+ *(?:Notes?(?: et références)?|Références?|Voir aussi|Bibliographie|Liens externes|Articles connexes|Annexes|Sources) *=+/i);
  if (fin !== -1) t = t.slice(0, fin).trim();
  if (t.length > MAX_TEXTE) t = t.slice(0, MAX_TEXTE).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
  return t;
}

function imageDe(page, titre) {
  const vignette = page.thumbnail && page.thumbnail.source;
  const fichier = typeof page.pageimage === 'string' ? page.pageimage.trim().replace(/ /g, '_') : '';
  if (typeof vignette !== 'string' || !vignette.startsWith('https://upload.wikimedia.org/') || !fichier) return null;
  return {
    src: vignette,
    alt: `Illustration de « ${titre} »`,
    credit: CREDIT_IMAGE,
    page: 'https://fr.wikipedia.org/wiki/Fichier:' + encodeURIComponent(fichier),
  };
}

// Texte et image d'une page (redirections suivies). Renvoie {titre, url, texte, image} ou null.
export async function lirePage(titre) {
  if (typeof titre !== 'string' || !titre) return null;
  const json = await appeler({
    action: 'query',
    prop: 'extracts|pageimages|info',
    explaintext: '1',
    piprop: 'thumbnail|name',
    pithumbsize: '800',
    inprop: 'url',
    titles: titre,
    format: 'json',
    redirects: '1',
  });
  const pages = json && json.query && json.query.pages;
  if (!pages || typeof pages !== 'object') return null;
  const page = Array.isArray(pages) ? pages[0] : Object.values(pages)[0];
  if (!page || typeof page !== 'object' || 'missing' in page || 'invalid' in page) return null;
  if (typeof page.title !== 'string' || !page.title || typeof page.extract !== 'string') return null;
  const texte = tronquer(page.extract);
  if (texte.length < MIN_TEXTE) return null;
  const url = typeof page.fullurl === 'string' && page.fullurl.startsWith('https://fr.wikipedia.org/')
    ? page.fullurl
    : 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'));
  return { titre: page.title, url, texte, image: imageDe(page, page.title) };
}

// Recherche puis lecture de la meilleure page. Renvoie la page ou null.
// `titreVoulu` (par défaut la requête) sert à choisir la page : la requête peut porter un contexte
// (titre du parent) qui ne doit pas décider du choix.
export async function ancrer(requete, titreVoulu = requete) {
  const titre = choisirTitre(titreVoulu, await chercher(requete));
  return titre ? lirePage(titre) : null;
}

// Ligne de `sources` pour une page : ["Wikipédia · <titre>", url].
export function sourceDe(page) {
  return ['Wikipédia · ' + page.titre, page.url];
}
