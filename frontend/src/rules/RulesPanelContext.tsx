import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Page (et éventuellement section) de règles à afficher. `nonce` force le défilement même vers la même cible. */
export type RulesTarget = { page: string; section?: string; nonce?: number };

type RulesPanel = {
  isOpen: boolean;
  target: RulesTarget;
  /** Ouvre le panneau, à une page ou une section précise. */
  open: (page?: string, section?: string) => void;
  close: () => void;
  toggle: () => void;
  /** Change de page / section sans changer l'ouverture. */
  navigate: (page: string, section?: string) => void;
  /** Incrémenté pour demander le focus de la recherche (raccourci Ctrl+K). */
  searchToken: number;
};

const Ctx = createContext<RulesPanel | null>(null);
const STORAGE_KEY = "newmannheim.rulesPanel";

function load(): { isOpen: boolean; page: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved.page === "string") return { isOpen: !!saved.isOpen, page: saved.page };
  } catch { /* stockage indisponible : valeurs par défaut */ }
  return { isOpen: false, page: "creation" };
}

/**
 * Panneau des règles à droite de la page (vue partagée) : on lit les règles sans quitter la fiche.
 * L'ouverture et la page affichée sont mémorisées dans le navigateur.
 */
export function RulesPanelProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(load, []);
  const [isOpen, setOpen] = useState(initial.isOpen);
  const [target, setTarget] = useState<RulesTarget>({ page: initial.page });
  const [searchToken, setSearchToken] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ isOpen, page: target.page }));
    } catch { /* stockage indisponible : pas de mémorisation */ }
  }, [isOpen, target.page]);

  const navigate = useCallback((page: string, section?: string) => setTarget({ page, section, nonce: Date.now() }), []);
  const open = useCallback((page?: string, section?: string) => {
    setOpen(true);
    if (page) navigate(page, section);
  }, [navigate]);

  // Ctrl+K (ou Cmd+K) : ouvre les règles et place le curseur dans la recherche.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!location.hash.startsWith("#/regles")) setOpen(true);
        setSearchToken((t) => t + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<RulesPanel>(() => ({
    isOpen, target, open, navigate, searchToken,
    close: () => setOpen(false),
    toggle: () => setOpen((o) => !o),
  }), [isOpen, target, open, navigate, searchToken]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRulesPanel(): RulesPanel {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRulesPanel doit être utilisé dans <RulesPanelProvider>.");
  return ctx;
}
