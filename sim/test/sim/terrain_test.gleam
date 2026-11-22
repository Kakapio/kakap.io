import gleam/list
import sim/terrain.{Rock, Terrain}
import sim/vec3.{Vec3}

const rock = Rock(Vec3(100.0, 0.0, 50.0), 40.0, 30.0, 40.0)

pub fn a_rock_is_tall_at_its_center_and_stays_inside_its_radius_test() {
  let ground = Terrain([rock])
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
  let y = terrain.height(Terrain([rock]), at: Vec3(110.0, 0.0, 60.0)) /. 30.0
  let gaps =
    list.map(facets, fn(f) {
      f.reach -. f.normal.x *. 0.25 -. f.normal.y *. y -. f.normal.z *. 0.25
    })
  assert list.all(gaps, fn(g) { g >. -0.000001 })
  assert list.any(gaps, fn(g) { g <. 0.000001 })
}

pub fn push_out_moves_a_point_past_the_edge_test() {
  let ground = Terrain([rock])
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
  let Terrain(rocks) = make()
  assert make() == Terrain(rocks)
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
  let ground = Terrain([house])
  assert terrain.height(ground, at: Vec3(0.0, 0.0, -60.0)) == 0.0
  assert terrain.height(ground, at: Vec3(0.0, 0.0, -50.0)) >. 0.0
  let p = terrain.push_out(ground, Vec3(0.0, 0.0, -50.0), 10.0)
  assert p.z <=. -65.999
  assert p.x == 0.0
}

pub fn a_hill_fades_into_the_ground_with_a_dug_entrance_test() {
  let hill = terrain.Hill(Vec3(0.0, 0.0, 0.0), 210.0, 95.0, 50.0, 0.4363)
  let ground = Terrain([hill])
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
