import { useRef, useState } from 'react';
import PanelGroup from './PanelGroup.jsx';
import { downloadPreset, importPresetFile } from '../tuning/presets.js';

// Sidebar panel, schema-driven like character-lab's. Inputs are uncontrolled;
// `epoch` remounts them after reset or preset import.
export default function TuningPanel({ runtime }) {
  const [search, setSearch] = useState('');
  const [epoch, setEpoch] = useState(0);
  const fileRef = useRef(null);
  const filter = search.trim().toLowerCase();

  async function onImport(event) {
    const input = event.target;
    try {
      const file = input.files?.[0];
      if (file) {
        await importPresetFile(runtime, file);
        setEpoch((value) => value + 1);
      }
    } catch (error) {
      console.warn('Preset import failed:', error.message);
    } finally {
      input.value = '';
    }
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-900">
      <header className="border-b border-neutral-800 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide text-amber-200">Tuning</h1>
        <div className="mt-2 flex gap-2 text-xs">
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
            onClick={() => {
              runtime.resetToDefaults();
              setEpoch((value) => value + 1);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
            onClick={() => downloadPreset(runtime)}
          >
            Export
          </button>
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800"
            onClick={() => fileRef.current?.click()}
          >
            Import
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImport} />
        </div>
        <input
          type="search"
          placeholder="Search parameters…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mt-2 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-amber-300"
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {runtime.schema.groups.map((group) => (
          <PanelGroup key={group.id} group={group} runtime={runtime} filter={filter} epoch={epoch} />
        ))}
      </div>
    </aside>
  );
}
