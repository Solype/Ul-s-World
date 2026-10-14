import { Trash2 } from "lucide-react";
import type { GodCode } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type CodePick = { name: string; value?: number | null; god?: string | null };

type Props = {
  /** Dieux choisis par l'adepte. */
  gods: string[];
  /** Codes de chaque dieu du catalogue. */
  godCodes: Map<string, GodCode[]>;
  selected: CodePick[];
  onChange: (codes: CodePick[]) => void;
};

/**
 * Codes de l'adepte : à cocher parmi ceux de ses dieux. Un code garde son dieu (`god`) et sa valeur,
 * reprise du catalogue. Un code qui ne vient pas d'un dieu choisi (dieu retiré, ancien code libre) est
 * signalé et supprimable.
 */
export default function CodesPicker({ gods, godCodes, selected, onChange }: Props) {
  const isPicked = (god: string, code: GodCode) => selected.some((s) => s.god === god && s.name === code.content);
  const toggle = (god: string, code: GodCode, on: boolean) =>
    onChange(on ? [...selected, { name: code.content, value: code.value, god }]
      : selected.filter((s) => !(s.god === god && s.name === code.content)));
  const orphans = selected.filter((s) => !s.god || !gods.includes(s.god)
    || !(godCodes.get(s.god) ?? []).some((c) => c.content === s.name));

  if (gods.length === 0 && orphans.length === 0) {
    return <p className="pl-3 text-sm text-muted-foreground">Choisis d'abord un dieu : les codes viennent de tes dieux.</p>;
  }
  return (
    <div className="flex flex-col gap-3 pl-3">
      {gods.map((god) => {
        const codes = godCodes.get(god) ?? [];
        return (
          <div key={god} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{god}</span>
            {codes.length === 0 && <p className="text-sm text-muted-foreground italic">Codes à venir.</p>}
            {codes.map((code) => (
              <Label key={code.content} className="flex items-start gap-2 font-normal">
                <Checkbox className="mt-0.5" checked={isPicked(god, code)} onCheckedChange={(v) => toggle(god, code, !!v)} />
                <span className="flex-1">{code.content}</span>
                <span className="text-xs text-muted-foreground tabular-nums">valeur {code.value} · zèle {code.zeal}</span>
              </Label>
            ))}
          </div>
        );
      })}
      {orphans.map((s, i) => (
        <div key={i} className="flex items-center gap-2 text-sm text-destructive">
          <span className="flex-1">« {s.name} »{s.god ? ` (${s.god})` : ""} : pas un code d'un dieu choisi</span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Supprimer"
            onClick={() => onChange(selected.filter((x) => x !== s))}><Trash2 /></Button>
        </div>
      ))}
    </div>
  );
}
