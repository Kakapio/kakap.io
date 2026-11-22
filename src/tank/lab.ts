import { Pointer, fitCanvas, runLoop } from "./canvas";
import {
  COLOR,
  type BodyStyle,
  drawCrosshair,
  drawDashedCircle,
  drawDashedLine,
  drawFish,
  drawSkeleton,
  drawWater,
} from "./draw";
import * as sim from "./sim";

type Mode = "swim" | "reach";
type Tunables = sim.Settings & { bodyWidth: number };

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEFAULTS: Tunables = {
  segments: 12,
  segmentLength: 14,
  maxBendDeg: 25,
  bodyWidth: 30,
  speed: 180,
  turnRateDeg: 240,
  wiggle: reduceMotion ? 0 : 0.45,
};
const UNITS: Record<keyof Tunables, string> = {
  segments: "",
  segmentLength: " px",
  maxBendDeg: "°",
  bodyWidth: " px",
  speed: " px/s",
  turnRateDeg: "°/s",
  wiggle: "",
};
const MODE_TEXT: Record<Mode, string> = {
  swim: "The head steers to the target. Each joint then follows the joint ahead of it at a fixed distance, inside its bend limit. This is the forward pass of FABRIK with no fixed root.",
  reach:
    "The tail is pinned to the floor. FABRIK puts the head on the target and pulls the chain after it. Then it pins the tail again and pushes back up. It repeats until the head is within 0.5 px of the target.",
};
const ROOT_DIRECTION = -Math.PI / 2;

const canvas = document.querySelector<HTMLCanvasElement>("#tank");
if (canvas) start(canvas);

