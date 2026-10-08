"""Traits de personnage, transcrits depuis refdoc/Traits de personnage.pdf.

Un trait **bonus** coûte des PC, un trait **malus** en rapporte (« Vous pouvez également changer le
nombre de PC de base en acquérant des traits », Création de personnage p.4). Les traits sont à
décider avec le MJ ; leur nombre n'est pas limité.

Un trait choisi (`TraitPick`) peut préciser :
- une variante, quand le trait a plusieurs coûts (Bénédiction de Terlema 1/2/3 PC, Estropié...) ;
- des choix (un attribut, un groupe de compétence, des compétences, une espèce) ;
- une note libre (objet de la phobie, toxine...).

`trait_effects` calcule ce que les traits changent à la création : PC, points d'attribut, limites
d'attributs, compétences inaccessibles, sous, mana, bonus des animaux totems. Les interprétations
du document sont dans refdoc/infos.md, les erreurs relevées dans refdoc/fix.md.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.rules.data import ALL_SKILLS, SKILL_GROUPS, SPECIES_LIMITS, Attribute, Species
from app.schemas import TraitPick


class AttributeLimit(BaseModel):
    min: int
    max: int
    superhuman: int


class TraitVariant(BaseModel):
    id: str
    label: str
    pc: int = Field(description="Effet sur les PC disponibles : négatif pour un bonus (il coûte), positif pour un malus.")
    choice_count: int | None = Field(None, description="Nombre de choix pour cette variante, s'il diffère de `choice.count`.")


class TraitChoice(BaseModel):
    """Ce que le joueur choisit pour ce trait. `options` vide : tout le catalogue de `target`."""

    target: Literal["attribute", "skill_group", "skill", "species"]
    label: str
    count: int = 1
    options: list[str] = []
    # Libellés des options qui ne sont pas dans les catalogues (« combat » = les 3 groupes de combat).
    labels: dict[str, str] = {}


class TraitDef(BaseModel):
    label: str
    kind: Literal["bonus", "malus"]
    effect: str
    automated: str | None = Field(None, description="Ce que l'application calcule ou vérifie. Absent : effet descriptif.")
    variants: list[TraitVariant]
    choice: TraitChoice | None = None
    note: str | None = Field(None, description="Intitulé d'une précision libre à saisir (objet de la phobie...).")
    repeatable: bool = False


def _one(pc: int) -> list[TraitVariant]:
    return [TraitVariant(id="base", label=f"{pc:+d} PC", pc=pc)]


COMBAT = "combat"
COMBAT_GROUPS = ["combat_distance", "combat_artillerie", "combat_melee"]
# Sociopathe de haut niveau : désactivé, voir le trait commenté plus bas.
# SOCIOPATH_SKILLS = ["argumentation", "imposture", "intimidation", "psychologie"]
# Total des maximums d'attributs de chaque espèce, conservé par un Hybride.
HYBRID_MAX_TOTAL = 53
DEMON_MANA = 100

TRAITS: dict[str, TraitDef] = {
    # --- Bonus ---
    "ambidextre": TraitDef(
        label="Ambidextre", kind="bonus", variants=_one(-2),
        effect="Avec la botte Duo d'armes, vous pouvez utiliser les cartes de vos armes à la suite ; "
               "les restrictions de la botte ne vous affectent pas."),
    "appele_outre_monde": TraitDef(
        label="Appelé par l'outre-monde", kind="bonus", note="Créature liée",
        variants=[TraitVariant(id="lien", label="Lien (-2 PC)", pc=-2),
                  TraitVariant(id="pouvoirs", label="Lien et pouvoirs (-3 PC)", pc=-3)],
        effect="Vous êtes lié à une créature scellée dans le ska : vous communiquez par télépathie et connaissez "
               "le sort pour l'invoquer (rituel ou prérequis à voir avec le MJ). La créature ne vous veut pas "
               "forcément du bien. Pour 1 PC de plus, vous pouvez utiliser certains de ses pouvoirs, contre un "
               "prix fixé par le MJ."),
    "aptitude": TraitDef(
        label="Aptitude", kind="bonus", variants=_one(-1),
        choice=TraitChoice(target="attribute", label="Attribut"),
        effect="À la création, un attribut peut être monté jusqu'à la limite surhumaine.",
        automated="Le maximum de l'attribut choisi devient sa limite surhumaine."),
    "attribut_exceptionnel": TraitDef(
        label="Attribut exceptionnel", kind="bonus", variants=_one(-1),
        choice=TraitChoice(target="attribute", label="Attribut (parmi ceux au maximum le plus bas)"),
        effect="Votre attribut au maximum le plus bas gagne 3 à son maximum (au choix parmi ceux qui ont le "
               "maximum le plus faible).",
        automated="+3 au maximum de l'attribut choisi, qui doit être parmi ceux au maximum le plus bas."),
    "bachelier": TraitDef(
        label="Bachelier", kind="bonus", variants=_one(-1),
        effect="Vous commencez avec un nœud de départ d'un arbre de progression en accord avec vos rôles."),
    "benediction_terlema": TraitDef(
        label="Bénédiction de Terlema", kind="bonus",
        variants=[TraitVariant(id="1", label="+1 point d'attribut (-1 PC)", pc=-1),
                  TraitVariant(id="2", label="+3 points d'attribut (-2 PC)", pc=-2),
                  TraitVariant(id="3", label="+5 points d'attribut (-3 PC)", pc=-3)],
        effect="Né avec l'aide d'adeptes de Terlema, vous gagnez 1, 3 ou 5 points d'attribut supplémentaires.",
        automated="Points d'attribut à répartir augmentés de 1, 3 ou 5."),
    "bricoleur": TraitDef(
        label="Bricoleur", kind="bonus", variants=_one(-2),
        effect="Pour un combo réussi de jets d'observation, de concentration et de construction (chaque jet réussi "
               "donne +6 au suivant), vous fabriquez en un rien de temps un objet technique fonctionnel dont les "
               "mécanismes n'excèdent pas vos connaissances. À chaque utilisation (dès la première), 1 chance sur 6 "
               "qu'il casse. Vous pouvez négocier avec le MJ des jets de connaissance technologique pour découvrir "
               "de nouveaux mécanismes (au moins un par quête)."),
    "charismatique": TraitDef(
        label="Charismatique", kind="bonus", variants=_one(-1),
        effect="Les créatures civilisées sont naturellement bien disposées envers vous : +12 à vos interactions sociales."),
    "demi_demon": TraitDef(
        label="Demi-démon / demi-vengeur", kind="bonus",
        variants=[TraitVariant(id="demon", label="Demi-démon (-3 PC)", pc=-3),
                  TraitVariant(id="vengeur", label="Demi-vengeur (-3 PC)", pc=-3)],
        effect="Pas de limite d'attributs après la création. +100 de mana ; l'absorption est inutile dans Mannheim "
               "et la régénération du mana est divisée par deux ; absorption doublée dans le monde de la moitié "
               "(Avängheim ou Dömonheim). -2 mana par jour. Ne subit pas le mal des dimensions, sauf sans mana "
               "(version maximale : -36 à tous les jets, 5 dégâts pathologiques par heure). Style distinctif : un "
               "membre bleu (démon) ou rouge (vengeur). Héritage : sacrifier 1 point d'un attribut à Max+1 pour un "
               "pouvoir (au plus un) : brise-cuirasse, maëlstrom, passe-muraille (démon) ; œil omniscient, "
               "fer vengeur, nitescence (vengeur).",
        automated="+100 au mana max (en plus des rôles et des PCP mis en Mana)."),
    "dur_a_cuire": TraitDef(
        label="Dur à cuire", kind="bonus", variants=_one(-1), effect="1 d'armure naturelle."),
    "guerison_rapide": TraitDef(
        label="Guérison rapide", kind="bonus", variants=_one(-1),
        effect="Après un long repos, vous soignez 1 point de dégâts physiques supplémentaire (régénération naturelle)."),
    "hybride": TraitDef(
        label="Hybride", kind="bonus", variants=_one(-1),
        choice=TraitChoice(target="species", label="Seconde espèce"),
        effect="Vos limites d'attributs sont la moyenne de celles de deux espèces. Arrondis au choix, tant que le "
               "total des maximums vaut 53 ; minimum = maximum - 5 ; limite surhumaine = maximum + 3.",
        automated="Limites d'attributs moyennées entre les deux espèces, arrondis choisis par le joueur."),
    "hyperhidrose_manafique": TraitDef(
        label="Hyperhidrose manafique", kind="bonus", variants=_one(-1),
        effect="Uniquement avec une réserve de mana. Vos jets d'absorption se font avec 4D6 supplémentaires, mais "
               "on vous repère beaucoup plus facilement avec perception (+15), sauf si votre réserve est à 0.",
        automated="Exige un mana maximum supérieur à 0."),
    "immunite_naturelle": TraitDef(
        label="Immunité naturelle", kind="bonus", note="Toxine, poison ou maladie", repeatable=True,
        variants=[TraitVariant(id="faible", label="Virulence 4 ou moins (-1 PC)", pc=-1),
                  TraitVariant(id="forte", label="Virulence plus forte (-2 PC)", pc=-2)],
        effect="Vous êtes immunisé à une toxine, un poison ou une maladie de virulence 4 ou moins ; 1 PC de plus "
               "pour une plus puissante."),
    "rentier": TraitDef(
        label="Rentier", kind="bonus", variants=_one(-1), effect="Vous gagnez 50 sous au début de chaque quête."),
    "resistance_douleur": TraitDef(
        label="Résistance à la douleur", kind="bonus", variants=_one(-2),
        effect="La plupart des effets scénaristiques de torture ou de douleur ne vous affectent pas. Moniteur "
               "physique vide, vous restez conscient et pouvez agir (vous subissez quand même les blessures)."),
    "resistance_magie": TraitDef(
        label="Résistance à la magie", kind="bonus", variants=_one(-1),
        effect="Vous ne pouvez pas avoir de Magie. Les jets de magie qui vous ciblent (un soin direct, mais pas une "
               "potion bue) ont un malus de 20, et vous DEVEZ résister à leurs effets (hors dégâts) par un jet de "
               "résistance mentale sans point d'endurance. Incompatible avec Incompétent ! en Compétence magique.",
        automated="Magie = 0 ; incompatible avec Incompétent ! en Compétence magique."),
    "resistance_pathogenes": TraitDef(
        label="Résistance aux pathogènes", kind="bonus", variants=_one(-1), effect="1 d'armure pathologique."),
    # Sociopathe de haut niveau : désactivé en attendant une décision (refdoc/fix.md). Le document ne dit pas
    # quelles compétences deviennent inaccessibles, cite « Persuasion » (absente de la fiche), et le trait le
    # plus cher (-2 PC) laisse plus de compétences accessibles (4) que le moins cher (2).
    # "sociopathe": TraitDef(
    #     label="Sociopathe de haut niveau", kind="bonus",
    #     variants=[TraitVariant(id="2", label="2 compétences accessibles (-1 PC)", pc=-1, choice_count=2),
    #               TraitVariant(id="4", label="4 compétences accessibles (-2 PC)", pc=-2, choice_count=4)],
    #     choice=TraitChoice(target="skill", label="Compétences sociales accessibles", count=2, options=SOCIOPATH_SKILLS),
    #     effect="Les compétences sociales vous sont inaccessibles, à l'exception de 2 (ou 4) parmi Argumentation, "
    #            "Imposture, Intimidation et Psychologie.",
    #     automated="Compétences du groupe Sociale non choisies : ni PCP ni PCR."),
    "stigmates_divins": TraitDef(
        label="Stigmates divins", kind="bonus", variants=_one(-2),
        effect="Une ou plusieurs divinités veillent sur vous : +4 aux paliers de gains de piété des jets de faveur."),
    "tripes": TraitDef(
        label="Tripes", kind="bonus", variants=_one(-1),
        effect="1 d'armure mentale contre les dégâts des ennemis que vous voyez."),

    # --- Malus ---
    "dependant": TraitDef(
        label="Dépendant", kind="malus", variants=_one(1), note="Dépendance",
        effect="Comme la souillure d'âme « Dépendant », mais ne se soigne pas comme une souillure d'âme."),
    "addict": TraitDef(
        label="Addict", kind="malus", variants=_one(1), note="Addiction",
        effect="Comme la souillure d'âme « Addict », mais ne se soigne pas comme une souillure d'âme."),
    "allergique": TraitDef(
        label="Allergique", kind="malus", variants=_one(1),
        effect="Brisé en moniteur pathologique, vous êtes vaincu par le pollen et les poils de chat : chaque action "
               "physique inflige 1 endurance, -10 aux actions qui demandent la vue, et 1 chance sur 4 qu'une action "
               "soit remplacée par un éternuement (tiré avant tout autre jet)."),
    "asocial": TraitDef(
        label="Asocial", kind="malus", variants=_one(1),
        effect="Aucun point dans les compétences du groupe Sociale, pas même ceux des rôles (sauf Dressage), et "
               "votre attribut Social reste au minimum. Augmenter les compétences sociales coûte le double d'XP. "
               "Incompatible avec Incompétent ! en Sociale, qui fait déjà la même chose.",
        automated="Compétences de Sociale sauf Dressage : ni PCP ni PCR (les points des rôles sont ignorés) ; Social "
                  "au minimum de l'espèce ; incompatible avec Incompétent ! en Sociale."),
    "chauve": TraitDef(
        label="Chauve", kind="malus", variants=_one(1),
        effect="1 point de dégâts mentaux quand on évoque votre crâne, auquel vous pouvez résister gratuitement "
               "(sans endurance ni action)."),
    "criniere_etincelante": TraitDef(
        label="Crinière étincelante", kind="malus", variants=_one(1),
        effect="Pour les espèces sans cheveux : quand on évoque votre crinière, réussissez un jet de résistance "
               "mentale ou vous êtes distrait et vous en vantez."),
    "criminel": TraitDef(
        label="Criminel", kind="malus", variants=_one(1),
        effect="Vous commencez en prison, pour longtemps. Votre argent vous attend dans votre planque : pas d'accès "
               "au magasin de début de quête."),
    "estropie": TraitDef(
        label="Estropié", kind="malus", repeatable=True,
        variants=[TraitVariant(id="pied", label="Un pied (+1 PC)", pc=1),
                  TraitVariant(id="main", label="Une main (+1 PC)", pc=1),
                  TraitVariant(id="jambe", label="Une jambe (+2 PC)", pc=2),
                  TraitVariant(id="bras", label="Un bras (+2 PC)", pc=2)],
        effect="Pied : -15 aux jets de Déplacement (sauf Navigation). Main : pas d'équipement à deux mains ; -10 en "
               "escalade, manipulation, crochetage et soulèvement. Jambe : -20 aux jets de Déplacement et -3 au "
               "maximum d'Agilité. Bras : pas d'équipement à deux mains ; -15 en escalade, manipulation, crochetage "
               "et soulèvement, et -3 au maximum de Force.",
        automated="Jambe : -3 au maximum d'Agilité. Bras : -3 au maximum de Force."),
    "faible_constitution": TraitDef(
        label="Faible constitution", kind="malus", variants=_one(2),
        effect="Vous ne pouvez pas faire de jet de résistance physique ou pathologique pour encaisser des dégâts."),
    "sans_le_sou": TraitDef(
        label="Sans le sou", kind="malus", variants=_one(1),
        effect="Vous commencez avec 0 sou, quelle que soit la priorité choisie pour les sous.",
        automated="Sous disponibles à la création : 0."),
    "hostilite_esprits": TraitDef(
        label="Hostilité des esprits", kind="malus", variants=_one(1),
        effect="Les esprits vous haïssent et vous attaquent à vue. Pas d'accès aux bonus des animaux totems ; "
               "impossible de converser avec les animus, esprits élémentaires, âmes défuntes et entités spirituelles.",
        automated="Les bonus des animaux totems ne sont pas comptés."),
    "immunodeficience": TraitDef(
        label="Immunodéficience", kind="malus", variants=_one(1),
        effect="Votre moniteur pathologique est définitivement réduit de 2.",
        automated="Max du moniteur pathologique réduit de 2."),
    "incompetent": TraitDef(
        label="Incompétent !", kind="malus", variants=_one(2),
        choice=TraitChoice(
            target="skill_group", label="Groupe inaccessible",
            options=[COMBAT] + [g for g in SKILL_GROUPS if g not in COMBAT_GROUPS],
            labels={COMBAT: "Combat (à distance, artillerie et mêlée)"}),
        effect="Un groupe de compétences vous est inaccessible : aucun point dans ses compétences, qui restent à 0 "
               "même via les rôles. Le combat compte comme un seul groupe (à distance, artillerie et mêlée). "
               "En Compétence magique, l'Absorption reste accessible si vous avez une échelle de piété, et le mana "
               "n'est pas affecté. Incompatible avec Asocial (Sociale) et Résistance à la magie (Compétence magique).",
        automated="Compétences du groupe : ni PCP ni PCR (les points des rôles sont ignorés)."),
    "insomnie": TraitDef(
        label="Insomnie", kind="malus", variants=_one(1),
        effect="À chaque repos, 1D4 : sur un 1, vous ne récupérez aucun point de moniteur et subissez 1 dégât mental."),
    "paralysie_combat": TraitDef(
        label="Paralysie en combat", kind="malus", variants=_one(2),
        effect="Au premier tour de chaque combat, votre initiative est réduite de moitié (perdez vos actions en conséquence)."),
    "phobique": TraitDef(
        label="Phobique", kind="malus", variants=_one(2), note="Objet de la phobie",
        effect="Quand vous voyez l'objet de votre phobie, vous subissez 3 dégâts mentaux (résistance gratuite). "
               "Brisé par ces dégâts : états peur et terreur."),
    "revenant": TraitDef(
        label="Revenant", kind="malus", variants=_one(3),
        effect="Ramené d'entre les morts par un nécromancien : vos moniteurs de condition perdent 1/4 de leur "
               "valeur maximale (au moins 2).",
        automated="Chaque moniteur de condition perd 1/4 de son max (arrondi en dessous, au moins 2). Pas le mana."),
}


class TraitEffects(BaseModel):
    """Ce que les traits d'un personnage changent à la création."""

    pc: int = Field(0, description="PC gagnés (malus) moins PC dépensés (bonus).")
    attribute_points: int = Field(0, description="Points d'attribut en plus (Bénédiction de Terlema).")
    attribute_limits: dict[Attribute, AttributeLimit] | None = Field(
        None, description="Limites d'attributs à la création, traits compris. Absent sans espèce jouable.")
    lowest_max_attributes: list[Attribute] = Field([], description="Choix possibles pour Attribut exceptionnel.")
    forbidden_skills: dict[str, str] = Field({}, description="Compétences sans PCP possibles -> trait responsable.")
    role_forbidden_skills: list[str] = Field([], description="Compétences dont les PCR des rôles sont ignorés.")
    role_forbidden_groups: list[str] = Field([], description="Groupes dont les PCR des rôles sont ignorés.")
    no_magic: bool = False
    money_zero: bool = False
    no_totem_bonus: bool = False
    requires_mana: bool = False
    mana_bonus: int = Field(0, description="Mana max en plus (Demi-démon / demi-vengeur).")
    monitor_bonus: dict[str, int] = Field({}, description="Ajout au max d'un moniteur de condition (Immunodéficience : -2).")
    monitor_quarter_loss: bool = Field(False, description="Revenant : chaque moniteur de condition perd 1/4 de son max.")


