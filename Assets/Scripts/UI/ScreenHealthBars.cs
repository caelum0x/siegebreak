using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace FPClash
{
    /// <summary>
    /// Draws floating health bars for every live combatant by projecting their
    /// world position into the overlay canvas each frame. Central + pooled so
    /// there's no per-unit world canvas to manage.
    /// </summary>
    public class ScreenHealthBars : MonoBehaviour
    {
        class Bar
        {
            public RectTransform root;
            public Image fill;
            public float width;
        }

        Camera _cam;
        RectTransform _container;
        Unit _skip;
        readonly Dictionary<IDamageable, Bar> _bars = new Dictionary<IDamageable, Bar>();
        readonly List<IDamageable> _toRemove = new List<IDamageable>();

        public void Init(Camera cam, RectTransform container, Unit skip)
        {
            _cam = cam;
            _container = container;
            _skip = skip;
        }

        Bar CreateBar(IDamageable c)
        {
            float width = (c is Tower) ? 120f : 66f;
            var rootImg = UIFactory.Image("HealthBar", _container, new Color(0f, 0f, 0f, 0.6f));
            rootImg.raycastTarget = false;
            UIFactory.Anchor(rootImg.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(width + 4f, 12f));

            var fill = UIFactory.Image("Fill", rootImg.transform, c.Team.Color());
            fill.raycastTarget = false;
            UIFactory.Anchor(fill.rectTransform, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f),
                new Vector2(0f, 0.5f), new Vector2(2f, 0f), new Vector2(width, 8f));

            return new Bar { root = rootImg.rectTransform, fill = fill.rectTransform.GetComponent<Image>(), width = width };
        }

        void LateUpdate()
        {
            if (_cam == null || _container == null) return;

            // Refresh existing / spawn new.
            var live = Combatants.All;
            for (int i = 0; i < live.Count; i++)
            {
                var c = live[i];
                if (c == null) continue;
                if (ReferenceEquals(c, _skip)) continue;

                if (!c.IsAlive)
                {
                    if (_bars.TryGetValue(c, out var deadBar)) deadBar.root.gameObject.SetActive(false);
                    continue;
                }

                if (!_bars.TryGetValue(c, out var bar))
                {
                    bar = CreateBar(c);
                    _bars[c] = bar;
                }

                Vector3 world = c.Transform.position + Vector3.up * c.BarHeight;
                Vector3 sp = _cam.WorldToScreenPoint(world);
                if (sp.z <= 0f)
                {
                    bar.root.gameObject.SetActive(false);
                    continue;
                }

                Vector2 local;
                RectTransformUtility.ScreenPointToLocalPointInRectangle(_container, sp, null, out local);
                bar.root.anchoredPosition = local;
                if (!bar.root.gameObject.activeSelf) bar.root.gameObject.SetActive(true);

                float f = Mathf.Clamp01(c.HealthFraction);
                bar.fill.rectTransform.sizeDelta = new Vector2(bar.width * f, 8f);
                bar.fill.color = Color.Lerp(new Color(0.9f, 0.2f, 0.2f), c.Team.Color(), f);
            }

            // Drop bars whose combatant was destroyed entirely.
            _toRemove.Clear();
            foreach (var kv in _bars)
                if (kv.Key == null || (!Combatants.All.Contains(kv.Key)))
                    _toRemove.Add(kv.Key);
            foreach (var k in _toRemove)
            {
                if (_bars[k].root != null) Destroy(_bars[k].root.gameObject);
                _bars.Remove(k);
            }
        }
    }
}
