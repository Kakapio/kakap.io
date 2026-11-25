import gleam/float
import gleam/list
import sim/forage.{Garden, Patch}
import sim/rabbits.{type Config, type Rabbit, Bounds, Config, Indoors, Outside}
import sim/terrain.{Terrain}
import sim/vec3.{type Vec3, Vec3}

fn config() -> Config {
  Config(
    walk_speed: 70.0,
    run_speed: 260.0,
    acceleration: 900.0,
    fear_radius: 360.0,
    contagion_radius: 150.0,
    spacing: 34.0,
    huddle_radius: 40.0,
    hop_height: 10.0,
    hop_rate: 9.0,
  )
}

const bounds = Bounds(-1000.0, 1000.0, -1000.0, 1000.0)

const dt = 0.016666666666666666

const far_away = Vec3(5000.0, 0.0, 5000.0)

fn run(herd: List(Rabbit), spider: Vec3, frames: Int) -> List(Rabbit) {
  case frames {
    0 -> herd
    _ ->
      run(
        rabbits.step(
          herd,
          from: spider,
          within: bounds,
          dt: dt,
          config: config(),
        ),
        spider,
        frames - 1,
      )
  }
}

fn spread_from_center(herd: List(Rabbit)) -> Float {
  let center = rabbits.centroid(herd)
  list.fold(herd, 0.0, fn(most, r) {
    float.max(most, vec3.ground_distance(r.position, center))
  })
}

fn scattered() -> List(Rabbit) {
  rabbits.herd(6, around: Vec3(0.0, 0.0, 0.0), spread: 500.0)
}

pub fn calm_rabbits_huddle_together_test() {
  let before = scattered()
  let after = run(before, far_away, 600)
  assert spread_from_center(after) <. 90.0
  assert spread_from_center(after) <. spread_from_center(before)
}

pub fn huddled_rabbits_keep_some_space_test() {
  let after = run(scattered(), far_away, 600)
  let pairs = list.combination_pairs(after)
  assert list.all(pairs, fn(pair) {
    vec3.ground_distance({ pair.0 }.position, { pair.1 }.position) >. 15.0
  })
}

pub fn an_approaching_spider_splits_the_huddle_test() {
  let huddle = run(scattered(), far_away, 600)
  let center = rabbits.centroid(huddle)
  let spider = vec3.add(center, Vec3(60.0, 0.0, 0.0))
  let after = run(huddle, spider, 90)
  assert spread_from_center(after) >. spread_from_center(huddle) *. 3.0
  assert list.all(after, fn(r) {
    vec3.ground_distance(r.position, spider) >. 120.0
  })
}

pub fn fear_spreads_to_nearby_rabbits_test() {
  let scared = rabbit_at(0, Vec3(0.0, 0.0, 0.0), 1.0)
  let calm = rabbit_at(1, Vec3(100.0, 0.0, 0.0), 0.0)
  let assert [_, after] = run([scared, calm], far_away, 1)
  assert rabbits.is_fleeing(after)
}

pub fn fear_fades_when_the_spider_leaves_test() {
  let huddle = run(scattered(), far_away, 600)
  let spider = rabbits.centroid(huddle)
  let scared = run(huddle, spider, 30)
  assert list.any(scared, rabbits.is_fleeing)
  let later = run(scared, far_away, 300)
  assert !list.any(later, rabbits.is_fleeing)
}

pub fn rabbits_stay_inside_the_bounds_test() {
  let tight = Bounds(-150.0, 150.0, -150.0, 150.0)
  let start = rabbits.herd(6, around: Vec3(0.0, 0.0, 0.0), spread: 60.0)
  let step = fn(herd) {
    rabbits.step(
      herd,
      from: Vec3(0.0, 0.0, 0.0),
      within: tight,
      dt: dt,
      config: config(),
    )
  }
  let after =
    list.fold(list.repeat(Nil, 300), start, fn(herd, _) { step(herd) })
  assert list.all(after, fn(r) {
    r.position.x >=. -150.0
    && r.position.x <=. 150.0
    && r.position.z >=. -150.0
    && r.position.z <=. 150.0
  })
}

pub fn rabbits_run_around_rocks_test() {
  let rock = terrain.rock(Vec3(0.0, 0.0, 0.0), 80.0, 50.0)
  let ground = Terrain([rock], [], [])
  let start = rabbits.herd(6, around: Vec3(-300.0, 0.0, 0.0), spread: 60.0)
  let spider = Vec3(-450.0, 0.0, 0.0)
  let #(_, ok) =
    list.fold(list.repeat(Nil, 300), #(start, True), fn(acc, _) {
      let #(herd, ok) = acc
      let next =
        rabbits.step_around(
          herd,
          ground,
          from: [spider],
          doors: [],
          paths: rabbits.no_paths,
          within: bounds,
          dt: dt,
          config: config(),
        )
      #(
        next,
        ok
          && list.all(next, fn(r) {
          vec3.ground_distance(r.position, rock.center) >=. rock.radius
        }),
      )
    })
  assert ok
}

