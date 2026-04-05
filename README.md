# Smart Traffic Management System for Urban Congestion

This repository now contains two layers of the capstone system:

1. The original HTML simulation for adaptive junction behavior and analytics.
2. A new modular Python traffic-vision platform that works with live camera feeds, uploaded images, or uploaded videos and adds AI-generated suggestions with offline fallback.

## What Is New

The Python system is designed around real traffic footage instead of only simulated vehicles. It keeps the main ideas from the HTML prototype, especially corridor pressure, adaptive intervention, and live analytics, but moves them into a backend that can process real frames and stream them to a live dashboard.

Key additions:

- Live traffic visualization from camera, image, or video
- YOLO-based object detection with an OpenCV fallback detector
- Mixed-traffic scoring tuned for Indian-road style scenes with motorcycles, buses, trucks, pedestrians, and general vehicle density
- Corridor pressure estimation for north, east, south, and west sectors
- Live AI suggestions from OpenAI when online
- Offline fallback suggestions through local rules, with optional Ollama support
- Modular error handling with `try/except` separation across source loading, detection, analytics, advisory, upload, and bootstrap stages
- Auto-install flow for missing Python libraries
- Windows PowerShell launcher that can also install Python and optionally FFmpeg on fresh machines

## Project Structure

- `Simulation/simulation1.html`: original self-contained traffic simulation and dashboard
- `Simulation/traffic-analytics.html`: original standalone live graph dashboard for timeline analytics
- `traffic_ai/config.py`: environment and runtime configuration
- `traffic_ai/services/source_manager.py`: camera, image, and video ingestion
- `traffic_ai/vision/detector.py`: YOLO detector plus OpenCV motion fallback
- `traffic_ai/vision/tracker.py`: lightweight centroid tracking
- `traffic_ai/services/analytics.py`: corridor pressure, congestion, throughput, and controller-note generation
- `traffic_ai/services/advisors.py`: OpenAI, Ollama, and offline advisory chain
- `traffic_ai/services/processor.py`: main live processing loop
- `traffic_ai/web/app.py`: Flask dashboard server and API routes
- `traffic_ai/web/templates/dashboard.html`: existing lightweight HTML dashboard UI
- `traffic_ai/web/templates/control_center.html`: new analysis-to-simulation operator site
- `traffic_ai/web/static/`: dashboard JavaScript and CSS
- `run_traffic_ai.py`: Python bootstrap launcher
- `launch_traffic_ai.ps1`: Windows launcher that can install missing software

## Running The HTML Prototype

Open `Simulation/simulation1.html` in a modern browser.

To view graphs over time, open `Simulation/traffic-analytics.html` in the same browser while the simulation is running. The graph page reads the live analytics feed every second, can load permanently stored sessions from browser storage, and can also import exported JSON logs.

## Running The Python Traffic AI System

### Fastest Windows Start

From PowerShell:

```powershell
.\launch_traffic_ai.ps1
```

Examples:

```powershell
.\launch_traffic_ai.ps1 -SourceType camera -SourceValue 0
.\launch_traffic_ai.ps1 -SourceType video -SourceValue "D:\traffic\junction.mp4"
.\launch_traffic_ai.ps1 -SourceType image -SourceValue "D:\traffic\frame.jpg"
.\launch_traffic_ai.ps1 -InstallSystemTools
```

The PowerShell launcher will:

- try to find Python
- install Python with `winget` if it is missing
- optionally install FFmpeg when `-InstallSystemTools` is used
- start the Python dashboard launcher

### Python Launch

If Python is already installed:

```powershell
python .\run_traffic_ai.py --source-type camera --source-value 0
```

Model selection examples:

```powershell
python .\run_traffic_ai.py --model-family auto --model-priority balanced
python .\run_traffic_ai.py --model-family yolo26 --model-priority quality
python .\run_traffic_ai.py --vision-model .\yolo26m.pt --show-config
```

The launcher now profiles CPU, RAM, and GPU capability and auto-picks a detector family and size for the system. Auto mode prioritizes YOLO26, then uses family defaults when local weights are not available, and finally falls back across safe detector candidates before switching to OpenCV motion detection.

The bootstrap script installs any missing Python packages from `requirements.txt` before starting Flask.

After launch, open either site in your browser:

```text
http://127.0.0.1:8501/control-center
http://127.0.0.1:8501/dashboard
```

The new control-center site lets you:

