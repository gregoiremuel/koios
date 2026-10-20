// Ancrage Wikipédia (français, et anglais pour l'API v2) : point de départ des sujets, chapitres et paliers IA,
// jamais une preuve. Toute erreur (réseau, délai, réponse inattendue) donne null : l'appelant écrit alors
// « ancrage: "aucun" » (v1.1) ou cherche d'autres sources (v2).
// Aucune dépendance, aucun secret. Importé par lib/sujets.js et lib/paliers.js.

export const API_WIKI = 'https://fr.wikipedia.org/w/api.php';
export const USER_AGENT = 'Koios/1.1 (https://koios.gregoire-muel.workers.dev)';
export const DELAI_MS = 6000;
export const MAX_TEXTE = 7000;
export const CREDIT_IMAGE = 'Image : Wikimédia, auteur et licence sur la page du fichier';

// API v2 : Wikipédia FR et EN, 6 000 caractères au plus par langue, autre User-Agent.
export const USER_AGENT_V2 = 'Koios/2.0 (https://koios.gregoire-muel.workers.dev)';
export const MAX_TEXTE_V2 = 6000;
export const OPTIONS_FR = { langue: 'fr', max: MAX_TEXTE_V2, agent: USER_AGENT_V2 };
export const OPTIONS_EN = { langue: 'en', max: MAX_TEXTE_V2, agent: USER_AGENT_V2 };
export const optionsDe = (langue) => (langue === 'en' ? OPTIONS_EN : OPTIONS_FR);

// Par défaut (v1.1) : français, 7 000 caractères, User-Agent 1.1.
const PAR_DEFAUT = { langue: 'fr', max: MAX_TEXTE, agent: USER_AGENT };
const complet = (opts) => ({ ...PAR_DEFAUT, ...(opts || {}) });

// En dessous, la page est une homonymie ou une ébauche : elle n'apprend rien à l'IA.
const MIN_TEXTE = 200;

// Appelle l'API MediaWiki. Renvoie l'objet JSON, ou null.
async function appeler(parametres, opts) {
  const { langue, agent } = complet(opts);
  const url = new URL(langue === 'fr' ? API_WIKI : `https://${langue}.wikipedia.org/w/api.php`);
  for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
  try {
    const reponse = await fetch(url.toString(), {
      headers: { 'user-agent': agent, accept: 'application/json' },
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
export async function chercher(requete, opts) {
  const q = nettoyerRequete(requete);
  if (!q) return [];
  const json = await appeler({
    action: 'query',
    list: 'search',
    srsearch: q,
    srlimit: '3',
    format: 'json',
    utf8: '1',
  }, opts);
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
export function tronquer(texte, max = MAX_TEXTE) {
  let t = texte.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const fin = t.search(/\n=+ *(?:Notes?(?: et références| and references)?|Références?|References?|Voir aussi|See also|Bibliographie|Bibliography|Further reading|Liens externes|External links|Articles connexes|Annexes|Sources) *=+/i);
  if (fin !== -1) t = t.slice(0, fin).trim();
  if (t.length > max) t = t.slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
  return t;
}

function imageDe(page, titre, langue = 'fr') {
  const vignette = page.thumbnail && page.thumbnail.source;
  const fichier = typeof page.pageimage === 'string' ? page.pageimage.trim().replace(/ /g, '_') : '';
  if (typeof vignette !== 'string' || !vignette.startsWith('https://upload.wikimedia.org/') || !fichier) return null;
  return {
    src: vignette,
    alt: `Illustration de « ${titre} »`,
    credit: CREDIT_IMAGE,
    page: `https://${langue}.wikipedia.org/wiki/${langue === 'fr' ? 'Fichier' : 'File'}:` + encodeURIComponent(fichier),
  };
}

// Texte et image d'une page (redirections suivies). Renvoie {titre, url, texte, image} ou null.
export async function lirePage(titre, opts) {
  if (typeof titre !== 'string' || !titre) return null;
  const { langue, max } = complet(opts);
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
  }, opts);
  const pages = json && json.query && json.query.pages;
  if (!pages || typeof pages !== 'object') return null;
  const page = Array.isArray(pages) ? pages[0] : Object.values(pages)[0];
  if (!page || typeof page !== 'object' || 'missing' in page || 'invalid' in page) return null;
  if (typeof page.title !== 'string' || !page.title || typeof page.extract !== 'string') return null;
  const texte = tronquer(page.extract, max);
  if (texte.length < MIN_TEXTE) return null;
  const racine = `https://${langue}.wikipedia.org/`;
  const url = typeof page.fullurl === 'string' && page.fullurl.startsWith(racine)
    ? page.fullurl
    : racine + 'wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'));
  return { titre: page.title, url, texte, image: imageDe(page, page.title, langue), langue };
}

// Recherche puis lecture de la meilleure page. Renvoie la page ou null.
// `titreVoulu` (par défaut la requête) sert à choisir la page : la requête peut porter un contexte
// (titre du parent) qui ne doit pas décider du choix.
export async function ancrer(requete, titreVoulu = requete, opts) {
  const titre = choisirTitre(titreVoulu, await chercher(requete, opts));
  return titre ? lirePage(titre, opts) : null;
}

// Titre anglais d'une page française (liens interlangues), ou null. Sert à trouver la page anglaise
// quand le titre français ne ressemble pas au titre anglais (« Moyen Âge » / « Middle Ages »).
export async function titreEnDe(titreFr) {
  if (typeof titreFr !== 'string' || !titreFr) return null;
  const json = await appeler({
    action: 'query',
    prop: 'langlinks',
    lllang: 'en',
    lllimit: '1',
    titles: titreFr,
    format: 'json',
    redirects: '1',
  }, OPTIONS_FR);
  const pages = json && json.query && json.query.pages;
  if (!pages || typeof pages !== 'object') return null;
  const page = Array.isArray(pages) ? pages[0] : Object.values(pages)[0];
  const lien = page && Array.isArray(page.langlinks) ? page.langlinks[0] : null;
  const titre = lien && (typeof lien['*'] === 'string' ? lien['*'] : lien.title);
  return typeof titre === 'string' && titre ? titre : null;
}

// Ligne de `sources` pour une page (un document : [libellé, ''], sans lien) : ["Wikipédia · <titre>", url] (anglais : "Wikipedia (en) · <titre>").
export function sourceDe(page) {
  // Document de référence (lot 10) : sans lien. « <éditeur>, <titre>, p. N » si l'éditeur est connu.
  if (page.langue === 'doc') return [page.editeur ? page.titre : `Document de référence : ${page.titre}`, ''];
  return [(page.langue === 'en' ? 'Wikipedia (en) · ' : 'Wikipédia · ') + page.titre, page.url];
}
