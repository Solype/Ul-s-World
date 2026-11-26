import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { insidePolygon, type Point, type Segment } from "@/lib/vision";

/** Un pion tel que la vue 2D le dessinerait : déjà filtré (vue des joueurs) et à sa place de glisser. */
export type Token3D = { id: number; x: number; y: number; color: string; label: string; hidden: boolean; movable: boolean };
export type Door3D = { id: number; a: number[]; b: number[]; closed: boolean };

type Props = {
  imageUrl: string;
  width: number;
  height: number;
  walls: Segment[];
  doors: Door3D[];
  tokens: Token3D[];
  /** Brouillard : null = tout voir (MJ). Sinon ce que voient les PJ et ce qu'ils ont déjà vu. */
  fog: { seen: Point[][]; explored: Point[][] } | null;
  /** Mode « poser un pion » : un clic sur le sol donne la case. */
  placing: boolean;
  onDoor?: (doorId: number, closed: boolean) => void;
  onGround: (x: number, y: number) => void;
  /** Fin d'un glisser de pion, à l'endroit lâché (pas encore calé sur la case). */
  onDrop: (id: number, x: number, y: number) => void;
};

// Mesures en cases (1 case = 1 unité 3D). x de la carte -> X, y de la carte -> Z.
const WALL_H = 1.1;
const WALL_T = 0.14;
const DOOR_T = 0.1;
const FOG_PX = 24; // pixels de brouillard par case
const FOG_MAX = 4096;
const CLICK_SLOP = 6; // pixels : au-delà, c'est un glisser de caméra, pas un clic

const WALL_SEEN = new THREE.Color("#8b8276");
const WALL_DIM = new THREE.Color("#3f3b36");

/**
 * Vue 3D isométrique de la carte : l'image au sol, les murs du fichier Universal VTT montés en volume, les portes,
 * les pions debout. Caméra orthographique qu'on tourne (un doigt / clic gauche), déplace (deux doigts / clic droit)
 * et zoome (pincer / molette). Tout l'état (brouillard, vision, pions visibles) vient de la vue 2D : ce composant
 * ne fait que le dessiner, avec les mêmes règles.
 */
