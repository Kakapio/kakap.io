import * as spider from "@gleam/sim/sim/spider.mjs";
import * as vec from "@gleam/sim/sim/vec.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import * as wander from "@gleam/sim/sim/wander.mjs";
import { toArray } from "../gleam";
import type { V3 } from "./camera";

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

export type SpiderView = {
  body: V3;
  heading: number;
  speed: number;
  legs: LegView[];
};

export const DEFAULT_SPIDER: SpiderSettings = {
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
  at: V3,
  heading: number,
  cfg: SpiderConfig,
): SpiderState => spider.new$(toV3(at), heading, cfg);

export const walk = (
  s: SpiderState,
  target: V3,
  dt: number,
  cfg: SpiderConfig,
): SpiderState => spider.walk(s, toV3(target), dt, cfg);

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
    body: fromV3(spider.Pose$Pose$body(pose)),
    heading: spider.Pose$Pose$heading(pose),
    speed: spider.Spider$Spider$speed(s),
    legs,
  };
}

/** Waypoint `index` as a point in the unit square. */
export function waypoint(index: number): { u: number; v: number } {
  const p = wander.waypoint(index);
  return { u: vec.Vec$Vec$x(p), v: vec.Vec$Vec$y(p) };
}
