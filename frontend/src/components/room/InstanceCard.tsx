import {
  ChevronLeft, ChevronRight, Eye, EyeOff, FileText, FolderPlus, GripVertical, Minus, Move, Pin, Plus, RefreshCw,
  ScanEye, Shield, Skull, Trash2, Ungroup, X, type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Instance, InstanceVisibility, MonitorDef, RoomGroup } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import DamagePopover, { type DamageInput } from "./DamagePopover";
import StatusTags, { COLORS, type StatusActions, type StatusSuggestion } from "./StatusTags";

/** Couleur de chaque moniteur de condition (clés : rules/monitors.py MONITORS), de l'anneau extérieur vers le centre. */
const RING_COLORS: Record<string, { stroke: string; glow: string; dot: string }> = {
  physique: { stroke: "stroke-red-500", glow: "drop-shadow-[0_0_3px_var(--color-red-500)]", dot: "bg-red-500" },
  mental: { stroke: "stroke-violet-500", glow: "drop-shadow-[0_0_3px_var(--color-violet-500)]", dot: "bg-violet-500" },
  pathologique: { stroke: "stroke-emerald-500", glow: "drop-shadow-[0_0_3px_var(--color-emerald-500)]", dot: "bg-emerald-500" },
  endurance: { stroke: "stroke-amber-400", glow: "drop-shadow-[0_0_3px_var(--color-amber-400)]", dot: "bg-amber-400" },
};
const DEFAULT_RING = { stroke: "stroke-primary", glow: "", dot: "bg-primary" };

/** Géométrie du jeton (unités du viewBox) : anneaux concentriques ouverts en bas (arc de 270°). */
const SIZE = 120;
const C = SIZE / 2;
const OUTER_R = 54;
const RING_STEP = 10;
const STROKE = 7;
/** Au-delà, les cases d'un anneau seraient trop fines pour être lisibles. */
const MAX_TICKS = 30;
/** Statuts pendus au jeton replié ; les autres sont résumés par « +n ». */
const MAX_HANGING = 4;
/** Délai avant de replier la carte quand la souris sort (évite le clignotement en bordure). */
const LEAVE_DELAY_MS = 150;
/** Marge minimale (px) entre la carte dépliée et le bord de l'écran. */
const EDGE = 8;

type Monitor = { current: number; max: number };

type Props = {
  instance: Instance;
  /** Définitions des moniteurs (GET /api/rules), dans l'ordre d'affichage. */
  defs: Record<string, MonitorDef>;
  canEdit: boolean;
  isGM: boolean;
  /** Statuts déjà utilisés dans la room (suggestions). */
  statusSuggestions: StatusSuggestion[];
  statusActions: StatusActions;
  onDelta: (monitor: string, delta: number) => void;
  onSet: (monitor: string, value: number) => void;
  /** Infliger une attaque (armure et pénétration) ; vrai si elle est passée. */
  onDamage: (input: DamageInput) => Promise<boolean>;
  /** Ajouter `delta` à une ressource d'un dieu (valeur propre à la room). */
  onGodResource: (god: string, name: string, delta: number) => void;
  onResync: () => void;
  /** Absent : fiche illisible pour ce compte (monstre du MJ hors de la room, vu par un joueur). */
  onSheet?: () => void;
  /** MJ, pour un monstre : cacher, montrer ou révéler aux joueurs. */
  onVisibility?: (visibility: InstanceVisibility) => void;
  /** MJ : retirer cet exemplaire du jeu (monstre), ou le personnage de la room (PJ). */
  onRemove?: () => void;
  /** MJ : ranger la carte dans la room (glisser-déposer par la poignée, ou menu). */
  arrange?: Arrange;
};

/** Rangement d'une carte par le MJ. */
export type Arrange = {
  /** Mime type des données glissées (et seulement celui-là : déposée dans le chat, la carte n'y écrit rien). */
  dragType: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** Déplacer d'un cran dans son groupe (absent au bout). */
  onMoveBefore?: () => void;
  onMoveAfter?: () => void;
  groups: RoomGroup[];
  /** Groupe actuel (null : hors groupe). */
  groupId: number | null;
  /** Mettre la carte dans un groupe, hors groupe (null) ou dans un nouveau groupe. */
  onGroup: (group: number | null | "new") => void;
};

