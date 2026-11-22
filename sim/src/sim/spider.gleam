//// A tall eight-legged walker. The body steers toward a target. Each leg keeps
//// its foot planted until the foot drifts too far from its rest spot, then
//// swings it to a new spot ahead. The legs form two alternating groups, and
//// only one group swings at a time.

import gleam/float
import gleam/int
import gleam/list
import gleam/result
import gleam_community/maths
import sim/angle
import sim/terrain.{type Terrain}
import sim/two_bone
import sim/vec3.{type Vec3, Vec3}

/// Lengths are in world units, times in seconds, angles in radians.
pub type Config {
  Config(
    height: Float,
    body_radius: Float,
    upper: Float,
    lower: Float,
    tip: Float,
    stance: Float,
    step_distance: Float,
    step_time: Float,
    lift: Float,
    speed: Float,
    acceleration: Float,
    turn_rate: Float,
    keep_distance: Float,
  )
}

pub type Side {
  Left
  Right
}

pub type Step {
  Planted
  /// `from` is where the foot took off and `to` is where it will land.
  Swinging(from: Vec3, to: Vec3, progress: Float)
}

/// `index` runs from 0 (front) to 3 (back).
pub type Leg {
  Leg(side: Side, index: Int, foot: Vec3, step: Step)
}

/// `position` is the point on the ground plane under the body. `heading` is
/// the yaw the body faces. `speed` is the forward ground speed.
pub type Spider {
  Spider(position: Vec3, heading: Float, speed: Float, legs: List(Leg))
}

/// One leg's joints in world space, from the hip on the body to the foot.
pub type LegPose {
  LegPose(
    side: Side,
    index: Int,
    group: Int,
    hip: Vec3,
    knee: Vec3,
    ankle: Vec3,
    foot: Vec3,
    home: Vec3,
    swinging: Bool,
    stretched: Bool,
  )
}

/// `pitch` tilts the nose up and `roll` tilts the right side up, in radians.
pub type Pose {
  Pose(
    body: Vec3,
    heading: Float,
    pitch: Float,
    roll: Float,
    legs: List(LegPose),
  )
}

pub fn new(
  at position: Vec3,
  heading heading: Float,
  config config: Config,
) -> Spider {
  new_on(terrain.flat, position, heading, config)
}

/// The same as `new`, with each foot placed on the ground surface.
pub fn new_on(
  ground: Terrain,
  position: Vec3,
  heading: Float,
  config: Config,
) -> Spider {
  let position = vec3.flat(position)
  let legs =
    list.flat_map([Left, Right], fn(side) {
      list.map([0, 1, 2, 3], fn(index) {
        let spot = home(position, heading, side, index, config)
        let foot = terrain.foothold(ground, spot, toward: spot)
        Leg(side, index, foot, Planted)
      })
    })
  Spider(position, heading, 0.0, legs)
}

/// Turn toward `target`, walk, and move the legs. The spider slows down and
/// stops `keep_distance` from the target, and keeps turning to face it.
pub fn walk(
  spider: Spider,
  toward target: Vec3,
  dt dt: Float,
  config config: Config,
) -> Spider {
  walk_on(spider, terrain.flat, toward: target, dt:, config:)
}

/// The same as `walk`, on uneven `ground`. Feet land on the ground surface,
/// and on the rims of a crevasse, never inside it.
pub fn walk_on(
  spider: Spider,
  ground: Terrain,
  toward target: Vec3,
  dt dt: Float,
  config config: Config,
) -> Spider {
  let to_target = vec3.flat(vec3.subtract(target, spider.position))
  let distance = vec3.length(to_target)
  let wanted = case distance >. 0.001 {
    True -> vec3.yaw(to_target)
    False -> spider.heading
  }
  let heading =
    angle.turn_toward(spider.heading, wanted, config.turn_rate *. dt)
  let facing = float.max(0.0, maths.cos(angle.wrap(wanted -. heading)))
  let approach =
    float.clamp(
      { distance -. config.keep_distance } /. 120.0,
      min: 0.0,
      max: 1.0,
    )
  let speed =
    move_toward(
      spider.speed,
      config.speed *. approach *. facing,
      config.acceleration *. dt,
    )
  let velocity = vec3.scale(vec3.from_yaw(heading), speed)
  let position = vec3.add(spider.position, vec3.scale(velocity, dt))

  let legs =
    spider.legs
    |> list.map(swing(_, ground, position, heading, velocity, dt, config))
    |> start_steps(ground, position, heading, velocity, speed, config)
  Spider(position, heading, speed, legs)
}

