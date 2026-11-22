//// Raised ground: rocks and hills. A rock is the top half of an ellipsoid: a
//// circle of `radius` on the ground, `height` tall at its center. A rock can
//// have its near side (toward -z) sliced off by a vertical wall `cut` from its
//// center.
////
//// A hill is a mound with a gentle ripple. Its sides and back meet the ground
//// with no edge. Its near side is steep and rounded, and a wall that leans
//// back slices it, like the front of a hobbit hole. The ground in front of
//// the wall is flat.

import gleam/float
import gleam/int
import gleam/list
import gleam_community/maths
import sim/vec3.{type Vec3, Vec3}

pub type Rock {
  Rock(center: Vec3, radius: Float, height: Float, cut: Float)
  /// `radius` is how far the hill reaches behind its center. The wall stands `cut` in front of the
  /// center at ground level, and leans back by `lean` radians from vertical.
  Hill(center: Vec3, radius: Float, height: Float, cut: Float, lean: Float)
}

/// A whole rock, with no wall.
pub fn rock(center: Vec3, radius: Float, height: Float) -> Rock {
  Rock(center, radius, height, radius)
}

pub type Terrain {
  Terrain(rocks: List(Rock))
}

pub const flat = Terrain([])

/// Rocks on a jittered grid of `cell`-wide squares that covers the rectangle.
/// About half the cells get a rock. The same inputs give the same rocks.
pub fn scatter(
  min_x min_x: Float,
  max_x max_x: Float,
  min_z min_z: Float,
  max_z max_z: Float,
  cell cell: Float,
) -> Terrain {
  let columns = cells(min_x, max_x, cell)
  let rows = cells(min_z, max_z, cell)
  let rocks =
    list.flat_map(columns, fn(i) {
      list.filter_map(rows, fn(j) {
        let r = fn(k) { hash(i, j, k) }
        case r(0) <. 0.5 {
          False -> Error(Nil)
          True -> {
            let radius = 26.0 +. 34.0 *. r(3)
            Ok(rock(
              Vec3(
                { int.to_float(i) +. 0.2 +. 0.6 *. r(1) } *. cell,
                0.0,
                { int.to_float(j) +. 0.2 +. 0.6 *. r(2) } *. cell,
              ),
              radius,
              radius *. { 0.5 +. 0.3 *. r(4) },
            ))
          }
        }
      })
    })
  Terrain(rocks)
}

/// The height of the ground surface at `p`, ignoring `p.y`.
pub fn height(terrain: Terrain, at p: Vec3) -> Float {
  list.fold(terrain.rocks, 0.0, fn(top, rock) {
    float.max(top, rock_height(rock, p))
  })
}

/// The height of one rock or hill at `p`, with its wall dug out.
pub fn rock_height(rock: Rock, p: Vec3) -> Float {
  let wall = rock.center.z -. rock.cut
  case rock {
    Rock(..) ->
      case p.z >=. wall {
        True -> surface(rock, p)
        False -> 0.0
      }
    Hill(lean:, ..) ->
      case p.z >=. wall {
        True -> float.min(surface(rock, p), { p.z -. wall } /. maths.tan(lean))
        False -> 0.0
      }
  }
}

/// The height of one rock or hill at `p` as if it had no wall.
pub fn surface(rock: Rock, p: Vec3) -> Float {
  case rock {
    Rock(..) -> {
      let d = vec3.ground_distance(p, rock.center) /. rock.radius
      case d <. 1.0 {
        True -> rock.height *. vec3.sqrt(1.0 -. d *. d)
        False -> 0.0
      }
    }
    Hill(center:, radius:, height:, ..) -> {
      // Offsets from the summit, which sits behind the center.
      let dx = p.x -. center.x
      let dz = p.z -. { center.z +. radius *. summit_back }
      // 1 toward the wall, 0 to the sides and the back.
      let r = vec3.length(Vec3(dx, 0.0, dz))
      let front = case r >. 0.001 {
        True -> smooth({ 0.0 -. dz /. r -. 0.2 } /. 0.5)
        False -> 1.0
      }
      let deep = case dz <. 0.0 {
        True -> radius *. front_reach
        False -> radius *. { 1.0 -. summit_back }
      }
      let wide =
        radius *. { side_reach +. { nose_reach -. side_reach } *. front }
      let x = float.absolute_value(dx) /. wide
      let z = dz /. deep
      // Across the nose the profile is squarer than an ellipse, so the wall's
      // top edge has full shoulders.
      let assert Ok(across) = float.power(x, 2.0 +. 0.6 *. front)
      let q = 1.0 -. across -. z *. z
      case q >. 0.0 {
        False -> 0.0
        True -> {
          // A low exponent gives a steep, rounded foot. A high one gives a
          // foot that meets the ground with no edge.
          let exponent =
            back_exponent +. { front_exponent -. back_exponent } *. front
          let assert Ok(shape) = float.power(q, exponent)
          // The ripple is weak toward the wall, so the wall's top edge stays round.
          let ripple =
            0.05
            *. maths.sin(p.x *. 0.045 +. center.x *. 0.01)
            *. maths.cos(p.z *. 0.05 +. center.z *. 0.013)
            +. 0.025
            *. maths.sin({ p.x -. 0.6 *. p.z } *. 0.09 +. center.x *. 0.02)
          height *. shape *. { 1.0 +. ripple *. { 1.0 -. 0.85 *. front } }
        }
      }
    }
  }
}

