(() => {
  const svgNs = "http://www.w3.org/2000/svg";
  const bounds = { width: 960, height: 620, padX: 72, padY: 72 };
  const state = {
    model: "er",
    nodeCount: 14,
    density: 28,
    source: 0,
    target: 1,
    selectionMode: "source",
    seed: 1,
    graph: null,
  };

  const canvas = document.getElementById("graph-lab-canvas");
  const modelSelect = document.getElementById("graph-model");
  const nodeCountInput = document.getElementById("graph-node-count");
  const densityInput = document.getElementById("graph-density");
  const sourceSelect = document.getElementById("graph-source");
  const targetSelect = document.getElementById("graph-target");
  const regenerateButton = document.getElementById("graph-regenerate");
  const shufflePairButton = document.getElementById("graph-shuffle-pair");

  const modelLabel = document.getElementById("graph-model-label");
  const nodeCountValue = document.getElementById("node-count-value");
  const densityValue = document.getElementById("density-value");
  const sourceLabel = document.getElementById("source-label");
  const targetLabel = document.getElementById("target-label");
  const surfaceCaption = document.getElementById("surface-caption");

  const statNodeCount = document.getElementById("stat-node-count");
  const statEdgeCount = document.getElementById("stat-edge-count");
  const statComponents = document.getElementById("stat-components");
  const statAveragePath = document.getElementById("stat-average-path");

  const distanceTitle = document.getElementById("distance-title");
  const distanceShortest = document.getElementById("distance-shortest");
  const distanceDegreeGap = document.getElementById("distance-degree-gap");
  const distanceCommonNeighbors = document.getElementById("distance-common-neighbors");
  const distanceMembership = document.getElementById("distance-membership");
  const pathChip = document.getElementById("path-chip");
  const densityChip = document.getElementById("density-chip");

  const modelNames = {
    er: "Erdos-Renyi",
    sbm: "Stochastic Block Model",
    lattice: "Ring Lattice",
  };

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let value = Math.imul(t ^ (t >>> 15), 1 | t);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function labelFor(index) {
    return `A${String(index + 1).padStart(2, "0")}`;
  }

  function edgeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function addVector(position, dx, dy) {
    position.vx += dx;
    position.vy += dy;
  }

  function buildInitialPositions(count, rand, blocks) {
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    if (state.model === "lattice") {
      const rx = 320;
      const ry = 220;
      return Array.from({ length: count }, (_, index) => {
        const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
        return {
          x: cx + Math.cos(angle) * rx,
          y: cy + Math.sin(angle) * ry,
          vx: 0,
          vy: 0,
        };
      });
    }

    if (state.model === "sbm") {
      return Array.from({ length: count }, (_, index) => {
        const anchorX = blocks[index] === 0 ? 310 : 650;
        const anchorY = cy + ((index % 6) - 2.5) * 34;
        return {
          x: anchorX + (rand() - 0.5) * 80,
          y: anchorY + (rand() - 0.5) * 80,
          vx: 0,
          vy: 0,
        };
      });
    }

    const rx = 300;
    const ry = 210;
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
      const jitter = 0.88 + rand() * 0.2;
      return {
        x: cx + Math.cos(angle) * rx * jitter + (rand() - 0.5) * 36,
        y: cy + Math.sin(angle) * ry * jitter + (rand() - 0.5) * 26,
        vx: 0,
        vy: 0,
      };
    });
  }

  function relaxPositions(positions, adjacency, edges, blocks) {
    const iterations = state.model === "lattice" ? 80 : 180;
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    for (let step = 0; step < iterations; step += 1) {
      positions.forEach((position) => {
        position.vx = 0;
        position.vy = 0;
      });

      for (let i = 0; i < positions.length; i += 1) {
        for (let j = i + 1; j < positions.length; j += 1) {
          const a = positions[i];
          const b = positions[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distSq = dx * dx + dy * dy;
          if (distSq < 0.01) {
            dx = 0.5 - Math.random();
            dy = 0.5 - Math.random();
            distSq = dx * dx + dy * dy;
          }
          const dist = Math.sqrt(distSq);
          const repulsion = 3400 / distSq;
          const fx = (dx / dist) * repulsion;
          const fy = (dy / dist) * repulsion;
          addVector(a, -fx, -fy);
          addVector(b, fx, fy);
        }
      }

      edges.forEach(([from, to]) => {
        const a = positions[from];
        const b = positions[to];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const idealLength =
          state.model === "lattice"
            ? 104
            : state.model === "sbm" && blocks[from] === blocks[to]
              ? 96
              : 132;
        const spring = (dist - idealLength) * 0.012;
        const fx = (dx / dist) * spring;
        const fy = (dy / dist) * spring;
        addVector(a, fx, fy);
        addVector(b, -fx, -fy);
      });

      positions.forEach((position, index) => {
        const centerX =
          state.model === "sbm" ? (blocks[index] === 0 ? 320 : 640) : cx;
        const centerY = cy;
        position.vx += (centerX - position.x) * 0.0024;
        position.vy += (centerY - position.y) * 0.0024;

        position.x = clamp(position.x + position.vx, bounds.padX, bounds.width - bounds.padX);
        position.y = clamp(position.y + position.vy, bounds.padY, bounds.height - bounds.padY);
      });
    }
  }

  function buildGraph() {
    const rand = mulberry32(state.seed);
    const n = state.nodeCount;
    const p = state.density / 100;
    const adjacency = Array.from({ length: n }, () => new Set());
    const edges = [];
    const blocks = Array.from({ length: n }, (_, index) => (index < Math.ceil(n / 2) ? 0 : 1));

    function addEdge(a, b) {
      if (a === b || adjacency[a].has(b)) {
        return;
      }
      adjacency[a].add(b);
      adjacency[b].add(a);
      edges.push([a, b]);
    }

    if (state.model === "er") {
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          if (rand() < p) {
            addEdge(i, j);
          }
        }
      }
    }

    if (state.model === "sbm") {
      const within = clamp(p * 1.75, 0.18, 0.88);
      const across = clamp(p * 0.45, 0.04, 0.38);
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const threshold = blocks[i] === blocks[j] ? within : across;
          if (rand() < threshold) {
            addEdge(i, j);
          }
        }
      }
    }

    if (state.model === "lattice") {
      const neighbors = Math.max(1, Math.round((p * n) / 4));
      for (let i = 0; i < n; i += 1) {
        for (let step = 1; step <= neighbors; step += 1) {
          addEdge(i, (i + step) % n);
          addEdge(i, (i - step + n) % n);
        }
      }
      const baseEdges = [...edges];
      baseEdges.forEach(([a, b]) => {
        if (rand() < p * 0.16) {
          adjacency[a].delete(b);
          adjacency[b].delete(a);
          const edgeIndex = edges.findIndex(([u, v]) => edgeKey(u, v) === edgeKey(a, b));
          if (edgeIndex >= 0) {
            edges.splice(edgeIndex, 1);
          }
          let candidate = Math.floor(rand() * n);
          while (candidate === a || adjacency[a].has(candidate)) {
            candidate = Math.floor(rand() * n);
          }
          addEdge(a, candidate);
        }
      });
    }

    for (let i = 0; i < n; i += 1) {
      if (adjacency[i].size === 0) {
        let candidate = Math.floor(rand() * n);
        while (candidate === i) {
          candidate = Math.floor(rand() * n);
        }
        addEdge(i, candidate);
      }
    }

    const positions = buildInitialPositions(n, rand, blocks);
    relaxPositions(positions, adjacency, edges, blocks);

    return {
      positions,
      adjacency,
      edges,
      blocks,
    };
  }

  function bfs(start) {
    const distances = Array(state.nodeCount).fill(Infinity);
    const parents = Array(state.nodeCount).fill(-1);
    const queue = [start];
    distances[start] = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      state.graph.adjacency[node].forEach((neighbor) => {
        if (distances[neighbor] !== Infinity) {
          return;
        }
        distances[neighbor] = distances[node] + 1;
        parents[neighbor] = node;
        queue.push(neighbor);
      });
    }

    return { distances, parents };
  }

  function computeComponents() {
    const seen = Array(state.nodeCount).fill(false);
    let components = 0;

    for (let i = 0; i < state.nodeCount; i += 1) {
      if (seen[i]) {
        continue;
      }
      components += 1;
      const queue = [i];
      seen[i] = true;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const node = queue[cursor];
        state.graph.adjacency[node].forEach((neighbor) => {
          if (seen[neighbor]) {
            return;
          }
          seen[neighbor] = true;
          queue.push(neighbor);
        });
      }
    }

    return components;
  }

  function averagePathLength() {
    let total = 0;
    let pairs = 0;
    for (let i = 0; i < state.nodeCount; i += 1) {
      const { distances } = bfs(i);
      for (let j = i + 1; j < state.nodeCount; j += 1) {
        if (distances[j] === Infinity) {
          continue;
        }
        total += distances[j];
        pairs += 1;
      }
    }
    return pairs ? total / pairs : null;
  }

  function currentPath() {
    const { distances, parents } = bfs(state.source);
    if (distances[state.target] === Infinity) {
      return null;
    }
    const path = [];
    let cursor = state.target;
    while (cursor !== -1) {
      path.push(cursor);
      if (cursor === state.source) {
        break;
      }
      cursor = parents[cursor];
    }
    path.reverse();
    return path;
  }

  function syncSelectOptions() {
    const options = Array.from({ length: state.nodeCount }, (_, index) => {
      const selectedSource = index === state.source ? " selected" : "";
      const selectedTarget = index === state.target ? " selected" : "";
      return {
        source: `<option value="${index}"${selectedSource}>${labelFor(index)}</option>`,
        target: `<option value="${index}"${selectedTarget}>${labelFor(index)}</option>`,
      };
    });
    sourceSelect.innerHTML = options.map((item) => item.source).join("");
    targetSelect.innerHTML = options.map((item) => item.target).join("");
    sourceLabel.textContent = labelFor(state.source);
    targetLabel.textContent = labelFor(state.target);
  }

  function updateMetrics() {
    const edgeCount = state.graph.edges.length;
    const components = computeComponents();
    const averagePath = averagePathLength();
    const degrees = state.graph.adjacency.map((neighbors) => neighbors.size);
    const path = currentPath();
    const commonNeighbors = [...state.graph.adjacency[state.source]].filter((neighbor) =>
      state.graph.adjacency[state.target].has(neighbor)
    ).length;
    const possibleEdges = (state.nodeCount * (state.nodeCount - 1)) / 2;
    const graphDensity = possibleEdges ? edgeCount / possibleEdges : 0;

    statNodeCount.textContent = String(state.nodeCount);
    statEdgeCount.textContent = String(edgeCount);
    statComponents.textContent = String(components);
    statAveragePath.textContent = averagePath ? averagePath.toFixed(2) : "--";

    distanceTitle.textContent = `${labelFor(state.source)} to ${labelFor(state.target)}`;
    distanceShortest.textContent = path
      ? `Shortest path: ${path.length - 1} hops`
      : "Shortest path: unreachable";
    distanceDegreeGap.textContent = `Degree difference: ${Math.abs(degrees[state.source] - degrees[state.target])}`;
    distanceCommonNeighbors.textContent = `Common neighbors: ${commonNeighbors}`;

    if (state.model === "sbm") {
      distanceMembership.textContent =
        state.graph.blocks[state.source] === state.graph.blocks[state.target]
          ? "Community relation: same block"
          : "Community relation: cross-block";
    } else if (state.model === "lattice") {
      distanceMembership.textContent = "Community relation: ring-local structure";
    } else {
      distanceMembership.textContent = "Community relation: unstructured regime";
    }

    pathChip.textContent = path ? `Path length ${path.length - 1}` : "No connecting path";
    densityChip.textContent = `Density ${(graphDensity * 100).toFixed(1)}%`;
  }

  function renderGraph() {
    const path = currentPath();
    const pathEdges = new Set();
    if (path) {
      for (let i = 0; i < path.length - 1; i += 1) {
        pathEdges.add(edgeKey(path[i], path[i + 1]));
      }
    }

    canvas.innerHTML = "";

    state.graph.edges.forEach(([a, b]) => {
      const edge = document.createElementNS(svgNs, "line");
      edge.setAttribute("x1", state.graph.positions[a].x.toFixed(2));
      edge.setAttribute("y1", state.graph.positions[a].y.toFixed(2));
      edge.setAttribute("x2", state.graph.positions[b].x.toFixed(2));
      edge.setAttribute("y2", state.graph.positions[b].y.toFixed(2));
      edge.setAttribute(
        "class",
        pathEdges.has(edgeKey(a, b)) ? "graph-edge path-edge" : "graph-edge"
      );
      canvas.appendChild(edge);
    });

    [state.source, state.target].forEach((index) => {
      const halo = document.createElementNS(svgNs, "circle");
      halo.setAttribute("cx", state.graph.positions[index].x.toFixed(2));
      halo.setAttribute("cy", state.graph.positions[index].y.toFixed(2));
      halo.setAttribute("r", "18");
      halo.setAttribute("fill", "none");
      halo.setAttribute("stroke", "rgba(42, 44, 56, 0.18)");
      halo.setAttribute("stroke-width", "2");
      canvas.appendChild(halo);
    });

    state.graph.positions.forEach((position, index) => {
      const node = document.createElementNS(svgNs, "circle");
      const classes = ["graph-node"];
      if (state.model === "sbm" && state.graph.blocks[index] === 1) {
        classes.push("block-b");
      }
      if (index === state.source || index === state.target) {
        classes.push("selected");
      }
      node.setAttribute("class", classes.join(" "));
      node.setAttribute("cx", position.x.toFixed(2));
      node.setAttribute("cy", position.y.toFixed(2));
      node.setAttribute("r", index === state.source || index === state.target ? "9.5" : "7");
      node.dataset.index = String(index);
      node.addEventListener("click", () => {
        if (state.selectionMode === "source") {
          state.source = index;
          if (state.source === state.target) {
            state.target = (state.target + 1) % state.nodeCount;
          }
          state.selectionMode = "target";
        } else {
          state.target = index;
          if (state.target === state.source) {
            state.source = (state.source + 1) % state.nodeCount;
          }
          state.selectionMode = "source";
        }
        refresh();
      });
      canvas.appendChild(node);
    });

    [state.source, state.target].forEach((index) => {
      const label = document.createElementNS(svgNs, "text");
      label.setAttribute("class", "graph-label selected");
      label.setAttribute("x", (state.graph.positions[index].x + 14).toFixed(2));
      label.setAttribute("y", (state.graph.positions[index].y - 14).toFixed(2));
      label.textContent = labelFor(index);
      canvas.appendChild(label);
    });

    surfaceCaption.textContent =
      state.selectionMode === "source"
        ? "next click sets source node"
        : "next click sets target node";
  }

  function refresh() {
    modelLabel.textContent = modelNames[state.model];
    nodeCountValue.textContent = String(state.nodeCount);
    densityValue.textContent = `${state.density}%`;
    syncSelectOptions();
    updateMetrics();
    renderGraph();
  }

  function regenerateGraph(newSeed = true) {
    if (newSeed) {
      state.seed = (Date.now() + Math.floor(Math.random() * 100000)) >>> 0;
    }
    state.graph = buildGraph();
    if (state.source >= state.nodeCount) {
      state.source = 0;
    }
    if (state.target >= state.nodeCount || state.target === state.source) {
      state.target = Math.min(1, state.nodeCount - 1);
    }
    refresh();
  }

  function shufflePair() {
    state.source = Math.floor(Math.random() * state.nodeCount);
    do {
      state.target = Math.floor(Math.random() * state.nodeCount);
    } while (state.target === state.source && state.nodeCount > 1);
    state.selectionMode = "source";
    refresh();
  }

  modelSelect.addEventListener("change", () => {
    state.model = modelSelect.value;
    regenerateGraph();
  });

  nodeCountInput.addEventListener("input", () => {
    state.nodeCount = Number(nodeCountInput.value);
    regenerateGraph();
  });

  densityInput.addEventListener("input", () => {
    state.density = Number(densityInput.value);
    regenerateGraph();
  });

  sourceSelect.addEventListener("change", () => {
    state.source = Number(sourceSelect.value);
    if (state.source === state.target) {
      state.target = (state.target + 1) % state.nodeCount;
    }
    refresh();
  });

  targetSelect.addEventListener("change", () => {
    state.target = Number(targetSelect.value);
    if (state.target === state.source) {
      state.source = (state.source + 1) % state.nodeCount;
    }
    refresh();
  });

  regenerateButton.addEventListener("click", () => regenerateGraph(true));
  shufflePairButton.addEventListener("click", shufflePair);

  state.seed = (Date.now() >>> 0) ^ 0x51f15c;
  regenerateGraph(false);
})();
