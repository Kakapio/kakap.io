//// A small herd of rabbits. Calm rabbits huddle together. A rabbit panics when
//// a spider comes close, and panic spreads to rabbits near it. Panicked
//// rabbits run away from the spider and away from each other, so the herd
//// splits up. Fear fades once the spider is gone, and they huddle again.
////
//// A rabbit that stays scared for too long runs home and hides indoors. It
//// comes out again once no spider is near its door.

import gleam/float
import gleam/int
import gleam/list
import gleam_community/maths
import sim/angle
import sim/terrain.{type Terrain}
import sim/vec3.{type Vec3, Vec3}

/// Lengths are in world units and times in seconds.
pub type Config {
  Config(
    walk_speed: Float,
    run_speed: Float,
    acceleration: Float,
    fear_radius: Float,
    contagion_radius: Float,
    spacing: Float,
    huddle_radius: Float,
    hop_height: Float,
    hop_rate: Float,
  )
}

/// The rectangle of ground the rabbits stay inside.
pub type Bounds {
  Bounds(min_x: Float, max_x: Float, min_z: Float, max_z: Float)
}

/// Where a rabbit is with respect to its house.
pub type Shelter {
  Outside
  /// Running for the door.
  GoingHome
  /// Inside the house for `time` seconds.
  Indoors(time: Float)
}

/// `fear` runs from 0 (calm) to 1 (panic). `hop` is the hop cycle phase in
/// radians. `dread` is how long the rabbit has been scared, in seconds; it
/// fades while the rabbit is calm. `home` is the index of its house.
pub type Rabbit {
  Rabbit(
    id: Int,
    position: Vec3,
    velocity: Vec3,
    heading: Float,
    fear: Float,
    hop: Float,
    dread: Float,
    home: Int,
    shelter: Shelter,
  )
}

/// Above this fear a rabbit runs.
const panic_level = 0.35

/// Fear lost per second once the spider is out of range.
const calm_down = 0.6

/// Each rabbit passes on this share of its fear to rabbits near it.
const contagion = 0.8

/// Distance from an edge where the wall starts to push back.
const wall_margin = 90.0

const golden_angle = 2.399963

/// Distance from a rock's edge where the rock starts to push back.
const rock_margin = 36.0

/// The closest a rabbit's center comes to a rock's edge.
const rock_pad = 12.0

/// Seconds of fear that send a rabbit home.
const dread_limit = 3.0

/// Dread lost per second while calm.
const dread_fade = 0.4

/// The shortest stay indoors, in seconds.
const indoor_time = 5.0

/// A rabbit this close to its door goes in.
const door_reach = 18.0

/// A rabbit comes out when no spider is within this many fear radii of its
/// door.
const all_clear = 1.3

/// `count` rabbits on a sunflower spiral of radius `spread` around `center`.
pub fn herd(
  count: Int,
  around center: Vec3,
  spread spread: Float,
) -> List(Rabbit) {
  list.repeat(Nil, count)
  |> list.index_map(fn(_, i) {
    let a = int.to_float(i) *. golden_angle
    let r =
      spread *. vec3.sqrt({ int.to_float(i) +. 0.5 } /. int.to_float(count))
    Rabbit(
      i,
      vec3.add(vec3.flat(center), vec3.scale(vec3.from_yaw(a), r)),
      vec3.zero,
      a,
      0.0,
      0.0,
      0.0,
      0,
      Outside,
    )
  })
}

/// Share `houses` houses out among the herd in order of id: with 6 rabbits
/// and 2 houses, ids 0 to 2 live in house 0 and ids 3 to 5 in house 1.
pub fn settle(rabbits: List(Rabbit), houses houses: Int) -> List(Rabbit) {
  let count = int.max(1, list.length(rabbits))
  list.map(rabbits, fn(r) { Rabbit(..r, home: r.id * houses / count) })
}

pub fn is_indoors(rabbit: Rabbit) -> Bool {
  case rabbit.shelter {
    Indoors(_) -> True
    _ -> False
  }
}

/// The center of the rabbits that are outside, or an error when all are in.
pub fn outside_centroid(rabbits: List(Rabbit)) -> Result(Vec3, Nil) {
  case list.filter(rabbits, fn(r) { !is_indoors(r) }) {
    [] -> Error(Nil)
    outside -> Ok(centroid(outside))
  }
}

pub fn centroid(rabbits: List(Rabbit)) -> Vec3 {
  case rabbits {
    [] -> vec3.zero
    _ ->
      rabbits
      |> list.fold(vec3.zero, fn(sum, r) { vec3.add(sum, r.position) })
      |> vec3.scale(1.0 /. int.to_float(list.length(rabbits)))
  }
}

pub fn is_fleeing(rabbit: Rabbit) -> Bool {
  rabbit.fear >. panic_level
}

