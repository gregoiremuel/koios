/* Koîos : service worker (mode hors ligne).
   - La coquille de l'app (page, scripts, styles, icônes) est gardée dans un cache nommé d'après app/version.js : une nouvelle version la remplace.
   - Les leçons déjà lues (GET /api/palier réussis) et les formations ouvertes (GET /api/parcours?id=) vont dans un cache à part, gardé d'une version à l'autre.
   - Hors ligne, une leçon déjà lue s'ouvre ; une autre répond « Hors ligne ». Les écritures (POST, PUT) ne sont jamais interceptées : elles
     échouent proprement, l'app garde alors la progression sur le téléphone. Aucune clé, aucun secret ici. */
importScripts("version.js");
var VERSION = self.KOIOS_VERSION || "dev";
var CACHE_APP = "koios-app-" + VERSION;
var CACHE_LECONS = "koios-lecons";
var COQUILLE = ["/", "/style.css", "/app.js", "/logique.js", "/icones.js", "/visuels.js", "/manifest.webmanifest", "/icone.svg", "/icone-192.png", "/contenu/parcours.json"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE_APP).then(function (c) {
    return Promise.all(COQUILLE.map(function (u) { return c.add(new Request(u, { cache: "reload" })).catch(function () { /* un fichier absent ne bloque pas l'installation */ }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (noms) {
    return Promise.all(noms.filter(function (n) { return n.indexOf("koios-app-") === 0 && n !== CACHE_APP; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Réseau d'abord ; une réponse réussie est gardée ; sans réseau, la copie gardée, sinon un message clair (statut 504). */
function reseauPuisCache(e, requete) {
  return fetch(requete).then(function (rep) {
    if (rep.ok) {
      var copie = rep.clone();
      e.waitUntil(caches.open(CACHE_LECONS).then(function (c) { return c.put(requete.url, copie); }).catch(function () { /* cache plein : sans effet */ }));
    }
    return rep;
  }, function () {
    return caches.open(CACHE_LECONS).then(function (c) { return c.match(requete.url); }).then(function (rep) {
      return rep || new Response(JSON.stringify({ erreur: "Hors ligne\u00a0: cette leçon n’a pas encore été lue sur cet appareil." }), { status: 504, headers: { "content-type": "application/json; charset=utf-8" } });
    });
  });
}

/* Coquille : la copie gardée tout de suite, remise à jour en arrière-plan ; sinon le réseau. */
function coquille(e, requete) {
  return caches.open(CACHE_APP).then(function (c) {
    return c.match(requete).then(function (gardee) {
      var reseau = fetch(requete).then(function (rep) {
        if (rep && rep.ok) { var copie = rep.clone(); e.waitUntil(c.put(requete, copie).catch(function () { /* sans effet */ })); }
        return rep;
      });
      if (gardee) { reseau.catch(function () { /* hors ligne : la copie gardée suffit */ }); return gardee; }
      return reseau;
    });
  });
}

self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return; // écritures : réseau seul, elles échouent proprement hors ligne
  var url = new URL(r.url);
  if (url.origin !== self.location.origin) return; // polices et photos d'ailleurs : le navigateur s'en charge
  if (url.pathname === "/api/palier" || (url.pathname === "/api/parcours" && url.searchParams.has("id"))) { e.respondWith(reseauPuisCache(e, r)); return; }
  if (url.pathname.indexOf("/api/") === 0) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).catch(function () { return caches.open(CACHE_APP).then(function (c) { return c.match("/"); }); }));
    return;
  }
  e.respondWith(coquille(e, r));
});
