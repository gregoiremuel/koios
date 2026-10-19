# Plan v4 : finir Koîos (20 octobre 2026)

## Constat chiffré (sources : agentdeals.dev, openrouter.ai/blog, developers.cloudflare.com, vérifiées le 20/10/2026)
- Gemini gratuit : ~20 requêtes/jour pour les modèles Flash, ~500/jour pour les Flash-Lite. Les données gratuites peuvent servir à Google (pas dans l'UE selon une source, à valider).
- Une leçon = 2 appels de rédaction + 1 de vérification ≈ 3 requêtes. Gemini Flash seul ≈ 6 leçons/jour : c'est la cause de « Gemini épuisé ».
- Gratuits sans carte, à ajouter : Groq (~1 000 req/jour, Llama 3.3 70B), Cerebras (~1 M jetons/jour), Mistral (~1 Md jetons/mois, palier « Experiment » qui entraîne sur les données), OpenRouter (50/jour), GitHub Models.
- Payant très bas : Workers AI Gemma 4 26B ≈ 0,10 $/0,30 $ par M jetons ; Gemini 3.1 Flash-Lite 0,25 $/1,50 $. Une leçon ≈ 6 000 jetons → 0,2 à 1 centime. 1 000 leçons ≈ 2 à 10 $.

## Décisions proposées
1. Capacité gratuite ×10 : ajouter Groq, Cerebras, Mistral (API compatibles OpenAI) et les Gemini Flash-Lite à la cascade. Rédaction : meilleur modèle disponible ; vérification : autre famille.
2. « IA à nous » : pas d'entraînement (coûteux, inutile ici). À la place : banque de leçons vérifiées réutilisées comme exemples, et cache de tout ce qui est écrit ou lu. Réévaluer seulement au-delà de quelques milliers de leçons vérifiées.
3. Moins d'appels : vérification par programme des nombres, dates et noms contre les extraits (sans IA) ; 2e IA seulement sur ce qui reste.
4. Plan B payant (si Greg veut une formation entière en une nuit) : Workers Paid 5 $/mois + Gemma 4, plafond de dépense fixé.

## Ordre de travail
1. Fournisseurs gratuits + Flash-Lite (Sonnet). Greg crée 3 clés gratuites.
2. Audit des leçons réelles (export) ; correction des prompts (Opus, effort moyen).
3. Comptes : nom, prénom, pseudo unique, mot de passe haché (PBKDF2), Google, phrase de secours, admin, codes de limites, amis par lien ou pseudo exact (Opus moyen + relecteur).
4. Documents PDF de l'admin + cache des sources ouvertes (Sonnet).
5. Nettoyage des anciennes formations, « Pose une question », test de fin de niveau, certificat, voix, hors ligne (Sonnet).
6. Relecture complète (Opus) et changement des clés.
