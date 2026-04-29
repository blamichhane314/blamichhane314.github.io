// sim.jsx — agent farm simulation state

// 8×8 pixel-art sprites, expressed as 8-row bitmasks (1 = ink).
// Each sprite is 8 numbers, each 0-255 where bit 7 = leftmost pixel.
const SPRITES = {
  // Drone: small bot with antenna
  drone: [
    0b00011000,
    0b00011000,
    0b00111100,
    0b01111110,
    0b11011011,
    0b11111111,
    0b01011010,
    0b01000010,
  ],
  // Harvester: squat with treads
  harvester: [
    0b00000000,
    0b00111100,
    0b01111110,
    0b11111111,
    0b11011011,
    0b11111111,
    0b10101010,
    0b01010101,
  ],
  // Scout: tall with sensor
  scout: [
    0b00011000,
    0b00100100,
    0b00111100,
    0b00111100,
    0b01111110,
    0b01011010,
    0b00100100,
    0b00100100,
  ],
  // Trader: hexagonal body
  trader: [
    0b00111100,
    0b01111110,
    0b11100111,
    0b11011011,
    0b11011011,
    0b11100111,
    0b01111110,
    0b00111100,
  ],
  // Beacon: static emitter
  beacon: [
    0b00011000,
    0b00111100,
    0b01111110,
    0b11111111,
    0b11111111,
    0b01111110,
    0b00111100,
    0b00011000,
  ],
};

const SPRITE_KEYS = Object.keys(SPRITES);

