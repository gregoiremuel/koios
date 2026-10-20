# Lot 9 : leçons plus riches, visuels faits par programme

Règles : voir CLAUDE.md et DESIGN.md (390 px, couleurs et polices du design, une action principale). Aucun secret. TABLES = schema.sql. Tests : `timeout 240 node scripts/test_api.mjs`, `python3 scripts/verifier.py`.

## But
Une vraie formation de novice à expert, valable pour TOUT sujet (pas seulement la gemmologie). Chaque leçon : courte à lire, riche, avec au moins un visuel utile quand le sujet s'y prête.

## 9A. Visuels par programme (gratuits, rendus côté app)
L'IA ne dessine jamais. Elle fournit des DONNÉES structurées dans un champ `visuels` (0 à 2 par leçon), validées par le serveur, dessinées en SVG par l'app (`app/visuels.js`, fonctions pures testables en Node). Types :
- `echelle` : valeurs ordonnées (ex. dureté de Mohs 1 à 10) : `{titre, unite, points:[{etiquette, valeur}]}`.
- `courbe` : `{titre, x:{nom, unite}, y:{nom, unite}, series:[{nom, points:[[x,y],...]}]}`.
- `barres` : comparaison de grandeurs : `{titre, unite, barres:[{etiquette, valeur}]}`.
- `tableau` : `{titre, colonnes:[...], lignes:[[...],...]}` (6 lignes max, 4 colonnes max).
- `frise` : `{titre, evenements:[{date, texte}]}` (8 max, dates croissantes).
- `schema` : étapes ou parties reliées : `{titre, noeuds:[{id, texte}], liens:[{de, vers, texte?}]}` (8 nœuds max, rendu en colonne à 390 px, flèches).
- `carte_mentale` : `{centre, branches:[{texte, sous:[texte,...]}]}` (6 branches max).
Règles de validation (serveur, lib/visuels.js) : tailles et nombres bornés, textes courts (60 caractères), nombres finis, aucun HTML. Un visuel invalide est retiré (la leçon reste valable), jamais la leçon entière.
Fiabilité : chaque nombre d'un visuel doit se retrouver dans les extraits sources ou être marqué par le vérificateur ; le vérificateur reçoit les visuels aplatis en affirmations (ex. « Diamant : dureté 10 »). Rejeté ou incertain : retiré.
Rendu : SVG inline construit avec createElementNS (jamais innerHTML), couleurs du design seulement, texte lisible à 390 px (>= 14 px), `role="img"` + `aria-label` complet (description en phrases), tableau alternatif lisible par lecteur d'écran, impression correcte.
La « carte du module » (`Visuels.carteModule`, sans IA) reste dans `app/visuels.js` et ses tests, mais n'est plus affichée dans le sommaire : elle répétait les niveaux.

## 9B. Contenu plus profond
- Prompt du rédacteur : leçon plus riche. Cibles : « comment » 4 à 6 phrases courtes, « pourquoi » obligatoire, 2 exemples concrets (dont un du métier si le sujet s'y prête), 3 à 6 définitions, « à retenir » 3 à 5, un « piège fréquent » (champ `piege`, 1 à 2 phrases), et selon le niveau (novice, intermédiaire, avancé, expert) un vocabulaire et une profondeur croissants (le niveau doit se sentir : chiffres, méthodes, exceptions à l'expert).
- Taille : rester lisible sur téléphone : sections courtes, pas de phrase de plus de 25 mots.
- « Aller plus loin » existant : conserver.
- Chaque affirmation chiffrée garde ses sources ; le vérificateur reste inchangé (3 verdicts).
- Les anciennes leçons restent valides (champs nouveaux optionnels) et sont réécrites par la file de nuit (type `reecriture`) quand leur version de format est ancienne : ajouter `format` (nombre) dans le contenu ; `reecrire()` ne les met en file que sur demande explicite : `{action: 'reecrire', parcours, formatAncien: true}`.

## 9C. Ordre de travail
1. lib/visuels.js (validation + aplatissement pour le vérificateur) + app/visuels.js (rendu SVG) + tests Node des deux.
2. Intégration dans paliers.js (prompt, validation, vérification) et app.js (affichage dans la leçon).
3. Prompt plus riche + champ piege + format.
4. Relecteur Opus, correction, déploiement, réécriture des leçons.
