# Plan v3 : formations complètes, de la base à l'expert

Décisions de Greg (19 octobre 2026) :
- Une formation = **4 niveaux** (Bases, Intermédiaire, Avancé, Expert) → **modules** → **leçons courtes** (3 minutes). Sommaire visible dès le début. Leçons rédigées à la demande. Plusieurs centaines de leçons possibles.
- **4 onglets** : Apprendre · Jouer · Amis · Profil.
- **Documents** : PDF (texte) et texte collé. La formation créée reste privée.
- **Sources** : sources ouvertes gratuites d'abord. Recherche web complète peut-être plus tard.
- Design : garder le blanc et net (DESIGN.md). Ajouter photos, icônes, boutons plus travaillés. Rien qui « fasse IA ».

Chaque lot : bâtisseur (Sonnet) construit, testeur lance les tests, relecteur (Opus) relit à froid, puis mise en ligne (commandes dans `docs/lecons.md`).

## Lot 1 : moteur de formation (serveur)

Données. On garde la table `parcours`. `contenu.programme` remplace `contenu.etapes` :
`{ niveaux: [{ numero, titre, modules: [{ numero, titre, objectif, lecons: [{ numero, titre }] | null }] }] }`.
- À la création : GLM écrit le programme d'ensemble. 4 niveaux, 3 à 8 modules par niveau, un titre et un objectif d'une ligne par module. Pas encore les leçons.
- À l'ouverture d'un module : GLM écrit ses 5 à 10 titres de leçons, puis on les enregistre.
- Le niveau Bases commence toujours par les définitions et les repères essentiels.
- Numéro global d'une leçon = son rang dans tout le programme. La route `palier?parcours=&n=` garde ce numéro global, donc XP, verrous et quiz tous les 5 continuent de marcher.
- Glossaire du parcours : les termes définis s'ajoutent à chaque leçon (`contenu.glossaire`). La rédaction d'une leçon reçoit le programme, l'objectif du module, les titres des leçons précédentes et le glossaire, donc elle ne répète pas et s'appuie sur l'acquis.

Leçon (format court) :
- `enBref` (2 à 3 phrases) et `explication` (comment, pourquoi, où et quand, selon le sujet).
- `aRetenir` (3 puces) et `mnemo` (moyen mnémotechnique, facultatif, vérifié comme le reste).
- `definitions`, un seul `visuel` principal (frise, chiffres, courbe `{ x, y }`, schéma de notions), `image` (avec crédit et licence), `citation` (facultative), `sources`, 3 questions.

Vérification : comme aujourd'hui. La 2e IA contrôle chaque affirmation, et tout ce qui n'est pas confirmé est retiré.

Parcours vérifiés : leurs chapitres actuels deviennent le niveau Bases. Les niveaux suivants restent à écrire.

Anciens parcours IA (format `etapes`) : on les lit encore. Un seul module « Suite » par étape.

## Lot 2 : images et design

- Avant de toucher au design, charger le skill `sites-boutiques` (partie photos) et `frontend-design`, puis relire `DESIGN.md`.
- Une image par leçon :
  - sujets factuels (lieux, œuvres, personnes) : Wikimedia Commons d'abord ;
  - ambiance : Unsplash.
  - Crédit et licence affichés. Étendre `/api/image` avec `source=commons`.
- Couvertures des parcours vérifiés, via `/api/image`.
- Icônes de catégorie (Phosphor) à la place des carrés à lettre. Une icône par niveau. Boutons avec icône. États vides soignés.
- Nouveaux visuels dans `visuels.js` : `courbe`, `schema`. Nouveaux blocs : « À retenir », « Pour s'en souvenir ».
- Pas d'image générée par IA (risque d'erreur, effet « IA »).

## Lot 3 : onglets

- **Apprendre** : recherche, mes formations, sommaire par niveaux, leçons.
- **Jouer** :
  - quiz de culture générale par thème (musique, cinéma, sport, géographie…) ;
  - quiz sur mes formations, mini-jeux, question du jour.
