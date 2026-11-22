//// Rocks on the ground plane. Each rock is the top half of an ellipsoid: a
//// circle of `radius` on the ground, `height` tall at its center.

import gleam/float
import gleam/int
import gleam/list
import gleam_community/maths
import sim/vec3.{type Vec3, Vec3}

pub type Rock {
  Rock(center: Vec3, radius: Float, height: Float)
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
            Ok(Rock(
              center: Vec3(
                { int.to_float(i) +. 0.2 +. 0.6 *. r(1) } *. cell,
                0.0,
                { int.to_float(j) +. 0.2 +. 0.6 *. r(2) } *. cell,
              ),
              radius: radius,
              height: radius *. { 0.5 +. 0.3 *. r(4) },
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
    let d = vec3.ground_distance(p, rock.center) /. rock.radius
    case d <. 1.0 {
      True -> float.max(top, rock.height *. vec3.sqrt(1.0 -. d *. d))
      False -> top
    }
  })
}

/// `p` moved up or down onto the ground surface.
pub fn place(terrain: Terrain, p: Vec3) -> Vec3 {
  Vec3(p.x, height(terrain, p), p.z)
}

/// A push away from every rock whose edge is closer than `margin`. It grows
/// from 0 at `margin` to 1 at the edge, and more inside the rock.
pub fn avoid(terrain: Terrain, p: Vec3, margin: Float) -> Vec3 {
  list.fold(terrain.rocks, vec3.zero, fn(push, rock) {
    let away = vec3.flat(vec3.subtract(p, rock.center))
    let gap = vec3.length(away) -. rock.radius
    case gap <. margin {
      False -> push
      True ->
        vec3.add(
          push,
          vec3.scale(outward(away), float.min(2.0, 1.0 -. gap /. margin)),
        )
    }
  })
}

/// `p` moved out to `pad` past the edge of any rock it is inside.
pub fn push_out(terrain: Terrain, p: Vec3, pad: Float) -> Vec3 {
  list.fold(terrain.rocks, p, fn(p, rock) {
    let away = vec3.flat(vec3.subtract(p, rock.center))
    case vec3.length(away) <. rock.radius +. pad {
      False -> p
      True ->
        vec3.add(
          vec3.flat(rock.center),
          vec3.scale(outward(away), rock.radius +. pad),
        )
        |> vec3.add(Vec3(0.0, p.y, 0.0))
    }
  })
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
