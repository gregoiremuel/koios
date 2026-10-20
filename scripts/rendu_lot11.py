#!/usr/bin/env python3
"""Rendu réel (lot 11) du sommaire et d'une leçon à 390 px (Playwright + Chromium ; test_api.mjs ne le lance pas).

Usage : python3 scripts/rendu_lot11.py [dossier_de_captures]
L'API est simulée (interception des requêtes /api/) : aucun serveur, aucune clé. Vérifie : pas de débordement horizontal, aucun sélecteur
« Essentiel / Complet » ni « Normal / Simple / Expert », tous les modules visibles dans l'ordre, ligne « Ensuite » en bas de leçon, aucune erreur
de script, ancien réglage `koios.profondeur` retiré. Écrit des captures. Code de sortie 1 au moindre défaut.
"""
import http.server
import json
import socketserver
import sys
import tempfile
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parent.parent
LARGEUR = 390
sortie = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="rendu_lot11_"))
sortie.mkdir(parents=True, exist_ok=True)

TITRES = [
    "Qu’est-ce que la tour Eiffel ?", "Le vocabulaire de la tour", "Les grands repères", "Une tour pour 1889", "Gustave Eiffel, l’ingénieur", "Le fer, matériau de la tour",
    "Le projet et ses auteurs", "Les rivets et l’assemblage", "Un chantier de deux ans", "Les fondations du Champ-de-Mars", "L’ouverture au public",
    "La protestation des artistes", "La tour et la radio", "Entretien et restaurations", "La tour dans la ville", "Les records de hauteur",
    "Lire les archives de l’entreprise", "Les calculs de résistance au vent", "Les débats sur la démolition", "Les limites des sources", "Restaurer sans trahir",
]
DECOUPE = [(1, "Novice : les repères", 0, 6), (2, "Intermédiaire : la construction", 6, 11), (3, "Avancé : débats et usages", 11, 16), (4, "Expert : sources et limites", 16, 21)]
programme = {"niveaux": [
    {"numero": n, "titre": t, "modules": [
        {"numero": k + 1, "titre": TITRES[k], "objectif": "Comprendre %s et le relier aux modules précédents." % TITRES[k].lower(), "prerequis": []}
        for k in range(a, b)]}
    for n, t, a, b in DECOUPE]}
# Les 6 premiers modules sont ouverts (4 leçons chacun) ; le module 4 est celui où l'on en est.
etapes = []
numero = 0
for k in range(6):
    paliers = []
    for j in range(4):
        numero += 1
        paliers.append({"numero": numero, "titre": "%s, partie %d" % (TITRES[k], j + 1) if j else "Idée centrale : %s" % TITRES[k].lower()})
    etapes.append({"numero": k + 1, "titre": TITRES[k], "niveau": 1 if k < 6 else 2, "objectif": programme["niveaux"][0]["modules"][k]["objectif"], "paliers": paliers})
PARCOURS = {"id": "tour-eiffel", "titre": "La tour Eiffel", "resume": "Une tour de fer bâtie pour l’Exposition universelle de 1889. Elle domine Paris.",
            "image": None, "etapes": etapes, "sources": [], "programme": programme, "modulesTotal": 21}
LECON = {
    "id": "tour-eiffel:10", "numero": 10, "titre": "Les grands repères, partie 2", "etape": 3, "niveau": {"numero": 1, "titre": "Novice : les repères"},
    "module": {"numero": 3, "titre": "Les grands repères"}, "format": 2,
    "objectif": "À la fin, tu sauras placer le chantier et l’inauguration sur une ligne de temps.",
    "rappel": "Dans la leçon précédente, tu as vu pourquoi la tour est bâtie pour l’Exposition de 1889.",
    "avant": ["L’Exposition universelle de 1889 célèbre le centenaire de la Révolution.", "La tour est un projet d’ingénieurs, pas d’architectes."],
    "sections": {
        "enBref": "Le chantier commence en 1887. La tour est inaugurée en 1889.",
        "comment": "Les pièces de fer arrivent préparées. Les ouvriers les assemblent avec des rivets. Le montage dure deux ans.",
        "pourquoi": "Respecter la date de l’Exposition était la contrainte principale du projet.",
        "ouQuand": "Le chantier s’étend de janvier 1887 à mars 1889.",
    },
    "aRetenir": ["Le chantier dure environ deux ans.", "L’inauguration a lieu en mars 1889."],
    "exemple": "Comme une maison en kit : chaque pièce est préparée à l’atelier, puis montée sur place.",
    "piege": "On croit que la tour devait rester ; en réalité elle était prévue pour vingt ans.",
    "definitions": [{"terme": "Rivet", "definition": "Tige de métal qui assemble deux pièces une fois aplatie à chaud."}],
    "sources": [["Wikipédia · Tour Eiffel", "https://fr.wikipedia.org/wiki/Tour_Eiffel"]],
    "verification": {"statut": "verifie", "ia": ["Gemini", "Mistral"], "note": "Recoupé par deux IA à partir des sources."},
    "questions": [], "cartes": [], "visuels": [],
}
PROFIL = {"id": "abcdefghij12", "cle": "a" * 32, "pseudo": "Greg", "compte": True, "role": "joueur"}
ETAT = {"version": 2, "xp": 90, "parcours": {"tour-eiffel": {"fait": 9, "xp": 90, "quiz": {}}}, "badges": {}}


