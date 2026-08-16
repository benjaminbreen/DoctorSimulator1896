// The engraved furniture of the working chrome: monogram cartouche, cameo
// silhouettes, and the small brass icons. All inline SVG so the whole bar
// ships as code and stays crisp at any scale. Painterly PNGs can replace
// individual pieces later without touching the layout.

import { useState } from 'react';

// Shared brass palette for strokes and fills inside the SVGs.
const GOLD = '#c39a48';
const GOLD_BRIGHT = '#e3c37c';
const GOLD_DEEP = '#8a6a26';
const GREEN_DEEP = '#0f211a';
const GREEN_FACE = '#1c3a2f';

let gradientSerial = 0;

// The practice monogram: a wreath of engraved leaves around a deep green
// field, the letter set in the display face by the browser (an SVG glyph
// would freeze the letterform; text keeps it married to the nameplate).
export function Monogram({ letter = 'B', size = 76 }) {
  const uid = `mono-${gradientSerial++}`;
  const leaves = [];
  const COUNT = 26;
  for (let i = 0; i < COUNT; i++) {
    const angle = (i * 360) / COUNT;
    const long = i % 2 === 0;
    leaves.push(
      <path
        key={i}
        d={long ? 'M0,-31.5 C1.8,-34.5 1.8,-37.5 0,-39.5 C-1.8,-37.5 -1.8,-34.5 0,-31.5 Z'
                : 'M0,-32 C1.4,-34.2 1.4,-36.4 0,-38 C-1.4,-36.4 -1.4,-34.2 0,-32 Z'}
        transform={`rotate(${angle})`}
        fill={long ? GOLD : GOLD_DEEP}
      />,
    );
  }
  return (
    <svg viewBox="-44 -44 88 88" width={size} height={size} aria-hidden="true" className="ghud-monogram-svg">
      <defs>
        <radialGradient id={`${uid}-field`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#2a4d3f" />
          <stop offset="70%" stopColor={GREEN_FACE} />
          <stop offset="100%" stopColor={GREEN_DEEP} />
        </radialGradient>
        <linearGradient id={`${uid}-rim`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD_BRIGHT} />
          <stop offset="55%" stopColor={GOLD} />
          <stop offset="100%" stopColor={GOLD_DEEP} />
        </linearGradient>
      </defs>
      {/* drop shadow so the boss reads as sitting proud of the bar */}
      <circle cx="0" cy="2.5" r="42" fill="rgba(8,12,9,0.4)" />
      <circle cx="0" cy="0" r="42" fill={GREEN_DEEP} />
      <circle cx="0" cy="0" r="40.8" fill="none" stroke={`url(#${uid}-rim)`} strokeWidth="2.2" />
      {leaves}
      <circle cx="0" cy="0" r="29.5" fill="none" stroke={GOLD_DEEP} strokeWidth="0.8" />
      <circle cx="0" cy="0" r="27.5" fill={`url(#${uid}-field)`} stroke={`url(#${uid}-rim)`} strokeWidth="1.4" />
      {/* four garnet studs on the diagonals, the one non-metal note */}
      {[45, 135, 225, 315].map((angle) => (
        <circle
          key={angle}
          cx={35 * Math.cos((angle * Math.PI) / 180)}
          cy={35 * Math.sin((angle * Math.PI) / 180)}
          r="1.9"
          fill="#7c2a1c"
          stroke={GOLD_DEEP}
          strokeWidth="0.5"
        />
      ))}
      <text
        x="0"
        y="1.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Cormorant', serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="40"
        fill={`url(#${uid}-rim)`}
      >
        {letter}
      </text>
    </svg>
  );
}

// Cameo silhouettes for the queue until portraits exist. Three busts:
// profiles cut from dark sepia on a lighter ground, ringed in brass.
const BUSTS = {
  woman:
    'M 8.2,21.5 C 8.6,17.5 10.4,15.9 12.4,14.9 C 11.2,13.9 10.5,12.4 10.6,10.6 C 9.9,10.5 9.6,9.9 9.8,9.3 C 10,8.8 10.4,8.6 10.8,8.2 C 10.9,5.4 12.6,3.4 15,3.2 C 17.1,3 18.9,4.3 19.4,6.3 C 19.8,8.1 19.3,9.8 18.5,11.2 C 18.1,12.9 17.4,14.2 16.3,15 C 18.6,16 20.3,17.7 20.7,21.5 Z',
  man:
    'M 7.8,21.5 C 8.3,17.3 10.3,15.7 12.6,14.8 C 11.3,13.7 10.6,12 10.7,10 C 10.7,6.2 12.5,3.8 15.1,3.8 C 17.7,3.8 19.4,6.1 19.4,9.4 C 19.4,11.6 18.7,13.5 17.5,14.7 C 19.9,15.6 21.1,17.2 21.6,21.5 Z',
  bearded:
    'M 7.8,21.5 C 8.3,17.6 10,16 12.2,15.1 C 11.1,14.5 10.5,13.4 10.5,11.9 C 10.5,11 10.2,10.6 10.3,9.7 C 10.5,6.3 12.3,4.2 14.9,4.2 C 17.4,4.2 19.2,6.3 19.2,9.2 C 19.2,10.3 19.6,12.1 18.9,13.7 C 18.4,14.9 17.4,16.2 16.1,16.6 C 18.8,17.1 20.9,18 21.4,21.5 Z',
};

export function Cameo({ variant = 'man', seen = false, size = 27 }) {
  const uid = `cameo-${gradientSerial++}`;
  return (
    <svg
      viewBox="0 0 29 29"
      width={size}
      height={size}
      aria-hidden="true"
      className={`ghud-cameo${seen ? ' ghud-cameo--seen' : ''}`}
    >
      <defs>
        <radialGradient id={`${uid}-ground`} cx="40%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ddc9a2" />
          <stop offset="100%" stopColor="#b99e6f" />
        </radialGradient>
      </defs>
      <circle cx="14.5" cy="14.5" r="13.7" fill={`url(#${uid}-ground)`} stroke={GOLD_DEEP} strokeWidth="1.1" />
      <circle cx="14.5" cy="14.5" r="12.4" fill="none" stroke="rgba(120,90,40,0.35)" strokeWidth="0.6" />
      <path d={BUSTS[variant] ?? BUSTS.man} transform="translate(0.2,1.2) scale(0.93)" fill="#3d2c1a" />
    </svg>
  );
}

// A patient's own portrait in the cameo's brass ring. Falls back to the
// engraved silhouette when a queue entry has no portrait yet, so procedurally
// added patients degrade instead of leaving a hole in the row.
export function PortraitCameo({
  src, label, name, age, occupation, variant = 'man', seen = false, size = 27, onClick,
}) {
  const [failed, setFailed] = useState(false);
  const face = !src || failed
    ? <Cameo variant={variant} seen={seen} size={size} />
    : (
      <span
        className={`ghud-portrait-cameo${seen ? ' ghud-cameo--seen' : ''}`}
        style={{ width: size, height: size }}
      >
        <img src={src} alt="" onError={() => setFailed(true)} draggable={false} />
      </span>
    );
  if (!onClick) return face;
  return (
    <button type="button" className="ghud-cameo-button" onClick={onClick} aria-label={label}>
      {face}
      {name && (
        <span className="ghud-cameo-tip" role="tooltip">
          <strong>{name}{age ? `, ${age}` : ''}</strong>
          {occupation && <em>{occupation}</em>}
          <small>Click for more</small>
        </span>
      )}
    </button>
  );
}

// --- Small brass icons. One stroke weight, round caps, quiet detail. ---

const iconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function PinIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" {...iconProps}>
      <path d="M8 1.8 C 10.8,1.8 12.6,3.8 12.6,6.4 C 12.6,9.4 8,14.2 8,14.2 C 8,14.2 3.4,9.4 3.4,6.4 C 3.4,3.8 5.2,1.8 8,1.8 Z" />
      <circle cx="8" cy="6.3" r="1.7" />
    </svg>
  );
}

