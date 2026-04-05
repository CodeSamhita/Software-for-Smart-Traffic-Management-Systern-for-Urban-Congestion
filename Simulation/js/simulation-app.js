        import { createRenderer } from "./simulation-render.js";

        const canvas = document.getElementById("sim-canvas");
        const ctx = canvas.getContext("2d", { alpha: false });

        const LIGHT = { RED: 0, GREEN: 1, YELLOW: 2 };
        const DIR = { EAST: 0, WEST: 1, SOUTH: 2, NORTH: 3 };
        const DIRECTIONS = [DIR.NORTH, DIR.EAST, DIR.SOUTH, DIR.WEST];
        const LABELS = {
            [DIR.NORTH]: "North corridor",
            [DIR.EAST]: "East corridor",
            [DIR.SOUTH]: "South corridor",
            [DIR.WEST]: "West corridor"
        };
        const SHORT = {
            [DIR.NORTH]: "North",
            [DIR.EAST]: "East",
            [DIR.SOUTH]: "South",
            [DIR.WEST]: "West"
        };
        const DOM_IDS = {
            [DIR.NORTH]: "north",
            [DIR.EAST]: "east",
            [DIR.SOUTH]: "south",
            [DIR.WEST]: "west"
        };

        const PROFILES = {
            balanced: {
                note: "Balanced demand keeps arrivals even on all approaches.",
                weights: { [DIR.NORTH]: 1, [DIR.EAST]: 1, [DIR.SOUTH]: 1, [DIR.WEST]: 1 }
            },
            "rush-ns": {
                note: "Commuter traffic is concentrated on the north-south arterial.",
                weights: { [DIR.NORTH]: 1.8, [DIR.EAST]: 0.8, [DIR.SOUTH]: 1.8, [DIR.WEST]: 0.8 }
            },
            "rush-ew": {
                note: "Market traffic is heavier across east-west corridors.",
                weights: { [DIR.NORTH]: 0.9, [DIR.EAST]: 1.75, [DIR.SOUTH]: 0.9, [DIR.WEST]: 1.75 }
            },
            event: {
                note: "A one-sided release creates a sharp outbound pulse of traffic.",
                weights: { [DIR.NORTH]: 0.7, [DIR.EAST]: 1.9, [DIR.SOUTH]: 1.2, [DIR.WEST]: 1.5 }
            }
        };

        const EMERGENCY_TYPES = {
            ambulance: {
                label: "Ambulance",
                color: "#f97316",
                roof: "#60a5fa",
                controllerBoost: 18,
                broadcastRadius: 260,
                yieldDistance: 230,
                speedBonus: 1.3,
                sizeBonus: 6
            },
            police: {
                label: "Police",
                color: "#2563eb",
                roof: "#f8fafc",
                controllerBoost: 15,
                broadcastRadius: 230,
                yieldDistance: 210,
                speedBonus: 1.22,
                sizeBonus: 2
            },
            fire: {
                label: "Fire and Rescue",
                color: "#dc2626",
                roof: "#fbbf24",
                controllerBoost: 17,
                broadcastRadius: 250,
                yieldDistance: 225,
                speedBonus: 1.18,
                sizeBonus: 10
            },
            response: {
                label: "Disaster Response",
                color: "#7c3aed",
                roof: "#22d3ee",
                controllerBoost: 14,
                broadcastRadius: 220,
                yieldDistance: 210,
                speedBonus: 1.12,
                sizeBonus: 12
            }
        };

        const EMERGENCY_ACTIONS = {
            priority: {
                label: "Priority passage",
                controllerBoost: 8,
                greenBonus: 1800,
                holdCrossTraffic: true,
                allRed: 0
            },
            lockdown: {
                label: "Intersection lockdown",
                controllerBoost: 10,
                greenBonus: 1400,
                holdCrossTraffic: true,
                allRed: 1200
            },
            rescue: {
                label: "Rescue convoy",
                controllerBoost: 7,
                greenBonus: 3200,
                holdCrossTraffic: true,
                allRed: 600
            },
            evacuation: {
                label: "Evacuation wave",
                controllerBoost: 6,
                greenBonus: 2600,
                holdCrossTraffic: false,
                allRed: 0
            }
        };

        const DEFAULT_ACTION_BY_TYPE = {
            ambulance: "priority",
            police: "lockdown",
            fire: "rescue",
            response: "evacuation"
        };
        const RANDOM_EMERGENCY_TYPES = ["ambulance", "ambulance", "police", "police", "fire", "response"];
        const RANDOM_ACTIONS_BY_TYPE = {
            ambulance: ["priority", "priority", "lockdown"],
            police: ["priority", "lockdown", "lockdown", "rescue"],
            fire: ["rescue", "priority", "lockdown"],
            response: ["evacuation", "rescue", "priority"]
        };

        const COLORS = {
            grass: "#07131d",
            road: "#22303b",
            mark: "#d3dce8",
            edge: "#d7e3f4",
            median: "#fbbf24",
            red: "#f87171",
            yellow: "#fbbf24",
            green: "#34d399",
            comm: "#38bdf8",
            cars: ["#e2e8f0", "#f97316", "#60a5fa", "#34d399", "#f43f5e", "#c084fc", "#f8fafc", "#38bdf8"]
        };

        const FLOW_MODES = {
            smooth: {
                label: "Smooth",
                cruiseScale: 0.9,
                spawnScale: 0.82,
                gapScale: 1.34,
                reactionScale: 0.76,
                turnCapScale: 0.78,
                randomStopRateScale: 0.55,
                junctionCautionScale: 1.2
            },
            balanced: {
                label: "Balanced",
                cruiseScale: 1,
                spawnScale: 1,
                gapScale: 1,
                reactionScale: 1,
                turnCapScale: 1,
                randomStopRateScale: 1,
                junctionCautionScale: 1
            },
            fast: {
                label: "Fast",
                cruiseScale: 1.08,
                spawnScale: 1.12,
                gapScale: 0.9,
                reactionScale: 1.12,
                turnCapScale: 1.08,
                randomStopRateScale: 1.1,
                junctionCautionScale: 0.88
            }
        };

        const ANALYTICS_STORAGE_KEY = "smart-traffic-analytics-feed.v1";
        const ANALYTICS_DB_NAME = "smart-traffic-analytics-db";
        const ANALYTICS_DB_VERSION = 1;
        const ANALYTICS_SESSION_STORE = "sessions";
        const ANALYTICS_SAMPLE_STORE = "samples";
        const ANALYTICS_EVENT_STORE = "events";
        const OPENAI_SESSION_KEY = "smart-traffic-openai-session.v1";
        const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
        let analyticsDbPromise = null;

        const config = {
            lanesPerDir: 2,
            laneWidth: 52,
            get roadWidth() { return this.lanesPerDir * 2 * this.laneWidth; },
            carWidth: 14,
            carLength: 32,
            safeDistance: 36,
            brakeDecel: 0.31,
            accelRate: 0.078,
            yellowTime: 1800
        };

        const state = {
            width: innerWidth,
            height: innerHeight,
            cx: innerWidth / 2,
            cy: innerHeight / 2,
            paused: false,
            vehicles: [],
            demandIntensity: 150,
            maxSpeed: 5.5,
            lightCycleTime: 5500,
            controlMode: "adaptive",
            flowMode: "smooth",
            smartActionsDisabled: false,
            demandProfile: "balanced",
            demandWeights: { ...PROFILES.balanced.weights },
            emergencyDirection: null,
            emergencyType: null,
            emergencyAction: null,
            priorityPending: false,
            priorityVehicleId: null,
            activeEmergencyRequest: null,
            randomEmergencyEnabled: false,
            randomEmergencyTimerMs: 0,
            randomEmergencyMinIntervalMs: 9000,
            randomEmergencyMaxIntervalMs: 24000,
            time: 0,
            lastTime: 0,
            network: {
                broadcasts: 0,
                v2vLinks: 0,
                yieldingVehicles: 0,
                controlNote: "Adaptive auto-timing controller is balancing queues and arrivals."
            },
            ai: {
                enabled: false,
                rememberKey: false,
                apiKey: "",
                model: "gpt-5-mini",
                busy: false,
                lastMode: "",
                lastStatus: "AI advisor is disabled. Enable it and enter an OpenAI API key to start.",
                lastOutput: "No AI response yet.",
                lastPlan: null
            },
            analytics: {
                timeline: [],
                events: [],
                maxSamples: 1200,
                maxEvents: 500,
                sampleIntervalMs: 1000,
                lastSampleAt: 0,
                exportedAt: null,
                publishIntervalMs: 1000,
                lastPublishedAt: 0,
                sessionId: "",
                sessionStartedAtIso: "",
                storedSampleCount: 0,
                storedEventCount: 0,
                nextSampleSequence: 0,
                nextEventSequence: 0,
                pendingSamples: [],
                pendingEvents: [],
                storageStatus: "Starting",
                persistTimerId: null,
                persistQueuedReason: "",
                persistInFlight: false,
                persistRetryQueued: false
            },
            metrics: {
                liveVehicles: 0,
                throughputPerMin: 0,
                averageWaitMs: 0,
                averageSpeedKmh: 0,
                congestionIndex: 0,
                completedTrips: 0,
                emergencyTrips: 0,
                v2vLinks: 0,
                yieldingVehicles: 0,
                throughputEvents: [],
                corridors: emptyCorridors()
            }
        };

        function emptyCorridors() {
            const map = {};
            for (const dir of DIRECTIONS) {
                map[dir] = {
                    queue: 0,
                    approaching: 0,
                    moving: 0,
                    priorityCount: 0,
                    incoming: 0,
                    avgWaitMs: 0,
                    avgSpeedKmh: 0,
                    pressure: 0,
                    totalWaitMs: 0,
                    totalSpeed: 0,
                    vehicles: 0
                };
            }
            return map;
        }

        function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
        function shortLabel(dir) { return SHORT[dir] || "Unknown"; }
        function fullLabel(dir) { return LABELS[dir] || "Unknown"; }
        function oppositeDirection(dir) {
            if (dir === DIR.NORTH) return DIR.SOUTH;
            if (dir === DIR.SOUTH) return DIR.NORTH;
            if (dir === DIR.EAST) return DIR.WEST;
            return DIR.EAST;
        }
        function phaseLabel(primaryDir, pairedDir = null, useFull = false) {
            const primary = useFull ? fullLabel(primaryDir) : shortLabel(primaryDir);
            if (pairedDir === null || pairedDir === undefined || pairedDir === primaryDir) return primary;
            const secondary = useFull ? fullLabel(pairedDir) : shortLabel(pairedDir);
            return `${primary} + ${secondary}`;
        }
        function corridorId(dir) { return DOM_IDS[dir]; }
        function randomChoice(list) { return list[Math.floor(Math.random() * list.length)]; }
        function frameFactor(dt) { return clamp(dt / 16.6667, 0.65, 1.9); }
        function getEmergencyProfile(type) { return EMERGENCY_TYPES[type] || EMERGENCY_TYPES.ambulance; }
        function getActionProfile(action) { return EMERGENCY_ACTIONS[action] || EMERGENCY_ACTIONS.priority; }
        function emergencyLabel(type) { return type ? getEmergencyProfile(type).label : "None"; }
        function actionLabel(action) { return action ? getActionProfile(action).label : "None"; }
        function constraintReasonLabel(reason) {
            if (reason === "emergency_preemption") return "Emergency preemption";
            if (reason === "spillback_protection") return "Spillback protection";
            if (reason === "starvation_protection") return "Starvation protection";
            if (reason === "queue_override") return "Queue override";
            return "Balanced flow";
        }
        function summarizeCorridors(corridors) {
            let totalQueue = 0;
            let totalIncoming = 0;
            let totalApproaching = 0;
            let totalPressure = 0;
            let maxPressure = 0;
            let minPressure = Infinity;
            let maxQueue = 0;

            for (const dir of DIRECTIONS) {
                const corridor = corridors[dir];
                totalQueue += corridor.queue;
                totalIncoming += corridor.incoming;
                totalApproaching += corridor.approaching;
                totalPressure += corridor.pressure;
                maxPressure = Math.max(maxPressure, corridor.pressure);
                minPressure = Math.min(minPressure, corridor.pressure);
                maxQueue = Math.max(maxQueue, corridor.queue);
            }

            const normalizedMin = minPressure === Infinity ? 0 : minPressure;
            return {
                totalQueue,
                totalIncoming,
                totalApproaching,
                totalPressure,
                avgPressure: totalPressure / DIRECTIONS.length,
                maxPressure,
                minPressure: normalizedMin,
                maxQueue,
                pressureSpread: Number((maxPressure - normalizedMin).toFixed(2))
            };
        }
        function congestionBandKey(index) {
            if (index >= 75) return "critical";
            if (index >= 50) return "heavy";
            if (index >= 28) return "moderate";
            return "low";
        }
        function congestionBandLabel(key) {
            if (key === "critical") return "Critical";
            if (key === "heavy") return "Heavy";
            if (key === "moderate") return "Moderate";
            return "Low";
        }
        function escapeHtml(text) {
            return String(text)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }
        function safeJsonParse(text) {
            try {
                return JSON.parse(text);
            } catch (error) {
                return null;
            }
        }
        function simTimeSeconds() { return Number((state.time / 1000).toFixed(2)); }
        function boundedPush(list, value, max) {
            list.push(value);
            if (list.length > max) list.splice(0, list.length - max);
        }
        function nodeById(id) { return document.getElementById(id); }
        function setTextSafe(id, text) {
            const node = nodeById(id);
            if (node) node.textContent = text;
            return node;
        }
        function setValueSafe(id, value) {
            const node = nodeById(id);
            if (node) node.value = value;
            return node;
        }
        function setCheckedSafe(id, checked) {
            const node = nodeById(id);
            if (node) node.checked = Boolean(checked);
            return node;
        }
        function bindSafe(node, eventName, handler) {
            if (node) node.addEventListener(eventName, handler);
        }
        function bindSafeById(id, eventName, handler) {
            const node = nodeById(id);
            bindSafe(node, eventName, handler);
            return node;
        }
        function currentFlowMode() {
            return FLOW_MODES[state.flowMode] || FLOW_MODES.smooth;
        }
        function flowModeNote(mode = state.flowMode) {
            if (mode === "fast") {
                return "Fast mode is active for higher throughput with tighter following gaps and faster turn commitment.";
            }
            if (mode === "balanced") {
                return "Balanced mode is active for moderate throughput with standard caution at signals and turns.";
            }
            return "Smooth mode is active to reduce collision risk and tighten turning discipline.";
        }
        function smartActionsEnabled() { return !state.smartActionsDisabled; }
        function adaptiveControllerActive() {
            return state.controlMode === "adaptive" && smartActionsEnabled();
        }
        function defaultControlNote() {
            if (!smartActionsEnabled()) {
                return "Manual override is active. Smart actions are bypassed and the signal runs a fixed cycle.";
            }
            const flowLabel = currentFlowMode().label.toLowerCase();
            return adaptiveControllerActive()
                ? `Adaptive auto-timing controller is balancing queues and arrivals with ${flowLabel} flow tuning.`
                : `Fixed-cycle controller is serving one corridor at a time with ${flowLabel} flow tuning.`;
        }

        function isEmergencySystemBusy() {
            if (!smartActionsEnabled()) return false;
            return (
                state.priorityPending ||
                state.activeEmergencyRequest !== null ||
                state.vehicles.some(vehicle => vehicle.priority && vehicle.state !== "DONE")
            );
        }

        function scheduleNextRandomEmergency(initial = false) {
            if (!smartActionsEnabled()) {
                state.randomEmergencyTimerMs = 0;
                return;
            }
            const minMs = initial ? 4500 : state.randomEmergencyMinIntervalMs;
            const maxMs = initial ? 12000 : state.randomEmergencyMaxIntervalMs;
            state.randomEmergencyTimerMs = minMs + Math.random() * (maxMs - minMs);
        }

        function updateRandomEmergencyUi() {
            const toggle = document.getElementById("random-emergency-enabled");
            const note = document.getElementById("random-emergency-note");
            if (!toggle || !note) return;

            toggle.disabled = !smartActionsEnabled();
            toggle.checked = state.randomEmergencyEnabled;
            if (!smartActionsEnabled()) {
                note.textContent = "Disabled by manual override. Turn off Disable Smart Actions to allow random emergency automation.";
                return;
            }
            if (!state.randomEmergencyEnabled) {
                note.textContent = "Disabled. Enable to let the simulator randomly trigger ambulance, police, fire, and response incidents.";
                return;
            }

            if (isEmergencySystemBusy()) {
                note.textContent = "Enabled. Random incidents are waiting for the current emergency priority event to clear.";
                return;
            }

            note.textContent = `Enabled. Next random emergency may appear in about ${(state.randomEmergencyTimerMs / 1000).toFixed(1)} s.`;
        }

        function updateSmartActionsUi() {
            const toggle = document.getElementById("disable-smart-actions");
            const note = document.getElementById("smart-actions-note");
            const dispatch = document.getElementById("btn-dispatch");
            const clearPriority = document.getElementById("btn-reset-priority");
            const modeSelect = document.getElementById("mode-select");
            const smartDisabled = state.smartActionsDisabled;

            if (toggle) toggle.checked = smartDisabled;
            if (modeSelect) modeSelect.disabled = smartDisabled;
            if (dispatch) dispatch.disabled = smartDisabled;
            if (clearPriority) clearPriority.disabled = smartDisabled;

            if (note) {
                note.textContent = smartDisabled
                    ? "On. Smart behavior is bypassed: controller runs fixed-cycle only, emergency preemption is blocked, and discipline automation is paused."
                    : "Off. Adaptive timing, discipline manager speed shaping, and emergency preemption are active.";
            }
        }

        function setSmartActionsDisabled(disabled, source = "operator") {
            const next = Boolean(disabled);
            if (state.smartActionsDisabled === next) {
                updateSmartActionsUi();
                updateRandomEmergencyUi();
                updateAiUi();
                return;
            }

            state.smartActionsDisabled = next;
            if (next) {
                state.randomEmergencyEnabled = false;
                state.randomEmergencyTimerMs = 0;
                clearPriorityState();
                state.network.controlNote = defaultControlNote();
                const priorityNote = document.getElementById("priority-note");
                if (priorityNote) {
                    priorityNote.textContent =
                        "Manual override is active. Emergency smart dispatch and preemption are currently disabled.";
                }
            } else {
                state.network.controlNote = defaultControlNote();
                scheduleNextRandomEmergency(true);
            }

            updateSmartActionsUi();
            updateRandomEmergencyUi();
            updateAiUi();
            logEvent(
                "smart_actions_toggle",
                next
                    ? "Manual override enabled. Smart actions are disabled."
                    : "Manual override disabled. Smart actions are active again.",
                { disabled: next, source }
            );
        }

        function updateAiUi() {
            const enabledToggle = document.getElementById("ai-enabled");
            const rememberToggle = document.getElementById("ai-remember");
            const keyInput = document.getElementById("ai-key");
            const modelSelect = document.getElementById("ai-model");
            const note = document.getElementById("ai-note");
            const status = document.getElementById("ai-status");
            const output = document.getElementById("ai-output");
            const actionButtons = [
                document.getElementById("btn-ai-analyze"),
                document.getElementById("btn-ai-forecast"),
                document.getElementById("btn-ai-optimize")
            ].filter(Boolean);
            const applyButton = document.getElementById("btn-ai-apply");
            const keyReady = state.ai.apiKey.trim().startsWith("sk-");
            const smartReady = smartActionsEnabled();

            if (enabledToggle) enabledToggle.checked = state.ai.enabled;
            if (rememberToggle) rememberToggle.checked = state.ai.rememberKey;
            if (keyInput && keyInput.value !== state.ai.apiKey) keyInput.value = state.ai.apiKey;
            if (modelSelect) modelSelect.value = state.ai.model;

            if (note) {
                if (!smartReady) {
                    note.textContent = "Manual override is enabled, so AI suggestions are paused until smart actions are turned back on.";
                } else if (!state.ai.enabled) {
                    note.textContent = "Optional BYO API mode for live traffic analysis, forecasting, and timing suggestions. The key stays out of logs and exports.";
                } else if (!keyReady) {
                    note.textContent = "Enter an OpenAI API key to enable live traffic analysis and timing suggestions. Session storage is optional.";
                } else if (state.ai.busy) {
                    note.textContent = `OpenAI advisor is running on ${state.ai.model}. Please wait for the current response.`;
                } else {
                    note.textContent = `OpenAI advisor is ready on ${state.ai.model}. Use Analyze, Forecast, or Suggest Timing to call the API.`;
                }
            }

            if (status) {
                status.textContent = state.ai.lastStatus;
                status.className = "ai-status muted";
                if (state.ai.lastStatus.startsWith("Ready") || state.ai.lastStatus.startsWith("Applied")) {
                    status.className = "ai-status success";
                } else if (state.ai.lastStatus.startsWith("Error")) {
                    status.className = "ai-status error";
                }
            }

            if (output) {
                output.innerHTML = escapeHtml(state.ai.lastOutput);
            }

            for (const button of actionButtons) {
                button.disabled = !smartReady || !state.ai.enabled || !keyReady || state.ai.busy;
            }
            if (applyButton) {
                applyButton.disabled = !smartReady || state.ai.busy || !state.ai.lastPlan || state.ai.lastPlan.mode !== "optimize";
            }
        }

        function persistAiSessionConfig() {
            try {
                if (!("sessionStorage" in window)) return;
                const payload = {
                    enabled: state.ai.enabled,
                    rememberKey: state.ai.rememberKey,
                    apiKey: state.ai.rememberKey ? state.ai.apiKey : "",
                    model: state.ai.model
                };
                window.sessionStorage.setItem(OPENAI_SESSION_KEY, JSON.stringify(payload));
            } catch (error) {
                console.warn("OpenAI session settings could not be persisted.", error);
            }
        }

        function restoreAiSessionConfig() {
            try {
                if (!("sessionStorage" in window)) return;
                const raw = window.sessionStorage.getItem(OPENAI_SESSION_KEY);
                if (!raw) return;
                const saved = safeJsonParse(raw);
                if (!saved || typeof saved !== "object") return;
                state.ai.enabled = Boolean(saved.enabled);
                state.ai.rememberKey = Boolean(saved.rememberKey);
                state.ai.apiKey = state.ai.rememberKey ? String(saved.apiKey || "") : "";
                state.ai.model = saved.model === "gpt-5.4" ? "gpt-5.4" : "gpt-5-mini";
            } catch (error) {
                console.warn("OpenAI session settings could not be restored.", error);
            }
        }

        function extractOpenAiResponseText(payload) {
            if (!payload || typeof payload !== "object") return "";
            if (typeof payload.output_text === "string" && payload.output_text.trim()) {
                return payload.output_text;
            }
            if (payload.output_parsed && typeof payload.output_parsed === "object") {
                return JSON.stringify(payload.output_parsed);
            }
            const outputs = Array.isArray(payload.output) ? payload.output : [];
            for (const output of outputs) {
                const contentList = Array.isArray(output.content) ? output.content : [];
                for (const content of contentList) {
                    if (content && typeof content.text === "string" && content.text.trim()) {
                        return content.text;
                    }
                    if (content && content.parsed && typeof content.parsed === "object") {
                        return JSON.stringify(content.parsed);
                    }
                }
            }
            return "";
        }

        function buildAiResponseSchema() {
            return {
                type: "object",
                additionalProperties: false,
                properties: {
                    mode: { type: "string", enum: ["analyze", "forecast", "optimize"] },
                    headline: { type: "string" },
                    summary: { type: "string" },
                    operatorMessage: { type: "string" },
                    recommendedAction: { type: "string" },
                    congestionBand: { type: "string", enum: ["low", "moderate", "heavy", "critical"] },
                    confidence: { type: "number" },
                    forecastSeconds: { type: "integer" },
                    targetControlMode: { type: "string", enum: ["adaptive", "fixed", "keep"] },
                    targetBaseGreenMs: { type: "integer" },
                    targetMaxSpeedKmh: { type: "integer" },
                    enableRandomEmergencies: { type: "boolean" },
                    reasons: {
                        type: "array",
                        items: { type: "string" },
                        minItems: 3,
                        maxItems: 5
                    }
                },
                required: [
                    "mode",
                    "headline",
                    "summary",
                    "operatorMessage",
                    "recommendedAction",
                    "congestionBand",
                    "confidence",
                    "forecastSeconds",
                    "targetControlMode",
                    "targetBaseGreenMs",
                    "targetMaxSpeedKmh",
                    "enableRandomEmergencies",
                    "reasons"
                ]
            };
        }

        function buildAiContext(mode) {
            const telemetry = trafficLights.telemetry || {};
            const recentSamples = state.analytics.timeline.slice(-12).map(sample => ({
                simTimeSec: sample.simTimeSec,
                activeGreen: sample.activeGreen,
                congestionIndex: sample.congestionIndex,
                averageWaitMs: sample.averageWaitMs,
                throughputPerMin: sample.throughputPerMin,
                liveVehicles: sample.liveVehicles,
                autoBaseGreenMs: sample.autoBaseGreenMs,
                constraintTargetGreenMs: sample.constraintTargetGreenMs,
                nPressure: sample.nPressure,
                ePressure: sample.ePressure,
                sPressure: sample.sPressure,
                wPressure: sample.wPressure
            }));
            const recentEvents = state.analytics.events.slice(-6).map(event => ({
                simTimeSec: event.simTimeSec,
                type: event.type,
                summary: event.summary
            }));

            return {
                mode,
                objective:
                    mode === "analyze"
                        ? "Summarize current traffic state and explain the main causes of congestion."
                        : mode === "forecast"
                            ? "Forecast the next 120 seconds of congestion risk and identify likely bottlenecks."
                            : "Recommend a safe signal timing adjustment that can reduce congestion in the next two minutes.",
                controller: {
                    controlMode: state.controlMode,
                    baseGreenMs: state.lightCycleTime,
                    liveTargetGreenMs: Math.round(telemetry.targetGreenMs || state.lightCycleTime),
                    autoBaseGreenMs: Math.round(telemetry.autoBaseGreenMs || state.lightCycleTime),
                    congestionBand: telemetry.congestionBand || congestionBandKey(state.metrics.congestionIndex),
                    queueSum: telemetry.totalQueue || 0,
                    activeGreen: shortLabel(trafficLights.currentDir),
                    nextCandidate: shortLabel(trafficLights.nextDir),
                    phase: trafficLights.phase
                },
                metrics: {
                    liveVehicles: state.metrics.liveVehicles,
                    throughputPerMin: state.metrics.throughputPerMin,
                    averageWaitMs: Math.round(state.metrics.averageWaitMs),
                    averageSpeedKmh: Number(state.metrics.averageSpeedKmh.toFixed(2)),
                    congestionIndex: Number(state.metrics.congestionIndex.toFixed(2)),
                    v2vLinks: state.network.v2vLinks,
                    yieldingVehicles: state.network.yieldingVehicles
                },
                corridors: DIRECTIONS.map(dir => ({
                    direction: shortLabel(dir),
                    queue: state.metrics.corridors[dir].queue,
                    approaching: state.metrics.corridors[dir].approaching,
                    incoming: state.metrics.corridors[dir].incoming,
                    waitMs: Math.round(state.metrics.corridors[dir].avgWaitMs),
                    speedKmh: Number(state.metrics.corridors[dir].avgSpeedKmh.toFixed(2)),
                    pressure: Number(state.metrics.corridors[dir].pressure.toFixed(2))
                })),
                emergency: state.activeEmergencyRequest
                    ? {
                        direction: shortLabel(state.activeEmergencyRequest.direction),
                        type: state.activeEmergencyRequest.type,
                        action: state.activeEmergencyRequest.action,
                        etaMs: Math.round(state.activeEmergencyRequest.eta),
                        score: Number(state.activeEmergencyRequest.score.toFixed(2))
                    }
                    : null,
                recentSamples,
                recentEvents,
                constraints: {
                    minGreenMs: Math.round(telemetry.minGreenMs || 0),
                    maxGreenMs: Math.round(telemetry.maxGreenMs || 0),
                    pressureImbalance: Number((telemetry.pressureImbalance || 0).toFixed(2)),
                    queueOverride: Math.round(telemetry.queueOverride || 0),
                    forcedReason: telemetry.forcedReason || "balanced_flow"
                }
            };
        }

        function normalizeAiResult(result, mode) {
            const band = ["low", "moderate", "heavy", "critical"].includes(result && result.congestionBand)
                ? result.congestionBand
                : congestionBandKey(state.metrics.congestionIndex);
            return {
                mode,
                headline: String(result && result.headline || "AI Traffic Insight"),
                summary: String(result && result.summary || "No summary returned."),
                operatorMessage: String(result && result.operatorMessage || "No operator note returned."),
                recommendedAction: String(result && result.recommendedAction || "Monitor the corridor pressures and keep adaptive mode active."),
                congestionBand: band,
                confidence: clamp(Number(result && result.confidence || 0.5), 0, 1),
                forecastSeconds: clamp(Math.round(Number(result && result.forecastSeconds || 120)), 60, 300),
                targetControlMode: result && result.targetControlMode === "fixed" ? "fixed" : result && result.targetControlMode === "keep" ? "keep" : "adaptive",
                targetBaseGreenMs: clamp(Math.round(Number(result && result.targetBaseGreenMs || state.lightCycleTime) / 500) * 500, 3000, 12000),
                targetMaxSpeedKmh: clamp(Math.round(Number(result && result.targetMaxSpeedKmh || Math.round(state.maxSpeed * 12))), 36, 120),
                enableRandomEmergencies: Boolean(result && result.enableRandomEmergencies),
                reasons: Array.isArray(result && result.reasons) && result.reasons.length
                    ? result.reasons.slice(0, 5).map(item => String(item))
                    : [
                        "Queue pressure is the strongest live signal.",
                        "Recent wait time indicates whether the controller is recovering.",
                        "Throughput helps verify whether timing changes are actually clearing vehicles."
                    ]
            };
        }

        function formatAiResult(result) {
            return [
                `${result.headline}`,
                ``,
                `Summary: ${result.summary}`,
                `Operator Note: ${result.operatorMessage}`,
                `Recommended Action: ${result.recommendedAction}`,
                `Congestion Band: ${congestionBandLabel(result.congestionBand)}`,
                `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
                `Forecast Horizon: ${result.forecastSeconds} s`,
                `Suggested Mode: ${result.targetControlMode}`,
                `Suggested Base Green: ${(result.targetBaseGreenMs / 1000).toFixed(1)} s`,
                `Suggested Speed Cap: ${result.targetMaxSpeedKmh} km/h`,
                ``,
                `Why:`,
                ...result.reasons.map(reason => `- ${reason}`)
            ].join("\n");
        }

        async function requestAiRecommendation(mode) {
            if (!smartActionsEnabled()) {
                state.ai.lastStatus = "Error: Disable Smart Actions is ON. Turn it off before requesting AI advice.";
                updateAiUi();
                return;
            }
            if (!state.ai.enabled) {
                state.ai.lastStatus = "Error: Enable the OpenAI advisor first.";
                updateAiUi();
                return;
            }
            if (!state.ai.apiKey.trim().startsWith("sk-")) {
                state.ai.lastStatus = "Error: Enter a valid OpenAI API key first.";
                updateAiUi();
                return;
            }

            const context = buildAiContext(mode);
            const systemPrompt = [
                "You are an urban traffic AI advisor for a single intelligent junction.",
                "Return only JSON that matches the schema.",
                "Be conservative and reversible when recommending signal changes.",
                "Prefer adaptive control unless fixed control is clearly better.",
                "Use the live metrics, corridor pressure, and recent trend data.",
                "If the mode is optimize, choose a base green window that can realistically reduce congestion within the next two minutes."
            ].join(" ");
            const userPrompt = JSON.stringify(context, null, 2);

            state.ai.busy = true;
            state.ai.lastMode = mode;
            state.ai.lastStatus = `Contacting OpenAI for ${mode}...`;
            updateAiUi();
            logEvent("ai_request_started", `OpenAI ${mode} request started.`, {
                mode,
                model: state.ai.model
            });
            persistAnalyticsFeed(true);

            try {
                const response = await fetch(OPENAI_RESPONSES_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${state.ai.apiKey.trim()}`
                    },
                    body: JSON.stringify({
                        model: state.ai.model,
                        store: false,
                        input: [
                            {
                                role: "system",
                                content: [{ type: "input_text", text: systemPrompt }]
                            },
                            {
                                role: "user",
                                content: [{ type: "input_text", text: userPrompt }]
                            }
                        ],
                        text: {
                            format: {
                                type: "json_schema",
                                name: "traffic_ai_response",
                                strict: true,
                                schema: buildAiResponseSchema()
                            }
                        }
                    })
                });

                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const errorMessage =
                        payload && payload.error && payload.error.message
                            ? payload.error.message
                            : `OpenAI request failed with status ${response.status}.`;
                    throw new Error(errorMessage);
                }

                const rawText = extractOpenAiResponseText(payload).trim();
                if (!rawText) {
                    throw new Error("OpenAI returned an empty response.");
                }
                const parsed = safeJsonParse(rawText);
                if (!parsed) {
                    throw new Error("OpenAI returned a response that was not valid JSON.");
                }

                const result = normalizeAiResult(parsed, mode);
                state.ai.lastPlan = mode === "optimize" ? result : state.ai.lastPlan;
                state.ai.lastOutput = formatAiResult(result);
                state.ai.lastStatus =
                    mode === "optimize"
                        ? "Ready: AI timing plan received. Review it and press Apply AI Plan if you want to use it."
                        : `Ready: AI ${mode} completed.`;
                logEvent("ai_request_completed", `OpenAI ${mode} response received.`, {
                    mode,
                    model: state.ai.model,
                    congestionBand: result.congestionBand,
                    targetBaseGreenMs: result.targetBaseGreenMs,
                    targetControlMode: result.targetControlMode
                });
            } catch (error) {
                state.ai.lastStatus = `Error: ${error.message}`;
                state.ai.lastOutput = "The OpenAI request did not complete. Check the key, browser network access, and the API response details.";
                logEvent("ai_request_failed", `OpenAI ${mode} request failed.`, {
                    mode,
                    model: state.ai.model,
                    message: error.message
                });
            } finally {
                state.ai.busy = false;
                updateAiUi();
                persistAnalyticsFeed(true);
            }
        }

        function applyAiPlan() {
            if (!smartActionsEnabled()) {
                state.ai.lastStatus = "Error: AI plans cannot be applied while smart actions are disabled.";
                updateAiUi();
                return;
            }
            const plan = state.ai.lastPlan;
            if (!plan || plan.mode !== "optimize") {
                state.ai.lastStatus = "Error: Request an AI timing plan before applying one.";
                updateAiUi();
                return;
            }

            const nextMode = plan.targetControlMode === "fixed" ? "fixed" : "adaptive";
            const nextBaseGreen = clamp(plan.targetBaseGreenMs, 3000, 12000);
            state.controlMode = nextMode;
            state.lightCycleTime = nextBaseGreen;
            document.getElementById("mode-select").value = nextMode;
            document.getElementById("cycle-time").value = String(nextBaseGreen);
            state.ai.lastStatus = "Applied: AI timing plan updated the signal strategy and base green window.";
            state.ai.lastOutput = [
                state.ai.lastOutput,
                ``,
                `Applied Plan: ${nextMode} mode with ${(nextBaseGreen / 1000).toFixed(1)} s base green.`
            ].join("\n");
            logEvent("ai_plan_applied", "OpenAI timing plan applied.", {
                controlMode: nextMode,
                baseGreenMs: nextBaseGreen,
                model: state.ai.model,
                congestionBand: plan.congestionBand
            });
            captureAnalyticsSample(true);
            updateAiUi();
        }

        function makeAnalyticsSessionId() {
            const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
            return `session-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
        }

        function buildAnalyticsSessionSummary(reason = "tick", sampleDelta = 0, eventDelta = 0) {
            return {
                id: state.analytics.sessionId,
                project: "Smart Traffic Management System",
                sessionStartedAtIso: state.analytics.sessionStartedAtIso,
                updatedAtIso: new Date().toISOString(),
                updatedAtMs: Date.now(),
                lastSimTimeSec: simTimeSeconds(),
                controlMode: state.controlMode,
                demandProfile: state.demandProfile,
                liveSamples: state.analytics.timeline.length,
                liveEvents: state.analytics.events.length,
                storedSampleCount: state.analytics.storedSampleCount + sampleDelta,
                storedEventCount: state.analytics.storedEventCount + eventDelta,
                storageStatus: state.analytics.storageStatus,
                reason
            };
        }

        function beginAnalyticsSession() {
            state.analytics.sessionId = makeAnalyticsSessionId();
            state.analytics.sessionStartedAtIso = new Date().toISOString();
            state.analytics.storedSampleCount = 0;
            state.analytics.storedEventCount = 0;
            state.analytics.nextSampleSequence = 0;
            state.analytics.nextEventSequence = 0;
            state.analytics.pendingSamples = [];
            state.analytics.pendingEvents = [];
            state.analytics.persistQueuedReason = "";
            state.analytics.persistRetryQueued = false;
            state.analytics.storageStatus = "Connecting";
            if (state.analytics.persistTimerId !== null) {
                clearTimeout(state.analytics.persistTimerId);
                state.analytics.persistTimerId = null;
            }
        }

        function openAnalyticsDatabase() {
            if (!("indexedDB" in window)) {
                return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
            }
            if (analyticsDbPromise) return analyticsDbPromise;

            analyticsDbPromise = new Promise((resolve, reject) => {
                const request = window.indexedDB.open(ANALYTICS_DB_NAME, ANALYTICS_DB_VERSION);

                request.onupgradeneeded = event => {
                    const db = event.target.result;

                    if (!db.objectStoreNames.contains(ANALYTICS_SESSION_STORE)) {
                        const sessionStore = db.createObjectStore(ANALYTICS_SESSION_STORE, { keyPath: "id" });
                        sessionStore.createIndex("updatedAtMs", "updatedAtMs", { unique: false });
                    }
                    if (!db.objectStoreNames.contains(ANALYTICS_SAMPLE_STORE)) {
                        const sampleStore = db.createObjectStore(ANALYTICS_SAMPLE_STORE, { keyPath: "id" });
                        sampleStore.createIndex("sessionId", "sessionId", { unique: false });
                        sampleStore.createIndex("sequence", "sequence", { unique: false });
                    }
                    if (!db.objectStoreNames.contains(ANALYTICS_EVENT_STORE)) {
                        const eventStore = db.createObjectStore(ANALYTICS_EVENT_STORE, { keyPath: "id" });
                        eventStore.createIndex("sessionId", "sessionId", { unique: false });
                        eventStore.createIndex("sequence", "sequence", { unique: false });
                    }
                };

                request.onsuccess = () => resolve(request.result);
                request.onerror = () => {
                    analyticsDbPromise = null;
                    reject(request.error || new Error("Unable to open analytics storage."));
                };
            });

            return analyticsDbPromise;
        }

        function waitForTransaction(transaction) {
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error || new Error("Analytics transaction failed."));
                transaction.onabort = () => reject(transaction.error || new Error("Analytics transaction was aborted."));
            });
        }

        function initializePersistentAnalytics() {
            openAnalyticsDatabase()
                .then(() => {
                    state.analytics.storageStatus = "Persistent";
                    schedulePersistentAnalyticsFlush("session_start");
                })
                .catch(error => {
                    state.analytics.storageStatus = "Storage unavailable";
                    console.warn("Permanent analytics storage is unavailable.", error);
                });
        }

        function queuePersistentEvent(entry) {
            if (!state.analytics.sessionId) return;
            state.analytics.pendingEvents.push({
                id: `${state.analytics.sessionId}-event-${state.analytics.nextEventSequence}`,
                sessionId: state.analytics.sessionId,
                sequence: state.analytics.nextEventSequence,
                payload: entry
            });
            state.analytics.nextEventSequence += 1;
            schedulePersistentAnalyticsFlush("event");
        }

        function queuePersistentSample(sample) {
            if (!state.analytics.sessionId) return;
            state.analytics.pendingSamples.push({
                id: `${state.analytics.sessionId}-sample-${state.analytics.nextSampleSequence}`,
                sessionId: state.analytics.sessionId,
                sequence: state.analytics.nextSampleSequence,
                payload: sample
            });
            state.analytics.nextSampleSequence += 1;
            schedulePersistentAnalyticsFlush("sample");
        }

        function schedulePersistentAnalyticsFlush(reason = "tick") {
            if (!state.analytics.sessionId) return;
            state.analytics.persistQueuedReason = reason;
            if (state.analytics.persistTimerId !== null) return;
            state.analytics.persistTimerId = window.setTimeout(() => {
                state.analytics.persistTimerId = null;
                const queuedReason = state.analytics.persistQueuedReason || reason;
                state.analytics.persistQueuedReason = "";
                flushPersistentAnalytics(queuedReason);
            }, 220);
        }

        async function flushPersistentAnalytics(reason = "tick") {
            if (!state.analytics.sessionId) return;
            if (state.analytics.persistInFlight) {
                state.analytics.persistRetryQueued = true;
                if (reason) state.analytics.persistQueuedReason = reason;
                return;
            }

            const queuedSamples = state.analytics.pendingSamples.splice(0);
            const queuedEvents = state.analytics.pendingEvents.splice(0);
            if (!queuedSamples.length && !queuedEvents.length && reason !== "session_start" && reason !== "summary") {
                return;
            }

            state.analytics.persistInFlight = true;
            try {
                const db = await openAnalyticsDatabase();
                const transaction = db.transaction(
                    [ANALYTICS_SESSION_STORE, ANALYTICS_SAMPLE_STORE, ANALYTICS_EVENT_STORE],
                    "readwrite"
                );
                const sessionStore = transaction.objectStore(ANALYTICS_SESSION_STORE);
                const sampleStore = transaction.objectStore(ANALYTICS_SAMPLE_STORE);
                const eventStore = transaction.objectStore(ANALYTICS_EVENT_STORE);

                for (const sample of queuedSamples) sampleStore.put(sample);
                for (const event of queuedEvents) eventStore.put(event);
                sessionStore.put(buildAnalyticsSessionSummary(reason, queuedSamples.length, queuedEvents.length));

                await waitForTransaction(transaction);
                state.analytics.storedSampleCount += queuedSamples.length;
                state.analytics.storedEventCount += queuedEvents.length;
                state.analytics.storageStatus = "Persistent";
                persistAnalyticsFeed(true);
            } catch (error) {
                state.analytics.pendingSamples = queuedSamples.concat(state.analytics.pendingSamples);
                state.analytics.pendingEvents = queuedEvents.concat(state.analytics.pendingEvents);
                state.analytics.storageStatus = "Storage unavailable";
                analyticsDbPromise = null;
                console.warn("Unable to persist analytics archive.", error);
            } finally {
                state.analytics.persistInFlight = false;
                if (state.analytics.persistRetryQueued || state.analytics.persistQueuedReason) {
                    state.analytics.persistRetryQueued = false;
                    const queuedReason = state.analytics.persistQueuedReason || "retry";
                    state.analytics.persistQueuedReason = "";
                    schedulePersistentAnalyticsFlush(queuedReason);
                }
            }
        }

        function logEvent(type, summary, details = {}) {
            const entry = {
                timestampMs: Math.round(state.time),
                simTimeSec: simTimeSeconds(),
                type,
                summary,
                details
            };
            boundedPush(state.analytics.events, entry, state.analytics.maxEvents);
            queuePersistentEvent(entry);
            return entry;
        }

        function resetAnalytics(logSeedEvent = true) {
            state.analytics.timeline = [];
            state.analytics.events = [];
            state.analytics.lastSampleAt = 0;
            state.analytics.exportedAt = null;
            state.analytics.lastPublishedAt = 0;
            if (logSeedEvent) {
                logEvent("log_reset", "Analytics log reset.", {
                    controlMode: state.controlMode,
                    demandProfile: state.demandProfile
                });
            }
            schedulePersistentAnalyticsFlush("summary");
            persistAnalyticsFeed(true);
        }

        function buildAnalyticsPayload() {
            const request = state.activeEmergencyRequest;
            const telemetry = trafficLights.telemetry || {};
            return {
                meta: {
                    project: "Smart Traffic Management System",
                    sourcePage: "simulation1.html",
                    storageKey: ANALYTICS_STORAGE_KEY,
                    updatedAtIso: new Date().toISOString(),
                    updatedAtMs: Date.now(),
                    sessionId: state.analytics.sessionId,
                    sessionStartedAtIso: state.analytics.sessionStartedAtIso,
                    simTimeSec: simTimeSeconds(),
                    sampleIntervalMs: state.analytics.sampleIntervalMs,
                    controlMode: state.controlMode,
                    demandProfile: state.demandProfile,
                    signalPhase: trafficLights.phase,
                    activeGreen: shortLabel(trafficLights.currentDir),
                    nextCandidate: shortLabel(trafficLights.nextDir),
                    aiEnabled: state.ai.enabled,
                    aiModel: state.ai.model,
                    aiLastMode: state.ai.lastMode,
                    controllerTargetGreenMs: Math.round(telemetry.targetGreenMs || state.lightCycleTime),
                    controllerAutoBaseGreenMs: Math.round(telemetry.autoBaseGreenMs || state.lightCycleTime),
                    controllerCycleMultiplier: Number(((telemetry.cycleMultiplier || 1)).toFixed(2)),
                    controllerCongestionBand: telemetry.congestionBand || congestionBandKey(state.metrics.congestionIndex),
                    priorityDirection: state.emergencyDirection === null ? "" : shortLabel(state.emergencyDirection),
                    emergencyType: request ? request.type : state.emergencyType || "",
                    emergencyAction: request ? request.action : state.emergencyAction || "",
                    storageStatus: state.analytics.storageStatus,
                    note: "Live browser feed with adaptive auto-timing telemetry and permanent system storage for the standalone traffic graph page."
                },
                snapshot: {
                    liveVehicles: state.metrics.liveVehicles,
                    throughputPerMin: state.metrics.throughputPerMin,
                    averageWaitMs: Math.round(state.metrics.averageWaitMs),
                    averageSpeedKmh: Number(state.metrics.averageSpeedKmh.toFixed(2)),
                    congestionIndex: Number(state.metrics.congestionIndex.toFixed(2)),
                    completedTrips: state.metrics.completedTrips,
                    emergencyTrips: state.metrics.emergencyTrips,
                    v2vLinks: state.network.v2vLinks,
                    yieldingVehicles: state.network.yieldingVehicles,
                    broadcasts: state.network.broadcasts,
                    storedSampleCount: state.analytics.storedSampleCount,
                    storedEventCount: state.analytics.storedEventCount
                },
                timeline: state.analytics.timeline,
                events: state.analytics.events
            };
        }

        function persistAnalyticsFeed(force = false) {
            const now = Date.now();
            if (!force && now - state.analytics.lastPublishedAt < state.analytics.publishIntervalMs) {
                return;
            }
            try {
                window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(buildAnalyticsPayload()));
                state.analytics.lastPublishedAt = now;
            } catch (error) {
                console.warn("Live analytics feed could not be stored.", error);
            }
        }

        function buildTimelineSample() {
            const request = state.activeEmergencyRequest;
            const telemetry = trafficLights.telemetry || {};
            const sample = {
                timestampMs: Math.round(state.time),
                simTimeSec: simTimeSeconds(),
                controlMode: state.controlMode,
                controllerPhase: trafficLights.phase,
                activeGreen: shortLabel(trafficLights.currentDir),
                nextCandidate: shortLabel(trafficLights.nextDir),
                demandProfile: state.demandProfile,
                demandIntensity: state.demandIntensity,
                maxSpeedKmh: Math.round(state.maxSpeed * 12),
                baseGreenMs: state.lightCycleTime,
                randomEmergencyEnabled: state.randomEmergencyEnabled,
                randomEmergencyCountdownMs: Math.round(state.randomEmergencyTimerMs),
                aiEnabled: state.ai.enabled,
                aiModel: state.ai.model,
                aiLastMode: state.ai.lastMode,
                liveVehicles: state.metrics.liveVehicles,
                throughputPerMin: state.metrics.throughputPerMin,
                averageWaitMs: Math.round(state.metrics.averageWaitMs),
                averageSpeedKmh: Number(state.metrics.averageSpeedKmh.toFixed(2)),
                congestionIndex: Number(state.metrics.congestionIndex.toFixed(2)),
                v2vLinks: state.network.v2vLinks,
                yieldingVehicles: state.network.yieldingVehicles,
                broadcasts: state.network.broadcasts,
                emergencyDirection: request ? shortLabel(request.direction) : "",
                emergencyType: request ? request.type : "",
                emergencyAction: request ? request.action : "",
                emergencyEtaMs: request ? Math.round(request.eta) : 0,
                emergencyScore: request ? Number(request.score.toFixed(2)) : 0,
                constraintMinGreenMs: Math.round(telemetry.minGreenMs || 0),
                constraintTargetGreenMs: Math.round(telemetry.targetGreenMs || 0),
                constraintMaxGreenMs: Math.round(telemetry.maxGreenMs || 0),
                constraintClearanceMs: Math.round(telemetry.clearanceMs || 0),
                constraintRequestScore: Number((telemetry.requestScore || 0).toFixed(2)),
                constraintRequestEtaMs: Math.round(telemetry.requestEtaMs || 0),
                constraintStarvationMs: Math.round(telemetry.starvationMs || 0),
                constraintQueueOverride: Math.round(telemetry.queueOverride || 0),
                constraintForcedDirection: telemetry.forcedDirection || "",
                constraintReason: telemetry.forcedReason || "balanced_flow",
                constraintPressureImbalance: Number((telemetry.pressureImbalance || 0).toFixed(2)),
                autoBaseGreenMs: Math.round(telemetry.autoBaseGreenMs || state.lightCycleTime),
                autoCycleMultiplier: Number((telemetry.cycleMultiplier || 1).toFixed(2)),
                autoCongestionBand: telemetry.congestionBand || congestionBandKey(state.metrics.congestionIndex),
                autoReliefBoostMs: Math.round(telemetry.reliefBoostMs || 0),
                autoTrimPenaltyMs: Math.round(telemetry.trimPenaltyMs || 0),
                autoPreventiveReleaseReady: Boolean(telemetry.preventiveReleaseReady),
                autoTotalQueue: Math.round(telemetry.totalQueue || 0)
            };

            for (const dir of DIRECTIONS) {
                const prefix = shortLabel(dir).toLowerCase();
                const corridor = state.metrics.corridors[dir];
                sample[`${prefix}Queue`] = corridor.queue;
                sample[`${prefix}Approaching`] = corridor.approaching;
                sample[`${prefix}Incoming`] = corridor.incoming;
                sample[`${prefix}Pressure`] = Number(corridor.pressure.toFixed(2));
                sample[`${prefix}WaitMs`] = Math.round(corridor.avgWaitMs);
                sample[`${prefix}SpeedKmh`] = Number(corridor.avgSpeedKmh.toFixed(2));
            }

            return sample;
        }

        function captureAnalyticsSample(force = false) {
            if (!force && state.time - state.analytics.lastSampleAt < state.analytics.sampleIntervalMs) {
                return;
            }
            const sample = buildTimelineSample();
            boundedPush(state.analytics.timeline, sample, state.analytics.maxSamples);
            state.analytics.lastSampleAt = state.time;
            queuePersistentSample(sample);
            persistAnalyticsFeed(true);
        }

        function csvEscape(value) {
            const text = value === null || value === undefined ? "" : String(value);
            if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
                return `"${text.replace(/"/g, "\"\"")}"`;
            }
            return text;
        }

        function toCsv(rows) {
            if (!rows.length) return "simTimeSec\n";
            const headers = Object.keys(rows[0]);
            const lines = [headers.join(",")];
            for (const row of rows) {
                lines.push(headers.map(header => csvEscape(row[header])).join(","));
            }
            return lines.join("\n");
        }

        function downloadTextFile(filename, content, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        function exportAnalytics(format) {
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const telemetry = trafficLights.telemetry || {};
            if (format === "json") {
                logEvent("export_json", "Analytics exported as JSON.", {
                    samples: state.analytics.timeline.length,
                    events: state.analytics.events.length
                });
                const payload = {
                    meta: {
                        project: "Smart Traffic Management System",
                        exportedAtIso: new Date().toISOString(),
                        sessionId: state.analytics.sessionId,
                        controlMode: state.controlMode,
                        demandProfile: state.demandProfile,
                        aiEnabled: state.ai.enabled,
                        aiModel: state.ai.model,
                        aiLastMode: state.ai.lastMode,
                        controllerTargetGreenMs: Math.round(telemetry.targetGreenMs || state.lightCycleTime),
                        controllerAutoBaseGreenMs: Math.round(telemetry.autoBaseGreenMs || state.lightCycleTime),
                        controllerCycleMultiplier: Number(((telemetry.cycleMultiplier || 1)).toFixed(2)),
                        controllerCongestionBand: telemetry.congestionBand || congestionBandKey(state.metrics.congestionIndex),
                        storageStatus: state.analytics.storageStatus,
                        note: "Timeline samples include constraints, adaptive auto-timing results, and persistent archive context for graph visualization."
                    },
                    timeline: state.analytics.timeline,
                    events: state.analytics.events
                };
                downloadTextFile(`traffic-analytics-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
            } else {
                logEvent("export_csv", "Analytics exported as CSV.", {
                    samples: state.analytics.timeline.length
                });
                downloadTextFile(`traffic-analytics-${stamp}.csv`, toCsv(state.analytics.timeline), "text/csv");
            }
            state.analytics.exportedAt = simTimeSeconds();
            schedulePersistentAnalyticsFlush("export");
            persistAnalyticsFeed(true);
        }

        function roundedRect(x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
        }

        class DisciplineManager {
            isActive() {
                return smartActionsEnabled();
            }

            normalizeRouteChoice(routeChoice) {
                if (routeChoice === "left") return "free_left";
                if (routeChoice === "free_left" || routeChoice === "right" || routeChoice === "straight") {
                    return routeChoice;
                }
                return "straight";
            }

            laneAllowsTurn(lane, turnKind) {
                if (turnKind === "free_left") return lane === 0;
                if (turnKind === "right") return lane === 1;
                return true;
            }

            normalizeRouteForLane(routeChoice, lane) {
                const normalized = this.normalizeRouteChoice(routeChoice);
                if (normalized === "free_left" && lane !== 0) return "straight";
                if (normalized === "right" && lane !== 1) return "straight";
                return normalized;
            }

            ruleSummary() {
                return this.isActive()
                    ? "Strict L0: Straight/Left | L1: Straight/Right"
                    : "Bypassed";
            }

            enforceLaneDiscipline(vehicle) {
                if (vehicle.state !== "STRAIGHT") return;
                if (this.isActive()) {
                    vehicle.routeChoice = this.normalizeRouteForLane(vehicle.routeChoice, vehicle.lane);
                } else {
                    vehicle.routeChoice = this.normalizeRouteChoice(vehicle.routeChoice);
                }
                this.alignHeading(vehicle, 0.24);
            }

            canStartTurn(vehicle, turnKind, context = {}) {
                if (vehicle.state !== "STRAIGHT") return false;
                const expectedRoute = turnKind === "right" ? "right" : "free_left";
                if (this.normalizeRouteChoice(vehicle.routeChoice) !== expectedRoute) return false;
                if (!this.laneAllowsTurn(vehicle.lane, turnKind)) return false;
                if (!context.pathClear || context.blocked) return false;
                if (context.effectiveLight !== LIGHT.GREEN) return false;
                if (context.junctionConflict) return false;

                if (!this.isActive()) return true;

                const flow = currentFlowMode();
                const freeFlow = Math.max(1.15, Number(context.freeFlow) || state.maxSpeed);
                const maxEntrySpeed = Math.max(
                    1.05,
                    freeFlow * (turnKind === "right" ? 0.64 : 0.58) * flow.turnCapScale
                );
                if (vehicle.speed > maxEntrySpeed) return false;
                if (!Number.isFinite(context.distToEntry)) return false;
                return context.distToEntry > -2;
            }

            alignHeading(vehicle, strength = 0.2) {
                let delta = vehicle.targetAngle - vehicle.angle;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                vehicle.angle += delta * clamp(strength, 0.05, 0.9);
            }

            shouldApplyRandomStop(vehicle, distToStop) {
                return this.isActive() && vehicle.canApplyRandomStop(distToStop);
            }

            getLaneBlend(vehicle) {
                const flow = currentFlowMode();
                if (!this.isActive()) {
                    return vehicle.yielding ? 0.12 : 0.18;
                }
                const speedNorm = clamp(vehicle.speed / Math.max(2.2, state.maxSpeed), 0, 1);
                const base = vehicle.yielding ? 0.09 : 0.14;
                return clamp((base - speedNorm * 0.05) * flow.junctionCautionScale, 0.06, 0.18);
            }

            computeTargetSpeed(vehicle, context) {
                if (!this.isActive()) return Math.max(0, context.targetSpeed);
                const flow = currentFlowMode();

                const corridor = state.metrics.corridors[vehicle.direction];
                const queueLoad = corridor ? clamp(corridor.queue / 8, 0, 1) : 0;
                const pressureLoad = corridor ? clamp(corridor.pressure / 18, 0, 1) : 0;
                const approachLoad = corridor ? clamp(corridor.approaching / 8, 0, 1) : 0;
                const loadIndex = clamp(queueLoad * 0.5 + pressureLoad * 0.32 + approachLoad * 0.18, 0, 1);

                let target = Math.max(0, context.targetSpeed);
                const congestionCap = context.freeFlow * clamp(1 - loadIndex * (0.34 * flow.junctionCautionScale), 0.48, 1.02);
                target = Math.min(target, congestionCap);

                if (context.distToStop > 0 && context.distToStop < 250) {
                    if (context.effectiveLight === LIGHT.RED) {
                        const redApproachFactor = clamp((context.distToStop - 8) / (170 * flow.junctionCautionScale), 0.04, 1);
                        target = Math.min(target, context.freeFlow * redApproachFactor);
                    } else if (context.effectiveLight === LIGHT.YELLOW) {
                        const yellowApproachFactor = clamp((context.distToStop + 12) / (160 * flow.junctionCautionScale), 0.2, 1);
                        target = Math.min(target, context.freeFlow * yellowApproachFactor);
                    } else if (context.effectiveLight === LIGHT.GREEN && loadIndex > 0.58 && context.distToStop < 95) {
                        target = Math.min(target, context.freeFlow * clamp(0.62 + (1 - loadIndex) * 0.45, 0.5, 0.92));
                    }
                }

                if (vehicle.state === "TURNING") {
                    const turnCap = context.freeFlow * (vehicle.turnKind === "right" ? 0.8 : 0.86) * flow.turnCapScale;
                    target = Math.min(target, turnCap);
                }
                if (vehicle.priority) {
                    target = Math.max(target, context.freeFlow * 0.66);
                }
                return Math.max(0, target);
            }

            smoothSpeed(vehicle, targetSpeed, step) {
                const target = Math.max(0, targetSpeed);
                if (!this.isActive()) return target;
                const flow = currentFlowMode();
                const accelStep = (vehicle.accel * 1.2 + 0.06) * step * flow.reactionScale;
                const brakeStep = (config.brakeDecel * (vehicle.priority ? 2.0 : 2.65)) * step * flow.reactionScale;
                if (target >= vehicle.speed) {
                    return Math.min(target, vehicle.speed + accelStep);
                }
                return Math.max(target, vehicle.speed - brakeStep);
            }
        }

        class TrafficController {
            constructor() {
                this.lights = {};
                this.phase = "green";
                this.timer = 0;
                this.currentDir = DIR.NORTH;
                this.pairedDir = null;
                this.seqIndex = 0;
                this.nextDir = DIR.EAST;
                this.lastServed = {};
                this.clearanceDuration = 0;
                this.telemetry = {
                    minGreenMs: 2600,
                    targetGreenMs: state.lightCycleTime,
                    autoBaseGreenMs: state.lightCycleTime,
                    maxGreenMs: 16000,
                    clearanceMs: 0,
                    requestScore: 0,
                    requestEtaMs: 0,
                    starvationMs: 0,
                    queueOverride: 0,
                    forcedDirection: "",
                    forcedReason: "balanced_flow",
                    pressureImbalance: 0,
                    cycleMultiplier: 1,
                    congestionBand: "low",
                    reliefBoostMs: 0,
                    trimPenaltyMs: 0,
                    preventiveReleaseReady: false,
                    totalQueue: 0
                };
                for (const dir of DIRECTIONS) {
                    this.lights[dir] = dir === this.currentDir ? LIGHT.GREEN : LIGHT.RED;
                    this.lastServed[dir] = 0;
                }
            }

            setAllRed() {
                for (const dir of DIRECTIONS) {
                    this.lights[dir] = LIGHT.RED;
                }
            }

            activate(
                direction,
                corridors,
                request,
                constraints = this.evaluateConstraints(corridors, request),
                timingPlan = this.buildTimingPlan(direction, corridors, request, constraints)
            ) {
                this.currentDir = direction;
                this.pairedDir = null;
                this.phase = "green";
                this.timer = 0;
                this.lastServed[direction] = state.time;
                for (const dir of DIRECTIONS) {
                    this.lights[dir] = dir === direction ? LIGHT.GREEN : LIGHT.RED;
                }
                this.nextDir = this.chooseNext(direction, corridors, request, constraints);

                if (request && request.direction === direction) {
                    state.network.controlNote =
                        `${emergencyLabel(request.type)} granted ${actionLabel(request.action).toLowerCase()} on the ${shortLabel(direction).toLowerCase()} corridor.`;
                } else if (constraints.forcedDirection === direction && constraints.reason !== "balanced_flow") {
                    state.network.controlNote =
                        `${constraintReasonLabel(constraints.reason)} selected the ${shortLabel(direction).toLowerCase()} corridor to protect fairness and queue stability.`;
                } else if (adaptiveControllerActive()) {
                    state.network.controlNote =
                        `Adaptive auto-timing is serving the ${shortLabel(direction).toLowerCase()} corridor with a ${congestionBandLabel(timingPlan.congestionBand).toLowerCase()} congestion plan.`;
                } else {
                    state.network.controlNote = defaultControlNote();
                }

                logEvent("signal_green", `Green granted to ${shortLabel(direction)} corridor.`, {
                    direction: shortLabel(direction),
                    requestType: request ? request.type : "",
                    requestAction: request ? request.action : "",
                    targetGreenMs: Math.round(this.greenWindow(direction, corridors, request, constraints, timingPlan)),
                    autoBaseGreenMs: Math.round(
                        adaptiveControllerActive() ? timingPlan.autoBaseGreenMs : state.lightCycleTime
                    ),
                    cycleMultiplier: adaptiveControllerActive() ? Number(timingPlan.cycleMultiplier.toFixed(2)) : 1,
                    congestionBand: adaptiveControllerActive()
                        ? timingPlan.congestionBand
                        : congestionBandKey(state.metrics.congestionIndex),
                    constraintReason: constraints.reason,
                    maxGreenMs: Math.round(
                        adaptiveControllerActive() ? timingPlan.maxGreenMs : state.lightCycleTime
                    )
                });
            }

            clearanceHold(request) {
                if (!request || request.direction === this.currentDir) return 0;
                return getActionProfile(request.action).allRed;
            }

            evaluateConstraints(corridors, request) {
                const summary = summarizeCorridors(corridors);
                const context = {
                    forcedDirection: null,
                    reason: "balanced_flow",
                    maxGreenMs: request ? 17500 : 14500,
                    maxStarvationMs: 0,
                    queueOverride: 0,
                    pressureImbalance: 0
                };
                let bestScore = -Infinity;
                if (summary.totalQueue >= 10 || summary.maxPressure >= 14) {
                    context.maxGreenMs += 900;
                }
                if (summary.totalQueue >= 14 || summary.maxPressure >= 17) {
                    context.maxGreenMs += 900;
                }

                for (const dir of DIRECTIONS) {
                    const corridor = corridors[dir];
                    const starvationMs = state.time - this.lastServed[dir];
                    const queueCritical = corridor.queue >= 5;
                    const spillbackRisk = corridor.queue >= 7 || corridor.pressure >= 15.5;
                    const starvationRisk = starvationMs >= 18000 && corridor.approaching > 0;
                    context.maxStarvationMs = Math.max(context.maxStarvationMs, starvationMs);
                    if (!queueCritical && !spillbackRisk && !starvationRisk) continue;

                    let score =
                        corridor.pressure +
                        corridor.queue * 1.7 +
                        corridor.incoming * 0.5 +
                        starvationMs / 3200;
                    if (queueCritical) score += 2.5;
                    if (spillbackRisk) score += 5.5;
                    if (starvationRisk) score += 6.5;

                    if (score > bestScore) {
                        bestScore = score;
                        context.forcedDirection = dir;
                        context.queueOverride = corridor.queue;
                        context.reason = spillbackRisk
                            ? "spillback_protection"
                            : starvationRisk
                                ? "starvation_protection"
                                : "queue_override";
                    }
                }

                context.pressureImbalance = summary.pressureSpread;
                if (request) {
                    context.forcedDirection = request.direction;
                    context.reason = "emergency_preemption";
                } else if (context.reason === "spillback_protection") {
                    context.maxGreenMs = 18000;
                }

                return context;
            }

            buildTimingPlan(dir, corridors, request, constraints = this.evaluateConstraints(corridors, request)) {
                const corridor = corridors[dir];
                const summary = summarizeCorridors(corridors);
                const congestionIndex = state.metrics.congestionIndex ||
                    clamp(summary.totalQueue * 8 + summary.totalIncoming * 2.5 + summary.maxPressure * 2.8, 0, 100);
                const congestionBand = congestionBandKey(congestionIndex);
                const congestionFactor = clamp(congestionIndex / 100, 0, 1);
                const queueFactor = clamp(summary.totalQueue / 18, 0, 1);
                const arrivalFactor = clamp(summary.totalIncoming / 16, 0, 1);
                const imbalanceFactor = clamp(summary.pressureSpread / 12, 0, 1);
                const cycleMultiplier = clamp(
                    0.8 +
                    congestionFactor * 0.44 +
                    queueFactor * 0.34 +
                    arrivalFactor * 0.16 +
                    imbalanceFactor * 0.14,
                    0.72,
                    1.72
                );
                const autoBaseGreenMs = clamp(state.lightCycleTime * cycleMultiplier, 2600, 13000);
                const reliefBoostMs = clamp(
                    corridor.queue * 470 +
                    corridor.approaching * 160 +
                    corridor.incoming * 110 +
                    corridor.avgWaitMs * 0.18 +
                    Math.max(0, corridor.pressure - summary.avgPressure) * 520 +
                    corridor.priorityCount * 420,
                    0,
                    10800
                );
                const trimPenaltyMs = clamp(
                    Math.max(0, summary.avgPressure - corridor.pressure) * 180 +
                    Math.max(0, summary.maxPressure - corridor.pressure - 1.4) * 140,
                    0,
                    autoBaseGreenMs * 0.34
                );
                const minGreenMs =
                    constraints.forcedDirection === dir && constraints.reason !== "balanced_flow"
                        ? 3200
                        : congestionBand === "critical" || corridor.queue >= 6
                            ? 3000
                            : congestionBand === "heavy" || corridor.queue >= 4
                                ? 2800
                                : 2400;
                const maxGreenMs = clamp(
                    Math.max(constraints.maxGreenMs, autoBaseGreenMs + 2600 + corridor.queue * 560),
                    minGreenMs + 1800,
                    request ? 22000 : 20500
                );

                return {
                    congestionBand,
                    cycleMultiplier,
                    autoBaseGreenMs,
                    reliefBoostMs,
                    trimPenaltyMs,
                    minGreenMs,
                    maxGreenMs,
                    totalQueue: summary.totalQueue,
                    pressureSpread: summary.pressureSpread
                };
            }

            chooseNext(current, corridors, request, constraints = this.evaluateConstraints(corridors, request)) {
                if (!adaptiveControllerActive()) return DIRECTIONS[(this.seqIndex + 1) % DIRECTIONS.length];
                if (constraints.forcedDirection !== null) return constraints.forcedDirection;
                let best = DIRECTIONS[0];
                let bestScore = -Infinity;
                for (const dir of DIRECTIONS) {
                    const corridor = corridors[dir];
                    const starvation = Math.min(4.5, (state.time - this.lastServed[dir]) / 5000);
                    let score =
                        corridor.pressure +
                        corridor.incoming * 0.65 +
                        corridor.queue * 1.35 +
                        corridor.approaching * 0.55 +
                        corridor.avgWaitMs / 2400 +
                        starvation +
                        corridor.priorityCount * 2.5;
                    if (dir === current) score -= 5.2;
                    if (request && request.direction === dir) {
                        const etaBoost = clamp(12 - request.eta / 900, 0, 12);
                        score += request.score + etaBoost;
                    }
                    if (score > bestScore) {
                        best = dir;
                        bestScore = score;
                    }
                }
                return best;
            }

            greenWindow(
                dir,
                corridors,
                request,
                constraints = this.evaluateConstraints(corridors, request),
                timingPlan = this.buildTimingPlan(dir, corridors, request, constraints)
            ) {
                if (!adaptiveControllerActive()) return state.lightCycleTime;
                const c = corridors[dir];
                const minGreen = timingPlan.minGreenMs;
                let duration =
                    timingPlan.autoBaseGreenMs +
                    timingPlan.reliefBoostMs -
                    timingPlan.trimPenaltyMs;
                if (request && request.direction === dir) {
                    duration +=
                        getActionProfile(request.action).greenBonus +
                        getEmergencyProfile(request.type).controllerBoost * 90;
                }
                if (constraints.forcedDirection === dir) {
                    if (constraints.reason === "queue_override") duration += 900;
                    if (constraints.reason === "starvation_protection") duration += 1200;
                    if (constraints.reason === "spillback_protection") duration += 1800;
                }
                if (timingPlan.congestionBand === "critical" && c.queue >= 5) duration += 700;
                if (c.queue >= 7 || c.avgWaitMs > 6500) duration += 1200;
                if (timingPlan.congestionBand === "low" && c.queue <= 1 && c.avgWaitMs < 1400) duration -= 260;
                return clamp(duration, minGreen, timingPlan.maxGreenMs);
            }

            shouldReleaseEarly(corridors, constraints, request, timingPlan, minGreen, targetGreen) {
                if (!adaptiveControllerActive()) return false;
                if (request && request.direction === this.currentDir) return false;
                if (this.nextDir === this.currentDir) return false;
                if (
                    constraints.reason !== "balanced_flow" &&
                    constraints.forcedDirection === this.currentDir
                ) return false;

                const current = corridors[this.currentDir];
                const next = corridors[this.nextDir];
                if (!next) return false;

                const servedEnough = this.timer >= Math.max(minGreen + 450, targetGreen * 0.56);
                const currentSettled =
                    current.queue <= 1 &&
                    current.approaching <= 2 &&
                    current.avgWaitMs < 2600;
                const nextUrgent =
                    next.queue >= current.queue + 2 ||
                    next.pressure >= current.pressure + 2.4 ||
                    next.avgWaitMs >= current.avgWaitMs + 1800 ||
                    constraints.forcedDirection === this.nextDir;
                const heavyNetwork =
                    timingPlan.congestionBand === "heavy" ||
                    timingPlan.congestionBand === "critical" ||
                    timingPlan.totalQueue >= 8;

                return servedEnough && currentSettled && nextUrgent && heavyNetwork;
            }

            update(dt, corridors) {
                const request = state.activeEmergencyRequest;
                this.timer += dt;
                const constraints = this.evaluateConstraints(corridors, request);
                this.nextDir = this.chooseNext(this.currentDir, corridors, request, constraints);
                const timingPlan = this.buildTimingPlan(this.currentDir, corridors, request, constraints);
                const minGreen =
                    request && request.direction !== this.currentDir
                        ? Math.max(2000, timingPlan.minGreenMs - 200)
                        : timingPlan.minGreenMs;
                const targetGreen = this.greenWindow(this.currentDir, corridors, request, constraints, timingPlan);
                const preventiveRelease = this.shouldReleaseEarly(corridors, constraints, request, timingPlan, minGreen, targetGreen);
                this.telemetry = {
                    minGreenMs: minGreen,
                    targetGreenMs: targetGreen,
                    autoBaseGreenMs: adaptiveControllerActive() ? timingPlan.autoBaseGreenMs : state.lightCycleTime,
                    maxGreenMs: adaptiveControllerActive() ? timingPlan.maxGreenMs : state.lightCycleTime,
                    clearanceMs: this.clearanceHold(request),
                    requestScore: request ? request.score : 0,
                    requestEtaMs: request ? request.eta : 0,
                    starvationMs: constraints.maxStarvationMs,
                    queueOverride: constraints.queueOverride,
                    forcedDirection: constraints.forcedDirection === null ? "" : shortLabel(constraints.forcedDirection),
                    forcedReason: constraints.reason,
                    pressureImbalance: constraints.pressureImbalance,
                    cycleMultiplier: adaptiveControllerActive() ? Number(timingPlan.cycleMultiplier.toFixed(2)) : 1,
                    congestionBand: adaptiveControllerActive()
                        ? timingPlan.congestionBand
                        : congestionBandKey(state.metrics.congestionIndex),
                    reliefBoostMs: adaptiveControllerActive() ? Math.round(timingPlan.reliefBoostMs) : 0,
                    trimPenaltyMs: adaptiveControllerActive() ? Math.round(timingPlan.trimPenaltyMs) : 0,
                    preventiveReleaseReady: preventiveRelease,
                    totalQueue: timingPlan.totalQueue
                };

                if (this.phase === "green") {
                    const preempt =
                        adaptiveControllerActive() &&
                        request &&
                        request.direction !== this.currentDir &&
                        this.timer > minGreen &&
                        request.score > corridors[this.currentDir].pressure + 2;
                    const forcedSwitch =
                        adaptiveControllerActive() &&
                        constraints.forcedDirection !== null &&
                        constraints.forcedDirection !== this.currentDir &&
                        constraints.reason !== "balanced_flow" &&
                        this.timer > minGreen;

                    if (this.timer >= targetGreen || preempt || forcedSwitch || preventiveRelease) {
                        this.phase = "yellow";
                        this.lights[this.currentDir] = LIGHT.YELLOW;
                        this.timer = 0;
                        logEvent("signal_yellow", `Yellow started on ${shortLabel(this.currentDir)} corridor.`, {
                            direction: shortLabel(this.currentDir),
                            preempt,
                            forcedSwitch,
                            preventiveRelease,
                            nextCandidate: shortLabel(this.nextDir),
                            minGreenMs: minGreen,
                            targetGreenMs: Math.round(this.telemetry.targetGreenMs),
                            autoBaseGreenMs: Math.round(this.telemetry.autoBaseGreenMs),
                            cycleMultiplier: this.telemetry.cycleMultiplier,
                            congestionBand: this.telemetry.congestionBand,
                            maxGreenMs: Math.round(this.telemetry.maxGreenMs),
                            constraintReason: constraints.reason
                        });

                        if (preempt) {
                            state.network.controlNote =
                                `Pre-clearing the junction for ${emergencyLabel(request.type).toLowerCase()} access from the ${shortLabel(request.direction).toLowerCase()} corridor.`;
                        } else if (preventiveRelease) {
                            state.network.controlNote =
                                `Predictive auto-timing is releasing the ${shortLabel(this.currentDir).toLowerCase()} corridor early to prevent queue growth on the ${shortLabel(this.nextDir).toLowerCase()} corridor.`;
                        } else if (forcedSwitch) {
                            state.network.controlNote =
                                `${constraintReasonLabel(constraints.reason)} is switching service toward the ${shortLabel(this.nextDir).toLowerCase()} corridor.`;
                        }
                    }
                } else if (this.phase === "yellow") {
                    if (this.timer >= config.yellowTime) {
                        const clearance = this.clearanceHold(request);
                        if (clearance > 0) {
                            this.phase = "all-red";
                            this.clearanceDuration = clearance;
                            this.timer = 0;
                            this.setAllRed();
                            state.network.controlNote = "All-red clearance is active so the emergency corridor can be isolated safely.";
                            logEvent("signal_all_red", "All-red clearance activated for emergency isolation.", {
                                durationMs: clearance,
                                requestType: request ? request.type : "",
                                requestAction: request ? request.action : ""
                            });
                        } else {
                            const next = this.chooseNext(this.currentDir, corridors, request, constraints);
                            this.seqIndex = DIRECTIONS.indexOf(next);
                            this.activate(next, corridors, request, constraints, this.buildTimingPlan(next, corridors, request, constraints));
                        }
                    }
                } else if (this.phase === "all-red" && this.timer >= this.clearanceDuration) {
                    const next = this.chooseNext(this.currentDir, corridors, request, constraints);
                    this.seqIndex = DIRECTIONS.indexOf(next);
                    this.activate(next, corridors, request, constraints, this.buildTimingPlan(next, corridors, request, constraints));
                }
            }

            getLight(direction) {
                return this.lights[direction];
            }
        }

        class Vehicle {
            constructor(direction, lane, options = {}) {
                this.id = Math.random().toString(36).slice(2, 11);
                this.direction = direction;
                this.originDirection = direction;
                this.lane = lane;
                this.emergencyType = options.emergencyType || null;
                this.emergencyAction = options.emergencyAction || null;
                this.priority = Boolean(this.emergencyType || options.priority);
                this.emergencyProfile = this.priority && this.emergencyType ? getEmergencyProfile(this.emergencyType) : null;
                this.width = config.carWidth;
                this.length = config.carLength + (Math.random() * 8 - 4) + (this.emergencyProfile ? this.emergencyProfile.sizeBonus : 0);
                this.color = this.priority
                    ? (this.emergencyProfile ? this.emergencyProfile.color : "#fbbf24")
                    : COLORS.cars[Math.floor(Math.random() * COLORS.cars.length)];
                this.roofColor = this.emergencyProfile ? this.emergencyProfile.roof : null;
                this.state = "STRAIGHT";
                const flow = currentFlowMode();
                this.routeChoice = options.routeChoice || (
                    this.priority
                        ? "straight"
                        : lane === 0
                            ? (Math.random() < 0.34 ? "free_left" : "straight")
                            : (Math.random() < 0.26 ? "right" : "straight")
                );
                this.routeChoice = this.routeChoice === "left" ? "free_left" : this.routeChoice;
                if (this.routeChoice !== "free_left" && this.routeChoice !== "right" && this.routeChoice !== "straight") {
                    this.routeChoice = "straight";
                }
                if ((this.routeChoice === "free_left" && lane !== 0) || (this.routeChoice === "right" && lane !== 1)) {
                    this.routeChoice = "straight";
                }
                this.turnKind = "";
                this.turnRadius = 16;
                this.turnTargetDirection = null;
                this.angle = this.targetAngle;
                this.driverProfile = this.priority
                    ? 0.98 + Math.random() * 0.34
                    : 0.7 + Math.random() * 0.56;
                this.speedFactor = this.driverProfile;
                if (lane === 0) this.speedFactor *= 0.9;
                if (this.emergencyProfile) this.speedFactor *= this.emergencyProfile.speedBonus;
                this.followGap = (config.safeDistance + 8 + Math.random() * 28 + (lane === 0 ? 6 : 0)) * flow.gapScale;
                this.headwayFactor = this.priority ? 2.9 + Math.random() * 0.8 : 3.4 + Math.random() * 1.8;
                if (this.priority) this.followGap *= 0.82;
                this.speed = Math.max(
                    0.7,
                    state.maxSpeed * flow.cruiseScale * this.speedFactor * (this.priority ? 0.62 + Math.random() * 0.24 : 0.28 + Math.random() * 0.42)
                );
                this.accel = (config.accelRate * (0.9 + Math.random() * 0.7) + (this.priority ? 0.03 : 0)) * flow.reactionScale;
                this.waitTimeMs = 0;
                this.travelTimeMs = 0;
                this.turnProgress = 0;
                this.stopLineDist = config.roadWidth / 2 + 10;
                this.commLinks = 0;
                this.yielding = false;
                this.yieldMode = null;
                this.signalUrgency = 0;
                this.yieldOffset = 0;
                this.yieldOffsetTarget = 0;
                this.entryOffset = this.priority ? Math.random() * 18 : 12 + Math.random() * 96;
                this.behaviorTimerMs = 0;
                this.randomStopTimerMs = 0;
                this.randomStopCooldownMs = 900 + Math.random() * 2800;
                this.dynamicCruiseFactor = 1;
                this.dynamicGapOffset = 0;
                this.dynamicAccelFactor = 1;
                this.brakeBias = 1;
                this.randomizeTravelProfile(true);

                const offset = (config.lanesPerDir - lane - 0.5) * config.laneWidth;
                if (direction === DIR.EAST) { this.x = -this.length - this.entryOffset; this.y = state.cy - offset; }
                if (direction === DIR.WEST) { this.x = state.width + this.length + this.entryOffset; this.y = state.cy + offset; }
                if (direction === DIR.SOUTH) { this.x = state.cx + offset; this.y = -this.length - this.entryOffset; }
                if (direction === DIR.NORTH) { this.x = state.cx - offset; this.y = state.height + this.length + this.entryOffset; }
            }

            get targetAngle() {
                if (this.direction === DIR.EAST) return 0;
                if (this.direction === DIR.WEST) return Math.PI;
                if (this.direction === DIR.SOUTH) return Math.PI / 2;
                return -Math.PI / 2;
            }

            getPos() {
                if (this.state === "TURNING") {
                    return this.getStopLinePos() + this.turnProgress * ((Math.PI / 2) * (this.turnRadius || 16));
                }
                if (this.direction === DIR.EAST) return this.x;
                if (this.direction === DIR.WEST) return -this.x;
                if (this.direction === DIR.SOUTH) return this.y;
                return -this.y;
            }

            getStopLinePos() {
                if (this.direction === DIR.EAST) return state.cx - this.stopLineDist;
                if (this.direction === DIR.WEST) return -(state.cx + this.stopLineDist);
                if (this.direction === DIR.SOUTH) return state.cy - this.stopLineDist;
                return -(state.cy + this.stopLineDist);
            }

            setApproachPos(pos) {
                if (this.direction === DIR.EAST) this.x = pos;
                else if (this.direction === DIR.WEST) this.x = -pos;
                else if (this.direction === DIR.SOUTH) this.y = pos;
                else this.y = -pos;
            }

            getLaneOffset(lane = this.lane) {
                return (config.lanesPerDir - lane - 0.5) * config.laneWidth;
            }

            getLaneCenterPoint(direction, lane, alongPos) {
                const offset = this.getLaneOffset(lane);
                if (direction === DIR.EAST) return { x: alongPos, y: state.cy - offset };
                if (direction === DIR.WEST) return { x: -alongPos, y: state.cy + offset };
                if (direction === DIR.SOUTH) return { x: state.cx + offset, y: alongPos };
                return { x: state.cx - offset, y: -alongPos };
            }

            getLaneCenterCoord(direction = this.direction, lane = this.lane) {
                const offset = this.getLaneOffset(lane);
                if (direction === DIR.EAST) return { axis: "y", value: state.cy - offset };
                if (direction === DIR.WEST) return { axis: "y", value: state.cy + offset };
                if (direction === DIR.SOUTH) return { axis: "x", value: state.cx + offset };
                return { axis: "x", value: state.cx - offset };
            }

            isInJunctionZone(margin = 18) {
                return (
                    Math.abs(this.x - state.cx) <= config.roadWidth / 2 + margin &&
                    Math.abs(this.y - state.cy) <= config.roadWidth / 2 + margin
                );
            }

            getTurnGeometry(turnKind = this.turnKind) {
                const origin = this.origDir ?? this.direction;
                const startLane = turnKind === "right" ? 1 : 0;
                const startAlong = turnKind === "right" ? this.getRightTurnEntryPos() : this.getFreeTurnEntryPos();
                const start = this.getLaneCenterPoint(origin, startLane, startAlong);
                const end = turnKind === "right" ? this.getRightTurnMergePoint() : this.getFreeTurnMergePoint();
                const horizontalEntry = origin === DIR.EAST || origin === DIR.WEST;
                const control = horizontalEntry
                    ? { x: end.x, y: start.y }
                    : { x: start.x, y: end.y };
                return { start, control, end };
            }

            getFreeTurnTargetDirection() {
                const baseDirection = this.originDirection ?? this.direction;
                if (baseDirection === DIR.EAST) return DIR.NORTH;
                if (baseDirection === DIR.WEST) return DIR.SOUTH;
                if (baseDirection === DIR.NORTH) return DIR.WEST;
                return DIR.EAST;
            }

            getFreeTurnEntryPos() {
                return this.getStopLinePos() + (this.stopLineDist - config.roadWidth / 2);
            }

            beginFreeTurn(entryPos = this.getFreeTurnEntryPos()) {
                this.turnKind = "free_left";
                this.turnRadius = Math.max(18, config.laneWidth * 0.56);
                this.turnTargetDirection = this.getFreeTurnTargetDirection();
                this.setApproachPos(entryPos);
                this.state = "TURNING";
                this.turnProgress = 0;
                this.origDir = this.direction;
                this.angle = this.targetAngle;
            }

            getRightTurnTargetDirection() {
                const baseDirection = this.originDirection ?? this.direction;
                if (baseDirection === DIR.EAST) return DIR.SOUTH;
                if (baseDirection === DIR.WEST) return DIR.NORTH;
                if (baseDirection === DIR.NORTH) return DIR.EAST;
                return DIR.WEST;
            }

            getRightTurnEntryPos() {
                return this.getFreeTurnEntryPos();
            }

            beginRightTurn(entryPos = this.getRightTurnEntryPos()) {
                this.turnKind = "right";
                this.turnRadius = Math.max(82, config.laneWidth * 2.05);
                this.turnTargetDirection = this.getRightTurnTargetDirection();
                this.setApproachPos(entryPos);
                this.state = "TURNING";
                this.turnProgress = 0;
                this.origDir = this.direction;
                this.angle = this.targetAngle;
            }

            getFreeTurnMergePoint() {
                const target = this.getFreeTurnTargetDirection();
                const exitLane = 0;
                const alongPos = this.getDirectionPosFromPoint(target, {
                    x: state.cx,
                    y: state.cy
                }) + config.laneWidth * 2;
                return this.getLaneCenterPoint(target, exitLane, alongPos);
            }

            getRightTurnMergePoint() {
                const target = this.getRightTurnTargetDirection();
                const exitLane = 1;
                const alongPos = this.getDirectionPosFromPoint(target, {
                    x: state.cx,
                    y: state.cy
                }) + config.laneWidth * 2;
                return this.getLaneCenterPoint(target, exitLane, alongPos);
            }

            getDirectionPosFromPoint(direction, point) {
                if (direction === DIR.EAST) return point.x;
                if (direction === DIR.WEST) return -point.x;
                if (direction === DIR.SOUTH) return point.y;
                return -point.y;
            }

            isFreeLeftBlocked() {
                if (this.routeChoice !== "free_left" || this.lane !== 0 || this.state !== "STRAIGHT") return false;
                
                const mergePoint = this.getFreeTurnMergePoint();
                const targetDirection = this.getFreeTurnTargetDirection();
                const mergePos = this.getDirectionPosFromPoint(targetDirection, mergePoint);
                const frontGap = Math.max(config.safeDistance + 12, this.followGap * 0.54 + this.length * 0.22);
                const rearGap = Math.max(14, config.safeDistance * 0.45 + this.length * 0.16);

                for (const other of state.vehicles) {
                    if (other.id === this.id || other.state === "DONE") continue;

                    const dx = other.x - mergePoint.x;
                    const dy = other.y - mergePoint.y;
                    const mergeDistance = Math.sqrt(dx * dx + dy * dy);

                    if (other.direction === targetDirection && other.lane === 0) {
                        const relativePos = other.getPos() - mergePos;
                        if (relativePos > -rearGap && relativePos < frontGap) {
                            return true;
                        }
                        continue;
                    }

                    if (other.state === "TURNING") {
                        const sameTarget =
                            typeof other.getFreeTurnTargetDirection === "function" &&
                            other.getFreeTurnTargetDirection() === targetDirection;
                        const turnBuffer = sameTarget ? config.carLength * 1.12 : config.carLength * 0.92;
                        if (mergeDistance < turnBuffer && (!sameTarget || other.turnProgress < 0.84)) {
                            return true;
                        }
                    }
                }

                return false;
            }

            isRightTurnBlocked() {
                if (this.routeChoice !== "right" || this.lane !== 1 || this.state !== "STRAIGHT") return false;

                const mergePoint = this.getRightTurnMergePoint();
                const targetDirection = this.getRightTurnTargetDirection();
                const targetLane = 1;
                const mergePos = this.getDirectionPosFromPoint(targetDirection, mergePoint);
                const frontGap = Math.max(config.safeDistance + 8, this.followGap * 0.44 + this.length * 0.16);
                const rearGap = Math.max(10, config.safeDistance * 0.36 + this.length * 0.12);

                for (const other of state.vehicles) {
                    if (other.id === this.id || other.state === "DONE") continue;

                    const dx = other.x - mergePoint.x;
                    const dy = other.y - mergePoint.y;
                    const mergeDistance = Math.sqrt(dx * dx + dy * dy);

                    if (other.direction === targetDirection && other.lane === targetLane) {
                        const relativePos = other.getPos() - mergePos;
                        if (relativePos > -rearGap && relativePos < frontGap) {
                            return true;
                        }
                        continue;
                    }

                    if (other.state === "TURNING") {
                        const sameTarget =
                            other.turnTargetDirection === targetDirection ||
                            (
                                typeof other.getRightTurnTargetDirection === "function" &&
                                other.turnKind === "right" &&
                                other.getRightTurnTargetDirection() === targetDirection
                            );
                        const turnBuffer = sameTarget ? config.carLength * 0.96 : config.carLength * 0.82;
                        if (mergeDistance < turnBuffer && (!sameTarget || other.turnProgress < 0.76)) {
                            return true;
                        }
                    }
                }

                return false;
            }

            isTurnPathClear(turnKind, distToStop = Infinity) {
                if (this.state !== "STRAIGHT") return true;
                if (distToStop <= -24 || distToStop > 140) return true;
                const flow = currentFlowMode();
                const conflictRadius = config.carLength * 2.15 * flow.junctionCautionScale;
                const mergePoint = turnKind === "right" ? this.getRightTurnMergePoint() : this.getFreeTurnMergePoint();
                const opposite = oppositeDirection(this.direction);

                for (const other of state.vehicles) {
                    if (other.id === this.id || other.state === "DONE") continue;

                    const nearCore =
                        other.isInJunctionZone(36) ||
                        (
                            other.state === "STRAIGHT" &&
                            other.getStopLinePos() - other.getPos() < 46 &&
                            other.getStopLinePos() - other.getPos() > -180
                        );
                    if (!nearCore) continue;

                    const mergeGap = Math.hypot(other.x - mergePoint.x, other.y - mergePoint.y);
                    if (mergeGap < conflictRadius) return false;
                    if (!this.priority && other.priority && mergeGap < conflictRadius * 1.35) return false;

                    if (
                        turnKind === "free_left" &&
                        other.direction === opposite &&
                        other.state === "STRAIGHT" &&
                        Math.abs(other.getStopLinePos() - other.getPos()) < 110
                    ) {
                        return false;
                    }
                }
                return true;
            }

            hasJunctionConflict(distToStop) {
                if (this.state !== "STRAIGHT") return false;
                if (distToStop <= -20 || distToStop > 165) return false;
                const flow = currentFlowMode();
                const cautionScale = flow.junctionCautionScale;
                const myEta = Math.max(0, distToStop) / Math.max(this.speed, 1.05);
                const opposite = oppositeDirection(this.direction);

                for (const other of state.vehicles) {
                    if (other.id === this.id || other.state === "DONE") continue;
                    if (other.direction === this.direction && other.lane === this.lane) continue;

                    const otherStop = other.getStopLinePos() - other.getPos();
                    const otherInside =
                        other.isInJunctionZone(26) ||
                        (other.state === "STRAIGHT" && otherStop < 34 && otherStop > -170);
                    if (!otherInside) continue;

                    if (
                        this.routeChoice === "straight" &&
                        other.routeChoice === "straight" &&
                        other.direction === opposite &&
                        other.state === "STRAIGHT"
                    ) {
                        continue;
                    }

                    if (!this.priority && other.priority) return true;
                    if (other.isInJunctionZone(18)) return true;

                    const otherEta = Math.max(0, otherStop) / Math.max(other.speed, 1.05);
                    const etaGap = otherEta - myEta;
                    if (etaGap < 6 * cautionScale) {
                        if (Math.abs(etaGap) < 2.6) {
                            if (other.id < this.id) return true;
                        } else {
                            return true;
                        }
                    }
                }
                return false;
            }

            randomizeTravelProfile(initial = false) {
                const flow = currentFlowMode();
                this.behaviorTimerMs = 700 + Math.random() * 2600;
                this.dynamicCruiseFactor = this.priority
                    ? 0.96 + Math.random() * 0.22
                    : (0.58 + Math.random() * 0.82) * flow.cruiseScale;
                this.dynamicGapOffset = this.priority
                    ? Math.random() * 10 - 2
                    : (-12 + Math.random() * 52) * flow.gapScale;
                this.dynamicAccelFactor = this.priority
                    ? 0.9 + Math.random() * 0.45
                    : (0.45 + Math.random() * 1.25) * flow.reactionScale;
                this.brakeBias = this.priority
                    ? 0.84 + Math.random() * 0.24
                    : 0.7 + Math.random() * 1.1;
                if (initial && !this.priority) {
                    this.randomStopCooldownMs = 1400 + Math.random() * 3600;
                }
            }

            canApplyRandomStop(distToStop) {
                const centerDistance = Math.hypot(this.x - state.cx, this.y - state.cy);
                return (
                    !this.priority &&
                    this.state === "STRAIGHT" &&
                    centerDistance > config.roadWidth * 0.62 &&
                    Math.abs(this.yieldOffsetTarget) < config.laneWidth * 0.25 &&
                    !(
                        ((this.lane === 0 && this.routeChoice === "free_left") || (this.lane === 1 && this.routeChoice === "right")) &&
                        distToStop > 0 &&
                        distToStop < 140
                    ) &&
                    (distToStop > 90 || distToStop < -140)
                );
            }

            clearCommunicationState() {
                this.commLinks = 0;
                this.yielding = false;
                this.yieldMode = null;
                this.signalUrgency = 0;
                this.yieldOffsetTarget = 0;
            }

            applyCommunicationSignal(mode, urgency) {
                if (this.priority || this.state !== "STRAIGHT") return;
                this.commLinks += 1;
                this.yielding = true;
                this.signalUrgency = Math.max(this.signalUrgency, urgency);

                if (mode === "corridor-clear") {
                    this.yieldMode = "corridor-clear";
                    this.yieldOffsetTarget = this.lane === 1 ? config.laneWidth * 0.22 : -config.laneWidth * 0.18;
                } else if (this.yieldMode !== "corridor-clear") {
                    this.yieldMode = "hold";
                    this.yieldOffsetTarget = 0;
                }
            }

            update(dt) {
                const step = frameFactor(dt);
                const flow = currentFlowMode();
                this.travelTimeMs += dt;
                this.behaviorTimerMs -= dt;
                this.randomStopCooldownMs = Math.max(0, this.randomStopCooldownMs - dt);
                this.randomStopTimerMs = Math.max(0, this.randomStopTimerMs - dt);
                if (this.behaviorTimerMs <= 0) this.randomizeTravelProfile();
                disciplineManager.enforceLaneDiscipline(this);

                const freeFlow = Math.max(1.15, state.maxSpeed * this.speedFactor * this.dynamicCruiseFactor);
                let targetSpeed = this.priority ? freeFlow * 1.06 : freeFlow;
                const myPos = this.getPos();
                const selfInJunction = this.isInJunctionZone(28);
                let distToObstacle = Infinity;
                let carAhead = null;
                let minDist = Infinity;

                for (const other of state.vehicles) {
                    if (other.id === this.id) continue;
                    if (other.direction === this.direction && other.lane === this.lane && other.state !== "TURNING") {
                        const dist = other.getPos() - myPos - (this.length + other.length) / 2;
                        if (dist > 0 && dist < minDist) {
                            minDist = dist;
                            carAhead = other;
                        }
                    }
                    if (other.direction === this.direction && this.state !== "TURNING" && other.state !== "TURNING") {
                        continue;
                    }

                    const otherInJunction =
                        typeof other.isInJunctionZone === "function" ? other.isInJunctionZone(28) : false;
                    const otherBehindStopLine =
                        other.state === "STRAIGHT" &&
                        other.direction !== this.direction &&
                        (other.getStopLinePos() - other.getPos()) > 12;
                    const crossingRisk =
                        this.state === "TURNING" ||
                        other.state === "TURNING" ||
                        (selfInJunction && otherInJunction);
                    if (!crossingRisk || otherBehindStopLine) continue;

                    const dx = other.x - this.x;
                    const dy = other.y - this.y;
                    const dist2D = Math.sqrt(dx * dx + dy * dy);
                    if (dist2D < config.carLength * 3.1) {
                        const vx = Math.cos(this.angle);
                        const vy = Math.sin(this.angle);
                        const dot = dx * vx + dy * vy;
                        const cross = Math.abs(dx * vy - dy * vx);
                        if (dot >= -config.carLength * 0.08 && cross < config.carWidth * 1.45) {
                            const distPath = dot - (this.length + other.length) / 2;
                            if (distPath > 0 && distPath < minDist) {
                                minDist = distPath;
                                carAhead = other;
                            } else if (distPath <= 0 && dist2D < config.carLength * 1.15) {
                                minDist = 0.1;
                                carAhead = other;
                            }
                        }
                    }
                }

                if (carAhead) distToObstacle = minDist;

                const light = trafficLights.getLight(this.direction);
                const stopLinePos = this.getStopLinePos();
                const distToStop = stopLinePos - myPos;
                const freeTurnEntryPos = this.lane === 0 ? this.getFreeTurnEntryPos() : stopLinePos;
                const distToFreeTurnEntry = freeTurnEntryPos - myPos;
                const freeLeftBlocked = this.isFreeLeftBlocked();
                const freeLeftPathClear = this.isTurnPathClear("free_left", distToFreeTurnEntry);
                const rightTurnEntryPos = this.routeChoice === "right" ? this.getRightTurnEntryPos() : stopLinePos;
                const distToRightTurnEntry = rightTurnEntryPos - myPos;
                const rightTurnBlocked = this.isRightTurnBlocked();
                const rightTurnPathClear = this.isTurnPathClear("right", distToRightTurnEntry);
                const freeLeftConflict = this.routeChoice === "free_left" && this.lane === 0
                    ? this.hasJunctionConflict(distToFreeTurnEntry)
                    : false;
                const rightTurnConflict = this.routeChoice === "right" && this.lane === 1
                    ? this.hasJunctionConflict(distToRightTurnEntry)
                    : false;
                let effectiveLight = light;
                if (this.routeChoice === "free_left" && this.lane === 0) {
                    const freeLaneReady = light === LIGHT.GREEN && !freeLeftBlocked && freeLeftPathClear;
                    effectiveLight = freeLaneReady ? LIGHT.GREEN : LIGHT.RED;
                }
                if (this.priority && trafficLights.currentDir === this.direction && trafficLights.phase === "green") {
                    effectiveLight = LIGHT.GREEN;
                }
                if (distToStop > 0 && distToStop < 210 && effectiveLight !== LIGHT.GREEN && distToStop < distToObstacle) {
                    distToObstacle = distToStop;
                    if (effectiveLight === LIGHT.YELLOW && distToStop < 45 && this.speed > 2) distToObstacle = Infinity;
                }
                if (this.routeChoice === "free_left" && this.lane === 0 && freeLeftBlocked && distToFreeTurnEntry > 0 && distToFreeTurnEntry < distToObstacle) {
                    distToObstacle = distToFreeTurnEntry;
                    targetSpeed = Math.min(targetSpeed, freeFlow * 0.42);
                }
                if (this.routeChoice === "free_left" && this.lane === 0 && distToFreeTurnEntry > 0 && distToFreeTurnEntry < 120) {
                    targetSpeed = Math.min(targetSpeed, freeLeftBlocked ? freeFlow * 0.52 : freeFlow * 0.92);
                }
                if (this.routeChoice === "free_left" && freeLeftConflict && distToFreeTurnEntry > 0 && distToFreeTurnEntry < 130) {
                    distToObstacle = Math.min(distToObstacle, Math.max(0.1, distToFreeTurnEntry - 6));
                    targetSpeed = Math.min(targetSpeed, freeFlow * 0.36);
                }
                if (this.routeChoice === "right" && rightTurnBlocked && distToRightTurnEntry > 0 && distToRightTurnEntry < distToObstacle) {
                    distToObstacle = distToRightTurnEntry;
                    targetSpeed = Math.min(targetSpeed, freeFlow * 0.46);
                }
                if (this.routeChoice === "right" && distToRightTurnEntry > 0 && distToRightTurnEntry < 120) {
                    targetSpeed = Math.min(targetSpeed, rightTurnBlocked ? freeFlow * 0.56 : freeFlow * 0.9);
                }
                if (this.routeChoice === "right" && rightTurnConflict && distToRightTurnEntry > 0 && distToRightTurnEntry < 130) {
                    distToObstacle = Math.min(distToObstacle, Math.max(0.1, distToRightTurnEntry - 6));
                    targetSpeed = Math.min(targetSpeed, freeFlow * 0.4);
                }

                const junctionConflict = this.hasJunctionConflict(distToStop) || freeLeftConflict || rightTurnConflict;
                if (!this.priority && junctionConflict) {
                    distToObstacle = Math.min(
                        distToObstacle,
                        Math.max(0.1, distToStop - 10 * flow.junctionCautionScale)
                    );
                    targetSpeed = Math.min(targetSpeed, freeFlow * clamp(0.3 / flow.junctionCautionScale, 0.2, 0.34));
                }

                if (!this.priority && this.yielding) {
                    if (this.yieldMode === "hold" && distToStop > 0 && distToStop < 240) {
                        distToObstacle = Math.min(distToObstacle, Math.max(0.1, distToStop - 24 - this.signalUrgency * 4));
                        targetSpeed = Math.min(targetSpeed, freeFlow * 0.45);
                    } else if (this.yieldMode === "corridor-clear" && distToStop > -45 && distToStop < 130) {
                        targetSpeed = Math.max(targetSpeed, freeFlow * 1.08);
                    }
                }

                if (
                    this.priority &&
                    state.activeEmergencyRequest &&
                    state.activeEmergencyRequest.vehicleId === this.id &&
                    distToStop > 0 &&
                    distToStop < 180 &&
                    trafficLights.currentDir !== this.direction
                ) {
                    targetSpeed = Math.min(targetSpeed, freeFlow * 0.7);
                }

                if (
                    this.randomStopTimerMs <= 0 &&
                    this.randomStopCooldownMs <= 0 &&
                    disciplineManager.shouldApplyRandomStop(this, distToStop) &&
                    Math.random() < Math.min(0.07 * flow.randomStopRateScale, (dt / 14000) * flow.randomStopRateScale)
                ) {
                    this.randomStopTimerMs = 180 + Math.random() * 980;
                    this.randomStopCooldownMs = 1800 + Math.random() * 5200;
                }

                if (this.randomStopTimerMs > 0 && disciplineManager.shouldApplyRandomStop(this, distToStop)) {
                    targetSpeed = Math.min(
                        targetSpeed,
                        this.randomStopTimerMs > 320 ? 0 : freeFlow * 0.12
                    );
                }

                const safeGap = Math.max(
                    config.safeDistance * 0.72 * flow.gapScale,
                    this.followGap + this.dynamicGapOffset + this.speed * this.headwayFactor
                );
                if (distToObstacle < safeGap) {
                    let braking = (distToObstacle < config.safeDistance ? 2.65 : 1.15) * this.brakeBias;
                    if (distToObstacle <= 2) { targetSpeed = 0; this.speed = 0; }
                    else if (carAhead && distToObstacle === minDist) targetSpeed = Math.min(carAhead.speed, targetSpeed);
                    else targetSpeed = 0;
                    if (this.priority) braking *= 0.88;
                    this.speed -= config.brakeDecel * braking * step;
                } else {
                    this.speed += this.accel * this.dynamicAccelFactor * step;
                }

                targetSpeed = disciplineManager.computeTargetSpeed(this, {
                    targetSpeed,
                    freeFlow,
                    distToStop,
                    effectiveLight
                });
                this.speed = clamp(disciplineManager.smoothSpeed(this, targetSpeed, step), 0, targetSpeed);

                if (this.routeChoice === "free_left" && this.lane === 0 && this.state === "STRAIGHT") {
                    const projectedPos = myPos + this.speed * step;
                    const holdPos = freeTurnEntryPos - 0.6;
                    const freeTurnAuthorized = disciplineManager.canStartTurn(this, "free_left", {
                        blocked: freeLeftBlocked,
                        pathClear: freeLeftPathClear,
                        effectiveLight: light,
                        distToEntry: distToFreeTurnEntry,
                        freeFlow,
                        junctionConflict: freeLeftConflict
                    });

                    if (!freeTurnAuthorized && projectedPos >= holdPos) {
                        this.speed = 0;
                        this.setApproachPos(holdPos);
                    } else if (freeTurnAuthorized && projectedPos >= freeTurnEntryPos) {
                        this.beginFreeTurn(freeTurnEntryPos);
                    }
                }
                if (this.routeChoice === "right" && this.lane === 1 && this.state === "STRAIGHT") {
                    const projectedPos = myPos + this.speed * step;
                    const holdPos = rightTurnEntryPos - 0.6;
                    const rightTurnAuthorized = disciplineManager.canStartTurn(this, "right", {
                        blocked: rightTurnBlocked,
                        pathClear: rightTurnPathClear,
                        effectiveLight: light,
                        distToEntry: distToRightTurnEntry,
                        freeFlow,
                        junctionConflict: rightTurnConflict
                    });

                    if (!rightTurnAuthorized && projectedPos >= holdPos) {
                        this.speed = 0;
                        this.setApproachPos(holdPos);
                    } else if (rightTurnAuthorized && projectedPos >= rightTurnEntryPos) {
                        this.beginRightTurn(rightTurnEntryPos);
                    }
                }

                if (this.state === "TURNING") {
                    this.speed = Math.min(
                        this.speed,
                        freeFlow * (
                            this.turnKind === "right"
                                ? (this.priority ? 0.9 : 0.82 * flow.turnCapScale)
                                : (this.priority ? 0.94 : 0.86 * flow.turnCapScale)
                        )
                    );
                    const r = this.turnRadius || 16;
                    const arcLen = (Math.PI / 2) * r;
                    this.turnProgress += (this.speed * step) / arcLen;
                    if (this.turnProgress >= 1) {
                        this.turnProgress = 1;
                        const nextDirection = this.turnTargetDirection || this.direction;
                        this.direction = nextDirection;
                        this.originDirection = nextDirection;
                        this.state = "STRAIGHT";
                        this.lane = this.turnKind === "right" ? 1 : 0;
                        this.routeChoice = "straight";
                        this.yieldOffset = 0;
                        this.yieldOffsetTarget = 0;
                        this.speed = Math.min(this.speed, freeFlow * 0.72);
                        this.angle = this.targetAngle;
                        disciplineManager.alignHeading(this, 0.42);
                        const exitPoint = this.turnKind === "right"
                            ? this.getRightTurnMergePoint()
                            : this.getFreeTurnMergePoint();
                        this.x = exitPoint.x;
                        this.y = exitPoint.y;
                        this.origDir = null;
                        this.turnKind = "";
                        this.turnTargetDirection = null;
                    } else {
                        const p = this.turnProgress;
                        const curve = this.getTurnGeometry(this.turnKind);
                        const inv = 1 - p;
                        this.x =
                            inv * inv * curve.start.x +
                            2 * inv * p * curve.control.x +
                            p * p * curve.end.x;
                        this.y =
                            inv * inv * curve.start.y +
                            2 * inv * p * curve.control.y +
                            p * p * curve.end.y;
                        const dx =
                            2 * inv * (curve.control.x - curve.start.x) +
                            2 * p * (curve.end.x - curve.control.x);
                        const dy =
                            2 * inv * (curve.control.y - curve.start.y) +
                            2 * p * (curve.end.y - curve.control.y);
                        this.angle = Math.atan2(dy, dx);
                    }
                } else {
                    if (this.direction === DIR.EAST) this.x += this.speed * step;
                    if (this.direction === DIR.WEST) this.x -= this.speed * step;
                    if (this.direction === DIR.SOUTH) this.y += this.speed * step;
                    if (this.direction === DIR.NORTH) this.y -= this.speed * step;
                    const laneCenter = this.getLaneCenterCoord();
                    const laneBlend = disciplineManager.getLaneBlend(this);
                    if (laneCenter.axis === "x") {
                        this.x += (laneCenter.value - this.x) * laneBlend;
                    } else {
                        this.y += (laneCenter.value - this.y) * laneBlend;
                    }
                    this.angle = this.targetAngle;
                    disciplineManager.alignHeading(this, 0.3);
                }

                const stopDistance = this.getStopLinePos() - this.getPos();
                if (stopDistance > -30 && stopDistance < 260 && this.speed < 0.8) this.waitTimeMs += dt;
                const easing = this.yielding ? 0.2 : 0.12;
                this.yieldOffset += (this.yieldOffsetTarget - this.yieldOffset) * easing;
            }

            draw() {
                const drawX =
                    this.direction === DIR.NORTH || this.direction === DIR.SOUTH ? this.x + this.yieldOffset : this.x;
                const drawY =
                    this.direction === DIR.EAST || this.direction === DIR.WEST ? this.y + this.yieldOffset : this.y;

                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(this.angle);
                const hw = this.width / 2;
                const hl = this.length / 2;

                ctx.shadowColor = "rgba(2, 6, 23, 0.55)";
                ctx.shadowBlur = 8;
                ctx.shadowOffsetY = 3;

                ctx.fillStyle = this.color;
                roundedRect(-hl, -hw, this.length, this.width, 4);
                ctx.fill();

                ctx.shadowColor = "transparent";
                if (this.priority) {
                    ctx.strokeStyle = "rgba(253, 224, 71, 0.92)";
                    ctx.lineWidth = 2;
                    roundedRect(-hl, -hw, this.length, this.width, 4);
                    ctx.stroke();
                    ctx.fillStyle = Math.sin(state.time / 180) > 0 ? this.roofColor : "#f8fafc";
                    ctx.fillRect(-4, -2.4, 8, 4.8);
                }

                ctx.fillStyle = "rgba(15, 23, 42, 0.45)";
                ctx.fillRect(hl - 12, -hw + 2, 6, this.width - 4);
                ctx.fillRect(-hl + 4, -hw + 2, 4, this.width - 4);

                ctx.fillStyle = "rgba(255, 255, 220, 0.92)";
                ctx.beginPath(); ctx.arc(hl, -hw + 3, 2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(hl, hw - 3, 2, 0, Math.PI * 2); ctx.fill();

                ctx.fillStyle = this.speed < 0.45 ? "#ff4d4d" : "#7f1d1d";
                ctx.fillRect(-hl, -hw + 1, 2, 4);
                ctx.fillRect(-hl, hw - 5, 2, 4);

                if (this.yielding && !this.priority) {
                    ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-hl - 4, -hw - 4);
                    ctx.lineTo(hl + 4, -hw - 4);
                    ctx.stroke();
                }
                ctx.restore();
            }

            isOffScreen() {
                const margin = 110;
                return this.x < -margin || this.x > state.width + margin || this.y < -margin || this.y > state.height + margin;
            }
        }

        const trafficLights = new TrafficController();
        const disciplineManager = new DisciplineManager();

        function resize() {
            canvas.width = innerWidth;
            canvas.height = innerHeight;
            state.width = canvas.width;
            state.height = canvas.height;
            state.cx = state.width / 2;
            state.cy = state.height / 2;
        }

        function demandText(value) {
            if (value < 95) return "Low";
            if (value < 135) return "Moderate";
            if (value < 185) return "High";
            return "Critical";
        }

        function spawnProbability(dt = 16.6667) {
            const flow = currentFlowMode();
            const congestion = clamp(state.metrics.congestionIndex / 100, 0, 1);
            const queueSum = DIRECTIONS.reduce((sum, dir) => sum + (state.metrics.corridors[dir]?.queue || 0), 0);
            const liveLoad = clamp(state.metrics.liveVehicles / 92, 0, 1);
            const congestionDamping = clamp(1 - congestion * 0.78, 0.14, 1);
            const queueDamping = clamp(1 - queueSum / 24, 0.28, 1);
            const liveDamping = clamp(1 - liveLoad * 0.56, 0.32, 1);
            const adaptiveLimiter = congestion > 0.84 ? 0.68 : 1;
            const frameChance =
                (0.0035 + (state.demandIntensity / 220) * 0.022) *
                flow.spawnScale *
                congestionDamping *
                queueDamping *
                liveDamping *
                adaptiveLimiter;
            return 1 - Math.pow(1 - frameChance, Math.max(0.35, dt / 16.6667));
        }

        function setProfile(key) {
            const profile = PROFILES[key] || PROFILES.balanced;
            state.demandProfile = key;
            state.demandWeights = { ...profile.weights };
            setTextSafe("profile-note", profile.note);
        }

        function pickDirection() {
            let total = 0;
            for (const dir of DIRECTIONS) total += state.demandWeights[dir];
            let roll = Math.random() * total;
            for (const dir of DIRECTIONS) {
                roll -= state.demandWeights[dir];
                if (roll <= 0) return dir;
            }
            return DIRECTIONS[0];
        }

        function canSpawnVehicle(candidate) {
            for (const vehicle of state.vehicles) {
                if (vehicle.state === "DONE") continue;
                const dx = vehicle.x - candidate.x;
                const dy = vehicle.y - candidate.y;
                const sameLane = vehicle.originDirection === candidate.originDirection && vehicle.lane === candidate.lane;
                const minGap = sameLane
                    ? (vehicle.length + candidate.length) / 2 + Math.max(candidate.followGap, vehicle.followGap * 0.92) + config.laneWidth * 0.28
                    : config.carLength * 1.9;
                if (Math.sqrt(dx * dx + dy * dy) < minGap) return false;
            }
            return true;
        }

        function spawnVehicle(direction, lane, options = {}) {
            const vehicle = new Vehicle(direction, lane, options);
            if (!canSpawnVehicle(vehicle)) return null;
            state.vehicles.push(vehicle);
            if (vehicle.priority) state.priorityVehicleId = vehicle.id;
            return vehicle;
        }

        function attemptSpawn(options = {}) {
            const direction = options.direction ?? pickDirection();
            const lane = options.lane ?? (Math.random() < 0.34 ? 0 : 1);
            return spawnVehicle(direction, lane, options);
        }

        function estimateArrivalMs(vehicle) {
            const remaining = Math.max(0, vehicle.getStopLinePos() - vehicle.getPos());
            return (remaining / Math.max(vehicle.speed, 1.2)) * 16;
        }

        function clearPriorityState() {
            const hadEmergency = state.emergencyDirection !== null || state.priorityVehicleId !== null;
            for (const vehicle of state.vehicles) {
                if (!vehicle.priority) continue;
                vehicle.priority = false;
                vehicle.emergencyType = null;
                vehicle.emergencyAction = null;
                vehicle.emergencyProfile = null;
                vehicle.roofColor = null;
                vehicle.color = COLORS.cars[Math.floor(Math.random() * COLORS.cars.length)];
            }
            state.emergencyDirection = null;
            state.emergencyType = null;
            state.emergencyAction = null;
            state.priorityPending = false;
            state.priorityVehicleId = null;
            state.activeEmergencyRequest = null;
            state.network.controlNote = defaultControlNote();
            document.getElementById("priority-dir").value = "";
            document.getElementById("priority-note").textContent = "No emergency priority is currently requested.";
            updateRandomEmergencyUi();
            if (hadEmergency) {
                logEvent("priority_cleared", "Emergency priority was cleared.", {
                    remainingVehicles: state.vehicles.length
                });
            }
        }

        function requestEmergencyDispatch({ direction, type, action, source = "manual" }) {
            if (!smartActionsEnabled()) {
                document.getElementById("priority-note").textContent =
                    "Manual override is active. Turn off Disable Smart Actions before dispatching emergency priority.";
                return null;
            }
            state.emergencyDirection = direction;
            state.emergencyType = type;
            state.emergencyAction = action;

            document.getElementById("priority-dir").value = String(direction);
            document.getElementById("emergency-type").value = type;
            document.getElementById("emergency-action").value = action;

            const vehicle = attemptSpawn({
                direction,
                lane: 1,
                emergencyType: type,
                emergencyAction: action
            });

            state.priorityPending = !vehicle;
            state.priorityVehicleId = vehicle ? vehicle.id : null;
            state.activeEmergencyRequest = {
                vehicleId: vehicle ? vehicle.id : null,
                direction,
                type,
                action,
                eta: vehicle ? estimateArrivalMs(vehicle) : 0,
                score:
                    getEmergencyProfile(type).controllerBoost +
                    getActionProfile(action).controllerBoost
            };

            const sourcePrefix = source === "random" ? "Random incident: " : "";
            document.getElementById("priority-note").textContent = vehicle
                ? `${sourcePrefix}${emergencyLabel(type)} dispatched on the ${shortLabel(direction).toLowerCase()} corridor with ${actionLabel(action).toLowerCase()}.`
                : `${sourcePrefix}${emergencyLabel(type)} queued on the ${shortLabel(direction).toLowerCase()} corridor while the controller pre-clears the junction.`;

            logEvent(
                source === "random"
                    ? (vehicle ? "random_emergency_dispatch" : "random_emergency_queued")
                    : (vehicle ? "emergency_dispatch" : "emergency_queued"),
                document.getElementById("priority-note").textContent,
                {
                    direction: shortLabel(direction),
                    type,
                    action,
                    source,
                    vehicleId: vehicle ? vehicle.id : ""
                }
            );

            computeMetrics();
            buildCommunicationNetwork();
            updateRandomEmergencyUi();
            return vehicle;
        }

        function dispatchRandomEmergency() {
            const type = randomChoice(RANDOM_EMERGENCY_TYPES);
            const action = randomChoice(RANDOM_ACTIONS_BY_TYPE[type] || [DEFAULT_ACTION_BY_TYPE[type] || "priority"]);
            const direction = randomChoice(DIRECTIONS);
            const vehicle = requestEmergencyDispatch({
                direction,
                type,
                action,
                source: "random"
            });
            scheduleNextRandomEmergency();
            return vehicle;
        }

        function dispatchEmergency() {
            if (!smartActionsEnabled()) {
                document.getElementById("priority-note").textContent =
                    "Manual override is active. Emergency smart dispatch is currently blocked.";
                return;
            }
            const value = document.getElementById("priority-dir").value;
            if (value === "") {
                document.getElementById("priority-note").textContent = "Choose a corridor before dispatching an emergency vehicle.";
                return;
            }

            const direction = Number(value);
            const type = document.getElementById("emergency-type").value;
            const action = document.getElementById("emergency-action").value;
            requestEmergencyDispatch({ direction, type, action, source: "manual" });
        }

        function maybeDispatchRandomEmergency(dt) {
            if (!smartActionsEnabled()) return;
            if (!state.randomEmergencyEnabled) return;
            if (isEmergencySystemBusy()) return;
            if (state.randomEmergencyTimerMs <= 0) {
                dispatchRandomEmergency();
                return;
            }
            state.randomEmergencyTimerMs = Math.max(0, state.randomEmergencyTimerMs - dt);
            if (state.randomEmergencyTimerMs <= 0) {
                dispatchRandomEmergency();
            }
        }

        function recordCompletion(vehicle) {
            state.metrics.completedTrips += 1;
            state.metrics.throughputEvents.push(state.time);
            while (state.metrics.throughputEvents.length && state.metrics.throughputEvents[0] < state.time - 60000) {
                state.metrics.throughputEvents.shift();
            }
            if (vehicle.priority) {
                state.metrics.emergencyTrips += 1;
                logEvent("emergency_complete", `${emergencyLabel(vehicle.emergencyType)} completed its corridor passage.`, {
                    type: vehicle.emergencyType,
                    action: vehicle.emergencyAction,
                    origin: shortLabel(vehicle.originDirection)
                });
            } else {
                logEvent("vehicle_complete", "Vehicle completed its trip.", {
                    origin: shortLabel(vehicle.originDirection)
                });
            }
            if (vehicle.priority && vehicle.id === state.priorityVehicleId) clearPriorityState();
        }

        function buildCommunicationNetwork() {
            state.network.broadcasts = 0;
            state.network.v2vLinks = 0;
            state.network.yieldingVehicles = 0;

            for (const vehicle of state.vehicles) {
                vehicle.clearCommunicationState();
            }

            if (!smartActionsEnabled()) {
                state.activeEmergencyRequest = null;
                state.metrics.v2vLinks = 0;
                state.metrics.yieldingVehicles = 0;
                return;
            }

            const requests = [];

            for (const emergency of state.vehicles) {
                if (!emergency.priority || emergency.state === "DONE") continue;

                const profile = getEmergencyProfile(emergency.emergencyType);
                const action = getActionProfile(emergency.emergencyAction);
                const eta = estimateArrivalMs(emergency);

                requests.push({
                    vehicleId: emergency.id,
                    direction: emergency.direction,
                    type: emergency.emergencyType,
                    action: emergency.emergencyAction,
                    eta,
                    score:
                        profile.controllerBoost +
                        action.controllerBoost +
                        clamp(12 - eta / 900, 0, 12)
                });

                state.network.broadcasts += 1;

                for (const other of state.vehicles) {
                    if (other.id === emergency.id || other.priority || other.state === "DONE") continue;

                    const dx = other.x - emergency.x;
                    const dy = other.y - emergency.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > profile.broadcastRadius) continue;

                    const sameApproach = other.direction === emergency.direction;
                    if (sameApproach) {
                        const relativePos = other.getPos() - emergency.getPos();
                        if (relativePos > -20 && relativePos < profile.yieldDistance) {
                            other.applyCommunicationSignal("corridor-clear", profile.controllerBoost / 10);
                            state.network.v2vLinks += 1;
                        }
                    } else if (action.holdCrossTraffic) {
                        const stopDistance = other.getStopLinePos() - other.getPos();
                        if (stopDistance > -20 && stopDistance < 240) {
                            other.applyCommunicationSignal("hold", action.controllerBoost / 10);
                            state.network.v2vLinks += 1;
                        }
                    }
                }
            }

            for (const vehicle of state.vehicles) {
                if (vehicle.yielding && !vehicle.priority) {
                    state.network.yieldingVehicles += 1;
                }
            }

            requests.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return a.eta - b.eta;
            });

            if (requests.length) {
                state.activeEmergencyRequest = requests[0];
                state.emergencyDirection = requests[0].direction;
                state.emergencyType = requests[0].type;
                state.emergencyAction = requests[0].action;
            } else if (state.priorityPending && state.emergencyDirection !== null && state.emergencyType && state.emergencyAction) {
                state.activeEmergencyRequest = {
                    vehicleId: state.priorityVehicleId,
                    direction: state.emergencyDirection,
                    type: state.emergencyType,
                    action: state.emergencyAction,
                    eta: 0,
                    score:
                        getEmergencyProfile(state.emergencyType).controllerBoost +
                        getActionProfile(state.emergencyAction).controllerBoost
                };
            } else if (!state.priorityPending) {
                state.activeEmergencyRequest = null;
            }

            state.metrics.v2vLinks = state.network.v2vLinks;
            state.metrics.yieldingVehicles = state.network.yieldingVehicles;
        }

        function computeMetrics() {
            const corridors = emptyCorridors();
            let totalSpeed = 0;
            let totalApproachWait = 0;
            let approachVehicles = 0;
            let totalQueue = 0;

            for (const vehicle of state.vehicles) {
                const bucket = corridors[vehicle.direction];
                const speedKmh = vehicle.speed * 12;
                const stopDistance = vehicle.getStopLinePos() - vehicle.getPos();
                const onApproach = vehicle.state !== "DONE" && stopDistance > -35 && stopDistance < 250;
                const incomingSoon = vehicle.state !== "DONE" && stopDistance >= 250 && stopDistance < 470;
                bucket.vehicles += 1;
                bucket.totalSpeed += speedKmh;
                totalSpeed += speedKmh;
                if (vehicle.priority) bucket.priorityCount += 1;
                if (incomingSoon) bucket.incoming += 1;
                if (onApproach) {
                    bucket.approaching += 1;
                    bucket.totalWaitMs += vehicle.waitTimeMs;
                    if (vehicle.speed < 0.85) bucket.queue += 1;
                    else bucket.moving += 1;
                    totalApproachWait += vehicle.waitTimeMs;
                    approachVehicles += 1;
                }
            }

            for (const dir of DIRECTIONS) {
                const bucket = corridors[dir];
                bucket.avgWaitMs = bucket.approaching ? bucket.totalWaitMs / bucket.approaching : 0;
                bucket.avgSpeedKmh = bucket.vehicles ? bucket.totalSpeed / bucket.vehicles : 0;
                bucket.pressure =
                    bucket.queue * 2.2 +
                    bucket.approaching * 0.85 +
                    bucket.incoming * 0.55 +
                    bucket.priorityCount * 6 +
                    Math.min(7, bucket.avgWaitMs / 1800);
                totalQueue += bucket.queue;
            }

            while (state.metrics.throughputEvents.length && state.metrics.throughputEvents[0] < state.time - 60000) {
                state.metrics.throughputEvents.shift();
            }

            state.metrics.liveVehicles = state.vehicles.length;
            state.metrics.throughputPerMin = state.metrics.throughputEvents.length;
            state.metrics.averageWaitMs = approachVehicles ? totalApproachWait / approachVehicles : 0;
            state.metrics.averageSpeedKmh = state.vehicles.length ? totalSpeed / state.vehicles.length : 0;
            const throughputRelief = state.metrics.throughputPerMin * 0.62;
            state.metrics.congestionIndex = clamp(
                totalQueue * 7.2 +
                state.metrics.averageWaitMs / 300 +
                state.metrics.liveVehicles * 0.56 -
                state.metrics.averageSpeedKmh * 0.32 -
                throughputRelief,
                0,
                100
            );
            state.metrics.corridors = corridors;
        }

        function resolveVehicleOverlaps() {
            const flow = currentFlowMode();
            const minBase = config.carLength * 0.95 * flow.junctionCautionScale;
            for (let pass = 0; pass < 2; pass += 1) {
                for (let i = 0; i < state.vehicles.length; i += 1) {
                    const a = state.vehicles[i];
                    if (a.state === "DONE") continue;
                    for (let j = i + 1; j < state.vehicles.length; j += 1) {
                        const b = state.vehicles[j];
                        if (b.state === "DONE") continue;

                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
                        const minSeparation = Math.max(
                            minBase,
                            ((a.length + b.length) * 0.5 + config.safeDistance * 0.25) * flow.gapScale
                        );
                        if (dist >= minSeparation) continue;

                        const overlap = minSeparation - dist;
                        const nx = dx / dist;
                        const ny = dy / dist;
                        const aPriorityWeight = a.priority && !b.priority ? 0.2 : 0.5;
                        const bPriorityWeight = b.priority && !a.priority ? 0.2 : 0.5;
                        const total = aPriorityWeight + bPriorityWeight;
                        const aShare = bPriorityWeight / total;
                        const bShare = aPriorityWeight / total;

                        a.x -= nx * overlap * aShare;
                        a.y -= ny * overlap * aShare;
                        b.x += nx * overlap * bShare;
                        b.y += ny * overlap * bShare;

                        if (a.direction === b.direction && a.lane === b.lane) {
                            const aPos = a.getPos();
                            const bPos = b.getPos();
                            const leader = aPos >= bPos ? a : b;
                            const follower = leader === a ? b : a;
                            follower.speed = Math.min(follower.speed, leader.speed * 0.78);
                        } else {
                            a.speed *= 0.92;
                            b.speed *= 0.92;
                        }
                    }
                }
            }
        }

        const renderer = createRenderer({
            ctx,
            state,
            config,
            COLORS,
            DIR,
            DIRECTIONS,
            LIGHT,
            trafficLights,
            clamp
        });

        function updateDashboard() {
            const telemetry = trafficLights.telemetry || {};
            const liveTargetMs = telemetry.targetGreenMs || state.lightCycleTime;
            const autoBaseMs = telemetry.autoBaseGreenMs || state.lightCycleTime;
            const smartEnabled = smartActionsEnabled();
            const adaptiveActive = adaptiveControllerActive();
            const flowLabel = currentFlowMode().label;
            const flowNoteNode = document.getElementById("flow-note");
            if (flowNoteNode) flowNoteNode.textContent = flowModeNote();
            document.getElementById("val-spawn").textContent = demandText(state.demandIntensity);
            document.getElementById("val-cycle").textContent = `${(state.lightCycleTime / 1000).toFixed(1)} s`;
            document.getElementById("val-speed").textContent = `${Math.round(state.maxSpeed * 12)} km/h`;
            document.getElementById("cycle-note").textContent =
                adaptiveActive
                    ? `${flowLabel} tuning is active. Auto timing is using ${(autoBaseMs / 1000).toFixed(1)} s live base and ${(liveTargetMs / 1000).toFixed(1)} s current target to prevent queue buildup.`
                    : smartEnabled
                        ? `${flowLabel} tuning is active. Fixed mode keeps the same green window while serving one corridor at a time.`
                        : "Manual override keeps all smart actions off and runs a fixed-cycle signal sequence.";

            document.getElementById("metric-live").textContent = String(state.metrics.liveVehicles);
            document.getElementById("metric-throughput").textContent = String(state.metrics.throughputPerMin);
            document.getElementById("metric-wait").textContent = `${(state.metrics.averageWaitMs / 1000).toFixed(1)} s`;
            document.getElementById("metric-speed").textContent = `${Math.round(state.metrics.averageSpeedKmh)} km/h`;
            document.getElementById("metric-congestion").textContent = String(Math.round(state.metrics.congestionIndex));
            document.getElementById("metric-completed").textContent = String(state.metrics.completedTrips);
            document.getElementById("metric-emergency").textContent = String(state.metrics.emergencyTrips);
            document.getElementById("metric-links").textContent = String(state.metrics.v2vLinks);
            document.getElementById("log-samples").textContent = String(state.analytics.timeline.length);
            document.getElementById("log-events").textContent = String(state.analytics.events.length);
            document.getElementById("log-window").textContent =
                state.analytics.timeline.length
                    ? `${Math.round(
                        state.analytics.timeline[state.analytics.timeline.length - 1].simTimeSec -
                        state.analytics.timeline[0].simTimeSec
                    )} s`
                    : "0 s";
            document.getElementById("log-export").textContent =
                state.analytics.exportedAt === null ? "Never" : `${state.analytics.exportedAt.toFixed(1)} s`;
            document.getElementById("log-storage").textContent = state.analytics.storageStatus;
            document.getElementById("log-stored").textContent =
                `${state.analytics.storedSampleCount} / ${state.analytics.storedEventCount}`;
            document.getElementById("log-last").textContent =
                state.analytics.events.length
                    ? state.analytics.events[state.analytics.events.length - 1].summary
                    : "Logging constraints and results with permanent storage for graph-ready export.";
            updateRandomEmergencyUi();
            updateSmartActionsUi();

            const modeNode = document.getElementById("status-mode");
            modeNode.textContent = !smartEnabled ? "Manual" : adaptiveActive ? "Adaptive" : "Fixed";
            modeNode.classList.toggle("fixed", !smartEnabled || state.controlMode === "fixed");

            document.getElementById("status-active").textContent = fullLabel(trafficLights.currentDir);
            document.getElementById("status-next").textContent = fullLabel(trafficLights.nextDir);
            document.getElementById("status-priority").textContent =
                state.emergencyDirection === null ? "None" : fullLabel(state.emergencyDirection);
            document.getElementById("status-emergency").textContent = emergencyLabel(state.emergencyType);
            document.getElementById("status-action").textContent =
                state.emergencyAction ? actionLabel(state.emergencyAction) : "None";
            document.getElementById("status-links").textContent = String(state.network.v2vLinks);
            document.getElementById("status-yield").textContent = String(state.network.yieldingVehicles);
            document.getElementById("status-timer").textContent = `${(trafficLights.timer / 1000).toFixed(1)} s`;
            document.getElementById("status-phase").textContent =
                trafficLights.phase === "all-red"
                    ? "All-Red"
                    : trafficLights.phase[0].toUpperCase() + trafficLights.phase.slice(1);
            const smartNode = document.getElementById("status-smart");
            const disciplineNode = document.getElementById("status-discipline");
            if (smartNode) {
                smartNode.textContent = smartEnabled ? "Enabled" : "Disabled";
                smartNode.classList.toggle("off", !smartEnabled);
            }
            if (disciplineNode) {
                disciplineNode.textContent = smartEnabled ? "Active" : "Bypassed";
                disciplineNode.classList.toggle("off", !smartEnabled);
            }
            document.getElementById("status-target").textContent = `${(liveTargetMs / 1000).toFixed(1)} s`;
            document.getElementById("status-auto-base").textContent = `${(autoBaseMs / 1000).toFixed(1)} s`;
            document.getElementById("status-band").textContent = congestionBandLabel(
                telemetry.congestionBand || congestionBandKey(state.metrics.congestionIndex)
            );
            document.getElementById("status-queue-total").textContent = String(telemetry.totalQueue || 0);
            document.getElementById("status-note").textContent = state.network.controlNote;

            if (state.activeEmergencyRequest) {
                document.getElementById("banner-title").textContent =
                    `${emergencyLabel(state.activeEmergencyRequest.type)} priority is active`;
                document.getElementById("banner-text").textContent =
                    `${actionLabel(state.activeEmergencyRequest.action)} on the ${shortLabel(state.activeEmergencyRequest.direction).toLowerCase()} corridor. ${state.network.controlNote}`;
            } else {
                document.getElementById("banner-title").textContent =
                    adaptiveActive
                        ? "Adaptive urban traffic control is live"
                        : smartEnabled
                            ? "Fixed-cycle traffic control is live"
                            : "Manual override mode is live";
                document.getElementById("banner-text").textContent =
                    adaptiveActive
                        ? "The controller is auto-adjusting green windows from queue pressure, wait time, V2V signals, and corridor demand to prevent congestion."
                        : smartEnabled
                            ? "The controller is serving one corridor at a time on a fixed-time cycle."
                            : "Smart automation is disabled. Vehicles follow basic fixed-cycle signal behavior only.";
            }

            for (const dir of DIRECTIONS) {
                const id = corridorId(dir);
                const corridor = state.metrics.corridors[dir];
                document.getElementById(`${id}-score`).textContent = String(Math.round(corridor.pressure));
                document.getElementById(`${id}-queue`).textContent = `Queue ${corridor.queue}`;
                document.getElementById(`${id}-wait`).textContent = `Wait ${(corridor.avgWaitMs / 1000).toFixed(1)} s`;
                const bar = document.getElementById(`${id}-bar`);
                bar.style.width = `${clamp(corridor.pressure * 6.6, 4, 100)}%`;
                bar.classList.toggle("priority", state.emergencyDirection === dir);
            }
        }

        function updateSimulation(dt) {
            dt = clamp(dt, 12, 34);
            if (state.paused) return;
            state.time += dt;
            computeMetrics();
            buildCommunicationNetwork();
            trafficLights.update(dt, state.metrics.corridors);

            if (state.priorityPending && state.emergencyDirection !== null && state.emergencyType && state.emergencyAction) {
                const vehicle = attemptSpawn({
                    direction: state.emergencyDirection,
                    lane: 1,
                    emergencyType: state.emergencyType,
                    emergencyAction: state.emergencyAction
                });
                state.priorityPending = !vehicle;
                if (vehicle) state.priorityVehicleId = vehicle.id;
            }

            if (Math.random() < spawnProbability(dt)) attemptSpawn();

            for (let i = state.vehicles.length - 1; i >= 0; i--) {
                const vehicle = state.vehicles[i];
                vehicle.update(dt);
                if (vehicle.isOffScreen()) {
                    recordCompletion(vehicle);
                    state.vehicles.splice(i, 1);
                }
            }

            resolveVehicleOverlaps();
            computeMetrics();
            buildCommunicationNetwork();
            if (
                state.emergencyDirection !== null &&
                !state.priorityPending &&
                !state.vehicles.some(vehicle => vehicle.priority && vehicle.id === state.priorityVehicleId)
            ) {
                clearPriorityState();
            }

            maybeDispatchRandomEmergency(dt);
            captureAnalyticsSample();
        }

        function loop(timestamp) {
            const dt = state.lastTime ? timestamp - state.lastTime : 16;
            state.lastTime = timestamp;
            updateSimulation(dt);
            renderer.drawSimulation();
            updateDashboard();
            requestAnimationFrame(loop);
        }

        function bindUi() {
            const modeSelect = document.getElementById("mode-select");
            const profileSelect = document.getElementById("profile-select");
            const flowModeSelect = document.getElementById("flow-mode");
            const spawnRate = document.getElementById("spawn-rate");
            const cycleTime = document.getElementById("cycle-time");
            const maxSpeed = document.getElementById("max-speed");
            const emergencyTypeSelect = document.getElementById("emergency-type");
            const emergencyActionSelect = document.getElementById("emergency-action");
            const randomEmergencyEnabled = document.getElementById("random-emergency-enabled");
            const smartActionsToggle = document.getElementById("disable-smart-actions");

            modeSelect.addEventListener("change", event => {
                state.controlMode = event.target.value === "fixed" ? "fixed" : "adaptive";
                state.network.controlNote = defaultControlNote();
                logEvent("mode_changed", "Signal control mode updated.", { mode: state.controlMode });
            });

            profileSelect.addEventListener("change", event => {
                setProfile(event.target.value);
                logEvent("profile_changed", "Demand profile updated.", { profile: state.demandProfile });
            });

            if (flowModeSelect) {
                flowModeSelect.addEventListener("change", event => {
                    const nextMode = String(event.target.value || "smooth");
                    state.flowMode = Object.prototype.hasOwnProperty.call(FLOW_MODES, nextMode) ? nextMode : "smooth";
                    state.network.controlNote = defaultControlNote();
                    logEvent("flow_mode_changed", "Flow tuning mode updated.", {
                        flowMode: state.flowMode
                    });
                });
            }

            spawnRate.addEventListener("input", event => {
                state.demandIntensity = Number(event.target.value);
            });

            cycleTime.addEventListener("input", event => {
                state.lightCycleTime = Number(event.target.value);
            });

            maxSpeed.addEventListener("input", event => {
                state.maxSpeed = Number(event.target.value);
            });

            emergencyTypeSelect.addEventListener("change", event => {
                const type = event.target.value;
                const recommendedAction = DEFAULT_ACTION_BY_TYPE[type] || "priority";
                emergencyActionSelect.value = recommendedAction;
            });

            emergencyActionSelect.addEventListener("change", () => {
                const type = emergencyTypeSelect.value;
                const action = emergencyActionSelect.value;
                document.getElementById("priority-note").textContent =
                    `${emergencyLabel(type)} will use ${actionLabel(action).toLowerCase()} when dispatched.`;
            });

            randomEmergencyEnabled.addEventListener("change", event => {
                if (!smartActionsEnabled()) {
                    event.target.checked = false;
                    state.randomEmergencyEnabled = false;
                    updateRandomEmergencyUi();
                    return;
                }
                state.randomEmergencyEnabled = Boolean(event.target.checked);
                if (state.randomEmergencyEnabled) scheduleNextRandomEmergency(true);
                updateRandomEmergencyUi();
                logEvent(
                    "random_emergency_toggle",
                    state.randomEmergencyEnabled ? "Random emergencies enabled." : "Random emergencies disabled.",
                    { enabled: state.randomEmergencyEnabled }
                );
            });
            smartActionsToggle.addEventListener("change", event => {
                setSmartActionsDisabled(Boolean(event.target.checked), "toggle");
            });

            document.getElementById("btn-dispatch").addEventListener("click", dispatchEmergency);
            document.getElementById("btn-reset-priority").addEventListener("click", clearPriorityState);

            document.getElementById("btn-pause").addEventListener("click", event => {
                state.paused = !state.paused;
                event.currentTarget.textContent = state.paused ? "Resume Simulation" : "Pause Simulation";
                logEvent("simulation_pause_toggle", state.paused ? "Simulation paused." : "Simulation resumed.", {
                    paused: state.paused
                });
            });

            document.getElementById("btn-clear").addEventListener("click", () => {
                state.vehicles = [];
                state.network.v2vLinks = 0;
                state.network.yieldingVehicles = 0;
                clearPriorityState();
                computeMetrics();
                buildCommunicationNetwork();
                updateDashboard();
                logEvent("vehicles_cleared", "All active vehicles were reset by the operator.");
            });

            document.getElementById("btn-export-json").addEventListener("click", () => exportAnalytics("json"));
            document.getElementById("btn-export-csv").addEventListener("click", () => exportAnalytics("csv"));
            document.getElementById("btn-reset-logs").addEventListener("click", () => resetAnalytics(true));
            document.getElementById("btn-snapshot").addEventListener("click", () => {
                captureAnalyticsSample(true);
                logEvent("snapshot_logged", "Operator requested an immediate analytics snapshot.");
            });
            document.getElementById("btn-graph-page").addEventListener("click", () => {
                window.open("traffic-analytics.html", "_blank", "noopener");
            });

            const aiEnabled = document.getElementById("ai-enabled");
            const aiRemember = document.getElementById("ai-remember");
            const aiKey = document.getElementById("ai-key");
            const aiModel = document.getElementById("ai-model");

            aiEnabled.addEventListener("change", event => {
                state.ai.enabled = Boolean(event.target.checked);
                if (!state.ai.enabled) state.ai.busy = false;
                persistAiSessionConfig();
                updateAiUi();
            });

            aiRemember.addEventListener("change", event => {
                state.ai.rememberKey = Boolean(event.target.checked);
                if (!state.ai.rememberKey) {
                    state.ai.apiKey = "";
                    aiKey.value = "";
                }
                persistAiSessionConfig();
                updateAiUi();
            });

            aiKey.addEventListener("input", event => {
                state.ai.apiKey = event.target.value.trim();
                if (state.ai.rememberKey) persistAiSessionConfig();
                updateAiUi();
            });

            aiModel.addEventListener("change", event => {
                state.ai.model = event.target.value === "gpt-5.4" ? "gpt-5.4" : "gpt-5-mini";
                persistAiSessionConfig();
                updateAiUi();
            });

            document.getElementById("btn-ai-analyze").addEventListener("click", () => requestAiRecommendation("analyze"));
            document.getElementById("btn-ai-forecast").addEventListener("click", () => requestAiRecommendation("forecast"));
            document.getElementById("btn-ai-optimize").addEventListener("click", () => requestAiRecommendation("optimize"));
            document.getElementById("btn-ai-apply").addEventListener("click", applyAiPlan);
        }

        function init() {
            resize();
            restoreAiSessionConfig();
            beginAnalyticsSession();
            initializePersistentAnalytics();
            setProfile(state.demandProfile);
            state.network.controlNote = defaultControlNote();
            scheduleNextRandomEmergency(true);
            bindUi();
            updateSmartActionsUi();
            updateRandomEmergencyUi();
            updateAiUi();

            document.getElementById("profile-select").value = state.demandProfile;
            document.getElementById("mode-select").value = state.controlMode;
            const flowModeSelect = document.getElementById("flow-mode");
            if (flowModeSelect) flowModeSelect.value = state.flowMode;
            document.getElementById("disable-smart-actions").checked = state.smartActionsDisabled;
            document.getElementById("spawn-rate").value = String(state.demandIntensity);
            document.getElementById("cycle-time").value = String(state.lightCycleTime);
            document.getElementById("max-speed").value = String(state.maxSpeed);
            document.getElementById("btn-pause").textContent = "Pause Simulation";

            logEvent("simulation_started", "Simulation initialized with analytics logging enabled.", {
                demandProfile: state.demandProfile,
                controlMode: state.controlMode,
                flowMode: state.flowMode,
                smartActionsDisabled: state.smartActionsDisabled,
                aiEnabled: state.ai.enabled,
                aiModel: state.ai.model
            });

            for (let i = 0; i < 18; i += 1) attemptSpawn();
            computeMetrics();
            buildCommunicationNetwork();
            updateDashboard();
            captureAnalyticsSample(true);
            persistAnalyticsFeed(true);

            window.addEventListener("resize", resize);
            window.addEventListener("pagehide", () => {
                captureAnalyticsSample(true);
                schedulePersistentAnalyticsFlush("summary");
                persistAnalyticsFeed(true);
            });

            requestAnimationFrame(loop);
        }

        window.addEventListener("load", init);
