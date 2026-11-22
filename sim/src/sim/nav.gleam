//// Ways around obstacles on a grid. A grid marks each square cell of the
//// ground as open or blocked. A field holds, for every open cell that can
//// reach a goal, the cost of the shortest way there. A walker follows a
//// field downhill, and cuts corners where it has a clear line.
////
//// The cells and the costs are flat arrays in `nav_ffi.mjs`. A field is
//// built about once a second while the scene runs, and arrays make that
//// fast enough not to hold up a frame.

import gleam/float
import gleam/int
import gleam/list
import gleam/result
import sim/vec3.{type Vec3, Vec3}

/// One flag per cell: open or blocked.
type Mask

/// One cost per cell, or -1 for a cell with no way to the goal.
type Costs

@external(javascript, "./nav_ffi.mjs", "mask")
fn mask(count: Int, open: fn(Int) -> Bool) -> Mask

@external(javascript, "./nav_ffi.mjs", "opened")
fn opened(cells: Mask, cell: Int) -> Mask

@external(javascript, "./nav_ffi.mjs", "isOpen")
fn mask_has(cells: Mask, cell: Int) -> Bool

@external(javascript, "./nav_ffi.mjs", "countOpen")
fn count_open(cells: Mask) -> Int

@external(javascript, "./nav_ffi.mjs", "noCosts")
fn no_costs(count: Int) -> Costs

@external(javascript, "./nav_ffi.mjs", "costAt")
fn cost_at(costs: Costs, cell: Int) -> Int

@external(javascript, "./nav_ffi.mjs", "fill")
fn fill(
  cells: Mask,
  columns: Int,
  rows: Int,
  seed: Int,
  straight: Int,
  diagonal: Int,
) -> Costs

/// Square cells of `cell` width over a rectangle of ground. Cell `column +
/// row * columns` is open when a walker can stand at its center.
pub opaque type Grid {
  Grid(
    min_x: Float,
    min_z: Float,
    cell: Float,
    columns: Int,
    rows: Int,
    open: Mask,
    blocked: fn(Vec3) -> Bool,
  )
}

/// The cost of the way to `goal` from each cell that can reach it. A step to
/// the side costs 5 and a diagonal step costs 7.
pub opaque type Field {
  Field(grid: Grid, goal: Vec3, cost: Costs)
}

const straight = 5

const diagonal = 7

/// How many cells along the way a walker looks for a clear line.
const look = 14

/// A grid over the rectangle. `blocked` tells if a walker cannot stand at a
/// point.
pub fn grid(
  min_x min_x: Float,
  max_x max_x: Float,
  min_z min_z: Float,
  max_z max_z: Float,
  cell cell: Float,
  blocked blocked: fn(Vec3) -> Bool,
) -> Grid {
  let count = fn(span: Float) {
    int.max(1, float.truncate(float.ceiling(span /. cell)))
  }
  let columns = count(max_x -. min_x)
  let rows = count(max_z -. min_z)
  let at = fn(id: Int) {
    Vec3(
      min_x +. { int.to_float(id % columns) +. 0.5 } *. cell,
      0.0,
      min_z +. { int.to_float(id / columns) +. 0.5 } *. cell,
    )
  }
  let open = mask(columns * rows, fn(id) { !blocked(at(id)) })
  Grid(min_x, min_z, cell, columns, rows, open, blocked)
}

/// The numbers of columns, rows and open cells.
pub fn size(grid: Grid) -> #(Int, Int, Int) {
  #(grid.columns, grid.rows, count_open(grid.open))
}

/// True when the cell that holds `p` is open.
pub fn is_open(grid: Grid, p: Vec3) -> Bool {
  mask_has(grid.open, cell_of(grid, p))
}

