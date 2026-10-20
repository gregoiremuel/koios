# Lot 5 : moteur économe, clé personnelle, génération de nuit

Contexte. Diagnostic réel : Gemini répond (mais 25 s sur un « bonjour », trop lent), GLM 429 par moments, Grok 401 (la clé n'est pas Groq), Workers AI à 0 neurone. Un seul fournisseur fiable : Gemini. Il faut le rendre rapide, ajouter la clé personnelle et la génération de nuit.
Règles : français, aucun secret dans le dépôt ni dans les journaux, tests `timeout 240 node scripts/test_api.mjs` et `python3 scripts/verifier.py` verts, TABLES de `lib/api.js` identiques à `schema.sql`. Le bac à sable ne peut pas joindre les IA : tout se teste avec des faux fournisseurs (voir scripts/serveur_local.mjs et test_api.mjs).

## A. Gemini rapide et diagnostic lisible
- `corpsGemini` : réflexion coupée pour toute la série flash. 2.5 : `thinkingBudget: 0`. Pour `gemini-flash-latest` et les 3.x : `thinkingConfig: { thinkingLevel: 'minimal' }`. Si Gemini répond 400 à cause de `thinkingConfig`, réessayer le même modèle SANS ce champ avant de passer au suivant.
- `GEMINI_MODELES` : ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'].
- Le diagnostic liste, pour Gemini, l'erreur de CHAQUE modèle candidat (code et message court, jamais la clé), pour comprendre pourquoi 2.5-flash est écarté.
- Grok : si 401 sur tous les couples, état « clé invalide » clair, et le fournisseur est ignoré 1 h (pas de perte de temps à chaque leçon).

## B. Clé personnelle (chacun apporte sa clé)
- Nouveau fournisseur `claude` (API Anthropic Messages : POST https://api.anthropic.com/v1/messages, en-têtes `x-api-key`, `anthropic-version: 2023-06-01`, modèle `claude-haiku-5-5`, `system` séparé, réponse `content[0].text`). Famille `claude`.
- Fournisseurs acceptés pour une clé perso : `gemini`, `glm`, `claude`. Même code que les clés du serveur, mais la clé vient de la requête.
- Le front envoie l'en-tête `x-cle-ia: <fournisseur>:<clé>` sur les routes qui écrivent une formation (parcours, palier, fiche, quiz-general, chapitre-ia). La clé reste dans le navigateur (localStorage, try/catch). Elle n'est JAMAIS enregistrée en base, jamais journalisée, jamais renvoyée, jamais dans un message d'erreur (masquer toute occurrence).
- Avec une clé perso : elle passe en premier pour la rédaction. La vérification utilise toujours une famille différente (clés du serveur d'abord, sinon l'autre clé perso si fournie). Si aucune autre famille n'est disponible, la leçon n'est PAS publiée comme « recoupée » : elle l'est avec le badge « Une seule IA » (déjà prévu ? sinon l'ajouter).
- Une clé perso invalide (401/403) : message clair « Ta clé est refusée par <fournisseur> », sans retomber en silence sur les clés du serveur.
- Profil : section « Ma clé IA » : choix du fournisseur (Gemini conseillé, lien d'aide pour créer une clé gratuite, GLM, Claude), champ, bouton Tester (appel minuscule), bouton Retirer. Texte : « Ta clé reste sur ton téléphone. Les leçons que tu crées restent dans la bibliothèque pour tous. »
- Le contenu créé avec une clé perso va dans les mêmes tables partagées (parcours, paliers) : la bibliothèque est commune. Vérifier par un test.

## C. Génération de nuit (admin)
- Secret `ADMIN_KEY` (déjà posé côté Cloudflare). En-tête `x-admin-cle`. Comparaison à temps constant. Nouvelle route `functions/api/admin.js` (ajouter à ROUTES) : 
  - `GET ?` état : nombre de tâches par état, dernière erreur, fournisseurs épuisés.
  - `POST {action:'debloquer', parcours}` : met en file toutes les tâches de la formation, dans l'ordre (ouvrir module → écrire ses leçons), niveau Bases d'abord ;
  - `POST {action:'pause'|'reprendre'|'vider'}`.
  - Réponse 403 sans clé valide. Jamais d'indice sur la clé.
- Table `file_attente` (id, parcours, type 'module'|'lecon', numero, etat 'attente'|'en_cours'|'fait'|'echec', essais, erreur, maj) ajoutée à schema.sql ET aux TABLES de lib/api.js ET au test de schéma.
- `scheduled` dans worker.js + `[triggers] crons = ["*/5 * * * *"]` dans wrangler.toml. À chaque passage : reprendre les tâches « en_cours » vieilles de plus de 6 min, prendre au plus 2 tâches, les exécuter avec le MÊME code que la génération à la demande (extraire la fonction commune, pas de copie), enregistrer dans les mêmes tables. Échec : essais+1, 3 essais maximum puis « echec ». Si tous les fournisseurs sont épuisés : ne rien consommer, laisser en attente. Utilise les clés du serveur (pas de clé perso).
- Éviter le double travail : si une leçon est déjà écrite, la tâche passe à « fait » ; la génération à la demande et celle de nuit ne s'écrasent pas (INSERT OR IGNORE ou verrou existant).
- Front : dans Profil, « Espace admin » (champ clé, gardé en localStorage). Une fois la clé reconnue (GET admin → 200) : page `#/admin` avec compteurs (en attente, faites, échecs), boutons Pause / Reprendre, et sur la page de chaque formation un bouton « Débloquer toute la formation (de nuit) » + « x leçons prêtes sur y ».
- Les lecteurs normaux voient les leçons déjà prêtes instantanément (cache), sans modification.

## D. Bibliothèque (profondeur retirée au lot 11)
- La page Bibliothèque affiche pour chaque formation : leçons prêtes / total connu, niveau atteint, et un badge « Complète » si tout est prêt.
- Profondeur : le réglage « Essentiel / Complet » et le champ `essentiel` des modules ont été retirés au lot 11 (voir `docs/lot11-un-seul-mode.md`) ; les anciens programmes qui ont le champ restent lisibles.

## E. Qualité des leçons (prompts)
- Chaque leçon commence par un objectif mesurable (« À la fin, tu sauras… ») et un rappel de 1 à 2 phrases de ce qui a été vu juste avant (liens avec les leçons précédentes). Ces champs sont facultatifs côté validation (ils ne font jamais échouer une leçon) et affichés en tête de leçon.
- Les questions couvrent compréhension ET application (pas seulement des dates).
- Ne pas allonger les appels : respecter les limites de jetons actuelles.

## Compte rendu attendu
Fichiers modifiés, choix faits pour D, tests passés (nombre), ce qui n'a pas pu être testé faute d'accès réel aux IA.