function start(canvas: HTMLCanvasElement) {
  const tank = fitCanvas(canvas);
  const tune: Tunables = { ...DEFAULTS };
  let mode: Mode = "swim";
  let body: BodyStyle = "blocks";
  let skeleton = true;
  let cfg = sim.config(tune);
  let fish = sim.spawn({ x: tank.width * 0.35, y: tank.height * 0.45 }, 0, cfg);
  let view = sim.view(fish);
  let reachTarget: sim.Point | null = null;
  let reachStats = {
    iterations: 0,
    error: 0,
    reachable: true,
    goal: { x: 0, y: 0 },
  };
  let target: sim.Point = { x: 0, y: 0 };

  const pointer = new Pointer();
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" || e.buttons) {
      const p = local(e);
      pointer.set(p.x, p.y, true);
    }
  });
  canvas.addEventListener("pointerdown", (e) => {
    const p = local(e);
    pointer.set(p.x, p.y, true);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointerup", () => pointer.release());
  canvas.addEventListener("pointercancel", () => pointer.release());
  canvas.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") pointer.release();
  });

  bindControls();

  const rootPoint = () => ({
    x: tank.width / 2,
    y: tank.height - Math.max(60, tank.height * 0.12),
  });

  runLoop((dt, time) => {
    if (mode === "swim") {
      target = pointer.live
        ? { x: pointer.x, y: pointer.y }
        : sim.roam(time, tank.width, tank.height);
      fish = sim.swim(fish, target, dt, cfg);
    } else {
      const root = rootPoint();
      const length = sim.chainLength(cfg);
      const goal = pointer.live
        ? { x: pointer.x, y: pointer.y }
        : sim.sweep(time, root, length);
      reachTarget = sim.moveToward(
        reachTarget ?? view.joints[0] ?? root,
        goal,
        tune.speed * 2 * dt,
      );
      const result = sim.reach(fish, reachTarget, root, ROOT_DIRECTION, cfg);
      fish = result.fish;
      target = reachTarget;
      reachStats = {
        iterations: result.iterations,
        error: result.error,
        reachable: Math.hypot(goal.x - root.x, goal.y - root.y) <= length,
        goal,
      };
    }
    view = sim.view(fish);

    const ctx = tank.ctx;
    drawWater(ctx, tank.width, tank.height, true);
    drawFish(ctx, view, tune.bodyWidth, body);
    if (skeleton) {
      drawSkeleton(
        ctx,
        view,
        tune.segmentLength,
        (tune.maxBendDeg * Math.PI) / 180,
      );
      const head = view.joints[0];
      if (mode === "swim" && head)
        drawDashedLine(ctx, head, target, "rgba(219,233,236,0.25)");
      if (mode === "reach")
        drawDashedCircle(
          ctx,
          rootPoint(),
          sim.chainLength(cfg),
          "rgba(159,216,224,0.25)",
        );
    }
    if (mode === "reach") {
      const root = rootPoint();
      ctx.fillStyle = "rgba(219,233,236,0.85)";
      ctx.fillRect(root.x - 18, root.y + 2, 36, 8);
      ctx.fillStyle = COLOR.hit;
      ctx.fillRect(root.x - 4, root.y - 4, 8, 8);
      if (!reachStats.reachable)
        drawCrosshair(ctx, reachStats.goal, "rgba(242,198,109,0.6)");
    }
    drawCrosshair(ctx, target, pointer.live ? COLOR.target : COLOR.targetIdle);

    updateHud(time);
  });

  const modeText = document.getElementById("modeText")!;
  const stats = document.getElementById("stats")!;
  let nextHud = 0;
  function updateHud(time: number) {
    if (time < nextHud) return;
    nextHud = time + 0.15;
    modeText.textContent = MODE_TEXT[mode];
    const segments = view.joints.length - 1;
    const hits = view.joints.filter((j) => j.cone?.clamped).length;
    const rows: [string, string, boolean?][] = [
      ["joints", String(view.joints.length)],
      ["chain length", `${segments * tune.segmentLength} px`],
      ["bend limits hit", `${hits} / ${segments}`, hits > 0],
    ];
    if (mode === "reach") {
      rows.push(["FABRIK iterations", String(reachStats.iterations)]);
      rows.push([
        "head error",
        reachStats.reachable
          ? `${reachStats.error.toFixed(2)} px`
          : "out of reach",
        !reachStats.reachable,
      ]);
    } else {
      rows.push(["target", pointer.live ? "pointer" : "wander"]);
    }
    stats.replaceChildren(
      ...rows.flatMap(([label, value, hot]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        if (hot) dd.className = "hot";
        return [dt, dd];
      }),
    );
  }

  function bindControls() {
    const sliders = [
      ...document.querySelectorAll<HTMLInputElement>(
        "input[type=range][data-key]",
      ),
    ];
    const keyOf = (s: HTMLInputElement) => s.dataset.key as keyof Tunables;
    const showValue = (s: HTMLInputElement) => {
      const output = s.parentElement?.querySelector("output");
      if (output) output.textContent = `${tune[keyOf(s)]}${UNITS[keyOf(s)]}`;
    };
    const syncSliders = () => {
      for (const s of sliders) {
        s.value = String(tune[keyOf(s)]);
        showValue(s);
      }
    };
    for (const s of sliders) {
      s.addEventListener("input", () => {
        tune[keyOf(s)] = Number(s.value);
        showValue(s);
        cfg = sim.config(tune);
      });
    }
    for (const r of document.querySelectorAll<HTMLInputElement>(
      "input[name=mode]",
    )) {
      r.addEventListener("change", () => {
        mode = r.value as Mode;
        reachTarget = null;
      });
    }
    for (const r of document.querySelectorAll<HTMLInputElement>(
      "input[name=body]",
    )) {
      r.addEventListener("change", () => {
        body = r.value as BodyStyle;
      });
    }
    document.getElementById("skeleton")?.addEventListener("change", (e) => {
      skeleton = (e.target as HTMLInputElement).checked;
    });
    document.getElementById("reset")?.addEventListener("click", () => {
      Object.assign(tune, DEFAULTS);
      cfg = sim.config(tune);
      syncSliders();
    });
    const panel = document.getElementById("panel") as HTMLDetailsElement | null;
    if (panel && matchMedia("(max-width: 600px)").matches) panel.open = false;
    syncSliders();
  }
}
