import gleam/float
import gleam/int
import gleam/list
import gleam/option.{None, Some}
import gleam_community/maths
import sim/angle
import sim/chain.{Cone, Joint, Limits}
import sim/vec.{type Vec, Vec}

const tolerance = 0.000001

fn close(a: Float, b: Float) -> Bool {
  float.loosely_equals(a, b, tolerating: tolerance)
}

fn link_lengths(points: List(Vec)) -> List(Float) {
  points
  |> list.window_by_2
  |> list.map(fn(pair) { vec.distance(pair.0, pair.1) })
}

fn link_directions(points: List(Vec)) -> List(Float) {
  points
  |> list.window_by_2
  |> list.map(fn(pair) { vec.direction(pair.0, pair.1) })
}

fn bends(lead: Float, points: List(Vec)) -> List(Float) {
  [lead, ..link_directions(points)]
  |> list.window_by_2
  |> list.map(fn(pair) { float.absolute_value(angle.wrap(pair.1 -. pair.0)) })
}

fn zigzag() -> List(Vec) {
  [
    Vec(0.0, 0.0),
    Vec(3.0, 9.0),
    Vec(-4.0, 15.0),
    Vec(8.0, 22.0),
    Vec(-9.0, 30.0),
    Vec(5.0, 33.0),
  ]
}

pub fn follow_keeps_every_link_at_segment_length_test() {
  let lengths =
    chain.follow(zigzag(), None, Limits(10.0, maths.pi()))
    |> chain.points
    |> link_lengths
  assert list.all(lengths, close(_, 10.0))
}

pub fn follow_keeps_the_first_point_fixed_test() {
  let assert [Joint(first, _), ..] =
    chain.follow(zigzag(), Some(0.0), Limits(10.0, 0.3))
  assert first == Vec(0.0, 0.0)
}

pub fn follow_never_bends_past_the_limit_test() {
  let lead = maths.pi() /. 2.0
  let max_bend = 0.3
  let points =
    chain.follow(zigzag(), Some(lead), Limits(10.0, max_bend)) |> chain.points
  assert list.all(bends(lead, points), fn(bend) {
    bend <=. max_bend +. tolerance
  })
}

pub fn follow_reports_clamped_joints_test() {
  let joints =
    chain.follow(zigzag(), Some(maths.pi() /. 2.0), Limits(10.0, 0.1))
  assert list.any(joints, fn(joint) {
    case joint.cone {
      Cone(_, clamped) -> clamped
      _ -> False
    }
  })
}

pub fn follow_leaves_a_straight_chain_unclamped_test() {
  let straight = [Vec(0.0, 0.0), Vec(10.0, 0.0), Vec(20.0, 0.0), Vec(30.0, 0.0)]
  let joints = chain.follow(straight, Some(0.0), Limits(10.0, 0.2))
  assert chain.points(joints) == straight
  assert list.all(joints, fn(joint) {
    case joint.cone {
      Cone(_, clamped) -> !clamped
      _ -> True
    }
  })
}

pub fn reach_touches_a_reachable_target_and_keeps_the_root_test() {
  let root = Vec(0.0, 0.0)
  let points =
    list.repeat(Nil, 9)
    |> list.index_map(fn(_, i) { Vec(0.0, -10.0 *. int.to_float(i)) })
    |> list.reverse
  let result =
    chain.reach(
      points,
      target: Vec(30.0, -50.0),
      root: root,
      root_direction: 0.0 -. maths.pi() /. 2.0,
      limits: Limits(10.0, 0.6),
      max_iterations: 32,
      tolerance: 0.5,
    )
  assert result.error <=. 0.5
  let assert Ok(Joint(last, _)) = list.last(result.joints)
  assert last == root
  assert list.all(link_lengths(chain.points(result.joints)), close(_, 10.0))
}

pub fn reach_straightens_toward_an_unreachable_target_test() {
  let points = [
    Vec(0.0, -30.0),
    Vec(0.0, -20.0),
    Vec(0.0, -10.0),
    Vec(0.0, 0.0),
  ]
  let result =
    chain.reach(
      points,
      target: Vec(0.0, -100.0),
      root: Vec(0.0, 0.0),
      root_direction: 0.0 -. maths.pi() /. 2.0,
      limits: Limits(10.0, 0.6),
      max_iterations: 16,
      tolerance: 0.5,
    )
  assert result.iterations == 16
  assert float.loosely_equals(result.error, 70.0, tolerating: 0.001)
}
