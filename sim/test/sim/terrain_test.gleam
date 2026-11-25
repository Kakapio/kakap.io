import gleam/int
import gleam/list
import sim/terrain.{Rock, Terrain}
import sim/vec3.{Vec3}

const rock = Rock(Vec3(100.0, 0.0, 50.0), 40.0, 30.0, 40.0)

pub fn a_rock_is_tall_at_its_center_and_stays_inside_its_radius_test() {
  let ground = Terrain([rock], [], [])
  let top = terrain.height(ground, at: Vec3(100.0, 0.0, 50.0))
  assert top >. 24.0
  assert top <=. 30.0
  assert terrain.height(ground, at: Vec3(136.0, 0.0, 50.0)) <. 20.0
  assert terrain.height(ground, at: Vec3(141.0, 0.0, 50.0)) == 0.0
}

pub fn a_rock_has_facets_that_cover_its_surface_test() {
  let facets = terrain.facets(rock)
  assert list.length(facets) == 15
  assert list.all(facets, fn(f) { f.normal.y >. 0.0 })
  // The surface point above (110, 60) lies under every facet and on one.
  let y =
    terrain.height(Terrain([rock], [], []), at: Vec3(110.0, 0.0, 60.0)) /. 30.0
  let gaps =
    list.map(facets, fn(f) {
      f.reach -. f.normal.x *. 0.25 -. f.normal.y *. y -. f.normal.z *. 0.25
    })
  assert list.all(gaps, fn(g) { g >. -0.000001 })
  assert list.any(gaps, fn(g) { g <. 0.000001 })
}

pub fn push_out_moves_a_point_past_the_edge_test() {
  let ground = Terrain([rock], [], [])
  let p = terrain.push_out(ground, Vec3(110.0, 0.0, 50.0), 5.0)
  assert vec3.ground_distance(p, rock.center) >=. 44.999
}

pub fn scatter_is_repeatable_and_stays_in_its_cells_test() {
  let make = fn() {
    terrain.scatter(
      min_x: -1000.0,
      max_x: 1000.0,
      min_z: -500.0,
      max_z: 1500.0,
      cell: 500.0,
    )
  }
  let Terrain(rocks, _, _) = make()
  assert make() == Terrain(rocks, [], [])
  assert rocks != []
  assert list.all(rocks, fn(r) {
    r.center.x >=. -1000.0
    && r.center.x <=. 1500.0
    && r.center.z >=. -500.0
    && r.center.z <=. 2000.0
    && r.height <. r.radius
  })
}

pub fn a_wall_flattens_the_front_of_a_rock_test() {
  let house = Rock(Vec3(0.0, 0.0, 0.0), 80.0, 60.0, 56.0)
  let ground = Terrain([house], [], [])
  assert terrain.height(ground, at: Vec3(0.0, 0.0, -60.0)) == 0.0
  assert terrain.height(ground, at: Vec3(0.0, 0.0, -50.0)) >. 0.0
  let p = terrain.push_out(ground, Vec3(0.0, 0.0, -50.0), 10.0)
  assert p.z <=. -65.999
  assert p.x == 0.0
}

pub fn a_hill_fades_into_the_ground_with_a_dug_entrance_test() {
  let hill = terrain.Hill(Vec3(0.0, 0.0, 0.0), 210.0, 95.0, 50.0, 0.4363)
  let ground = Terrain([hill], [], [])
  // Tall behind the wall, low near its edge, nothing past its radius.
  assert terrain.height(ground, at: Vec3(0.0, 0.0, 10.0)) >. 80.0
  assert terrain.height(ground, at: Vec3(0.0, 0.0, 52.0)) >. 90.0
  assert terrain.height(ground, at: Vec3(170.0, 0.0, 52.0)) <. 8.0
  assert terrain.height(ground, at: Vec3(0.0, 0.0, 195.0)) <. 8.0
  assert terrain.height(ground, at: Vec3(0.0, 0.0, 250.0)) == 0.0
  // The ground in front of the wall is flat, and the hill rises beside the wall.
  assert terrain.height(ground, at: Vec3(0.0, 0.0, -70.0)) == 0.0
  assert terrain.height(ground, at: Vec3(100.0, 0.0, -70.0)) == 0.0
  assert terrain.height(ground, at: Vec3(100.0, 0.0, 20.0)) >. 15.0
  // Just behind the wall, the wall caps the height.
  let behind = terrain.height(ground, at: Vec3(0.0, 0.0, -40.0))
  assert behind >. 15.0
  assert behind <. 25.0
  // A rabbit can stand in the cutting in front of the door.
  let door = Vec3(0.0, 0.0, -64.0)
  assert terrain.push_out(ground, door, 12.0) == door
}

