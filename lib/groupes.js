// Formation à plusieurs : groupes qui suivent la même formation. Importé par functions/api/groupe.js et progression.js.
// La progression d'un membre n'est écrite nulle part ailleurs que dans joueurs.etat (envoi existant PUT /api/progression) :
// le groupe la lit à la demande, il ne la copie pas. Aucun secret.

export const PALIERS_PAR_PARCOURS = 1500;
export const MEMBRES_MAX = 12;
export const GROUPES_PAR_JOUEUR = 20; // groupes suivis en même temps par un joueur
export const GROUPES_CREES_PAR_JOUR = 10;
export const NOM_MIN = 2;
export const NOM_MAX = 40;

// Paliers terminés d'un parcours (`fait`) : liste de numéros, objet {numéro: vrai} ou nombre. 1 500 au plus.
export function compterFaits(fait) {
  const numero = (v) => {
    const n = typeof v === 'string' && /^\d{1,4}$/.test(v) ? Number(v) : v;
    return Number.isInteger(n) && n >= 1 && n <= PALIERS_PAR_PARCOURS ? n : null;
  };
  if (Array.isArray(fait)) return new Set(fait.map(numero).filter((n) => n !== null)).size;
  if (fait && typeof fait === 'object') {
    return Object.entries(fait).filter(([cle, v]) => v && numero(cle) !== null).length;
  }
  if (typeof fait === 'number' && Number.isFinite(fait)) {
    return Math.min(PALIERS_PAR_PARCOURS, Math.max(0, Math.floor(fait)));
  }
  return 0;
}

// `etat.parcours[<formation>]` (texte JSON ou null) -> { lecons, xp, activite } : leçons faites, XP gagnée sur cette formation,
// dernière activité (ISO) ou null. Tout est borné : l'état est écrit par le joueur, on ne s'y fie pas.
export function lireSuivi(texte) {
  let s = null;
  try {
    s = typeof texte === 'string' ? JSON.parse(texte) : null;
  } catch {
    s = null;
  }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { lecons: 0, xp: 0, activite: null };
  const xp = typeof s.xp === 'number' && Number.isFinite(s.xp) ? Math.min(1000000, Math.max(0, Math.floor(s.xp))) : 0;
  const t = typeof s.date === 'string' && s.date.length <= 40 ? Date.parse(s.date) : NaN;
  const activite = Number.isFinite(t) && t > 0 && t < 8.64e15 ? new Date(t).toISOString() : null;
  return { lecons: compterFaits(s.fait), xp, activite };
}

// Classement : plus de leçons d'abord, puis plus d'XP, puis pseudo. Deux membres à égalité parfaite ont le même rang.
export function classerMembres(membres) {
  const tri = membres.slice().sort((a, b) => b.lecons - a.lecons || b.xp - a.xp || String(a.pseudo || '').localeCompare(String(b.pseudo || ''), 'fr', { sensitivity: 'base' }));
  let rang = 0;
  return tri.map((m, i) => {
    if (i === 0 || m.lecons !== tri[i - 1].lecons || m.xp !== tri[i - 1].xp) rang = i + 1;
    return { rang, ...m };
  });
}
