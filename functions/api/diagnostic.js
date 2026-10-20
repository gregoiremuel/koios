// GET /api/diagnostic?cle=<DIAG_KEY> : essaie chaque IA configurée (claude, gemini, cerebras, groq, mistral, glm, grok, llama, mistral de Workers AI)
// avec une question minuscule et rapporte l'état (durée, extrait court). Pour tous sauf Workers AI, `couple` = (url, modèle) qui a répondu.
// `claudeCle`, `geminiCle`, `cerebrasCle`, `groqCle`, `mistralCle`, `glmCle`, `grokCle` : présence de chaque clé (jamais sa valeur).
// Pour Gemini, Cerebras, Groq et Mistral, `erreursModeles` donne l'erreur (code et message court) de CHAQUE modèle candidat essayé ; pour Grok, l'état « cle-invalide »
// (401 sur tous les couples) vaut un fournisseur ignoré pendant 1 heure.
// `modelesGemini` et `modelesCompat` (cerebras, groq, mistral) : l'état de chaque modèle de la cascade (ok, epuise jusqu'à tel instant,
// indisponible) ; les modèles écartés ne sont pas appelés. Un fournisseur dont la clé est refusée (401, 403) est « cle-invalide », ignoré 1 heure.
// Protégé par le secret DIAG_KEY (aucune clé n'est affichée, ni dans les adresses, ni dans les erreurs).
import { ErreurHttp, enveloppe, json, secretsEgaux } from '../../lib/api.js';
import { extraireObjet } from '../../lib/libre.js';
import {
  MAX_TOKENS_VERIF, PROMPT_VERIFICATION, aplatir, messageVerification, textesDe, validerVerdicts,
} from '../../lib/paliers.js';
import { pagesAncrees } from '../../lib/sources.js';
import {
  LLAMA, MISTRAL, cleCerebras, cleClaude, cleGLM, cleGemini, cleGrok, cleGroq, cleMistral, etatModelesCompat, etatModelesGemini, nomsEpuises, nomsIgnores,
  tousLesFournisseurs, verificateurs,
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
  const secrets = [env.CLAUDE_API_KEY, env.GEMINI_API_KEY, env.CEREBRAS_API_KEY, env.GROQ_API_KEY, env.MISTRAL_API_KEY, env.GLM_API_KEY, env.GROK_API_KEY].map((c) => (typeof c === 'string' ? c.trim() : ''));
  // ?verif=1 : essai réel de la vérification (le même prompt et la même validation que pour une leçon) sur chaque vérificateur d'un rédacteur Claude.
  if (new URL(request.url).searchParams.get('verif') === '1') {
    const pages = [{ langue: 'fr', titre: 'Gemmologie', texte: 'La gemmologie est la science qui étudie les gemmes. Le diamant est du carbone cristallisé. Le rubis et le saphir sont des variétés de corindon. L\u2019émeraude est une variété de béryl.' }];
    let textes = ['La gemmologie étudie les gemmes.', 'Le diamant est du carbone cristallisé.', 'Le rubis est une variété de béryl.', 'Le saphir est une variété de corindon.', 'Toutes les pierres précieuses se jugent selon les 4 C.'];
    // ?verif=1&reel=N : taille réelle (extraits Wikipédia et affirmations de la leçon N de la formation gemmologie-et-joaillerie).
    const reel = Number(new URL(request.url).searchParams.get('reel'));
    if (Number.isInteger(reel) && reel > 0) {
      const ligne = await env.DB.prepare('SELECT contenu FROM paliers WHERE parcours = ? AND numero = ?').bind('gemmologie-et-joaillerie', reel).first();
      if (ligne) {
        try { textes = textesDe(aplatir(JSON.parse(ligne.contenu))); } catch { /* garde l'exemple */ }
        try { const p = await pagesAncrees(env, 'Gemmologie'); if (Array.isArray(p) && p.length) pages.splice(0, pages.length, ...p); } catch { /* garde l'exemple */ }
      }
    }
    const demande = [{ role: 'system', content: PROMPT_VERIFICATION }, { role: 'user', content: messageVerification(pages, textes) }];
    const sorties = [];
    const gem = new URL(request.url).searchParams.get('gem');
    const envV = gem && /^[a-z0-9.-]{3,40}$/.test(gem) ? { ...env, GEMINI_MODELE: gem } : env;
    for (const f of verificateurs(envV, { famille: 'claude', modele: 'claude-haiku-5-5' }).filter((x) => !gem || x.famille === 'gemini')) {
      const debut = Date.now();
      const brut = { nom: f.nom, famille: f.famille };
      try {
        const rep = await f.appeler(demande, { maxTokens: MAX_TOKENS_VERIF, temperature: 0, delaiMs: 30000 });
        const obj = extraireObjet(rep);
        const val = obj ? validerVerdicts(obj, textes.length) : null;
        Object.assign(brut, { etat: val && val.valeur !== undefined ? 'ok' : 'illisible', ms: Date.now() - debut, taille: JSON.stringify(demande).length, nbTextes: textes.length, verdicts: val && val.valeur, raison: val && val.raison, extrait: JSON.stringify(rep).slice(0, 400) });
      } catch (e) {
        Object.assign(brut, { etat: 'echec', ms: Date.now() - debut, erreur: String((e && e.message) || e).slice(0, 200) });
      }
      sorties.push(brut);
    }
    return json({ verification: sorties });
  }
  const resultats = [];
  for (const f of tousLesFournisseurs(env, { complet: true })) resultats.push(await essai(f, secrets));
  return json({
    claudeCle: cleClaude(env),
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
