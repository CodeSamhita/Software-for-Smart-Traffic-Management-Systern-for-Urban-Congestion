using UnityEngine;

namespace SmartTraffic.UnitySim
{
    public sealed class SignalHeadView : MonoBehaviour
    {
        [SerializeField] private CorridorDirection direction;

        private AdaptiveSignalController _controller;
        private Renderer _redLamp;
        private Renderer _yellowLamp;
        private Renderer _greenLamp;

        public void Configure(AdaptiveSignalController controller, CorridorDirection corridorDirection)
        {
            _controller = controller;
            direction = corridorDirection;
            BuildVisual();
        }

        private void LateUpdate()
        {
            if (_controller == null || _redLamp == null || _yellowLamp == null || _greenLamp == null)
            {
                return;
            }

            var lampState = _controller.GetLampState(direction);
            ApplyLamp(_redLamp, lampState == SignalLampState.Red, new Color(0.92f, 0.22f, 0.22f));
            ApplyLamp(_yellowLamp, lampState == SignalLampState.Yellow, new Color(0.96f, 0.8f, 0.22f));
            ApplyLamp(_greenLamp, lampState == SignalLampState.Green, new Color(0.25f, 0.9f, 0.42f));
        }

        private void BuildVisual()
        {
            foreach (Transform child in transform)
            {
                Destroy(child.gameObject);
            }

            var pole = CreatePart("Pole", new Vector3(0f, 1.6f, 0f), new Vector3(0.18f, 3.2f, 0.18f), new Color(0.18f, 0.18f, 0.2f));
            pole.transform.SetParent(transform, false);

            var housing = CreatePart("Housing", new Vector3(0f, 2.75f, 0f), new Vector3(0.55f, 1.4f, 0.32f), new Color(0.1f, 0.11f, 0.12f));
            housing.transform.SetParent(transform, false);

            _redLamp = CreateLamp("Red", new Vector3(0f, 3.15f, 0.18f));
            _yellowLamp = CreateLamp("Yellow", new Vector3(0f, 2.75f, 0.18f));
            _greenLamp = CreateLamp("Green", new Vector3(0f, 2.35f, 0.18f));

            _redLamp.transform.SetParent(transform, false);
            _yellowLamp.transform.SetParent(transform, false);
            _greenLamp.transform.SetParent(transform, false);
        }

        private static Renderer CreateLamp(string name, Vector3 localPosition)
        {
            var lamp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            lamp.name = name;
            lamp.transform.localPosition = localPosition;
            lamp.transform.localScale = new Vector3(0.18f, 0.18f, 0.1f);
            return lamp.GetComponent<Renderer>();
        }

        private static GameObject CreatePart(string name, Vector3 localPosition, Vector3 localScale, Color color)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            part.name = name;
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            var renderer = part.GetComponent<Renderer>();
            if (renderer != null)
            {
                renderer.material.color = color;
            }

            return part;
        }

        private static void ApplyLamp(Renderer renderer, bool active, Color onColor)
        {
            if (renderer == null)
            {
                return;
            }

            renderer.material.color = active ? onColor : onColor * 0.2f;
        }
    }
}