export default function MapScene3D(props: Props) {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState<string | null>(null);

  // Scène, caméra et sol : une fois par carte (le parent recrée la vue à chaque autre carte).
  useEffect(() => {
    try {
      const s = createScene(box.current!, props.imageUrl, props.width, props.height, latest);
      scene.current = s;
      return () => { s.dispose(); scene.current = null; };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [props.imageUrl, props.width, props.height]); // le reste passe par `latest`

  const { walls, doors, tokens, fog, placing } = props;
  useEffect(() => { scene.current?.setWalls(walls, doors, fog); }, [walls, doors, fog]);
  useEffect(() => { scene.current?.setTokens(tokens); }, [tokens]);
  useEffect(() => { scene.current?.setFog(fog); }, [fog]);
  useEffect(() => { if (box.current) box.current.style.cursor = placing ? "crosshair" : ""; }, [placing]);

  if (error) {
    return <div className="flex h-[75svh] items-center justify-center rounded-lg border p-4 text-sm text-muted-foreground">
      Vue 3D indisponible sur cet appareil (WebGL) : {error}
    </div>;
  }
  return <div ref={box} className="relative h-[75svh] touch-none overflow-hidden rounded-lg border bg-neutral-950"
    onContextMenu={(e) => e.preventDefault()} />;
}

type Scene = {
  setWalls: (walls: Segment[], doors: Door3D[], fog: Props["fog"]) => void;
  setTokens: (tokens: Token3D[]) => void;
  setFog: (fog: Props["fog"]) => void;
  dispose: () => void;
};

function createScene(el: HTMLDivElement, imageUrl: string, W: number, H: number,
  props: RefObject<Props>): Scene {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0a0a0a");
  const center = new THREE.Vector3(W / 2, 0, H / 2);

  // Caméra isométrique : orthographique, ~50° au-dessus du sol, un peu de biais.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  const dist = Math.max(W, H) * 2;
  camera.position.copy(center).add(new THREE.Vector3(0.35, 1.25, 0.9).normalize().multiplyScalar(dist));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(80); // jamais sous le sol
  controls.minZoom = 0.3;
  controls.maxZoom = 12;
  controls.screenSpacePanning = false; // le déplacement reste parallèle au sol
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

  scene.add(new THREE.HemisphereLight("#ffffff", "#404040", 2.2));
  const sun = new THREE.DirectionalLight("#fff4e0", 1.6);
  sun.position.set(center.x - W * 0.4, Math.max(W, H), center.z - H * 0.6);
  sun.target.position.copy(center);
  sun.castShadow = true;
  const half = Math.max(W, H) * 0.75;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.1, far: Math.max(W, H) * 4 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(d: T) => { disposables.push(d); return d; };

  // Sol : l'image de la carte.
  const texture = keep(new THREE.TextureLoader().load(imageUrl, () => render()));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), keep(new THREE.MeshLambertMaterial({ map: texture })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.copy(center);
  ground.receiveShadow = true;
  scene.add(ground);

  // Brouillard : une texture posée juste au-dessus du sol, redessinée quand la vision change.
  const fogScale = Math.min(FOG_PX, FOG_MAX / Math.max(W, H));
  const fogCanvas = document.createElement("canvas");
  fogCanvas.width = Math.ceil(W * fogScale);
  fogCanvas.height = Math.ceil(H * fogScale);
  const fogTexture = keep(new THREE.CanvasTexture(fogCanvas));
  const fogMesh = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)),
    keep(new THREE.MeshBasicMaterial({ map: fogTexture, transparent: true, depthWrite: false })));
  fogMesh.rotation.x = -Math.PI / 2;
  fogMesh.position.set(center.x, 0.02, center.z);
  fogMesh.renderOrder = 1;
  fogMesh.visible = false;
  scene.add(fogMesh);

  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const wallMaterial = keep(new THREE.MeshLambertMaterial({ color: "#ffffff" }));
  let wallMesh: THREE.InstancedMesh | null = null;
  const doorGroup = new THREE.Group();
  const tokenGroup = new THREE.Group();
  scene.add(doorGroup, tokenGroup);

  /** Mur ou porte, de (x1, y1) à (x2, y2) sur la carte. */
  const segmentMatrix = (x1: number, y1: number, x2: number, y2: number, h: number, t: number, lift = 0) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    return new THREE.Matrix4().compose(
      new THREE.Vector3((x1 + x2) / 2, lift + h / 2, (y1 + y2) / 2),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(y2 - y1, x2 - x1)),
      new THREE.Vector3(len + t, h, t),
    );
  };

  /** Sous le brouillard, un mur n'apparaît que si un de ses côtés a été vu : sinon il trahirait le plan. */
  const wallState = (s: Segment, fog: Props["fog"]): "seen" | "explored" | "hidden" => {
    if (!fog) return "seen";
    const [x1, y1, x2, y2] = s;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const nx = -(y2 - y1) / len * 0.08, ny = (x2 - x1) / len * 0.08;
    const sides: Point[] = [[mx + nx, my + ny], [mx - nx, my - ny]];
    if (sides.some((p) => fog.seen.some((poly) => insidePolygon(p, poly)))) return "seen";
    if (sides.some((p) => fog.explored.some((poly) => insidePolygon(p, poly)))) return "explored";
    return "hidden";
  };

  const clear = (g: THREE.Group) => {
    for (const o of [...g.children]) {
      g.remove(o);
      o.traverse((c) => {
        if (c instanceof THREE.Mesh || c instanceof THREE.Sprite) {
          if (c.geometry !== box) c.geometry.dispose();
          const m = c.material as THREE.Material & { map?: THREE.Texture | null };
          m.map?.dispose();
          m.dispose();
        }
      });
    }
  };

  function setWalls(walls: Segment[], doors: Door3D[], fog: Props["fog"]) {
    if (wallMesh) { scene.remove(wallMesh); wallMesh.dispose(); }
    wallMesh = new THREE.InstancedMesh(box, wallMaterial, Math.max(walls.length, 1));
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    wallMesh.count = walls.length;
    walls.forEach((s, i) => {
      const state = wallState(s, fog);
      wallMesh!.setMatrixAt(i, state === "hidden" ? new THREE.Matrix4().makeScale(0, 0, 0) : segmentMatrix(...s, WALL_H, WALL_T));
      wallMesh!.setColorAt(i, state === "explored" ? WALL_DIM : WALL_SEEN);
    });
    scene.add(wallMesh);

    clear(doorGroup);
    for (const d of doors) {
      const s = [...d.a, ...d.b] as Segment;
      const state = wallState(s, fog);
      if (state === "hidden") continue;
      // Fermée : un battant de bois debout. Ouverte : un seuil vert au sol.
      const mesh = new THREE.Mesh(box, new THREE.MeshLambertMaterial({
        color: d.closed ? (state === "explored" ? "#5c3a12" : "#b45309") : "#22c55e",
        transparent: !d.closed, opacity: d.closed ? 1 : 0.8,
      }));
      mesh.applyMatrix4(d.closed ? segmentMatrix(...s, WALL_H * 0.9, DOOR_T) : segmentMatrix(...s, 0.05, DOOR_T * 1.5, 0.02));
      mesh.castShadow = d.closed;
      mesh.userData = { doorId: d.id, closed: d.closed };
      doorGroup.add(mesh);
    }
    render();
  }

  function setTokens(tokens: Token3D[]) {
    clear(tokenGroup);
    for (const t of tokens) {
      const g = new THREE.Group();
      // Un pion en cours de glisser garde sa place sous le doigt, même si une mise à jour arrive entre-temps.
      if (dragging?.id === t.id) g.position.copy(dragging.at);
      else g.position.set(t.x, 0, t.y);
      g.userData = { tokenId: t.id, movable: t.movable };
      const material = () => new THREE.MeshLambertMaterial({ color: t.color, transparent: t.hidden, opacity: t.hidden ? 0.5 : 1 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.1, 32), material());
      base.position.y = 0.05;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.35, 6, 16), material());
      body.position.y = 0.1 + 0.2 + 0.175;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.03, 8, 40),
        new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      ring.name = "ring";
      for (const m of [base, body]) m.castShadow = true;
      if (dragging?.id === t.id) ring.material.color.set("#facc15");
      g.add(base, body, ring, labelSprite(t.label, t.hidden));
      tokenGroup.add(g);
    }
    render();
  }

  function setFog(fog: Props["fog"]) {
    fogMesh.visible = !!fog;
    if (fog) {
      const ctx = fogCanvas.getContext("2d")!;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
      // Comme le masque de la vue 2D : déjà vu à moitié sombre, vu maintenant en clair.
      ctx.globalCompositeOperation = "destination-out";
      const fill = (poly: Point[], alpha: number) => {
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * fogScale, y * fogScale) : ctx.moveTo(x * fogScale, y * fogScale)));
        ctx.closePath();
        ctx.fill();
      };
      fog.explored.forEach((p) => fill(p, 0.45));
      fog.seen.forEach((p) => fill(p, 1));
      ctx.globalAlpha = 1;
      fogTexture.needsUpdate = true;
    }
    render();
  }

  // Pointeur : glisser un pion, toucher une porte (MJ) ou une case (pose), sinon la caméra.
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const onGroundAt = (e: PointerEvent) => {
    raycaster.setFromCamera(ndc(e), camera);
    const p = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    return p && p.x >= 0 && p.x <= W && p.z >= 0 && p.z <= H ? { x: p.x, y: p.z } : null;
  };
  const hit = (e: PointerEvent, objects: THREE.Object3D[]) => {
    raycaster.setFromCamera(ndc(e), camera);
    return raycaster.intersectObjects(objects, true)[0]?.object;
  };
  const tokenOf = (o?: THREE.Object3D) => {
    for (let c: THREE.Object3D | null | undefined = o; c; c = c.parent) if (c.userData.tokenId !== undefined) return c;
    return null;
  };

  let dragging: { id: number; at: THREE.Vector3; pointer: number } | null = null;
  let down: { x: number; y: number } | null = null;
  const draggedGroup = () => tokenGroup.children.find((g) => g.userData.tokenId === dragging?.id);
  // En phase de capture : avant OrbitControls, pour lui retirer la main quand on prend un pion.
  const pointerDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
    const token = tokenOf(hit(e, tokenGroup.children));
    if (token?.userData.movable && !props.current.placing) {
      controls.enabled = false;
      dragging = { id: token.userData.tokenId, at: token.position.clone(), pointer: e.pointerId };
      renderer.domElement.setPointerCapture(e.pointerId);
      (token.getObjectByName("ring") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.color.set("#facc15");
      render();
    }
  };
  const pointerMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.pointer) return;
    const p = onGroundAt(e);
    if (p) {
      dragging.at.set(p.x, 0, p.y);
      draggedGroup()?.position.copy(dragging.at);
      render();
    }
  };
  const pointerUp = (e: PointerEvent) => {
    if (dragging && e.pointerId === dragging.pointer) {
      const { id, at } = dragging;
      dragging = null;
      controls.enabled = true;
      props.current.onDrop(id, at.x, at.z);
      return;
    }
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return;
    down = null;
    const { placing, onDoor, onGround } = props.current;
    if (placing) {
      const p = onGroundAt(e);
      if (p) onGround(p.x, p.y);
      return;
    }
    const door = onDoor && hit(e, doorGroup.children);
    if (door && onDoor) onDoor(door.userData.doorId, !door.userData.closed);
  };
  const pointerCancel = () => {
    if (!dragging) return;
    dragging = null;
    controls.enabled = true;
    setTokens(props.current.tokens); // retour à sa case
  };
  const hover = (e: PointerEvent) => {
    if (dragging || props.current.placing) return;
    const token = tokenOf(hit(e, tokenGroup.children));
    const door = props.current.onDoor && hit(e, doorGroup.children);
    renderer.domElement.style.cursor = token?.userData.movable ? "grab" : door ? "pointer" : "";
  };
  const canvas = renderer.domElement;
  canvas.addEventListener("pointerdown", pointerDown, { capture: true });
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointermove", hover);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerCancel);

  // Taille : suit la boîte ; la carte entière tient dans la vue au départ.
  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    // Vue de biais, la carte occupe à peu près sa diagonale en largeur et un peu moins en hauteur.
    const diag = Math.hypot(W, H), aspect = w / h;
    const halfH = Math.max(diag * 0.36, (diag * 0.52) / aspect);
    Object.assign(camera, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH });
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(el);

  // Rendu à la demande (batterie des téléphones) : seulement quand quelque chose bouge.
  let frame = 0;
  function render() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (controls.update()) render(); // amortissement de la caméra en cours
      renderer.render(scene, camera);
    });
  }
  controls.addEventListener("change", render);
  resize();

  return {
    setWalls, setTokens, setFog,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener("pointerdown", pointerDown, { capture: true });
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerCancel);
      clear(tokenGroup);
      clear(doorGroup);
      wallMesh?.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}

/** Nom court au-dessus du pion, toujours face à la caméra. */
function labelSprite(text: string, hidden: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.strokeText(text, 64, 32);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 64, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, opacity: hidden ? 0.6 : 1 }));
  sprite.scale.set(0.9, 0.45, 1);
  sprite.position.y = 1.05;
  sprite.renderOrder = 2;
  return sprite;
}
