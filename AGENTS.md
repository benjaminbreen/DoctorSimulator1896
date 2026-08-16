# Codex Notes

Repo for *Ghosts of the Machine Age: The Game*. Two apps: `character-lab/`
(character design dev environment, `npm run lab`) and `game/` (the playable
game, own package, `npm run game`, port 5175).

- This is a non-commercial teaching project. CC-BY-NC and CC-BY-NC-SA assets
  are acceptable when credited in `docs/credits.md`. Shipped assets must permit
  redistribution in a web build.
- The documents in `docs/` describe the current design and research. Read the
  files relevant to the task, but treat the user's current direction as more
  authoritative than an old plan.
- Research historical content carefully and record its sources and uncertainty.
  Ben will review it through normal iteration; review is not a gate to building
  a prototype.
- The simulation owns facts, disclosure, scores, and outcomes. An LLM may
  classify input or write presentation text, but it does not decide ground truth.
- Reuse focused modules from `../Darwin-Game v1` when useful. Avoid copying its
  large application components wholesale.
- Write code, comments, documentation, and responses in simple, precise English.
- Keep comments to 2–3 lines. Say why the code is the way it is, or name a
  gotcha. Do not restate what the line does, and do not write literary prose.
- Build the simplest thing that works. No shared constants, indirection layers,
  or abstractions for a problem that has not happened yet. Duplicating a value
  in two files with a one-line note beats a module that exists to hold it.
- Test the behaviour that matters. Do not add tests to pin down details that
  will change, and do not exhaustively verify a change that is obviously right.
