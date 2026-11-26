import { describe, expect, it } from "vitest";
import { insidePolygon, visibilityPolygon, type Segment } from "./vision";

describe("visibilityPolygon", () => {
  // Carte 10 x 10, mur vertical en x = 5 avec une ouverture entre y = 4 et 6.
  const walls: Segment[] = [[5, 0, 5, 4], [5, 6, 5, 10]];
  const seen = visibilityPolygon(2.5, 5, walls, 10, 10);

  it("voit sa pièce", () => {
    expect(insidePolygon([1, 1], seen)).toBe(true);
    expect(insidePolygon([4.5, 9], seen)).toBe(true);
  });

  it("voit par l'ouverture, pas à travers le mur", () => {
    expect(insidePolygon([8, 5], seen)).toBe(true);
    expect(insidePolygon([8, 1], seen)).toBe(false);
    expect(insidePolygon([8, 9], seen)).toBe(false);
  });

  it("une porte fermée bouche l'ouverture", () => {
    const closed = visibilityPolygon(2.5, 5, [...walls, [5, 4, 5, 6]], 10, 10);
    expect(insidePolygon([8, 5], closed)).toBe(false);
    expect(insidePolygon([1, 1], closed)).toBe(true);
  });
});
