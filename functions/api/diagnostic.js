// GET /api/diagnostic?cle=<DIAG_KEY> : essaie chaque IA avec une question minuscule et rapporte l'état (durée, extrait court).
// Protégé par le secret DIAG_KEY (aucune clé n'est affichée). Sert à trouver pourquoi une génération échoue.
import { ErreurHttp, enveloppe, json } from '../../lib/api.js';
import { LLAMA, MISTRAL, cleGLM, redacteurs } from '../../lib/fournisseurs.js';

async function essai(nom, f) {
  const debut = Date.now();
  try {
    const sortie = await f.appeler(
      [{ role: 'user', content: 'Réponds uniquement par ce JSON : {"ok":true,"mot":"bonjour"}' }],
      { maxTokens: 40, temperature: 0, delaiMs: 30000 },
    );
    const texte = JSON.stringify(sortie).slice(0, 300);
    return { nom, etat: 'ok', ms: Date.now() - debut, extrait: texte };
  } catch (e) {
    return { nom, etat: 'echec', ms: Date.now() - debut, erreur: String((e && e.message) || e).slice(0, 200) };
  }
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  const cle = new URL(request.url).searchParams.get('cle') || '';
  if (!env.DIAG_KEY || cle !== env.DIAG_KEY) throw new ErreurHttp(404, 'Introuvable.');
  const fournisseurs = redacteurs(env);
  const liste = [];
  for (const f of fournisseurs) liste.push(f);
  // Workers AI : les deux modèles, même si GLM rédige (c'est eux qui vérifient).
  const dejaVus = new Set(liste.map((f) => f.modele));
  for (const f of redacteurs({ AI: env.AI })) if (!dejaVus.has(f.modele)) liste.push(f);
  const resultats = [];
  for (const f of liste) resultats.push(await essai(f.nom, f));
  return json({
    glmCle: cleGLM(env), ai: !!env.AI, unsplash: !!env.UNSPLASH_KEY, modeles: [LLAMA, MISTRAL], resultats,
  });
});
