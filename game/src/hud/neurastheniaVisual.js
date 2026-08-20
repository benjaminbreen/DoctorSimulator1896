const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function neurastheniaVisual(value) {
  const nerves = Math.min(100, Math.max(0, Number(value) || 0));
  const severity = clamp01((nerves - 45) / 55);
  const crisis = clamp01((nerves - 90) / 10);
  return {
    visible: severity > 0,
    severity,
    opacity: 0.08 + severity * 0.5 + crisis * 0.3,
    aperture: 74 - severity * 30 - crisis * 30,
    blur: 24 + severity * 44,
  };
}
