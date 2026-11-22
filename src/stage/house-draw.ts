import * as terrain from "@gleam/sim/sim/terrain.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import type { Camera, V3 } from "./camera";
import { type Boil, INK, line, noise, type Pt } from "./ink";
import { fill } from "./rock-draw";
import type { Layers, Piece } from "./spider-draw";
import type { HouseView } from "./terrain-sim";

/** Three tones per material, lit to dark. Shading blends between them. */
type Tones = readonly [string, string, string];

const GRASS: Tones = ["#7f8b4d", "#5d6b3d", "#394327"];
const BRICK: Tones = ["#8a6650", "#6e5040", "#4f392d"];
const CAP: Tones = ["#5e4535", "#4a3529", "#33241c"];
const WALL = "#857558";
const STONE = "#8c8270";
const GLOW = { lit: "#f4c96a", dim: "#6f5c36" } as const;

/** Door colors by house index. House 0 belongs to Steph, Alex and Rishi. */
const DOORS = ["#3f6e4e", "#8a3d2b"];
const FLOWERS = ["#e58fb0", "#f0d46a", "#efe7d6"];

/** Toward the sun. It matches the shadows, which fall to +x and +z. */
const SUN = normalize({ x: -0.5, y: 1, z: -0.35 });

/** The chimney leans back a little, so it stands closer to upright on screen. */
const CHIMNEY_LEAN = (14 * Math.PI) / 180;

/** Door and window sizes in world units, on the front wall. Heights run up the leaning wall. */
const DOOR = { radius: 24, frame: 29, rise: 22 };
const WINDOW = { radius: 9, frame: 12, x: 44, y: 30 };

/** Hill faces lower than this fade out, so the hill's foot melts into the ground. */
const FADE = 22;

/**
 * Hobbit-hole houses, built in 3D and drawn with Canvas 2D. Each house is a
 * hill: a grid whose heights come from the sim's terrain, so the spiders walk
 * on exactly what is drawn. The hill's sides and back fade into the ground.
 * A wall that leans back slices its rounded front. The door and window are
 * circles in that wall, and the chimney is a box on the hill behind it.
 * Faces are lit by the sun, blended across three tones, and drawn back to
 * front. `occupants[i]` is how many rabbits are inside house `i`.
 */
export function houseLayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  houses: HouseView[],
  occupants: number[],
  time: number,
  boil: Boil,
): Layers {
  const shadows = () => {
    for (const h of houses) drawStones(ctx, cam, h);
  };
  // Sorting by the far edge draws anything standing on or beside the house after it.
  const pieces: Piece[] = houses.map((h) => ({
    depth: cam.project({ ...h.center, z: h.center.z + h.radius }).depth,
    draw: () => drawHouse(ctx, cam, h, occupants[h.index] ?? 0, time, boil),
  }));
  return { shadows, pieces };
}

type Face = { pts: V3[]; normal: V3; tones: Tones; alpha: number };

/** The parts of a house that never move. Built once per house. */
type Model = {
  hill: Face[];
  paint?: Paint;
  crest: V3[];
  facade: V3[];
  eave: V3[];
  tufts: V3[];
  chimney: Face[];
  mouth: V3;
  wall: Wall;
};

const models = new WeakMap<HouseView, Model>();

