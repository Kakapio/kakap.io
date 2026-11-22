import gleam/list
import sim/terrain.{Rock, Terrain}
import sim/vec3.{Vec3}

const rock = Rock(center: Vec3(100.0, 0.0, 50.0), radius: 40.0, height: 30.0)

pub fn a_rock_is_tallest_at_its_center_test() {
  let ground = Terrain([rock])
  assert terrain.height(ground, at: Vec3(100.0, 0.0, 50.0)) == 30.0
  assert terrain.height(ground, at: Vec3(120.0, 0.0, 50.0)) <. 30.0
  assert terrain.height(ground, at: Vec3(141.0, 0.0, 50.0)) == 0.0
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
