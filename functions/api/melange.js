// GET /api/melange?n=10&graine=<entier> : des questions tirées des chapitres IA en cache.
// Public. Déterministe : même graine, même tirage (tant que le cache ne change pas).
import { ErreurHttp, enveloppe, exigerBase, json } from '../../lib/api.js';
import { POOL_MAX, chargerQuestions, tirer } from '../../lib/questions.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const p = new URL(request.url).searchParams;

  const brutN = p.get('n');
  const n = brutN === null ? 10 : /^\d{1,2}$/.test(brutN) ? Number(brutN) : NaN;
  if (!(n >= 1 && n <= 20)) throw new ErreurHttp(400, 'n doit être un entier de 1 à 20.');

  const brutGraine = p.get('graine');
  if (brutGraine !== null && !/^-?\d{1,15}$/.test(brutGraine)) {
    throw new ErreurHttp(400, 'graine doit être un entier.');
  }
  const graine = brutGraine === null ? 0 : Number(brutGraine);

  const { results } = await env.DB.prepare('SELECT id FROM chapitres_ia ORDER BY id LIMIT ?').bind(POOL_MAX).all();
  const choisies = tirer((results || []).map((r) => r.id), n, graine);
  return json({ questions: await chargerQuestions(env, choisies) });
});
