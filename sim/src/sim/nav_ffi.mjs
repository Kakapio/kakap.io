// Flat arrays for the nav grid. The Gleam side never changes an array after
// it gets one, so they behave like values.

/** A mask with a 1 for each index from 0 to `count - 1` that passes `open`. */
export function mask(count, open) {
  const cells = new Uint8Array(count);
  for (let i = 0; i < count; i++) cells[i] = open(i) ? 1 : 0;
  return cells;
}

/** A copy of `cells` with index `i` set to 1. */
export function opened(cells, i) {
  const copy = cells.slice();
  copy[i] = 1;
  return copy;
}

export function isOpen(cells, i) {
  return i >= 0 && i < cells.length && cells[i] === 1;
}

export function countOpen(cells) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) n += cells[i];
  return n;
}

/** A cost array with -1 in every cell: no cell has a way. */
export function noCosts(count) {
  return new Int32Array(count).fill(-1);
}

/** The cost of cell `i`, or -1 when it has no way to the goal. */
export function costAt(costs, i) {
  return i >= 0 && i < costs.length ? costs[i] : -1;
}

/**
 * The lowest cost from every open cell to cell `seed`, or -1 with no way.
 * A step to the side costs `straight` and a diagonal step costs `diagonal`.
 * A diagonal step needs both cells beside it open. Cells are visited in
 * order of cost, from one bucket of cells per cost.
 */
export function fill(cells, columns, rows, seed, straight, diagonal) {
  const costs = new Int32Array(cells.length).fill(-1);
  const buckets = [[seed]];
  costs[seed] = 0;
  const visit = (to, cost) => {
    if (costs[to] !== -1 && costs[to] <= cost) return;
    costs[to] = cost;
    (buckets[cost] ??= []).push(to);
  };
  for (let now = 0; now < buckets.length; now++) {
    const bucket = buckets[now];
    if (!bucket) continue;
    for (const cell of bucket) {
      // A cell that got a lower cost later is in an earlier bucket too.
      if (costs[cell] !== now) continue;
      const column = cell % columns;
      const row = (cell - column) / columns;
      const left = column > 0 && cells[cell - 1] === 1;
      const right = column < columns - 1 && cells[cell + 1] === 1;
      const up = row > 0 && cells[cell - columns] === 1;
      const down = row < rows - 1 && cells[cell + columns] === 1;
      if (left) visit(cell - 1, now + straight);
      if (right) visit(cell + 1, now + straight);
      if (up) visit(cell - columns, now + straight);
      if (down) visit(cell + columns, now + straight);
      if (left && up && cells[cell - columns - 1] === 1) visit(cell - columns - 1, now + diagonal);
      if (right && up && cells[cell - columns + 1] === 1) visit(cell - columns + 1, now + diagonal);
      if (left && down && cells[cell + columns - 1] === 1) visit(cell + columns - 1, now + diagonal);
      if (right && down && cells[cell + columns + 1] === 1) visit(cell + columns + 1, now + diagonal);
    }
  }
  return costs;
}
