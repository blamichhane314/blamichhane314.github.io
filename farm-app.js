// app.jsx — top-level React app

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "count": 29,
  "speed": 1.0,
  "interactionFreq": 1.0,
  "style": "blueprint",
  "theme": "paper",
  "view": "farm",
  "paused": false,
  "showHud": true,
  "showAdvanced": false
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

function resolveInteractionMode(mode) {
  return mode === 'pilot' || mode === 'hybrid' ? mode : 'draw';
}

function isEditableTarget(target) {
  return target instanceof Element &&
    !!target.closest('input, select, textarea, button, [contenteditable="true"]');
}

function pickAgentAtPoint(farm, x, y, view, netState) {
  if (!farm) return null;
  let bestId = null;
  let bestDist = Infinity;
  const hitRadius = view === 'network' ? 24 : 22;
  if (view === 'network') {
    const positions = netState?.positions || {};
    for (const a of farm.agents) {
      const p = positions[a.id];
      if (!p) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < hitRadius && d < bestDist) {
        bestId = a.id;
        bestDist = d;
      }
    }
    return bestId;
  }
  for (const a of farm.agents) {
    const ay = a.y + Math.sin(a.bob) * 0.6;
    const d = Math.hypot(x - a.x, y - ay);
    if (d < hitRadius && d < bestDist) {
      bestId = a.id;
      bestDist = d;
    }
  }
  return bestId;
}

function emptyNetworkHistory() {
  return {
    density: [],
    avgDegree: [],
    clustering: [],
    components: [],
    largestShare: [],
    avgWeight: [],
  };
}

