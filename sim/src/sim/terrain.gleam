//// Raised ground: rocks and hills. A rock is a boulder with flat facets. It
//// fits inside the top half of an ellipsoid: a circle of `radius` on the
//// ground, `height` tall at its center. Each rock gets its own facets from
//// its position and size. A rock can have its near side (toward -z) sliced
//// off by a vertical wall `cut` from its center.
////
//// A hill is a mound with a gentle ripple. Its sides and back meet the ground
//// with no edge. Its near side is steep and rounded, and a wall that leans
//// back slices it, like the front of a hobbit hole. The ground in front of
//// the wall is flat.
////
//// A crevasse is a long, deep crack in the ground with jagged rims. Its
//// surface is below zero. It can have one bridge across it.

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

/// A crack along the line from `from` to `to`, with a point at each end.
/// `width` is the widest the gap gets. `bridge` is how far along the line a
/// bridge crosses it. A negative `bridge` means no bridge.
pub type Crevasse {
  Crevasse(from: Vec3, to: Vec3, width: Float, depth: Float, bridge: Float)
}

pub type Terrain {
  Terrain(rocks: List(Rock), crevasses: List(Crevasse))
}

pub const flat = Terrain([], [])

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
  Terrain(rocks, [])
}

/// The height of the ground surface at `p`, ignoring `p.y`.
pub fn height(terrain: Terrain, at p: Vec3) -> Float {
  let low =
    list.fold(terrain.crevasses, 0.0, fn(low, c) {
      float.min(low, crevasse_height(c, p))
    })
  case low <. 0.0 {
    True -> low
    False ->
      list.fold(terrain.rocks, 0.0, fn(top, rock) {
        float.max(top, rock_height(rock, p))
      })
  }
}

/// The height of the crevasse's surface at `p`: 0 outside it, and down to
/// minus its depth inside. The walls slope in to a flat bottom.
pub fn crevasse_height(c: Crevasse, p: Vec3) -> Float {
  let #(t, s) = along(c, p)
  case rims_at(c, t) {
    Ok(#(left, right)) if s >. left && s <. right -> {
      let share = { s -. left } /. { right -. left }
      0.0
      -. c.depth
      *. float.min(1.0, float.min(share, 1.0 -. share) /. wall_share)
    }
    _ -> 0.0
  }
}

/// The share of the gap's width that each wall takes to reach the bottom.
pub const wall_share = 0.35

/// The distance between the points where a crevasse's rims change direction.
const knot_spacing = 45.0

/// A foot lands this far back from a rim.
const rim_margin = 6.0

/// Half the width of the path over a bridge.
pub const bridge_half = 20.0

/// The two rims of a crevasse as matching lists of corner points, from one
/// end to the other. The rims are straight between corners.
pub fn rims(c: Crevasse) -> List(#(Vec3, Vec3)) {
  let count = knots(c)
  let step = axis_length(c) /. int.to_float(count)
  count_up(0, count, [])
  |> list.map(fn(k) {
    let t = int.to_float(k) *. step
    let #(left, right) = knot(c, k, count)
    #(across(c, t, left), across(c, t, right))
  })
}

