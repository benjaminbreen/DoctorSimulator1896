// Preset export/import as JSON files, matching character-lab's preset flow.

export function downloadPreset(runtime, filename = 'ghosts-tuning.json') {
  const blob = new Blob([JSON.stringify(runtime.toPreset(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importPresetFile(runtime, file) {
  runtime.applyPreset(JSON.parse(await file.text()));
}
