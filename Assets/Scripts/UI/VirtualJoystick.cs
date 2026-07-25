using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace FPClash
{
    /// <summary>
    /// A thumb-stick that writes to <see cref="InputHub.Move"/>. Drag the knob
    /// within the base radius; releasing recentres it.
    /// </summary>
    public class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        RectTransform _base;
        RectTransform _knob;
        float _radius;
        int _pointerId = -2;

        public static VirtualJoystick Create(Transform parent, float size)
        {
            var baseImg = UIFactory.Image("Joystick", parent, new Color(1f, 1f, 1f, 0.18f), UIFactory.Ring);
            UIFactory.Anchor(baseImg.rectTransform, Vector2.zero, Vector2.zero, new Vector2(0.5f, 0.5f),
                new Vector2(size * 0.75f, size * 0.75f), new Vector2(size, size));

            var knob = UIFactory.Image("Knob", baseImg.transform, new Color(1f, 1f, 1f, 0.55f), UIFactory.Circle);
            UIFactory.Anchor(knob.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size * 0.45f, size * 0.45f));

            var js = baseImg.gameObject.AddComponent<VirtualJoystick>();
            js._base = baseImg.rectTransform;
            js._knob = knob.rectTransform;
            js._radius = size * 0.5f;
            return js;
        }

        public void OnPointerDown(PointerEventData e)
        {
            _pointerId = e.pointerId;
            OnDrag(e);
        }

        public void OnDrag(PointerEventData e)
        {
            if (e.pointerId != _pointerId) return;
            Vector2 local;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    _base, e.position, e.pressEventCamera, out local))
                return;

            Vector2 clamped = Vector2.ClampMagnitude(local, _radius);
            _knob.anchoredPosition = clamped;
            InputHub.SetMove(clamped / _radius);
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (e.pointerId != _pointerId) return;
            _pointerId = -2;
            _knob.anchoredPosition = Vector2.zero;
            InputHub.SetMove(Vector2.zero);
        }
    }
}
