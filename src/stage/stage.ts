import { Pointer, runLoop } from "../tank/canvas";
import { Camera, type V3 } from "./camera";
import { Ground } from "./ground";
import { Boil, line } from "./ink";
import { rabbitLayers } from "./rabbit-draw";
import * as bunnies from "./rabbit-sim";
import { spiderLayers } from "./spider-draw";
import * as sim from "./spider-sim";

export type Input = "window" | "canvas";

/** Seconds the spider spends on each waypoint when nobody is pointing. */
const WAYPOINT_SECONDS = 7;

const RABBIT_COUNT = 6;

/**
 * The 2.5D scene: a camera over the ground, the scenery, a herd of rabbits,
 * and one spider. The spider stalks the pointer. With no pointer it takes turns
 * between a random waypoint and the rabbits' huddle.
 */
export class Stage {
  readonly camera = new Camera();
  readonly boil = new Boil();
  readonly pointer = new Pointer();
  skeleton = false;
  settings: sim.SpiderSettings;
  view: sim.SpiderView | null = null;
  target: V3 = { x: 0, y: 0, z: 0 };
  onFrame: (time: number) => void = () => {};

  private readonly ctx: CanvasRenderingContext2D;
  private readonly ground = new Ground();
  private cfg: sim.SpiderConfig;
  private spider: sim.SpiderState;
  private readonly rabbitCfg = bunnies.config(bunnies.DEFAULT_RABBITS);
  private herd: bunnies.Herd;
  private bounds: bunnies.Bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    settings: sim.SpiderSettings,
    input: Input,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = ctx;
    this.settings = settings;
    this.cfg = sim.config(settings);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.listen(input);
    const start = this.camera.groundAt(this.camera.width * 0.5, this.camera.height * 0.68) ?? this.target;
    this.spider = sim.spawn(start, -Math.PI / 2, this.cfg);
    const nest = this.camera.groundAt(this.camera.width * 0.25, this.camera.height * 0.8) ?? start;
    this.herd = bunnies.spawn(RABBIT_COUNT, nest, 70);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) this.boil.amount = 0;
  }

  setSettings(settings: sim.SpiderSettings) {
    this.settings = settings;
    this.cfg = sim.config(settings);
  }

  start() {
    runLoop((dt, time) => this.frame(dt, time));
  }

  private frame(dt: number, time: number) {
    const cam = this.camera;
    this.target = this.pointer.live
      ? (cam.groundAt(this.pointer.x, this.pointer.y) ?? this.target)
      : this.wanderTarget(time);
    this.spider = sim.walk(this.spider, this.target, dt, this.cfg);
    this.view = sim.view(this.spider, this.cfg);
    this.herd = bunnies.step(this.herd, this.view.body, this.bounds, dt, this.rabbitCfg);
    this.boil.tick(time);

    const ctx = this.ctx;
    this.ground.drawBase(ctx, cam);
    const layers = [
      spiderLayers(ctx, cam, this.view, { boil: this.boil, time, skeleton: this.skeleton }),
      rabbitLayers(ctx, cam, bunnies.view(this.herd, this.rabbitCfg), time, this.boil),
    ];
    for (const l of layers) l.shadows();
    if (this.skeleton) this.drawFearRing();
    layers
      .flatMap((l) => l.pieces)
      .sort((a, b) => b.depth - a.depth)
      .forEach((p) => p.draw());
    for (const l of layers) l.overlay?.();
    this.ground.drawOverlay(ctx, cam);
    this.onFrame(time);
  }

  private wanderTarget(time: number): V3 {
    const turn = Math.floor(time / WAYPOINT_SECONDS);
    if (turn % 2 === 1) return bunnies.centroid(this.herd);
    const { u, v } = sim.waypoint(turn);
    const cam = this.camera;
    return cam.groundAt(cam.width * (0.15 + 0.7 * u), cam.height * (0.38 + 0.52 * v)) ?? this.target;
  }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.camera.resize(width, height);
    this.ground.render(this.camera, dpr);
    this.bounds = this.visibleBounds();
  }

  /** A ground rectangle that stays on screen: as wide as the near edge allows, from near to far. */
  private visibleBounds(): bunnies.Bounds {
    const cam = this.camera;
    const nearLeft = cam.groundAt(cam.width * 0.06, cam.height * 0.94);
    const nearRight = cam.groundAt(cam.width * 0.94, cam.height * 0.94);
    const far = cam.groundAt(cam.width * 0.5, cam.height * 0.3);
    if (!nearLeft || !nearRight || !far) return this.bounds;
    return { minX: nearLeft.x, maxX: nearRight.x, minZ: nearLeft.z, maxZ: far.z };
  }

  private drawFearRing() {
    if (!this.view) return;
    const { x, z } = this.view.body;
    const radius = bunnies.DEFAULT_RABBITS.fearRadius;
    const ring = Array.from({ length: 49 }, (_, k) => {
      const a = (k / 48) * Math.PI * 2;
      return this.camera.project({ x: x + Math.cos(a) * radius, y: 0, z: z + Math.sin(a) * radius });
    });
    this.ctx.setLineDash([6, 8]);
    line(this.ctx, ring, "rgba(110, 33, 22, 0.55)", 1.5);
    this.ctx.setLineDash([]);
  }

  private listen(input: Input) {
    const p = this.pointer;
    if (input === "window") {
      // The canvas is fixed to the viewport, so client coordinates are canvas coordinates.
      window.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse") p.set(e.clientX, e.clientY, true);
      });
      window.addEventListener("pointerdown", (e) => p.set(e.clientX, e.clientY, false));
      window.addEventListener("pointerout", (e) => {
        if (e.pointerType === "mouse" && e.relatedTarget === null) p.release();
      });
      return;
    }
    const c = this.canvas;
    const local = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || e.buttons) {
        const { x, y } = local(e);
        p.set(x, y, true);
      }
    });
    c.addEventListener("pointerdown", (e) => {
      const { x, y } = local(e);
      p.set(x, y, true);
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointerup", () => p.release());
    c.addEventListener("pointercancel", () => p.release());
    c.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") p.release();
    });
  }
}
