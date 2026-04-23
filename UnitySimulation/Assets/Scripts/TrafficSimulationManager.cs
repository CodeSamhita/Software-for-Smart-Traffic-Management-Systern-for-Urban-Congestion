using System.Collections.Generic;
using UnityEngine;

namespace SmartTraffic.UnitySim
{
    public sealed class TrafficSimulationManager : MonoBehaviour
    {
        [Header("Vehicle Settings")]
        [SerializeField] private Vector3 vehicleScale = new Vector3(1.2f, 0.9f, 2.4f);
        [SerializeField] private float laneOffset = 1.4f;
        [SerializeField] private float spawnRadius = 24f;
        [SerializeField] private float stopLineOffset = 7.5f;
        [SerializeField] private float junctionRadius = 6f;
        [SerializeField] private float leadVehicleGap = 4.2f;

        [Header("Demand")]
        [SerializeField] private float leftTurnChance = 0.18f;
        [SerializeField] private float rightTurnChance = 0.24f;
        [SerializeField] private int softVehicleCap = 42;
        [SerializeField] private int perCorridorSoftCap = 14;

        [Header("Debug")]
        [SerializeField] private bool showOverlay = true;

        private readonly List<VehicleAgent> _vehicles = new();
        private readonly List<TrafficSpawner> _spawners = new();

        private AdaptiveSignalController _signalController;
        private float _roadLength;
        private float _roadWidth;
        private float _laneSpacing;
        private int _completedVehicles;
        private float _throughputWindowStartedAt;
        private int _throughputWindowCount;
        private SimulationSnapshot _snapshot;

        public AdaptiveSignalController SignalController => _signalController;
        public float JunctionRadius => junctionRadius;

        public void Configure(AdaptiveSignalController signalController, float roadLength, float roadWidth, float laneSpacing)
        {
            _signalController = signalController;
            _roadLength = roadLength;
            _roadWidth = roadWidth;
            _laneSpacing = laneSpacing;

            if (_spawners.Count == 0)
            {
                CreateSpawners();
            }
        }

        private void Update()
        {
            PruneDestroyedVehicles();
            _snapshot = BuildSnapshot();

            if (_signalController != null)
            {
                _signalController.Tick(Time.deltaTime, _snapshot, Time.time);
            }

            if (Time.time - _throughputWindowStartedAt >= 60f)
            {
                _throughputWindowStartedAt = Time.time;
                _throughputWindowCount = 0;
            }
        }

        public void TrySpawn(CorridorDirection direction, int laneIndex)
        {
            if (_vehicles.Count >= softVehicleCap || CountCorridorVehicles(direction) >= perCorridorSoftCap)
            {
                return;
            }

            var spawnPosition = GetSpawnPosition(direction, laneIndex);
            if (!IsSpawnPointClear(spawnPosition))
            {
                return;
            }

            var turnChoice = PickTurnChoice(laneIndex);
            var directionVector = GetDirectionVector(direction);
            var vehicle = CreateVehicle(direction, laneIndex, turnChoice, spawnPosition, directionVector);
            _vehicles.Add(vehicle);
        }

        public bool CanVehicleProceed(VehicleAgent vehicle)
        {
            if (vehicle == null)
            {
                return false;
            }

            if (vehicle.HasEnteredJunction)
            {
                return true;
            }

            return _signalController != null && _signalController.CanProceed(vehicle.Origin);
        }

        public bool TryGetLeadVehicle(VehicleAgent vehicle, out VehicleAgent leadVehicle, out float gap)
        {
            leadVehicle = null;
            gap = float.PositiveInfinity;

            foreach (var other in _vehicles)
            {
                if (other == null || other == vehicle || other.Origin != vehicle.Origin || other.LaneIndex != vehicle.LaneIndex)
                {
                    continue;
                }

                var signedGap = GetSignedProgress(other) - GetSignedProgress(vehicle);
                if (signedGap <= 0f || signedGap >= gap)
                {
                    continue;
                }

                gap = signedGap;
                leadVehicle = other;
            }

            if (leadVehicle == null)
            {
                gap = float.PositiveInfinity;
                return false;
            }

            gap = Mathf.Max(0f, gap - leadVehicleGap);
            return true;
        }