export function EnvelopeIcon({ size = 24 }) {
  return (
    <svg viewBox="0 0 26 19" width={size} height={size * (19 / 26)} aria-hidden="true" {...iconProps}>
      <rect x="1.6" y="1.6" width="22.8" height="15.8" rx="1.4" />
      <path d="M2.2 2.6 L13 10.4 L23.8 2.6" />
      <path d="M2.4 16.4 L9.6 9.6 M23.6 16.4 L16.4 9.6" strokeWidth="1" opacity="0.55" />
      <circle cx="13" cy="12.8" r="1.7" fill="#7c2a1c" stroke="none" opacity="0.9" />
    </svg>
  );
}

export function HeartIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 16 15" width={size} height={size * (15 / 16)} aria-hidden="true">
      <path
        d="M8 13.6 C 8 13.6 1.2 9.6 1.2 4.9 C 1.2 2.7 2.9 1.2 4.8 1.2 C 6.2 1.2 7.4 2 8 3.2 C 8.6 2 9.8 1.2 11.2 1.2 C 13.1 1.2 14.8 2.7 14.8 4.9 C 14.8 9.6 8 13.6 8 13.6 Z"
        fill="currentColor"
      />
      <path d="M4.1 4.2 C 4.4 3.4 5.1 2.9 5.9 2.9" fill="none" stroke={GOLD_BRIGHT} strokeWidth="0.9" strokeLinecap="round" />
    </svg>
  );
}

