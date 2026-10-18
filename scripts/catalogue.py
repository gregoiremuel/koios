"""Contrôle les chapitres de app/contenu/ et écrit app/contenu/catalogue.json.

Usage : python3 scripts/catalogue.py
Un chapitre qui échoue au contrôle n'entre pas au catalogue. Code de sortie 1 s'il y a un échec.
"""
import json
import pathlib
import re
import sys
from urllib.parse import urlparse

RACINE = pathlib.Path(__file__).resolve().parent.parent
CONTENU = RACINE / "app" / "contenu"
DOMAINES = ["hg", "sn", "ac", "gj"]
MOTS = ["Bienvenue", "Découvrez", "N'hésitez pas", "N’hésitez pas", "au cœur de", "véritable", "incontournable",
        "passion", "sublimer", "écrin", "expérience", "univers", "authentique", "d'exception", "d’exception",
        "excellence", "intemporel"]


def textes(x):
    if isinstance(x, str):
        yield x
    elif isinstance(x, list):
        for y in x:
            yield from textes(y)
    elif isinstance(x, dict):
        for k, y in x.items():
            if k not in ("src", "sources"):
                yield from textes(y)


def controler(chemin: pathlib.Path):
    pb = []
    try:
        c = json.loads(chemin.read_text(encoding="utf-8"))
    except Exception as e:  # JSON invalide
        return None, [f"JSON invalide : {e}"]
    if c.get("id") != chemin.stem:
        pb.append("id différent du nom de fichier")
    if c.get("domaine") not in DOMAINES or not chemin.stem.startswith(str(c.get("domaine")) + "-"):
        pb.append("domaine inconnu ou incohérent")
    if not isinstance(c.get("numero"), int):
        pb.append("numero non entier")
    if not c.get("titre"):
        pb.append("titre manquant")
    if not (3 <= len(c.get("essentiel", [])) <= 5):
        pb.append("essentiel : 3 à 5 phrases")
    rep = c.get("reperes", [])
    if not (4 <= len(rep) <= 5) or any(not (isinstance(r, list) and len(r) == 2) for r in rep):
        pb.append("reperes : 4 ou 5 paires")
    fig = c.get("figure")
    if fig and not str(fig.get("src", "")).startswith("https://commons.wikimedia.org/wiki/Special:FilePath/"):
        pb.append("figure hors Wikimedia Commons")
    ex = c.get("exercices", [])
    if [e.get("type") for e in ex] != ["qcm", "bluff", "frise"]:
        pb.append("exercices : qcm, bluff, frise dans cet ordre")
    for k, e in enumerate(ex, 1):
        for champ in ("lib", "theme", "correction", "rivalJuste", "rivalFaux"):
            if not e.get(champ):
                pb.append(f"exercice {k} : {champ} manquant")
        if not (isinstance(e.get("repere"), int) and 0 <= e["repere"] < len(rep)):
            pb.append(f"exercice {k} : repere hors liste")
        src = e.get("sources", [])
        if len(src) < 2:
            pb.append(f"exercice {k} : moins de 2 sources")
        origines = set()
        for s in src:
            url = s[1] if len(s) > 1 else ""
            if "wikipedia.org" in url:
                pb.append(f"exercice {k} : Wikipédia cité comme source")
            origines.add(urlparse(url).netloc.removeprefix("www.") if url else s[0].split("·")[0].strip())
        if len(origines) < 2:
            pb.append(f"exercice {k} : sources non indépendantes (même origine)")
        if e.get("type") == "qcm" and (len(e.get("reponses", [])) != 4 or e.get("bonne") not in range(4)):
            pb.append(f"exercice {k} : qcm mal formé")
        if e.get("type") == "bluff" and not isinstance(e.get("vrai"), bool):
            pb.append(f"exercice {k} : bluff sans vrai/faux")
        if e.get("type") == "frise":
            el, ordre, val = e.get("elements", []), e.get("ordre", []), e.get("valeurs", {})
            if len(el) != 4 or sorted(el) != sorted(ordre):
                pb.append(f"exercice {k} : ordre n'est pas une permutation des éléments")
            if any(o not in val for o in ordre):
                pb.append(f"exercice {k} : valeur manquante")
            if el == ordre:
                pb.append(f"exercice {k} : éléments déjà dans l'ordre")
    tout = " ".join(textes(c))
    for m in re.finditer(r"\w[ ][;:?!»]|«[ ]", tout):
        pb.append(f"espace simple au lieu d'une insécable : « {m.group(0)} » (lancer scripts/typo.py)")
    for mot in MOTS:
        if re.search(r"(?<!\w)" + re.escape(mot) + r"(?!\w)", tout, re.I):
            pb.append(f"mot interdit « {mot} »")
    return c, pb


def main() -> int:
    cat = {d: [] for d in DOMAINES}
    echecs = 0
    for chemin in sorted(CONTENU.glob("[a-z][a-z]-[0-9][0-9].json")):
        c, pb = controler(chemin)
        if pb:
            echecs += 1
            print(f"{chemin.name} : refusé")
            for p in pb:
                print(f"  - {p}")
            continue
        cat[c["domaine"]].append({"id": c["id"], "numero": c["numero"], "titre": c["titre"]})
    for d in cat:
        cat[d].sort(key=lambda x: x["numero"])
    vrais = [json.loads((CONTENU / (x["id"] + ".json")).read_text(encoding="utf-8"))["exercices"][1]["vrai"] for v in cat.values() for x in v]
    if vrais and not 0.3 <= sum(vrais) / len(vrais) <= 0.7:
        print(f"Avertissement : {sum(vrais)} bluffs vrais sur {len(vrais)} ; viser entre 30 et 70 %.")
    (CONTENU / "catalogue.json").write_text(json.dumps({"domaines": cat}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("Catalogue : " + ", ".join(f"{d} {len(v)}" for d, v in cat.items()))
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
