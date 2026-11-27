import {
  Box, Eye, EyeOff, Grid3x3, LocateFixed, Map as MapIcon, Maximize, Maximize2, Minimize, Ruler, Trash2, Upload, X, ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type MouseEvent, type PointerEvent,
} from "react";
import type { CharacterKind, Instance, MapSummary, MapToken, RoomMap } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { insidePolygon, visibilityPolygon, type Point, type Segment } from "@/lib/vision";

/** Signal éphémère sur la carte (`room.ping`) : qui l'a lancé dit sa couleur. */
export type MapPingMark = { key: number; x: number; y: number; fromGM: boolean };

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
  /** Pings reçus pour cette carte, encore affichés. */
  pings?: MapPingMark[];
  /** Montrer un endroit de la carte aux autres. */
  onPing?: (x: number, y: number) => void;
  /** Compte connecté : « mon perso » centre la carte sur ses pions. */
  userId?: number;
};

const COLORS: Record<CharacterKind, string> = { pj: "#2563eb", pnj: "#d97706", monstre: "#dc2626" };
// Zones déjà vues : gardées par carte dans le navigateur, pour survivre à un rechargement.
const EXPLORED_MAX = 300;
const CELL_MIN = 4, CELL_MAX = 240; // pixels par case
const CLICK_SLOP = 6; // pixels : au-delà, on fait glisser la carte, ce n'est plus un clic
const LONG_PRESS_MS = 550; // appui long au doigt : ping
const TOUCH_CELL = 34; // pixels par case au moins, à l'ouverture sur écran tactile : un pion se prend au doigt
const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
/** Centre de la case qui contient v. */
const snap = (v: number, size: number) => Math.min(Math.max(Math.floor(v) + 0.5, 0.5), Math.max(size - 0.5, 0.5));
const svgPoints = (p: Point[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
const parsePoints = (s: string) => s.split(" ").map((p) => p.split(",").map(Number) as Point);
const tokenLabel = (i: Instance) => `${i.character.name.slice(0, 2)}${i.number ?? ""}`;
const fullName = (i: Instance) => `${i.character.name}${i.number ? ` ${i.number}` : ""}`;
const clampCell = (c: number) => Math.min(Math.max(c, CELL_MIN), CELL_MAX);

// Three.js (~150 Ko gzip) n'est chargé qu'à la première bascule en 3D.
const MapScene3D = lazy(() => import("./MapScene3D"));
const VIEW_KEY = "newmannheim.map-view";
const GRID_KEY = "newmannheim.map-grid";
const exploredKey = (roomId: number, mapId: number) => `newmannheim.explored.${roomId}.${mapId}`;
const load = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* navigation privée ou stockage plein : non retenu */ }
};
const loadExplored = (key: string): string[] => {
  try {
    const v = JSON.parse(load(key) ?? "[]");
    return Array.isArray(v) ? v.filter((p) => typeof p === "string") : [];
  } catch { return []; }
};

type Gesture =
  | { kind: "pan"; id: number; x: number; y: number; left: number; top: number; moved: boolean }
  | { kind: "pinch"; dist: number; mid: { x: number; y: number } }
  | { kind: "measure"; id: number };

/**
 * Carte de la room : image, grille, portes, pions. Brouillard pour les joueurs (et le MJ en « vue des joueurs ») :
 * ce que voient l'ensemble des PJ posés, le reste noir, le déjà vu assombri (retenu par le navigateur). Les pions
 * hors de vue n'arrivent pas aux joueurs (filtrés par le serveur). On glisse un pion pour le déplacer, ou on le
 * choisit sous la carte puis on touche une case. On glisse le fond pour faire défiler, molette ou pincer pour
 * zoomer ; double-clic ou appui long pour montrer un endroit aux autres ; la règle mesure en cases.
 */
