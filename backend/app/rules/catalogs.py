"""Catalogues des ressources à choix fermé (refdoc/Langues.pdf) : langues et animaux totems, dieux.

Un élément choisi est stocké dans `character.selections[<ressource>]` sous son libellé (`name`).
Les effets des langues sont descriptifs. Ceux des animaux totems comptent comme des PCR
(compétence, mana, points de connaissance), sauf ceux qui ne se chiffrent pas (vision nocturne,
bonus conditionnel, compétence absente de la fiche) : ceux-là restent descriptifs.
"""

from pydantic import BaseModel


class GodCode(BaseModel):
    """Un code d'un dieu : ce qu'il prescrit, sa valeur de code et son zèle."""
    content: str
    value: int
    zeal: int


class CatalogEntry(BaseModel):
    label: str
    effect: str
    # Sorts : compétence magique (clé de SKILL_GROUPS["magie"]) et famille dans cette magie (Feu, Eau...).
    school: str | None = None
    group: str | None = None
    # Bonus chiffrés, comptés comme des PCR (animaux totems).
    skill: str | None = None
    points: int = 0
    mana: int = 0
    free_knowledge: int = 0
    # Dieux : leurs codes.
    codes: list[GodCode] = []


def _entries(*items: tuple) -> list[CatalogEntry]:
    """(libellé, effet) ou (libellé, effet, {bonus})."""
    return [CatalogEntry(label=i[0], effect=i[1], **(i[2] if len(i) > 2 else {})) for i in items]


def _sk(skill: str, points: int = 1) -> dict:
    return {"skill": skill, "points": points}


def _code(content: str, value: int, zeal: int) -> GodCode:
    return GodCode(content=content, value=value, zeal=zeal)


# Codes des dieux, par libellé de dieu. Exemple :
#   "Dieu 1": [_code("Ne jamais mentir à un prêtre.", value=6, zeal=2)]
_GOD_CODES: dict[str, list[GodCode]] = {}

# Les 12 dieux. Noms et effets provisoires, en attendant leur description.
GODS = [CatalogEntry(label=f"Dieu {i}", effect="", codes=_GOD_CODES.get(f"Dieu {i}", [])) for i in range(1, 13)]

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

# Sorts, par compétence magique puis par famille. Effets à venir. Seule l'Élémentarisme est transcrite :
# les autres magies ont aussi des sorts, d'où un catalogue ouvert (OPEN_CATALOGS).
_ELEMENTS: dict[str, list[str]] = {
    "Feu": ["Poing de feu", "Souffle volcanique", "Torche marine", "Feu d'artifice", "Boule de feu", "Immolation",
            "Cuisson", "KABOUM !", "Déflagration"],
    "Eau": ["Bubulle", "Osmose", "Sphère d'eau boueuse", "Eau claire", "Prison aqueuse", "Boule de neige",
            "Lame de fond", "Geyser", "Typhon"],
    "Terre": ["Masse de pierre", "Polyroche", "Brise roche", "Mur rocheux", "Tunnel", "Pierres dansantes",
              "Lame de roc", "Stalagmite", "Séisme"],
    "Air": ["Aérobatie", "Mur de vent", "Surpression", "Aérokinésie", "Lame d'air", "Tourbillon", "Anticyclone",
            "Mistral", "Tornade"],
    "Électricité": ["Tonnerre", "Survoltage", "Dipôle", "Taser", "Magnétisme", "Orage ionique", "Arc ciblé",
                    "Éclair en chaîne", "Foudre"],
    "Vie": ["Infestation", "Poing vampirique", "Chrysalide", "Antidote", "Grandit !!!", "Transfusion",
            "Revitalisation", "Spore", "Coquelicot"],
    "Ombre": ["Cécité", "Poignard de ténèbres", "Voile pernicieux", "Arc obscure", "Poigne des ombres",
              "Ombre leurre", "Danse des ombres", "Damoclès", "Éclipse"],
    "Lumière": ["Astre terrestre", "Lame nébuleuse", "Absorption de lumière", "Main lumineuse", "Pixie",
                "Choix désastre", "Rayon prismatique", "Couronne astrale", "Rayon solaire"],
}
SPELLS = [CatalogEntry(label=name, effect="", school="elementarisme", group=element)
          for element, names in _ELEMENTS.items() for name in names]

# Ressource (clé de RESOURCE_DEFS) -> catalogue de ses choix.
CATALOGS: dict[str, list[CatalogEntry]] = {
    "langues": LANGUAGES,
    "animaux_totems": TOTEMS,
    "sorts": SPELLS,
    "dieux": GODS,
}
# Catalogues incomplets : on y choisit, mais un élément hors catalogue reste accepté.
OPEN_CATALOGS = {"sorts"}
