import type { Camera, V3 } from "./camera";
import { type Field, type Grid, type GridView, gridView } from "./nav-sim";
import { type Bounds, LIMITS, type RabbitView } from "./rabbit-sim";
import { BRIDGE_HALF, footprint, type Land } from "./terrain-sim";

/** The colors of the debug view. The legend in `debug-panel.ts` uses them too. */
export const DEBUG_COLORS = {
  blocked: "rgba(214, 40, 28, 0.34)",
  noWay: "rgba(40, 40, 46, 0.42)",
  arrow: "rgba(18, 16, 10, 0.62)",
  goal: "#ffffff",
  obstacle: "#ff4df0",
  bounds: "#35e0ee",
  door: "#ffffff",
  fear: "#ff5b45",
  wary: "#ffae3d",
  calm: "#58e66a",
  fleeing: "#ff5b45",
  goingHome: "#62b0ff",
};

/** How many colors the cost of a way is drawn in, from near the goal to far. */
const BANDS = 8;

/** The fill of cost band `k`: blue near the goal, through green, to yellow far away. */
export const bandColor = (k: number, alpha = 0.26) => `hsl(${215 - (160 * k) / (BANDS - 1)} 85% 55% / ${alpha})`;

export type DebugScene = {
  land: Land;
  bounds: Bounds;
  grid: Grid | null;
  /** The field to show, or null to show only which cells are blocked. */
  field: Field | null;
  rabbits: RabbitView[];
  /** The point each rabbit heads for, in the order of `rabbits`. */
  aims: (V3 | null)[];
  /** The center of the rabbits that are outside. */
  huddle: V3 | null;
  spacing: number;
  huddleRadius: number;
  fearRadius: number;
  spiders: { body: V3; target: V3 }[];
};

/** The cells of one grid and field as screen paths, ready to fill and stroke once. */
type CellPaths = { blocked: Path2D; noWay: Path2D; bands: Path2D[]; arrows: Path2D; goal: V3 | null };

type Point = { x: number; y: number };

/**
 * Draws what the sim knows and the scene does not show: the grid and a flow
 * field, obstacle footprints, the bounds, and each rabbit's steering.
 */
export class DebugDraw {
  // The cells and arrows change only when the field does, about once a
  // second, so they are drawn once into `sheet` and copied each frame.
  private readonly sheet = document.createElement("canvas");
  /** The grid or field that `sheet` shows. */
  private shown: object | null = null;

  draw(ctx: CanvasRenderingContext2D, cam: Camera, scene: DebugScene) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    this.drawCells(ctx, cam, scene);
    drawBounds(ctx, cam, scene.bounds);
    drawObstacles(ctx, cam, scene.land);
    drawDoors(ctx, cam, scene);
    drawSpiders(ctx, cam, scene);
    drawRabbits(ctx, cam, scene);
    ctx.restore();
  }

  private drawCells(ctx: CanvasRenderingContext2D, cam: Camera, scene: DebugScene) {
    const key = scene.field ?? scene.grid;
    if (!key || !scene.grid) return;
    const sheet = this.sheet;
    const { width, height } = ctx.canvas;
    // A grid and its fields are built again when the camera changes, so a
    // sheet drawn for one of them stays right until the canvas changes size.
    if (key !== this.shown || sheet.width !== width || sheet.height !== height) {
      const to = sheet.getContext("2d");
      if (!to) return;
      // Setting the size clears the sheet.
      sheet.width = width;
      sheet.height = height;
      to.setTransform(ctx.getTransform());
      paintCells(to, cam, cellPaths(cam, gridView(scene.grid, scene.field)));
      this.shown = key;
    }
    ctx.drawImage(sheet, 0, 0, cam.width, cam.height);
  }
}

function paintCells(ctx: CanvasRenderingContext2D, cam: Camera, paths: CellPaths) {
  paths.bands.forEach((band, k) => {
    ctx.fillStyle = bandColor(k);
    ctx.fill(band);
  });
  ctx.fillStyle = DEBUG_COLORS.noWay;
  ctx.fill(paths.noWay);
  ctx.fillStyle = DEBUG_COLORS.blocked;
  ctx.fill(paths.blocked);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = DEBUG_COLORS.arrow;
  ctx.lineWidth = 1;
  ctx.stroke(paths.arrows);
  if (paths.goal) cross(ctx, cam.project(paths.goal), 7, DEBUG_COLORS.goal, 2.5);
}

