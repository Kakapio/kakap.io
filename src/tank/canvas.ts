export type Tank = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
};

/** Keep the canvas backing store matched to its CSS size, capped at 2× device pixels. */
export function fitCanvas(canvas: HTMLCanvasElement): Tank {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  const tank: Tank = { ctx, width: 0, height: 0 };
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    tank.width = canvas.clientWidth;
    tank.height = canvas.clientHeight;
    canvas.width = Math.round(tank.width * dpr);
    canvas.height = Math.round(tank.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);
  return tank;
}

/** Call `step` once per animation frame with `dt` and `time` in seconds. `dt` is capped at 50 ms. */
export function runLoop(step: (dt: number, time: number) => void) {
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt, now / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Tracks where the visitor last pointed. `live` stays true 2.5 s after the last input. */
export class Pointer {
  x = 0;
  y = 0;
  private holding = false;
  private lastSeen = -Infinity;

  set(x: number, y: number, holding: boolean) {
    this.x = x;
    this.y = y;
    this.holding = holding;
    this.lastSeen = performance.now();
  }

  release() {
    this.holding = false;
    this.lastSeen = performance.now();
  }

  get live(): boolean {
    return this.holding || performance.now() - this.lastSeen < 2500;
  }
}
