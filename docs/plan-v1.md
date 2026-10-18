# Plan de la V1 (décidé le 18 octobre 2026)

## Choix de Greg

- Sujets libres : le Rival les écrit en direct (IA gratuite Cloudflare), marqués « brouillon non vérifié », vérification à la demande ensuite.
- Catalogue vérifié : le plus large possible, sur tous les domaines (Histoire et géographie, Sciences et nature, Arts et culture, Gemmologie et joaillerie). Greg peut fournir des documents de gemmologie.
- Progression en ligne dès la V1 (base Cloudflare D1).
- Style : bibliothèque de qualité, tons bois et cuir, plus une touche de cathédrale gothique bien présente, fine et élancée (arcs brisés, lettrines enluminées, rosace). Pour adultes.

## Architecture

- `app/` : l'application (une seule page, JavaScript sans étape de construction), servie par Cloudflare Pages.
- `app/contenu/` : chapitres vérifiés en JSON (fiche « L'essentiel » + repères + 3 exercices + sources, 2 sources institutionnelles au moins par notion).
- `functions/api/` : fonctions Cloudflare (joueur, progression, sujet libre, défis par lien, signalements).
- `schema.sql` : tables D1, créées automatiquement au premier appel.
- `wrangler.toml` : `pages_build_output_dir = "app"`, liaison D1 `DB`, liaison IA `AI`.

## Étapes

1. Greg crée la base D1 « koios » dans Cloudflare et envoie son identifiant.
2. Rédacteurs (Sonnet, en parallèle) : 4 chapitres vérifiés par domaine, au format JSON commun.
3. Moteur de l'app : bibliothèque, formation, chapitre (fiche, exercices, bilan, révision ciblée), profil, style v4 gothique.
4. Fonctions et base : joueur et progression en ligne, sujet libre (brouillon), défis par lien.
5. Tests, relecture à froid, publication.

## À vérifier au démarrage

- Syntaxe exacte de `wrangler.toml` pour Pages avec liaisons D1 et Workers AI (documentation Cloudflare « Pages Functions, Wrangler configuration »).
- Identifiants de modèles Workers AI disponibles pour le français.