// Resource glyphs (6×6)
const RESOURCES = {
  // ★ seed
  seed: [
    0b00110000,
    0b01111000,
    0b11111100,
    0b11111100,
    0b01111000,
    0b00110000,
  ],
  // ⬢ core
  core: [
    0b00110000,
    0b01111000,
    0b11001100,
    0b11001100,
    0b01111000,
    0b00110000,
  ],
  // ◆ data
  data: [
    0b00110000,
    0b01111000,
    0b11111100,
    0b01111000,
    0b00110000,
    0b00000000,
  ],
  // ▦ grain
  grain: [
    0b10101000,
    0b01010100,
    0b10101000,
    0b01010100,
    0b10101000,
    0b01010100,
  ],
};
const RESOURCE_KEYS = Object.keys(RESOURCES);

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function pilotVector(input) {
  if (!input) return null;
  const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (!x && !y) return null;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function makeAgent(i, w, h) {
  const spriteKey = pick(SPRITE_KEYS);
  return {
    id: i,
    label: 'A' + String(i).padStart(2, '0'),
    x: rnd(40, w - 40),
    y: rnd(40, h - 40),
    vx: rnd(-1, 1),
    vy: rnd(-1, 1),
    targetVx: rnd(-1, 1),
    targetVy: rnd(-1, 1),
    sprite: spriteKey,
    resource: pick(RESOURCE_KEYS),
    energy: rnd(0.4, 1),
    // wander seed for smooth perlin-ish drift
    seedA: Math.random() * 1000,
    seedB: Math.random() * 1000,
    // cooldown before it can trade again
    cooldown: rnd(0, 2),
    // currently engaged partner id
    engagedWith: null,
    // small bob offset
    bob: Math.random() * Math.PI * 2,
    trades: 0,
  };
}

class Farm {
  constructor(w, h, count) {
    this.w = w;
    this.h = h;
    this.agents = [];
    this.trades = []; // active trade animations
    this.tradeLog = []; // recent trade events
    this.totalTrades = 0;
    this.tradesWindow = []; // timestamps for rolling rate
    this.edges = new Map();
    this.sparks = []; // particle effects
    this.obstacles = []; // { points: [[x,y],...] } polylines used as walls
    this.startTime = performance.now();
    this.tick = 0;
    this.resize(w, h);
    this.setCount(count);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    if (this.agents) {
      for (const a of this.agents) {
        a.x = Math.max(20, Math.min(w - 20, a.x));
        a.y = Math.max(20, Math.min(h - 20, a.y));
      }
    }
  }

  setCount(n) {
    while (this.agents.length < n) {
      this.agents.push(makeAgent(this.agents.length, this.w, this.h));
    }
    while (this.agents.length > n) {
      const removed = this.agents.pop();
      // cancel any trades referencing removed
      this.trades = this.trades.filter(t => t.a !== removed.id && t.b !== removed.id);
      for (const a of this.agents) {
        if (a.engagedWith === removed.id) a.engagedWith = null;
      }
      // drop edges referencing removed
      for (const k of Array.from(this.edges.keys())) {
        const e = this.edges.get(k);
        if (e.a === removed.id || e.b === removed.id) this.edges.delete(k);
      }
    }
  }

  step(dt, opts) {
    const { speed, interactionFreq, pilot } = opts;
    this.tick += dt;
    const W = this.w, H = this.h;
    const agents = this.agents;
    const exchangeAgents = new Set();
    for (const trade of this.trades) {
      if (trade.phase === 'exchange') {
        exchangeAgents.add(trade.a);
        exchangeAgents.add(trade.b);
      }
    }

    // Update wander
    for (const a of agents) {
      a.bob += dt * 3;
      // ease velocity toward target
      a.vx += (a.targetVx - a.vx) * Math.min(1, dt * 1.2);
      a.vy += (a.targetVy - a.vy) * Math.min(1, dt * 1.2);

      // small random target changes
      if (Math.random() < dt * 0.6) {
        a.targetVx = rnd(-1, 1);
        a.targetVy = rnd(-1, 1);
      }

      // If engaged, steer toward partner
      if (a.engagedWith != null) {
        const p = agents[a.engagedWith];
        if (p) {
          const dx = p.x - a.x, dy = p.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          a.vx = (dx / d) * 0.6;
          a.vy = (dy / d) * 0.6;
        }
      }

      if (pilot?.agentId === a.id && !exchangeAgents.has(a.id)) {
        const move = pilotVector(pilot.input);
        if (move) {
          const manualGain = pilot.input?.boost ? 2.9 : 1.9;
          a.vx = move.x * manualGain;
          a.vy = move.y * manualGain;
          a.targetVx = a.vx;
          a.targetVy = a.vy;
        } else if (pilot.input?.brake) {
          const hold = Math.max(0, 1 - dt * 8);
          a.vx *= hold;
          a.vy *= hold;
          a.targetVx = 0;
          a.targetVy = 0;
        }
      }

      const spd = speed * 28; // px/sec base
      // Obstacle repulsion — push away from nearby wall segments
      if (this.obstacles.length) {
        let fx = 0, fy = 0;
        const R = 26;
        for (const ob of this.obstacles) {
          const pts = ob.points;
          for (let k = 0; k < pts.length - 1; k++) {
            const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
            // closest point on segment to agent
            const dx = x2 - x1, dy = y2 - y1;
            const segLen2 = dx * dx + dy * dy || 1;
            let tt = ((a.x - x1) * dx + (a.y - y1) * dy) / segLen2;
            tt = Math.max(0, Math.min(1, tt));
            const cxp = x1 + dx * tt, cyp = y1 + dy * tt;
            const ddx = a.x - cxp, ddy = a.y - cyp;
            const d = Math.hypot(ddx, ddy);
            if (d < R && d > 0.01) {
              const push = (1 - d / R);
              fx += (ddx / d) * push;
              fy += (ddy / d) * push;
            } else if (d <= 0.01) {
              fx += Math.random() - 0.5;
              fy += Math.random() - 0.5;
            }
          }
        }
        if (fx || fy) {
          a.vx += fx * 2.2;
          a.vy += fy * 2.2;
          a.targetVx = a.vx;
          a.targetVy = a.vy;
        }
      }
      a.x += a.vx * spd * dt;
      a.y += a.vy * spd * dt;

      // soft bounds
      const margin = 24;
      if (a.x < margin) { a.x = margin; a.targetVx = Math.abs(a.targetVx); }
      if (a.x > W - margin) { a.x = W - margin; a.targetVx = -Math.abs(a.targetVx); }
      if (a.y < margin) { a.y = margin; a.targetVy = Math.abs(a.targetVy); }
      if (a.y > H - margin) { a.y = H - margin; a.targetVy = -Math.abs(a.targetVy); }

      a.cooldown = Math.max(0, a.cooldown - dt);
    }

    // Initiate trades: scan for close pairs, occasionally start one
    const IR = 46; // detection radius
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.engagedWith != null || a.cooldown > 0) continue;
      for (let j = i + 1; j < agents.length; j++) {
        const b = agents[j];
        if (b.engagedWith != null || b.cooldown > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < IR * IR) {
          // chance scaled by proximity and interactionFreq
          const p = interactionFreq * dt * (1 - Math.sqrt(d2) / IR) * 4;
          if (Math.random() < p) {
            this._startTrade(a, b);
            break;
          }
        }
      }
    }

    // Advance trades
    const stillTrading = [];
    for (const t of this.trades) {
      t.t += dt;
      const a = agents[t.a], b = agents[t.b];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (t.phase === 'approach') {
        if (d < 22) {
          t.phase = 'exchange';
          t.t = 0;
        } else if (t.t > 3) {
          a.engagedWith = null;
          b.engagedWith = null;
          a.cooldown = Math.max(a.cooldown, rnd(0.6, 1.1));
          b.cooldown = Math.max(b.cooldown, rnd(0.6, 1.1));
          a.targetVx = rnd(-1, 1); a.targetVy = rnd(-1, 1);
          b.targetVx = rnd(-1, 1); b.targetVy = rnd(-1, 1);
          continue;
        }
      } else if (t.phase === 'exchange') {
        // stay put-ish (already steering toward each other, but damp)
        a.vx *= 0.85; a.vy *= 0.85;
        b.vx *= 0.85; b.vy *= 0.85;
        if (t.t > 1.2) {
          // complete
          const tmp = a.resource; a.resource = b.resource; b.resource = tmp;
          a.trades++; b.trades++;
          a.cooldown = rnd(1.2, 2.6);
          b.cooldown = rnd(1.2, 2.6);
          a.engagedWith = null; b.engagedWith = null;
          a.targetVx = rnd(-1, 1); a.targetVy = rnd(-1, 1);
          b.targetVx = rnd(-1, 1); b.targetVy = rnd(-1, 1);
          this.totalTrades++;
          this.tradesWindow.push(performance.now());
          // soft golden glow pulse at midpoint
          this.sparks.push({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            life: 0,
            ttl: 1.2,
            pair: [a.id, b.id],
          });
          // edge weight
          const i = Math.min(a.id, b.id), j = Math.max(a.id, b.id);
          const key = i + '-' + j;
          let edge = this.edges.get(key);
          if (!edge) {
            edge = { a: i, b: j, weight: 0, lastT: 0 };
            this.edges.set(key, edge);
          }
          edge.weight++;
          edge.lastT = performance.now();
          this.tradeLog.unshift({
            t: performance.now(),
            a: a.label, b: b.label,
            r1: a.resource, r2: b.resource,
          });
          if (this.tradeLog.length > 40) this.tradeLog.length = 40;
          continue; // don't keep
        }
      }
      stillTrading.push(t);
    }
    this.trades = stillTrading;

    // advance sparks (stationary soft glows)
    const liveSparks = [];
    for (const s of this.sparks) {
      s.life += dt;
      if (s.life >= s.ttl) continue;
      liveSparks.push(s);
    }
    this.sparks = liveSparks;

    // prune window to last 10s
    const cutoff = performance.now() - 10000;
    while (this.tradesWindow.length && this.tradesWindow[0] < cutoff) {
      this.tradesWindow.shift();
    }
  }

  _startTrade(a, b) {
    a.engagedWith = b.id;
    b.engagedWith = a.id;
    this.trades.push({ a: a.id, b: b.id, phase: 'approach', t: 0 });
  }

  stats() {
    const now = performance.now();
    const uptime = (now - this.startTime) / 1000;
    const rate = this.tradesWindow.length / 10;
    let active = 0;
    for (const a of this.agents) if (a.engagedWith != null) active++;
    const idle = this.agents.length - active;
    return {
      count: this.agents.length,
      uptime,
      totalTrades: this.totalTrades,
      rate,
      active,
      idle,
      tick: this.tick,
    };
  }
}

Object.assign(window, { Farm, SPRITES, SPRITE_KEYS, RESOURCES, RESOURCE_KEYS });
