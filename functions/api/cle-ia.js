// POST /api/cle-ia : essaie la clé IA personnelle (en-tête x-cle-ia: <fournisseur>:<clé>) avec un appel minuscule.
// Réponse : {ok: true, fournisseur} ou une erreur française (« Ta clé est refusée par Gemini. »). Connexion requise, 30 essais par jour.
// La clé n'est ni enregistrée, ni journalisée, ni renvoyée.
import {
  ErreurHttp, auth, enveloppe, envAvecCle, exigerBase, json, quota,
} from '../../lib/api.js';
import { fournisseurPerso } from '../../lib/fournisseurs.js';

export const onRequestPost = enveloppe(async ({ request, env: envServeur }) => {
  await exigerBase(envServeur);
  const env = envAvecCle(request, envServeur);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const f = fournisseurPerso(env);
  if (!f) throw new ErreurHttp(400, 'Colle d’abord ta clé IA.');
  if (!(await quota(env, 'cle-ia:joueur:' + joueur.id, 30))) throw new ErreurHttp(429, 'Tu as déjà testé ta clé 30 fois aujourd’hui. Reviens demain.');
  try {
    await f.appeler([{ role: 'user', content: 'Réponds uniquement par ce JSON : {"ok":true}' }], { maxTokens: 20, temperature: 0, delaiMs: 20000 });
  } catch (e) {
    const nom = (e && e.fournisseur) || 'le fournisseur';
    if (e && e.cleRefusee) throw new ErreurHttp(403, `Ta clé est refusée par ${nom}.`);
    if (e && e.epuise) throw new ErreurHttp(429, `Ta clé a atteint sa limite chez ${nom}. Réessaie plus tard.`);
    throw new ErreurHttp(502, `Impossible de joindre ${nom} pour l’instant. Réessaie dans un moment.`);
  }
  return json({ ok: true, fournisseur: f.famille });
});
