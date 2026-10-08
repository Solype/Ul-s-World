import { FileText, Minus, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { Instance, MonitorDef } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import StatusTags, { type StatusActions } from "./StatusTags";

/** Couleur de chaque jauge (clés : rules/monitors.py MONITORS). */
const BAR_COLORS: Record<string, string> = {
  physique: "bg-red-600 dark:bg-red-500",
  mental: "bg-violet-600 dark:bg-violet-400",
  pathologique: "bg-emerald-600 dark:bg-emerald-500",
  endurance: "bg-amber-500",
  mana: "bg-sky-600 dark:bg-sky-400",
};

type Props = {
  instance: Instance;
  /** Définitions des moniteurs (GET /api/rules), dans l'ordre d'affichage. */
  defs: Record<string, MonitorDef>;
  canEdit: boolean;
  isGM: boolean;
  /** Statuts déjà utilisés dans la room (suggestions). */
  statusSuggestions: string[];
  statusActions: StatusActions;
  onDelta: (monitor: string, delta: number) => void;
  onSet: (monitor: string, value: number) => void;
  onResync: () => void;
  onSheet: () => void;
};

function MonitorRow({ label, current, max, color, canEdit, onDelta, onSet }: {
  label: string; current: number; max: number; color: string; canEdit: boolean;
  onDelta: (d: number) => void; onSet: (v: number) => void;
}) {
  // Saisie directe de la valeur ; resynchronisée quand la valeur change (autre joueur, temps réel).
  const [draft, setDraft] = useState(String(current));
  useEffect(() => setDraft(String(current)), [current]);
  const commit = () => {
    const v = Number(draft);
    if (draft.trim() !== "" && Number.isInteger(v) && v !== current) onSet(Math.max(0, Math.min(max, v)));
    else setDraft(String(current));
  };
  const pct = max > 0 ? (current / max) * 100 : 0;
  const broken = max > 0 && current === 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className={cn("font-medium", broken && "text-destructive")}>{label}</span>
        {broken && <Badge variant="destructive">brisé</Badge>}
        <span className="ml-auto flex items-center gap-1 tabular-nums">
          {canEdit ? (
            <Input aria-label={`${label} actuel`} className="h-7 w-14 px-1 text-right tabular-nums" inputMode="numeric"
              value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          ) : <span>{current}</span>}
          <span className="text-muted-foreground">/ {max}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        {canEdit && (
          <Button variant="outline" size="icon-sm" aria-label={`${label} -1`} disabled={current <= 0}
            onClick={() => onDelta(-1)}><Minus /></Button>
        )}
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label}
          aria-valuemin={0} aria-valuemax={max} aria-valuenow={current}>
          <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
        </div>
        {canEdit && (
          <Button variant="outline" size="icon-sm" aria-label={`${label} +1`} disabled={current >= max}
            onClick={() => onDelta(1)}><Plus /></Button>
        )}
      </div>
    </div>
  );
}

/** Un personnage en jeu : ses moniteurs de condition (et de mana s'il en a). */
export default function InstanceCard({
  instance, defs, canEdit, isGM, statusSuggestions, statusActions, onDelta, onSet, onResync, onSheet,
}: Props) {
  const c = instance.character;
  const keys = Object.keys(defs).filter((k) => k in instance.monitors);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-heading text-base">{c.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          {c.species && <span className="capitalize">{c.species}</span>}
          {c.owner && <span>· {c.owner.username}</span>}
          {instance.outdated && <Badge variant="outline" title="La fiche a changé depuis l'entrée en jeu">fiche modifiée</Badge>}
        </CardDescription>
        <CardAction className="flex gap-1">
          {instance.outdated && canEdit && (
            <Button variant="ghost" size="icon-sm" aria-label="Resynchroniser" onClick={onResync}
              title="Reprendre les max de la fiche (les dégâts subis sont conservés)"><RefreshCw /></Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Fiche" title="Fiche" onClick={onSheet}><FileText /></Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatusTags statuses={instance.statuses ?? []} canEdit={canEdit} isGM={isGM}
          suggestions={statusSuggestions} {...statusActions} />
        {keys.map((k) => (
          <MonitorRow key={k} label={defs[k].label} current={instance.monitors[k].current} max={instance.monitors[k].max}
            color={BAR_COLORS[k] ?? "bg-primary"} canEdit={canEdit}
            onDelta={(d) => onDelta(k, d)} onSet={(v) => onSet(k, v)} />
        ))}
      </CardContent>
    </Card>
  );
}