class Silencieux(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


defauts = []
with socketserver.TCPServer(("127.0.0.1", 0), partial(Silencieux, directory=str(RACINE / "app"))) as httpd:
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        navigateur = p.chromium.launch()
        ctx = navigateur.new_context(viewport={"width": LARGEUR, "height": 844}, device_scale_factor=2, service_workers="block")
        ctx.add_init_script(
            "if (!sessionStorage.getItem('deja')) { sessionStorage.setItem('deja', '1');"
            "localStorage.setItem('koios.profil', %s); localStorage.setItem('koios.etat', %s);"
            "localStorage.setItem('koios.profondeur', %s); }" % (
                json.dumps(json.dumps(PROFIL)), json.dumps(json.dumps(ETAT)), json.dumps(json.dumps({"tour-eiffel": "essentiel"}))))
        page = ctx.new_page()
        erreurs = []
        page.on("pageerror", lambda e: erreurs.append(str(e)))
        appels = []

        def api(route):
            url = route.request.url
            appels.append(url)
            if "/api/etat" in url:
                corps = {"base": True, "ia": True}
            elif "/api/parcours" in url:
                corps = {"parcours": PARCOURS}
            elif "/api/palier" in url:
                corps = {"palier": LECON}
            elif "/api/glossaire" in url:
                corps = {"termes": []}
            else:
                corps = {}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(corps))

        page.route("**/api/**", api)
        page.route("**/*wikipedia.org/**", lambda r: r.abort())
        page.route("**/*wikimedia.org/**", lambda r: r.abort())
        page.route("**/*unsplash.com/**", lambda r: r.abort())

        # --- Sommaire
        page.goto("http://127.0.0.1:%d/#/p/tour-eiffel" % port)
        page.wait_for_timeout(1200)
        page.screenshot(path=str(sortie / "01-sommaire-haut.png"))
        page.screenshot(path=str(sortie / "02-sommaire-complet.png"), full_page=True)
        m = page.evaluate("""() => ({
          scrollW: document.documentElement.scrollWidth,
          modules: document.querySelectorAll('.liste.modules > li').length,
          radios: document.querySelectorAll('[aria-label="Niveau de lecture"], [aria-label="Profondeur de la formation"]').length,
          texte: document.body.innerText,
          profondeur: localStorage.getItem('koios.profondeur'),
          petits: [...document.querySelectorAll('button.rang, a.btn, button.btn')].filter(e => e.getBoundingClientRect().height && e.getBoundingClientRect().height < 43.5).length,
        })""")
        if m["scrollW"] != LARGEUR:
            defauts.append("sommaire : scrollWidth = %s" % m["scrollW"])
        if m["modules"] != 21:
            defauts.append("sommaire : 21 modules attendus, %d" % m["modules"])
        if m["radios"]:
            defauts.append("sommaire : %d bascule(s) (role=radio) trouvée(s)" % m["radios"])
        for mot in ("Essentiel", "Complet", "Mode Essentiel"):
            if mot in m["texte"]:
                defauts.append("sommaire : « %s » encore affiché" % mot)
        if m["profondeur"] is not None:
            defauts.append("koios.profondeur n'a pas été retiré")
        if m["petits"]:
            defauts.append("sommaire : %d cibles tactiles sous 44 px" % m["petits"])
        if "Novice : les repères" not in m["texte"]:
            defauts.append("sommaire : niveau « Novice » absent")

        # --- Leçon
        page.goto("http://127.0.0.1:%d/#/p/tour-eiffel/10" % port)
        page.reload()  # démarrage à neuf de l'app sur la leçon (un simple changement de # ne recharge rien)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(sortie / "03-lecon-haut.png"))
        page.screenshot(path=str(sortie / "04-lecon-complete.png"), full_page=True)
        m = page.evaluate("""() => ({
          scrollW: document.documentElement.scrollWidth,
          radios: document.querySelectorAll('[aria-label="Niveau de lecture"], [aria-label="Profondeur de la formation"]').length,
          texte: document.body.innerText,
          ensuite: (document.querySelector('.ensuite') || {}).innerText || '',
        })""")
        if m["scrollW"] != LARGEUR:
            defauts.append("leçon : scrollWidth = %s" % m["scrollW"])
        if m["radios"]:
            defauts.append("leçon : sélecteur de lecture encore présent")
        for mot in ("Simple", "Expert"):
            if mot in m["texte"]:
                defauts.append("leçon : « %s » encore affiché" % mot)
        if "Avant de commencer" not in m["texte"]:
            defauts.append("leçon : « Avant de commencer » absent")
        if "Ensuite" not in m["ensuite"]:
            defauts.append("leçon : ligne « Ensuite » absente")
        if any("/api/variante" in u for u in appels):
            defauts.append("une requête /api/variante est partie")
        if erreurs:
            defauts.append("erreurs de script : %s" % erreurs)
        navigateur.close()
    httpd.shutdown()

print("captures :", sortie)
if "--debug" in sys.argv: print("\n".join(appels))
if defauts:
    print("DÉFAUTS :")
    for d in defauts:
        print(" -", d)
    sys.exit(1)
print("ok : sommaire et leçon à 390 px, sans bascule, sans débordement, aucune erreur de script")
