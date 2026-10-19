// Fournisseurs d'IA de l'API v2 : Gemini, GLM et Grok (API compatibles OpenAI pour GLM et Grok), Workers AI.
// Un fournisseur = { famille, nom, modele, appeler(messages, { maxTokens, temperature, delaiMs }) }.
// `appeler` renvoie la sortie brute ; lib/libre.js (extraireObjet) en tire l'objet JSON.
// Un appel ne dépasse jamais REGLAGES.delaiIaMs (60 s). Aucun secret dans le code : les clés viennent de env.GEMINI_API_KEY, env.GLM_API_KEY et env.GROK_API_KEY.
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

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
export const GEMINI_MODELES = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
export const XAI_URL = 'https://api.x.ai/v1/chat/completions';
export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// --- Échecs, quota épuisé -------------------------------------------------------

// Erreur d'un fournisseur : `fournisseur` = nom à afficher (GLM, Gemini, Grok, Workers AI), `statut` = code HTTP s'il y en a,
// `epuise` = quota gratuit épuisé (429, ou « 4006 » de Workers AI).
export class ErreurIA extends Error {
  constructor(message, { fournisseur, statut = null, epuise = false } = {}) {
    super(message);
    this.name = 'ErreurIA';
    this.fournisseur = fournisseur;
    this.statut = statut;
    this.epuise = epuise;
  }
}

// Un fournisseur épuisé n'est plus essayé pendant 10 minutes (vie de l'isolat) : on ne perd plus de temps à chaque leçon.
export const EPUISEMENT_MS = 10 * 60 * 1000;
const NOMS = { gemini: 'Gemini', glm: 'GLM', grok: 'Grok', 'workers-ai': 'Workers AI' };
const epuises = new Map(); // famille -> instant de reprise

export function marquerEpuise(famille) {
  epuises.set(famille, Date.now() + EPUISEMENT_MS);
}
export function estEpuise(famille) {
  const fin = epuises.get(famille);
  if (fin === undefined) return false;
  if (Date.now() >= fin) { epuises.delete(famille); return false; }
  return true;
}
// Noms des fournisseurs actuellement mis de côté.
export function nomsEpuises() {
  return [...epuises.keys()].filter(estEpuise).map((f) => NOMS[f] || f);
}
// Remet à zéro la mémoire des épuisements et des couples retenus (tests).
export function oublierEpuisements() {
  epuises.clear();
  glmRetenu = null;
  geminiRetenu = null;
  grokRetenu = null;
}

// Échec HTTP d'un fournisseur : message sans clé ni texte étranger, 429 = quota épuisé (et mémorisé).
function echecHttp(famille, reponse, modele, corps, cle) {
  const statut = reponse.status;
  let detail = String(corps || '').replace(/\s+/g, ' ').slice(0, 150);
  if (cle) detail = detail.split(cle).join('***');
  const epuise = statut === 429;
  if (epuise) marquerEpuise(famille);
  return new ErreurIA(`${NOMS[famille]} : réponse ${statut} (${modele})${detail ? ' ' + detail : ''}`, { fournisseur: NOMS[famille], statut, epuise });
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

function glm(env) {
  const impose = typeof env.GLM_MODELE === 'string' && env.GLM_MODELE.trim() ? env.GLM_MODELE.trim() : null;
  const candidats = impose ? [[env.GLM_URL || GLM_URL, impose]] : (glmRetenu ? [glmRetenu] : GLM_CANDIDATS);
  const premier = candidats[0][1];
  return {
    famille: 'glm',
    modele: premier,
    nom: premier,
    couple: () => (glmRetenu ? { url: glmRetenu[0], modele: glmRetenu[1] } : null),
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs }) {
      const debut = Date.now();
      let derniere = null;
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
        if (reponse.ok) { if (!impose) glmRetenu = [url, modele]; return JSON.parse(await reponse.text()); }
        derniere = echecHttp('glm', reponse, modele, await texteDe(reponse), env.GLM_API_KEY.trim());
        // Clé ou modèle refusés par cette adresse : on essaie le couple suivant ; sinon (surcharge, panne) on s'arrête.
        if (![400, 401, 403, 404].includes(reponse.status)) break;
      }
      throw derniere || new ErreurIA('GLM : délai dépassé', { fournisseur: 'GLM' });
    },
  };
}

// --- Gemini (Google AI Studio) -----------------------------------------------

let geminiRetenu = null;

