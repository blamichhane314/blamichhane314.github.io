// app.jsx — top-level React app

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "count": 29,
  "speed": 1.0,
  "interactionFreq": 1.0,
  "style": "blueprint",
  "theme": "paper",
  "view": "farm",
  "paused": false,
  "showHud": true
}/*EDITMODE-END*/;

function useFarm() {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const ref = React.useRef(null);
  const farmRef = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { size, ref, farmRef };
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const theme = THEMES[t.theme] || THEMES.paper;
  const { size, ref: hostRef, farmRef } = useFarm();
  const canvasRef = React.useRef(null);
  const [, force] = React.useReducer(n => n + 1, 0);
  const rateHistoryRef = React.useRef([]);
  const lastSampleRef = React.useRef(0);
  const stepOnceRef = React.useRef(false);
  const netStateRef = React.useRef({ positions: {} });
  const drawingRef = React.useRef(null);
  const [drawEnabled, setDrawEnabled] = React.useState(
    window.__agentFarmHostState?.drawEnabled ?? true
  );

  React.useEffect(() => {
    const syncDrawEnabled = (event) => {
      const next = event?.detail?.drawEnabled ?? window.__agentFarmHostState?.drawEnabled ?? true;
      setDrawEnabled(next);
      if (!next) drawingRef.current = null;
    };
    window.addEventListener('agent-farm-draw-change', syncDrawEnabled);
    return () => window.removeEventListener('agent-farm-draw-change', syncDrawEnabled);
  }, []);

  React.useEffect(() => {
    if (!size.w || !size.h) return;
    const FW = Math.max(200, size.w - 44);
    const FH = Math.max(200, size.h - 44);
    if (!farmRef.current) farmRef.current = new Farm(FW, FH, t.count);
    else { farmRef.current.resize(FW, FH); farmRef.current.setCount(t.count); }
  }, [size.w, size.h]);

  React.useEffect(() => {
    if (farmRef.current) farmRef.current.setCount(t.count);
  }, [t.count]);

  // reset network positions when switching to network view so layout settles fresh
  React.useEffect(() => {
    if (t.view === 'network') netStateRef.current = { positions: {} };
  }, [t.view]);

  React.useEffect(() => {
    let raf, last = performance.now(), uiTick = 0;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const farm = farmRef.current, canvas = canvasRef.current;
      if (farm && canvas) {
        if (!t.paused || stepOnceRef.current) {
          farm.step(dt, { speed: t.speed, interactionFreq: t.interactionFreq });
          stepOnceRef.current = false;
        }
        drawFarm(canvas, farm, {
          style: t.style, theme, view: t.view,
          netState: netStateRef.current,
          pendingObstacle: drawingRef.current,
        }, now / 1000);
        if (now - lastSampleRef.current > 250) {
          lastSampleRef.current = now;
          const s = farm.stats();
          rateHistoryRef.current.push(s.rate);
          if (rateHistoryRef.current.length > 80) rateHistoryRef.current.shift();
        }
        uiTick += dt;
        if (uiTick > 0.12) { uiTick = 0; force(); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [t.paused, t.speed, t.interactionFreq, t.style, t.theme, t.view]);

  const stats = farmRef.current ? farmRef.current.stats() : null;
  const canvasInset = 22;
  const hexSeed = t.view === 'network' ? 'NET' : 'FARM';
  const title = `${hexSeed}.0x${(Math.floor(stats?.uptime || 0) + 1337).toString(16).padStart(6, '0').toUpperCase().slice(-6)}`;

  return (
    <div
      ref={hostRef}
      style={{
        position: 'relative', width: '100%', height: '100%',
        background: theme.bg,
        transition: 'background .3s ease',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={(e) => {
          if (t.view !== 'farm' || !drawEnabled) return;
          const rect = e.currentTarget.getBoundingClientRect();
          drawingRef.current = {
            points: [[e.clientX - rect.left, e.clientY - rect.top]],
          };
          force();
        }}
        onMouseMove={(e) => {
          if (!drawingRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const pts = drawingRef.current.points;
          const nx = e.clientX - rect.left, ny = e.clientY - rect.top;
          const last = pts[pts.length - 1];
          if (Math.hypot(nx - last[0], ny - last[1]) > 4) {
            pts.push([nx, ny]);
          }
        }}
        onMouseUp={() => {
          if (!drawingRef.current) return;
          if (drawingRef.current.points.length > 1 && farmRef.current) {
            farmRef.current.obstacles.push(drawingRef.current);
          }
          drawingRef.current = null;
          force();
        }}
        onMouseLeave={() => {
          if (!drawingRef.current) return;
          if (drawingRef.current.points.length > 1 && farmRef.current) {
            farmRef.current.obstacles.push(drawingRef.current);
          }
          drawingRef.current = null;
        }}
        style={{
          position: 'absolute',
          top: canvasInset, left: canvasInset,
          width: `calc(100% - ${canvasInset * 2}px)`,
          height: `calc(100% - ${canvasInset * 2}px)`,
          display: 'block',
          cursor: t.view === 'farm' && drawEnabled ? 'crosshair' : 'default',
        }}
      />
      <Chrome style={t.style} title={title} theme={theme} />
      {t.showHud && (
        <HUD stats={stats} farm={farmRef.current}
             rateHistory={rateHistoryRef.current}
             theme={theme} view={t.view}
             onThemeChange={(k) => setTweak('theme', k)} />
      )}

      {/* View-mode tab switcher, centered top, inside margin */}
      <div style={{
        position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 0,
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        {['farm', 'network'].map(v => (
          <button
            key={v}
            onClick={() => setTweak('view', v)}
            style={{
              cursor: 'pointer',
              border: `0.5px solid ${theme.inkFaint}`,
              borderRight: v === 'farm' ? 'none' : `0.5px solid ${theme.inkFaint}`,
              background: t.view === v ? theme.ink : theme.panelBg,
              color: t.view === v ? theme.bg : theme.inkStrong,
              padding: '4px 14px',
              fontFamily: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit',
              textTransform: 'inherit',
            }}
          >
            {v === 'farm' ? '▦ Farm' : '◉ Network'}
          </button>
        ))}
      </div>

      <TweaksPanel>
        <TweakSection label="View" />
        <TweakRadio label="Mode" value={t.view}
          options={['farm', 'network']}
          onChange={v => setTweak('view', v)} />
        <TweakSection label="Theme" />
        <TweakSelect label="Theme" value={t.theme}
          options={Object.keys(THEMES).map(k => ({ value: k, label: THEMES[k].label }))}
          onChange={v => setTweak('theme', v)} />
        <TweakSection label="Population" />
        <TweakSlider label="Agents" value={t.count} min={3} max={60} step={1}
          onChange={v => setTweak('count', v)} />
        <TweakSection label="Motion" />
        <TweakSlider label="Speed" value={t.speed} min={0} max={3} step={0.05}
          onChange={v => setTweak('speed', v)} />
        <TweakSlider label="Interaction freq" value={t.interactionFreq} min={0} max={3} step={0.05}
          onChange={v => setTweak('interactionFreq', v)} />
        <TweakSection label="Playback" />
        <TweakToggle label="Paused" value={t.paused} onChange={v => setTweak('paused', v)} />
        <TweakButton label="Step once" onClick={() => { stepOnceRef.current = true; }} />
        <TweakButton label="Clear obstacles" onClick={() => { if (farmRef.current) farmRef.current.obstacles = []; }} />
        <TweakSection label="Style" />
        <TweakRadio label="Variant" value={t.style}
          options={['blueprint', 'vector', 'crt']}
          onChange={v => setTweak('style', v)} />
        <TweakToggle label="Show HUD" value={t.showHud} onChange={v => setTweak('showHud', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
