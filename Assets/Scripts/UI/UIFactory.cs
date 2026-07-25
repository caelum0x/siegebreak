using UnityEngine;
using UnityEngine.UI;

namespace FPClash
{
    /// <summary>Runtime helpers for building uGUI without prefabs or imported assets.</summary>
    public static class UIFactory
    {
        static Font s_font;
        static Sprite s_circle;
        static Sprite s_ring;
        static Sprite s_square;

        /// <summary>A plain white square sprite (needed for Image.Type.Filled to clip).</summary>
        public static Sprite Square
        {
            get
            {
                if (s_square == null)
                {
                    var tex = Texture2D.whiteTexture;
                    s_square = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height),
                        new Vector2(0.5f, 0.5f), 100f);
                }
                return s_square;
            }
        }

        public static Font Font
        {
            get
            {
                if (s_font == null)
                {
                    s_font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                    if (s_font == null) s_font = Resources.GetBuiltinResource<Font>("Arial.ttf");
                }
                return s_font;
            }
        }

        public static Sprite Circle
        {
            get { if (s_circle == null) s_circle = MakeCircle(false); return s_circle; }
        }

        public static Sprite Ring
        {
            get { if (s_ring == null) s_ring = MakeCircle(true); return s_ring; }
        }

        static Sprite MakeCircle(bool ring)
        {
            const int size = 128;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear };
            Vector2 c = new Vector2(size / 2f, size / 2f);
            float outer = size / 2f - 2f;
            float inner = outer - 14f;
            var px = new Color32[size * size];
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float d = Vector2.Distance(new Vector2(x, y), c);
                float a;
                if (ring) a = (d <= outer && d >= inner) ? Mathf.Clamp01((outer - d) + 1f) * Mathf.Clamp01((d - inner) + 1f) : 0f;
                else a = Mathf.Clamp01(outer - d);
                a = Mathf.Clamp01(a);
                px[y * size + x] = new Color32(255, 255, 255, (byte)(a * 255));
            }
            tex.SetPixels32(px);
            tex.Apply();
            return Sprite.Create(tex, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100f);
        }

        public static RectTransform Rect(GameObject go)
        {
            var rt = go.GetComponent<RectTransform>();
            if (rt == null) rt = go.AddComponent<RectTransform>();
            return rt;
        }

        public static GameObject Node(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return go;
        }

        public static Image Image(string name, Transform parent, Color color, Sprite sprite = null)
        {
            var go = Node(name, parent);
            var img = go.AddComponent<Image>();
            img.color = color;
            if (sprite != null) img.sprite = sprite;
            return img;
        }

        public static Text Label(string name, Transform parent, string text, int size, TextAnchor anchor, Color color)
        {
            var go = Node(name, parent);
            var t = go.AddComponent<Text>();
            t.font = Font;
            t.text = text;
            t.fontSize = size;
            t.alignment = anchor;
            t.color = color;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            return t;
        }

        public static Button Button(string name, Transform parent, string text, Color bg, Color textColor, int fontSize = 34)
        {
            var img = Image(name, parent, bg);
            var btn = img.gameObject.AddComponent<Button>();
            btn.targetGraphic = img; // must be set explicitly when added at runtime
            var colors = btn.colors;
            colors.highlightedColor = Color.Lerp(bg, Color.white, 0.15f);
            colors.pressedColor = Color.Lerp(bg, Color.black, 0.2f);
            colors.normalColor = bg;
            colors.selectedColor = bg;
            colors.fadeDuration = 0.05f;
            btn.colors = colors;

            var label = Label("Label", img.transform, text, fontSize, TextAnchor.MiddleCenter, textColor);
            Stretch(label.rectTransform);
            return btn;
        }

        // Anchor helpers -------------------------------------------------------
        public static void Stretch(RectTransform rt, float pad = 0f)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(pad, pad);
            rt.offsetMax = new Vector2(-pad, -pad);
        }

        public static void Anchor(RectTransform rt, Vector2 anchorMin, Vector2 anchorMax, Vector2 pivot,
            Vector2 anchoredPos, Vector2 size)
        {
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.pivot = pivot;
            rt.sizeDelta = size;
            rt.anchoredPosition = anchoredPos;
        }
    }
}
