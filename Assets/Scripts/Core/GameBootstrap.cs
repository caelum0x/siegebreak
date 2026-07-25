using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace FPClash
{
    /// <summary>
    /// Single entry point. Sitting on one GameObject in the scene, it builds the
    /// camera, lighting, managers and UI at runtime, then kicks off character
    /// selection. Everything else is generated procedurally — no other scene
    /// objects or prefabs are needed.
    /// </summary>
    public class GameBootstrap : MonoBehaviour
    {
        Camera _cam;

        void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.orientation = ScreenOrientation.Portrait; // vertical, one-handed
            Physics.gravity = new Vector3(0f, -22f, 0f);      // snappier arcade fall

            BuildCamera();
            BuildLighting();

            var managers = new GameObject("GameSystems");
            var ui = managers.AddComponent<UIManager>();
            ui.Init(_cam);
            var gm = managers.AddComponent<GameManager>();
            gm.Init(_cam, ui);
            gm.BeginSelection();
        }

        void BuildCamera()
        {
            var go = new GameObject("MainCamera");
            go.tag = "MainCamera";
            _cam = go.AddComponent<Camera>();
            _cam.fieldOfView = 60f;
            _cam.nearClipPlane = 0.1f;
            _cam.farClipPlane = 300f;
            _cam.backgroundColor = new Color(0.5f, 0.7f, 0.95f);

            // URP wants its per-camera data component.
            if (go.GetComponent<UniversalAdditionalCameraData>() == null)
                go.AddComponent<UniversalAdditionalCameraData>();

            go.AddComponent<AudioListener>();
            go.transform.position = new Vector3(0f, 6f, -20f);
            go.transform.rotation = Quaternion.Euler(15f, 0f, 0f);
        }

        void BuildLighting()
        {
            var sun = new GameObject("Sun");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(1f, 0.96f, 0.9f);
            light.intensity = 1.3f;
            light.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.55f, 0.62f, 0.75f);
            RenderSettings.ambientEquatorColor = new Color(0.4f, 0.42f, 0.45f);
            RenderSettings.ambientGroundColor = new Color(0.2f, 0.2f, 0.2f);
        }
    }
}
