# API v2 de Koîos : parcours sans fin, paliers recoupés par 2 IA, images, quiz

S'ajoute à l'API existante (docs/api.md) ; les routes V1 et V1.1 restent en place. Même style : `functions/api/<route>.js`, ajout dans `worker.js`, JSON, erreurs `{erreur}` en français, quotas par jour UTC, cache D1 partagé entre tous les lecteurs (un contenu n'est rédigé qu'une fois).

## Fournisseurs (secrets Cloudflare, jamais dans le dépôt)

- Rédaction : GLM si `env.GLM_API_KEY` (API compatible OpenAI, `POST https://api.z.ai/api/paas/v4/chat/completions`, modèle `env.GLM_MODELE` ou `glm-4.7-flash` par défaut, `Authorization: Bearer <clé>`, délai 60 s) ; sinon Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- Vérification : toujours une IA d'un autre fournisseur que la rédaction : Workers AI `@cf/mistralai/mistral-small-3.1-24b-instruct` (repli `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) quand GLM rédige ; GLM quand Workers AI rédige et que la clé existe ; sinon Mistral (Workers AI) vérifie Llama (Workers AI). Champ `verification.ia` = noms des deux modèles.
- Images : Pexels si `env.PEXELS_KEY` (`GET https://api.pexels.com/v1/search?query=<q>&per_page=3&orientation=landscape`, en-tête `Authorization: <clé>`), sinon Unsplash si `env.UNSPLASH_KEY` (`GET https://api.unsplash.com/search/photos?query=<q>&per_page=3&orientation=landscape&content_filter=high`, en-tête `Authorization: Client-ID <clé>` ; crédit avec liens `?utm_source=koios&utm_medium=referral`), sinon image de la page Wikipédia. `image = { src, alt, credit, lien }` (`credit` : « Photo : <auteur> sur Pexels », « … sur Unsplash » ou « Image : Wikimédia »). Requête d'image en anglais (champ `motImage` produit par l'IA). Les images de palier précises viennent de Wikipédia (Commons) ; la photo de tête d'un parcours vient de Pexels ou Unsplash.
- Sources : Wikipédia FR et EN (recherche + extrait, comme lib/wiki.js ; 6 000 caractères au plus par langue), plus les pages de référence citées. `User-Agent: Koios/2.0 (https://koios.gregoire-muel.workers.dev)`.

## Tables (ajout)

- `parcours(id TEXT PRIMARY KEY, titre TEXT, contenu TEXT, auteur TEXT, vues INTEGER DEFAULT 0, cree TEXT)` : `contenu` = `{ resume, image, motImage, etapes: [{ numero, titre, paliers: [{ numero, titre }] }], sources }`.
- `paliers(id TEXT PRIMARY KEY, parcours TEXT, numero INTEGER, contenu TEXT, vues INTEGER DEFAULT 0, cree TEXT)`, index sur `parcours`.
- `quiz_direct(parcours TEXT PRIMARY KEY, contenu TEXT, cree TEXT)`.

Identifiants : parcours `slug(titre)` (40 caractères au plus, `[a-z0-9-]`) ; palier `<parcours>:<numero>`.

## Routes

1. `POST parcours { titre }` (auth) : renvoie l'existant sans rien générer ; sinon quota 10/jour/lecteur et 80/jour au total, puis : sources, plan de l'étape 1 (10 paliers progressifs, du général au précis, titres courts), `resume` (2 phrases), `motImage` (anglais), image de tête. → `{ parcours }` = `{ id, titre, resume, image, etapes, sources }`.
2. `GET parcours?id=` → `{ parcours }` (404 sinon) ; `GET parcours` → `{ parcours: [{ id, titre, image, vues, paliers }] }`, 60 plus lus.
3. `GET palier?parcours=<id>&n=<k>` : en cache → `{ palier }` (public). Sinon auth + quota 30/jour/lecteur et 300/jour au total. Si `k` dépasse le plan, génère d'abord le plan de l'étape suivante (10 paliers plus pointus, sans répéter les titres existants), l'enregistre dans le parcours. `k` de 1 à 500.
   `palier` = `{ id, parcours, numero, etape, titre, image, sections: { enBref, comment, pourquoi, ouQuand }, definitions: [{ terme, definition }], frise: [{ date, evenement }], chiffres: [{ libelle, valeur, unite }], notions: { noeuds, liens }, histoire, questions, sources, verification }`.
   - `sections` : 2 à 4 phrases chacune, en français simple et précis ; une section sans matière vaut `null` (au moins `enBref` et une autre).
   - `definitions` : 2 à 5 termes du palier. `frise` : 0 ou 3 à 6 dates. `chiffres` : 0 ou 3 à 6 valeurs numériques, même unité. `notions` : facultatif (4 à 7 nœuds, 3 à 8 liens). `histoire` : une anecdote ou un fait historique sourcé, ou `null`.
   - `questions` : 4 questions sur ce palier : 2 `{ type: "qcm", enonce, reponses: [4], bonne, explication }`, 1 `{ type: "vraifaux", affirmation, vrai, explication }`, 1 `{ type: "qcm", … }` plus difficile. `explication` : pourquoi la bonne réponse est juste (et pourquoi les autres non), 1 à 3 phrases.
   - `sources` : `[[titre, url]]` des pages réellement utilisées.
   - Vérification : la 2e IA reçoit les extraits et la liste numérotée de toutes les affirmations (phrases des sections, définitions, dates, chiffres, histoire, bonnes réponses et explications) et renvoie `{ "nonConfirmees": [numéros] }`. Ce qui n'est pas confirmé est retiré (une question dont la réponse n'est pas confirmée est retirée). Si plus de 40 % est retiré ou s'il reste moins de 2 questions : une nouvelle rédaction, puis on garde la meilleure. `verification = { ia: [rédacteur, vérificateur], affirmations, retirees, statut: "recoupe" (rien retiré) | "partiel" }`.
4. `GET quiz?parcours=<id>&n=10&graine=<entier>` → `{ questions: [{ palier, titre, index, question }] }` tirées des paliers en cache du parcours, de façon déterministe. S'il y en a moins de 5 : `POST quiz-direct { parcours }` (auth, quota 10/jour/lecteur, mis en cache par parcours) génère 10 questions avec explications à partir des sources du parcours, vérifiées de la même façon → `{ questions }` au même format (`palier: "<id>:quiz"`).
5. Duels : accepter aussi les références `{ chapitre: "<parcours>:<k>", index }` (palier en cache) et `{ chapitre: "<parcours>:quiz", index }`.
6. `PUT progression` : `points` = `etat.xp` borné à 0-1 000 000 (au lieu de la somme des chapitres) ; `valides` = nombre de paliers terminés (`etat.parcours[*].fait`, borné).

## Test local

`scripts/serveur_local.mjs` simule aussi GLM (fetch vers api.z.ai), Pexels, Unsplash et Wikipédia, pour une démonstration crédible de bout en bout. `scripts/test_api.mjs` couvre chaque nouvelle route et la vérification (affirmations retirées, nouvelle rédaction, statut).
