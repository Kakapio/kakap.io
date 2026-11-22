//// Smooth target paths for when nobody is pointing at the tank.

import gleam_community/maths
import sim/vec.{type Vec, Vec}

/// A looping path that covers most of a `width` × `height` area.
/// `time` is in seconds.
pub fn roam(time: Float, width: Float, height: Float) -> Vec {
  Vec(
    width
      /. 2.0
      +. maths.cos(time *. 0.21)
      *. width
      *. 0.32
      +. maths.sin(time *. 0.57)
      *. width
      *. 0.08,
    height
      /. 2.0
      +. maths.sin(time *. 0.33)
      *. height
      *. 0.28
      +. maths.cos(time *. 0.71)
      *. height
      *. 0.07,
  )
}

/// A figure-eight above `root`, sized to a chain of length `reach`.
/// At its far left and right ends the path is just out of reach.
pub fn sweep(time: Float, root: Vec, reach: Float) -> Vec {
  Vec(
    root.x +. maths.sin(time *. 0.6) *. reach *. 0.85,
    root.y -. reach *. 0.55 +. maths.sin(time *. 1.2) *. reach *. 0.35,
  )
}
