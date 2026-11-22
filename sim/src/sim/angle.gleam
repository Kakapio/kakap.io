import gleam/float
import gleam_community/maths

/// Wrap an angle into the range [-π, π].
pub fn wrap(angle: Float) -> Float {
  maths.atan2(maths.sin(angle), maths.cos(angle))
}

/// Turn from `current` toward `target` by at most `max_step` radians, the short way round.
pub fn turn_toward(current: Float, target: Float, max_step: Float) -> Float {
  current
  +. float.clamp(wrap(target -. current), min: 0.0 -. max_step, max: max_step)
}

/// Limit `angle` to within `limit` radians of `center`.
/// The `Bool` is `True` when the limit changed the angle.
pub fn clamp_around(
  angle: Float,
  center: Float,
  limit: Float,
) -> #(Float, Bool) {
  let offset = wrap(angle -. center)
  case offset >. limit, offset <. 0.0 -. limit {
    True, _ -> #(center +. limit, True)
    _, True -> #(center -. limit, True)
    _, _ -> #(center +. offset, False)
  }
}
