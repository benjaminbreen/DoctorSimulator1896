# Ghosts of the Machine Age: The Game

A 3D educational simulation game set in New York City, c. 1880s–1890s. The
player is a physician whose practice sits at the center of the era's battle
for consciousness: neurasthenia, electrotherapy, coca tonics, the rest cure,
early talk therapy, psychical research, and anthropometric measurement.

Companion project to the book *Ghosts of the Machine Age* (FSG, 2029) and to
the [William Jamesiana](../William%20Jamesiana/) archival corpus. Built on
systems extracted from the Darwin Game
([Darwin-Game v1](../Darwin-Game%20v1/)).

## Status

The playable game has a deterministic consultation engine, the production
consultation interface, and a complete authored proof-of-concept patient, Nora
Byrne. Nora supports authored branches, custom inquiry and thought, examination,
immediate patient reaction, and a separate one-month outcome. Two seeded
technical patients remain as procedural development fixtures.

Run the game with `npm run game`; it serves on port 5175. Run Character Lab
with `npm run lab`.

Start with [docs/README.md](docs/README.md) for the current documentation order.

## Current development direction

Complete more researched authored patients, strengthen procedural encounters,
and then connect consultation results to the wider practice simulation. The
current patient-system specification is [docs/patient-system.md](docs/patient-system.md).
