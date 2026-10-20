# Lot 10 : documents (PDF) comme sources des leçons, et nettoyage

Règles : CLAUDE.md, DESIGN.md. Aucun secret. TABLES = schema.sql. Économie de jetons : tout ce qui peut se faire par programme se fait par programme (extraction, découpage, recherche), l'IA ne lit que les extraits utiles.

## 10A. Documents
But : les leçons s'appuient d'abord sur les documents que l'admin ajoute (cours, livrets, tableaux), puis sur Wikipédia et le web. Valable pour tout sujet.
- Tables : `documents (id PK, parcours NULL, titre, fichier, pages, cree, actif)` et `doc_morceaux (doc_id, n, page, texte, mots)`. `parcours` NULL = utile à tout sujet ; sinon liée à une formation (id de parcours). Morceaux de 150 à 250 mots, découpés sur les titres/paragraphes, avec recouvrement de 20 mots. Index (doc_id, n).
- Extraction du texte HORS Worker : (1) dans le navigateur de l'admin avec pdf.js (chargé depuis cdnjs, version épinglée) : l'admin choisit un ou plusieurs PDF dans l'onglet admin « Documents », le texte est extrait page par page et envoyé par paquets de 50 ko ; (2) `scripts/importer_pdf.mjs` : lit un dossier de PDF avec `pdftotext -layout`, produit un JSON, l'envoie à `POST /api/documents` avec la clé admin passée en argument (jamais écrite). PDF de pages-images sans texte : le signaler (« pas de texte extractible »), pas d'OCR payant.
- Route admin `POST/GET/DELETE /api/documents` (compte admin ou clé admin) : ajout, liste (titre, pages, morceaux, formation liée), activer/désactiver, supprimer. Plafond : 2 Mo de texte par document, 20 Mo au total.
- Recherche SANS IA : score BM25 simplifié (mots sans accents, sans mots vides français) entre la requête (titre de la leçon + titre du module + termes du programme) et les morceaux des documents du parcours (et ceux sans parcours). On garde les 4 meilleurs morceaux (1 200 mots au plus).
- Dans `genererPalier` : les morceaux deviennent des « pages » (`langue: 'doc'`, titre = « Titre du document, p. N ») placées EN PREMIER (sources privilégiées) puis Wikipédia/web. Le prompt dit : « Appuie-toi d'abord sur les documents de référence ; ne copie jamais de phrases entières ; reformule. » Le vérificateur reçoit les mêmes morceaux. Sources affichées : « Document de référence : <titre>, p. N » (sans lien).
- Règle d'indépendance : un document compte comme UNE source ; une affirmation doit être soutenue par le document et par une page externe, ou par deux pages externes. Une affirmation seulement dans le document et incertaine ailleurs est marquée « à valider », pas supprimée.
- Droit d'auteur : les leçons sont partagées entre tous ; elles reformulent, ne citent pas de longs passages (limite : jamais plus de 15 mots consécutifs identiques au document ; contrôle programmé qui retire/reformule la phrase). Les morceaux ne sont jamais servis tels quels aux joueurs.
- Cache/coût : la recherche est gratuite ; les leçons déjà écrites ne sont réécrites que sur demande (`reecrire {parcours, avecDocuments:true}`).
- Page admin « Documents » : liste, ajout (sélecteur de fichiers, barre de progression), liaison à une formation, activer/désactiver, supprimer ; 390 px, DESIGN.md.
- Import initial gemmologie : les 10 PDF de /root/.claude/uploads/*/ (modules 1 à 8 niveau 1, livrets niveau I et II, tableau des gemmes) liés à `gemmologie-et-joaillerie`. Le script d'import les prépare dans /tmp ; l'envoi en ligne se fait ensuite avec la clé admin.

## 10B. Nettoyage
- Supprimer `cap_lot4/` (captures de travail, 5,7 Mo), `.wrangler/` dans .gitignore, tout fichier non référencé (vérifier avec grep avant).
- Code mort : fonctions exportées jamais appelées ni testées, routes fermées (`/api/joueur` renvoie 410 : garder seulement la route), styles CSS sans usage, anciens textes d'aide obsolètes. Retirer seulement ce qui est prouvé inutile (grep dans app/, lib/, functions/, scripts/).
- Docs : `docs/api-v2.md` à jour avec les routes ajoutées (question, documents, signalement, compte) ; fusionner/supprimer les docs périmés en gardant plan-v4 et lot5 à lot10 ; `README.md` à jour (démarrer, tester, déployer avec `node scripts/version.mjs`).
- Aucune suppression de données en production.

## 10C. Ordre
1. Tables + route documents + découpage + recherche + tests.
2. Intégration dans genererPalier / vérification / sources affichées / contrôle des 15 mots.
3. Page admin Documents + script d'import.
4. Nettoyage. 5. Relecteur (avec rendu réel 390 px), corrections, déploiement, import des PDF, réécriture de la gemmologie.
