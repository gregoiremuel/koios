#!/usr/bin/env python3
"""Rendu réel des visuels de leçon à 390 px (Playwright + Chromium, optionnel : test_api.mjs ne le lance pas).

Usage : python3 scripts/rendu_visuels.py [dossier_de_captures]
Vérifie, pour chaque visuel de scripts/rendu_visuels_donnees.js (cas limites compris) :
  - scrollWidth du document = 390 (aucun débordement horizontal) ;
  - aucune courbe (polyline) remplie ;
  - aucun texte du dessin ne sort du cadre du dessin ni de l'écran.
Écrit une capture par visuel dans le dossier (par défaut un dossier temporaire). Code de sortie 1 au moindre défaut.
"""
import json
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parent.parent
LARGEUR = 390
sortie = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="rendu_visuels_"))
sortie.mkdir(parents=True, exist_ok=True)

PAGE = """<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="file://%(css)s"></head><body><main class="page"><article class="lecon t5" id="zone"></article></main>
<script src="file://%(visuels)s"></script><script src="file://%(donnees)s"></script>
<script>
var z = document.getElementById("zone");
VISUELS.forEach(function (v, i) {
  var f = Visuels.visuel(v), d = document.createElement("div");
  d.id = "v" + i; d.setAttribute("data-type", v.type);
  if (f) d.appendChild(f); else d.textContent = "NULL " + v.type;
  z.appendChild(d);
});
var c = Visuels.carteModule(PLAN), d = document.createElement("div");
d.id = "carte"; d.setAttribute("data-type", "carte_module"); if (c) d.appendChild(c); z.appendChild(d);
</script></body></html>""" % {
    "css": RACINE / "app" / "style.css",
    "visuels": RACINE / "app" / "visuels.js",
    "donnees": RACINE / "scripts" / "rendu_visuels_donnees.js",
}
page_html = sortie / "page.html"
page_html.write_text(PAGE, encoding="utf-8")

MESURE = """() => {
  const r = { scrollW: document.documentElement.scrollWidth, remplis: [], hors: [], vides: [], items: [] };
  document.querySelectorAll('#zone > div').forEach(d => {
    const svg = d.querySelector('svg');
    r.items.push({ id: d.id, type: d.dataset.type });
    if (!d.firstChild || d.textContent.startsWith('NULL')) r.vides.push(d.id);
    d.querySelectorAll('polyline').forEach(p => { const f = getComputedStyle(p).fill; if (f !== 'none') r.remplis.push([d.id, f]); });
    if (!svg) return;
    const sb = svg.getBoundingClientRect();
    svg.querySelectorAll('text').forEach(t => {
      const b = t.getBoundingClientRect();
      if (b.left < sb.left - 0.5 || b.right > sb.right + 0.5 || b.left < 0 || b.right > %d) r.hors.push([d.id, t.textContent, Math.round(b.left), Math.round(b.right)]);
    });
  });
  return r;
}""" % LARGEUR

defauts = []
with sync_playwright() as p:
    navigateur = p.chromium.launch()
    page = navigateur.new_page(viewport={"width": LARGEUR, "height": 844}, device_scale_factor=2)
    page.goto("file://" + str(page_html))
    page.wait_for_timeout(300)
    info = page.evaluate(MESURE)
    if info["scrollW"] != LARGEUR:
        defauts.append("scrollWidth = %s (attendu %d)" % (info["scrollW"], LARGEUR))
    for ident, fill in info["remplis"]:
        defauts.append("courbe remplie dans %s : fill = %s" % (ident, fill))
    for ident in info["vides"]:
        defauts.append("visuel non dessiné : %s" % ident)
    for ident, texte, g, d in info["hors"]:
        defauts.append("texte hors cadre dans %s : « %s » (%d à %d)" % (ident, texte, g, d))
    for it in info["items"]:
        page.locator("#" + it["id"]).screenshot(path=str(sortie / ("%s-%s.png" % (it["id"], it["type"]))))
    navigateur.close()

print("captures :", sortie)
print(json.dumps({"scrollWidth": info["scrollW"], "visuels": len(info["items"])}, ensure_ascii=False))
if defauts:
    print("DÉFAUTS :")
    for d in defauts:
        print(" -", d)
    sys.exit(1)
print("ok : 390 px sans débordement, aucune courbe remplie, aucun texte hors cadre")
