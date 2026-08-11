// Every converted model pack, in one lookup. A placement names a model and
// nothing else; this resolves which pack holds it, where it loads from, and
// how big it measured. Names are unique across packs — the converter would
// have to be given two files of the same name for that to break.

import victorian from '../../public/models/victorian/manifest.json' with { type: 'json' };
import park from '../../public/models/park/manifest.json' with { type: 'json' };
import props from '../../public/models/props/manifest.json' with { type: 'json' };

const PACKS = { victorian, park, props };

function entryFor(name) {
  for (const [pack, manifest] of Object.entries(PACKS)) {
    if (manifest[name]) return { pack, entry: manifest[name] };
  }
  return null;
}

export function hasModel(name) {
  return Boolean(entryFor(name));
}

export function modelUrl(name) {
  const found = entryFor(name);
  return found ? `/models/${found.pack}/${found.entry.file}` : null;
}

// Measured size in metres. The converter recentres every piece on its
// footprint with its base at y=0, so a placement position is the model's
// ground-contact point and this is its true extent.
export function modelSize(name) {
  return entryFor(name)?.entry.size ?? [1, 1, 1];
}

// Attribution, where the source carried one. CC-BY pieces must ship a credit.
export function modelCredit(name) {
  return entryFor(name)?.entry.credit ?? null;
}

// The whole manifest row, including `measured` and `presence` for a piece the
// converter deliberately enlarged.
export function packEntry(name) {
  return entryFor(name)?.entry ?? null;
}

export function packModels(pack) {
  return Object.keys(PACKS[pack] ?? {}).sort();
}
