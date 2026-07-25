using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace FPClash
{
    /// <summary>Big thumb button (bottom-right). Holds to keep swinging.</summary>
    public class AttackButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        Image _cooldownFill;
        System.Func<float> _cooldownFrac;

        public static AttackButton Create(Transform parent, float size, System.Func<float> cooldownFrac)
        {
            var bg = UIFactory.Image("AttackButton", parent, new Color(0.9f, 0.3f, 0.25f, 0.85f), UIFactory.Circle);
            UIFactory.Anchor(bg.rectTransform, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(0.5f, 0.5f),
                new Vector2(-size * 0.7f, size * 0.7f), new Vector2(size, size));

            // Cooldown sweep overlay.
            var fill = UIFactory.Image("Cooldown", bg.transform, new Color(0f, 0f, 0f, 0.45f), UIFactory.Circle);
            UIFactory.Stretch(fill.rectTransform);
            fill.type = Image.Type.Filled;
            fill.fillMethod = Image.FillMethod.Radial360;
            fill.fillOrigin = (int)Image.Origin360.Top;
            fill.fillClockwise = false;

            var icon = UIFactory.Label("Icon", bg.transform, "ATK", 54, TextAnchor.MiddleCenter, Color.white);
            UIFactory.Stretch(icon.rectTransform);

            var btn = bg.gameObject.AddComponent<AttackButton>();
            btn._cooldownFill = fill;
            btn._cooldownFrac = cooldownFrac;
            return btn;
        }

        public void OnPointerDown(PointerEventData e)
        {
            InputHub.PressAttack();
        }

        public void OnPointerUp(PointerEventData e)
        {
            InputHub.ReleaseAttack();
        }

        void Update()
        {
            if (_cooldownFill != null && _cooldownFrac != null)
                _cooldownFill.fillAmount = 1f - Mathf.Clamp01(_cooldownFrac());
        }
    }
}
