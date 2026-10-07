import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRulesPanel } from "./RulesPanelContext";

/** Petit bouton « ? » qui ouvre le panneau des règles à la bonne page (et section). */
export default function RulesLink({ page, section, label = "Voir la règle" }: { page: string; section?: string; label?: string }) {
  const { open } = useRulesPanel();
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label}
      className="text-muted-foreground print:hidden" onClick={() => open(page, section)}>
      <CircleHelp />
    </Button>
  );
}
