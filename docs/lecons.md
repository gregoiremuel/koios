# Leçons

Une ligne par piège rencontré, la plus récente en haut.

- 2026-10-20 : si `app/version.js` ne change pas, les téléphones gardent l'ancienne coquille. Avant chaque mise en ligne, lancer `node scripts/version.mjs` (il écrit un horodatage dans `app/version.js`). Le service worker prend aussi `index.html`, `app.js`, `logique.js` et `style.css` en réseau d'abord.
- 2026-10-18 : la v2 « librairie ludique » a été jugée trop enfantine (gros boutons en capitales, émojis, confettis, mascotte). Pour un public adulte : typographie de livre, traits fins, icônes au trait, Rival en annotation de marge, contenu en mode formation.
- 2026-10-18 : `verifier.py` ne lisait pas les textes injectés en JavaScript ; il lit maintenant les chaînes entre guillemets des scripts.

- 2026-10-18 : l'aperçu Claude (artifact) bloque les images d'autres sites et ajoute lui-même l'en-tête du document ; le vrai site a besoin d'un `index.html` complet. On publie dans l'aperçu une copie sans en-tête.
- 2026-10-18 : les émojis Fluent « Color » ont des dégradés et des couleurs néon qui jurent avec le reste ; on prend les « Flat », recolorés dans la palette.
- 2026-10-18 : Wikimedia, Unsplash et les pages de fichiers Commons sont injoignables depuis l'espace de travail ; utiliser les liens `Special:FilePath/<fichier>?width=800`, qui marchent sur le vrai site.
- 2026-10-18 : appeler focus() sur un bouton seulement après l'avoir inséré dans la page, sinon le focus retombe sur le corps de page.

- 2026-10-18 : une barre de minuteur animée en CSS doit être relancée après un recalcul de mise en page (`getBoundingClientRect()`), sinon elle saute directement à la fin.
- 2026-10-18 : un mot composé avec trait d'union (« s'ouvrent-ils ») se coupe en fin de ligne ; utiliser le trait d'union insécable (U+2011).
- 2026-10-18 : depuis l'espace cloud de Claude, on ne peut pas créer de dépôt GitHub ; Greg le crée sur github.com/new, puis on le relie à la session.
- 18 octobre 2026 : le projet Cloudflare de Koîos est un **Worker** (Workers Builds, `npx wrangler deploy` sur `main`), pas un projet Pages. Vérifier le type de projet (capture de l'onglet Settings) avant d'écrire `wrangler.toml` ; tester avec `npx wrangler deploy --dry-run`.
- 18 octobre 2026 : un message de Greg envoyé pendant un travail peut arrêter les sous-agents en cours ; vérifier leurs fichiers et les relancer si besoin.
- 18 octobre 2026 : un script de typographie qui touche aux éléments d'une frise doit aussi corriger les clés de `valeurs` (sinon le chapitre est refusé).
- 19 octobre 2026 : GitHub ne déclenche plus les constructions Cloudflare (une seule construction le 18 au matin) ; on publie avec `npx wrangler deploy` et la clé de Greg (domaine `api.cloudflare.com` autorisé). Pour rétablir l'automatisme : déconnecter puis reconnecter le dépôt dans Cloudflare.
- 19 octobre 2026 : `pkill -f motif` ou `pgrep -f motif` dans une commande qui contient le motif tue son propre shell ; écrire `[s]erveur` et ne pas répéter le motif ailleurs dans la commande.
- 19 octobre 2026 : deux écrans qui créent le compte en même temps font deux joueurs ; mémoriser la promesse de création.
