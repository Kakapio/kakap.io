import * as rabbits from "@gleam/sim/sim/rabbits.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { Result$isOk, Result$Ok$0 } from "@gleam/prelude.mjs";
import { toArray, fromArray } from "../gleam";
import type { V3 } from "./camera";
import type { Terrain } from "./terrain-sim";

export type Herd = rabbits.Rabbit$[];
export type RabbitConfig = rabbits.Config$;
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type RabbitView = {
  id: number;
  position: V3;
  lift: number;
  heading: number;
  speed: number;
  fear: number;
  fleeing: boolean;
  hop: number;
  indoors: boolean;
  /** Running for its door. */
  goingHome: boolean;
  home: number;
};

export const DEFAULT_RABBITS = {
  walkSpeed: 70,
  runSpeed: 260,
  acceleration: 900,
  fearRadius: 360,
  contagionRadius: 150,
  spacing: 34,
  huddleRadius: 40,
  hopHeight: 10,
  hopRate: 9,
};

export type RabbitSettings = typeof DEFAULT_RABBITS;

const toV3 = (p: V3) => vec3.Vec3$Vec3(p.x, p.y, p.z);
const fromV3 = (v: vec3.Vec3$): V3 => ({
  x: vec3.Vec3$Vec3$x(v),
  y: vec3.Vec3$Vec3$y(v),
  z: vec3.Vec3$Vec3$z(v),
});

export function config(s: RabbitSettings): RabbitConfig {
  return rabbits.Config$Config(
    s.walkSpeed,
    s.runSpeed,
    s.acceleration,
    s.fearRadius,
    s.contagionRadius,
    s.spacing,
    s.huddleRadius,
    s.hopHeight,
    s.hopRate,
  );
}

/** `houses` houses are shared out among the herd in order of id. */
export const spawn = (count: number, around: V3, spread: number, houses: number): Herd =>
  toArray(rabbits.settle(rabbits.herd(count, toV3(around), spread), houses));

const toBounds = (b: Bounds) => rabbits.Bounds$Bounds(b.minX, b.maxX, b.minZ, b.maxZ);

/** The ways the rabbits know around the obstacles, to each door and to the huddle. */
export type Paths = rabbits.Paths$;

/** The ways around the obstacles on `ground`. Build them again when the ground, the doors or the bounds change. */
export const findPaths = (ground: Terrain, doors: V3[], bounds: Bounds): Paths =>
  rabbits.find_paths(ground, fromArray(doors.map(toV3)), toBounds(bounds));

/** The paths `dt` later. The way to the huddle is built again about once a second. */
export const updatePaths = (paths: Paths, herd: Herd, dt: number): Paths =>
  rabbits.update_paths(paths, fromArray(herd), dt);

export function step(
  herd: Herd,
  ground: Terrain,
  spiders: V3[],
  doors: V3[],
  paths: Paths,
  bounds: Bounds,
  dt: number,
  cfg: RabbitConfig,
): Herd {
  return toArray(
    rabbits.step_around(
      fromArray(herd),
      ground,
      fromArray(spiders.map(toV3)),
      fromArray(doors.map(toV3)),
      paths,
      toBounds(bounds),
      dt,
      cfg,
    ),
  );
}

export const fearRadius = (cfg: RabbitConfig): number => rabbits.Config$Config$fear_radius(cfg);

/** The center of the rabbits that are outside, or null when they are all indoors. */
export function outsideCentroid(herd: Herd): V3 | null {
  const c = rabbits.outside_centroid(fromArray(herd));
  return Result$isOk(c) ? fromV3(Result$Ok$0(c)!) : null;
}

export function view(herd: Herd, cfg: RabbitConfig): RabbitView[] {
  return herd.map((r) => {
    const velocity = fromV3(rabbits.Rabbit$Rabbit$velocity(r));
    return {
      id: rabbits.Rabbit$Rabbit$id(r),
      position: fromV3(rabbits.Rabbit$Rabbit$position(r)),
      lift: rabbits.lift(r, cfg),
      heading: rabbits.Rabbit$Rabbit$heading(r),
      speed: Math.hypot(velocity.x, velocity.z),
      fear: rabbits.Rabbit$Rabbit$fear(r),
      fleeing: rabbits.is_fleeing(r),
      hop: rabbits.Rabbit$Rabbit$hop(r),
      indoors: rabbits.is_indoors(r),
      goingHome: rabbits.Shelter$isGoingHome(rabbits.Rabbit$Rabbit$shelter(r)),
      home: rabbits.Rabbit$Rabbit$home(r),
    };
  });
}