/** Ce que voient les joueurs (le MJ voit toujours tout). */
const VISIBILITY: Record<InstanceVisibility, { label: string; hint: string; icon: LucideIcon }> = {
  cache: { label: "Caché", hint: "Seul le MJ le voit", icon: EyeOff },
  visible: { label: "Visible", hint: "Tout le monde le voit, sans ses moniteurs", icon: Eye },
  revele: { label: "Révélé", hint: "Tout est révélé", icon: ScanEye },
};

/** Arc de 270° de rayon r, du bas-gauche au bas-droit en passant par le haut. */
function arcPath(r: number) {
  const d = r * Math.SQRT1_2;
  return `M ${C - d} ${C + d} A ${r} ${r} 0 1 1 ${C + d} ${C + d}`;
}

/** Le jeton : un anneau par moniteur de condition, l'initiale (ou un crâne si un moniteur est brisé) au centre. */
function Token({ name, rings, defs, className, onClick, unknown, armor }: {
  name: string; rings: [string, Monitor][]; defs: Record<string, MonitorDef>; className?: string; onClick?: () => void;
  /** Moniteurs non révélés (monstre visible, vu par un joueur) : un « ? » au centre, sans anneaux. */
  unknown?: boolean;
  /** Armure naturelle d'un monstre, en écusson. */
  armor?: number | null;
}) {
  const broken = rings.some(([, m]) => m.max > 0 && m.current === 0);
  return (
    <button type="button" onClick={onClick} aria-label={`Détails de ${name}`}
      className={cn("relative block size-[120px] shrink-0 rounded-full", className)}>
      <span className="absolute inset-2 rounded-full bg-radial from-primary/15 via-card to-card shadow-[inset_0_0_12px_-2px] shadow-primary/40 ring-1 ring-primary/30" />
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative size-full" aria-hidden>
        {rings.map(([k, m], i) => {
          const r = OUTER_R - i * RING_STEP;
          const path = arcPath(r);
          const color = RING_COLORS[k] ?? DEFAULT_RING;
          // Séparateurs de cases d'environ 1,5 unité, centrés sur chaque limite de point.
          const gap = m.max > 0 ? 1.5 / ((1.5 * Math.PI * r) / m.max) : 0;
          return (
            <g key={k}>
              <title>{`${defs[k]?.label ?? k} : ${m.current} / ${m.max}${m.current > m.max ? ` (+${m.current - m.max})` : ""}`}</title>
              <path d={path} fill="none" strokeWidth={STROKE} strokeLinecap="round" className="stroke-foreground/10" />
              {m.max > 0 && m.current > 0 && (
                <path d={path} fill="none" strokeWidth={STROKE} strokeLinecap="round" pathLength={m.max}
                  strokeDasharray={`${Math.min(m.current, m.max)} ${m.max + 1}`}
                  className={cn("transition-[stroke-dasharray] duration-500", color.stroke, color.glow)} />
              )}
              {m.max > 1 && m.max <= MAX_TICKS && (
                <path d={path} fill="none" strokeWidth={STROKE + 1} pathLength={m.max} className="stroke-card"
                  strokeDasharray={`${gap} ${1 - gap}`} strokeDashoffset={gap / 2} />
              )}
              {/* Au-delà du max : un filet lumineux repart du début de l'anneau, un point par point de dépassement. */}
              {m.max > 0 && m.current > m.max && (
                <path d={path} fill="none" strokeWidth={2.5} strokeLinecap="round" pathLength={m.max}
                  strokeDasharray={`${Math.min(m.current - m.max, m.max)} ${m.max + 1}`}
                  className="stroke-white drop-shadow-[0_0_3px_white] transition-[stroke-dasharray] duration-500 dark:stroke-yellow-100" />
              )}
            </g>
          );
        })}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {unknown
          ? <span className="font-heading text-3xl font-bold text-muted-foreground/60">?</span>
          : broken
          ? <Skull className="size-5 animate-pulse text-destructive drop-shadow-[0_0_4px_var(--color-red-500)]" />
          : <span className="font-heading text-lg font-bold text-primary/80">{name.charAt(0).toLocaleUpperCase()}</span>}
      </span>
      {armor != null && (
        <span title={`Armure naturelle : ${armor}`}
          className="absolute top-0 left-0 flex size-7 items-center justify-center text-slate-600 dark:text-slate-300">
          <Shield className="absolute size-7 fill-card" />
          <span className="relative text-[0.65rem] font-bold tabular-nums">{armor}</span>
        </span>
      )}
    </button>
  );
}

