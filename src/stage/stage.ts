import { Pointer, runLoop } from "../tank/canvas";
import { Camera, type V3 } from "./camera";
import { crevasseLayers } from "./crevasse-draw";
import { DebugDraw } from "./debug-draw";
import { foodLayers, Sprouts } from "./food-draw";
import { Ground } from "./ground";
import { Boil, line } from "./ink";
import { houseLayers } from "./house-draw";
import { pondLayers } from "./pond-draw";
import * as fishes from "./pond-sim";
import { Emotes, rabbitLayers } from "./rabbit-draw";
import * as bunnies from "./rabbit-sim";
import { rockLayers } from "./rock-draw";
import { type Layers, spiderLayers } from "./spider-draw";
import * as sim from "./spider-sim";
import {
  BOULDER_RADIUS,
  CREVASSE_WIDTH,
  type CrevasseSpot,
  distanceToLine,
  HOUSE_RADIUS,
  heightAt,
  type Land,
  pick,
  POND_RADIUS,
  rockUnder,
  scatterRocks,
} from "./terrain-sim";

export type Input = "window" | "canvas";

/** What the first spider walks to: a clicked spot, the hovered spot, or its own waypoints. */
export type Aim = "pin" | "pointer" | "waypoint";

/** Clicks on these elements are for the page, not the scene. */
const PAGE_CONTROLS = "a, button, input, select, textarea, summary, label, details";

/** Seconds each spider spends on each waypoint when nobody is pointing. */
const WAYPOINT_SECONDS = 7;

const RABBIT_COUNT = 8;

/** Where the houses stand, as fractions of the screen width and height. House 0 is home to ids 0 to 3 (Steph, Alex, Rishi and Max); house 1 to ids 4 to 7 (Ethan, Ashkan, Matthew and Sam). */
const HOUSE_SPOTS = [
  { u: 0.17, v: 0.62 },
  { u: 0.84, v: 0.46 },
];

/** Where the rabbits start, as fractions of the screen width and height. */
const NEST = { u: 0.25, v: 0.8 };

/**
 * Lines for the crevasse to follow, as fractions of the screen width and
 * height, in order of choice. `bridge` is how far along the line the bridge
 * crosses. The first lies between the nest and house 1, so the rabbits that
 * live there go home over the bridge.
 */
const CREVASSE_SPOTS = [
  { from: { u: 0.4, v: 0.86 }, to: { u: 0.66, v: 0.54 }, bridge: 0.62 },
  { from: { u: 0.36, v: 0.9 }, to: { u: 0.6, v: 0.62 }, bridge: 0.6 },
  { from: { u: 0.3, v: 0.9 }, to: { u: 0.72, v: 0.7 }, bridge: 0.55 },
];

/** Centers for the big boulder, as fractions of the screen width and height, in order of choice. */
const BOULDER_SPOTS = [
  { u: 0.8, v: 0.76 },
  { u: 0.5, v: 0.44 },
  { u: 0.62, v: 0.84 },
  { u: 0.5, v: 0.6 },
  { u: 0.8, v: 0.86 },
  { u: 0.78, v: 0.92 },
  { u: 0.5, v: 0.93 },
];

/** Centers for the pond, as fractions of the screen width and height, in order of choice. */
const POND_SPOTS = [
  { u: 0.46, v: 0.5 },
  { u: 0.6, v: 0.42 },
  { u: 0.36, v: 0.46 },
  { u: 0.52, v: 0.64 },
  { u: 0.7, v: 0.7 },
  { u: 0.5, v: 0.78 },
];

const FISH_COUNT = 4;

