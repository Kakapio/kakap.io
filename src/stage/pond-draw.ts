import type { Camera, V3 } from "./camera";
import { type Boil, INK, line, noise, type Pt, taperedStroke } from "./ink";
import { type KoiView, FISH_LENGTH } from "./pond-sim";
import { fill } from "./rock-draw";
import type { Layers, Piece } from "./spider-draw";
import type { PondView } from "./terrain-sim";

const WATER = { deep: "#1b4650", shallow: "#37756f", wash: "rgba(36, 98, 100, 0.24)", glint: "rgba(214, 240, 232, 0.55)" };
const BANK = "#4a4430";
const PAD = { top: "#6f8f3f", edge: "#3f5a26" };
const REED = { stalk: "#5f6f35", head: "#5a3b22" };
/**
 * How one koi looks: its body color, the color of its fins, and its patches.
 * A patch runs from one share of the body's length to another, and from one
 * side to another in half-widths (1 is the left edge, -1 the right).
 */
type Look = { body: string; fin: string; patches: { from: number; to: number; left: number; right: number; color: string }[] };

const CREAM = "#e6dcc0";
const RUST = "#c4702f";
const SLATE = "#4d4d55";

/** Soft, warm colors, like the rabbits' fur and tunics. Fish `id` gets look `id`, and they repeat. */
const LOOKS: Look[] = [
  {
    body: CREAM,
    fin: "#d6cba8",
    patches: [
      { from: 0.1, to: 0.36, left: 1.5, right: -0.2, color: RUST },
      { from: 0.58, to: 0.84, left: 0.3, right: -1.5, color: RUST },
    ],
  },
  { body: RUST, fin: "#a85c25", patches: [{ from: 0.4, to: 0.58, left: 1.5, right: -1.5, color: CREAM }] },
  {
    body: CREAM,
    fin: "#d6cba8",
    patches: [
      { from: 0.22, to: 0.5, left: 0.2, right: -1.5, color: SLATE },
      { from: 0.66, to: 0.88, left: 1.5, right: -0.1, color: RUST },
    ],
  },
  { body: "#d9b44e", fin: "#c09a3c", patches: [{ from: 0.05, to: 0.2, left: 1.5, right: -1.5, color: CREAM }] },
];

/** Half the width of a fish at each point of its spine, from head to tail, as shares of its length. */
const GIRTH = [0.1, 0.17, 0.18, 0.15, 0.1, 0.055];

/** The parts of a pond that never move. `rim` is the water's edge and `bank` the wet earth around it. */
type Model = { rim: V3[]; bank: V3[]; pads: { at: V3; radius: number; turn: number }[]; reeds: { at: V3; tall: number; lean: number }[] };

const models = new WeakMap<PondView, Model>();

function modelOf(pond: PondView): Model {
  let m = models.get(pond);
  if (!m) {
    m = build(pond);
    models.set(pond, m);
  }
  return m;
}

function build(pond: PondView): Model {
  const seed = pond.center.x * 0.37 + pond.center.z * 0.11;
  const around = (count: number, radius: (k: number) => number): V3[] =>
    Array.from({ length: count }, (_, k) => {
      const a = (k / count) * Math.PI * 2;
      return { x: pond.center.x + Math.cos(a) * radius(k), y: 0, z: pond.center.z + Math.sin(a) * radius(k) };
    });
  // The drawn edge wobbles a little around the circle the sim uses.
  const wobble = (k: number) => 1 + 0.035 * noise(seed, k) + 0.02 * Math.sin(k * 0.9);
  const rim = around(44, (k) => pond.radius * wobble(k));
  const bank = around(44, (k) => pond.radius * wobble(k) + 7 + 3 * noise(seed + 3, k));
  const r = (k: number) => (noise(seed + 9, k) + 1) / 2;
  const pads = Array.from({ length: 3 }, (_, k) => {
    const a = r(k) * Math.PI * 2;
    const d = pond.radius * (0.45 + 0.35 * r(k + 10));
    return {
      at: { x: pond.center.x + Math.cos(a) * d, y: 0, z: pond.center.z + Math.sin(a) * d },
      radius: 11 + 5 * r(k + 20),
      turn: r(k + 30) * Math.PI * 2,
    };
  });
  // Reeds stand along the far bank, where they hide nothing in the water.
  const reeds = Array.from({ length: 9 }, (_, k) => {
    const a = Math.PI * (0.18 + 0.64 * ((k + r(k + 40)) / 9));
    const d = pond.radius + 4 + 8 * r(k + 50);
    return {
      at: { x: pond.center.x + Math.cos(a) * d, y: 0, z: pond.center.z + Math.sin(a) * d },
      tall: 34 + 26 * r(k + 60),
      lean: 0.25 * noise(seed + 5, k),
    };
  });
  return { rim, bank, pads, reeds };
}

