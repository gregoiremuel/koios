// Fournisseurs d'IA de l'API v2 : Gemini, Cerebras, Groq, Mistral, GLM, Grok (API compatibles OpenAI pour tous sauf Gemini), Claude (clé personnelle)
// et Workers AI.
// Un fournisseur = { famille, nom, modele, appeler(messages, { maxTokens, temperature, delaiMs }) }.
// `appeler` renvoie la sortie brute ; lib/libre.js (extraireObjet) en tire l'objet JSON.
// Un appel ne dépasse jamais REGLAGES.delaiIaMs (60 s). Aucun secret dans le code : les clés viennent de env.GEMINI_API_KEY, env.CEREBRAS_API_KEY, env.GROQ_API_KEY, env.MISTRAL_API_KEY,
// env.GLM_API_KEY, env.GROK_API_KEY et env.CLAUDE_API_KEY (un fournisseur sans clé n'existe pas). Claude (claude-haiku-5-5) passe en premier pour la rédaction.
// Clé personnelle : env.clePerso = { fournisseur: 'gemini' | 'glm' | 'claude', cle } (posée par envAvecCle, lib/api.js, d'après l'en-tête
// x-cle-ia). Elle passe en premier pour la rédaction, n'est jamais enregistrée ni journalisée, et ne touche pas à la mémoire des épuisements.
// Toutes les sorties sont lisibles par extraireObjet (forme chat.completions ou `response` de Workers AI).

import { USER_AGENT_V2 } from './wiki.js';

export const GLM_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
export const GLM_MODELE_DEFAUT = 'glm-4.7-flash';
export const LLAMA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MISTRAL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

// Réglages de délais (modifiés seulement par les tests).
export const REGLAGES = {
  delaiIaMs: 60000, // un appel d'IA : 60 s au plus
  delaiMinMs: 5000, // en dessous, on ne lance plus d'appel (il n'aurait pas le temps de répondre)
  budgetMs: 85000, // génération complète d'un palier (plan éventuel + sources + rédaction + vérification)
  delaiPlanMs: 30000, // appel qui écrit le plan d'une étape ou d'un module (5 à 10 titres : réponse courte)
  delaiProgrammeMs: 50000, // appel qui écrit le programme d'ensemble (4 niveaux, jusqu'à 40 modules : 7 000 jetons au plus)
  delaiMoitieMs: 50000, // une moitié de leçon (2 200 jetons au plus, deux appels en parallèle)
  delaiVerifMs: 25000, // vérification par la 2e IA (400 jetons au plus)
  reserveVerifMs: 12000, // temps gardé pour la vérification pendant la rédaction
  resteMinTourMs: 45000, // temps restant minimal pour tenter une nouvelle rédaction
};

