// chrome.jsx — blueprint border with tick marks, coords, corner crosshairs

function Chrome({ children, style, title = 'FARM.SIM', theme }) {
  // This component purely renders the border overlay + hosts children underneath.
  // Uses SVG for crisp tick marks; sits absolute-positioned above the canvas.
  const [dims, setDims] = React.useState({ w: 0, h: 0 });
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setDims({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const { w, h } = dims;
  const inset = 16;          // border inset from viewport
  const tickMajor = 100;
  const tickMinor = 20;

  // Generate tick labels
  const xTicks = [];
  for (let x = 0; x <= w - inset * 2; x += tickMajor) xTicks.push(x);
  const yTicks = [];
  for (let y = 0; y <= h - inset * 2; y += tickMajor) yTicks.push(y);

  const ink = theme?.inkStrong || 'rgba(42, 44, 56, 0.7)';
  const inkFaint = theme?.inkFaint || 'rgba(42, 44, 56, 0.28)';

  const corner = 14;

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      {children}
      {/* SVG overlay */}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        }}
      >
        {/* Outer frame rect */}
        <rect
          x={inset + 0.5}
          y={inset + 0.5}
          width={Math.max(0, w - inset * 2 - 1)}
          height={Math.max(0, h - inset * 2 - 1)}
          fill="none"
          stroke={ink}
          strokeWidth="1"
        />
        {/* Inner frame (thin) */}
        <rect
          x={inset + 5.5}
          y={inset + 5.5}
          width={Math.max(0, w - inset * 2 - 11)}
          height={Math.max(0, h - inset * 2 - 11)}
          fill="none"
          stroke={inkFaint}
          strokeWidth="0.5"
        />
        {/* Corner crosshairs */}
        {[
          [inset, inset],
          [w - inset, inset],
          [inset, h - inset],
          [w - inset, h - inset],
        ].map(([cx, cy], i) => (
          <g key={i} stroke={ink} strokeWidth="1" fill="none">
            <line x1={cx - corner} y1={cy} x2={cx + corner} y2={cy} />
            <line x1={cx} y1={cy - corner} x2={cx} y2={cy + corner} />
            <circle cx={cx} cy={cy} r="3" />
          </g>
        ))}

        {/* X-axis ticks (top + bottom) — tick labels outside top frame, skip first (covered by title) */}
        {xTicks.map((tx, i) => {
          const x = inset + tx;
          return (
            <g key={'xt' + i}>
              <line x1={x} y1={inset} x2={x} y2={inset + 6} stroke={ink} />
              <line x1={x} y1={h - inset - 6} x2={x} y2={h - inset} stroke={ink} />
              {i > 0 && (
                <text
                  x={x}
                  y={inset - 6}
                  fontSize="8"
                  fontFamily="JetBrains Mono, monospace"
                  fill={ink}
                  textAnchor="middle"
                >
                  {String(tx).padStart(4, '0')}
                </text>
              )}
            </g>
          );
        })}
        {/* minor x ticks */}
        {Array.from({ length: Math.floor((w - inset * 2) / tickMinor) + 1 }, (_, i) => i * tickMinor)
          .filter(x => x % tickMajor !== 0)
          .map((tx, i) => {
            const x = inset + tx;
            return (
              <g key={'xm' + i} stroke={inkFaint}>
                <line x1={x} y1={inset} x2={x} y2={inset + 3} />
                <line x1={x} y1={h - inset - 3} x2={x} y2={h - inset} />
              </g>
            );
          })}

        {/* Y-axis ticks (left + right) */}
        {yTicks.map((ty, i) => {
          const y = inset + ty;
          return (
            <g key={'yt' + i}>
              <line x1={inset} y1={y} x2={inset + 6} y2={y} stroke={ink} />
              <line x1={w - inset - 6} y1={y} x2={w - inset} y2={y} stroke={ink} />
              <text
                x={inset - 4}
                y={y + 3}
                fontSize="8"
                fontFamily="JetBrains Mono, monospace"
                fill={ink}
                textAnchor="end"
              >
                {String(ty).padStart(4, '0')}
              </text>
            </g>
          );
        })}
        {Array.from({ length: Math.floor((h - inset * 2) / tickMinor) + 1 }, (_, i) => i * tickMinor)
          .filter(y => y % tickMajor !== 0)
          .map((ty, i) => {
            const y = inset + ty;
            return (
              <g key={'ym' + i} stroke={inkFaint}>
                <line x1={inset} y1={y} x2={inset + 3} y2={y} />
                <line x1={w - inset - 3} y1={y} x2={w - inset} y2={y} />
              </g>
            );
          })}

        {/* Title strip above top frame (in margin, not over grid) */}
        <g fontFamily="JetBrains Mono, monospace" fill={ink}>
          <text x={inset + 4} y={inset - 5} fontSize="9" fontWeight="600" letterSpacing="1">
            {title}
          </text>
          <text x={w - inset - 4} y={h - inset + 11} fontSize="8" textAnchor="end" opacity="0.7">
            REV {new Date().toISOString().slice(0, 10)} · SHEET 01/01 · {style.toUpperCase()}
          </text>
        </g>
      </svg>
    </div>
  );
}

Object.assign(window, { Chrome });
