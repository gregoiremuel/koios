// GET /api/parcours?id=<id> : un parcours (public, compte une vue). GET /api/parcours : les 60 plus lus.
// GET /api/parcours?q=<texte> : la bibliothèque, recherche dans les titres (sans accents ni casse), 30 résultats par vues.
// POST /api/parcours {titre} : crée un parcours (sources, plan de l'étape 1, résumé, photo de tête), une seule fois
// pour tous les lecteurs. Un parcours qui existe déjà est renvoyé sans rien générer ni consommer de quota.
// POST /api/parcours {id, prolonger: true} : « Aller plus loin », 3 à 5 modules d'un niveau « Maîtrise n » ajoutés au
// programme, pour tous les lecteurs (5 par jour et par lecteur, 40 par jour au total).
// En-tête facultatif x-cle-ia: <fournisseur>:<clé> : la clé personnelle du lecteur écrit la formation (jamais enregistrée, jamais renvoyée) ;
// la formation va dans la même table, partagée par tous.
import { typographier } from '../../lib/typo.js';
import {
  ErreurHttp, auth, enveloppe, envAvecCle, exigerBase, json, lireJSON, longueur, nettoyer, quota,
} from '../../lib/api.js';
import {
  ID_PARCOURS, decoderParcours, demarrerChrono, genererParcours, genererProlongement, nbModules, nbPaliers,
} from '../../lib/paliers.js';
import { slug } from '../../lib/sujets.js';

const COLONNES = 'id, titre, contenu';

const RECHERCHE_MAX = 30;

// Niveau le plus avancé déjà ouvert (celui du dernier module ouvert) : {numero, titre}, ou null sans programme.
function niveauAtteint(c) {
  if (!c.programme || !c.etapes.length) return null;
  const dernier = c.etapes[c.etapes.length - 1];
  const n = c.programme.niveaux.find((x) => x.numero === dernier.niveau);
  return n ? { numero: n.numero, titre: n.titre } : null;
}

// Bibliothèque : formations dont le titre contient tous les mots de la recherche (comparés sans accents ni casse,
// sur l'identifiant, qui est le titre en minuscules sans accents ; les mots n'ont ni % ni _). Les plus suivies d'abord.
async function rechercher(env, brut) {
  const texte = nettoyer(brut);
  const mots = (texte === null ? '' : texte).slice(0, 80).split(/\s+/).map((m) => slug(m)).filter(Boolean).slice(0, 6);
  if (!mots.length || mots.join('').length < 2) throw new ErreurHttp(400, 'Écris au moins 2 lettres pour chercher une formation.');
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.titre, p.contenu, p.vues,
            (SELECT COUNT(*) FROM paliers l WHERE l.parcours = p.id) AS lecons
       FROM parcours p
      WHERE ${mots.map(() => 'p.id LIKE ?').join(' AND ')}
      ORDER BY p.vues DESC, p.cree DESC, p.id
      LIMIT ${RECHERCHE_MAX * 2}`,
  )
    .bind(...mots.map((m) => `%${m}%`))
    .all();
  const sortie = [];
  for (const r of results || []) {
    if (sortie.length >= RECHERCHE_MAX) break;
    try {
      const c = decoderParcours(r);
      sortie.push({
        id: r.id,
        titre: r.titre,
        image: c.image,
        vues: r.vues,
        paliers: nbPaliers(c.etapes),
        lecons: r.lecons,
        modules: c.modulesTotal,
        ouverts: c.etapes.length,
        niveauAtteint: niveauAtteint(c),
        niveaux: c.programme ? c.programme.niveaux.map((n) => ({ numero: n.numero, titre: n.titre })) : [],
      });
    } catch {
      // contenu illisible : écarté
    }
  }
  return sortie;
}

// Ajoute le niveau au programme. Si un autre lecteur a écrit entre-temps, on relit : si le programme a déjà été prolongé
// (des modules restent à ouvrir), son ajout vaut le nôtre et on n'en écrit pas un second.
async function enregistrerNiveau(env, ligne, niveau) {
  for (let essai = 0; essai < 3; essai++) {
    const contenu = JSON.parse(ligne.contenu);
    if (nbModules(contenu.programme) > contenu.etapes.length) return ligne;
    contenu.programme.niveaux.push(niveau);
    const neuf = JSON.stringify(contenu);
    const ecrit = await env.DB.prepare('UPDATE parcours SET contenu = ? WHERE id = ? AND contenu = ?')
      .bind(neuf, ligne.id, ligne.contenu)
      .run();
    if (ecrit.meta && ecrit.meta.changes === 1) return { ...ligne, contenu: neuf };
    ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(ligne.id).first();
    if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  }
  throw new ErreurHttp(503, 'La formation est très demandée. Réessaie dans un instant.');
}

async function prolonger(env, joueur, id) {
  if (typeof id !== 'string' || !ID_PARCOURS.test(id)) throw new ErreurHttp(400, 'Identifiant de formation attendu.');
  let ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(id).first();
  if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  const parcours = decoderParcours(ligne);
  if (!parcours.programme) throw new ErreurHttp(400, 'Cette formation n’a pas de programme par niveaux : elle continue déjà sans fin.');
  // Seulement à la fin du programme : tous les modules sont ouverts (le dernier module ouvert est le dernier du programme).
  if (parcours.etapes.length < parcours.modulesTotal) {
    throw new ErreurHttp(409, 'Le programme n’est pas terminé : ouvre d’abord le dernier module, puis va plus loin.');
  }
  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
  if (!(await quota(env, 'prolonger:joueur:' + joueur.id, 5))) {
    throw new ErreurHttp(429, 'Tu as déjà prolongé 5 formations aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'prolonger:total', 40))) {
    throw new ErreurHttp(429, 'La bibliothèque est débordée aujourd’hui. Reviens demain.');
  }
  const niveau = typographier(await genererProlongement(env, parcours, demarrerChrono()));
  ligne = await enregistrerNiveau(env, ligne, niveau);
  return decoderParcours(ligne);
}

export const onRequestGet = enveloppe(async ({ request, env }) => {
  await exigerBase(env);
  const p = new URL(request.url).searchParams;

  if (p.has('q')) return json({ parcours: await rechercher(env, p.get('q')) });

  if (!p.has('id')) {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.titre, p.contenu, p.vues,
              (SELECT COUNT(*) FROM paliers l WHERE l.parcours = p.id) AS lecons
         FROM parcours p ORDER BY p.vues DESC, p.cree DESC, p.id LIMIT 60`,
    ).all();
    const parcours = [];
    for (const r of results || []) {
      try {
        const c = decoderParcours(r);
        parcours.push({
          id: r.id,
          titre: r.titre,
          image: c.image,
          vues: r.vues,
          paliers: nbPaliers(c.etapes),
          lecons: r.lecons,
          modules: c.modulesTotal,
          ouverts: c.etapes.length,
          niveauAtteint: niveauAtteint(c),
        });
      } catch {
        // contenu illisible : ce parcours est écarté de la liste
      }
    }
    return json({ parcours });
  }

  const id = p.get('id');
  if (!id) throw new ErreurHttp(400, 'Identifiant de parcours attendu.');
  if (!ID_PARCOURS.test(id)) throw new ErreurHttp(404, 'Parcours introuvable.');
  const ligne = await env.DB.prepare(`UPDATE parcours SET vues = vues + 1 WHERE id = ? RETURNING ${COLONNES}`)
    .bind(id)
    .first();
  if (!ligne) throw new ErreurHttp(404, 'Parcours introuvable.');
  return json({ parcours: decoderParcours(ligne) });
});