        public float GetDistanceToStopLine(VehicleAgent vehicle)
        {
            var position = vehicle.transform.position;
            return vehicle.Origin switch
            {
                CorridorDirection.North => position.z - stopLineOffset,
                CorridorDirection.South => -stopLineOffset - position.z,
                CorridorDirection.East => -stopLineOffset - position.x,
                _ => position.x - stopLineOffset,
            };
        }

        public bool HasConflictingJunctionOccupant(VehicleAgent vehicle)
        {
            foreach (var other in _vehicles)
            {
                if (other == null || other == vehicle || !other.HasEnteredJunction)
                {
                    continue;
                }

                if (other.Origin == vehicle.Origin)
                {
                    continue;
                }

                if (Vector3.Distance(vehicle.transform.position, other.transform.position) < junctionRadius * 1.4f)
                {
                    return true;
                }
            }

            return false;
        }

        public Vector3 GetTargetDirection(CorridorDirection origin, VehicleTurnChoice turnChoice)
        {
            var forward = GetDirectionVector(origin);
            if (turnChoice == VehicleTurnChoice.Left)
            {
                return Vector3.Cross(Vector3.up, forward).normalized;
            }

            if (turnChoice == VehicleTurnChoice.Right)
            {
                return Vector3.Cross(forward, Vector3.up).normalized;
            }

            return forward;
        }

        public void NotifyVehicleExited(VehicleAgent vehicle)
        {
            _vehicles.Remove(vehicle);
            _completedVehicles += 1;
            _throughputWindowCount += 1;
        }

        private void CreateSpawners()
        {
            foreach (CorridorDirection direction in System.Enum.GetValues(typeof(CorridorDirection)))
            {
                for (var lane = 0; lane < 2; lane += 1)
                {
                    var spawnerObject = new GameObject($"{direction}_Lane_{lane}_Spawner");
                    spawnerObject.transform.SetParent(transform, false);
                    spawnerObject.transform.position = GetSpawnPosition(direction, lane);

                    var spawner = spawnerObject.AddComponent<TrafficSpawner>();
                    spawner.Configure(this, direction, lane);
                    _spawners.Add(spawner);
                }
            }
        }

        private VehicleAgent CreateVehicle(
            CorridorDirection direction,
            int laneIndex,
            VehicleTurnChoice turnChoice,
            Vector3 spawnPosition,
            Vector3 directionVector)
        {
            var vehicleObject = GameObject.CreatePrimitive(PrimitiveType.Cube);
            vehicleObject.name = $"{direction}_L{laneIndex}_{turnChoice}_Vehicle";
            vehicleObject.transform.localScale = vehicleScale;
            Destroy(vehicleObject.GetComponent<Collider>());

            var agent = vehicleObject.AddComponent<VehicleAgent>();
            agent.Initialize(
                this,
                direction,
                laneIndex,
                turnChoice,
                spawnPosition,
                directionVector,
                PickVehicleColor(direction));
            return agent;
        }

        private SimulationSnapshot BuildSnapshot()
        {
            var north = BuildCorridorMetrics(CorridorDirection.North);
            var east = BuildCorridorMetrics(CorridorDirection.East);
            var south = BuildCorridorMetrics(CorridorDirection.South);
            var west = BuildCorridorMetrics(CorridorDirection.West);

            var congestion =
                north.queuedVehicles * 6f +
                east.queuedVehicles * 6f +
                south.queuedVehicles * 6f +
                west.queuedVehicles * 6f +
                (_vehicles.Count * 0.55f);

            return new SimulationSnapshot
            {
                north = north,
                east = east,
                south = south,
                west = west,
                congestionIndex = Mathf.Clamp(congestion, 0f, 100f),
                throughputPerMinute = _throughputWindowCount
            };
        }

        private CorridorMetrics BuildCorridorMetrics(CorridorDirection direction)
        {
            var count = 0;
            var queued = 0;
            var totalSpeed = 0f;

            foreach (var vehicle in _vehicles)
            {
                if (vehicle == null || vehicle.Origin != direction)
                {
                    continue;
                }

                count += 1;
                totalSpeed += vehicle.CurrentSpeed;
                if (vehicle.IsQueued)
                {
                    queued += 1;
                }
            }

            var averageSpeed = count > 0 ? totalSpeed / count : 0f;
            var demandScore = queued * 1.2f + count * 0.4f;
            return new CorridorMetrics
            {
                activeVehicles = count,
                queuedVehicles = queued,
                averageSpeed = averageSpeed,
                pressure = queued * 1.55f + count * 0.4f + Mathf.Max(0f, 4f - averageSpeed),
                demandScore = demandScore
            };
        }