def _choice_catalog(choice: TraitChoice) -> list[str]:
    if choice.options:
        return choice.options
    return {"attribute": list(Attribute), "skill_group": list(SKILL_GROUPS),
            "skill": list(ALL_SKILLS), "species": list(Species)}[choice.target]


def _hybrid_limits(a: Species, b: Species, rounded_up: list[str]) -> tuple[dict[Attribute, list[int]], str | None]:
    """Limites moyennées ; `rounded_up` : attributs dont la demi-valeur est arrondie au-dessus."""
    sums = {attr: SPECIES_LIMITS[a][attr][1] + SPECIES_LIMITS[b][attr][1] for attr in Attribute}
    # Chaque espèce totalise 53 : il y a un nombre pair de demi-valeurs, la moitié est arrondie au-dessus.
    halves = [attr for attr, s in sums.items() if s % 2]
    error = None
    if set(rounded_up) - set(halves) or len(set(rounded_up)) != len(halves) // 2:
        error = (f"Hybride : choisir {len(halves) // 2} attribut(s) arrondi(s) au-dessus parmi {', '.join(halves)}, "
                 f"pour que le total des maximums reste {HYBRID_MAX_TOTAL}.")
        rounded_up = []  # en attendant le choix : arrondi inférieur partout
    limits = {}
    for attr, s in sums.items():
        mx = s // 2 + (attr in rounded_up)
        limits[attr] = [mx - 5, mx, mx + 3]
    return limits, error


