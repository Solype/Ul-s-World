import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

/**
 * Client typé généré à partir de l'OpenAPI du backend.
 * Après une modification de l'API : `npm run gen:api` (voir README).
 */
export const api = createClient<paths>({ baseUrl: "" });

// Session expirée ou fermée ailleurs : toute réponse 401 ramène à l'écran de connexion.
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => { onUnauthorized = handler; };
api.use({
  onResponse({ request, response }) {
    if (response.status === 401 && !new URL(request.url).pathname.startsWith("/api/auth/")) onUnauthorized?.();
  },
});

export type User = components["schemas"]["UserRead"];
export type UserPublic = components["schemas"]["UserPublic"];

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
export type RoomSummary = components["schemas"]["RoomSummary"];
export type Room = components["schemas"]["RoomRead"];
export type RoomCharacter = components["schemas"]["RoomCharacterRead"];
export type ChatMessage = components["schemas"]["ChatMessageRead"];
export type Instance = components["schemas"]["InstanceRead"];
export type MonitorDef = components["schemas"]["MonitorDef"];
export type MonsterProfile = components["schemas"]["Monster"];
export type MonsterAccess = components["schemas"]["MonsterAccess"];
export type InstanceVisibility = components["schemas"]["InstanceVisibility"];
export type GodCode = components["schemas"]["GodCode"];
