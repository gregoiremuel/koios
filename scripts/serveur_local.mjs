// Serveur local de Koîos : essayer l'app de bout en bout sans Cloudflare.
//   node scripts/serveur_local.mjs [port=8787]
// Sert app/ (index.html sur /) et confie /api/* à worker.js, avec un faux environnement :
//   - DB : SQLite en mémoire (node:sqlite), interface D1 (scripts/faux_d1.mjs) ; tout repart de zéro à chaque lancement ;
//   - AI : Workers AI simulé (plans, chapitres v1.1, programmes et modules, leçons, paliers, quiz et vérification de l'API v2) ;
//   - GLM : `fetch` vers api.z.ai simulé (une clé factice calculée au lancement donne le rédacteur GLM, la vérification
//     passe alors par le faux Mistral, comme en production) ;
//   - Wikipédia FR et EN : `fetch` remplacé par un Wikipédia simulé (aucun appel réseau ; une requête contenant « zzz »
//     ne trouve rien, pour voir « aucune source ») ; fiches écrites à la main pour la tour Eiffel, le mont Blanc et
//     Sparte, page générique pour tout autre sujet ;
//   - Pexels et Unsplash : simulés aussi, mais sans clé par défaut (l'image du parcours vient alors de Wikipédia).
//     KOIOS_LOCAL_PHOTOS=pexels ou unsplash donne une clé factice et fait passer l'image par ce service.
// Un palier sur quatre porte une phrase « non confirmée » que le faux vérificateur retire : son statut est « partiel ».
// Une leçon sur six porte un moyen mnémotechnique non confirmé : il est retiré (mnemo null).
// Les contenus simulés servent à voir l'écran, pas à apprendre. Aucun secret : les clés sont des valeurs calculées.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../worker.js';
import { PROMPT_CHAPITRE, PROMPT_PLAN } from '../lib/sujets.js';
import {
  PROMPT_ETAPE, PROMPT_LECON, PROMPT_MODULE, PROMPT_PALIER, PROMPT_PROGRAMME, PROMPT_QUIZ, PROMPT_VERIFICATION,
} from '../lib/paliers.js';
import { fauxD1 } from './faux_d1.mjs';
import {
  PAGES, leconSimulee, moduleSimule, palierSimule, planSimule, programmeSimule, quizSimule, trouverPage, verificationSimulee,
} from './faux_contenus.mjs';

