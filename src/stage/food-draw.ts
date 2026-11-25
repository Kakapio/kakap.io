import type { Camera, V3 } from "./camera";
import { type Boil, INK, noise, taperedStroke } from "./ink";
import type { PatchView } from "./rabbit-sim";
import type { Layers, Piece } from "./spider-draw";

const CARROT = { root: "#e8791f", shade: "#b9560f", leaf: "#6f9a3a", soil: "rgba(46, 36, 20, 0.5)" };

/** How many carrots a full patch has. */
const CARROTS = 5;

/** Seconds a carrot takes to come up out of the ground. */
const SPROUT_TIME = 0.9;

/** Remembers when each patch first showed, so its carrots can grow in. */
export class Sprouts {
  private readonly since = new Map<number, number>();

  update(patches: PatchView[], time: number) {
    for (const p of patches) if (!this.since.has(p.id)) this.since.set(p.id, time);
    for (const id of this.since.keys()) if (!patches.some((p) => p.id === id)) this.since.delete(id);
  }

  /** How far the patch has grown in, from 0 to 1. */
  grown(id: number, time: number): number {
    return Math.min(1, Math.max(0, (time - (this.since.get(id) ?? time)) / SPROUT_TIME));
  }
}

/**
 * Patches of carrots: orange tops in the soil with a tuft of leaves each. A
 * patch shows as many carrots as it has food left, so they go one by one as
 * the rabbits eat. The carrots stand up, so they are sorted with the scene.
 */
export function foodLayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  patches: PatchView[],
  sprouts: Sprouts,
  time: number,
  boil: Boil,
): Layers {
  const carrots = patches.flatMap((patch) => {
    const count = Math.ceil(patch.left * CARROTS - 1e-6);
    return Array.from({ length: count }, (_, k) => ({ at: spot(patch, k), seed: patch.id * 31 + k, grown: sprouts.grown(patch.id, time) }));
  });
  const shadows = () => {
    ctx.fillStyle = CARROT.soil;
    for (const c of carrots) {
      const p = cam.project(c.at);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 9.5 * p.scale, 4.2 * p.scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const pieces: Piece[] = carrots.map((c) => ({
    depth: cam.project(c.at).depth,
    draw: () => drawCarrot(ctx, cam, c.at, c.grown, c.seed, time, boil),
  }));
  return { shadows, pieces };
}

/** Where carrot `k` of a patch stands: one in the middle and the rest in a ring around it. */
function spot(patch: PatchView, k: number): V3 {
  if (k === 0) return patch.position;
  const a = (k / (CARROTS - 1)) * Math.PI * 2 + patch.id * 1.3;
  const d = 16 + 3 * noise(patch.id, k);
  return { x: patch.position.x + Math.cos(a) * d, y: 0, z: patch.position.z + Math.sin(a) * d };
}

function drawCarrot(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: V3,
  grown: number,
  seed: number,
  time: number,
  boil: Boil,
) {
  const base = cam.project(at);
  const s = base.scale * (0.35 + 0.65 * grown);
  const point = (x: number, y: number, k: number) => boil.jitter({ x: base.x + x * s, y: base.y - y * s }, 4000 + seed * 9 + k);
  const outline = Math.max(1, 1.8 * base.scale);

  // The top of the root shows above the soil.
  const [foot, top] = [point(0, 0, 0), point(0, 6.5, 1)];
  taperedStroke(ctx, [{ ...foot, w: 9 * s + outline }, { ...top, w: 6.5 * s + outline }], INK.ink);
  taperedStroke(ctx, [{ ...foot, w: 9 * s }, { ...top, w: 6.5 * s }], CARROT.root);
  taperedStroke(ctx, [{ ...point(2.6, 0.5, 2), w: 2.8 * s }, { ...point(2, 5.8, 3), w: 1.8 * s }], CARROT.shade);

  // Leaves fan out from the top and sway a little.
  const sway = 0.08 * Math.sin(time * 1.6 + seed);
  for (const [k, lean] of [-0.55, 0, 0.5].entries()) {
    const tall = 17 + 4 * noise(seed, k);
    const tip = point(Math.sin(lean + sway) * tall, 6.5 + Math.cos(lean + sway) * tall, 10 + k);
    const middle = point(Math.sin(lean + sway) * tall * 0.45, 6.5 + tall * 0.55, 20 + k);
    taperedStroke(ctx, [{ ...top, w: 2.4 * s + outline }, { ...middle, w: 3.4 * s + outline }, { ...tip, w: 1 * s + outline }], INK.ink);
    taperedStroke(ctx, [{ ...top, w: 2.4 * s }, { ...middle, w: 3.4 * s }, { ...tip, w: 1 * s }], CARROT.leaf);
  }
}
