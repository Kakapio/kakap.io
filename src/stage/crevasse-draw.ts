import * as terrain from "@gleam/sim/sim/terrain.mjs";
import type { Camera, V3 } from "./camera";
import { type Boil, INK, line, noise, type Pt } from "./ink";
import { fill, hull } from "./rock-draw";
import type { Layers, Piece } from "./spider-draw";
import type { CrevasseView } from "./terrain-sim";

/** Earth tones for the walls, lit to dark, and the dark at the bottom. */
const EARTH = ["#8b7552", "#63523a", "#3c3022"] as const;
const TURF = "#565a35";
const ABYSS = "#090705";
const SEAM = "rgba(22, 18, 12, 0.5)";

/** Bark tones for the bridge logs, lit to dark, and the cut wood at their ends. */
const BARK = ["#7d6243", "#5a4530", "#35281b"] as const;
const CUT = "#b39a6b";

/** Toward the sun. It matches the shadows, which fall to +x and +z. */
const SUN = normalize({ x: -0.5, y: 1, z: -0.35 });

/** Each wall is drawn as bands from the rim down. These are their edges, as shares of the depth. */
const BANDS = [0, 0.04, 0.12, 0.22, 0.34, 0.5, 1];

/** The bridge is two logs side by side. Lengths are in world units. */
const LOG = { radius: 9, sides: 8, apart: 10, past: 26, sunk: 3 };

/**
 * Crevasses, built in 3D and drawn with Canvas 2D. The rims come from the
 * sim's terrain, so the spiders step on exactly the edges that are drawn.
 * The inside shows only through the opening: the walls that face the camera
 * get darker toward the bottom. A crevasse is below the ground, so it is
 * drawn with the ground, under everything that stands on it. The log bridge
 * stands on the ground, so it is sorted with the scene.
 */
export function crevasseLayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  crevasses: CrevasseView[],
  boil: Boil,
): Layers {
  const pieces: Piece[] = crevasses.flatMap((c) =>
    modelOf(c).logs.map((log, k) => ({
      // Sorting by the far end draws a rabbit on the bridge after the logs.
      depth: Math.max(...log.rings.flat().map((p) => cam.project(p).depth)),
      draw: () => drawLog(ctx, cam, log, boil, 2300 + k * 40),
    })),
  );
  return {
    shadows: () => {
      for (const c of crevasses) drawCrevasse(ctx, cam, modelOf(c), boil);
    },
    pieces,
  };
}

/** One flat piece of a wall, from the rim at `top` down to the floor at `bottom`. */
type Wall = { top: [V3, V3]; bottom: [V3, V3]; normal: V3; light: number };

/** A log as two rings of corners, one at each end. */
type Log = { rings: [V3[], V3[]]; axis: V3 };

/** The parts of a crevasse that never move. Built once per crevasse. */
type Model = { opening: V3[]; walls: Wall[]; logs: Log[]; shadows: V3[][] };

const models = new WeakMap<CrevasseView, Model>();

function modelOf(c: CrevasseView): Model {
  let m = models.get(c);
  if (!m) {
    m = build(c);
    models.set(c, m);
  }
  return m;
}

function build(c: CrevasseView): Model {
  const lefts = c.rims.map(([left]) => left);
  const rights = c.rims.map(([, right]) => right);
  // The foot of each wall, where it meets the flat floor.
  const foot = (from: V3, to: V3): V3 => ({ ...lerp(from, to, terrain.wall_share), y: -c.depth });
  const walls: Wall[] = [];
  const side = (rim: V3[], other: V3[], seed: number) => {
    for (let k = 0; k + 1 < rim.length; k++) {
      const top: [V3, V3] = [rim[k]!, rim[k + 1]!];
      const bottom: [V3, V3] = [foot(rim[k]!, other[k]!), foot(rim[k + 1]!, other[k + 1]!)];
      let normal = normalize(cross(sub(top[1], top[0]), sub(bottom[0], top[0])));
      const inward = sub(lerp(other[k]!, other[k + 1]!, 0.5), lerp(top[0], top[1], 0.5));
      if (dot(normal, inward) < 0) normal = scale(normal, -1);
      // Each piece's tone is a little off, like broken earth.
      const light = 0.35 + 0.4 * dot(normal, SUN) + 0.1 * noise(seed, k);
      walls.push({ top, bottom, normal, light });
    }
  };
  side(lefts, rights, 31);
  side(rights, lefts, 67);

  const logs: Log[] = [];
  if (c.bridge) {
    const [left, right] = c.bridge;
    const axis = normalize(sub(right, left));
    const beside = { x: -axis.z, y: 0, z: axis.x };
    for (const [k, shift] of [-1, 1].entries()) {
      // Each log is a little longer one way, and not quite square to the gap.
      const skew = scale(beside, shift * LOG.apart);
      const from = add(add(left, scale(axis, -LOG.past - 8 * k)), add(skew, scale(beside, 3 * shift)));
      const to = add(add(right, scale(axis, LOG.past + 10 * (1 - k))), skew);
      const along = normalize(sub(to, from));
      const flat = { x: -along.z, y: 0, z: along.x };
      const ring = (center: V3) =>
        Array.from({ length: LOG.sides }, (_, i) => {
          const a = ((i + 0.5) / LOG.sides) * Math.PI * 2;
          return add(
            { ...center, y: LOG.radius - LOG.sunk },
            add(scale(flat, Math.cos(a) * LOG.radius), { x: 0, y: Math.sin(a) * LOG.radius, z: 0 }),
          );
        });
      logs.push({ rings: [ring(from), ring(to)], axis: along });
    }
  }
  const onGround = (pts: Pt[]): V3[] => hull(pts).map((p) => ({ x: p.x, y: 0, z: p.y }));
  const shadows = logs.map((log) =>
    onGround(log.rings.flat().map((p) => ({ x: p.x + p.y * 0.9, y: p.z + p.y * 0.5 }))),
  );
  return { opening: [...lefts, ...rights.slice(1, -1).reverse()], walls, logs, shadows };
}

