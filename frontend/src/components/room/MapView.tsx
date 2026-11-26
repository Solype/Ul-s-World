import { Eye, EyeOff, Trash2, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { CharacterKind, Instance, MapSummary, MapToken, RoomMap } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { insidePolygon, visibilityPolygon, type Point, type Segment } from "@/lib/vision";

type Props = {
  roomId: number;
  map: RoomMap;
  instances: Instance[];
  isGM: boolean;
  /** Le MJ déplace tout le monde ; un membre, les PJ. */
  canMove: (i: Instance) => boolean;
  /** `null` : retirer le pion de la carte. */
  onMove: (instanceId: number, x: number | null, y: number | null) => Promise<void>;
  onDoor: (doorId: number, closed: boolean) => void;
};

const COLORS: Record<CharacterKind, string> = { pj: "#2563eb", pnj: "#d97706", monstre: "#dc2626" };
// Zones déjà vues pendant la séance (perdues au rechargement de la page).
const EXPLORED_MAX = 300;
/** Centre de la case qui contient v. */
const snap = (v: number, size: number) => Math.min(Math.max(Math.floor(v) + 0.5, 0.5), Math.max(size - 0.5, 0.5));
const svgPoints = (p: Point[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
const tokenLabel = (i: Instance) => `${i.character.name.slice(0, 2)}${i.number ?? ""}`;
const fullName = (i: Instance) => `${i.character.name}${i.number ? ` ${i.number}` : ""}`;

/**
 * Carte de la room : image, portes, pions. Brouillard pour les joueurs (et le MJ en « vue des joueurs ») :
 * ce que voient l'ensemble des PJ posés, le reste noir, le déjà vu assombri. Les pions hors de vue n'arrivent
 * pas aux joueurs (filtrés par le serveur). On glisse un pion pour le déplacer, ou on le choisit sous la carte
 * puis on touche une case. La carte défile au doigt, le zoom est aux boutons.
 */
export default function MapView({ roomId, map, instances, isGM, canMove, onMove, onDoor }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const maskId = useId();
  const [cell, setCell] = useState(0); // pixels par case
  const [playerView, setPlayerView] = useState(false);
  const [placing, setPlacing] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
  const [explored, setExplored] = useState<string[]>([]);

  // Toute la largeur à l'ouverture (le parent recrée la vue à chaque autre carte : `key`).
  useLayoutEffect(() => { if (box.current) setCell(box.current.clientWidth / map.width); }, [map.width]);

  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  const placed = map.tokens.filter((t) => byId.has(t.instance_id));
  const fog = !isGM || playerView;
  const walls = useMemo(() => [...map.walls, ...map.doors.filter((d) => d.closed).map((d) => [...d.a, ...d.b])] as Segment[],
    [map.walls, map.doors]);
  // Vision recalculée quand un pion est posé, pas pendant qu'on le glisse.
  const viewers = placed.filter((t) => byId.get(t.instance_id)?.character.kind === "pj").map((t) => `${t.x},${t.y}`).join(";");
  const seen = useMemo(() => !fog || !viewers ? [] : viewers.split(";").map((v) => {
    const [x, y] = v.split(",").map(Number);
    return visibilityPolygon(x, y, walls, map.width, map.height);
  }), [fog, viewers, walls, map.width, map.height]);
  useEffect(() => {
    if (seen.length) setExplored((prev) => [...new Set([...prev, ...seen.map(svgPoints)])].slice(-EXPLORED_MAX));
  }, [seen]);

  const tokens = placed
    .map((t) => (drag?.id === t.instance_id ? { ...t, x: drag.x, y: drag.y } : t))
    // Vue des joueurs du MJ : comme le serveur pour eux, sans les cachés ni ce qu'aucun PJ ne voit.
    .filter((t) => {
      const i = byId.get(t.instance_id)!;
      return !(isGM && playerView) || i.character.kind === "pj"
        || (i.visibility !== "cache" && seen.some((p) => insidePolygon([t.x, t.y], p)));
    });

  const toMap = (e: { clientX: number; clientY: number }) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  };
  const grab = (e: PointerEvent, t: MapToken) => {
    if (!canMove(byId.get(t.instance_id)!)) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: t.instance_id, x: t.x, y: t.y });
  };
  const drop = async () => {
    if (!drag) return;
    const before = map.tokens.find((t) => t.instance_id === drag.id);
    const x = snap(drag.x, map.width), y = snap(drag.y, map.height);
    if (before && (before.x !== x || before.y !== y)) await onMove(drag.id, x, y);
    setDrag(null);
  };
  const place = async (e: MouseEvent) => {
    if (placing === null) return;
    const id = placing, p = toMap(e);
    setPlacing(null);
    await onMove(id, snap(p.x, map.width), snap(p.y, map.height));
  };

  const W = map.width, H = map.height;
  const movable = instances.filter(canMove);
  const placingName = placing !== null && byId.has(placing) ? fullName(byId.get(placing)!) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Zoom arrière" onClick={() => setCell((c) => c / 1.25)}><ZoomOut /></Button>
        <Button variant="outline" size="icon-sm" aria-label="Zoom avant" onClick={() => setCell((c) => c * 1.25)}><ZoomIn /></Button>
        {isGM && (
          <Button variant={playerView ? "secondary" : "ghost"} size="sm" onClick={() => setPlayerView((v) => !v)}
            title="Ce que voient les joueurs : la vision de leurs PJ posés sur la carte">
            {playerView ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}Vue des joueurs
          </Button>
        )}
        {placingName && (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            Touche une case pour poser {placingName}
            <Button variant="ghost" size="icon-xs" aria-label="Annuler" onClick={() => setPlacing(null)}><X /></Button>
          </span>
        )}
      </div>

      <div ref={box} className="max-h-[75svh] overflow-auto rounded-lg border bg-neutral-950">
        <svg ref={svg} width={W * cell} height={H * cell} viewBox={`0 0 ${W} ${H}`} className={cn("block", placing !== null && "cursor-crosshair")}
          onClick={place} onPointerMove={(e) => drag && setDrag({ ...drag, ...toMap(e) })}
          onPointerUp={drop} onPointerCancel={() => setDrag(null)} onContextMenu={(e) => e.preventDefault()}>
          <image href={`/api/rooms/${roomId}/maps/${map.id}/image`} width={W} height={H} preserveAspectRatio="none" />
          {map.doors.map((d) => (
            <g key={d.id} className={cn(isGM && "cursor-pointer")}
              onClick={isGM ? (e) => { e.stopPropagation(); onDoor(d.id, !d.closed); } : undefined}>
              <title>{`Porte ${d.closed ? "fermée" : "ouverte"}${isGM ? " : clic pour l'ouvrir ou la fermer" : ""}`}</title>
              <line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="transparent" strokeWidth={0.6} />
              <line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} strokeLinecap="round" strokeWidth={0.18}
                stroke={d.closed ? "#b45309" : "#22c55e"} strokeDasharray={d.closed ? undefined : "0.2 0.15"} />
            </g>
          ))}
          {fog && (
            <>
              <mask id={maskId}>
                <rect width={W} height={H} fill="white" />
                <g opacity={0.45}>{explored.map((p) => <polygon key={p} points={p} fill="black" />)}</g>
                {seen.map((p, n) => <polygon key={n} points={svgPoints(p)} fill="black" />)}
              </mask>
              <rect width={W} height={H} fill="black" mask={`url(#${maskId})`} pointerEvents="none" />
            </>
          )}
          {tokens.map((t) => {
            const i = byId.get(t.instance_id)!;
            const movableToken = canMove(i);
            return (
              <g key={t.instance_id} transform={`translate(${t.x} ${t.y})`} opacity={i.visibility === "cache" ? 0.5 : 1}
                className={cn(movableToken && "cursor-grab")} style={movableToken ? { touchAction: "none" } : undefined}
                onPointerDown={(e) => grab(e, t)}>
                <title>{fullName(i)}{i.visibility === "cache" ? " (caché aux joueurs)" : ""}</title>
                <circle r={0.42} fill={COLORS[i.character.kind]} strokeWidth={0.06}
                  stroke={drag?.id === t.instance_id ? "#facc15" : "white"} />
                <text fontSize={0.3} textAnchor="middle" dominantBaseline="central" fill="white" pointerEvents="none"
                  className="select-none">{tokenLabel(i)}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {movable.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {movable.map((i) => {
            const on = map.tokens.some((t) => t.instance_id === i.id);
            return (
              <span key={i.id} className="inline-flex items-center">
                <Button size="xs" variant={placing === i.id ? "default" : "outline"}
                  title={on ? "Déplacer : choisis puis touche une case" : "Poser sur la carte : choisis puis touche une case"}
                  onClick={() => setPlacing(placing === i.id ? null : i.id)}>
                  <span className="size-2 rounded-full" style={{ background: COLORS[i.character.kind] }} />
                  {fullName(i)}{!on && " (hors carte)"}
                </Button>
                {on && (
                  <Button variant="ghost" size="icon-xs" aria-label={`Retirer ${fullName(i)} de la carte`} title="Retirer de la carte"
                    onClick={() => onMove(i.id, null, null)}><X /></Button>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** MJ : la carte qu'il regarde (parmi toutes), la montrer aux joueurs ou non, la supprimer. */
export function MapPicker({ maps, mapId, onPick, onShow, onDelete }: {
  maps: MapSummary[]; mapId: number; onPick: (id: number) => void; onShow: (active: boolean) => void; onDelete: () => void;
}) {
  const shown = maps.find((m) => m.id === mapId)?.active ?? false;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={String(mapId)} onValueChange={(v) => onPick(Number(v))}>
        <SelectTrigger className="min-w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          {maps.map((m) => (
            <SelectItem key={m.id} value={String(m.id)}>{m.name}{m.active && " · montrée aux joueurs"}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant={shown ? "secondary" : "outline"} size="sm" onClick={() => onShow(!shown)}
        title={shown ? "Les joueurs n'auront plus de carte" : "Elle remplace la carte que voient les joueurs"}>
        {shown ? <><EyeOff data-icon="inline-start" />Ne plus montrer</> : <><Eye data-icon="inline-start" />Montrer aux joueurs</>}
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Supprimer la carte" title="Supprimer la carte" onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  );
}

/** MJ : ajouter une carte, un fichier Universal VTT. Pas de filtre d'extension : le sélecteur d'Android griserait le .dd2vtt. */
export function MapUploadButton({ onUpload }: { onUpload: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={input} type="file" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = ""; // pour pouvoir renvoyer le même fichier
        if (file) onUpload(file);
      }} />
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}
        title="Export « Universal VTT » de Dungeon Alchemist (.dd2vtt) : image, murs et portes">
        <Upload data-icon="inline-start" />Ajouter une carte
      </Button>
    </>
  );
}