function computeNetworkSnapshot(farm) {
  if (!farm) {
    return {
      edges: 0,
      density: 0,
      avgDegree: 0,
      clustering: 0,
      components: 0,
      largestShare: 0,
      avgWeight: 0,
    };
  }
  const n = farm.agents.length;
  const neighbors = Array.from({ length: n }, () => new Set());
  let edgeCount = 0;
  let totalWeight = 0;
  for (const e of farm.edges.values()) {
    if (!farm.agents[e.a] || !farm.agents[e.b]) continue;
    neighbors[e.a].add(e.b);
    neighbors[e.b].add(e.a);
    edgeCount++;
    totalWeight += e.weight;
  }
  const density = n > 1 ? edgeCount / ((n * (n - 1)) / 2) : 0;
  const avgDegree = n ? (edgeCount * 2) / n : 0;

  let components = 0;
  let largest = 0;
  const seen = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    components++;
    let size = 0;
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const node = stack.pop();
      size++;
      for (const next of neighbors[node]) {
        if (seen[next]) continue;
        seen[next] = true;
        stack.push(next);
      }
    }
    largest = Math.max(largest, size);
  }

  let clusteringSum = 0;
  let clusteringCount = 0;
  for (let i = 0; i < n; i++) {
    const adj = Array.from(neighbors[i]);
    const k = adj.length;
    if (k < 2) continue;
    let links = 0;
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        if (neighbors[adj[a]].has(adj[b])) links++;
      }
    }
    clusteringSum += links / ((k * (k - 1)) / 2);
    clusteringCount++;
  }

  return {
    edges: edgeCount,
    density,
    avgDegree,
    clustering: clusteringCount ? clusteringSum / clusteringCount : 0,
    components,
    largestShare: n ? largest / n : 0,
    avgWeight: edgeCount ? totalWeight / edgeCount : 0,
  };
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const theme = THEMES[t.theme] || THEMES.paper;
  const { size, ref: hostRef, farmRef } = useFarm();
  const canvasRef = React.useRef(null);
  const [, force] = React.useReducer(n => n + 1, 0);
  const rateHistoryRef = React.useRef([]);
  const networkHistoryRef = React.useRef(emptyNetworkHistory());
  const lastSampleRef = React.useRef(0);
  const stepOnceRef = React.useRef(false);
  const netStateRef = React.useRef({ positions: {} });
  const drawingRef = React.useRef(null);
  const [interactionMode, setInteractionMode] = React.useState(
    resolveInteractionMode(window.__agentFarmHostState?.interactionMode)
  );
  const [selectedAgentId, setSelectedAgentId] = React.useState(null);
  const pilotInputRef = React.useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    boost: false,
    brake: false,
  });
  const canDraw = interactionMode === 'draw' || interactionMode === 'hybrid';
  const canPilot = interactionMode === 'pilot' || interactionMode === 'hybrid';

  React.useEffect(() => {
    const syncInteractionState = (event) => {
      const detail = event?.detail || window.__agentFarmHostState || {};
      const nextMode = resolveInteractionMode(detail.interactionMode);
      setInteractionMode(nextMode);
      if (nextMode === 'pilot') drawingRef.current = null;
    };
    window.addEventListener('agent-farm-draw-change', syncInteractionState);
    window.addEventListener('agent-farm-interaction-mode-change', syncInteractionState);
    return () => {
      window.removeEventListener('agent-farm-draw-change', syncInteractionState);
      window.removeEventListener('agent-farm-interaction-mode-change', syncInteractionState);
    };
  }, []);

  React.useEffect(() => {
    if (selectedAgentId == null) return;
    if (!farmRef.current?.agents[selectedAgentId]) setSelectedAgentId(null);
  }, [selectedAgentId, t.count, size.w, size.h]);

  React.useEffect(() => {
    if (canPilot) return;
    pilotInputRef.current = {
      up: false,
      down: false,
      left: false,
      right: false,
      boost: false,
      brake: false,
    };
    setSelectedAgentId(null);
  }, [canPilot]);

  React.useEffect(() => {
    const setKey = (event, next) => {
      if (isEditableTarget(event.target)) return false;
      if (!canPilot && event.key !== 'Escape') return false;
      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          pilotInputRef.current.up = next;
          return true;
        case 'ArrowDown':
        case 's':
        case 'S':
          pilotInputRef.current.down = next;
          return true;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          pilotInputRef.current.left = next;
          return true;
        case 'ArrowRight':
        case 'd':
        case 'D':
          pilotInputRef.current.right = next;
          return true;
        case 'Shift':
          pilotInputRef.current.boost = next;
          return true;
        case ' ':
        case 'Spacebar':
        case 'Space':
          pilotInputRef.current.brake = next;
          return true;
        case 'Escape':
          if (next) setSelectedAgentId(null);
          return true;
        default:
          return false;
      }
    };
    const onKeyDown = (event) => {
      if (setKey(event, true)) event.preventDefault();
    };
    const onKeyUp = (event) => {
      if (setKey(event, false)) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [canPilot]);

  React.useEffect(() => {
    if (!size.w || !size.h) return;
    const FW = Math.max(200, size.w - 44);
    const FH = Math.max(200, size.h - 44);
    if (!farmRef.current) farmRef.current = new Farm(FW, FH, t.count);
    else { farmRef.current.resize(FW, FH); farmRef.current.setCount(t.count); }
  }, [size.w, size.h]);

  React.useEffect(() => {
    if (farmRef.current) farmRef.current.setCount(t.count);
    networkHistoryRef.current = emptyNetworkHistory();
    rateHistoryRef.current = [];
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
          farm.step(dt, {
            speed: t.speed,
            interactionFreq: t.interactionFreq,
            pilot: canPilot && selectedAgentId != null
              ? { agentId: selectedAgentId, input: pilotInputRef.current }
              : null,
          });
          stepOnceRef.current = false;
        }
        drawFarm(canvas, farm, {
          style: t.style, theme, view: t.view,
          netState: netStateRef.current,
          pendingObstacle: drawingRef.current,
          selectedAgentId,
        }, now / 1000);
        if (now - lastSampleRef.current > 250) {
          lastSampleRef.current = now;
          const s = farm.stats();
          const net = computeNetworkSnapshot(farm);
          rateHistoryRef.current.push(s.rate);
          if (rateHistoryRef.current.length > 80) rateHistoryRef.current.shift();
          for (const key of Object.keys(networkHistoryRef.current)) {
            networkHistoryRef.current[key].push(net[key]);
            if (networkHistoryRef.current[key].length > 80) {
              networkHistoryRef.current[key].shift();
            }
          }
        }
        uiTick += dt;
        if (uiTick > 0.12) { uiTick = 0; force(); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [t.paused, t.speed, t.interactionFreq, t.style, t.theme, t.view, canPilot, selectedAgentId]);

  const stats = farmRef.current ? farmRef.current.stats() : null;
  const networkSnapshot = farmRef.current ? computeNetworkSnapshot(farmRef.current) : null;
  const selectedAgent = selectedAgentId != null ? farmRef.current?.agents[selectedAgentId] || null : null;
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
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          if (canPilot) {
            const pickedId = pickAgentAtPoint(farmRef.current, px, py, t.view, netStateRef.current);
            if (pickedId != null) {
              setSelectedAgentId(pickedId);
              force();
              return;
            }
            if (!canDraw) {
              setSelectedAgentId(null);
              force();
              return;
            }
          }
          if (t.view !== 'farm' || !canDraw) return;
          drawingRef.current = { points: [[px, py]] };
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
          cursor:
            canDraw && canPilot ? 'cell' :
            canDraw && t.view === 'farm' ? 'crosshair' :
            canPilot ? 'pointer' :
            'default',
        }}
      />
      <Chrome style={t.style} title={title} theme={theme} />
      {t.showHud && (
        <HUD stats={stats} farm={farmRef.current}
             rateHistory={rateHistoryRef.current}
             theme={theme} view={t.view}
             network={{
               snapshot: networkSnapshot,
               history: networkHistoryRef.current,
               advanced: t.showAdvanced,
             }}
             pilot={{ mode: interactionMode, selectedAgent }}
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
        <TweakToggle label="Advanced network" value={t.showAdvanced} onChange={v => setTweak('showAdvanced', v)} />
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
        <TweakSection label="Pilot" />
        <div style={{
          fontSize: 9,
          lineHeight: 1.6,
          color: 'rgba(41,38,27,.62)',
          paddingBottom: 2,
        }}>
          Click an agent to select it. Use WASD or arrows to steer, hold Shift to boost, press Space to brake, and Esc to clear the selection.
        </div>
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
