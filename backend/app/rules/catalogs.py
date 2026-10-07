"""Catalogues des ressources à choix fermé (refdoc/Langues.pdf) : langues et animaux totems.

Un élément choisi est stocké dans `character.selections[<ressource>]` sous son libellé (`name`).
Les effets des langues sont descriptifs. Ceux des animaux totems comptent comme des PCR
(compétence, mana, points de connaissance), sauf ceux qui ne se chiffrent pas (vision nocturne,
bonus conditionnel, compétence absente de la fiche) : ceux-là restent descriptifs.
"""

from pydantic import BaseModel


class CatalogEntry(BaseModel):
    label: str
    effect: str
    # Bonus chiffrés, comptés comme des PCR (animaux totems).
    skill: str | None = None
    points: int = 0
    mana: int = 0
    free_knowledge: int = 0


def _entries(*items: tuple) -> list[CatalogEntry]:
    """(libellé, effet) ou (libellé, effet, {bonus})."""
    return [CatalogEntry(label=i[0], effect=i[1], **(i[2] if len(i) > 2 else {})) for i in items]


def _sk(skill: str, points: int = 1) -> dict:
    return {"skill": skill, "points": points}


# Lancer un sort se fait dans une langue, choisie avant de lancer les dés.
LANGUAGES = _entries(
    ("Elfique", "Les sorts lancés à P > 7 bénéficient d'un bonus de 2."),
    ("Égyptien", "Un sort nécessitant plus de mana que n'en possède le lanceur peut tout de même être lancé, "
                 "induisant une dette de mana (au plus le mana max du lanceur ; il doit posséder au moins 1 de mana)."),
    ("Grec ancien", "Les sorts nécessitant une incantation ne requièrent plus l'attention du lanceur "
                    "(le sort se finit même sans sa présence)."),
    ("Latin", "Les sorts lancés à P ≤ 4 bénéficient d'un bonus de 2."),
    ("Rêvlij", "Peut lancer n'importe quel sort d'une famille de magie, mais le sort coûte le double de mana."),
    ("Runique", "Ajoute 2 à la somme des réussites (jet comparé, magie à seuil comme la Conjuration)."),
    ("Terthan", "Puissance des sorts +1, mais malus de 2 au jet, et échec critique aussi sur un 19 au D20 "
                "si le jet est échoué."),
)

TOTEMS = _entries(
    ("Aigle", "+1 en observation", _sk("observation")),
    ("Araignée", "+1 en piège (compétence absente de la fiche)"),
    ("Axolotl", "+1 en médecine", _sk("medecine")),
    ("Bison", "+1 en résistance physique", _sk("physique")),
    ("Bousier", "+1 en absorption", _sk("absorption")),
    ("Cerf", "+20 de mana", {"mana": 20}),
    ("Cheval", "+1 en dressage", _sk("dressage")),
    ("Chouette", "Vision nocturne"),
    ("Colibri", "+1 en esquive", _sk("esquive")),
    ("Corneille", "+1 en mémoire", _sk("memoire")),
    ("Crocodile", "+1 (en cours de discussion)"),
    ("Dauphin", "+1 en psychologie", _sk("psychologie")),
    ("Fourmi", "+1 en construction", _sk("construction")),
    ("Gekko", "+1 en équilibre", _sk("equilibre")),
    ("Grenouille", "+1 en saut", _sk("saut")),
    ("Guépard", "+1 en course", _sk("course")),
    ("Hirondelle", "+1 en orientation", _sk("orientation")),
    ("Iguane", "+1 en réflexe", _sk("reflexe")),
    ("Loup", "+1 en combat si au moins 3 personnes"),
    ("Margay", "+1 en acrobatie", _sk("acrobatie")),
    ("Méduse", "+1 en cuisine", _sk("cuisine")),
    ("Ours", "+1 en pêche (compétence absente de la fiche)"),
    ("Paon", "+1 en musique", _sk("musique")),
    ("Panda", "+1 en escalade", _sk("escalade")),
    ("Poulpe", "+1 en discrétion", _sk("discretion")),
    ("Ratel", "+1 en combat si seul"),
    ("Renard", "+1 en déduction", _sk("deduction")),
    ("Requin", "+1 en nage", _sk("nage")),
    ("Rhinocéros", "+1 en endurance", _sk("endurance")),
    ("Rossignol", "+1 en musique", _sk("musique")),
    ("Saumon", "+1 en navigation", _sk("navigation")),
    ("Serpent", "+2 connaissances", {"free_knowledge": 2}),
    ("Tigre", "+1 en pistage (compétence absente de la fiche)"),
    ("Vautour", "+1 en résistance pathologique", _sk("pathologique")),
)

# Ressource (clé de RESOURCE_DEFS) -> catalogue de ses choix.
CATALOGS: dict[str, list[CatalogEntry]] = {
    "langues": LANGUAGES,
    "animaux_totems": TOTEMS,
}
