// À lancer avant chaque mise en ligne : node scripts/version.mjs
// Écrit un horodatage (UTC) dans app/version.js. Le service worker nomme son cache d'après lui : sans changement, les téléphones gardent l'ancienne coquille.
import { writeFileSync } from 'node:fs';

const d = new Date();
const p = (n, l = 2) => String(n).padStart(l, '0');
const version = `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
const fichier = new URL('../app/version.js', import.meta.url);
writeFileSync(fichier, `/* Numéro de version de l'app. Le service worker (sw.js) l'importe : il nomme son cache d'après lui, donc changer ce numéro à chaque mise en ligne
   fait remplacer les fichiers gardés hors ligne (les leçons déjà lues, elles, restent). Fichier écrit par scripts/version.mjs : ne pas l'éditer à la main. */
self.KOIOS_VERSION = "${version}";
`);
console.log('Version : ' + version);
