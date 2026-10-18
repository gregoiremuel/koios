# DESIGN.md — Koîos (v4, « bibliothèque-cathédrale »)

Koîos est une app de formation pour adultes : on suit un programme par sujet, chapitre après chapitre, dans l'ambiance d'une bibliothèque ancienne. Sage, mûr, chaleureux, jamais enfantin. En cas de doute, ce fichier gagne.

Historique : v1 « musée » (trop froide), v2 « librairie ludique » (trop enfantine), v3 « bibliothèque d'étude » (validée, 18 octobre 2026). v4 garde la v3 et ajoute une touche de cathédrale gothique bien présente, fine et élancée, pour adultes.

## Principes

- **Une formation = un livre** de l'étagère, découpé en chapitres. Un chapitre = une fiche « À retenir » (repères datés, sources), 3 exercices, un bilan avec les points à revoir.
- **Typographie de livre** : le contenu se lit comme une page imprimée.
- **Traits fins, pas de jouet** : bords de 1 px, coins de 8 à 10 px, boutons sobres, pas de capitales criées sur les boutons, pas de célébration animée.
- **Le Rival annote en marge**, comme un professeur exigeant au crayon : courtes phrases en italique, signées de son ex-libris.

## Touche gothique (v4)

- **Arc brisé** équilatéral : la niche de l'étagère, la lancette d'un domaine. Traits fins, pierre claire `#e2d3b3`, filet or.
- **Rosace des savoirs** : un vitrail par chapitre du catalogue, dans la couleur de verre de son domaine ; éteint (`#4f4134`) tant que le chapitre n'est pas validé. Elle sert de carte de progression (bibliothèque, bilan, profil). Pas de célébration : le vitrail s'allume en fondu.
- **Frise d'arcatures** : fine rangée d'arcs or sous l'en-tête et en tête des fiches.
- **Lettrine enluminée** : première lettre de « L'essentiel », or clair sur bordeaux, filet or intérieur.
- **Fleuron quadrilobé** entre les sections d'une fiche.
- Chapitres numérotés en chiffres romains.
- Verres des domaines : Histoire `#b0414f`, Sciences `#4f8f6c`, Arts `#4a7fb3`, Gemmologie `#cfa645`. Cuirs des reliures : `#5e2430`, `#2f5442`, `#24405e`, `#6a5020`.
- Interdit : police gothique (fraktur), gargouilles, croix, ambiance sombre de jeu vidéo. La pierre et le vitrail restent des ornements, le papier reste le fond.

## Couleurs (jetons)

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--papier` | #f8f3ea | Fond, avec grain léger |
| `--page` | #fffdf9 | Cartes ; `#fffaf0` + papier vieilli pour les feuilles de cours |
| `--ligne` / `--ligne-forte` | #e4d9c7 / #cdbb9c | Filets, bords |
| `--encre` / `--encre-2` | #2a2119 / #6b5d4f | Texte |
| `--vert` (+ fonce, pale) | #3b6b52 | Action principale, réussite, Sciences et nature |
| `--bordeaux` (+ pale) | #7d2a35 | Erreur, Rival, Histoire et géographie |
| `--prusse` (+ pale) | #2c5378 | Sélection, liens, Arts et culture |
| `--or` (+ fonce, pale) | #a8802f | Progression, dates, Gemmologie et joaillerie |
| bois | #876143, #4a3220 | Étagère et planche |

## Typographie

- **Spectral** (Production Type) : titres (600), contenu des questions et des fiches (400-500), annotations du Rival (italique).
- **Libre Franklin** 400 et 600 : interface, méta, boutons (casse normale).
- Échelle : 11-12 (libellés en capitales espacées, avec parcimonie) · 14 · 16-17 · 19-21 · 24 · 52.
- Chiffres alignés (`lining-nums tabular-nums`) partout où l'on compte.
- Typographie française : fine insécable avant ; ? ! % et », insécable avant : et après « ; apostrophe ’ ; trait d'union insécable dans les noms composés qui ne doivent pas se couper.

## Formes et composants

- Carte : fond `--page`, bord 1 px, bas 2 px `--ligne-forte`, coins 10 px.
- Bouton principal : vert plein, coins 8 px, bas 2 px plus sombre. Secondaire : contour fin.
- Tuile de réponse : bord fin ; choisie en bleu de Prusse pâle ; juste en vert pâle avec icône ; fausse en bordeaux pâle avec icône.
- Progression : barres fines de 4 à 6 px (chapitres en or, étapes du chapitre en vert).
- Étagère : vraies tranches (nerfs, pièce de titre dorée, largeurs inégales), titres verticaux de bas en haut comme les livres français.
- Photos : libres de droits ou de Greg, créditées en légende italique ; elles disparaissent proprement si elles ne chargent pas.

## Icônes

- **Phosphor Duotone** (licence MIT), en ligne via `icones.js` ; ornements gothiques dans `gothique.js`, couleur de l'encre ou du domaine. Une icône a un rôle (domaine, état, action), jamais décorative.
- Plus d'émojis.

## Le Rival

- Renard bibliothécaire dessiné comme un **ex-libris** (traits bordeaux dans un cachet rond), demi-lunes et crayon à l'oreille (`rival.js`).
- Quatre humeurs discrètes (malin, ravi, boudeur, explique). Ton réglable par le joueur.
- Ses répliques : italique Spectral, sous le libellé « Le Rival, en marge ».

## Interdits (le relecteur vérifie chaque écran)

- Couleurs : violet, terracotta, dégradés CSS, néon.
- Polices : Inter, Geist, Roboto, Space Grotesk, Poppins, Montserrat, DM Sans, Playfair Display, polices « bulles ».
- Look enfantin : boutons épais en capitales, ombres de jouet, confettis, mascotte qui envahit l'écran, émojis.
- Gabarits « IA » : grande accroche centrée suivie de trois cartes, cartes dans des cartes, liseré de couleur sur le côté d'une carte.
- Mots : Bienvenue, Découvrez, N'hésitez pas, au cœur de, véritable, incontournable, passion, sublimer, écrin, expérience, univers, authentique, d'exception, excellence, intemporel, En savoir plus.

Vérification automatique : `python3 scripts/verifier.py` (app) et `python3 scripts/catalogue.py` (contenu).
