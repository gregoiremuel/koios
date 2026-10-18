# DESIGN.md — Koîos (v2, « librairie ludique »)

Koîos mélange le plaisir de jeu de Duolingo et l'ambiance d'une vieille librairie : papier de vieux livre, bois des rayonnages, reliures colorées, un renard bibliothécaire comme Rival. Joli, chaleureux, qualitatif, jamais enfantin. Rien n'est laissé à l'improvisation du modèle : en cas de doute, ce fichier gagne. Version 1 (musée et livre d'art) abandonnée le 18 octobre 2026 à la demande de Greg.

## Ambiance

- Un seul thème, clair et doux pour les yeux.
- Matières réelles plutôt qu'aplats : grain de papier, papier vieilli sur les questions, veines de bois sur l'étagère (textures générées en SVG `feTurbulence`, jamais d'image lourde).
- Objets de librairie comme interface : l'étagère de livres (un livre par domaine, ses bandes dorées = le grade), la fiche de bibliothèque réglée pour le défi, les marque-pages, le sablier pour le temps.
- Photos libres de droits (Wikimedia Commons, domaine public ou CC) et photos de Greg, toujours créditées. Elles se chargent sur le vrai site ; si une image ne charge pas, elle disparaît proprement.

## Couleurs (jetons)

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--papier` | #fbf6ec | Fond, avec grain |
| `--page` | #fffdf8 | Cartes et tuiles |
| `--ligne` / `--ligne-forte` | #e8dcc6 / #d7c4a3 | Bords, bord épais du bas |
| `--encre` / `--encre-2` | #2f241c / #6e5d4e | Texte, texte secondaire |
| `--bois` / `--bois-fonce` | #6b4a2f / #4a3220 | Étagère, planche |
| `--vert` (+ fonce, pale) | #3e7a5a | Action principale, bonne réponse, Sciences et nature |
| `--bordeaux` (+ fonce, pale) | #8e2f3c | Erreur, Histoire et géographie, écharpe du Rival |
| `--prusse` (+ fonce, pale) | #2f5d8a | Sélection, liens, Arts et culture |
| `--or` (+ fonce, pale) | #b8892e | Dorures, grades, Gemmologie et joaillerie |

Pas de violet, pas de terracotta, pas de dégradé en CSS.

## Typographie

- **Young Serif** : titres, questions, nom de l'app, bulles du Rival. Une seule graisse.
- **Libre Franklin** 400 et 600 : interface, réponses, boutons (en capitales, interlettrage 0,03 em).
- Échelle : 12 · 14 · 17 · 19-20 · 22-25 · 64.
- Typographie française : espace fine insécable (U+202F) avant ; ? ! % et avant », insécable avant : et après « ; apostrophe ’ ; trait d'union insécable dans « s’ouvrent‑ils ».

## Formes

- Coins arrondis (12 à 18 px) ; cartes et tuiles avec bord de 2 px et bord du bas épaissi (5 px) façon touche.
- Bouton principal vert plein, « enfoncé » par une ombre pleine de 4 px qui disparaît au toucher ; bouton secondaire papier avec bord.
- Réponse choisie : bleu de Prusse pâle. Juste : vert pâle et coche. Faux : bordeaux pâle et croix.
- Verdict après chaque question : panneau coloré, titre, correction, « Vérifié par N sources » (liens), réplique du Rival, bouton Continuer.
- Petites célébrations (cotillons, trophée) qui « sautent » une fois ; rien qui boucle. Mouvement réduit respecté.

## Émojis et petits logos

- Émojis dessinés **Fluent** de Microsoft (licence MIT), en fichiers SVG dans `maquettes/emojis/`, identiques sur tous les téléphones. Jamais les émojis du système.
- Un émoji a un rôle : domaine (globe, microscope, palette, gemme), état (coche, croix), objet (sablier, trophée, épées pour les duels). Pas d'émoji décoratif en début de chaque titre.

## Le Rival

- Renard bibliothécaire à lunettes et écharpe bordeaux, dessiné pour Koîos (`maquettes/rival.js`).
- Quatre humeurs : malin (il taquine), ravi (tu t'es trompé), vexé (tu as eu juste), explique (prof).
- Il parle dans des bulles ; ton réglable par le joueur.

## Interdits (le relecteur vérifie chaque écran)

- Couleurs : violet, terracotta, dégradés CSS, néon, verre dépoli.
- Polices : Inter, Geist, Roboto, Space Grotesk, Poppins, Montserrat, DM Sans, Playfair Display.
- Gabarit : grande accroche centrée suivie de trois cartes et d'un bouton ; cartes dans des cartes ; liseré de couleur sur le côté d'une carte.
- Look enfantin : couleurs criardes, polices « bulles », mascotte qui envahit l'écran.
- Émojis du système dans l'interface.
- Mots : Bienvenue, Découvrez, N'hésitez pas, au cœur de, véritable, incontournable, passion, sublimer, écrin, expérience, univers, authentique, d'exception, excellence, intemporel, En savoir plus.

Vérification automatique : `python3 scripts/verifier.py`.
