let latestState = null;
let animationPhase = 0;

const REFRESH_BASE_MS = 1500;
const REFRESH_MAX_MS = 8000;
const REQUEST_TIMEOUT_MS = 7000;

let refreshTimer = null;
let refreshInFlight = false;
let refreshFailures = 0;

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function setConnectionState(state, note) {
    const banner = document.getElementById("connection-banner");
    const dot = document.getElementById("connection-dot");
    if (banner) {
        banner.dataset.state = state;
    }
    if (dot) {
        dot.dataset.state = state;
    }
    setText("connection-status", state === "online" ? "Connected" : state === "syncing" ? "Syncing" : "Reconnecting");
    setText("connection-note", note);
}

function formatNumber(value, digits = 1) {
    return Number(value || 0).toFixed(digits);
}

function formatTimestamp(value) {
    if (!value) {
        return "--";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleTimeString();
}

function renderBulletList(id, items, emptyLabel) {
    const element = document.getElementById(id);
    if (!element) {
        return;
    }
    const list = Array.isArray(items) && items.length ? items : [emptyLabel];
    element.innerHTML = "";
    for (const item of list) {
        const li = document.createElement("li");
        li.textContent = item;
        element.appendChild(li);
    }
}

function renderBreakdown(breakdown) {
    const element = document.getElementById("breakdown-list");
    if (!element) {
        return;
    }
    const entries = Object.entries(breakdown || {}).sort((a, b) => b[1] - a[1]);
    element.innerHTML = "";
    if (!entries.length) {
        element.innerHTML = "<li><span>No detections</span><strong>0</strong></li>";
        return;
    }
    for (const [label, count] of entries.slice(0, 8)) {
        const li = document.createElement("li");
        li.innerHTML = `<span>${label}</span><strong>${count}</strong>`;
        element.appendChild(li);
    }
}

function renderCorridors(corridors) {
    for (const name of ["north", "east", "south", "west"]) {
        const corridor = corridors?.[name] || {};
        setText(`corridor-${name}-value`, formatNumber(corridor.pressure, 1));
        setText(
            `corridor-${name}-meta`,
            `Vehicles ${corridor.vehicle_count || 0} | Pedestrians ${corridor.pedestrian_count || 0} | ${((corridor.dominant_labels || []).join(", ") || "mixed traffic")}`
        );
        const bar = document.getElementById(`corridor-${name}-fill`);
        if (bar) {
            bar.style.width = `${Math.max(0, Math.min(100, Number(corridor.pressure || 0)))}%`;
        }
    }
}

function renderChart(containerId, entries, key, color, statId) {
    const container = document.getElementById(containerId);
    const stat = document.getElementById(statId);
    if (!container) {
        return;
    }
    if (!Array.isArray(entries) || !entries.length) {
        container.innerHTML = "<div class='chart-empty'>Waiting for live data.</div>";
        if (stat) {
            stat.textContent = "Waiting";
        }
        return;
    }

    const values = entries.map((entry) => Number(entry[key] || 0));
    const width = 360;
    const height = 170;
    const padding = 18;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((value, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
        const y = height - padding - ((value - min) / range) * (height - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;
    container.innerHTML = `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="rgba(148,163,184,0.2)" />
            <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="rgba(148,163,184,0.2)" />
            <polyline points="${areaPoints}" fill="${color}22" stroke="none"></polyline>
            <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
        </svg>
    `;
    if (stat) {
        stat.textContent = `Latest ${values[values.length - 1].toFixed(1)} | Peak ${max.toFixed(1)}`;
    }
}

function syncOperatorControls(operator) {
    if (!operator) {
        return;
    }
    const ids = ["zone-center-x", "zone-center-y", "simulation-speed", "operation-mode", "selected-operation", "override-corridor", "manual-priority-corridor", "operator-note", "simulation-paused", "directional-only-mode"];
    const [
        zoneX,
        zoneY,
        speed,
        mode,
        action,
        override,
        manualPriority,
        note,
        paused,
        directionalOnly,
    ] = ids.map((id) => document.getElementById(id));

    if (zoneX && document.activeElement !== zoneX) zoneX.value = operator.zone_center_x ?? 0.5;
    if (zoneY && document.activeElement !== zoneY) zoneY.value = operator.zone_center_y ?? 0.5;
    if (speed && document.activeElement !== speed) speed.value = operator.simulation_speed ?? 1;
    if (mode && document.activeElement !== mode) mode.value = operator.operation_mode || "adaptive";
    if (action && document.activeElement !== action) action.value = operator.selected_operation || "follow_ai";
    if (override && document.activeElement !== override) override.value = operator.override_corridor || "none";
    if (manualPriority && document.activeElement !== manualPriority) manualPriority.value = operator.manual_priority_corridor || "none";
    if (note && document.activeElement !== note) note.value = operator.note || "";
    if (paused && document.activeElement !== paused) paused.checked = Boolean(operator.simulation_paused);
    if (directionalOnly && document.activeElement !== directionalOnly) directionalOnly.checked = operator.directional_only_mode !== false;

    setText("zone-center-x-value", formatNumber(operator.zone_center_x ?? 0.5, 2));
    setText("zone-center-y-value", formatNumber(operator.zone_center_y ?? 0.5, 2));
    setText("simulation-speed-value", `${formatNumber(operator.simulation_speed ?? 1, 1)}x`);
}

function syncPresentationFeeds(feeds) {
    for (const slot of ["north", "south", "east", "west"]) {
        const feed = feeds?.[slot] || {};
        setText(`presentation-title-${slot}`, feed.label || slot.toUpperCase());
        setText(`presentation-status-${slot}`, feed.status || "Waiting");

        const form = document.querySelector(`.presentation-form[data-slot="${slot}"]`);
        if (!form) {
            continue;
        }
        const labelInput = form.querySelector('input[name="label"]');
        const typeInput = form.querySelector('select[name="source_type"]');
        const valueInput = form.querySelector('input[name="source_value"]');

        if (labelInput && document.activeElement !== labelInput) {
            labelInput.value = feed.label || labelInput.value;
        }
        if (typeInput && document.activeElement !== typeInput) {
            const selectedType = feed.source_type || "camera";
            const hasOption = Array.from(typeInput.options).some((option) => option.value === selectedType);
            typeInput.value = hasOption ? selectedType : "camera";
        }
        if (valueInput && document.activeElement !== valueInput) {
            valueInput.value = feed.source_value || "";
        }
    }
}

function updateState(state) {
    latestState = state;
    const operator = state.operator || {};
    const simulation = state.simulation || {};
    setText("advisor-source", state.suggestions?.source || "Unknown");
    setText("advisor-status", state.suggestions?.status || "Unknown");
    setText("vision-backend", state.vision_backend || "Unknown");
    setText("vision-note", `Processing ${formatNumber(state.fps, 1)} fps`);
    setText("analysis-advisor-source", state.suggestions?.source || "Unknown");
    setText("analysis-advisor-status", state.suggestions?.status || "Unknown");
    setText("analysis-vision-backend", state.vision_backend || "Unknown");
    setText("analysis-vision-note", `Processing ${formatNumber(state.fps, 1)} fps`);
    setText("source-status", state.source_status || "Unknown");
    setText("controller-note", state.controller_note || "Waiting for analytics");
    setText("recommended-corridor", `Hot corridor: ${state.recommended_corridor || "--"}`);
    setText("feed-mode-badge", operator.directional_only_mode === false ? "Mixed Source" : "Directional Only");
    setText("feed-mode-note", operator.directional_only_mode === false ? "Primary and directional feeds are active." : "Only directional feeds are active.");

    setText("operator-mode-badge", (operator.operation_mode || "adaptive").toUpperCase());
    setText("operator-summary", `${(simulation.selected_operation || "follow_ai").replaceAll("_", " ")} | split ${formatNumber(operator.zone_center_x || 0.5, 2)} / ${formatNumber(operator.zone_center_y || 0.5, 2)}`);

    setText("metric-vehicles", String(state.vehicle_count || 0));
    setText("metric-congestion", formatNumber(state.congestion_index, 1));
    setText("metric-mobility", formatNumber(state.mobility_score, 1));
    setText("metric-throughput", formatNumber(state.throughput_per_min, 1));
    setText("metric-fps", formatNumber(state.fps, 1));
    setText("metric-updated", formatTimestamp(state.captured_at_iso));

    setText("twin-active-corridor", (simulation.active_corridor || "--").replaceAll("_", " "));
    setText("twin-simulation-speed", `${formatNumber(simulation.simulation_speed || 1, 1)}x`);
    setText("twin-manual-priority", (simulation.manual_priority_corridor || "none").replaceAll("_", " "));
    setText("twin-simulation-state", simulation.simulation_paused ? "Paused" : "Running");

    renderCorridors(state.corridors || {});
    renderBulletList("suggestions-list", state.suggestions?.suggestions || [], "Waiting for live advisory.");
    renderBulletList("alerts-list", state.alerts || [], "No active alerts.");
    renderBreakdown(state.class_breakdown || {});
    setText("suggestion-warning", state.suggestions?.warning || "No elevated risk message right now.");
    syncOperatorControls(operator);
    syncPresentationFeeds(state.presentation_feeds || {});

    renderChart("chart-vehicles", state.timeline || [], "vehicles", "#38bdf8", "chart-vehicles-stat");
    renderChart("chart-congestion", state.timeline || [], "congestion", "#f97316", "chart-congestion-stat");
    renderChart("chart-throughput", state.timeline || [], "throughput", "#2dd4bf", "chart-throughput-stat");
    renderChart("chart-mobility", state.timeline || [], "mobility", "#f472b6", "chart-mobility-stat");
}

function nextRefreshDelay() {
    return Math.min(REFRESH_MAX_MS, REFRESH_BASE_MS * (2 ** Math.min(refreshFailures, 3)));
}

function scheduleRefresh(delay = REFRESH_BASE_MS) {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => refreshState(false), delay);
}

async function safeFetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }
        return payload;
    } catch (error) {
        if (error && error.name === "AbortError") {
            throw new Error("request timed out");
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function refreshState(manual = false) {
    if (refreshInFlight) {
        if (manual) setText("form-feedback", "Refresh already in progress.");
        return;
    }
    refreshInFlight = true;
    setConnectionState("syncing", manual ? "Manual refresh started." : "Updating analytics.");
    try {
        updateState(await safeFetchJson("/api/state", { cache: "no-store" }));
        refreshFailures = 0;
        setConnectionState("online", `Last updated at ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
        refreshFailures += 1;
        const retryInSeconds = Math.max(1, Math.round(nextRefreshDelay() / 1000));
        setConnectionState("error", `Refresh failed. Retrying in ${retryInSeconds}s.`);
        setText("form-feedback", `State refresh failed: ${error.message}`);
    } finally {
        refreshInFlight = false;
        scheduleRefresh(nextRefreshDelay());
    }
}

async function applySource(sourceType, sourceValue) {
    setConnectionState("syncing", "Applying source update.");
    try {
        const payload = await safeFetchJson("/api/source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source_type: sourceType,
                source_value: sourceValue,
            }),
        });
        setText("form-feedback", `Source switched to ${sourceType}.`);
        if (payload.state) {
            updateState(payload.state);
        }
        refreshFailures = 0;
        setConnectionState("online", "Source updated successfully.");
        scheduleRefresh(300);
    } catch (error) {
        setConnectionState("error", "Source update failed.");
        setText("form-feedback", `Source change failed: ${error.message}`);
    }
}

async function submitSource(event) {
    event.preventDefault();
    const sourceType = document.getElementById("source-type");
    const sourceInput = document.getElementById("source-input");
    if (!sourceType || !sourceInput) {
        return;
    }
    await applySource(sourceType.value, sourceInput.value.trim());
}

async function submitUpload(event) {
    event.preventDefault();
    const fileInput = document.getElementById("upload-file");
    if (!fileInput || !fileInput.files.length) {
        setText("form-feedback", "Select a file before uploading.");
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    setConnectionState("syncing", "Uploading media.");

    try {
        const payload = await safeFetchJson("/api/upload", {
            method: "POST",
            body: formData,
        }, 20000);
        setText("form-feedback", `Uploaded file switched into ${payload.source_type} mode.`);

        const sourceType = document.getElementById("source-type");
        const sourceInput = document.getElementById("source-input");
        if (sourceType) {
            sourceType.value = payload.source_type;
        }
        if (sourceInput) {
            sourceInput.value = payload.path;
        }
        if (payload.state) {
            updateState(payload.state);
        }
        refreshFailures = 0;
        setConnectionState("online", "Upload completed successfully.");
        scheduleRefresh(300);
    } catch (error) {
        setConnectionState("error", "Upload failed.");
        setText("form-feedback", `Upload failed: ${error.message}`);
    }
}

async function submitPresentationForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const slot = form.dataset.slot;
    const formData = new FormData(form);
    const payload = {
        label: String(formData.get("label") || "").trim(),
        source_type: String(formData.get("source_type") || "camera").trim().toLowerCase(),
        source_value: String(formData.get("source_value") || "").trim(),
    };

    setConnectionState("syncing", `Applying ${slot} feed source.`);
    try {
        const body = await safeFetchJson(`/api/presentation-source/${slot}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        setText("presentation-feedback", `${payload.label || slot} updated for presentation.`);
        syncPresentationFeeds(body.presentation_feeds || {});
        refreshFailures = 0;
        setConnectionState("online", "Presentation source updated.");
    } catch (error) {
        setConnectionState("error", "Presentation source update failed.");
        setText("presentation-feedback", `Presentation update failed: ${error.message}`);
    }
}

async function uploadPresentationForm(form) {
    const slot = form.dataset.slot;
    const fileInput = form.querySelector('input[name="file"]');
    const labelInput = form.querySelector('input[name="label"]');
    if (!fileInput || !fileInput.files.length) {
        setText("presentation-feedback", "Choose a video clip or image before uploading.");
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append("label", labelInput ? labelInput.value.trim() : "");

    setConnectionState("syncing", `Uploading ${slot} feed.`);
    try {
        const body = await safeFetchJson(`/api/presentation-upload/${slot}`, {
            method: "POST",
            body: formData,
        }, 20000);
        setText("presentation-feedback", `${slot} uploaded successfully.`);
        syncPresentationFeeds(body.presentation_feeds || {});
        fileInput.value = "";
        refreshFailures = 0;
        setConnectionState("online", "Presentation upload completed.");
    } catch (error) {
        setConnectionState("error", "Presentation upload failed.");
        setText("presentation-feedback", `Upload failed: ${error.message}`);
    }
}

async function clearPresentationSlot(slot) {
    setConnectionState("syncing", `Clearing ${slot} feed.`);
    try {
        const body = await safeFetchJson(`/api/presentation-source/${slot}/clear`, {
            method: "POST",
        });
        setText("presentation-feedback", `${slot} presentation feed cleared.`);
        syncPresentationFeeds(body.presentation_feeds || {});
        refreshFailures = 0;
        setConnectionState("online", "Presentation feed cleared.");
    } catch (error) {
        setConnectionState("error", "Presentation feed clear failed.");
        setText("presentation-feedback", `Clear failed: ${error.message}`);
    }
}

async function applyOperatorFromForm() {
    const zoneX = document.getElementById("zone-center-x");
    const zoneY = document.getElementById("zone-center-y");
    const speed = document.getElementById("simulation-speed");
    const mode = document.getElementById("operation-mode");
    const action = document.getElementById("selected-operation");
    const override = document.getElementById("override-corridor");
    const manualPriority = document.getElementById("manual-priority-corridor");
    const paused = document.getElementById("simulation-paused");
    const directionalOnly = document.getElementById("directional-only-mode");
    const note = document.getElementById("operator-note");
    if (!zoneX || !zoneY || !speed || !mode || !action || !override || !manualPriority || !paused || !directionalOnly || !note) {
        return;
    }

    const payload = {
        zone_center_x: parseFloat(zoneX.value),
        zone_center_y: parseFloat(zoneY.value),
        simulation_speed: parseFloat(speed.value),
        operation_mode: mode.value,
        selected_operation: action.value,
        override_corridor: override.value,
        manual_priority_corridor: manualPriority.value,
        simulation_paused: paused.checked,
        directional_only_mode: directionalOnly.checked,
        note: note.value.trim(),
    };

    setConnectionState("syncing", "Applying operator settings.");
    try {
        const body = await safeFetchJson("/api/operator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        setText("operator-feedback", "Operator settings applied to analysis and simulation.");
        if (body.state) {
            updateState(body.state);
        }
        refreshFailures = 0;
        setConnectionState("online", "Operator settings updated.");
        scheduleRefresh(300);
    } catch (error) {
        setConnectionState("error", "Operator settings update failed.");
        setText("operator-feedback", `Operation update failed: ${error.message}`);
    }
}

async function submitOperator(event) {
    event.preventDefault();
    await applyOperatorFromForm();
}

function updateSourcePlaceholder() {
    const sourceType = document.getElementById("source-type");
    const input = document.getElementById("source-input");
    if (!sourceType || !input) {
        return;
    }
    if (sourceType.value === "camera") {
        input.placeholder = "Camera index, for example 0";
    } else if (sourceType.value === "video") {
        input.placeholder = "Absolute path to a local traffic video";
    } else {
        input.placeholder = "Absolute path to a local traffic image";
    }
}

function updatePresentationPlaceholder(form) {
    const typeInput = form.querySelector('select[name="source_type"]');
    const valueInput = form.querySelector('input[name="source_value"]');
    if (!typeInput || !valueInput) {
        return;
    }
    const sourceType = typeInput.value;
    if (sourceType === "camera") {
        valueInput.placeholder = "Camera index, for example 0";
    } else if (sourceType === "stream") {
        valueInput.placeholder = "RTSP / HTTP / IP camera URL";
    } else if (sourceType === "video") {
        valueInput.placeholder = "Absolute path to a local video clip";
    } else {
        valueInput.placeholder = "Absolute path to a local image";
    }
}

function wireLiveSlider(id, outputId, suffix = "") {
    const slider = document.getElementById(id);
    if (!slider) {
        return;
    }
    slider.addEventListener("input", () => {
        setText(outputId, `${formatNumber(slider.value, id === "simulation-speed" ? 1 : 2)}${suffix}`);
    });
}

function drawTwin() {
    const canvas = document.getElementById("twin-canvas");
    if (!canvas) {
        requestAnimationFrame(drawTwin);
        return;
    }
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const operator = latestState?.operator || {};
    const simulation = latestState?.simulation || {};
    const corridors = latestState?.corridors || {};
    const centerX = width * Number(operator.zone_center_x || 0.5);
    const centerY = height * Number(operator.zone_center_y || 0.5);
    const roadWidth = 92;
    const active = simulation.active_corridor || "none";
    const speed = Number(simulation.simulation_speed || 1);
    const paused = Boolean(simulation.simulation_paused);

    ctx.fillStyle = "#081724";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#22303b";
    ctx.fillRect(centerX - roadWidth / 2, 0, roadWidth, height);
    ctx.fillRect(0, centerY - roadWidth / 2, width, roadWidth);

    const highlight = {
        north: "rgba(56,189,248,0.24)",
        east: "rgba(45,212,191,0.24)",
        south: "rgba(249,115,22,0.24)",
        west: "rgba(244,114,182,0.24)",
    }[active] || "rgba(148,163,184,0.18)";
    ctx.fillStyle = highlight;
    if (active === "north") ctx.fillRect(centerX - roadWidth / 2, 0, roadWidth, centerY);
    else if (active === "south") ctx.fillRect(centerX - roadWidth / 2, centerY, roadWidth, height - centerY);
    else if (active === "east") ctx.fillRect(centerX, centerY - roadWidth / 2, width - centerX, roadWidth);
    else if (active === "west") ctx.fillRect(0, centerY - roadWidth / 2, centerX, roadWidth);
    else ctx.fillRect(centerX - roadWidth / 2, centerY - roadWidth / 2, roadWidth, roadWidth);

    for (const corridorName of ["north", "east", "south", "west"]) {
        const count = Math.max(0, Math.min(16, Number(corridors?.[corridorName]?.vehicle_count || 0)));
        const pressure = Number(corridors?.[corridorName]?.pressure || 0);
        const color = { north: "#38bdf8", east: "#2dd4bf", south: "#f97316", west: "#f472b6" }[corridorName];
        ctx.fillStyle = color;
        for (let index = 0; index < count; index += 1) {
            const t = ((index / count) + animationPhase * 0.08 * speed) % 1;
            let x = centerX;
            let y = centerY;
            if (corridorName === "north") {
                x = centerX - 34 + (index % 4) * 18;
                y = 18 + t * Math.max(centerY - 40, 40);
            } else if (corridorName === "south") {
                x = centerX + 16 + (index % 4) * 18;
                y = height - 18 - t * Math.max(height - centerY - 40, 40);
            } else if (corridorName === "east") {
                x = width - 18 - t * Math.max(width - centerX - 40, 40);
                y = centerY - 34 + (index % 4) * 18;
            } else {
                x = 18 + t * Math.max(centerX - 40, 40);
                y = centerY + 16 + (index % 4) * 18;
            }
            ctx.beginPath();
            ctx.arc(x, y, 4 + (pressure / 100) * 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 17px Trebuchet MS";
    ctx.fillText(`Operation: ${(simulation.selected_operation || "follow_ai").replaceAll("_", " ")}`, 18, 28);
    ctx.font = "14px Trebuchet MS";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`Mode: ${simulation.operation_mode || "adaptive"} | Active: ${active.replaceAll("_", " ")}`, 18, 50);
    ctx.fillText(`Note: ${simulation.note || "No operator note"}`, 18, height - 18);

    if (!paused) {
        animationPhase += 0.02 * speed;
    }
    requestAnimationFrame(drawTwin);
}

document.addEventListener("DOMContentLoaded", () => {
    const sourceForm = document.getElementById("source-form");
    const uploadForm = document.getElementById("upload-form");
    const operatorForm = document.getElementById("operator-form");
    const sourceType = document.getElementById("source-type");
    const refreshButton = document.getElementById("refresh-state-button");
    const quickSourceButtons = document.querySelectorAll(".quick-source-button");
    const quickOperationButtons = document.querySelectorAll(".quick-operation-button");
    const presentationForms = document.querySelectorAll(".presentation-form");
    const clearButtons = document.querySelectorAll(".clear-presentation-button");
    const priorityButtons = document.querySelectorAll(".priority-button");
    const uploadButtons = document.querySelectorAll(".upload-presentation-button");

    if (sourceForm) sourceForm.addEventListener("submit", submitSource);
    if (uploadForm) uploadForm.addEventListener("submit", submitUpload);
    if (operatorForm) operatorForm.addEventListener("submit", submitOperator);
    if (sourceType) {
        sourceType.addEventListener("change", updateSourcePlaceholder);
        updateSourcePlaceholder();
    }
    if (refreshButton) refreshButton.addEventListener("click", () => refreshState(true));

    for (const button of quickSourceButtons) {
        button.addEventListener("click", async () => {
            const sourceTypeEl = document.getElementById("source-type");
            const sourceInputEl = document.getElementById("source-input");
            const sourceTypeValue = button.dataset.sourceType || "camera";
            const sourceValue = button.dataset.sourceValue || "0";
            if (sourceTypeEl) sourceTypeEl.value = sourceTypeValue;
            if (sourceInputEl) sourceInputEl.value = sourceValue;
            updateSourcePlaceholder();
            await applySource(sourceTypeValue, sourceValue);
        });
    }
    for (const button of quickOperationButtons) {
        button.addEventListener("click", async () => {
            const selectedOperation = document.getElementById("selected-operation");
            if (selectedOperation) selectedOperation.value = button.dataset.operation || "follow_ai";
            await applyOperatorFromForm();
        });
    }
    for (const form of presentationForms) {
        form.addEventListener("submit", submitPresentationForm);
        const typeInput = form.querySelector('select[name="source_type"]');
        if (typeInput) {
            typeInput.addEventListener("change", () => updatePresentationPlaceholder(form));
            updatePresentationPlaceholder(form);
        }
    }
    for (const button of clearButtons) {
        button.addEventListener("click", async () => clearPresentationSlot(button.dataset.slot));
    }
    for (const button of uploadButtons) {
        button.addEventListener("click", async () => {
            const form = button.closest(".presentation-form");
            if (form) await uploadPresentationForm(form);
        });
    }
    for (const button of priorityButtons) {
        button.addEventListener("click", async () => {
            const manualPriority = document.getElementById("manual-priority-corridor");
            if (manualPriority) manualPriority.value = button.dataset.priority || "none";
            await applyOperatorFromForm();
        });
    }

    wireLiveSlider("zone-center-x", "zone-center-x-value");
    wireLiveSlider("zone-center-y", "zone-center-y-value");
    wireLiveSlider("simulation-speed", "simulation-speed-value", "x");

    setConnectionState("syncing", "Connecting to backend.");
    refreshState(true);
    requestAnimationFrame(drawTwin);
});
