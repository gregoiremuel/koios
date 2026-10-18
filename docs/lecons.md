# Leçons

Une ligne par piège rencontré, la plus récente en haut.

- 2026-10-18 : la v2 « librairie ludique » a été jugée trop enfantine (gros boutons en capitales, émojis, confettis, mascotte). Pour un public adulte : typographie de livre, traits fins, icônes au trait, Rival en annotation de marge, contenu en mode formation.
- 2026-10-18 : `verifier.py` ne lisait pas les textes injectés en JavaScript ; il lit maintenant les chaînes entre guillemets des scripts.

- 2026-10-18 : l'aperçu Claude (artifact) bloque les images d'autres sites et ajoute lui-même l'en-tête du document ; le vrai site a besoin d'un `index.html` complet. On publie dans l'aperçu une copie sans en-tête.
- 2026-10-18 : les émojis Fluent « Color » ont des dégradés et des couleurs néon qui jurent avec le reste ; on prend les « Flat », recolorés dans la palette.
- 2026-10-18 : Wikimedia, Unsplash et les pages de fichiers Commons sont injoignables depuis l'espace de travail ; utiliser les liens `Special:FilePath/<fichier>?width=800`, qui marchent sur le vrai site.
- 2026-10-18 : appeler focus() sur un bouton seulement après l'avoir inséré dans la page, sinon le focus retombe sur le corps de page.

- 2026-10-18 : une barre de minuteur animée en CSS doit être relancée après un recalcul de mise en page (`getBoundingClientRect()`), sinon elle saute directement à la fin.
- 2026-10-18 : un mot composé avec trait d'union (« s'ouvrent-ils ») se coupe en fin de ligne ; utiliser le trait d'union insécable (U+2011).
- 2026-10-18 : depuis l'espace cloud de Claude, on ne peut pas créer de dépôt GitHub ; Greg le crée sur github.com/new, puis on le relie à la session.
