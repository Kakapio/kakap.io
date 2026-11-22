import * as terrain from "@gleam/sim/sim/terrain.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { fromArray, toArray } from "../gleam";
import type { Camera, V3 } from "./camera";

export type Terrain = terrain.Terrain$;
export type RockView = { center: V3; radius: number; height: number };
/**
 * A house is a grassy hill with a wall dug into its near side. The wall meets
 * the ground `cut` in front of the hill's center, toward -z, and leans back
 * by `lean` radians. `door` is the spot just outside the wall. `rock` is the
 * hill as the sim sees it.
 */
export type HouseView = RockView & { cut: number; lean: number; door: V3; index: number; rock: terrain.Rock$ };

/**
 * `rocks` are the rocks to draw. `mounds` are everything raised: the rocks and
 * the houses. `ground` holds the mounds for the sim.
 */
export type Land = { ground: Terrain; rocks: RockView[]; houses: HouseView[]; mounds: RockView[] };

/** How far the hill reaches behind its center, where it meets the ground. */
export const HOUSE_RADIUS = 210;
const HOUSE_HEIGHT = 95;
/** How far in front of the hill's center the wall stands. */
const HOUSE_CUT = 50;
/** The wall leans back this far from vertical, so it faces our camera more. */
const HOUSE_LEAN = (25 * Math.PI) / 180;

/** Space kept free of rocks around a house. */
const YARD = 20;

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

/**
 * The same rocks every time, less the ones `keep` turns down and the ones in
 * a house's yard, plus a house mound at each of `homes`.
 */
export function scatterRocks(keep: (rock: RockView) => boolean = () => true, homes: V3[] = []): Land {
  // `homes` are door spots; each hill sits behind its door.
  const houses: HouseView[] = homes.map((d, index) => {
    const center = { x: d.x, y: 0, z: d.z + HOUSE_CUT };
    return {
      center,
      radius: HOUSE_RADIUS,
      height: HOUSE_HEIGHT,
      cut: HOUSE_CUT,
      lean: HOUSE_LEAN,
      door: { x: d.x, y: 0, z: d.z - 14 },
      index,
      rock: terrain.Rock$Hill(toV3(center), HOUSE_RADIUS, HOUSE_HEIGHT, HOUSE_CUT, HOUSE_LEAN),
    };
  });
  const clear = (r: RockView) =>
    houses.every((h) => Math.hypot(r.center.x - h.center.x, r.center.z - h.center.z) > h.radius + r.radius + YARD);
  const kept = ALL.map((r) => ({ r, view: viewOf(r) })).filter(({ view }) => keep(view) && clear(view));
  const mounds = houses.map((h) => h.rock);
  const rocks = kept.map(({ view }) => view);
  return {
    ground: terrain.Terrain$Terrain(fromArray([...kept.map(({ r }) => r), ...mounds])),
    rocks,
    houses,
    mounds: [...rocks, ...houses],
  };
}

const toV3 = (p: V3) => vec3.Vec3$Vec3(p.x, p.y, p.z);

/** The height of the ground surface at `p`. */
export const heightAt = (land: Land, p: V3): number => terrain.height(land.ground, toV3(p));

/** The tallest a rock can be, so a ray above this height cannot hit one. */
const TOP = Math.max(HOUSE_HEIGHT, ...ALL.map((r) => terrain.Rock$Rock$height(r)));

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

/** The rock or house whose footprint holds `p`, if any. */
export function rockUnder(land: Land, p: V3): RockView | undefined {
  return land.mounds.find(
    (r) =>
      Math.hypot(p.x - r.center.x, p.z - r.center.z) < r.radius && (!("cut" in r) || p.z >= r.center.z - (r as HouseView).cut),
  );
}
