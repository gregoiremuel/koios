// Point d'entrée du Worker Cloudflare de Koîos.
// Les fichiers de app/ sont servis directement par Cloudflare (liaison ASSETS) ;
// seules les adresses /api/... arrivent ici et sont confiées aux fonctions de functions/api/.
import * as etat from './functions/api/etat.js';
import * as joueur from './functions/api/joueur.js';
import * as progression from './functions/api/progression.js';
import * as cercle from './functions/api/cercle.js';
import * as libre from './functions/api/libre.js';
import * as signalement from './functions/api/signalement.js';

const ROUTES = { etat, joueur, progression, cercle, libre, signalement };

function erreur(statut, message) {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/api\/([a-z]+)\/?$/);
    if (m) {
      const module = ROUTES[m[1]];
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
