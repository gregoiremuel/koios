# DESIGN.md — Koîos (v6, « blanc et net », avec photos et mouvement fin)

Koîos est une app de formation pour adultes de 20 à 50 ans : on tape n'importe quel sujet, on avance par paliers, on gagne de l'XP, et des quiz, mini-jeux et duels s'ouvrent en chemin. Elle doit ressembler à une vraie app de quiz professionnelle : blanche, épurée, minimaliste, agréable, et finie : des photos vraies, des icônes qui servent à se repérer, un mouvement discret. En cas de doute, ce fichier gagne.

Historique : v1 musée, v2 librairie ludique, v3 bibliothèque d'étude, v4 bibliothèque gothique (18 octobre 2026). Le 19 octobre 2026, Greg demande un fond blanc, minimaliste, sans décor : tout le décor (bois, gothique, rosace, renard) est abandonné. Le même jour, il demande de vraies photos, des icônes, des boutons soignés et de fines animations, pour que l'app fasse produit fini sans redevenir décorative (v6).

## Principes

- **Le contenu d'abord** : une photo du sujet, un titre, du texte clair. Pas d'ornement.
- **Une action principale par écran**, en bas, bien visible.
- **Calme** : beaucoup de blanc, filets de 1 px, coins de 12 px, aucune ombre, aucun dégradé. Le mouvement existe pour montrer ce qui change, jamais pour décorer (voir « Mouvement »).
- **Honnête** : chaque leçon montre d'où vient l'information (badge « Vérifié » ou « Recoupé automatiquement », liens des sources) ; chaque photo montre son auteur et sa licence.
- **Rien qui fasse « IA »** : ni mascotte, ni illustration générée, ni image fabriquée. Les photos viennent de Wikimedia Commons ou d'Unsplash, avec leur crédit. Une icône sert toujours à repérer quelque chose.

