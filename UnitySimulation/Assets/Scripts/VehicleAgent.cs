using UnityEngine;

namespace SmartTraffic.UnitySim
{
    public sealed class VehicleAgent : MonoBehaviour
    {
        [SerializeField] private float baseSpeed = 5.8f;
        [SerializeField] private float acceleration = 4.8f;
        [SerializeField] private float braking = 9.5f;
        [SerializeField] private float followDistance = 4f;
        [SerializeField] private float turnRate = 1.9f;
        [SerializeField] private float exitBounds = 32f;

        private TrafficSimulationManager _manager;
        private CorridorDirection _origin;
        private int _laneIndex;
        private VehicleTurnChoice _turnChoice;
        private Vector3 _directionVector;
        private Vector3 _targetDirection;
        private float _currentSpeed;
        private bool _isTurning;

        public CorridorDirection Origin => _origin;
        public int LaneIndex => _laneIndex;
        public float CurrentSpeed => _currentSpeed;
        public bool IsQueued { get; private set; }
        public bool HasEnteredJunction { get; private set; }

        public void Initialize(
            TrafficSimulationManager manager,
            CorridorDirection origin,
            int laneIndex,
            VehicleTurnChoice turnChoice,
            Vector3 spawnPosition,
            Vector3 directionVector,
            Color color)
        {
            _manager = manager;
            _origin = origin;
            _laneIndex = laneIndex;
            _turnChoice = turnChoice;
            _directionVector = directionVector.normalized;
            _targetDirection = _manager.GetTargetDirection(origin, turnChoice);
            transform.position = spawnPosition;
            transform.rotation = Quaternion.LookRotation(_directionVector, Vector3.up);
            _currentSpeed = baseSpeed * Random.Range(0.9f, 1.05f);
            IsQueued = false;
            HasEnteredJunction = false;

            var renderer = GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material.color = color;
            }
        }

        private void Update()
        {
            if (_manager == null)
            {
                return;
            }

            var deltaTime = Time.deltaTime;
            var targetSpeed = baseSpeed;
            var canProceed = _manager.CanVehicleProceed(this);
            var distanceToStopLine = _manager.GetDistanceToStopLine(this);

            if (!HasEnteredJunction)
            {
                if (_manager.TryGetLeadVehicle(this, out var leadVehicle, out var gap))
                {
                    targetSpeed = Mathf.Min(targetSpeed, Mathf.Lerp(0f, leadVehicle.CurrentSpeed, Mathf.Clamp01(gap / followDistance)));
                }

                if (!canProceed && distanceToStopLine < 10f)
                {
                    var stopFactor = Mathf.Clamp01(Mathf.Max(0.1f, distanceToStopLine) / 10f);
                    targetSpeed = Mathf.Min(targetSpeed, baseSpeed * stopFactor);
                }

                if (!canProceed && _manager.HasConflictingJunctionOccupant(this) && distanceToStopLine < 7f)
                {
                    targetSpeed = 0f;
                }
            }

            var rate = targetSpeed >= _currentSpeed ? acceleration : braking;
            _currentSpeed = Mathf.MoveTowards(_currentSpeed, targetSpeed, rate * deltaTime);
            transform.position += _directionVector * (_currentSpeed * deltaTime);

            if (!HasEnteredJunction && DistanceToCenter() <= _manager.JunctionRadius)
            {
                HasEnteredJunction = true;
                _isTurning = _turnChoice != VehicleTurnChoice.Straight;
            }

            if (_isTurning)
            {
                _directionVector = Vector3.RotateTowards(_directionVector, _targetDirection, turnRate * deltaTime, 0f);
                if (Vector3.Dot(_directionVector, _targetDirection) > 0.996f)
                {
                    _directionVector = _targetDirection;
                    _isTurning = false;
                }
            }

            transform.rotation = Quaternion.LookRotation(_directionVector, Vector3.up);
            IsQueued = !HasEnteredJunction && _currentSpeed < 0.2f;

            if (Mathf.Abs(transform.position.x) > exitBounds || Mathf.Abs(transform.position.z) > exitBounds)
            {
                _manager.NotifyVehicleExited(this);
                Destroy(gameObject);
            }
        }

        private float DistanceToCenter()
        {
            return Vector2.Distance(new Vector2(transform.position.x, transform.position.z), Vector2.zero);
        }
    }
}