/**
 * Ponds with koi in them. The water lies flat on the ground, so it is
 * drawn with the ground, under everything that stands on it. The fish swim
 * under the surface: they are drawn first, and a thin wash of water goes over
 * them. `touches` are the points where something stands in the water; each
 * one sends out ripples. The reeds on the bank stand up, so they are sorted
 * with the scene.
 */
export function pondLayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  ponds: PondView[],
  school: KoiView[],
  touches: V3[],
  time: number,
  boil: Boil,
): Layers {
  const pieces: Piece[] = ponds.flatMap((pond) =>
    modelOf(pond).reeds.map((reed, k) => ({
      depth: cam.project(reed.at).depth,
      draw: () => drawReed(ctx, cam, reed, time, boil, 3100 + k * 7),
    })),
  );
  return {
    shadows: () => {
      for (const pond of ponds) drawPond(ctx, cam, pond, school, touches, time, boil);
    },
    pieces,
  };
}

function drawPond(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pond: PondView,
  school: KoiView[],
  touches: V3[],
  time: number,
  boil: Boil,
) {
  const m = modelOf(pond);
  const center = cam.project(pond.center);
  const s = center.scale;
  fill(
    ctx,
    m.bank.map((p) => cam.project(p)),
    BANK,
  );
  const rim = m.rim.map((p, k) => boil.jitter(cam.project(p), 3000 + k));

  ctx.save();
  const depth = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, pond.radius * s);
  depth.addColorStop(0, WATER.deep);
  depth.addColorStop(0.7, WATER.deep);
  depth.addColorStop(1, WATER.shallow);
  ctx.beginPath();
  rim.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = depth;
  ctx.fill();
  ctx.clip();

  for (const fish of school) drawKoi(ctx, cam, fish, time, boil);
  fill(ctx, rim, WATER.wash);

  // Glints drift across the surface.
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4 + time * 0.05;
    const d = pond.radius * (0.2 + 0.6 * ((noise(k, 3) + 1) / 2));
    const at: V3 = { x: pond.center.x + Math.cos(a) * d, y: 0, z: pond.center.z + Math.sin(a) * d };
    const half = 7 + 5 * Math.sin(time * 0.9 + k);
    line(ctx, [cam.project({ ...at, x: at.x - half }), cam.project({ ...at, x: at.x + half })], WATER.glint, Math.max(0.6, 1.1 * s));
  }

  // Each touch sends out two rings, one after the other.
  for (const touch of touches) {
    if (Math.hypot(touch.x - pond.center.x, touch.z - pond.center.z) > pond.radius) continue;
    for (const offset of [0, 0.5]) {
      const age = (time * 0.9 + offset + noise(Math.round(touch.x), 1)) % 1;
      const radius = 5 + 22 * age;
      const ring = Array.from({ length: 25 }, (_, k) => {
        const a = (k / 24) * Math.PI * 2;
        return cam.project({ x: touch.x + Math.cos(a) * radius, y: 0, z: touch.z + Math.sin(a) * radius });
      });
      line(ctx, ring, `rgba(214, 240, 232, ${0.6 * (1 - age)})`, Math.max(0.6, 1.2 * s));
    }
  }

  for (const pad of m.pads) drawPad(ctx, cam, pad);
  ctx.restore();

  line(ctx, [...rim, rim[0]!], INK.ink, Math.max(1, 2.2 * s));
}

/** A lily pad: a flat disc with a wedge cut out of it. */
function drawPad(ctx: CanvasRenderingContext2D, cam: Camera, pad: Model["pads"][number]) {
  const s = cam.project(pad.at).scale;
  const edge: Pt[] = [cam.project(pad.at)];
  for (let k = 0; k <= 20; k++) {
    const a = pad.turn + 0.35 + (k / 20) * (Math.PI * 2 - 0.7);
    edge.push(cam.project({ x: pad.at.x + Math.cos(a) * pad.radius, y: 0, z: pad.at.z + Math.sin(a) * pad.radius }));
  }
  fill(ctx, edge, PAD.top);
  line(ctx, [...edge, edge[0]!], PAD.edge, Math.max(0.6, 1.2 * s));
}

function drawReed(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  reed: Model["reeds"][number],
  time: number,
  boil: Boil,
  seed: number,
) {
  const base = cam.project(reed.at);
  const s = base.scale;
  const sway = reed.lean + 0.06 * Math.sin(time * 1.1 + seed);
  const tall = reed.tall * s;
  const at = (share: number, k: number) =>
    boil.jitter({ x: base.x + Math.sin(sway) * tall * share * share, y: base.y - tall * share }, seed + k);
  const [foot, middle, top] = [at(0, 0), at(0.5, 1), at(1, 2)];
  taperedStroke(ctx, [{ ...foot, w: 3 * s }, { ...middle, w: 2.4 * s }, { ...top, w: 1.4 * s }], INK.ink);
  taperedStroke(ctx, [{ ...foot, w: 1.8 * s }, { ...middle, w: 1.4 * s }, { ...top, w: 0.8 * s }], REED.stalk);
  // The seed head sits a little below the tip.
  const [from, to] = [at(0.72, 3), at(0.93, 4)];
  taperedStroke(ctx, [{ ...from, w: 6.5 * s }, { ...to, w: 6.5 * s }], INK.ink);
  taperedStroke(ctx, [{ ...from, w: 4.5 * s }, { ...to, w: 4.5 * s }], REED.head);
}

