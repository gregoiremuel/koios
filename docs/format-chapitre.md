# Format d'un chapitre (JSON)

Un fichier par chapitre : `app/contenu/<id>.json`, avec `<id>` = code du domaine + numéro sur 2 chiffres (`hg-01`, `sn-02`, `ac-03`, `gj-01`).
Domaines : `hg` Histoire et géographie, `sn` Sciences et nature, `ac` Arts et culture, `gj` Gemmologie et joaillerie.
Exemple complet : `app/contenu/hg-01.json`.

## Champs

- `id`, `domaine`, `numero` (entier), `titre` (court, sans date entre parenthèses inutile).
- `figure` : `null` ou `{ "src", "alt", "credit" }`. Seulement une œuvre ou photo de Wikimedia Commons dont tu as vérifié le nom de fichier ; `src` = `https://commons.wikimedia.org/wiki/Special:FilePath/<Nom_du_fichier>?width=800`. Dans le doute : `null`.
- `essentiel` : 3 à 5 phrases complètes, niveau adulte, chacune couverte par les sources du chapitre.
- `reperes` : 4 ou 5 paires `["repère court", "explication d'une phrase"]` (une date, une valeur, une notion).
- `sources` : toutes les sources du chapitre, `["Organisme · Titre de la page", "URL ouverte"]`.
- `exercices` : exactement 3, dans cet ordre de types :
  1. `qcm` : `enonce`, `reponses` (4 choix plausibles), `bonne` (indice 0-3).
  2. `bluff` : `affirmation` (une phrase que le Rival affirme), `vrai` (true ou false). Viser un piège instructif (idée reçue).
  3. `frise` : `enonce` (« Range… du … au … »), `elements` (4, mélangés), `ordre` (4, dans le bon ordre), `valeurs` (objet : élément → valeur affichée, ex. date, dureté, distance).
- Chaque exercice a aussi : `lib` (« Exercice 1 · question à choix », « Exercice 2 · le Rival bluffe-t-il ? », « Exercice 3 · frise » ou « Exercice 3 · classement »), `theme` (ce qu'on révise, 3-6 mots), `repere` (indice du repère lié dans `reperes`), `correction` (1-2 phrases), `sources` (au moins 2, dont une institutionnelle ou savante), `rivalJuste` et `rivalFaux` (répliques courtes du Rival, pince-sans-rire, jamais blessantes).

## Règles de contenu

- Au moins 2 sources indépendantes par exercice, dont une institutionnelle ou savante (musée, archives, université, bibliothèque nationale, encyclopédie éditée comme Universalis, Larousse ou Britannica, organisme officiel, revue scientifique). Wikipédia ne compte jamais.
- Chaque URL a été ouverte, et la page confirme le fait. Sinon, on n'écrit pas l'exercice.
- Français soigné, typographie française (espace insécable avant : ; ? ! et dans « … », apostrophe ’).
- Mots interdits (voir `DESIGN.md`) : Bienvenue, Découvrez, N'hésitez pas, au cœur de, véritable, incontournable, passion, sublimer, écrin, expérience, univers, authentique, d'exception, excellence, intemporel.
