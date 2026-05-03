(() => {
  const DATA_ROOT = "./data/got";
  const svgNs = "http://www.w3.org/2000/svg";
  const bounds = { width: 960, height: 620 };

  const PROMPTS = {
    default: {
      label: "Default",
      promptFile: "got_s1_prompt_default.txt",
      orderKey: "default",
      runDir: "default_prompt",
      runs: [
        "gpt_5.2_thinking_rep1.json",
        "gpt_5.2_thinking_rep2.json",
        "gpt_5.2_thinking_with_internet_rep3.json",
        "claude_sonnet_4.6_extendedthinking_rep1.json",
        "claude_sonnet_4.6_extendedthinking_rep2.json",
        "gemini_3_thinking_rep1.json",
        "gemini_3_thinking_rep2.json",
        "gptoss_120b_hight_rep1.json",
        "gptoss_120b_low_rep1.json",
        "gptoss_120b_low_rep2.json",
      ],
    },
    reverse: {
      label: "Reverse",
      promptFile: "got_s1_prompt_reverse.txt",
      orderKey: "reverse",
      runDir: "reverse_prompt",
      runs: [
        "gpt_5.2_thinking_rev_rep1.json",
        "gpt_5.2_thinking_rev_rep2int.json",
        "claude_sonnet_4.6_extendedthinking_rep1.json",
        "claude_sonnet_4.6_extendedthinking_rep2.json",
        "claude_sonnet_4.6_extendedthinking_rep3.json",
        "gemini_3_thinking_rep1.json",
        "gemini_3_thinking_rep2.json",
      ],
    },
  };

  const state = {
    promptKey: "default",
    modelKey: null,
    runFile: PROMPTS.default.runs[0],
    speed: 750,
    playing: true,
    step: 0,
    timer: null,
    data: null,
    runCache: new Map(),
    pan: { x: 0, y: 28 },
    drag: {
      active: false,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startPanX: 0,
      startPanY: 0,
    },
  };

  const canvas = document.getElementById("sequence-canvas");
  const graphStage = canvas.closest(".graph-stage");
  const infoToggle = document.getElementById("llm-info-toggle");
  const infoClose = document.getElementById("llm-info-close");
  const infoPanel = document.getElementById("llm-info-panel");
  const promptOrderSelect = document.getElementById("prompt-order");
  const modelSelect = document.getElementById("sequence-model");
  const runSelect = document.getElementById("sequence-run");
  const speedInput = document.getElementById("sequence-speed");
  const playToggleButton = document.getElementById("sequence-play-toggle");
  const stepButton = document.getElementById("sequence-step");
  const resetButton = document.getElementById("sequence-reset");

  const promptOrderLabel = document.getElementById("prompt-order-label");
  const modelLabel = document.getElementById("model-label");
  const runLabel = document.getElementById("run-label");
  const speedValue = document.getElementById("sequence-speed-value");
  const sequenceCaption = document.getElementById("sequence-caption");
  const sequenceStatusTitle = document.getElementById("sequence-status-title");
  const sequenceCurrentLine = document.getElementById("sequence-current-line");
  const sequenceStatusChip = document.getElementById("sequence-status-chip");
  const sequenceLengthChip = document.getElementById("sequence-length-chip");
  const sequenceQualityChip = document.getElementById("sequence-quality-chip");
  const sequenceLog = document.getElementById("sequence-log");
  const runSummary = document.getElementById("run-summary");
  const promptMeta = document.getElementById("prompt-meta");
  const promptText = document.getElementById("prompt-text");

  const seqModelStat = document.getElementById("seq-model-stat");
  const seqRunStat = document.getElementById("seq-run-stat");
  const seqPromptStat = document.getElementById("seq-prompt-stat");
  const seqStepStat = document.getElementById("seq-step-stat");
  const seqCorrectStat = document.getElementById("seq-correct-stat");
  const seqHallucinatedStat = document.getElementById("seq-hallucinated-stat");
  let graphLayer = null;

  function setInfoOpen(open) {
    infoPanel.hidden = !open;
    infoToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  const MODEL_PATTERNS = [
    ["gpt_5.2_thinking_with_internet", "gpt_5.2_thinking_with_internet", "GPT-5.2 thinking + internet"],
    ["gpt_5.2_thinking_rev", "gpt_5.2_thinking_rev", "GPT-5.2 thinking rev"],
    ["gpt_5.2_thinking", "gpt_5.2_thinking", "GPT-5.2 thinking"],
    ["claude_sonnet_4.6_extendedthinking", "claude_sonnet_4.6_extendedthinking", "Claude Sonnet 4.6 extended thinking"],
    ["gemini_3_thinking", "gemini_3_thinking", "Gemini 3 thinking"],
    ["gptoss_120b_hight", "gptoss_120b_hight", "gpt-oss 120b high-t"],
    ["gptoss_120b_low", "gptoss_120b_low", "gpt-oss 120b low"],
  ];

  function edgeKey(a, b) {
    return a < b ? `${a}::${b}` : `${b}::${a}`;
  }

  function titleCase(value) {
    return value.replace(/\b[a-z]/g, (match) => match.toUpperCase());
  }

  function extractRunMeta(fileName) {
    const bare = fileName.replace(/\.json$/i, "");
    let modelKey = bare;
    let modelLabelText = titleCase(bare.replace(/_/g, " "));
    for (const [prefix, key, label] of MODEL_PATTERNS) {
      if (bare.startsWith(prefix)) {
        modelKey = key;
        modelLabelText = label;
        break;
      }
    }

    let runLabelText = "run";
    const repMatch = bare.match(/_(rep\d+\w*)$/i);
    if (repMatch) {
      runLabelText = repMatch[1].replace(/^rep/i, "rep ");
    } else {
      const parts = bare.split("_");
      runLabelText = parts[parts.length - 1];
    }

    return {
      fileName,
      modelKey,
      modelLabel: modelLabelText,
      runLabel: runLabelText,
      fullLabel: `${modelLabelText} / ${runLabelText}`,
    };
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = lines.shift().split(",");
    return lines
      .filter((line) => line.trim())
      .map((line) => {
        const values = line.split(",");
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        return row;
      });
  }

  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json();
  }

  async function fetchText(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.text();
  }

  function buildCircularPositions(order) {
    const cx = bounds.width / 2;
    const cy = bounds.height / 2;
    const radius = Math.min(bounds.width, bounds.height) * 0.38;
    const positions = new Map();

    order.forEach((id, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / order.length;
      positions.set(id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    });

    return positions;
  }

  async function loadBaseData() {
    const [
      nodesCsv,
      edgesCsv,
      metadata,
      defaultPrompt,
      reversePrompt,
    ] = await Promise.all([
      fetchText(`${DATA_ROOT}/ground_truth/nodes_selected.csv`),
      fetchText(`${DATA_ROOT}/ground_truth/edges_selected.csv`),
      fetchJson(`${DATA_ROOT}/prompts/node_order_metadata.json`),
      fetchText(`${DATA_ROOT}/prompts/${PROMPTS.default.promptFile}`),
      fetchText(`${DATA_ROOT}/prompts/${PROMPTS.reverse.promptFile}`),
    ]);

    const nodes = parseCsv(nodesCsv).map((row) => ({
      id: row.Id,
      label: row.Label,
    }));

    const groundTruthEdges = parseCsv(edgesCsv).map((row) => ({
      source: row.Source,
      target: row.Target,
      weight: Number(row.Weight || 0),
      season: Number(row.Season || 0),
      key: edgeKey(row.Source, row.Target),
    }));

    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const allowedSet = new Set(nodes.map((node) => node.id));
    const groundTruthSet = new Set(groundTruthEdges.map((edge) => edge.key));
    const weightByNode = new Map(nodes.map((node) => [node.id, 0]));

    groundTruthEdges.forEach((edge) => {
      weightByNode.set(edge.source, (weightByNode.get(edge.source) || 0) + edge.weight);
      weightByNode.set(edge.target, (weightByNode.get(edge.target) || 0) + edge.weight);
    });

    const positionsByPrompt = {
      default: buildCircularPositions(metadata.default),
      reverse: buildCircularPositions(metadata.reverse),
    };

    return {
      nodes,
      nodeMap,
      allowedSet,
      groundTruthEdges,
      groundTruthSet,
      weightByNode,
      prompts: {
        default: {
          label: PROMPTS.default.label,
          order: metadata.default,
          text: defaultPrompt,
          fileName: PROMPTS.default.promptFile,
        },
        reverse: {
          label: PROMPTS.reverse.label,
          order: metadata.reverse,
          text: reversePrompt,
          fileName: PROMPTS.reverse.promptFile,
        },
      },
      positionsByPrompt,
    };
  }

  function promptRunMeta(promptKey) {
    return PROMPTS[promptKey].runs.map((fileName) => extractRunMeta(fileName));
  }

  function modelEntriesForPrompt(promptKey) {
    const grouped = new Map();
    promptRunMeta(promptKey).forEach((meta) => {
      if (!grouped.has(meta.modelKey)) {
        grouped.set(meta.modelKey, {
          modelKey: meta.modelKey,
          modelLabel: meta.modelLabel,
          runs: [],
        });
      }
      grouped.get(meta.modelKey).runs.push(meta);
    });
    return [...grouped.values()];
  }

  function sanitizeRun(rawEdges, data) {
    const validEdges = [];
    const seen = new Set();
    const skipped = {
      malformed: 0,
      selfLoops: 0,
      invalidIds: 0,
      duplicates: 0,
    };

    const edges = Array.isArray(rawEdges) ? rawEdges : [];
    edges.forEach((item) => {
      if (!Array.isArray(item) || item.length !== 2) {
        skipped.malformed += 1;
        return;
      }
      const source = typeof item[0] === "string" ? item[0].trim() : "";
      const target = typeof item[1] === "string" ? item[1].trim() : "";
      if (!source || !target) {
        skipped.malformed += 1;
        return;
      }
      if (source === target) {
        skipped.selfLoops += 1;
        return;
      }
      if (!data.allowedSet.has(source) || !data.allowedSet.has(target)) {
        skipped.invalidIds += 1;
        return;
      }
      const key = edgeKey(source, target);
      if (seen.has(key)) {
        skipped.duplicates += 1;
        return;
      }
      seen.add(key);
      validEdges.push({
        source,
        target,
        key,
        isGroundTruth: data.groundTruthSet.has(key),
      });
    });

    return {
      edges: validEdges,
      rawCount: edges.length,
      skipped,
    };
  }

  async function loadRun(promptKey, runFile) {
    const cacheKey = `${promptKey}/${runFile}`;
    if (state.runCache.has(cacheKey)) {
      return state.runCache.get(cacheKey);
    }

    const raw = await fetchJson(`${DATA_ROOT}/llm_calls/${PROMPTS[promptKey].runDir}/${runFile}`);
    const run = sanitizeRun(raw.edges, state.data);
    const meta = extractRunMeta(runFile);
    run.fileName = runFile;
    run.label = meta.fullLabel;
    run.modelKey = meta.modelKey;
    run.modelLabel = meta.modelLabel;
    run.runLabel = meta.runLabel;
    run.promptKey = promptKey;
    state.runCache.set(cacheKey, run);
    return run;
  }

  function currentRun() {
    return state.runCache.get(`${state.promptKey}/${state.runFile}`) || null;
  }

  function emittedEdges() {
    const run = currentRun();
    return run ? run.edges.slice(0, state.step) : [];
  }

  function currentEdge() {
    const run = currentRun();
    if (!run || state.step === 0) {
      return null;
    }
    return run.edges[state.step - 1] || null;
  }

  function computeCounts(edges) {
    let correct = 0;
    let hallucinated = 0;
    edges.forEach((edge) => {
      if (edge.isGroundTruth) {
        correct += 1;
      } else {
        hallucinated += 1;
      }
    });
    return { correct, hallucinated };
  }

  function labelForNode(id) {
    return state.data.nodeMap.get(id)?.label || id;
  }

  function precisionFor(counts) {
    const total = counts.correct + counts.hallucinated;
    return total ? (counts.correct / total) * 100 : 0;
  }

  function coverageFor(correctCount) {
    return state.data.groundTruthEdges.length
      ? (correctCount / state.data.groundTruthEdges.length) * 100
      : 0;
  }

  function currentPromptModels() {
    return modelEntriesForPrompt(state.promptKey);
  }

  function availableRunsForCurrentModel() {
    const entry = currentPromptModels().find((item) => item.modelKey === state.modelKey);
    return entry ? entry.runs : [];
  }

  function syncModelAndRunState() {
    const models = currentPromptModels();
    if (!models.length) {
      state.modelKey = null;
      state.runFile = null;
      return;
    }

    if (!models.some((item) => item.modelKey === state.modelKey)) {
      state.modelKey = models[0].modelKey;
    }

    const runs = availableRunsForCurrentModel();
    if (!runs.some((item) => item.fileName === state.runFile)) {
      state.runFile = runs[0]?.fileName || null;
    }
  }

  function populateModelSelect() {
    syncModelAndRunState();
    modelSelect.innerHTML = currentPromptModels()
      .map((entry) => {
        const selected = entry.modelKey === state.modelKey ? " selected" : "";
        return `<option value="${entry.modelKey}"${selected}>${entry.modelLabel}</option>`;
      })
      .join("");
    const activeModel = currentPromptModels().find((item) => item.modelKey === state.modelKey);
    modelLabel.textContent = activeModel ? activeModel.modelLabel : "--";
  }

  function populateRunSelect() {
    syncModelAndRunState();
    const options = availableRunsForCurrentModel()
      .map((meta) => {
        const selected = meta.fileName === state.runFile ? " selected" : "";
        return `<option value="${meta.fileName}"${selected}>${meta.runLabel}</option>`;
      })
      .join("");
    runSelect.innerHTML = options;
    const activeRun = availableRunsForCurrentModel().find((item) => item.fileName === state.runFile);
    runLabel.textContent = activeRun ? activeRun.runLabel : "--";
    promptOrderLabel.textContent = PROMPTS[state.promptKey].label;
  }

  function updatePromptPanel() {
    const prompt = state.data.prompts[state.promptKey];
    promptMeta.textContent = `${prompt.fileName} · ${prompt.label.toLowerCase()}`;
    promptText.textContent = prompt.text;
  }

  function appendToGraph(node) {
    (graphLayer || canvas).appendChild(node);
  }

  function drawLine(x1, y1, x2, y2, className, opacity = null) {
    const line = document.createElementNS(svgNs, "line");
    line.setAttribute("x1", x1.toFixed(2));
    line.setAttribute("y1", y1.toFixed(2));
    line.setAttribute("x2", x2.toFixed(2));
    line.setAttribute("y2", y2.toFixed(2));
    line.setAttribute("class", className);
    if (opacity !== null) {
      line.setAttribute("stroke-opacity", opacity.toFixed(3));
    }
    appendToGraph(line);
  }

  function drawNodeLabel(position, text, isSelected = false) {
    const dx = position.x - bounds.width / 2;
    const dy = position.y - bounds.height / 2;
    const length = Math.hypot(dx, dy) || 1;
    const offset = 18;
    const label = document.createElementNS(svgNs, "text");
    const x = position.x + (dx / length) * offset;
    const y = position.y + (dy / length) * offset;
    const classes = ["graph-label"];

    if (isSelected) {
      classes.push("selected");
    }

    label.setAttribute("class", classes.join(" "));
    label.setAttribute("x", x.toFixed(2));
    label.setAttribute("y", y.toFixed(2));
    label.setAttribute("dominant-baseline", "middle");

    if (Math.abs(dx) < 24) {
      label.setAttribute("text-anchor", "middle");
    } else {
      label.setAttribute("text-anchor", dx > 0 ? "start" : "end");
    }

    label.textContent = text;
    appendToGraph(label);
  }

  function graphExtents() {
    const positions = state.data?.positionsByPrompt?.[state.promptKey];
    if (!positions) {
      return null;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    positions.forEach((position) => {
      if (position.x < minX) minX = position.x;
      if (position.x > maxX) maxX = position.x;
      if (position.y < minY) minY = position.y;
      if (position.y > maxY) maxY = position.y;
    });

    return { minX, maxX, minY, maxY };
  }

  function clampPan(x, y) {
    const extents = graphExtents();
    if (!extents) {
      return { x, y };
    }

    const padX = 120;
    const padY = 110;
    const minX = bounds.width - (extents.maxX + padX);
    const maxX = padX - extents.minX;
    const minY = bounds.height - (extents.maxY + padY);
    const maxY = padY - extents.minY;

    return {
      x: Math.min(maxX, Math.max(minX, x)),
      y: Math.min(maxY, Math.max(minY, y)),
    };
  }

  function updateGraphTransform() {
    if (!graphLayer) {
      return;
    }
    const pan = clampPan(state.pan.x, state.pan.y);
    state.pan = pan;
    graphLayer.setAttribute("transform", `translate(${pan.x.toFixed(2)} ${pan.y.toFixed(2)})`);
  }

  function renderGraph() {
    canvas.innerHTML = "";
    if (!state.data) {
      return;
    }

    graphLayer = document.createElementNS(svgNs, "g");
    graphLayer.setAttribute("class", "graph-scene");
    canvas.appendChild(graphLayer);
    updateGraphTransform();

    const positions = state.data.positionsByPrompt[state.promptKey];
    const emitted = emittedEdges();
    const current = currentEdge();
    const maxWeight = Math.max(...state.data.groundTruthEdges.map((edge) => edge.weight), 1);

    state.data.groundTruthEdges.forEach((edge) => {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      const opacity = 0.08 + 0.18 * Math.sqrt(edge.weight / maxWeight);
      drawLine(source.x, source.y, target.x, target.y, "graph-edge ground-edge", opacity);
    });

    emitted.forEach((edge) => {
      const source = positions.get(edge.source);
      const target = positions.get(edge.target);
      const isCurrent =
        current && current.source === edge.source && current.target === edge.target;
      const className = edge.isGroundTruth
        ? isCurrent
          ? "graph-edge current-correct-edge"
          : "graph-edge correct-edge"
        : isCurrent
          ? "graph-edge current-hallucinated-edge"
          : "graph-edge hallucinated-edge";
      drawLine(source.x, source.y, target.x, target.y, className);
    });

    if (current) {
      [current.source, current.target].forEach((id) => {
        const position = positions.get(id);
        const halo = document.createElementNS(svgNs, "circle");
        halo.setAttribute("cx", position.x.toFixed(2));
        halo.setAttribute("cy", position.y.toFixed(2));
        halo.setAttribute("r", "18");
        halo.setAttribute("fill", "none");
        halo.setAttribute("stroke", current.isGroundTruth ? "rgba(47, 143, 78, 0.18)" : "rgba(196, 71, 71, 0.2)");
        halo.setAttribute("stroke-width", "2");
        appendToGraph(halo);
      });
    }

    const maxNodeWeight = Math.max(...state.data.weightByNode.values(), 1);
    state.data.nodes.forEach((node) => {
      const position = positions.get(node.id);
      const weight = state.data.weightByNode.get(node.id) || 0;
      const radius = 4.6 + 4 * Math.sqrt(weight / maxNodeWeight);
      const graphNode = document.createElementNS(svgNs, "circle");
      const classes = ["graph-node"];
      if (current && (current.source === node.id || current.target === node.id)) {
        classes.push("selected", "current");
      }
      graphNode.setAttribute("class", classes.join(" "));
      graphNode.setAttribute("cx", position.x.toFixed(2));
      graphNode.setAttribute("cy", position.y.toFixed(2));
      graphNode.setAttribute("r", radius.toFixed(2));
      appendToGraph(graphNode);
    });

    state.data.nodes.forEach((node) => {
      const position = positions.get(node.id);
      const isSelected = current && (current.source === node.id || current.target === node.id);
      drawNodeLabel(position, labelForNode(node.id), isSelected);
    });
  }

  function renderLog() {
    const run = currentRun();
    if (!run) {
      sequenceLog.innerHTML = "";
      return;
    }

    const currentIndex = state.step > 0 ? state.step - 1 : -1;
    const items = run.edges.map((edge, index) => {
      const kindClass = edge.isGroundTruth ? "is-correct" : "is-hallucinated";
      const statusClass = index < currentIndex ? "is-emitted" : index === currentIndex ? "is-current is-emitted" : "is-queued";
      const kindLabel = edge.isGroundTruth ? "correct" : "hallucinated";
      return `
        <li class="sequence-token ${kindClass} ${statusClass}" data-sequence-index="${index}">
          <span class="token-step">step ${String(index + 1).padStart(3, "0")}</span>
          <strong>${edge.source} ↔ ${edge.target}</strong>
          <span>${kindLabel}</span>
        </li>
      `;
    });
    sequenceLog.innerHTML = items.join("");
    const currentToken = sequenceLog.querySelector(".is-current");
    if (currentToken) {
      currentToken.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  function renderSummary() {
    const run = currentRun();
    if (!run) {
      runSummary.innerHTML = "";
      return;
    }

    const counts = computeCounts(emittedEdges());
    const coverage = coverageFor(counts.correct);
    const precision = precisionFor(counts);
    const skipped = run.skipped;
    const skippedTotal =
      skipped.malformed + skipped.selfLoops + skipped.invalidIds + skipped.duplicates;

    runSummary.innerHTML = [
      `<li>Correct: ${counts.correct} · coverage ${coverage.toFixed(1)}%</li>`,
      `<li>Hallucinated: ${counts.hallucinated} · precision ${precision.toFixed(1)}%</li>`,
      `<li>Skipped: ${skippedTotal} · invalid ${skipped.invalidIds} · dup ${skipped.duplicates} · malformed ${skipped.malformed} · loops ${skipped.selfLoops}</li>`,
    ].join("");
  }

  function updateStatus() {
    const run = currentRun();
    if (!run) {
      sequenceCaption.textContent = "loading run data";
      return;
    }

    const emitted = emittedEdges();
    const counts = computeCounts(emitted);
    const current = currentEdge();
    const precision = precisionFor(counts);

    seqModelStat.textContent = run.modelLabel;
    seqRunStat.textContent = run.runLabel;
    seqPromptStat.textContent = PROMPTS[state.promptKey].label;
    seqStepStat.textContent = `${state.step}/${run.edges.length}`;
    seqCorrectStat.textContent = String(counts.correct);
    seqHallucinatedStat.textContent = String(counts.hallucinated);

    modelLabel.textContent = run.modelLabel;
    runLabel.textContent = run.runLabel;
    promptOrderLabel.textContent = PROMPTS[state.promptKey].label;
    speedValue.textContent = `${(state.speed / 1000).toFixed(2)} s`;

    sequenceLengthChip.textContent = `${state.step} of ${run.edges.length}`;
    sequenceQualityChip.textContent = `${precision.toFixed(1)}% precision`;

    if (state.playing && state.step < run.edges.length) {
      sequenceStatusChip.textContent = "Running";
    } else if (state.step >= run.edges.length) {
      sequenceStatusChip.textContent = "Complete";
    } else {
      sequenceStatusChip.textContent = "Paused";
    }

    if (!current) {
      sequenceStatusTitle.textContent = "Current emission";
      sequenceCurrentLine.textContent = "Graph ring follows the prompt order. Tokens below follow the model's emitted edge order.";
      sequenceCaption.textContent = "ground truth in grey, emitted edges on top";
    } else {
      const kind = current.isGroundTruth ? "correct" : "hallucinated";
      sequenceStatusTitle.textContent = `${current.source} to ${current.target}`;
      sequenceCurrentLine.textContent = `${current.source} ↔ ${current.target} · ${kind} · step ${state.step} of ${run.edges.length}`;
      sequenceCaption.textContent = `${labelForNode(current.source)} ↔ ${labelForNode(current.target)} · ${kind}`;
    }

    playToggleButton.textContent = state.playing ? "Pause" : "Play";
  }

  function endDrag() {
    state.drag.active = false;
    state.drag.pointerId = null;
    graphStage.classList.remove("is-dragging");
  }

  function render() {
    updateStatus();
    renderGraph();
    renderLog();
    renderSummary();
  }

  function stopPlayback() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function stepForward() {
    const run = currentRun();
    if (!run) {
      return;
    }
    if (state.step >= run.edges.length) {
      state.playing = false;
      stopPlayback();
      render();
      return;
    }
    state.step += 1;
    if (state.step >= run.edges.length) {
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

  async function resetRun(options = {}) {
    const keepPlaying = options.keepPlaying ?? state.playing;
    const initialStep = options.initialStep ?? 0;
    state.playing = keepPlaying;
    state.step = 0;
    sequenceCaption.textContent = "loading run data";
    const run = await loadRun(state.promptKey, state.runFile);
    state.step = Math.min(initialStep, run.edges.length);
    updatePromptPanel();
    schedulePlayback();
  }

  promptOrderSelect.addEventListener("change", async () => {
    state.promptKey = promptOrderSelect.value;
    state.modelKey = null;
    state.runFile = null;
    populateModelSelect();
    populateRunSelect();
    await resetRun({ keepPlaying: false, initialStep: 1 });
  });

  modelSelect.addEventListener("change", async () => {
    const nextModel = modelSelect.value;
    if (!nextModel || nextModel === state.modelKey) {
      return;
    }
    state.modelKey = nextModel;
    state.runFile = null;
    populateModelSelect();
    populateRunSelect();
    await resetRun({ keepPlaying: false, initialStep: 1 });
  });

  runSelect.addEventListener("change", async () => {
    state.runFile = runSelect.value;
    await resetRun({ keepPlaying: false, initialStep: 1 });
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
    const run = currentRun();
    if (!run) {
      return;
    }
    if (state.step >= run.edges.length) {
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

  resetButton.addEventListener("click", async () => {
    state.playing = false;
    stopPlayback();
    state.step = 0;
    await loadRun(state.promptKey, state.runFile);
    render();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    state.drag.active = true;
    state.drag.pointerId = event.pointerId;
    state.drag.startClientX = event.clientX;
    state.drag.startClientY = event.clientY;
    state.drag.startPanX = state.pan.x;
    state.drag.startPanY = state.pan.y;
    graphStage.classList.add("is-dragging");
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!state.drag.active || state.drag.pointerId !== event.pointerId) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = bounds.width / rect.width;
    const scaleY = bounds.height / rect.height;
    const next = clampPan(
      state.drag.startPanX + (event.clientX - state.drag.startClientX) * scaleX,
      state.drag.startPanY + (event.clientY - state.drag.startClientY) * scaleY,
    );
    state.pan = next;
    updateGraphTransform();
    event.preventDefault();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (state.drag.pointerId === event.pointerId) {
      endDrag();
      canvas.releasePointerCapture(event.pointerId);
    }
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (state.drag.pointerId === event.pointerId) {
      endDrag();
    }
  });

  infoToggle.addEventListener("click", () => {
    setInfoOpen(infoPanel.hidden);
  });

  infoClose.addEventListener("click", () => {
    setInfoOpen(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !infoPanel.hidden) {
      setInfoOpen(false);
    }
  });

  async function init() {
    try {
      setInfoOpen(false);
      state.data = await loadBaseData();
      promptOrderSelect.value = state.promptKey;
      populateModelSelect();
      populateRunSelect();
      await resetRun({ keepPlaying: true });
    } catch (error) {
      stopPlayback();
      state.playing = false;
      sequenceStatusChip.textContent = "Error";
      sequenceLengthChip.textContent = "--";
      sequenceQualityChip.textContent = "--";
      sequenceStatusTitle.textContent = "Data load failed";
      sequenceCaption.textContent = "Could not load LLM sequence data";
      runSummary.innerHTML = `<li>${error.message}</li>`;
      console.error(error);
    }
  }

  init();
})();