function cellPaths(cam: Camera, g: GridView): CellPaths {
  // Each corner is shared by up to four cells, so project the corners once.
  const across = g.columns + 1;
  const xs = new Float32Array(across * (g.rows + 1));
  const ys = new Float32Array(xs.length);
  for (let r = 0; r <= g.rows; r++) {
    for (let c = 0; c <= g.columns; c++) {
      const p = cam.project({ x: g.minX + c * g.cell, y: 0, z: g.minZ + r * g.cell });
      xs[c + r * across] = p.x;
      ys[c + r * across] = p.y;
    }
  }
  const quad = (path: Path2D, c: number, r: number) => {
    const [a, b] = [c + r * across, c + (r + 1) * across];
    path.moveTo(xs[a]!, ys[a]!);
    path.lineTo(xs[a + 1]!, ys[a + 1]!);
    path.lineTo(xs[b + 1]!, ys[b + 1]!);
    path.lineTo(xs[b]!, ys[b]!);
    path.closePath();
  };
  const center = (i: number): V3 => ({
    x: g.minX + ((i % g.columns) + 0.5) * g.cell,
    y: 0,
    z: g.minZ + (Math.floor(i / g.columns) + 0.5) * g.cell,
  });
  const paths: CellPaths = {
    blocked: new Path2D(),
    noWay: new Path2D(),
    bands: Array.from({ length: BANDS }, () => new Path2D()),
    arrows: new Path2D(),
    goal: g.goal,
  };
  for (let i = 0; i < g.open.length; i++) {
    const [c, r] = [i % g.columns, Math.floor(i / g.columns)];
    if (!g.open[i]) {
      quad(paths.blocked, c, r);
      continue;
    }
    if (!g.goal) continue;
    const cost = g.cost[i]!;
    if (cost < 0) {
      quad(paths.noWay, c, r);
      continue;
    }
    quad(paths.bands[Math.min(BANDS - 1, Math.floor((cost / Math.max(1, g.maxCost)) * BANDS))]!, c, r);
    const next = g.next[i]!;
    if (next < 0) continue;
    // A short arrow through the cell's center, toward the next cell.
    const [from, to] = [center(i), center(next)];
    const length = Math.hypot(to.x - from.x, to.z - from.z) || 1;
    const [dx, dz] = [(to.x - from.x) / length, (to.z - from.z) / length];
    const at = (along: number, side: number) =>
      cam.project({ x: from.x + (dx * along - dz * side) * g.cell, y: 0, z: from.z + (dz * along + dx * side) * g.cell });
    const [tail, head, left, right] = [at(-0.3, 0), at(0.3, 0), at(0.08, 0.14), at(0.08, -0.14)];
    paths.arrows.moveTo(tail.x, tail.y);
    paths.arrows.lineTo(head.x, head.y);
    paths.arrows.moveTo(left.x, left.y);
    paths.arrows.lineTo(head.x, head.y);
    paths.arrows.lineTo(right.x, right.y);
  }
  return paths;
}

/** The bounds the rabbits stay inside, and the line where the walls start to push back. */
function drawBounds(ctx: CanvasRenderingContext2D, cam: Camera, b: Bounds) {
  const box = (inset: number): Point[] =>
    [
      { x: b.minX + inset, z: b.minZ + inset },
      { x: b.maxX - inset, z: b.minZ + inset },
      { x: b.maxX - inset, z: b.maxZ - inset },
      { x: b.minX + inset, z: b.maxZ - inset },
      { x: b.minX + inset, z: b.minZ + inset },
    ].map((p) => cam.project({ ...p, y: 0 }));
  stroke(ctx, box(0), DEBUG_COLORS.bounds, 2);
  stroke(ctx, box(LIMITS.wallMargin), DEBUG_COLORS.bounds, 1, [5, 6]);
}

/**
 * Each rock and house as the sim sees it: its footprint, the line a rabbit's
 * center cannot cross, and the line where it starts to push a rabbit away.
 * Each crevasse as its rims, with the path over its bridge.
 */
function drawObstacles(ctx: CanvasRenderingContext2D, cam: Camera, land: Land) {
  const color = DEBUG_COLORS.obstacle;
  for (const mound of land.mounds) {
    const f = footprint(mound);
    // The footprint grown by `grow`: the circle and the wall both move out.
    const outline = (grow: number) =>
      ring(f.center, f.radius + grow).map((p) => cam.project({ ...p, z: Math.max(p.z, f.wallZ - grow) }));
    stroke(ctx, outline(0), color, 2);
    stroke(ctx, outline(LIMITS.rockPad), color, 1);
    stroke(ctx, outline(LIMITS.rockMargin), color, 1, [4, 5]);
  }
  for (const crevasse of land.crevasses) {
    const left = crevasse.rims.map(([l]) => cam.project(l));
    const right = crevasse.rims.map(([, r]) => cam.project(r));
    stroke(ctx, [...left, ...right.reverse(), left[0]!], color, 2);
    if (!crevasse.bridge) continue;
    // The bridge's path runs from rim to rim, `BRIDGE_HALF` to each side.
    const [a, b] = crevasse.bridge;
    const span = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const side = { x: (-(b.z - a.z) / span) * BRIDGE_HALF, z: ((b.x - a.x) / span) * BRIDGE_HALF };
    const corner = (p: V3, k: number) => cam.project({ x: p.x + side.x * k, y: 0, z: p.z + side.z * k });
    stroke(ctx, [corner(a, 1), corner(b, 1), corner(b, -1), corner(a, -1), corner(a, 1)], DEBUG_COLORS.calm, 2);
  }
}

