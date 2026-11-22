import * as terrain from "@gleam/sim/sim/terrain.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { toArray } from "../gleam";
import type { Camera, V3 } from "./camera";
import { type Boil, INK, line, noise, type Pt } from "./ink";
import type { Layers, Piece } from "./spider-draw";
import type { RockView } from "./terrain-sim";

/** Stone tones, lit to dark. Shading blends between them. */
const STONE = ["#a39a7b", "#665f4a", "#2f2b21"] as const;
const SEAM = "rgba(22, 18, 12, 0.45)";

/** Toward the sun. It matches the shadows, which fall to +x and +z. */
const SUN = normalize({ x: -0.5, y: 1, z: -0.35 });

/**
 * Boulders, built in 3D and drawn with Canvas 2D. Each rock is the faceted
 * solid that the sim's terrain uses, so the spiders walk on exactly what is
 * drawn. Facets are lit by the sun, and the outline and the seams between
 * facets are inked.
 */
export function rockLayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  rocks: RockView[],
  boil: Boil,
): Layers {
  const seen = rocks.filter((r) => {
    const p = cam.project(r.center);
    const pad = r.radius * p.scale * 1.5;
    return (
      p.depth > 50 &&
      p.x > -pad &&
      p.x < cam.width + pad &&
      p.y > -pad &&
      p.y < cam.height + pad
    );
  });
  const shadows = () => {
    for (const r of seen)
      fill(
        ctx,
        modelOf(r).shadow.map((p) => cam.project(p)),
        INK.shadow,
      );
  };
  // Sorting by the far edge draws anything standing on or beside the rock after it.
  const pieces: Piece[] = seen.map((r) => ({
    depth: cam.project({ ...r.center, z: r.center.z + r.radius }).depth,
    draw: () => drawRock(ctx, cam, r, boil),
  }));
  return { shadows, pieces };
}

/** A facet as a polygon. `corners` are indices into the model's corners. */
type Face = { corners: number[]; normal: V3; middle: V3; light: number };

/**
 * The parts of a rock that never move. Built once per rock. `seams` are the
 * edges that two faces share. `shadow` and `tufts` lie on the ground.
 */
type Model = {
  corners: V3[];
  faces: Face[];
  seams: { ends: [number, number]; faces: [number, number] }[];
  shadow: V3[];
  tufts: V3[];
};

const models = new WeakMap<RockView, Model>();

function modelOf(r: RockView): Model {
  let m = models.get(r);
  if (!m) {
    m = build(r);
    models.set(r, m);
  }
  return m;
}

/** A half-space: the points `p` where `dot(normal, p - center) <= reach`. */
type Plane = { normal: V3; reach: number };

function build(r: RockView): Model {
  // The sim gives facets in units of the rock's radius and height.
  const planes: Plane[] = toArray(terrain.facets(r.rock)).map((f) => {
    const n = terrain.Facet$Facet$normal(f);
    return {
      normal: {
        x: vec3.Vec3$Vec3$x(n) / r.radius,
        y: vec3.Vec3$Vec3$y(n) / r.height,
        z: vec3.Vec3$Vec3$z(n) / r.radius,
      },
      reach: terrain.Facet$Facet$reach(f),
    };
  });
  const ground: Plane = { normal: { x: 0, y: -1, z: 0 }, reach: 0 };

  const corners: V3[] = [];
  const index = new Map<string, number>();
  const cornerAt = (p: V3): number => {
    const key = `${Math.round(p.x * 50)},${Math.round(p.y * 50)},${Math.round(p.z * 50)}`;
    let k = index.get(key);
    if (k === undefined) {
      k = corners.length;
      corners.push({ x: p.x + r.center.x, y: p.y, z: p.z + r.center.z });
      index.set(key, k);
    }
    return k;
  };

  const faces: Face[] = [];
  planes.forEach((plane, i) => {
    // A large square on the facet's plane, cut down by every other plane.
    const n = normalize(plane.normal);
    const on = scale(n, plane.reach / Math.hypot(plane.normal.x, plane.normal.y, plane.normal.z));
    const a = normalize(cross(n, Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }));
    const b = cross(n, a);
    const far = r.radius * 4;
    let pts = [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ].map(([u, v]) => add(on, add(scale(a, u! * far), scale(b, v! * far))));
    planes.forEach((other, j) => {
      if (j !== i) pts = clip(pts, other);
    });
    pts = clip(pts, ground);
    const ids = pts.map(cornerAt).filter((id, k, all) => id !== all[(k + 1) % all.length]);
    if (ids.length < 3) return;
    const middle = scale(
      ids.reduce((sum, id) => add(sum, corners[id]!), { x: 0, y: 0, z: 0 }),
      1 / ids.length,
    );
    // Sunlight, plus light from the sky that favors faces that point up. Each
    // facet's tone is a little off, like weathered stone.
    const light =
      (0.6 * (dot(n, SUN) - 0.2)) / 0.7 + 0.4 * n.y * n.y + 0.09 * noise(i, Math.round(r.center.x));
    faces.push({ corners: ids, normal: n, middle, light });
  });

  const sides = new Map<string, { ends: [number, number]; faces: number[] }>();
  faces.forEach((f, i) => {
    f.corners.forEach((from, k) => {
      const to = f.corners[(k + 1) % f.corners.length]!;
      const key = from < to ? `${from},${to}` : `${to},${from}`;
      const side = sides.get(key) ?? { ends: [from, to], faces: [] };
      side.faces.push(i);
      sides.set(key, side);
    });
  });
  const seams = [...sides.values()]
    .filter((s) => s.faces.length === 2)
    .map((s) => ({ ends: s.ends, faces: [s.faces[0]!, s.faces[1]!] as [number, number] }));

  // Hulls on the ground plane: `y` stands for world z. The shadow is longer
  // than the sun makes it, so it shows past the rock.
  const flat = (pts: Pt[]): V3[] => hull(pts).map((p) => ({ x: p.x, y: 0, z: p.y }));
  const shadow = flat(corners.map((p) => ({ x: p.x + p.y * 0.9, y: p.z + p.y * 0.5 })));
  const foot = flat(corners.filter((p) => p.y < 0.01).map((p) => ({ x: p.x, y: p.z })));
  // Grass grows at the middle of the three nearest edges of the base.
  const tufts = foot
    .map((p, k) => scale(add(p, foot[(k + 1) % foot.length]!), 0.5))
    .sort((p, q) => p.z - q.z)
    .slice(0, 3);
  return { corners, faces, seams, shadow, tufts };
}