export default function MapView({ roomId, map, instances, isGM, canMove, onMove, onDoor, pings = [], onPing, userId }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const maskId = useId(), gridId = useId();
  const [cell, setCell] = useState(0); // pixels par case
  const cellRef = useRef(0);
  cellRef.current = cell;
  const [playerView, setPlayerView] = useState(false);
  const [placing, setPlacing] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);
  const storeKey = exploredKey(roomId, map.id);
  const [explored, setExplored] = useState<string[]>(() => loadExplored(storeKey));
  const [view, setView] = useState<"2d" | "3d">(() => load(VIEW_KEY) === "3d" ? "3d" : "2d");
  const [grid, setGrid] = useState(() => load(GRID_KEY) === "1");
  const [measuring, setMeasuring] = useState(false);
  const [ruler, setRuler] = useState<{ a: Point; b: Point } | null>(null);
  const toggleView = () => setView((v) => { const next = v === "3d" ? "2d" : "3d"; save(VIEW_KEY, next); return next; });
  const toggleGrid = () => setGrid((g) => { save(GRID_KEY, g ? "0" : "1"); return !g; });
  const [full, setFull] = useState(false); // plein écran (dans la page : l'app Android n'a pas l'API Fullscreen)
  const [info, setInfo] = useState<number | null>(null); // pion touché : son nom s'affiche (pas d'infobulle au doigt)
  const touch = useMemo(coarse, []);

  // Plein écran : la page ne défile plus derrière, et le bouton retour d'Android (historique) le referme.
  useEffect(() => {
    if (!full) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    history.pushState({ mapFull: true }, "");
    const back = () => setFull(false);
    window.addEventListener("popstate", back);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("popstate", back);
      if (history.state?.mapFull) history.back();
    };
  }, [full]);

  // Toute la largeur à l'ouverture et au retour de la 3D (le parent recrée la vue à chaque autre carte : `key`).
  // Au doigt sur un petit écran, toute la largeur rendrait les pions minuscules : on zoome sur son perso.
  const center = useRef<Point | null>(null);
  useLayoutEffect(() => {
    if (!box.current) return;
    const width = box.current.clientWidth / map.width;
    if (touch && width < TOUCH_CELL) {
      setCell(TOUCH_CELL);
      const t = focusTokens()[0];
      center.current = t ? [t.x, t.y] : [map.width / 2, map.height / 2];
    } else setCell(clampCell(width));
  }, [map.width, view]); // seulement à l'ouverture : pas à chaque pion qui bouge

  // Zoom autour d'un point : le point de la carte sous `from` se retrouve sous `to` (pixels écran).
  const anchor = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const zoomAt = useCallback((factor: number, from: { x: number; y: number }, to = from) => {
    const b = box.current, c = cellRef.current;
    if (!b || !c) return;
    const r = b.getBoundingClientRect();
    const next = clampCell(c * factor);
    anchor.current = { mx: (b.scrollLeft + from.x - r.left) / c, my: (b.scrollTop + from.y - r.top) / c,
      ox: to.x - r.left, oy: to.y - r.top };
    cellRef.current = next;
    setCell(next);
  }, []);
  useLayoutEffect(() => {
    const b = box.current, a = anchor.current, c = center.current;
    if (b && c && cell) { // pas au tout premier rendu : la carte n'a pas encore sa taille
      center.current = null;
      b.scrollLeft = c[0] * cell - b.clientWidth / 2;
      b.scrollTop = c[1] * cell - b.clientHeight / 2;
    }
    if (!b || !a) return;
    anchor.current = null;
    b.scrollLeft = a.mx * cell - a.ox;
    b.scrollTop = a.my * cell - a.oy;
  }, [cell]);
  const zoomCenter = (factor: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) zoomAt(factor, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };
  const fit = () => {
    const b = box.current;
    if (!b) return;
    // Plein écran : la boîte a sa hauteur. Sinon elle fait au plus 75 % de l'écran : la carte entière y tient.
    const h = full ? b.clientHeight : Math.min(window.innerHeight * 0.75, window.visualViewport?.height ?? Infinity) - 2;
    setCell(clampCell(Math.min(b.clientWidth / map.width, h / map.height)));
    b.scrollTo(0, 0);
  };

  // Molette (et pincer d'un pavé tactile, qui arrive en molette + Ctrl) : zoom sous le pointeur. Écouteur natif
  // non passif : React n'en pose que des passifs, qui ne peuvent pas empêcher la page de défiler.
  useEffect(() => {
    const b = box.current;
    if (!b || view !== "2d") return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), { x: e.clientX, y: e.clientY });
    };
    b.addEventListener("wheel", wheel, { passive: false });
    return () => b.removeEventListener("wheel", wheel);
  }, [view, zoomAt]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPlacing(null);
      setRuler(null);
      setMeasuring(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const byId = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  const placed = map.tokens.filter((t) => byId.has(t.instance_id));
  /** Pions sur lesquels centrer : ceux de mes PJ (le MJ : tous les PJ), à défaut tous les PJ posés. */
  const focusTokens = () => {
    const pcs = placed.filter((t) => byId.get(t.instance_id)!.character.kind === "pj");
    const mine = isGM ? [] : pcs.filter((t) => byId.get(t.instance_id)!.character.owner?.id === userId);
    return mine.length ? mine : pcs;
  };
  const locateTurn = useRef(0);
  const locate = () => {
    const list = focusTokens(), b = box.current;
    if (!list.length || !b) return;
    const t = list[locateTurn.current++ % list.length];
    b.scrollTo({ left: t.x * cell - b.clientWidth / 2, top: t.y * cell - b.clientHeight / 2, behavior: "smooth" });
    setInfo(t.instance_id);
  };
  useEffect(() => {
    if (info === null) return;
    const timer = window.setTimeout(() => setInfo(null), 2500);
    return () => window.clearTimeout(timer);
  }, [info]);
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
    if (!seen.length) return;
    setExplored((prev) => {
      const next = [...new Set([...prev, ...seen.map(svgPoints)])].slice(-EXPLORED_MAX);
      if (next.length !== prev.length || next.some((p, n) => p !== prev[n])) save(storeKey, JSON.stringify(next));
      return next;
    });
  }, [seen, storeKey]);
  const forgetExplored = () => {
    setExplored([]);
    try { localStorage.removeItem(storeKey); } catch { /* rien à oublier */ }
  };

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
    if (measuring || !canMove(byId.get(t.instance_id)!)) return;
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

  // Gestes sur le fond de la carte : glisser = défiler, deux doigts = zoom, appui long = ping, règle = mesurer.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false); // le clic qui suit un glisser ou un ping ne pose rien
  const pressTimer = useRef(0);
  const cancelPress = () => { window.clearTimeout(pressTimer.current); pressTimer.current = 0; };
  const ping = (p: { x: number; y: number }) => {
    if (onPing && p.x >= 0 && p.y >= 0 && p.x <= map.width && p.y <= map.height) onPing(+p.x.toFixed(2), +p.y.toFixed(2));
  };
  const midpoint = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const pointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelPress();
    if (pointers.current.size === 2) {
      // Deuxième doigt : on zoome, la règle ou le glisser en cours s'arrêtent.
      if (gesture.current?.kind === "measure") setRuler(null);
      gesture.current = { kind: "pinch", ...midpoint() };
      swallowClick.current = true;
      return;
    }
    if (pointers.current.size > 2) return;
    if (measuring) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = toMap(e), a: Point = [snap(p.x, map.width), snap(p.y, map.height)];
      setRuler({ a, b: a });
      gesture.current = { kind: "measure", id: e.pointerId };
      return;
    }
    const b = box.current!;
    gesture.current = { kind: "pan", id: e.pointerId, x: e.clientX, y: e.clientY, left: b.scrollLeft, top: b.scrollTop, moved: false };
    if (e.pointerType !== "mouse" && onPing && placing === null) {
      const at = toMap(e);
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = 0;
        swallowClick.current = true;
        navigator.vibrate?.(25); // sans effet si l'appareil (ou l'app) ne le permet pas
        ping(at);
      }, LONG_PRESS_MS);
    }
  };
  const pointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag) return setDrag({ ...drag, ...toMap(e) });
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g?.kind === "pinch" && pointers.current.size === 2) {
      const { dist, mid } = midpoint();
      zoomAt(dist / g.dist, g.mid, mid);
      gesture.current = { kind: "pinch", dist, mid };
    } else if (g?.kind === "measure" && g.id === e.pointerId) {
      const p = toMap(e);
      setRuler((r) => r && { a: r.a, b: [snap(p.x, map.width), snap(p.y, map.height)] });
    } else if (g?.kind === "pan" && g.id === e.pointerId) {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved && Math.hypot(dx, dy) > CLICK_SLOP) {
        g.moved = true;
        swallowClick.current = true;
        cancelPress();
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (g.moved) {
        box.current!.scrollLeft = g.left - dx;
        box.current!.scrollTop = g.top - dy;
      }
    }
  };
  const pointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (drag) return void drop();
    pointers.current.delete(e.pointerId);
    cancelPress();
    // Un doigt reste après un pincement : il ne défile pas (sa position de départ n'a plus de sens).
    if (gesture.current?.kind !== "pinch" || pointers.current.size === 0) gesture.current = null;
  };
  const pointerCancel = (e: PointerEvent<SVGSVGElement>) => {
    setDrag(null);
    pointers.current.delete(e.pointerId);
    cancelPress();
    gesture.current = null;
  };

  const click = async (e: MouseEvent) => {
    if (swallowClick.current) { swallowClick.current = false; return; }
    if (placing === null) return;
    const id = placing, p = toMap(e);
    setPlacing(null);
    await onMove(id, snap(p.x, map.width), snap(p.y, map.height));
  };

  const W = map.width, H = map.height;
  const movable = instances.filter(canMove);
  const placingName = placing !== null && byId.has(placing) ? fullName(byId.get(placing)!) : null;
  const px = cell ? 1 / cell : 0.02; // un pixel écran, en cases : traits et textes de taille constante

  // Vue 3D : mêmes pions (déjà filtrés), même brouillard ; recalculés seulement quand ils changent.
  const tokenKey = tokens.map((t) => `${t.instance_id}:${t.x}:${t.y}`).join(";");
  const tokens3d = useMemo(() => tokens.map((t) => {
    const i = byId.get(t.instance_id)!;
    return { id: t.instance_id, x: t.x, y: t.y, color: COLORS[i.character.kind], label: tokenLabel(i),
      hidden: i.visibility === "cache", movable: canMove(i) };
  }), [tokenKey, byId]); // `tokens` est un nouveau tableau à chaque rendu : la clé dit s'il a vraiment changé
  const fog3d = useMemo(() => fog ? { seen, explored: explored.map(parsePoints) } : null, [fog, seen, explored]);
  const walls3d = useMemo(() => map.walls as Segment[], [map.walls]);
  const drop3d = async (id: number, x3: number, y3: number) => {
    const before = map.tokens.find((t) => t.instance_id === id);
    const x = snap(x3, W), y = snap(y3, H);
    if (before && (before.x !== x || before.y !== y)) await onMove(id, x, y);
  };
  const ground3d = async (x3: number, y3: number) => {
    if (placing === null) return;
    const id = placing;
    setPlacing(null);
    await onMove(id, snap(x3, W), snap(y3, H));
  };

  const rulerText = ruler && (() => {
    const dx = Math.abs(ruler.b[0] - ruler.a[0]), dy = Math.abs(ruler.b[1] - ruler.a[1]);
    const straight = Math.hypot(dx, dy).toFixed(1).replace(".", ",").replace(",0", "");
    // Cases traversées en comptant une diagonale pour une case, et la distance à vol d'oiseau.
    return `${Math.max(dx, dy)} case${Math.max(dx, dy) > 1 ? "s" : ""} · ${straight} en ligne droite`;
  })();

  // Au doigt : boutons plus grands (cible d'au moins 36 px) ; sur petit écran, icônes seules.
  const tool = "pointer-coarse:size-9";
  const label = "max-sm:sr-only";
  const dragCell = drag && { x: Math.floor(Math.min(Math.max(drag.x, 0), W - 0.01)), y: Math.floor(Math.min(Math.max(drag.y, 0), H - 0.01)) };
  const infoToken = info !== null ? tokens.find((t) => t.instance_id === info) : undefined;

  return (
    <div className={cn("flex flex-col gap-2",
      full && "fixed inset-0 z-50 bg-background p-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-[max(env(safe-area-inset-bottom),0.5rem)]")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" className="pointer-coarse:h-9" onClick={toggleView}
          title={view === "3d" ? "Revenir à la carte à plat" : "Carte en relief : tourner d'un doigt, déplacer à deux, pincer pour zoomer"}>
          {view === "3d" ? <><MapIcon data-icon="inline-start" />2D</> : <><Box data-icon="inline-start" />3D</>}
        </Button>
        <Button variant={full ? "secondary" : "outline"} size="icon-sm" className={tool} aria-pressed={full}
          aria-label={full ? "Quitter le plein écran" : "Plein écran"} title={full ? "Quitter le plein écran" : "Plein écran"}
          onClick={() => setFull((f) => !f)}>{full ? <Minimize /> : <Maximize />}</Button>
        {view === "2d" && <>
          <Button variant="outline" size="icon-sm" className={tool} aria-label="Mon perso" title="Centrer sur mon perso (encore : le suivant)"
            disabled={!placed.some((t) => byId.get(t.instance_id)!.character.kind === "pj")} onClick={locate}><LocateFixed /></Button>
          <Button variant="outline" size="icon-sm" className={tool} aria-label="Zoom arrière" title="Zoom arrière (ou molette, ou pincer)"
            onClick={() => zoomCenter(1 / 1.25)}><ZoomOut /></Button>
          <Button variant="outline" size="icon-sm" className={tool} aria-label="Zoom avant" title="Zoom avant (ou molette, ou pincer)"
            onClick={() => zoomCenter(1.25)}><ZoomIn /></Button>
          <Button variant="outline" size="icon-sm" className={tool} aria-label="Voir toute la carte" title="Voir toute la carte" onClick={fit}>
            <Maximize2 />
          </Button>
          <Button variant={grid ? "secondary" : "ghost"} size="icon-sm" className={tool} aria-label="Grille" aria-pressed={grid}
            title={grid ? "Cacher la grille" : "Afficher la grille"} onClick={toggleGrid}><Grid3x3 /></Button>
          <Button variant={measuring ? "secondary" : "ghost"} size="sm" className="pointer-coarse:h-9" aria-pressed={measuring}
            aria-label="Mesurer" title="Glisser d'une case à une autre pour mesurer la distance (Échap pour arrêter)"
            onClick={() => { setMeasuring((m) => !m); setRuler(null); setPlacing(null); }}>
            <Ruler data-icon="inline-start" /><span className={label}>Mesurer</span>
          </Button>
        </>}
        {isGM && (
          <Button variant={playerView ? "secondary" : "ghost"} size="sm" className="pointer-coarse:h-9" aria-pressed={playerView}
            aria-label="Vue des joueurs" onClick={() => setPlayerView((v) => !v)}
            title="Ce que voient les joueurs : la vision de leurs PJ posés sur la carte">
            {playerView ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}<span className={label}>Vue des joueurs</span>
          </Button>
        )}
        {fog && explored.length > 0 && (
          <Button variant="ghost" size="sm" className="pointer-coarse:h-9" onClick={forgetExplored}
            title="Effacer sur cet appareil les zones déjà vues : seul reste ce que les PJ voient maintenant">
            Oublier le déjà-vu
          </Button>
        )}
      </div>
      {(placingName || measuring) && (
        <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm">
          <span className="flex-1">
            {placingName ? `Touche une case pour poser ${placingName}` : "Glisse d'une case à une autre pour mesurer"}
          </span>
          <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-8" aria-label="Annuler"
            onClick={() => { setPlacing(null); setMeasuring(false); setRuler(null); }}><X /></Button>
        </div>
      )}

      {view === "3d" ? (
        <Suspense fallback={<div className="flex h-[75svh] items-center justify-center rounded-lg border text-sm text-muted-foreground">
          Chargement de la 3D…</div>}>
          <MapScene3D imageUrl={`/api/rooms/${roomId}/maps/${map.id}/image`} width={W} height={H} walls={walls3d}
            doors={map.doors} lights={map.lights} tokens={tokens3d} fog={fog3d} placing={placing !== null}
            onDoor={isGM ? onDoor : undefined} onGround={ground3d} onDrop={drop3d} fill={full} />
        </Suspense>
      ) : (
      <div ref={box} className={cn("overflow-auto overscroll-contain rounded-lg border bg-neutral-950",
        full ? "min-h-0 flex-1" : "max-h-[75svh]")}>
        <svg ref={svg} width={W * cell} height={H * cell} viewBox={`0 0 ${W} ${H}`}
          className={cn("block touch-none select-none [-webkit-touch-callout:none]",
            placing !== null || measuring ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing")}
          onClick={click} onDoubleClick={(e) => { if (placing === null && !measuring) ping(toMap(e)); }}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel}
          onContextMenu={(e) => e.preventDefault()}>
          <image href={`/api/rooms/${roomId}/maps/${map.id}/image`} width={W} height={H} preserveAspectRatio="none" />
          {grid && (
            <>
              <pattern id={gridId} width={1} height={1} patternUnits="userSpaceOnUse">
                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={px} />
              </pattern>
              <rect width={W} height={H} fill={`url(#${gridId})`} pointerEvents="none" />
            </>
          )}
          {map.doors.map((d) => (
            <g key={d.id} className={cn(isGM && !measuring && "cursor-pointer")}
              onClick={isGM && !measuring ? (e) => { e.stopPropagation(); if (!swallowClick.current) onDoor(d.id, !d.closed); swallowClick.current = false; } : undefined}>
              <title>{`Porte ${d.closed ? "fermée" : "ouverte"}${isGM ? " : clic pour l'ouvrir ou la fermer" : ""}`}</title>
              {/* Zone de clic plus large au doigt. */}
              <line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="transparent" strokeWidth={touch ? 1 : 0.6} />
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
          {/* Pendant un glisser, la case d'arrivée : le doigt cache le pion. */}
          {dragCell && <rect x={dragCell.x} y={dragCell.y} width={1} height={1} fill="rgba(250,204,21,0.25)" stroke="#facc15"
            strokeWidth={px * 2} pointerEvents="none" />}
          {tokens.map((t) => {
            const i = byId.get(t.instance_id)!;
            const movableToken = canMove(i) && !measuring;
            const lifted = touch && drag?.id === t.instance_id; // au doigt, le pion glissé passe au-dessus du doigt
            return (
              <g key={t.instance_id} transform={`translate(${t.x} ${t.y - (lifted ? 0.9 : 0)})${lifted ? " scale(1.3)" : ""}`}
                opacity={i.visibility === "cache" ? 0.5 : 1}
                className={cn(movableToken && "cursor-grab")} onPointerDown={(e) => grab(e, t)}
                onClick={() => setInfo(t.instance_id)}>
                <title>{fullName(i)}{i.visibility === "cache" ? " (caché aux joueurs)" : ""}</title>
                {touch && <circle r={0.5} fill="transparent" />}
                <circle r={0.42} fill={COLORS[i.character.kind]} strokeWidth={0.06}
                  stroke={drag?.id === t.instance_id ? "#facc15" : "white"} />
                <text fontSize={0.3} textAnchor="middle" dominantBaseline="central" fill="white" pointerEvents="none">
                  {tokenLabel(i)}</text>
              </g>
            );
          })}
          {infoToken && !drag && (
            <text x={infoToken.x} y={infoToken.y - 0.5 - px * 6} fontSize={px * 14} fontWeight={600} textAnchor="middle"
              fill="white" stroke="black" strokeWidth={px * 3.5} paintOrder="stroke" pointerEvents="none">
              {fullName(byId.get(infoToken.instance_id)!)}
              {byId.get(infoToken.instance_id)!.visibility === "cache" ? " (caché)" : ""}
            </text>
          )}
          {pings.map((p) => (
            <g key={p.key} transform={`translate(${p.x} ${p.y})`} pointerEvents="none"
              stroke={p.fromGM ? "#f43f5e" : "#facc15"} fill="none">
              {[0, 0.5].map((delay) => (
                <circle key={delay} r={0.2} strokeWidth={0.12} opacity={0}>
                  <animate attributeName="r" from="0.2" to="1.6" dur="1.2s" begin={`${delay}s`} repeatCount="2" />
                  <animate attributeName="opacity" from="1" to="0" dur="1.2s" begin={`${delay}s`} repeatCount="2" />
                </circle>
              ))}
              <circle r={0.18} fill={p.fromGM ? "#f43f5e" : "#facc15"} stroke="black" strokeWidth={0.04} />
            </g>
          ))}
          {ruler && rulerText && (
            <g pointerEvents="none">
              <line x1={ruler.a[0]} y1={ruler.a[1]} x2={ruler.b[0]} y2={ruler.b[1]} stroke="black" strokeWidth={px * 5}
                strokeLinecap="round" opacity={0.6} />
              <line x1={ruler.a[0]} y1={ruler.a[1]} x2={ruler.b[0]} y2={ruler.b[1]} stroke="#facc15" strokeWidth={px * 2.5}
                strokeLinecap="round" strokeDasharray={`${px * 8} ${px * 5}`} />
              {[ruler.a, ruler.b].map(([x, y], n) => <circle key={n} cx={x} cy={y} r={px * 5} fill="#facc15" stroke="black" strokeWidth={px} />)}
              {/* Au doigt, le texte au-dessus du doigt plutôt que dessous. */}
              <text x={ruler.b[0]} y={ruler.b[1] - px * (touch ? 48 : 14)} fontSize={px * 15} fontWeight={700} textAnchor="middle"
                fill="white" stroke="black" strokeWidth={px * 3.5} paintOrder="stroke">{rulerText}</text>
            </g>
          )}
        </svg>
      </div>
      )}

      {movable.length > 0 && (
        // Plein écran : une seule ligne qui défile, pour laisser la place à la carte.
        <div className={cn("flex gap-1", full ? "shrink-0 overflow-x-auto pb-1" : "flex-wrap")}>
          {movable.map((i) => {
            const on = map.tokens.some((t) => t.instance_id === i.id);
            return (
              <span key={i.id} className="inline-flex shrink-0 items-center">
                <Button size="xs" className="pointer-coarse:h-9 pointer-coarse:px-3" variant={placing === i.id ? "default" : "outline"}
                  title={on ? "Déplacer : choisis puis touche une case" : "Poser sur la carte : choisis puis touche une case"}
                  onClick={() => { setMeasuring(false); setRuler(null); setPlacing(placing === i.id ? null : i.id); }}>
                  <span className="size-2 rounded-full" style={{ background: COLORS[i.character.kind] }} />
                  {fullName(i)}{!on && " (hors carte)"}
                </Button>
                {on && (
                  <Button variant="ghost" size="icon-xs" className="pointer-coarse:size-9" aria-label={`Retirer ${fullName(i)} de la carte`}
                    title="Retirer de la carte" onClick={() => onMove(i.id, null, null)}><X /></Button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {view === "2d" && !full && (
        <p className="text-xs text-muted-foreground">
          {touch ? "Glisser pour défiler · pincer pour zoomer · toucher un pion pour son nom"
            : "Glisser le fond pour faire défiler · molette ou pincer pour zoomer"}
          {onPing && (touch ? " · appui long pour montrer un endroit" : " · double-clic pour montrer un endroit aux autres")}
        </p>
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
