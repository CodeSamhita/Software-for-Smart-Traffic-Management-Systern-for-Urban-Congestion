function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function formatNumber(value, digits = 1) {
    const number = Number(value || 0);
    return number.toFixed(digits);
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
        const entry = document.createElement("li");
        entry.textContent = item;
        element.appendChild(entry);
    }
}

function renderBreakdown(breakdown) {
    const element = document.getElementById("breakdown-list");
    if (!element) {
        return;
    }

    const entries = Object.entries(breakdown || {}).sort((left, right) => right[1] - left[1]);
    if (!entries.length) {
        element.innerHTML = "";
        const emptyItem = document.createElement("li");
        const label = document.createElement("span");
        const value = document.createElement("strong");
        label.textContent = "No detections";
        value.textContent = "0";
        emptyItem.appendChild(label);
        emptyItem.appendChild(value);
        element.appendChild(emptyItem);
        return;
    }

    element.innerHTML = "";
    for (const [labelText, count] of entries.slice(0, 8)) {
        const item = document.createElement("li");
        const label = document.createElement("span");
        const value = document.createElement("strong");
        label.textContent = labelText;
        value.textContent = String(count);
        item.appendChild(label);
        item.appendChild(value);
        element.appendChild(item);
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
        container.innerHTML = `<div class="chart-empty">Waiting for live data.</div>`;
        if (stat) {
            stat.textContent = "Waiting";
        }
        return;
    }

    const values = entries.map(entry => Number(entry[key] || 0));
    const width = 360;
    const height = 170;
    const padding = 18;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    const points = values.map((value, index) => {
        const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
        const y = height - padding - ((value - minValue) / range) * (height - padding * 2);
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
        const latest = values[values.length - 1];
        stat.textContent = `Latest ${latest.toFixed(1)} | Peak ${maxValue.toFixed(1)}`;
    }
}

function updateState(state) {
    setText("advisor-source", state.suggestions?.source || "Unknown");
    setText("advisor-status", state.suggestions?.status || "Unknown");
    setText("vision-backend", state.vision_backend || "Unknown");
    setText("vision-note", `Processing ${formatNumber(state.fps, 1)} fps`);
    setText("source-status", state.source_status || "Unknown");
    setText("source-value", `${state.source_type || "unknown"} / ${state.source_value || "--"}`);
    setText("controller-note", state.controller_note || "Waiting for analytics");
    setText("recommended-corridor", `Hot corridor: ${state.recommended_corridor || "--"}`);

    const suggestionSource = String(state.suggestions?.source || "");
    const offlineMode = suggestionSource.includes("offline") || suggestionSource.includes("ollama");
    setText("network-mode", offlineMode ? "Offline-safe mode" : "Cloud-assisted mode");

    setText("metric-vehicles", String(state.vehicle_count || 0));
    setText("metric-congestion", formatNumber(state.congestion_index, 1));
    setText("metric-mobility", formatNumber(state.mobility_score, 1));
    setText("metric-throughput", formatNumber(state.throughput_per_min, 1));
    setText("metric-fps", formatNumber(state.fps, 1));
    setText("metric-updated", formatTimestamp(state.captured_at_iso));

    renderCorridors(state.corridors || {});
    renderBulletList("suggestions-list", state.suggestions?.suggestions || [], "Waiting for live advisory.");
    renderBulletList("alerts-list", state.alerts || [], "No active alerts.");
    renderBreakdown(state.class_breakdown || {});
    setText("suggestion-warning", state.suggestions?.warning || "No elevated risk message right now.");

    renderChart("chart-vehicles", state.timeline || [], "vehicles", "#38bdf8", "chart-vehicles-stat");
    renderChart("chart-congestion", state.timeline || [], "congestion", "#f97316", "chart-congestion-stat");
    renderChart("chart-throughput", state.timeline || [], "throughput", "#2dd4bf", "chart-throughput-stat");
    renderChart("chart-mobility", state.timeline || [], "mobility", "#f472b6", "chart-mobility-stat");
}

async function refreshState() {
    try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const state = await response.json();
        updateState(state);
    } catch (error) {
        setText("form-feedback", `State refresh failed: ${error.message}`);
    }
}

async function submitSource(event) {
    event.preventDefault();
    const sourceType = document.getElementById("source-type").value;
    const sourceValue = document.getElementById("source-input").value.trim();
    await applySource(sourceType, sourceValue);
}

async function applySource(sourceType, sourceValue) {
    try {
        const response = await fetch("/api/source", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source_type: sourceType,
                source_value: sourceValue,
            }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }
        setText("form-feedback", `Source switched to ${sourceType}.`);
        if (payload.state) {
            updateState(payload.state);
        }
    } catch (error) {
        setText("form-feedback", `Source change failed: ${error.message}`);
    }
}

async function submitUpload(event) {
    event.preventDefault();
    const fileInput = document.getElementById("upload-file");
    if (!fileInput.files.length) {
        setText("form-feedback", "Select a file before uploading.");
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    try {
        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }
        setText("form-feedback", `Uploaded file switched into ${payload.source_type} mode.`);
        document.getElementById("source-type").value = payload.source_type;
        document.getElementById("source-input").value = payload.path;
        if (payload.state) {
            updateState(payload.state);
        }
    } catch (error) {
        setText("form-feedback", `Upload failed: ${error.message}`);
    }
}

function updateSourcePlaceholder() {
    const sourceType = document.getElementById("source-type").value;
    const input = document.getElementById("source-input");
    if (!input) {
        return;
    }
    if (sourceType === "camera") {
        input.placeholder = "Camera index, for example 0";
    } else if (sourceType === "video") {
        input.placeholder = "Absolute path to a local traffic video";
    } else {
        input.placeholder = "Absolute path to a local traffic image";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const sourceForm = document.getElementById("source-form");
    const uploadForm = document.getElementById("upload-form");
    const sourceType = document.getElementById("source-type");
    const refreshStateButton = document.getElementById("refresh-state-button");
    const quickSourceButtons = document.querySelectorAll(".quick-source-button");

    if (sourceForm) {
        sourceForm.addEventListener("submit", submitSource);
    }
    if (uploadForm) {
        uploadForm.addEventListener("submit", submitUpload);
    }
    if (sourceType) {
        sourceType.addEventListener("change", updateSourcePlaceholder);
        updateSourcePlaceholder();
    }
    if (refreshStateButton) {
        refreshStateButton.addEventListener("click", refreshState);
    }
    for (const button of quickSourceButtons) {
        button.addEventListener("click", async () => {
            const sourceTypeValue = button.dataset.sourceType || "camera";
            const sourceValue = button.dataset.sourceValue || "0";
            document.getElementById("source-type").value = sourceTypeValue;
            document.getElementById("source-input").value = sourceValue;
            updateSourcePlaceholder();
            await applySource(sourceTypeValue, sourceValue);
        });
    }

    refreshState();
    window.setInterval(refreshState, 1500);
});
