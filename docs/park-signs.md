# Central Park ordinances board

The Scholars' Gate board uses an OpenAI-generated sign-face texture in
`game/public/textures/signs/central-park-ordinances.webp`. It replaces the
placeholder rules drawn as horizontal bars. The existing board is 0.8 by
1 metre; the posts sit outside its lettering and border. Only the front
has writing; the back and edges are plain dark paint.

## Evidence and uncertainty

The text is a short, modernized abridgement of the Department of Public
Parks' **March 31, 1873 ordinances**, not a transcription of a photographed
1896 sign. The primary source is Document 43, printed pages 35–37 in
[Documents of the Board of Commissioners, April 30, 1873](https://static.nycgovparks.org/images/pagefiles/48/Board%20of%20Commissioners%20of%20the%20NYC%20Dept%20of%20Public%20Parks%20-%20Documents%20-%20April%2030%201873.pdf).

The seven short paragraphs draw respectively on sections I, II, III, II,
VII, VIII, and II. They retain the six-foot dog line and the exception for
turf marked COMMON. The paragraph numbers on our board organize this
abridgement; they are not the original section numbers. This is not a
complete statement of all rules in force on June 15, 1896.

An [Olmsted letter of July 8, 1890](https://rotunda.upress.virginia.edu/founders/default.xqy?keys=OLMS-print-01-09-02-0005-0017)
quotes a visitor who saw frequent notices against dogs running at large in
Central Park. This supports the presence of posted rules near the game
date, but does not establish their exact lettering, colour, or mounting.

An earlier newspaper notice, *New York Times*, March 18, 1858, uses a large
CENTRAL PARK heading, serif lettering, and dense prohibitions. A reproduction
appears on printed page 221 of
[Still, Heniford and Frassetto, “The History and Tradition of Regulating Guns in Parks”](https://journals.law.harvard.edu/lpr/wp-content/uploads/sites/89/2024/10/19.1-GunsInParks.pdf).
This is an earlier printed-notice reference, not evidence for the colour
or material of an outdoor board in 1896. Neither reference image ships in
the game.

The ivory-painted timber, black lettering, double-rule border, restrained
wear, dimensions, two posts, and placement are inferred art choices. No
verified photograph of this particular 1896 board was found. The generated
image must not be described as a facsimile or archival evidence. Names,
signatures, a publication date, fines, and opening hours have been omitted
rather than suggesting that the 1873 rules were unchanged in every detail.

## Generation

Used the built-in OpenAI image generation tool on November 3, 2026.
The exact prompt is saved in `assets/source/central-park-ordinances-2026-11-03/`;
the original output stays local in `assets-local/` to keep the repository
small. The prompt supplies all
wording; the image model supplies the surface and lettering treatment.
The runtime WebP is an export of that generated image.

## Visual check

The production build and the zone-feature check passed. Played from the park
entrance to the board with `game/scripts/gameplay-playtest.mjs` and inspected
the PNGs at entrance distance, at an oblique angle, and close up. All seven
paragraphs are readable close up; the posts leave the border clear. The
small rules naturally become unreadable at a distance. The run reported no
JavaScript or asset-loading errors.

The replay, states, and captures are under
`artifacts/gameplay/park-ordinances-review-2026-11-03/`; `0010.png` is the
close view. Replay its `actions.jsonl` with `--scenario=park` and seed 4.
