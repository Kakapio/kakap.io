import gleam/float
import gleam/int
import gleam/list
import gleam/option.{Some}
import gleam_community/maths
import sim/angle
import sim/chain.{type Joint, Joint}
import sim/vec.{type Vec, Vec}

/// Angles are in radians and times in seconds.
pub type Config {
  Config(
    segments: Int,
    segment_length: Float,
    max_bend: Float,
    speed: Float,
    turn_rate: Float,
    wiggle: Float,
  )
}

/// `heading` is the direction the fish steers. `facing` is the direction its
/// head points: the heading plus the swim wiggle. `phase` drives the wiggle.
/// The first joint is the head.
pub type Fish {
  Fish(heading: Float, facing: Float, phase: Float, joints: List(Joint))
}

pub fn new(
  at head: Vec,
  heading heading: Float,
  config config: Config,
) -> Fish {
  let back = heading +. maths.pi()
  let points =
    list.repeat(Nil, config.segments + 1)
    |> list.index_map(fn(_, i) {
      vec.add(
        head,
        vec.from_polar(back, int.to_float(i) *. config.segment_length),
      )
    })
  Fish(heading, heading, 0.0, chain.follow(points, Some(back), limits(config)))
}

pub fn head(fish: Fish) -> Vec {
  case fish.joints {
    [Joint(point, _), ..] -> point
    [] -> Vec(0.0, 0.0)
  }
}

/// Steer toward `target`, swim forward, and let the body follow the head.
/// The fish slows down as it gets close to the target.
pub fn swim(
  fish: Fish,
  toward target: Vec,
  dt dt: Float,
  config config: Config,
) -> Fish {
  let head = head(fish)
  let heading =
    angle.turn_toward(
      fish.heading,
      vec.direction(head, target),
      config.turn_rate *. dt,
    )
  let closeness = { vec.distance(head, target) -. 12.0 } /. 160.0
  let speed = config.speed *. float.clamp(closeness, min: 0.15, max: 1.0)
  let phase = fish.phase +. dt *. { 3.0 +. 9.0 *. speed /. 400.0 }
  let effort = 0.35 +. 0.65 *. speed /. config.speed
  let facing = heading +. config.wiggle *. 0.55 *. maths.sin(phase) *. effort
  let new_head = vec.add(head, vec.from_polar(facing, speed *. dt))

  let joints =
    [new_head, ..list.drop(chain.points(fish.joints), 1)]
    |> fit(config)
    |> chain.follow(Some(facing +. maths.pi()), limits(config))
  Fish(heading, facing, phase, joints)
}

/// Pin the tail at `root` and reach the head toward `target` with FABRIK.
pub fn reach(
  fish: Fish,
  toward target: Vec,
  root root: Vec,
  root_direction root_direction: Float,
  config config: Config,
) -> #(Fish, chain.Reach) {
  let result =
    chain.points(fish.joints)
    |> fit(config)
    |> chain.reach(
      target: target,
      root: root,
      root_direction: root_direction,
      limits: limits(config),
      max_iterations: 16,
      tolerance: 0.5,
    )
  let facing = case result.joints {
    [Joint(first, _), Joint(second, _), ..] -> vec.direction(second, first)
    _ -> fish.facing
  }
  #(Fish(facing, facing, fish.phase, result.joints), result)
}

pub fn length(config: Config) -> Float {
  int.to_float(config.segments) *. config.segment_length
}

fn limits(config: Config) -> chain.Limits {
  chain.Limits(config.segment_length, config.max_bend)
}

/// Trim or extend the points to `segments + 1`. New points continue
/// straight on from the last link.
fn fit(points: List(Vec), config: Config) -> List(Vec) {
  let wanted = config.segments + 1
  let have = list.length(points)
  case have >= wanted {
    True -> list.take(points, wanted)
    False -> {
      let reversed = list.reverse(points)
      let step = case reversed {
        [last, before, ..] ->
          vec.from_polar(vec.direction(before, last), config.segment_length)
        _ -> Vec(0.0 -. config.segment_length, 0.0)
      }
      grow(reversed, wanted - have, step) |> list.reverse
    }
  }
}

fn grow(reversed: List(Vec), missing: Int, step: Vec) -> List(Vec) {
  case missing, reversed {
    0, _ -> reversed
    _, [last, ..] -> grow([vec.add(last, step), ..reversed], missing - 1, step)
    _, [] -> grow([Vec(0.0, 0.0)], missing - 1, step)
  }
}