/// How far behind its center a hill's summit sits, as a share of its radius.
const summit_back = 0.25

/// How far a hill reaches in front of its summit, as a share of its radius.
const front_reach = 0.57

/// How far a hill reaches to each side, as a share of its radius: beside its
/// summit, and across the nose that the wall slices.
const side_reach = 0.88

const nose_reach = 0.5

/// The power on a hill's profile toward the wall, and to the sides and back.
const front_exponent = 0.75

const back_exponent = 1.6

/// 0 at `t` <= 0, 1 at `t` >= 1, with a smooth step between.
fn smooth(t: Float) -> Float {
  let k = float.clamp(t, min: 0.0, max: 1.0)
  k *. k *. { 3.0 -. 2.0 *. k }
}

/// `p` moved up or down onto the ground surface.
pub fn place(terrain: Terrain, p: Vec3) -> Vec3 {
  Vec3(p.x, height(terrain, p), p.z)
}

/// A push away from every rock whose edge is closer than `margin`. It grows
/// from 0 at `margin` to 1 at the edge, and more inside the rock.
pub fn avoid(terrain: Terrain, p: Vec3, margin: Float) -> Vec3 {
  list.fold(terrain.rocks, vec3.zero, fn(push, rock) {
    let #(gap, out) = edge(rock, p)
    case gap <. margin {
      False -> push
      True ->
        vec3.add(push, vec3.scale(out, float.min(2.0, 1.0 -. gap /. margin)))
    }
  })
}

/// `p` moved out to `pad` past the edge of any rock it is inside.
pub fn push_out(terrain: Terrain, p: Vec3, pad: Float) -> Vec3 {
  list.fold(terrain.rocks, p, fn(p, rock) {
    let #(gap, out) = edge(rock, p)
    case gap <. pad {
      False -> p
      True -> vec3.add(p, vec3.scale(out, pad -. gap))
    }
  })
}

/// How far `p` is outside the rock's footprint (negative inside), and the
/// way out. The footprint is the circle less anything in front of the wall.
fn edge(rock: Rock, p: Vec3) -> #(Float, Vec3) {
  let away = vec3.flat(vec3.subtract(p, rock.center))
  let wall = rock.center.z -. rock.cut -. p.z
  case rock {
    Rock(..) -> {
      let round = vec3.length(away) -. rock.radius
      case wall >. round {
        True -> #(wall, Vec3(0.0, 0.0, -1.0))
        False -> #(round, outward(away))
      }
    }
    // A hill's low outer slopes count as open ground.
    Hill(radius:, ..) -> {
      let round = vec3.length(away) -. radius *. 0.6
      case wall >. round {
        True -> #(wall, Vec3(0.0, 0.0, -1.0))
        False -> #(round, outward(away))
      }
    }
  }
}

fn outward(away: Vec3) -> Vec3 {
  case vec3.length(away) >. 0.001 {
    True -> vec3.normalize(away)
    False -> Vec3(1.0, 0.0, 0.0)
  }
}

/// The indices of the `cell`-wide squares that cover `from` to `to`.
fn cells(from: Float, to: Float, cell: Float) -> List(Int) {
  let first = float.truncate(float.floor(from /. cell))
  let last = float.truncate(float.floor(to /. cell))
  count_up(first, last, [])
}

fn count_up(i: Int, last: Int, acc: List(Int)) -> List(Int) {
  case i > last {
    True -> list.reverse(acc)
    False -> count_up(i + 1, last, [i, ..acc])
  }
}

/// A repeatable value in [0, 1) for cell `(i, j)` and channel `k`.
fn hash(i: Int, j: Int, k: Int) -> Float {
  let x =
    maths.sin(
      int.to_float(i)
      *. 127.1
      +. int.to_float(j)
      *. 311.7
      +. int.to_float(k)
      *. 74.7,
    )
    *. 43_758.5453
  x -. float.floor(x)
}
