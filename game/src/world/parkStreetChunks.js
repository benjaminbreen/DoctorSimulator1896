import { GRAND_ARMY_APRON } from './heroStreetLayout.js';
import { ROADS, STREET_SURFACES } from './streetGrid.js';
import { streetIronwork } from './streetIronwork.js';

function streetBounds(points) {
  const xs = points.map(point => point[0]);
  const zs = points.map(point => point[1]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
}

export function parkStreetChunks() {
  const blocks = new Map();
  const add = (type, kind, entry, x, z, bounds) => {
    const key = Math.floor(x / 48) + ':' + Math.floor(z / 44);
    const id = type + ':' + key;
    if (!blocks.has(id)) blocks.set(id, { id, type, points: [], layout: {} });
    const block = blocks.get(id);
    (block.layout[kind] ??= []).push(entry);
    block.points.push([bounds[0], bounds[2]], [bounds[1], bounds[3]]);
  };
  for (const [kind, entries] of Object.entries(STREET_SURFACES)) {
    for (const entry of entries) {
      if (kind === 'corners') {
        add('street-surfaces', kind, entry, ...entry.streetCorner, streetBounds([...entry.gutter, ...entry.sidewalk]));
      } else {
        const { x, z, sx, sz } = entry;
        add('street-surfaces', kind, entry, x, z, [x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2]);
      }
    }
  }
  for (const [kind, entries] of Object.entries(streetIronwork())) {
    for (const entry of entries) {
      const { x, z } = entry;
      add('street-ironwork', kind, entry, x, z, [x, x, z, z]);
    }
  }
  const chunks = [...blocks.values()].map(({ points, ...block }) => ({ ...block, bounds: streetBounds(points) }));
  chunks.unshift({
    id: 'street-surfaces:apron',
    type: 'street-surfaces',
    bounds: streetBounds([...GRAND_ARMY_APRON.outer, ...GRAND_ARMY_APRON.driveThroat, ...GRAND_ARMY_APRON.streetMouth]),
    layout: {},
    apron: true,
  });
  const beltLine = ROADS.find(road => road.id === 'cps');
  chunks.push({
    id: 'street-surfaces:rails', type: 'street-surfaces', layout: {}, rails: true,
    bounds: [beltLine.from, beltLine.to, beltLine.lo, beltLine.hi],
  });
  return chunks;
}
