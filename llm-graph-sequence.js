(() => {
  const svgNs = "http://www.w3.org/2000/svg";
  const bounds = { width: 960, height: 620 };
  const state = {
    preset: "hub",
    nodeCount: 12,
    speed: 750,
    playing: true,
    step: 0,
    sequence: [],
    positions: [],
    timer: null,
  };

  const canvas = document.getElementById("sequence-canvas");
  const presetSelect = document.getElementById("sequence-preset");
  const nodeCountInput = document.getElementById("sequence-node-count");
  const speedInput = document.getElementById("sequence-speed");
  const playToggleButton = document.getElementById("sequence-play-toggle");
  const stepButton = document.getElementById("sequence-step");
  const resetButton = document.getElementById("sequence-reset");

  const presetLabel = document.getElementById("preset-label");
  const nodeCountValue = document.getElementById("sequence-node-count-value");
  const speedValue = document.getElementById("sequence-speed-value");
  const sequenceCaption = document.getElementById("sequence-caption");
  const sequenceStatusTitle = document.getElementById("sequence-status-title");
  const sequenceStatusChip = document.getElementById("sequence-status-chip");
  const sequenceLengthChip = document.getElementById("sequence-length-chip");
  const sequenceLog = document.getElementById("sequence-log");
  const presetNotes = document.getElementById("preset-notes");

  const seqPresetStat = document.getElementById("seq-preset-stat");
  const seqStepStat = document.getElementById("seq-step-stat");
  const seqEdgeStat = document.getElementById("seq-edge-stat");
  const seqDensityStat = document.getElementById("seq-density-stat");

  const presetNames = {
    hub: "Hub First",
    triangles: "Triangle Bias",
    blocks: "Block Structure",
    chain: "Progressive Chain",
  };

  const presetSummaries = {
    hub: [
      "A central node accumulates degree early, then secondary ties build around that anchor.",
      "This makes degree concentration legible before the rest of the structure fills in.",
      "A small early preference can lock the whole sequence into a hub-dominated regime.",
    ],
    triangles: [
      "Edges arrive in clustered motifs, so local closure appears almost immediately.",
      "Useful for watching how triangle bias changes the feel of the partial graph.",
      "The same edge budget can produce much denser local structure when closure is favored.",
    ],
    blocks: [
      "Within-group ties appear first, while cross-group edges are delayed.",
      "This makes community formation visible before the global graph connects.",
      "The timing of the first bridge matters as much as the final edge count.",
    ],
    chain: [
      "Connectivity grows incrementally and remains fragile until shortcuts appear later.",
      "This makes order effects especially easy to read in the partial graph.",
      "Late long-range edges collapse path lengths much more than their count suggests.",
    ],
  };

  function labelFor(index) {
    return `N${String(index + 1).padStart(2, "0")}`;
  }

  function edgeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function buildLayout() {
    const n = state.nodeCount;
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;

    if (state.preset === "hub") {
      const outerRadius = 240;
      const positions = [{ x: cx, y: cy }];
      for (let i = 1; i < n; i += 1) {
        const angle = -Math.PI / 2 + (Math.PI * 2 * (i - 1)) / Math.max(1, n - 1);
        positions.push({
          x: cx + Math.cos(angle) * outerRadius,
          y: cy + Math.sin(angle) * 210,
        });
      }
      return positions;
    }

    if (state.preset === "triangles") {
      const clusterCenters = [
        { x: 250, y: 220 },
        { x: 500, y: 190 },
        { x: 710, y: 320 },
        { x: 390, y: 420 },
        { x: 660, y: 470 },
      ];
      return Array.from({ length: n }, (_, index) => {
        const cluster = clusterCenters[Math.floor(index / 3) % clusterCenters.length];
        const localIndex = index % 3;
        const angle = -Math.PI / 2 + (Math.PI * 2 * localIndex) / 3;
        return {
          x: cluster.x + Math.cos(angle) * 34,
          y: cluster.y + Math.sin(angle) * 34,
        };
      });
    }

    if (state.preset === "blocks") {
      return Array.from({ length: n }, (_, index) => {
        const leftBlock = index < Math.ceil(n / 2);
        const localIndex = leftBlock ? index : index - Math.ceil(n / 2);
        const columns = 3;
        const col = localIndex % columns;
        const row = Math.floor(localIndex / columns);
        return {
          x: (leftBlock ? 280 : 670) + col * 72,
          y: 210 + row * 92,
        };
      });
    }

    return Array.from({ length: n }, (_, index) => {
      const x = 120 + index * ((bounds.width - 240) / Math.max(1, n - 1));
      const y = 310 + Math.sin(index * 0.8) * 120;
      return { x, y };
    });
  }

  function buildSequence() {
    const sequence = [];
    const seen = new Set();
    const n = state.nodeCount;
    const half = Math.ceil(n / 2);

    function pushEdge(a, b, note) {
      if (a === b) {
        return;
      }
      const key = edgeKey(a, b);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      sequence.push({ a, b, note });
    }

    if (state.preset === "hub") {
      for (let i = 1; i < n; i += 1) {
        pushEdge(0, i, `${labelFor(0)} connects to ${labelFor(i)}`);
      }
      for (let i = 1; i < n - 1; i += 1) {
        pushEdge(i, i + 1, `secondary tie ${labelFor(i)}-${labelFor(i + 1)}`);
      }
      for (let i = 2; i < n; i += 3) {
        pushEdge(i, ((i + 3) % (n - 1)) + 1, `outer-ring bridge from ${labelFor(i)}`);
      }
    }

    if (state.preset === "triangles") {
      for (let start = 0; start < n; start += 3) {
        const a = start;
        const b = Math.min(n - 1, start + 1);
        const c = Math.min(n - 1, start + 2);
        if (b < n) {
          pushEdge(a, b, `motif edge ${labelFor(a)}-${labelFor(b)}`);
        }
        if (c < n) {
          pushEdge(b, c, `motif edge ${labelFor(b)}-${labelFor(c)}`);
          pushEdge(a, c, `triangle closes at ${labelFor(c)}`);
        }
      }
      for (let start = 0; start + 3 < n; start += 3) {
        pushEdge(start, start + 3, `bridge between motifs ${labelFor(start)}-${labelFor(start + 3)}`);
      }
      for (let i = 0; i + 4 < n; i += 4) {
        pushEdge(i + 1, i + 4, `longer closure cue ${labelFor(i + 1)}-${labelFor(i + 4)}`);
      }
    }

    if (state.preset === "blocks") {
      for (let i = 0; i < half - 1; i += 1) {
        pushEdge(i, i + 1, `within-group edge ${labelFor(i)}-${labelFor(i + 1)}`);
      }
      for (let i = half; i < n - 1; i += 1) {
        pushEdge(i, i + 1, `within-group edge ${labelFor(i)}-${labelFor(i + 1)}`);
      }
      for (let i = 0; i + 2 < half; i += 1) {
        pushEdge(i, i + 2, `dense first block tie ${labelFor(i)}-${labelFor(i + 2)}`);
      }
      for (let i = half; i + 2 < n; i += 1) {
        pushEdge(i, i + 2, `dense second block tie ${labelFor(i)}-${labelFor(i + 2)}`);
      }
      for (let i = 0; i < half; i += 1) {
        pushEdge(i, half + (i % Math.max(1, n - half)), `cross-block bridge ${labelFor(i)}`);
      }
    }

    if (state.preset === "chain") {
      for (let i = 0; i < n - 1; i += 1) {
        pushEdge(i, i + 1, `path extension ${labelFor(i)}-${labelFor(i + 1)}`);
      }
      for (let i = 0; i < n - 2; i += 1) {
        pushEdge(i, i + 2, `shortcut ${labelFor(i)}-${labelFor(i + 2)}`);
      }
      for (let i = 0; i < n; i += 3) {
        pushEdge(i, Math.min(n - 1, i + Math.floor(n / 2)), `late long-range jump from ${labelFor(i)}`);
      }
    }

    return sequence;
  }

  function emittedEdges() {
    return state.sequence.slice(0, state.step);
  }

  function density(edgeCount) {
    const possible = (state.nodeCount * (state.nodeCount - 1)) / 2;
    return possible ? edgeCount / possible : 0;
  }

  function renderGraph() {
    const edges = emittedEdges();
    const currentEdge = state.step > 0 ? state.sequence[state.step - 1] : null;
    canvas.innerHTML = "";

    edges.forEach((edge) => {
      const line = document.createElementNS(svgNs, "line");
      line.setAttribute("x1", state.positions[edge.a].x.toFixed(2));
      line.setAttribute("y1", state.positions[edge.a].y.toFixed(2));
      line.setAttribute("x2", state.positions[edge.b].x.toFixed(2));
      line.setAttribute("y2", state.positions[edge.b].y.toFixed(2));
      line.setAttribute(
        "class",
        currentEdge && edgeKey(edge.a, edge.b) === edgeKey(currentEdge.a, currentEdge.b)
          ? "graph-edge current-edge"
          : "graph-edge"
      );
      canvas.appendChild(line);
    });

    if (currentEdge) {
      [currentEdge.a, currentEdge.b].forEach((index) => {
        const halo = document.createElementNS(svgNs, "circle");
        halo.setAttribute("cx", state.positions[index].x.toFixed(2));
        halo.setAttribute("cy", state.positions[index].y.toFixed(2));
        halo.setAttribute("r", "19");
        halo.setAttribute("fill", "none");
        halo.setAttribute("stroke", "rgba(42, 44, 56, 0.16)");
        halo.setAttribute("stroke-width", "2");
        canvas.appendChild(halo);
      });
    }

    state.positions.forEach((position, index) => {
      const node = document.createElementNS(svgNs, "circle");
      const classes = ["graph-node"];
      if (currentEdge && (currentEdge.a === index || currentEdge.b === index)) {
        classes.push("selected");
        classes.push("current");
      }
      node.setAttribute("class", classes.join(" "));
      node.setAttribute("cx", position.x.toFixed(2));
      node.setAttribute("cy", position.y.toFixed(2));
      node.setAttribute("r", currentEdge && (currentEdge.a === index || currentEdge.b === index) ? "9" : "6.5");
      canvas.appendChild(node);
    });

    if (currentEdge) {
      [currentEdge.a, currentEdge.b].forEach((index) => {
        const label = document.createElementNS(svgNs, "text");
        label.setAttribute("class", "graph-label selected");
        label.setAttribute("x", (state.positions[index].x + 14).toFixed(2));
        label.setAttribute("y", (state.positions[index].y - 14).toFixed(2));
        label.textContent = labelFor(index);
        canvas.appendChild(label);
      });
    }
  }

  function renderLog() {
    const start = Math.max(0, state.step - 4);
    const end = Math.min(state.sequence.length, Math.max(state.step + 4, 8));
    const items = [];

    for (let i = start; i < end; i += 1) {
      const edge = state.sequence[i];
      const status =
        i < state.step - 1 ? "emitted" : i === state.step - 1 ? "current" : "queued";
      items.push(`
        <li>
          <span class="step-id">step ${String(i + 1).padStart(2, "0")}</span>
          <span><strong>${labelFor(edge.a)}-${labelFor(edge.b)}</strong> ${edge.note} <em>(${status})</em></span>
        </li>
      `);
    }

    sequenceLog.innerHTML = items.join("");
  }

  function renderNotes() {
    presetNotes.innerHTML = presetSummaries[state.preset]
      .map((item) => `<li>${item}</li>`)
      .join("");
  }

  function updateStatus() {
    const edges = emittedEdges().length;
    const current = state.step > 0 ? state.sequence[state.step - 1] : null;

    presetLabel.textContent = presetNames[state.preset];
    nodeCountValue.textContent = String(state.nodeCount);
    speedValue.textContent = `${(state.speed / 1000).toFixed(2)} s`;

    seqPresetStat.textContent = presetNames[state.preset];
    seqStepStat.textContent = `${state.step}/${state.sequence.length}`;
    seqEdgeStat.textContent = String(edges);
    seqDensityStat.textContent = `${(density(edges) * 100).toFixed(1)}%`;

    sequenceLengthChip.textContent = `${state.step} of ${state.sequence.length}`;

    if (state.step === 0) {
      sequenceStatusTitle.textContent = "Current emission";
      sequenceCaption.textContent = "running partial graph";
    } else if (current) {
      sequenceStatusTitle.textContent = `${labelFor(current.a)} to ${labelFor(current.b)}`;
      sequenceCaption.textContent = current.note;
    }

    if (state.playing && state.step < state.sequence.length) {
      sequenceStatusChip.textContent = "Running";
    } else if (state.step >= state.sequence.length) {
      sequenceStatusChip.textContent = "Complete";
    } else {
      sequenceStatusChip.textContent = "Paused";
    }

    playToggleButton.textContent = state.playing ? "Pause" : "Play";
  }

  function render() {
    updateStatus();
    renderGraph();
    renderLog();
    renderNotes();
  }

  function stopPlayback() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function stepForward() {
    if (state.step >= state.sequence.length) {
      state.playing = false;
      stopPlayback();
      render();
      return;
    }
    state.step += 1;
    if (state.step >= state.sequence.length) {
      state.playing = false;
      stopPlayback();
    }
    render();
  }

  function schedulePlayback() {
    stopPlayback();
    if (!state.playing) {
      render();
      return;
    }
    state.timer = window.setInterval(stepForward, state.speed);
    render();
  }

  function rebuildSequence() {
    state.positions = buildLayout();
    state.sequence = buildSequence();
    state.step = 0;
    schedulePlayback();
  }

  presetSelect.addEventListener("change", () => {
    state.preset = presetSelect.value;
    rebuildSequence();
  });

  nodeCountInput.addEventListener("input", () => {
    state.nodeCount = Number(nodeCountInput.value);
    rebuildSequence();
  });

  speedInput.addEventListener("input", () => {
    state.speed = Number(speedInput.value);
    speedValue.textContent = `${(state.speed / 1000).toFixed(2)} s`;
    if (state.playing) {
      schedulePlayback();
    } else {
      render();
    }
  });

  playToggleButton.addEventListener("click", () => {
    if (state.step >= state.sequence.length) {
      state.step = 0;
    }
    state.playing = !state.playing;
    schedulePlayback();
  });

  stepButton.addEventListener("click", () => {
    state.playing = false;
    stopPlayback();
    stepForward();
  });

  resetButton.addEventListener("click", () => {
    state.step = 0;
    state.playing = false;
    stopPlayback();
    render();
  });

  rebuildSequence();
})();