- **Amis** :
  - inviter avec un lien, duels ;
  - formation à plusieurs : un groupe suit la même formation, voit la progression de chacun et a son classement ;
  - scores partagés.
- **Profil** : niveau, XP, statistiques, clé de connexion.

## Lot 4 : documents

- PDF lu dans le navigateur (pdf.js, depuis cdnjs) ou texte collé. Un PDF scanné sans texte est refusé avec un message clair.
- Plafond d'environ 300 000 caractères, découpés en morceaux dans une table `documents` (D1).
- Formation privée : l'auteur et les amis invités seulement. Jamais dans le cache public.
- Programme construit à partir du document. Les leçons citent les pages. La 2e IA vérifie contre les passages du document.

## Lot 5 : sources élargies

- **Phase 1 (gratuite)** :
  - Wikipédia FR et EN (déjà en place) ;
  - Wikidata, Wikimedia Commons, Gallica (BnF, interface SRU) et Open Library ;
  - Europeana (clé gratuite à demander, à valider).
- **Phase 2 (si Greg valide)** : une recherche web complète. Comparer les offres et leurs prix avant de choisir, car ces services sont en général payants au-delà d'un quota gratuit.

## Limites à dire à Greg

- Les quotas gratuits (GLM flash, Workers AI) limitent à quelques dizaines de leçons nouvelles par jour. Ça va pour un cercle d'amis. Pour le grand public, il faudra un budget.
- Contrôle par une 2e IA ≠ relecture humaine. Le badge le dit : « Recoupé automatiquement ».
- Un moyen mnémotechnique peut déformer un fait. Il passe donc par la même vérification.

## Décisions de Greg du 19 octobre (soir) : lot 3 et suivants

Choisi : révision espacée, badges et séries, mode « explique-moi simplement », dossier de voyage, certificat de fin de niveau, lecture à voix haute, mode hors ligne. Pas retenu pour l'instant : le Rival.
À plusieurs : salon par lien, tournoi de la semaine, formation à plusieurs, direct en même temps. Quiz général : 10, 20, 30, 40 ou 50 questions, régénérables.
Ordre : **3a** quiz général + question du jour sur tout sujet + salons par lien + tournoi · **3b** formation à plusieurs + direct (interrogation régulière) · **3c** révision espacée, badges et séries, « explique simplement » · **3d** dossier de voyage, certificat, voix, hors ligne.

## Lot 4 (demandes de Greg du 19 octobre, 19 h) : profondeur, « Aller plus loin », bibliothèque

Constat : la formation de gemmologie vérifiée n'a que 5 leçons très courtes, sans les bases ni les mots définis.
- **A. Leçons plus profondes** : sections de 4 à 10 phrases ; bloc « Avant de commencer » (les mots à connaître) ; chaque terme technique est défini dans la leçon ou dans une leçon précédente (contrôle par la 2e IA) ; analogie ou exemple concret ; le niveau Bases compte 6 à 10 modules de micro-leçons qui partent de « qu'est-ce que… » ; les autres niveaux 8 à 12 modules.
- **B. « Aller plus loin »** : à la fin du programme (et à tout moment sur le dernier module), un bouton ajoute 3 à 5 modules plus pointus, sans répétition, partagés par tous les lecteurs. Plafond de leçons relevé (1 500).
- **C. Gemmologie** : formation IA complète (« Gemmologie et joaillerie ») qui part de zéro ; les 5 chapitres vérifiés à la main restent comme cours de référence relié.
- **D. Bibliothèque** : recherche de formations existantes (GET parcours?q=) avant d'en créer ; jamais de régénération d'un sujet déjà créé ; page Bibliothèque ; chaque « Aller plus loin » enrichit la formation pour tous.
- **E. Sources** : repliées dans un bandeau « Sources (n) » en bas de chaque leçon, ouvert au toucher.
- **F. Pose une question** (après) : champ dans la leçon, réponse de l'IA à partir de la leçon et des extraits, contrôlée par la 2e IA, quota par jour.
