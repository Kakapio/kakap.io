import type { Camera, V3 } from "./camera";
import { type Boil, INK, line, noise, type Pt } from "./ink";
import type { Layers, Piece } from "./spider-draw";
import type { RockView } from "./terrain-sim";

const STONE = {
  body: "#57513f",
  light: "#716a52",
  dark: "#3b372b",
} as const;

/** Boulders: the projected outline of each half-ellipsoid, shaded from the low sun. */
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
    for (const r of seen) {
      const shift = { x: r.height * 0.5, y: 0, z: r.height * 0.35 };
      const ring = circle(r.center, r.radius * 0.95, 0, 20).map((p) =>
        cam.project({ x: p.x + shift.x, y: 0, z: p.z + shift.z }),
      );
      fill(ctx, ring, INK.shadow);
    }
  };
  // Sorting by the far edge draws anything standing on or beside the rock after it.
  const pieces: Piece[] = seen.map((r) => ({
    depth: cam.project({ ...r.center, z: r.center.z + r.radius }).depth,
    draw: () => drawRock(ctx, cam, r, boil),
  }));
  return { shadows, pieces };
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  r: RockView,
  boil: Boil,
) {
  const seed = 900 + Math.round(r.center.x * 0.37 + r.center.z * 0.11);
  const outline = hull(
    dome(r, r.radius, r.height, 0, 0).map((p) => cam.project(p)),
  ).map((p, k) => boil.jitter(p, seed + k));
  const s = cam.project(r.center).scale;

  ctx.save();
  fill(ctx, outline, STONE.body);
  ctx.clip();
  // A dark face away from the sun, and a lit patch on top toward it.
  fill(
    ctx,
    hull(
      dome(r, r.radius * 0.85, r.height * 1.05, r.radius * 0.5, r.radius * 0.15).map((p) =>
        cam.project(p),
      ),
    ),
    STONE.dark,
  );
  const lit = boil.jitter(cam.project(surface(r, 0.3, -2.3)), seed + 30);
  ctx.fillStyle = STONE.light;
  ctx.beginPath();
  ctx.ellipse(lit.x, lit.y, r.radius * 0.42 * s, r.radius * 0.24 * s, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = Math.max(1, 2.4 * s);
  ctx.lineJoin = "round";
  ctx.beginPath();
  outline.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();

  // Two cracks running down from near the top.
  for (const k of [0, 1]) {
    const a = noise(seed, k) * Math.PI;
    const start = surface(r, 0.25 + 0.2 * k, a);
    const end = surface(r, 0.85, a + noise(seed, k + 3) * 0.6);
    const mid = surface(r, 0.55, a - noise(seed, k + 5) * 0.4);
    line(
      ctx,
      [start, mid, end].map((p, j) =>
        boil.jitter(cam.project(p), seed + 40 + k * 3 + j),
      ),
      INK.ink,
      Math.max(0.6, 1.2 * s),
    );
  }

  // Grass tufts at the base, on the near side.
  for (const k of [0, 1, 2]) {
    const a = Math.PI * (1.2 + 0.3 * k + noise(seed, k + 9) * 0.1);
    const foot = cam.project({
      x: r.center.x + Math.cos(a) * r.radius,
      y: 0,
      z: r.center.z + Math.sin(a) * r.radius,
    });
    for (const lean of [-0.5, 0, 0.5]) {
      const tall = (14 + 5 * noise(seed + k, lean)) * s;
      line(
        ctx,
        [foot, { x: foot.x + lean * tall * 0.6, y: foot.y - tall }],
        INK.ink,
        Math.max(0.6, 1.3 * s),
      );
    }
  }
}

/** A point on the rock's surface: `t` from 0 (top) to 1 (base), at yaw `a`. */
function surface(r: RockView, t: number, a: number): V3 {
  const up = Math.cos((t * Math.PI) / 2);
  const out = Math.sin((t * Math.PI) / 2);
  return {
    x: r.center.x + Math.cos(a) * r.radius * out,
    y: r.height * up,
    z: r.center.z + Math.sin(a) * r.radius * out,
  };
}

/** Points on a half-ellipsoid, moved by (dx, dz) from the rock's center. */
function dome(
  r: RockView,
  radius: number,
  height: number,
  dx: number,
  dz: number,
): V3[] {
  const center = { x: r.center.x + dx, y: 0, z: r.center.z + dz };
  const points: V3[] = [];
  for (const t of [0, 0.35, 0.6, 0.8, 0.93, 1]) {
    points.push(
      ...circle(
        center,
        radius * Math.sqrt(1 - t * t),
        height * t,
        t === 1 ? 1 : 18,
      ),
    );
  }
  return points;
}

function circle(center: V3, radius: number, y: number, steps: number): V3[] {
  return Array.from({ length: steps }, (_, k) => {
    const a = (k / steps) * Math.PI * 2;
    return {
      x: center.x + Math.cos(a) * radius,
      y,
      z: center.z + Math.sin(a) * radius,
    };
  });
}

/** The convex hull of `points`, counterclockwise on screen. */
function hull<T extends Pt>(points: T[]): T[] {
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

function fill(ctx: CanvasRenderingContext2D, points: Pt[], color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
}
