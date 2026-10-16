import { ChevronLeft, ChevronRight, Ellipsis, Eye, EyeOff, FolderPlus, Pencil, ScanEye, Ungroup } from "lucide-react";
import { useState, type ComponentProps, type DragEvent, type ReactNode } from "react";
import type { Instance, InstanceVisibility, RoomGroup } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import InstanceCard from "./InstanceCard";

/** Disposition envoyée au serveur (`PUT .../instances/layout`) : hors groupe, puis les groupes, chacun dans l'ordre. */
export type Layout = { loose: number[]; groups: { id?: number; name: string; ids: number[] }[] };

/** Où déposer : dans un groupe (id), hors groupe (null) ou dans un nouveau groupe, avant la carte n° `index`. */
type Target = { group: number | null | "new"; index: number };

/** Données glissées : l'id de l'instance, sous un type que seul ce tableau accepte. */
const DRAG_TYPE = "application/x-newmannheim-instance";

function layoutOf(instances: Instance[], groups: RoomGroup[]): Layout {
  const known = new Set(groups.map((g) => g.id));
  return {
    loose: instances.filter((i) => i.group_id == null || !known.has(i.group_id)).map((i) => i.id),
    groups: groups.map((g) => ({ id: g.id, name: g.name, ids: instances.filter((i) => i.group_id === g.id).map((i) => i.id) })),
  };
}

/** Nom libre pour un nouveau groupe : « Groupe 1 », « Groupe 2 »... */
function freshName(layout: Layout) {
  const names = new Set(layout.groups.map((g) => g.name));
  let n = layout.groups.length + 1;
  while (names.has(`Groupe ${n}`)) n++;
  return `Groupe ${n}`;
}

/** La carte `id` déplacée vers `target`. `index` compte la carte elle-même si elle est déjà dans ce groupe. */
function moveTo(layout: Layout, id: number, target: Target): Layout {
  const put = (ids: number[], here: boolean) => {
    const rest = ids.filter((x) => x !== id);
    if (!here) return rest;
    const from = ids.indexOf(id);
    const at = from >= 0 && from < target.index ? target.index - 1 : target.index;
    return [...rest.slice(0, at), id, ...rest.slice(at)];
  };
  return {
    loose: put(layout.loose, target.group === null),
    groups: [
      ...layout.groups.map((g) => ({ ...g, ids: put(g.ids, target.group === g.id) })),
      ...(target.group === "new" ? [{ name: freshName(layout), ids: [id] }] : []),
    ],
  };
}

type Props = {
  /** Dans l'ordre (`position`). */
  instances: Instance[];
  /** Dans l'ordre. Pour un joueur, seulement ceux où il voit quelqu'un. */
  groups: RoomGroup[];
  isGM: boolean;
  /** Tout ce que la carte reçoit, sauf le rangement, géré ici. */
  card: (i: Instance) => Omit<ComponentProps<typeof InstanceCard>, "instance" | "arrange">;
  /** MJ : nouvelle disposition (ordre, groupes). */
  onLayout: (layout: Layout) => void;
  /** MJ : cacher, montrer ou révéler d'un coup les monstres d'un groupe. */
  onGroupVisibility: (ids: number[], visibility: InstanceVisibility) => void;
};

/**
 * Les personnages en jeu : d'abord ceux hors groupe, puis les groupes, chacun dans un cadre à son nom.
 * Le MJ range les cartes en les glissant par leur poignée (un trait marque où elles tomberont), ou par le menu
 * de la carte ; il crée, renomme, déplace et dissout les groupes. L'ordre et les groupes sont les mêmes pour tous.
 */
