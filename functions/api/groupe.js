// Formation à plusieurs : un groupe suit la même formation, chacun voit l'avancée des autres.
// POST /api/groupe {nom, parcours} (connexion) -> {id} : crée le groupe (nom de 2 à 40 caractères, formation existante) et y inscrit son créateur.
// POST /api/groupe {id, rejoindre: true} ou POST /api/groupe?id=…&action=rejoindre (connexion) -> {ok, id} : rejoint le groupe
//   (12 membres au plus : 409 au-delà ; déjà membre : rien ne change). {id, quitter: true} ou ?action=quitter : quitte le groupe ;
//   un groupe sans membre est supprimé.
// GET  /api/groupe?id= (public) -> {groupe: {id, nom, parcours, parcoursTitre, createur, max, complet, dejaMembre, membres, classement}}
//   classement : [{rang, pseudo, lecons, xp, activite, moi?}] ; lecons = leçons faites dans cette formation, xp = XP gagnée sur elle,
//   activite = dernière activité (ISO) ou null. Seuls les pseudos sortent : jamais d'identifiant de joueur.
// GET  /api/groupe (connexion) -> {groupes: [{id, nom, parcours, membres}]} : mes groupes (20 au plus).
// La progression n'est pas copiée : elle est lue dans joueurs.etat, que l'app envoie déjà par PUT /api/progression.
import {
  ErreurHttp, aleatoire, auth, enveloppe, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';
import {
  GROUPES_CREES_PAR_JOUR, GROUPES_PAR_JOUEUR, MEMBRES_MAX, NOM_MAX, NOM_MIN, classerMembres, lireSuivi,
} from '../../lib/groupes.js';

const ID_GROUPE = /^[a-z0-9]{8}$/;
const ID_PARCOURS = /^[a-z0-9-]{1,40}$/;
const ID_VERIFIE = /^v-[a-z]{2}$/;

async function joueurConnecte(request, env) {
  await exigerBase(env);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  return joueur;
}

function idGroupe(texte) {
  if (typeof texte !== 'string' || !ID_GROUPE.test(texte)) throw new ErreurHttp(400, 'Identifiant de groupe attendu : 8 caractères.');
  return texte;
}

// Une formation existe si elle est dans le cache D1, ou si c'est une formation vérifiée du catalogue de l'app.
async function titreDeFormation(env, request, id) {
  const ligne = await env.DB.prepare('SELECT titre FROM parcours WHERE id = ?').bind(id).first();
  if (ligne) return ligne.titre || id;
  if (ID_VERIFIE.test(id) && env.ASSETS) {
    try {
      const r = await env.ASSETS.fetch(new Request(new URL('/contenu/parcours.json', request.url)));
      const catalogue = r.ok ? await r.json() : null;
      const trouve = catalogue && Array.isArray(catalogue.parcours) ? catalogue.parcours.find((p) => p && p.id === id) : null;
      if (trouve) return typeof trouve.titre === 'string' ? trouve.titre : id;
    } catch {
      // catalogue illisible : formation inconnue
    }
  }
  return null;
}

async function lireCorps(request) {
  return request.body ? lireJSON(request, 1024) : {};
}

async function creer(env, request, joueur, corps) {
  const nom = nettoyer(corps.nom);
  if (nom === null || longueur(nom) < NOM_MIN || longueur(nom) > NOM_MAX) {
    throw new ErreurHttp(400, `Nom de groupe de ${NOM_MIN} à ${NOM_MAX} caractères attendu.`);
  }
  if (typeof corps.parcours !== 'string' || !ID_PARCOURS.test(corps.parcours)) {
    throw new ErreurHttp(400, 'Formation attendue : son identifiant.');
  }
  if ((await titreDeFormation(env, request, corps.parcours)) === null) throw new ErreurHttp(404, 'Cette formation n’existe pas.');
  const suivis = await env.DB.prepare('SELECT COUNT(*) AS n FROM groupe_membres WHERE joueur = ?').bind(joueur.id).first();
  if (suivis && suivis.n >= GROUPES_PAR_JOUEUR) throw new ErreurHttp(409, `Tu suis déjà ${GROUPES_PAR_JOUEUR} groupes. Quitte-en un d’abord.`);
  if (!(await quota(env, 'groupe:joueur:' + joueur.id, GROUPES_CREES_PAR_JOUR))) {
    throw new ErreurHttp(429, `Tu as déjà créé ${GROUPES_CREES_PAR_JOUR} groupes aujourd’hui. Reviens demain.`);
  }
  const maintenant = new Date().toISOString();
  for (let essai = 0; essai < 3; essai++) {
    const id = aleatoire(8);
    const ecrit = await env.DB.prepare('INSERT OR IGNORE INTO groupes (id, nom, parcours, createur, cree) VALUES (?, ?, ?, ?, ?)')
      .bind(id, nom, corps.parcours, joueur.id, maintenant)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) {
      await env.DB.prepare('INSERT OR IGNORE INTO groupe_membres (groupe, joueur, rejoint) VALUES (?, ?, ?)').bind(id, joueur.id, maintenant).run();
      return json({ id });
    }
  }
  throw new Error('identifiant de groupe déjà pris');
}

