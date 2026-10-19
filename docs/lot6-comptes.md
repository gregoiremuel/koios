# Lot 6 : comptes, admin, codes, vie privée

Règles : aucun secret dans le dépôt ; mots de passe jamais en clair ni journalisés ; tests avec `timeout 240 node scripts/test_api.mjs` et `python3 scripts/verifier.py` ; TABLES de lib/api.js = schema.sql ; français, espaces insécables (voir verifier.py).

## 6A. Comptes
- Colonnes ajoutées à `joueurs` (ALTER au démarrage dans initBase si absentes, et dans schema.sql) : `prenom`, `nom`, `pseudo_cle` (pseudo en minuscules, UNIQUE quand non nul), `mdp_hash`, `secours_hash`, `role` ('joueur' par défaut, 'admin'), `bloque` (0/1), `google_sub` (UNIQUE quand non nul), `vu` (dernière activité).
- Table `sessions (cle_hash PK, joueur_id, cree, vu)` : une session par appareil, 180 jours. L'authentification actuelle (clé envoyée par l'app) cherche d'abord dans `sessions`, puis l'ancien `joueurs.cle_hash` (anciens profils). Un compte `bloque` reçoit 403 partout.
- Mot de passe : 10 caractères au moins. PBKDF2-SHA256 WebCrypto, 100 000 itérations (maximum des Workers), sel aléatoire 16 octets, format `pbkdf2$100000$sel$hash`. Comparaison à temps constant.
- Pseudo : 3 à 20 caractères, lettres, chiffres, `_ . -`, unique sans tenir compte de la casse. Prénom et nom : 1 à 40 caractères.
- Routes (`functions/api/compte.js`) :
  - POST `{action:'inscrire', prenom, nom, pseudo, mdp}` → crée le compte, renvoie une session et une **phrase de secours** de 12 mots (liste de mots français fixe dans le code, tirage aléatoire sûr), montrée une seule fois, gardée hachée (PBKDF2).
  - Si la requête porte la clé d'un ancien profil sans compte : `inscrire` complète ce profil (la progression est gardée).
  - POST `{action:'connecter', pseudo, mdp}` → session. 10 échecs par jour par pseudo et par IP hachée, puis refus.
  - POST `{action:'secours', pseudo, phrase, nouveauMdp}` → nouveau mot de passe, toutes les sessions effacées, nouvelle session. Même limite d'échecs.
  - POST `{action:'deconnecter'}` ; POST `{action:'mdp', ancien, nouveau}`.
  - POST `{action:'supprimer', mdp}` → efface le compte, ses sessions, sa progression, ses amitiés et ses demandes (les formations créées restent, anonymes).
  - GET → profil du compte (jamais de hash).
- Google (actif seulement si le secret `GOOGLE_CLIENT_ID` existe ; GET `compte?config=1` renvoie `{google: clientId|null}`) : le front charge Google Identity Services (`https://accounts.google.com/gsi/client`) et envoie le jeton : POST `{action:'google', jeton}`. Le serveur le vérifie via `https://oauth2.googleapis.com/tokeninfo?id_token=` (aud = GOOGLE_CLIENT_ID, iss Google, email_verified, exp). Premier passage : renvoie `{aCompleter:true}` et le front demande pseudo, prénom, nom (POST `{action:'google', jeton, pseudo, prenom, nom}`).
- Front : l'écran d'accueil actuel (pseudo seul) devient « Créer un compte / Se connecter » (onglets), avec « Mot de passe oublié » (phrase de secours) et le bouton Google s'il est configuré. Après inscription : écran « Note ta phrase de secours » avec bouton Copier et case « Je l'ai notée » obligatoire. Les anciens profils voient un bandeau « Protège ta progression : crée ton compte » qui garde leur progression. Profil : changer le mot de passe, se déconnecter, supprimer le compte (confirmation par mot de passe).

## 6B. Admin
- Devenir admin : dans `#/admin`, une fois connecté, saisir ADMIN_KEY une seule fois → `role='admin'` sur ce compte (POST `admin {action:'promouvoir'}` avec x-admin-cle). Ensuite toutes les routes admin acceptent la session d'un compte admin (sans clé). La clé x-admin-cle reste acceptée.
- Comptes : GET `admin?comptes=1&q=` (pseudo, prénom, nom, créé, vu, leçons faites, XP, bloqué, rôle ; 50 par page). Actions `bloquer`, `debloquer`, `reinitialiser` (code temporaire de 8 caractères, valable 24 h, à transmettre ; l'utilisateur l'utilise comme « phrase » dans `secours`).
- Codes d'amis : table `codes (code PK, bonus, jours, usages_max, usages, cree, revoque)` et `codes_utilises (code, joueur_id, expire)`. Actions admin `creer_code {bonus, jours, usages}`, `revoquer_code`, liste. Joueur : POST `compte {action:'code', code}`. Limites : un joueur a une limite par jour de nouvelles créations IA (formations, leçons à la demande, quiz) ; limite de base actuelle + somme des bonus actifs ; admin sans limite. Repère où sont les quotas actuels et branche-les là.
- Page admin : onglets « Génération », « Comptes », « Codes ». Visible seulement pour un compte admin.

## 6C. Vie privée et amis
- Aucune route ne liste les joueurs à un non-admin. Classements et cercles : seulement soi et ses amis.
- Amis : table `amities (a, b, etat 'demande'|'ami', cree)`. Ajout seulement : (1) lien d'invitation WhatsApp (lien signé déjà existant si le cercle en a un, sinon jeton aléatoire à usage limité, 7 jours) ; (2) recherche du **pseudo exact** → demande, que l'autre accepte ou refuse. Retirer un ami. Rien d'autre ne révèle un pseudo.
- Adapte `cercle`, `duel(s)`, `groupe`, `partie` pour qu'ils restent fonctionnels (une partie par code reste ouverte à qui a le code).
- Page « Confidentialité » (lien dans Profil) : données gardées (prénom, nom, pseudo, progression), pas de publicité, suppression possible à tout moment, contenu public des formations.