const crack =
  terrain.Crevasse(
    Vec3(0.0, 0.0, 0.0),
    Vec3(600.0, 0.0, 0.0),
    115.0,
    170.0,
    300.0,
  )

pub fn a_crevasse_has_jagged_rims_that_close_at_both_ends_test() {
  let rims = terrain.rims(crack)
  let gaps = list.map(rims, fn(pair) { vec3.ground_distance(pair.0, pair.1) })
  assert list.length(rims) == 14
  assert list.first(gaps) == Ok(0.0)
  assert list.last(gaps) == Ok(0.0)
  assert list.all(gaps, fn(gap) { gap <=. 115.0 })
  // Past the taper at each end, the gap is too wide for a rabbit to hop.
  let middle = gaps |> list.drop(3) |> list.take(8)
  assert list.all(middle, fn(gap) { gap >=. 80.0 })
  // The rims are not straight lines.
  assert list.unique(list.map(rims, fn(pair) { pair.0.z })) |> list.length > 8
}

pub fn a_crevasse_is_deep_inside_and_level_outside_test() {
  let ground = Terrain([], [crack], [])
  let assert Ok(#(left, right)) = terrain.bridge_ends(crack)
  let middle = vec3.lerp(left, right, 0.5)
  assert terrain.height(ground, at: middle) == -170.0
  assert terrain.height(ground, at: vec3.lerp(left, right, 0.1)) <. -40.0
  assert terrain.height(ground, at: Vec3(300.0, 0.0, 90.0)) == 0.0
  assert terrain.height(ground, at: Vec3(-20.0, 0.0, 0.0)) == 0.0
}

pub fn a_foothold_is_never_inside_a_crevasse_test() {
  let ground = Terrain([], [crack], [])
  let spots =
    list.flat_map(numbers(0, 60), fn(i) {
      list.map(numbers(-8, 8), fn(j) {
        Vec3(int.to_float(i) *. 10.0, 0.0, int.to_float(j) *. 9.0)
      })
    })
  assert list.any(spots, fn(p) { terrain.height(ground, at: p) <. 0.0 })
  assert list.all(spots, fn(p) {
    let hold = terrain.foothold(ground, p, toward: p)
    terrain.height(ground, at: hold) == 0.0
    && vec3.ground_distance(hold, p) <. 75.0
  })
  // Solid ground is left alone.
  let solid = Vec3(300.0, 0.0, 90.0)
  assert terrain.foothold(ground, solid, toward: solid) == solid
}

pub fn a_crevasse_blocks_the_way_except_at_its_bridge_test() {
  let ground = Terrain([], [crack], [])
  let assert Ok(#(left, right)) = terrain.bridge_ends(crack)
  // A point over the gap moves out to a rim.
  let out = terrain.push_out(ground, Vec3(150.0, 0.0, 5.0), 12.0)
  assert terrain.height(ground, at: out) == 0.0
  assert out != Vec3(150.0, 0.0, 5.0)
  // A point on the bridge stays.
  let on_bridge = vec3.lerp(left, right, 0.5)
  assert terrain.push_out(ground, on_bridge, 12.0) == on_bridge
  assert terrain.avoid(ground, on_bridge, 36.0) == vec3.zero
  // A point over the gap just beside the bridge moves back onto it.
  let beside = vec3.add(on_bridge, Vec3(25.0, 0.0, 0.0))
  let back = terrain.push_out(ground, beside, 12.0)
  assert back.z == beside.z
  assert back.x <. beside.x
}

pub fn a_broad_rock_has_a_wide_low_top_test() {
  let boulder = terrain.rock(Vec3(0.0, 0.0, 0.0), 190.0, 48.0)
  let ground = Terrain([boulder], [], [])
  assert list.length(terrain.facets(boulder)) == 21
  // Most of the way out, the top is still more than half the full height.
  let ring =
    list.map(numbers(0, 11), fn(k) {
      let a = int.to_float(k) *. 0.5236
      terrain.height(ground, at: vec3.scale(vec3.from_yaw(a), 110.0))
    })
  assert list.all(ring, fn(y) { y >. 20.0 && y <=. 48.0 })
  assert terrain.height(ground, at: Vec3(191.0, 0.0, 0.0)) == 0.0
}

/// The whole numbers from `from` to `to`.
fn numbers(from: Int, to: Int) -> List(Int) {
  list.repeat(Nil, to - from + 1) |> list.index_map(fn(_, i) { from + i })
}
