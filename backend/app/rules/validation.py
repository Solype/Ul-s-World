"""Vérification d'un personnage contre les règles de création.

Les fonctions ne lèvent pas d'erreur : elles renvoient la liste des problèmes, pour qu'un
personnage puisse être sauvegardé en brouillon et complété étape par étape.

Un personnage en saisie libre (`creation_mode = free`, typiquement un monstre ou un PNJ) n'est
pas soumis aux règles de création : seule la cohérence avec le catalogue de compétences est vérifiée.

Points de compétence de rôle (PCR) :
- PNJ et monstres n'en ont pas : leurs compétences ont une seule valeur, stockée dans `pcp` ;
- pour un PJ créé selon les règles, ils sont calculés à partir des rôles et des choix du joueur
  (voir `rules/roles.py`), puis stockés. `role_points_outdated` indique que les PCR stockés ne
  correspondent plus au calcul (rôles, choix ou catalogue modifiés) : la mise à jour est volontaire.
"""

from pydantic import BaseModel

from app.rules.catalogs import CATALOGS, OPEN_CATALOGS, god_code
from app.rules.data import (
    ALL_SKILLS,
    BOTTES_PER_PC,
    PRIORITY_TABLE,
    SKILL_GROUPS,
    SKILL_LABELS,
    SKILL_POOLS,
    SPECIES_LIMITS,
    START_PC,
    Attribute,
    Species,
    group_level_cost,
)
from app.rules.role_model import RESOURCE_DEFS, RESOURCE_STATS, STATS
from app.rules.roles import RolePoints, choice_is_valid, compute_role_points
from app.rules.monsters import GATED_RESOURCES, MONSTER_TRAITS, MonsterAccess, monster_access, monster_issues
from app.rules.traits import TRAITS, TraitEffects, expected_mana_max, trait_effects
from app.schemas import CharacterBase, CharacterKind, Creation, CreationMode


class Issue(BaseModel):
    field: str
    message: str


class ValidationReport(BaseModel):
    valid: bool
    rules_checked: bool
    pc_total: int
    pc_spent: int
    attribute_points_available: int | None
    attribute_points_spent: int
    skill_group_points_available: int | None
    skill_group_points_spent: int
    money_available: int | None
    role_points: RolePoints | None = None
    role_points_outdated: bool = False
    # Effets des traits (mode règles) : limites d'attributs, compétences inaccessibles...
    trait_effects: TraitEffects | None = None
    # Monstres : ce que leurs caractéristiques leur donnent (absent pour les autres personnages).
    monster_access: MonsterAccess | None = None
    issues: list[Issue]


def _granted_by(field: str, key: str) -> str:
    """Caractéristiques qui donneraient cet élément (« Mobile »), pour expliquer un refus."""
    labels = [t.label for t in MONSTER_TRAITS.values()
              if key in getattr(t, field) or (field == "skills" and ALL_SKILLS.get(key) in t.skill_groups)]
    return " ou ".join(labels) or "aucune caractéristique"


