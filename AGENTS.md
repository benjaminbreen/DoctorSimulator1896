# Codex Notes

Planning-stage repo for *Ghosts of the Machine Age: The Game*. No code yet.

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
