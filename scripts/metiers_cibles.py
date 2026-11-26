r"""Prépare les données de la page « Six métiers à la loupe » (metiers-cibles.html).

Usage (après scripts/extraire.py et scripts/resumer.py, comme dans .github/workflows/veille.yml) :
    .venv\Scripts\python.exe scripts\metiers_cibles.py

Lit :
    data/resume.json             les offres actives du jour (écrit par resumer.py)
    config/metiers-cibles.json   les six métiers : codes ROME, codes voisins, règle sur l'intitulé
    data/geo/population.json     population et rang en France de chaque commune, population de chaque
                                 département (INSEE, via geo.api.gouv.fr) ; refait s'il manque ou a plus de 180 jours
Écrit :
    data/metiers-cibles.json     les offres des six métiers, les villes et départements avec leur population
    data/metiers-cibles.js       le même contenu, lisible par la page ouverte en double-clic (sans serveur)
    data/accueil.js              trois chiffres pour la page d'accueil (index.html)

Les comptages (entreprises, secteurs, villes, ratios) sont refaits dans le navigateur, selon le métier
choisi : ce script ne fait que trier les offres et préparer les populations.
"""
import json
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

import requests

RACINE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
from extraire import METIERS  # noqa: E402

GEO = "https://geo.api.gouv.fr"
POPULATION = RACINE / "data" / "geo" / "population.json"
GRANDES_VILLES = 40         # les plus peuplées, toujours envoyées à la page (même sans offre)

# Paris, Lyon et Marseille : les offres donnent souvent l'arrondissement, la population est celle de la ville.
ARRONDISSEMENTS = [(re.compile(r"^751\d\d$"), "75056"), (re.compile(r"^6938\d$"), "69123"),
                   (re.compile(r"^132\d\d$"), "13055")]


def sans_accents(s):
    return unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()