// « @cf/meta/llama-3.3-70b-instruct-fp8-fast » -> « llama-3.3-70b-instruct-fp8-fast ».
export function nomCourt(modele) {
  return modele.replace(/^@cf\/[^/]+\//, '');
}

const cleDe = (env, nom) => !!(env && typeof env[nom] === 'string' && env[nom].trim());
export const cleGLM = (env) => cleDe(env, 'GLM_API_KEY');
export const cleGemini = (env) => cleDe(env, 'GEMINI_API_KEY');
export const cleGrok = (env) => cleDe(env, 'GROK_API_KEY');
export const cleClaude = (env) => cleDe(env, 'CLAUDE_API_KEY');
export const cleCerebras = (env) => cleDe(env, 'CEREBRAS_API_KEY');
export const cleGroq = (env) => cleDe(env, 'GROQ_API_KEY');
export const cleMistral = (env) => cleDe(env, 'MISTRAL_API_KEY');

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
// Cascade Gemini, du meilleur au moins bon : à chaque appel on repart du premier modèle non écarté (jamais de modèle « figé »).
export const GEMINI_MODELES = [
  'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite',
];
export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODELE = 'claude-haiku-5-5';
// Crédit Claude : Anthropic ne donne pas le solde par clé, on le calcule. Prix en dollars par million de jetons (à changer ici).
export const PRIX_CLAUDE_ENTREE = 0.10;
export const PRIX_CLAUDE_SORTIE = 0.50;
export const SEUIL_CREDIT = 0.5; // dollars restants en dessous desquels l'alerte s'allume
export const XAI_URL = 'https://api.x.ai/v1/chat/completions';
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';
export const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
export const GROQ_MODELES = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'];
export const CEREBRAS_MODELES = ['gpt-oss-120b', 'llama-3.3-70b', 'qwen-3-32b'];
export const MISTRAL_MODELES = ['mistral-medium-latest', 'mistral-small-latest'];
// Fournisseurs compatibles OpenAI à cascade de modèles (clé du serveur seulement). Famille 'mistral' = l'API officielle de Mistral ;
// elle n'a rien à voir avec le modèle Mistral de Workers AI (famille 'workers-ai').
const COMPAT = {
  cerebras: { nom: 'Cerebras', variable: 'CEREBRAS_API_KEY', url: CEREBRAS_URL, modeles: CEREBRAS_MODELES },
  groq: { nom: 'Groq', variable: 'GROQ_API_KEY', url: GROQ_URL, modeles: GROQ_MODELES },
  mistral: { nom: 'Mistral', variable: 'MISTRAL_API_KEY', url: MISTRAL_URL, modeles: MISTRAL_MODELES },
};
const FAMILLES_COMPAT = Object.keys(COMPAT);

// --- Échecs, quota épuisé -------------------------------------------------------

// Erreur d'un fournisseur : `fournisseur` = nom à afficher (GLM, Gemini, Grok, Workers AI), `statut` = code HTTP s'il y en a,
// `epuise` = quota gratuit épuisé (429, ou « 4006 » de Workers AI).
// `cleRefusee` : la clé (personnelle) est refusée par le fournisseur (401, 403, « clé invalide »). `cleInvalide` : Grok refuse la clé
// sur tous les couples. `details` : l'erreur de chaque modèle essayé (diagnostic de Gemini), sans clé.
export class ErreurIA extends Error {
  constructor(message, {
    fournisseur, statut = null, epuise = false, cleRefusee = false, cleInvalide = false, details = null,
  } = {}) {
    super(message);
    this.name = 'ErreurIA';
    this.fournisseur = fournisseur;
    this.statut = statut;
    this.epuise = epuise;
    this.cleRefusee = cleRefusee;
    this.cleInvalide = cleInvalide;
    this.details = details;
  }
}

// Un fournisseur épuisé n'est plus essayé pendant 10 minutes (vie de l'isolat) : on ne perd plus de temps à chaque leçon.
export const EPUISEMENT_MS = 10 * 60 * 1000;
const NOMS = {
  gemini: 'Gemini', cerebras: 'Cerebras', groq: 'Groq', mistral: 'Mistral', glm: 'GLM', grok: 'Grok', claude: 'Claude', 'workers-ai': 'Workers AI',
};
const epuises = new Map(); // famille -> instant de reprise
// Gemini : mémoire PAR MODÈLE. modèle -> { etat: 'epuise' | 'indisponible', jusqua }. La famille n'est épuisée que si tous les modèles sont écartés.
export const EPUISEMENT_JOUR_MS = 3 * 60 * 60 * 1000; // 429 qui parle d'un quota par jour
export const EPUISEMENT_MISTRAL_MS = 60 * 1000; // Mistral (API), palier gratuit : le 429 est une limite par seconde, pas par jour
export const INDISPONIBLE_MS = 24 * 60 * 60 * 1000; // modèle inconnu (404, ou 400 « modèle inconnu »)
const modelesGemini = new Map();
const QUOTA_PAR_JOUR = /PerDay|per day|per-day|daily|par jour/i;
const MODELE_INCONNU = /not found|unknown model|is not supported|no longer available|NOT_FOUND|not exist|invalid model|model_not_found/i;
// Fournisseurs compatibles OpenAI : mémoire PAR MODÈLE (« famille/modèle » -> { etat, jusqua }), comme Gemini, et modèles qui ont refusé
// response_format (400) : on ne le leur renvoie plus.
const modelesCompat = new Map();
const sansJson = new Set();
export function marquerModeleCompat(famille, modele, etat, duree) {
  modelesCompat.set(famille + '/' + modele, { etat, jusqua: Date.now() + duree });
}
// null si le modèle est utilisable, sinon { etat, jusqua }.
export function ecartModeleCompat(famille, modele) {
  const m = modelesCompat.get(famille + '/' + modele);
  if (!m) return null;
  if (Date.now() >= m.jusqua) { modelesCompat.delete(famille + '/' + modele); return null; }
  return m;
}
// État de chaque modèle des fournisseurs compatibles (diagnostic) : { groq: [{ modele, etat, jusqua? }], ... }.
export function etatModelesCompat() {
  const sortie = {};
  for (const famille of FAMILLES_COMPAT) {
    sortie[famille] = COMPAT[famille].modeles.map((modele) => {
      const m = ecartModeleCompat(famille, modele);
      return m ? { modele, etat: m.etat, jusqua: new Date(m.jusqua).toISOString() } : { modele, etat: 'ok' };
    });
  }
  return sortie;
}

export function marquerModeleGemini(modele, etat, duree) {
  modelesGemini.set(modele, { etat, jusqua: Date.now() + duree });
}
// null si le modèle est utilisable, sinon { etat, jusqua }.
export function ecartModeleGemini(modele) {
  const m = modelesGemini.get(modele);
  if (!m) return null;
  if (Date.now() >= m.jusqua) { modelesGemini.delete(modele); return null; }
  return m;
}
// État de chaque modèle de la cascade (diagnostic) : ok, epuise (jusqu'à tel instant) ou indisponible.
export function etatModelesGemini() {
  return GEMINI_MODELES.map((modele) => {
    const m = ecartModeleGemini(modele);
    return m ? { modele, etat: m.etat, jusqua: new Date(m.jusqua).toISOString() } : { modele, etat: 'ok' };
  });
}
// Un fournisseur dont la clé est refusée partout (Grok : 401 sur tous les couples) est ignoré 1 heure.
export const IGNORE_MS = 60 * 60 * 1000;
const ignores = new Map(); // famille -> instant de reprise

export function marquerEpuise(famille) {
  epuises.set(famille, Date.now() + EPUISEMENT_MS);
}
export function estEpuise(famille) {
  const fin = epuises.get(famille);
  if (fin !== undefined) {
    if (Date.now() < fin) return true;
    epuises.delete(famille);
  }
  if (famille === 'gemini') return GEMINI_MODELES.every((m) => ecartModeleGemini(m) !== null);
  return !!COMPAT[famille] && COMPAT[famille].modeles.every((m) => ecartModeleCompat(famille, m) !== null);
}
// Noms des fournisseurs actuellement mis de côté.
export function nomsEpuises() {
  return [...new Set([...epuises.keys(), 'gemini', ...FAMILLES_COMPAT])].filter(estEpuise).map((f) => NOMS[f] || f);
}
export function marquerIgnore(famille, duree = IGNORE_MS) {
  ignores.set(famille, Date.now() + duree);
}
export function oublierIgnore(famille) {
  ignores.delete(famille);
}
export function estIgnore(famille) {
  const fin = ignores.get(famille);
  if (fin === undefined) return false;
  if (Date.now() >= fin) { ignores.delete(famille); return false; }
  return true;
}
export function nomsIgnores() {
  return [...ignores.keys()].filter(estIgnore).map((f) => NOMS[f] || f);
}
// Remet à zéro la mémoire des épuisements et des couples retenus (tests).
export function oublierEpuisements() {
  epuises.clear();
  ignores.clear();
  modelesGemini.clear();
  modelesCompat.clear();
  sansJson.clear();
  glmRetenu = null;
  grokRetenu = null;
}

// Échec HTTP d'un fournisseur : message sans clé ni texte étranger, 429 = quota épuisé (et mémorisé, sauf pour une clé personnelle :
// son quota n'est pas celui du serveur).
function echecHttp(famille, reponse, modele, corps, cle, perso = false) {
  const statut = reponse.status;
  let detail = String(corps || '').replace(/\s+/g, ' ');
  if (cle) detail = detail.split(cle).join('***'); // la clé est retirée AVANT de couper (une clé coupée en deux ne serait plus reconnue)
  detail = detail.slice(0, 150);
  const epuise = statut === 429;
  // Gemini et les fournisseurs compatibles OpenAI à cascade : mémoire par modèle, voir gemini() et compatOpenAI().
  if (epuise && !perso && famille !== 'gemini' && !COMPAT[famille]) marquerEpuise(famille);
  return new ErreurIA(`${NOMS[famille]} : réponse ${statut} (${modele})${detail ? ' ' + detail : ''}`, { fournisseur: NOMS[famille], statut, epuise });
}

// Réponse qui dit que la clé n'est pas bonne (Gemini répond 400 « API key not valid » pour une clé fausse).
const TEXTE_CLE_FAUSSE = /API[_ ]KEY[_ ]INVALID|API key not valid|invalid x-api-key|invalid api key|incorrect api key/i;
const clePasBonne = (statut, corps) => statut === 401 || statut === 403 || (statut === 400 && TEXTE_CLE_FAUSSE.test(String(corps || '')));
// Un secret ne sort jamais d'un message.
export function sansSecret(texte, secret) {
  const t = String(texte === undefined || texte === null ? '' : texte);
  return secret ? t.split(secret).join('***') : t;
}

async function texteDe(reponse) {
  try { return await reponse.text(); } catch { return ''; }
}

// --- GLM -------------------------------------------------------------------

// Clés GLM émises par z.ai (international) ou par open.bigmodel.cn (Chine), avec des modèles gratuits
// qui changent de nom : on essaie les couples (adresse, modèle) dans l'ordre et on retient celui qui répond.
const GLM_CANDIDATS = [
  [GLM_URL, GLM_MODELE_DEFAUT], [GLM_URL, 'glm-4.5-flash'],
  ['https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4.5-flash'],
  ['https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-flash-250414'],
  ['https://open.bigmodel.cn/api/paas/v4/chat/completions', 'glm-4-flash'],
];
let glmRetenu = null; // couple qui a répondu, gardé pour la vie de l'isolat

function glm(env, { perso = false } = {}) {
  const impose = !perso && typeof env.GLM_MODELE === 'string' && env.GLM_MODELE.trim() ? env.GLM_MODELE.trim() : null;
  const candidats = impose ? [[env.GLM_URL || GLM_URL, impose]] : (glmRetenu && !perso ? [glmRetenu] : perso ? GLM_CANDIDATS.filter(([u]) => u === GLM_URL) : GLM_CANDIDATS);
  const premier = candidats[0][1];
  return {
    famille: 'glm',
    modele: premier,
    nom: premier,
    couple: () => (glmRetenu && !perso ? { url: glmRetenu[0], modele: glmRetenu[1] } : null),
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs }) {
      const debut = Date.now();
      let derniere = null;
      let toutRefuse = true;
      for (const [url, modele] of candidats) {
        const reste = Math.min(delaiMs, REGLAGES.delaiIaMs) - (Date.now() - debut);
        if (reste <= 0) break;
        const reponse = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: 'Bearer ' + env.GLM_API_KEY.trim(),
            'user-agent': USER_AGENT_V2,
          },
          // Pas de mode « réflexion » : il rallonge la réponse au-delà du délai.
          body: JSON.stringify({ model: modele, messages, max_tokens: maxTokens, temperature, stream: false, thinking: { type: 'disabled' } }),
          signal: AbortSignal.timeout(reste),
        });
        if (reponse.ok) { if (!impose && !perso) glmRetenu = [url, modele]; return JSON.parse(await reponse.text()); }
        derniere = echecHttp('glm', reponse, modele, await texteDe(reponse), env.GLM_API_KEY.trim(), perso);
        if (reponse.status !== 401 && reponse.status !== 403) toutRefuse = false;
        // Clé ou modèle refusés par cette adresse : on essaie le couple suivant ; sinon (surcharge, panne) on s'arrête.
        if (![400, 401, 403, 404].includes(reponse.status)) break;
      }
      if (derniere && toutRefuse) derniere.cleRefusee = true;
      throw derniere || new ErreurIA('GLM : délai dépassé', { fournisseur: 'GLM' });
    },
  };
}

