/**
 * Copies côté client des règles du backend : mêmes cas que les tests backend
 * (backend/tests/test_damage.py, test_rules.py, test_traits.py), pour que front et back
 * soient vérifiés sur les mêmes attentes.
 */
import { describe, expect, it } from "vitest";
import type { components } from "@/api/schema";
import type { Rules, TraitEffects } from "../api/client";
import { groupCost } from "./budget";
import { choiceIsComplete } from "./choices";
import { damageAfterArmor } from "./damage";
import { manaMax } from "./roleEffects";
import { formatInviteCode } from "./rooms";

describe("damageAfterArmor (backend/app/rules/damage.py)", () => {
  it.each([
    [7, 0, 5, 7], // sans armure, la pénétration est ignorée
    [0, 0, 5, 0],
    [10, 6, 2, 6], // dégâts > armure : l'armure perd la pénétration (6 - 2 = 4), 10 - 4 = 6
    [10, 6, 0, 4],
    [10, 6, 8, 10], // pénétration > armure : l'armure tombe à 0, tout passe (jamais plus que les dégâts)
    [5, 6, 2, 2], // armure > dégâts : seule la pénétration passe
    [1, 6, 3, 1], // ... sans dépasser les dégâts
    [5, 6, 0, 0],
    [6, 6, 2, 2], // égalité : les deux cas donnent le même résultat
    [6, 6, 9, 6],
  ])("dégâts %i, armure %i, pénétration %i : %i", (damage, armor, penetration, expected) => {
    expect(damageAfterArmor(damage, armor, penetration)).toBe(expected);
  });

  it("ne dépasse jamais les dégâts avant armure", () => {
    for (let damage = 0; damage < 15; damage++)
      for (let armor = 0; armor < 15; armor++)
        for (let penetration = 0; penetration < 15; penetration++) {
          const passed = damageAfterArmor(damage, armor, penetration);
          expect(passed).toBeGreaterThanOrEqual(0);
          expect(passed).toBeLessThanOrEqual(damage);
        }
  });
});

describe("groupCost (group_level_cost)", () => {
  it("suit l'exemple du document : 0 → 3 coûte 1 + 2 + 3 = 6", () => {
    expect(groupCost(3)).toBe(6);
  });

  it("vaut 0 au niveau 0 et coûte `level` de plus à chaque niveau", () => {
    expect(groupCost(0)).toBe(0);
    for (let level = 1; level <= 10; level++) expect(groupCost(level) - groupCost(level - 1)).toBe(level);
  });
});

describe("manaMax (expected_mana_max)", () => {
  // Seul `skill_pools.mana.per_point` sert : 15 comme SKILL_POOLS côté backend.
  const rules = { skill_pools: { mana: { per_point: 15 } } } as unknown as Rules;

  it("rôles + réserve Mana × 15", () => {
    expect(manaMax(rules, 15, 2)).toBe(45);
    expect(manaMax(rules, 0, 0, null)).toBe(0);
  });

  it("demi-démon : les 100 s'ajoutent aux gains normaux (même cas que test_half_demon_adds_100_mana)", () => {
    expect(manaMax(rules, 15, 2, { mana_bonus: 100 } as TraitEffects)).toBe(145);
  });
});

describe("formatInviteCode", () => {
  it("coupe le code en deux blocs de 4", () => {
    expect(formatInviteCode("ABCD2345")).toBe("ABCD-2345");
  });
});

describe("choiceIsComplete (choice_is_valid)", () => {
  type ChoiceState = components["schemas"]["ChoiceState"];
  const choice = (picked: string[], options: string[], count: number, allow_repeat = false): ChoiceState => ({
    key: "k",
    source_label: "Rôle",
    points: 1,
    target: "skill",
    count,
    allow_repeat,
    options,
    picked,
  });

  it("exige exactement `count` choix non vides", () => {
    expect(choiceIsComplete(choice(["a"], ["a", "b"], 1))).toBe(true);
    expect(choiceIsComplete(choice([], ["a", "b"], 1))).toBe(false);
    expect(choiceIsComplete(choice(["a", "b"], ["a", "b"], 1))).toBe(false);
    expect(choiceIsComplete(choice(["  "], [], 1))).toBe(false);
  });

  it("refuse les doublons sauf si la répétition est permise", () => {
    expect(choiceIsComplete(choice(["a", "a"], ["a", "b"], 2))).toBe(false);
    expect(choiceIsComplete(choice(["a", "a"], ["a", "b"], 2, true))).toBe(true);
  });

  it("restreint aux options, sauf choix libre (options vides)", () => {
    expect(choiceIsComplete(choice(["c"], ["a", "b"], 1))).toBe(false);
    expect(choiceIsComplete(choice(["Histoire locale"], [], 1))).toBe(true);
  });
});
