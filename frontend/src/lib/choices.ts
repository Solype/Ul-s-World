import type { components } from "@/api/schema";

type ChoiceState = components["schemas"]["ChoiceState"];

/** Même règle que `choice_is_valid` côté backend : sert seulement à l'affichage. */
export function choiceIsComplete(ch: ChoiceState): boolean {
  const picked = ch.picked ?? [];
  if (picked.length !== ch.count || picked.some((p) => !p.trim())) return false;
  if (!ch.allow_repeat && new Set(picked).size !== ch.count) return false;
  return (ch.options?.length ?? 0) === 0 || picked.every((p) => ch.options.includes(p));
}
