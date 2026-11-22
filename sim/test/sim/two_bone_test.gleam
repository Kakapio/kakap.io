import gleam/float
import sim/two_bone
import sim/vec3.{type Vec3, Vec3}

fn close(a: Float, b: Float) -> Bool {
  float.loosely_equals(a, b, tolerating: 0.000001)
}

fn solve(target: Vec3) -> two_bone.Bend {
  two_bone.solve(
    root: Vec3(0.0, 100.0, 0.0),
    target: target,
    upper: 80.0,
    lower: 90.0,
    bend_toward: vec3.up,
  )
}

pub fn segments_keep_their_lengths_test() {
  let bend = solve(Vec3(60.0, 10.0, 40.0))
  assert close(vec3.distance(Vec3(0.0, 100.0, 0.0), bend.knee), 80.0)
  assert close(vec3.distance(bend.knee, bend.end), 90.0)
}

pub fn a_reachable_target_is_reached_test() {
  let target = Vec3(60.0, 10.0, 40.0)
  let bend = solve(target)
  assert vec3.distance(bend.end, target) <. 0.000001
  assert !bend.stretched
}

pub fn the_knee_bends_toward_the_pole_test() {
  let bend = solve(Vec3(100.0, 100.0, 0.0))
  assert bend.knee.y >. 100.0
}

pub fn an_unreachable_target_straightens_the_limb_test() {
  let bend = solve(Vec3(400.0, 100.0, 0.0))
  assert bend.stretched
  assert close(bend.end.x, 170.0)
  assert close(bend.knee.y, 100.0)
}
