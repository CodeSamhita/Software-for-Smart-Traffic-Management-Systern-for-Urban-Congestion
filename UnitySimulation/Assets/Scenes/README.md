# Unity Scene Setup

1. Open `UnitySimulation` in Unity `2022.3 LTS`.
2. Create a new scene named `MainIntersection`.
3. Add an empty GameObject named `SimulationBootstrap`.
4. Attach `TrafficSimulationBootstrap` to it.
5. Press Play.

The bootstrap script creates:
- a top-down camera
- procedural roads and lane markers
- stop lines
- signal head visuals
- four corridor spawners
- an adaptive traffic signal controller with yellow and all-red clearance
- moving vehicle agents with following distance and turning behavior

This scaffold is procedural on purpose so the project is usable even before custom prefabs, imported models, or a polished scene are added.
