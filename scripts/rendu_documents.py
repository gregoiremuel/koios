#!/usr/bin/env python3
"""Rendu réel de la page admin « Documents » à 390 px (Playwright + Chromium ; test_api.mjs ne le lance pas).

Usage : python3 scripts/rendu_documents.py [dossier_de_captures]
L'API est simulée (interception des requêtes /api/) : aucun serveur, aucune clé. Vérifie : pas de débordement horizontal, cibles tactiles de
44 px au moins, aucune erreur de script. Écrit des captures (liste, formulaire, envoi d'un PDF sans texte). Code de sortie 1 au moindre défaut.
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
sortie = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="rendu_documents_"))
sortie.mkdir(parents=True, exist_ok=True)

DOCS = {"documents": [
    {"id": 1, "titre": "Gemmologie Niveau1 Module1", "fichier": "Gemmologie-Niveau1-Module1.pdf", "editeur": "Institut National de Gemmologie", "niveau": 1,
     "parcours": "gemmologie-et-joaillerie", "formation": "Gemmologie et joaillerie", "pages": 56, "morceaux": 11, "octets": 12408, "actif": True, "cree": "2026-10-20T08:00:00Z"},
    {"id": 2, "titre": "Livret Pédagogique Niveau II", "fichier": "Livret.pdf", "editeur": "Institut National de Gemmologie", "niveau": 3,
     "parcours": None, "formation": None, "pages": 124, "morceaux": 125, "octets": 160200, "actif": False, "cree": "2026-10-20T08:00:00Z"},
], "octets": 172608, "max": 20971520, "maxDocument": 2097152}
PROFIL = {"id": "abcdefghij12", "cle": "a" * 32, "pseudo": "Greg", "compte": True, "role": "admin"}


class Silencieux(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


defauts = []
with socketserver.TCPServer(("127.0.0.1", 0), partial(Silencieux, directory=str(RACINE / "app"))) as httpd:
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        navigateur = p.chromium.launch()
        ctx = navigateur.new_context(viewport={"width": LARGEUR, "height": 844}, device_scale_factor=2)
        ctx.add_init_script("localStorage.setItem('koios.profil', %s)" % json.dumps(json.dumps(PROFIL)))
        page = ctx.new_page()
        erreurs = []
        page.on("pageerror", lambda e: erreurs.append(str(e)))

        def api(route):
            url = route.request.url
            if "/api/etat" in url:
                corps = {"base": True, "ia": True}
            elif "/api/documents" in url:
                corps = DOCS
            elif "/api/admin" in url:
                corps = {"taches": {}, "credit": None}
            else:
                corps = {}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(corps))

        page.route("**/api/**", api)
        page.route("**/cdnjs.cloudflare.com/**", lambda r: r.abort())  # pdf.js hors d'atteinte : on teste le message d'erreur
        page.goto("http://127.0.0.1:%d/#/admin" % port)
        page.wait_for_timeout(600)
        page.get_by_role("tab", name="Documents").click()
        page.wait_for_timeout(500)
        page.screenshot(path=str(sortie / "01-documents-haut.png"))
        page.screenshot(path=str(sortie / "02-documents-complet.png"), full_page=True)
        mesure = page.evaluate("""() => {
          const trop = [];
          document.querySelectorAll('button, input, select, a.btn').forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width && r.height && r.height < 43.5) trop.push([e.tagName, (e.textContent || e.getAttribute('aria-label') || e.id || '').trim().slice(0, 30), Math.round(r.height)]);
          });
          return { scrollW: document.documentElement.scrollWidth, petits: trop, lignes: document.querySelectorAll('.ligne-doc').length };
        }""")
        if mesure["scrollW"] != LARGEUR:
            defauts.append("scrollWidth = %s (attendu %d)" % (mesure["scrollW"], LARGEUR))
        for t in mesure["petits"]:
            defauts.append("cible tactile trop basse : %s" % t)
        if mesure["lignes"] != 2:
            defauts.append("2 documents attendus, %d lignes" % mesure["lignes"])
        # envoi d'un fichier : pdf.js est bloqué ici, le message d'erreur doit être clair
        page.set_input_files("#doc-fichiers", files=[{"name": "essai.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n%%EOF"}])
        page.get_by_role("button", name="Ajouter les PDF").click()
        page.wait_for_timeout(800)
        page.screenshot(path=str(sortie / "03-documents-erreur-pdfjs.png"), full_page=True)
        if "pdf.js" not in page.inner_text("body"):
            defauts.append("message d'erreur de pdf.js absent")
        if erreurs:
            defauts.append("erreurs de script : %s" % erreurs)
        navigateur.close()
    httpd.shutdown()

print("captures :", sortie)
print(json.dumps({"scrollWidth": mesure["scrollW"]}))
if defauts:
    print("DÉFAUTS :")
    for d in defauts:
        print(" -", d)
    sys.exit(1)
print("ok : 390 px sans débordement, cibles de 44 px, aucune erreur de script")
