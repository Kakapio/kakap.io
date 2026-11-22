import type { Camera } from "./camera";
import { type Boil, INK, line, noise } from "./ink";
import { dome, fill, hull, surface } from "./rock-draw";
import type { Layers, Piece } from "./spider-draw";
import type { HouseView } from "./terrain-sim";

const GRASS = { body: "#55603a", dark: "#3c4429", light: "#6c7646" } as const;
const STONE = "#8c8270";
const CHIMNEY = { brick: "#6e5040", cap: "#4a3529" } as const;
const GLOW = { lit: "#f4c96a", dim: "#6f5c36" } as const;

/** Door colors by house index. House 0 belongs to Steph, Alex and Rishi. */
const DOORS = ["#3f6e4e", "#8a3d2b"];
const FLOWERS = ["#e58fb0", "#f0d46a", "#efe7d6"];

/**
 * Hobbit-hole houses: a grassy mound with a round door, a round window that
 * glows while someone is home, a chimney with smoke, and stepping stones.
 * `occupants[i]` is how many rabbits are inside house `i`.
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
    for (const h of houses) {
      const ring = hull(dome(h, h.radius * 0.95, 0, h.height * 0.45, h.height * 0.32).map((p) => cam.project(p)));
      fill(ctx, ring, INK.shadow);
      drawStones(ctx, cam, h);
    }
  };
  // Sorting by the far edge draws anything standing on or beside the house after it.
  const pieces: Piece[] = houses.map((h) => ({
    depth: cam.project({ ...h.center, z: h.center.z + h.radius }).depth,
    draw: () => drawHouse(ctx, cam, h, occupants[h.index] ?? 0, time, boil),
  }));
  return { shadows, pieces };
}

function drawStones(ctx: CanvasRenderingContext2D, cam: Camera, h: HouseView) {
  for (let k = 0; k < 3; k++) {
    const p = cam.project({
      x: h.door.x + noise(h.index + 40, k) * 8,
      y: 0,
      z: h.door.z - 6 - k * 24,
    });
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 10 * p.scale, 4.6 * p.scale, noise(h.index, k) * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "#7d7560";
    ctx.fill();
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = Math.max(0.6, 1.2 * p.scale);
    ctx.stroke();
  }
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  h: HouseView,
  inside: number,
  time: number,
  boil: Boil,
) {
  const seed = 1300 + h.index * 97;
  const s = cam.project(h.center).scale;
  const outline = hull(dome(h, h.radius, h.height, 0, 0).map((p) => cam.project(p))).map((p, k) =>
    boil.jitter(p, seed + k),
  );

  // The chimney sits behind the crown, so it goes first and the mound covers its base.
  const chimneyBase = cam.project(surface(h, 0.32, Math.PI / 2 - 0.7));
  const cw = h.radius * 0.17 * s;
  const ch = h.radius * 0.42 * s;
  const chimney = { x: chimneyBase.x - cw / 2, y: chimneyBase.y - ch, w: cw, h: ch };
  ctx.fillStyle = CHIMNEY.brick;
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.fillRect(chimney.x, chimney.y, chimney.w, chimney.h);
  ctx.strokeRect(chimney.x, chimney.y, chimney.w, chimney.h);
  ctx.fillStyle = CHIMNEY.cap;
  ctx.fillRect(chimney.x - 2 * s, chimney.y - 4 * s, chimney.w + 4 * s, 5 * s);
  ctx.strokeRect(chimney.x - 2 * s, chimney.y - 4 * s, chimney.w + 4 * s, 5 * s);

  // The mound, shaded like the rocks: dark away from the sun, a lit patch on top.
  ctx.save();
  fill(ctx, outline, GRASS.body);
  ctx.clip();
  fill(
    ctx,
    hull(dome(h, h.radius * 0.85, h.height * 1.05, h.radius * 0.5, h.radius * 0.15).map((p) => cam.project(p))),
    GRASS.dark,
  );
  const lit = cam.project(surface(h, 0.3, -2.3));
  ctx.fillStyle = GRASS.light;
  ctx.beginPath();
  ctx.ellipse(lit.x, lit.y, h.radius * 0.4 * s, h.radius * 0.2 * s, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = Math.max(1, 2.4 * s);
  ctx.lineJoin = "round";
  ctx.beginPath();
  outline.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();

  // Grass tufts over the crown, and flowers on house 0.
  for (let k = 0; k < 9; k++) {
    const at = cam.project(surface(h, 0.15 + 0.6 * ((noise(seed, k) + 1) / 2), noise(seed, k + 20) * Math.PI));
    for (const lean of [-0.6, 0, 0.6]) {
      const tall = (9 + 3 * noise(seed + k, lean)) * s;
      line(ctx, [at, { x: at.x + lean * tall * 0.6, y: at.y - tall }], INK.ink, Math.max(0.6, 1.1 * s));
    }
    if (h.index === 0) {
      ctx.fillStyle = FLOWERS[k % FLOWERS.length]!;
      ctx.beginPath();
      ctx.arc(at.x + 4 * s, at.y - 3 * s, Math.max(1.2, 2.6 * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The round door, standing on the ground at the front of the mound.
  const base = cam.project({ ...h.center, z: h.center.z - h.radius });
  const rd = h.radius * 0.3 * s;
  const door = { x: base.x, y: base.y - rd * 0.85 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(door.x - rd * 2, door.y - rd * 2, rd * 4, base.y - (door.y - rd * 2));
  ctx.clip();
  ring(ctx, door.x, door.y, rd * 1.25, STONE, s);
  ring(ctx, door.x, door.y, rd, DOORS[h.index % DOORS.length]!, s);
  ctx.save();
  ctx.beginPath();
  ctx.arc(door.x, door.y, rd, 0, Math.PI * 2);
  ctx.clip();
  for (const dx of [-0.5, 0, 0.5]) {
    line(ctx, [{ x: door.x + dx * rd, y: door.y - rd }, { x: door.x + dx * rd, y: door.y + rd }], "rgba(0, 0, 0, 0.3)", Math.max(0.6, 1.2 * s));
  }
  ctx.restore();
  ctx.restore();
  line(ctx, [{ x: door.x - rd * 1.3, y: base.y }, { x: door.x + rd * 1.3, y: base.y }], INK.ink, Math.max(1, 2 * s));
  ctx.fillStyle = "#e2b04a";
  ctx.beginPath();
  ctx.arc(door.x, door.y, Math.max(1, 1.8 * s), 0, Math.PI * 2);
  ctx.fill();

  // A round window that glows warm while anyone is home.
  const win = { x: door.x + rd * 2.1, y: door.y - rd * 0.5 };
  const rw = rd * 0.45;
  if (inside > 0) {
    const halo = ctx.createRadialGradient(win.x, win.y, rw * 0.5, win.x, win.y, rw * 3.2);
    halo.addColorStop(0, "rgba(244, 201, 106, 0.4)");
    halo.addColorStop(1, "rgba(244, 201, 106, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(win.x - rw * 3.2, win.y - rw * 3.2, rw * 6.4, rw * 6.4);
  }
  ring(ctx, win.x, win.y, rw * 1.3, STONE, s);
  ring(ctx, win.x, win.y, rw, inside > 0 ? GLOW.lit : GLOW.dim, s);
  line(ctx, [{ x: win.x - rw, y: win.y }, { x: win.x + rw, y: win.y }], INK.ink, Math.max(0.6, 1.2 * s));
  line(ctx, [{ x: win.x, y: win.y - rw }, { x: win.x, y: win.y + rw }], INK.ink, Math.max(0.6, 1.2 * s));

  // Smoke drifts up from the chimney: thicker while someone is home.
  const puffs = inside > 0 ? 5 : 2;
  for (let k = 0; k < puffs; k++) {
    const phase = (time * 0.3 + k / puffs + h.index * 0.37) % 1;
    const x = chimney.x + chimney.w / 2 + Math.sin(phase * 5 + k) * 5 * s + phase * 14 * s;
    const y = chimney.y - 6 * s - phase * 70 * s;
    ctx.fillStyle = `rgba(214, 208, 192, ${(inside > 0 ? 0.45 : 0.25) * (1 - phase)})`;
    ctx.beginPath();
    ctx.arc(x, y, (3 + 9 * phase) * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A filled circle with an ink outline. */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, s: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.stroke();
}

