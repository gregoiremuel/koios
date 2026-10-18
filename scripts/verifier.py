"""Vérifie que les pages HTML de Koîos n'utilisent rien d'interdit par DESIGN.md.

Usage : python3 scripts/verifier.py [fichiers...]  (par défaut : maquettes/*.html)
Sortie : la liste des problèmes, ou « Tout passe ». Code de sortie 1 s'il y a un problème.
"""
import glob
import re
import sys

MOTS = [
    "Bienvenue", "Découvrez", "N'hésitez pas", "au cœur de", "véritable",
    "incontournable", "passion", "sublimer", "écrin", "expérience", "univers",
    "authentique", "d'exception", "excellence", "intemporel", "En savoir plus",
]
POLICES = [
    "Inter", "Geist", "Roboto", "Space Grotesk", "Poppins", "Montserrat",
    "DM Sans", "Playfair",
]
MOTIFS_CSS = {
    "dégradé": r"(linear|radial|conic)-gradient\(",
    "flou ou verre dépoli": r"backdrop-filter|filter:\s*blur",
    "ombre portée": r"box-shadow:\s*(?!none)[^;]*\d+px[^;]*\d+px",
}
# Teintes violettes : rouge et bleu dominants, vert faible.
HEX = re.compile(r"#([0-9a-fA-F]{6})\b")


def violet(hexa: str) -> bool:
    r, g, b = (int(hexa[i:i + 2], 16) for i in (0, 2, 4))
    return b > 90 and r > 70 and g < min(r, b) - 40


def texte_visible(html: str) -> str:
    """Texte affiché : le HTML hors balises, plus les chaînes entre guillemets des scripts (textes injectés en JS)."""
    scripts = " ".join(re.findall(r"<script[^>]*>(.*?)</script>", html, flags=re.S | re.I))
    chaines = " ".join(re.findall(r'"((?:[^"\\]|\\.)*)"', scripts))
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    return re.sub(r"<[^>]+>", " ", html) + " " + chaines


def verifier(chemin: str) -> list[str]:
    with open(chemin, encoding="utf-8") as f:
        html = f.read()
    problemes = []
    texte = texte_visible(html)
    for mot in MOTS:
        if re.search(r"(?<!\w)" + re.escape(mot) + r"(?!\w)", texte, re.I):
            problemes.append(f"mot interdit « {mot} »")
    for police in POLICES:
        if re.search(r"family=" + police.replace(" ", r"\+") + r"\b|['\"]" + police + r"['\"]", html):
            problemes.append(f"police interdite {police}")
    for nom, motif in MOTIFS_CSS.items():
        if re.search(motif, html, re.I):
            problemes.append(f"{nom} trouvé")
    for m in HEX.finditer(html):
        if violet(m.group(1)):
            problemes.append(f"couleur violette #{m.group(1)}")
    if re.search(r"[\U0001F300-\U0001FAFF☀-➿]", texte):
        problemes.append("emoji dans le texte")
    return problemes


def main() -> int:
    fichiers = sys.argv[1:] or sorted(glob.glob("maquettes/**/*.html", recursive=True))
    total = 0
    for chemin in fichiers:
        for p in verifier(chemin):
            print(f"{chemin} : {p}")
            total += 1
    if total == 0:
        print("Tout passe")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