/** Barre de mana façon MOBA : cadre doré, remplissage bleu brillant, une case par point. Négatif, la barre
 * se remplit de rouge (un max de dette au plus). */
function ManaBar({ mana, large }: { mana: Monitor; large?: boolean }) {
  const ratio = mana.max > 0 ? Math.min(1, Math.abs(mana.current) / mana.max) : 0;
  const negative = mana.current < 0;
  return (
    <div role="meter" aria-label="Mana" aria-valuemax={mana.max} aria-valuenow={mana.current}
      title={`Mana : ${mana.current} / ${mana.max}`}
      className={cn("relative w-full overflow-hidden rounded-[3px] border border-black/70 bg-slate-950 ring-1",
        negative ? "ring-red-600/80" : "ring-amber-600/60", large ? "h-4" : "h-2.5")}>
      <div className={cn("h-full transition-[width] duration-500", negative
        ? "bg-linear-to-b from-red-400 via-red-600 to-red-900 shadow-[0_0_6px_var(--color-red-500)]"
        : "bg-linear-to-b from-sky-300 via-blue-500 to-blue-800 shadow-[0_0_6px_var(--color-sky-400)]")}
        style={{ width: `${ratio * 100}%` }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[40%] bg-white/25" />
      {mana.max > 1 && mana.max <= MAX_TICKS && (
        <div className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "linear-gradient(to right, rgb(0 0 0 / 0.55) 1px, transparent 1px)", backgroundSize: `${100 / mana.max}% 100%` }} />
      )}
      {large && (
        <span className="absolute inset-0 flex items-center justify-center text-[0.65rem] font-bold tabular-nums text-white [text-shadow:0_1px_2px_black]">
          {mana.current} / {mana.max}
        </span>
      )}
    </div>
  );
}

/** Ligne détaillée d'un moniteur (carte dépliée) : intitulé, − valeur +. Un moniteur de condition reste à 0 ou
 * plus mais peut dépasser son max ; le mana reste au plus à son max mais peut être négatif (comme le serveur). */
function MonitorRow({ label, dot, monitor: { current, max }, mana, canEdit, onDelta, onSet }: {
  label: string; dot: string; monitor: Monitor; mana?: boolean; canEdit: boolean;
  onDelta: (d: number) => void; onSet: (v: number) => void;
}) {
  const [low, high] = mana ? [-Infinity, max] : [0, Infinity];
  // Saisie directe de la valeur ; resynchronisée quand la valeur change (autre joueur, temps réel).
  const [draft, setDraft] = useState(String(current));
  useEffect(() => setDraft(String(current)), [current]);
  const commit = () => {
    const v = Number(draft);
    if (draft.trim() !== "" && Number.isInteger(v) && v !== current) onSet(Math.max(low, Math.min(high, v)));
    else setDraft(String(current));
  };
  const broken = max > 0 && (mana ? current <= 0 : current === 0);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn("size-2.5 shrink-0 rounded-full", dot)} />
      <span className={cn("flex-1 font-heading font-semibold", broken && "text-destructive")}>{label}</span>
      {broken && <Skull className="size-3.5 text-destructive" aria-label="brisé" />}
      {canEdit && (
        <Button variant="ghost" size="icon-xs" aria-label={`${label} -1`} disabled={current <= low}
          onClick={() => onDelta(-1)}><Minus /></Button>
      )}
      {/* Au-delà du max : en vert ; mana négatif : en rouge. */}
      <span className={cn("flex items-baseline tabular-nums", current > max && "text-emerald-600 dark:text-emerald-400",
        current < 0 && "text-destructive")}>
        {canEdit ? (
          // Mana : clavier texte, le pavé numérique des téléphones n'a pas toujours le signe moins.
          <input aria-label={`${label} actuel`} inputMode={mana ? "text" : "numeric"}
            className="w-8 rounded-sm bg-transparent text-right font-semibold outline-none focus:bg-background focus:ring-1 focus:ring-ring"
            value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        ) : <span className="font-semibold">{current}</span>}
        <span className="w-8 text-muted-foreground">/{max}</span>
      </span>
      {canEdit && (
        <Button variant="ghost" size="icon-xs" aria-label={`${label} +1`} disabled={current >= high}
          onClick={() => onDelta(1)}><Plus /></Button>
      )}
    </div>
  );
}

