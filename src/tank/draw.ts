import type { FishView, Point } from "./sim";

export type BodyStyle = "blocks" | "outline";

export const COLOR = {
  waterTop: "#123a47",
  waterDeep: "#071a22",
  grid: "rgba(159,216,224,0.05)",
  body1: "#ee8a5c",
  body2: "#d9744a",
  head: "#f19466",
  edge: "rgba(40,14,4,0.45)",
  fin: "rgba(243,167,127,0.92)",
  eye: "#10232b",
  bone: "rgba(219,233,236,0.9)",
  joint: "#dbe9ec",
  hit: "#f2c66d",
  wedge: "rgba(159,216,224,0.10)",
  wedgeEdge: "rgba(159,216,224,0.35)",
  wedgeHit: "rgba(242,198,109,0.32)",
  target: "#ee8a5c",
  targetIdle: "rgba(143,176,184,0.8)",
} as const;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Body width at `u`, where 0 is the head and 1 is the tail. */
export function widthAt(u: number, bodyWidth: number): number {
  return Math.max(0.12, Math.sin(Math.PI * Math.min(1, u + 0.15))) * bodyWidth;
}

/** Direction of the link from joint `i` toward joint `i - 1`. */
function forwardAngle(joints: Point[], i: number): number {
  const a = joints[i - 1]!;
  const b = joints[i]!;
  return Math.atan2(a.y - b.y, a.x - b.x);
}

function centeredRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  fill: string,
  stroke?: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.fillRect(-length / 2, -width / 2, length, width);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(-length / 2, -width / 2, length, width);
  }
  ctx.restore();
}

function rootedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  fill: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = fill;
  ctx.fillRect(0, -width / 2, length, width);
  ctx.restore();
}

export function drawWater(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: boolean,
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, COLOR.waterTop);
  gradient.addColorStop(1, COLOR.waterDeep);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  if (!grid) return;
  ctx.strokeStyle = COLOR.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 40; x < width; x += 40) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 40; y < height; y += 40) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();
}