function drawCrevasse(ctx: CanvasRenderingContext2D, cam: Camera, m: Model, boil: Boil) {
  const rim = m.opening.map((p, k) => boil.jitter(cam.project(p), 2100 + k));
  if (rim.length < 3) return;
  const s = cam.project(m.opening[Math.floor(m.opening.length / 4)]!).scale;
  const eye = cam.eye;

  ctx.save();
  fill(ctx, rim, ABYSS);
  ctx.clip();
  const seen = m.walls
    .filter((w) => dot(w.normal, sub(eye, lerp(w.top[0], w.bottom[1], 0.5))) > 0)
    .map((w) => ({ w, depth: cam.project(lerp(w.top[0], w.top[1], 0.5)).depth }))
    .sort((a, b) => b.depth - a.depth);
  for (const { w } of seen) {
    for (let i = 0; i + 1 < BANDS.length; i++) {
      const [from, to] = [BANDS[i]!, BANDS[i + 1]!];
      const quad = [
        lerp(w.top[0], w.bottom[0], from),
        lerp(w.top[1], w.bottom[1], from),
        lerp(w.top[1], w.bottom[1], to),
        lerp(w.top[0], w.bottom[0], to),
      ].map((p) => cam.project(p));
      // The top band is the turf. The earth below fades into the dark.
      const color = i === 0 ? TURF : mix(blend(EARTH, w.light), ABYSS, Math.min(1, Math.pow((from + to) / 1.1, 0.6)));
      fill(ctx, quad, color);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    // A seam where two pieces of wall meet, fading out on the way down.
    line(ctx, [cam.project(w.top[0]), cam.project(lerp(w.top[0], w.bottom[0], 0.4))], SEAM, Math.max(0.5, 0.9 * s));
  }
  ctx.restore();

  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = Math.max(1, 2.4 * s);
  ctx.lineJoin = "round";
  ctx.beginPath();
  rim.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();

  for (const shadow of m.shadows)
    fill(
      ctx,
      shadow.map((p) => cam.project(p)),
      INK.shadow,
    );
}

function drawLog(ctx: CanvasRenderingContext2D, cam: Camera, log: Log, boil: Boil, seed: number) {
  const [near, far] = log.rings;
  const n = near.length;
  const a = near.map((p, k) => boil.jitter(cam.project(p), seed + k));
  const b = far.map((p, k) => boil.jitter(cam.project(p), seed + n + k));
  const s = cam.project(near[0]!).scale;
  const eye = cam.eye;
  const middle = (pts: V3[]) => scale(pts.reduce(add), 1 / pts.length);
  const facing = (normal: V3, at: V3) => dot(normal, sub(eye, at)) > 0;
  const center = middle([...near, ...far]);

  // The log is convex, so the faces that face the camera never overlap.
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const at = middle([near[k]!, near[j]!, far[j]!, far[k]!]);
    const normal = normalize(sub(at, add(center, scale(log.axis, dot(sub(at, center), log.axis)))));
    if (!facing(normal, at)) continue;
    const color = blend(BARK, (dot(normal, SUN) - 0.1) / 0.8 + 0.08 * noise(seed, k));
    fill(ctx, [a[k]!, a[j]!, b[j]!, b[k]!], color);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // Bark lines along the log.
    line(ctx, [a[k]!, b[k]!], SEAM, Math.max(0.5, 0.8 * s));
  }
  for (const [ring, pts, out] of [
    [near, a, scale(log.axis, -1)],
    [far, b, log.axis],
  ] as const) {
    if (!facing(out, middle(ring))) continue;
    fill(ctx, pts, CUT);
    const core = pts.reduce((sum, p) => ({ x: sum.x + p.x / n, y: sum.y + p.y / n }), { x: 0, y: 0 });
    line(
      ctx,
      [...pts, pts[0]!].map((p) => ({ x: core.x + (p.x - core.x) * 0.5, y: core.y + (p.y - core.y) * 0.5 })),
      SEAM,
      Math.max(0.5, 0.8 * s),
    );
    line(ctx, [...pts, pts[0]!], INK.ink, Math.max(0.8, 1.4 * s));
  }
  const outline = hull([...a, ...b]);
  line(ctx, [...outline, outline[0]!], INK.ink, Math.max(1, 2.2 * s));
}

/** Blend from the dark tone (light 0) through the middle tone to the lit tone (light 1). */
function blend(tones: readonly [string, string, string], light: number): string {
  const [lit, mid, dark] = tones;
  const t = Math.min(1, Math.max(0, light));
  return t < 0.5 ? mix(dark, mid, t / 0.5) : mix(mid, lit, (t - 0.5) / 0.5);
}

/** The color `k` of the way from `from` to `to`. Both are hex or `rgb()` colors. */
function mix(from: string, to: string, k: number): string {
  const [a, b] = [rgb(from), rgb(to)];
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function rgb(color: string): number[] {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return (color.match(/\d+/g) ?? []).map(Number);
}

function lerp(a: V3, b: V3, t: number): V3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function scale(v: V3, k: number): V3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: V3, b: V3): V3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
