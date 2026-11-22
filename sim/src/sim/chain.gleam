//// A chain of points joined by fixed-length links, solved with the
//// constraint passes from FABRIK (Forward And Backward Reaching Inverse
//// Kinematics), plus a limit on how far each link can bend from the one
//// before it.

import gleam/list
import gleam/option.{type Option, None, Some}
import sim/angle
import sim/vec.{type Vec}

pub type Limits {
  /// `max_bend` is in radians.
  Limits(segment_length: Float, max_bend: Float)
}

/// The bend limit a joint puts on the next joint in the pass.
pub type Cone {
  /// The next joint can be anywhere `segment_length` away, or there is no next joint.
  NoCone
  /// The next joint lies on the arc within `max_bend` of `center`.
  /// `clamped` is `True` when the limit moved it.
  Cone(center: Float, clamped: Bool)
}

pub type Joint {
  Joint(point: Vec, cone: Cone)
}

pub type Reach {
  /// `error` is the distance from the first joint to the target.
  Reach(joints: List(Joint), iterations: Int, error: Float)
}

pub fn points(joints: List(Joint)) -> List(Vec) {
  list.map(joints, fn(joint) { joint.point })
}

/// Keep the first point fixed and pull every later point toward the point
/// before it, so that each link is `segment_length` long and turns at most
/// `max_bend` from the link before it. `lead` is the direction the first link
/// is measured against; `None` leaves the first link free.
pub fn follow(
  points: List(Vec),
  lead: Option(Float),
  limits: Limits,
) -> List(Joint) {
  case points {
    [] -> []
    [first, ..rest] -> place(first, lead, rest, limits, [])
  }
}

fn place(
  anchor: Vec,
  cone_center: Option(Float),
  rest: List(Vec),
  limits: Limits,
  placed: List(Joint),
) -> List(Joint) {
  case rest {
    [] -> list.reverse([Joint(anchor, NoCone), ..placed])
    [next, ..tail] -> {
      let wanted = vec.direction(anchor, next)
      let #(heading, cone) = case cone_center {
        None -> #(wanted, NoCone)
        Some(center) -> {
          let #(heading, clamped) =
            angle.clamp_around(wanted, center, limits.max_bend)
          #(heading, Cone(center, clamped))
        }
      }
      let next = vec.add(anchor, vec.from_polar(heading, limits.segment_length))
      place(next, Some(heading), tail, limits, [Joint(anchor, cone), ..placed])
    }
  }
}

/// Solve the chain with full FABRIK. The last point stays at `root` and the
/// first point moves as close to `target` as the chain allows. The root link
/// bends at most `max_bend` from `root_direction`. Stops when the first point
/// is within `tolerance` of `target`, or after `max_iterations` passes.
///
/// The joints come back first-point-first. Each joint's cone describes the
/// limit it put on its neighbour toward the first point.
pub fn reach(
  points: List(Vec),
  target target: Vec,
  root root: Vec,
  root_direction root_direction: Float,
  limits limits: Limits,
  max_iterations max_iterations: Int,
  tolerance tolerance: Float,
) -> Reach {
  iterate(
    points,
    target,
    root,
    root_direction,
    limits,
    max_iterations,
    tolerance,
    1,
  )
}

fn iterate(
  current: List(Vec),
  target: Vec,
  root: Vec,
  root_direction: Float,
  limits: Limits,
  max_iterations: Int,
  tolerance: Float,
  iteration: Int,
) -> Reach {
  let joints =
    current
    |> replace_first(target)
    |> follow(None, limits)
    |> points
    |> list.reverse
    |> replace_first(root)
    |> follow(Some(root_direction), limits)
    |> list.reverse

  let error = case joints {
    [Joint(first, _), ..] -> vec.distance(first, target)
    [] -> 0.0
  }

  case error <=. tolerance || iteration >= max_iterations {
    True -> Reach(joints, iteration, error)
    False ->
      iterate(
        points(joints),
        target,
        root,
        root_direction,
        limits,
        max_iterations,
        tolerance,
        iteration + 1,
      )
  }
}

fn replace_first(items: List(a), with item: a) -> List(a) {
  case items {
    [] -> []
    [_, ..rest] -> [item, ..rest]
  }
}