/**
 * A koi seen from above, drawn like the rabbits: one plain shape in a flat
 * color with a bold ink line around it, and patches of a second color. The
 * body follows a smooth curve through the spine, so it bends without
 * corners. The side fins beat, and the tail fin is part of the outline.
 */
function drawKoi(ctx: CanvasRenderingContext2D, cam: Camera, fish: KoiView, time: number, boil: Boil) {
  const look = LOOKS[fish.id % LOOKS.length]!;
  const spine = fish.spine;
  const last = spine.length - 1;
  if (last < 2) return;
  const s = cam.project(spine[0]!).scale;
  const joint = (i: number) => spine[Math.min(last, Math.max(0, i))]!;
  // The point `share` of the way along a smooth curve through the spine (a Catmull-Rom spline).
  const along = (share: number): V3 => {
    const f = Math.min(last - 1e-6, Math.max(0, share * last));
    const i = Math.floor(f);
    const t = f - i;
    const [a, b, c, d] = [joint(i - 1), joint(i), joint(i + 1), joint(i + 2)];
    const blend = (p0: number, p1: number, p2: number, p3: number) =>
      0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
    return { x: blend(a.x, b.x, c.x, d.x), y: 0, z: blend(a.z, b.z, c.z, d.z) };
  };
  // The way the body points at `share`, from head to tail.
  const heading = (share: number) => {
    const [a, b] = [along(share - 0.04), along(share + 0.04)];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  };
  const girth = (share: number) => {
    const f = Math.min(last - 1e-6, Math.max(0, share * last));
    const i = Math.floor(f);
    return (GIRTH[i]! + (GIRTH[i + 1]! - GIRTH[i]!) * (f - i)) * FISH_LENGTH;
  };
  // A point of the fish: `share` along the body, `side` half-widths to its left, and `out` lengths past that along the body.
  const at = (share: number, side: number, out = 0, k = 0): Pt => {
    const [p, d] = [along(share), heading(share)];
    const [w, o] = [girth(share) * side, out * FISH_LENGTH];
    const on = cam.project({ x: p.x - d.z * w + d.x * o, y: 0, z: p.z + d.x * w + d.z * o });
    return k ? boil.jitter(on, 3300 + fish.id * 97 + k) : on;
  };
  // The same line weight as the rabbits and the rocks.
  const ink = Math.max(1, 2.2 * s);

  // Side fins, under the body. They beat faster when the fish darts.
  const beat = 0.5 + 0.5 * Math.sin(time * (6 + 8 * fish.scare) + fish.id * 2);
  for (const side of [-1, 1]) {
    const fin = [at(0.3, side * 0.7), at(0.4, side * (1.9 + 0.5 * beat), 0, 60 + side), at(0.5, side * 0.7)];
    fill(ctx, fin, look.fin);
    line(ctx, fin, INK.ink, ink);
  }

  // The outline: around the nose, down one side, around the tail fin, and back up the other side.
  const steps = 12;
  const flank = (side: number) => Array.from({ length: steps + 1 }, (_, i) => at(i / steps, side, 0, 1 + i + (side > 0 ? 0 : 20)));
  const spread = (0.15 + 0.04 * fish.scare) / GIRTH[last]!;
  const outline = [at(0, 0, -0.07, 50), ...flank(1), at(1, spread, 0.2, 51), at(1, 0, 0.13, 52), at(1, -spread, 0.2, 53), ...flank(-1).reverse()];

  ctx.save();
  fill(ctx, outline, look.body);
  ctx.clip();
  // Each patch follows the curve of the body.
  for (const patch of look.patches) {
    const shares = Array.from({ length: 5 }, (_, i) => patch.from + ((patch.to - patch.from) * i) / 4);
    fill(ctx, [...shares.map((t) => at(t, patch.left)), ...shares.reverse().map((t) => at(t, patch.right))], patch.color);
  }
  fill(ctx, [at(0.98, 6), at(1, 6, 0.3), at(1, -6, 0.3), at(0.98, -6)], look.fin);
  ctx.restore();
  line(ctx, [...outline, outline[0]!], INK.ink, ink);

  ctx.fillStyle = INK.ink;
  for (const side of [-0.5, 0.5]) {
    const eye = at(0.08, side);
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, Math.max(0.8, 1.4 * s), 0, Math.PI * 2);
    ctx.fill();
  }
}
