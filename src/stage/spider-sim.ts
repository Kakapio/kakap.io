import * as spider from "@gleam/sim/sim/spider.mjs";
import * as vec from "@gleam/sim/sim/vec.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import * as wander from "@gleam/sim/sim/wander.mjs";
import { toArray } from "../gleam";
import type { V3 } from "./camera";
import type { Terrain } from "./terrain-sim";

export type SpiderState = spider.Spider$;
export type SpiderConfig = spider.Config$;

export type SpiderSettings = {
  height: number;
  bodyRadius: number;
  upper: number;
  lower: number;
  tip: number;
  stance: number;
  stepDistance: number;
  stepTime: number;
  lift: number;
  speed: number;
  acceleration: number;
  turnRateDeg: number;
  keepDistance: number;
};

export type LegView = {
  side: "left" | "right";
  index: number;
  group: number;
  hip: V3;
  knee: V3;
  ankle: V3;
  foot: V3;
  home: V3;
  swinging: boolean;
  stretched: boolean;
};

/** `pitch` tilts the nose up and `roll` the right side up. */
/** `size` scales the drawn body parts: 1 for the giant, smaller for small spiders. */
export type SpiderView = {
  size: number;
  body: V3;
  heading: number;
  pitch: number;
  roll: number;
  speed: number;
  legs: LegView[];
};

const GIANT: SpiderSettings = {
  height: 120,
  bodyRadius: 20,
  upper: 170,
  lower: 190,
  tip: 40,
  stance: 210,
  stepDistance: 70,
  stepTime: 0.22,
  lift: 40,
  speed: 140,
  acceleration: 400,
  turnRateDeg: 126,
  keepDistance: 140,
};

const SMALL: SpiderSettings = {
  height: 55,
  bodyRadius: 10,
  upper: 75,
  lower: 85,
  tip: 18,
  stance: 95,
  stepDistance: 32,
  stepTime: 0.15,
  lift: 18,
  speed: 120,
  acceleration: 500,
  turnRateDeg: 200,
  keepDistance: 60,
};

export const SPIDERS = { giant: GIANT, small: SMALL } as const;
export type SpiderKind = keyof typeof SPIDERS;

const toV3 = (p: V3) => vec3.Vec3$Vec3(p.x, p.y, p.z);
const fromV3 = (v: vec3.Vec3$): V3 => ({
  x: vec3.Vec3$Vec3$x(v),
  y: vec3.Vec3$Vec3$y(v),
  z: vec3.Vec3$Vec3$z(v),
});

export function config(s: SpiderSettings): SpiderConfig {
  return spider.Config$Config(
    s.height,
    s.bodyRadius,
    s.upper,
    s.lower,
    s.tip,
    s.stance,
    s.stepDistance,
    s.stepTime,
    s.lift,
    s.speed,
    s.acceleration,
    (s.turnRateDeg * Math.PI) / 180,
    s.keepDistance,
  );
}

export const spawn = (
  ground: Terrain,
  at: V3,
  heading: number,
  cfg: SpiderConfig,
): SpiderState => spider.new_on(ground, toV3(at), heading, cfg);

export const walk = (
  s: SpiderState,
  target: V3,
  ground: Terrain,
  dt: number,
  cfg: SpiderConfig,
): SpiderState => spider.walk_on(s, ground, toV3(target), dt, cfg);

export function view(s: SpiderState, cfg: SpiderConfig): SpiderView {
  const pose = spider.pose(s, cfg);
  const legs = toArray(spider.Pose$Pose$legs(pose)).map(
    (leg): LegView => ({
      side: spider.Side$isLeft(spider.LegPose$LegPose$side(leg))
        ? "left"
        : "right",
      index: spider.LegPose$LegPose$index(leg),
      group: spider.LegPose$LegPose$group(leg),
      hip: fromV3(spider.LegPose$LegPose$hip(leg)),
      knee: fromV3(spider.LegPose$LegPose$knee(leg)),
      ankle: fromV3(spider.LegPose$LegPose$ankle(leg)),
      foot: fromV3(spider.LegPose$LegPose$foot(leg)),
      home: fromV3(spider.LegPose$LegPose$home(leg)),
      swinging: spider.LegPose$LegPose$swinging(leg),
      stretched: spider.LegPose$LegPose$stretched(leg),
    }),
  );
  return {
    size: spider.Config$Config$body_radius(cfg) / GIANT.bodyRadius,
    body: fromV3(spider.Pose$Pose$body(pose)),
    heading: spider.Pose$Pose$heading(pose),
    pitch: spider.Pose$Pose$pitch(pose),
    roll: spider.Pose$Pose$roll(pose),
    speed: spider.Spider$Spider$speed(s),
    legs,
  };
}

/** Waypoint `index` as a point in the unit square. */
export function waypoint(index: number): { u: number; v: number } {
  const p = wander.waypoint(index);
  return { u: vec.Vec$Vec$x(p), v: vec.Vec$Vec$y(p) };
}
