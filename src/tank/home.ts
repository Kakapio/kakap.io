import { Pointer, fitCanvas, runLoop } from "./canvas";
import { drawFish, drawWater } from "./draw";
import * as sim from "./sim";

const canvas = document.querySelector<HTMLCanvasElement>("#tank");
if (canvas) start(canvas);

function start(canvas: HTMLCanvasElement) {
  const tank = fitCanvas(canvas);
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cfg = sim.config({
    segments: 12,
    segmentLength: 14,
    maxBendDeg: 25,
    speed: 160,
    turnRateDeg: 220,
    wiggle: reduceMotion ? 0 : 0.45,
  });
  let fish = sim.spawn({ x: tank.width * 0.3, y: tank.height * 0.65 }, 0, cfg);

  // The canvas is fixed to the viewport, so client coordinates are canvas coordinates.
  const pointer = new Pointer();
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") pointer.set(e.clientX, e.clientY, true);
  });
  window.addEventListener("pointerdown", (e) => pointer.set(e.clientX, e.clientY, false));
  window.addEventListener("pointerout", (e) => {
    if (e.pointerType === "mouse" && e.relatedTarget === null) pointer.release();
  });

  runLoop((dt, time) => {
    const target = pointer.live ? pointer : sim.roam(time, tank.width, tank.height);
    fish = sim.swim(fish, target, dt, cfg);
    drawWater(tank.ctx, tank.width, tank.height, false);
    drawFish(tank.ctx, sim.view(fish), 30, "blocks");
  });
}
