// Serveur local de Koîos : essayer l'app de bout en bout sans Cloudflare.
//   node scripts/serveur_local.mjs [port=8787]
// Sert app/ (index.html sur /) et confie /api/* à worker.js, avec un faux environnement :
//   - DB : SQLite en mémoire (node:sqlite), interface D1 (scripts/faux_d1.mjs) ; tout repart de zéro à chaque lancement ;
//   - AI : IA simulée qui renvoie un plan ou un chapitre valide, aux titres tirés du sujet demandé ;
//   - Wikipédia : `fetch` remplacé par un Wikipédia simulé (aucun appel réseau ; une requête contenant « zzz » ne
//     trouve rien, pour voir l'ancrage « aucun »).
// Les contenus simulés sont faux : ils servent à voir l'écran, pas à apprendre. Aucun secret.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../worker.js';
import { PROMPT_CHAPITRE, PROMPT_PLAN } from '../lib/sujets.js';
import { sansAccents } from '../lib/wiki.js';
import { fauxD1 } from './faux_d1.mjs';

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

// --- IA simulée ------------------------------------------------------------

const coupe = (texte, n) => (texte.length > n ? texte.slice(0, n - 1).trimEnd() + '…' : texte);
const reponseIA = (objet) => ({ response: JSON.stringify(objet) });

function planSimule(sujet) {
  const S = coupe(sujet, 50);
  const aspects = ['les origines', 'les grandes dates', 'les acteurs', 'les lieux', 'les techniques', 'les chiffres clés', 'les idées reçues', 'l’héritage'];
  return {
    resume: `« ${S} » est un sujet simulé par le serveur local. Cette IA factice écrit un plan et des chapitres de forme valide, pour essayer l’écran.`,
    plan: aspects.map((a) => ({ titre: `${S} : ${a}`, resume: `Ce chapitre simulé aborde ${a} de « ${S} ».` })),
    approfondir: ['histoire', 'personnages', 'vocabulaire', 'controverses', 'anecdotes', 'aujourd’hui'].map((x) => `${S} : ${x}`),
  };
}

function chapitreSimule(sujet, titre, numero) {
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

const IA = {
  async run(modele, { messages }) {
    await new Promise((fin) => setTimeout(fin, 250)); // un peu de patience, comme avec un vrai modèle
    const [systeme, demande] = [messages[0].content, messages[1].content];
    if (systeme === PROMPT_PLAN) {
      return reponseIA(planSimule(/Sujet du joueur : « ([^\n]*) »\n/.exec(demande)[1]));
    }
    if (systeme === PROMPT_CHAPITRE) {
      const sujet = /Sujet : « ([^\n]*) » \(niveau/.exec(demande)[1];
      const [, numero, titre] = /Chapitre à écrire : n° (\d+), « ([^\n]*) » — /.exec(demande);
      return reponseIA(chapitreSimule(sujet, titre, Number(numero)));
    }
    throw new Error('demande inconnue du faux modèle ' + modele);
  },
};

// --- Wikipédia simulé ------------------------------------------------------

const PAGES = [
  {
    titre: 'Tour Eiffel',
    texte: 'La tour Eiffel est une tour de fer puddlé construite à Paris pour l’Exposition universelle de 1889. Elle porte le nom de l’ingénieur Gustave Eiffel, dont l’entreprise la réalise. Haute de 312 mètres à l’origine, elle reste la plus haute construction du monde jusqu’en 1930. (Texte simulé.)',
    image: 'Tour_Eiffel_Wikimedia_Commons.jpg',
    vignette: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/800px-Tour_Eiffel_Wikimedia_Commons.jpg',
  },
  { titre: 'Gustave Eiffel', texte: 'Gustave Eiffel est un ingénieur français, né à Dijon en 1832. Son entreprise construit de nombreux ponts et viaducs métalliques avant la tour qui porte son nom. Il consacre la fin de sa vie à la météorologie et à l’aérodynamique, dans un laboratoire installé au pied de la tour. (Texte simulé.)' },
  { titre: 'Mont Blanc', texte: 'Le mont Blanc est le plus haut sommet des Alpes, à la frontière entre la France et l’Italie. Son altitude dépasse 4 800 mètres. Sa première ascension est réalisée en 1786, et le massif attire aujourd’hui alpinistes et randonneurs venus du monde entier. (Texte simulé.)' },
  { titre: 'Sparte', texte: 'Sparte est une cité de la Grèce antique, dans le Péloponnèse, connue pour son organisation militaire et son éducation exigeante. Rivale d’Athènes, elle domine le Péloponnèse pendant plusieurs siècles avant de perdre sa puissance. (Texte simulé.)' },
];

function trouverPage(requete) {
  const q = sansAccents(requete);
  if (/zzz/.test(q)) return null;
  // Page connue citée le plus tôt dans la requête (« Gustave Eiffel La tour Eiffel » -> Gustave Eiffel).
  const connues = PAGES.map((p) => ({ p, rang: q.indexOf(sansAccents(p.titre)) })).filter((x) => x.rang !== -1);
  if (connues.length) return connues.sort((a, b) => a.rang - b.rang)[0].p;
  const mots = requete.split(':')[0].trim().split(/\s+/).slice(0, 4).join(' ');
  const titre = mots.charAt(0).toUpperCase() + mots.slice(1);
  return {
    titre,
    texte: [
      `${titre} est un sujet que cette page simulée décrit pour essayer l’application. Elle ne contient aucun fait réel.`,
      'Le serveur local remplace Wikipédia par ce texte : il permet de voir l’ancrage, les sources et l’affichage sans accès au réseau.',
      'Une requête contenant « zzz » ne trouve aucune page, ce qui donne un sujet ou un chapitre sans ancrage.',
    ].join('\n\n'),
  };
}

const jsonWiki = (objet) => new Response(JSON.stringify(objet), { status: 200, headers: { 'content-type': 'application/json' } });
const fetchReseau = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (u.hostname !== 'fr.wikipedia.org') return fetchReseau(url, init);
  const p = u.searchParams;
  if (p.get('list') === 'search') {
    const page = trouverPage(p.get('srsearch') || '');
    return jsonWiki({ query: { search: page ? [{ ns: 0, title: page.titre }] : [] } });
  }
  const titre = p.get('titles') || '';
  const page = PAGES.find((x) => x.titre === titre) || (/zzz/i.test(titre) ? null : trouverPage(titre));
  if (!page) return jsonWiki({ query: { pages: { '-1': { ns: 0, title: titre, missing: '' } } } });
  const sortie = { pageid: 1, ns: 0, title: page.titre, extract: page.texte, fullurl: 'https://fr.wikipedia.org/wiki/' + page.titre.replace(/ /g, '_') };
  if (page.image) sortie.pageimage = page.image;
  if (page.vignette) sortie.thumbnail = { source: page.vignette, width: 800, height: 600 };
  return jsonWiki({ query: { pages: { 1: sortie } } });
};

// --- Serveur HTTP ----------------------------------------------------------

const env = { DB: fauxD1(), AI: IA, ASSETS };
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
  console.log(`Koîos en local : http://localhost:${port}/  (base en mémoire, IA et Wikipédia simulés)`);
});
