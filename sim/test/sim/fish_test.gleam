import gleam/float
import gleam/list
import gleam_community/maths
import sim/chain
import sim/fish.{type Config, Config}
import sim/vec.{Vec}

fn config() -> Config {
  Config(
    segments: 12,
    segment_length: 14.0,
    max_bend: 25.0 *. maths.pi() /. 180.0,
    speed: 180.0,
    turn_rate: 240.0 *. maths.pi() /. 180.0,
    wiggle: 0.45,
  )
}

fn swim_for(fish: fish.Fish, steps: Int, target: vec.Vec) -> fish.Fish {
  case steps {
    0 -> fish
    _ ->
      swim_for(
        fish.swim(fish, toward: target, dt: 1.0 /. 60.0, config: config()),
        steps - 1,
        target,
      )
  }
}

pub fn new_fish_has_one_joint_per_segment_end_test() {
  let fish = fish.new(at: Vec(0.0, 0.0), heading: 0.0, config: config())
  assert list.length(fish.joints) == 13
}

pub fn swimming_moves_the_head_closer_to_the_target_test() {
  let target = Vec(400.0, 300.0)
  let start = fish.new(at: Vec(0.0, 0.0), heading: 0.0, config: config())
  let later = swim_for(start, 60, target)
  assert vec.distance(fish.head(later), target)
    <. vec.distance(fish.head(start), target)
}

pub fn swimming_keeps_the_body_length_test() {
  let later =
    fish.new(at: Vec(0.0, 0.0), heading: 0.0, config: config())
    |> swim_for(90, Vec(-200.0, 150.0))
  let lengths =
    later.joints
    |> chain.points
    |> list.window_by_2
    |> list.map(fn(pair) { vec.distance(pair.0, pair.1) })
  assert list.all(lengths, fn(l) {
    float.loosely_equals(l, 14.0, tolerating: 0.000001)
  })
}

pub fn swimming_follows_a_changed_segment_count_test() {
  let longer = Config(..config(), segments: 20)
  let fish =
    fish.new(at: Vec(0.0, 0.0), heading: 0.0, config: config())
    |> fish.swim(toward: Vec(100.0, 0.0), dt: 1.0 /. 60.0, config: longer)
  assert list.length(fish.joints) == 21
}