// --- Gemini (Google AI Studio) -----------------------------------------------

// Réflexion coupée (vitesse) sur toute la série flash : 2.5 par un budget nul, `gemini-flash-latest` et les 3.x par le niveau minimal.
// La série 2.0 n'a pas de réflexion. `sansReflexion` : même corps sans ce champ (repli quand Gemini répond 400 à cause de lui).
export function reflexionDe(modele) {
  if (/gemini-2\.5-flash/.test(modele)) return { thinkingBudget: 0 };
  if (/^gemini-(?:flash-latest$|3)/.test(modele)) return { thinkingLevel: 'minimal' };
  return null;
}

// Messages chat -> corps generateContent : « system » devient systemInstruction, « assistant » devient « model ».
export function corpsGemini(messages, { maxTokens, temperature, modele, sansReflexion = false }) {
  const systeme = messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n\n');
  const contents = messages.filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
  const generationConfig = { maxOutputTokens: maxTokens, temperature, responseMimeType: 'application/json' };
  const reflexion = sansReflexion ? null : reflexionDe(modele);
  if (reflexion) generationConfig.thinkingConfig = reflexion;
  const corps = { contents, generationConfig };
  if (systeme) corps.systemInstruction = { parts: [{ text: systeme }] };
  return corps;
}

