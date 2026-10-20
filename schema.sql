-- Référence. Les mêmes instructions sont exécutées automatiquement
-- (une fois par isolat) par initBase() dans lib/api.js.
-- Pour créer les tables à la main : npx wrangler d1 execute koios --remote --file=schema.sql

-- Joueurs. Un ancien profil n'a que id, cle_hash (clé de connexion) et pseudo. Un compte (lot 6) a en plus prénom, nom, pseudo_cle (pseudo en
-- minuscules, unique), mdp_hash (PBKDF2 : pbkdf2$100000$sel$hash), secours_hash (phrase de secours hachée), role (joueur ou admin), bloque (0 ou 1),
-- google_sub (identifiant Google), vu (dernière activité), reinit_hash et reinit_fin (code temporaire donné par l'admin, valable 24 h).
-- Une base plus ancienne reçoit ces colonnes par ALTER au démarrage (migrerBase dans lib/api.js), puis les deux index uniques ci-dessous.
CREATE TABLE IF NOT EXISTS joueurs (
  id TEXT PRIMARY KEY,
  cle_hash TEXT,
  pseudo TEXT,
  ton TEXT DEFAULT 'taquin',
  etat TEXT DEFAULT '{}',
  points INTEGER DEFAULT 0,
  valides INTEGER DEFAULT 0,
  cree TEXT,
  maj TEXT,
  prenom TEXT,
  nom TEXT,
  pseudo_cle TEXT,
  mdp_hash TEXT,
  secours_hash TEXT,
  role TEXT DEFAULT 'joueur',
  bloque INTEGER DEFAULT 0,
  google_sub TEXT,
  vu TEXT,
  reinit_hash TEXT,
  reinit_fin TEXT
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

-- Extraits encyclopédiques (Wikipédia FR, EN si le français est maigre) donnés au rédacteur et au vérificateur d'une leçon,
-- gardés 30 jours. cle = ancre:<requête>|<titre voulu> (recherche) ou page:<langue>:<titre> (page de référence).
CREATE TABLE IF NOT EXISTS sources_cache (
  cle TEXT PRIMARY KEY,
  contenu TEXT,
  cree TEXT
);

-- Sessions : une par appareil (clé envoyée par l'app, seule son empreinte est gardée), 180 jours d'inactivité au plus.
CREATE TABLE IF NOT EXISTS sessions (
  cle_hash TEXT PRIMARY KEY,
  joueur_id TEXT,
  cree TEXT,
  vu TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_joueur ON sessions(joueur_id);

-- Codes d'amis : un code donne `bonus` créations IA de plus par jour pendant `jours` jours, à `usages_max` personnes au plus.
CREATE TABLE IF NOT EXISTS codes (
  code TEXT PRIMARY KEY,
  bonus INTEGER,
  jours INTEGER,
  usages_max INTEGER,
  usages INTEGER DEFAULT 0,
  cree TEXT,
  revoque INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS codes_utilises (
  code TEXT,
  joueur_id TEXT,
  expire TEXT,
  PRIMARY KEY (code, joueur_id)
);

-- Amitiés : etat « demande » (a a demandé à b) ou « ami ». Une seule ligne par paire.
CREATE TABLE IF NOT EXISTS amities (
  a TEXT,
  b TEXT,
  etat TEXT,
  cree TEXT,
  PRIMARY KEY (a, b)
);

CREATE INDEX IF NOT EXISTS idx_amities_b ON amities(b);

-- Liens d'invitation : jeton aléatoire (seule son empreinte est gardée), à usage limité, 7 jours.
CREATE TABLE IF NOT EXISTS invitations (
  jeton_hash TEXT PRIMARY KEY,
  joueur_id TEXT,
  cree TEXT,
  expire TEXT,
  usages_max INTEGER,
  usages INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_joueurs_pseudo_cle ON joueurs(pseudo_cle) WHERE pseudo_cle IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_joueurs_google_sub ON joueurs(google_sub) WHERE google_sub IS NOT NULL;
