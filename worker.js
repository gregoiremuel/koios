// Point d'entrée du Worker Cloudflare de Koîos.
// Les fichiers de app/ sont servis directement par Cloudflare (liaison ASSETS) ;
// seules les adresses /api/... arrivent ici et sont confiées aux fonctions de functions/api/.
import * as etat from './functions/api/etat.js';
import * as joueur from './functions/api/joueur.js';
import * as progression from './functions/api/progression.js';
import * as cercle from './functions/api/cercle.js';
import * as libre from './functions/api/libre.js';
import * as signalement from './functions/api/signalement.js';
import * as sujets from './functions/api/sujets.js';
import * as sujet from './functions/api/sujet.js';
import * as chapitreIa from './functions/api/chapitre-ia.js';
import * as melange from './functions/api/melange.js';
import * as duel from './functions/api/duel.js';
import * as duels from './functions/api/duels.js';
import * as imageRoute from './functions/api/image.js';
import * as parcours from './functions/api/parcours.js';
import * as palier from './functions/api/palier.js';
import * as quiz from './functions/api/quiz.js';
import * as quizDirect from './functions/api/quiz-direct.js';
import * as glossaire from './functions/api/glossaire.js';
import * as quizGeneral from './functions/api/quiz-general.js';
import * as jour from './functions/api/jour.js';
import * as tournoi from './functions/api/tournoi.js';
import * as groupe from './functions/api/groupe.js';
import * as partie from './functions/api/partie.js';

const ROUTES = {
  etat, joueur, progression, cercle, libre, signalement,
  sujets, sujet, 'chapitre-ia': chapitreIa, melange, duel, duels, image: imageRoute,
  parcours, palier, quiz, 'quiz-direct': quizDirect, glossaire,
  'quiz-general': quizGeneral, jour, tournoi, groupe, partie,
};

function erreur(statut, message) {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/([a-z-]+)\/?$/);
    if (m) {
      const module = Object.hasOwn(ROUTES, m[1]) ? ROUTES[m[1]] : null;
      if (!module) return erreur(404, 'Adresse inconnue.');
      const methode = request.method.charAt(0) + request.method.slice(1).toLowerCase();
      const gestionnaire = module['onRequest' + methode] || module.onRequest;
      if (!gestionnaire) return erreur(405, 'Méthode non permise.');
      return gestionnaire({ request, env, params: {}, waitUntil: (p) => ctx.waitUntil(p) });
    }
    if (url.pathname.startsWith('/api/')) return erreur(404, 'Adresse inconnue.');
    return env.ASSETS.fetch(request);
  },
};
