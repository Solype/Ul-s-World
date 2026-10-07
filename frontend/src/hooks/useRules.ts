import { useEffect, useState } from "react";
import { api, type Rules } from "../api/client";

/** Règles de création servies par le backend (source unique). */
export function useRules(): Rules | null {
  const [rules, setRules] = useState<Rules | null>(null);
  useEffect(() => {
    api.GET("/api/rules").then(({ data }) => setRules(data ?? null));
  }, []);
  return rules;
}
