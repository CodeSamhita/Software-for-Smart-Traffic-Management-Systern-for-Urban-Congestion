# 📐 Formulas, Expressions, Algorithms & Parameters
## Smart Traffic Management System for Urban Congestion

> **Purpose of this file:** This document explains every mathematical formula,
> scoring expression, algorithm, and configuration parameter used in the system.
> Each entry includes: what it is, why it exists, and how it is calculated.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Vehicle Detection Formulas](#2-vehicle-detection-formulas)
3. [Object Tracking Algorithm — Centroid Tracker](#3-object-tracking-algorithm--centroid-tracker)
4. [Vehicle Weighting Scheme](#4-vehicle-weighting-scheme)
5. [Corridor Assignment Algorithm](#5-corridor-assignment-algorithm)
6. [Corridor Pressure Score Formula](#6-corridor-pressure-score-formula)
7. [Congestion Index Formula](#7-congestion-index-formula)
8. [Mobility Score Formula](#8-mobility-score-formula)
9. [Throughput Calculation](#9-throughput-calculation)
10. [FPS (Frames Per Second) Calculation](#10-fps-frames-per-second-calculation)
11. [Simulation — Traffic Signal Logic](#11-simulation--traffic-signal-logic)
12. [Simulation — Corridor Pressure (Frontend)](#12-simulation--corridor-pressure-frontend)
13. [Simulation — Vehicle Motion Physics](#13-simulation--vehicle-motion-physics)
14. [Emergency Preemption Scoring](#14-emergency-preemption-scoring)
15. [Speed Estimation Formula](#15-speed-estimation-formula)
16. [Advisory & Alert Thresholds](#16-advisory--alert-thresholds)
17. [Operator State Parameter Bounds](#17-operator-state-parameter-bounds)
18. [Configuration Parameters Reference](#18-configuration-parameters-reference)
19. [Data Models Reference](#19-data-models-reference)
20. [Flow Mode Scaling Parameters](#20-flow-mode-scaling-parameters)

---

## 1. System Architecture Overview

The system is built in two complementary layers:

```
┌─────────────────────────────────────────────────────────┐
│               LIVE TRAFFIC AI BACKEND (Python)          │
│                                                         │
│  Camera / Video → YOLO Detector → Centroid Tracker      │
│                        ↓                                │
│              Analytics Engine (per-frame)               │
│                        ↓                                │
│    Corridor Pressure │ Congestion Index │ Mobility Score │
│                        ↓                                │
│  Advisory Orchestrator (OpenAI → Ollama → Rule-Based)   │
│                        ↓                                │
│              Flask REST API + MJPEG Stream              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│         BROWSER SIMULATION FRONTEND (JavaScript)        │
│                                                         │
│  Canvas 2D Renderer → Vehicle Entities → Signal States  │
│           ↓                     ↓                       │
│   Adaptive Controller    V2V Communication Layer        │
│           ↓                                             │
│   Emergency Preemption / AI Advisor (OpenAI API)        │
└─────────────────────────────────────────────────────────┘
```

**Why two layers?**  
- The **Python backend** processes real camera feeds using computer vision and AI.  
- The **JavaScript frontend** provides a browser-based simulation for testing logic and visualising signal timing without requiring real hardware.

---

## 2. Vehicle Detection Formulas

### 2.1 YOLO Confidence Filtering

```
Accept detection  iff  confidence ≥ VISION_CONFIDENCE (default: 0.35)
```

**What it is:** YOLOv8 assigns a probability score (0–1) to each detected bounding box. Only boxes above the threshold are kept.

**Why 0.35?** This is a balance point for mixed Indian road traffic — lower values produce too many false positives (shadow blobs, signboards); higher values miss motorcycles at the edge of the frame.

### 2.2 Intersection-over-Union (IoU) — Duplicate Suppression

```
IoU(A, B) = Area(A ∩ B) / Area(A ∪ B)

Suppress box B  iff  IoU(A, B) > IOU_THRESHOLD (default: 0.50)
```

**What it is:** When YOLO predicts two overlapping boxes for the same vehicle, IoU tells us how much they overlap. Boxes that overlap more than 50% are treated as duplicates and the weaker one is discarded (Non-Maximum Suppression).

**Why 0.50?** In dense traffic, vehicles genuinely overlap in the camera view. A threshold of 0.5 removes true duplicates while keeping adjacent (but separate) vehicles.

### 2.3 Bounding Box Center Calculation

```
center_x = (x1 + x2) // 2
center_y = (y1 + y2) // 2
```

**What it is:** The geometric center of each detected bounding box. This single point is used for corridor assignment and centroid tracking.

**Why the center?** Using the center avoids edge-case instability (e.g., a vehicle partially off-screen), and it is computationally cheap.

### 2.4 Motion Detection Fallback — Contour Area Filter

```
Accept contour  iff  contourArea(contour) ≥ MIN_AREA (default: 900 px²)
```

**What it is:** When YOLO is unavailable, the system falls back to OpenCV's Background Subtractor (MOG2). Small blobs (noise, leaves, shadows) are discarded using this minimum area threshold.

**Why 900 px²?** At 1280×720 resolution a 30×30 pixel block (≈900 px²) roughly corresponds to a very small motorcycle tail visible at medium distance.

---

## 3. Object Tracking Algorithm — Centroid Tracker

### 3.1 Euclidean Distance Between Centroids

```
distance(A, B) = √[(xA − xB)² + (yA − yB)²]
```

**What it is:** The straight-line pixel distance between a known track's last centroid and a new detection's centroid. This is the core matching criterion.

**Why Euclidean?** It is fast (no matrix inversion), sufficient for 2D image-plane tracking, and works well at the relatively low frame rates (12 FPS target) of this system.

### 3.2 Greedy Assignment Rule

```
For each existing track T:
    Find detection D* = argmin distance(T.centroid, D.center)
    If distance(T.centroid, D*.center) ≤ MAX_DISTANCE (95 px):
        Match T ← D*   (remove D* from unmatched pool)
    Else:
        T.missed_frames += 1
```

**What it is:** Each track grabs the closest unassigned detection. This greedy approach (not globally optimal) was chosen because at 12 FPS the movement between frames is small enough that greedy matching almost never makes errors.

**Why 95 pixels?** At 12 FPS and typical urban speeds (≤30 km/h at typical camera height), a vehicle moves at most ~80–100 pixels between frames. 95 px is the safe upper bound that prevents false associations across lanes.

### 3.3 Track Deletion Rule

```
Delete track T  iff  T.missed_frames > MAX_MISSED (default: 10 frames)
```

**Why 10 frames?** At 12 FPS this is ~0.83 seconds — long enough to survive momentary occlusion (e.g., a vehicle hidden behind a bus for half a second) without leaking zombie tracks for too long.

### 3.4 Exit Detection Rule

```
Vehicle exited  iff  T.missed_frames > MAX_MISSED
                     AND (T.age_frames ≥ 2 OR T.centroid is near edge)

Near edge:  center_x ≤ EXIT_MARGIN (48 px)  OR  center_y ≤ EXIT_MARGIN (48 px)
```

**Why is exit detection important?** Exited vehicles increment the **Throughput** counter. Only tracks that were seen for at least 2 frames (or vanished at the frame boundary) count — this filters out one-frame ghost detections.

---

## 4. Vehicle Weighting Scheme

Each vehicle class is assigned a **Passenger Car Unit (PCU)** equivalent weight. This is inspired by the Highway Capacity Manual methodology, adapted for Indian mixed traffic.

| Vehicle Class  | Weight | Reason |
|:---------------|:------:|:-------|
| car            | 1.00   | Baseline reference unit |
| vehicle (generic) | 1.00 | Unknown type treated as car |
| auto-rickshaw  | 0.90   | Slightly narrower than car, lower speed |
| motorcycle     | 0.70   | One lane width, high maneuverability |
| bicycle        | 0.45   | Narrow, slow, easily filtered |
| bus            | 2.50   | Occupies full lane, slow acceleration |
| truck          | 2.80   | Longest stopping distance, full lane |
| tractor        | 2.60   | Large frame + low speed |

### Weighted Count Formula

```
weighted_count(corridor) = Σ VEHICLE_WEIGHTS[label]  for each detection in corridor
```

**Why weighting?** A simple vehicle count would treat a bicycle the same as a bus. Weighting captures the true road-space demand. A corridor with 5 buses is far more congested than one with 5 motorcycles.

---

## 5. Corridor Assignment Algorithm

The frame is divided into 4 corridors (North, South, East, West) based on the position of each detection relative to a configurable **zone center point**.

```
dx = center_x − (frame_width  × zone_center_x_ratio)
dy = center_y − (frame_height × zone_center_y_ratio)

If |dy| ≥ |dx|:
    corridor = "north"  if dy < 0
    corridor = "south"  if dy ≥ 0
Else:
    corridor = "west"   if dx < 0
    corridor = "east"   if dx ≥ 0
```

**What it is:** The relative displacement from the intersection center decides the quadrant. The dominant axis (whichever of `|dx|` or `|dy|` is larger) determines whether the vehicle is North/South or East/West.

**Why axis-dominance?** A vehicle exactly on the diagonal would be ambiguous. Using the dominant axis produces cleaner boundaries that match real-world lane geometry (approaches come in along one axis, not diagonally).

**zone_center_x_ratio / zone_center_y_ratio** are operator-adjustable (range: 0.2–0.8) so the intersection center can be repositioned when the camera is not perfectly centered. Default is 0.5 (frame midpoint).

---

## 6. Corridor Pressure Score Formula

**Corridor Pressure** is a 0–100 score representing how urgently signal green-time is needed on that approach.

```
density_score = min(100, weighted_count × 14.0)

motion_score  = min(100, (average_motion / target_motion) × 100)
              = 100   if vehicle_count == 0   (no vehicles → perfectly mobile)

heavy_penalty       = min(16, heavy_vehicle_count × 5.5)
two_wheeler_penalty = 8   if two_wheeler_count ≥ 6  else 0
pedestrian_penalty  = min(10, pedestrian_count × 1.8)

Pressure = min(100,
    (density_score   × 0.68)
  + ((100 − motion_score) × 0.32)
  + heavy_penalty
  + two_wheeler_penalty
  + pedestrian_penalty
)
```

### Breaking Down Each Term

#### Density Score (weight 0.68)
```
density_score = min(100, weighted_count × 14.0)
```
- Converts PCU-weighted vehicle count into a 0–100 score.
- Multiplier **14.0** means a corridor with ~7 PCU-weighted vehicles hits 98/100.
- This is the **dominant** term (68% weight) because raw queue length is the most direct signal that a green is needed.

#### Motion Score Deficit (weight 0.32)
```
target_motion = √(frame_width² + frame_height²) × 0.055
speed_deficit = 100 − motion_score
```
- `target_motion` is 5.5% of the frame diagonal — the expected pixel-per-second speed of a freely moving vehicle at that resolution.
- If vehicles are stopped or slow, `motion_score` is low → `(100 − motion_score)` is high → pressure increases.
- This captures **queue formation** even before the absolute count rises.

#### Heavy Vehicle Penalty
```
heavy_penalty = min(16, heavy_vehicle_count × 5.5)
```
- Each bus/truck/tractor adds 5.5 pressure points (capped at 16).
- **Why?** Heavy vehicles have longer stopping distances and wider turning arcs. A corridor with 3 buses needs a much longer green phase than one with 3 cars.

#### Two-Wheeler Penalty
```
two_wheeler_penalty = 8  if (motorcycle_count + bicycle_count) ≥ 6
```
- A flat 8-point penalty triggers when there are ≥6 two-wheelers.
- **Why?** Motorcycles weave between lanes and create friction that slows clearance more than raw count suggests.

#### Pedestrian Penalty
```
pedestrian_penalty = min(10, pedestrian_count × 1.8)
```
- Pedestrians near the carriageway add up to 10 points.
- **Why?** Pedestrian spillover forces vehicles to slow and increases conflict risk, but does not contribute to weighted_count (they are not vehicles).

---

## 7. Congestion Index Formula

**Congestion Index** is a global 0–100 score for overall intersection health.

```
weighted_total    = Σ weighted_count(c)  for all corridors c
average_mobility  = mean(motion_score(c))  for all corridors c
pedestrian_total  = Σ pedestrian_count(c)  for all corridors c

congestion_index = min(100,
    (min(100, weighted_total × 9.5)  × 0.65)
  + ((100 − average_mobility)        × 0.35)
  + min(8, pedestrian_total × 1.2)
)
```

### Breaking Down Each Term

#### Global Density Component (weight 0.65)
```
global_density_score = min(100, weighted_total × 9.5)
```
- Multiplier **9.5** — at ~10.5 total PCU units the density component saturates.
- This captures how full the entire intersection is.

#### Global Immobility Component (weight 0.35)
```
immobility = 100 − average_mobility
```
- Averaged across all four corridors.
- Captures widespread slowdowns even when no individual corridor looks critically overloaded.

#### Pedestrian Friction Term
```
pedestrian_term = min(8, pedestrian_total × 1.2)
```
- Small additive penalty (max 8 points) for pedestrian activity across the full intersection.
- **Why 1.2?** Lighter than per-corridor because intersection-wide pedestrian counts are noisy at low counts.

### Congestion Bands

| Index range | Band label | Meaning |
|:-----------:|:----------:|:--------|
| 0 – 27 | Low | No intervention needed |
| 28 – 49 | Moderate | Watch and prepare |
| 50 – 74 | Heavy | Apply adaptive extension |
| 75 – 100 | Critical | Immediate intervention required |

---

## 8. Mobility Score Formula

**Mobility Score** is a per-corridor speed ratio expressed as 0–100.

```
target_motion  = frame_diagonal × 0.055
             where frame_diagonal = √(width² + height²)

mobility_score(corridor) =
    min(100, (average_speed_px_per_s / target_motion) × 100)
    if corridor.vehicle_count > 0
    else 100
```

**What it means:**
- `100` = vehicles are moving at a natural speed for the scene.
- `0` = vehicles are completely stopped.
- Values > 100 are capped at 100 (fast-moving light traffic is just "good", not "super-good").

**Why 5.5% of diagonal?** At 1280×720 the diagonal is ~1469 px. `1469 × 0.055 ≈ 81 px/s`. At 12 FPS a vehicle moving ~7 px per frame travels at that speed, which corresponds to roughly 20–25 km/h at typical camera-to-road distances — a reasonable urban cruise speed.

**Average mobility** is the simple arithmetic mean across all four corridors:

```
average_mobility = (mobility_N + mobility_E + mobility_S + mobility_W) / 4
```

---

## 9. Throughput Calculation

**Throughput** measures how many vehicles have cleared the intersection per minute.

```
throughput_per_minute = count of exit events in the last 60 seconds
```

**Algorithm:**
1. Every time a track is deleted after being matched for ≥2 frames (or at frame edge), one exit event timestamp is appended.
2. Events older than 60 seconds are discarded from the queue.
3. The queue length at any moment is the throughput per minute.

**Why 60-second sliding window?** Unlike fixed-interval counters (which would reset to 0 at the minute boundary), a sliding window gives a smooth, continuously updating throughput value that operators can read at any moment.

---

## 10. FPS (Frames Per Second) Calculation

**FPS** is computed as a sliding exponential-style average over the last 24 frame timestamps.

```
delta        = current_timestamp − last_frame_timestamp
instant_fps  = 1.0 / max(delta, 0.001)      ← guard against zero-division

FPS_buffer.append(instant_fps)  [buffer size: 24]
reported_fps = mean(FPS_buffer)
```

**Why average over 24 frames?** Instant FPS is very noisy (a single slow frame from a heavy YOLO inference round drags it down). Averaging over 24 frames at 12 FPS covers a ~2-second window, giving a stable readout.

---

## 11. Simulation — Traffic Signal Logic

The browser simulation implements two signal control modes.

### 11.1 Fixed-Cycle Mode

```
Phase duration = lightCycleTime (operator-set, default: 5500 ms)
Rotation: North → East → South → West → (repeat)
```

Each corridor gets exactly one equal-length green phase. This is the baseline ("dumb signal") for comparison.

### 11.2 Adaptive Controller — Green Time Calculation

The adaptive controller dynamically calculates a target green time based on queue pressure.

```
pressureImbalance = max_pressure − avg_pressure

// Base green time scales with queue imbalance
autoBaseGreenMs = baseGreenMs + (pressureImbalance × scalingFactor)

// Hard clamp
minGreenMs = baseGreenMs × 0.45
maxGreenMs = baseGreenMs × 2.20
targetGreenMs = clamp(autoBaseGreenMs, minGreenMs, maxGreenMs)
```

**What this achieves:** The busier the hottest corridor is relative to the average, the more green time it receives — up to 2.2× the base. Light corridors never get less than 45% of the base time (starvation prevention).

### 11.3 Phase Selection — Corridor Priority

```
active_corridor = argmax pressure(c)  for all c with vehicles
```

The corridor with the highest pressure score (calculated identically to the Python backend) is awarded next green.

**Constraint overrides (in priority order):**
1. **Emergency preemption** — corridor of the priority vehicle always wins.
2. **Spillback protection** — if a corridor queue exceeds a critical threshold, it cannot be skipped.
3. **Starvation protection** — a corridor that has been waiting too long forces itself into selection.
4. **Queue override** — extreme queue on one corridor directly overrides adaptive scoring.

---

## 12. Simulation — Corridor Pressure (Frontend)

The JavaScript simulation uses the same conceptual formula as the Python backend but adapted for simulation entities:

```
queue_pressure   = queue_count × queueWeight
approach_pressure = approaching_count × approachWeight
incoming_pressure = incoming_count × incomingWeight
priority_boost    = priorityCount × priorityWeight

corridor_pressure = queue_pressure + approach_pressure + incoming_pressure + priority_boost
```

Where:
- `queue` = vehicles stopped at red behind the stop line.
- `approaching` = vehicles in-lane decelerating toward the stop line.
- `incoming` = vehicles in the spawn zone heading toward the intersection.
- `priority` = emergency vehicles (weighted extra heavily to force preemption).

---

## 13. Simulation — Vehicle Motion Physics

Each simulated vehicle is a simple kinematic entity.

### 13.1 Cruise Speed

```
cruise_speed = maxSpeed × flowMode.cruiseScale × vehicleTypeScale
             [default maxSpeed = 5.5 px/frame at 60 FPS]
```

### 13.2 Acceleration

```
v(t+1) = v(t) + ACCEL_RATE × frameFactor(dt)   if heading to green
ACCEL_RATE = 0.078 px/frame²
```

### 13.3 Deceleration (Braking)

```
v(t+1) = v(t) − BRAKE_DECEL × frameFactor(dt)  if obstacle or red signal ahead
BRAKE_DECEL = 0.31 px/frame²
```

**Why asymmetric accel/decel?** Braking (0.31) is ~4× stronger than acceleration (0.078), matching real vehicle dynamics — you stop much faster than you can accelerate from rest.

### 13.4 Frame Factor Normalization

```
frameFactor(dt) = clamp(dt / 16.6667, 0.65, 1.9)
```

**What it is:** Normalizes physics updates for variable frame times. `16.6667 ms = 1/60s` is the ideal 60-FPS frame time. If a frame is slower, the physics step is proportionally larger (up to 1.9×). Clamping prevents runaway physics on very slow frames.

### 13.5 Safe Following Distance

```
target_gap = safeDistance × flowMode.gapScale
safeDistance = 36 px  (default)
```

A vehicle decelerates if it detects another vehicle or the stop line within `target_gap` pixels ahead.

### 13.6 Speed to km/h Conversion (display only)

```
speed_kmh = speed_px_per_frame × (pixel_meter_ratio × FPS × 3.6)
```

A calibration constant converts pixel velocity to km/h for the dashboard readout.

---

## 14. Emergency Preemption Scoring

When an emergency vehicle is dispatched, it is scored to determine signal priority urgency:

```
score = base_type_boost + action_boost + queue_bonus − eta_penalty

base_type_boost  = EMERGENCY_TYPES[type].controllerBoost    (14–18)
action_boost     = EMERGENCY_ACTIONS[action].controllerBoost (6–10)
queue_bonus      = corridor.queue_count × 0.5
eta_penalty      = eta_ms / 1000 × 0.2   (discount for far-away vehicles)
```

**Why penalize ETA?** A very distant emergency vehicle should not block a badly congested corridor for too long before it actually arrives. The penalty tapers as it gets closer.

### Emergency Type Parameters

| Type | Color | Speed Bonus | Broadcast Radius | Priority Boost |
|:-----|:-----:|:-----------:|:----------------:|:--------------:|
| Ambulance | Orange | 1.30× | 260 px | 18 |
| Police | Blue | 1.22× | 230 px | 15 |
| Fire & Rescue | Red | 1.18× | 250 px | 17 |
| Disaster Response | Purple | 1.12× | 220 px | 14 |

### Emergency Action Parameters

| Action | Green Bonus | Hold Cross-Traffic | All-Red Duration |
|:-------|:-----------:|:------------------:|:----------------:|
| Priority Passage | 1800 ms | Yes | 0 ms |
| Intersection Lockdown | 1400 ms | Yes | 1200 ms |
| Rescue Convoy | 3200 ms | Yes | 600 ms |
| Evacuation Wave | 2600 ms | No | 0 ms |

---

## 15. Speed Estimation Formula

### Backend (Python) — Pixel Speed

```
delta_seconds = current_time − last_seen_time
instant_speed_px_s = euclidean_distance / delta_seconds

smoothed_speed = (previous_speed × 0.6) + (instant_speed × 0.4)
```

**What it is:** An exponential moving average (EMA) with α = 0.4. Recent measurements contribute 40%, historical smoothed value contributes 60%.

**Why EMA?** Raw pixel-per-second values jump erratically frame-to-frame due to detection jitter. An EMA produces stable speed readings without needing a large buffer.

### EMA Interpretation

```
effective_memory ≈ 1 / (1 − 0.6) = 2.5 frames
```

The speed estimate "remembers" approximately the last 2.5 frames (~0.2 seconds at 12 FPS), which is about the right lag for smooth display without losing responsiveness.

---

## 16. Advisory & Alert Thresholds

These thresholds trigger automated alerts and advisor recommendations.

### Alert Rules

| Condition | Alert Message |
|:----------|:-------------|
| `congestion_index ≥ 75` | "System congestion is high and needs intervention." |
| `congestion_index ≥ 55` | "Traffic is building up and should be watched closely." |
| `pedestrian_count ≥ 6` | "Pedestrian spillover detected near the carriageway." |
| `heavy_vehicle_count ≥ 2  AND  corridor_pressure ≥ 55` | "Heavy vehicles are clustering on the [N/S/E/W] approach." |
| `two_wheeler_count ≥ 8` | "High two-wheeler density on the [N/S/E/W] corridor." |

### Controller Note Rules (Human-Readable Advice)

| Condition | Controller Note |
|:----------|:----------------|
| No vehicles detected | "Traffic is light. Keep short adaptive cycles." |
| `congestion_index ≥ 75` | "Extend green time, meter cross-flow, manually discipline clusters." |
| `two_wheeler_count ≥ 6` | "Favor smoother release waves, keep protected buffer near stop line." |
| `pedestrian_count ≥ 6` | "Keep a safer crossing gap before restoring full green." |
| Default | "Favor slightly longer green window on hottest corridor." |

### Rule-Based Advisor Thresholds

| Condition | Recommendation triggered |
|:----------|:------------------------|
| `congestion_index ≥ 75` | Trigger longer green extension, meter cross-flow, operator alert |
| `congestion_index ≥ 55` | Moderate adaptive extension, monitor hot corridor |
| `two_wheeler_total ≥ 8` | Smoother release waves, stop-line clearance |
| `heavy_total ≥ 3` | Avoid sharp signal flips that trap long vehicles |
| `pedestrian_total ≥ 6` | Insert pedestrian gap before restoring vehicle priority |

---

## 17. Operator State Parameter Bounds

These are the clamping rules applied when an operator updates state via the dashboard.

| Parameter | Min | Max | Default | Why |
|:----------|:---:|:---:|:-------:|:----|
| `zone_center_x` | 0.2 | 0.8 | 0.5 | Keeps center inside the frame with 20% margin |
| `zone_center_y` | 0.2 | 0.8 | 0.5 | Same — prevents degenerate corridor splits |
| `simulation_speed` | 0.5 | 2.0 | 1.0 | Half to double speed; beyond 2× physics becomes unstable |

```python
zone_center_x = clamp(input, 0.2, 0.8)
zone_center_y = clamp(input, 0.2, 0.8)
simulation_speed = clamp(input, 0.5, 2.0)
```

---

## 18. Configuration Parameters Reference

All parameters are loaded from environment variables with safe defaults.

| Parameter | Env Var | Default | What it controls |
|:----------|:--------|:-------:|:-----------------|
| `target_fps` | `TARGET_FPS` | 12.0 | Target processing frame rate |
| `history_limit` | `HISTORY_LIMIT` | 180 | Number of timeline snapshots to keep in memory |
| `advisor_interval_seconds` | `ADVISOR_INTERVAL_SECONDS` | 6.0 s | How often the AI advisor is called |
| `detector_confidence` | `VISION_CONFIDENCE` | 0.35 | Minimum YOLO detection confidence |
| `detector_iou` | `VISION_IOU` | 0.50 | IoU threshold for duplicate suppression |
| `frame_width` | `FRAME_WIDTH` | 1280 px | Camera/video capture width |
| `frame_height` | `FRAME_HEIGHT` | 720 px | Camera/video capture height |
| `openai_timeout_seconds` | `OPENAI_TIMEOUT_SECONDS` | 15.0 s | Max wait for OpenAI API |
| `openai_model` | `OPENAI_MODEL` | `gpt-4o-mini` | Model for cloud advisor |
| `ollama_model` | `OLLAMA_MODEL` | `llama3.2` | Local offline LLM model |

### Centroid Tracker Parameters (hardcoded defaults)

| Parameter | Default | Meaning |
|:----------|:-------:|:--------|
| `max_distance` | 95 px | Max centroid jump to still re-use a track ID |
| `max_missed` | 10 frames | Frames without detection before track is deleted |
| `exit_margin` | 48 px | Pixel margin from edge considered an "exit point" |

### MJPEG Stream Timing

```
frame_yield_interval = 0.08 s  (≈12.5 FPS stream to browser)
```

**Why 0.08s?** This matches the 12 FPS processing target. Faster would re-send the same frame redundantly; slower would introduce visible lag.

---

## 19. Data Models Reference

### Detection

A single bounding-box prediction from the detector.

| Field | Type | Description |
|:------|:-----|:------------|
| `label` | str | Normalized vehicle class (e.g. "car", "bus") |
| `confidence` | float | YOLO prediction probability (0–1) |
| `x1, y1` | int | Top-left corner of bounding box (pixels) |
| `x2, y2` | int | Bottom-right corner of bounding box (pixels) |
| `track_id` | int ∣ None | Assigned by tracker after matching |
| `center` | (int, int) | Computed: `((x1+x2)//2, (y1+y2)//2)` |

### Track

A persistent vehicle identity maintained across frames.

| Field | Type | Description |
|:------|:-----|:------------|
| `track_id` | int | Globally unique, monotonically increasing |
| `label` | str | Vehicle class inherited from first detection |
| `x, y` | int | Current centroid position |
| `speed_px_per_s` | float | EMA-smoothed pixel speed |
| `age_frames` | int | Frame count since first seen |
| `last_seen` | float | UNIX timestamp of last matched frame |

### CorridorState

Per-approach statistics computed each frame.

| Field | Type | Description |
|:------|:-----|:------------|
| `vehicle_count` | int | Raw detected vehicles |
| `weighted_count` | float | PCU-weighted vehicle count |
| `pedestrian_count` | int | Detected persons |
| `heavy_vehicle_count` | int | Bus + truck + tractor count |
| `two_wheeler_count` | int | Motorcycle + bicycle count |
| `average_motion` | float | Mean speed of tracked vehicles (px/s) |
| `pressure` | float | Corridor pressure score (0–100) |
| `dominant_labels` | list[str] | Top 2 vehicle types by count |

### TrafficSnapshot

Full system state at one moment in time.

| Field | Type | Description |
|:------|:-----|:------------|
| `vehicle_count` | int | Total vehicles across all corridors |
| `congestion_index` | float | Global congestion score (0–100) |
| `mobility_score` | float | Global mobility (0–100) |
| `throughput_per_min` | float | Vehicles cleared in last 60 s |
| `recommended_corridor` | str | Corridor with highest pressure |
| `controller_note` | str | Human-readable advisory text |
| `alerts` | list[str] | Triggered alert messages (max 5) |

---

## 20. Flow Mode Scaling Parameters

The simulation supports three flow modes that scale all motion-related parameters.

| Parameter | Smooth | Balanced | Fast | Description |
|:----------|:------:|:--------:|:----:|:------------|
| `cruiseScale` | 0.90 | 1.00 | 1.08 | Cruise speed multiplier |
| `spawnScale` | 0.82 | 1.00 | 1.12 | Vehicle spawn rate multiplier |
| `gapScale` | 1.34 | 1.00 | 0.90 | Following gap multiplier |
| `reactionScale` | 0.76 | 1.00 | 1.12 | Braking reaction time multiplier |
| `turnCapScale` | 0.78 | 1.00 | 1.08 | Max turning speed multiplier |
| `randomStopRateScale` | 0.55 | 1.00 | 1.10 | Random stall probability |
| `junctionCautionScale` | 1.20 | 1.00 | 0.88 | Caution zone length at junction |

**Smooth mode** — longer gaps, slower cruise, more caution at signals. Best for studying pedestrian conflict and heavy-vehicle interaction.

**Balanced mode** — all scales at 1.0. Reference baseline for comparing adaptive vs. fixed controllers.

**Fast mode** — tighter gaps, faster spawning, reduced caution. Stress-tests the controller under high-throughput conditions.

---

## Summary: Formula Quick Reference

| Formula | Expression |
|:--------|:-----------|
| Bounding box center | `((x1+x2)//2, (y1+y2)//2)` |
| Centroid distance | `√[(Δx)² + (Δy)²]` |
| Speed EMA | `speed = (prev_speed × 0.6) + (instant × 0.4)` |
| FPS averaged | `FPS = mean(last 24 instant FPS values)` |
| Throughput | `count of exit events in last 60 s` |
| Weighted count | `Σ VEHICLE_WEIGHT[label]` |
| Density score | `min(100, weighted_count × 14.0)` |
| Motion score | `min(100, (avg_speed / target_speed) × 100)` |
| Heavy penalty | `min(16, heavy_count × 5.5)` |
| Pedestrian penalty | `min(10, pedestrian_count × 1.8)` |
| Corridor pressure | `(density × 0.68) + (immobility × 0.32) + penalties` |
| Congestion index | `(global_density × 0.65) + (immobility × 0.35) + ped_term` |
| Recommended corridor | `argmax pressure(c)` across active corridors |
| Zone corridor split | Dominant axis of (dx, dy) from zone center |
| IoU | `Area(A∩B) / Area(A∪B)` |
| Frame factor | `clamp(dt/16.667, 0.65, 1.9)` |

---

*Generated from source analysis of `traffic_ai/services/analytics.py`, `traffic_ai/services/processor.py`, `traffic_ai/services/advisors.py`, `traffic_ai/vision/detector.py`, `traffic_ai/vision/tracker.py`, `traffic_ai/config.py`, `traffic_ai/models.py`, and `Simulation/js/simulation-app.js`.*
