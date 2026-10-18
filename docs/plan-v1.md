# Plan de la V1 (décidé le 18 octobre 2026)

## Choix de Greg

- Sujets libres : le Rival les écrit en direct (IA gratuite Cloudflare), marqués « brouillon non vérifié », vérification à la demande ensuite.
- Catalogue vérifié : le plus large possible, sur tous les domaines (Histoire et géographie, Sciences et nature, Arts et culture, Gemmologie et joaillerie). Greg peut fournir des documents de gemmologie.
- Progression en ligne dès la V1 (base Cloudflare D1).
- Style : bibliothèque de qualité, tons bois et cuir, plus une touche de cathédrale gothique bien présente, fine et élancée (arcs brisés, lettrines enluminées, rosace). Pour adultes.

## Architecture

- `app/` : l'application (une seule page, JavaScript sans étape de construction), servie comme fichiers statiques par le Worker Cloudflare « koios » (déploiement automatique `npx wrangler deploy` à chaque envoi sur `main`).
- `app/contenu/` : chapitres vérifiés en JSON (fiche « L'essentiel » + repères + 3 exercices + sources, 2 sources institutionnelles au moins par notion).
- `worker.js` : point d'entrée ; il confie `/api/...` aux fonctions de `functions/api/` (joueur, progression, cercle, sujet libre, signalements) et laisse Cloudflare servir le reste de `app/`.
- `schema.sql` : tables D1, créées automatiquement au premier appel.
- `wrangler.toml` : `main = "worker.js"`, `[assets] directory = "./app"`, liaison D1 `DB` (base « koios »), liaison IA `AI`. Le projet Cloudflare est un Worker, pas un projet Pages (vérifié le 18 octobre 2026).

## Étapes

1. Greg crée la base D1 « koios » dans Cloudflare et envoie son identifiant.
2. Rédacteurs (Sonnet, en parallèle) : 4 chapitres vérifiés par domaine, au format JSON commun.
3. Moteur de l'app : bibliothèque, formation, chapitre (fiche, exercices, bilan, révision ciblée), profil, style v4 gothique.
4. Fonctions et base : joueur et progression en ligne, sujet libre (brouillon), défis par lien.
5. Tests, relecture à froid, publication.

## Vérifié

- Configuration Worker validée par `wrangler deploy --dry-run` (liaisons DB, AI, ASSETS).

## À vérifier en conditions réelles

- Création des tables D1 au premier appel, quotas, classement.
- Qualité en français des brouillons Workers AI (Llama 3.3 70B, repli Mistral Small 3.1).
