import { useEffect, useRef } from 'react';

function formatValue(parameter, value) {
  if (parameter.type !== 'range') return String(value);
  const decimals = parameter.step < 0.001 ? 4 : parameter.step < 0.1 ? 2 : parameter.step < 1 ? 2 : 0;
  return Number(value).toFixed(decimals);
}

// One uncontrolled control writing straight into the runtime; the value
// readout updates through a ref so no React state runs per input tick.
// External writes (window.__game, presets) sync back through onChange.
export default function PanelRow({ parameter, runtime }) {
  const outputRef = useRef(null);
  const inputRef = useRef(null);
  const value = runtime.values[parameter.id];

  useEffect(
    () =>
      runtime.onChange((id, next) => {
        if (id !== parameter.id) return;
        if (outputRef.current) outputRef.current.textContent = formatValue(parameter, next);
        const input = inputRef.current;
        if (!input || document.activeElement === input) return;
        if (parameter.type === 'toggle') input.checked = next;
        else input.value = String(next);
      }),
    [runtime, parameter],
  );

  function write(raw) {
    runtime.set(parameter.id, raw);
    if (outputRef.current) outputRef.current.textContent = formatValue(parameter, runtime.values[parameter.id]);
  }

  return (
    <label className="panel-row mb-2 block text-xs">
      <span className="mb-0.5 flex items-baseline justify-between text-neutral-300">
        <span>
          {parameter.label}
          {parameter.mode === 'rebuild' && (
            <span className="ml-1 text-amber-400" title="Rebuilds the scene">
              ↻
            </span>
          )}
        </span>
        <output ref={outputRef} className="tabular-nums text-neutral-500">
          {formatValue(parameter, value)}
        </output>
      </span>
      {parameter.type === 'range' && (
        // Rebuild ranges commit on release: writing per input tick would
        // remount the whole canvas dozens of times in one drag.
        <input
          ref={inputRef}
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          defaultValue={value}
          onInput={(event) => {
            if (parameter.mode === 'rebuild') {
              if (outputRef.current) outputRef.current.textContent = formatValue(parameter, Number(event.target.value));
            } else {
              write(event.target.value);
            }
          }}
          onChange={(event) => {
            if (parameter.mode === 'rebuild') write(event.target.value);
          }}
        />
      )}
      {parameter.type === 'toggle' && (
        <input ref={inputRef} type="checkbox" defaultChecked={value} onChange={(event) => write(event.target.checked)} />
      )}
      {parameter.type === 'select' && (
        <select
          ref={inputRef}
          defaultValue={value}
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
          onChange={(event) => write(event.target.value)}
        >
          {parameter.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
      {parameter.type === 'color' && (
        <input ref={inputRef} type="color" defaultValue={value} onInput={(event) => write(event.target.value)} />
      )}
    </label>
  );
}