function modelOf(h: HouseView): Model {
  let m = models.get(h);
  if (!m) {
    const wall = wallOf(h);
    const top = chimney(h, wall);
    const front = facade(h, wall);
    m = {
      hill: hillFaces(h),
      crest: crest(h),
      facade: front.outline,
      eave: front.eave,
      tufts: tufts(h),
      chimney: top.faces,
      mouth: top.mouth,
      wall,
    };
    models.set(h, m);
  }
  return m;
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  h: HouseView,
  inside: number,
  time: number,
  boil: Boil,
) {
  const m = modelOf(h);
  const s = cam.project(h.door).scale;
  const ink = Math.max(1, 2.2 * s);

  drawHill(ctx, cam, m);
  // The crest line thins out toward its ends, where the hill gets low.
  const ridge = m.crest.map((p, k) => boil.jitter(cam.project(p), 1700 + h.index * 131 + k));
  for (let k = 0; k + 1 < ridge.length; k++) {
    const end = Math.min(k + 1, ridge.length - 1 - k) / (ridge.length * 0.3);
    line(ctx, [ridge[k]!, ridge[k + 1]!], INK.ink, ink * Math.min(1, 0.25 + end));
  }

  // Grass tufts and flowers over the hill, kept off the front wall.
  m.tufts.forEach((p, k) => {
    const at = boil.jitter(cam.project(p), 1300 + h.index * 97 + k);
    for (const lean of [-0.6, 0, 0.6]) {
      const tall = (9 + 3 * noise(k, lean)) * s;
      line(
        ctx,
        [at, { x: at.x + lean * tall * 0.6, y: at.y - tall }],
        INK.ink,
        Math.max(0.6, 1.1 * s),
      );
    }
    if (h.index === 0) {
      ctx.fillStyle = FLOWERS[k % FLOWERS.length]!;
      ctx.beginPath();
      ctx.arc(
        at.x + 4 * s,
        at.y - 3 * s,
        Math.max(1.2, 2.6 * s),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });

  drawFaces(ctx, cam, m.chimney);
  for (const f of m.chimney)
    if (facing(cam, f))
      stroke(
        ctx,
        f.pts.map((p) => cam.project(p)),
        Math.max(0.8, 1.6 * s),
      );

  // The front wall: where the leaning wall cuts the hill, with the door and window set into it.
  const wallPts = m.facade.map((p, k) => boil.jitter(cam.project(p), 1500 + k));
  fill(ctx, wallPts, WALL);
  // The hill's edge shades the top of the wall.
  const eave = m.eave.map((p, k) => (k < wallPts.length - 2 ? wallPts[k + 1]! : cam.project(p)));
  fill(ctx, eave, "rgba(40, 28, 16, 0.22)");
  stroke(ctx, wallPts, ink);

  const onWall = (dx: number, up: number, lift = 0.4): V3 =>
    m.wall.at(dx, Math.max(0, up), lift);
  const disk = (dx: number, cy: number, r: number, lift: number) =>
    arc(
      32,
      (a) => onWall(dx + Math.cos(a) * r, cy + Math.sin(a) * r, lift),
      Math.PI * 2,
    ).map((p) => cam.project(p));

  // Door: a stone frame, the round door, planks, and a brass knob.
  const frame = disk(0, DOOR.rise, DOOR.frame, 0.4);
  fill(ctx, frame, STONE);
  stroke(ctx, frame, ink);
  const door = disk(0, DOOR.rise, DOOR.radius, 0.8);
  fill(ctx, door, DOORS[h.index % DOORS.length]!);
  ctx.save();
  clipTo(ctx, door);
  for (const dx of [-12, -6, 0, 6, 12]) {
    line(
      ctx,
      [
        cam.project(onWall(dx, 0, 1)),
        cam.project(onWall(dx, DOOR.rise + DOOR.radius, 1)),
      ],
      "rgba(0, 0, 0, 0.28)",
      Math.max(0.6, 1.1 * s),
    );
  }
  ctx.restore();
  stroke(ctx, door, ink);
  const knob = cam.project(onWall(0, DOOR.rise, 1.2));
  ctx.fillStyle = "#e2b04a";
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, Math.max(1, 1.8 * s), 0, Math.PI * 2);
  ctx.fill();

  // Window: glows warm while anyone is home.
  const center = cam.project(onWall(WINDOW.x, WINDOW.y, 0.8));
  if (inside > 0) {
    const r = WINDOW.radius * 3.2 * s;
    const halo = ctx.createRadialGradient(
      center.x,
      center.y,
      r * 0.15,
      center.x,
      center.y,
      r,
    );
    halo.addColorStop(0, "rgba(244, 201, 106, 0.4)");
    halo.addColorStop(1, "rgba(244, 201, 106, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(center.x - r, center.y - r, r * 2, r * 2);
  }
  const winFrame = disk(WINDOW.x, WINDOW.y, WINDOW.frame, 0.4);
  fill(ctx, winFrame, STONE);
  stroke(ctx, winFrame, ink);
  const pane = disk(WINDOW.x, WINDOW.y, WINDOW.radius, 0.8);
  fill(ctx, pane, inside > 0 ? GLOW.lit : GLOW.dim);
  stroke(ctx, pane, Math.max(0.8, 1.4 * s));
  const bar = (x0: number, y0: number, x1: number, y1: number) =>
    line(
      ctx,
      [cam.project(onWall(x0, y0, 1)), cam.project(onWall(x1, y1, 1))],
      INK.ink,
      Math.max(0.6, 1.2 * s),
    );
  bar(WINDOW.x - WINDOW.radius, WINDOW.y, WINDOW.x + WINDOW.radius, WINDOW.y);
  bar(WINDOW.x, WINDOW.y - WINDOW.radius, WINDOW.x, WINDOW.y + WINDOW.radius);

  // Smoke rises from the chimney mouth in world space: thicker while someone is home.
  const puffs = inside > 0 ? 5 : 2;
  for (let k = 0; k < puffs; k++) {
    const phase = (time * 0.3 + k / puffs + h.index * 0.37) % 1;
    const p = cam.project({
      x: m.mouth.x + Math.sin(phase * 5 + k) * 6 + phase * 22,
      y: m.mouth.y + 4 + phase * 110,
      z: m.mouth.z + phase * 10,
    });
    ctx.fillStyle = `rgba(214, 208, 192, ${(inside > 0 ? 0.45 : 0.25) * (1 - phase)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (3 + 9 * phase) * p.scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

const heightOf = (h: HouseView, p: V3) =>
  terrain.rock_height(h.rock, vec3.Vec3$Vec3(p.x, 0, p.z));
const surfaceOf = (h: HouseView, p: V3) =>
  terrain.surface(h.rock, vec3.Vec3$Vec3(p.x, 0, p.z));

/** A hill painted for one camera: an image and where it goes on screen. */
type Paint = {
  key: string;
  image: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Draw the hill from an image that is painted once per camera position. The
 * hill has thousands of small faces, and neither it nor the camera moves
 * between frames.
 */
function drawHill(ctx: CanvasRenderingContext2D, cam: Camera, m: Model) {
  const t = ctx.getTransform();
  const eye = cam.eye;
  const key = [cam.width, cam.height, eye.x, eye.y, eye.z, t.a, t.d].join();
  if (m.paint?.key !== key) {
    const pts = m.hill.flatMap((f) => f.pts.map((p) => cam.project(p)));
    const pad = 2;
    const x = Math.floor(Math.min(...pts.map((p) => p.x))) - pad;
    const y = Math.floor(Math.min(...pts.map((p) => p.y))) - pad;
    const width = Math.ceil(Math.max(...pts.map((p) => p.x))) + pad - x;
    const height = Math.ceil(Math.max(...pts.map((p) => p.y))) + pad - y;
    const image = document.createElement("canvas");
    image.width = Math.max(1, Math.ceil(width * t.a));
    image.height = Math.max(1, Math.ceil(height * t.d));
    const paint = image.getContext("2d");
    if (!paint) return;
    paint.setTransform(t.a, 0, 0, t.d, -x * t.a, -y * t.d);
    drawFaces(paint, cam, m.hill);
    m.paint = { key, image, x, y, width, height };
  }
  const p = m.paint;
  ctx.drawImage(p.image, p.x, p.y, p.width, p.height);
}

/**
 * The hill as a grid of quads behind the wall line. Heights come from the
 * sim. Slopes come from the hill without its wall, so the light stays smooth
 * where the wall cuts it.
 */
function hillFaces(h: HouseView): Face[] {
  const columns = 96;
  const rows = 88;
  const half = h.radius * 0.9;
  const near = h.center.z - h.cut;
  const deep = h.cut + h.radius;
  const vertex = (i: number, j: number): V3 => {
    const p = {
      x: h.center.x - half + (i / columns) * 2 * half,
      y: 0,
      z: near + (j / rows) * deep,
    };
    return { ...p, y: heightOf(h, p) };
  };
  const slope = (p: V3): V3 => {
    const e = 3;
    const dx =
      (surfaceOf(h, { ...p, x: p.x + e }) -
        surfaceOf(h, { ...p, x: p.x - e })) /
      (2 * e);
    const dz =
      (surfaceOf(h, { ...p, z: p.z + e }) -
        surfaceOf(h, { ...p, z: p.z - e })) /
      (2 * e);
    return normalize({ x: -dx, y: 1, z: -dz });
  };
  const faces: Face[] = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const pts = [
        vertex(i, j),
        vertex(i, j + 1),
        vertex(i + 1, j + 1),
        vertex(i + 1, j),
      ];
      const rise = Math.max(...pts.map((p) => p.y));
      const alpha = smooth(rise / FADE);
      if (alpha < 0.02) continue;
      const mid = pts.reduce((sum, p) => add(sum, p), { x: 0, y: 0, z: 0 });
      faces.push({ pts, normal: slope(scale(mid, 0.25)), tones: GRASS, alpha });
    }
  }
  return faces;
}

/** The slope, in height per unit away from the camera, where the crest line runs. */
const CREST = -0.42;

/**
 * A line over the top of the hill, as the hill's outline would look from a
 * lower camera. For each step across the hill, it is the first point behind
 * the summit where the back slope gets as steep as `CREST`. It ends where the
 * hill is too low to have such a slope.
 */
function crest(h: HouseView): V3[] {
  const steps = 48;
  const half = h.radius * 0.9;
  const found: { x: number; z: number }[] = [];
  for (let k = 0; k <= steps; k++) {
    const x = h.center.x - half + (k / steps) * 2 * half;
    for (let z = h.center.z; z < h.center.z + h.radius; z += 2) {
      const drop =
        (surfaceOf(h, { x, y: 0, z: z + 6 }) - surfaceOf(h, { x, y: 0, z: z - 6 })) / 12;
      if (drop > CREST) continue;
      found.push({ x, z });
      break;
    }
  }
  // Average each point with its neighbors, so the hill's ripple leaves a smooth line.
  return found.map(({ x }, k) => {
    const near = found.slice(Math.max(0, k - 5), k + 6);
    const z = near.reduce((sum, p) => sum + p.z, 0) / near.length;
    return { x, y: surfaceOf(h, { x, y: 0, z }), z };
  });
}

/**
 * The leaning front wall. `base` is where it meets the ground in front of the
 * hill's center, `up` runs up the wall, and `normal` points out of it.
 * `at(dx, up, lift)` is a point on the wall, `lift` units out from it.
 */
type Wall = {
  base: V3;
  up: V3;
  normal: V3;
  at: (dx: number, up: number, lift: number) => V3;
};

function wallOf(h: HouseView): Wall {
  const base = { x: h.center.x, y: 0, z: h.center.z - h.cut };
  const up = { x: 0, y: Math.cos(h.lean), z: Math.sin(h.lean) };
  const normal = { x: 0, y: Math.sin(h.lean), z: -Math.cos(h.lean) };
  return {
    base,
    up,
    normal,
    at: (dx, u, lift) =>
      add(
        add({ x: base.x + dx, y: base.y, z: base.z }, scale(up, u)),
        scale(normal, lift),
      ),
  };
}

/**
 * The exposed part of the wall: from the ground up to where the wall meets
 * the hill's surface. `outline` starts and ends on the ground. `eave` is the
 * band under the top edge: the top edge, then the same edge lower on the wall.
 */
function facade(h: HouseView, wall: Wall): { outline: V3[]; eave: V3[] } {
  const steps = 72;
  const xs = Array.from(
    { length: steps + 1 },
    (_, k) => h.radius * (-0.6 + (1.2 * k) / steps),
  );
  const highs = xs.map((x) => {
    let [lo, hi] = [0, h.height * 2];
    for (let j = 0; j < 22; j++) {
      const mid = (lo + hi) / 2;
      const p = wall.at(x, mid, 0);
      if (p.y <= surfaceOf(h, p)) lo = mid;
      else hi = mid;
    }
    return lo;
  });
  // Average the top edge over its neighbors, so the hill's ripple leaves a smooth arch.
  const smoothHighs = highs.map((_, k) => {
    const near = highs.slice(Math.max(0, k - 2), k + 3);
    return near.reduce((sum, v) => sum + v, 0) / near.length;
  });
  const top: V3[] = [];
  const under: V3[] = [];
  xs.forEach((x, k) => {
    const high = smoothHighs[k]!;
    if (high <= 5) return;
    top.push(wall.at(x, high, 0));
    // The band is widest at the middle of the arch.
    under.push(wall.at(x * 0.94, Math.max(0, high - 4 - high * 0.1), 0));
  });
  const [first, last] = [top[0], top[top.length - 1]];
  if (!first || !last) return { outline: [], eave: [] };
  const ground = (p: V3) => ({ ...p, y: 0, z: wall.base.z });
  return {
    outline: [ground(first), ...top, ground(last)],
    eave: [...top, ...under.reverse()],
  };
}

/** Spots for grass tufts on the hill's sides and back, away from the wall. */
function tufts(h: HouseView): V3[] {
  return Array.from({ length: 16 }, (_, k) => {
    const a = -0.35 + ((noise(h.index + 7, k) + 1) / 2) * (Math.PI + 0.7);
    const r = h.radius * (0.15 + 0.55 * ((noise(h.index + 9, k) + 1) / 2));
    const p = {
      x: h.center.x + Math.cos(a) * r,
      y: 0,
      z: h.center.z + Math.sin(a) * r,
    };
    return { ...p, y: heightOf(h, p) };
  });
}

/** A brick chimney with a wider cap, on the slope behind the wall, leaning back a little. */
function chimney(h: HouseView, wall: Wall): { faces: Face[]; mouth: V3 } {
  const at = { x: wall.base.x + 24, y: 0, z: wall.base.z + 62 };
  const up = { x: 0, y: Math.cos(CHIMNEY_LEAN), z: Math.sin(CHIMNEY_LEAN) };
  const base = { x: at.x, y: surfaceOf(h, at) - 8, z: at.z };
  const body = box(base, 8.5, 38, up, BRICK);
  const capBase = add(base, scale(up, 38));
  const cap = box(capBase, 11, 6, up, CAP);
  return { faces: [...body, ...cap], mouth: add(capBase, scale(up, 6)) };
}

/** A square box standing on `base` along the `up` axis: its top and four sides. */
function box(
  base: V3,
  half: number,
  tall: number,
  up: V3,
  tones: Tones,
): Face[] {
  const across = { x: 1, y: 0, z: 0 };
  const deep = normalize({ x: 0, y: -up.z, z: up.y });
  const corner = (sx: number, sz: number, t: number) =>
    add(
      add(add(base, scale(across, sx * half)), scale(deep, sz * half)),
      scale(up, t),
    );
  const ring = (t: number) => [
    corner(-1, -1, t),
    corner(1, -1, t),
    corner(1, 1, t),
    corner(-1, 1, t),
  ];
  const [b, t] = [ring(0), ring(tall)];
  const side = (i: number, j: number, normal: V3): Face => ({
    pts: [b[i]!, b[j]!, t[j]!, t[i]!],
    normal,
    tones,
    alpha: 1,
  });
  return [
    { pts: t, normal: up, tones, alpha: 1 },
    side(0, 1, scale(deep, -1)),
    side(1, 2, across),
    side(2, 3, deep),
    side(3, 0, scale(across, -1)),
  ];
}

/** Fill the faces that face the camera, far to near, shaded by how much they face the sun. */
function drawFaces(ctx: CanvasRenderingContext2D, cam: Camera, faces: Face[]) {
  faces
    .filter((f) => facing(cam, f))
    .map((f) => ({ f, pts: f.pts.map((p) => cam.project(p)) }))
    .map((x) => ({
      ...x,
      depth: x.pts.reduce((sum, p) => sum + p.depth, 0) / x.pts.length,
    }))
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ f, pts }) => {
      // Stretch the light so slopes show: flat ground sits a little above the middle tone.
      const color = blend(f.tones, (dot(f.normal, SUN) - 0.35) / 0.6);
      ctx.globalAlpha = f.alpha;
      fill(ctx, pts, color);
      // A hairline in the same color hides the seams between faces.
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });
  ctx.globalAlpha = 1;
}

/** True when the face's front side points toward the camera. */
function facing(cam: Camera, f: Face): boolean {
  const c = scale(
    f.pts.reduce((sum, p) => add(sum, p), { x: 0, y: 0, z: 0 }),
    1 / f.pts.length,
  );
  const eye = cam.eye;
  return dot(f.normal, { x: eye.x - c.x, y: eye.y - c.y, z: eye.z - c.z }) > 0;
}

/** Flat stepping stones on the ground in front of the door, drawn as projected circles. */
function drawStones(ctx: CanvasRenderingContext2D, cam: Camera, h: HouseView) {
  for (let k = 0; k < 3; k++) {
    const c = {
      x: h.door.x + noise(h.index + 40, k) * 8,
      y: 0,
      z: h.door.z - 6 - k * 24,
    };
    const pts = arc(
      16,
      (a) => ({ x: c.x + Math.cos(a) * 10, y: 0, z: c.z + Math.sin(a) * 6.5 }),
      Math.PI * 2,
    ).map((p) => cam.project(p));
    fill(ctx, pts, "#7d7560");
    stroke(ctx, pts, Math.max(0.6, 1.2 * cam.project(c).scale));
  }
}

/** `steps + 1` points from angle 0 to `span`. */
function arc(steps: number, at: (a: number) => V3, span = Math.PI): V3[] {
  return Array.from({ length: steps + 1 }, (_, k) => at((k / steps) * span));
}

function stroke(ctx: CanvasRenderingContext2D, pts: Pt[], width: number) {
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
}

function clipTo(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
}

/** Blend from the dark tone (light 0) through the middle tone to the lit tone (light 1). */
function blend(tones: Tones, light: number): string {
  const [lit, mid, dark] = tones.map(rgb) as [number[], number[], number[]];
  const t = Math.min(1, Math.max(0, light));
  const [from, to, k] =
    t < 0.5 ? [dark, mid, t / 0.5] : [mid, lit, (t - 0.5) / 0.5];
  const c = from.map((v, i) => Math.round(v + (to[i]! - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function rgb(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
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

function normalize(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