// Réponse Gemini -> forme chat.completions (le texte des parties, sans les parties de réflexion).
export function normaliserGemini(donnees) {
  const parties = donnees && donnees.candidates && donnees.candidates[0] && donnees.candidates[0].content
    && Array.isArray(donnees.candidates[0].content.parts) ? donnees.candidates[0].content.parts : [];
  const texte = parties.filter((p) => p && typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
  return { choices: [{ message: { role: 'assistant', content: texte } }] };
}

// Cascade : du meilleur au moins bon modèle, en sautant ceux que la mémoire écarte (429 : 10 min, ou 3 h si le quota est « par jour » ;
// modèle inconnu : 24 h). 429 -> marqué épuisé et modèle suivant dans le même appel ; 404 / 400 « modèle inconnu » -> marqué indisponible ;
// 5xx ou délai -> modèle suivant sans marquer. `perso` : clé personnelle (aucune mémoire partagée). `erreursModeles` : l'erreur de chaque
// modèle essayé pendant le dernier appel. `modeleRepondu` : le modèle qui a répondu au dernier appel.
function gemini(env, { perso = false } = {}) {
  const impose = !perso && typeof env.GEMINI_MODELE === 'string' && env.GEMINI_MODELE.trim() ? env.GEMINI_MODELE.trim() : null;
  const candidats = () => {
    if (impose) return [impose];
    return perso ? GEMINI_MODELES : GEMINI_MODELES.filter((m) => !ecartModeleGemini(m));
  };
  const f = {
    famille: 'gemini',
    // Le modèle qui a répondu au dernier appel, à défaut le premier non écarté (affiché dans le badge de la leçon).
    get modele() { return f.modeleRepondu || candidats()[0] || GEMINI_MODELES[0]; },
    get nom() { return f.modele; },
    erreursModeles: [],
    modeleRepondu: null,
    couple: () => (f.modeleRepondu ? { url: GEMINI_BASE + f.modeleRepondu + ':generateContent', modele: f.modeleRepondu } : null),
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs, modele: impose1 = null }) {
      const cle = env.GEMINI_API_KEY.trim();
      const debut = Date.now();
      // `modele` : modèle imposé pour cet appel (une leçon n'a qu'un rédacteur pour ses deux parties), sans repli sur les suivants.
      const liste = impose1 ? [impose1] : candidats();
      let derniere = null;
      let tousEn429 = true;
      const refus = []; // pour chaque échec : la clé est-elle refusée ?
      f.erreursModeles = [];
      f.modeleRepondu = null;
      if (!liste.length) {
        throw new ErreurIA('Gemini : tous les modèles sont écartés (quota épuisé ou modèle indisponible)', { fournisseur: 'Gemini', statut: 429, epuise: true, details: [] });
      }
      for (const modele of liste) {
        let sansReflexion = false;
        let suite = true;
        // Au plus deux essais par modèle : avec la réflexion coupée, puis (si Gemini la refuse par un 400) sans ce champ.
        for (let essai = 0; essai < 2 && suite; essai++) {
          suite = false;
          const reste = Math.min(delaiMs, REGLAGES.delaiIaMs) - (Date.now() - debut);
          if (reste <= 0) break;
          const corps = corpsGemini(messages, { maxTokens, temperature, modele, sansReflexion });
          let reponse;
          try {
            reponse = await fetch(GEMINI_BASE + modele + ':generateContent', {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json', 'x-goog-api-key': cle, 'user-agent': USER_AGENT_V2 },
              body: JSON.stringify(corps),
              signal: AbortSignal.timeout(reste),
            });
          } catch (e) {
            // Délai ou réseau : modèle suivant, rien n'est marqué.
            tousEn429 = false;
            refus.push(false);
            derniere = new ErreurIA(`Gemini : délai dépassé ou réseau coupé (${modele})`, { fournisseur: 'Gemini' });
            f.erreursModeles.push({ modele, statut: null, message: derniere.message.replace(/^Gemini : /, '') });
            continue;
          }
          if (reponse.ok) {
            f.modeleRepondu = modele;
            return normaliserGemini(JSON.parse(await reponse.text()));
          }
          const texte = await texteDe(reponse);
          const statut = reponse.status;
          if (statut !== 429) tousEn429 = false;
          refus.push(clePasBonne(statut, texte));
          derniere = echecHttp('gemini', reponse, modele, texte, cle, perso);
          f.erreursModeles.push({ modele, statut, message: derniere.message.replace(/^Gemini : /, '').slice(0, 200), ...(sansReflexion ? { sansReflexion: true } : {}) });
          // 400 dû au champ de réflexion : même modèle, sans ce champ, avant de passer au suivant.
          if (statut === 400 && corps.generationConfig.thinkingConfig && !TEXTE_CLE_FAUSSE.test(texte) && !MODELE_INCONNU.test(texte)) {
            sansReflexion = true;
            suite = true;
          } else if (!perso && !impose) {
            if (statut === 429) marquerModeleGemini(modele, 'epuise', QUOTA_PAR_JOUR.test(texte) ? EPUISEMENT_JOUR_MS : EPUISEMENT_MS);
            else if (statut === 404 || (statut === 400 && MODELE_INCONNU.test(texte))) marquerModeleGemini(modele, 'indisponible', INDISPONIBLE_MS);
          }
        }
      }
      if (!derniere) throw new ErreurIA('Gemini : délai dépassé', { fournisseur: 'Gemini' });
      // « Épuisé » : tous les modèles écartés (mémoire du serveur) ; avec une clé personnelle, tous ont répondu 429.
      derniere.epuise = perso ? tousEn429 : estEpuise('gemini');
      // 401, 403 ou « clé invalide » sur chaque essai : la clé est mauvaise.
      if (refus.length && refus.every(Boolean)) derniere.cleRefusee = true;
      derniere.details = f.erreursModeles;
      throw derniere;
    },
  };
  return f;
}

