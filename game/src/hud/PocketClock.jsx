// The clock boss: painted beaux-arts chrome (public/ui/clock-chrome.png)
// with live hands drawn over it in SVG. The art carries the bezel, numerals
// and minute dots; code carries only what moves.
//
// The pivot and radii below were measured from the source image
// (mockups/clockface chrome ui.png) when the asset was cut — if the art is
// ever regenerated, re-measure rather than nudging by eye.

const PIVOT_X = 319.7;
const PIVOT_Y = 307.6;

const GOLD = '#c39a48';
const GOLD_BRIGHT = '#e8cd8a';
const GOLD_DEEP = '#7a5c1e';

export default function PocketClock({ hours, label }) {
  const minuteAngle = (hours % 1) * 360;
  const hourAngle = ((hours % 12) / 12) * 360;
  const origin = { transformOrigin: `${PIVOT_X}px ${PIVOT_Y}px` };

  return (
    <div className="ghud-clock-painted">
      <img src="/ui/clock-chrome.png" alt="" draggable="false" />
      <svg viewBox="0 0 640 620" role="img" aria-label={label} className="ghud-clock-hands">
        <defs>
          <linearGradient id="ghud-hand-metal" x1="0" y1="-1" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD_BRIGHT} />
            <stop offset="55%" stopColor={GOLD} />
            <stop offset="100%" stopColor={GOLD_DEEP} />
          </linearGradient>
        </defs>
        <g transform={`translate(${PIVOT_X} ${PIVOT_Y})`}>
          {/* hour, then minute: leaf-shaped, period spade style */}
          <g className="ghud-hand" style={{ transform: `rotate(${hourAngle}deg)`, ...origin }}>
            <path
              d="M0,38 C9,30 11.5,12 11.5,-12 C11.5,-55 7,-95 0,-132 C-7,-95 -11.5,-55 -11.5,-12 C-11.5,12 -9,30 0,38 Z"
              fill="url(#ghud-hand-metal)"
              stroke="rgba(20,14,2,0.5)"
              strokeWidth="1.5"
            />
          </g>
          <g className="ghud-hand" style={{ transform: `rotate(${minuteAngle}deg)`, ...origin }}>
            <path
              d="M0,44 C7,35 8.5,15 8.5,-18 C8.5,-80 4.5,-140 0,-186 C-4.5,-140 -8.5,-80 -8.5,-18 C-8.5,15 -7,35 0,44 Z"
              fill="url(#ghud-hand-metal)"
              stroke="rgba(20,14,2,0.5)"
              strokeWidth="1.5"
            />
          </g>
          <circle cx="0" cy="0" r="16" fill="url(#ghud-hand-metal)" stroke={GOLD_DEEP} strokeWidth="2" />
          <circle cx="0" cy="0" r="5.5" fill="#10241c" />
        </g>
      </svg>
    </div>
  );
}