pub fn rabbits_run_away_from_the_closest_of_two_spiders_test() {
  let rabbit = rabbit_at(0, Vec3(0.0, 0.0, 0.0), 0.0)
  let near = Vec3(-100.0, 0.0, 0.0)
  let far = Vec3(0.0, 0.0, 340.0)
  let after =
    list.fold(list.repeat(Nil, 30), [rabbit], fn(herd, _) {
      rabbits.step_around(
        herd,
        terrain.flat,
        from: [near, far],
        doors: [],
        paths: rabbits.no_paths,
        within: bounds,
        dt: dt,
        config: config(),
      )
    })
  let assert [r] = after
  assert rabbits.is_fleeing(r)
  assert r.position.x >. 40.0
}

fn rabbit_at(id: Int, at: Vec3, fear: Float) -> Rabbit {
  rabbits.Rabbit(
    id,
    at,
    vec3.zero,
    0.0,
    fear,
    0.0,
    0.0,
    0,
    Outside,
    0.0,
    rabbits.Idle,
  )
}

fn run_home(
  herd: List(Rabbit),
  spider: Vec3,
  door: Vec3,
  frames: Int,
) -> List(Rabbit) {
  list.fold(list.repeat(Nil, frames), herd, fn(herd, _) {
    rabbits.step_around(
      herd,
      terrain.flat,
      from: [spider],
      doors: [door],
      paths: rabbits.no_paths,
      within: bounds,
      dt: dt,
      config: config(),
    )
  })
}

pub fn a_rabbit_scared_for_long_runs_home_and_hides_test() {
  let door = Vec3(-600.0, 0.0, 0.0)
  // The spider chases the rabbit, keeping it scared until it reaches home.
  let after =
    list.fold(
      list.repeat(Nil, 600),
      [rabbit_at(0, Vec3(0.0, 0.0, 0.0), 0.0)],
      fn(herd, _) {
        let chaser = case herd {
          [r, ..] -> vec3.add(r.position, Vec3(150.0, 0.0, 0.0))
          [] -> far_away
        }
        run_home(herd, chaser, door, 1)
      },
    )
  let assert [r] = after
  assert rabbits.is_indoors(r)
  assert r.position == door
  assert rabbits.outside_centroid(after) == Error(Nil)
}

pub fn a_hiding_rabbit_comes_out_once_the_spider_leaves_test() {
  let door = Vec3(-600.0, 0.0, 0.0)
  let hiding = rabbits.Rabbit(..rabbit_at(0, door, 1.0), shelter: Indoors(0.0))
  let still_in = run_home([hiding], Vec3(-500.0, 0.0, 0.0), door, 400)
  assert list.all(still_in, rabbits.is_indoors)
  let out = run_home(still_in, far_away, door, 10)
  let assert [r] = out
  assert r.shelter == Outside
  assert r.dread == 0.0
}

pub fn settle_shares_houses_in_id_order_test() {
  let homes =
    rabbits.herd(6, around: Vec3(0.0, 0.0, 0.0), spread: 50.0)
    |> rabbits.settle(houses: 2)
    |> list.map(fn(r) { r.home })
  assert homes == [0, 0, 0, 1, 1, 1]
}

pub fn a_rabbit_crosses_a_crevasse_at_the_bridge_to_get_home_test() {
  // The crevasse runs along the x axis, with a bridge at x = -100. The way
  // over the bridge is shorter than the way around either end.
  let crack =
    terrain.Crevasse(
      Vec3(-400.0, 0.0, 0.0),
      Vec3(400.0, 0.0, 0.0),
      115.0,
      170.0,
      300.0,
    )
  let ground = Terrain([], [crack], [])
  let door = Vec3(-150.0, 0.0, 250.0)
  let paths = rabbits.find_paths(ground, doors: [door], within: bounds)
  let runner =
    rabbits.Rabbit(
      0,
      Vec3(-200.0, 0.0, -200.0),
      vec3.zero,
      0.0,
      1.0,
      0.0,
      5.0,
      0,
      rabbits.GoingHome,
      0.0,
      rabbits.Idle,
    )
  let #(after, safe, crossed) =
    list.fold(list.repeat(Nil, 600), #([runner], True, False), fn(acc, _) {
      let #(herd, safe, crossed) = acc
      let next =
        rabbits.step_around(
          herd,
          ground,
          from: [far_away],
          doors: [door],
          paths:,
          within: bounds,
          dt: dt,
          config: config(),
        )
      let assert [r] = next
      let over_gap = terrain.height(ground, at: r.position) <. 0.0
      let on_bridge = float.absolute_value(r.position.x +. 100.0) <. 20.001
      #(next, safe && { !over_gap || on_bridge }, crossed || over_gap)
    })
  let assert [r] = after
  assert safe
  assert crossed
  // It went in, and came out at its door once the coast was clear.
  assert r.position == door
}

