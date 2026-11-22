import * as terrain from "@gleam/sim/sim/terrain.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { fromArray, toArray } from "../gleam";
import type { V3 } from "./camera";

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
