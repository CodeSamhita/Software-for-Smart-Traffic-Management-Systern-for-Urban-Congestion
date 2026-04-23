using UnityEngine;

namespace SmartTraffic.UnitySim
{
    public sealed class TrafficSpawner : MonoBehaviour
    {
        [SerializeField] private CorridorDirection direction;
        [SerializeField] private int laneIndex;
        [SerializeField] private float minSpawnInterval = 1.8f;
        [SerializeField] private float maxSpawnInterval = 3.8f;

        private TrafficSimulationManager _manager;
        private float _spawnTimer;

        public void Configure(TrafficSimulationManager manager, CorridorDirection corridorDirection, int lane)
        {
            _manager = manager;
            direction = corridorDirection;
            laneIndex = lane;
            _spawnTimer = Random.Range(minSpawnInterval, maxSpawnInterval);
        }

        private void Update()
        {
            if (_manager == null)
            {
                return;
            }

            _spawnTimer -= Time.deltaTime;
            if (_spawnTimer > 0f)
            {
                return;
            }

            _manager.TrySpawn(direction, laneIndex);
            _spawnTimer = Random.Range(minSpawnInterval, maxSpawnInterval);
        }
    }
}