// --- Cerebras, Groq, Mistral (API officielles compatibles OpenAI, cascade de modèles) --------------

// Même mécanique que Gemini : à chaque appel on repart du premier modèle non écarté.
// 429 -> modèle écarté 10 min (3 h si le quota est « par jour »), modèle suivant dans le même appel ;
// 404 ou 400 « modèle inconnu » -> écarté 24 h, modèle suivant ; 5xx ou délai -> modèle suivant sans rien marquer ;
// 401 ou 403 -> la clé est mauvaise pour tous les modèles : famille ignorée 1 h, on s'arrête ;
// 400 autre -> même modèle sans response_format (retenu ensuite). La clé n'apparaît jamais dans une erreur.
function compatOpenAI(env, famille) {
  const spec = COMPAT[famille];
  const candidats = () => spec.modeles.filter((m) => !ecartModeleCompat(famille, m));
  const f = {
    famille,
    get modele() { return f.modeleRepondu || candidats()[0] || spec.modeles[0]; },
    get nom() { return f.modele; },
    erreursModeles: [],
    modeleRepondu: null,
    couple: () => (f.modeleRepondu ? { url: spec.url, modele: f.modeleRepondu } : null),
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs, modele: impose = null }) {
      const cle = env[spec.variable].trim();
      const debut = Date.now();
      const liste = impose ? [impose] : candidats();
      let derniere = null;
      f.erreursModeles = [];
      f.modeleRepondu = null;
      if (!liste.length) {
        throw new ErreurIA(`${spec.nom} : tous les modèles sont écartés (quota épuisé ou modèle indisponible)`, { fournisseur: spec.nom, statut: 429, epuise: true, details: [] });
      }
      modeles: for (const modele of liste) {
        const memoire = famille + '/' + modele;
        // Au plus deux essais par modèle : avec response_format json_object, puis (si le fournisseur répond 400) sans.
        for (let essai = 0; essai < 2; essai++) {
          const reste = Math.min(delaiMs, REGLAGES.delaiIaMs) - (Date.now() - debut);
          if (reste <= 0) break modeles;
          const avecJson = !sansJson.has(memoire);
          const corps = { model: modele, messages, max_tokens: maxTokens, temperature, stream: false };
          if (avecJson) corps.response_format = { type: 'json_object' };
          // Modèles qui raisonnent : réflexion courte, sinon elle mange max_tokens (vérification à 400 jetons).
          if (/gpt-oss/.test(modele)) corps.reasoning_effort = 'low';
          if (/qwen/.test(modele) && famille === 'groq') corps.reasoning_format = 'hidden';
          let reponse;
          try {
            reponse = await fetch(spec.url, {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + cle, 'user-agent': USER_AGENT_V2 },
              body: JSON.stringify(corps),
              signal: AbortSignal.timeout(reste),
            });
          } catch {
            // Délai ou réseau : modèle suivant, rien n'est marqué.
            derniere = new ErreurIA(`${spec.nom} : délai dépassé ou réseau coupé (${modele})`, { fournisseur: spec.nom });
            f.erreursModeles.push({ modele, statut: null, message: derniere.message.replace(/^[^:]+ : /, '') });
            continue modeles;
          }
          if (reponse.ok) {
            f.modeleRepondu = modele;
            ignores.delete(famille);
            const donnees = JSON.parse(await reponse.text());
            const msg = donnees && donnees.choices && donnees.choices[0] && donnees.choices[0].message;
            if (msg && typeof msg.content === 'string') msg.content = msg.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            return donnees;
          }
          const texte = await texteDe(reponse);
          const statut = reponse.status;
          derniere = echecHttp(famille, reponse, modele, texte, cle);
          f.erreursModeles.push({ modele, statut, message: derniere.message.replace(/^[^:]+ : /, '').slice(0, 200), ...(avecJson ? {} : { sansJson: true }) });
          if (clePasBonne(statut, texte)) {
            marquerIgnore(famille);
            throw new ErreurIA(`${spec.nom} : clé refusée (réponse ${statut}). Ignoré pendant 1 heure.`, {
              fournisseur: spec.nom, statut, cleRefusee: true, cleInvalide: true, details: f.erreursModeles,
            });
          }
          if (statut === 429) {
            const normal = famille === 'mistral' ? EPUISEMENT_MISTRAL_MS : EPUISEMENT_MS;
            marquerModeleCompat(famille, modele, 'epuise', QUOTA_PAR_JOUR.test(texte) ? EPUISEMENT_JOUR_MS : normal);
          } else if (statut === 404 || (statut === 400 && MODELE_INCONNU.test(texte))) {
            marquerModeleCompat(famille, modele, 'indisponible', INDISPONIBLE_MS);
          } else if (statut === 400 && avecJson) {
            sansJson.add(memoire);
            continue; // même modèle, sans response_format
          }
          continue modeles;
        }
      }
      if (!derniere) throw new ErreurIA(`${spec.nom} : délai dépassé`, { fournisseur: spec.nom });
      derniere.epuise = estEpuise(famille);
      derniere.details = f.erreursModeles;
      throw derniere;
    },
  };
  return f;
}

