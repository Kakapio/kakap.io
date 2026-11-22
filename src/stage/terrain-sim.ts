import * as terrain from "@gleam/sim/sim/terrain.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { Result$isOk, Result$Ok$0 } from "@gleam/prelude.mjs";
import { fromArray, toArray } from "../gleam";
import type { Camera, V3 } from "./camera";

export type Terrain = terrain.Terrain$;
/** `rock` is the rock or hill as the sim sees it. */
export type RockView = { center: V3; radius: number; height: number; rock: terrain.Rock$ };
/**
 * A house is a grassy hill with a wall dug into its near side. The wall meets
 * the ground `cut` in front of the hill's center, toward -z, and leans back
 * by `lean` radians. `door` is the spot just outside the wall.
 */
export type HouseView = RockView & { cut: number; lean: number; door: V3; index: number };

/**
 * A crack in the ground. `rims` are matching corner points of its two rims,
 * from one end to the other. `bridge` holds the points where the bridge meets
 * each rim.
 */
export type CrevasseView = { rims: [V3, V3][]; depth: number; bridge: [V3, V3] | null };

/**
 * `rocks` are the rocks to draw. `mounds` are everything raised: the rocks and
 * the houses. `ground` holds the mounds and the crevasses for the sim.
 */
export type Land = {
  ground: Terrain;
  rocks: RockView[];
  houses: HouseView[];
  mounds: RockView[];
  crevasses: CrevasseView[];
};

/** A crevasse to dig: a line on the ground, and how far along it the bridge crosses, from 0 to 1. */
export type CrevasseSpot = { from: V3; to: V3; bridge: number };

/** The widest gap of a crevasse. A small spider can straddle it, and a rabbit cannot hop it. */
export const CREVASSE_WIDTH = 115;
const CREVASSE_DEPTH = 170;

/** The big boulder is broad and low, so a small spider can walk over its top. */
export const BOULDER_RADIUS = 150;
const BOULDER_HEIGHT = 52;

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
    rock: r,
  };
};

/**
 * The same rocks every time, less the ones `keep` turns down and the ones too
 * close to a house, the crevasse or the big boulder. A house mound stands at
 * each of `homes`. `boulder` is the center of the big boulder.
 */
export function scatterRocks(
  keep: (rock: RockView) => boolean = () => true,
  homes: V3[] = [],
  crevasse: CrevasseSpot | null = null,
  boulder: V3 | null = null,
): Land {
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
  const big = boulder ? viewOf(terrain.rock(toV3(boulder), BOULDER_RADIUS, BOULDER_HEIGHT)) : null;
  const crack = crevasse
    ? terrain.Crevasse$Crevasse(
        toV3(crevasse.from),
        toV3(crevasse.to),
        CREVASSE_WIDTH,
        CREVASSE_DEPTH,
        crevasse.bridge * Math.hypot(crevasse.to.x - crevasse.from.x, crevasse.to.z - crevasse.from.z),
      )
    : null;
  const clear = (r: RockView) =>
    [...houses, ...(big ? [big] : [])].every(
      (h) => Math.hypot(r.center.x - h.center.x, r.center.z - h.center.z) > h.radius + r.radius + YARD,
    ) &&
    (!crevasse || distanceToLine(r.center, crevasse.from, crevasse.to) > r.radius + CREVASSE_WIDTH / 2 + YARD);
  const kept = ALL.map(viewOf).filter((view) => keep(view) && clear(view));
  const rocks = [...kept, ...(big ? [big] : [])];
  return {
    ground: terrain.Terrain$Terrain(
      fromArray([...rocks, ...houses].map((r) => r.rock)),
      fromArray(crack ? [crack] : []),
    ),
    rocks,
    houses,
    mounds: [...rocks, ...houses],
    crevasses: crack ? [crevasseView(crack)] : [],
  };
}

function crevasseView(c: terrain.Crevasse$): CrevasseView {
  const ends = terrain.bridge_ends(c);
  return {
    rims: toArray(terrain.rims(c)).map(([left, right]) => [fromV3(left), fromV3(right)]),
    depth: terrain.Crevasse$Crevasse$depth(c),
    bridge: Result$isOk(ends) ? [fromV3(Result$Ok$0(ends)![0]), fromV3(Result$Ok$0(ends)![1])] : null,
  };
}

/** The ground distance from `p` to the line segment from `a` to `b`. */
export function distanceToLine(p: V3, a: V3, b: V3): number {
  const [dx, dz] = [b.x - a.x, b.z - a.z];
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

const toV3 = (p: V3) => vec3.Vec3$Vec3(p.x, p.y, p.z);
const fromV3 = (v: vec3.Vec3$): V3 => ({ x: vec3.Vec3$Vec3$x(v), y: vec3.Vec3$Vec3$y(v), z: vec3.Vec3$Vec3$z(v) });

/** The height of the ground surface at `p`. */
export const heightAt = (land: Land, p: V3): number => terrain.height(land.ground, toV3(p));

/** The tallest a rock can be, so a ray above this height cannot hit one. */
const TOP = Math.max(HOUSE_HEIGHT, BOULDER_HEIGHT, ...ALL.map((r) => terrain.Rock$Rock$height(r)));

/**
 * The point on the ground surface under a screen point, on a rock or down in
 * a crevasse. It steps along the camera ray from rock-top height down to the
 * deepest crevasse floor, then narrows in on the first point below the
 * surface.
 */
export function pick(land: Land, cam: Camera, sx: number, sy: number): V3 | null {
  const high = cam.planeAt(sx, sy, TOP);
  const ground = cam.groundAt(sx, sy);
  const deepest = Math.max(0, ...land.crevasses.map((c) => c.depth));
  const low = deepest > 0 ? cam.planeAt(sx, sy, -deepest) : ground;
  if (!high || !low) return ground;
  const at = (t: number): V3 => ({
    x: high.x + (low.x - high.x) * t,
    y: high.y + (low.y - high.y) * t,
    z: high.z + (low.z - high.z) * t,
  });
  const below = (t: number) => {
    const p = at(t);
    return p.y <= heightAt(land, p);
  };
  const steps = 64;
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
  return ground;
}

/** The rock or house whose footprint holds `p`, if any. */
export function rockUnder(land: Land, p: V3): RockView | undefined {
  return land.mounds.find(
    (r) =>
      Math.hypot(p.x - r.center.x, p.z - r.center.z) < r.radius && (!("cut" in r) || p.z >= r.center.z - (r as HouseView).cut),
  );
}
