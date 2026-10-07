import { useEffect, useRef } from "react";

export type ServerEvent = { type: string; id: number };

/** S'abonne à un canal websocket du backend (`characters` ou `character:<id>`). */
export function useChannel(channel: string | null, onEvent: (event: ServerEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!channel) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/${channel}`);
    ws.onmessage = (msg) => handler.current(JSON.parse(msg.data));
    return () => ws.close();
  }, [channel]);
}