export function BrainIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 17 15" width={size} height={size * (15 / 17)} aria-hidden="true">
      <path
        d="M8.5 1.4 C 6.9 0.4 4.4 1 3.6 2.6 C 2 2.9 1 4.3 1.3 5.9 C 0.5 7 0.7 8.7 1.7 9.6 C 1.6 11.3 2.9 12.6 4.6 12.6 C 5.3 13.8 7.1 14.3 8.5 13.5 C 9.9 14.3 11.7 13.8 12.4 12.6 C 14.1 12.6 15.4 11.3 15.3 9.6 C 16.3 8.7 16.5 7 15.7 5.9 C 16 4.3 15 2.9 13.4 2.6 C 12.6 1 10.1 0.4 8.5 1.4 Z"
        fill="currentColor"
      />
      <path
        d="M8.5 1.9 L8.5 13.2 M5.4 4.1 C 6.6 4.6 6.9 5.8 6.1 6.9 M11.6 4.1 C 10.4 4.6 10.1 5.8 10.9 6.9 M4 8.3 C 5.2 8.1 6.2 8.9 6.2 10.1 M13 8.3 C 11.8 8.1 10.8 8.9 10.8 10.1"
        fill="none"
        stroke={GREEN_FACE}
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Tiny bust outline for patient entries in the casebook index.
export function PersonIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 14 14" width={size} height={size} aria-hidden="true" {...iconProps}>
      <circle cx="7" cy="4.4" r="2.7" />
      <path d="M1.9 12.6 C 2.6 9.6 4.5 8.2 7 8.2 C 9.5 8.2 11.4 9.6 12.1 12.6" />
    </svg>
  );
}

export function EyeIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 18 11" width={size} height={size * (11 / 18)} aria-hidden="true" {...iconProps}>
      <path d="M1.4 5.5 C 3.4 2.2 6 0.9 9 0.9 C 12 0.9 14.6 2.2 16.6 5.5 C 14.6 8.8 12 10.1 9 10.1 C 6 10.1 3.4 8.8 1.4 5.5 Z" />
      <circle cx="9" cy="5.5" r="2.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// A sealed envelope for the letters list, engraved in the ink of its card:
// gold on the opened plaque, olive on waiting post. Red wax marks unread.
export function SealedEnvelopeIcon({ size = 38, unread = false }) {
  return (
    <svg
      viewBox="0 0 34 26"
      width={size}
      height={size * (26 / 34)}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.8" y="1.8" width="30.4" height="22.4" rx="1.6" />
      <path d="M2.6 3 L17 13.4 L31.4 3" strokeWidth="1.1" />
      <circle cx="17" cy="16" r="3.6" fill={unread ? '#8f3020' : 'none'} strokeWidth="1" />
      <circle cx="17" cy="16" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Small arrow-and-bud flourish flanking an eyebrow label.
export function EyebrowArrow({ flip = false, size = 30 }) {
  return (
    <svg
      viewBox="0 0 30 10"
      width={size}
      height={size * (10 / 30)}
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
    >
      <path d="M1.5 5 L23.5 5" />
      <path d="M19.5 2.4 C 21.5 3.5 22.8 4.4 24 5 C 22.8 5.6 21.5 6.5 19.5 7.6" />
      <circle cx="27.5" cy="5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BookIcon({ size = 17 }) {
  return (
    <svg viewBox="0 0 20 16" width={size} height={size * (16 / 20)} aria-hidden="true" {...iconProps}>
      <path d="M10 3 C 8 1.6 5 1.2 1.8 1.8 L1.8 13.4 C 5 12.8 8 13.2 10 14.6 C 12 13.2 15 12.8 18.2 13.4 L18.2 1.8 C 15 1.2 12 1.6 10 3 Z" />
      <path d="M10 3 L10 14.6" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

export function ArchiveBoxIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 18 16" width={size} height={size * (16 / 18)} aria-hidden="true" {...iconProps}>
      <rect x="1.6" y="1.6" width="14.8" height="4" rx="0.8" />
      <path d="M3 5.6 L3 13.2 C 3 13.9 3.5 14.4 4.2 14.4 L13.8 14.4 C 14.5 14.4 15 13.9 15 13.2 L15 5.6" />
      <path d="M7 8.4 L11 8.4" strokeWidth="1.2" />
    </svg>
  );
}

// Engraved rule with a central palmette, for under a letterhead.
export function FlourishRule() {
  return (
    <svg viewBox="0 0 220 14" width="220" height="14" aria-hidden="true" className="ghud-flourish">
      <g stroke={GOLD} strokeWidth="0.9" fill="none" strokeLinecap="round">
        <path d="M4 7 L92 7 M128 7 L216 7" />
        <path d="M92 7 C 96 4.5 100 4.5 103 7 M128 7 C 124 4.5 120 4.5 117 7" />
      </g>
      <path
        d="M110 2.4 C 111.8 4.4 111.8 6.8 110 8.6 C 108.2 6.8 108.2 4.4 110 2.4 Z M105.5 8.8 C 107.3 7.6 109 7.6 110 8.8 C 109 10 107.3 10 105.5 8.8 Z M114.5 8.8 C 112.7 7.6 111 7.6 110 8.8 C 111 10 112.7 10 114.5 8.8 Z"
        fill={GOLD}
      />
    </svg>
  );
}

// A medicine bottle, for prescription chips.
export function BottleIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 12 16" width={size * (12 / 16)} height={size} aria-hidden="true" {...iconProps}>
      <path d="M4.4 1.6 L7.6 1.6 M4.8 1.6 L4.8 4.2 C 3 5.2 2.2 6.6 2.2 8.6 L2.2 13.2 C 2.2 14 2.8 14.6 3.6 14.6 L8.4 14.6 C 9.2 14.6 9.8 14 9.8 13.2 L9.8 8.6 C 9.8 6.6 9 5.2 7.2 4.2 L7.2 1.6" />
      <path d="M2.2 9.4 L9.8 9.4" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

// A coin bearing the dollar sign, for invoice chips.
export function CoinIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" {...iconProps}>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 4.4 L8 11.6 M10 5.8 C 9.4 5.2 6.8 5 6.3 6.4 C 5.8 7.8 7.4 8 8 8.1 C 8.6 8.2 10.2 8.4 9.7 9.8 C 9.2 11.2 6.6 11 6 10.4" strokeWidth="1.2" />
    </svg>
  );
}

// A four-petal fleuron, the news-item bullet.
export function QuatrefoilIcon({ size = 11 }) {
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true">
      <path
        d="M6 0.8 C 7 2.4 7 4 6 5.2 C 5 4 5 2.4 6 0.8 Z M6 11.2 C 7 9.6 7 8 6 6.8 C 5 8 5 9.6 6 11.2 Z M0.8 6 C 2.4 5 4 5 5.2 6 C 4 7 2.4 7 0.8 6 Z M11.2 6 C 9.6 5 8 5 6.8 6 C 8 7 9.6 7 11.2 6 Z"
        fill={GOLD}
      />
      <circle cx="6" cy="6" r="1" fill={GOLD_DEEP} />
    </svg>
  );
}

