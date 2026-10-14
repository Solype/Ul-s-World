"""Catalogues des ressources à choix fermé (refdoc/Langues.pdf) : langues et animaux totems, dieux.

Un élément choisi est stocké dans `character.selections[<ressource>]` sous son libellé (`name`).
Les effets des langues sont descriptifs. Ceux des animaux totems comptent comme des PCR
(compétence, mana, points de connaissance), sauf ceux qui ne se chiffrent pas (vision nocturne,
bonus conditionnel, compétence absente de la fiche) : ceux-là restent descriptifs.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class SpellEffect(BaseModel):
    """Effet d'un sort selon sa puissance P (ou, pour un enchantement, le nombre N d'enchantements posés).

    - multiplicateur : la valeur vaut `base + per × P` (« Dégâts : 2 × P PV ») ;
    - effet propre à une puissance : `at` (P = 3) ;
    - effet à partir d'un seuil : `at_least` (P ≥ 5).
    Un multiplicateur peut être conditionné (`at_least` + `per`). Sans `at` ni `at_least`, l'effet vaut à toute puissance.
    """
    text: str
    per: float | None = Field(None, description="Multiplicateur de P (ou N).")
    base: float = Field(0, description="Valeur fixe ajoutée au multiplicateur.")
    unit: str = Field("", description="Unité de la valeur : « PV », « m », « tours »...")
    at: int | None = Field(None, description="L'effet ne vaut qu'à cette puissance exacte.")
    at_least: int | None = Field(None, description="L'effet vaut à partir de cette puissance.")

    @model_validator(mode="after")
    def _check(self) -> "SpellEffect":
        if self.at is not None and self.at_least is not None:
            raise ValueError("Un effet vaut à une puissance exacte (`at`) ou à partir d'un seuil (`at_least`), pas les deux.")
        return self


def _scaled(text: str, per: float, base: float = 0, unit: str = "", at_least: int | None = None) -> SpellEffect:
    """Multiplicateur : « Dégâts : 2 × P PV » = `_scaled("Dégâts", 2, unit="PV")`."""
    return SpellEffect(text=text, per=per, base=base, unit=unit, at_least=at_least)


def _at(level: int, text: str) -> SpellEffect:
    """Effet propre à une puissance (P = level)."""
    return SpellEffect(text=text, at=level)


def _from(level: int, text: str) -> SpellEffect:
    """Effet à partir d'une puissance (P ≥ level)."""
    return SpellEffect(text=text, at_least=level)


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
    # Enchantements : ce sur quoi ils se posent (« armes mêlée », « armures »...).
    target: str | None = None
    # Sorts : ce dont dépendent leurs effets (puissance P, ou nombre N d'enchantements pour l'Enchantement).
    scaling: Literal["puissance", "nombre"] | None = None
    effects: list[SpellEffect] = []
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


def god_code(god: str, content: str) -> GodCode | None:
    """Le code `content` du dieu `god`, ou None s'il n'existe pas."""
    entry = next((g for g in GODS if g.label == god), None)
    return next((c for c in entry.codes if c.content == content), None) if entry else None

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

