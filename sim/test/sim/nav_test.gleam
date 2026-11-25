import gleam/int
import gleam/list
import sim/nav.{type Field, type Grid}
import sim/terrain.{Terrain}
import sim/vec3.{type Vec3, Vec3}

/// A hill with its wall toward -z, a rock, and a crevasse with a bridge.
fn ground() -> terrain.Terrain {
  Terrain(
    [
      terrain.Hill(Vec3(0.0, 0.0, 0.0), 210.0, 95.0, 50.0, 0.4363),
      terrain.rock(Vec3(-380.0, 0.0, -250.0), 60.0, 40.0),
    ],
    [
      terrain.Crevasse(
        Vec3(250.0, 0.0, -450.0),
        Vec3(650.0, 0.0, 150.0),
        115.0,
        170.0,
        360.0,
      ),
    ],
    [],
  )
}

fn blocked(p: Vec3) -> Bool {
  vec3.ground_distance(p, terrain.push_out(ground(), p, 12.0)) >. 0.5
}

fn grid() -> Grid {
  nav.grid(
    min_x: -720.0,
    max_x: 720.0,
    min_z: -600.0,
    max_z: 600.0,
    cell: 24.0,
    blocked: blocked,
  )
}

/// Points 30 apart over the whole grid.
fn spots() -> List(Vec3) {
  list.flat_map(numbers(-23, 23), fn(i) {
    list.map(numbers(-19, 19), fn(j) {
      Vec3(int.to_float(i) *. 30.0, 0.0, int.to_float(j) *. 30.0)
    })
  })
}

fn numbers(from: Int, to: Int) -> List(Int) {
  list.repeat(Nil, to - from + 1) |> list.index_map(fn(_, i) { from + i })
}

/// Walk from `from` in steps of 6 toward where the field says, for at most
/// `steps` steps. Returns the end point, and whether every step stayed on
/// open cells.
fn walk(field: Field, from: Vec3, goal: Vec3, steps: Int) -> #(Vec3, Bool) {
  list.fold(list.repeat(Nil, steps), #(from, True), fn(acc, _) {
    let #(p, ok) = acc
    let aim = nav.toward(field, from: p, to: goal)
    let gap = vec3.ground_distance(p, aim)
    case gap <. 6.0 {
      True -> #(aim, ok)
      False -> {
        let next = vec3.lerp(p, aim, 6.0 /. gap)
        #(next, ok && nav.reaches(field, from: next))
      }
    }
  })
}

pub fn a_grid_marks_obstacles_as_blocked_test() {
  let grid = grid()
  let #(columns, rows, open) = nav.size(grid)
  assert #(columns, rows) == #(60, 50)
  assert open > 2000 && open < 3000
  assert !nav.is_open(grid, Vec3(0.0, 0.0, 30.0))
  assert !nav.is_open(grid, Vec3(-380.0, 0.0, -250.0))
  assert nav.is_open(grid, Vec3(-300.0, 0.0, 300.0))
}

pub fn a_field_never_points_into_a_blocked_cell_test() {
  let grid = grid()
  let goal = Vec3(0.0, 0.0, -64.0)
  let field = nav.field(grid, to: goal)
  let starts =
    list.filter(spots(), fn(p) {
      nav.is_open(grid, p) && nav.reaches(field, from: p)
    })
  assert list.length(starts) > 1200
  // The next cell on the way is open, and so is all of the line to the
  // point the walker heads for.
  let wrong =
    list.filter(starts, fn(p) {
      let aim = nav.toward(field, from: p, to: goal)
      let on_line =
        list.all([0.25, 0.5, 0.75, 1.0], fn(share) {
          nav.reaches(field, from: vec3.lerp(p, aim, share))
        })
      !{ nav.reaches(field, from: nav.next(field, from: p)) && on_line }
    })
  assert wrong == []
}

pub fn a_walker_goes_around_a_hill_to_the_door_in_front_of_it_test() {
  let goal = Vec3(0.0, 0.0, -64.0)
  let field = nav.field(grid(), to: goal)
  // From right behind the hill, and from both sides of it.
  assert list.all(
    [Vec3(0.0, 0.0, 250.0), Vec3(-300.0, 0.0, 40.0), Vec3(170.0, 0.0, 20.0)],
    fn(start) { walk(field, start, goal, 200) == #(goal, True) },
  )
}

pub fn a_walker_crosses_a_crevasse_at_its_bridge_test() {
  let grid = grid()
  let assert [crack] = ground().crevasses
  let assert Ok(#(left, right)) = terrain.bridge_ends(crack)
  let on_bridge = vec3.lerp(left, right, 0.5)
  let goal = Vec3(650.0, 0.0, -300.0)
  let field = nav.field(grid, to: goal)
  let start = Vec3(300.0, 0.0, 0.0)
  // The first 50 steps bring the walker to the bridge, and the rest home.
  let #(near, ok) = walk(field, start, goal, 50)
  assert ok
  assert vec3.ground_distance(near, on_bridge) <. 80.0
  assert walk(field, start, goal, 300) == #(goal, True)
}

pub fn a_goal_inside_an_obstacle_moves_to_open_ground_test() {
  let grid = grid()
  // The middle of the hill is blocked. The field leads to open ground near it.
  let field = nav.field(grid, to: Vec3(0.0, 0.0, 60.0))
  let goal = nav.goal(field)
  assert nav.is_open(grid, goal)
  assert vec3.ground_distance(goal, Vec3(0.0, 0.0, 60.0)) <. 220.0
  assert walk(field, Vec3(-500.0, 0.0, -400.0), goal, 300) == #(goal, True)
  // A walker inside an obstacle heads for the nearest cell with a way.
  let out = nav.toward(field, from: Vec3(-380.0, 0.0, -250.0), to: goal)
  assert nav.is_open(grid, out)
  assert vec3.ground_distance(out, Vec3(-380.0, 0.0, -250.0)) <. 110.0
}
