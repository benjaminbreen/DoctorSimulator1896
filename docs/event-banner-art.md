# Event banner art

The street-event and office-caller banners use one cut-paper theatre system.
The default assets live at:

- `game/public/ui/events/<art>.webp`
- `game/public/ui/callers/<art>.webp`

If a card supplies a choice variant, the UI first requests
`<art>-<choice>.webp` and falls back to `<art>.webp` when that file does not
exist. The six office callers intentionally use that fallback until their own
outcome variants are commissioned.

## Shared generation prompt

> Match the approved hand-cut paper theatre and pochoir material language:
> layered matte paper shapes, crisp scissor-cut silhouettes, restrained fibrous
> grain, slight pigment misregistration, simplified faceless figures, shallow
> stage depth, and strong negative space. Use a very wide 2.35:1 composition
> readable at small UI size. The shared palette is parchment cream, petrol
> green, aubergine, mustard, dusty coral, and charcoal. Clothing, architecture,
> furnishings, and props must be plausible for New York in 1896. No borders,
> captions, UI, lettering, readable labels, logos, signatures, or watermarks.
> Avoid photorealism, glossy digital painting, plastic 3D rendering, generic
> vector art, cute faces, contemporary objects, and smooth gradients.

The medicine-salesman cut-paper banner was the visual reference for this set.
The outcome images simplify it further: no more than two main figures, one
decisive gesture or prop, and a nearly empty parchment ground. Color carries
the result before the caption does:

- helpful choices use petrol, bottle, and sage greens;
- harmful choices use dusty coral, brick, aubergine, and charcoal;
- neutral or uncertain choices balance mustard, aubergine, petrol, and cream.

The three day-flow banners are `messenger-boy.webp`, `retiring.webp`, and
`morning-schedule.webp`. The thirty-nine street-event results use the filename
form `<event>-<choice>.webp` and correspond directly to the choice IDs in
`streetEvents.js`.

The original base images used these scene briefs:

| Asset | Scene brief |
| --- | --- |
| `events/curbstone-consult.webp` | A working man rolls back his sleeve to show a heat rash while the physician examines it with a small lens on a park walk. |
| `events/man-down.webp` | A collapsed man lies inside the empty ring left by hesitant bystanders beneath an oppressive paper sun. |
| `events/tonic-agent.webp` | A suave agent presents an amber patent-medicine bottle and a three-dollar note to a reserved physician. |
| `events/lost-child.webp` | A small sailor-suited boy stands alone beneath a gas lamp and elms while a loose balloon escapes. |
| `events/reporter.webp` | A reporter leans in with notebook and pencil; a woman cyclist and enlarged wheel form the background motif. |
| `events/extra.webp` | A newsboy thrusts a newspaper overhead while coral paper rays carry his cry across the sidewalk. |

Seven newer events now have a base banner and three outcome banners each. They
remain `contentStatus: 'draft'` in `streetEvents.js` so the dev panel and proof
sheet keep their review status visible:

| Asset | Scene brief |
| --- | --- |
| `events/veteran-alms.webp` | An old veteran in a worn Grand Army coat touches his hat brim to a passing gentleman; a park bench and long afternoon shadows behind. |
| `events/bootblack.webp` | A bootblack boy kneels with box and brush, grinning up at a pair of city boots; cut-paper shine strokes on the leather. |
| `events/prescription-boy.webp` | A druggist's boy holds out a folded prescription; behind him a pharmacy window with globes of colored water. |
| `events/tract-hander.webp` | A composed matron in gloves extends a small printed tract; a fan of identical tracts in her other arm. |
| `events/scorcher.webp` | A speeding cyclist blurs past in coral; a woman mid-turn as brown-paper parcels scatter across the path. |
| `events/pickpocket.webp` | A crowded crossing of hats and shoulders; one thin hand slipping toward a coat pocket, the coat's owner unaware. |
| `events/matron.webp` | A society matron in a feathered hat leans in confidentially, one gloved hand raised; a faint second figure of a drooping young woman behind her thoughts. |
| `callers/teething-syrup.webp` | An exhausted caller cradles a wakeful infant at the office threshold; moonlit housing and an empty cradle imply two sleepless nights. |
| `callers/dyspepsia-powder.webp` | A caller holds the upper stomach while a lunch counter, plate, cup, and clock repeat the hurried daily meal. |
| `callers/nerve-tonic.webp` | A caller presents a newspaper tonic advertisement while a real amber bottle waits on the physician's shelf. |
| `callers/liniment.webp` | A crate worker supports a strained shoulder at the office threshold, with shipping crates and a rope hook behind. |
| `callers/cough-bottle.webp` | A boarding-house resident coughs into a handkerchief while lamplit doors show the wakeful floor behind. |
| `callers/headache-seltzer.webp` | A close-worker pinches the bridge of the nose; repeated clocks, unused spectacles, and hard afternoon sun reveal the pattern. |

Review the shipped banners directly in `game/public/ui/events/` and
`game/public/ui/callers/`. The seven-event art proof is
[`docs/artifacts/event-banners/draft-events-proof-sheet.png`](artifacts/event-banners/draft-events-proof-sheet.png).