# Sorts, par compétence magique puis par famille. Effets à venir. Seuls l'Élémentarisme, l'Enchantement et
# l'Amélioration sont transcrits : les autres magies ont aussi des sorts, d'où un catalogue ouvert (OPEN_CATALOGS).
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
# Enchantement : (nom, ce sur quoi il se pose) par famille. Les abréviations des basiques (Pr, E...) sont gardées.
_ENCHANTMENTS: dict[str, list[tuple[str, str | None]]] = {
    "Feu": [("Arme de feu", "armes mêlée"), ("Aura brûlante", "armures"), ("Incendiaire", "gros projectiles"),
            ("Explosif", "armes à distance hors armes à feu")],
    "Eau": [("Aisance aquatique", "armures"), ("Égide glaciale", "boucliers"),
            ("Bulle protectrice", "structures et engins"), ("Arme gélive", "armes mêlée")],
    "Terre": [("Plomb lourd", "armes à feu, canons"), ("Rempart clouté", "boucliers"),
              ("Armageddon", "pierres lourdes"), ("Extension tellurique", "armes contondantes")],
    "Air": [("Légèreté", "armures"), ("Évaporation", "armes, boucliers et engins légers (max 3 PV)"),
            ("Lacrymo", "gros projectiles"), ("Lame tornade", "épées, sabres")],
    "Électricité": [("Répétition électrique", "armes mêlée"), ("Électrification", "armes à distance"),
                    ("Étendard de téléportation", "petits et gros projectiles"),
                    ("Fer foudroyant", "armes d'hast, javelot, sagaie")],
    "Vie": [("Armure wormag", "armures"), ("Flèches toxiques", "arcs, arbalètes et engins à carreaux"),
            ("Havre d'abondance", "structures et engins"), ("Porteur de peste", "gros projectiles")],
    "Lumière": [("Arme d'éther", "armes"), ("Arme de lumière", "armes"),
                ("Carreau fantôme", "gros carreaux, arcs et arbalètes"), ("Bouclier miroir", "boucliers")],
    "Ombre": [("Arme corruptrice", "armes"), ("Arme des ténèbres", "armes"),
              ("Réceptacle de spectres", "gros projectiles"), ("Armure opaque", "armures")],
    "Basique": [("Protection (Pr)", None), ("Équipement (E)", None), ("Ergonomie (M)", None), ("Dégâts (D)", None),
                ("Potentiel de destruction (D)", None), ("Pénétration d'armure (P)", None)],
    "Auxiliaire": [("Appartenance", None), ("Absorption", None), ("Support physique", None), ("Support mental", None),
                   ("Transfert spirituel", None), ("Condition", None), ("Effet direct", None),
                   ("Effet sur le quotidien", None), ("Coût contrepartie", None), ("Combat spirituel", None)],
}
# Amélioration : sorts de lien, puis sorts d'amélioration (un par animal).
_IMPROVEMENTS: dict[str, list[str]] = {
    "Sorts de lien": ["Lien unique", "Lien basique", "Lien complexe"],
    "Sorts d'amélioration": [
        "Discernement de l'aigle", "Protection du bison", "Célérité du colibri", "Force du crocodile",
        "Coup de pouce de la grenouille", "Vitesse du guépard", "Réflexes de l'iguane", "Esprit du loup",
        "Chemin du panda", "Camouflage du poulpe", "Voie du requin", "Ténacité du rhinocéros", "Inspiration du paon",
        "Chant du rossignol", "Rage de l'ours", "Prescience de la chouette", "Fourberie du serpent",
        "Amitié de l'axolotl", "Pugnacité de la ratel", "Ruse du renard", "Légèreté du papillon", "Grâce du phœnix"],
}
# Effets des sorts, par libellé. Ils varient avec la puissance P, ou avec le nombre N d'enchantements posés
# pour l'Enchantement. Exemple :
#   "Boule de feu": [_scaled("Dégâts", 2, unit="PV"), _at(3, "La cible est repoussée."), _from(5, "Enflamme la zone.")]
_SPELL_EFFECTS: dict[str, list[SpellEffect]] = {}


def _spell(name: str, school: str, group: str, target: str | None = None) -> CatalogEntry:
    return CatalogEntry(label=name, effect="", school=school, group=group, target=target,
                        scaling="nombre" if school == "enchantement" else "puissance",
                        effects=_SPELL_EFFECTS.get(name, []))


SPELLS = [
    *(_spell(name, "elementarisme", element) for element, names in _ELEMENTS.items() for name in names),
    *(_spell(name, "enchantement", family, target) for family, items in _ENCHANTMENTS.items() for name, target in items),
    *(_spell(name, "amelioration", family) for family, names in _IMPROVEMENTS.items() for name in names),
]

# Ressource (clé de RESOURCE_DEFS) -> catalogue de ses choix.
CATALOGS: dict[str, list[CatalogEntry]] = {
    "langues": LANGUAGES,
    "animaux_totems": TOTEMS,
    "sorts": SPELLS,
    "dieux": GODS,
}
# Catalogues incomplets : on y choisit, mais un élément hors catalogue reste accepté.
OPEN_CATALOGS = {"sorts"}