pub fn a_rabbit_stays_set_on_going_home_once_it_decides_test() {
  let door = Vec3(-900.0, 0.0, 0.0)
  let dreading =
    rabbits.Rabbit(..rabbit_at(0, Vec3(0.0, 0.0, 0.0), 1.0), dread: 3.0)
  // The spider is near enough to keep it scared for this one frame.
  let assert [r] = run_home([dreading], Vec3(100.0, 0.0, 0.0), door, 1)
  assert r.shelter == rabbits.GoingHome
  // It keeps running home after the spider leaves and it calms down.
  let assert [later] = run_home([r], far_away, door, 120)
  assert later.shelter == rabbits.GoingHome
}

pub fn calm_rabbits_do_not_walk_into_a_spider_between_them_test() {
  // Two rabbits want to huddle, but a spider sits between them.
  let spider = Vec3(300.0, 0.0, 0.0)
  let start = [
    rabbit_at(0, Vec3(-200.0, 0.0, 0.0), 0.0),
    rabbit_at(1, Vec3(800.0, 0.0, 0.0), 0.0),
  ]
  let #(_, ok) =
    list.fold(list.repeat(Nil, 900), #(start, True), fn(acc, _) {
      let #(herd, ok) = acc
      let next = run(herd, spider, 1)
      #(next, ok && !list.any(next, rabbits.is_fleeing))
    })
  assert ok
}

pub fn a_fleeing_rabbit_runs_along_a_wall_instead_of_into_it_test() {
  // A spider comes from the right, and a wall is just left of the rabbit.
  let tight = Bounds(-100.0, 1000.0, -1000.0, 1000.0)
  let rabbit = rabbit_at(0, Vec3(0.0, 0.0, 0.0), 1.0)
  let spider = Vec3(150.0, 0.0, 0.0)
  let after =
    list.fold(list.repeat(Nil, 60), [rabbit], fn(herd, _) {
      rabbits.step(herd, from: spider, within: tight, dt: dt, config: config())
    })
  let assert [r] = after
  // It got away along the wall rather than sitting pinned against it.
  assert vec3.ground_distance(r.position, spider) >. 250.0
  assert float.absolute_value(r.position.z) >. 150.0
}

/// A house hill with its wall toward -z, and the spot in front of its door.
const hill = terrain.Hill(Vec3(0.0, 0.0, 0.0), 210.0, 95.0, 50.0, 0.4363)

const hill_door = Vec3(0.0, 0.0, -64.0)

pub fn a_rabbit_behind_its_house_runs_around_it_to_the_door_test() {
  let ground = Terrain([hill], [], [])
  let paths = rabbits.find_paths(ground, doors: [hill_door], within: bounds)
  let runner =
    rabbits.Rabbit(
      0,
      Vec3(10.0, 0.0, 260.0),
      vec3.zero,
      0.0,
      1.0,
      0.0,
      5.0,
      0,
      rabbits.GoingHome,
      0.0,
      rabbits.Idle,
    )
  let run = fn(paths) {
    list.fold(list.repeat(Nil, 240), #([runner], False), fn(acc, _) {
      let #(herd, home) = acc
      let next =
        rabbits.step_around(
          herd,
          ground,
          from: [far_away],
          doors: [hill_door],
          paths:,
          within: bounds,
          dt: dt,
          config: config(),
        )
      #(next, home || list.all(next, rabbits.is_indoors))
    })
  }
  // It gets home in 4 seconds. With no paths it is still behind the hill.
  assert run(paths).1
  assert !run(rabbits.no_paths).1
}

