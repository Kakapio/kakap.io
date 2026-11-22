import gleam/float
import gleam_community/maths

pub type Vec {
  Vec(x: Float, y: Float)
}

pub fn add(a: Vec, b: Vec) -> Vec {
  Vec(a.x +. b.x, a.y +. b.y)
}

pub fn subtract(a: Vec, b: Vec) -> Vec {
  Vec(a.x -. b.x, a.y -. b.y)
}

pub fn scale(v: Vec, by factor: Float) -> Vec {
  Vec(v.x *. factor, v.y *. factor)
}

pub fn from_polar(angle: Float, length: Float) -> Vec {
  Vec(maths.cos(angle) *. length, maths.sin(angle) *. length)
}

pub fn angle(v: Vec) -> Float {
  maths.atan2(v.y, v.x)
}

/// The angle of the line from `from` to `to`, in radians.
pub fn direction(from: Vec, to: Vec) -> Float {
  angle(subtract(to, from))
}

pub fn length(v: Vec) -> Float {
  case float.square_root(v.x *. v.x +. v.y *. v.y) {
    Ok(length) -> length
    Error(Nil) -> 0.0
  }
}

pub fn distance(a: Vec, b: Vec) -> Float {
  length(subtract(b, a))
}

/// Move `from` toward `to` by at most `max_step`. Never overshoots.
pub fn move_toward(from: Vec, to: Vec, max_step: Float) -> Vec {
  let gap = distance(from, to)
  case gap <=. max_step {
    True -> to
    False -> add(from, scale(subtract(to, from), max_step /. gap))
  }
}
