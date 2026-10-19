// GET /api/quiz?parcours=<id>&n=10&graine=<entier> : des questions tirées des paliers en cache d'un parcours.
// Public. Déterministe : même graine, même tirage (tant que le cache ne change pas).
// S'il y a moins de 5 questions, l'app appelle POST /api/quiz-direct.
import { ErreurHttp, enveloppe, exigerBase, json } from '../../lib/api.js';
import { ID_PARCOURS } from '../../lib/paliers.js';
import { tirerParmi } from '../../lib/questions.js';

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const p = new URL(request.url).searchParams;

  const parcours = p.get('parcours');
  if (!parcours) throw new ErreurHttp(400, 'Indique le parcours.');

  const brutN = p.get('n');
  const n = brutN === null ? 10 : /^\d{1,2}$/.test(brutN) ? Number(brutN) : NaN;
  if (!(n >= 1 && n <= 20)) throw new ErreurHttp(400, 'n doit être un entier de 1 à 20.');

  const brutGraine = p.get('graine');
  if (brutGraine !== null && !/^-?\d{1,15}$/.test(brutGraine)) {
    throw new ErreurHttp(400, 'graine doit être un entier.');
  }
  const graine = brutGraine === null ? 0 : Number(brutGraine);

  if (!ID_PARCOURS.test(parcours) || !(await env.DB.prepare('SELECT id FROM parcours WHERE id = ?').bind(parcours).first())) {
    throw new ErreurHttp(404, 'Parcours introuvable.');
  }

  // On ne lit d'abord que les identifiants et le nombre de questions de chaque palier.
  const { results } = await env.DB.prepare(
    `SELECT id, json_array_length(contenu, '$.questions') AS nq
     FROM paliers WHERE parcours = ? ORDER BY numero LIMIT 500`,
  )
    .bind(parcours)
    .all();
  const pool = [];
  for (const r of results || []) {
    for (let index = 0; index < (r.nq || 0); index++) pool.push({ palier: r.id, index });
  }
  const choisies = tirerParmi(pool, n, graine);
  if (!choisies.length) return json({ questions: [] });

  const ids = [...new Set(choisies.map((c) => c.palier))];
  const lues = await env.DB.prepare(`SELECT id, contenu FROM paliers WHERE id IN (${ids.map(() => '?').join(', ')})`)
    .bind(...ids)
    .all();
  const paliers = new Map();
  for (const r of lues.results || []) {
    try {
      paliers.set(r.id, JSON.parse(r.contenu));
    } catch {
      // contenu illisible : ses questions sont écartées
    }
  }
  const questions = [];
  for (const { palier, index } of choisies) {
    const c = paliers.get(palier);
    const question = c && Array.isArray(c.questions) ? c.questions[index] : null;
    if (question) questions.push({ palier, titre: c.titre, index, question });
  }
  return json({ questions });
});
