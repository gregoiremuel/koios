"""Typographie française pour Koîos : insécables et traits d'union insécables.

Usage : python3 scripts/typo.py [fichiers...]   (par défaut : app/app.js et app/contenu/*.json)
Corrige sur place les chaînes de texte (jamais les URL). Affiche le nombre de corrections par fichier.
"""
import glob
import json
import re
import sys

FINE, INS, TU = " ", " ", "‑"
MOIS = "janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre"
UNITES = r"°C|°|km|cm|mm|m|kg|g|ct|carats|%|ans|millions|milliards|mètres|kilomètres"


def corriger(t: str) -> str:
    if t.startswith("http") or not t.strip():
        return t
    t = re.sub(r" ([;?!»])", FINE + r"\1", t)
    t = re.sub(r" :", INS + ":", t)
    t = re.sub(r"« ", "«" + INS, t)
    t = re.sub(r"(\d) (\d{3})(?!\d)", r"\1" + FINE + r"\2", t)
    t = re.sub(r"(\d{1,2}(?:er)?) (" + MOIS + r")\b", r"\1" + INS + r"\2", t, flags=re.I)
    t = re.sub(r"\b(" + MOIS + r") (\d{3,4})\b", r"\1" + INS + r"\2", t, flags=re.I)
    t = re.sub(r"(\d) (" + UNITES + r")(?![\w’'])", r"\1" + INS + r"\2", t)
    t = re.sub(r"\b([A-ZÀ-Ý][\w’']*(?:-[\w’']+)+)", lambda m: m.group(1).replace("-", TU), t)
    return t


def traiter_json(x):
    if isinstance(x, str):
        return corriger(x)
    if isinstance(x, list):
        return [traiter_json(y) for y in x]
    if isinstance(x, dict):
        return {(corriger(k) if " " in k or "-" in k else k): (v if k == "src" else traiter_json(v)) for k, v in x.items()}
    return x


def traiter_js(code: str) -> str:
    def rempl(m):
        s = m.group(1)
        if " " not in s:
            return m.group(0)  # chaîne technique (CSS, sélecteur, chemin, en-tête)
        return '"' + corriger(s) + '"'
    return re.sub(r'"((?:[^"\\\n]|\\.)*)"', rempl, code)


def main() -> int:
    fichiers = sys.argv[1:] or ["app/app.js"] + sorted(glob.glob("app/contenu/[a-z][a-z]-[0-9][0-9].json"))
    for f in fichiers:
        avant = open(f, encoding="utf-8").read()
        if f.endswith(".json"):
            apres = json.dumps(traiter_json(json.loads(avant)), ensure_ascii=False, indent=1) + "\n"
        else:
            apres = traiter_js(avant)
        n = sum(1 for a, b in zip(avant, apres) if a != b) if len(avant) == len(apres) else abs(len(avant) - len(apres)) or 1
        if apres != avant:
            open(f, "w", encoding="utf-8").write(apres)
            print(f"{f} : corrigé")
    return 0


if __name__ == "__main__":
    sys.exit(main())
