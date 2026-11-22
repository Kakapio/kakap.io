import gleam/list
import sim/spider.{type Config, type Spider, Config, Planted}
import sim/vec3.{type Vec3, Vec3}

fn config() -> Config {
  Config(
    height: 120.0,
    body_radius: 20.0,
    upper: 170.0,
    lower: 190.0,
    tip: 40.0,
    stance: 210.0,
    step_distance: 70.0,
    step_time: 0.22,
    lift: 40.0,
    speed: 140.0,
    acceleration: 400.0,
    turn_rate: 2.2,
    keep_distance: 140.0,
  )
}

const dt = 0.016666666666666666

/// Walk for `frames` frames, checking `ok(before, after)` on every frame.
fn walk_checking(
  spider: Spider,
  target: Vec3,
  frames: Int,
  ok: fn(Spider, Spider) -> Bool,
) -> #(Spider, Bool) {
  case frames {
    0 -> #(spider, True)
    _ -> {
      let next = spider.walk(spider, toward: target, dt: dt, config: config())
      case ok(spider, next) {
        True -> walk_checking(next, target, frames - 1, ok)
        False -> #(next, False)
      }
    }
  }
}

fn start() -> Spider {
  spider.new(at: Vec3(0.0, 0.0, 0.0), heading: 0.0, config: config())
}

/// A target behind the spider, so the walk includes a turn.
const behind = Vec3(-900.0, 0.0, 400.0)

pub fn planted_feet_never_slide_test() {
  let #(_, ok) =
    walk_checking(start(), behind, 600, fn(before, after) {
      list.zip(before.legs, after.legs)
      |> list.all(fn(pair) {
        let #(a, b) = pair
        case a.step, b.step {
          Planted, Planted -> a.foot == b.foot
          _, _ -> True
        }
      })
    })
  assert ok
}

pub fn only_one_leg_group_swings_at_a_time_test() {
  let #(_, ok) =
    walk_checking(start(), behind, 600, fn(_, after) {
      let groups =
        after.legs
        |> list.filter(spider.is_swinging)
        |> list.map(spider.group)
        |> list.unique
      list.length(groups) <= 1
    })
  assert ok
}

pub fn legs_stay_in_reach_while_walking_test() {
  let #(_, ok) =
    walk_checking(start(), behind, 600, fn(_, after) {
      spider.pose(after, config()).legs
      |> list.all(fn(leg) { !leg.stretched })
    })
  assert ok
}

pub fn the_spider_stops_short_of_its_target_test() {
  let target = Vec3(700.0, 0.0, 300.0)
  let #(done, _) = walk_checking(start(), target, 1200, fn(_, _) { True })
  let gap = vec3.ground_distance(done.position, target)
  assert gap >. 130.0
  assert gap <. 160.0
  assert done.speed <. 1.0
}

pub fn a_stopped_spider_settles_its_feet_test() {
  let target = Vec3(700.0, 0.0, 300.0)
  let #(done, _) = walk_checking(start(), target, 1500, fn(_, _) { True })
  assert list.all(done.legs, fn(leg) { leg.step == Planted })
  assert spider.pose(done, config()).legs
    |> list.all(fn(leg) { vec3.ground_distance(leg.foot, leg.home) <. 7.5 })
}
