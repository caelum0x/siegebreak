using System.Collections.Generic;
using UnityEngine;

namespace FPClash
{
    /// <summary>Helpers for building primitives + URP materials procedurally at runtime.</summary>
    public static class Prims
    {
        static Shader s_lit;
        static readonly Dictionary<int, Material> s_matCache = new Dictionary<int, Material>();

        static Shader Lit
        {
            get
            {
                if (s_lit == null)
                    s_lit = Shader.Find("Universal Render Pipeline/Lit");
                if (s_lit == null) // ultimate fallback so nothing renders magenta
                    s_lit = Shader.Find("Standard");
                return s_lit;
            }
        }

        public static Material Mat(Color c, float smoothness = 0.2f, float metallic = 0f)
        {
            int key = c.GetHashCode() ^ (Mathf.RoundToInt(smoothness * 100f) << 16) ^ (Mathf.RoundToInt(metallic * 100f) << 8);
            if (s_matCache.TryGetValue(key, out var m) && m != null) return m;

            m = new Material(Lit) { color = c };
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smoothness);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            s_matCache[key] = m;
            return m;
        }

        public static Material EmissiveMat(Color c)
        {
            var m = new Material(Lit) { color = c };
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            if (m.HasProperty("_EmissionColor")) m.SetColor("_EmissionColor", c * 1.5f);
            m.EnableKeyword("_EMISSION");
            return m;
        }

        public static GameObject Box(string name, Transform parent, Vector3 localPos, Vector3 size, Color color, bool collider = true)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            if (!collider) Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = Mat(color);
            return go;
        }

        public static GameObject Cylinder(string name, Transform parent, Vector3 localPos, Vector3 size, Color color, bool collider = true)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name;
            if (!collider) Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = Mat(color);
            return go;
        }

        public static GameObject Sphere(string name, Transform parent, Vector3 localPos, float diameter, Color color, bool collider = false)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = name;
            if (!collider) Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = Vector3.one * diameter;
            go.GetComponent<MeshRenderer>().sharedMaterial = Mat(color);
            return go;
        }
    }
}
