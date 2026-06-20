// renderer.jsx — draws the farm on a 2D canvas
// Supports style variants: blueprint, vector, crt
// View modes: 'farm' (sim view) and 'network' (force-directed graph)

function themedInk(theme, alpha = 1) {
  const rgb = theme?.inkRgb || '42, 44, 56';
  return `rgba(${rgb}, ${alpha})`;
}

function pilotInk(theme, alpha = 1) {
  const rgbByTheme = {
    Paper: '58, 118, 92',
    Blueprint: '255, 226, 150',
    Terminal: '255, 230, 165',
    Amber: '255, 236, 186',
    'Mono Dark': '158, 214, 255',
  };
  const rgb = rgbByTheme[theme?.label] || '58, 118, 92';
  return `rgba(${rgb}, ${alpha})`;
}

function buildSelectionProfile(farm, selectedAgentId) {
  if (selectedAgentId == null) return null;
  const selected = farm.agents[selectedAgentId];
  if (!selected) return null;
  const levels = new Map();
  let maxWeight = 0;
  for (const e of farm.edges.values()) {
    if (e.a === selectedAgentId || e.b === selectedAgentId) {
      const other = e.a === selectedAgentId ? e.b : e.a;
      levels.set(other, e.weight);
      maxWeight = Math.max(maxWeight, e.weight);
    }
  }
  const normalized = new Map();
  const denom = Math.max(1, maxWeight);
  for (const [id, weight] of levels) normalized.set(id, weight / denom);
  if (selected.engagedWith != null && farm.agents[selected.engagedWith]) {
    normalized.set(selected.engagedWith, Math.max(normalized.get(selected.engagedWith) || 0, 0.35));
  }
  return {
    selectedId: selectedAgentId,
    engagedPartnerId: selected.engagedWith,
    levels: normalized,
  };
}