// Messages chat -> corps generateContent : « system » devient systemInstruction, « assistant » devient « model ».
export function corpsGemini(messages, { maxTokens, temperature, modele }) {
  const systeme = messages.filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n\n');
  const contents = messages.filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
  const generationConfig = { maxOutputTokens: maxTokens, temperature, responseMimeType: 'application/json' };
  // Réflexion désactivée (vitesse) là où le modèle l'accepte : la série 2.5 flash.
  if (/gemini-2\.5-flash/.test(modele)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
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

function gemini(env) {
  const impose = typeof env.GEMINI_MODELE === 'string' && env.GEMINI_MODELE.trim() ? env.GEMINI_MODELE.trim() : null;
  const candidats = impose ? [impose] : (geminiRetenu ? [geminiRetenu] : GEMINI_MODELES);
  return {
    famille: 'gemini',
    modele: candidats[0],
    nom: candidats[0],
    couple: () => (geminiRetenu ? { url: GEMINI_BASE + geminiRetenu + ':generateContent', modele: geminiRetenu } : null),
    async appeler(messages, { maxTokens, temperature = 0.3, delaiMs = REGLAGES.delaiIaMs }) {
      const cle = env.GEMINI_API_KEY.trim();
      const debut = Date.now();
      let derniere = null;
      let tousEpuises = true;
      for (const modele of candidats) {
        const reste = Math.min(delaiMs, REGLAGES.delaiIaMs) - (Date.now() - debut);
        if (reste <= 0) break;
        const reponse = await fetch(GEMINI_BASE + modele + ':generateContent', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', 'x-goog-api-key': cle, 'user-agent': USER_AGENT_V2 },
          body: JSON.stringify(corpsGemini(messages, { maxTokens, temperature, modele })),
          signal: AbortSignal.timeout(reste),
        });
        if (reponse.ok) {
          if (!impose) geminiRetenu = modele;
          epuises.delete('gemini'); // un modèle de repli a répondu
          return normaliserGemini(JSON.parse(await reponse.text()));
        }
        if (reponse.status !== 429) tousEpuises = false;
        derniere = echecHttp('gemini', reponse, modele, await texteDe(reponse), cle);
        // Quota d'un modèle (429), modèle inconnu ou refusé : le modèle suivant a son propre quota ; une panne (5xx) arrête.
        if (![400, 403, 404, 429].includes(reponse.status)) { tousEpuises = false; break; }
      }
      if (!derniere) throw new ErreurIA('Gemini : délai dépassé', { fournisseur: 'Gemini' });
      if (derniere.statut === 429 && !tousEpuises) derniere.epuise = false;
      if (!derniere.epuise) epuises.delete('gemini');
      throw derniere;
    },
  };
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
      for (const [url, modele] of candidats) {
        const reste = Math.min(delaiMs, REGLAGES.delaiIaMs) - (Date.now() - debut);
        if (reste <= 0) break;
        const reponse = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer ' + cle, 'user-agent': USER_AGENT_V2 },
          body: JSON.stringify({ model: modele, messages, max_tokens: maxTokens, temperature, stream: false }),
          signal: AbortSignal.timeout(reste),
        });
        if (reponse.ok) { if (!impose) grokRetenu = [url, modele]; return JSON.parse(await reponse.text()); }
        derniere = echecHttp('grok', reponse, modele, await texteDe(reponse), cle);
        if (![400, 401, 403, 404].includes(reponse.status)) break;
      }
      throw derniere || new ErreurIA('Grok : délai dépassé', { fournisseur: 'Grok' });
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

// Tous les fournisseurs configurés (diagnostic) : gemini, glm, grok, llama, mistral.
export function tousLesFournisseurs(env) {
  const liste = [];
  if (cleGemini(env)) liste.push(gemini(env));
  if (cleGLM(env)) liste.push(glm(env));
  if (cleGrok(env)) liste.push(grok(env));
  liste.push(workersAI(env, LLAMA), workersAI(env, MISTRAL));
  return liste;
}

// Écarte les fournisseurs épuisés (mémoire de 10 minutes), sauf si plus aucun ne reste : mieux vaut réessayer que d'abandonner.
function sansEpuises(liste) {
  const bons = liste.filter((f) => !estEpuise(f.famille));
  return bons.length ? bons : liste;
}

// Rédaction, dans l'ordre d'essai : Gemini, GLM, Grok, Llama (les fournisseurs sans clé sont ignorés).
// Sans aucune clé externe : Llama, repli Mistral (Workers AI).
export function redacteurs(env) {
  const externes = [];
  if (cleGemini(env)) externes.push(gemini(env));
  if (cleGLM(env)) externes.push(glm(env));
  if (cleGrok(env)) externes.push(grok(env));
  const liste = externes.length ? [...externes, workersAI(env, LLAMA)] : [workersAI(env, LLAMA), workersAI(env, MISTRAL)];
  return sansEpuises(liste);
}

// Vérification : toujours une IA d'une autre famille que celle qui a rédigé, dans l'ordre Grok, Gemini, GLM, Mistral, Llama.
// Les deux modèles de Workers AI forment une même famille : Mistral peut vérifier Llama (et inversement) en dernier recours.
export function verificateurs(env, redacteur) {
  const ordre = [];
  if (cleGrok(env)) ordre.push(grok(env));
  if (cleGemini(env)) ordre.push(gemini(env));
  if (cleGLM(env)) ordre.push(glm(env));
  ordre.push(workersAI(env, MISTRAL), workersAI(env, LLAMA));
  const autres = ordre.filter((f) => (f.famille === 'workers-ai' && redacteur.famille === 'workers-ai'
    ? f.modele !== redacteur.modele : f.famille !== redacteur.famille));
  return sansEpuises(autres);
}
