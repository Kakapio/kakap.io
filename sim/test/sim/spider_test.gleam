import gleam/list
import sim/spider.{type Config, type Spider, Config, Planted}
import sim/terrain.{Terrain}
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

pub fn feet_land_on_top_of_rocks_test() {
  let ground =
    Terrain(
      [
        terrain.rock(Vec3(300.0, 0.0, 150.0), 80.0, 50.0),
        terrain.rock(Vec3(500.0, 0.0, -150.0), 70.0, 40.0),
      ],
      [],
      [],
    )
  let target = Vec3(1200.0, 0.0, 0.0)
  let check = fn(s: Spider) {
    list.all(s.legs, fn(leg) {
      case leg.step {
        Planted -> {
          let gap = leg.foot.y -. terrain.height(ground, at: leg.foot)
          gap <. 0.01 && gap >. -0.01
        }
        _ -> True
      }
    })
  }
  let #(_, ok, stood_on_rock) =
    list.fold(list.repeat(Nil, 400), #(start(), True, False), fn(acc, _) {
      let #(s, ok, seen) = acc
      let next =
        spider.walk_on(s, ground, toward: target, dt:, config: config())
      #(
        next,
        ok && check(next),
        seen || list.any(next.legs, fn(leg) { leg.foot.y >. 10.0 }),
      )
    })
  assert ok
  assert stood_on_rock
}

fn small() -> Config {
  Config(
    height: 55.0,
    body_radius: 10.0,
    upper: 75.0,
    lower: 85.0,
    tip: 18.0,
    stance: 95.0,
    step_distance: 32.0,
    step_time: 0.15,
    lift: 18.0,
    speed: 120.0,
    acceleration: 500.0,
    turn_rate: 3.5,
    keep_distance: 0.0,
  )
}

/// A small spider walks to `target` over a crevasse along the x axis. Returns
/// whether every frame kept the gait rules, and whether the body was ever
/// over the gap.
fn cross_crevasse(from: Vec3, target: Vec3, frames: Int) -> #(Bool, Bool) {
  let crack =
    terrain.Crevasse(
      Vec3(-400.0, 0.0, 0.0),
      Vec3(400.0, 0.0, 0.0),
      115.0,
      170.0,
      -1.0,
    )
  let ground = Terrain([], [crack], [])
  // Facing the target, so the walk has no sharp turn.
  let first =
    spider.new_on(ground, from, vec3.yaw(vec3.subtract(target, from)), small())
  let #(_, ok, over) =
    list.fold(list.repeat(Nil, frames), #(first, True, False), fn(acc, _) {
      let #(s, ok, over) = acc
      let next = spider.walk_on(s, ground, toward: target, dt:, config: small())
      let pose = spider.pose(next, small())
      let on_solid_ground =
        list.all(next.legs, fn(leg) {
          case leg.step {
            Planted -> terrain.height(ground, at: leg.foot) == 0.0
            spider.Swinging(_, to, _) -> terrain.height(ground, at: to) == 0.0
          }
        })
      let no_slide =
        list.zip(s.legs, next.legs)
        |> list.all(fn(pair) {
          case { pair.0 }.step, { pair.1 }.step {
            Planted, Planted -> { pair.0 }.foot == { pair.1 }.foot
            _, _ -> True
          }
        })
      let one_group =
        next.legs
        |> list.filter(spider.is_swinging)
        |> list.map(spider.group)
        |> list.unique
        |> list.length
        <= 1
      let in_reach = list.all(pose.legs, fn(leg) { !leg.stretched })
      let level = pose.body.y >=. 54.9
      #(
        next,
        ok && on_solid_ground && no_slide && one_group && in_reach && level,
        over || terrain.height(ground, at: next.position) <. -100.0,
      )
    })
  #(ok, over)
}

pub fn a_spider_straddles_a_crevasse_and_never_steps_in_it_test() {
  // Straight across, at a slant, and along the gap to stop over it.
  assert cross_crevasse(Vec3(0.0, 0.0, -250.0), Vec3(20.0, 0.0, 300.0), 420)
    == #(True, True)
  assert cross_crevasse(Vec3(-250.0, 0.0, -200.0), Vec3(250.0, 0.0, 200.0), 500)
    == #(True, True)
  assert cross_crevasse(Vec3(-200.0, 0.0, -150.0), Vec3(60.0, 0.0, 0.0), 500)
    == #(True, True)
}
