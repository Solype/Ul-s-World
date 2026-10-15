import { useEffect, useRef } from "react";
import type { ChatMessage, Instance } from "@/api/client";

/** Événements poussés par le backend. Personnages : `{type, id}`. Rooms : présence et chat. */
export type ServerEvent =
  | { type: "character.created" | "character.updated" | "character.deleted"; id: number }
  | { type: "room.presence"; online: number[] }
  | { type: "room.message"; message: ChatMessage }
  /** Un personnage a été proposé, accepté, refusé ou retiré : relire la room. */
  | { type: "room.characters" }
  /** Les moniteurs d'un personnage en jeu ont changé. */
  | { type: "room.instance"; instance: Instance }
  // Personnage sorti du jeu, ou monstre que le MJ vient de cacher.
  | { type: "room.instance.removed"; id: number }
  /** Le MJ a changé l'ordre des personnages en jeu : relire la liste. */
  | { type: "room.instances.order" };

/** Le serveur a refusé ou coupé l'accès au canal (pas connecté, exclu de la room...). */
export const WS_FORBIDDEN = 4403;

/**
 * S'abonne à un canal websocket du backend (`characters`, `character:<id>` ou `room:<id>`).
 * `onClose` reçoit le code de fermeture quand le serveur coupe la connexion.
 */
export function useChannel(channel: string | null, onEvent: (event: ServerEvent) => void,
  onClose?: (code: number) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  useEffect(() => {
    if (!channel) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/${channel}`);
    let closedByUs = false;
    ws.onmessage = (msg) => handler.current(JSON.parse(msg.data));
    ws.onclose = (e) => { if (!closedByUs) closeHandler.current?.(e.code); };
    return () => { closedByUs = true; ws.close(); };
  }, [channel]);
}