def _monster_access_issues(c: CharacterBase, access: MonsterAccess) -> list[tuple[str, str]]:
    """Points mis dans ce qu'un monstre n'a pas (attribut, compétence, magie...)."""
    issues = []
    for attr, value in c.attributes.items():
        if value and attr not in access.attributes:
            issues.append((f"attributes.{attr}", f"{attr} : ce monstre n'a pas cet attribut (il faut {_granted_by('attributes', attr)})."))
    for group, score in c.skill_groups.items():
        if group in SKILL_GROUPS and (score.pcp or score.pcr) and group not in access.skill_groups:
            issues.append((f"skill_groups.{group}", f"{SKILL_GROUPS[group]['label']} : groupe inaccessible "
                                                    f"(il faut {_granted_by('skill_groups', group)})."))
    for name, score in c.skills.items():
        if name in ALL_SKILLS and score.total and name not in access.skills:
            issues.append((f"skills.{name}", f"{SKILL_LABELS[name]} : compétence inaccessible (il faut {_granted_by('skills', name)})."))
    for name, value in c.pools.items():
        if name in SKILL_POOLS and value and name not in access.pools:
            issues.append((f"pools.{name}", f"{SKILL_POOLS[name]['label']} : inaccessible à ce monstre."))
    if not access.magic:
        magic = MONSTER_TRAITS["doue_magiquement"].label
        if c.magic:
            issues.append(("magic", f"Magie : il faut être {magic}."))
        if c.mana.max or c.mana.current:
            issues.append(("mana", f"Mana : il faut être {magic}."))
    for key in access.forbidden_resources:
        if (c.bottes if key == "bottes" else c.resources.get(key)) or c.selections.get(key):
            field = "bottes" if key == "bottes" else f"resources.{key}"
            why = f"il faut {_granted_by('resources', key)}" if key in GATED_RESOURCES else "un monstre n'en a pas"
            issues.append((field, f"{RESOURCE_DEFS[key].label} : {why}."))
    if not access.knowledges and any(c.knowledges.values()):
        issues.append(("knowledges", "Connaissances : il faut être Intelligent."))
    return issues


