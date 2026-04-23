# Unity Simulation Prototype

This folder is a stronger Unity-ready prototype for a future high-quality traffic simulation platform using `C# + Unity`.

## What is included

- Procedural four-way junction bootstrap
- Adaptive signal controller with `green`, `yellow`, and `all-red` phases
- Visible in-world signal heads that reflect live signal state
- Vehicle spawners for all four corridors and both lanes
- Vehicle following, stop-line control, and smoother junction entry behavior
- Straight, left, and right-turn movement logic
- Live overlay for congestion, queue, throughput, and current/next corridor state

## Files

- `Assets/Scripts/TrafficSimulationBootstrap.cs`
- `Assets/Scripts/TrafficSimulationManager.cs`
- `Assets/Scripts/AdaptiveSignalController.cs`
- `Assets/Scripts/SignalHeadView.cs`
- `Assets/Scripts/TrafficSpawner.cs`
- `Assets/Scripts/VehicleAgent.cs`
- `Assets/Scripts/TrafficMetrics.cs`

## How to use

1. Open `UnitySimulation` in Unity `2022.3 LTS`.
2. Create a new empty scene.
3. Add an empty GameObject.
4. Attach `TrafficSimulationBootstrap`.
5. Press Play.

## What this is not yet

Because Unity is not installed in this coding environment, this is still not a fully editor-authored scene with:

- prefabs
- materials
- imported road assets
- UI canvases
- collision-verified physics tuning
- packaged `.unity` scene metadata

## Best next upgrade steps

1. Build a real `MainIntersection.unity` scene in the editor.
2. Replace primitive cubes with road/vehicle prefabs.
3. Add TextMeshPro dashboard panels and camera switching.
4. Expose Python `traffic_ai` analytics through a local HTTP or WebSocket bridge.
5. Add emergency vehicles, lane priorities, and replay controls.