/** Ressource propre à un dieu : valeur de la room, entre 0 et son max s'il y en a un. */
function GodResourceRow({ god, name, value, max, canEdit, onDelta }: {
  god: string; name: string; value: number; max?: number | null; canEdit: boolean; onDelta: (d: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm" title={god}>
      <span className="min-w-0 flex-1 truncate">{name} <span className="text-xs text-muted-foreground">· {god}</span></span>
      {canEdit && (
        <Button variant="ghost" size="icon-xs" aria-label={`${name} -1`} disabled={value <= 0}
          onClick={() => onDelta(-1)}><Minus /></Button>
      )}
      <span className="tabular-nums">
        <span className="font-semibold">{value}</span>
        {max != null && <span className="text-muted-foreground">/{max}</span>}
      </span>
      {canEdit && (
        <Button variant="ghost" size="icon-xs" aria-label={`${name} +1`} disabled={max != null && value >= max}
          onClick={() => onDelta(1)}><Plus /></Button>
      )}
    </div>
  );
}

/** Cartouche du nom. */
function Nameplate({ name, outdated, monster, hidden }: { name: string; outdated?: boolean; monster?: boolean; hidden?: boolean }) {
  return (
    <div className={cn("relative rounded-sm border bg-linear-to-b from-card px-3 py-1 text-center shadow-sm ring-1 ring-offset-1 ring-offset-card",
      monster ? "border-red-800/50 to-red-950/10 ring-red-800/15 dark:border-red-400/40" : "border-primary/50 to-secondary ring-primary/15",
      hidden && "border-dashed")}>
      <span className={cn("flex items-center justify-center gap-1 truncate font-heading text-sm font-semibold",
        monster ? "text-red-900 dark:text-red-300" : "text-primary")}>
        {hidden && <EyeOff className="size-3.5 shrink-0" aria-label="caché aux joueurs" />}
        <span className="truncate">{name}</span>
      </span>
      {outdated && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-warning ring-2 ring-card" title="La fiche a changé depuis l'entrée en jeu" />}
    </div>
  );
}

/** Ranger la carte sans glisser-déposer (écran tactile, clavier) : d'un cran, ou dans un autre groupe. */
function ArrangeMenu({ arrange }: { arrange: Arrange }) {
  const { onMoveBefore, onMoveAfter, groups, groupId, onGroup } = arrange;
  return (
    // Non modal : un menu modal coupe la souris du reste de la page, la carte se replierait et l'emporterait.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Ranger" title="Déplacer, grouper"><Move /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={!onMoveBefore} onSelect={onMoveBefore}><ChevronLeft />Déplacer avant</DropdownMenuItem>
        <DropdownMenuItem disabled={!onMoveAfter} onSelect={onMoveAfter}><ChevronRight />Déplacer après</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Groupe</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={String(groupId ?? "")}
          onValueChange={(v) => onGroup(v === "" ? null : Number(v))}>
          <DropdownMenuRadioItem value=""><Ungroup />Hors groupe</DropdownMenuRadioItem>
          {groups.map((g) => <DropdownMenuRadioItem key={g.id} value={String(g.id)}>{g.name}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <DropdownMenuItem onSelect={() => onGroup("new")}><FolderPlus />Nouveau groupe</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Un personnage en jeu, sous forme de jeton : cartouche du nom, barre de mana, anneaux des moniteurs de
 * condition et statuts pendus au jeton. Au survol de la souris, ou ouverte d'un clic (tap) sur le jeton, la carte se
 * déplie par-dessus ses voisines avec les valeurs, la modification et la gestion des statuts. Ouverte, elle se
 * referme d'un clic en dehors ou sur ✕ : pas d'épingle à retirer sur téléphone.
 */
export default function InstanceCard({
  instance, defs, canEdit, isGM, statusSuggestions, statusActions, onDelta, onSet, onDamage, onGodResource, onResync, onSheet,
  onVisibility, onRemove, arrange,
}: Props) {
  const c = instance.character;
  const isMonster = c.kind === "monstre";
  const isPC = c.kind === "pj";
  const visibility = instance.visibility ?? "revele";
  // Plusieurs exemplaires du même monstre : « Loup 2 ».
  const name = instance.number ? `${c.name} ${instance.number}` : c.name;
  // Monstre visible mais pas révélé : le serveur n'a pas envoyé ses moniteurs au joueur.
  const unknown = !isGM && visibility === "visible";
  const hiddenFromPlayers = isGM && visibility === "cache";
  const keys = Object.keys(defs).filter((k) => k in instance.monitors);
  const rings = keys.filter((k) => k !== "mana").map((k) => [k, instance.monitors[k]] as [string, Monitor]);
  const mana = instance.monitors.mana as Monitor | undefined;
  const statuses = instance.statuses ?? [];

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  // Glissée par sa poignée : la carte dépliée s'efface (sans quitter le DOM, sinon le navigateur annule le glisser)
  // pour laisser voir où la déposer ; le jeton replié reste en place, estompé.
  const [dragging, setDragging] = useState(false);
  const dragImage = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const expanded = hovered || focused || open;
  const close = () => { setOpen(false); setHovered(false); setFocused(false); };

  // Ouverte, un pointeur posé hors de la carte la referme. Les popovers de la carte (rendus en portail) remontent
  // l'arbre React jusqu'à elle : `onPointerDownCapture` marque l'évènement avant qu'il n'atteigne `document`.
  const pointerInside = useRef(false);
  useEffect(() => {
    if (!open) return;
    pointerInside.current = false; // le tap qui vient d'ouvrir la carte ne compte pas
    const onPointerDown = () => {
      if (!pointerInside.current) close();
      pointerInside.current = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // La carte dépliée, plus large que le jeton, est centrée sur lui : au bord de l'écran (téléphone), on la décale
  // pour qu'elle y reste entière. Mesure par le centre, que l'animation d'ouverture (zoom) ne déplace pas.
  const overlay = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = overlay.current;
    if (!expanded || !el) { setShift(0); return; }
    const r = el.getBoundingClientRect();
    const left = r.left + r.width / 2 - el.offsetWidth / 2 - shift;
    const right = left + el.offsetWidth;
    const screen = document.documentElement.clientWidth;
    setShift(left < EDGE ? EDGE - left : right > screen - EDGE ? screen - EDGE - right : 0);
  }, [expanded]); // seulement à l'ouverture

  return (
    // Les évènements des popovers (rendus en portail) remontent l'arbre React : la carte reste dépliée pendant leur usage.
    // Survol à la souris seulement : sur écran tactile, le tap émule un survol qui ne se termine jamais.
    <div className="relative w-56"
      onPointerDownCapture={() => { pointerInside.current = true; }}
      onPointerEnter={(e) => { if (e.pointerType !== "mouse") return; clearTimeout(leaveTimer.current); setHovered(true); }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        leaveTimer.current = setTimeout(() => setHovered(false), LEAVE_DELAY_MS);
      }}
      onFocus={(e) => setFocused(e.target instanceof HTMLInputElement)} onBlur={() => setFocused(false)}>
      {/* Jeton replié : il garde sa place dans la grille même quand la carte dépliée le recouvre. */}
      {/* Caché aux joueurs : le MJ le voit estompé. */}
      <div className={cn("flex flex-col gap-1.5 transition-opacity", hiddenFromPlayers && "opacity-55",
        expanded && (dragging ? "opacity-30" : "opacity-0"))} inert={expanded}>
        <Nameplate name={name} outdated={instance.outdated} monster={isMonster} hidden={hiddenFromPlayers} />
        {mana && <ManaBar mana={mana} />}
        <div className="relative mx-auto mt-1 w-[120px]">
          <Token name={c.name} rings={rings} defs={defs} unknown={unknown} armor={instance.natural_armor}
            onClick={() => setOpen(true)} />
          {statuses.slice(0, MAX_HANGING).map((s, i) => {
            // En alternance à droite puis à gauche du jeton, de plus en plus bas ; l'étiquette pend en se balançant.
            const left = i % 2 === 1;
            const angle = 5 + Math.floor(i / 2) * 35;
            const rad = (angle * Math.PI) / 180;
            const dx = 56 * Math.cos(rad);
            const top = C + 56 * Math.sin(rad);
            const hang = angle * 0.5 + 20;
            return (
              <div key={s.id} className={cn("hanging-tag pointer-events-none absolute flex items-center", left && "flex-row-reverse")}
                style={{
                  ...(left ? { right: C + dx, transformOrigin: "100% 50%" } : { left: C + dx }), top,
                  ["--hang" as string]: `${left ? -hang : hang}deg`, animationDelay: `${i * -0.7}s`,
                }}>
                <span className={cn("size-1.5 rounded-full bg-primary/70 ring-1 ring-card", left ? "translate-x-1/2" : "-translate-x-1/2")} />
                <span className="h-px w-2.5 bg-primary/50" />
                <span className={cn("max-w-[5rem] truncate rounded-sm border px-1.5 py-px text-[0.65rem] font-medium shadow-sm",
                  COLORS[s.color ?? "neutre"].badge, s.hidden && "border-dashed opacity-80")}>{s.label}</span>
              </div>
            );
          })}
          {statuses.length > MAX_HANGING && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[0.65rem] text-muted-foreground">+{statuses.length - MAX_HANGING}</span>
          )}
        </div>
      </div>

      {expanded && (
        <div ref={overlay} style={{ marginLeft: shift }}
          className={cn("arcane-card absolute -top-2 left-1/2 z-30 flex w-[min(20rem,calc(100vw_-_1rem))] -translate-x-1/2 flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground ring-1 shadow-xl animate-in fade-in zoom-in-95 duration-150",
          dragging && "pointer-events-none opacity-0")}>
          <div className="flex items-center gap-1">
            {arrange && (
              <span draggable aria-hidden title="Glisser pour déplacer ou grouper"
                className="-ml-1 flex h-7 cursor-grab items-center rounded-md px-0.5 text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
                onDragStart={(e) => {
                  e.dataTransfer.setData(arrange.dragType, String(instance.id));
                  e.dataTransfer.effectAllowed = "move";
                  if (dragImage.current) e.dataTransfer.setDragImage(dragImage.current, C, C);
                  // Après le départ du glisser : changer le DOM dans `dragstart` l'annulerait.
                  setTimeout(() => { setDragging(true); arrange.onDragStart(); });
                }}
                onDragEnd={() => { setDragging(false); setHovered(false); setOpen(false); arrange.onDragEnd(); }}>
                <GripVertical className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <Nameplate name={name} outdated={instance.outdated} monster={isMonster} hidden={hiddenFromPlayers} />
            </div>
            {instance.outdated && canEdit && (
              <Button variant="ghost" size="icon-sm" aria-label="Resynchroniser" onClick={onResync}
                title="Reprendre les max de la fiche (les dégâts subis sont conservés)"><RefreshCw /></Button>
            )}
            {onSheet && <Button variant="ghost" size="icon-sm" aria-label="Fiche" title="Fiche" onClick={onSheet}><FileText /></Button>}
            {arrange && <ArrangeMenu arrange={arrange} />}
            {onRemove && (
              <Button variant="ghost" size="icon-sm" aria-label={isPC ? "Retirer de la room" : "Retirer du jeu"}
                title={isPC ? "Retirer ce personnage de la room" : "Retirer cet exemplaire du jeu"}
                onClick={onRemove}><Trash2 /></Button>
            )}
            {/* Dépliée au survol, l'épingle la garde ouverte quand la souris s'en va ; ouverte, ✕ la referme. */}
            {open ? (
              <Button variant="ghost" size="icon-sm" aria-label="Fermer" title="Fermer" onClick={close}><X /></Button>
            ) : (
              <Button variant="ghost" size="icon-sm" aria-label="Garder ouvert" title="Garder ouvert" onClick={() => setOpen(true)}>
                <Pin />
              </Button>
            )}
          </div>
          <p className="-mt-1 truncate text-center text-xs text-muted-foreground">
            {[c.species, c.owner?.username].filter(Boolean).join(" · ")}
            {instance.outdated && " · fiche modifiée"}
          </p>
          {onVisibility && (
            <div role="radiogroup" aria-label="Visibilité pour les joueurs" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(Object.keys(VISIBILITY) as InstanceVisibility[]).map((v) => {
                const { label, hint, icon: Icon } = VISIBILITY[v];
                const on = visibility === v;
                return (
                  <button key={v} type="button" role="radio" aria-checked={on} title={hint} onClick={() => !on && onVisibility(v)}
                    className={cn("flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                    <Icon className="size-3.5" />{label}
                  </button>
                );
              })}
            </div>
          )}
          {mana && <ManaBar mana={mana} large />}
          {/* Sert aussi d'image au glisser-déposer. */}
          <div ref={dragImage} className="mx-auto">
            <Token name={c.name} rings={rings} defs={defs} unknown={unknown} armor={instance.natural_armor}
              onClick={() => (open ? close() : setOpen(true))} />
          </div>
          {unknown && <p className="text-center text-xs text-muted-foreground">Le MJ n'a pas révélé son état.</p>}
          {instance.natural_armor != null && (
            <p className="text-center text-xs text-muted-foreground">Armure naturelle {instance.natural_armor}</p>
          )}
          <div className="flex flex-col gap-0.5">
            {keys.map((k) => (
              <MonitorRow key={k} label={defs[k].label} monitor={instance.monitors[k]} mana={k === "mana"} canEdit={canEdit}
                dot={k === "mana" ? "bg-sky-500" : (RING_COLORS[k] ?? DEFAULT_RING).dot}
                onDelta={(d) => onDelta(k, d)} onSet={(v) => onSet(k, v)} />
            ))}
          </div>
          {canEdit && !unknown && rings.length > 0 && (
            <DamagePopover monitors={rings.map(([k]) => k)} defs={defs} naturalArmor={instance.natural_armor} onDamage={onDamage} />
          )}
          {/* Ressources propres aux dieux du personnage : la liste vient de la fiche, la valeur est celle de la room. */}
          {(instance.god_resources ?? []).length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Ressources divines</span>
              {(instance.god_resources ?? []).map((r) => (
                <GodResourceRow key={`${r.god}/${r.name}`} {...r} canEdit={canEdit}
                  onDelta={(d) => onGodResource(r.god, r.name, d)} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-primary/50" aria-hidden>
            <span className="h-px flex-1 bg-linear-to-r from-transparent to-primary/40" />
            <span className="text-[0.5rem]">◆</span>
            <span className="h-px flex-1 bg-linear-to-l from-transparent to-primary/40" />
          </div>
          <StatusTags statuses={statuses} canEdit={canEdit} isGM={isGM} suggestions={statusSuggestions} {...statusActions} />
        </div>
      )}
    </div>
  );
}
