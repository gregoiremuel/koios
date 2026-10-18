# DESIGN.md — Koîos

Koîos se lit comme un livre de la collection Gallimard « Découvertes » et s'oriente comme un musée : papier blanc, encre, un code couleur par domaine, des filets, aucune carte. Rien n'est laissé à l'improvisation du modèle : en cas de doute, ce fichier gagne.

## Références

| Référence | Ce qu'on reprend |
| --- | --- |
| Gallimard « Découvertes » | Chapô puis intertitres, légendes qui apprennent quelque chose, domaines codés par couleur |
| Rijksmuseum | Identité surtout typographique ; une police pour lire, une pour s'orienter |
| Tate | Deux graisses seulement ; la typo s'efface devant le contenu |
| Centre Pompidou | Une couleur par département, utilisée comme repère |
| Pompidou-Metz | Libellés entre deux filets horizontaux |
| MACK | Le design s'efface devant l'image ; l'image revient toujours au même endroit |

Sources : voir `docs/cahier-des-charges.md` et le Doc de référence.

## Couleurs (jetons)

| Jeton | Clair | Sombre | Usage |
| --- | --- | --- | --- |
| `--paper` | #ffffff | #141517 | Fond |
| `--ink` | #17191c | #ecece9 | Texte, filets forts, boutons pleins |
| `--ink-2` | #5a5f66 | #a3a7ad | Texte secondaire |
| `--hair` | #dadcdf | #2e3135 | Filets fins |
| `--hg` | #b42318 | #f0705f | Histoire et géographie (rouge) |
| `--sn` | #1e6b4a | #5fbf92 | Sciences et nature (vert) |
| `--ac` | #1f48b8 | #8ea8f5 | Arts et culture (bleu) |
| `--gj` | #a87400 | #e0b23c | Gemmologie et joaillerie (ocre ; texte fin en #7a5400) |

- Mode clair par défaut ; le sombre suit le réglage du téléphone.
- Hors partie, la couleur d'un domaine ne vit que sur son code (HG, SN, AC, GJ), un filet ou une progression, jamais en fond.
- En partie, la couleur du domaine s'affirme sur le minuteur et le filet de correction.
- 5 domaines colorés au plus. Les sujets libres sont à l'encre.

## Typographie

- **Newsreader** (Production Type, Paris) : titres, questions, réponses, citations du Rival en italique.
- **Libre Franklin** : libellés, codes de domaine, chiffres, boutons.
- Deux graisses par famille au plus : Newsreader 400 et 500, Libre Franklin 400 et 600.
- Échelle : 12 (libellés en capitales, interlettrage 0,08 em) · 14 (méta) · 17 (texte) · 20-21 (réponses, listes) · 28-30 (questions, titres) · 72 (score).
- Lignes de 45 à 75 caractères ; `text-wrap: balance` sur les titres.
- Typographie française : espace fine insécable (U+202F) avant ; ? ! % et avant », insécable (U+00A0) avant : et après « ; apostrophe ’ ; trait d'union insécable (U+2011) dans les inversions courtes (« s'ouvrent‑ils »).

## Mise en page

- Une colonne de 34 rem au plus, alignée à gauche, marge latérale de 16 px au moins.
- Sections ouvertes par un en-tête courant entre deux filets : 2 px d'encre au-dessus, 1 px en dessous, libellé à gauche, information à droite.
- Listes en lignes séparées par des filets fins ; aucune carte, aucun coin arrondi.
- Boutons rectangulaires : plein à l'encre pour l'action principale (un par écran), contour d'encre de 1,5 px pour les autres. Hauteur 48 à 52 px.
- Codes de domaine façon numéro de salle : deux capitales en Libre Franklin, couleur du domaine.
- Le Rival : un « î » d'encre, trait vertical de 3 px coiffé de l'accent circonflexe de Koîos, qui s'incline selon son humeur. Jamais encadré (il deviendrait le pictogramme « information »), jamais une mascotte. Forme à valider par Greg.
- Sélection d'une réponse : filet d'encre de 3 px au-dessus de la ligne. Bonne réponse : aplat d'encre (jamais la couleur du domaine, le rouge se lit « erreur »).
- Barre de navigation en bas : libellés seuls, sans icônes ; l'écran courant est marqué par un filet d'encre au-dessus.

## Interdits (le relecteur vérifie chaque écran)

- Couleurs : violet, dégradés, crème et terracotta, néon sur fond sombre, une couleur différente par bloc sans raison.
- Polices : Inter, Geist, Roboto, Space Grotesk, Poppins, Montserrat, DM Sans, Playfair Display.
- Formes : ombres sous des cartes flottantes, liseré de couleur sur le côté d'un bloc, cartes dans des cartes, coins arrondis partout, pastilles et points de statut partout, verre dépoli, étoiles et constellations décoratives.
- Icônes : jamais d'emoji ; pas d'icônes décoratives.
- Gabarit : grande accroche centrée suivie de trois cartes et d'un bouton.
- Mots : Bienvenue, Découvrez, N'hésitez pas, au cœur de, véritable, incontournable, passion, sublimer, écrin, expérience, univers, authentique, d'exception, excellence, intemporel, En savoir plus.

Vérification automatique : `python3 scripts/verifier.py`.