export default function RoomBoard({ instances, groups, isGM, card, onLayout, onGroupVisibility }: Props) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const layout = layoutOf(instances, groups);
  const byId = new Map(instances.map((i) => [i.id, i]));

  const commit = (next: Layout) => {
    if (JSON.stringify(next) !== JSON.stringify(layout)) onLayout(next);
  };
  const aim = (t: Target | null) => {
    if (t?.group !== target?.group || t?.index !== target?.index) setTarget(t);
  };
  // Survol pendant un glisser : accepter le dépôt ici (seulement nos cartes), et viser `t`.
  const over = (e: DragEvent, t: Target | null) => {
    if (dragId == null || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.stopPropagation();
    if (t) e.preventDefault();
    aim(t);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragId != null && target) commit(moveTo(layout, dragId, target));
    setDragId(null);
    setTarget(null);
  };

  const cards = (group: number | null, ids: number[]) => ids.map((iid, index) => {
    const i = byId.get(iid)!;
    const here = target?.group === group;
    return (
      <div key={iid} className="relative"
        onDragOver={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          over(e, { group, index: index + (e.clientX > r.left + r.width / 2 ? 1 : 0) });
        }}>
        {/* Trait de dépôt, au milieu de l'espace entre deux cartes (gap-x-12). */}
        {here && target.index === index && <DropMark side="left" />}
        {here && index === ids.length - 1 && target.index === ids.length && <DropMark side="right" />}
        <InstanceCard instance={i} {...card(i)} arrange={!isGM ? undefined : {
          dragType: DRAG_TYPE,
          onDragStart: () => setDragId(iid),
          onDragEnd: () => { setDragId(null); setTarget(null); },
          onMoveBefore: index > 0 ? () => commit(moveTo(layout, iid, { group, index: index - 1 })) : undefined,
          onMoveAfter: index < ids.length - 1 ? () => commit(moveTo(layout, iid, { group, index: index + 2 })) : undefined,
          groups, groupId: group,
          onGroup: (g) => commit(moveTo(layout, iid, { group: g, index: g === "new" ? 0 : Infinity })),
        }} />
      </div>
    );
  });

  // Une zone qui reçoit les cartes : déposée sur un vide, la carte va à la fin.
  const zone = (group: number | null, ids: number[], className: string, children: ReactNode) => (
    <div className={className} onDragOver={(e) => over(e, { group, index: ids.length })} onDrop={drop}>{children}</div>
  );
  const dragging = dragId != null;
  const shownGroups = layout.groups.filter((g) => isGM || g.ids.length > 0);
  // Zone d'arrivée d'un glisser (MJ) : à la suite des groupes, pour que rien ne bouge au-dessus de la souris.
  const dropZone = (t: Target, icon: ReactNode, label: string) => (
    <div onDragOver={(e) => over(e, t)} onDrop={drop}
      className={cn("flex min-h-32 min-w-48 flex-col items-center justify-center gap-1 self-stretch rounded-xl border border-dashed text-sm text-muted-foreground transition-colors",
        target?.group === t.group && "border-primary bg-primary/5 text-foreground")}>
      {icon}{label}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 pb-4" onDragOver={(e) => over(e, null)}>
      {layout.loose.length > 0 && zone(null, layout.loose, "flex flex-wrap gap-x-12 gap-y-8", cards(null, layout.loose))}

      {(shownGroups.length > 0 || (isGM && dragging)) && (
        <div className="flex flex-wrap items-start gap-6">
          {shownGroups.map((g, gi) => zone(g.id!, g.ids,
            cn("flex min-w-64 flex-col gap-4 rounded-xl border bg-muted/20 p-4 transition-colors",
              dragging && target?.group === g.id && "border-primary bg-primary/5"),
            <>
              <GroupHeader name={g.name} count={g.ids.length} isGM={isGM}
                monsters={g.ids.filter((iid) => byId.get(iid)?.character.kind !== "pj")}
                onRename={(name) => commit({ ...layout, groups: layout.groups.map((o) => (o.id === g.id ? { ...o, name } : o)) })}
                onMove={(step) => {
                  const next = [...layout.groups];
                  [next[gi], next[gi + step]] = [next[gi + step], next[gi]];
                  commit({ ...layout, groups: next });
                }}
                canMoveBefore={gi > 0} canMoveAfter={gi < layout.groups.length - 1}
                onVisibility={(v) => onGroupVisibility(g.ids.filter((iid) => byId.get(iid)?.character.kind !== "pj"), v)}
                onDissolve={() => commit({ loose: [...layout.loose, ...g.ids], groups: layout.groups.filter((o) => o.id !== g.id) })} />
              {g.ids.length > 0 ? (
                <div className="flex flex-wrap gap-x-12 gap-y-8">{cards(g.id!, g.ids)}</div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Glisse des cartes ici</p>
              )}
            </>,
          ))}
          {isGM && dragging && layout.loose.length === 0 && dropZone({ group: null, index: 0 }, <Ungroup className="size-5" />, "Hors groupe")}
          {isGM && dragging && dropZone({ group: "new", index: 0 }, <FolderPlus className="size-5" />, "Nouveau groupe")}
        </div>
      )}
    </div>
  );
}

/** Ajoute un groupe vide (MJ) : les cartes y sont ensuite glissées. */
export function newGroupLayout(instances: Instance[], groups: RoomGroup[]): Layout {
  const layout = layoutOf(instances, groups);
  return { ...layout, groups: [...layout.groups, { name: freshName(layout), ids: [] }] };
}

function DropMark({ side }: { side: "left" | "right" }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 z-40 w-1 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]",
      side === "left" ? "-left-6 -translate-x-1/2" : "-right-6 translate-x-1/2")} />
  );
}

type GroupHeaderProps = {
  name: string;
  count: number;
  isGM: boolean;
  /** Monstres du groupe (les PJ sont toujours visibles). */
  monsters: number[];
  onRename: (name: string) => void;
  onMove: (step: -1 | 1) => void;
  canMoveBefore: boolean;
  canMoveAfter: boolean;
  onVisibility: (visibility: InstanceVisibility) => void;
  onDissolve: () => void;
};

/** Nom du groupe (le MJ le renomme d'un clic) et, pour le MJ, ses actions. */
function GroupHeader({
  name, count, isGM, monsters, onRename, onMove, canMoveBefore, canMoveAfter, onVisibility, onDissolve,
}: GroupHeaderProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const save = () => {
    const value = editing?.trim();
    setEditing(null);
    if (value && value !== name) onRename(value.slice(0, 60));
  };
  return (
    <div className="flex items-center gap-2">
      {editing !== null ? (
        <Input autoFocus value={editing} maxLength={60} aria-label="Nom du groupe" className="h-8 flex-1"
          onChange={(e) => setEditing(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(null); }} />
      ) : (
        <h3 className="min-w-0 flex-1 truncate font-heading font-semibold">
          {isGM ? (
            <button type="button" title="Renommer" className="hover:underline" onClick={() => setEditing(name)}>{name}</button>
          ) : name}
        </h3>
      )}
      <Badge variant="secondary">{count}</Badge>
      {isGM && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Actions du groupe"><Ellipsis /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(name)}><Pencil />Renommer</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveBefore} onSelect={() => onMove(-1)}><ChevronLeft />Déplacer avant</DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveAfter} onSelect={() => onMove(1)}><ChevronRight />Déplacer après</DropdownMenuItem>
            {monsters.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onVisibility("cache")}><EyeOff />Cacher les monstres</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onVisibility("visible")}><Eye />Montrer les monstres</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onVisibility("revele")}><ScanEye />Révéler les monstres</DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDissolve}><Ungroup />Dissoudre le groupe</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
