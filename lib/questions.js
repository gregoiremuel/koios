// Questions tirées des chapitres IA en cache : tirage déterministe (mélange) et chargement (duels).
// Importé par functions/api/melange.js et duel.js. Aucun secret.

export const EXERCICES_PAR_CHAPITRE = 3;
// Plafond de chapitres examinés par tirage (on ne lit que les identifiants).
export const POOL_MAX = 5000;

// Générateur pseudo-aléatoire (mulberry32) : même graine, même suite.
export function generateur(graine) {
  let a = Number(BigInt.asUintN(32, BigInt(graine))) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n éléments de `pool` tirés sans remise, de façon déterministe selon `graine` (le pool n'est pas modifié).
export function tirerParmi(pool, n, graine) {
  const copie = pool.slice();
  const hasard = generateur(graine);
  const k = Math.min(n, copie.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(hasard() * (copie.length - i));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie.slice(0, k);
}

// n couples {chapitre, index} tirés sans remise parmi tous les exercices des chapitres `ids`.
export function tirer(ids, n, graine) {
  const pool = [];
  for (const chapitre of ids) {
    for (let index = 0; index < EXERCICES_PAR_CHAPITRE; index++) pool.push({ chapitre, index });
  }
  return tirerParmi(pool, n, graine);
}

// [{chapitre, index}] -> [{chapitre, titre, sujetTitre, index, exercice}], dans le même ordre.
// Un chapitre ou un exercice introuvable est écarté.
export async function chargerQuestions(env, couples) {
  if (!couples.length) return [];
  const ids = [...new Set(couples.map((c) => c.chapitre))];
  const { results } = await env.DB.prepare(
    `SELECT id, contenu FROM chapitres_ia WHERE id IN (${ids.map(() => '?').join(', ')})`,
  )
    .bind(...ids)
    .all();
  const chapitres = new Map();
  for (const r of results || []) {
    try {
      chapitres.set(r.id, JSON.parse(r.contenu));
    } catch {
      // contenu illisible : ses questions sont écartées
    }
  }
  const sortie = [];
  for (const { chapitre, index } of couples) {
    const c = chapitres.get(chapitre);
    const exercice = c && Array.isArray(c.exercices) ? c.exercices[index] : null;
    if (exercice) sortie.push({ chapitre, titre: c.titre, sujetTitre: c.sujetTitre, index, exercice });
  }
  return sortie;
}

// Les scores d'un duel sans l'identifiant du joueur (seuls les pseudos sortent de la base).
export function scoresPublics(scores) {
  return scores.map((s) => ({ pseudo: s.pseudo, justes: s.justes, n: s.n, points: s.points, date: s.date }));
}