/// The field of ways to `goal`. A goal in a blocked cell still works when a
/// walker can stand on the goal itself. Otherwise the goal moves to the
/// center of the nearest open cell.
pub fn field(grid: Grid, to goal: Vec3) -> Field {
  let at = cell_of(grid, goal)
  let seed = case mask_has(grid.open, at) || !grid.blocked(goal) {
    True -> Ok(#(at, goal))
    False ->
      nearest(grid, goal, 16, mask_has(grid.open, _))
      |> result.map(fn(id) { #(id, center(grid, id)) })
  }
  case seed {
    Error(Nil) -> Field(grid, goal, no_costs(grid.columns * grid.rows))
    Ok(#(id, goal)) -> {
      let grid = Grid(..grid, open: opened(grid.open, id))
      Field(
        grid,
        goal,
        fill(grid.open, grid.columns, grid.rows, id, straight, diagonal),
      )
    }
  }
}

/// Where the field's ways lead.
pub fn goal(field: Field) -> Vec3 {
  field.goal
}

/// True when the cell that holds `p` has a way to the goal.
pub fn reaches(field: Field, from p: Vec3) -> Bool {
  cost_at(field.cost, cell_of(field.grid, p)) >= 0
}

/// The center of the next cell on the way from `p` to the goal. It is the
/// goal itself from the goal's cell, and from a point with no way there.
pub fn next(field: Field, from p: Vec3) -> Vec3 {
  case downhill(field, cell_of(field.grid, p)) {
    Ok(id) -> center(field.grid, id)
    Error(Nil) -> field.goal
  }
}

/// The point to head for from `p` to get to `target`, which is at or near
/// the field's goal. It is `target` when the line to it is clear. Otherwise
/// it is the farthest point along the field's way that `p` has a clear line
/// to. A walker in a blocked cell heads for the nearest cell with a way.
pub fn toward(field: Field, from p: Vec3, to target: Vec3) -> Vec3 {
  let here = cell_of(field.grid, p)
  let has_way = fn(cell) { cost_at(field.cost, cell) >= 0 }
  case has_way(here) {
    False ->
      case nearest(field.grid, p, 4, has_way) {
        Ok(id) -> center(field.grid, id)
        Error(Nil) -> target
      }
    True ->
      case sight(field, p, target) {
        True -> target
        False -> ahead(field, p, here, look, next(field, p))
      }
  }
}

/// The farthest cell center on the way from `cell`, at most `steps` cells
/// on, that `p` has a clear line to. `best` is the answer so far.
fn ahead(field: Field, p: Vec3, cell: Int, steps: Int, best: Vec3) -> Vec3 {
  case steps, downhill(field, cell) {
    0, _ | _, Error(Nil) -> best
    _, Ok(id) -> {
      let at = center(field.grid, id)
      let best = case sight(field, p, at) {
        True -> at
        False -> best
      }
      ahead(field, p, id, steps - 1, best)
    }
  }
}

/// True when a walker can go straight from `a` to `b`: every cell within
/// `clearance` cells of the line has a way to the goal. The cell that holds
/// `a` always counts as clear.
fn sight(field: Field, a: Vec3, b: Vec3) -> Bool {
  let grid = field.grid
  let start = cell_of(grid, a)
  let length = vec3.ground_distance(a, b)
  let count = int.max(1, float.truncate(length /. { grid.cell /. 3.0 }))
  let along = vec3.normalize(vec3.flat(vec3.subtract(b, a)))
  let side =
    vec3.scale(Vec3(0.0 -. along.z, 0.0, along.x), grid.cell *. clearance)
  let clear = fn(p: Vec3) {
    let id = cell_of(grid, p)
    id == start || cost_at(field.cost, id) >= 0
  }
  numbers(1, count)
  |> list.all(fn(k) {
    let p = vec3.lerp(a, b, int.to_float(k) /. int.to_float(count))
    clear(p) && clear(vec3.add(p, side)) && clear(vec3.subtract(p, side))
  })
}

/// How far to each side of a line of sight the cells must be clear, in cells.
const clearance = 0.3

/// The neighbor of `cell` with the lowest cost below the cell's own.
fn downhill(field: Field, cell: Int) -> Result(Int, Nil) {
  case cost_at(field.cost, cell) {
    -1 -> Error(Nil)
    own ->
      neighbors(field.grid, cell)
      |> list.fold(#(Error(Nil), own), fn(best, step) {
        let cost = cost_at(field.cost, step.0)
        case cost >= 0 && cost + step.1 <= own && cost < best.1 {
          True -> #(Ok(step.0), cost)
          False -> best
        }
      })
      |> fn(best) { best.0 }
  }
}

/// The open cells one step from `cell`, each with the price of the step. A
/// diagonal step needs both cells beside it open, so no way cuts a corner.
fn neighbors(grid: Grid, cell: Int) -> List(#(Int, Int)) {
  let column = cell % grid.columns
  let row = cell / grid.columns
  let open = fn(dc: Int, dr: Int) {
    let c = column + dc
    let r = row + dr
    c >= 0
    && c < grid.columns
    && r >= 0
    && r < grid.rows
    && mask_has(grid.open, c + r * grid.columns)
  }
  let left = open(-1, 0)
  let right = open(1, 0)
  let up = open(0, -1)
  let down = open(0, 1)
  let add = fn(found, ok: Bool, dc: Int, dr: Int, price: Int) {
    case ok {
      True -> [#(cell + dc + dr * grid.columns, price), ..found]
      False -> found
    }
  }
  []
  |> add(left, -1, 0, straight)
  |> add(right, 1, 0, straight)
  |> add(up, 0, -1, straight)
  |> add(down, 0, 1, straight)
  |> add(left && up && open(-1, -1), -1, -1, diagonal)
  |> add(right && up && open(1, -1), 1, -1, diagonal)
  |> add(left && down && open(-1, 1), -1, 1, diagonal)
  |> add(right && down && open(1, 1), 1, 1, diagonal)
}

/// The cell that passes `ok` and is closest to `p`, looking at most `reach`
/// cells out from the cell that holds `p`.
fn nearest(
  grid: Grid,
  p: Vec3,
  reach: Int,
  ok: fn(Int) -> Bool,
) -> Result(Int, Nil) {
  let here = cell_of(grid, p)
  let column = here % grid.columns
  let row = here / grid.columns
  let span = numbers(0 - reach, reach)
  list.flat_map(span, fn(dr) {
    list.map(span, fn(dc) { #(column + dc, row + dr) })
  })
  |> list.filter(fn(at) {
    at.0 >= 0 && at.0 < grid.columns && at.1 >= 0 && at.1 < grid.rows
  })
  |> list.map(fn(at) { at.0 + at.1 * grid.columns })
  |> list.filter(ok)
  |> list.fold(#(Error(Nil), 0.0), fn(best, id) {
    let gap = vec3.ground_distance(center(grid, id), p)
    case best.0 == Error(Nil) || gap <. best.1 {
      True -> #(Ok(id), gap)
      False -> best
    }
  })
  |> fn(best) { best.0 }
}

/// The cell that holds `p`. A point outside the grid counts as in the cell
/// at the nearest edge.
fn cell_of(grid: Grid, p: Vec3) -> Int {
  let index = fn(offset: Float, count: Int) {
    int.clamp(
      float.truncate(float.floor(offset /. grid.cell)),
      min: 0,
      max: count - 1,
    )
  }
  index(p.x -. grid.min_x, grid.columns)
  + index(p.z -. grid.min_z, grid.rows)
  * grid.columns
}

fn center(grid: Grid, cell: Int) -> Vec3 {
  Vec3(
    grid.min_x +. { int.to_float(cell % grid.columns) +. 0.5 } *. grid.cell,
    0.0,
    grid.min_z +. { int.to_float(cell / grid.columns) +. 0.5 } *. grid.cell,
  )
}

/// The whole numbers from `from` to `to`.
fn numbers(from: Int, to: Int) -> List(Int) {
  list.repeat(Nil, int.max(0, to - from + 1))
  |> list.index_map(fn(_, i) { from + i })
}