pub fn a_calm_rabbit_walks_around_a_hill_to_its_group_test() {
  let ground = Terrain([hill], [], [])
  let door = [hill_door]
  let herd = [
    rabbit_at(0, Vec3(0.0, 0.0, 260.0), 0.0),
    rabbit_at(1, Vec3(-25.0, 0.0, -340.0), 0.0),
    rabbit_at(2, Vec3(25.0, 0.0, -340.0), 0.0),
    rabbit_at(3, Vec3(0.0, 0.0, -300.0), 0.0),
  ]
  let walk = fn(paths) {
    list.fold(list.repeat(Nil, 1500), #(herd, paths), fn(acc, _) {
      let #(herd, paths) = acc
      let paths = rabbits.update_paths(paths, herd, dt: dt)
      let next =
        rabbits.step_around(
          herd,
          ground,
          from: [far_away],
          doors: door,
          paths:,
          within: bounds,
          dt: dt,
          config: config(),
        )
      #(next, paths)
    }).0
  }
  let together = walk(rabbits.find_paths(ground, doors: door, within: bounds))
  assert spread_from_center(together) <. 90.0
  // Heading straight for the group, the lone rabbit stays behind the hill.
  assert spread_from_center(walk(rabbits.no_paths)) >. 150.0
}

/// A hungry rabbit, its herd and a patch, run for `frames` frames with the
/// garden tended each frame.
fn graze(
  herd: List(Rabbit),
  garden: forage.Garden,
  frames: Int,
) -> #(List(Rabbit), forage.Garden) {
  let ground = Terrain([], [], [])
  let paths = rabbits.find_paths(ground, doors: [], within: bounds)
  list.fold(list.repeat(Nil, frames), #(herd, garden), fn(acc, _) {
    let #(herd, garden) = acc
    let paths = rabbits.food_paths(paths, to: garden.patches)
    let next =
      rabbits.step_foraging(
        herd,
        ground,
        from: [far_away],
        doors: [],
        food: garden.patches,
        paths:,
        within: bounds,
        dt: dt,
        config: config(),
      )
    #(
      next,
      rabbits.tend(
        garden,
        eaten_by: next,
        on: ground,
        doors: [],
        paths:,
        within: bounds,
        dt: dt,
      ),
    )
  })
}

fn hungry(id: Int, at: Vec3) -> Rabbit {
  rabbits.Rabbit(..rabbit_at(id, at, 0.0), hunger: 1.0)
}

pub fn a_hungry_rabbit_walks_to_food_and_eats_test() {
  let patch = Patch(0, Vec3(300.0, 0.0, 0.0), 3.0)
  // A long wait, so that no other patch sprouts.
  let garden = Garden([patch], 1, 1000.0)
  let start = [hungry(0, Vec3(0.0, 0.0, 0.0))]
  // It walks 300 units at 70 a second, then eats for a little over 4 seconds.
  let #(herd, garden) = graze(start, garden, 360)
  let assert [r] = herd
  assert r.errand == rabbits.Eating(0)
  assert vec3.ground_distance(r.position, patch.position) <. rabbits.eat_reach
  let #(herd, garden) = graze(herd, garden, 240)
  let assert [r] = herd
  assert r.errand == rabbits.Idle
  assert r.hunger <. 0.2
  let assert [left] = garden.patches
  // It ate a meal, and a little more for the hunger it got on the walk.
  assert left.food <. 2.0 && left.food >. 1.7
}

pub fn a_full_rabbit_leaves_food_alone_test() {
  let garden = Garden([Patch(0, Vec3(300.0, 0.0, 0.0), 3.0)], 1, 1000.0)
  let #(herd, garden) =
    graze([rabbit_at(0, Vec3(0.0, 0.0, 0.0), 0.0)], garden, 300)
  let assert [r] = herd
  assert r.errand == rabbits.Idle
  assert vec3.ground_distance(r.position, Vec3(0.0, 0.0, 0.0)) <. 5.0
  let assert [left] = garden.patches
  assert left.food == 3.0
}

pub fn a_scared_rabbit_drops_its_meal_test() {
  let garden = Garden([Patch(0, Vec3(300.0, 0.0, 0.0), 3.0)], 1, 1000.0)
  let scared =
    rabbits.Rabbit(
      ..hungry(0, Vec3(0.0, 0.0, 0.0)),
      fear: 1.0,
      errand: rabbits.Foraging(0),
    )
  let #(herd, _) = graze([scared], garden, 1)
  let assert [r] = herd
  assert r.errand == rabbits.Idle
}

pub fn an_eaten_patch_goes_and_new_ones_sprout_test() {
  let garden = Garden([Patch(0, Vec3(300.0, 0.0, 0.0), 0.0)], 1, 0.0)
  // 40 seconds is time for every patch to sprout, with some failed tries.
  let #(_, garden) = graze([], garden, 2400)
  assert list.length(garden.patches) == forage.most
  assert list.all(garden.patches, fn(p) { p.id != 0 && p.food == forage.meals })
  // Patches keep apart.
  assert list.all(garden.patches, fn(a) {
    list.all(garden.patches, fn(b) {
      a.id == b.id || vec3.ground_distance(a.position, b.position) >. 150.0
    })
  })
}
