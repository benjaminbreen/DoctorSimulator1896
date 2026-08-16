// One coin or note. Every denomination in purse.js currently carries a
// scanned image; the plain fallback exists so a new denomination added
// without art still renders something legible rather than a blank.

function Fallback({ piece, width }) {
  const note = piece.kind === 'note';
  return (
    <span
      className={note ? 'money-fallback money-fallback-note' : 'money-fallback money-fallback-coin'}
      style={{ width, height: note ? width * 0.42 : width }}
      role="img"
      aria-label={piece.label}
    >
      {piece.short}
    </span>
  );
}

export default function MoneyPiece({ piece, size = 46 }) {
  // Notes share one plate size; coins keep their real diameters relative to
  // the silver dollar, so a dime reads smaller than a half at a glance.
  const width = piece.kind === 'note'
    ? size * 2.1
    : size * (0.62 + (piece.mm / 38) * 0.38);

  if (!piece.image) return <Fallback piece={piece} width={width} />;
  return (
    <img
      className={piece.kind === 'note' ? 'money-note-img' : 'money-coin-img'}
      src={piece.image}
      alt={piece.label}
      width={Math.round(width)}
      draggable={false}
    />
  );
}
