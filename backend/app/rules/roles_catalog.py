"""Catalogue des rôles, transcrit depuis refdoc/Roles.pdf.

Conventions de transcription (voir aussi refdoc/fix.md) :
- « +N en compétences de X (au choix) » : N points répartis librement dans le groupe X (`spread`) ;
- « +N dans 1 catégorie ... au choix » / « +N en A ou B » : N points dans un seul choix (`one_of`, `pick`) ;
- « connaissance xxx » : connaissance libre « Xxx » ajoutée à celles du joueur (`kn`) ;
- les effets numériques (Magie, mana, bottes, sorts...) sont des stats (`st`), avec leur précision en note ;
- le nombre entre parenthèses après le nom est l'estimation d'équilibrage (`value` / `secondary_value`) ;
- « Intuition » (Samouraï) est ignorée : compétence désuète (voir fix.md).
"""

import re
import unicodedata

from app.rules.role_model import Choice, Grant, Role


def sk(points: int, skill: str) -> Grant:
    return Grant(points=points, skill=skill)


def kn(points: int, name: str) -> Grant:
    return Grant(points=points, knowledge=name)


def st(points: int, stat: str, note: str | None = None, imposed: list[str] | None = None) -> Grant:
    return Grant(points=points, stat=stat, note=note, imposed=imposed or [])


def one_of(id: str, points: int, *options: str) -> Grant:
    """« +3 en sabre ou épée »."""
    return Grant(id=id, points=points, choice=Choice(options=list(options)))


def pick(id: str, points: int, group: str) -> Grant:
    """« +3 dans 1 catégorie arme mêlée au choix »."""
    return Grant(id=id, points=points, choice=Choice(from_group=group))


def spread(id: str, points: int, group: str) -> Grant:
    """« +2 en compétences de Combat (mêlée) (au choix) » : points répartis librement."""
    return Grant(id=id, points=1, choice=Choice(from_group=group, count=points, allow_repeat=True))


def kn_choice(id: str, points: int) -> Grant:
    """« +4 en connaissance (au choix) » : intitulé libre."""
    return Grant(id=id, points=points, choice=Choice(target="knowledge"))


def role_key(label: str) -> str:
    """« Spécialiste en explosif » -> "specialiste_en_explosif"."""
    ascii_label = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_label.lower()).strip("_")


ROLE_CATEGORIES: dict[str, str] = {
    "mage": "Mage", "guerrier": "Guerrier", "tireur": "Tireur", "artilleuse": "Artilleuse",
    "assassin": "Assassin", "tank": "Tank", "religieux": "Religieux", "chasseur": "Chasseur",
    "eleveur": "Éleveur", "batisseuse": "Bâtisseuse", "guerisseur": "Guérisseur", "voleur": "Voleur",
    "orateur": "Orateur", "scientifique": "Scientifique", "marin": "Marin", "marchand": "Marchand",
    "cuisinier": "Cuisinier", "artisane": "Artisane", "exceptionnel": "Rôles exceptionnels",
}

COMMON_TRUNKS: dict[str, list[Grant]] = {
    "mage": [st(3, "magic"), kn(2, "Magique"), st(15, "mana"), sk(1, "memoire")],
    "guerrier": [sk(2, "endurance"), sk(1, "armurerie"), spread("melee", 2, "combat_melee")],
    "tireur": [sk(2, "observation"), spread("distance", 2, "combat_distance"), sk(1, "concentration")],
    "artilleuse": [sk(1, "engin"), kn(2, "Guerrière"), spread("artillerie", 2, "combat_artillerie"), sk(1, "construction")],
    "assassin": [sk(1, "discretion"), spread("deplacement", 2, "deplacement"), sk(2, "courte_lame")],
    "tank": [sk(3, "physique"), sk(1, "endurance"), sk(1, "bouclier")],
    "religieux": [kn(3, "Mystique"), st(30, "mana"), spread("sociale", 2, "sociale"), st(1, "langues")],
    "chasseur": [spread("survie", 2, "survie"), sk(1, "observation"), sk(1, "discretion"), kn(2, "Biologique")],
    "eleveur": [sk(2, "dressage"), spread("resistances", 2, "resistances"), kn(2, "Biologique")],
    "batisseuse": [spread("artisanat", 2, "artisanat"), sk(2, "construction"), kn(2, "Technologique")],
    "guerisseur": [kn(2, "Anatomique"), sk(1, "medecine"), spread("resistances", 2, "resistances"), kn(2, "Biologique")],
    "voleur": [spread("deplacement", 2, "deplacement"), sk(1, "discretion"), sk(1, "petit_projectile"),
               sk(1, "manipulation")],
    "orateur": [spread("sociale", 2, "sociale"), sk(1, "imposture"), sk(1, "argumentation"), kn(2, "Artistique")],
}


