// Fournisseurs d'IA de l'API v2 : GLM (API compatible OpenAI) et Workers AI.
// Un fournisseur = { famille, nom, modele, appeler(messages, { maxTokens, temperature, delaiMs }) }.
// `appeler` renvoie la sortie brute ; lib/libre.js (extraireObjet) en tire l'objet JSON.
// Un appel ne dépasse jamais REGLAGES.delaiIaMs (60 s). Aucun secret dans le code : la clé GLM vient de env.GLM_API_KEY.

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
  delaiProgrammeMs: 40000, // appel qui écrit le programme d'ensemble (4 niveaux, jusqu'à 32 modules)
  reserveVerifMs: 12000, // temps gardé pour la vérification pendant la rédaction
  resteMinTourMs: 45000, // temps restant minimal pour tenter une nouvelle rédaction
};

// « @cf/meta/llama-3.3-70b-instruct-fp8-fast » -> « llama-3.3-70b-instruct-fp8-fast ».
export function nomCourt(modele) {
  return modele.replace(/^@cf\/[^/]+\//, '');
}

export function cleGLM(env) {
  return !!(env && typeof env.GLM_API_KEY === 'string' && env.GLM_API_KEY.trim());
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
        derniere = new Error('GLM : réponse ' + reponse.status + ' (' + modele + ')');
        // Clé ou modèle refusés par cette adresse : on essaie le couple suivant ; sinon (surcharge, panne) on s'arrête.
        if (![400, 401, 403, 404].includes(reponse.status)) break;
      }
      throw derniere || new Error('GLM : délai dépassé');
    },
  };
}

// --- Workers AI ------------------------------------------------------------

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
      } finally {
        clearTimeout(minuterie);
      }
    },
  };
}

// --- Choix selon les secrets présents --------------------------------------

// Rédaction, dans l'ordre d'essai : GLM si la clé existe (repli Llama) ; sinon Llama (repli Mistral).
export function redacteurs(env) {
  if (cleGLM(env)) return [glm(env), workersAI(env, LLAMA)];
  return [workersAI(env, LLAMA), workersAI(env, MISTRAL)];
}

// Vérification : toujours une IA d'un autre fournisseur (ou à défaut d'un autre modèle) que celle qui a rédigé.
//  - GLM a rédigé : Mistral (Workers AI), repli Llama ;
//  - Workers AI a rédigé et la clé GLM existe : GLM, repli sur l'autre modèle de Workers AI ;
//  - sinon : Mistral vérifie Llama (et Llama vérifie Mistral).
export function verificateurs(env, redacteur) {
  if (redacteur.famille === 'glm') return [workersAI(env, MISTRAL), workersAI(env, LLAMA)];
  const autre = workersAI(env, redacteur.modele === LLAMA ? MISTRAL : LLAMA);
  return cleGLM(env) ? [glm(env), autre] : [autre];
}
