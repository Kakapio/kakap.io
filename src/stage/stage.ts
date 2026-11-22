import { Pointer, runLoop } from "../tank/canvas";
import { Camera, type V3 } from "./camera";
import { Ground } from "./ground";
import { Boil, line } from "./ink";
import { Emotes, rabbitLayers } from "./rabbit-draw";
import * as bunnies from "./rabbit-sim";
import { rockLayers } from "./rock-draw";
import { type Layers, spiderLayers } from "./spider-draw";
import * as sim from "./spider-sim";
import { heightAt, type Land, pick, rockUnder, scatterRocks } from "./terrain-sim";

export type Input = "window" | "canvas";

/** What the first spider walks to: a clicked spot, the hovered spot, or its own waypoints. */
export type Aim = "pin" | "pointer" | "waypoint";

/** Clicks on these elements are for the page, not the scene. */
const PAGE_CONTROLS = "a, button, input, select, textarea, summary, label, details";

/** Seconds each spider spends on each waypoint when nobody is pointing. */
const WAYPOINT_SECONDS = 7;

const RABBIT_COUNT = 6;

/** One spider in the scene, with its own settings and target. */
type Walker = {
  settings: sim.SpiderSettings;
  cfg: sim.SpiderConfig;
  /** The same settings with no keep-away distance, to stand right on a spot. */
  exact: sim.SpiderConfig;
  state: sim.SpiderState;
  view: sim.SpiderView;
  target: V3;
  eyeHue: number;
};

/**
 * The 2.5D scene: a camera over the ground, the scenery, a herd of rabbits,
 * and one or more spiders. The first spider walks to the spot under the
 * pointer, marked by a ring on the ground. A click pins the spot, and the
 * spider stays on it. A click on the pin removes it. With no pointer and no
 * pin, the spiders wander between waypoints, and take turns to stalk the
 * rabbits' huddle.
 */
export class Stage {
  readonly camera = new Camera();
  readonly boil = new Boil();
  readonly pointer = new Pointer();
  skeleton = false;
  aim: Aim = "waypoint";
  onFrame: (time: number) => void = () => {};