async function rejoindre(env, joueur, id) {
  const groupe = await env.DB.prepare('SELECT id FROM groupes WHERE id = ?').bind(id).first();
  if (!groupe) throw new ErreurHttp(404, 'Ce groupe n’existe pas.');
  const deja = await env.DB.prepare('SELECT 1 AS ok FROM groupe_membres WHERE groupe = ? AND joueur = ?').bind(id, joueur.id).first();
  if (deja) return json({ ok: true, id, dejaMembre: true });
  const suivis = await env.DB.prepare('SELECT COUNT(*) AS n FROM groupe_membres WHERE joueur = ?').bind(joueur.id).first();
  if (suivis && suivis.n >= GROUPES_PAR_JOUEUR) throw new ErreurHttp(409, `Tu suis déjà ${GROUPES_PAR_JOUEUR} groupes. Quitte-en un d’abord.`);
  // Un seul ordre SQL : le plafond est vérifié au moment de l'écriture, même si deux joueurs arrivent ensemble.
  const ecrit = await env.DB.prepare(
    `INSERT OR IGNORE INTO groupe_membres (groupe, joueur, rejoint)
     SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM groupe_membres WHERE groupe = ?) < ?`,
  )
    .bind(id, joueur.id, new Date().toISOString(), id, MEMBRES_MAX)
    .run();
  if (!(ecrit.meta && ecrit.meta.changes === 1)) throw new ErreurHttp(409, `Ce groupe est complet : ${MEMBRES_MAX} membres au plus.`);
  return json({ ok: true, id });
}

async function quitter(env, joueur, id) {
  const groupe = await env.DB.prepare('SELECT id FROM groupes WHERE id = ?').bind(id).first();
  if (!groupe) throw new ErreurHttp(404, 'Ce groupe n’existe pas.');
  await env.DB.prepare('DELETE FROM groupe_membres WHERE groupe = ? AND joueur = ?').bind(id, joueur.id).run();
  await env.DB.prepare('DELETE FROM groupes WHERE id = ? AND NOT EXISTS (SELECT 1 FROM groupe_membres WHERE groupe = ?)').bind(id, id).run();
  return json({ ok: true });
}

export const onRequestPost = enveloppe(async ({ request, env }) => {
  const joueur = await joueurConnecte(request, env);
  const url = new URL(request.url);
  const corps = await lireCorps(request);
  const action = url.searchParams.get('action')
    || (corps.rejoindre === true ? 'rejoindre' : corps.quitter === true ? 'quitter' : corps.id === undefined ? 'creer' : null);
  if (action === 'creer') return creer(env, request, joueur, corps);
  if (action === 'rejoindre' || action === 'quitter') {
    const id = idGroupe(url.searchParams.get('id') || corps.id);
    return action === 'rejoindre' ? rejoindre(env, joueur, id) : quitter(env, joueur, id);
  }
  throw new ErreurHttp(400, 'Action inconnue : créer (nom, parcours), rejoindre ou quitter.');
});

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const id = new URL(request.url).searchParams.get('id');
  const lecteur = await auth(request, env).catch(() => null);

  if (id === null) { // mes groupes
    if (!lecteur) throw new ErreurHttp(401, 'Connexion requise.');
    const { results } = await env.DB.prepare(
      `SELECT g.id, g.nom, g.parcours, (SELECT COUNT(*) FROM groupe_membres x WHERE x.groupe = g.id) AS membres
       FROM groupe_membres m JOIN groupes g ON g.id = m.groupe WHERE m.joueur = ? ORDER BY m.rejoint DESC, g.id LIMIT ?`,
    )
      .bind(lecteur.id, GROUPES_PAR_JOUEUR)
      .all();
    return json({ groupes: (results || []).map((g) => ({ id: g.id, nom: g.nom, parcours: g.parcours, membres: g.membres })) });
  }

  idGroupe(id);
  const groupe = await env.DB.prepare(
    `SELECT g.id, g.nom, g.parcours, j.pseudo AS createur, p.titre AS titre FROM groupes g
     LEFT JOIN joueurs j ON j.id = g.createur LEFT JOIN parcours p ON p.id = g.parcours WHERE g.id = ?`,
  )
    .bind(id)
    .first();
  if (!groupe) throw new ErreurHttp(404, 'Ce groupe n’existe pas.');
  // Seule la fiche de cette formation sort de l'état de chaque membre ; une ligne illisible vaut « rien de fait ».
  const { results } = await env.DB.prepare(
    `SELECT j.id AS jid, j.pseudo, json_extract(CASE WHEN json_valid(j.etat) THEN j.etat ELSE '{}' END, ?) AS suivi
     FROM groupe_membres m JOIN joueurs j ON j.id = m.joueur WHERE m.groupe = ? ORDER BY m.rejoint, j.id LIMIT ?`,
  )
    .bind(`$.parcours."${groupe.parcours}"`, id, MEMBRES_MAX + 1)
    .all();
  const lignes = results || [];
  const membres = lignes.map((l) => ({
    pseudo: l.pseudo || 'Un joueur', ...lireSuivi(l.suivi), ...(lecteur && l.jid === lecteur.id ? { moi: true } : {}),
  }));
  return json({
    groupe: {
      id: groupe.id,
      nom: groupe.nom,
      parcours: groupe.parcours,
      parcoursTitre: groupe.titre || null,
      createur: groupe.createur || 'Un joueur',
      max: MEMBRES_MAX,
      complet: membres.length >= MEMBRES_MAX,
      dejaMembre: membres.some((m) => m.moi),
      membres: membres.length,
      classement: classerMembres(membres),
    },
  });
});
