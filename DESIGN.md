# DESIGN.md — Koîos (v5, « blanc et net »)

Koîos est une app de formation pour adultes de 20 à 50 ans : on tape n'importe quel sujet, on avance par paliers, on gagne de l'XP, et des quiz, mini-jeux et duels s'ouvrent en chemin. Elle doit ressembler à une vraie app de quiz professionnelle : blanche, épurée, minimaliste, agréable. En cas de doute, ce fichier gagne.

Historique : v1 musée, v2 librairie ludique, v3 bibliothèque d'étude, v4 bibliothèque gothique (18 octobre 2026). Le 19 octobre 2026, Greg demande un fond blanc, minimaliste, sans décor : tout le décor (bois, gothique, rosace, renard) est abandonné.

## Principes

- **Le contenu d'abord** : une photo du sujet, un titre, du texte clair. Pas d'ornement.
- **Une action principale par écran**, en bas, bien visible.
- **Calme** : beaucoup de blanc, filets de 1 px, coins de 12 px, aucune ombre, aucun dégradé, aucune animation tape-à-l'œil (un fondu de 150 ms au plus).
- **Honnête** : chaque leçon montre d'où vient l'information (badge « Vérifié » ou « Recoupé automatiquement », liens des sources).

## Couleurs (jetons)

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--fond` | #ffffff | Fond de toutes les pages |
| `--surface` | #f5f6f7 | Champs, puces, zones secondaires |
| `--ligne` | #e7e9ec | Filets, bords |
| `--encre` | #111418 | Texte, boutons principaux (noirs) |
| `--encre-2` | #5b6270 | Texte secondaire |
| `--or` | #b7791f | XP, niveaux, progression (avec parcimonie) |
| `--or-pale` | #fbf3e4 | Fond d'un badge d'XP |
| `--juste` / `--juste-pale` | #17804a / #e8f5ee | Bonne réponse, « Vérifié » |
| `--faux` / `--faux-pale` | #c4372f / #fbeceb | Mauvaise réponse, erreur |
| `--lien` | #1f5fbf | Liens des sources |

## Typographie

- **Libre Franklin** seule, 400, 500, 600 et 700.
- Échelle : 12 (méta) · 14 · 16 (interface) · 17 (texte des leçons, interligne 1,6) · 20 · 24 · 30 (titres).
- Chiffres alignés partout où l'on compte. Typographie française : fine insécable avant ; ? ! % », insécable avant : et après «, apostrophe ’.

## Composants

- Bouton principal : noir plein, texte blanc, 52 px de haut, coins 12 px. Secondaire : contour 1 px. Lien : texte souligné au survol.
- Carte : fond blanc, bord 1 px `--ligne`, coins 12 px, aucune ombre. Pas de carte dans une carte.
- Photo : coins 12 px, recadrée en 16:9 (16:10 en tête de sujet), crédit en 12 px dessous ; elle disparaît proprement si elle ne charge pas.
- Parcours : liste verticale de paliers (pastille numérotée, titre, état) ; jalons « Quiz » tous les 5 paliers et « Défi d'étape » tous les 10.
- Réponse de quiz : rangée pleine largeur, bord 1 px ; choisie en noir ; juste en vert pâle ; fausse en rouge pâle ; l'explication s'affiche toujours après la réponse.
- XP : pastille or discrète (« Niv. 4 · 320 XP »), barre fine de 4 px.
- Icônes : Phosphor (licence MIT), trait fin, 20 px, toujours avec un rôle.

## Interdits (le relecteur vérifie chaque écran)

- Couleurs : violet, dégradés, néon, fonds crème ou beige, terracotta.
- Polices : Inter, Geist, Roboto, Space Grotesk, Poppins, Montserrat, DM Sans, Playfair.
- Gabarits « IA » : grande accroche centrée suivie de trois cartes, émojis, mascotte, confettis, liseré de couleur sur le côté d'une carte, cartes dans des cartes, ombres portées.
- Mots : Bienvenue, Découvrez, N'hésitez pas, au cœur de, véritable, incontournable, passion, sublimer, écrin, expérience, univers, authentique, d'exception, excellence, intemporel, En savoir plus.

Vérification automatique : `python3 scripts/verifier.py` (app) et `python3 scripts/catalogue.py` (contenu vérifié).
