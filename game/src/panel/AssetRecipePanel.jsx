import { useRef, useState } from 'react';
import {
  assetBuildStats,
  createAssetRecipe,
  createScatterRecipe,
  nextSeed,
  scatterSchema,
  setRecipeValue,
  setScatterValue,
  validateAssetRecipe,
  validateScatterRecipe,
  varyAssetRecipe,
} from '../world/proceduralAssets.js';
import { labelFont } from '../world/labelFonts.js';

function formatValue(parameter, value) {
  if (parameter.type === 'text') return `${String(value).length}/${parameter.maxLength ?? 80}`;
  if (parameter.type !== 'range') return String(value);
  const decimals = parameter.step < 0.01 ? 3 : parameter.step < 1 ? 2 : 0;
  return Number(value).toFixed(decimals);
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Field({ parameter, value, values, onChange }) {
  const previewFont = parameter.fontSelector
    ? labelFont(values[parameter.fontSelector]).cssFamily
    : undefined;
  return (
    <label className="panel-row mb-2 block text-xs">
      <span className="mb-0.5 flex items-baseline justify-between text-neutral-300">
        <span>{parameter.label}</span>
        <output className="tabular-nums text-neutral-500">{formatValue(parameter, value)}</output>
      </span>
      {parameter.type === 'range' && (
        <input
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={value}
          onInput={(event) => onChange(event.target.value)}
        />
      )}
      {parameter.type === 'toggle' && (
        <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      )}
      {parameter.type === 'color' && (
        <input type="color" value={value} onInput={(event) => onChange(event.target.value)} />
      )}
      {parameter.type === 'text' && (
        <input
          type="text"
          value={value}
          maxLength={parameter.maxLength ?? 80}
          spellCheck={false}
          style={{ fontFamily: previewFont }}
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-base text-amber-50"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {parameter.type === 'select' && (
        <select
          value={value}
          style={{ fontFamily: parameter.fontPreview ? labelFont(value).cssFamily : undefined }}
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
          onChange={(event) => onChange(event.target.value)}
        >
          {parameter.options.map((option) => (
            <option key={option} value={option}>{parameter.optionLabels?.[option] ?? option}</option>
          ))}
        </select>
      )}
    </label>
  );
}

function SchemaFields({ schema, values, onChange }) {
  return schema.groups.map((group) => (
    <details key={group.id} open className="mb-1">
      <summary className="cursor-pointer select-none py-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-400">
        {group.label}
      </summary>
      {group.parameters.map((parameter) => (
        <Field
          key={parameter.id}
          parameter={parameter}
          value={values[parameter.id]}
          values={values}
          onChange={(value) => onChange(parameter.id, value)}
        />
      ))}
    </details>
  ));
}

function SmallButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export default function AssetRecipePanel({
  row,
  recipe,
  scatterRecipe,
  items,
  showScatter,
  onRecipeChange,
  onScatterChange,
}) {
  const fileRef = useRef(null);
  const importKind = useRef('asset');
  const [message, setMessage] = useState('');
  const stats = assetBuildStats(items);
  const errors = validateAssetRecipe(row, recipe);
  const budget = row.performanceBudget ?? {};
  if (budget.maxParts && stats.parts > budget.maxParts) errors.push(`part budget exceeded: ${stats.parts}/${budget.maxParts}`);
  if (budget.maxMaterials && stats.materials > budget.maxMaterials) errors.push(`material budget exceeded: ${stats.materials}/${budget.maxMaterials}`);
  const scatterErrors = showScatter ? validateScatterRecipe(scatterRecipe) : [];

  function chooseImport(kind) {
    importKind.current = kind;
    fileRef.current?.click();
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (importKind.current === 'scatter') {
        const nextErrors = validateScatterRecipe(parsed);
        if (nextErrors.length) throw new Error(nextErrors.join('; '));
        onScatterChange(createScatterRecipe(parsed));
      } else {
        const nextErrors = validateAssetRecipe(row, parsed);
        if (nextErrors.length) throw new Error(nextErrors.join('; '));
        onRecipeChange(createAssetRecipe(row, parsed));
      }
      setMessage(`Imported ${file.name}`);
    } catch (error) {
      setMessage(`Import failed: ${error.message}`);
    }
  }

  async function copyJson(value) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setMessage('Recipe copied');
    } catch {
      setMessage('Clipboard unavailable; use Export instead');
    }
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-900">
      <header className="border-b border-neutral-800 px-4 py-3">
        <p className="text-sm font-semibold text-amber-200">Procedural asset</p>
        <p className="mt-1 text-[11px] text-neutral-500">
          {row.family} · recipe v{recipe.schemaVersion} · {recipe.historicalStatus}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <SmallButton onClick={() => onRecipeChange(createAssetRecipe(row))}>Reset</SmallButton>
          <SmallButton onClick={() => onRecipeChange(varyAssetRecipe(row, recipe))}>Vary shape</SmallButton>
          <SmallButton onClick={() => downloadJson(recipe, `${row.family}-${recipe.seed}.json`)}>Export</SmallButton>
          <SmallButton onClick={() => chooseImport('asset')}>Import</SmallButton>
          <SmallButton onClick={() => copyJson(recipe)}>Copy JSON</SmallButton>
          <SmallButton onClick={() => onRecipeChange(createAssetRecipe(row, { ...recipe, seed: nextSeed(recipe.seed) }))}>
            New seed
          </SmallButton>
        </div>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importFile} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        <label className="mb-2 block text-xs">
          <span className="mb-0.5 block text-neutral-300">Asset seed</span>
          <input
            type="number"
            value={recipe.seed}
            onChange={(event) => onRecipeChange(createAssetRecipe(row, { ...recipe, seed: event.target.value }))}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 tabular-nums"
          />
        </label>
        <SchemaFields
          schema={row.schema}
          values={recipe.values}
          onChange={(id, value) => onRecipeChange(setRecipeValue(row, recipe, id, value))}
        />

        {showScatter && (
          <section className="mt-3 border-t border-neutral-700 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Scatter recipe</p>
              <div className="flex gap-1">
                <SmallButton onClick={() => downloadJson(scatterRecipe, `${row.family}-scatter-${scatterRecipe.seed}.json`)}>Export</SmallButton>
                <SmallButton onClick={() => chooseImport('scatter')}>Import</SmallButton>
              </div>
            </div>
            <label className="my-2 block text-xs">
              <span className="mb-0.5 flex items-center justify-between text-neutral-300">
                <span>Scatter seed</span>
                <button
                  type="button"
                  className="text-[10px] text-amber-300 hover:text-amber-200"
                  onClick={() => onScatterChange(createScatterRecipe({ ...scatterRecipe, seed: nextSeed(scatterRecipe.seed) }))}
                >
                  New seed
                </button>
              </span>
              <input
                type="number"
                value={scatterRecipe.seed}
                onChange={(event) => onScatterChange(createScatterRecipe({ ...scatterRecipe, seed: event.target.value }))}
                className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 tabular-nums"
              />
            </label>
            <SchemaFields
              schema={scatterSchema}
              values={scatterRecipe.values}
              onChange={(id, value) => onScatterChange(setScatterValue(scatterRecipe, id, value))}
            />
          </section>
        )}
      </div>

      <footer className="border-t border-neutral-800 px-4 py-2 text-[10px] leading-relaxed text-neutral-500">
        <p>{stats.items} items · {stats.parts} render parts · {stats.materials} materials · {stats.modelReferences} model refs</p>
        {errors.length === 0 && scatterErrors.length === 0 ? (
          <p className="text-emerald-400">Recipe and budget checks pass</p>
        ) : (
          [...errors, ...scatterErrors].map((error) => <p key={error} className="text-red-400">{error}</p>)
        )}
        {message && <p className="mt-1 text-amber-300">{message}</p>}
      </footer>
    </aside>
  );
}
