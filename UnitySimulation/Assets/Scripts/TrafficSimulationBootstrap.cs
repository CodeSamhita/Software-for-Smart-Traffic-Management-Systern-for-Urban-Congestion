using UnityEngine;

namespace SmartTraffic.UnitySim
{
    public sealed class TrafficSimulationBootstrap : MonoBehaviour
    {
        [Header("Scene Setup")]
        [SerializeField] private bool autoCreateEnvironment = true;
        [SerializeField] private bool autoCreateCamera = true;
        [SerializeField] private Vector3 cameraPosition = new Vector3(0f, 32f, -2f);
        [SerializeField] private Color groundColor = new Color(0.09f, 0.17f, 0.12f);
        [SerializeField] private Color roadColor = new Color(0.15f, 0.16f, 0.19f);
        [SerializeField] private Color laneMarkColor = new Color(0.93f, 0.86f, 0.56f);
        [SerializeField] private Color stopLineColor = new Color(0.95f, 0.95f, 0.95f);

        [Header("Simulation")]
        [SerializeField] private float roadLength = 48f;
        [SerializeField] private float roadWidth = 12f;
        [SerializeField] private float laneSpacing = 2.8f;
        [SerializeField] private float signalOffset = 8.2f;

        private AdaptiveSignalController _controller;

        private void Awake()
        {
            if (autoCreateEnvironment)
            {
                BuildEnvironment();
            }

            _controller = GetComponent<AdaptiveSignalController>();
            if (_controller == null)
            {
                _controller = gameObject.AddComponent<AdaptiveSignalController>();
            }

            var manager = GetComponent<TrafficSimulationManager>();
            if (manager == null)
            {
                manager = gameObject.AddComponent<TrafficSimulationManager>();
            }

            manager.Configure(_controller, roadLength, roadWidth, laneSpacing);
            CreateSignals();

            if (autoCreateCamera)
            {
                EnsureCamera();
            }
        }

        private void BuildEnvironment()
        {
            CreateGround();
            CreateRoad("Road_NS", new Vector3(0f, 0.01f, 0f), new Vector3(roadWidth, 0.1f, roadLength), roadColor);
            CreateRoad("Road_EW", new Vector3(0f, 0.01f, 0f), new Vector3(roadLength, 0.1f, roadWidth), roadColor);

            var laneOffset = laneSpacing * 0.5f;
            CreateLaneMark("Lane_NS_Left", new Vector3(-laneOffset, 0.06f, 0f), new Vector3(0.14f, 0.02f, roadLength), laneMarkColor);
            CreateLaneMark("Lane_NS_Right", new Vector3(laneOffset, 0.06f, 0f), new Vector3(0.14f, 0.02f, roadLength), laneMarkColor);
            CreateLaneMark("Lane_EW_Left", new Vector3(0f, 0.06f, -laneOffset), new Vector3(roadLength, 0.02f, 0.14f), laneMarkColor);
            CreateLaneMark("Lane_EW_Right", new Vector3(0f, 0.06f, laneOffset), new Vector3(roadLength, 0.02f, 0.14f), laneMarkColor);

            CreateStopLine("Stop_North", new Vector3(0f, 0.07f, signalOffset - 0.7f), new Vector3(roadWidth - 1.2f, 0.03f, 0.22f));
            CreateStopLine("Stop_South", new Vector3(0f, 0.07f, -signalOffset + 0.7f), new Vector3(roadWidth - 1.2f, 0.03f, 0.22f));
            CreateStopLine("Stop_East", new Vector3(-signalOffset + 0.7f, 0.07f, 0f), new Vector3(0.22f, 0.03f, roadWidth - 1.2f));
            CreateStopLine("Stop_West", new Vector3(signalOffset - 0.7f, 0.07f, 0f), new Vector3(0.22f, 0.03f, roadWidth - 1.2f));
        }

        private void CreateSignals()
        {
            CreateSignal("Signal_North", CorridorDirection.North, new Vector3(-3.4f, 0f, signalOffset));
            CreateSignal("Signal_South", CorridorDirection.South, new Vector3(3.4f, 0f, -signalOffset));
            CreateSignal("Signal_East", CorridorDirection.East, new Vector3(-signalOffset, 0f, 3.4f), Quaternion.Euler(0f, 90f, 0f));
            CreateSignal("Signal_West", CorridorDirection.West, new Vector3(signalOffset, 0f, -3.4f), Quaternion.Euler(0f, -90f, 0f));
        }

        private void CreateSignal(string name, CorridorDirection direction, Vector3 position, Quaternion? rotation = null)
        {
            var signalObject = new GameObject(name);
            signalObject.transform.SetParent(transform, false);
            signalObject.transform.position = position;
            signalObject.transform.rotation = rotation ?? Quaternion.identity;

            var signalView = signalObject.AddComponent<SignalHeadView>();
            signalView.Configure(_controller, direction);
        }

        private void EnsureCamera()
        {
            if (Camera.main != null)
            {
                Camera.main.transform.position = cameraPosition;
                Camera.main.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
                Camera.main.orthographic = true;
                Camera.main.orthographicSize = 18f;
                return;
            }

            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var sceneCamera = cameraObject.AddComponent<Camera>();
            sceneCamera.transform.position = cameraPosition;
            sceneCamera.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            sceneCamera.clearFlags = CameraClearFlags.SolidColor;
            sceneCamera.backgroundColor = new Color(0.05f, 0.07f, 0.08f);
            sceneCamera.orthographic = true;
            sceneCamera.orthographicSize = 18f;
        }

        private void CreateGround()
        {
            CreateRoad("Ground", new Vector3(0f, -0.05f, 0f), new Vector3(roadLength * 1.8f, 0.02f, roadLength * 1.8f), groundColor);
        }

        private static void CreateRoad(string name, Vector3 position, Vector3 scale, Color color)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            part.name = name;
            part.transform.position = position;
            part.transform.localScale = scale;
            var renderer = part.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material.color = color;
            }
        }

        private void CreateStopLine(string name, Vector3 position, Vector3 scale)
        {
            CreateRoad(name, position, scale, stopLineColor);
        }

        private static void CreateLaneMark(string name, Vector3 position, Vector3 scale, Color color)
        {
            var mark = GameObject.CreatePrimitive(PrimitiveType.Cube);
            mark.name = name;
            mark.transform.position = position;
            mark.transform.localScale = scale;
            var renderer = mark.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material.color = color;
            }
        }
    }
}
