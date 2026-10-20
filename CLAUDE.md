# Koîos

App web (PWA) de défis de savoir entre amis, avec le Rival, une IA taquine qui crée les questions, explique et arbitre. Greg pilote depuis son téléphone et ne code pas.

## Règles

- Français, tutoiement, phrases courtes. Greg lit sur téléphone.
- Réponse finale en trois parties : **Réponse claire** ; **Niveau de confiance** (0.0 à 1.0, avec la raison) ; **Réserves clés**.
- Qualité d'abord, puis économie : les petites tâches vont aux sous-agents de `.claude/agents/` (éclaireur et testeur sur Haiku, rédacteur et bâtisseur sur Sonnet). Le relecteur (Opus) relit toute livraison à froid.
- Toute interface suit `DESIGN.md`. Aucune livraison visuelle sans passage du relecteur.
- N'invente rien. Chaque réponse est recoupée par au moins 2 sources indépendantes, dont une institutionnelle ou savante (musée, archives, université, encyclopédie éditée, organisme officiel). Wikipédia sert de point de départ, jamais de preuve. L'inconnu va dans « À valider ».
- Jamais de clé, de mot de passe ou de secret dans le dépôt.
- Méthode détaillée : skill `methode-koios`.

## Où trouver quoi

- `docs/cahier-des-charges.md` : ce qu'on construit et dans quel ordre.
- `docs/plan-v4.md` : plan en cours (fournisseurs d'IA gratuits, finition).
- `docs/lot11-un-seul-mode.md` : dernier chantier (un seul mode, la leçon ; progression continue). Lots précédents : `docs/lot5.md`, `docs/lot6-comptes.md`, `docs/lot9-visuels.md`, `docs/lot10-documents.md`.
- `docs/api-v2.md` : routes et tables de l'API (annexe V1 en bas).
- `docs/lecons.md` : pièges rencontrés, une ligne chacun.
- `DESIGN.md` : couleurs, polices, mise en page, interdits.
- `maquettes/` : maquettes HTML validées ou à valider.
