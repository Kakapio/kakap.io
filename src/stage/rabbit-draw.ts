import type { Camera } from "./camera";
import { type Boil, INK, line, taperedStroke } from "./ink";
import type { RabbitView } from "./rabbit-sim";
import type { Layers, Piece } from "./spider-draw";

const FUR = "#ddd1b2";
const FUR_SHADE = "#bcae8c";
const TUNICS = [
  "#7a3b2a",
  "#4f5a3a",
  "#3f4a5a",
  "#6b5a2e",
  "#5a3b4f",
  "#2f4a45",
  "#7a5a3a",
  "#45374f",
];

type Look = { name?: string; tunic: string; fur: string; furShade: string };

/** Named rabbits by id. The rest of the herd stays anonymous. */
const NAMED: Record<number, Partial<Look>> = {
  0: { name: "Steph", tunic: "#d27896", fur: "#ecd58a", furShade: "#cdb269" },
  1: { name: "Alex" },
  2: { name: "Rishi", fur: "#9a6b45", furShade: "#7a5234" },
};

function lookOf(id: number): Look {
  return {
    tunic: TUNICS[id % TUNICS.length]!,
    fur: FUR,
    furShade: FUR_SHADE,
    ...NAMED[id],
  };
}

type Mark = "!" | "?" | ";(" | ":)";

const MARK_COLOR: Record<Mark, string> = {
  "!": "#ff2b1c",
  "?": "#ffd84a",
  ";(": "#87ceeb",
  ":)": "#5fd35f",
};

/**
 * Pixel-art faces for the ";(" and ":)" marks, drawn instead of text so they
 * read at a glance. `#` is ink, `o` is the mark's color, `t` is a tear.
 */
const FACES: Partial<Record<Mark, string[]>> = {
  ";(": [
    "...#####...",
    "..#ooooo#..",
    ".#ooooooo#.",
    "#ooooooooo#",
    "#oo#ooo#oo#",
    "#oo#ooo#oo#",
    "#otooooooo#",
    "#oto###ooo#",
    "#oo#ooo#oo#",
    ".#ooooooo#.",
    "..#ooooo#..",
    "...#####...",
  ],
  ":)": [
    "...#####...",
    "..#ooooo#..",
    ".#ooooooo#.",
    "#ooooooooo#",
    "#oo#ooo#oo#",
    "#oo#ooo#oo#",
    "#ooooooooo#",
    "#oo#ooo#oo#",
    "#ooo###ooo#",
    ".#ooooooo#.",
    "..#ooooo#..",
    "...#####...",
  ],
};

/** Screen pixels per face pixel. */
const FACE_PIXEL = 2;

/** Seconds a mark stays up. */
const MARK_TIME = 1.6;

/**
 * Game-style marks over the rabbits' heads: a red "!" when a rabbit panics,
 * a yellow "?" when it calms down, a sky-blue ";(" when it gives up and runs
 * home, and a green ":)" when it comes back out.
 */
export class Emotes {
  private readonly last = new Map<number, Pick<RabbitView, "fleeing" | "goingHome" | "indoors">>();
  private readonly shown = new Map<number, { mark: Mark; since: number }>();

  update(herd: RabbitView[], time: number) {
    for (const r of herd) {
      const was = this.last.get(r.id);
      const mark: Mark | null = !was
        ? null
        : was.indoors && !r.indoors
          ? ":)"
          : !was.goingHome && r.goingHome
            ? ";("
            : !r.indoors && !r.goingHome && was.fleeing !== r.fleeing
              ? r.fleeing
                ? "!"
                : "?"
              : null;
      if (mark) this.shown.set(r.id, { mark, since: time });
      this.last.set(r.id, { fleeing: r.fleeing, goingHome: r.goingHome, indoors: r.indoors });
    }
  }

  of(id: number, time: number): { mark: Mark; age: number } | null {
    const e = this.shown.get(id);
    if (!e || time - e.since > MARK_TIME) return null;
    return { mark: e.mark, age: time - e.since };
  }
}

