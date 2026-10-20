# DESIGN.md — Koîos (v7, « blanc et net », photos, mouvement fin et teintes de catégorie)

Koîos est une app de formation pour adultes de 20 à 50 ans : on tape n'importe quel sujet, on avance leçon par leçon, on gagne de l'XP, et des quiz, mini-jeux et duels s'ouvrent en chemin. Elle doit ressembler à une vraie app de quiz professionnelle : blanche, épurée, minimaliste, agréable, et finie : des photos vraies, des icônes qui servent à se repérer, un mouvement discret. En cas de doute, ce fichier gagne.

Historique : v1 musée, v2 librairie ludique, v3 bibliothèque d'étude, v4 bibliothèque gothique (18 octobre 2026). Le 19 octobre 2026, Greg demande un fond blanc, minimaliste, sans décor : tout le décor (bois, gothique, rosace, renard) est abandonné. Le même jour, il demande de vraies photos, des icônes, des boutons soignés et de fines animations, pour que l'app fasse produit fini sans redevenir décorative (v6).

Le 19 octobre 2026, Greg demande plus de couleur et un côté « site d'apprentissage » (v7) : la règle « tout blanc, noir et or » est remplacée par les teintes de catégorie ci-dessous.

## Principes

- **Le contenu d'abord** : une photo du sujet, un titre, du texte clair. Pas d'ornement.
- **Une action principale par écran**, en bas, bien visible.
- **Calme** : beaucoup de blanc, filets de 1 px, coins de 12 px (16 px pour les tuiles), aucune ombre, aucun dégradé. Le mouvement existe pour montrer ce qui change, jamais pour décorer (voir « Mouvement »).
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

Or : réservé à l'XP et à la progression. Vert et rouge : réservés au juste et au faux. Noir : boutons principaux.

### Teintes de catégorie (v7)

Six teintes douces : un accent (texte, icône, pastille) et un fond très clair, contraste 4,5:1 au moins. Jetons `--acc`, `--pale`, `--bord`, posés par les classes `t1` à `t6`.

| Classe | Teinte | Accent | Fond | Catégories |
| --- | --- | --- | --- | --- |
| t1 | bleu | #1f5fbf | #eaf1fb | sciences, technologie, économie, langues |
| t2 | turquoise | #0f766e | #e6f4f2 | nature, montagne, géographie, régions |
| t3 | ocre doux | #b45309 | #fdf1e3 | histoire, littérature, cuisine, livre par défaut |
| t4 | rose corail | #be3a4a | #fceced | arts, cinéma, musique |
| t5 | bleu nuit | #334e8a | #eceff8 | gemmologie, joaillerie |
| t6 | olive | #5c6b1f | #f1f3e2 | philosophie, sport |

Le rose corail ne sert jamais à un état d'erreur. Pas de violet, de dégradé, de beige ni de crème. Prennent la teinte de leur catégorie : tuiles de catégorie, tuiles d'idées, en-têtes de niveau (niveaux 1 à 4 : t1, t2, t3, t5), pastilles de module, tuiles bento (fond teinté, teintes en alternance), icônes des sections de leçon, bloc « À retenir », définitions, bandeau d'en-tête de formation (sous la photo), boutons secondaires. Sans photo pertinente, la couverture montre la tuile d'icône colorée, jamais une photo hors sujet. Un parcours vérifié peut imposer sa photo : champ `imageFixe` { src, credit, lien } de `app/contenu/parcours/v-xx.json`, prioritaire sur la recherche.

## Typographie

- **Libre Franklin** seule, 400, 500, 600 et 700.
- Échelle : 12 (méta, crédits, étiquettes en capitales espacées) · 14 · 16 (interface) · 17 (texte des leçons, interligne 1,6) · 20 · 24 · 30 (titres) · 48 (score, numéro de niveau).
- Chiffres alignés partout où l'on compte. Typographie française : fine insécable avant ; ? ! % », insécable avant : et après «, apostrophe ’.

## Mise en page