/// How high the rabbit is off the ground in its hop. Faster rabbits hop higher.
pub fn lift(rabbit: Rabbit, config: Config) -> Float {
  let speed = vec3.length(rabbit.velocity)
  let effort =
    float.clamp(speed /. config.walk_speed, min: 0.0, max: 1.0)
    +. float.clamp(
      { speed -. config.walk_speed } /. config.run_speed,
      min: 0.0,
      max: 1.0,
    )
  config.hop_height *. float.absolute_value(maths.sin(rabbit.hop)) *. effort
}

/// Move every rabbit one frame. Each rabbit sees the herd as it was at the
/// start of the frame.
pub fn step(
  rabbits: List(Rabbit),
  from spider: Vec3,
  within bounds: Bounds,
  dt dt: Float,
  config config: Config,
) -> List(Rabbit) {
  step_around(
    rabbits,
    terrain.flat,
    from: [spider],
    doors: [],
    within: bounds,
    dt:,
    config:,
  )
}

/// The same as `step`, with any number of spiders, rabbits that run around
/// the rocks on `ground`, and houses. `doors` holds the spot in front of each
/// house's door, in house order.
pub fn step_around(
  rabbits: List(Rabbit),
  ground: Terrain,
  from spiders: List(Vec3),
  doors doors: List(Vec3),
  within bounds: Bounds,
  dt dt: Float,
  config config: Config,
) -> List(Rabbit) {
  list.map(rabbits, fn(rabbit) {
    let door = list.drop(doors, rabbit.home) |> list.first
    case rabbit.shelter {
      Indoors(time) -> stay_in(rabbit, time, door, spiders, dt, config)
      _ -> {
        let outside =
          list.filter(rabbits, fn(other) {
            other.id != rabbit.id && !is_indoors(other)
          })
        step_one(rabbit, outside, ground, spiders, door, bounds, dt, config)
      }
    }
  })
}

/// Wait indoors, then come out at the door once the coast is clear.
fn stay_in(
  rabbit: Rabbit,
  time: Float,
  door: Result(Vec3, Nil),
  spiders: List(Vec3),
  dt: Float,
  config: Config,
) -> Rabbit {
  let time = time +. dt
  case door {
    Error(Nil) -> Rabbit(..rabbit, shelter: Outside)
    Ok(door) -> {
      let clear =
        list.all(spiders, fn(spider) {
          vec3.ground_distance(door, spider) >. config.fear_radius *. all_clear
        })
      case time >=. indoor_time && clear {
        True ->
          Rabbit(
            ..rabbit,
            position: door,
            velocity: vec3.zero,
            fear: 0.0,
            dread: 0.0,
            shelter: Outside,
          )
        False -> Rabbit(..rabbit, shelter: Indoors(time))
      }
    }
  }
}

fn step_one(
  rabbit: Rabbit,
  others: List(Rabbit),
  ground: Terrain,
  spiders: List(Vec3),
  door: Result(Vec3, Nil),
  bounds: Bounds,
  dt: Float,
  config: Config,
) -> Rabbit {
  let fear = feel(rabbit, others, spiders, dt, config)
  let dread = case fear >. panic_level {
    True -> rabbit.dread +. dt
    False -> float.max(0.0, rabbit.dread -. dt *. dread_fade)
  }
  let shelter = case rabbit.shelter, door {
    Outside, Ok(_) if dread >=. dread_limit -> GoingHome
    shelter, _ -> shelter
  }
  let separation = personal_space(rabbit, others, config.spacing)
  let group = case others {
    [] -> rabbit.position
    _ -> centroid(others)
  }

  let desired = case shelter, door, fear >. panic_level {
    GoingHome, Ok(door), _ ->
      vec3.flat(vec3.subtract(door, rabbit.position))
      |> vec3.normalize
      |> vec3.add(vec3.scale(separation, 0.4))
      |> vec3.normalize
      |> vec3.scale(config.run_speed)
    _, _, True ->
      escape(rabbit, spiders)
      |> vec3.add(vec3.scale(
        vec3.normalize(vec3.flat(vec3.subtract(rabbit.position, group))),
        0.8,
      ))
      |> vec3.add(vec3.scale(vec3.from_yaw(own_angle(rabbit)), 0.35))
      |> vec3.add(vec3.scale(separation, 1.5))
      |> vec3.normalize
      |> vec3.scale(config.run_speed *. fear)
    _, _, False -> {
      let to_group = vec3.flat(vec3.subtract(group, rabbit.position))
      let pull =
        float.clamp(
          { vec3.length(to_group) -. config.huddle_radius } /. 100.0,
          min: 0.0,
          max: 1.0,
        )
      vec3.add(
        vec3.scale(vec3.normalize(to_group), config.walk_speed *. pull),
        vec3.scale(separation, config.walk_speed *. 1.5),
      )
    }
  }

  // A rabbit running home slides around rocks and its own house rather than
  // being pushed back from them.
  let dodge = case shelter {
    GoingHome -> 0.3
    _ -> 1.0
  }
  let desired =
    desired
    |> vec3.add(walls(rabbit.position, bounds, config.run_speed))
    |> vec3.add(vec3.scale(
      terrain.avoid(ground, rabbit.position, rock_margin),
      config.run_speed *. dodge,
    ))
  let velocity =
    vec3.move_toward(rabbit.velocity, desired, config.acceleration *. dt)
  let position =
    vec3.add(rabbit.position, vec3.scale(velocity, dt))
    |> terrain.push_out(ground, _, rock_pad)
    |> clamp_to(bounds)
  let speed = vec3.length(velocity)
  let heading = case speed >. 5.0 {
    True -> angle.turn_toward(rabbit.heading, vec3.yaw(velocity), 12.0 *. dt)
    False -> rabbit.heading
  }
  let hop =
    rabbit.hop +. dt *. config.hop_rate *. vec3.sqrt(speed /. config.walk_speed)
  case shelter, door {
    GoingHome, Ok(door) ->
      case vec3.ground_distance(position, door) <. door_reach {
        True ->
          Rabbit(
            ..rabbit,
            position: door,
            velocity: vec3.zero,
            fear: fear,
            dread: dread,
            shelter: Indoors(0.0),
          )
        False ->
          Rabbit(..rabbit, position:, velocity:, heading:, fear:, hop:, dread:)
      }
    _, _ ->
      Rabbit(
        ..rabbit,
        position:,
        velocity:,
        heading:,
        fear:,
        hop:,
        dread:,
        shelter:,
      )
  }
}