export function drawFish(
  ctx: CanvasRenderingContext2D,
  fish: FishView,
  bodyWidth: number,
  body: BodyStyle,
) {
  const joints = fish.joints;
  const n = joints.length - 1;
  if (n < 1) return;
  const head = joints[0]!;
  const facing = fish.facing;
  const headLength = Math.max(10, bodyWidth * 0.6);

  // Pectoral fins hinge about a fifth of the way down and drag with the body's bend.
  const pi = Math.max(1, Math.round(n * 0.22));
  const finBase = forwardAngle(joints, pi);
  const curl = wrap(forwardAngle(joints, Math.min(n, pi + 2)) - finBase);
  const pj = joints[pi]!;
  for (const side of [-1, 1]) {
    const offset = widthAt(pi / n, bodyWidth) * 0.35;
    const angle =
      finBase +
      side * (Math.PI / 2 + 0.5) +
      curl * 0.9 +
      side * 0.18 * Math.sin(fish.phase * 0.8);
    rootedRect(
      ctx,
      pj.x + Math.cos(finBase + (side * Math.PI) / 2) * offset,
      pj.y + Math.sin(finBase + (side * Math.PI) / 2) * offset,
      angle,
      bodyWidth * 0.6,
      bodyWidth * 0.26,
      COLOR.fin,
    );
  }

  // Tail fin: a V of two blocks that lags the tail's bend.
  const tail = joints[n]!;
  const tailBack = forwardAngle(joints, n) + Math.PI;
  const tailBend = wrap(
    forwardAngle(joints, n) - forwardAngle(joints, Math.max(1, n - 2)),
  );
  for (const side of [-1, 1]) {
    rootedRect(
      ctx,
      tail.x,
      tail.y,
      tailBack + side * 0.45 - tailBend * 1.2,
      bodyWidth * 0.7,
      bodyWidth * 0.2,
      COLOR.fin,
    );
  }

  if (body === "blocks") {
    for (let i = 1; i <= n; i++) {
      const a = joints[i - 1]!;
      const b = joints[i]!;
      centeredRect(
        ctx,
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        forwardAngle(joints, i),
        Math.hypot(a.x - b.x, a.y - b.y) + 1.5,
        widthAt((i - 0.5) / n, bodyWidth),
        i % 2 ? COLOR.body1 : COLOR.body2,
        COLOR.edge,
      );
    }
    centeredRect(
      ctx,
      head.x + (Math.cos(facing) * headLength) / 2,
      head.y + (Math.sin(facing) * headLength) / 2,
      facing,
      headLength,
      widthAt(0, bodyWidth) * 0.95,
      COLOR.head,
      COLOR.edge,
    );
  } else {
    const left: Point[] = [];
    const right: Point[] = [];
    joints.forEach((j, i) => {
      const angle = i === 0 ? facing : forwardAngle(joints, i);
      const half = widthAt(i / n, bodyWidth) / 2;
      left.push({
        x: j.x + Math.cos(angle - Math.PI / 2) * half,
        y: j.y + Math.sin(angle - Math.PI / 2) * half,
      });
      right.push({
        x: j.x + Math.cos(angle + Math.PI / 2) * half,
        y: j.y + Math.sin(angle + Math.PI / 2) * half,
      });
    });
    const nose = {
      x: head.x + Math.cos(facing) * headLength,
      y: head.y + Math.sin(facing) * headLength,
    };
    const outline = [nose, ...left, ...right.reverse()];
    const mid = (p: Point, q: Point) => ({
      x: (p.x + q.x) / 2,
      y: (p.y + q.y) / 2,
    });
    ctx.beginPath();
    const start = mid(outline[outline.length - 1]!, outline[0]!);
    ctx.moveTo(start.x, start.y);
    outline.forEach((p, i) => {
      const m = mid(p, outline[(i + 1) % outline.length]!);
      ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    });
    ctx.closePath();
    ctx.fillStyle = COLOR.body1;
    ctx.fill();
    ctx.strokeStyle = COLOR.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const eyeX = head.x + Math.cos(facing) * headLength * 0.55;
  const eyeY = head.y + Math.sin(facing) * headLength * 0.55;
  const eyeOffset = widthAt(0, bodyWidth) * 0.28;
  const eyeSize = Math.max(2.5, bodyWidth * 0.12);
  for (const side of [-1, 1]) {
    centeredRect(
      ctx,
      eyeX + Math.cos(facing + (side * Math.PI) / 2) * eyeOffset,
      eyeY + Math.sin(facing + (side * Math.PI) / 2) * eyeOffset,
      facing,
      eyeSize,
      eyeSize,
      COLOR.eye,
    );
  }
}

/** Bones, joints, and each joint's bend cone. A cone turns amber when it clamped its neighbour. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  fish: FishView,
  segmentLength: number,
  maxBend: number,
) {
  const joints = fish.joints;
  for (const j of joints) {
    if (!j.cone) continue;
    const { center, clamped } = j.cone;
    ctx.beginPath();
    ctx.moveTo(j.x, j.y);
    ctx.arc(j.x, j.y, segmentLength, center - maxBend, center + maxBend);
    ctx.closePath();
    ctx.fillStyle = clamped ? COLOR.wedgeHit : COLOR.wedge;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(j.x, j.y, segmentLength, center - maxBend, center + maxBend);
    ctx.strokeStyle = clamped ? COLOR.hit : COLOR.wedgeEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.beginPath();
  joints.forEach((j, i) =>
    i === 0 ? ctx.moveTo(j.x, j.y) : ctx.lineTo(j.x, j.y),
  );
  ctx.strokeStyle = COLOR.bone;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  joints.forEach((j, i) => {
    ctx.beginPath();
    ctx.arc(j.x, j.y, i === 0 ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = j.cone?.clamped ? COLOR.hit : COLOR.joint;
    ctx.fill();
  });

  const head = joints[0];
  if (!head) return;
  ctx.beginPath();
  ctx.moveTo(head.x, head.y);
  ctx.lineTo(
    head.x + Math.cos(fish.facing) * 32,
    head.y + Math.sin(fish.facing) * 32,
  );
  ctx.strokeStyle = COLOR.bone;
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  p: Point,
  color: string,
) {
  const { x, y } = p;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x - 4, y);
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y - 4);
  ctx.moveTo(x, y + 4);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
}

export function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
) {
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawDashedCircle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  color: string,
) {
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
}