- Colonne de 34 rem au plus, marges de 16 px, cibles tactiles de 44 px au moins.
- **Bandes** : l'accueil et le profil alternent bandes blanches et bandes `--surface`, pleine largeur, séparées par un filet de 1 px. Jamais d'ombre. Sur une bande grise, les cartes et tuiles sont blanches.
- Navigation du bas : 4 onglets (Apprendre, Jouer, Amis, Profil), icône de 22 px et libellé de 12 px. L'onglet actif est en `--encre` avec un trait de 2 px au-dessus ; les autres en `--encre-2`.
- Apprendre : recherche, grille « bento » (voir Composants), idées de formations, formations vérifiées. Jouer : quiz de culture générale, question du jour, quiz mélangé, erreurs à revoir, mini-jeux. Amis : invitation, salons (liste et « Créer un salon »), tournoi de la semaine, mes groupes, « Rejoindre une partie » (code à 6 caractères), duels, classement. Jouer commence par le quiz de culture générale.

## Composants

- **Bouton principal** : noir plein, texte blanc, 52 px de haut, coins 12 px, bord inférieur de 3 px gris foncé (relief par bordure, jamais d'ombre). Une flèche à droite (icône « fleche ») quand il fait avancer (Continuer, Commencer, Répondre, Leçon suivante, Ouvrir ce module). Appuyé : légèrement assombri et réduit à 98 %. **Secondaire** : fond et bord de la teinte, texte `--acc` (bord inférieur de 3 px). **Lien** : texte souligné.
- **Focus** : anneau de 2 px `--lien`, décalé de 2 px, sur tout ce qui se touche.
- **Logo** : carré noir au K blanc et à la barre or (celui de `icone.svg`), en SVG en ligne de 24 px, à gauche du mot « Koîos ».
- **Carte** : fond blanc, bord 1 px `--ligne`, coins 12 px, aucune ombre. Pas de carte dans une carte.
- **Grille « bento »** (accueil, sous la recherche) : 2 colonnes à 390 px, 4 colonnes dès 720 px, gouttière de 12 px. Tuiles de fond `--surface`, bord 1 px `--ligne`, coins 16 px, aucune ombre, aucune carte dedans. Elles apparaissent l'une après l'autre (fondu et glissement de 8 px, 50 ms d'écart). Chaque tuile repose sur une donnée réelle du joueur : si la donnée manque, la tuile n'existe pas, aucun chiffre n'est inventé. De haut en bas :
  - **Reprendre** (2×2) : photo 16:9 de la formation en cours, titre, barre de progression, bouton noir « Continuer ». Sans formation : tuile 2×1 « Lance ta première formation » (icône de 32 px, phrase, flèche) ; c'est l'état vide.
  - **Niveau** (1×1) : anneau de 72 px (arc `--or`, « Niv. » et le numéro au centre), XP et XP restants. Lien vers le profil.
  - **Série** (1×1) : jours de suite où tu as fait une leçon, une révision, un quiz ou la question du jour, puis 7 points (lundi à dimanche ; plein = joué, cerclé d'encre = aujourd'hui).
  - **Question du jour** (2×1) : icône, une ligne, bouton contour « Répondre » ; « Faite » (coche grise, jamais verte) une fois jouée.
  - **À réviser aujourd’hui** (1×1) : nombre d’éléments (cartes et questions ratées) à réviser aujourd’hui, lien vers `#/reviser`. À 0 la tuile disparaît la tuile disparaît et **Glossaire** (nombre de termes déjà rencontrés dans la formation en cours) prend sa place, si elle en a. Puis **Quiz éclair** (1×1, 2×1 s'il est seul) : lien vers le quiz mélangé.
  - Dans la grille, seul « Continuer » est noir ; les autres boutons sont en contour.
- **Photo** : coins 12 px, recadrée sans jamais être étirée (`object-fit: cover`), crédit de 12 px dessous, `loading="lazy"` et `decoding="async"`. Elle disparaît proprement si elle ne charge pas. Alt vide si la photo est décorative (vignette, tuile), sinon le sujet.
  - **Couverture** de formation : 16:9 en tête de page.
  - **Image de leçon** : 3:2 sous le titre. Rien n'est réservé tant que l'adresse n'est pas connue : elle se glisse quand elle arrive, et rien ne s'affiche si rien ne vient.
  - **Crédit** : Commons = auteur, licence, « Wikimédia Commons » (lien vers la page du fichier). Unsplash = « Photo : <photographe> sur Unsplash », deux liens (photographe et Unsplash) avec `utm_source=koios&utm_medium=referral`. Sur l'accueil, où les photos sont des tuiles, les crédits sont réunis dans « Crédits des photos » en bas de page.
  - **Tuile photo (idée de formation)** : 2 grandes tuiles 2×1 (photo 2:1) puis 4 petites 1×1 (photo 4:3), coins 16 px, titre de 16 px 600 sous la photo sur fond blanc, icône de catégorie à côté. **Carte photo (formation vérifiée)** : 240 px de large, coins 16 px, photo 16:9, badge Vérifié, nombre de leçons, barre de progression ; elles défilent à l'horizontale (scroll-snap). **Mosaïque** de première visite : 4 photos, coins 12 px.
  - Quand aucune photo n'est connue : un cadre `--ligne` avec l'icône de catégorie (32 px), jamais un cadre vide.
- **Tuile de catégorie** : carré de 48 px, coins 10 px, fond `--surface`, icône de 24 px en `--encre-2`. Elle remplace la photo d'une vignette quand il n'y en a pas : plus jamais la lettre seule. La catégorie vient du titre du sujet (mots-clés, sans accents ; « livre » par défaut).
- **Vignette** de liste : 48 px, coins 10 px, photo recadrée.
- **En-tête de niveau** (sommaire) : tuile ronde de 40 px avec l'icône du niveau, « Niveau 1 » en 12 px capitales espacées `--encre-2` au-dessus du titre (20 px, 700), « 1/3 modules » à droite, puis barre de 4 px.
- **Rangée de module** : numéro dans un cercle de 32 px (fait : plein `--encre`, chiffre blanc ; en cours : contour `--encre` ; verrouillé : contour `--ligne`, chiffre `--encre-2`), titre 16 px 600, objectif 14 px `--encre-2` sur 2 lignes au plus, chevron (ouvert ou ouvrable) ou cadenas (verrouillé, avec aria-label « verrouillé »). Un module ouvert se déplie sur ses leçons. Une seule phrase en tête du sommaire : « Les modules s’ouvrent dans l’ordre. »
- **Titre de section** de leçon : icône de 20 px `--encre-2` alignée sur la ligne du titre (20 px, 600).
- **Bloc « À retenir »** : fond `--pale` (teinte de la catégorie), coins 12 px, aucun liseré, titre avec l'icône « epingle » (PushPin), puces. **Définitions** : liste `dl` ; chaque terme en 17 px 700 couleur `--acc`, pastille de 8 px à gauche (pas de liseré), définition en 16 px, fond blanc, filets fins de 1 px ; le premier terme d'une leçon est une tuile mise en avant (fond `--pale`, coins 16 px).
- **Mot déjà défini** (dans une leçon) : `span` en ligne, `role="button"` et `tabindex="0"`, souligné en pointillés `--encre-2`, activable par Entrée et Espace ; il se coupe en fin de ligne comme le texte (jamais un `button`). Zone de toucher élargie par un padding vertical de 8 px qui ne change pas l'interligne. Les mots de 4 lettres ou moins ne se soulignent qu'à casse identique.
- **Bloc « Avant de commencer »** (tête de leçon) : fond `--surface`, bord 1 px `--bord`, coins 12 px, titre avec l'icône « chemin », puces de rappels, lien « Voir le glossaire ». **Bloc « Exemple »** : fond `--pale`, bord 1 px `--bord`, coins 12 px, icône « ampoule ». Pas de carte dedans.
- **Carte retournable** (« Tes cartes », onglet Cartes) : bouton pleine largeur, 132 px au moins, coins 16 px. Recto : fond `--pale`, bord `--bord`, étiquette « Question ». Verso : fond `--acc`, texte blanc, étiquette « Réponse ». Retournement par rotation de 250 ms, coupé sous `prefers-reduced-motion` ; `aria-pressed` ; seule la face visible est lue. **Révision** : « Carte 3 sur 12 », barre de 4 px, puis « À revoir » (secondaire) et « Je savais » (noir) côte à côte.
- **Sources repliées** : `details` « Sources (n) », fermé par défaut, icône « lien », chevron qui pivote ; liens de 44 px au moins.
- **Carte « Cours vérifié à la main »** : lien fond `--juste-pale`, icône « verifie », texte « Cours vérifié à la main · N chapitres de référence », chevron. **Bouton « Aller plus loin · 3 à 5 modules de plus »** : secondaire, en bas du sommaire et sur « Formation terminée ». **Suggestions « Formations existantes »** : rangées de liste sous le champ de recherche, au-dessus du bouton.
- **Onglets d'une formation** : Leçons, Quiz, Défis, Cartes, Glossaire (14 px). **Fiche du module** : lien « Fiche du module » dans le module ouvert ; page avec « À retenir » et définitions par leçon faite.
- **Ligne méta d'une leçon** : badge, « Leçon n », durée estimée (« ≈ 3 min », 200 mots par minute, 1 minute au moins, affichée seulement si elle est calculée).
- **Attente de génération** : titre, barre indéterminée de 4 px, une phrase, puis « Ce qui se passe » en trois lignes à icône (Recherche des sources, Rédaction de la leçon, Vérification par une 2e IA). Ce sont des étapes décrites : ni coche animée, ni pourcentage. Le bloc n'apparaît qu'après une demi-seconde.
- **État vide** : icône de 32 px `--encre-2`, une phrase, un bouton utile. Pas de carte. (Sans formation, c'est la tuile « Lance ta première formation ».)
- **Formation** : liste verticale de leçons (pastille numérotée, titre, état) ; jalons « Quiz » toutes les 5 leçons et « Grand quiz » toutes les 10.
- **Formulaire de quiz** (Jouer, Amis) : champ « Sujet libre » (52 px), puces de thèmes (16, 44 px de haut, coins 12 px, icône de catégorie de 20 px, fond `--pale` et texte `--acc` de leur teinte ; choisie : fond `--acc`, texte blanc), bouton secondaire « Surprends-moi », longueur en boutons segmentés (composant `.onglets`, `role="radiogroup"`, 10 20 30 40 50), bouton principal « Lancer le quiz ».
- **Attente par blocs** : titre du sujet, barre déterminée de 4 px en `--encre` (questions reçues sur questions voulues, jamais d'or : l'or reste à l'XP), « 10 questions sur 30 prêtes » en 20 px, les trois étapes décrites. Pendant la partie, une ligne de 14 px sous la question dit combien de questions sont prêtes ; au-delà de 20 questions, les points de progression se resserrent (1 px).
- **Classement** : rangées de 52 px (rang, pseudo, « bonnes/total · points »), « (toi) » sur ma ligne, « … » quand le rang saute ; les 20 premiers plus ma place. **Carte du tournoi** : une seule carte (titre, temps restant, thème, bouton, classement en rangées, sans carte dedans).
- **Réponse de quiz** : rangée pleine largeur, coins 14 px, lettre A B C D dans un cercle de 32 px, survol et appui en teinte, bord 1 px ; juste en vert pâle avec une coche qui se dessine ; fausse en rouge pâle avec un léger tremblement ; l'explication s'affiche toujours après la réponse.
- **XP** : pastille or discrète (« Niv. 4 · 320 XP »), barre fine de 4 px. **Anneau de niveau** (profil) : 148 px, anneau `--or` de progression vers le niveau suivant, numéro en 48 px, puis trois chiffres clés séparés par des filets.
- **Rangée de membre** (page d'un groupe) : rang dans un cercle de 32 px (`--surface`), pseudo 16 px 600 (« (toi) » sur ma ligne), puis « 4 leçons faites · 120 XP · il y a 2 h » en 14 px `--encre-2`, puis une barre de 4 px en `--or` (leçons faites sur la formation, ou sur le membre le plus avancé quand le total n'est pas connu). Pas de chevron : la rangée n'est pas un lien.
- **Partie en direct** : écran plein, sans navigation du bas, bouton « fermer » en haut à gauche.
  - **Code de partie** : tuile `--surface` aux coins de 16 px, libellé « Code de la partie » en capitales de 12 px, code en 48 px 700 à lettres espacées (0,16 em), lien dessous en 14 px.
  - **Compte à rebours** : secondes en 20 px 700 à droite de « Question 3 sur 10 », barre de 4 px en `--encre` qui se vide (échelle horizontale, 250 ms linéaire ; sous `prefers-reduced-motion` elle avance par à-coups sans transition). Jamais d'or ni de rouge : l'or reste à l'XP, le rouge au faux.
  - **Réponse choisie** (avant le résultat) : bord et lettre en `--encre`, sans vert ni rouge ; au résultat, la bonne réponse passe au vert avec la coche, ma mauvaise en rouge, puis le bloc d'explication et le classement provisoire.
  - **Podium** : au plus trois colonnes de 112, 84 et 64 px (premier au centre, plein `--encre`, les autres `--surface`), pseudo et points au-dessus, rang en 30 px dans la colonne. Une seule animation de 250 ms (la colonne monte), aucune pluie de confettis, aucun son.
  - **Liste des joueurs** de la salle d'attente : rangées de 52 px, les nouveaux arrivants s'ajoutent sans que la liste clignote.
- **Icônes** : Phosphor « regular » (licence MIT, mention en tête de `icones.js`), 20 px dans le texte, 24 px dans une tuile, 32 px dans un état vide ou un cadre photo, 22 px dans la navigation. Toujours avec un rôle : repérer une catégorie, un niveau, une section, un état, une action. Jamais en décor. Flèche (« fleche ») pour les boutons qui avancent ; chevron (« chevron ») pour les rangées de liste et le coin des tuiles qui sont des liens.

## Mouvement

Uniquement `transform` et `opacité` (l'anneau de progression et le dépliage d'un module animent aussi leur trait ou leur hauteur), de 150 à 250 ms, `ease-out`. Tout est coupé sous `prefers-reduced-motion` : les contenus s'affichent directement, la barre indéterminée devient un trait fixe.

- Changement de page : fondu et glissement de 8 px. Rangées de liste : apparition décalée de 40 ms, 8 au plus. Tuiles de l'accueil : décalage de 50 ms, 8 au plus. Barres de progression et anneau : remplissage à l'affichage.
- Bouton appuyé : 98 %. Bonne réponse : la case passe au vert, la coche se dessine. Mauvaise réponse : tremblement de 3 px, une fois.
- Gain d'XP : la pastille compte jusqu'à la nouvelle valeur et pulse une fois en or. Fin de leçon : une coche se dessine dans un cercle avant de passer à la suite.
- Module du sommaire : dépliage par `grid-template-rows` (0fr vers 1fr). Fiche du glossaire : elle monte du bas.
- Interdits : confettis, rebonds, parallaxe, animation en boucle (sauf la barre d'attente), animation qui retarde la lecture.

## Interdits (le relecteur vérifie chaque écran)

- Couleurs : violet, dégradés, néon, fonds crème ou beige, terracotta.
- Polices : Inter, Geist, Roboto, Space Grotesk, Poppins, Montserrat, DM Sans, Playfair.
- Gabarits « IA » : grande accroche centrée suivie de trois cartes, émojis, mascotte, illustrations ou photos générées, confettis, liseré de couleur sur le côté d'une carte (seul le filet d'encre de la citation est permis), cartes dans des cartes, ombres portées.
- Mots : Bienvenue, Découvrez, N'hésitez pas, au cœur de, véritable, incontournable, passion, sublimer, écrin, expérience, univers, authentique, d'exception, excellence, intemporel, En savoir plus.

Vérification automatique : `python3 scripts/verifier.py` (app) et `python3 scripts/catalogue.py` (contenu vérifié).

## Lot 3c : révision, badges

- **Révision du jour** (`#/reviser`) : un élément à la fois, carte retournable (voir Carte retournable), deux boutons de 44 px « À revoir » et « Je savais ». Fin : bilan et date de la prochaine révision. Cinq boîtes, 1, 3, 7, 16 et 35 jours.
- **Badges** : pastille ronde de 56 px teintée (couleur de catégorie, icône Phosphor), obtenu = en couleur, à venir = gris avec la condition. Page `#/badges`, depuis le Profil. Pas d’emoji.
- **Toast de badge** : petite carte en bas, entrée par `transform` et opacité (250 ms), disparaît seule ; coupée sous `prefers-reduced-motion`.
- **Une seule façon d’apprendre (lot 11)** : plus de sélecteur de lecture ni de choix Essentiel / Complet. Tous les modules sont visibles dans l’ordre. En bas d’une leçon, une ligne « Ensuite : <titre de la leçon suivante> » (14 px `--encre-2`, icône « fleche »), seulement si ce titre est connu.
- **Cours vérifiés (v-xx)** : masqués à l’utilisateur (ni carte, ni formation).

## Lot 9 : visuels de leçon et piège fréquent

- **Visuels de leçon** : 0 à 2 figures par leçon, dessinées par `app/visuels.js` en SVG à partir de données validées par le serveur (jamais d'image fabriquée). Sept types : échelle (repères sur une ligne verticale), courbe (1 à 3 séries), barres (comparaison), tableau (vrai tableau HTML), frise (dates croissantes), schéma (boîtes et flèches), carte mentale (centre noir, branches en boîtes). Placés entre « Comment » et « Exemple ».
- **Couleurs** : jetons seulement. Courbes : série 1 `--acc` en trait plein, série 2 `--encre` en tirets, série 3 `--encre-2` en pointillés (la forme du trait distingue les séries, pas la couleur seule). Barres `--acc`. Boîtes : fond `--pale`, bord 1,5 px `--acc`. Axes, traits et flèches `--encre-2` (contraste 3:1 au moins ; `--ligne-forte` est trop pâle pour un trait qui porte du sens). Aucun remplissage sous une courbe, aucun dégradé, aucune ombre.
- **Texte** : 14 px au moins à 390 px (viewBox de 340 de large, affichée à 100 % de la colonne). Nombres compacts dans le dessin (« 361 M », « 1000 Md »), entiers complets dans l'alternative. Une année s'écrit sans séparateur de milliers (« 1889 »). Libellés longs coupés avec « … » (légendes de courbe, dates de frise, libellés de liens : 18 caractères) ; le texte entier reste dans le tableau alternatif.
- **Alternative** : chaque dessin est suivi d'un tableau lisible par lecteur d'écran, dans un `div.sr` (masqué à l'œil), et porte un `aria-label` en phrases. Le tableau visible (type tableau) est en `table-layout: fixed`, cellules coupées au besoin (`overflow-wrap: anywhere`), jamais de défilement horizontal.
- **Pas de décor** : un visuel montre des données de la leçon ou rien ; la carte mentale n'a pas de légende en plus de son centre. Un schéma a 3 couloirs de retour au plus ; les liens en trop sont listés sous le dessin.
- **Piège fréquent** : section de leçon en texte, titre de 20 px avec l'icône « faux » (cercle barré d'une croix, `--encre-2`, jamais rouge), distincte de la loupe qui sert à la recherche. Une phrase qui nomme l'erreur courante, puis ce qui est vrai.