- watch the live annotated traffic stream
- present four separate `North`, `South`, `East`, and `West` feeds at the top of the page
- assign each direction manually using:
- camera indexes like `0`, `1`, `2`, `3`
- uploaded video clips
- uploaded images
- local file paths
- live stream URLs such as RTSP or HTTP camera feeds
- avoid automatic startup of a default camera feed
- run analysis only from the four manually assigned directional feeds when `Directional Feeds Only` is enabled
- switch camera, image, and video sources
- upload traffic media directly from the browser
- monitor corridor pressure, congestion, throughput, and mobility
- view live AI suggestions and offline fallback alerts
- adjust the corridor split dynamically when the automatic division feels wrong
- push analysis results into a digital-twin simulation stage without touching the original HTML simulation
- manually clear directional screens, set directional priority, and pause the digital twin while analysis keeps running

## OpenAI And Offline Mode

The AI advisory chain runs in this order:

1. OpenAI
2. Ollama if configured
3. Offline rule-based traffic advisor

This means the dashboard keeps working even during internet or API failures. The vision pipeline also stays local after the detector weights are available.

Create a `.env` file from `.env.example` if you want to set your OpenAI key or adjust models:

```powershell
Copy-Item .env.example .env
```

Important environment variables:

- `OPENAI_API_KEY`: required for cloud suggestions
- `OPENAI_MODEL`: default is `gpt-4o-mini`
- `OLLAMA_ENABLED`: set to `true` to use a local LLM fallback
- `VISION_MODEL_PATH`: default is `yolov8n.pt`, but you can replace it with a custom Indian-traffic model
- `MODEL_FAMILY`: optional launch argument for selecting detector family (for example `yolo26`, `rtdetr`, `yolo-world`, `yoloe`)
- `MODEL_PRIORITY`: optional launch argument for `quality`, `balanced`, or `speed`

Note: SAM, SAM2, SAM3, MobileSAM, and FastSAM are segmentation families and are intentionally not auto-selected for this traffic pipeline because it is optimized for box-based detection and tracking.

## Notes On Indian Traffic Scenes

The current analytics layer is tuned for mixed urban traffic and gives special weight to:

- two-wheelers
- buses and trucks
- pedestrian spillover
- corridor crowding and low movement

For higher-quality recognition of Indian-specific categories such as auto-rickshaws, replace `VISION_MODEL_PATH` with a custom fine-tuned YOLO model trained on Indian-road datasets.

## Capstone Extension Ideas

- Custom-trained detection weights for auto-rickshaws, tractors, lane violations, and helmet compliance
- Multi-junction coordination with shared analytics
- Emergency vehicle route prioritization across multiple corridors
- Long-term reporting dashboards and incident replay
- Integration with municipal sensors, edge devices, or mobile operator tools

## Implementation Formulas

The following core mathematical formulas drive the simulation's routing, dynamics, and traffic adaptation:

### 1. Adaptive Green Window (Target Green)
Used to calculate the dynamic signal timing to maintain queue stability:
```javascript
let targetGreen = autoBaseGreenMs + reliefBoostMs - trimPenaltyMs;
// Priority adjustment:
if (emergency) targetGreen += emergencyBoost;
// Congestion adjustments:
if (criticalDelay) targetGreen += 700;
```
* **Auto Base**: Base timing determined by `lightCycleTime` multiplied by relative demand factor.

### 2. Vehicle Spawn Probability
Determines continuous and random generation rates per frame limit:
```javascript
let frameChance =
    (0.0035 + (state.demandIntensity / 220) * 0.022)
    * flow.spawnScale
    * state.governor.ingressScale
    * congestionDamping
    * queueDamping
    * liveDamping;
let dt_adjusted_chance = 1 - Math.pow(1 - frameChance, Math.max(0.35, dt / 16.6667));
```

### 3. Turn Geometry and Path Interpolation
Calculates the trajectory offsets for smooth junction turning without clipping corners:
```javascript
// Start / End control points are aligned to lane center
const control = horizontalEntry
    ? { x: end.x, y: start.y }
    : { x: start.x, y: end.y };
// Using Quadratic Bezier mapping along intersection bounding boxes.
```

### 4. V2V (Vehicle-to-Vehicle) Communication & Yielding
Used for emergency vehicles approaching intersections where crossing traffic must halt:
```javascript
// Broadcast radius condition:
if (distance <= config.broadcastRadius) {
    // Relative pos calculation to yield:
    let offset_target = (this.lane === 1 ? config.laneWidth * 0.12 : -config.laneWidth * 0.1);
}
```

### 5. Congestion Index Rating
Normalized score used by the adaptive manager to shift controller modes (0-100 scale):
```javascript
const throughputRelief = throughputPerMin * 0.62;
state.metrics.congestionIndex =
    totalQueue * 7.2 +
    averageWaitMs / 300 +
    liveVehicles * 0.56 -
    averageSpeedKmh * 0.32 -
    throughputRelief;
```
