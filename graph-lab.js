(() => {
  const svgNs = "http://www.w3.org/2000/svg";
  const graphBounds = { width: 480, height: 520, padX: 44, padY: 48 };
  const distributionBounds = { width: 960, height: 260 };

  const state = {
    nodeCount: 16,
    sampleCount: 80,
    statKey: "edgeCount",
    pairSeed: (Date.now() >>> 0) ^ 0x31751,
    batchSeed: (Date.now() >>> 0) ^ 0x91a4b,
    graphA: {
      model: "er",
      density: 28,
      graph: null,
    },
    graphB: {
      model: "sbm",
      density: 28,
      graph: null,
    },
    batch: null,
  };

  const graphACanvas = document.getElementById("graph-a-canvas");
  const graphBCanvas = document.getElementById("graph-b-canvas");
  const distributionCanvas = document.getElementById("distribution-canvas");

  const graphAModelSelect = document.getElementById("graph-a-model");
  const graphBModelSelect = document.getElementById("graph-b-model");
  const graphADensityInput = document.getElementById("graph-a-density");
  const graphBDensityInput = document.getElementById("graph-b-density");
  const nodeCountInput = document.getElementById("graph-node-count");
  const sampleCountInput = document.getElementById("batch-sample-count");
  const batchStatisticSelect = document.getElementById("batch-statistic");
  const regeneratePairButton = document.getElementById("graph-regenerate-pair");
  const runBatchButton = document.getElementById("graph-run-batch");

  const graphlabCaption = document.getElementById("graphlab-caption");
  const graphAModelLabel = document.getElementById("graph-a-model-label");
  const graphBModelLabel = document.getElementById("graph-b-model-label");
  const graphADensityValue = document.getElementById("graph-a-density-value");
  const graphBDensityValue = document.getElementById("graph-b-density-value");
  const graphNodeCountValue = document.getElementById("graph-node-count-value");
  const batchSampleCountValue = document.getElementById("batch-sample-count-value");
  const batchStatLabel = document.getElementById("batch-stat-label");
  const graphASubtitle = document.getElementById("graph-a-subtitle");
  const graphBSubtitle = document.getElementById("graph-b-subtitle");
  const pairSummary = document.getElementById("pair-summary");
  const batchSummary = document.getElementById("batch-summary");
  const batchStatChip = document.getElementById("batch-stat-chip");
  const batchCountChip = document.getElementById("batch-count-chip");

  const modelNames = {
    er: "Erdos-Renyi",
    sbm: "Stochastic Block Model",
    lattice: "Ring Lattice",
  };

  const statLabels = {
    edgeCount: "Edge count",
    density: "Density",
    components: "Components",
    avgDegree: "Average degree",
    avgPath: "Average path",
    clustering: "Clustering",
    triangles: "Triangles",
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

  function edgeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function addVector(position, dx, dy) {
    position.vx += dx;
    position.vy += dy;
  }

  function metricValue(metrics, key) {
    if (key === "density") {
      return metrics.density * 100;
    }
    return metrics[key];
  }

  function formatValue(key, value) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return "--";
    }
    if (key === "edgeCount" || key === "components" || key === "triangles") {
      return String(Math.round(value));
    }
    if (key === "density") {
      return `${value.toFixed(1)}%`;
    }
    return value.toFixed(2);
  }

  function mean(values) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  function standardDeviation(values) {
    if (!values.length) {
      return 0;
    }
    const avg = mean(values);
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  function median(values) {
    if (!values.length) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function buildInitialPositions(model, count, rand, blocks) {
    const cx = graphBounds.width / 2;
    const cy = graphBounds.height / 2;

    if (model === "lattice") {
      const rx = 170;
      const ry = 180;
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

    if (model === "sbm") {
      return Array.from({ length: count }, (_, index) => {
        const anchorX = blocks[index] === 0 ? 150 : 330;
        const anchorY = cy + ((index % 8) - 3.5) * 26;
        return {
          x: anchorX + (rand() - 0.5) * 48,
          y: anchorY + (rand() - 0.5) * 60,
          vx: 0,
          vy: 0,
        };
      });
    }

    const rx = 165;
    const ry = 175;
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
      const jitter = 0.9 + rand() * 0.18;
      return {
        x: cx + Math.cos(angle) * rx * jitter + (rand() - 0.5) * 26,
        y: cy + Math.sin(angle) * ry * jitter + (rand() - 0.5) * 24,
        vx: 0,
        vy: 0,
      };
    });
  }

  function relaxPositions(model, positions, adjacency, edges, blocks, rand) {
    const iterations = model === "lattice" ? 70 : 150;
    const cx = graphBounds.width / 2;
    const cy = graphBounds.height / 2;

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
            dx = 0.5 - rand();
            dy = 0.5 - rand();
            distSq = dx * dx + dy * dy;
          }
          const dist = Math.sqrt(distSq);
          const repulsion = 2400 / distSq;
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
          model === "lattice"
            ? 84
            : model === "sbm" && blocks[from] === blocks[to]
              ? 72
              : 112;
        const spring = (dist - idealLength) * 0.015;
        const fx = (dx / dist) * spring;
        const fy = (dy / dist) * spring;
        addVector(a, fx, fy);
        addVector(b, -fx, -fy);
      });

      positions.forEach((position, index) => {
        const centerX = model === "sbm" ? (blocks[index] === 0 ? 160 : 320) : cx;
        position.vx += (centerX - position.x) * 0.003;
        position.vy += (cy - position.y) * 0.003;
        position.x = clamp(position.x + position.vx, graphBounds.padX, graphBounds.width - graphBounds.padX);
        position.y = clamp(position.y + position.vy, graphBounds.padY, graphBounds.height - graphBounds.padY);
      });
    }
  }

  function bfsGraph(adjacency, start) {
    const distances = Array(adjacency.length).fill(Infinity);
    const queue = [start];
    distances[start] = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      adjacency[node].forEach((neighbor) => {
        if (distances[neighbor] !== Infinity) {
          return;
        }
        distances[neighbor] = distances[node] + 1;
        queue.push(neighbor);
      });
    }

    return distances;
  }

  function componentCount(adjacency) {
    const seen = Array(adjacency.length).fill(false);
    let components = 0;

    for (let index = 0; index < adjacency.length; index += 1) {
      if (seen[index]) {
        continue;
      }
      components += 1;
      const queue = [index];
      seen[index] = true;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const node = queue[cursor];
        adjacency[node].forEach((neighbor) => {
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

  function averagePathLength(adjacency) {
    let total = 0;
    let pairs = 0;

    for (let i = 0; i < adjacency.length; i += 1) {
      const distances = bfsGraph(adjacency, i);
      for (let j = i + 1; j < adjacency.length; j += 1) {
        if (distances[j] === Infinity) {
          continue;
        }
        total += distances[j];
        pairs += 1;
      }
    }

    return pairs ? total / pairs : null;
  }

  function triangleCount(adjacency) {
    let triangles = 0;
    for (let i = 0; i < adjacency.length; i += 1) {
      for (let j = i + 1; j < adjacency.length; j += 1) {
        if (!adjacency[i].has(j)) {
          continue;
        }
        for (let k = j + 1; k < adjacency.length; k += 1) {
          if (adjacency[i].has(k) && adjacency[j].has(k)) {
            triangles += 1;
          }
        }
      }
    }
    return triangles;
  }

  function averageClustering(adjacency) {
    let total = 0;

    adjacency.forEach((neighbors) => {
      const list = [...neighbors];
      const k = list.length;
      if (k < 2) {
        return;
      }
      let links = 0;
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          if (adjacency[list[i]].has(list[j])) {
            links += 1;
          }
        }
      }
      total += links / ((k * (k - 1)) / 2);
    });

    return adjacency.length ? total / adjacency.length : 0;
  }

  function computeMetrics(graph) {
    const nodeCount = graph.adjacency.length;
    const edgeCount = graph.edges.length;
    const degrees = graph.adjacency.map((neighbors) => neighbors.size);
    const possibleEdges = (nodeCount * (nodeCount - 1)) / 2;

    return {
      edgeCount,
      density: possibleEdges ? edgeCount / possibleEdges : 0,
      components: componentCount(graph.adjacency),
      avgDegree: degrees.length
        ? degrees.reduce((sum, degree) => sum + degree, 0) / degrees.length
        : 0,
      avgPath: averagePathLength(graph.adjacency),
      clustering: averageClustering(graph.adjacency),
      triangles: triangleCount(graph.adjacency),
    };
  }

  function buildGraph(config, seed) {
    const rand = mulberry32(seed);
    const n = config.nodeCount;
    const p = config.density / 100;
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

    if (config.model === "er") {
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          if (rand() < p) {
            addEdge(i, j);
          }
        }
      }
    }

    if (config.model === "sbm") {
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

    if (config.model === "lattice") {
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

    const positions = buildInitialPositions(config.model, n, rand, blocks);
    relaxPositions(config.model, positions, adjacency, edges, blocks, rand);

    const graph = {
      config,
      positions,
      adjacency,
      edges,
      blocks,
      nodeCount: n,
    };
    graph.metrics = computeMetrics(graph);
    return graph;
  }

  function profileGap(metricsA, metricsB, nodeCount) {
    const triangleScale = Math.max(1, (nodeCount * (nodeCount - 1) * (nodeCount - 2)) / 6);
    const vectorA = [
      metricsA.density,
      metricsA.components / nodeCount,
      metricsA.avgDegree / Math.max(1, nodeCount - 1),
      (metricsA.avgPath ?? 0) / Math.max(1, nodeCount - 1),
      metricsA.clustering,
      metricsA.triangles / triangleScale,
    ];
    const vectorB = [
      metricsB.density,
      metricsB.components / nodeCount,
      metricsB.avgDegree / Math.max(1, nodeCount - 1),
      (metricsB.avgPath ?? 0) / Math.max(1, nodeCount - 1),
      metricsB.clustering,
      metricsB.triangles / triangleScale,
    ];

    const squared = vectorA.reduce((sum, value, index) => {
      return sum + (value - vectorB[index]) ** 2;
    }, 0);

    return Math.sqrt(squared / vectorA.length);
  }

  function syncControlLabels() {
    graphAModelLabel.textContent = modelNames[state.graphA.model];
    graphBModelLabel.textContent = modelNames[state.graphB.model];
    graphADensityValue.textContent = `${state.graphA.density}%`;
    graphBDensityValue.textContent = `${state.graphB.density}%`;
    graphNodeCountValue.textContent = String(state.nodeCount);
    batchSampleCountValue.textContent = String(state.sampleCount);
    batchStatLabel.textContent = statLabels[state.statKey];
    batchStatChip.textContent = statLabels[state.statKey];
    batchCountChip.textContent = `${state.sampleCount} samples`;
  }

  function graphSubtitle(graph) {
    return `${modelNames[graph.config.model]} · ${graph.metrics.edgeCount} edges · ${formatValue("density", metricValue(graph.metrics, "density"))}`;
  }

  function renderGraph(svg, graph) {
    svg.innerHTML = "";
    const degrees = graph.adjacency.map((neighbors) => neighbors.size);
    const maxDegree = Math.max(...degrees, 1);

    graph.edges.forEach(([a, b]) => {
      const edge = document.createElementNS(svgNs, "line");
      edge.setAttribute("x1", graph.positions[a].x.toFixed(2));
      edge.setAttribute("y1", graph.positions[a].y.toFixed(2));
      edge.setAttribute("x2", graph.positions[b].x.toFixed(2));
      edge.setAttribute("y2", graph.positions[b].y.toFixed(2));
      edge.setAttribute("class", "graph-edge");
      svg.appendChild(edge);
    });

    graph.positions.forEach((position, index) => {
      const node = document.createElementNS(svgNs, "circle");
      const classes = ["graph-node"];
      if (graph.config.model === "sbm" && graph.blocks[index] === 1) {
        classes.push("block-b");
      }
      node.setAttribute("class", classes.join(" "));
      node.setAttribute("cx", position.x.toFixed(2));
      node.setAttribute("cy", position.y.toFixed(2));
      node.setAttribute("r", (5.2 + 3.4 * Math.sqrt(degrees[index] / maxDegree)).toFixed(2));
      svg.appendChild(node);
    });
  }

  function renderPairSummary() {
    const metricsA = state.graphA.graph.metrics;
    const metricsB = state.graphB.graph.metrics;
    const gap = profileGap(metricsA, metricsB, state.nodeCount);

    pairSummary.innerHTML = [
      `<li>Edges: A ${formatValue("edgeCount", metricsA.edgeCount)} · B ${formatValue("edgeCount", metricsB.edgeCount)}</li>`,
      `<li>Density: A ${formatValue("density", metricValue(metricsA, "density"))} · B ${formatValue("density", metricValue(metricsB, "density"))}</li>`,
      `<li>Components: A ${formatValue("components", metricsA.components)} · B ${formatValue("components", metricsB.components)}</li>`,
      `<li>Average degree: A ${formatValue("avgDegree", metricsA.avgDegree)} · B ${formatValue("avgDegree", metricsB.avgDegree)}</li>`,
      `<li>Average path: A ${formatValue("avgPath", metricsA.avgPath)} · B ${formatValue("avgPath", metricsB.avgPath)}</li>`,
      `<li>Clustering: A ${formatValue("clustering", metricsA.clustering)} · B ${formatValue("clustering", metricsB.clustering)}</li>`,
      `<li>Profile gap: ${gap.toFixed(3)}</li>`,
    ].join("");
  }

  function sampleValues(sampleList) {
    return sampleList
      .map((metrics) => metricValue(metrics, state.statKey))
      .filter((value) => Number.isFinite(value));
  }

  function drawChartText(svg, x, y, text, anchor = "start") {
    const label = document.createElementNS(svgNs, "text");
    label.setAttribute("class", "graph-label");
    label.setAttribute("x", x.toFixed(2));
    label.setAttribute("y", y.toFixed(2));
    label.setAttribute("text-anchor", anchor);
    label.textContent = text;
    svg.appendChild(label);
  }

  function renderDistribution() {
    distributionCanvas.innerHTML = "";
    if (!state.batch) {
      return;
    }

    const valuesA = sampleValues(state.batch.samplesA);
    const valuesB = sampleValues(state.batch.samplesB);
    const allValues = [...valuesA, ...valuesB];
    if (!allValues.length) {
      return;
    }

    let minValue = Math.min(...allValues);
    let maxValue = Math.max(...allValues);
    if (minValue === maxValue) {
      minValue -= 1;
      maxValue += 1;
    }

    const binCount = clamp(Math.round(Math.sqrt(state.sampleCount) * 1.7), 8, 18);
    const binWidth = (maxValue - minValue) / binCount;
    const countsA = Array(binCount).fill(0);
    const countsB = Array(binCount).fill(0);

    function countInto(values, target) {
      values.forEach((value) => {
        const rawIndex = Math.floor((value - minValue) / binWidth);
        const index = clamp(rawIndex, 0, binCount - 1);
        target[index] += 1;
      });
    }

    countInto(valuesA, countsA);
    countInto(valuesB, countsB);

    const maxCount = Math.max(...countsA, ...countsB, 1);
    const margin = { top: 22, right: 22, bottom: 30, left: 58 };
    const gap = 38;
    const width = distributionBounds.width - margin.left - margin.right;
    const bandHeight = (distributionBounds.height - margin.top - margin.bottom - gap) / 2;
    const topBase = margin.top + bandHeight;
    const bottomBase = margin.top + bandHeight + gap + bandHeight;

    const baselineA = document.createElementNS(svgNs, "line");
    baselineA.setAttribute("x1", String(margin.left));
    baselineA.setAttribute("x2", String(distributionBounds.width - margin.right));
    baselineA.setAttribute("y1", topBase.toFixed(2));
    baselineA.setAttribute("y2", topBase.toFixed(2));
    baselineA.setAttribute("class", "graph-edge");
    distributionCanvas.appendChild(baselineA);

    const baselineB = document.createElementNS(svgNs, "line");
    baselineB.setAttribute("x1", String(margin.left));
    baselineB.setAttribute("x2", String(distributionBounds.width - margin.right));
    baselineB.setAttribute("y1", bottomBase.toFixed(2));
    baselineB.setAttribute("y2", bottomBase.toFixed(2));
    baselineB.setAttribute("class", "graph-edge");
    distributionCanvas.appendChild(baselineB);

    drawChartText(distributionCanvas, margin.left, margin.top - 6, "Graph A");
    drawChartText(distributionCanvas, margin.left, margin.top + bandHeight + gap - 6, "Graph B");

    const barWidth = width / binCount;
    countsA.forEach((count, index) => {
      const rect = document.createElementNS(svgNs, "rect");
      const height = (count / maxCount) * (bandHeight - 12);
      rect.setAttribute("x", (margin.left + index * barWidth + 1).toFixed(2));
      rect.setAttribute("y", (topBase - height).toFixed(2));
      rect.setAttribute("width", Math.max(2, barWidth - 2).toFixed(2));
      rect.setAttribute("height", height.toFixed(2));
      rect.setAttribute("fill", "rgba(42, 44, 56, 0.72)");
      distributionCanvas.appendChild(rect);
    });

    countsB.forEach((count, index) => {
      const rect = document.createElementNS(svgNs, "rect");
      const height = (count / maxCount) * (bandHeight - 12);
      rect.setAttribute("x", (margin.left + index * barWidth + 1).toFixed(2));
      rect.setAttribute("y", (bottomBase - height).toFixed(2));
      rect.setAttribute("width", Math.max(2, barWidth - 2).toFixed(2));
      rect.setAttribute("height", height.toFixed(2));
      rect.setAttribute("fill", "rgba(47, 143, 78, 0.72)");
      distributionCanvas.appendChild(rect);
    });

    function drawMedianLine(values, baseline, color) {
      const med = median(values);
      const x = margin.left + ((med - minValue) / (maxValue - minValue)) * width;
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", x.toFixed(2));
      line.setAttribute("x2", x.toFixed(2));
      line.setAttribute("y1", (baseline - bandHeight + 8).toFixed(2));
      line.setAttribute("y2", baseline.toFixed(2));
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "2");
      line.setAttribute("stroke-dasharray", "6 5");
      distributionCanvas.appendChild(line);
    }

    drawMedianLine(valuesA, topBase, "rgba(42, 44, 56, 0.9)");
    drawMedianLine(valuesB, bottomBase, "rgba(47, 143, 78, 0.95)");

    drawChartText(distributionCanvas, margin.left, distributionBounds.height - 10, formatValue(state.statKey, minValue));
    drawChartText(
      distributionCanvas,
      distributionBounds.width / 2,
      distributionBounds.height - 10,
      statLabels[state.statKey],
      "middle"
    );
    drawChartText(
      distributionCanvas,
      distributionBounds.width - margin.right,
      distributionBounds.height - 10,
      formatValue(state.statKey, maxValue),
      "end"
    );
  }

  function renderBatchSummary() {
    if (!state.batch) {
      return;
    }

    const valuesA = sampleValues(state.batch.samplesA);
    const valuesB = sampleValues(state.batch.samplesB);
    const meanA = mean(valuesA);
    const meanB = mean(valuesB);
    const sdA = standardDeviation(valuesA);
    const sdB = standardDeviation(valuesB);
    const medianA = median(valuesA);
    const medianB = median(valuesB);

    batchSummary.innerHTML = [
      `<li>Graph A mean: ${formatValue(state.statKey, meanA)} · sd ${formatValue(state.statKey, sdA)}</li>`,
      `<li>Graph B mean: ${formatValue(state.statKey, meanB)} · sd ${formatValue(state.statKey, sdB)}</li>`,
      `<li>Medians: A ${formatValue(state.statKey, medianA)} · B ${formatValue(state.statKey, medianB)}</li>`,
      `<li>Mean gap: ${formatValue(state.statKey, Math.abs(meanA - meanB))}</li>`,
    ].join("");
  }

  function renderPair() {
    syncControlLabels();
    graphlabCaption.textContent = `${modelNames[state.graphA.model]} vs ${modelNames[state.graphB.model]} · ${state.nodeCount} nodes`;
    graphASubtitle.textContent = graphSubtitle(state.graphA.graph);
    graphBSubtitle.textContent = graphSubtitle(state.graphB.graph);
    renderGraph(graphACanvas, state.graphA.graph);
    renderGraph(graphBCanvas, state.graphB.graph);
    renderPairSummary();
  }

  function renderBatch() {
    syncControlLabels();
    renderDistribution();
    renderBatchSummary();
  }

  function rebuildPair(newSeed = true) {
    if (newSeed) {
      state.pairSeed = ((Date.now() + Math.floor(Math.random() * 100000)) >>> 0) ^ 0x31751;
    }

    const configA = {
      model: state.graphA.model,
      density: state.graphA.density,
      nodeCount: state.nodeCount,
    };
    const configB = {
      model: state.graphB.model,
      density: state.graphB.density,
      nodeCount: state.nodeCount,
    };

    state.graphA.graph = buildGraph(configA, state.pairSeed + 17);
    state.graphB.graph = buildGraph(configB, state.pairSeed + 113);
    renderPair();
  }

  function rebuildBatch(newSeed = true) {
    if (newSeed) {
      state.batchSeed = ((Date.now() + Math.floor(Math.random() * 100000)) >>> 0) ^ 0x91a4b;
    }

    const configA = {
      model: state.graphA.model,
      density: state.graphA.density,
      nodeCount: state.nodeCount,
    };
    const configB = {
      model: state.graphB.model,
      density: state.graphB.density,
      nodeCount: state.nodeCount,
    };

    const samplesA = [];
    const samplesB = [];

    for (let index = 0; index < state.sampleCount; index += 1) {
      const graphA = buildGraph(configA, state.batchSeed + index * 7919 + 11);
      const graphB = buildGraph(configB, state.batchSeed + index * 7919 + 97);
      samplesA.push(graphA.metrics);
      samplesB.push(graphB.metrics);
    }

    state.batch = { samplesA, samplesB };
    renderBatch();
  }

  function syncStateFromControls() {
    state.graphA.model = graphAModelSelect.value;
    state.graphB.model = graphBModelSelect.value;
    state.graphA.density = Number(graphADensityInput.value);
    state.graphB.density = Number(graphBDensityInput.value);
    state.nodeCount = Number(nodeCountInput.value);
    state.sampleCount = Number(sampleCountInput.value);
    state.statKey = batchStatisticSelect.value;
  }

  function updateLabelsOnly() {
    syncStateFromControls();
    syncControlLabels();
  }

  graphAModelSelect.addEventListener("change", () => {
    syncStateFromControls();
    rebuildPair(true);
    rebuildBatch(true);
  });

  graphBModelSelect.addEventListener("change", () => {
    syncStateFromControls();
    rebuildPair(true);
    rebuildBatch(true);
  });

  graphADensityInput.addEventListener("input", updateLabelsOnly);
  graphBDensityInput.addEventListener("input", updateLabelsOnly);
  nodeCountInput.addEventListener("input", updateLabelsOnly);
  sampleCountInput.addEventListener("input", updateLabelsOnly);

  graphADensityInput.addEventListener("change", () => {
    syncStateFromControls();
    rebuildPair(true);
    rebuildBatch(true);
  });

  graphBDensityInput.addEventListener("change", () => {
    syncStateFromControls();
    rebuildPair(true);
    rebuildBatch(true);
  });

  nodeCountInput.addEventListener("change", () => {
    syncStateFromControls();
    rebuildPair(true);
    rebuildBatch(true);
  });

  sampleCountInput.addEventListener("change", () => {
    syncStateFromControls();
    rebuildBatch(true);
  });

  batchStatisticSelect.addEventListener("change", () => {
    syncStateFromControls();
    renderBatch();
  });

  regeneratePairButton.addEventListener("click", () => {
    syncStateFromControls();
    rebuildPair(true);
  });

  runBatchButton.addEventListener("click", () => {
    syncStateFromControls();
    rebuildBatch(true);
  });

  syncControlLabels();
  rebuildPair(false);
  rebuildBatch(false);
})();
