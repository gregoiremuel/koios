---
name: methode-koios
description: Méthode de travail de Koîos (planifier, déléguer, construire, vérifier, livrer à Greg sur téléphone). À suivre pour toute tâche sur le projet.
---

# Méthode Koîos

## 1. Avant de construire
- Relire la partie concernée de `docs/cahier-des-charges.md` et `DESIGN.md`.
- Écrire un plan court : fichiers touchés, comportement attendu, critère de réussite.
- Tâche coûteuse à refaire et ambiguë : une seule question à Greg, puis on avance.

## 2. Déléguer pour économiser
- Recherche volumineuse : `eclaireur` (Haiku).
- Lancer des tests ou des vérifications : `testeur` (Haiku).
- Questions, textes, données d'essai : `redacteur` (Sonnet).
- Écran ou fonction à partir d'un plan validé : `batisseur` (Sonnet).
- Architecture, design, décisions, vérification finale : la session principale.

## 3. Vérifier
- `python3 scripts/verifier.py` : aucun mot, police ou couleur interdits.
- Captures à 390 px et 1280 px, en clair et en sombre : pas de débordement, pas d'erreur JavaScript, cibles tactiles de 44 px au moins.
- Le `relecteur` (Opus) relit à froid. On corrige tout ce qu'il classe comme grave.

## 4. Livrer à Greg
- Greg n'a souvent que son téléphone : il lui faut un lien, pas un fichier HTML.
- Maquettes : publiées en artifact privé (lien à ouvrir sur le téléphone), et rangées dans `maquettes/`.
- Code : commit clair en français, push sur GitHub.
- Message final : Réponse claire, Niveau de confiance, Réserves clés. Dire ce qui n'a pas pu être testé.

## 5. Apprendre
- Chaque piège rencontré : une ligne dans `docs/lecons.md`, et proposer de mettre ce skill à jour.

## Pièges connus
- Depuis l'espace cloud de Claude, on ne peut pas créer de dépôt GitHub, et Cloudflare comme Unsplash peuvent être bloqués : passer par la liaison GitHub de Cloudflare pour publier.
- Un artifact ne charge ni images ni styles d'autres sites, sauf les polices Google : intégrer les images en data URI.
- Sur iPhone, un fichier HTML ne s'ouvre pas : toujours donner un lien.