// --- Grok (xAI, à défaut Groq : API compatible OpenAI) ------------------------

// La clé « grok_… » peut venir de xAI ou d'un autre service compatible : on essaie les couples dans l'ordre
// (401, 403, 404 ou 400 -> candidat suivant) et on retient celui qui répond.
const GROK_CANDIDATS = [
  [XAI_URL, 'grok-3-mini'], [XAI_URL, 'grok-4-fast'],
  [GROQ_URL, 'llama-3.3-70b-versatile'],
];
let grokRetenu = null;

function grok(env) {
  const impose = typeof env.GROK_MODELE === 'string' && env.GROK_MODELE.trim() ? env.GROK_MODELE.trim() : null;
  const candidats = impose ? [[env.GROK_URL || XAI_URL, impose]] : (grokRetenu ? [grokRetenu] : GROK_CANDIDATS);
  return {
    famille: 'grok',
    modele: candidats[0][1],
    nom: candidats[0][1],
    couple: () => (grokRetenu ? { url: grokRetenu[0], modele: grokRetenu[1] } : null),
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs }) {
      const cle = env.GROK_API_KEY.trim();
      const debut = Date.now();
      let derniere = null;
      let essais = 0;
      let refus401 = 0;
      for (const [url, modele] of candidats) {
        const reste = Math.min(delaiMs, REGLAGES.delaiIaMs) - (Date.now() - debut);
        if (reste <= 0) break;
        const reponse = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + cle, 'user-agent': USER_AGENT_V2 },
          body: JSON.stringify({ model: modele, messages, max_tokens: maxTokens, temperature, stream: false }),
          signal: AbortSignal.timeout(reste),
        });
        if (reponse.ok) { if (!impose) grokRetenu = [url, modele]; ignores.delete('grok'); return JSON.parse(await reponse.text()); }
        derniere = echecHttp('grok', reponse, modele, await texteDe(reponse), cle);
        essais += 1;
        if (reponse.status === 401) refus401 += 1;
        if (![400, 401, 403, 404].includes(reponse.status)) break;
      }
      // 401 sur tous les couples : la clé n'est pas la bonne (ou pas celle de ce service). On le dit clairement et on n'y revient pas avant 1 h.
      if (derniere && essais > 0 && refus401 === essais) {
        marquerIgnore('grok');
        throw new ErreurIA(`Grok : clé invalide (réponse 401 sur ${essais} essai${essais > 1 ? 's' : ''}). Ignoré pendant 1 heure.`, { fournisseur: 'Grok', statut: 401, cleInvalide: true });
      }
      throw derniere || new ErreurIA('Grok : délai dépassé', { fournisseur: 'Grok' });
    },
  };
}

// --- Claude (API Anthropic Messages) : clé personnelle seulement ------------------

// Messages chat -> corps de l'API Messages : « system » à part, le reste en alternance utilisateur / assistant.
export function corpsClaude(messages, { maxTokens, temperature, modele = CLAUDE_MODELE }) {
  const systeme = messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n\n');
  const corps = {
    model: modele,
    max_tokens: Math.min(Math.max(maxTokens * 2, 1024), 6000), // marge : Claude écrit plus long que les autres
    // Pas de « temperature » : refusée (400) par les modèles Claude récents.
    // Sans réflexion : sinon elle mange max_tokens et la réponse reste vide (arrêt max_tokens, 0 caractère).
    thinking: { type: 'disabled' },
    messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
  };
  if (systeme) corps.system = systeme;
  return corps;
}

// Réponse Claude (content[0].text) -> forme chat.completions.
export function normaliserClaude(donnees) {
  const blocs = donnees && Array.isArray(donnees.content) ? donnees.content : [];
  const texte = blocs.filter((b) => b && b.type !== 'thinking' && typeof b.text === 'string').map((b) => b.text).join('');
  return { choices: [{ message: { role: 'assistant', content: texte } }], ...(donnees && donnees.stop_reason ? { arret: donnees.stop_reason } : {}) };
}

// --- Crédit Claude (clé du serveur) : compteurs cumulés dans la table quotas, jour = 'cumul' (jamais remis à zéro par jour) ---
// claude:in et claude:out = jetons depuis la dernière recharge ; claude:charge = crédit chargé en millionièmes de dollar ; claude:epuise = 0 ou 1.
const CREDIT_CLES = ['claude:in', 'claude:out', 'claude:charge', 'claude:epuise'];
export const REFUS_CREDIT = /credit balance/i;
const IGNORE_CREDIT_MS = 5 * 60 * 1000;

export function coutClaude(jetonsEntree, jetonsSortie) {
  return ((Number(jetonsEntree) || 0) * PRIX_CLAUDE_ENTREE + (Number(jetonsSortie) || 0) * PRIX_CLAUDE_SORTIE) / 1e6;
}
const arrondi = (x) => Math.round(x * 10000) / 10000;

// Calcul pur : mêmes chiffres pour le GET admin et les tests.
export function creditDepuis({ entree = 0, sortie = 0, charge = 0, epuise = false }) {
  const depense = coutClaude(entree, sortie);
  const restant = Math.max(0, charge - depense);
  return {
    charge: arrondi(charge), depense: arrondi(depense), restant: arrondi(restant), seuil: SEUIL_CREDIT,
    alerte: restant < SEUIL_CREDIT || !!epuise, epuise: !!epuise,
  };
}

