// renderer.jsx — draws the farm on a 2D canvas
// Supports style variants: blueprint, vector, crt
// View modes: 'farm' (sim view) and 'network' (force-directed graph)

function themedInk(theme, alpha = 1) {
  const rgb = theme?.inkRgb || '42, 44, 56';
  return `rgba(${rgb}, ${alpha})`;
}

function drawSprite(ctx, bitmap, cx, cy, px, color) {
  const size = 8;
  const off = (size * px) / 2;
  ctx.fillStyle = color;
  for (let r = 0; r < size; r++) {
    const row = bitmap[r];
    for (let c = 0; c < size; c++) {
      if (row & (1 << (7 - c))) {
        ctx.fillRect(
          Math.round(cx - off + c * px),
          Math.round(cy - off + r * px),
          px, px
        );
      }
    }
  }
}

function drawResource(ctx, bitmap, cx, cy, px, color) {
  const size = 6;
  const off = (size * px) / 2;
  ctx.fillStyle = color;
  for (let r = 0; r < size; r++) {
    const row = bitmap[r];
    for (let c = 0; c < size; c++) {
      if (row & (1 << (7 - c))) {
        ctx.fillRect(
          Math.round(cx - off + c * px),
          Math.round(cy - off + r * px),
          px, px
        );
      }
    }
  }
}

function drawBlueprintGrid(ctx, w, h, t, theme) {
  ctx.save();
  ctx.strokeStyle = themedInk(theme, 0.06);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const minor = 20;
  for (let x = 0; x <= w; x += minor) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (let y = 0; y <= h; y += minor) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();

  ctx.strokeStyle = themedInk(theme, 0.14);
  ctx.beginPath();
  const major = 100;
  for (let x = 0; x <= w; x += major) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (let y = 0; y <= h; y += major) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();
  ctx.restore();
}

function drawVectorGrid(ctx, w, h, t, theme) {
  ctx.save();
  ctx.strokeStyle = themedInk(theme, 0.12);
  ctx.setLineDash([2, 6]);
  ctx.lineDashOffset = -t * 12;
  const cx = w / 2, cy = h / 2;
  for (let i = 1; i <= 8; i++) {
    const s = Math.min(w, h) * 0.11 * i;
    ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = themedInk(theme, 0.1);
  ctx.beginPath();
  ctx.moveTo(0, cy + 0.5); ctx.lineTo(w, cy + 0.5);
  ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, h);
  ctx.stroke();
  ctx.restore();
}

function drawCrtBackdrop(ctx, w, h, t, theme) {
  ctx.save();
  ctx.fillStyle = themedInk(theme, 0.05);
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.fillStyle = themedInk(theme, 0.1);
  const step = 16;
  const offset = Math.floor(t * 4) % step;
  for (let y = offset; y < h; y += step) {
    for (let x = offset; x < w; x += step) ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function drawAgentBlueprint(ctx, a, px, t, theme) {
  const cx = Math.round(a.x);
  const cy = Math.round(a.y + Math.sin(a.bob) * 0.6);
  if (a.engagedWith != null) {
    ctx.save();
    ctx.strokeStyle = themedInk(theme, 0.5);
    ctx.setLineDash([2, 3]);
    ctx.lineDashOffset = -t * 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  } else if (a.cooldown > 0) {
    ctx.save();
    ctx.strokeStyle = themedInk(theme, 0.2);
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2 * (a.cooldown / 2.6));
    ctx.stroke();
    ctx.restore();
  }
  const sp = Math.hypot(a.vx, a.vy);
  if (sp > 0.05) {
    ctx.save();
    ctx.strokeStyle = themedInk(theme, 0.32);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + (a.vx / sp) * 9, cy + (a.vy / sp) * 9);
    ctx.stroke();
    ctx.restore();
  }
  drawSprite(ctx, SPRITES[a.sprite], cx, cy, px, themedInk(theme, theme?.inkA ?? 0.92));
}