## Couleurs (jetons)

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--fond` | #ffffff | Fond de toutes les pages |
| `--surface` | #f5f6f7 | Bandes alternées, champs, zones secondaires |
| `--ligne` | #e7e9ec | Filets, bords, cadre d'une photo en attente |
| `--ligne-forte` | #d5d9de | Bord des champs et des boutons secondaires |
| `--encre` | #111418 | Texte, boutons principaux (noirs) |
| `--encre-2` | #5b6270 | Texte secondaire, icônes |
| `--or` | #b7791f | XP, niveaux, progression (avec parcimonie) |
| `--or-pale` | #fbf3e4 | Fond d'un badge d'XP |
| `--juste` / `--juste-pale` | #17804a / #e8f5ee | Bonne réponse, « Vérifié » |
| `--faux` / `--faux-pale` | #c4372f / #fbeceb | Mauvaise réponse, erreur |
| `--lien` | #1f5fbf | Liens des sources, anneau de focus |

Or : réservé à l'XP et à la progression. Vert et rouge : réservés au juste et au faux.

## Typographie

- **Libre Franklin** seule, 400, 500, 600 et 700.
- Échelle : 12 (méta, crédits, étiquettes en capitales espacées) · 14 · 16 (interface) · 17 (texte des leçons, interligne 1,6) · 20 · 24 · 30 (titres) · 48 (score, numéro de niveau).
- Chiffres alignés partout où l'on compte. Typographie française : fine insécable avant ; ? ! % », insécable avant : et après «, apostrophe ’.

## Mise en page

- Colonne de 34 rem au plus, marges de 16 px, cibles tactiles de 44 px au moins.
- **Bandes** : l'accueil et le profil alternent bandes blanches et bandes `--surface`, pleine largeur, séparées par un filet de 1 px. Jamais d'ombre. Sur une bande grise, les cartes et tuiles sont blanches.
- Navigation du bas : 4 onglets (Apprendre, Jouer, Amis, Profil), icône de 22 px et libellé de 12 px. L'onglet actif est en `--encre` avec un trait de 2 px au-dessus ; les autres en `--encre-2`.
- Apprendre : recherche, idées de formations, formation en cours, parcours vérifiés. Jouer : question du jour, quiz mélangé, erreurs à revoir, mini-jeux. Amis : invitation, duels, classement.

## Composants

- **Bouton principal** : noir plein, texte blanc, 52 px de haut, coins 12 px. Une flèche à droite (icône « fleche ») quand il fait avancer (Continuer, Commencer, Leçon suivante, Ouvrir ce module). Appuyé : légèrement assombri et réduit à 98 %. **Secondaire** : contour 1 px. **Lien** : texte souligné.
- **Focus** : anneau de 2 px `--lien`, décalé de 2 px, sur tout ce qui se touche.
- **Logo** : carré noir au K blanc et à la barre or (celui de `icone.svg`), en SVG en ligne de 24 px, à gauche du mot « Koîos ».
- **Carte** : fond blanc, bord 1 px `--ligne`, coins 12 px, aucune ombre. Pas de carte dans une carte.
- **Photo** : coins 12 px, recadrée sans jamais être étirée (`object-fit: cover`), crédit de 12 px dessous, `loading="lazy"` et `decoding="async"`. Elle disparaît proprement si elle ne charge pas. Alt vide si la photo est décorative (vignette, tuile), sinon le sujet.
  - **Couverture** de formation : 16:9 en tête de page.
  - **Image de leçon** : 3:2 sous le titre. Rien n'est réservé tant que l'adresse n'est pas connue : elle se glisse quand elle arrive, et rien ne s'affiche si rien ne vient.
  - **Crédit** : Commons = auteur, licence, « Wikimédia Commons » (lien vers la page du fichier). Unsplash = « Photo : <photographe> sur Unsplash », deux liens (photographe et Unsplash) avec `utm_source=koios&utm_medium=referral`. Sur l'accueil, où les photos sont des tuiles, les crédits sont réunis dans « Crédits des photos » en bas de page.
  - **Tuile photo (idée de formation)** : grille de 2 colonnes, ratio 4:3, titre de 16 px 600 sous la photo sur fond blanc, icône de catégorie à côté. **Carte photo (parcours vérifié)** : 240 px de large, 16:9, badge Vérifié, nombre de leçons, barre de progression ; elles défilent à l'horizontale (scroll-snap). **Reprendre** : photo 16:9 en haut de la carte, barre de progression dessous. **Mosaïque** de première visite : 4 photos, coins 12 px.
  - Quand aucune photo n'est connue : un cadre `--ligne` avec l'icône de catégorie (32 px), jamais un cadre vide.
- **Tuile de catégorie** : carré de 48 px, coins 10 px, fond `--surface`, icône de 24 px en `--encre-2`. Elle remplace la photo d'une vignette quand il n'y en a pas : plus jamais la lettre seule. La catégorie vient du titre du sujet (mots-clés, sans accents ; « livre » par défaut).
- **Vignette** de liste : 48 px, coins 10 px, photo recadrée.
- **En-tête de niveau** (sommaire) : tuile ronde de 40 px avec l'icône du niveau, « Niveau 1 » en 12 px capitales espacées `--encre-2` au-dessus du titre (20 px, 700), « 1/3 modules » à droite, puis barre de 4 px.
- **Rangée de module** : numéro dans un cercle de 32 px (fait : plein `--encre`, chiffre blanc ; en cours : contour `--encre` ; verrouillé : contour `--ligne`, chiffre `--encre-2`), titre 16 px 600, objectif 14 px `--encre-2` sur 2 lignes au plus, chevron (ouvert ou ouvrable) ou cadenas (verrouillé, avec aria-label « verrouillé »). Un module ouvert se déplie sur ses leçons. Une seule phrase en tête du sommaire : « Les modules s’ouvrent dans l’ordre. »
- **Titre de section** de leçon : icône de 20 px `--encre-2` alignée sur la ligne du titre (20 px, 600).
- **Bloc « À retenir »** : fond `--surface`, filet gauche de 3 px en `--encre` (de l'encre, jamais une couleur), puces. **Définitions** : liste `dl` avec filets fins de 1 px entre les termes, sans cartes empilées.
- **Ligne méta d'une leçon** : badge, « Leçon n », durée estimée (« ≈ 3 min », 200 mots par minute, 1 minute au moins, affichée seulement si elle est calculée).
- **Attente de génération** : titre, barre indéterminée de 4 px, une phrase, puis « Ce qui se passe » en trois lignes à icône (Recherche des sources, Rédaction de la leçon, Vérification par une 2e IA). Ce sont des étapes décrites : ni coche animée, ni pourcentage. Le bloc n'apparaît qu'après une demi-seconde.
- **État vide** : icône de 32 px `--encre-2`, une phrase, un bouton utile. Pas de carte.
- **Parcours** : liste verticale de paliers (pastille numérotée, titre, état) ; jalons « Quiz » tous les 5 paliers et « Défi d'étape » tous les 10.
- **Réponse de quiz** : rangée pleine largeur, bord 1 px ; juste en vert pâle avec une coche qui se dessine ; fausse en rouge pâle avec un léger tremblement ; l'explication s'affiche toujours après la réponse.
- **XP** : pastille or discrète (« Niv. 4 · 320 XP »), barre fine de 4 px. **Anneau de niveau** (profil) : 148 px, anneau `--or` de progression vers le niveau suivant, numéro en 48 px, puis trois chiffres clés séparés par des filets.
- **Icônes** : Phosphor « regular » (licence MIT, mention en tête de `icones.js`), 20 px dans le texte, 24 px dans une tuile, 32 px dans un état vide ou un cadre photo, 22 px dans la navigation. Toujours avec un rôle : repérer une catégorie, un niveau, une section, un état, une action. Jamais en décor. Flèche (« fleche ») pour les boutons qui avancent ; chevron (« chevron ») pour les rangées de liste.

## Mouvement

Uniquement `transform` et `opacité` (l'anneau de progression et le dépliage d'un module animent aussi leur trait ou leur hauteur), de 150 à 250 ms, `ease-out`. Tout est coupé sous `prefers-reduced-motion` : les contenus s'affichent directement, la barre indéterminée devient un trait fixe.

- Changement de page : fondu et glissement de 8 px. Rangées de liste : apparition décalée de 40 ms, 8 au plus. Barres de progression et anneau : remplissage à l'affichage.
- Bouton appuyé : 98 %. Bonne réponse : la case passe au vert, la coche se dessine. Mauvaise réponse : tremblement de 3 px, une fois.
- Gain d'XP : la pastille compte jusqu'à la nouvelle valeur et pulse une fois en or. Fin de leçon : une coche se dessine dans un cercle avant de passer à la suite.
- Module du sommaire : dépliage par `grid-template-rows` (0fr vers 1fr). Fiche du glossaire : elle monte du bas.
- Interdits : confettis, rebonds, parallaxe, animation en boucle (sauf la barre d'attente), animation qui retarde la lecture.

## Interdits (le relecteur vérifie chaque écran)

- Couleurs : violet, dégradés, néon, fonds crème ou beige, terracotta.
- Polices : Inter, Geist, Roboto, Space Grotesk, Poppins, Montserrat, DM Sans, Playfair.
- Gabarits « IA » : grande accroche centrée suivie de trois cartes, émojis, mascotte, illustrations ou photos générées, confettis, liseré de couleur sur le côté d'une carte (le filet d'encre du bloc « À retenir » et de la citation est le seul permis), cartes dans des cartes, ombres portées.
- Mots : Bienvenue, Découvrez, N'hésitez pas, au cœur de, véritable, incontournable, passion, sublimer, écrin, expérience, univers, authentique, d'exception, excellence, intemporel, En savoir plus.

Vérification automatique : `python3 scripts/verifier.py` (app) et `python3 scripts/catalogue.py` (contenu vérifié).
