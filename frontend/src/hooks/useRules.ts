import { useEffect, useState } from "react";
import { api, type Rules } from "../api/client";

// Une seule requête pour toute l'application (éditeur, panneau des règles, fiche...).
let cached: Rules | null = null;
let pending: Promise<Rules | null> | null = null;

/** Règles de création servies par le backend (source unique). */
export function useRules(): Rules | null {
  const [rules, setRules] = useState<Rules | null>(cached);
  useEffect(() => {
    if (cached) return;
    pending ??= api.GET("/api/rules").then(({ data }) => {
      cached = data ?? null;
      if (!cached) pending = null; // échec : on réessaiera au prochain affichage
      return cached;
    });
    let alive = true;
    pending.then((r) => alive && setRules(r));
    return () => { alive = false; };
  }, []);
  return rules;
}
