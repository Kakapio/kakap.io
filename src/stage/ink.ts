export type Pt = { x: number; y: number };
export type InkPoint = Pt & { w: number };

export const INK = {
  ink: "#16120c",
  inkSoft: "#2a241a",
  bone: "#cfc3a0",
  shadow: "rgba(20, 15, 8, 0.32)",
  legShadow: "rgba(20, 15, 8, 0.2)",
} as const;

/** A repeatable value in [-1, 1] for `(seed, i)`. */
export function noise(seed: number, i: number): number {
  const s = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * Hand-drawn line boil: every `1 / fps` seconds the jitter pattern changes,
 * like an animator redrawing the frame.
 */
export class Boil {
  private seed = 0;
  constructor(
    public amount = 0.9,
    private readonly fps = 10,
  ) {}

  tick(time: number) {
    this.seed = Math.floor(time * this.fps) % 997;
  }

  jitter<T extends Pt>(p: T, i: number): T {
    if (this.amount === 0) return p;
    return {
      ...p,
      x: p.x + noise(this.seed, i) * this.amount,
      y: p.y + noise(this.seed, i + 57) * this.amount,
    };
  }
}

/** Fill a tapered stroke through `points`, each with its own width, with round joints. */
export function taperedStroke(
  ctx: CanvasRenderingContext2D,
  points: InkPoint[],
  fill: string,
) {
  if (points.length < 2) return;
  const left: Pt[] = [];
  const right: Pt[] = [];
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push({ x: p.x + nx * p.w * 0.5, y: p.y + ny * p.w * 0.5 });
    right.push({ x: p.x - nx * p.w * 0.5, y: p.y - ny * p.w * 0.5 });
  });
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(left[0]!.x, left[0]!.y);
  for (const p of left.slice(1)) ctx.lineTo(p.x, p.y);
  for (const p of right.reverse()) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fill();
  for (const p of points.slice(1, -1)) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.w * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function line(
  ctx: CanvasRenderingContext2D,
  points: Pt[],
  stroke: string,
  width: number,
) {
  if (points.length < 2) return;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}