// A return arrow, for the Back verb.
export function ReturnIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 17 14" width={size} height={size * (14 / 17)} aria-hidden="true" {...iconProps}>
      <path d="M6.2 2 L2.2 5.6 L6.2 9.2" />
      <path d="M2.6 5.6 L11 5.6 C 13.4 5.6 15 7.2 15 9.4 C 15 11.6 13.4 12.6 11.4 12.6 L8.4 12.6" />
    </svg>
  );
}

// --- Placeholder verbs for the action bar: plain line engravings. ---

export function WatchIcon({ size = 32 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...iconProps}>
      <circle cx="12" cy="13.2" r="7.6" />
      <circle cx="12" cy="13.2" r="5.9" strokeWidth="0.8" opacity="0.6" />
      <path d="M12 9.4 L12 13.2 L14.8 14.9" />
      <path d="M10.4 4.3 L13.6 4.3 M12 4.3 L12 5.6" />
      <path d="M10.9 3 C 10.9 2.2 13.1 2.2 13.1 3" strokeWidth="1.2" />
    </svg>
  );
}

export function WalletIcon({ size = 32 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...iconProps}>
      <rect x="2.8" y="6.2" width="18.4" height="12.6" rx="1.8" />
      <path d="M2.8 9.8 L21.2 9.8" strokeWidth="0.9" opacity="0.6" />
      <path d="M15.2 12.4 L21.2 12.4 L21.2 16.2 L15.2 16.2 C 14.1 16.2 13.3 15.4 13.3 14.3 C 13.3 13.2 14.1 12.4 15.2 12.4 Z" />
      <circle cx="15.9" cy="14.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function NotebookIcon({ size = 32 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...iconProps}>
      <rect x="4" y="3.4" width="13.6" height="17.2" rx="1.4" />
      <path d="M7.2 3.4 L7.2 20.6" strokeWidth="0.9" opacity="0.6" />
      <path d="M9.8 8 L14.6 8 M9.8 11 L14.6 11" strokeWidth="0.9" opacity="0.6" />
      <path d="M20.8 6.2 L15.4 17.8 L14.6 20.9 L16.9 18.5 L21.9 7.4 C 22.2 6.7 21.9 6.1 21.3 5.9 C 21.1 5.8 20.9 6 20.8 6.2 Z" />
    </svg>
  );
}