def trait_effects(picks: list[TraitPick], species: str | None, piety: int = 0) -> tuple[TraitEffects, list[tuple[str, str]]]:
    """Effets des traits, et problèmes de saisie sous la forme (champ, message).

    Les traits mal renseignés (variante ou choix invalide) comptent dans les PC mais n'ont pas d'effet."""
    fx = TraitEffects()
    issues: list[tuple[str, str]] = []
    seen: set[str] = set()
    picked: dict[str, list[tuple[TraitPick, TraitVariant, list[str]]]] = {}

    for i, pick in enumerate(picks):
        field = f"traits.{i}"
        trait = TRAITS.get(pick.key)
        if trait is None:
            issues.append((field, f"« {pick.key} » n'est pas un trait du catalogue."))
            continue
        if pick.key in seen and not trait.repeatable:
            issues.append((field, f"{trait.label} : ce trait ne peut être pris qu'une fois."))
            continue
        seen.add(pick.key)
        variants = {v.id: v for v in trait.variants}
        variant = variants.get(pick.variant or "") if len(variants) > 1 else trait.variants[0]
        if variant is None:
            issues.append((field, f"{trait.label} : choisir une variante ({', '.join(v.label for v in trait.variants)})."))
            continue
        fx.pc += variant.pc
        choices = list(pick.choices)
        if trait.choice:
            count = variant.choice_count or trait.choice.count
            catalog = _choice_catalog(trait.choice)
            if count == len(catalog):
                choices = catalog
            elif len(choices) != count or len(set(choices)) != count or any(c not in catalog for c in choices):
                issues.append((field, f"{trait.label} : choisir {count} {trait.choice.label.lower()}."))
                continue
        picked.setdefault(pick.key, []).append((pick, variant, choices))

    def has(key: str) -> bool:
        return key in picked

    def first_choice(key: str) -> str:
        return picked[key][0][2][0]

    # --- Points d'attribut et limites ---
    if has("benediction_terlema"):
        fx.attribute_points = {"1": 1, "2": 3, "3": 5}[picked["benediction_terlema"][0][1].id]
    limits: dict[Attribute, list[int]] | None = None
    if species in Species:
        limits = {attr: list(v) for attr, v in SPECIES_LIMITS[Species(species)].items()}
        if has("hybride"):
            other = first_choice("hybride")
            if other == species:
                issues.append(("traits", "Hybride : la seconde espèce doit être différente de la première."))
            else:
                limits, error = _hybrid_limits(Species(species), Species(other), picked["hybride"][0][0].rounded_up)
                if error:
                    issues.append(("traits", error))
        lowest = min(v[1] for v in limits.values())
        fx.lowest_max_attributes = [a for a, v in limits.items() if v[1] == lowest]
        if has("attribut_exceptionnel"):
            attr = Attribute(first_choice("attribut_exceptionnel"))
            if attr in fx.lowest_max_attributes:
                limits[attr][1] += 3
            else:
                issues.append(("traits", f"Attribut exceptionnel : choisir parmi {', '.join(fx.lowest_max_attributes)} "
                                         f"(maximum le plus bas, {lowest})."))
        for _, variant, _ in picked.get("estropie", []):
            if variant.id in ("jambe", "bras"):
                limits[Attribute.AGILITE if variant.id == "jambe" else Attribute.FORCE][1] -= 3
        if has("aptitude"):
            attr = Attribute(first_choice("aptitude"))
            limits[attr][1] = max(limits[attr][1], limits[attr][2])
        if has("asocial"):
            limits[Attribute.SOCIAL][1] = limits[Attribute.SOCIAL][0]
        fx.attribute_limits = {a: AttributeLimit(min=lo, max=hi, superhuman=sh) for a, (lo, hi, sh) in limits.items()}
    elif has("attribut_exceptionnel") or has("hybride"):
        issues.append(("traits", "Choisir une espèce jouable pour appliquer les traits qui modifient les limites d'attributs."))

    # --- Compétences inaccessibles ---
    def forbid(skills: list[str], label: str, roles_too: bool) -> None:
        for s in skills:
            fx.forbidden_skills.setdefault(s, label)
            if roles_too and s not in fx.role_forbidden_skills:
                fx.role_forbidden_skills.append(s)

    if has("incompetent"):
        label = TRAITS["incompetent"].label
        group = first_choice("incompetent")
        for g in COMBAT_GROUPS if group == COMBAT else [group]:
            skills = list(SKILL_GROUPS[g]["skills"])
            if g == "magie" and piety > 0:
                skills.remove("absorption")
            else:
                fx.role_forbidden_groups.append(g)
            forbid(skills, label, roles_too=True)
        if group == "sociale" and has("asocial"):
            issues.append(("traits", "Incompétent ! en Sociale est incompatible avec Asocial."))
        if group == "magie" and has("resistance_magie"):
            issues.append(("traits", "Incompétent ! en Compétence magique est incompatible avec Résistance à la magie."))
    # Sociopathe de haut niveau : désactivé (voir le trait commenté).
    # if has("sociopathe"):
    #     allowed = set(picked["sociopathe"][0][2])
    #     forbid([s for s in SKILL_GROUPS["sociale"]["skills"] if s not in allowed], TRAITS["sociopathe"].label, roles_too=True)
    if has("asocial"):
        forbid([s for s in SKILL_GROUPS["sociale"]["skills"] if s != "dressage"], TRAITS["asocial"].label, roles_too=True)

    fx.no_magic = has("resistance_magie")
    fx.money_zero = has("sans_le_sou")
    fx.no_totem_bonus = has("hostilite_esprits")
    fx.requires_mana = has("hyperhidrose_manafique")
    if has("demi_demon"):
        fx.mana_bonus = DEMON_MANA
    if has("immunodeficience"):
        fx.monitor_bonus["pathologique"] = -2
    fx.monitor_quarter_loss = has("revenant")
    return fx, issues


def expected_mana_max(role_mana: int, pool_mana: int, fx: TraitEffects) -> int:
    """Mana max à la création : rôles + réserve Mana (+ 100 pour un demi-démon / demi-vengeur)."""
    return role_mana + pool_mana + fx.mana_bonus
