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
import * as fiche from './functions/api/fiche.js';
import * as quizGeneral from './functions/api/quiz-general.js';
import * as jour from './functions/api/jour.js';
import * as diagnostic from './functions/api/diagnostic.js';
import * as tournoi from './functions/api/tournoi.js';
import * as groupe from './functions/api/groupe.js';
import * as partie from './functions/api/partie.js';
import * as variante from './functions/api/variante.js';
import * as admin from './functions/api/admin.js';
import * as cleIa from './functions/api/cle-ia.js';
import * as compte from './functions/api/compte.js';
import * as amis from './functions/api/amis.js';
import * as question from './functions/api/question.js';
import * as documents from './functions/api/documents.js';
import { traiterFile } from './lib/nuit.js';

const ROUTES = {
  diagnostic,
  etat, joueur, progression, cercle, libre, signalement,
  sujets, sujet, 'chapitre-ia': chapitreIa, melange, duel, duels, image: imageRoute,
  parcours, palier, quiz, 'quiz-direct': quizDirect, glossaire, fiche,
  'quiz-general': quizGeneral, jour, tournoi, groupe, partie, variante, admin, 'cle-ia': cleIa, compte, amis, question, documents,
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

  // Cron (wrangler.toml, toutes les 5 minutes) : un petit morceau de la file, la nuit ou si l'admin autorise la journée (lib/nuit.js).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(traiterFile(env).then(
      (bilan) => console.log('File de nuit :', JSON.stringify(bilan)),
      (e) => console.error('File de nuit : échec', e && e.message),
    ));
  },
};
