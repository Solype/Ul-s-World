import { Maximize2, ScrollText, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { useRulesPanel } from "./RulesPanelContext";
import RulesReader from "./RulesReader";

const WIDTH_KEY = "newmannheim.rulesPanelWidth";
const MIN_WIDTH = 320;
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(900, window.innerWidth * 0.6));

function loadWidth() {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    if (w) return Math.min(Math.max(w, MIN_WIDTH), maxWidth());
  } catch { /* stockage indisponible */ }
  return 440;
}

/**
 * Règles à droite de la page (vue partagée). Sur grand écran, la page se resserre et le panneau
 * se redimensionne en tirant son bord gauche ; sur petit écran, il recouvre la page.
 */
export default function RulesPanel() {
  const panel = useRulesPanel();
  const [width, setWidth] = useState(loadWidth);

  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, String(Math.round(width))); } catch { /* pas de mémorisation */ }
  }, [width]);

  if (!panel.isOpen) return null;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => setWidth(Math.min(Math.max(window.innerWidth - ev.clientX, MIN_WIDTH), maxWidth()));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.removeProperty("user-select");
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  return (
    <aside aria-label="Règles" style={{ "--rules-w": `${width}px` } as CSSProperties}
      className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col border-l bg-background shadow-xl print:hidden
        lg:sticky lg:inset-auto lg:top-14 lg:z-auto lg:h-[calc(100svh-3.5rem)] lg:w-[var(--rules-w)] lg:shrink-0 lg:shadow-none">
      <div role="separator" aria-orientation="vertical" aria-label="Redimensionner le panneau des règles"
        onPointerDown={startResize}
        className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize hover:bg-primary/20 lg:block" />
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <ScrollText className="size-4 text-primary" />
        <span className="flex-1 font-heading text-sm font-semibold">Règles</span>
        <Button variant="ghost" size="icon-sm" aria-label="Ouvrir en pleine page" title="Ouvrir en pleine page"
          onClick={() => { location.hash = `#/regles/${panel.target.page}${panel.target.section ? `/${panel.target.section}` : ""}`; panel.close(); }}>
          <Maximize2 />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fermer les règles" onClick={panel.close}><X /></Button>
      </div>
      <div className="min-h-0 flex-1">
        <RulesReader variant="panel" target={panel.target} onNavigate={panel.navigate} searchToken={panel.searchToken} />
      </div>
    </aside>
  );
}
