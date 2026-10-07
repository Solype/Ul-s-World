"""Données de règles, transcrites depuis refdoc/Création de personnage.pdf et refdoc/Fiche PJ vide.pdf.

C'est le seul endroit à modifier quand les règles du jeu évoluent : le reste du backend
et le frontend (via GET /rules) s'appuient dessus.
"""

from enum import StrEnum


class Attribute(StrEnum):
    RESISTANCE = "resistance"
    FORCE = "force"
    AGILITE = "agilite"
    DEXTERITE = "dexterite"
    VIVACITE = "vivacite"
    INTELLECT = "intellect"
    SOCIAL = "social"


class Species(StrEnum):
    ELFE = "elfe"
    HUMAIN = "humain"
    KOBOLD = "kobold"
    NAIN = "nain"
    ORC = "orc"


class Priority(StrEnum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    E = "E"


START_PC = 25

# (minimum, maximum, limite surhumaine) par espèce et par attribut. La Magie n'a pas de limite.
_ORDER = list(Attribute)
SPECIES_LIMITS: dict[Species, dict[Attribute, tuple[int, int, int]]] = {
    species: dict(zip(_ORDER, limits, strict=True))
    for species, limits in {
        Species.ELFE: [(1, 6, 9), (1, 6, 9), (4, 9, 12), (4, 9, 12), (4, 9, 12), (3, 8, 11), (1, 6, 9)],
        Species.HUMAIN: [(2, 7, 10), (2, 7, 10), (2, 7, 10), (3, 8, 11), (1, 6, 9), (3, 8, 11), (5, 10, 13)],
        Species.KOBOLD: [(3, 8, 11), (1, 6, 9), (2, 7, 10), (3, 8, 11), (4, 9, 12), (2, 7, 10), (3, 8, 11)],
        Species.NAIN: [(4, 9, 12), (3, 8, 11), (1, 6, 9), (4, 9, 12), (1, 6, 9), (4, 9, 12), (1, 6, 9)],
        Species.ORC: [(4, 9, 12), (5, 10, 13), (1, 6, 9), (2, 7, 10), (2, 7, 10), (2, 7, 10), (2, 7, 10)],
    }.items()
}

# Tableau des priorités. "roles" liste les combinaisons (principaux, secondaires) autorisées.
PRIORITY_TABLE: dict[Priority, dict] = {
    Priority.A: {"cost": 10, "roles": [(1, 3), (2, 1)], "attributes": 42, "skill_groups": 90, "money": 1200},
    Priority.B: {"cost": 8, "roles": [(1, 2), (2, 0)], "attributes": 38, "skill_groups": 64, "money": 800},
    Priority.C: {"cost": 6, "roles": [(1, 1)], "attributes": 34, "skill_groups": 42, "money": 520},
    Priority.D: {"cost": 3, "roles": [(1, 0)], "attributes": 30, "skill_groups": 20, "money": 250},
    Priority.E: {"cost": 1, "roles": [(0, 1)], "attributes": 26, "skill_groups": 12, "money": 120},
}

# Ce qu'achète 1 PC restant.
BOTTES_PER_PC = 2

# Catalogue des compétences de la fiche : groupe -> compétences.
SKILL_GROUPS: dict[str, dict] = {
    "combat_distance": {"label": "Combat. À distance", "skills": {
        "arc": "Arc", "arbalete": "Arbalète", "arme_exotique_distance": "Arme exotique",
        "petit_projectile": "Petit projectile", "pistolet": "Pistolet"}},
    "combat_artillerie": {"label": "Combat. Artillerie", "skills": {"canon": "Canon", "engin": "Engin"}},
    "combat_melee": {"label": "Combat. Mêlée", "skills": {
        "arme_hast": "Arme d'hast", "arme_exotique_melee": "Arme exotique", "bouclier": "Bouclier",
        "contondante": "Contondante", "courte_lame": "Courte lame", "epee": "Épée", "hache": "Hache",
        "sabre": "Sabre", "main_nue": "Main nue"}},
    "resistances": {"label": "Résistances", "skills": {
        "endurance": "Endurance", "mentale": "Mentale", "pathologique": "Pathologique", "physique": "Physique"}},
    "deplacement": {"label": "Déplacement", "skills": {
        "acrobatie": "Acrobatie", "course": "Course", "equilibre": "Équilibre", "escalade": "Escalade",
        "esquive": "Esquive", "nage": "Nage", "navigation": "Navigation", "saut": "Saut"}},
    "survie": {"label": "Survie", "skills": {
        "discretion": "Discrétion", "manipulation": "Manipulation", "orientation": "Orientation",
        "reflexe": "Réflexe", "soulevement": "Soulèvement"}},
    "sociale": {"label": "Sociale", "skills": {
        "argumentation": "Argumentation", "dressage": "Dressage", "imposture": "Imposture",
        "intimidation": "Intimidation", "psychologie": "Psychologie"}},
    "artisanat": {"label": "Artisanat", "skills": {
        "art_plastique": "Art plastique", "chimie": "Chimie", "construction": "Construction",
        "cuisine": "Cuisine", "armurerie": "Armurerie", "medecine": "Médecine", "musique": "Musique"}},
    # Les connaissances ne sont pas une compétence : voir SKILL_POOLS et refdoc/infos.md.
    "intellect": {"label": "Intellect", "skills": {
        "concentration": "Concentration", "deduction": "Déduction",
        "memoire": "Mémoire", "observation": "Observation"}},
    "magie": {"label": "Compétence magique", "skills": {
        "alchimie": "Alchimie", "amelioration": "Amélioration", "annihilation": "Annihilation",
        "conjuration": "Conjuration", "elementarisme": "Élémentarisme", "enchantement": "Enchantement",
        "envoutement": "Envoûtement", "illusionnisme": "Illusionnisme", "invocation": "Invocation",
        "necromancie": "Nécromancie", "perception": "Perception", "scellement": "Scellement",
        "sorcellerie": "Sorcellerie", "absorption": "Absorption"}},
}

ALL_SKILLS: dict[str, str] = {s: g for g, grp in SKILL_GROUPS.items() for s in grp["skills"]}
SKILL_LABELS: dict[str, str] = {s: label for grp in SKILL_GROUPS.values() for s, label in grp["skills"].items()}

# Réserves alimentées par les PCP d'un groupe, sans colonnes PCR/PCT (Création de personnage p.5-6) :
# « Le mana est obtenu par 15 par point de compétence utilisé, les connaissances sont obtenues par 2
# par point de compétence utilisé ». Les PCP qui y sont mis comptent dans le « 2 × niveau » du groupe.
SKILL_POOLS: dict[str, dict] = {
    "connaissances": {"group": "intellect", "label": "Connaissances", "per_point": 2},
    "mana": {"group": "magie", "label": "Mana", "per_point": 15},
}


def group_level_cost(level: int) -> int:
    """Coût cumulé pour amener un groupe de 0 au niveau donné : 1 + 2 + ... + level."""
    return level * (level + 1) // 2
