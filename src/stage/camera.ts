export type V3 = { x: number; y: number; z: number };
export type Projected = { x: number; y: number; scale: number; depth: number };

const DEG = Math.PI / 180;

/**
 * A perspective camera that looks down at the ground plane (y = 0) and aims
 * at the world origin. Screen y grows downward.
 */
export class Camera {
  width = 0;
  height = 0;
  private focal = 1;
  private position: V3 = { x: 0, y: 0, z: 0 };
  private readonly forward: V3;
  private readonly up: V3;

  constructor(
    pitchDeg = 52,
    private readonly fovDeg = 38,
    private readonly baseDistance = 1400,
  ) {
    const p = pitchDeg * DEG;
    this.forward = { x: 0, y: -Math.sin(p), z: Math.cos(p) };
    this.up = { x: 0, y: Math.cos(p), z: Math.sin(p) };
  }

  /** Fit the view to a viewport. Tall screens pull the camera back so the spider fits across. */
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.focal = height / 2 / Math.tan((this.fovDeg * DEG) / 2);
    const distance =
      this.baseDistance * Math.max(1, (0.9 * height) / Math.max(1, width));
    this.position = {
      x: 0,
      y: -this.forward.y * distance,
      z: -this.forward.z * distance,
    };
  }

  project(p: V3): Projected {
    const rx = p.x - this.position.x;
    const ry = p.y - this.position.y;
    const rz = p.z - this.position.z;
    const depth = ry * this.forward.y + rz * this.forward.z;
    const y = ry * this.up.y + rz * this.up.z;
    const scale = this.focal / Math.max(1, depth);
    return {
      x: this.width / 2 + rx * scale,
      y: this.height / 2 - y * scale,
      scale,
      depth,
    };
  }

  /** The ray from the camera through a screen point. `dir` is not normalized. */
  ray(sx: number, sy: number): { origin: V3; dir: V3 } {
    const u = sx - this.width / 2;
    const v = this.height / 2 - sy;
    return {
      origin: this.position,
      dir: {
        x: u,
        y: v * this.up.y + this.focal * this.forward.y,
        z: v * this.up.z + this.focal * this.forward.z,
      },
    };
  }

  /** The point at height `y` under a screen point, or null when the ray misses that plane. */
  planeAt(sx: number, sy: number, y: number): V3 | null {
    const { origin, dir } = this.ray(sx, sy);
    if (dir.y >= -1e-6 || origin.y <= y) return null;
    const t = (y - origin.y) / dir.y;
    return { x: origin.x + dir.x * t, y, z: origin.z + dir.z * t };
  }

  /** The ground point under a screen point, or null when the ray misses the ground. */
  groundAt(sx: number, sy: number): V3 | null {
    return this.planeAt(sx, sy, 0);
  }
}
