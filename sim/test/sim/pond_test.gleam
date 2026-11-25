import gleam/int
import gleam/list
import sim/fish
import sim/pond.{type Koi}
import sim/terrain.{Pond, Terrain}
import sim/vec
import sim/vec3.{type Vec3, Vec3}

const water = Pond(Vec3(300.0, 0.0, -200.0), 130.0)

const dt = 0.016666666666666666

/// The school after `frames` frames, and the farthest any head got from the
/// pond's center on the way.
fn swim(
  school: List(Koi),
  touches: List(Vec3),
  frames: Int,
) -> #(List(Koi), Float) {
  list.repeat(Nil, frames)
  |> list.index_fold(#(school, 0.0), fn(acc, _, i) {
    let #(school, farthest) = acc
    let next =
      pond.step(
        school,
        in: water,
        away_from: touches,
        time: int.to_float(i) *. dt,
        dt:,
      )
    #(
      next,
      list.fold(next, farthest, fn(far, c) {
        case from_center(c) >. far {
          True -> from_center(c)
          False -> far
        }
      }),
    )
  })
}

fn from_center(c: Koi) -> Float {
  vec.distance(fish.head(c.body), vec.Vec(water.center.x, water.center.z))
}

pub fn fish_stay_in_the_pond_test() {
  let #(_, farthest) = swim(pond.stock(water, 4), [], 1800)
  assert farthest <. water.radius
}

pub fn fish_dart_away_from_a_foot_in_the_water_test() {
  let foot = Vec3(300.0, 0.0, -200.0)
  let #(school, farthest) = swim(pond.stock(water, 4), [foot], 240)
  assert farthest <. water.radius
  assert list.all(school, fn(c) { from_center(c) >. 60.0 })
}

pub fn fish_ignore_a_foot_on_dry_ground_test() {
  let foot = Vec3(300.0, 0.0, -40.0)
  let #(school, _) = swim(pond.stock(water, 4), [foot], 120)
  assert list.all(school, fn(c) { c.scare == 0.0 })
}

pub fn a_pond_keeps_a_walker_out_test() {
  let ground = Terrain([], [], [water])
  let inside = Vec3(350.0, 0.0, -200.0)
  assert terrain.in_pond(ground, inside)
  let out = terrain.push_out(ground, inside, 12.0)
  assert !terrain.in_pond(ground, out)
  assert vec3.ground_distance(out, water.center) >. water.radius +. 11.0
  // The water is level with the ground.
  assert terrain.height(ground, at: inside) == 0.0
}