/// The joint positions for drawing. The body rises a little while legs swing,
/// and it follows the ground under its feet: it rises over rocks, and tilts
/// when the front, back, left or right feet stand higher.
pub fn pose(spider: Spider, config: Config) -> Pose {
  let swing_lift =
    list.fold(spider.legs, 0.0, fn(total, leg) {
      case leg.step {
        Swinging(_, _, progress) -> total +. maths.sin(maths.pi() *. progress)
        Planted -> total
      }
    })
  let ground_under = fn(keep: fn(Leg) -> Bool) {
    let legs = list.filter(spider.legs, keep)
    case legs {
      [] -> 0.0
      _ ->
        list.fold(legs, 0.0, fn(total, leg) { total +. base(leg) })
        /. int.to_float(list.length(legs))
    }
  }
  let level = ground_under(fn(_) { True })
  let front = ground_under(fn(leg) { leg.index < 2 })
  let back = ground_under(fn(leg) { leg.index >= 2 })
  let left = ground_under(fn(leg) { leg.side == Left })
  let right = ground_under(fn(leg) { leg.side == Right })
  // The tilt is twice what the feet give, so it reads at this size.
  let pitch = 2.0 *. maths.atan2(front -. back, 1.17 *. config.stance)
  let roll = 2.0 *. maths.atan2(right -. left, 1.44 *. config.stance)
  let height =
    level +. config.height +. config.lift *. 0.25 *. swing_lift /. 8.0
  let body = vec3.add(spider.position, Vec3(0.0, height, 0.0))
  let forward = vec3.from_yaw(spider.heading)
  let across = vec3.from_yaw(spider.heading +. maths.pi() /. 2.0)
  let tilt = fn(offset: Vec3) {
    vec3.dot(offset, forward)
    *. maths.sin(pitch)
    +. vec3.dot(offset, across)
    *. maths.sin(roll)
  }

  let legs =
    list.map(spider.legs, fn(leg) {
      let flat_hip =
        around(
          spider.position,
          spider.heading,
          leg.side,
          hip_angle(leg.index),
          config.body_radius,
        )
      let hip =
        vec3.add(
          flat_hip,
          Vec3(
            0.0,
            height +. tilt(vec3.subtract(flat_hip, spider.position)),
            0.0,
          ),
        )
      let outward =
        vec3.normalize(vec3.flat(vec3.subtract(leg.foot, spider.position)))
      let ankle =
        leg.foot
        |> vec3.add(Vec3(0.0, config.tip, 0.0))
        |> vec3.add(vec3.scale(outward, 0.0 -. config.tip *. 0.3))
      let bend =
        two_bone.solve(
          root: hip,
          target: ankle,
          upper: config.upper,
          lower: config.lower,
          bend_toward: vec3.add(vec3.up, vec3.scale(outward, 0.6)),
        )
      LegPose(
        side: leg.side,
        index: leg.index,
        group: group(leg),
        hip: hip,
        knee: bend.knee,
        ankle: bend.end,
        foot: leg.foot,
        home: home(spider.position, spider.heading, leg.side, leg.index, config),
        swinging: is_swinging(leg),
        stretched: bend.stretched,
      )
    })
  Pose(body, spider.heading, pitch, roll, legs)
}

/// The height of the ground the foot stands on, or is stepping across.
fn base(leg: Leg) -> Float {
  case leg.step {
    Planted -> leg.foot.y
    Swinging(from, to, progress) ->
      from.y +. { to.y -. from.y } *. ease(progress)
  }
}

/// Legs alternate between two groups: left 0, right 1, left 2, right 3 in
/// group 0, and the mirror image in group 1.
pub fn group(leg: Leg) -> Int {
  case leg.side {
    Left -> leg.index % 2
    Right -> { leg.index + 1 } % 2
  }
}

pub fn is_swinging(leg: Leg) -> Bool {
  case leg.step {
    Swinging(..) -> True
    Planted -> False
  }
}

fn swing(
  leg: Leg,
  ground: Terrain,
  position: Vec3,
  heading: Float,
  velocity: Vec3,
  dt: Float,
  config: Config,
) -> Leg {
  case leg.step {
    Planted -> leg
    Swinging(from, planned, progress) -> {
      // The foot keeps to the side of a crevasse that it set off for.
      let wanted = landing(leg, position, heading, velocity, config)
      let to = terrain.foothold(ground, wanted, toward: planned)
      let progress = progress +. dt /. config.step_time
      case progress >=. 1.0 {
        True -> Leg(..leg, foot: to, step: Planted)
        False ->
          Leg(
            ..leg,
            foot: arc(from, to, progress, config.lift),
            step: Swinging(from, to, progress),
          )
      }
    }
  }
}