/// The points where the bridge meets each rim, or an error with no bridge.
pub fn bridge_ends(c: Crevasse) -> Result(#(Vec3, Vec3), Nil) {
  case rims_at(c, c.bridge) {
    Ok(#(left, right)) ->
      Ok(#(across(c, c.bridge, left), across(c, c.bridge, right)))
    Error(Nil) -> Error(Nil)
  }
}

/// Solid ground for a foot that wants to land at `wanted`. A spot inside a
/// crevasse moves to just past one rim: the rim on the same side of the
/// gap's middle as `toward`.
pub fn foothold(terrain: Terrain, wanted: Vec3, toward aim: Vec3) -> Vec3 {
  let moved =
    list.fold(terrain.crevasses, wanted, fn(p, c) {
      let #(t, s) = along(c, p)
      case rims_at(c, t) {
        Ok(#(left, right)) if s >. left && s <. right -> {
          let #(_, aim_s) = along(c, aim)
          case aim_s <. { left +. right } /. 2.0 {
            True -> across(c, t, left -. rim_margin)
            False -> across(c, t, right +. rim_margin)
          }
        }
        _ -> p
      }
    })
  place(terrain, moved)
}

/// How far `p` is outside the crevasse (negative inside), and the way out.
/// The path over the bridge counts as open ground. A point over the gap
/// beside the bridge is sent back onto it when that is closer than a rim.
fn crevasse_edge(c: Crevasse, p: Vec3) -> #(Float, Vec3) {
  let #(t, s) = along(c, p)
  let axis = vec3.normalize(vec3.subtract(c.to, c.from))
  let side = Vec3(0.0 -. axis.z, 0.0, axis.x)
  let off_bridge = float.absolute_value(t -. c.bridge) -. bridge_half
  case rims_at(c, t) {
    Error(Nil) -> #(1000.0, vec3.zero)
    Ok(_) if c.bridge >=. 0.0 && off_bridge <. 0.0 -> #(1000.0, vec3.zero)
    Ok(#(left, right)) ->
      case s <=. left, s >=. right {
        True, _ -> #(left -. s, vec3.scale(side, -1.0))
        _, True -> #(s -. right, side)
        _, _ -> {
          let inside = float.min(s -. left, right -. s)
          case c.bridge >=. 0.0 && off_bridge <. inside {
            True ->
              case t <. c.bridge {
                True -> #(0.0 -. off_bridge, axis)
                False -> #(0.0 -. off_bridge, vec3.scale(axis, -1.0))
              }
            False ->
              case s -. left <. right -. s {
                True -> #(0.0 -. inside, vec3.scale(side, -1.0))
                False -> #(0.0 -. inside, side)
              }
          }
        }
      }
  }
}

fn axis_length(c: Crevasse) -> Float {
  vec3.ground_distance(c.from, c.to)
}

/// `p` as a distance along the crevasse's line and a distance to its side.
fn along(c: Crevasse, p: Vec3) -> #(Float, Float) {
  let axis = vec3.normalize(vec3.flat(vec3.subtract(c.to, c.from)))
  let offset = vec3.flat(vec3.subtract(p, c.from))
  #(vec3.dot(offset, axis), offset.z *. axis.x -. offset.x *. axis.z)
}

/// The ground point `t` along the crevasse's line and `s` to its side.
fn across(c: Crevasse, t: Float, s: Float) -> Vec3 {
  let axis = vec3.normalize(vec3.flat(vec3.subtract(c.to, c.from)))
  Vec3(
    c.from.x +. axis.x *. t -. axis.z *. s,
    0.0,
    c.from.z +. axis.z *. t +. axis.x *. s,
  )
}

fn knots(c: Crevasse) -> Int {
  int.max(6, float.round(axis_length(c) /. knot_spacing))
}

/// The side distances of the left and right rims at corner `k` of `count`.
/// Each rim gets its own repeatable zigzag, and the gap closes at both ends.
fn knot(c: Crevasse, k: Int, count: Int) -> #(Float, Float) {
  let seed = c.from.x *. 0.37 +. c.from.z *. 0.11
  let r = fn(channel) { hash_float(seed, k * 3 + channel) }
  let taper = float.min(1.0, int.to_float(int.min(k, count - k)) /. 2.5)
  let middle = c.width *. 0.3 *. { r(0) -. 0.5 } *. taper
  #(
    middle -. c.width /. 2.0 *. { 0.7 +. 0.3 *. r(1) } *. taper,
    middle +. c.width /. 2.0 *. { 0.7 +. 0.3 *. r(2) } *. taper,
  )
}

