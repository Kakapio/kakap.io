import type { Camera, V3 } from "./camera";
import { type Boil, INK, type InkPoint, line, taperedStroke } from "./ink";
import type { LegView, SpiderView } from "./spider-sim";

export const GROUP_COLOR = ["#f2c66d", "#7fd3e0"] as const;

/** `eyeHue` is the eye color's hue in degrees. */
export type DrawOptions = { boil: Boil; time: number; skeleton: boolean; eyeHue: number };

/** Something drawn in depth order with the rest of the scene. Larger depth is farther away. */
export type Piece = { depth: number; draw: () => void };

/** A creature split into what goes under everything, and parts to depth-sort with the scene. */
/** `overlay` draws above the creatures, and `ui` above the vignette, like a game HUD. */
export type Layers = { shadows: () => void; pieces: Piece[]; overlay?: () => void; ui?: () => void };

const add = (a: V3, b: V3): V3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const mul = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Where the low sun throws the shadow of `p` onto the ground. */
const shadowOf = (p: V3): V3 => ({
  x: p.x + p.y * 0.5,
  y: 0,
  z: p.z + p.y * 0.35,
});

/** The body's axes, tilted by pitch and roll. `k` scales the body parts. */
type Frame = { body: V3; forward: V3; side: V3; up: V3; k: number };

function frameOf(s: SpiderView): Frame {
  const [ch, sh] = [Math.cos(s.heading), Math.sin(s.heading)];
  const forward = { x: ch * Math.cos(s.pitch), y: Math.sin(s.pitch), z: sh * Math.cos(s.pitch) };
  const side = { x: -sh * Math.cos(s.roll), y: Math.sin(s.roll), z: ch * Math.cos(s.roll) };
  return { body: s.body, forward, side, up: cross(side, forward), k: s.size };
}

const cephOf = (f: Frame) => add(f.body, mul(f.forward, 14 * f.k));
const abdomenOf = (f: Frame) =>
  add(add(f.body, mul(f.forward, -56 * f.k)), mul(f.up, 10 * f.k));

export function spiderLayers(ctx: CanvasRenderingContext2D, cam: Camera, s: SpiderView, opts: DrawOptions): Layers {
  const f = frameOf(s);
  const pieces: Piece[] = s.legs.map((leg, i) => {
    const middle = (cam.project(leg.hip).depth + cam.project(leg.knee).depth + cam.project(leg.ankle).depth) / 3;
    // A foot up on a rock sorts by the foot, so the rock does not cover it.
    const onRock = leg.foot.y > 2 && !leg.swinging;
    return {
      depth: onRock ? Math.min(middle, cam.project(leg.foot).depth) : middle,
      draw: () => drawLeg(ctx, cam, leg, i, opts, f.k),
    };
  });
  pieces.push({ depth: cam.project(abdomenOf(f)).depth, draw: () => drawAbdomen(ctx, cam, f, opts) });
  pieces.push({ depth: cam.project(cephOf(f)).depth - 1, draw: () => drawHead(ctx, cam, f, opts) });
  return {
    shadows: () => drawShadows(ctx, cam, s, f),
    pieces,
    overlay: opts.skeleton ? () => drawSkeleton(ctx, cam, s, f) : undefined,
  };
}

function drawShadows(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  s: SpiderView,
  f: Frame,
) {
  const blob = (center: V3, radius: number) => {
    const ground = shadowOf(center);
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const p = cam.project({
        x: ground.x + Math.cos(a) * radius,
        y: 0,
        z: ground.z + Math.sin(a) * radius,
      });
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.fillStyle = INK.shadow;
    ctx.fill();
  };
  blob(abdomenOf(f), 46 * f.k);
  blob(cephOf(f), 28 * f.k);
  for (const leg of s.legs) {
    const pts = [leg.hip, leg.knee, leg.ankle, leg.foot].map((p) =>
      cam.project(shadowOf(p)),
    );
    line(ctx, pts, INK.legShadow, Math.max(1, 3 * f.k * pts[1]!.scale));
  }
}

function drawLeg(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  leg: LegView,
  i: number,
  opts: DrawOptions,
  k: number,
) {
  const widths = [9, 7, 3.6, 1.2].map((w) => w * k);
  const pts: InkPoint[] = [leg.hip, leg.knee, leg.ankle, leg.foot].map(
    (p, k) => {
      const q = cam.project(p);
      return opts.boil.jitter(
        { x: q.x, y: q.y, w: Math.max(0.8, widths[k]! * q.scale) },
        i * 10 + k,
      );
    },
  );
  taperedStroke(ctx, pts, INK.ink);

  const knee = pts[1]!;
  ctx.fillStyle = INK.ink;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, knee.w * 0.85, 0, Math.PI * 2);
  ctx.fill();

  // Bristles along the long lower segment, flicking away from the leg.
  const [a, b] = [pts[1]!, pts[2]!];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const hair = 7 * k * cam.project(leg.ankle).scale;
  const bristles = [];
  for (let k = 1; k <= 6; k++) {
    const t = k / 7;
    const side = k % 2 ? 1 : -1;
    const base = { x: a.x + dx * t, y: a.y + dy * t };
    bristles.push([
      base,
      {
        x: base.x + nx * side * hair + (dx / len) * hair * 0.6,
        y: base.y + ny * side * hair + (dy / len) * hair * 0.6,
      },
    ]);
  }
  for (const [p, q] of bristles)
    line(
      ctx,
      [p!, q!],
      INK.ink,
      Math.max(0.6, 1.1 * k * cam.project(leg.knee).scale),
    );
}