const RACINE = resolve(fileURLToPath(new URL('../app/', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

// --- Fichiers de app/ (liaison ASSETS) -------------------------------------

const ASSETS = {
  async fetch(request) {
    let chemin;
    try {
      chemin = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('Adresse illisible.', { status: 400 });
    }
    if (chemin.includes('\0')) return new Response('Adresse illisible.', { status: 400 });
    if (chemin.endsWith('/')) chemin += 'index.html';
    const fichier = resolve(RACINE, '.' + chemin);
    const dedans = fichier.startsWith(RACINE + sep);
    // Comme Cloudflare : les fichiers _headers et _redirects ne sont pas servis.
    if (!dedans || basename(fichier).startsWith('_')) return new Response('Introuvable.', { status: 404 });
    try {
      if (!(await stat(fichier)).isFile()) return new Response('Introuvable.', { status: 404 });
      const octets = await readFile(fichier);
      return new Response(octets, {
        headers: {
          'content-type': TYPES[extname(fichier).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('Introuvable.', { status: 404 });
    }
  },
};

// --- Clés factices ---------------------------------------------------------

// Des valeurs calculées au lancement, jamais écrites dans le code : le serveur local n'a besoin d'aucun vrai secret.
const cleFactice = (nom) => `factice-${nom}-${process.pid}`;
const attente = (ms) => new Promise((fin) => setTimeout(fin, ms));

// --- IA simulée ------------------------------------------------------------

const coupe = (texte, n) => (texte.length > n ? texte.slice(0, n - 1).trimEnd() + '…' : texte);

// v1.1 : plan de sujet et chapitre (inchangés).
function planV1(sujet) {
  const S = coupe(sujet, 50);
  const aspects = ['les origines', 'les grandes dates', 'les acteurs', 'les lieux', 'les techniques', 'les chiffres clés', 'les idées reçues', 'l’héritage'];
  return {
    resume: `« ${S} » est un sujet simulé par le serveur local. Cette IA factice écrit un plan et des chapitres de forme valide, pour essayer l’écran.`,
    plan: aspects.map((a) => ({ titre: `${S} : ${a}`, resume: `Ce chapitre simulé aborde ${a} de « ${S} ».` })),
    approfondir: ['histoire', 'personnages', 'vocabulaire', 'controverses', 'anecdotes', 'aujourd’hui'].map((x) => `${S} : ${x}`),
  };
}

function chapitreV1(sujet, titre, numero) {
  const S = coupe(sujet, 60);
  const T = coupe(titre, 80);
  const bonne = numero % 4;
  const reponses = ['La cuisine du Moyen Âge', 'Les satellites de Jupiter', 'L’histoire du vélo'];
  reponses.splice(bonne, 0, S);
  const commun = { rivalJuste: 'Juste. Même simulé, tu es plus fort que moi.', rivalFaux: 'Raté. Heureusement, ce chapitre est faux de toute façon.' };
  return {
    essentiel: [
      `« ${T} » est abordé ici dans le cadre du sujet « ${S} ».`,
      'Cette fiche est écrite par une IA simulée : elle sert à essayer l’écran, pas à apprendre.',
      'Chaque exercice qui suit fait réviser un repère de la fiche.',
      'Les vrais chapitres seront rédigés par Workers AI, à partir de Wikipédia, une fois l’app en ligne.',
    ],
    reperes: [
      [`Chapitre ${numero}`, `Place de « ${coupe(T, 60)} » dans le plan du sujet.`],
      ['Sujet', `${coupe(S, 50)} sert de fil rouge à tout le cours.`],
      ['Simulé', 'Ce contenu vient de l’IA factice du serveur local.'],
      ['Brouillon', 'Un chapitre écrit par une IA reste un brouillon à vérifier.'],
    ],
    exercices: [
      {
        type: 'qcm', enonce: `Dans quel sujet se range le chapitre « ${T} » ?`, reponses, bonne,
        correction: `Ce chapitre fait partie du sujet « ${S} ».`, theme: 'Place du chapitre', repere: 1, ...commun,
      },
      {
        type: 'bluff', affirmation: `Le chapitre « ${T} » a été relu par un historien en 1850.`, vrai: false,
        correction: 'Bluff. Ce chapitre est simulé : personne ne l’a relu.', theme: 'Origine du texte', repere: 2, ...commun,
      },
      {
        type: 'frise', enonce: 'Range ces quatre étapes, de la plus ancienne à la plus récente.',
        elements: ['Le joueur choisit le sujet', 'L’IA écrit le plan', 'Le joueur ouvre le chapitre', 'L’IA écrit le chapitre'],
        ordre: ['Le joueur choisit le sujet', 'L’IA écrit le plan', 'Le joueur ouvre le chapitre', 'L’IA écrit le chapitre'],
        valeurs: { 'Le joueur choisit le sujet': 'étape 1', 'L’IA écrit le plan': 'étape 2', 'Le joueur ouvre le chapitre': 'étape 3', 'L’IA écrit le chapitre': 'étape 4' },
        correction: 'Le plan vient avant le chapitre : le sujet d’abord, puis le plan, puis le chapitre.', theme: 'Fabrication d’un chapitre', repere: 0, ...commun,
      },
    ],
    chiffres: [
      { libelle: 'Chapitres du sujet', valeur: 8, unite: 'éléments' },
      { libelle: 'Repères de la fiche', valeur: 4, unite: 'éléments' },
      { libelle: 'Exercices du chapitre', valeur: 3, unite: 'éléments' },
    ],
    notions: {
      noeuds: [coupe(S, 30), 'Chapitre', 'Exercices', 'Rival', 'Brouillon'],
      liens: [[coupe(S, 30), 'Chapitre', 'contient'], ['Chapitre', 'Exercices', 'propose'], ['Rival', 'Exercices', 'corrige'], ['Brouillon', 'Chapitre', 'qualifie']],
    },
    saviezVous: 'Ce chapitre vient de l’IA simulée du serveur local ; le vrai Rival s’appuiera sur Wikipédia.',
  };
}

// Réponse (objet) du faux modèle selon le prompt système ; lève une erreur si le prompt est inconnu.
function reponseDe(systeme, demande) {
  if (systeme === PROMPT_PLAN) return planV1(/Sujet du joueur : « ([^\n]*) »\n/.exec(demande)[1]);
  if (systeme === PROMPT_CHAPITRE) {
    const sujet = /Sujet : « ([^\n]*) » \(niveau/.exec(demande)[1];
    const [, numero, titre] = /Chapitre à écrire : n° (\d+), « ([^\n]*) » — /.exec(demande);
    return chapitreV1(sujet, titre, Number(numero));
  }
  if (systeme === PROMPT_ETAPE) return planSimule(demande);
  if (systeme === PROMPT_PROGRAMME) return programmeSimule(demande);
  if (systeme === PROMPT_MODULE) return moduleSimule(demande);
  if (systeme === PROMPT_LECON) return leconSimulee(demande);
  if (systeme === PROMPT_PALIER) return palierSimule(demande);
  if (systeme === PROMPT_QUIZ) return quizSimule(demande);
  if (systeme === PROMPT_VERIFICATION) return verificationSimulee(demande);
  throw new Error('demande inconnue du faux modèle');
}

// Workers AI : env.AI.run(modèle, { messages }) -> { response: "<json>" }.
const IA = {
  async run(modele, { messages }) {
    await attente(250); // un peu de patience, comme avec un vrai modèle
    return { response: JSON.stringify(reponseDe(messages[0].content, messages[1].content)) };
  },
};

// --- Services simulés par fetch --------------------------------------------

const json = (objet, status = 200) => new Response(JSON.stringify(objet), { status, headers: { 'content-type': 'application/json' } });
const entete = (init, nom) => new Headers((init && init.headers) || {}).get(nom) || '';

// GLM (z.ai) : réponse au format OpenAI. Refuse l'appel sans clé « Bearer ».
async function glm(init) {
  if (!entete(init, 'authorization').startsWith('Bearer ')) return json({ error: { message: 'clé absente' } }, 401);
  const { messages } = JSON.parse(String((init && init.body) || '{}'));
  if (!Array.isArray(messages) || messages.length < 2) return json({ error: { message: 'requête invalide' } }, 400);
  await attente(250);
  let objet;
  try {
    objet = reponseDe(messages[0].content, messages[1].content);
  } catch (e) {
    return json({ error: { message: e.message } }, 400);
  }
  return json({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(objet) } }] });
}

// Pexels et Unsplash : une photo simulée sur les hôtes attendus par lib/images.js (les fichiers n'existent pas).
function pexels(u, init) {
  if (!entete(init, 'authorization')) return json({ error: 'clé absente' }, 401);
  if (/zzz/i.test(u.searchParams.get('query') || '')) return json({ photos: [] });
  return json({
    photos: [{
      id: 1,
      src: { landscape: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200' },
      url: 'https://www.pexels.com/photo/photo-simulee-1/',
      photographer: 'Photographe simulé',
    }],
  });
}

function unsplash(u, init) {
  if (!entete(init, 'authorization').startsWith('Client-ID ')) return json({ errors: ['clé absente'] }, 401);
  if (/zzz/i.test(u.searchParams.get('query') || '')) return json({ total: 0, results: [] });
  return json({
    total: 1,
    results: [{
      id: 'simule',
      urls: { regular: 'https://images.unsplash.com/photo-simulee?w=1080&fit=max' },
      links: { html: 'https://unsplash.com/photos/photo-simulee' },
      user: { name: 'Photographe simulé' },
    }],
  });
}

// Wikipédia FR et EN : recherche, lecture d'une page, lien interlangue.
const pageDeTitre = (titre, langue) => PAGES.find((x) => (langue === 'en' ? x.titreEn : x.titre) === titre) || (/zzz/i.test(titre) ? null : trouverPage(titre, langue));

function wikipedia(u) {
  const langue = u.hostname.startsWith('en.') ? 'en' : 'fr';
  const p = u.searchParams;
  if (p.get('list') === 'search') {
    const page = trouverPage(p.get('srsearch') || '', langue);
    return json({ query: { search: page ? [{ ns: 0, title: langue === 'en' ? page.titreEn : page.titre }] : [] } });
  }
  const titre = p.get('titles') || '';
  const page = pageDeTitre(titre, langue);
  if (!page) return json({ query: { pages: { '-1': { ns: 0, title: titre, missing: '' } } } });
  const nom = langue === 'en' ? page.titreEn : page.titre;
  if (p.get('prop') === 'langlinks') {
    return json({ query: { pages: { 1: { pageid: 1, ns: 0, title: nom, langlinks: [{ lang: 'en', '*': page.titreEn }] } } } });
  }
  const sortie = {
    pageid: 1, ns: 0, title: nom, extract: page[langue],
    fullurl: `https://${langue}.wikipedia.org/wiki/` + nom.replace(/ /g, '_'),
  };
  if (page.image) {
    sortie.pageimage = page.image;
    sortie.thumbnail = { source: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/${page.image}/800px-${page.image}`, width: 800, height: 600 };
  }
  return json({ query: { pages: { 1: sortie } } });
}

const fetchReseau = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.hostname === 'fr.wikipedia.org' || u.hostname === 'en.wikipedia.org') return wikipedia(u);
  if (u.hostname === 'api.z.ai') return glm(init);
  if (u.hostname === 'api.pexels.com') return pexels(u, init);
  if (u.hostname === 'api.unsplash.com') return unsplash(u, init);
  return fetchReseau(url, init);
};

// --- Serveur HTTP ----------------------------------------------------------

const env = { DB: fauxD1(), AI: IA, ASSETS, GLM_API_KEY: cleFactice('glm') };
const photos = process.env.KOIOS_LOCAL_PHOTOS;
if (photos === 'pexels') env.PEXELS_KEY = cleFactice('pexels');
if (photos === 'unsplash') env.UNSPLASH_KEY = cleFactice('unsplash');
const ctx = { waitUntil() {} };
const MAX_CORPS = 1024 * 1024;

async function corpsDe(req) {
  const morceaux = [];
  let total = 0;
  for await (const m of req) {
    total += m.length;
    if (total > MAX_CORPS) throw new Error('corps trop gros');
    morceaux.push(m);
  }
  return Buffer.concat(morceaux);
}

const serveur = createServer(async (req, res) => {
  try {
    const entetes = new Headers();
    for (const [nom, valeur] of Object.entries(req.headers)) {
      if (['host', 'connection', 'transfer-encoding', 'cf-connecting-ip'].includes(nom)) continue;
      entetes.set(nom, Array.isArray(valeur) ? valeur.join(', ') : valeur);
    }
    entetes.set('CF-Connecting-IP', req.socket.remoteAddress || '127.0.0.1');
    const sansCorps = req.method === 'GET' || req.method === 'HEAD';
    const corps = sansCorps ? null : await corpsDe(req);
    const request = new Request('http://' + (req.headers.host || 'localhost') + req.url, {
      method: req.method,
      headers: entetes,
      body: corps && corps.length ? corps : undefined,
    });
    const reponse = await worker.fetch(request, env, ctx);
    res.writeHead(reponse.status, Object.fromEntries(reponse.headers));
    res.end(Buffer.from(await reponse.arrayBuffer()));
    console.log(`${req.method} ${req.url} -> ${reponse.status}`);
  } catch (e) {
    console.error(`${req.method} ${req.url} -> 500`, e && e.message);
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ erreur: 'Erreur du serveur local.' }));
  }
});

const port = process.argv[2] === undefined ? 8787 : Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage : node scripts/serveur_local.mjs [port=8787]');
  process.exit(1);
}
serveur.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Le port ${port} est déjà pris. Essaie : node scripts/serveur_local.mjs ${port + 1}` : e.message);
  process.exit(1);
});
serveur.listen(port, () => {
  console.log(`Koîos en local : http://localhost:${port}/  (base en mémoire, IA, GLM, Wikipédia, Pexels et Unsplash simulés)`);
});