/** A spider's foot this close to the ground is in the water of a pond it stands over. */
const WADE_HEIGHT = 8;

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
 * a pond of koi, patches of food, and one or more spiders. The first
 * spider walks to the spot under the
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
  /** Draw the nav grid, a flow field, and the collision and steering shapes over the scene. */
  debug = false;
  /** The index in `debugWays` of the field the debug view shows. */
  debugWay = 0;
  aim: Aim = "waypoint";
  onFrame: (time: number) => void = () => {};

  private readonly ctx: CanvasRenderingContext2D;
  private readonly ground = new Ground();
  private land: Land = scatterRocks();
  private readonly emotes = new Emotes();
  private readonly sprouts = new Sprouts();
  private garden = bunnies.NO_FOOD;
  private school: fishes.School = [];
  private readonly debugDraw = new DebugDraw();
  private readonly spiders: Walker[];
  private rabbitCfg = bunnies.config(bunnies.DEFAULT_RABBITS);
  private herd: bunnies.Herd;
  private bounds: bunnies.Bounds = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  private paths!: bunnies.Paths;
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
    const nest = cam.groundAt(cam.width * NEST.u, cam.height * NEST.v) ?? origin;
    this.herd = bunnies.spawn(RABBIT_COUNT, nest, 70, HOUSE_SPOTS.length);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) this.boil.amount = 0;
  }

  /** The first spider, which the pointer drives. */
  get view(): sim.SpiderView {
    return this.spiders[0]!.view;
  }

  get target(): V3 {
    return this.spiders[0]!.target;
  }

  /** The fields the debug view can show, by name. The last shows the grid with no field. */
  get debugWays(): string[] {
    return ["Huddle", ...HOUSE_SPOTS.map((_, i) => `Door ${i}`), "Grid only"];
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
    const doors = this.land.houses.map((h) => h.door);
    this.paths = bunnies.foodPaths(bunnies.updatePaths(this.paths, this.herd, dt), this.garden);
    this.herd = bunnies.step(this.herd, this.land.ground, threats, doors, this.garden, this.paths, this.bounds, dt, this.rabbitCfg);
    this.garden = bunnies.tend(this.garden, this.herd, this.land.ground, doors, this.paths, this.bounds, dt);
    // The fish feel every spider foot that is down in their water.
    const wading = this.spiders.flatMap((s) => s.view.legs.map((l) => l.foot).filter((f) => f.y < WADE_HEIGHT));
    const water = this.land.ponds[0];
    if (water) this.school = fishes.step(this.school, water, wading, time, dt);
    this.boil.tick(time);
    const rabbits = bunnies.view(this.herd, this.rabbitCfg);
    this.emotes.update(rabbits, time);
    const food = bunnies.patches(this.garden);
    this.sprouts.update(food, time);

    const ctx = this.ctx;
    this.ground.drawBase(ctx, cam);
    const layers = [
      pondLayers(ctx, cam, this.land.ponds, fishes.view(this.school), wading, time, this.boil),
      crevasseLayers(ctx, cam, this.land.crevasses, this.boil),
      foodLayers(ctx, cam, food, this.sprouts, time, this.boil),
      this.markLayers(time),
      rockLayers(ctx, cam, this.land.rocks, this.boil),
      houseLayers(ctx, cam, this.land.houses, this.occupants(rabbits), time, this.boil),
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
    if (this.debug) this.drawDebug(rabbits, doors);
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
    const huddle = bunnies.outsideCentroid(this.herd);
    if (huddle && turn % (n + 1) === i + 1) return huddle;
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
    const homes = HOUSE_SPOTS.map((spot) => this.houseSpot(spot.u, spot.v));
    // The pond needs the most room, so it picks its spot first and the crevasse and boulder go around it.
    const pond = this.pondSpot(homes);
    const crevasse = this.crevasseSpot(homes, pond);
    const boulder = this.boulderSpot(homes, crevasse, pond);
    this.land = scatterRocks((r) => !this.covers(r), homes, crevasse, boulder, pond);
    const water = this.land.ponds[0];
    this.school = water ? fishes.stock(water, FISH_COUNT) : [];
    // The old patches may now be under a rock or off the screen.
    this.garden = bunnies.NO_FOOD;
    this.paths = bunnies.findPaths(
      this.land.ground,
      this.land.houses.map((h) => h.door),
      this.bounds,
    );
  }

  private groundAt(spot: { u: number; v: number }): V3 {
    const cam = this.camera;
    return cam.groundAt(cam.width * spot.u, cam.height * spot.v) ?? { x: 0, y: 0, z: 0 };
  }

  /** True when a circle of `radius` on the ground at `p` is clear of the houses, their door paths and the nest. */
  private isOpen(p: V3, radius: number, homes: V3[]): boolean {
    const nest = this.groundAt(NEST);
    // A hill reaches from its door spot back to about its radius behind it.
    const hills = homes.map((d) => ({ ...d, z: d.z + HOUSE_RADIUS * 0.45 }));
    return (
      Math.hypot(p.x - nest.x, p.z - nest.z) > radius + 110 &&
      hills.every((h) => Math.hypot(p.x - h.x, p.z - h.z) > radius + HOUSE_RADIUS * 0.95) &&
      homes.every((d) => distanceToLine(p, d, { ...d, z: d.z - 110 }) > radius + 50)
    );
  }

  /**
   * The first crevasse line with a long enough part that is on screen and
   * clear of the page text, the houses, the nest and the pond. The crevasse
   * follows that part of the line.
   */
  private crevasseSpot(homes: V3[], pond: V3 | null): CrevasseSpot | null {
    const cam = this.camera;
    const half = CREVASSE_WIDTH / 2;
    const steps = 16;
    for (const spot of CREVASSE_SPOTS) {
      const [from, to] = [this.groundAt(spot.from), this.groundAt(spot.to)];
      const at = (k: number): V3 => ({
        x: from.x + ((to.x - from.x) * k) / steps,
        y: 0,
        z: from.z + ((to.z - from.z) * k) / steps,
      });
      const fits = (p: V3) => {
        const on = cam.project(p);
        const onScreen = on.x > 0 && on.x < cam.width && on.y > 0 && on.y < cam.height;
        return (
          onScreen &&
          this.isOpen(p, half, homes) &&
          !this.covers({ center: p, radius: half, height: 0 }) &&
          (!pond || Math.hypot(p.x - pond.x, p.z - pond.z) > POND_RADIUS + half + 50)
        );
      };
      // The longest run of points along the line that all fit.
      let best = { first: 0, count: 0 };
      let run = { first: 0, count: 0 };
      for (let k = 0; k <= steps; k++) {
        run = fits(at(k)) ? { first: run.count ? run.first : k, count: run.count + 1 } : { first: 0, count: 0 };
        if (run.count > best.count) best = run;
      }
      const [start, end] = [at(best.first), at(best.first + best.count - 1)];
      if (best.count > 1 && Math.hypot(end.x - start.x, end.z - start.z) > CREVASSE_WIDTH * 3)
        return { from: start, to: end, bridge: spot.bridge };
    }
    return null;
  }

  /** The first boulder spot that is clear of the page text, the houses, the nest, the crevasse and the pond. */
  private boulderSpot(homes: V3[], crevasse: CrevasseSpot | null, pond: V3 | null): V3 | null {
    for (const spot of BOULDER_SPOTS) {
      const at = this.groundAt(spot);
      const clear =
        this.isOpen(at, BOULDER_RADIUS, homes) &&
        !this.covers({ center: at, radius: BOULDER_RADIUS, height: 0 }) &&
        (!crevasse || distanceToLine(at, crevasse.from, crevasse.to) > BOULDER_RADIUS + CREVASSE_WIDTH / 2 + 40) &&
        (!pond || Math.hypot(at.x - pond.x, at.z - pond.z) > POND_RADIUS + BOULDER_RADIUS + 50);
      if (clear) return at;
    }
    return null;
  }

  /** The first pond spot that is on screen and clear of the page text, the houses and the nest. */
  private pondSpot(homes: V3[]): V3 | null {
    const cam = this.camera;
    for (const spot of POND_SPOTS) {
      const at = this.groundAt(spot);
      const edges = [
        { ...at, x: at.x - POND_RADIUS },
        { ...at, x: at.x + POND_RADIUS },
        { ...at, z: at.z - POND_RADIUS },
        { ...at, z: at.z + POND_RADIUS },
      ].map((p) => cam.project(p));
      const clear =
        edges.every((p) => p.x > 0 && p.x < cam.width && p.y > 0 && p.y < cam.height) &&
        this.isOpen(at, POND_RADIUS, homes) &&
        !this.covers({ center: at, radius: POND_RADIUS, height: 0 });
      if (clear) return at;
    }
    return null;
  }

  /** The ground point at screen fractions (u, v), moved toward the middle until the house fits on screen. */
  private houseSpot(u: number, v: number): V3 {
    const cam = this.camera;
    const origin = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < 20; k++) {
      const at = cam.groundAt(cam.width * u, cam.height * v) ?? origin;
      const left = cam.project({ ...at, x: at.x - HOUSE_RADIUS * 0.6 }).x;
      const right = cam.project({ ...at, x: at.x + HOUSE_RADIUS * 0.6 }).x;
      if (left >= 0 && right <= cam.width) return at;
      u += (0.5 - u) * 0.15;
    }
    return cam.groundAt(cam.width * u, cam.height * v) ?? origin;
  }

  /** How many rabbits are inside each house. */
  private occupants(rabbits: bunnies.RabbitView[]): number[] {
    return this.land.houses.map((h) => rabbits.filter((r) => r.indoors && r.home === h.index).length);
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
  private markLayers(time: number): Layers {
    const marks: { at: V3; alpha: number; pulse: boolean }[] = [];
    if (this.pin) marks.push({ at: this.pin, alpha: 0.85, pulse: true });
    if (this.hover) marks.push({ at: this.hover, alpha: this.pin ? 0.35 : 0.75, pulse: !this.pin });
    const flat = marks.filter((m) => !rockUnder(this.land, m.at));
    const raised = marks.filter((m) => rockUnder(this.land, m.at));
    return {
      shadows: () => flat.forEach((m) => this.drawMark(m.at, m.alpha, m.pulse, time)),
      pieces: raised.map((m) => {
        const r = rockUnder(this.land, m.at)!;
        return {
          depth: this.camera.project({ ...r.center, z: r.center.z + r.radius }).depth - 0.01,
          draw: () => this.drawMark(m.at, m.alpha, m.pulse, time),
        };
      }),
    };
  }

  /** A hand-drawn ring that follows the ground surface, rocks included. A pulsing ring breathes in and out. */
  private drawMark(at: V3, alpha: number, pulse: boolean, time: number) {
    const s = this.spiders[0]!;
    const radius = s.settings.stance * (0.45 + (pulse ? 0.04 * Math.sin(time * 6) : 0));
    const ring = Array.from({ length: 49 }, (_, k) => {
      const a = (k / 48) * Math.PI * 2;
      const p = { x: at.x + Math.cos(a) * radius, y: 0, z: at.z + Math.sin(a) * radius };
      return this.boil.jitter(this.camera.project({ ...p, y: heightAt(this.land, p) + 0.5 }), 700 + k);
    });
    line(this.ctx, ring, `hsl(${s.eyeHue} 90% 52.5% / ${alpha})`, 2);
  }

  /** Pin the spot under a screen point, or remove the pin when the click lands on it. */
  private click(sx: number, sy: number) {
    const spot = pick(this.land, this.camera, sx, sy);
    if (!spot) return;
    const radius = this.spiders[0]!.settings.stance * 0.45;
    const onPin = this.pin && Math.hypot(spot.x - this.pin.x, spot.z - this.pin.z) < radius;
    this.pin = onPin ? null : spot;
  }

  private drawDebug(rabbits: bunnies.RabbitView[], doors: V3[]) {
    const ways = bunnies.ways(this.paths);
    const fields = [ways.huddle, ...ways.doors];
    this.debugDraw.draw(this.ctx, this.camera, {
      land: this.land,
      bounds: this.bounds,
      grid: ways.grid,
      field: fields[this.debugWay] ?? null,
      rabbits,
      aims: bunnies.aims(this.herd, doors, this.garden, this.paths),
      food: bunnies.patches(this.garden),
      huddle: bunnies.outsideCentroid(this.herd),
      spacing: bunnies.DEFAULT_RABBITS.spacing,
      huddleRadius: bunnies.DEFAULT_RABBITS.huddleRadius,
      fearRadius: bunnies.fearRadius(this.rabbitCfg),
      spiders: this.spiders.map((s) => ({ body: s.view.body, target: s.target })),
    });
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