  private readonly ctx: CanvasRenderingContext2D;
  private readonly ground = new Ground();
  private land: Land = scatterRocks();
  private readonly emotes = new Emotes();
  private readonly spiders: Walker[];
  private rabbitCfg = bunnies.config(bunnies.DEFAULT_RABBITS);
  private herd: bunnies.Herd;
  private bounds: bunnies.Bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  private pin: V3 | null = null;
  private hover: V3 | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    spiders: sim.SpiderSettings[],
    input: Input,
    private readonly keepClear: Element[] = [],
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.listen(input);
    const cam = this.camera;
    const origin: V3 = { x: 0, y: 0, z: 0 };
    // A random first hue, then the others spread evenly around the color wheel.
    const firstHue = Math.random() * 360;
    this.spiders = spiders.map((settings, i) => {
      const across = spiders.length === 1 ? 0.5 : 0.4 + (0.45 * i) / (spiders.length - 1);
      const at = cam.groundAt(cam.width * across, cam.height * (0.68 - 0.12 * (i % 2))) ?? origin;
      const cfg = sim.config(settings);
      const exact = sim.config({ ...settings, keepDistance: 0 });
      const state = sim.spawn(this.land.ground, at, -Math.PI / 2, cfg);
      const eyeHue = (firstHue + (360 * i) / spiders.length) % 360;
      return { settings, cfg, exact, state, view: sim.view(state, cfg), target: at, eyeHue };
    });
    this.fitFear();
    const nest = cam.groundAt(cam.width * 0.25, cam.height * 0.8) ?? origin;
    this.herd = bunnies.spawn(RABBIT_COUNT, nest, 70);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) this.boil.amount = 0;
  }

  /** The first spider, which the pointer drives. */
  get view(): sim.SpiderView {
    return this.spiders[0]!.view;
  }

  get target(): V3 {
    return this.spiders[0]!.target;
  }

  /** Give every spider new settings. */
  setSettings(settings: sim.SpiderSettings) {
    for (const s of this.spiders) {
      s.settings = settings;
      s.cfg = sim.config(settings);
      s.exact = sim.config({ ...settings, keepDistance: 0 });
    }
    this.fitFear();
  }

  start() {
    runLoop((dt, time) => this.frame(dt, time));
  }

  /** Bigger spiders scare the rabbits from farther away. */
  private fitFear() {
    const size = Math.max(...this.spiders.map((s) => s.settings.bodyRadius / sim.SPIDERS.giant.bodyRadius));
    this.rabbitCfg = bunnies.config({
      ...bunnies.DEFAULT_RABBITS,
      fearRadius: bunnies.DEFAULT_RABBITS.fearRadius * Math.sqrt(size),
    });
  }

  private frame(dt: number, time: number) {
    const cam = this.camera;
    this.hover = this.pointer.live ? pick(this.land, cam, this.pointer.x, this.pointer.y) : null;
    this.aim = this.pin ? "pin" : this.hover ? "pointer" : "waypoint";
    this.spiders.forEach((s, i) => {
      const spot = i === 0 ? (this.pin ?? this.hover) : null;
      s.target = spot ?? this.wanderTarget(i, time, s.target);
      const cfg = spot ? s.exact : s.cfg;
      s.state = sim.walk(s.state, spot ?? this.makeRoom(s), this.land.ground, dt, cfg);
      s.view = sim.view(s.state, s.cfg);
    });
    const threats = this.spiders.map((s) => s.view.body);
    this.herd = bunnies.step(this.herd, this.land.ground, threats, this.bounds, dt, this.rabbitCfg);
    this.boil.tick(time);
    const rabbits = bunnies.view(this.herd, this.rabbitCfg);
    this.emotes.update(rabbits, time);

    const ctx = this.ctx;
    this.ground.drawBase(ctx, cam);
    const layers = [
      this.markLayers(),
      rockLayers(ctx, cam, this.land.rocks, this.boil),
      ...this.spiders.map((s) =>
        spiderLayers(ctx, cam, s.view, { boil: this.boil, time, skeleton: this.skeleton, eyeHue: s.eyeHue }),
      ),
      rabbitLayers(ctx, cam, rabbits, time, this.boil, this.emotes),
    ];
    for (const l of layers) l.shadows();
    if (this.skeleton) this.drawFearRings();
    layers
      .flatMap((l) => l.pieces)
      .sort((a, b) => b.depth - a.depth)
      .forEach((p) => p.draw());
    for (const l of layers) l.overlay?.();
    this.ground.drawOverlay(ctx, cam);
    for (const l of layers) l.ui?.();
    this.onFrame(time);
  }

  /** The spider's target, pushed away from other spiders that are too close, so they walk around each other. */
  private makeRoom(s: Walker): V3 {
    let { x, z } = s.target;
    for (const other of this.spiders) {
      if (other === s) continue;
      const dx = s.view.body.x - other.view.body.x;
      const dz = s.view.body.z - other.view.body.z;
      const d = Math.hypot(dx, dz) || 1;
      const room = 1.6 * (s.settings.stance + other.settings.stance);
      if (d < room) {
        x += (dx / d) * (room - d) * 4;
        z += (dz / d) * (room - d) * 4;
      }
    }
    return { x, y: 0, z };
  }

  /**
   * Each spider gets its own waypoints. Spiders take turns to stalk the
   * huddle, one per turn, with one quiet turn in each round.
   */
  private wanderTarget(i: number, time: number, fallback: V3): V3 {
    const n = this.spiders.length;
    const turn = Math.floor(time / WAYPOINT_SECONDS);
    if (turn % (n + 1) === i + 1) return bunnies.centroid(this.herd);
    const { u, v } = sim.waypoint(turn * n + i);
    const cam = this.camera;
    return cam.groundAt(cam.width * (0.15 + 0.7 * u), cam.height * (0.38 + 0.52 * v)) ?? fallback;
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
    this.land = scatterRocks((r) => !this.covers(r));
  }

  /** True when the rock would sit under one of the `keepClear` elements, such as page text. */
  private covers(r: { center: V3; radius: number; height: number }): boolean {
    const cam = this.camera;
    const base = cam.project(r.center);
    const top = cam.project({ ...r.center, y: r.height });
    const half = r.radius * base.scale;
    const box = { left: base.x - half, right: base.x + half, top: top.y - half * 0.6, bottom: base.y + half * 0.6 };
    return this.keepClear.some((el) => {
      const b = el.getBoundingClientRect();
      const pad = 16;
      return box.right > b.left - pad && box.left < b.right + pad && box.bottom > b.top - pad && box.top < b.bottom + pad;
    });
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

  /**
   * Rings on the ground in the first spider's eye hue: at the pin, and at the
   * hovered spot. A ring on a rock sorts just in front of the rock, so it
   * shows on top of it. A ring on open ground lies under everything.
   */
  private markLayers(): Layers {
    const marks: { at: V3; alpha: number }[] = [];
    if (this.pin) marks.push({ at: this.pin, alpha: 0.5 });
    if (this.hover) marks.push({ at: this.hover, alpha: this.pin ? 0.22 : 0.4 });
    const flat = marks.filter((m) => !rockUnder(this.land, m.at));
    const raised = marks.filter((m) => rockUnder(this.land, m.at));
    return {
      shadows: () => flat.forEach((m) => this.drawMark(m.at, m.alpha)),
      pieces: raised.map((m) => {
        const r = rockUnder(this.land, m.at)!;
        return {
          depth: this.camera.project({ ...r.center, z: r.center.z + r.radius }).depth - 0.01,
          draw: () => this.drawMark(m.at, m.alpha),
        };
      }),
    };
  }

  /** A thin ring that follows the ground surface, rocks included. */
  private drawMark(at: V3, alpha: number) {
    const s = this.spiders[0]!;
    const radius = s.settings.stance * 0.36;
    const ring = Array.from({ length: 41 }, (_, k) => {
      const a = (k / 40) * Math.PI * 2;
      const p = { x: at.x + Math.cos(a) * radius, y: 0, z: at.z + Math.sin(a) * radius };
      return this.camera.project({ ...p, y: heightAt(this.land, p) + 0.5 });
    });
    line(this.ctx, ring, `hsl(${s.eyeHue} 45% 70% / ${alpha})`, 1.25);
  }

  /** Pin the spot under a screen point, or remove the pin when the click lands on it. */
  private click(sx: number, sy: number) {
    const spot = pick(this.land, this.camera, sx, sy);
    if (!spot) return;
    const radius = this.spiders[0]!.settings.stance * 0.36;
    const onPin = this.pin && Math.hypot(spot.x - this.pin.x, spot.z - this.pin.z) < radius;
    this.pin = onPin ? null : spot;
  }

  private drawFearRings() {
    const radius = bunnies.fearRadius(this.rabbitCfg);
    for (const { view } of this.spiders) {
      const { x, z } = view.body;
      const ring = Array.from({ length: 49 }, (_, k) => {
        const a = (k / 48) * Math.PI * 2;
        return this.camera.project({ x: x + Math.cos(a) * radius, y: 0, z: z + Math.sin(a) * radius });
      });
      this.ctx.setLineDash([6, 8]);
      line(this.ctx, ring, "rgba(110, 33, 22, 0.55)", 1.5);
      this.ctx.setLineDash([]);
    }
  }

  private listen(input: Input) {
    const p = this.pointer;
    if (input === "window") {
      // The canvas is fixed to the viewport, so client coordinates are canvas coordinates.
      window.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse") p.set(e.clientX, e.clientY, true);
      });
      window.addEventListener("pointerdown", (e) => {
        if (e.target instanceof Element && e.target.closest(PAGE_CONTROLS)) return;
        p.set(e.clientX, e.clientY, e.pointerType === "mouse");
        this.click(e.clientX, e.clientY);
      });
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
        // Dragging carries the pin along.
        if (e.buttons && this.pin) this.pin = pick(this.land, this.camera, x, y) ?? this.pin;
      }
    });
    c.addEventListener("pointerdown", (e) => {
      const { x, y } = local(e);
      p.set(x, y, true);
      this.click(x, y);
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointerup", () => p.release());
    c.addEventListener("pointercancel", () => p.release());
    c.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") p.release();
    });
  }
}