/// The side distances of the two rims `t` along the line, or an error past
/// either end.
fn rims_at(c: Crevasse, t: Float) -> Result(#(Float, Float), Nil) {
  let length = axis_length(c)
  case t >. 0.0 && t <. length {
    False -> Error(Nil)
    True -> {
      let count = knots(c)
      let at = t /. length *. int.to_float(count)
      let k = int.min(count - 1, float.truncate(at))
      let share = at -. int.to_float(k)
      let #(left0, right0) = knot(c, k, count)
      let #(left1, right1) = knot(c, k + 1, count)
      Ok(#(
        left0 +. { left1 -. left0 } *. share,
        right0 +. { right1 -. right0 } *. share,
      ))
    }
  }
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
    Rock(center:, radius:, height:, ..) -> {
      let x = { p.x -. center.x } /. radius
      let z = { p.z -. center.z } /. radius
      case x *. x +. z *. z <. 1.0 {
        False -> 0.0
        True -> {
          // The lowest facet plane above the point.
          let low =
            list.fold(facets(rock), 1.0, fn(low, f) {
              float.min(
                low,
                { f.reach -. f.normal.x *. x -. f.normal.z *. z } /. f.normal.y,
              )
            })
          height *. float.max(0.0, low)
        }
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

/// One flat face of a rock. A point is under the facet when the dot product
/// of `normal` and the point is at most `reach`. The point is measured from
/// the rock's center, with x and z in units of its radius and y in units of
/// its height. `normal.y` is always positive.
pub type Facet {
  Facet(normal: Vec3, reach: Float)
}

/// Rocks with a radius above this are broad: low for their width, with a
/// wide, rough top to walk on.
const broad_radius = 120.0

/// The facets of a rock. The rock is the space under all of them, and it
/// stays inside its radius. A hill has none.
///
/// A rock has a level cap at its full height, a tilted top, a ring of 5 upper
/// facets, and a ring of 8 steep lower facets. A broad rock has the cap, 3
/// tilted tops, a ring of 7 gentle upper facets, and a ring of 10 steep
/// lower facets.
pub fn facets(rock: Rock) -> List(Facet) {
  case rock {
    Hill(..) -> []
    Rock(center:, radius:, ..) -> {
      let seed = center.x *. 0.37 +. center.z *. 0.11 +. radius
      let r = fn(k) { hash_float(seed, k) }
      let turn = 2.0 *. maths.pi()
      let facet = fn(yaw, pitch, reach) {
        Facet(
          Vec3(
            maths.cos(pitch) *. maths.cos(yaw),
            maths.sin(pitch),
            maths.cos(pitch) *. maths.sin(yaw),
          ),
          reach,
        )
      }
      // `count` facets spread around the rock, each turned by up to `loose`
      // of the space between them.
      let ring = fn(count, channel, loose, pitch, reach) {
        count_up(0, count - 1, [])
        |> list.map(fn(k) {
          let c = channel + k * 3
          facet(
            turn
              *. {
              r(channel - 1)
              +. { int.to_float(k) +. loose *. r(c) }
              /. int.to_float(count)
            },
            pitch(r(c + 1)),
            reach(r(c + 2)),
          )
        })
      }
      let cap = Facet(Vec3(0.0, 1.0, 0.0), 1.0)
      case radius >. broad_radius {
        False -> {
          let top_pitch = 1.2 +. 0.2 *. r(1)
          let top =
            facet(
              turn *. r(0),
              top_pitch,
              maths.sin(top_pitch) *. { 0.86 +. 0.1 *. r(2) },
            )
          list.flatten([
            [cap, top],
            ring(5, 10, 0.5, fn(u) { 0.62 +. 0.3 *. u }, fn(u) {
              0.78 +. 0.14 *. u
            }),
            ring(8, 40, 0.2, fn(u) { 0.12 +. 0.2 *. u }, fn(u) {
              0.7 +. 0.14 *. u
            }),
          ])
        }
        True -> {
          let tops =
            list.map([0, 1, 2], fn(k) {
              let pitch = 1.3 +. 0.15 *. r(k * 3 + 1)
              facet(
                turn
                  *. {
                  r(0) +. { int.to_float(k) +. 0.4 *. r(k * 3 + 2) } /. 3.0
                },
                pitch,
                maths.sin(pitch) *. { 0.84 +. 0.12 *. r(k * 3 + 3) },
              )
            })
          list.flatten([
            [cap, ..tops],
            ring(7, 20, 0.4, fn(u) { 0.8 +. 0.3 *. u }, fn(u) {
              0.8 +. 0.1 *. u
            }),
            ring(10, 50, 0.2, fn(u) { 0.15 +. 0.2 *. u }, fn(u) {
              0.8 +. 0.1 *. u
            }),
          ])
        }
      }
    }
  }
}

/// A repeatable value in [0, 1) for `seed` and channel `k`.
fn hash_float(seed: Float, k: Int) -> Float {
  let x = maths.sin(seed *. 12.9898 +. int.to_float(k) *. 78.233) *. 43_758.5453
  x -. float.floor(x)
}

/// `p` moved up or down onto the ground surface.
pub fn place(terrain: Terrain, p: Vec3) -> Vec3 {
  Vec3(p.x, height(terrain, p), p.z)
}

/// A push away from every rock and crevasse whose edge is closer than `margin`. It grows
/// from 0 at `margin` to 1 at the edge, and more inside the rock.
pub fn avoid(terrain: Terrain, p: Vec3, margin: Float) -> Vec3 {
  list.fold(edges(terrain, p), vec3.zero, fn(push, edge) {
    let #(gap, out) = edge
    case gap <. margin {
      False -> push
      True ->
        vec3.add(push, vec3.scale(out, float.min(2.0, 1.0 -. gap /. margin)))
    }
  })
}

/// `p` moved out to `pad` past the edge of any rock or crevasse it is inside.
pub fn push_out(terrain: Terrain, p: Vec3, pad: Float) -> Vec3 {
  let obstacles =
    list.append(
      list.map(terrain.rocks, fn(rock) { edge(rock, _) }),
      list.map(terrain.crevasses, fn(c) { crevasse_edge(c, _) }),
    )
  list.fold(obstacles, p, fn(p, edge_of) {
    let #(gap, out) = edge_of(p)
    case gap <. pad {
      False -> p
      True -> vec3.add(p, vec3.scale(out, pad -. gap))
    }
  })
}

/// The edge of every rock and crevasse as seen from `p`.
fn edges(terrain: Terrain, p: Vec3) -> List(#(Float, Vec3)) {
  list.append(
    list.map(terrain.rocks, edge(_, p)),
    list.map(terrain.crevasses, crevasse_edge(_, p)),
  )
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
