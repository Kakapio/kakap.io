import { toArray } from "../gleam";
import * as chain from "@gleam/sim/sim/chain.mjs";
import * as fish from "@gleam/sim/sim/fish.mjs";
import * as vec from "@gleam/sim/sim/vec.mjs";
import * as wander from "@gleam/sim/sim/wander.mjs";

export type Point = { x: number; y: number };
export type Cone = { center: number; clamped: boolean };
export type JointView = Point & { cone: Cone | null };
export type FishView = { joints: JointView[]; facing: number; phase: number };
export type FishState = fish.Fish$;
export type Config = fish.Config$;

export type Settings = {
  segments: number;
  segmentLength: number;
  maxBendDeg: number;
  speed: number;
  turnRateDeg: number;
  wiggle: number;
};

const DEG = Math.PI / 180;

const toVec = (p: Point) => vec.Vec$Vec(p.x, p.y);
const toPoint = (v: vec.Vec$): Point => ({
  x: vec.Vec$Vec$x(v),
  y: vec.Vec$Vec$y(v),
});

export function config(s: Settings): Config {
  return fish.Config$Config(
    s.segments,
    s.segmentLength,
    s.maxBendDeg * DEG,
    s.speed,
    s.turnRateDeg * DEG,
    s.wiggle,
  );
}

export function spawn(at: Point, heading: number, cfg: Config): FishState {
  return fish.new$(toVec(at), heading, cfg);
}

export function swim(
  f: FishState,
  target: Point,
  dt: number,
  cfg: Config,
): FishState {
  return fish.swim(f, toVec(target), dt, cfg);
}

export function reach(
  f: FishState,
  target: Point,
  root: Point,
  rootDirection: number,
  cfg: Config,
): { fish: FishState; iterations: number; error: number } {
  const [next, result] = fish.reach(
    f,
    toVec(target),
    toVec(root),
    rootDirection,
    cfg,
  );
  return {
    fish: next,
    iterations: chain.Reach$Reach$iterations(result),
    error: chain.Reach$Reach$error(result),
  };
}

export function view(f: FishState): FishView {
  const joints = toArray(fish.Fish$Fish$joints(f)).map((joint): JointView => {
    const cone = chain.Joint$Joint$cone(joint);
    return {
      ...toPoint(chain.Joint$Joint$point(joint)),
      cone: chain.Cone$isCone(cone)
        ? {
            center: chain.Cone$Cone$center(cone),
            clamped: chain.Cone$Cone$clamped(cone),
          }
        : null,
    };
  });
  return {
    joints,
    facing: fish.Fish$Fish$facing(f),
    phase: fish.Fish$Fish$phase(f),
  };
}

export const chainLength = (cfg: Config): number => fish.length(cfg);

export const roam = (time: number, width: number, height: number): Point =>
  toPoint(wander.roam(time, width, height));

export const sweep = (time: number, root: Point, length: number): Point =>
  toPoint(wander.sweep(time, toVec(root), length));

export const moveToward = (from: Point, to: Point, maxStep: number): Point =>
  toPoint(vec.move_toward(toVec(from), toVec(to), maxStep));
