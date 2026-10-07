import { CircleCheck, Sparkles } from "lucide-react";
import type { Creation, Rules, ValidationReport } from "@/api/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { choiceIsComplete } from "@/lib/choices";

type Props = {
  rules: Rules;
  creation: Creation;
  report: ValidationReport | null;
  onChange: (patch: Partial<Creation>) => void;
};

/**
 * Choix offerts par les rôles : « sabre ou épée », « +2 en compétences de mêlée au choix »
 * (répartition libre : le même choix peut revenir), « +4 en connaissance au choix » (intitulé libre).
 * La liste vient du backend (`report.role_points.choices`).
 */
export default function RoleChoices({ rules, creation, report, onChange }: Props) {
  const points = report?.role_points;
  const list = points?.choices ?? [];
  const notes = points?.notes ?? [];
  if (list.length === 0 && notes.length === 0) return null;

  const skillLabels: Record<string, string> = Object.fromEntries(
    Object.values(rules.skill_groups).flatMap((g) => Object.entries(g.skills)),
  );
  const groupLabels: Record<string, string> = Object.fromEntries(
    Object.entries(rules.skill_groups).map(([k, g]) => [k, g.label]),
  );
  const choices = creation.role_choices ?? {};
  const pick = (key: string, index: number, value: string, count: number) => {
    const current = Array.from({ length: count }, (_, i) => choices[key]?.[i] ?? "");
    current[index] = value;
    onChange({ role_choices: { ...choices, [key]: current } });
  };

  return (
    <div className="flex flex-col gap-3">
      {list.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
          <span className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="size-4 text-primary" />Choix offerts par les rôles</span>
          {list.map((ch) => {
            const labels = ch.target === "skill" ? skillLabels : groupLabels;
            const what = ch.allow_repeat
              ? `${ch.count} point(s) à répartir`
              : ch.count > 1 ? `+${ch.points} dans ${ch.count} choix` : `+${ch.points} au choix`;
            return (
              <div key={ch.key} className="grid gap-2 sm:grid-cols-[17rem_1fr] sm:items-start">
                <div className="flex flex-col pt-1 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {ch.source_label}
                    {choiceIsComplete(ch) && <CircleCheck className="size-3.5 text-success" />}
                  </span>
                  <span className="text-xs text-muted-foreground">{what}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: ch.count }, (_, i) =>
                    ch.target === "knowledge" ? (
                      <Input key={i} className="w-56" placeholder="Connaissance au choix" value={ch.picked[i] ?? ""}
                        onChange={(e) => pick(ch.key, i, e.target.value, ch.count)} />
                    ) : (
                      <Select key={i} value={ch.picked[i] || undefined} onValueChange={(v) => pick(ch.key, i, v, ch.count)}>
                        <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="Choisir…" /></SelectTrigger>
                        <SelectContent>
                          {ch.options.map((o) => (
                            <SelectItem key={o} value={o}
                              disabled={!ch.allow_repeat && ch.picked.includes(o) && ch.picked[i] !== o}>
                              {labels[o] ?? o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {notes.map((n) => <li key={n}>• {n}</li>)}
        </ul>
      )}
    </div>
  );
}
