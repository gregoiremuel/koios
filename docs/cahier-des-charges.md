# Koîos — cahier des charges

Version du 18 octobre 2026. Ce fichier est la version de référence. Le Doc Claude de Greg (https://claude.ai/code/artifact/ae7044c5-fcd9-4ba8-83f7-756b75bd7b12) est la version initiale ; ses parties Design et Vérification sont dépassées.

## Vision et public

Koîos est une app web de défis de savoir : on joue entre amis, on se lance des défis et on devient expert d'un sujet. Le Rival, une IA taquine, crée les questions, explique et arbitre.

- Public : 5 à 15 amis au lancement (22 à 50 ans), puis le grand public si les tests sont bons.
- Format : site web installable sur téléphone (PWA) ; stores plus tard.
- Langue : français seul au début.
- Argent : gratuit au départ ; abonnement premium possible plus tard.
- Pilotage : Greg valide depuis son téléphone, Claude Code construit.
- Nom : Koîos, Titan grec dont le nom signifie probablement « question ». Logo « Koîos », adresse et stores « koios ».

## Mode formation (depuis le 18 octobre 2026)

Koîos se présente comme une formation pour adultes. Chaque sujet est un livre de l'étagère, découpé en chapitres. Un chapitre suit toujours le même ordre :

1. Une fiche « À retenir » : les repères essentiels (dates, notions), avec leurs sources.
2. Trois exercices variés (question à choix avec pari de confiance, « le Rival bluffe-t-il ? », frise…), chronométrés.
3. Un bilan : score, chapitre validé à partir de 2 bonnes réponses sur 3, points à revoir, chapitre suivant.

Le défi de groupe devient le « cercle d'étude », et les duels deviennent les « défis entre amis ».

## Le jeu

Sujets : catalogue, sujet libre tapé par le joueur, decks créés par les amis. Catalogue de départ : Histoire et géographie, Sciences et nature, Arts et culture, Gemmologie et joaillerie.

| Mode | Principe | Arrive à |
| --- | --- | --- |
| Solo « devenir expert » | Parcours d'Apprenti à Maître sur un sujet | Ébauche |
| Duel par lien | Lien WhatsApp, même série, on compare | Ébauche |
| Défi « Expert en X jours » | Le groupe suit le même parcours, bilan à la fin | Test entre amis |
| Tournoi d'un soir | Même série pour tous, heure limite | Test entre amis |
| Ligue d'amis | Points cumulés, saisons mensuelles | Test entre amis |
| Partie en direct | Tout le monde répond en même temps | V2 |

Paris en points du jeu ; gages notés plus tard ; jamais d'argent réel.

## Mini-jeux

| Jeu | Principe | Arrive à |
| --- | --- | --- |
| QCM et vrai/faux | La base de chaque partie | Ébauche |
| Pari de confiance | Le joueur annonce sa certitude ; trop sûr et faux, il perd plus | Ébauche |
| Le Rival bluffe | Le Rival affirme quelque chose ; vrai ou bluff ? | Ébauche |
| Frise | Remettre des événements dans l'ordre | Ébauche |
| Indices | 5 indices du vague au précis | V2 |
| Plus ou moins | Estimer un nombre | V2 |
| Intrus | Trouver l'intrus parmi quatre | V2 |
| Photo → nom | Reconnaître une œuvre, un lieu, une pierre | V2 |
| Carte | Placer un lieu | V2 |
| 60 secondes | Maximum de bonnes réponses en une minute | V2 |
| Révision | Cartes qui reviennent juste avant l'oubli | V2 |
| Entraîne un neurone | Comment un réseau apprend | V3 |

## Le Rival

Rôles : fabriquer les quiz (avec source), prof (explique chaque erreur), animateur et arbitre, bâtisseur de parcours sur X jours.

- Forme : abstraite et animée, un trait d'encre qui réagit. Ni visage ni mascotte.
- Ton réglable : courtois, pince-sans-rire, chambreur.
- Il taquine le joueur, jamais ses origines, son physique ou un sujet sensible.

## Le cerveau : banque, moteurs, sources

L'IA ne sert que pour le neuf ; tout quiz vérifié est rangé dans une banque et se rejoue sans limite.

Ordre d'appel :
1. Banque de quiz vérifiés (sans IA).
2. Cloudflare Workers AI : 10 000 « neurones » gratuits par jour.
3. GLM-4.7-Flash (Z.ai) : gratuit, une requête à la fois.
4. OpenRouter, modèles « :free » : 50 requêtes par jour, 1 000 après un achat unique de 10 $.
5. Clé personnelle du joueur.
6. Clé de Greg, plafonnée.

Gemini gratuit exclu : Google réserve sa version payante aux apps proposées dans l'Espace économique européen.

Vérification : au moins 2 sources indépendantes par réponse, dont une institutionnelle ou savante (musée, archives, université, encyclopédie éditée, organisme officiel), chacune avec lien et courte citation ; Wikipédia sert de point de départ, jamais de preuve ; un deuxième modèle vérifie que la réponse découle des sources ; le joueur voit « Vérifié par N sources » ; bouton « c'est faux » (2 signalements, seuil à valider, et la question part en revue dans l'espace d'admin).

Sources : documents de Greg, sites spécialisés, recherche web en direct en V2. Capacité estimée à une vingtaine de quiz neufs de 10 questions par jour sur Cloudflare (à mesurer).

## Progression et statistiques

Grades par domaine : Apprenti, Compagnon, Maître. XP, badges, pas de série quotidienne. Points pour les paris, ligues, saisons mensuelles.

Stats : classements, courbe de progression, radar de compétences, bilan de défi, calibration, courbe d'oubli. Carte des savoirs : chaque sujet est un nœud qui s'éclaire, sans imagerie étoilée. Mémoire : répétition espacée type FSRS d'abord, petit réseau maison en V3 s'il apporte un gain.

## Design

Voir `DESIGN.md` (v3, « bibliothèque d'étude » : typographie de livre, étagère de formations, icônes au trait, Rival en ex-libris). Les v1 « musée » et v2 « librairie ludique » ont été abandonnées le 18 octobre 2026.

## Écrans de la première ébauche

| # | Écran | Contenu | État |
| --- | --- | --- | --- |
| 1 | Accueil | Défi en cours, reprendre, lancer une partie | Fonctionne |
| 2 | Choix du sujet | Catalogue et sujet libre | Fonctionne |
| 3 | Partie | Question, réponses, minuteur, Rival | Fonctionne |
| 4 | Résultat | Score, correction sourcée | Fonctionne |
| 5 | Mini-jeux | Pari de confiance, Le Rival bluffe, Frise | Fonctionne |
| 6 | Carte des savoirs | Nœuds qui s'éclairent | Fonctionne |
| 7 | Stats | Courbe et radar | Fonctionne |
| 8 | Duel par lien | Créer, partager, comparer | Fonctionne |
| 9 | Défis et ligue | Liste, classement | Maquette |
| 10 | Profil et réglages | Pseudo, ton du Rival | Maquette |
| 11 | Espace d'admin | Signalements, quotas, sujets | Maquette |

Chaque écran est vérifié à 390 px et 1280 px.

## Technique

- PWA servie par Cloudflare ; base D1 ; cache KV ; Workers AI.
- Partie en direct (V2) : un salon par partie sur Cloudflare.
- Espace d'admin sur le modèle de l'espace boutique.
- Dépôt GitHub privé `gregoiremuel/koios` ; Claude Code dans le cloud, piloté depuis l'app Claude.
- Publication : dépôt relié à Cloudflare, chaque modification validée se publie.
- Sous-agents : voir `.claude/agents/` et le skill `methode-koios`.

## Données et règles

Minimum de données : pseudo, scores, réponses ; email seulement avec un compte. Rien de personnel envoyé aux moteurs IA. Points fictifs seulement. Photos libres créditées ou de Greg, sans métadonnées GPS. On cite et on reformule les autres sites. Avant le grand public : mentions légales, confidentialité, conditions, relues par un professionnel.

## Plan par étapes

1. Cahier des charges : validé par Greg le 18 octobre 2026.
2. Installation : dépôt, consignes, skill, sous-agents, liaison Cloudflare.
3. DESIGN.md et deux maquettes réelles (Accueil, Partie) sur téléphone. Passage : aucune marque « IA », et Greg dit oui.
4. Ébauche jouable : écrans 1 à 8 fonctionnels, 9 à 11 en maquette, mise en ligne privée.
5. Test entre amis, 2 semaines.
6. V2 : direct, gages, parcours gemmologie, compte Google, mini-jeux restants.
7. Plus tard : stores, premium, petit modèle maison.

## À valider

- Marque Koîos (INPI, EUIPO) et domaine « koios ».
- Rival en renard bibliothécaire : à valider par Greg.
- Seuil de signalements (proposé : 2).
- Conditions de GLM et d'OpenRouter pour une app partagée.
- Publication automatique GitHub → Cloudflare.
- Sites spécialisés en gemmologie autorisés comme sources.
- API de recherche web pour la V2.
- Licences et auteurs des photos Wikimedia (salle Sainte-Geneviève, pont des Chaînes) à confirmer sur Commons : les pages n'ont pas pu être ouvertes depuis l'espace de travail.
- Photos de Greg à intégrer (compressées, sans données GPS).