        private bool IsSpawnPointClear(Vector3 spawnPosition)
        {
            foreach (var vehicle in _vehicles)
            {
                if (vehicle == null)
                {
                    continue;
                }

                if (Vector3.Distance(vehicle.transform.position, spawnPosition) < 5.5f)
                {
                    return false;
                }
            }

            return true;
        }

        private int CountCorridorVehicles(CorridorDirection direction)
        {
            var count = 0;
            foreach (var vehicle in _vehicles)
            {
                if (vehicle != null && vehicle.Origin == direction)
                {
                    count += 1;
                }
            }

            return count;
        }

        private VehicleTurnChoice PickTurnChoice(int laneIndex)
        {
            var roll = Random.value;
            if (laneIndex == 0 && roll < leftTurnChance)
            {
                return VehicleTurnChoice.Left;
            }

            if (laneIndex == 1 && roll < rightTurnChance)
            {
                return VehicleTurnChoice.Right;
            }

            return VehicleTurnChoice.Straight;
        }

        private Vector3 GetSpawnPosition(CorridorDirection direction, int laneIndex)
        {
            var lateral = laneIndex == 0 ? -laneOffset : laneOffset;
            return direction switch
            {
                CorridorDirection.North => new Vector3(lateral, 0.5f, spawnRadius),
                CorridorDirection.South => new Vector3(-lateral, 0.5f, -spawnRadius),
                CorridorDirection.East => new Vector3(-spawnRadius, 0.5f, -lateral),
                _ => new Vector3(spawnRadius, 0.5f, lateral),
            };
        }

        private float GetSignedProgress(VehicleAgent vehicle)
        {
            var position = vehicle.transform.position;
            return vehicle.Origin switch
            {
                CorridorDirection.North => -position.z,
                CorridorDirection.South => position.z,
                CorridorDirection.East => position.x,
                _ => -position.x,
            };
        }

        private static Vector3 GetDirectionVector(CorridorDirection direction)
        {
            return direction switch
            {
                CorridorDirection.North => Vector3.back,
                CorridorDirection.South => Vector3.forward,
                CorridorDirection.East => Vector3.right,
                _ => Vector3.left,
            };
        }

        private static Color PickVehicleColor(CorridorDirection direction)
        {
            return direction switch
            {
                CorridorDirection.North => new Color(0.29f, 0.71f, 0.93f),
                CorridorDirection.East => new Color(0.23f, 0.83f, 0.63f),
                CorridorDirection.South => new Color(0.95f, 0.48f, 0.18f),
                _ => new Color(0.92f, 0.45f, 0.72f),
            };
        }

        private void PruneDestroyedVehicles()
        {
            _vehicles.RemoveAll(vehicle => vehicle == null);
        }

        private void OnGUI()
        {
            if (!showOverlay || _signalController == null)
            {
                return;
            }

            GUILayout.BeginArea(new Rect(12f, 12f, 360f, 265f), GUI.skin.box);
            GUILayout.Label("Unity Traffic Simulation");
            GUILayout.Label($"Green Corridor: {_signalController.CurrentGreen}");
            GUILayout.Label($"Next Corridor: {_signalController.NextGreen}");
            GUILayout.Label($"Phase: {_signalController.Phase}");
            GUILayout.Label($"Target Green: {_signalController.CurrentTargetGreen:F1}s");
            GUILayout.Label($"Active Vehicles: {_vehicles.Count}");
            GUILayout.Label($"Completed Vehicles: {_completedVehicles}");
            GUILayout.Label($"Congestion Index: {_snapshot.congestionIndex:F1}");
            GUILayout.Label($"Throughput / Min: {_snapshot.throughputPerMinute:F0}");
            GUILayout.Space(4f);
            GUILayout.Label($"North Queue: {_snapshot.north.queuedVehicles} | Pressure: {_snapshot.north.pressure:F1}");
            GUILayout.Label($"East Queue: {_snapshot.east.queuedVehicles} | Pressure: {_snapshot.east.pressure:F1}");
            GUILayout.Label($"South Queue: {_snapshot.south.queuedVehicles} | Pressure: {_snapshot.south.pressure:F1}");
            GUILayout.Label($"West Queue: {_snapshot.west.queuedVehicles} | Pressure: {_snapshot.west.pressure:F1}");
            GUILayout.EndArea();
        }
    }
}