def population():
    """Le cache de population ; le refait depuis geo.api.gouv.fr s'il manque ou a plus de 180 jours."""
    if POPULATION.exists():
        p = json.loads(POPULATION.read_text(encoding="utf-8"))
        # Le cache doit contenir toutes les communes (rang en France) : les anciens caches partiels sont refaits.
        if p.get("toutes") and (date.today() - datetime.strptime(p["lu_le"], "%Y-%m-%d").date()).days <= 180:
            return p
    try:
        communes = requests.get(f"{GEO}/communes", params={
            "fields": "nom,code,population,codeDepartement", "format": "json"}, timeout=120).json()
        deps = requests.get(f"{GEO}/departements", timeout=30).json()
    except (requests.RequestException, ValueError) as e:
        if POPULATION.exists():
            print(f"geo.api.gouv.fr indisponible ({e.__class__.__name__}) : on garde l'ancien cache")
            return json.loads(POPULATION.read_text(encoding="utf-8"))
        raise
    pop_dep = {}
    for c in communes:
        pop_dep[c.get("codeDepartement")] = pop_dep.get(c.get("codeDepartement"), 0) + (c.get("population") or 0)
    # Rang de chaque commune en France, de la plus peuplée (1) à la moins peuplée.
    classees = sorted(communes, key=lambda c: -(c.get("population") or 0))
    p = {
        "toutes": True,
        "lu_le": f"{date.today():%Y-%m-%d}",
        "source": "INSEE, population municipale, via geo.api.gouv.fr (API Découpage administratif)",
        "communes": {c["code"]: [c["nom"], c.get("population") or 0, c.get("codeDepartement"), rang]
                     for rang, c in enumerate(classees, start=1)},
        "departements": {d["code"]: [d["nom"], pop_dep.get(d["code"], 0)] for d in deps},
    }
    POPULATION.parent.mkdir(parents=True, exist_ok=True)
    POPULATION.write_text(json.dumps(p, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Population : {len(communes)} communes lues et classées")
    return p


def ville(o):
    """Code INSEE de la ville de l'offre (arrondissements regroupés), ou None si l'offre ne donne pas sa commune."""
    code = o.get("commune")
    if not code:
        # « 75 - Paris » sans commune : le département de Paris est une seule commune.
        return "75056" if re.match(r"^\s*75\s*-", o.get("lieu") or "") else None
    for motif, ville_entiere in ARRONDISSEMENTS:
        if motif.match(code):
            return ville_entiere
    return code


def main():
    resume = json.loads((RACINE / "data" / "resume.json").read_text(encoding="utf-8"))
    config = json.loads((RACINE / "config" / "metiers-cibles.json").read_text(encoding="utf-8"))
    metiers = config["metiers"]
    for m in metiers:
        absents = [c for c in m["codes"] + m["voisins"] if c not in METIERS]
        if absents:
            sys.exit(f"{m['libelle']} : {', '.join(absents)} absent(s) de METIERS (scripts/extraire.py)")
        m["_rx"] = [re.compile(x) for x in m["intitule"]]
        m["_ex"] = [re.compile(x) for x in m.get("exclure", [])]
    pop = population()

    offres, villes_vues = [], set()
    for o in resume["offres"]:
        titre = sans_accents(o.get("intitule"))
        dans_code = [m["cle"] for m in metiers if o["rome"] in m["codes"]]
        retenue = [m["cle"] for m in metiers if o["rome"] in m["codes"] + m["voisins"]
                   and all(rx.search(titre) for rx in m["_rx"]) and not any(rx.search(titre) for rx in m["_ex"])]
        if not dans_code and not retenue:
            continue
        v = ville(o)
        if v:
            villes_vues.add(v)
        offres.append({
            "id": o["id"], "rome": o["rome"], "intitule": o.get("intitule"),
            "entreprise": o.get("entreprise"), "secteur": o.get("secteur"),
            "ville": v, "dep": o.get("dep") or None, "lieu": o.get("lieu"),
            "contrat": o.get("contrat"), "alternance": o.get("alternance"),
            "date": o.get("date"), "url": o.get("url"),
            "m": retenue,       # retenue pour ces métiers (code ou voisin, et intitulé conforme)
            "c": dans_code,     # dans le code ROME de ces métiers, quel que soit l'intitulé
        })

    grandes = sorted(pop["communes"], key=lambda c: pop["communes"][c][3])[:GRANDES_VILLES]
    villes = {c: pop["communes"][c] for c in set(grandes) | villes_vues if c in pop["communes"]}
    for m in metiers:
        m["dans_code"] = sum(1 for o in offres if m["cle"] in o["c"])
        m["retenues"] = sum(1 for o in offres if m["cle"] in o["m"])
        m["par_voisins"] = sum(1 for o in offres if m["cle"] in o["m"] and m["cle"] not in o["c"])
        m["libelles_codes"] = {c: METIERS[c][0] for c in m["codes"] + m["voisins"]}
        del m["_rx"], m["_ex"]

    sortie = {
        "date": resume["date"],
        "source": resume["source"],
        "population": {"source": pop["source"], "lu_le": pop["lu_le"]},
        "metiers": metiers,
        "contrats": resume.get("contrats", {}),
        "offres": offres,
        "villes": villes,                     # code INSEE -> [nom, population, département, rang en France]
        "grandes_villes": grandes,            # les plus peuplées de France, dans l'ordre
        "departements": pop["departements"],  # code -> [nom, population]
    }
    texte = json.dumps(sortie, ensure_ascii=False, separators=(",", ":"))
    (RACINE / "data" / "metiers-cibles.json").write_text(texte, encoding="utf-8")
    (RACINE / "data" / "metiers-cibles.js").write_text("window.METIERS_CIBLES = " + texte + ";\n", encoding="utf-8")
    # Quelques chiffres pour la page d'accueil (index.html), dans un fichier minuscule.
    accueil = {"date": resume["date"], "emplois": len(resume["offres"]),
               "six_metiers": sum(1 for o in offres if o["m"]), "metiers_suivis": len(METIERS)}
    (RACINE / "data" / "accueil.js").write_text("window.ACCUEIL = " + json.dumps(accueil) + ";\n", encoding="utf-8")
    print(f"Écrit : data/metiers-cibles.json et .js — {len(offres)} offres, {len(villes)} villes, "
          f"{len(texte) // 1024} Ko")
    for m in metiers:
        print(f"  {m['libelle']:<32} {m['retenues']:4d} retenues ({m['par_voisins']} par codes voisins) ; "
              f"{m['dans_code']} dans le code {'+'.join(m['codes'])}")


if __name__ == "__main__":
    main()
