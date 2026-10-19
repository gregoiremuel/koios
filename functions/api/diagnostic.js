// GET /api/diagnostic?cle=<DIAG_KEY> : essaie chaque IA configurée (gemini, cerebras, groq, mistral, glm, grok, llama, mistral de Workers AI)
// avec une question minuscule et rapporte l'état (durée, extrait court). Pour tous sauf Workers AI, `couple` = (url, modèle) qui a répondu.
// `geminiCle`, `cerebrasCle`, `groqCle`, `mistralCle`, `glmCle`, `grokCle` : présence de chaque clé (jamais sa valeur).
// Pour Gemini, Cerebras, Groq et Mistral, `erreursModeles` donne l'erreur (code et message court) de CHAQUE modèle candidat essayé ; pour Grok, l'état « cle-invalide »
// (401 sur tous les couples) vaut un fournisseur ignoré pendant 1 heure.
// `modelesGemini` et `modelesCompat` (cerebras, groq, mistral) : l'état de chaque modèle de la cascade (ok, epuise jusqu'à tel instant,
// indisponible) ; les modèles écartés ne sont pas appelés. Un fournisseur dont la clé est refusée (401, 403) est « cle-invalide », ignoré 1 heure.
// Protégé par le secret DIAG_KEY (aucune clé n'est affichée, ni dans les adresses, ni dans les erreurs).
import { ErreurHttp, enveloppe, json, secretsEgaux } from '../../lib/api.js';
import {
  LLAMA, MISTRAL, cleCerebras, cleGLM, cleGemini, cleGrok, cleGroq, cleMistral, etatModelesCompat, etatModelesGemini, nomsEpuises, nomsIgnores,
  tousLesFournisseurs,
} from '../../lib/fournisseurs.js';

async function essai(f, secrets) {
  const debut = Date.now();
  const sansCle = (t) => secrets.reduce((acc, c) => (c ? acc.split(c).join('***') : acc), String(t));
  const sortie = { nom: f.nom, famille: f.famille };
  try {
    const reponse = await f.appeler(
      [{ role: 'user', content: 'Réponds uniquement par ce JSON : {"ok":true,"mot":"bonjour"}' }],
      { maxTokens: 40, temperature: 0, delaiMs: 30000 },
    );
    Object.assign(sortie, { etat: 'ok', ms: Date.now() - debut, extrait: sansCle(JSON.stringify(reponse)).slice(0, 300) });
  } catch (e) {
    Object.assign(sortie, {
      etat: e && e.cleInvalide ? 'cle-invalide' : 'echec', ms: Date.now() - debut, erreur: sansCle((e && e.message) || e).slice(0, 200),
      ...(e && e.epuise ? { quota: 'épuisé' } : {}),
    });
  }
  // Gemini : pourquoi chaque modèle candidat a été écarté (même quand un modèle suivant a répondu).
  if (Array.isArray(f.erreursModeles) && f.erreursModeles.length) {
    sortie.erreursModeles = f.erreursModeles.map((x) => ({
      modele: x.modele, code: x.statut, message: sansCle(x.message).slice(0, 160), ...(x.sansReflexion ? { sansReflexion: true } : {}), ...(x.sansJson ? { sansJson: true } : {}),
    }));
  }
  if (typeof f.couple === 'function' && f.couple()) sortie.couple = f.couple();
  return sortie;
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  // Clé par l'en-tête x-diag-cle (préféré) ou par l'adresse (conservé pour l'instant) ; comparaison à temps constant.
  const cle = request.headers.get('x-diag-cle') || new URL(request.url).searchParams.get('cle') || '';
  if (!(await secretsEgaux(cle, env.DIAG_KEY))) throw new ErreurHttp(404, 'Introuvable.');
  const secrets = [env.GEMINI_API_KEY, env.CEREBRAS_API_KEY, env.GROQ_API_KEY, env.MISTRAL_API_KEY, env.GLM_API_KEY, env.GROK_API_KEY].map((c) => (typeof c === 'string' ? c.trim() : ''));
  const resultats = [];
  for (const f of tousLesFournisseurs(env, { complet: true })) resultats.push(await essai(f, secrets));
  return json({
    geminiCle: cleGemini(env),
    cerebrasCle: cleCerebras(env),
    groqCle: cleGroq(env),
    mistralCle: cleMistral(env),
    glmCle: cleGLM(env),
    grokCle: cleGrok(env),
    ai: !!env.AI,
    unsplash: !!env.UNSPLASH_KEY,
    modeles: [LLAMA, MISTRAL],
    epuisesAvant: nomsEpuises(),
    ignores: nomsIgnores(),
    modelesGemini: etatModelesGemini(),
    modelesCompat: etatModelesCompat(),
    resultats,
  });
});
