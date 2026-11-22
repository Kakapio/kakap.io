import gleam/float
import gleam/list
import sim/rabbits.{type Config, type Rabbit, Bounds, Config}
import sim/vec3.{type Vec3, Vec3}

fn config() -> Config {
  Config(
    walk_speed: 70.0,
    run_speed: 260.0,
    acceleration: 900.0,
    fear_radius: 360.0,
    contagion_radius: 150.0,
    spacing: 34.0,
    huddle_radius: 40.0,
    hop_height: 10.0,
    hop_rate: 9.0,
  )
}

const bounds = Bounds(-1000.0, 1000.0, -1000.0, 1000.0)

const dt = 0.016666666666666666

const far_away = Vec3(5000.0, 0.0, 5000.0)

fn run(herd: List(Rabbit), spider: Vec3, frames: Int) -> List(Rabbit) {
  case frames {
    0 -> herd
    _ ->
      run(
        rabbits.step(
          herd,
          from: spider,
          within: bounds,
          dt: dt,
          config: config(),
        ),
        spider,
        frames - 1,
      )
  }
}

fn spread_from_center(herd: List(Rabbit)) -> Float {
  let center = rabbits.centroid(herd)
  list.fold(herd, 0.0, fn(most, r) {
    float.max(most, vec3.ground_distance(r.position, center))
  })
}

fn scattered() -> List(Rabbit) {
  rabbits.herd(6, around: Vec3(0.0, 0.0, 0.0), spread: 500.0)
}

pub fn calm_rabbits_huddle_together_test() {
  let before = scattered()
  let after = run(before, far_away, 600)
  assert spread_from_center(after) <. 90.0
  assert spread_from_center(after) <. spread_from_center(before)
}

pub fn huddled_rabbits_keep_some_space_test() {
  let after = run(scattered(), far_away, 600)
  let pairs = list.combination_pairs(after)
  assert list.all(pairs, fn(pair) {
    vec3.ground_distance({ pair.0 }.position, { pair.1 }.position) >. 15.0
  })
}

pub fn an_approaching_spider_splits_the_huddle_test() {
  let huddle = run(scattered(), far_away, 600)
  let center = rabbits.centroid(huddle)
  let spider = vec3.add(center, Vec3(60.0, 0.0, 0.0))
  let after = run(huddle, spider, 90)
  assert spread_from_center(after) >. spread_from_center(huddle) *. 3.0
  assert list.all(after, fn(r) {
    vec3.ground_distance(r.position, spider) >. 120.0
  })
}

pub fn fear_spreads_to_nearby_rabbits_test() {
  let scared = rabbits.Rabbit(0, Vec3(0.0, 0.0, 0.0), vec3.zero, 0.0, 1.0, 0.0)
  let calm = rabbits.Rabbit(1, Vec3(100.0, 0.0, 0.0), vec3.zero, 0.0, 0.0, 0.0)
  let assert [_, after] = run([scared, calm], far_away, 1)
  assert rabbits.is_fleeing(after)
}

pub fn fear_fades_when_the_spider_leaves_test() {
  let huddle = run(scattered(), far_away, 600)
  let spider = rabbits.centroid(huddle)
  let scared = run(huddle, spider, 30)
  assert list.any(scared, rabbits.is_fleeing)
  let later = run(scared, far_away, 300)
  assert !list.any(later, rabbits.is_fleeing)
}

pub fn rabbits_stay_inside_the_bounds_test() {
  let tight = Bounds(-150.0, 150.0, -150.0, 150.0)
  let start = rabbits.herd(6, around: Vec3(0.0, 0.0, 0.0), spread: 60.0)
  let step = fn(herd) {
    rabbits.step(
      herd,
      from: Vec3(0.0, 0.0, 0.0),
      within: tight,
      dt: dt,
      config: config(),
    )
  }
  let after =
    list.fold(list.repeat(Nil, 300), start, fn(herd, _) { step(herd) })
  assert list.all(after, fn(r) {
    r.position.x >=. -150.0
    && r.position.x <=. 150.0
    && r.position.z >=. -150.0
    && r.position.z <=. 150.0
  })
}
