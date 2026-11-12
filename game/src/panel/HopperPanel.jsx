import { useEffect, useState } from 'react';
import PanelGroup from './PanelGroup.jsx';

// Dev overlay (Shift+3): the Hopper paint sliders over the running game.
// Values persist with the rest of the tuning; Copy puts them on the clipboard
// so a look can be pasted back as new defaults.
export default function HopperPanel({ runtime, onClose }) {
  const groups = runtime.schema.groups.filter((item) => item.id.startsWith('hopper'));
  const parameters = groups.flatMap((group) => group.parameters);
  const [epoch, setEpoch] = useState(0);
  const [on, setOn] = useState(runtime.values.paintStyle === 'hopper');
  const [copied, setCopied] = useState(false);
  useEffect(() => runtime.onChange((id, value) => {
    if (id === 'paintStyle') setOn(value === 'hopper');
  }), [runtime]);

  function copy() {
    const values = Object.fromEntries(parameters.map((p) => [p.id, runtime.values[p.id]]));
    navigator.clipboard?.writeText(JSON.stringify(values, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  function reset() {
    for (const parameter of parameters) runtime.set(parameter.id, parameter.default);
    setEpoch((value) => value + 1);
  }

  const button = 'rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800';
  return (
    <aside className="fixed right-3 top-24 z-[60] flex max-h-[78vh] w-72 flex-col rounded border border-neutral-700 bg-neutral-900/92 text-neutral-200 shadow-2xl">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2 text-xs">
        <h1 className="mr-auto text-sm font-semibold tracking-wide text-amber-200">Hopper</h1>
        <button type="button" className={button} onClick={() => runtime.set('paintStyle', on ? 'off' : 'hopper')}>
          {on ? 'On' : 'Off'}
        </button>
        <button type="button" className={button} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button type="button" className={button} onClick={reset}>Reset</button>
        <button type="button" className={button} onClick={onClose} aria-label="Close Hopper panel">✕</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <PanelGroup key={group.id} group={group} runtime={runtime} filter="" epoch={epoch} />
        ))}
      </div>
    </aside>
  );
}
