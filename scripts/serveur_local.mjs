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
//   - Unsplash : simulé aussi, mais sans clé par défaut (l'image du parcours vient alors de Wikipédia, créditée via Commons).
//     KOIOS_LOCAL_PHOTOS=unsplash donne une clé factice et fait passer l'image par ce service.
//   - Wikimedia Commons : simulé (aucune clé nécessaire) avec des fichiers qu'il faut écarter (licence non libre, image
//     trop petite) avant la bonne ; une requête contenant « zzz » ou « ambiance » n'y trouve rien (repli sur Unsplash
//     si KOIOS_LOCAL_PHOTOS=unsplash) ;
//   - images : le navigateur ne peut pas joindre Wikimédia, ni Unsplash. Dans les réponses JSON (API et fichiers de
//     contenu/), leurs adresses d'images sont remplacées par des aplats gris neutres servis par ce serveur
//     (/images-simulees/<ton>.svg) : on voit la mise en page, jamais une fausse photo.
// Un palier sur quatre porte une phrase « non confirmée » que le faux vérificateur retire : son statut est « partiel ».
// Une leçon sur six porte un moyen mnémotechnique non confirmé : il est retiré (mnemo null). Une sur sept, un exemple
// non confirmé (null) ; une sur cinq, une carte non confirmée (retirée).
// Les contenus simulés servent à voir l'écran, pas à apprendre. Aucun secret : les clés sont des valeurs calculées.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../worker.js';
import { PROMPT_CHAPITRE, PROMPT_PLAN } from '../lib/sujets.js';
import {
  PROMPT_ETAPE, PROMPT_LECON, PROMPT_MODULE, PROMPT_PALIER, PROMPT_PROGRAMME, PROMPT_PROLONGER, PROMPT_QUIZ, PROMPT_VERIFICATION,
} from '../lib/paliers.js';
import { fauxD1 } from './faux_d1.mjs';
import {
  PAGES, leconSimulee, moduleSimule, palierSimule, planSimule, programmeSimule, prolongementSimule, quizSimule, trouverPage, verificationSimulee,
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
  if (systeme === PROMPT_PROLONGER) return prolongementSimule(demande);
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

// Unsplash : une photo simulée sur les hôtes attendus par lib/images.js (les fichiers n'existent pas).
function unsplash(u, init) {
  if (!entete(init, 'authorization').startsWith('Client-ID ')) return json({ errors: ['clé absente'] }, 401);
  if (/^\/photos\/[^/]+\/download$/.test(u.pathname)) { // appel de download_location exigé par les règles d'Unsplash
    console.log('Unsplash (simulé) : download_location appelé pour', u.pathname.split('/')[2]);
    return json({ url: 'https://images.unsplash.com/photo-simulee' });
  }
  if (/zzz/i.test(u.searchParams.get('query') || '')) return json({ total: 0, results: [] });
  return json({
    total: 1,
    results: [{
      id: 'simule',
      width: 4000,
      height: 2667,
      urls: { regular: 'https://images.unsplash.com/photo-simulee?w=1080&fit=max' },
      links: { html: 'https://unsplash.com/photos/photo-simulee', download_location: 'https://api.unsplash.com/photos/simule/download?ixid=simule' },
      user: { name: 'Photographe simulé', links: { html: 'https://unsplash.com/@photographe-simule' } },
    }],
  });
}

// Wikimedia Commons : exige un User-Agent (comme Wikimédia) ; renvoie d'abord deux fichiers à écarter (licence NC, 640 px de large),
// puis un fichier libre. Tout est inventé : aucun fichier réel.
function commons(u, init) {
  if (!entete(init, 'user-agent').startsWith('Koios/')) return json({ error: { info: 'User-Agent manquant' } }, 403);
  const recherche = u.searchParams.get('gsrsearch') || '';
  if (/zzz|ambiance/i.test(recherche)) return json({ batchcomplete: '' });
  let nombre = 0; // un nom de fichier par requête : les tuiles ne montrent pas toutes le même aplat
  for (const c of recherche) nombre = (nombre * 31 + c.charCodeAt(0)) % 997;
  const fichier = (index, nom, largeur, licence, auteur) => ({
    pageid: 9000 + index, ns: 6, title: 'File:' + nom, index,
    imageinfo: [{
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/s/s${index}/${nom}/1200px-${nom}`,
      thumbwidth: Math.min(1200, largeur), thumbheight: Math.round(Math.min(1200, largeur) * 2 / 3),
      url: `https://upload.wikimedia.org/wikipedia/commons/s/s${index}/${nom}`,
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + nom,
      width: largeur, height: Math.round(largeur * 2 / 3), mime: 'image/jpeg',
      extmetadata: { LicenseShortName: { value: licence }, Artist: { value: auteur }, NonFree: { value: 'false' } },
    }],
  });
  return json({ batchcomplete: '', query: { pages: {
    9001: fichier(1, 'Simule_non_libre.jpg', 3000, 'CC BY-NC 4.0', 'Auteur simulé A'),
    9002: fichier(2, 'Simule_petit.jpg', 640, 'CC BY-SA 4.0', 'Auteur simulé B'),
    9003: fichier(3, `Simule_libre_${nombre}.jpg`, 3000, 'CC BY-SA 4.0', '<a href="//commons.wikimedia.org/wiki/User:Auteur_simule">Auteur simulé</a>'),
  } } });
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
  if (u.hostname === 'api.unsplash.com') return unsplash(u, init);
  if (u.hostname === 'commons.wikimedia.org') return commons(u, init);
  return fetchReseau(url, init);
};

// --- Serveur HTTP ----------------------------------------------------------

const env = { DB: fauxD1(), AI: IA, ASSETS, GLM_API_KEY: cleFactice('glm') };
const photos = process.env.KOIOS_LOCAL_PHOTOS;
if (photos === 'unsplash') env.UNSPLASH_KEY = cleFactice('unsplash');
const ctx = { waitUntil() {} };

// Aplats gris neutres pour les images simulées : quatre tons, choisis selon l'adresse d'origine. Aucun motif, aucun texte.
const TONS = ['c4c9cf', 'b3b9c1', 'a4abb4', 'd0d4d9'];
const HOTES_IMAGES = /https:\/\/(?:upload\.wikimedia\.org|images\.unsplash\.com|commons\.wikimedia\.org\/wiki\/Special:FilePath)\/[^"\\]*/g;
function imagesLocales(texte) {
  return texte.replace(HOTES_IMAGES, (adresse) => {
    let h = 0;
    for (const c of adresse) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `/images-simulees/${h % TONS.length}.svg`;
  });
}
function aplat(n) {
  const ton = TONS[Number(n) % TONS.length] || TONS[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800"><rect width="1200" height="800" fill="#${ton}"/></svg>`;
}
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
    const aplatDemande = /^\/images-simulees\/(\d)\.svg$/.exec(new URL(request.url).pathname);
    const reponse = aplatDemande
      ? new Response(aplat(aplatDemande[1]), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } })
      : await worker.fetch(request, env, ctx);
    const enTetes = Object.fromEntries(reponse.headers);
    let octets = Buffer.from(await reponse.arrayBuffer());
    if (/json/.test(enTetes['content-type'] || '')) octets = Buffer.from(imagesLocales(octets.toString('utf8')), 'utf8');
    res.writeHead(reponse.status, enTetes);
    res.end(octets);
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
  console.log(`Koîos en local : http://localhost:${port}/  (base en mémoire, IA, GLM, Wikipédia, Commons et Unsplash simulés ; images = aplats gris)`);
});