def _role(label: str, category: str, value: int | None = None, *, secondary_value: int | None = None,
          primary: list[Grant] | None = None, secondary: list[Grant] | None = None,
          description: str = "") -> tuple[str, Role]:
    return role_key(label), Role(label=label, category=category, value=value, secondary_value=secondary_value,
                                 primary=primary, secondary=secondary, description=description)


ROLES: dict[str, Role] = dict([
    # --- Mage ---
    _role("Chamane", "mage", 21, primary=[
        spread("magie", 4, "magie"), sk(3, "absorption"), st(2, "animaux_totems"),
        st(6, "sorts", "au choix"), st(45, "mana")]),
    _role("Magicien", "mage", 20, secondary_value=11, primary=[
        spread("magie", 5, "magie"), kn(2, "Magique"), sk(2, "absorption"), st(1, "animaux_totems"),
        st(1, "langues"), st(3, "sorts", "au choix"), st(60, "mana")], secondary=[
        spread("magie", 3, "magie"), sk(1, "absorption"), st(1, "animaux_totems"), st(1, "langues"),
        st(30, "mana")]),
    _role("Soigneur", "mage", 20, primary=[
        spread("magie", 2, "magie"), kn(1, "Magique"), kn(2, "Anatomique"), sk(1, "absorption"),
        st(1, "animaux_totems"), st(9, "sorts", "au choix"), st(6, "sorts", "de la magie sorcellerie"),
        st(75, "mana")]),
    _role("Sorcier", "mage", 21, secondary_value=11, primary=[
        spread("magie", 6, "magie"), kn(2, "Magique"), sk(1, "absorption"), st(1, "langues"),
        st(9, "sorts", "au choix"), st(30, "mana")], secondary=[
        spread("magie", 4, "magie"), st(6, "sorts", "au choix"), st(15, "mana")]),

    # --- Guerrier ---
    _role("Bretteur", "guerrier", 19, primary=[
        one_of("arme", 3, "sabre", "epee"), sk(2, "esquive"), sk(3, "reflexe"), st(3, "bottes", "(sabre ou épée)")]),
    _role("Cavalier", "guerrier", 19, primary=[
        sk(1, "reflexe"), sk(3, "dressage"), one_of("arme", 3, "sabre", "arme_hast"),
        st(2, "bottes", "(sabre ou hast)"), st(1, "montures")]),
    _role("Mercenaire", "guerrier", 18, primary=[
        pick("arme", 3, "combat_melee"), sk(1, "armurerie"), sk(1, "mentale"), sk(2, "physique"),
        sk(2, "endurance")], secondary=[
        pick("arme", 2, "combat_melee"), sk(1, "mentale"), sk(1, "endurance")]),
    _role("Lancier", "guerrier", 18, primary=[
        sk(4, "arme_hast"), sk(2, "physique"), sk(2, "reflexe"), kn(2, "Guerrière")], secondary=[
        sk(2, "arme_hast"), sk(1, "physique"), sk(1, "reflexe"), kn(1, "Guerrière")]),
    _role("Samouraï", "guerrier", 19, primary=[
        sk(3, "sabre"), sk(2, "endurance"), sk(2, "physique"), kn(1, "Guerrière"), kn(1, "Artistique"),
        st(1, "bottes", "(sabre)")]),
    _role("Templier", "guerrier", 19, primary=[
        sk(2, "bouclier"), one_of("arme", 3, "epee", "contondante"), sk(2, "endurance"), sk(1, "absorption"),
        kn(3, "Mystique")]),

    # --- Tireur ---
    _role("Arbalétrier", "tireur", 18, primary=[
        sk(5, "arbalete"), sk(2, "observation"), sk(1, "concentration"), sk(1, "mentale")]),
    _role("Archer", "tireur", 19, primary=[
        sk(5, "arc"), sk(1, "concentration"), sk(3, "observation"), st(1, "bottes", "(arc)")], secondary=[
        sk(3, "arc"), sk(1, "observation"), st(1, "bottes", "(arc)")]),
    _role("Pistolero", "tireur", 19, primary=[
        sk(5, "pistolet"), sk(2, "manipulation"), sk(1, "concentration"), kn(1, "Technologique"),
        st(1, "bottes", "(pistolet)")]),
    _role("Frondeur", "tireur", 19, primary=[
        one_of("arme", 4, "petit_projectile", "arme_exotique_distance"), sk(2, "esquive"), sk(2, "discretion"),
        sk(1, "observation"), st(1, "bottes", "(compétence de combat à distance au choix)")], secondary=[
        one_of("arme", 2, "petit_projectile", "arme_exotique_distance"), sk(1, "esquive"), sk(1, "discretion"),
        st(1, "bottes", "(compétence de combat à distance au choix)")]),

    # --- Artilleuse ---
    _role("Canonnière", "artilleuse", 19, primary=[
        sk(5, "canon"), sk(2, "manipulation"), sk(1, "endurance"), kn(1, "Guerrière"), kn(2, "Technologique")],
        secondary=[sk(3, "canon"), sk(1, "manipulation"), kn(1, "Guerrière")]),
    _role("Spécialiste en explosif", "artilleuse", 19, primary=[
        sk(4, "chimie"), sk(2, "manipulation"), sk(1, "construction"), kn(1, "Technologique"), sk(2, "discretion")],
        secondary=[sk(2, "chimie"), sk(1, "manipulation"), sk(1, "discretion")]),
    _role("Spécialiste obsidional", "artilleuse", 19, primary=[
        sk(4, "engin"), sk(1, "concentration"), sk(1, "deduction"), sk(1, "construction"), kn(3, "Guerrière"),
        kn(2, "Technologique")]),

    # --- Assassin ---
    _role("Empoisonneur", "assassin", 19, primary=[
        sk(5, "chimie"), sk(2, "arme_exotique_distance"), sk(2, "discretion"), kn(1, "Anatomique")]),
    _role("Ninja", "assassin", 19, primary=[
        sk(3, "discretion"), sk(4, "petit_projectile"), sk(1, "saut"), st(3, "bottes")], secondary=[
        sk(1, "discretion"), sk(2, "petit_projectile"), sk(1, "saut"), st(1, "bottes")]),
    _role("Éventreur", "assassin", 19, primary=[
        sk(2, "intimidation"), sk(4, "courte_lame"), sk(1, "petit_projectile"), sk(1, "equilibre"),
        sk(1, "mentale"), kn(1, "Anatomique")], secondary=[
        sk(3, "courte_lame"), sk(1, "equilibre"), kn(1, "Anatomique")]),

    # --- Tank ---
    _role("Bélier", "tank", 19, primary=[
        sk(2, "physique"), sk(2, "endurance"), sk(3, "contondante"), sk(2, "engin"), kn(1, "Technologique")]),
    _role("Berserk", "tank", 19, primary=[
        sk(1, "physique"), sk(3, "endurance"), sk(1, "mentale"), one_of("arme", 4, "hache", "main_nue"),
        st(1, "bottes", "(hache ou main nue)")], secondary=[
        sk(2, "endurance"), one_of("arme", 2, "hache", "main_nue"), st(1, "bottes", "(hache ou main nue)")]),
    _role("Cuirassé", "tank", 18, primary=[
        sk(2, "physique"), sk(2, "pathologique"), sk(5, "bouclier")], secondary=[
        sk(1, "physique"), sk(1, "pathologique"), sk(2, "bouclier")]),
    _role("Sentinelle", "tank", 19, primary=[
        sk(2, "observation"), sk(1, "reflexe"), sk(1, "bouclier"), st(1, "bottes", "(bouclier)"),
        sk(2, "physique"), sk(3, "endurance")]),

    # --- Religieux ---
    _role("Adepte", "religieux", 19, primary=[
        sk(2, "absorption"), kn(1, "Mystique"), sk(1, "memoire"), sk(1, "contondante"), st(1, "dieux"),
        st(11, "codes"), st(3, "piete"), st(30, "mana")], secondary=[
        sk(1, "absorption"), kn(1, "Mystique"), st(1, "dieux"), st(11, "codes"), st(2, "piete"), st(15, "mana")]),
    _role("Ermite", "religieux", 19, primary=[
        sk(4, "absorption"), sk(2, "mentale"), sk(1, "endurance"), kn(2, "Biologique"), kn(2, "Mystique"),
        sk(1, "concentration"), st(2, "dieux"), st(36, "codes", "(18 par dieu)"), st(4, "piete"), st(45, "mana")]),
    _role("Exorciste", "religieux", 18, primary=[
        st(2, "magic"), sk(1, "absorption"), kn(2, "Mystique"), kn(2, "Magique"),
        st(1, "langues", "(runique ; la langue du tronc commun n'est pas utilisable en tant que religieux)",
           imposed=["Runique"]),
        st(1, "dieux"), st(14, "codes"), st(3, "piete"), sk(2, "annihilation"), st(30, "mana")]),
    _role("Gourou", "religieux", 19, primary=[
        sk(2, "absorption"), kn(3, "Mystique"), sk(4, "argumentation"), sk(1, "intimidation"), st(1, "dieux"),
        st(16, "codes"), st(4, "piete"), st(30, "mana")]),
    _role("Héraut", "religieux", 19, primary=[
        sk(1, "absorption"), kn(2, "Mystique"), kn(1, "Culturelle"), sk(1, "observation"), sk(3, "orientation"),
        sk(3, "argumentation"), st(1, "dieux"), st(20, "codes"), st(5, "piete"), st(60, "mana")]),
    _role("Moine", "religieux", 19, primary=[
        sk(2, "absorption"), sk(1, "mentale"), sk(2, "medecine"), sk(1, "concentration"), kn(2, "Mystique"),
        kn(2, "Astronomique"), sk(1, "construction"), st(1, "dieux"), st(17, "codes"), st(5, "piete"),
        st(30, "mana")], secondary=[
        sk(1, "absorption"), sk(1, "medecine"), sk(1, "concentration"), kn(1, "Mystique"), kn(1, "Astronomique"),
        st(1, "dieux"), st(17, "codes"), st(4, "piete"), st(30, "mana")]),

    # --- Chasseur ---
    _role("Traqueuse", "chasseur", 18, primary=[
        sk(1, "arc"), sk(2, "courte_lame"), sk(2, "course"), sk(1, "endurance"), sk(1, "observation"),
        sk(1, "dressage"), st(1, "chiens")]),
    _role("Chasseur-cueilleur", "chasseur", 19, primary=[
        sk(2, "orientation"), sk(2, "medecine"), sk(2, "manipulation"), sk(2, "cuisine"), kn(2, "Biologique"),
        kn(1, "Géographique")], secondary=[
        sk(1, "orientation"), sk(2, "medecine"), sk(1, "cuisine"), kn(1, "Biologique")]),
    _role("Pisteur", "chasseur", 19, primary=[
        sk(1, "course"), sk(1, "discretion"), sk(1, "endurance"), sk(5, "observation"), sk(1, "orientation"),
        kn(1, "Géographique")], secondary=[
        sk(1, "discretion"), sk(1, "endurance"), sk(2, "observation"), kn(1, "Géographique")]),

    # --- Éleveur ---
    _role("Fauconnier", "eleveur", 19, primary=[
        sk(2, "dressage"), sk(2, "soulevement"), sk(2, "observation"), sk(2, "reflexe"), st(3, "oiseaux")],
        secondary=[sk(1, "dressage"), sk(2, "observation"), st(2, "oiseaux")]),
    _role("Dragonnier", "eleveur", 19, primary=[
        st(1, "magic"), spread("magie", 2, "magie"), sk(3, "dressage"), sk(2, "conjuration"), kn(2, "Magique"),
        st(1, "dragons")]),
    _role("Charmeur", "eleveur", 19, primary=[
        sk(4, "dressage"), sk(1, "musique"), sk(2, "intimidation"), kn(2, "Biologique"), st(1, "creatures_magiques")]),
    _role("Compagnon", "eleveur", 19, primary=[
        sk(2, "dressage"), sk(1, "psychologie"), sk(1, "medecine"), sk(1, "mentale"), sk(2, "observation"),
        kn(2, "Magique"), kn(2, "Biologique"), st(1, "familiers")]),
    _role("Dresseur", "eleveur", 18, primary=[
        sk(5, "dressage"), one_of("arme", 1, "arme_exotique_melee", "arme_exotique_distance"), st(2, "fauves")]),
    _role("Palefrenier", "eleveur", 19, primary=[
        sk(3, "dressage"), sk(1, "medecine"), sk(1, "psychologie"), sk(1, "manipulation"), kn(1, "Anatomique"),
        st(2, "montures")], secondary=[sk(2, "dressage"), sk(1, "psychologie"), st(1, "montures")]),

    # --- Bâtisseuse ---
    _role("Architecte", "batisseuse", 19, primary=[
        sk(1, "concentration"), sk(1, "argumentation"), sk(1, "art_plastique"), sk(5, "construction"),
        kn(3, "Historique")]),
    _role("Forgeron", "batisseuse", 20, primary=[
        sk(1, "endurance"), sk(1, "art_plastique"), sk(5, "armurerie"), kn(3, "Technologique"), sk(1, "soulevement")],
        secondary=[sk(1, "endurance"), sk(3, "armurerie"), kn(1, "Technologique")]),
    _role("Technicien", "batisseuse", 19, primary=[
        sk(2, "engin"), sk(2, "concentration"), sk(2, "deduction"), sk(2, "construction"), kn(3, "Technologique")],
        secondary=[sk(1, "engin"), sk(1, "concentration"), sk(1, "deduction"), kn(3, "Technologique")]),

    # --- Guérisseur ---
    _role("Apothicaire", "guerisseur", 19, primary=[
        kn(5, "Biologique"), sk(2, "chimie"), sk(2, "cuisine"), sk(1, "medecine"), sk(2, "observation")]),
    _role("Médecin", "guerisseur", 19, primary=[
        sk(5, "medecine"), sk(2, "psychologie"), sk(1, "manipulation"), kn(3, "Anatomique")], secondary=[
        sk(3, "medecine"), sk(1, "psychologie"), kn(1, "Anatomique")]),
    _role("Hydrothérapeute", "guerisseur", 19, primary=[
        sk(3, "medecine"), kn(1, "Magique"), kn(2, "Mystique"), sk(1, "chimie"), sk(2, "psychologie"),
        sk(1, "sorcellerie"), sk(1, "manipulation")]),
    _role("Médic", "guerisseur", 19, primary=[
        sk(2, "medecine"), kn(1, "Guerrière"), kn(2, "Anatomique"), sk(3, "psychologie"), sk(2, "manipulation"),
        sk(1, "soulevement")], secondary=[
        sk(1, "medecine"), kn(1, "Anatomique"), sk(2, "psychologie"), sk(1, "manipulation")]),

    # --- Voleur ---
    _role("Espion", "voleur", 18, primary=[
        sk(1, "discretion"), sk(1, "manipulation"), sk(3, "imposture"), sk(1, "argumentation"), sk(2, "observation"),
        sk(1, "deduction"), kn(1, "Linguistique")], secondary=[
        sk(1, "discretion"), sk(1, "imposture"), sk(1, "observation"), sk(1, "deduction"), kn(1, "Linguistique")]),
    _role("Cambrioleur", "voleur", 18, primary=[
        sk(3, "course"), sk(3, "manipulation"), sk(1, "observation"), sk(1, "chimie")]),
    _role("Pickpocket", "voleur", 19, primary=[
        sk(1, "discretion"), sk(2, "course"), sk(1, "esquive"), sk(2, "manipulation"), sk(1, "observation"),
        sk(1, "imposture"), kn(1, "Culturelle")], secondary=[
        sk(1, "discretion"), sk(1, "course"), sk(1, "esquive"), sk(1, "manipulation"), kn(1, "Culturelle")]),

    # --- Orateur ---
    _role("Diplomate", "orateur", 19, primary=[
        sk(4, "argumentation"), sk(2, "psychologie"), sk(1, "observation"), kn(2, "Culturelle"), kn(1, "Historique"),
        kn(2, "Linguistique")]),
    _role("Musicien", "orateur", 19, primary=[
        sk(1, "argumentation"), sk(2, "memoire"), sk(5, "musique"), sk(1, "art_plastique"), kn(1, "Artistique")],
        secondary=[sk(1, "memoire"), sk(3, "musique"), kn(1, "Artistique")]),
    _role("Ménestrel", "orateur", 19, primary=[
        sk(1, "imposture"), sk(2, "argumentation"), sk(2, "memoire"), sk(3, "musique"), kn(1, "Artistique"),
        kn(1, "Culturelle"), kn(1, "Historique")], secondary=[
        sk(1, "argumentation"), sk(2, "memoire"), sk(1, "musique"), kn(1, "Culturelle")]),
    _role("Comédien", "orateur", 20, primary=[
        sk(6, "imposture"), sk(1, "deduction"), sk(1, "memoire"), sk(1, "argumentation"), kn(1, "Historique"),
        kn(2, "Linguistique")]),

    # --- Rôles secondaires uniquement ---
    _role("Scientifique", "scientifique", secondary=[
        sk(2, "observation"), sk(1, "concentration"), sk(2, "deduction"), sk(1, "memoire"), sk(1, "chimie"),
        kn_choice("connaissance", 4)]),
    _role("Marin", "marin", secondary=[
        sk(1, "soulevement"), sk(2, "nage"), sk(1, "equilibre"), sk(1, "manipulation"), sk(4, "navigation")]),
    _role("Marchand", "marchand", secondary=[
        sk(5, "argumentation"), sk(3, "psychologie"), sk(1, "observation"), kn(1, "Culturelle")]),
    _role("Cuisinier", "cuisinier", secondary=[
        sk(5, "cuisine"), sk(1, "observation"), kn(1, "Biologique"), sk(2, "manipulation")]),
    _role("Artisane", "artisane", secondary=[
        sk(5, "art_plastique"), sk(1, "construction"), sk(1, "manipulation"), sk(1, "armurerie"),
        kn(3, "Artistique")]),

    # --- Rôles exceptionnels : uniquement à la création, ou sur élan scénaristique (voir le MJ) ---
    _role("Princesse", "exceptionnel", primary=[], description=(
        "Gagne 100 sous à chaque début de quête (pouvoir exceptionnel). "
        "Bonus +2 pour toute compétence sociale avec son espèce. "
        "+15 relations dans une ville au choix. +200 sous. Connue par tous (de près ou de loin).")),
])