export const onRequestPost = enveloppe(async ({ request, env: envServeur }) => {
  await exigerBase(envServeur);
  const env = envAvecCle(request, envServeur);
  const joueur = await auth(request, env);
  if (!joueur) throw new ErreurHttp(401, 'Connexion requise.');
  const corps = await lireJSON(request, 2048);

  if (corps.prolonger === true) return json({ parcours: await prolonger(env, joueur, corps.id) });

  const titre = nettoyer(corps.titre);
  if (titre === null || longueur(titre) < 2 || longueur(titre) > 80) {
    throw new ErreurHttp(400, 'Titre de 2 à 80 caractères attendu.');
  }
  const id = slug(titre);
  if (id === '') throw new ErreurHttp(400, 'Titre sans lettre ni chiffre.');

  // Déjà en cache : rien à générer, aucun quota.
  const existant = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(id).first();
  if (existant) return json({ parcours: decoderParcours(existant) });

  if (!env.AI) throw new ErreurHttp(503, 'IA absente');
  // Par lecteur d'abord : un lecteur qui insiste ne doit pas vider le quota des autres.
  if (!(await quota(env, 'parcours:joueur:' + joueur.id, 10))) {
    throw new ErreurHttp(429, 'Tu as déjà lancé 10 parcours aujourd’hui. Reviens demain.');
  }
  if (!(await quota(env, 'parcours:total', 80))) {
    throw new ErreurHttp(429, 'La bibliothèque est débordée aujourd’hui. Reviens demain.');
  }

  const contenu = typographier(await genererParcours(env, titre, demarrerChrono()));

  // Deux lecteurs peuvent lancer le même parcours en même temps : le premier enregistré gagne.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO parcours (id, titre, contenu, auteur, vues, cree)
     VALUES (?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, titre, JSON.stringify(contenu), joueur.id, new Date().toISOString())
    .run();
  const ligne = await env.DB.prepare(`SELECT ${COLONNES} FROM parcours WHERE id = ?`).bind(id).first();
  return json({ parcours: decoderParcours(ligne) });
});