/// The way away from the spiders, weighted toward the closest ones.
fn escape(rabbit: Rabbit, spiders: List(Vec3)) -> Vec3 {
  list.fold(spiders, vec3.zero, fn(sum, spider) {
    let away = vec3.flat(vec3.subtract(rabbit.position, spider))
    let d = float.max(1.0, vec3.length(away))
    vec3.add(sum, vec3.scale(away, 1.0 /. { d *. d *. d }))
  })
  |> vec3.normalize
}

/// Full fear inside a spider's radius, a share of any scared neighbour's
/// fear, or the rabbit's own fear fading away, whichever is highest.
fn feel(
  rabbit: Rabbit,
  others: List(Rabbit),
  spiders: List(Vec3),
  dt: Float,
  config: Config,
) -> Float {
  let threat = case
    list.any(spiders, fn(spider) {
      vec3.ground_distance(rabbit.position, spider) <. config.fear_radius
    })
  {
    True -> 1.0
    False -> 0.0
  }
  let spread =
    list.fold(others, 0.0, fn(most, other) {
      case
        vec3.ground_distance(other.position, rabbit.position)
        <. config.contagion_radius
      {
        True -> float.max(most, other.fear *. contagion)
        False -> most
      }
    })
  threat
  |> float.max(spread)
  |> float.max(rabbit.fear -. dt *. calm_down)
  |> float.max(0.0)
}

/// A push away from every rabbit closer than `spacing`, stronger when closer.
fn personal_space(
  rabbit: Rabbit,
  others: List(Rabbit),
  spacing: Float,
) -> Vec3 {
  list.fold(others, vec3.zero, fn(push, other) {
    let away = vec3.flat(vec3.subtract(rabbit.position, other.position))
    let gap = vec3.length(away)
    case gap <. spacing {
      False -> push
      True -> {
        let direction = case gap >. 0.0 {
          True -> vec3.scale(away, 1.0 /. gap)
          False -> vec3.from_yaw(own_angle(rabbit))
        }
        vec3.add(push, vec3.scale(direction, { spacing -. gap } /. spacing))
      }
    }
  })
}

/// Each rabbit has its own favourite direction, so a scattering herd spreads out.
fn own_angle(rabbit: Rabbit) -> Float {
  int.to_float(rabbit.id) *. golden_angle
}

fn walls(p: Vec3, b: Bounds, strength: Float) -> Vec3 {
  let push = fn(gap) {
    float.clamp(1.0 -. gap /. wall_margin, min: 0.0, max: 1.0) *. strength
  }
  Vec3(
    push(p.x -. b.min_x) -. push(b.max_x -. p.x),
    0.0,
    push(p.z -. b.min_z) -. push(b.max_z -. p.z),
  )
}

fn clamp_to(p: Vec3, b: Bounds) -> Vec3 {
  Vec3(
    float.clamp(p.x, min: b.min_x, max: b.max_x),
    0.0,
    float.clamp(p.z, min: b.min_z, max: b.max_z),
  )
}
