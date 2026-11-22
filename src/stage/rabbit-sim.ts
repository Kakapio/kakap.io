import * as rabbits from "@gleam/sim/sim/rabbits.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
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

export const spawn = (count: number, around: V3, spread: number): Herd =>
  toArray(rabbits.herd(count, toV3(around), spread));

export function step(
  herd: Herd,
  ground: Terrain,
  spiders: V3[],
  bounds: Bounds,
  dt: number,
  cfg: RabbitConfig,
): Herd {
  const b = rabbits.Bounds$Bounds(
    bounds.minX,
    bounds.maxX,
    bounds.minZ,
    bounds.maxZ,
  );
  return toArray(
    rabbits.step_around(fromArray(herd), ground, fromArray(spiders.map(toV3)), b, dt, cfg),
  );
}

export const fearRadius = (cfg: RabbitConfig): number => rabbits.Config$Config$fear_radius(cfg);

export const centroid = (herd: Herd): V3 =>
  fromV3(rabbits.centroid(fromArray(herd)));

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
    };
  });
}
