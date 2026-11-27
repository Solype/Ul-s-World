/**
 * Brouillard de la carte : la zone que voit un pion, bornée par les murs, les portes fermées et les bords.
 * Le serveur filtre déjà les pions envoyés aux joueurs (backend `app/vision.py`) ; ceci ne fait que le dessin.
 */

export type Segment = [number, number, number, number];
export type Point = [number, number];

/** Distance le long du rayon (x, y) + t (dx, dy) jusqu'au segment, Infinity s'il ne le touche pas. */
function rayHit(x: number, y: number, dx: number, dy: number, [x1, y1, x2, y2]: Segment) {
  const sx = x2 - x1, sy = y2 - y1;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-12) return Infinity;
  const t = ((x1 - x) * sy - (y1 - y) * sx) / den;
  const u = ((x1 - x) * dy - (y1 - y) * dx) / den;
  return t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
}

/**
 * Polygone visible depuis (x, y) : un rayon vers chaque extrémité de mur, et juste à côté, pour voir derrière
 * les coins. Les murs d'une même ligne partagent leurs extrémités : un seul rayon par point distinct (près de
 * deux fois moins de rayons sur un export Dungeon Alchemist). shortcut: O(points × murs) par pion ; au-delà
 * de quelques milliers de murs, trier les murs par angle (balayage).
 */
export function visibilityPolygon(x: number, y: number, walls: Segment[], width: number, height: number): Point[] {
  const segments: Segment[] = [...walls, [0, 0, width, 0], [width, 0, width, height], [width, height, 0, height], [0, height, 0, 0]];
  const ends = new Set<string>();
  const angles: number[] = [];
  for (const [x1, y1, x2, y2] of segments) {
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      const key = `${px},${py}`;
      if (ends.has(key)) continue;
      ends.add(key);
      const a = Math.atan2(py - y, px - x);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }
  angles.sort((a, b) => a - b);
  const polygon: Point[] = [];
  for (const a of angles) {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = Infinity;
    for (const s of segments) {
      const hit = rayHit(x, y, dx, dy, s);
      if (hit < t) t = hit;
    }
    polygon.push([x + dx * t, y + dy * t]);
  }
  return polygon;
}

export function insidePolygon([x, y]: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