async function lireCredit(env) {
  const { results } = await env.DB.prepare(`SELECT cle, n FROM quotas WHERE cle IN (${CREDIT_CLES.map(() => '?').join(',')})`).bind(...CREDIT_CLES).all();
  const v = {};
  for (const r of results || []) v[r.cle] = r.n || 0;
  return v;
}
export async function etatCredit(env) {
  const v = await lireCredit(env);
  // Sans clé Claude sur le serveur et sans aucun compteur, il n'y a rien à surveiller : pas d'alerte.
  const rien = !cleClaude(env) && CREDIT_CLES.every((c) => !v[c]);
  const r = creditDepuis({ entree: v['claude:in'], sortie: v['claude:out'], charge: (v['claude:charge'] || 0) / 1e6, epuise: !!v['claude:epuise'] });
  return rien ? { ...r, alerte: false } : r;
}
const ajouter = (env, cle, n) => env.DB.prepare(
  "INSERT INTO quotas (cle, n, jour) VALUES (?, ?, 'cumul') ON CONFLICT(cle) DO UPDATE SET n = quotas.n + excluded.n",
).bind(cle, n);
const fixer = (env, cle, n) => env.DB.prepare(
  "INSERT INTO quotas (cle, n, jour) VALUES (?, ?, 'cumul') ON CONFLICT(cle) DO UPDATE SET n = excluded.n, jour = 'cumul'",
).bind(cle, n);
// Ne casse jamais un appel d'IA : un échec d'écriture est ignoré.
export async function noterUsageClaude(env, usage) {
  if (!env || !env.DB || !usage) return;
  const entree = Math.max(0, Math.floor(Number(usage.input_tokens) || 0));
  const sortie = Math.max(0, Math.floor(Number(usage.output_tokens) || 0));
  if (!entree && !sortie) return;
  try { await env.DB.batch([ajouter(env, 'claude:in', entree), ajouter(env, 'claude:out', sortie)]); } catch (e) { /* compteur seulement */ }
}
// Recharge : crédit chargé = montant (dollars), dépense remise à zéro, Claude de nouveau admis.
export async function chargerCredit(env, montant) {
  await env.DB.batch([
    fixer(env, 'claude:in', 0), fixer(env, 'claude:out', 0), fixer(env, 'claude:charge', Math.round(montant * 1e6)), fixer(env, 'claude:epuise', 0),
  ]);
  oublierIgnore('claude');
  return etatCredit(env);
}
async function creditEpuise(env) {
  try { return !!(await env.DB.prepare("SELECT n FROM quotas WHERE cle = 'claude:epuise'").first('n')); } catch (e) { return false; }
}
async function marquerCreditEpuise(env) {
  try { await env.DB.batch([fixer(env, 'claude:epuise', 1)]); } catch (e) { /* mémoire seulement */ }
  marquerIgnore('claude', IGNORE_CREDIT_MS);
}

function claude(cle, { perso = true, espace = null, env = null } = {}) {
  return {
    famille: 'claude',
    modele: CLAUDE_MODELE,
    nom: CLAUDE_MODELE,
    couple: () => null,
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs }) {
      const suivi = !perso && env && env.DB; // le crédit suivi est celui de la clé du serveur
      if (suivi && await creditEpuise(env)) {
        marquerIgnore('claude', IGNORE_CREDIT_MS); // sans bruit : les autres IA prennent le relais
        throw new ErreurIA('Claude : crédit épuisé', { fournisseur: 'Claude', statut: 400 });
      }
      const reponse = await fetch(CLAUDE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json', accept: 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01', 'user-agent': USER_AGENT_V2,
          // Clés liées à une personne (sk-ant-usr-…) : l'espace de travail doit être nommé (secret CLAUDE_WORKSPACE_ID).
          ...(espace ? { 'anthropic-workspace-id': espace } : {}),
        },
        body: JSON.stringify(corpsClaude(messages, { maxTokens, temperature })),
        signal: AbortSignal.timeout(Math.min(delaiMs, REGLAGES.delaiIaMs)),
      });
      if (reponse.ok) {
        const donnees = JSON.parse(await reponse.text());
        if (suivi) await noterUsageClaude(env, donnees && donnees.usage);
        return normaliserClaude(donnees);
      }
      const texteErreur = await texteDe(reponse);
      if (suivi && reponse.status === 400 && REFUS_CREDIT.test(texteErreur)) await marquerCreditEpuise(env);
      const e = echecHttp('claude', reponse, CLAUDE_MODELE, texteErreur, cle, perso);
      if (clePasBonne(reponse.status, '')) {
        e.cleRefusee = true;
        // Clé du serveur refusée : Claude est ignoré 1 heure (comme Grok), les autres prennent le relais.
        if (!perso) { marquerIgnore('claude'); e.cleInvalide = true; }
      }
      throw e;
    },
  };
}

// --- Workers AI ------------------------------------------------------------

// Quota gratuit quotidien dépassé : « 4006 : you have used up your daily free allocation of 10,000 neurons ».
const QUOTA_WORKERS = /4006|daily free allocation|used up your daily/i;

function workersAI(env, modele) {
  return {
    famille: 'workers-ai',
    modele,
    nom: nomCourt(modele),
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs }) {
      let minuterie;
      const delai = new Promise((resolu, rejete) => {
        minuterie = setTimeout(() => rejete(new Error('Workers AI : délai dépassé')), Math.min(delaiMs, REGLAGES.delaiIaMs));
      });
      const appel = Promise.resolve().then(() => env.AI.run(modele, { messages, max_tokens: maxTokens, temperature }));
      appel.catch(() => {}); // si le délai gagne, l'échec tardif ne doit pas remonter
      try {
        return await Promise.race([appel, delai]);
      } catch (e) {
        if (e && !(e instanceof ErreurIA) && QUOTA_WORKERS.test(String(e.message || e))) {
          marquerEpuise('workers-ai');
          throw new ErreurIA('Workers AI : quota gratuit épuisé (' + String(e.message || e).slice(0, 120) + ')', { fournisseur: 'Workers AI', epuise: true });
        }
        throw e;
      } finally {
        clearTimeout(minuterie);
      }
    },
  };
}

