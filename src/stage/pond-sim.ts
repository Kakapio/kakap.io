import * as pond from "@gleam/sim/sim/pond.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { fromArray, toArray } from "../gleam";
import type { V3 } from "./camera";
import type { PondView } from "./terrain-sim";

export type School = pond.Koi$[];

/** `spine` runs along the fish's back on the water, from head to tail. `scare` runs from 0 (calm) to 1. */
export type KoiView = { id: number; spine: V3[]; scare: number };

/** The length of a fish, in world units. */
export const FISH_LENGTH = pond.length;

const toV3 = (p: V3) => vec3.Vec3$Vec3(p.x, p.y, p.z);
const fromV3 = (v: vec3.Vec3$): V3 => ({ x: vec3.Vec3$Vec3$x(v), y: vec3.Vec3$Vec3$y(v), z: vec3.Vec3$Vec3$z(v) });

/** `count` koi spread around the pond. */
export const stock = (water: PondView, count: number): School => toArray(pond.stock(water.pond, count));

/** Move every fish one frame. `touches` are the points where something is in or on the water, anywhere in the world. */
export const step = (school: School, water: PondView, touches: V3[], time: number, dt: number): School =>
  toArray(pond.step(fromArray(school), water.pond, fromArray(touches.map(toV3)), time, dt));

export const view = (school: School): KoiView[] =>
  school.map((c) => ({
    id: pond.Koi$Koi$id(c),
    spine: toArray(pond.spine(c)).map(fromV3),
    scare: pond.Koi$Koi$scare(c),
  }));
