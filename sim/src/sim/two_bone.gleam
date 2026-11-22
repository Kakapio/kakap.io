//// Analytic two-bone inverse kinematics: a root, a knee and an end joined by
//// two segments of fixed length.

import gleam/float
import sim/vec3.{type Vec3}

pub type Bend {
  /// `stretched` is `True` when the target was out of reach.
  Bend(knee: Vec3, end: Vec3, stretched: Bool)
}

/// Bend a limb of segment lengths `upper` and `lower` from `root` toward
/// `target`. The knee bends toward the direction `bend_toward`. When the target
/// is too far, the limb points straight at it. When the target is too close,
/// the end stops at the shortest span the limb can fold to.
pub fn solve(
  root root: Vec3,
  target target: Vec3,
  upper upper: Float,
  lower lower: Float,
  bend_toward bend_toward: Vec3,
) -> Bend {
  let offset = vec3.subtract(target, root)
  let distance = vec3.length(offset)
  let reach = upper +. lower
  let span =
    float.clamp(distance, min: float.absolute_value(upper -. lower), max: reach)
  let axis = case distance >. 0.0 {
    True -> vec3.scale(offset, 1.0 /. distance)
    False -> vec3.normalize(bend_toward)
  }
  let along =
    { upper *. upper -. lower *. lower +. span *. span } /. { 2.0 *. span }
  let rise = vec3.sqrt(float.max(0.0, upper *. upper -. along *. along))
  let side =
    vec3.normalize(vec3.subtract(
      bend_toward,
      vec3.scale(axis, vec3.dot(bend_toward, axis)),
    ))
  let knee =
    root
    |> vec3.add(vec3.scale(axis, along))
    |> vec3.add(vec3.scale(side, rise))
  Bend(knee, vec3.add(root, vec3.scale(axis, span)), distance >. reach)
}
