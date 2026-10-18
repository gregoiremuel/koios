# API de Koîos (Worker Cloudflare)

`worker.js` confie `/api/<route>` au fichier `functions/api/<route>.js` (gestionnaires `onRequestGet`, `onRequestPost`, `onRequestPut` avec `({ request, env })`). Réponses JSON, erreurs `{ "erreur": "…" }` en français. Authentification : en-tête `Authorization: Bearer <id>.<cle>`.

## V1 (en place)

`GET etat` · `POST joueur` · `GET|PUT progression` · `GET cercle` · `POST libre` · `POST signalement` (voir le code).

## V1.1 : sujets sans fin, chapitres IA ancrés, mélange, duels

Principe : un sujet créé par un lecteur est rédigé une seule fois par l'IA puis **partagé avec tous** (cache D1). La bibliothèque grandit avec l'usage et le quota gratuit de Workers AI sert à du neuf. Wikipédia (français) sert de **point de départ** pour limiter les inventions de l'IA, jamais de preuve : tout chapitre IA reste marqué « brouillon ».

### Tables (ajout)

- `sujets(id TEXT PRIMARY KEY, titre TEXT, parent TEXT, niveau INTEGER, contenu TEXT, auteur TEXT, vues INTEGER DEFAULT 0, cree TEXT)` ; index sur `parent`.
- `chapitres_ia(id TEXT PRIMARY KEY, sujet TEXT, numero INTEGER, contenu TEXT, vues INTEGER DEFAULT 0, cree TEXT)` ; index sur `sujet`.
- `duels(id TEXT PRIMARY KEY, createur TEXT, questions TEXT, scores TEXT, cree TEXT)`.

### Identifiants

- Sujet : `slug(titre)` (minuscules sans accents, `[a-z0-9-]`, 40 caractères au plus) ; sous-sujet : `<id du parent>.<slug(titre)>`. 160 caractères au plus (sinon 400 « Sujet trop profond »).
- Chapitre IA : `ia:<id du sujet>:<numero>`.

### Routes

1. `GET sujets?parent=<id>` (sans `parent` : sujets racine) → `{ sujets: [{ id, titre, resume, niveau, vues }] }`, 60 au plus, par vues décroissantes. Public.
2. `GET sujet?id=<id>` → `{ sujet }` ou 404 ; incrémente `vues`. Public.
3. `POST sujet { titre, parent? }` (auth) : si l'id existe, renvoie `{ sujet }` sans rien générer. Sinon quota 10/jour/lecteur et 80/jour au total, puis génération. Titre de 2 à 80 caractères ; `parent` doit exister.
   `sujet = { id, titre, parent, niveau (1 découverte, 2 approfondissement, 3 expert ; niveau du parent + 1, plafonné à 3), resume (2 phrases), plan: [{ numero, titre, resume }] (8 chapitres, du général au pointu), approfondir: [5 à 8 titres de sous-sujets plus précis], image: { src, alt, credit, page } | null, sources: [["Wikipédia · <titre de page>", url]], ancrage: "wikipedia" | "aucun", brouillon: true }`.
4. `GET chapitre-ia?sujet=<id>&n=<k>` ou `GET chapitre-ia?id=ia:<sujet>:<k>` : en cache → `{ chapitre }` (public). Sinon auth + quota 15/jour/lecteur et 100/jour au total, génération, mise en cache. 404 si le sujet ou le numéro n'existe pas.
   `chapitre` = format de `docs/format-chapitre.md` avec `id`, `domaine: "libre"`, `sujetId`, `sujetTitre`, `numero`, `titre` (celui du plan), `brouillon: true`, `ancrage`, `sources` (pages Wikipédia utilisées, aussi recopiées dans chaque exercice), `figure` (image de la page Wikipédia, sinon null), et si valides : `chiffres`, `notions`, `saviezVous`. Jamais de `citation` pour un chapitre IA.
5. `GET melange?n=10&graine=<entier>` → `{ questions: [{ chapitre, titre, sujetTitre, index, exercice }] }` tirées des chapitres IA en cache, de façon déterministe selon `graine` ; `n` de 1 à 20. Public.
6. `POST duel { questions: [{ chapitre, index }] (5 à 20), score: { justes, n, points } }` (auth) → `{ id }` (8 caractères). `GET duel?id=` → `{ duel: { id, createur (pseudo), questions, scores: [{ pseudo, justes, n, points, date }] } }`. `PUT duel { id, score }` (auth) : ajoute ou remplace le score de ce lecteur. `GET duels` (auth) → `{ duels: [{ id, createur, scores, cree }] }`, 20 derniers où le lecteur a joué.

### Ancrage Wikipédia (`lib/wiki.js`)

- Recherche : `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=<q>&srlimit=3&format=json&utf8=1` ; puis texte et image de la meilleure page : `action=query&prop=extracts|pageimages|info&explaintext=1&piprop=thumbnail|name&pithumbsize=800&inprop=url&titles=<titre>&format=json&redirects=1`.
- En-tête `User-Agent: Koios/1.1 (https://koios.gregoire-muel.workers.dev)` ; délai 6 s ; en cas d'échec, `ancrage: "aucun"`.
- Texte tronqué à 7 000 caractères. Image : `src` = vignette, `page` = `https://fr.wikipedia.org/wiki/Fichier:<nom>`, `credit` = « Image : Wikimédia, auteur et licence sur la page du fichier ».
- Consigne à l'IA : n'utiliser que les faits du texte fourni ; ce qui n'y figure pas n'est pas écrit.

### Test local

`node scripts/serveur_local.mjs [port]` : sert `app/` et `/api/*` avec une base SQLite en mémoire, une IA simulée et un Wikipédia simulé, pour essayer l'app de bout en bout sans Cloudflare.
