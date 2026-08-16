# Procedural crowd and traffic plan

Approved 2026-08-14. Replaces the hand-authored ambient population with a
procedural system, in phases. Authored set pieces stay: the cabbage-cart
opening, the Roosevelt speech, the carousel visitor, the bench conversations,
doormen, policemen, and dandies are content, not crowd.

## Why

- Ambient walkers follow fixed ping-pong polylines and never vary. Nothing
  spawns or leaves; the same two men lie on the Pond lawn at midnight.
- Vehicles ride seven closed loops with hand-picked starts. Cross-route
  vehicles are invisible to each other's obstacle logic, which causes the
  intersection jam and the spin glitch.
- Recent graphics work moved fps from ~50–60 to ~30–40. The overhaul must not
  lower it further. The cost of this system is population count, not
  behaviour; the design keeps count fixed and makes behaviour richer.

## Rules

- Deterministic ground truth: a seeded intent layer decides what happens
  (assignments, incidents); free-running physics decides only how it looks
  (how the cart tips, where cabbages roll). This generalises the cabbage-cart
  opening rather than replacing it.
- Sim modules are framework-free in `game/src/world/`, tested with
  `node --test`. Scene components only draw.
- The clock can jump (`advanceMinutes`, `advanceToHour`). Population is a
  function of (hour, day-seed); agents re-derive assignments after a jump
  rather than integrating through it.
- Incidents carry a rate budget: at most one serious incident per few
  game-minutes within earshot. The street is 1896, not slapstick.
- Fps parity is measured against a captured baseline, not asserted.

## Phase 1 — pedestrians

1. `world/walkGraph.js`: nodes and edges derived at load from the street
   sidewalk bands (`streetGrid.js`), park `PATHS`, corner crossings, gates,
   and map edges. A* routing. Nodes carry a kind: sidewalk-corner, crossing,
   path-junction, gate, edge.
2. `world/crowdScheduler.js`: pool of typed slots (one archetype each, since
   rigs cannot swap meshes). Population mix = f(hour, day-seed). An
   assignment gives a slot a role, origin, destination, and traits (pace,
   attention, impatience). Recycled slots re-dress: new tint, age, speed,
   traits.
3. `world/crowdAgent.js`: graph following, finite local avoidance over a
   spatial hash, look-both-ways at crossing edges against the vehicle list.
   Low attention or hurry can fail the check — that is how someone steps into
   traffic. Contact policy `person` on every agent.
4. `scene/Pedestrians.jsx`: ambient walkers become pool-driven; authored cast
   untouched. Keep reportAgent, startle reactions, colliders, animation
   throttle. Add a ~10 Hz sim tier for mid-distance agents. The Pond lawn
   posers get schedules.

Durable results: the walk graph module with tests; a scheduled, recycling
crowd at fps parity.

### Phase 1.5 — routines (landed with phase 1)

- `world/crowdSpots.js`: doors, bench seats, and lawn spots. Doors are graph
  nodes; entering one hides the figure in plain view (the door explains it)
  and emerging spawns without a distance check. Spots attach at approach
  points that lie exactly on authored walks.
- Scheduler roles `rest` (walk to a seat, sit 10–40 game-minutes in a real
  sitting clip) and `resident` (door-to-door trips with indoor dwells),
  weighted by day period. The schedule advances at the civil pace
  (pace / clock rate), so a figure walking real metres per real second keeps
  up exactly.
- Proximity reactions: walkers dodge an approaching player, stop and face a
  blocking one (with an acknowledging nod where the rig has the clip), and
  step around after ~2.5 s of blocked patience.
- Authored loiterers (wall-leaners, clerk, bench conversations, lawn
  posers) carry hour windows instead of standing all day.

## Phase 2 — vehicles

1. Directed lane graph over the same intersections. Each vehicle keeps a
   personal path object shaped like today's route (so `stepCarriage` and the
   horse articulation stack do not change), extended edge-by-edge as it
   commits to turns. Vehicles enter and leave at map edges through slot
   recycling; the off-map U-turn portals go away.
2. Intersection reservation: one token per junction, granted, released on
   exit, timed out. Driver traits (impatience, attention) allow defection —
   taking the box early or noticing cross-traffic late — which is where
   fender-benders come from. Defection frequency sits under the incident
   budget.
3. `trafficPolicy` generalised to a contact policy on every reported agent:
   `hard`, `soft`, `person`.

Durable results: lane-graph traffic without portals; reservation manager with
seeded defection, tested.

## Interim patch (with phase 1)

Two fixes to the current loop system, since phase 2 lands later:

- Cross-heading vehicles become obstacles to each other (they are filtered
  out today), so a crosser brakes short of a stalled vehicle instead of
  driving into it.
- `stepCarriage` derives heading from the position delta; at near-zero
  forward speed a lateral escape swings the heading 90° and the rig spins.
  Gate heading authority on forward travel along the tangent.

## Baseline

Measured with the preview pane compositing: stash this plan's changed files
for the "before" run, restore them for the "after" run, same camera
positions and times of day. Numbers live in `docs/artifacts/npc-baseline.md`.
