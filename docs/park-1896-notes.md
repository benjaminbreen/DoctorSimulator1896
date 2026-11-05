# Central Park 1896: research notes for the Arsenal, Menagerie and Pond

These are the claims behind the November 2026 park additions. None is
verified yet. Each needs Ben's check before it goes into landmark cards or
dialogue. Guesses are marked as guesses.

## The Arsenal (`world/arsenal.js`, `scene/Arsenal.jsx`)

- Its battlements and corner bastions were replaced by low hipped roofs in
  the late 1860s and restored only in 1924. Sources: NY State Military Museum
  and NYC Parks histories of the building. So the 1896 model has plain
  cornices and low tower caps, not the crenellations seen today.
- The walls were heavily ivy-covered by the 1890s. Sources: a c. 1900
  photograph (Wikimedia Commons) and Irving Underhill's 1914 photograph
  (Library of Congress, 97517295).
- The weather station on the roof (instrument tower, anemometer, vane) ran
  from 1869 to 1918, first under the Signal Service and later the Weather
  Bureau. Needs checking: whether it was still on the Arsenal roof in 1896,
  and what the instruments looked like.
- The flag has 44 stars, correct until Utah's 45th star took effect on
  4 July 1896. A game set later in 1896 should switch to 45.
- Window bays, tower count and the stoop are simplified from the photographs,
  not measured.

## The Menagerie (`scene/Menagerie.jsx`)

- The 1890 park report lists the collection, including elk, a sea lion and a
  hippopotamus. The game shows bears in cages, elk in a paddock and sea lions
  in a round pool.
- The Dennis collection stereoviews "Museum and menagerie" and "Herd of
  elephants" show whitewashed wooden animal houses behind the Arsenal.
- Guesses: the layout of the sheds, the cage design, the paddock fence, and
  the pool's position and size. Three sea lions is also a guess; the report
  mentions one.

## Walk edging (`scene/ParkEdging.jsx`)

- The Dennis stereoview "The museum" shows a walk edged with low posts and
  wire, which is the model for the post-and-wire guards on the north, green
  and dairy walks. The granite gutters on the drive and pond walk are
  inferred, not seen in a photograph.

## The Pond (`scene/PondDucks.jsx`)

- Mallards on the Pond are plausible but unconfirmed for 1896. Swans and
  domestic ducks are other candidates worth checking.

## Streets around the park (`world/streetWear.js`, `scene/CabRank.jsx`)

- Flagstone crossings at each corner, two slabs wide and laid in the walking
  direction, are drawn from general 1890s New York street photographs, not
  from a photograph of these corners.
- Dung, stains and gutter straw are placed down the lanes and thickest near
  the corners. Their amount is a guess; Waring's street cleaning (from 1895)
  may mean Fifth Avenue was cleaner than most streets.
- The cab stand on the Plaza apron (two hansoms and a brougham, the lead
  horse at its nosebag) is plausible, since cabs waited at the park
  entrances, but its exact place is invented.
- The granite horse trough with a dog basin is generic. Check what kind of
  trough, if any, stood at the Plaza in 1896; the well-known granite troughs
  of the National Humane Alliance date from 1906 on and must not be copied.

## Street ironwork (`world/streetIronwork.js`, `scene/StreetIronwork.jsx`)

- Horse-head hitching posts and granite carriage steps at the curb outside
  the mansions; the horse-head type is common in period photographs, but
  none here is a copy of one known on these blocks.
- Boot scrapers were already drawn at some doors by the facade code; this
  adds free-standing ones at the foot of other raised stoops.
- Round iron coal-hole covers in the sidewalk beside the stoops.
- Manhole covers read "CROTON" (the water department) or "SEWER". Check the
  wording and pattern of 1890s New York covers before relying on them.
- Storm-drain gratings in the gutter just past each corner.
- Letter boxes reading "U.S. MAIL / LETTER BOX" on every third lamp post on
  the built side. Check the colour: I used a dark green, but boxes of the
  1890s may have been painted differently.

## Rooftops (`world/rooftops.js`, `scene/Rooftops.jsx`)

- Brick chimney stacks stand on the side (party) walls, each with a row of
  clay chimney pots, one per flue. This follows the usual New York row-house
  pattern, but the counts and heights here are generic.
- Wooden water tanks on legs stand on some apartment houses over about 18 m.
  Check when roof tanks became common in Manhattan: they were needed once
  buildings rose above about six storeys, but how many stood on Fifth Avenue
  and Central Park South blocks by 1896 is unverified.
- Stair bulkheads and glass skylights over the stair well are generic
  details of flat-roofed houses of the period.
- The four roofs west of the Plaza Hotel form a fictional traversal route.
  Two iron maintenance ladders lead from the service alleys to the roofs.
  The neighboring buildings' heights and gaps are tuned for play. The
  [NYC Municipal Archives](https://www.nyc.gov/assets/records/pdf/DOB-Drawings_Finding-Aid_REC0074.pdf)
  records a Bureau of Fire Escapes and Iron Work by 1874; that supports the
  material and period, not the location or design of these particular ladders.
