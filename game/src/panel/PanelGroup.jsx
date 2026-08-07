import PanelRow from './PanelRow.jsx';

export default function PanelGroup({ group, runtime, filter, epoch }) {
  const visible = group.parameters.filter(
    (parameter) =>
      !filter ||
      parameter.id.toLowerCase().includes(filter) ||
      parameter.label.toLowerCase().includes(filter),
  );
  if (visible.length === 0) return null;

  return (
    <details open className="mb-1">
      <summary className="cursor-pointer select-none py-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-400">
        {group.label}
      </summary>
      {visible.map((parameter) => (
        <PanelRow key={`${parameter.id}:${epoch}`} parameter={parameter} runtime={runtime} />
      ))}
    </details>
  );
}