/** The part of the polygon `pts` inside the half-space `plane`. Points are measured from the rock's center. */
function clip(pts: V3[], plane: Plane): V3[] {
  const out: V3[] = [];
  pts.forEach((p, k) => {
    const q = pts[(k + 1) % pts.length]!;
    const dp = dot(plane.normal, p) - plane.reach;
    const dq = dot(plane.normal, q) - plane.reach;
    if (dp <= 0) out.push(p);
    if (dp < 0 !== dq < 0 && dp !== 0 && dq !== 0)
      out.push(add(p, scale(add(q, scale(p, -1)), dp / (dp - dq))));
  });
  return out;
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  r: RockView,
  boil: Boil,
) {
  const m = modelOf(r);
  const seed = 900 + Math.round(r.center.x * 0.37 + r.center.z * 0.11);
  const s = cam.project(r.center).scale;
  const ink = Math.max(1, 2.4 * s);
  // Each corner boils once, so the facets stay joined.
  const pts = m.corners.map((p, k) => boil.jitter(cam.project(p), seed + k));
  const eye = cam.eye;
  const seen = m.faces.map(
    (f) =>
      dot(f.normal, {
        x: eye.x - f.middle.x,
        y: eye.y - f.middle.y,
        z: eye.z - f.middle.z,
      }) > 0,
  );

  // The rock is convex, so the faces that face the camera never overlap.
  m.faces.forEach((f, i) => {
    if (!seen[i]) return;
    const color = blend(f.light);
    fill(
      ctx,
      f.corners.map((k) => pts[k]!),
      color,
    );
    // A hairline in the same color hides the gaps between faces.
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });
  for (const seam of m.seams)
    if (seen[seam.faces[0]] && seen[seam.faces[1]])
      line(
        ctx,
        seam.ends.map((k) => pts[k]!),
        SEAM,
        Math.max(0.5, 0.9 * s),
      );

  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = ink;
  ctx.lineJoin = "round";
  ctx.beginPath();
  hull(pts).forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();

  // Grass tufts at the base, on the near side.
  m.tufts.forEach((p, k) => {
    const foot = cam.project(p);
    for (const lean of [-0.5, 0, 0.5]) {
      const tall = (Math.min(14, r.radius * 0.3) + 4 * noise(seed + k, lean)) * s;
      line(
        ctx,
        [foot, { x: foot.x + lean * tall * 0.6, y: foot.y - tall }],
        INK.ink,
        Math.max(0.6, 1.3 * s),
      );
    }
  });
}

/** The convex hull of `points`, counterclockwise on screen. */
export function hull<T extends Pt>(points: T[]): T[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: T[]) => {
    const out: T[] = [];
    for (const p of list) {
      while (
        out.length >= 2 &&
        turn(out[out.length - 2]!, out[out.length - 1]!, p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

export function fill(ctx: CanvasRenderingContext2D, points: Pt[], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
}

const TONES = STONE.map((hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}) as [number[], number[], number[]];

/** Blend from the dark tone (light 0) through the middle tone to the lit tone (light 1). */
function blend(light: number): string {
  const [lit, mid, dark] = TONES;
  const t = Math.min(1, Math.max(0, light));
  const [from, to, k] =
    t < 0.5 ? [dark, mid, t / 0.5] : [mid, lit, (t - 0.5) / 0.5];
  const c = from.map((v, i) => Math.round(v + (to[i]! - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function scale(v: V3, k: number): V3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: V3, b: V3): V3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
