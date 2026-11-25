//// Patches of food that grow on the ground. A patch holds a few meals. Once
//// it is eaten up it goes, and a new patch sprouts somewhere else a little
//// later.

import gleam/float
import gleam/list
import sim/vec3.{type Vec3}

/// `food` is how many meals are left.
pub type Patch {
  Patch(id: Int, position: Vec3, food: Float)
}

/// The patches that are up. `next_id` is the id of the next patch to
/// sprout. `wait` is the time until then, in seconds.
pub type Garden {
  Garden(patches: List(Patch), next_id: Int, wait: Float)
}

/// The meals in a new patch.
pub const meals = 3.0

/// The most patches that are up at once.
pub const most = 3

/// Seconds from one patch sprouting to the next.
const sprout_time = 7.0

/// Seconds to wait after no free spot was found.
const retry_time = 0.5

/// A garden with no patches. The first sprouts after a short wait.
pub const bare = Garden([], 0, 2.0)

/// The patch with `id` that still has food, if any.
pub fn find(patches: List(Patch), id: Int) -> Result(Patch, Nil) {
  list.find(patches, fn(patch) { patch.id == id && patch.food >. 0.0 })
}

/// The garden with `amount` meals eaten from patch `id`.
pub fn eat(garden: Garden, from id: Int, amount amount: Float) -> Garden {
  let patches =
    list.map(garden.patches, fn(patch) {
      case patch.id == id {
        True -> Patch(..patch, food: float.max(0.0, patch.food -. amount))
        False -> patch
      }
    })
  Garden(..garden, patches:)
}

/// The garden `dt` later. Empty patches go. While fewer than `most` are up,
/// a new one sprouts every `sprout_time`. `spot` gives a place for the new
/// patch from a seed, or an error when that seed has no free place.
pub fn grow(
  garden: Garden,
  dt dt: Float,
  spot spot: fn(Int) -> Result(Vec3, Nil),
) -> Garden {
  let patches = list.filter(garden.patches, fn(patch) { patch.food >. 0.0 })
  let wait = float.max(0.0, garden.wait -. dt)
  case list.length(patches) < most && wait <=. 0.0 {
    False -> Garden(..garden, patches:, wait:)
    True ->
      case spot(garden.next_id) {
        Ok(at) ->
          Garden(
            list.append(patches, [Patch(garden.next_id, at, meals)]),
            garden.next_id + 1,
            sprout_time,
          )
        // The next seed gives another place to try.
        Error(Nil) -> Garden(patches, garden.next_id + 1, retry_time)
      }
  }
}