/**
 * Rabbit folk drawn as upright cut-outs that always face the screen, flipped to
 * face the way they run. All sizes are in world units, scaled by perspective.
 */
export function rabbitLayers(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  herd: RabbitView[],
  time: number,
  boil: Boil,
  emotes: Emotes,
): Layers {
  herd = herd.filter((r) => !r.indoors);
  const shadows = () => {
    for (const r of herd) {
      const p = cam.project(r.position);
      ctx.fillStyle = INK.shadow;
      ctx.globalAlpha = 1 - Math.min(0.6, r.lift / 30);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 13 * p.scale, 5.5 * p.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  };
  const pieces: Piece[] = herd.map((r) => ({
    depth: cam.project(r.position).depth,
    draw: () => drawRabbit(ctx, cam, r, time, boil),
  }));
  const ui = () => {
    for (const r of herd) {
      const name = lookOf(r.id).name;
      let top = headTop(cam, r);
      if (name) top = drawNametag(ctx, cam, r, name);
      const e = emotes.of(r.id, time);
      if (e) drawMark(ctx, cam.project({ ...r.position, y: r.lift }).x, top - 4, e.mark, e.age, time);
    }
  };
  return { shadows, pieces, ui };
}

/**
 * A block-game nametag: white pixel text on a flat see-through plate, floating
 * above the ears at a fixed screen size. Positions snap to whole pixels so the
 * pixel font stays crisp.
 */
function drawNametag(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  r: RabbitView,
  name: string,
): number {
  const base = cam.project({ ...r.position, y: r.lift });
  ctx.font = "500 14px 'Pixelify Sans', ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const text = Math.round(ctx.measureText(name).width);
  const width = text + 8;
  const height = 18;
  const x = Math.round(base.x - width / 2);
  const y = Math.round(headTop(cam, r) - height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, x + 4, y + 14);
  return y;
}

/** The screen y just above the ear tips. The rabbit is an upright cut-out sized by `scale`. */
function headTop(cam: Camera, r: RabbitView): number {
  const base = cam.project({ ...r.position, y: r.lift });
  return base.y - 56 * base.scale - 6;
}

/** A pixel-font mark that pops in, bobs, and fades out. `bottom` is its baseline. */
function drawMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  bottom: number,
  mark: Mark,
  age: number,
  time: number,
) {
  const pop = age < 0.2 ? backOut(age / 0.2) : 1;
  const fade = Math.min(1, (MARK_TIME - age) / 0.3);
  const bob = Math.sin(time * 9) * 1.5;
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.translate(Math.round(x), Math.round(bottom + bob));
  ctx.scale(pop, pop);
  const face = FACES[mark];
  if (face) {
    const size = face.length * FACE_PIXEL;
    const colors: Record<string, string> = { "#": "#140d08", o: MARK_COLOR[mark], t: "#e8fbff" };
    face.forEach((row, y) =>
      [...row].forEach((cell, x) => {
        const color = colors[cell];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x * FACE_PIXEL - Math.floor(size / 2), y * FACE_PIXEL - size, FACE_PIXEL, FACE_PIXEL);
      }),
    );
    ctx.restore();
    return;
  }
  ctx.font = "700 26px 'Pixelify Sans', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "miter";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#140d08";
  ctx.strokeText(mark, 0, 0);
  ctx.fillStyle = MARK_COLOR[mark];
  ctx.fillText(mark, 0, 0);
  ctx.restore();
}

