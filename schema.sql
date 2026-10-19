-- Référence. Les mêmes instructions sont exécutées automatiquement
-- (une fois par isolat) par initBase() dans lib/api.js.
-- Pour créer les tables à la main : npx wrangler d1 execute koios --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS joueurs (
  id TEXT PRIMARY KEY,
  cle_hash TEXT,
  pseudo TEXT,
  ton TEXT DEFAULT 'taquin',
  etat TEXT DEFAULT '{}',
  points INTEGER DEFAULT 0,
  valides INTEGER DEFAULT 0,
  cree TEXT,
  maj TEXT
);

CREATE TABLE IF NOT EXISTS brouillons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  joueur TEXT,
  sujet TEXT,
  contenu TEXT,
  cree TEXT
);

CREATE TABLE IF NOT EXISTS signalements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  joueur TEXT,
  chapitre TEXT,
  exercice INTEGER,
  message TEXT,
  cree TEXT
);

CREATE TABLE IF NOT EXISTS quotas (
  cle TEXT PRIMARY KEY,
  n INTEGER,
  jour TEXT
);

CREATE TABLE IF NOT EXISTS sujets (
  id TEXT PRIMARY KEY,
  titre TEXT,
  parent TEXT,
  niveau INTEGER,
  contenu TEXT,
  auteur TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
);

CREATE INDEX IF NOT EXISTS idx_sujets_parent ON sujets(parent);

CREATE TABLE IF NOT EXISTS chapitres_ia (
  id TEXT PRIMARY KEY,
  sujet TEXT,
  numero INTEGER,
  contenu TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
);

CREATE INDEX IF NOT EXISTS idx_chapitres_ia_sujet ON chapitres_ia(sujet);

CREATE TABLE IF NOT EXISTS duels (
  id TEXT PRIMARY KEY,
  createur TEXT,
  questions TEXT,
  scores TEXT,
  cree TEXT
);

CREATE TABLE IF NOT EXISTS parcours (
  id TEXT PRIMARY KEY,
  titre TEXT,
  contenu TEXT,
  auteur TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
);

CREATE TABLE IF NOT EXISTS paliers (
  id TEXT PRIMARY KEY,
  parcours TEXT,
  numero INTEGER,
  contenu TEXT,
  vues INTEGER DEFAULT 0,
  cree TEXT
);

CREATE INDEX IF NOT EXISTS idx_paliers_parcours ON paliers(parcours);

CREATE TABLE IF NOT EXISTS quiz_direct (
  parcours TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
);

-- Photos libres (Unsplash) mises en cache par requête, y compris l'absence de résultat.
CREATE TABLE IF NOT EXISTS images (
  requete TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
);

-- Quiz de culture générale : blocs de 10 questions par sujet libre (id = <slug>:<k>), question du jour (jour:AAAA-MM-JJ),
-- questions du tournoi (tournoi:AAAA-MM-JJ). Un bloc écrit est partagé entre tous les lecteurs.
CREATE TABLE IF NOT EXISTS quiz_general (
  id TEXT PRIMARY KEY,
  sujet TEXT,
  bloc INTEGER,
  contenu TEXT,
  cree TEXT
);

-- Titre, type (salon ou tournoi) et fin d'un duel : une ligne par salon ou tournoi, id = identifiant du duel.
-- Un duel sans ligne ici est un duel ordinaire.
CREATE TABLE IF NOT EXISTS salons (
  id TEXT PRIMARY KEY,
  titre TEXT,
  type TEXT,
  fin TEXT,
  cree TEXT
);

-- Formation à plusieurs : un groupe suit une formation (parcours). La progression des membres est lue dans joueurs.etat.
CREATE TABLE IF NOT EXISTS groupes (
  id TEXT PRIMARY KEY,
  nom TEXT,
  parcours TEXT,
  createur TEXT,
  cree TEXT
);

CREATE TABLE IF NOT EXISTS groupe_membres (
  groupe TEXT,
  joueur TEXT,
  rejoint TEXT,
  PRIMARY KEY (groupe, joueur)
);

-- Jeu en direct : une partie (code de 6 caractères), ses joueurs et leurs réponses. L'état courant se déduit de
-- debut_question et de l'horloge du serveur à chaque lecture (aucune tâche de fond).
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  createur TEXT,
  titre TEXT,
  questions TEXT,
  etat TEXT,
  indice INTEGER,
  debut_question INTEGER,
  cree TEXT
);

CREATE TABLE IF NOT EXISTS parties_joueurs (
  partie TEXT,
  joueur TEXT,
  points INTEGER,
  PRIMARY KEY (partie, joueur)
);

CREATE TABLE IF NOT EXISTS parties_reponses (
  partie TEXT,
  joueur TEXT,
  indice INTEGER,
  choix INTEGER,
  ms INTEGER,
  juste INTEGER,
  PRIMARY KEY (partie, joueur, indice)
);

-- Leçons réécrites en version « simple » ou « expert » (id = <parcours>:<n>:<mode>), vérifiées par une 2e IA et
-- partagées entre tous les lecteurs.
CREATE TABLE IF NOT EXISTS variantes (
  id TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
);

-- Génération de nuit (admin) : file des modules à ouvrir et des leçons à écrire. Un passage du cron (toutes les
-- 5 minutes) prend au plus 2 tâches ; 3 essais au plus, puis « echec ».
CREATE TABLE IF NOT EXISTS file_attente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parcours TEXT,
  type TEXT,
  numero INTEGER,
  etat TEXT DEFAULT 'attente',
  essais INTEGER DEFAULT 0,
  erreur TEXT,
  maj TEXT,
  UNIQUE (parcours, type, numero)
);