// --- Choix selon les secrets présents --------------------------------------

// Fournisseur de la clé personnelle de la requête (env.clePerso), ou null. Même code que les clés du serveur, mais la clé vient de la
// requête ; aucune mémoire partagée (modèle retenu, épuisement). Le secret n'est pas énumérable (jamais copié ni affiché par erreur).
export function fournisseurPerso(env) {
  const p = env && env.clePerso;
  if (!p || typeof p.cle !== 'string' || !p.cle) return null;
  let f = null;
  if (p.fournisseur === 'gemini') f = gemini({ GEMINI_API_KEY: p.cle }, { perso: true });
  else if (p.fournisseur === 'glm') f = glm({ GLM_API_KEY: p.cle }, { perso: true });
  else if (p.fournisseur === 'claude') f = claude(p.cle);
  if (f) Object.defineProperty(f, 'secret', { value: p.cle, enumerable: false });
  return f;
}

// Fournisseurs externes du serveur dont la clé existe, dans l'ordre de rédaction : claude, gemini, cerebras, groq, mistral, glm, grok.
function externesServeur(env) {
  const liste = [];
  if (cleClaude(env)) liste.push(claude(env.CLAUDE_API_KEY.trim(), { perso: false, env, espace: (env.CLAUDE_WORKSPACE_ID || '').trim() || null }));
  if (cleGemini(env)) liste.push(gemini(env));
  if (cleCerebras(env)) liste.push(compatOpenAI(env, 'cerebras'));
  if (cleGroq(env)) liste.push(compatOpenAI(env, 'groq'));
  if (cleMistral(env)) liste.push(compatOpenAI(env, 'mistral'));
  if (cleGLM(env)) liste.push(glm(env));
  if (cleGrok(env)) liste.push(grok(env));
  return liste;
}

// Tous les fournisseurs configurés (diagnostic), dans l'ordre de rédaction : claude, gemini, cerebras, groq, mistral, glm, grok, puis les deux de Workers AI.
export function tousLesFournisseurs(env, { complet = false } = {}) {
  return [...externesServeur(env), workersAI(env, LLAMA), workersAI(env, MISTRAL)];
}

// Écarte les fournisseurs épuisés (mémoire de 10 minutes), sauf si plus aucun ne reste : mieux vaut réessayer que d'abandonner.
function sansEpuises(liste) {
  const bons = liste.filter((f) => !estEpuise(f.famille));
  return bons.length ? bons : liste;
}
const sansIgnores = (liste) => liste.filter((f) => !estIgnore(f.famille));

// Vrai quand tous les fournisseurs du serveur (clés présentes, Workers AI) sont épuisés ou ignorés : la génération de nuit ne consomme rien.
export function tousEpuises(env) {
  const familles = externesServeur(env).map((f) => f.famille);
  if (env && env.AI) familles.push('workers-ai');
  return familles.every((f) => estEpuise(f) || estIgnore(f));
}

// Chaîne du serveur seule (sans clé personnelle).
function redacteursServeur(env) {
  const externes = externesServeur(env);
  const liste = externes.length ? [...externes, workersAI(env, LLAMA)] : [workersAI(env, LLAMA), workersAI(env, MISTRAL)];
  const actifs = sansIgnores(liste);
  return sansEpuises(actifs.length ? actifs : liste);
}

// Rédaction, dans l'ordre d'essai : la clé personnelle s'il y en a une, puis Gemini, Cerebras, Groq, Mistral, GLM, Grok, Llama (les
// fournisseurs sans clé sont ignorés ; un fournisseur dont la clé est refusée l'est aussi pendant 1 h). Sans aucune clé externe : Llama, repli Mistral (Workers AI).
export function redacteurs(env) {
  const perso = fournisseurPerso(env);
  const serveur = redacteursServeur(env);
  return perso ? [perso, ...serveur] : serveur;
}

// Vérification : toujours une IA d'une autre famille que celle qui a rédigé, dans l'ordre Gemini, Cerebras, Groq, Mistral (API), GLM, Grok,
// puis Workers AI (Mistral, Llama). Les deux modèles de Workers AI forment une même famille ('workers-ai', distincte de la famille
// 'mistral' de l'API) : Mistral peut vérifier Llama (et inversement) en dernier recours.
// Avec une clé personnelle, ce sont d'abord les clés du serveur ; si aucune autre famille n'est disponible (épuisée, ignorée ou absente),
// la liste est vide et la leçon sera publiée avec le badge « Une seule IA ».
export function verificateurs(env, redacteur) {
  const ordre = [];
  if (cleGemini(env)) ordre.push(gemini(env));
  if (cleCerebras(env)) ordre.push(compatOpenAI(env, 'cerebras'));
  if (cleGroq(env)) ordre.push(compatOpenAI(env, 'groq'));
  if (cleMistral(env)) ordre.push(compatOpenAI(env, 'mistral'));
  if (cleGLM(env)) ordre.push(glm(env));
  if (cleGrok(env)) ordre.push(grok(env));
  const perso = !!(env && env.clePerso);
  if (!perso || env.AI) ordre.push(workersAI(env, MISTRAL), workersAI(env, LLAMA));
  const autres = sansIgnores(ordre).filter((f) => (f.famille === 'workers-ai' && redacteur.famille === 'workers-ai'
    ? f.modele !== redacteur.modele : f.famille !== redacteur.famille));
  // Clé personnelle : on ne retombe pas sur un fournisseur épuisé (mieux vaut le badge « Une seule IA » que de tout perdre).
  return perso ? autres.filter((f) => !estEpuise(f.famille)) : sansEpuises(autres);
}
