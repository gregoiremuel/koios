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
