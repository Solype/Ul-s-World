"""Ligne de vue sur la carte d'une room : ce qui se trouve derrière un mur ou une porte fermée n'est pas vu.

Vision à plat (pas de hauteur), sans portée ni lumière pour l'instant. Le frontend dessine le même brouillard
(`frontend/src/lib/vision.ts`) ; ici, le serveur décide quels pions il envoie aux joueurs.
"""

Segment = tuple[float, float, float, float]

# Un pion occupe à peu près sa case : on le voit si son centre ou un point à ce décalage du centre est vu.
TOKEN_REACH = 0.25


def blocking_segments(walls: list, doors: list) -> list[Segment]:
    return [tuple(w) for w in walls] + [(*d["a"], *d["b"]) for d in doors if d["closed"]]


def _cross(ox: float, oy: float, ax: float, ay: float, bx: float, by: float) -> float:
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)


def blocked(ax: float, ay: float, bx: float, by: float, segments: list[Segment]) -> bool:
    """Le trajet a -> b coupe-t-il un segment ? Toucher l'extrémité d'un mur bloque : une ligne qui passe
    pile par le coin commun de deux murs ne doit pas voir au travers. Longer un mur (colinéaire) ne bloque pas."""
    minx, maxx, miny, maxy = min(ax, bx), max(ax, bx), min(ay, by), max(ay, by)
    for x1, y1, x2, y2 in segments:
        if max(x1, x2) < minx or min(x1, x2) > maxx or max(y1, y2) < miny or min(y1, y2) > maxy:
            continue
        d1, d2 = _cross(x1, y1, x2, y2, ax, ay), _cross(x1, y1, x2, y2, bx, by)
        if d1 == 0 and d2 == 0:
            continue
        if d1 * d2 <= 0 and _cross(ax, ay, bx, by, x1, y1) * _cross(ax, ay, bx, by, x2, y2) <= 0:
            return True
    return False


def seen_by_any(viewers: list[tuple[float, float]], x: float, y: float, segments: list[Segment]) -> bool:
    r = TOKEN_REACH
    targets = [(x, y), (x - r, y), (x + r, y), (x, y - r), (x, y + r)]
    for vx, vy in viewers:
        # Le serveur peut être un vieux PC : on ne garde qu'une fois les murs proches du trajet, pas à chaque point visé.
        minx, maxx, miny, maxy = min(vx, x - r), max(vx, x + r), min(vy, y - r), max(vy, y + r)
        near = [s for s in segments if not (max(s[0], s[2]) < minx or min(s[0], s[2]) > maxx
                                            or max(s[1], s[3]) < miny or min(s[1], s[3]) > maxy)]
        if any(not blocked(vx, vy, tx, ty, near) for tx, ty in targets):
            return True
    return False