def validate_character(c: CharacterBase) -> ValidationReport:
    issues: list[Issue] = []

    def issue(field: str, message: str) -> None:
        issues.append(Issue(field=field, message=message))

    # --- Points de rôle (PCR) : PNJ et monstres n'en ont pas ---
    if c.kind != CharacterKind.PJ:
        for prefix, scores in (("skill_groups", c.skill_groups), ("skills", c.skills)):
            for name, score in scores.items():
                if score.pcr:
                    issue(f"{prefix}.{name}", "Les PNJ et les monstres n'ont pas de points de compétence de rôle (PCR).")

    # --- Catalogue : s'applique à tous les personnages ---
    for group in c.skill_groups:
        if group not in SKILL_GROUPS:
            issue(f"skill_groups.{group}", "Groupe de compétence inconnu.")
    for name in c.skills:
        if name not in ALL_SKILLS:
            issue(f"skills.{name}", "Compétence inconnue.")
    for name in c.pools:
        if name not in SKILL_POOLS:
            issue(f"pools.{name}", "Réserve inconnue.")

    if c.mana.current > c.mana.max:
        issue("mana", f"Mana actuel ({c.mana.current}) supérieur au maximum ({c.mana.max}).")

    # --- Ressources : choix ouverts (sorts, langues...), codes, piété ---
    for key in c.selections:
        if key not in RESOURCE_DEFS or RESOURCE_DEFS[key].kind == "score":
            issue(f"selections.{key}", f"« {key} » ne donne pas accès à des choix.")
    for key, res in RESOURCE_DEFS.items():
        allowance = c.bottes if key == "bottes" else c.resources.get(key, 0)
        items = c.selections.get(key, [])
        if key in CATALOGS:
            labels = {e.label for e in CATALOGS[key]}
            names = [i.name for i in items]
            for name in names:
                if name not in labels and key not in OPEN_CATALOGS:
                    issue(f"selections.{key}", f"{res.label} : « {name} » n'est pas dans le catalogue.")
            for name in sorted({n for n in names if names.count(n) > 1}):
                issue(f"selections.{key}", f"{res.label} : « {name} » choisi plusieurs fois.")
        if res.kind == "count":
            if len(items) > allowance:
                issue(f"selections.{key}", f"{res.label} : {len(items)} choisis pour {allowance} autorisés.")
            elif len(items) < allowance:
                issue(f"selections.{key}", f"{res.label} : encore {allowance - len(items)} à choisir.")
        elif key == "codes":
            # Codes : pris chez les dieux choisis, leur valeur vient du catalogue.
            gods = {i.name for i in c.selections.get("dieux", [])}
            total, seen = 0, set()
            for i in items:
                code = god_code(i.god, i.name) if i.god in gods else None
                if code is None:
                    where = f"de « {i.god} »" if i.god in gods else "d'un dieu choisi"
                    issue(f"selections.{key}", f"{res.label} : « {i.name} » n'est pas un code {where}.")
                elif (i.god, i.name) in seen:
                    issue(f"selections.{key}", f"{res.label} : « {i.name} » choisi plusieurs fois.")
                else:
                    total += code.value
                seen.add((i.god, i.name))
            if total < allowance:
                issue(f"selections.{key}", f"{res.label} : valeur totale {total}, doit atteindre au moins {allowance}.")
        elif res.kind == "min_total" and allowance > 0:
            total = sum(i.value or 0 for i in items)
            if total < allowance:
                issue(f"selections.{key}", f"{res.label} : valeur totale {total}, doit atteindre au moins {allowance}.")
        elif res.kind == "score" and res.max is not None and allowance > res.max:
            issue(f"resources.{key}", f"{res.label} : {allowance}, maximum {res.max}.")

    # --- Traits : saisie vérifiée pour tous ; leurs effets ne s'appliquent qu'en mode règles ---
    fx, trait_issues = trait_effects(c.traits, c.species, c.resources.get("piete", 0))
    for field, message in trait_issues:
        issue(field, message)

    # --- Monstres : ce que leurs caractéristiques n'ouvrent pas n'existe pas pour eux ---
    access = None
    if c.kind == CharacterKind.MONSTRE and c.monster is not None:
        for field, message in monster_issues(c.monster.traits):
            issue(field, message)
        access = monster_access(c.monster.traits)
        for field, message in _monster_access_issues(c, access):
            issue(field, message)

    attr_spent = sum(c.attributes.get(a, 0) for a in Attribute)
    groups_spent = sum(group_level_cost(level.pcp) for level in c.skill_groups.values())

    if c.creation_mode == CreationMode.FREE:
        return ValidationReport(
            valid=not issues,
            rules_checked=False,
            pc_total=START_PC,
            pc_spent=0,
            attribute_points_available=None,
            attribute_points_spent=attr_spent,
            skill_group_points_available=None,
            skill_group_points_spent=groups_spent,
            money_available=None,
            monster_access=access,
            issues=issues,
        )

    creation = c.creation or Creation()
    p = creation.priorities
    rows = {k: PRIORITY_TABLE[v] if v else None for k, v in p.model_dump().items()}
    if any(v is None for v in rows.values()):
        issue("creation.priorities", "Les quatre priorités doivent être choisies.")

    # --- Points de création ---
    # Une même lettre peut servir à plusieurs priorités : l'exemple du document est A|A|D|E.
    extra = creation.extra_pc
    pc_total = START_PC + fx.pc
    pc_spent = sum(row["cost"] for row in rows.values() if row) + extra.relations + extra.magic + extra.bottes
    if pc_spent > pc_total:
        traits_txt = f" ({START_PC} {fx.pc:+d} par les traits)" if fx.pc else ""
        issue("creation.priorities", f"{pc_spent} PC dépensés pour {pc_total} disponibles{traits_txt}.")
    # 1 PC restant = une relation (un PNJ, un lieu ou une culture), à déclarer au MJ.
    declared = [r for r in c.relations if r.strip()]
    if len(declared) > extra.relations:
        issue("relations", f"Relations : {len(declared)} déclarées pour {extra.relations} achetée(s) en PC.")
    elif len(declared) < extra.relations:
        issue("relations", f"Relations : encore {extra.relations - len(declared)} à déclarer (PNJ, lieu ou culture).")

    # --- Rôles ---
    role_points = None
    role_points_outdated = False
    role_stats: dict[str, int] = {}
    if c.kind == CharacterKind.PJ:
        role_points = compute_role_points(
            c.roles.primary, c.roles.secondary, creation.role_choices,
            [] if fx.no_totem_bonus else [i.name for i in c.selections.get("animaux_totems", [])],
            set(fx.role_forbidden_skills), set(fx.role_forbidden_groups))
        role_stats = role_points.stats
        # Ce que donnent les rôles est un minimum : le joueur ne peut pas le retirer pour le mettre ailleurs.
        for name, floor in role_points.knowledges.items():
            if c.knowledges.get(name, 0) < floor:
                issue(f"knowledges.{name}", f"Connaissance « {name} » : au moins {floor} (donné par les rôles).")
        for key, required in role_points.imposed.items():
            chosen = {i.name for i in c.selections.get(key, [])}
            for item in required:
                if item not in chosen:
                    issue(f"selections.{key}", f"{RESOURCE_DEFS[key].label} : « {item} » est imposé par les rôles.")
        for stat in RESOURCE_STATS:
            floor = role_stats.get(stat, 0)
            if c.resources.get(stat, 0) < floor:
                issue(f"resources.{stat}", f"{STATS[stat]} : au moins {floor} (donné par les rôles).")
        stored = (
            {n: s.pcr for n, s in c.skills.items() if s.pcr},
            {n: s.pcr for n, s in c.skill_groups.items() if s.pcr},
        )
        role_points_outdated = stored != (role_points.skills, role_points.skill_groups)
        for key in role_points.unknown_roles:
            issue("roles", f"« {key} » n'est pas un rôle du catalogue.")
        for rank in role_points.invalid_ranks:
            issue("roles", f"{rank} : ce rôle ne peut pas être pris à ce rang.")
        for ch in role_points.choices:
            if not choice_is_valid(ch.picked, ch.options, ch.count, ch.allow_repeat):
                what = {"skill": "compétence", "skill_group": "groupe de compétence", "knowledge": "connaissance"}[ch.target]
                names = {**SKILL_LABELS, **{g: grp["label"] for g, grp in SKILL_GROUPS.items()}}
                among = f" parmi {', '.join(names.get(o, o) for o in ch.options)}" if ch.options else ""
                verb = f"répartir {ch.count} point(s) en {what}" if ch.allow_repeat else f"choisir {ch.count} {what}(s)"
                issue(f"creation.role_choices.{ch.key}", f"{ch.source_label} : {verb}{among}.")

    # Magie et bottes : exactement ce que donnent les rôles + ce qui est acheté avec les PC restants.
    expected_magic = role_stats.get("magic", 0) + extra.magic
    if c.magic != expected_magic:
        issue("magic", f"Magie attendue : {expected_magic} (rôles {role_stats.get('magic', 0)} + PC {extra.magic}), pas {c.magic}.")
    if fx.no_magic and c.magic:
        issue("magic", f"Résistance à la magie : Magie doit rester à 0 (rôles et PC compris), pas {c.magic}.")
    expected_bottes = role_stats.get("bottes", 0) + extra.bottes * BOTTES_PER_PC
    if c.bottes != expected_bottes:
        issue("bottes", f"Bottes attendues : {expected_bottes} (rôles {role_stats.get('bottes', 0)} "
                        f"+ {extra.bottes} PC × {BOTTES_PER_PC}), pas {c.bottes}.")
    if rows["roles"]:
        combo = (len(c.roles.primary), len(c.roles.secondary))
        allowed = rows["roles"]["roles"]
        if combo not in allowed:
            txt = " ou ".join(f"{a}P+{b}S" for a, b in allowed)
            issue("roles", f"Priorité {p.roles} : rôles attendus {txt}, reçus {combo[0]}P+{combo[1]}S.")

    # --- Espèce et attributs ---
    attr_available = rows["attributes"]["attributes"] + fx.attribute_points if rows["attributes"] else None
    if attr_available is not None and attr_spent != attr_available:
        issue("attributes", f"{attr_spent} points d'attributs répartis pour {attr_available} disponibles.")
    if c.species is None:
        issue("species", "L'espèce doit être choisie.")
    elif c.species not in Species:
        issue("species", f"« {c.species} » n'est pas une espèce jouable ({', '.join(Species)}).")
    else:
        limits = fx.attribute_limits or {}
        for attr, lim in limits.items():
            value = c.attributes.get(attr, 0)
            if not lim.min <= value <= lim.max:
                base_lo, base_hi, _ = SPECIES_LIMITS[Species(c.species)][attr]
                why = "" if (lim.min, lim.max) == (base_lo, base_hi) else " (traits compris)"
                issue(f"attributes.{attr}", f"{attr} = {value}, doit être entre {lim.min} et {lim.max} pour un {c.species}{why}.")

    # --- Compétences rendues inaccessibles par les traits ---
    for name, trait in fx.forbidden_skills.items():
        score = c.skills.get(name)
        if score and score.pcp:
            issue(f"skills.{name}", f"{SKILL_LABELS[name]} : inaccessible ({trait}), pas de PCP possible.")

    # --- Groupes de compétence (PCP), y compris les réserves Mana et Connaissances ---
    for group, level in c.skill_groups.items():
        if group not in SKILL_GROUPS:
            continue
        skills_pcp = sum(s.pcp for name, s in c.skills.items() if ALL_SKILLS.get(name) == group)
        skills_pcp += sum(c.pools.get(name, 0) for name, pool in SKILL_POOLS.items() if pool["group"] == group)
        if skills_pcp != 2 * level.pcp:
            issue(f"skill_groups.{group}",
                  f"Niveau {level.pcp} : {2 * level.pcp} points à répartir dans les compétences, {skills_pcp} répartis.")
    for name, pool in SKILL_POOLS.items():
        if c.pools.get(name, 0) and not c.skill_groups.get(pool["group"]):
            issue(f"pools.{name}", f"{pool['label']} : pas de niveau dans le groupe {SKILL_GROUPS[pool['group']]['label']}.")

    # --- Mana et connaissances : rôles + PCP mis dans les réserves ---
    mana_pool = c.pools.get("mana", 0) * SKILL_POOLS["mana"]["per_point"]
    expected_mana = expected_mana_max(role_stats.get("mana", 0), mana_pool, fx)
    if c.mana.max != expected_mana:
        detail = f"rôles {role_stats.get('mana', 0)} + {mana_pool} par les PCP"
        if fx.mana_bonus:
            detail += f" + {fx.mana_bonus} par {TRAITS['demi_demon'].label}"
        issue("mana", f"Mana max attendu : {expected_mana} ({detail}), pas {c.mana.max}.")
    if fx.requires_mana and expected_mana == 0:
        issue("traits", f"{TRAITS['hyperhidrose_manafique'].label} : il faut une réserve de mana (mana max > 0).")
    knowledge_floors = role_points.knowledges if role_points else {}
    free_knowledge = sum(max(0, v - knowledge_floors.get(k, 0)) for k, v in c.knowledges.items())
    totem_knowledge = role_points.free_knowledge if role_points else 0
    expected_free = c.pools.get("connaissances", 0) * SKILL_POOLS["connaissances"]["per_point"] + totem_knowledge
    if free_knowledge != expected_free:
        bonus = f" + {totem_knowledge} par les animaux totems" if totem_knowledge else ""
        issue("knowledges", f"Connaissances libres : {free_knowledge} point(s) répartis pour {expected_free} "
                            f"(PCP en Connaissances × {SKILL_POOLS['connaissances']['per_point']}{bonus}).")
    groups_available = rows["skill_groups"]["skill_groups"] if rows["skill_groups"] else None
    if groups_available is not None and groups_spent > groups_available:
        issue("skill_groups", f"{groups_spent} points de groupe dépensés pour {groups_available} disponibles.")

    # --- Sous ---
    money_available = (0 if fx.money_zero else rows["money"]["money"]) if rows["money"] else None
    if money_available is not None and creation.money_spent > money_available:
        issue("creation.money_spent", f"{creation.money_spent} sous dépensés pour {money_available} disponibles.")

    return ValidationReport(
        valid=not issues,
        rules_checked=True,
        pc_total=pc_total,
        pc_spent=pc_spent,
        attribute_points_available=attr_available,
        attribute_points_spent=attr_spent,
        skill_group_points_available=groups_available,
        skill_group_points_spent=groups_spent,
        money_available=money_available,
        role_points=role_points,
        role_points_outdated=role_points_outdated,
        trait_effects=fx,
        monster_access=access,
        issues=issues,
    )
