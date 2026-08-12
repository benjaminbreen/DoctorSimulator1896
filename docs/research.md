# Research notes

Drafted by an AI agent 2026-08-05 from conversation with Ben. Treat it as a
working source list: check claims against the cited primary material as they
enter the game.

## Chronology

The setting is "1880s NYC" but the anchor figures pull in two directions:

- George Miller Beard: coins neurasthenia 1869, *American Nervousness* 1881,
  **dies January 1883**. He cannot be a live NPC in most windows.
- Beard & Rockwell, *A Practical Treatise on the Medical and Surgical Uses of
  Electricity* (1871) — both were New York electrotherapists.
- Cocaine: Koller's local-anesthesia demonstration 1884; Halsted's addiction
  begins 1884–85; coca tonics (Vin Mariani etc.) circulate from the 1870s.
- Silas Weir Mitchell, *Fat and Blood* (1877) — the rest cure.
- American Society for Psychical Research founded 1884–85; William James
  active from the start.
- William James, *Principles of Psychology*, 1890.
- James McKeen Cattell: Penn professorship 1889, "Mental Tests and
  Measurements" (*Mind*, 1890), **Columbia 1891**, anthropometric testing of
  students from the early 1890s.

**Current recommendation: 1896** (Ben proposed 1892; leaning later on these
grounds, decision his):

- Peyote: Briggs's first medical report 1887; Mooney's fieldwork from 1891;
  Parke-Davis sells Anhalonium preparations mid-1890s; Prentiss & Morgan's
  study 1895; Weir Mitchell's paper 1896; **William James tries mescal
  buttons 1896** (sent by Mitchell) and keeps "the visions on trust."
  Prescribable-but-unconceptualized peyote points to 1895–96, not 1892.
- Proto-Freud: Breuer & Freud "Preliminary Communication" 1893, *Studies on
  Hysteria* 1895, essentially unread in America (James one of the few to
  notice). In 1892 there is no Freud to have almost-heard of; in 1896 there
  is. The era's live talk-adjacent therapies: suggestion (Bernheim),
  hypnotism (Trilby craze, 1894), Janet's dissociation (1889).
- Eugenics: Galton coins the word 1883; no movement until the 1900s — nascent
  at either date, so no constraint.
- 1896 extras: X-ray mania (Röntgen's announcement hits the press January
  1896; Edison's fluoroscope demo in NYC that May) — seeing inside bodies,
  with obvious spirit-photography resonance for the book's themes; James's
  Lowell Lectures on Exceptional Mental States (1896); SPR Census of
  Hallucinations report (1894) fresh; diphtheria antitoxin (1894–95) as
  scientific medicine's first real triumph, sharpening the contrast with
  everything the player does.
- Nothing Ben wants is lost at 1896: neurasthenia, electrotherapy, and the
  rest cure are all still in full swing; Cattell's Columbia lab (1891–) is
  real and established, so no composite needed. Beard (d. 1883) enters as a
  referenced presence via an NPC who knew him — per Ben, he need not appear.

## Primary sources to gather

- Beard & Rockwell treatise; *American Nervousness*
- Mitchell, *Fat and Blood*
- A period dispensatory / US Pharmacopeia edition matching the window
- Cattell, "Mental Tests and Measurements" (1890)
- ASPR *Proceedings*; census-of-hallucinations material
- Patent-medicine advertising; Vin Mariani promotional albums
- Case records: rest-cure correspondence, neurology clinic records if
  findable

These belong in the in-game library (Darwin library-reader runtime), each
citable back to a Jamesiana entry.

## Ties to sibling projects

- **Book**: *Ghosts of the Machine Age* (FSG, 2029) — the James siblings,
  Galton, and the battle for consciousness. The consulting room and the
  measuring lab are the book's two poles. Game research and book research are
  the same hours spent twice.
- **[William Jamesiana](../../William%20Jamesiana/)**: public archival site
  with semantic search over the research corpus. The game's library should
  draw from and link into it. That repo already holds a dissertation PDF on
  the economic rhetoric of neurasthenia.
- **[Apothecary Simulator](../../Apothecary%20Simulator/)**: Ben's original
  consultation-loop game (Maria de Lima, 1680s Mexico City). Mine it for the
  diagnosis-engine prompts and the documented failure mode: open structure
  let players drift out of history ("tea with Isaac Newton"). The fix here is
  bounded space plus deterministic patient state.
- **`~/code/3d-plague`** and **`~/code/damascus-1348-new-plague-simulator`**:
  prior contagion-model work; the weekly-tick social sim can borrow from them.
- **[historical-persona-generator](../../historical-persona-generator/)**:
  Ben's existing engine for demographically sampled, source-grounded persona
  generation (biography, family, life events, inner life, attributes,
  portrait; "true frequency" sampling; pipes real records like Old Bailey
  trials into generation). This is the upstream of the patient pool: narrow
  the sampling frame to an 1890s NYC practice catchment, then bolt on the
  medical layer (deterministic ground-truth condition, presentation shaped by
  social milieu, graph links to other tracked people). Corpora to feed it:
  dispensary and clinic case records, rest-cure correspondence, and the SPR
  Census of Hallucinations (1894) — the latter is a ready-made bank of
  "hears the dead" presentations for psychical-research patients.

## The mechanic's scholarly anchor

Hacking's looping effect (making up people): diagnostic categories change the
people they classify, which changes the categories. Historically attested in
this exact setting — neurasthenia spread as a fashionable diagnosis through
the social networks Beard's book named, and post-1884 cocaine enthusiasm
created iatrogenic addiction (Halsted). The contagion sim is this argument in
executable form; a Res Obscura essay lives in that sentence.

## Cattell's laboratory — apparatus built for the game

Working research record for what the props were modelled from:

- The ten tests are Cattell's own list from "Mental Tests and Measurements"
  (*Mind*, 1890), which he then ran on entering Columbia freshmen from 1894:
  dynamometer pressure; rate of movement; sensation-areas; pressure causing
  pain; least noticeable difference in weight; reaction-time for sound; time
  for naming colours; bisection of a 50cm line; judgment of 10 seconds time;
  number of letters repeated on once hearing.
- **Chronology problem.** Columbia was still on the 49th Street campus in
  1896; Morningside Heights and Schermerhorn Hall open in 1897. The room in
  `cattell-lab.blueprint.json` is therefore a converted upper floor, not the
  purpose-built laboratory usually pictured. If the game wants Schermerhorn,
  the date has to move.
- The apparatus forms (Hipp chronoscope, kymograph, fall-screen
  tachistoscope, du Bois-Reymond sledge coil, Maxwell discs) are the common
  patterns of the period, not any one maker's plate. Zimmermann, Verdin and
  Willyoung catalogues would settle the details.
- Cattell specifies a sound stimulus for reaction time, a Hipp chronoscope,
  three valid reactions, and recording the minimum result. The game's amber
  lamp fires from the same event as the bell as an accessibility adaptation;
  it is not presented as part of Cattell's original procedure. Source:
  Cattell, ["Mental Tests and Measurements" (1890)](https://psychclassics.yorku.ca/Cattell/mental.htm).
