//// A school of koi in a pond. Each fish swims between spots of its
//// own in the water. A fish darts away from anything that touches the water
//// near it, such as a spider's foot, and calms down once it is gone.

import gleam/float
import gleam/int
import gleam/list
import gleam_community/maths
import sim/fish.{type Fish}
import sim/terrain.{type Pond}
import sim/vec.{type Vec, Vec}
import sim/vec3.{type Vec3, Vec3}
import sim/wander

/// `scare` runs from 0 (calm) to 1 (darting away).
pub type Koi {
  Koi(id: Int, body: Fish, scare: Float)
}

/// The length of a fish, in world units.
pub const length = 48.0

const segments = 5

/// A calm fish swims at up to this speed.
const cruise = 70.0

/// A scared fish swims this many times faster.
const dart = 3.4

/// A fish is scared by anything in the water this close to its head.
const shy = 85.0

/// Scare lost per second once nothing is near.
const calm_down = 0.55

/// Fish steer apart when their heads are closer than this.
const room = 45.0

/// Seconds a fish spends on each spot.
const spot_time = 4.5

/// Fish keep their heads inside this share of the pond's radius.
const reach = 0.8

fn config(scare: Float) -> fish.Config {
  fish.Config(
    segments:,
    segment_length: length /. int.to_float(segments),
    max_bend: 0.38,
    speed: cruise *. { 1.0 +. { dart -. 1.0 } *. scare },
    turn_rate: 3.5 +. 4.5 *. scare,
    wiggle: 0.5,
  )
}

/// `count` fish spread around the pond, each on a different heading.
pub fn stock(pond: Pond, count: Int) -> List(Koi) {
  list.repeat(Nil, count)
  |> list.index_map(fn(_, i) {
    let turn = 2.0 *. maths.pi() *. int.to_float(i) /. int.to_float(count)
    let at =
      vec.add(on_water(pond.center), vec.from_polar(turn, pond.radius *. 0.45))
    Koi(i, fish.new(at:, heading: turn +. 1.8, config: config(0.0)), 0.0)
  })
}

/// Move every fish one frame. `touches` are the points where something is in
/// or on the water, anywhere in the world. `time` is in seconds.
pub fn step(
  school: List(Koi),
  in pond: Pond,
  away_from touches: List(Vec3),
  time time: Float,
  dt dt: Float,
) -> List(Koi) {
  let center = on_water(pond.center)
  let wet =
    touches
    |> list.map(on_water)
    |> list.filter(fn(t) { vec.distance(t, center) <. pond.radius })
  list.map(school, fn(koi) {
    let head = fish.head(koi.body)
    let nearest =
      list.fold(wet, Error(Nil), fn(best, t) {
        case best {
          Ok(b) ->
            case vec.distance(b, head) <=. vec.distance(t, head) {
              True -> best
              False -> Ok(t)
            }
          Error(Nil) -> Ok(t)
        }
      })
    let threat = case nearest {
      Ok(t) ->
        case vec.distance(t, head) <. shy {
          True -> Ok(t)
          False -> Error(Nil)
        }
      Error(Nil) -> Error(Nil)
    }
    let scare = case threat {
      Ok(_) -> 1.0
      Error(Nil) -> float.max(0.0, koi.scare -. dt *. calm_down)
    }
    let limit = pond.radius *. reach
    let wanted = case threat {
      Ok(t) -> {
        let flee = vec.add(head, vec.from_polar(vec.direction(t, head), shy))
        case vec.distance(flee, center) >. limit {
          False -> flee
          // At the bank the fish swims along it, around and away from the
          // touch, so that it does not spin on the spot.
          True -> {
            let bearing = vec.direction(center, head)
            let side = case
              maths.sin(bearing -. vec.direction(center, t)) >=. 0.0
            {
              True -> 1.0
              False -> -1.0
            }
            vec.add(center, vec.from_polar(bearing +. side *. 0.9, limit))
          }
        }
      }
      // A calm fish still keeps its distance from a touch.
      Error(Nil) ->
        case nearest {
          Ok(t) -> clear_of(spot(koi.id, pond, time), t)
          Error(Nil) -> spot(koi.id, pond, time)
        }
    }
    // Fish steer off each other, so the school does not swim in a heap.
    let apart =
      list.fold(school, Vec(0.0, 0.0), fn(push, other) {
        let gap = vec.distance(fish.head(other.body), head)
        case other.id != koi.id && gap <. room {
          True ->
            vec.add(
              push,
              vec.from_polar(
                vec.direction(fish.head(other.body), head),
                room -. gap,
              ),
            )
          False -> push
        }
      })
    // A scared fish only flees. Steering apart could send it past the touch.
    let spaced = case threat, nearest {
      Ok(_), _ -> wanted
      Error(Nil), Ok(t) -> clear_of(vec.add(wanted, apart), t)
      Error(Nil), Error(Nil) -> vec.add(wanted, apart)
    }
    let target = keep_in(spaced, center, limit)
    Koi(
      ..koi,
      body: fish.swim(koi.body, toward: target, dt:, config: config(scare)),
      scare:,
    )
  })
}

/// The points along a fish's back on the water, from head to tail.
pub fn spine(koi: Koi) -> List(Vec3) {
  list.map(koi.body.joints, fn(joint) {
    Vec3(joint.point.x, 0.0, joint.point.y)
  })
}

/// The spot fish `id` swims to at `time`. Each fish changes spots at its own
/// moment.
fn spot(id: Int, pond: Pond, time: Float) -> Vec {
  let own = int.to_float(id) *. 1.7
  let turn = float.truncate({ time +. own } /. spot_time)
  let Vec(u, v) = wander.waypoint(id * 101 + turn)
  // The square root spreads the spots evenly over the disc.
  vec.add(
    on_water(pond.center),
    vec.from_polar(
      2.0 *. maths.pi() *. v,
      pond.radius *. reach *. 0.9 *. vec3.sqrt(u),
    ),
  )
}

/// `p`, or the closest point to it that is well outside the shy range of
/// the touch at `touch`.
fn clear_of(p: Vec, touch: Vec) -> Vec {
  let room = shy *. 1.3
  case vec.distance(p, touch) <. room {
    True -> vec.add(touch, vec.from_polar(vec.direction(touch, p), room))
    False -> p
  }
}

/// `p`, or the closest point to it within `radius` of `center`.
fn keep_in(p: Vec, center: Vec, radius: Float) -> Vec {
  case vec.distance(p, center) >. radius {
    True -> vec.add(center, vec.from_polar(vec.direction(center, p), radius))
    False -> p
  }
}

/// A ground point as a point on the water: x stays x, and z becomes y.
fn on_water(p: Vec3) -> Vec {
  Vec(p.x, p.z)
}
