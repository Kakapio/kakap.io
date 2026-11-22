import gleam/float
import gleam_community/maths

/// `y` is up. The ground is the plane `y = 0`.
pub type Vec3 {
  Vec3(x: Float, y: Float, z: Float)
}

pub const up = Vec3(0.0, 1.0, 0.0)

pub const zero = Vec3(0.0, 0.0, 0.0)

pub fn add(a: Vec3, b: Vec3) -> Vec3 {
  Vec3(a.x +. b.x, a.y +. b.y, a.z +. b.z)
}

pub fn subtract(a: Vec3, b: Vec3) -> Vec3 {
  Vec3(a.x -. b.x, a.y -. b.y, a.z -. b.z)
}

pub fn scale(v: Vec3, by factor: Float) -> Vec3 {
  Vec3(v.x *. factor, v.y *. factor, v.z *. factor)
}

pub fn dot(a: Vec3, b: Vec3) -> Float {
  a.x *. b.x +. a.y *. b.y +. a.z *. b.z
}

pub fn length(v: Vec3) -> Float {
  sqrt(dot(v, v))
}

pub fn distance(a: Vec3, b: Vec3) -> Float {
  length(subtract(b, a))
}

/// A vector of length 1 in the direction of `v`, or the zero vector when `v` is zero.
pub fn normalize(v: Vec3) -> Vec3 {
  case length(v) {
    0.0 -> v
    l -> scale(v, 1.0 /. l)
  }
}

pub fn lerp(a: Vec3, b: Vec3, t: Float) -> Vec3 {
  add(a, scale(subtract(b, a), t))
}

/// Move `from` toward `to` by at most `max_step`. Never overshoots.
pub fn move_toward(from: Vec3, to: Vec3, max_step: Float) -> Vec3 {
  let gap = distance(from, to)
  case gap <=. max_step {
    True -> to
    False -> add(from, scale(subtract(to, from), max_step /. gap))
  }
}

/// Drop `v` onto the ground plane.
pub fn flat(v: Vec3) -> Vec3 {
  Vec3(v.x, 0.0, v.z)
}

/// The distance between `a` and `b` measured along the ground.
pub fn ground_distance(a: Vec3, b: Vec3) -> Float {
  length(flat(subtract(b, a)))
}

/// The unit vector on the ground at `yaw` radians. Yaw 0 points along +x and
/// increases toward +z.
pub fn from_yaw(yaw: Float) -> Vec3 {
  Vec3(maths.cos(yaw), 0.0, maths.sin(yaw))
}

/// The yaw of `v` on the ground, in radians.
pub fn yaw(v: Vec3) -> Float {
  maths.atan2(v.z, v.x)
}

pub fn sqrt(x: Float) -> Float {
  case float.square_root(x) {
    Ok(root) -> root
    Error(Nil) -> 0.0
  }
}
