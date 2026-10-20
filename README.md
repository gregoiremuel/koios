# Koîos

Défis de savoir entre amis, avec le Rival : une IA taquine qui crée les questions, explique et arbitre.

- Ce qu'on construit : `docs/cahier-des-charges.md`
- Règles visuelles : `DESIGN.md`
- Maquettes : `maquettes/` (ouvrir `index.html`)
- Consignes pour Claude Code : `CLAUDE.md`, `.claude/agents/`, `.claude/skills/methode-koios/`

Projet privé de Grégoire Muel.

## Démarrer, tester, déployer

- Démarrer en local : `node scripts/serveur_local.mjs` (API simulée, sans clé).
- Tester : `timeout 240 node scripts/test_api.mjs` (API) et `python3 scripts/verifier.py` (règles de DESIGN.md). Rendus à 390 px : `python3 scripts/rendu_visuels.py` et `python3 scripts/rendu_documents.py` (Playwright).
- Déployer : `node scripts/version.mjs` (nouveau numéro de version, pour que les téléphones renouvellent leur cache), puis `npx wrangler deploy`. Les secrets restent côté Cloudflare, jamais dans le dépôt.
- Documents de référence : `node scripts/importer_pdf.mjs <dossier> --sortie /tmp/docs.json` prépare les PDF sans rien envoyer ; avec `--url` et `--cle` (clé admin passée en argument), il les envoie à `POST /api/documents`. Détails : `docs/lot10-documents.md`.
