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
