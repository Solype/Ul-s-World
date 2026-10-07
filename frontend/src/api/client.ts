import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

/**
 * Client typé généré à partir de l'OpenAPI du backend.
 * Après une modification de l'API : `npm run gen:api` (voir README).
 */
export const api = createClient<paths>({ baseUrl: "" });

export type Rules = components["schemas"]["Rules"];
export type Character = components["schemas"]["CharacterRead"];
export type CharacterInput = components["schemas"]["CharacterBase"];
export type ValidationReport = components["schemas"]["ValidationReport"];
export type Priority = components["schemas"]["Priority"];
export type Attribute = components["schemas"]["Attribute"];
export type CharacterKind = components["schemas"]["CharacterKind"];
export type CreationMode = components["schemas"]["CreationMode"];
export type Creation = components["schemas"]["Creation"];
export type SkillScore = components["schemas"]["SkillScore"];
export type TraitDef = components["schemas"]["TraitDef"];
export type TraitPick = components["schemas"]["TraitPick"];
export type TraitEffects = components["schemas"]["TraitEffects"];