/** Each door with the distance at which a rabbit goes in, and the huddle with its radius. */
function drawDoors(ctx: CanvasRenderingContext2D, cam: Camera, scene: DebugScene) {
  scene.land.houses.forEach((house, i) => {
    stroke(ctx, ring(house.door, LIMITS.doorReach).map((p) => cam.project(p)), DEBUG_COLORS.door, 2);
    const at = cam.project(house.door);
    label(ctx, `door ${i}`, at.x, at.y + 16 * at.scale + 12);
  });
  if (!scene.huddle) return;
  stroke(ctx, ring(scene.huddle, scene.huddleRadius).map((p) => cam.project(p)), DEBUG_COLORS.door, 1, [3, 5]);
  cross(ctx, cam.project(scene.huddle), 5, DEBUG_COLORS.door, 1.5);
}

/** Each spider's fear radius, the wider range where calm rabbits keep away, and the spot it walks to. */
function drawSpiders(ctx: CanvasRenderingContext2D, cam: Camera, scene: DebugScene) {
  for (const spider of scene.spiders) {
    const at = { ...spider.body, y: 0 };
    stroke(ctx, ring(at, scene.fearRadius).map((p) => cam.project(p)), DEBUG_COLORS.fear, 1.5, [6, 8]);
    stroke(ctx, ring(at, scene.fearRadius * LIMITS.wary).map((p) => cam.project(p)), DEBUG_COLORS.wary, 1, [2, 7]);
    const [from, to] = [cam.project(at), cam.project({ ...spider.target, y: 0 })];
    stroke(ctx, [from, to], DEBUG_COLORS.fear, 1, [2, 5]);
    cross(ctx, to, 4, DEBUG_COLORS.fear, 1.5);
  }
}

/**
 * Each rabbit that is outside: a circle of half its spacing (two circles that
 * overlap push apart), its velocity, the point it heads for, and its fear.
 */
function drawRabbits(ctx: CanvasRenderingContext2D, cam: Camera, scene: DebugScene) {
  scene.rabbits.forEach((r, i) => {
    if (r.indoors) return;
    const color = r.goingHome ? DEBUG_COLORS.goingHome : r.fleeing ? DEBUG_COLORS.fleeing : DEBUG_COLORS.calm;
    const at = cam.project(r.position);
    stroke(ctx, ring(r.position, scene.spacing / 2).map((p) => cam.project(p)), color, 1.5);
    const aim = scene.aims[i];
    if (aim) {
      const to = cam.project(aim);
      stroke(ctx, [at, to], color, 1, [3, 4]);
      ctx.fillStyle = color;
      ctx.fillRect(to.x - 2.5, to.y - 2.5, 5, 5);
    }
    // Where the rabbit will be in a quarter of a second at this velocity.
    const ahead = cam.project({ x: r.position.x + r.velocity.x * 0.25, y: 0, z: r.position.z + r.velocity.z * 0.25 });
    stroke(ctx, [at, ahead], color, 2.5);
    const state = r.goingHome ? "home" : r.fleeing ? "flee" : "calm";
    label(ctx, `${state} ${r.fear.toFixed(2)}`, at.x, at.y + 14);
  });
}

/** A circle on the ground as world points. */
function ring(center: V3, radius: number): V3[] {
  return Array.from({ length: 65 }, (_, k) => {
    const a = (k / 64) * Math.PI * 2;
    return { x: center.x + Math.cos(a) * radius, y: 0, z: center.z + Math.sin(a) * radius };
  });
}

function stroke(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number, dash: number[] = []) {
  ctx.beginPath();
  points.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
}

function cross(ctx: CanvasRenderingContext2D, at: Point, size: number, color: string, width: number) {
  stroke(ctx, [{ x: at.x - size, y: at.y - size }, { x: at.x + size, y: at.y + size }], color, width);
  stroke(ctx, [{ x: at.x - size, y: at.y + size }, { x: at.x + size, y: at.y - size }], color, width);
}

/** Small text centered on `x`, with a dark edge so it reads on any ground. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, x, y);
}
