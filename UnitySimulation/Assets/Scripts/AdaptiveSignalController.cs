using System.Collections.Generic;
using UnityEngine;

namespace SmartTraffic.UnitySim
{
    public sealed class AdaptiveSignalController : MonoBehaviour
    {
        [Header("Signal Timing")]
        [SerializeField] private float minimumGreenSeconds = 5f;
        [SerializeField] private float baseGreenSeconds = 7f;
        [SerializeField] private float yellowSeconds = 2f;
        [SerializeField] private float allRedSeconds = 0.8f;
        [SerializeField] private float maximumGreenSeconds = 16f;

        [Header("Adaptive Weights")]
        [SerializeField] private float queueWeight = 0.85f;
        [SerializeField] private float pressureWeight = 0.45f;
        [SerializeField] private float demandWeight = 0.35f;
        [SerializeField] private float starvationWeight = 0.45f;

        private readonly Dictionary<CorridorDirection, float> _lastServiceTimes = new();
        private CorridorDirection _currentGreen = CorridorDirection.North;
        private CorridorDirection _nextGreen = CorridorDirection.East;
        private SignalPhase _phase = SignalPhase.Green;
        private float _phaseTimer;
        private float _currentTargetGreen = 7f;

        public CorridorDirection CurrentGreen => _currentGreen;
        public CorridorDirection NextGreen => _nextGreen;
        public SignalPhase Phase => _phase;
        public float CurrentTargetGreen => _currentTargetGreen;

        private void Awake()
        {
            foreach (CorridorDirection direction in System.Enum.GetValues(typeof(CorridorDirection)))
            {
                _lastServiceTimes[direction] = 0f;
            }
        }

        public bool CanProceed(CorridorDirection direction)
        {
            return _phase == SignalPhase.Green && direction == _currentGreen;
        }

        public SignalLampState GetLampState(CorridorDirection direction)
        {
            if (_phase == SignalPhase.AllRed)
            {
                return SignalLampState.Red;
            }

            if (direction != _currentGreen)
            {
                return SignalLampState.Red;
            }

            return _phase == SignalPhase.Yellow ? SignalLampState.Yellow : SignalLampState.Green;
        }

        public void Tick(float deltaTime, SimulationSnapshot snapshot, float simulationTime)
        {
            _phaseTimer += deltaTime;

            if (_phase == SignalPhase.Green)
            {
                _currentTargetGreen = ComputeGreenWindow(snapshot, _currentGreen);
                if (_phaseTimer >= _currentTargetGreen && _phaseTimer >= minimumGreenSeconds)
                {
                    _phase = SignalPhase.Yellow;
                    _phaseTimer = 0f;
                    _nextGreen = PickNextDirection(snapshot, simulationTime);
                }

                return;
            }

            if (_phase == SignalPhase.Yellow)
            {
                if (_phaseTimer >= yellowSeconds)
                {
                    _phase = SignalPhase.AllRed;
                    _phaseTimer = 0f;
                }

                return;
            }

            if (_phaseTimer < allRedSeconds)
            {
                return;
            }

            _currentGreen = _nextGreen;
            _lastServiceTimes[_currentGreen] = simulationTime;
            _currentTargetGreen = ComputeGreenWindow(snapshot, _currentGreen);
            _phase = SignalPhase.Green;
            _phaseTimer = 0f;
        }

        private float ComputeGreenWindow(SimulationSnapshot snapshot, CorridorDirection direction)
        {
            var metrics = GetMetrics(snapshot, direction);
            var extension =
                metrics.queuedVehicles * queueWeight +
                metrics.pressure * pressureWeight +
                metrics.demandScore * demandWeight;

            return Mathf.Clamp(baseGreenSeconds + extension, minimumGreenSeconds, maximumGreenSeconds);
        }

        private CorridorDirection PickNextDirection(SimulationSnapshot snapshot, float simulationTime)
        {
            var bestDirection = _currentGreen;
            var bestScore = float.MinValue;

            foreach (CorridorDirection direction in System.Enum.GetValues(typeof(CorridorDirection)))
            {
                if (direction == _currentGreen)
                {
                    continue;
                }

                var metrics = GetMetrics(snapshot, direction);
                var starvationSeconds = Mathf.Max(0f, simulationTime - _lastServiceTimes[direction]);
                var starvationBoost = Mathf.Min(8f, starvationSeconds * starvationWeight);
                var score =
                    metrics.queuedVehicles * 1.55f +
                    metrics.activeVehicles * 0.5f +
                    metrics.pressure * 1.2f +
                    metrics.demandScore * 0.9f +
                    starvationBoost;

                if (score > bestScore)
                {
                    bestScore = score;
                    bestDirection = direction;
                }
            }

            return bestDirection;
        }

        private static CorridorMetrics GetMetrics(SimulationSnapshot snapshot, CorridorDirection direction)
        {
            return direction switch
            {
                CorridorDirection.North => snapshot.north,
                CorridorDirection.East => snapshot.east,
                CorridorDirection.South => snapshot.south,
                _ => snapshot.west,
            };
        }
    }
}
