# Southeast Central Park landmark-block analysis

## Target and evidence

The target is a deliberately compressed, game-scale architectural ensemble,
not a measured reconstruction. The overhead game capture is authoritative for
road alignment, block occupancy, and the amount of urban enclosure the player
should perceive. Period photographs and near-contemporary records are used for
each landmark's silhouette and visual identity.

The set comprises the Cornelius Vanderbilt II mansion; the New Netherland,
Savoy, and Bolkenhayn hotel block; the surviving Marble Row rhythm; the Collis
P. Huntington house at the 57th Street edge; and the Elbridge T. Gerry house at
the 61st Street edge.

## Shared hierarchy

- Macro: continuous street walls, varied rooflines, corner towers, compressed
  service courts, and a small number of strong skyline anchors.
- Meso: tripartite bases/middles/crowns, bay rhythms, belt courses, cornices,
  entrance portals, mansards, gables, and corner turrets.
- Micro: sash grids, dormers, quoins, railings, awnings, chimneys, and signs.

## Landmark identity features

- Vanderbilt: broad asymmetrical French-chateau mass, square corner tower,
  conical turrets, steep slate roofs, gabled dormers, pale rusticated stone,
  and an arched Fifth Avenue entrance composition.
- New Netherland: very tall, narrow Romanesque hotel tower, dark masonry,
  vertical bay stacks, round-arched base openings, strong cornice bands, and a
  picturesque turreted crown.
- Savoy/Bolkenhayn: a taller Italian-Renaissance hotel paired with a shorter,
  attached 1895 neighbor; warm masonry, repetitive windows, strong cornices,
  mansard/dormer silhouette, and corner entrance emphasis.
- Marble Row: repeated white-marble attached houses with stoops, tall windows,
  party-wall rhythm, bracketed cornice, and individual mansard roofs.
- Huntington: wealthy corner mansion with heavier pale-stone base, red-brown
  upper masonry, deep entrance, bay/turret accents, and a steep roof.
- Gerry: French-Renaissance corner house with a pale masonry base, ordered
  upper bays, a dominant gable, dormers, chimney, and iron areaway.

## Spatial and construction rules

All architectural meshes are static visual children of an existing world
item. Each landmark or attached row gets one coarse collision proxy. Decorative
parts never receive their own colliders. The hotel pair and row-house shells
share instanced materials and geometries. Shadows are reserved for the macro
roof silhouettes; window, trim, rail, dormer, and cornice batches do not cast.

## Materials

- Warm gray and pale limestone/marble: rough dielectric, broad block scale.
- Red/brown Roman brick: rough dielectric with muted variation.
- Slate and aged copper roofs: dark low-gloss slate and restrained green metal.
- Painted wood/sash and iron: dark, readable silhouettes without glossy noise.
- Window depth: opaque blue-gray/umber panels, matching the game's performant
  facade convention rather than transparent interiors.

## Uncertainty and compression

The overhead capture is not suitable for facade detail, while surviving period
photos rarely show every elevation. Hidden elevations therefore continue the
visible grammar. Exact lot dimensions, room plans, and ornament are out of
scope. The historical promise is recognizable 1896 character and correct
relative urban role, with distances and building depth compressed to preserve
the existing playable grid and traffic paths.