function drawAgentVector(ctx, a, px, t, theme) {
  const cx = Math.round(a.x);
  const cy = Math.round(a.y + Math.sin(a.bob) * 0.6);
  ctx.save();
  ctx.strokeStyle = themedInk(theme, 0.38);
  ctx.beginPath();
  const r = 9;
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  if (a.engagedWith != null) {
    ctx.save();
    ctx.strokeStyle = themedInk(theme, 0.6);
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -t * 18;
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  drawSprite(ctx, SPRITES[a.sprite], cx, cy, px, themedInk(theme, theme?.inkA ?? 0.95));
}

function drawAgentCrt(ctx, a, px, t, theme) {
  const cx = Math.round(a.x);
  const cy = Math.round(a.y + Math.sin(a.bob) * 0.6);
  if (a.engagedWith != null) {
    ctx.save();
    ctx.fillStyle = themedInk(theme, 0.12);
    const pulse = 12 + Math.sin(t * 8) * 2;
    ctx.fillRect(cx - pulse, cy - pulse, pulse * 2, pulse * 2);
    ctx.restore();
  }
  drawSprite(ctx, SPRITES[a.sprite], cx, cy, px, themedInk(theme, theme?.inkA ?? 0.92));
  ctx.save();
  ctx.strokeStyle = themedInk(theme, 0.28);
  ctx.beginPath();
  const half = 5;
  ctx.moveTo(cx - half - 2, cy - half); ctx.lineTo(cx - half, cy - half);
  ctx.moveTo(cx - half, cy - half); ctx.lineTo(cx - half, cy - half + 2);
  ctx.moveTo(cx + half + 2, cy + half); ctx.lineTo(cx + half, cy + half);
  ctx.moveTo(cx + half, cy + half); ctx.lineTo(cx + half, cy + half - 2);
  ctx.stroke();
  ctx.restore();
}

function drawTrade(ctx, farm, trade, t, theme) {
  const a = farm.agents[trade.a];
  const b = farm.agents[trade.b];
  if (!a || !b) return;
  ctx.save();
  ctx.strokeStyle = themedInk(theme, 0.55);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.lineDashOffset = -t * 22;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  if (trade.phase === 'exchange') {
    const e = Math.min(1, Math.max(0, trade.t / 1.2));
    const ax = a.x + (b.x - a.x) * e;
    const ay = a.y + (b.y - a.y) * e;
    const bx = b.x + (a.x - b.x) * e;
    const by = b.y + (a.y - b.y) * e;
    drawResource(ctx, RESOURCES[a.resource], ax, ay, 1, themedInk(theme, 0.9));
    drawResource(ctx, RESOURCES[b.resource], bx, by, 1, themedInk(theme, 0.9));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.save();
    ctx.strokeStyle = themedInk(theme, 0.45);
    for (let i = 0; i < 2; i++) {
      const r = 10 + i * 4;
      const startAngle = t * (2 + i * 1.5) + i;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = startAngle + (k * Math.PI) / 3;
        ctx.moveTo(mx + Math.cos(ang) * r, my + Math.sin(ang) * r);
        ctx.lineTo(mx + Math.cos(ang) * (r + 2), my + Math.sin(ang) * (r + 2));
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ────────────────────────────────────────────────────────────
// Network view: force-directed layout over edges
// ────────────────────────────────────────────────────────────

function drawNetwork(ctx, farm, w, h, t, theme, style, netState) {
  // Apply tiny force sim in-place on netState.positions
  const agents = farm.agents;
  const pos = netState.positions;
  // ensure positions exist for every agent
  for (const a of agents) {
    if (!pos[a.id]) {
      pos[a.id] = {
        x: w / 2 + Math.cos(a.id * 0.6) * 80 + (Math.random() - 0.5) * 20,
        y: h / 2 + Math.sin(a.id * 0.6) * 80 + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
      };
    }
  }
  // prune positions for removed agents
  for (const k of Object.keys(pos)) {
    if (!agents[+k]) delete pos[+k];
  }

  // Forces
  const cx = w / 2, cy = h / 2;
  const edges = farm.edges;
  const maxWeight = Math.max(1, ...Array.from(edges.values()).map(e => e.weight));

  // repulsion
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]; if (!pos[a.id]) continue;
    const pa = pos[a.id];
    // center gravity
    pa.vx += (cx - pa.x) * 0.0008;
    pa.vy += (cy - pa.y) * 0.0008;
    for (let j = i + 1; j < agents.length; j++) {
      const b = agents[j]; if (!pos[b.id]) continue;
      const pb = pos[b.id];
      let dx = pa.x - pb.x, dy = pa.y - pb.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { d2 = 1; dx = 0.5; dy = 0.5; }
      const f = 900 / d2;
      dx /= Math.sqrt(d2); dy /= Math.sqrt(d2);
      pa.vx += dx * f; pa.vy += dy * f;
      pb.vx -= dx * f; pb.vy -= dy * f;
    }
  }
  // attraction via edges (weighted)
  for (const e of edges.values()) {
    const pa = pos[e.a], pb = pos[e.b];
    if (!pa || !pb) continue;
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const d = Math.hypot(dx, dy) || 1;
    const target = 110 - Math.min(60, e.weight * 3); // higher weight = shorter
    const k = 0.01 + Math.min(0.08, e.weight * 0.003);
    const f = (d - target) * k;
    pa.vx += (dx / d) * f;
    pa.vy += (dy / d) * f;
    pb.vx -= (dx / d) * f;
    pb.vy -= (dy / d) * f;
  }
  // integrate with damping + bounds
  const margin = 40;
  for (const id in pos) {
    const p = pos[id];
    p.vx *= 0.82; p.vy *= 0.82;
    // clamp velocity
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 6) { p.vx *= 6 / sp; p.vy *= 6 / sp; }
    p.x += p.vx; p.y += p.vy;
    if (p.x < margin) { p.x = margin; p.vx *= -0.3; }
    if (p.x > w - margin) { p.x = w - margin; p.vx *= -0.3; }
    if (p.y < margin) { p.y = margin; p.vy *= -0.3; }
    if (p.y > h - margin) { p.y = h - margin; p.vy *= -0.3; }
  }

  // ─── draw edges ───
  ctx.save();
  for (const e of edges.values()) {
    const pa = pos[e.a], pb = pos[e.b];
    if (!pa || !pb) continue;
    const w01 = e.weight / maxWeight;
    const age = (performance.now() - e.lastT) / 1000;
    const hot = Math.max(0, 1 - age / 3);
    const width = 0.5 + w01 * 3.5;
    const alpha = 0.18 + w01 * 0.55 + hot * 0.2;
    ctx.lineWidth = width;
    ctx.strokeStyle = themedInk(theme, Math.min(0.95, alpha));
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();

    // weight label at midpoint for heavy edges
    if (e.weight >= 2) {
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      ctx.fillStyle = themedInk(theme, 0.75);
      ctx.font = '8.5px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(e.weight), mx, my);
    }
  }
  ctx.restore();

  // ─── draw nodes ───
  for (const a of agents) {
    const p = pos[a.id]; if (!p) continue;
    // degree ring sized by connections
    let degree = 0, totalW = 0;
    for (const e of edges.values()) {
      if (e.a === a.id || e.b === a.id) { degree++; totalW += e.weight; }
    }
    const radius = 10 + Math.min(8, totalW * 0.5);
    // ring
    ctx.save();
    ctx.strokeStyle = themedInk(theme, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    // active highlight
    if (a.engagedWith != null) {
      ctx.strokeStyle = themedInk(theme, 0.7);
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // sprite in center
    drawSprite(ctx, SPRITES[a.sprite], p.x, p.y, 1.5, themedInk(theme, theme?.inkA ?? 0.92));
    // label
    ctx.fillStyle = themedInk(theme, 0.55);
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(a.label, p.x, p.y + radius + 10);
  }
}

// ────────────────────────────────────────────────────────────
// Main dispatcher
// ────────────────────────────────────────────────────────────

function drawSparks(ctx, farm, t, theme, view, netState) {
  if (!farm.sparks.length) return;
  const isDark = theme && theme.label !== 'Paper';
  const gold = isDark ? [255, 210, 130] : [210, 150, 50];
  const [gr, gg, gb] = gold;

  ctx.save();
  const prevComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over';

  for (const s of farm.sparks) {
    const p = s.life / s.ttl;
    const env = Math.sin(Math.PI * p);
    const alpha = Math.max(0, env) * (isDark ? 0.55 : 0.35);

    if (view === 'network' && netState && netState.positions && s.pair) {
      // Glow the edge between the two nodes
      const pa = netState.positions[s.pair[0]];
      const pb = netState.positions[s.pair[1]];
      if (!pa || !pb) continue;

      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len; // perpendicular

      // outer glow — wide, very soft
      const outerW = 10 + env * 4;
      const gOuter = ctx.createLinearGradient(
        pa.x + nx * outerW, pa.y + ny * outerW,
        pa.x - nx * outerW, pa.y - ny * outerW
      );
      gOuter.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, 0)`);
      gOuter.addColorStop(0.5, `rgba(${gr}, ${gg}, ${gb}, ${alpha * 0.35})`);
      gOuter.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
      ctx.fillStyle = gOuter;
      ctx.beginPath();
      ctx.moveTo(pa.x + nx * outerW, pa.y + ny * outerW);
      ctx.lineTo(pb.x + nx * outerW, pb.y + ny * outerW);
      ctx.lineTo(pb.x - nx * outerW, pb.y - ny * outerW);
      ctx.lineTo(pa.x - nx * outerW, pa.y - ny * outerW);
      ctx.closePath();
      ctx.fill();

      // bright core line
      ctx.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${Math.min(1, alpha * 1.4)})`;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      // node dots at endpoints
      for (const p2 of [pa, pb]) {
        const nr = 6 + env * 3;
        const rg = ctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, nr);
        rg.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, ${alpha * 0.8})`);
        rg.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, nr, 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }

    // Farm view: soft radial halo at meeting point
    const x = s.x, y = s.y;
    const R = 18 + env * 8;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, R);
    grad.addColorStop(0, `rgba(${gr}, ${gg}, ${gb}, ${alpha})`);
    grad.addColorStop(0.35, `rgba(${gr}, ${gg}, ${gb}, ${alpha * 0.4})`);
    grad.addColorStop(1, `rgba(${gr}, ${gg}, ${gb}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = prevComposite;
  ctx.restore();
}

function drawObstacles(ctx, farm, theme, t, pending) {
  const all = farm.obstacles.concat(pending ? [pending] : []);
  if (!all.length) return;
  ctx.save();
  ctx.strokeStyle = themedInk(theme, 0.85);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const ob of all) {
    const pts = ob.points;
    if (!pts.length) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  // subtle hatched shadow outline
  ctx.strokeStyle = themedInk(theme, 0.25);
  ctx.lineWidth = 5;
  ctx.setLineDash([]);
  for (const ob of all) {
    const pts = ob.points;
    if (!pts.length) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFarm(canvas, farm, opts, t) {
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const style = opts.style;
  const theme = opts.theme;
  const view = opts.view || 'farm';

  if (style === 'blueprint') drawBlueprintGrid(ctx, w, h, t, theme);
  else if (style === 'vector') drawVectorGrid(ctx, w, h, t, theme);
  else if (style === 'crt') drawCrtBackdrop(ctx, w, h, t, theme);

  if (view === 'network') {
    if (!opts.netState) return;
    drawNetwork(ctx, farm, w, h, t, theme, style, opts.netState);
    drawSparks(ctx, farm, t, theme, view, opts.netState);
    return;
  }

  for (const tr of farm.trades) drawTrade(ctx, farm, tr, t, theme);
  const px = 2;
  const drawAgent =
    style === 'vector' ? drawAgentVector :
    style === 'crt' ? drawAgentCrt :
    drawAgentBlueprint;
  for (const a of farm.agents) drawAgent(ctx, a, px, t, theme);
  drawObstacles(ctx, farm, theme, t, opts.pendingObstacle);
  drawSparks(ctx, farm, t, theme, view, null);
}

Object.assign(window, { drawFarm });
