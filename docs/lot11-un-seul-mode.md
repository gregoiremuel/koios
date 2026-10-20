# Lot 11 : un seul mode, la leçon ; une progression continue du débutant à l'expert

Demande de Greg : plus de modes « normal, simple, expert » ni « Essentiel / Complet ». Une seule façon d'apprendre : la leçon. Tout le parcours (niveaux, modules, leçons) monte de débutant à expert, de plus en plus précis, mais sans détails inutiles : on doit pouvoir devenir expert du sujet.

## 11A. Retirer les modes
- Interface : supprimer le choix « Essentiel / Complet » (app.js ~1062-1070, 1143-1154, 1237-1240) : tous les modules sont toujours visibles, dans l'ordre. Supprimer « version simple / version experte » d'une leçon (app.js ~1704-1757 et leurs boutons) et leurs textes d'aide (~3706-3707).
- Serveur : retirer `functions/api/variante.js`, sa route dans worker.js, les quotas `variantes`, les tests et la doc qui s'y rapportent. Les données déjà stockées ne sont pas supprimées. Les anciens `koios.profondeur` locaux sont ignorés.
- Programme : le champ `essentiel` des modules n'est plus demandé à l'IA ni utilisé ; les anciens programmes restent lisibles.

## 11B. Progression continue
- Prompt du programme (`genererProgramme`, `genererPlanModule`, `genererNiveauSuivant` dans lib/paliers.js) : 4 niveaux (Novice, Intermédiaire, Avancé, Expert) ; chaque module repose sur les précédents ; chaque leçon n'a qu'un objectif d'apprentissage ; aucun module « pour faire joli » : on garde ce dont un praticien a besoin ; ordre : repères, vocabulaire, méthodes, cas, maîtrise. Les titres de leçons doivent se suivre comme un cours (pas de répétition, pas de saut de niveau).
- Contrôle programmé du programme : titres uniques, pas de doublon proche (comparaison sans accents), nombre de leçons par module borné, niveau croissant ; sinon un seul nouvel essai.
- Chaque leçon commence par un rappel de la précédente (champ « Avant de commencer » existant) et finit par ce qu'on saura faire ensuite.
- Documents : la recherche (lot 10) filtre par niveau de la leçon.
- Réécriture des anciennes formations : jamais automatique ; action admin explicite.

## 11C. Tests et relecture
Tests : plus de route variante ; sommaire sans bascule ; programme sans doublons ; migration locale des anciens réglages. Relecteur avec rendu réel 390 px du sommaire et d'une leçon.
