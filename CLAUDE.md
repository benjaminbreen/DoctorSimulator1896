# Claude Notes

Repo for *Ghosts of the Machine Age: The Game*. Two apps: `character-lab/`
(character design dev environment, `npm run lab`) and `game/` (the playable
game, own package, `npm run game`, port 5175).

- This is a non-commercial educational project, written by a historian for
  teaching use. It is not sold. **Non-commercial asset licences (CC-BY-NC,
  CC-BY-NC-SA) are fine here** — credit them in `docs/credits.md` and move on.
  Do not flag them as a problem or plan to replace them. The only licence bar
  is redistribution: a web build serves the `.glb`, so an asset with no
  redistribution right cannot ship.
- Read `docs/design.md`, `docs/research.md`, `docs/engine-reuse.md`, and
  `docs/decisions.md` before doing anything.
- Historical claims need Ben's verification before becoming game content;
  `docs/research.md` is a draft, not a source of truth.
- Every LLM-facing system sits on deterministic ground truth. The LLM
  renders; the simulation decides. No exceptions.
- Reuse comes from `../Darwin-Game v1` by copying specific modules
  (paths in `docs/engine-reuse.md`), never by copying its god-objects
  (`store.js`, `ThreeHUD.jsx`, `ThreeDarwinGame.jsx`) whole.
- Scope discipline: each phase must yield two durable results
  (see `docs/decisions.md`). Do not start M2 work during M1.
- Style: write code comments, docs, and responses simply and clearly. No
  neologisms, no poetic language. Comment blocks stay under 3–4 lines unless
  truly needed. Simple beats ornate — in prose and in design.
- Comments say why the code is the way it is, or name a gotcha. Never restate
  what the line does.
- Build the simplest thing that works. No shared constants, indirection layers,
  or abstractions for a problem that has not happened yet. Duplicating a value
  in two files with a one-line note beats a module that exists to hold it.
- Test the behaviour that matters. Do not add tests to pin down details that
  will change, and do not exhaustively verify a change that is obviously right.
