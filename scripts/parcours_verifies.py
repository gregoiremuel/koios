"""Convertit les chapitres vérifiés (app/contenu/xx-NN.json) en parcours v2 à paliers.

Sorties : app/contenu/parcours.json (liste), app/contenu/parcours/v-<dom>.json, app/contenu/paliers/v-<dom>-<n>.json,
et app/contenu/questions.json (toutes les questions vérifiées, pour la question du jour et le quiz mélangé).
À lancer après scripts/catalogue.py (qui ne garde que les chapitres valides).
"""
import json
import pathlib

R = pathlib.Path(__file__).resolve().parent.parent / "app" / "contenu"
NOMS = {"hg": "Histoire et géographie", "sn": "Sciences et nature", "ac": "Arts et culture", "gj": "Gemmologie et joaillerie"}
RESUMES = {
    "hg": "De la démocratie athénienne aux sommets du monde : des repères datés, vérifiés chacun par deux sources sérieuses.",
    "sn": "Système solaire, ADN, volcans, abysses : les bases des sciences de la nature, vérifiées par deux sources sérieuses.",
    "ac": "Cathédrales gothiques, impressionnisme, Boléro, cinéma : les jalons de l'histoire des arts, vérifiés.",
    "gj": "Dureté, réfraction, corindons, béryls, diamant : la gemmologie de base, recoupée avec les cours de l'Institut National de Gemmologie.",
}


def explication(t):
    """Les corrections parlaient du Rival qui bluffe : on garde le fond, sans le personnage disparu."""
    for a, b in (("C’était un bluff.", "Faux."), ("C’était un bluff :", "Faux :"), ("C'était un bluff.", "Faux."), ("Ce n’était pas un bluff.", "Vrai."), ("Il disait vrai.", "Vrai."), ("Il ne bluffait pas.", "Vrai.")):
        t = t.replace(a, b)
    import re
    return re.sub(r"C’était un bluff(\s?):", "Faux\\1:", t)


def question(e):
    base = {"explication": explication(e.get("correction", "")), "theme": e.get("theme", "")}
    if e["type"] == "qcm":
        return {"type": "qcm", "enonce": e["enonce"], "reponses": e["reponses"], "bonne": e["bonne"], **base}
    if e["type"] == "bluff":
        return {"type": "vraifaux", "affirmation": e["affirmation"], "vrai": e["vrai"], **base}
    return {"type": "ordre", "enonce": e["enonce"], "elements": e["elements"], "ordre": e["ordre"], "valeurs": e.get("valeurs", {}), **base}


def main():
    cat = json.loads((R / "catalogue.json").read_text(encoding="utf-8"))["domaines"]
    (R / "parcours").mkdir(exist_ok=True)
    (R / "paliers").mkdir(exist_ok=True)
    liste, questions = [], []
    for dom, chapitres in cat.items():
        if not chapitres:
            continue
        pid = "v-" + dom
        paliers = []
        for k, c in enumerate(chapitres, 1):
            ch = json.loads((R / (c["id"] + ".json")).read_text(encoding="utf-8"))
            src, vus = [], set()
            for s in ch.get("sources", []) + [s for e in ch["exercices"] for s in e.get("sources", [])]:
                if s[0] not in vus:
                    vus.add(s[0]); src.append(s)
            frise = []
            fx = ch["exercices"][2]
            if fx["type"] == "frise" and "classement" not in fx.get("lib", "").lower():
                frise = [{"date": fx["valeurs"].get(x, ""), "evenement": x} for x in fx["ordre"]]
            palier = {
                "id": f"{pid}:{k}", "parcours": pid, "numero": k, "etape": (k - 1) // 10 + 1, "titre": ch["titre"],
                "sujet": ch.get("sujet"), "image": ({"src": ch["figure"]["src"], "alt": ch["figure"].get("alt", ""), "credit": ch["figure"].get("credit", ""), "lien": None} if ch.get("figure") else None),
                "sections": {"enBref": "\n".join(ch["essentiel"]), "comment": None, "pourquoi": None, "ouQuand": None},
                "reperes": [{"terme": r[0], "definition": r[1]} for r in ch["reperes"]],
                "definitions": [], "frise": frise, "chiffres": ch.get("chiffres") or [], "notions": ch.get("notions"),
                "citation": ch.get("citation"), "histoire": ch.get("saviezVous"),
                "questions": [question(e) for e in ch["exercices"]], "sources": src,
                "verification": {"statut": "verifie", "note": "Vérifié par la rédaction : au moins deux sources indépendantes par notion, dont une institutionnelle ou savante."},
            }
            (R / "paliers" / f"{pid}-{k}.json").write_text(json.dumps(palier, ensure_ascii=False) + "\n", encoding="utf-8")
            paliers.append({"numero": k, "titre": ch["titre"], "sujet": ch.get("sujet")})
            for i, q in enumerate(palier["questions"]):
                questions.append({"palier": palier["id"], "titre": ch["titre"], "parcoursTitre": NOMS[dom], "index": i, "question": q})
        etapes = [{"numero": e + 1, "titre": "Étape " + str(e + 1), "paliers": paliers[e * 10:(e + 1) * 10]} for e in range((len(paliers) + 9) // 10)]
        p = {"id": pid, "titre": NOMS[dom], "verifie": True, "resume": RESUMES[dom], "image": None, "etapes": etapes, "sources": []}
        (R / "parcours" / f"{pid}.json").write_text(json.dumps(p, ensure_ascii=False) + "\n", encoding="utf-8")
        liste.append({"id": pid, "titre": NOMS[dom], "paliers": len(paliers), "resume": RESUMES[dom]})
    (R / "parcours.json").write_text(json.dumps({"parcours": liste}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (R / "questions.json").write_text(json.dumps(questions, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Parcours vérifiés : " + ", ".join(f"{x['id']} ({x['paliers']} paliers)" for x in liste) + f" · {len(questions)} questions")


if __name__ == "__main__":
    main()
