// hud.jsx — informational overlays: stats cards + event log + mini map
// Theme-aware via prop.

function StatCard({ label, value, unit, sub, theme }) {
  return (
    <div style={{
      border: `0.5px solid ${theme.inkFaint}`,
      background: theme.panelBg,
      backdropFilter: 'blur(8px)',
      padding: '8px 10px',
      minWidth: 96,
      fontFamily: 'JetBrains Mono, monospace',
      color: theme.inkStrong,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 1.2, opacity: 0.65, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 3 }}>{unit}</span>}
      </div>
      {sub != null && (
        <div style={{ fontSize: 8, opacity: 0.55, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{sub}</div>
      )}
    </div>
  );
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function Sparkline({ data, w = 120, h = 28, theme }) {
  if (!data.length) return <svg width={w} height={h} />;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => {
    const x = (i / Math.max(1, data.length - 1)) * (w - 2) + 1;
    const y = h - 1 - (v / max) * (h - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline fill="none" stroke={theme.inkStrong} strokeWidth="1" points={pts.join(' ')} />
      <line x1="0" y1={h - 0.5} x2={w} y2={h - 0.5} stroke={theme.inkFaint} strokeWidth="0.5" />
    </svg>
  );
}

function SeriesTile({ label, value, sub, data, theme }) {
  return (
    <div style={{
      border: `0.5px solid ${theme.inkFaint}`,
      background: theme.panelBg,
      padding: '8px 10px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 1.2, opacity: 0.6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{
        marginTop: 4,
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        color: theme.inkStrong,
      }}>
        {value}
      </div>
      <div style={{
        marginTop: 2,
        minHeight: 11,
        fontSize: 8,
        opacity: 0.52,
        textTransform: 'uppercase',
        letterSpacing: 0.08em,
      }}>
        {sub}
      </div>
      <div style={{ marginTop: 6 }}>
        <Sparkline data={data} w={132} h={24} theme={theme} />
      </div>
    </div>
  );
}

function AdvancedNetworkPanel({ snapshot, history, theme }) {
  if (!snapshot || !history) return null;
  const metrics = [
    {
      key: 'density',
      label: 'Density',
      value: `${(snapshot.density * 100).toFixed(1)}%`,
      sub: 'edge fill',
    },
    {
      key: 'avgDegree',
      label: 'Avg Degree',
      value: snapshot.avgDegree.toFixed(2),
      sub: 'unweighted',
    },
    {
      key: 'clustering',
      label: 'Clustering',
      value: snapshot.clustering.toFixed(3),
      sub: 'local mean',
    },
    {
      key: 'components',
      label: 'Components',
      value: String(snapshot.components).padStart(2, '0'),
      sub: 'connected sets',
    },
    {
      key: 'largestShare',
      label: 'Largest Comp',
      value: `${(snapshot.largestShare * 100).toFixed(0)}%`,
      sub: 'node share',
    },
    {
      key: 'avgWeight',
      label: 'Avg Weight',
      value: snapshot.avgWeight.toFixed(2),
      sub: 'per edge',
    },
  ];
  return (
    <div style={{
      position: 'absolute',
      top: 110,
      right: 46,
      width: 336,
      border: `0.5px solid ${theme.inkFaint}`,
      background: theme.panelBg,
      backdropFilter: 'blur(8px)',
      padding: '10px',
      fontFamily: 'JetBrains Mono, monospace',
      color: theme.inkStrong,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        gap: 12,
      }}>
        <div style={{ fontSize: 8, letterSpacing: 1.2, opacity: 0.6, textTransform: 'uppercase' }}>
          Network series
        </div>
        <div style={{ fontSize: 8, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.08em }}>
          rolling overlay
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
      }}>
        {metrics.map((metric) => (
          <SeriesTile
            key={metric.key}
            label={metric.label}
            value={metric.value}
            sub={metric.sub}
            data={history[metric.key] || []}
            theme={theme}
          />
        ))}
      </div>
    </div>
  );
}

function MiniMap({ farm, w = 140, h = 90, theme }) {
  if (!farm) return null;
  const sx = w / (farm.w || 1);
  const sy = h / (farm.h || 1);
  return (
    <svg width={w} height={h} style={{
      display: 'block',
      border: `0.5px solid ${theme.inkFaint}`,
      background: theme.panelBg,
    }}>
      {farm.agents.map(a => (
        <rect
          key={a.id}
          x={a.x * sx - 1}
          y={a.y * sy - 1}
          width="2"
          height="2"
          fill={a.engagedWith != null ? theme.ink : theme.inkMid}
        />
      ))}
      {farm.trades.map((t, i) => {
        const a = farm.agents[t.a]; const b = farm.agents[t.b];
        if (!a || !b) return null;
        return (
          <line key={i} x1={a.x * sx} y1={a.y * sy} x2={b.x * sx} y2={b.y * sy}
            stroke={theme.inkMid} strokeDasharray="1 2" />
        );
      })}
    </svg>
  );
}

function EventLog({ log, theme }) {
  const shown = log.slice(0, 6);
  return (
    <div style={{
      border: `0.5px solid ${theme.inkFaint}`,
      background: theme.panelBg,
      backdropFilter: 'blur(8px)',
      padding: '8px 10px',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 9.5,
      color: theme.inkStrong,
      minWidth: 230,
    }}>
      <div style={{ fontSize: 8, letterSpacing: 1.2, opacity: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
        Event Log
      </div>
      {shown.length === 0 && <div style={{ opacity: 0.5 }}>&gt; awaiting trades…</div>}
      {shown.map((e, i) => {
        const age = ((performance.now() - e.t) / 1000).toFixed(1);
        return (
          <div key={e.t + '-' + i} style={{
            display: 'flex', gap: 6,
            opacity: 1 - i * 0.12,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.6,
          }}>
            <span style={{ opacity: 0.55 }}>T-{age}s</span>
            <span>{e.a}</span>
            <span style={{ opacity: 0.55 }}>⇄</span>
            <span>{e.b}</span>
            <span style={{ opacity: 0.55 }}>[{e.r1}/{e.r2}]</span>
          </div>
        );
      })}
    </div>
  );
}

function HUD({ stats, farm, rateHistory, theme, view, onThemeChange, pilot, network }) {
  if (!stats) return null;
  const snapshot = network?.snapshot || null;
  const edgeCount = snapshot ? snapshot.edges : (farm ? farm.edges.size : 0);
  // density %: edges / maxPossible
  const density = snapshot
    ? (snapshot.density * 100).toFixed(1)
    : (((edgeCount / Math.max(1, (stats.count * (stats.count - 1)) / 2))) * 100).toFixed(1);
  const selectedAgent = pilot?.selectedAgent || null;
  return (
    <>
      <div style={{ position: 'absolute', top: 46, left: 46, display: 'flex', gap: 8 }}>
        <StatCard theme={theme} label="Agents" value={String(stats.count).padStart(2, '0')} sub={`${stats.active} active · ${stats.idle} idle`} />
        <StatCard theme={theme} label="Trades" value={String(stats.totalTrades).padStart(4, '0')} sub="Σ since boot" />
        <StatCard theme={theme} label="Rate" value={stats.rate.toFixed(2)} unit="t/s" sub="rolling 10s" />
        <StatCard theme={theme} label="Uptime" value={fmtTime(stats.uptime)} sub={`tick ${stats.tick.toFixed(1)}`} />
        {selectedAgent && (
          <StatCard
            theme={theme}
            label="Pilot"
            value={selectedAgent.label}
            sub={selectedAgent.engagedWith != null ? `linked ${farm.agents[selectedAgent.engagedWith]?.label || '--'}` : 'manual control'}
          />
        )}
        {view === 'network' && (
          <>
            <StatCard theme={theme} label="Edges" value={String(edgeCount).padStart(3, '0')} sub={`${density}% dense`} />
          </>
        )}
      </div>

      <div style={{
        position: 'absolute', top: 46, right: 46,
        border: `0.5px solid ${theme.inkFaint}`,
        background: theme.panelBg,
        backdropFilter: 'blur(8px)',
        padding: '8px 10px',
        fontFamily: 'JetBrains Mono, monospace',
        color: theme.inkStrong,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 4, gap: 10,
        }}>
          <div style={{ fontSize: 8, letterSpacing: 1.2, opacity: 0.6, textTransform: 'uppercase' }}>
            Trade rate
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {Object.keys(THEMES).map(k => {
              const th = THEMES[k];
              const active = theme.label === th.label;
              return (
                <button
                  key={k}
                  title={th.label}
                  onClick={() => onThemeChange && onThemeChange(k)}
                  style={{
                    cursor: 'pointer',
                    width: 10, height: 10, padding: 0,
                    borderRadius: '50%',
                    background: th.bg,
                    border: active
                      ? `1.5px solid ${theme.ink}`
                      : `0.5px solid ${theme.inkFaint}`,
                    boxShadow: active ? `0 0 0 1px ${theme.bg} inset` : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>
        <Sparkline data={rateHistory} w={160} h={36} theme={theme} />
      </div>

      {view === 'network' && network?.advanced && (
        <AdvancedNetworkPanel snapshot={snapshot} history={network.history} theme={theme} />
      )}

      <div style={{ position: 'absolute', bottom: 46, left: 46 }}>
        <EventLog log={farm ? farm.tradeLog : []} theme={theme} />
      </div>

      <div style={{
        position: 'absolute', bottom: 46, right: 46,
        display: 'flex', flexDirection: 'column', gap: 4,
        fontFamily: 'JetBrains Mono, monospace',
        color: theme.inkMid,
        fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase',
        alignItems: 'flex-end',
      }}>
        <div style={{ opacity: 0.7 }}>Topo</div>
        <MiniMap farm={farm} w={160} h={100} theme={theme} />
      </div>
    </>
  );
}

Object.assign(window, { HUD });
