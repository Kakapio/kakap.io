import * as terrain from "@gleam/sim/sim/terrain.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { fromArray, toArray } from "../gleam";
import type { Camera, V3 } from "./camera";

export type Terrain = terrain.Terrain$;
export type RockView = { center: V3; radius: number; height: number };
export type Land = { ground: Terrain; rocks: RockView[] };

/** The world area that gets rocks. It covers the view on every screen shape. */
const AREA = { minX: -2600, maxX: 2600, minZ: -1400, maxZ: 3400, cell: 560 };

const ALL = toArray(terrain.Terrain$Terrain$rocks(terrain.scatter(AREA.minX, AREA.maxX, AREA.minZ, AREA.maxZ, AREA.cell)));

const viewOf = (r: terrain.Rock$): RockView => {
  const c = terrain.Rock$Rock$center(r);
  return {
    center: { x: vec3.Vec3$Vec3$x(c), y: 0, z: vec3.Vec3$Vec3$z(c) },
    radius: terrain.Rock$Rock$radius(r),
    height: terrain.Rock$Rock$height(r),
  };
};

/** The same rocks every time, less the ones `keep` turns down. */
export function scatterRocks(keep: (rock: RockView) => boolean = () => true): Land {
  const kept = ALL.map((r) => ({ r, view: viewOf(r) })).filter(({ view }) => keep(view));
  return {
    ground: terrain.Terrain$Terrain(fromArray(kept.map(({ r }) => r))),
    rocks: kept.map(({ view }) => view),
  };
}

const toV3 = (p: V3) => vec3.Vec3$Vec3(p.x, p.y, p.z);

/** The height of the ground surface at `p`. */
export const heightAt = (land: Land, p: V3): number => terrain.height(land.ground, toV3(p));

/** The tallest a rock can be, so a ray above this height cannot hit one. */
const TOP = Math.max(0, ...ALL.map((r) => terrain.Rock$Rock$height(r)));

/**
 * The point on the ground surface, rocks included, under a screen point.
 * It steps along the camera ray from rock-top height down to the ground
 * plane, then narrows in on the first point below the surface.
 */
export function pick(land: Land, cam: Camera, sx: number, sy: number): V3 | null {
  const high = cam.planeAt(sx, sy, TOP);
  const low = cam.groundAt(sx, sy);
  if (!high || !low) return low;
  const at = (t: number): V3 => ({
    x: high.x + (low.x - high.x) * t,
    y: high.y + (low.y - high.y) * t,
    z: high.z + (low.z - high.z) * t,
  });
  const below = (t: number) => {
    const p = at(t);
    return p.y <= heightAt(land, p);
  };
  const steps = 48;
  for (let k = 1; k <= steps; k++) {
    if (!below(k / steps)) continue;
    let [a, b] = [(k - 1) / steps, k / steps];
    for (let j = 0; j < 8; j++) {
      const m = (a + b) / 2;
      if (below(m)) b = m;
      else a = m;
    }
    const p = at(b);
    return { ...p, y: heightAt(land, p) };
  }
  return low;
}

/** The rock whose footprint holds `p`, if any. */
export function rockUnder(land: Land, p: V3): RockView | undefined {
  return land.rocks.find((r) => Math.hypot(p.x - r.center.x, p.z - r.center.z) < r.radius);
}
