using System;

namespace SmartTraffic.UnitySim
{
    public enum CorridorDirection
    {
        North = 0,
        East = 1,
        South = 2,
        West = 3
    }

    public enum SignalPhase
    {
        Green,
        Yellow,
        AllRed
    }

    public enum SignalLampState
    {
        Red,
        Yellow,
        Green
    }

    public enum VehicleTurnChoice
    {
        Straight,
        Left,
        Right
    }

    [Serializable]
    public struct CorridorMetrics
    {
        public int activeVehicles;
        public int queuedVehicles;
        public float averageSpeed;
        public float pressure;
        public float demandScore;
    }

    [Serializable]
    public struct SimulationSnapshot
    {
        public CorridorMetrics north;
        public CorridorMetrics east;
        public CorridorMetrics south;
        public CorridorMetrics west;
        public float congestionIndex;
        public float throughputPerMinute;
    }
}