function drawPilotHalo(ctx, cx, cy, t, theme, highlight) {
  if (!highlight || (!highlight.selected && !highlight.level && !highlight.active)) return;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
  const level = highlight.selected ? 1 : highlight.level || 0;
  const haloRadius = highlight.selected
    ? 18 + pulse * 3
    : 10 + level * 7 + (highlight.active ? pulse * 2 : 0);
  const haloAlpha = highlight.selected
    ? 0.18 + pulse * 0.06
    : 0.06 + level * 0.16 + (highlight.active ? 0.07 : 0);
  const ringRadius = highlight.selected
    ? 12 + pulse * 0.9
    : 9.5 + level * 3.5;
  ctx.save();
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloRadius);
  halo.addColorStop(0, pilotInk(theme, haloAlpha));
  halo.addColorStop(0.45, pilotInk(theme, haloAlpha * 0.45));
  halo.addColorStop(1, pilotInk(theme, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = pilotInk(
    theme,
    highlight.selected ? 0.92 : Math.min(0.78, 0.22 + level * 0.5 + (highlight.active ? 0.12 : 0))
  );
  ctx.lineWidth = highlight.selected ? 1.8 : 1.2;
  if (highlight.active && !highlight.selected) {
    ctx.setLineDash([3, 3]);
    ctx.lineDashOffset = -t * 14;
  }
  ctx.beginPath();
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (highlight.selected) {
    ctx.strokeStyle = pilotInk(theme, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius + 4.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
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

function drawAgentBlueprint(ctx, a, px, t, theme, highlight) {
  const cx = Math.round(a.x);
  const cy = Math.round(a.y + Math.sin(a.bob) * 0.6);
  drawPilotHalo(ctx, cx, cy, t, theme, highlight);
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
  drawSprite(
    ctx,
    SPRITES[a.sprite],
    cx,
    cy,
    px,
    highlight?.selected
      ? pilotInk(theme, 0.98)
      : themedInk(theme, theme?.inkA ?? 0.92)
  );
}

function drawAgentVector(ctx, a, px, t, theme, highlight) {
  const cx = Math.round(a.x);
  const cy = Math.round(a.y + Math.sin(a.bob) * 0.6);
  drawPilotHalo(ctx, cx, cy, t, theme, highlight);
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
  drawSprite(
    ctx,
    SPRITES[a.sprite],
    cx,
    cy,
    px,
    highlight?.selected
      ? pilotInk(theme, 0.98)
      : themedInk(theme, theme?.inkA ?? 0.95)
  );
}

function drawAgentCrt(ctx, a, px, t, theme, highlight) {
  const cx = Math.round(a.x);
  const cy = Math.round(a.y + Math.sin(a.bob) * 0.6);
  drawPilotHalo(ctx, cx, cy, t, theme, highlight);
  if (a.engagedWith != null) {
    ctx.save();
    ctx.fillStyle = themedInk(theme, 0.12);
    const pulse = 12 + Math.sin(t * 8) * 2;
    ctx.fillRect(cx - pulse, cy - pulse, pulse * 2, pulse * 2);
    ctx.restore();
  }
  drawSprite(
    ctx,
    SPRITES[a.sprite],
    cx,
    cy,
    px,
    highlight?.selected
      ? pilotInk(theme, 0.98)
      : themedInk(theme, theme?.inkA ?? 0.92)
  );
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

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const clamped = Math.max(0, Math.min(1, q));
  const pos = (sorted.length - 1) * clamped;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const frac = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function communityPalette(theme) {
  return theme?.label && theme.label !== 'Paper'
    ? [
        '142, 196, 255',
        '132, 220, 166',
        '255, 205, 120',
        '205, 176, 255',
        '255, 154, 144',
        '146, 220, 224',
      ]
    : [
        '78, 106, 146',
        '77, 126, 92',
        '165, 117, 78',
        '121, 96, 164',
        '163, 94, 94',
        '86, 128, 134',
      ];
}

function communityInk(theme, index, alpha = 1) {
  const palette = communityPalette(theme);
  return `rgba(${palette[index % palette.length]}, ${alpha})`;
}

function finalizeCommunities(byNode, weightedDegree) {
  const grouped = new Map();
  for (let i = 0; i < byNode.length; i++) {
    const key = String(byNode[i]);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(i);
  }
  const communities = Array.from(grouped.values())
    .map(members => ({
      id: Math.min(...members),
      members: members.slice().sort((a, b) => a - b),
      strength: members.reduce((sum, nodeId) => sum + (weightedDegree[nodeId] || 0), 0),
    }))
    .sort((a, b) => b.members.length - a.members.length || b.strength - a.strength || a.id - b.id);

  const normalized = new Array(byNode.length).fill(null);
  const memberIndex = new Map();
  for (const community of communities) {
    for (let i = 0; i < community.members.length; i++) {
      const nodeId = community.members[i];
      normalized[nodeId] = community.id;
      memberIndex.set(nodeId, i);
    }
  }
  return { byNode: normalized, communities, memberIndex };
}

function buildStrongTieCommunities(agents, neighbors, weights, weightedDegree) {
  const n = agents.length;
  const sorted = weights.slice().sort((a, b) => a - b);
  const maxWeight = sorted[sorted.length - 1] || 1;
  const mean = weights.reduce((sum, value) => sum + value, 0) / Math.max(1, weights.length);
  const variance = weights.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, weights.length);
  let threshold = Math.min(
    maxWeight,
    Math.max(2, Math.round(Math.max(quantile(sorted, 0.68), mean + Math.sqrt(variance) * 0.22)))
  );
  let best = null;

  for (; threshold <= maxWeight; threshold++) {
    const assigned = new Array(n).fill(null);
    const seen = new Array(n).fill(false);

    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      const strongNeighbors = Array.from(neighbors[i].entries()).filter(([, weight]) => weight >= threshold);
      if (!strongNeighbors.length) continue;
      const stack = [i];
      const members = [];
      seen[i] = true;
      while (stack.length) {
        const node = stack.pop();
        members.push(node);
        for (const [next, weight] of neighbors[node]) {
          if (weight < threshold || seen[next]) continue;
          seen[next] = true;
          stack.push(next);
        }
      }
      const groupId = Math.min(...members);
      for (const nodeId of members) assigned[nodeId] = groupId;
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) {
        if (assigned[i] != null) continue;
        let bestGroup = null;
        let bestWeight = 0;
        for (const [next, weight] of neighbors[i]) {
          if (assigned[next] == null || weight < bestWeight) continue;
          bestWeight = weight;
          bestGroup = assigned[next];
        }
        if (bestGroup != null && bestWeight >= Math.max(1, threshold - 1)) {
          assigned[i] = bestGroup;
          changed = true;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      if (assigned[i] == null) assigned[i] = i;
    }

    best = finalizeCommunities(assigned, weightedDegree);
    const multiNodeGroups = best.communities.filter(community => community.members.length > 1).length;
    if (multiNodeGroups >= 2 || threshold === maxWeight) break;
  }

  if (!best) {
    return finalizeCommunities(Array.from({ length: n }, (_, index) => index), weightedDegree);
  }

  const reassigned = best.byNode.slice();
  const sizes = new Map(best.communities.map(community => [community.id, community.members.length]));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i++) {
      const currentGroup = reassigned[i];
      if ((sizes.get(currentGroup) || 0) > 1) continue;
      let bestGroup = null;
      let bestWeight = 0;
      for (const [next, weight] of neighbors[i]) {
        const nextGroup = reassigned[next];
        if (nextGroup === currentGroup || (sizes.get(nextGroup) || 0) < 2 || weight < bestWeight) continue;
        bestWeight = weight;
        bestGroup = nextGroup;
      }
      if (bestGroup != null && bestWeight >= Math.max(1, threshold - 1)) {
        sizes.set(currentGroup, Math.max(0, (sizes.get(currentGroup) || 1) - 1));
        reassigned[i] = bestGroup;
        sizes.set(bestGroup, (sizes.get(bestGroup) || 0) + 1);
        changed = true;
      }
    }
  }

  return finalizeCommunities(reassigned, weightedDegree);
}

function buildSeededCommunities(agents, neighbors, weightedDegree) {
  const n = agents.length;
  if (n < 2) {
    return finalizeCommunities(Array.from({ length: n }, () => 0), weightedDegree);
  }
  const seedTarget = Math.max(2, Math.min(4, Math.round(Math.sqrt(n) / 1.8)));
  const seeds = [];

  while (seeds.length < Math.min(seedTarget, n)) {
    let bestNode = null;
    let bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      if (seeds.includes(i)) continue;
      let penalty = 0;
      for (const seed of seeds) penalty += (neighbors[i].get(seed) || 0) * 1.75;
      const score = weightedDegree[i] - penalty;
      if (score > bestScore || (score === bestScore && (bestNode == null || i < bestNode))) {
        bestScore = score;
        bestNode = i;
      }
    }
    if (bestNode == null) break;
    seeds.push(bestNode);
  }

  const byNode = new Array(n).fill(seeds[0] ?? 0);
  const locked = new Set(seeds);
  for (let i = 0; i < n; i++) {
    if (locked.has(i)) {
      byNode[i] = i;
      continue;
    }
    let bestSeed = seeds[0] ?? i;
    let bestScore = -Infinity;
    for (const seed of seeds) {
      const direct = neighbors[i].get(seed) || 0;
      const score = direct * 2 + weightedDegree[seed] * 0.03;
      if (score > bestScore || (score === bestScore && seed < bestSeed)) {
        bestScore = score;
        bestSeed = seed;
      }
    }
    byNode[i] = bestSeed;
  }

  const order = Array.from({ length: n }, (_, index) => index).sort(
    (a, b) => weightedDegree[b] - weightedDegree[a] || a - b
  );
  for (let iter = 0; iter < 6; iter++) {
    for (const nodeId of order) {
      if (locked.has(nodeId)) continue;
      const scores = new Map();
      for (const [next, weight] of neighbors[nodeId]) {
        const label = byNode[next];
        scores.set(label, (scores.get(label) || 0) + weight);
      }
      scores.set(byNode[nodeId], (scores.get(byNode[nodeId]) || 0) + weightedDegree[nodeId] * 0.08);

      let bestLabel = byNode[nodeId];
      let bestScore = -Infinity;
      for (const seed of seeds) {
        const seededScore = (scores.get(seed) || 0) + (neighbors[nodeId].get(seed) || 0) * 0.35;
        if (seededScore > bestScore || (seededScore === bestScore && seed < bestLabel)) {
          bestScore = seededScore;
          bestLabel = seed;
        }
      }
      byNode[nodeId] = bestLabel;
    }
  }

  return finalizeCommunities(byNode, weightedDegree);
}

function detectCommunities(agents, edges) {
  const n = agents.length;
  const neighbors = Array.from({ length: n }, () => new Map());
  const weightedDegree = new Array(n).fill(0);
  const weights = [];

  for (const e of edges.values()) {
    if (!agents[e.a] || !agents[e.b]) continue;
    neighbors[e.a].set(e.b, e.weight);
    neighbors[e.b].set(e.a, e.weight);
    weightedDegree[e.a] += e.weight;
    weightedDegree[e.b] += e.weight;
    weights.push(e.weight);
  }

  let base;
  if (!n) {
    base = { byNode: [], communities: [], memberIndex: new Map() };
  } else if (!weights.length) {
    base = finalizeCommunities(new Array(n).fill(0), weightedDegree);
  } else {
    base = buildStrongTieCommunities(agents, neighbors, weights, weightedDegree);
    const multiNodeGroups = base.communities.filter(community => community.members.length > 1).length;
    if (multiNodeGroups < 2 && n >= 8) {
      base = buildSeededCommunities(agents, neighbors, weightedDegree);
    }
  }

  const groupIndexById = new Map();
  for (let index = 0; index < base.communities.length; index++) {
    groupIndexById.set(String(base.communities[index].id), index);
  }

  return {
    ...base,
    groupIndexById,
    weightedDegree,
    neighbors,
  };
}

function buildCommunityAnchors(communities, w, h) {
  const anchors = new Map();
  if (!communities.length) return anchors;
  const ordered = communities.slice().sort((a, b) => a.id - b.id);
  const cx = w / 2;
  const cy = h / 2;
  if (ordered.length === 1) {
    anchors.set(ordered[0].id, { x: cx, y: cy });
    return anchors;
  }

  const rx = Math.max(120, Math.min(w * 0.26, 270));
  const ry = Math.max(90, Math.min(h * 0.22, 200));
  for (let i = 0; i < ordered.length; i++) {
    const community = ordered[i];
    const angle = -Math.PI / 2 + (i / ordered.length) * Math.PI * 2;
    const scale = 1 + Math.min(0.18, (community.members.length - 1) * 0.015);
    anchors.set(community.id, {
      x: cx + Math.cos(angle) * rx * scale,
      y: cy + Math.sin(angle) * ry * scale,
    });
  }
  return anchors;
}

function drawNetwork(ctx, farm, w, h, t, theme, style, netState, selection) {
  const agents = farm.agents;
  const edges = farm.edges;
  const communityData = detectCommunities(agents, edges);
  const communitiesById = new Map(communityData.communities.map(community => [community.id, community]));
  const anchors = buildCommunityAnchors(communityData.communities, w, h);
  const center = { x: w / 2, y: h / 2 };
  const pos = netState.positions;

  for (const a of agents) {
    if (!pos[a.id]) {
      const communityId = communityData.byNode[a.id];
      const community = communitiesById.get(communityId);
      const anchor = anchors.get(communityId) || center;
      const slot = communityData.memberIndex.get(a.id) || 0;
      const localCount = Math.max(1, community?.members.length || 1);
      const baseRadius = 24 + Math.min(38, (communityData.weightedDegree[a.id] || 0) * 0.8 + localCount * 2);
      const angle = (slot / localCount) * Math.PI * 2 + a.id * 0.37;
      pos[a.id] = {
        x: anchor.x + Math.cos(angle) * baseRadius + (Math.random() - 0.5) * 18,
        y: anchor.y + Math.sin(angle) * baseRadius + (Math.random() - 0.5) * 18,
        vx: 0, vy: 0,
      };
    }
  }
  for (const k of Object.keys(pos)) {
    if (!agents[+k]) delete pos[+k];
  }

  const maxWeight = Math.max(1, ...Array.from(edges.values()).map(e => e.weight));
  const multipleCommunities = communityData.communities.length > 1;
  const centerPull = multipleCommunities ? 0.00012 : 0.00032;
  const anchorPull = multipleCommunities ? 0.0023 : 0.00095;
  const repulsionBase = multipleCommunities ? 1650 : 1120;

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!pos[a.id]) continue;
    const pa = pos[a.id];
    const communityId = communityData.byNode[a.id];
    const anchor = anchors.get(communityId) || center;
    pa.vx += (center.x - pa.x) * centerPull;
    pa.vy += (center.y - pa.y) * centerPull;
    pa.vx += (anchor.x - pa.x) * anchorPull;
    pa.vy += (anchor.y - pa.y) * anchorPull;

    for (let j = i + 1; j < agents.length; j++) {
      const b = agents[j];
      if (!pos[b.id]) continue;
      const pb = pos[b.id];
      let dx = pa.x - pb.x;
      let dy = pa.y - pb.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { d2 = 1; dx = 0.5; dy = 0.5; }
      const sameCommunity = communityData.byNode[a.id] === communityData.byNode[b.id];
      const f = (repulsionBase * (sameCommunity ? 0.74 : 1.14)) / d2;
      dx /= Math.sqrt(d2); dy /= Math.sqrt(d2);
      pa.vx += dx * f; pa.vy += dy * f;
      pb.vx -= dx * f; pb.vy -= dy * f;
    }
  }

  for (const e of edges.values()) {
    const pa = pos[e.a], pb = pos[e.b];
    if (!pa || !pb) continue;
    const sameCommunity = communityData.byNode[e.a] === communityData.byNode[e.b];
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const d = Math.hypot(dx, dy) || 1;
    const target = sameCommunity
      ? 150 - Math.min(54, e.weight * 2.3)
      : 190 - Math.min(26, e.weight * 1.0);
    const k = sameCommunity
      ? 0.009 + Math.min(0.055, e.weight * 0.0024)
      : 0.004 + Math.min(0.02, e.weight * 0.0012);
    const f = (d - target) * k;
    pa.vx += (dx / d) * f;
    pa.vy += (dy / d) * f;
    pb.vx -= (dx / d) * f;
    pb.vy -= (dy / d) * f;
  }

  const margin = 54;
  for (const id in pos) {
    const p = pos[id];
    p.vx *= 0.86;
    p.vy *= 0.86;
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 5.6) { p.vx *= 5.6 / sp; p.vy *= 5.6 / sp; }
    p.x += p.vx; p.y += p.vy;
    if (p.x < margin) { p.x = margin; p.vx *= -0.3; }
    if (p.x > w - margin) { p.x = w - margin; p.vx *= -0.3; }
    if (p.y < margin) { p.y = margin; p.vy *= -0.3; }
    if (p.y > h - margin) { p.y = h - margin; p.vy *= -0.3; }
  }

  if (multipleCommunities) {
    ctx.save();
    for (const community of communityData.communities) {
      if (community.members.length < 2) continue;
      let cx = 0;
      let cy = 0;
      let count = 0;
      for (const member of community.members) {
        const p = pos[member];
        if (!p) continue;
        cx += p.x;
        cy += p.y;
        count++;
      }
      if (!count) continue;
      cx /= count;
      cy /= count;
      let radius = 52;
      for (const member of community.members) {
        const p = pos[member];
        if (!p) continue;
        radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy) + 32);
      }
      radius = Math.min(210, radius);
      const colorIndex = communityData.groupIndexById.get(String(community.id)) || 0;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      glow.addColorStop(0, communityInk(theme, colorIndex, theme?.label === 'Paper' ? 0.065 : 0.09));
      glow.addColorStop(0.55, communityInk(theme, colorIndex, theme?.label === 'Paper' ? 0.028 : 0.045));
      glow.addColorStop(1, communityInk(theme, colorIndex, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.save();
  for (const e of edges.values()) {
    const pa = pos[e.a], pb = pos[e.b];
    if (!pa || !pb) continue;
    const communityA = communityData.byNode[e.a];
    const communityB = communityData.byNode[e.b];
    const sameCommunity = communityA === communityB;
    const communityIndex = communityData.groupIndexById.get(String(communityA)) || 0;
    const w01 = e.weight / maxWeight;
    const age = (performance.now() - e.lastT) / 1000;
    const hot = Math.max(0, 1 - age / 3);
    const width = 0.5 + w01 * 3.5;
    const alpha = 0.18 + w01 * 0.55 + hot * 0.2;
    const selectedNeighbor =
      selection?.selectedId === e.a ? e.b :
      selection?.selectedId === e.b ? e.a :
      null;
    const relationLevel = selectedNeighbor != null ? (selection.levels.get(selectedNeighbor) || 0) : 0;
    const activeRelation = selectedNeighbor != null && selection?.engagedPartnerId === selectedNeighbor;
    if (selection) {
      if (selectedNeighbor != null) {
        const activePulse = activeRelation ? 0.08 + (0.5 + 0.5 * Math.sin(t * 6.5)) * 0.12 : 0;
        ctx.lineWidth = 1 + relationLevel * 3.2 + hot * 0.6;
        ctx.strokeStyle = pilotInk(theme, Math.min(0.95, 0.28 + relationLevel * 0.52 + activePulse));
      } else {
        ctx.lineWidth = Math.max(0.35, width * 0.58);
        ctx.strokeStyle = themedInk(theme, Math.min(0.34, alpha * 0.42));
      }
    } else {
      ctx.lineWidth = sameCommunity ? width : Math.max(0.42, width * 0.76);
      ctx.strokeStyle = sameCommunity
        ? communityInk(theme, communityIndex, Math.min(0.78, 0.14 + w01 * 0.34 + hot * 0.15))
        : themedInk(theme, Math.min(0.42, 0.08 + w01 * 0.22 + hot * 0.12));
    }
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();

    // weight label at midpoint for heavy edges
    if (e.weight >= 2 && (!selection || selectedNeighbor != null || e.weight >= Math.max(3, maxWeight * 0.55))) {
      const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
      ctx.fillStyle = selectedNeighbor != null
        ? pilotInk(theme, 0.82)
        : themedInk(theme, selection ? 0.38 : 0.75);
      ctx.font = '8.5px Geist Mono, ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(e.weight), mx, my);
    }
  }
  ctx.restore();

  if (selection?.engagedPartnerId != null) {
    const pa = pos[selection.selectedId];
    const pb = pos[selection.engagedPartnerId];
    if (pa && pb) {
      ctx.save();
      ctx.strokeStyle = pilotInk(theme, 0.72);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ─── draw nodes ───
  for (const a of agents) {
    const p = pos[a.id];
    if (!p) continue;
    const totalW = communityData.weightedDegree[a.id] || 0;
    const communityId = communityData.byNode[a.id];
    const communityIndex = communityData.groupIndexById.get(String(communityId)) || 0;
    const radius = 10 + Math.min(8, totalW * 0.5);
    const isSelected = selection?.selectedId === a.id;
    const relationLevel = selection ? (selection.levels.get(a.id) || 0) : 0;
    const isActiveMate = selection?.engagedPartnerId === a.id;
    const dimNode = selection && !isSelected && relationLevel <= 0;

    ctx.save();
    ctx.fillStyle = isSelected
      ? pilotInk(theme, 0.22)
      : relationLevel > 0
        ? pilotInk(theme, Math.min(0.18, 0.06 + relationLevel * 0.14))
        : communityInk(theme, communityIndex, dimNode ? 0.06 : (multipleCommunities ? 0.18 : 0.11));
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(7, radius - 1.5), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isSelected
      ? pilotInk(theme, 0.95)
      : relationLevel > 0
        ? pilotInk(theme, Math.min(0.78, 0.28 + relationLevel * 0.48 + (isActiveMate ? 0.12 : 0)))
        : multipleCommunities
          ? communityInk(theme, communityIndex, dimNode ? 0.22 : 0.62)
          : themedInk(theme, dimNode ? 0.22 : 0.4);
    ctx.lineWidth = isSelected ? 1.8 : relationLevel > 0 ? 1.3 : 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (isSelected || relationLevel > 0) {
      ctx.strokeStyle = pilotInk(theme, isSelected ? 0.48 : Math.min(0.52, 0.16 + relationLevel * 0.22));
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // active highlight
    if (a.engagedWith != null) {
      ctx.strokeStyle = isSelected || isActiveMate ? pilotInk(theme, 0.84) : themedInk(theme, 0.7);
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // sprite in center
    drawSprite(
      ctx,
      SPRITES[a.sprite],
      p.x,
      p.y,
      1.5,
      isSelected
        ? pilotInk(theme, 0.98)
        : multipleCommunities
          ? communityInk(theme, communityIndex, dimNode ? 0.48 : 0.9)
          : themedInk(theme, theme?.inkA ?? 0.92)
    );
    ctx.fillStyle = isSelected
      ? pilotInk(theme, 0.9)
      : relationLevel > 0
        ? pilotInk(theme, Math.min(0.82, 0.3 + relationLevel * 0.42))
        : themedInk(theme, dimNode ? 0.38 : 0.55);
    ctx.font = '8px Geist Mono, ui-monospace, monospace';
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
  const selection = buildSelectionProfile(farm, opts.selectedAgentId);

  if (style === 'blueprint') drawBlueprintGrid(ctx, w, h, t, theme);
  else if (style === 'vector') drawVectorGrid(ctx, w, h, t, theme);
  else if (style === 'crt') drawCrtBackdrop(ctx, w, h, t, theme);

  if (view === 'network') {
    if (!opts.netState) return;
    drawNetwork(ctx, farm, w, h, t, theme, style, opts.netState, selection);
    drawSparks(ctx, farm, t, theme, view, opts.netState);
    return;
  }

  for (const tr of farm.trades) drawTrade(ctx, farm, tr, t, theme);
  const px = 2;
  const drawAgent =
    style === 'vector' ? drawAgentVector :
    style === 'crt' ? drawAgentCrt :
    drawAgentBlueprint;
  for (const a of farm.agents) {
    const relationLevel = selection ? (selection.levels.get(a.id) || 0) : 0;
    drawAgent(ctx, a, px, t, theme, selection ? {
      selected: selection.selectedId === a.id,
      level: relationLevel,
      active: selection.engagedPartnerId === a.id || (selection.selectedId === a.id && a.engagedWith != null),
    } : null);
  }
  drawObstacles(ctx, farm, theme, t, opts.pendingObstacle);
  drawSparks(ctx, farm, t, theme, view, null);
}

Object.assign(window, { drawFarm });