fn start_steps(
  legs: List(Leg),
  ground: Terrain,
  position: Vec3,
  heading: Float,
  velocity: Vec3,
  speed: Float,
  config: Config,
) -> List(Leg) {
  // A rest spot over a crevasse counts as the foothold beside it, so a foot
  // that stands on the rim is not seen as out of place.
  let rest = fn(leg: Leg) {
    home(position, heading, leg.side, leg.index, config)
  }
  // A foot over a crevasse goes to the rim ahead, on the side where its rest
  // spot will be a little later. This keeps the trailing feet in reach.
  let ahead = fn(leg: Leg) {
    vec3.add(rest(leg), vec3.scale(velocity, look_ahead))
  }
  let hold = fn(leg: Leg) {
    terrain.foothold(ground, rest(leg), toward: ahead(leg))
  }
  let drift = fn(leg: Leg) { vec3.ground_distance(leg.foot, hold(leg)) }
  let lift_off = fn(leg: Leg) {
    let wanted = landing(leg, position, heading, velocity, config)
    Leg(
      ..leg,
      step: Swinging(
        leg.foot,
        terrain.foothold(ground, wanted, toward: ahead(leg)),
        0.0,
      ),
    )
  }
  // A stopped spider still tidies its feet, with a much smaller threshold.
  let threshold = case speed >. 1.0 {
    True -> config.step_distance
    False -> config.step_distance *. 0.1
  }

  case list.find(legs, is_swinging) |> result.map(group) {
    Ok(_) ->
      list.map(legs, fn(leg) {
        // A foot left far behind steps out of turn. A foot whose rest spot
        // is over a crevasse waits for its turn: its foothold can jump from
        // one rim to the other.
        case
          !is_swinging(leg)
          && drift(leg) >. config.step_distance *. 2.0
          && hold(leg) == rest(leg)
        {
          True -> lift_off(leg)
          False -> leg
        }
      })
    Error(Nil) -> {
      let group_drift = fn(g) {
        list.fold(legs, 0.0, fn(total, leg) {
          case group(leg) == g && drift(leg) >. threshold {
            True -> total +. drift(leg)
            False -> total
          }
        })
      }
      let drift_0 = group_drift(0)
      let drift_1 = group_drift(1)
      case drift_0 >. 0.0 || drift_1 >. 0.0 {
        False -> legs
        True -> {
          let chosen = case drift_0 >=. drift_1 {
            True -> 0
            False -> 1
          }
          list.map(legs, fn(leg) {
            case group(leg) == chosen && drift(leg) >. threshold *. 0.3 {
              True -> lift_off(leg)
              False -> leg
            }
          })
        }
      }
    }
  }
}

/// How far ahead in time a foot looks to choose a side of a crevasse, in
/// seconds.
const look_ahead = 0.25

/// Where a swinging foot wants to land: its rest spot, moved ahead by one
/// step's worth of travel so it lands in front and has room to drift back.
/// The terrain then finds solid ground at or near this spot.
fn landing(
  leg: Leg,
  position: Vec3,
  heading: Float,
  velocity: Vec3,
  config: Config,
) -> Vec3 {
  vec3.add(
    home(position, heading, leg.side, leg.index, config),
    vec3.scale(velocity, config.step_time),
  )
}

fn arc(from: Vec3, to: Vec3, progress: Float, lift: Float) -> Vec3 {
  vec3.add(
    vec3.lerp(from, to, ease(progress)),
    Vec3(0.0, lift *. maths.sin(maths.pi() *. progress), 0.0),
  )
}

fn home(
  position: Vec3,
  heading: Float,
  side: Side,
  index: Int,
  config: Config,
) -> Vec3 {
  around(
    position,
    heading,
    side,
    foot_angle(index),
    config.stance *. foot_reach(index),
  )
}

/// The point `distance` from `center` on the ground, turned `angle` from
/// `heading` toward `side`.
fn around(
  center: Vec3,
  heading: Float,
  side: Side,
  angle: Float,
  distance: Float,
) -> Vec3 {
  let sign = case side {
    Left -> -1.0
    Right -> 1.0
  }
  vec3.add(
    center,
    vec3.scale(vec3.from_yaw(heading +. sign *. angle), distance),
  )
}

fn hip_angle(index: Int) -> Float {
  case index {
    0 -> 0.9
    1 -> 1.35
    2 -> 1.8
    _ -> 2.3
  }
}

fn foot_angle(index: Int) -> Float {
  case index {
    0 -> 0.6
    1 -> 1.25
    2 -> 1.95
    _ -> 2.55
  }
}

fn foot_reach(index: Int) -> Float {
  case index {
    0 -> 1.05
    1 -> 0.92
    2 -> 0.92
    _ -> 1.0
  }
}

fn ease(progress: Float) -> Float {
  progress *. progress *. { 3.0 -. 2.0 *. progress }
}

fn move_toward(current: Float, target: Float, max_step: Float) -> Float {
  current +. float.clamp(target -. current, min: 0.0 -. max_step, max: max_step)
}
