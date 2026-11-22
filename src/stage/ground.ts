import type { Camera, V3 } from "./camera";
import { line, noise } from "./ink";

export const EARTH = {
  far: "#938a69",
  mid: "#716a50",
  near: "#4e4835",
  ink: "#2b251a",
  pebble: "#5f583f",
  pebbleTop: "#7d7457",
} as const;

type Decor = {
  kind: "tuft" | "pebble" | "twig" | "crack";
  at: V3;
  size: number;
  angle: number;
  seed: number;
};

function scatter(count: number): Decor[] {
  const kinds: Decor["kind"][] = [
    "tuft",
    "tuft",
    "tuft",
    "pebble",
    "pebble",
    "twig",
    "crack",
  ];
  return Array.from({ length: count }, (_, i) => {
    const r = (k: number) => (noise(i, k) + 1) / 2;
    return {
      kind: kinds[Math.floor(r(1) * kinds.length) % kinds.length]!,
      at: { x: (r(2) - 0.5) * 6400, y: 0, z: -1400 + r(3) * 5200 },
      size: 0.6 + r(4) * 0.8,
      angle: r(5) * Math.PI * 2,
      seed: i,
    };
  });
}

/**
 * The static scenery: the ground with its tufts, pebbles, twigs and cracks
 * behind everything, and a vignette and paper grain in front. Both layers are
 * drawn once per resize into offscreen canvases.
 */
export class Ground {
  private readonly base = document.createElement("canvas");
  private readonly overlay = document.createElement("canvas");
  private readonly decor = scatter(520);

  render(cam: Camera, dpr: number) {
    for (const c of [this.base, this.overlay]) {
      c.width = Math.round(cam.width * dpr);
      c.height = Math.round(cam.height * dpr);
    }
    this.renderBase(cam, dpr);
    this.renderOverlay(cam, dpr);
  }

  drawBase(ctx: CanvasRenderingContext2D, cam: Camera) {
    ctx.drawImage(this.base, 0, 0, cam.width, cam.height);
  }

  drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera) {
    ctx.drawImage(this.overlay, 0, 0, cam.width, cam.height);
  }

  private renderBase(cam: Camera, dpr: number) {
    const ctx = this.base.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width: w, height: h } = cam;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, EARTH.far);
    sky.addColorStop(0.45, EARTH.mid);
    sky.addColorStop(1, EARTH.near);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const placed = this.decor
      .map((d) => ({ d, p: cam.project(d.at) }))
      .filter(
        ({ p }) =>
          p.depth > 50 &&
          p.x > -80 &&
          p.x < w + 80 &&
          p.y > -40 &&
          p.y < h + 80,
      )
      .sort((a, b) => b.p.depth - a.p.depth);
    const depths = placed.map(({ p }) => p.depth);
    const near = Math.min(...depths);
    const far = Math.max(...depths);

    for (const { d, p } of placed) {
      const haze = far > near ? (p.depth - near) / (far - near) : 0;
      ctx.globalAlpha = 0.85 - 0.55 * haze;
      const s = p.scale;
      switch (d.kind) {
        case "tuft": {
          const blades = 4 + (d.seed % 3);
          for (let k = 0; k < blades; k++) {
            const lean = (k - (blades - 1) / 2) * 0.35 + noise(d.seed, k) * 0.2;
            const tall = (26 + noise(d.seed, k + 9) * 8) * d.size * s;
            line(
              ctx,
              [
                { x: p.x + lean * 3 * s, y: p.y },
                { x: p.x + lean * tall * 0.55, y: p.y - tall * 0.55 },
                { x: p.x + lean * tall * 0.9, y: p.y - tall },
              ],
              EARTH.ink,
              Math.max(0.7, 1.6 * s),
            );
          }
          break;
        }
        case "pebble": {
          const rx = 11 * d.size * s;
          ctx.fillStyle = EARTH.pebble;
          ctx.strokeStyle = EARTH.ink;
          ctx.lineWidth = Math.max(0.7, 1.4 * s);
          ctx.beginPath();
          ctx.ellipse(
            p.x,
            p.y,
            rx,
            rx * 0.55,
            noise(d.seed, 3) * 0.4,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = EARTH.pebbleTop;
          ctx.beginPath();
          ctx.ellipse(
            p.x - rx * 0.2,
            p.y - rx * 0.18,
            rx * 0.45,
            rx * 0.2,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          break;
        }
        case "twig": {
          const along = { x: Math.cos(d.angle), y: 0, z: Math.sin(d.angle) };
          const at = (t: number, side = 0) =>
            cam.project({
              x: d.at.x + along.x * t - along.z * side,
              y: 0,
              z: d.at.z + along.z * t + along.x * side,
            });
          const length = 60 * d.size;
          line(
            ctx,
            [at(0), at(length * 0.5, 3), at(length)],
            EARTH.ink,
            Math.max(0.8, 2.2 * s),
          );
          line(
            ctx,
            [at(length * 0.55, 2), at(length * 0.75, 16)],
            EARTH.ink,
            Math.max(0.6, 1.4 * s),
          );
          break;
        }
        case "crack": {
          ctx.globalAlpha *= 0.5;
          const pts = [0, 1, 2, 3].map((k) =>
            cam.project({
              x:
                d.at.x +
                Math.cos(d.angle) * k * 34 * d.size +
                noise(d.seed, k) * 14,
              y: 0,
              z:
                d.at.z +
                Math.sin(d.angle) * k * 34 * d.size +
                noise(d.seed, k + 4) * 14,
            }),
          );
          line(ctx, pts, EARTH.ink, Math.max(0.6, 1.2 * s));
          break;
        }
      }
    }
    ctx.globalAlpha = 1;

    const haze = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    haze.addColorStop(0, "rgba(160, 151, 118, 0.55)");
    haze.addColorStop(1, "rgba(160, 151, 118, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h * 0.45);
  }

  private renderOverlay(cam: Camera, dpr: number) {
    const ctx = this.overlay.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { width: w, height: h } = cam;
    const vignette = ctx.createRadialGradient(
      w / 2,
      h * 0.55,
      Math.min(w, h) * 0.25,
      w / 2,
      h * 0.55,
      Math.hypot(w, h) * 0.62,
    );
    vignette.addColorStop(0, "rgba(12, 9, 4, 0)");
    vignette.addColorStop(1, "rgba(12, 9, 4, 0.72)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    const grain = document.createElement("canvas");
    grain.width = grain.height = 160;
    const g = grain.getContext("2d")!;
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + noise(i, 1) * 127;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    g.putImageData(img, 0, 0);
    const pattern = ctx.createPattern(grain, "repeat");
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