/** Draw an ellipsoid as a filled outline. `rx` runs along `forward`, `ry` across it. */
function ellipsoid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  center: V3,
  forward: V3,
  rx: number,
  ry: number,
  fill: string,
  boil: Boil,
  seed: number,
  k: number,
) {
  const c = boil.jitter(cam.project(center), seed);
  const tip = cam.project(add(center, mul(forward, rx)));
  const minor = ry * c.scale;
  const major = Math.max(Math.hypot(tip.x - c.x, tip.y - c.y), minor * 0.9);
  const angle = Math.atan2(tip.y - c.y, tip.x - c.x);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, major, minor, angle, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = Math.max(1.2, 3 * Math.max(0.7, k) * c.scale);
  ctx.stroke();
}

function drawAbdomen(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  f: Frame,
  opts: DrawOptions,
) {
  const center = abdomenOf(f);
  const rx = 54 * f.k;
  const ry = 40 * f.k;
  ellipsoid(ctx, cam, center, f.forward, rx, ry, INK.inkSoft, opts.boil, 201, f.k);
  ellipsoid(
    ctx,
    cam,
    add(center, mul(f.up, ry * 0.35)),
    f.forward,
    rx * 0.62,
    ry * 0.5,
    "#3a3225",
    opts.boil,
    202,
    f.k,
  );

  // Pale chevrons down the back: the eye hue at the saturation and lightness of INK.bone.
  const chevron = `hsl(${opts.eyeHue} 33% 72%)`;
  const on = (t: number, s: number) =>
    cam.project(
      add(
        add(add(center, mul(f.forward, t)), mul(f.side, s)),
        mul(f.up, ry * 0.9),
      ),
    );
  for (let k = 0; k < 3; k++) {
    const t = rx * 0.4 - k * rx * 0.32;
    const width = ry * (0.42 - k * 0.08);
    const pts = [on(t - 10 * f.k, -width), on(t, 0), on(t - 10 * f.k, width)].map((p, j) =>
      opts.boil.jitter(p, 230 + k * 3 + j),
    );
    line(ctx, pts, chevron, Math.max(1, 2.6 * f.k * pts[1]!.scale));
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  f: Frame,
  opts: DrawOptions,
) {
  const ceph = cephOf(f);
  const k = f.k;
  const rx = 30 * k;
  const ry = 24 * k;
  const at = (t: number, s: number, u: number) =>
    add(add(add(ceph, mul(f.forward, t)), mul(f.side, s)), mul(f.up, u));

  // Pedipalps: two short feelers that twitch.
  for (const side of [-1, 1]) {
    const twitch = Math.sin(opts.time * 5 + side * 1.7) * 5 * k;
    const pts = [
      at(rx * 0.7, side * 10 * k, -4 * k),
      at(rx + 20 * k, side * 18 * k, 10 * k + twitch),
      at(rx + 34 * k, side * 15 * k, -28 * k + twitch),
    ].map((p, j) => {
      const q = cam.project(p);
      return opts.boil.jitter(
        { x: q.x, y: q.y, w: Math.max(0.8, [6, 4, 1.4][j]! * k * q.scale) },
        300 + side * 5 + j,
      );
    });
    taperedStroke(ctx, pts, INK.ink);
  }

  ellipsoid(ctx, cam, ceph, f.forward, rx, ry, INK.inkSoft, opts.boil, 210, k);

  // Fangs.
  for (const side of [-1, 1]) {
    const pts = [
      at(rx * 0.85, side * 6 * k, -ry * 0.2),
      at(rx * 1.15, side * 5 * k, -ry * 0.8),
    ].map((p, j) => {
      const q = cam.project(p);
      return { x: q.x, y: q.y, w: Math.max(0.8, [5, 1][j]! * k * q.scale) };
    });
    taperedStroke(ctx, pts, INK.ink);
  }

  // Eyes: two large, four small, glowing blue.
  const eyes: [number, number, number][] = [
    [0.78, -7, 3.6],
    [0.78, 7, 3.6],
    [0.6, -14, 2.2],
    [0.6, 14, 2.2],
    [0.45, -9, 1.8],
    [0.45, 9, 1.8],
  ];
  const h = opts.eyeHue;
  const glow = `hsl(${h} 100% 62% / 0.3)`;
  const iris = `hsl(${h} 100% 66%)`;
  const shine = `hsl(${h} 100% 95%)`;
  for (const [t, across, size] of eyes) {
    const r = size * k;
    const p = cam.project(at(rx * t, across * k, ry * 0.6));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.8 * p.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.9, r * p.scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(p.x - r * 0.3 * p.scale, p.y - r * 0.3 * p.scale, Math.max(0.4, r * 0.35 * p.scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  s: SpiderView,
  f: Frame,
) {
  for (const leg of s.legs) {
    const color = leg.stretched ? "#e0533d" : GROUP_COLOR[leg.group]!;
    const ring: { x: number; y: number }[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ring.push(
        cam.project({
          x: leg.home.x + Math.cos(a) * 10 * f.k,
          y: leg.home.y,
          z: leg.home.z + Math.sin(a) * 10 * f.k,
        }),
      );
    }
    line(ctx, ring, color, 1.5);
    const foot = cam.project({ ...leg.foot, y: 0 });
    const home = cam.project(leg.home);
    ctx.setLineDash([3, 4]);
    line(ctx, [foot, home], color, 1);
    ctx.setLineDash([]);
    const bones = [leg.hip, leg.knee, leg.ankle, leg.foot].map((p) =>
      cam.project(p),
    );
    line(ctx, bones, color, leg.swinging ? 2.5 : 1.2);
    for (const b of bones) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const ground = { ...f.body, y: 0 };
  line(
    ctx,
    [cam.project(ground), cam.project(add(ground, mul(f.forward, 90 * f.k)))],
    "#efe3b8",
    1.5,
  );
}