/** Ease from 0 to 1 with a small overshoot. */
function backOut(t: number): number {
  const c = 2.2;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

function drawRabbit(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  r: RabbitView,
  time: number,
  boil: Boil,
) {
  const base = cam.project({ ...r.position, y: r.lift });
  const ahead = cam.project({
    x: r.position.x + Math.cos(r.heading) * 10,
    y: r.lift,
    z: r.position.z + Math.sin(r.heading) * 10,
  });
  const face = ahead.x >= base.x ? 1 : -1;
  const s = base.scale;
  const seed = 500 + r.id * 40;
  const at = (x: number, y: number, k: number) =>
    boil.jitter({ x: base.x + x * face * s, y: base.y - y * s }, seed + k);
  const outline = Math.max(1, 2.2 * s);
  const airborne = r.lift > 1.5;
  const look = lookOf(r.id);

  // Feet tuck under while airborne.
  for (const side of [-1, 1]) {
    const foot = at(side * 5 + (airborne ? 3 : 0), airborne ? 4 : 1.5, side);
    ctx.fillStyle = INK.ink;
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y, 5 * s, 2.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body, with a tunic over the lower half.
  const body = at(0, 15, 2);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(body.x, body.y, 10.5 * s, 13.5 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = look.fur;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = look.tunic;
  ctx.fillRect(body.x - 12 * s, body.y - 3 * s, 24 * s, 20 * s);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(body.x, body.y, 10.5 * s, 13.5 * s, 0, 0, Math.PI * 2);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = outline;
  ctx.stroke();

  // Arms: down and swinging when calm, thrown up in a panic.
  for (const side of [-1, 1]) {
    const swing = Math.sin(r.hop + side) * 3;
    const hand = r.fleeing
      ? at(side * 7 + 4, 33 + swing, 10 + side)
      : at(side * 6 + 5, 10 + swing, 10 + side);
    line(
      ctx,
      [at(side * 5 + 3, 21, 12 + side), hand],
      INK.ink,
      Math.max(1, 2.6 * s),
    );
  }

  // Ears: an ink stroke with a fur stroke on top reads as an outlined ear.
  const head = at(2, 33, 20);
  const twitch = r.fleeing
    ? 0
    : Math.max(0, Math.sin(time * 1.3 + r.id * 2.1)) ** 12 * 0.5;
  for (const [k, offset] of [
    [0, -3],
    [1, 3],
  ] as const) {
    const lean = r.fleeing
      ? -1.1 - k * 0.15
      : -0.12 + k * 0.22 - twitch * (k === 0 ? 1 : -1);
    const root = { x: head.x + offset * face * s, y: head.y - 6 * s };
    const len = 22 * s;
    const tip = {
      x: root.x + Math.sin(lean) * len * face,
      y: root.y - Math.cos(lean) * len,
    };
    const mid = {
      x: (root.x + tip.x) / 2 + face * 1.5 * s,
      y: (root.y + tip.y) / 2,
    };
    taperedStroke(
      ctx,
      [
        { ...root, w: 6.5 * s + outline },
        { ...mid, w: 7 * s + outline },
        { ...tip, w: 2 * s + outline },
      ],
      INK.ink,
    );
    taperedStroke(
      ctx,
      [
        { ...root, w: 6.5 * s },
        { ...mid, w: 7 * s },
        { ...tip, w: 2 * s },
      ],
      k === 0 ? look.furShade : look.fur,
    );
  }

  ctx.beginPath();
  ctx.arc(head.x, head.y, 9.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = look.fur;
  ctx.fill();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = outline;
  ctx.stroke();

  // Face: a nose on the snout side, and an eye that goes wide with fear.
  const eye = { x: head.x + 4 * face * s, y: head.y - 1.5 * s };
  if (r.fleeing) {
    ctx.fillStyle = "#f6f0dc";
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 3.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, 1 * s);
    ctx.stroke();
  }
  ctx.fillStyle = INK.ink;
  ctx.beginPath();
  ctx.arc(
    eye.x,
    eye.y,
    Math.max(0.8, (r.fleeing ? 1.5 : 1.7) * s),
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.fillStyle = "#8a3b2e";
  ctx.beginPath();
  ctx.arc(
    head.x + 9 * face * s,
    head.y + 2 * s,
    Math.max(0.7, 1.5 * s),
    0,
    Math.PI * 2,
  );
  ctx.fill();
}
