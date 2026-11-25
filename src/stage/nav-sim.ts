import * as nav from "@gleam/sim/sim/nav.mjs";
import * as vec3 from "@gleam/sim/sim/vec3.mjs";
import { Result$isOk, Result$Ok$0 } from "@gleam/prelude.mjs";
import type { V3 } from "./camera";

export type Grid = nav.Grid$;
export type Field = nav.Field$;

/**
 * A grid and one field on it, as flat arrays with one entry per cell. Cell
 * `column + row * columns` has its corner at `minX + column * cell`,
 * `minZ + row * cell`. `cost` is -1 for a cell with no way to the goal, and
 * `next` is -1 for a cell with no next cell. Both are all -1 with no field.
 */
export type GridView = {
  columns: number;
  rows: number;
  cell: number;
  minX: number;
  minZ: number;
  open: Uint8Array;
  cost: Int32Array;
  next: Int32Array;
  maxCost: number;
  goal: V3 | null;
};

const fromV3 = (v: vec3.Vec3$): V3 => ({ x: vec3.Vec3$Vec3$x(v), y: vec3.Vec3$Vec3$y(v), z: vec3.Vec3$Vec3$z(v) });

/** Every cell of `grid`, with the costs and next cells of `field` when there is one. */
export function gridView(grid: Grid, field: Field | null): GridView {
  // A field's own grid has the goal's cell open.
  const g = field ? nav.grid_of(field) : grid;
  const [columns, rows] = nav.size(g);
  const cell = nav.cell_width(g);
  const first = fromV3(nav.cell_center(g, 0));
  const count = columns * rows;
  const open = new Uint8Array(count);
  const cost = new Int32Array(count).fill(-1);
  const next = new Int32Array(count).fill(-1);
  let maxCost = 0;
  for (let i = 0; i < count; i++) {
    open[i] = nav.open_at(g, i) ? 1 : 0;
    if (!field) continue;
    cost[i] = nav.cost(field, i);
    maxCost = Math.max(maxCost, cost[i]!);
    const step = nav.next_cell(field, i);
    if (Result$isOk(step)) next[i] = Result$Ok$0(step)!;
  }
  return {
    columns,
    rows,
    cell,
    minX: first.x - cell / 2,
    minZ: first.z - cell / 2,
    open,
    cost,
    next,
    maxCost,
    goal: field ? fromV3(nav.goal(field)) : null,
  };
}
