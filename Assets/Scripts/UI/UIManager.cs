using System;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace FPClash
{
    /// <summary>
    /// Owns the whole screen-space UI: character select, in-match HUD (joystick,
    /// attack button, health bars, score/tower status, respawn overlay) and the
    /// game-over screen. Built entirely in code so no prefabs are required.
    /// </summary>
    public class UIManager : MonoBehaviour
    {
        Camera _cam;
        Canvas _canvas;
        RectTransform _root;

        // Screens
        GameObject _selectPanel;
        GameObject _hudPanel;
        GameObject _gameOverPanel;
        RectTransform _barLayer;

        // HUD live elements
        GameManager _gm;
        Unit _player;
        Image _playerHpFill;
        Text _playerHpText;
        Text _scoreText;
        Text _towerText;
        GameObject _respawnPanel;
        Text _respawnText;
        float _respawnEndTime;
        ScreenHealthBars _healthBars;

        int _selectedIndex;
        Button[] _cardButtons;

        public void Init(Camera cam)
        {
            _cam = cam;
            EnsureEventSystem();

            var canvasGo = new GameObject("UICanvas");
            _canvas = canvasGo.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f); // portrait
            scaler.matchWidthOrHeight = 0.5f;
            canvasGo.AddComponent<GraphicRaycaster>();
            _root = canvasGo.GetComponent<RectTransform>();
        }

        static void EnsureEventSystem()
        {
            if (FindAnyObjectByType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        // ==================== CHARACTER SELECT ====================
        public void ShowCharacterSelect(Action<CharacterConfig> onPick)
        {
            if (_selectPanel != null) Destroy(_selectPanel);
            _selectPanel = NewPanel("SelectPanel", new Color(0.08f, 0.09f, 0.13f, 1f));

            UIFactory.Label("Title", _selectPanel.transform, "FP CLASH", 90,
                TextAnchor.MiddleCenter, Color.white).rectTransform.also(rt =>
                UIFactory.Anchor(rt, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                    new Vector2(0f, -140f), new Vector2(900f, 120f)));

            UIFactory.Label("Sub", _selectPanel.transform, "Choose your champion", 42,
                TextAnchor.MiddleCenter, new Color(0.8f, 0.85f, 1f)).rectTransform.also(rt =>
                UIFactory.Anchor(rt, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                    new Vector2(0f, -250f), new Vector2(900f, 60f)));

            var roster = CharacterConfig.Roster;
            _cardButtons = new Button[roster.Count];
            float cardH = 200f, gap = 30f;
            float startY = -420f;
            for (int i = 0; i < roster.Count; i++)
            {
                var cfg = roster[i];
                int idx = i;
                var btn = UIFactory.Button("Card_" + cfg.id, _selectPanel.transform, "", new Color(0.16f, 0.18f, 0.24f), Color.white);
                UIFactory.Anchor(btn.image.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                    new Vector2(0f, startY - i * (cardH + gap)), new Vector2(860f, cardH));
                Destroy(btn.GetComponentInChildren<Text>().gameObject); // remove default empty label

                UIFactory.Label("Name", btn.transform, cfg.displayName, 54, TextAnchor.MiddleLeft, Color.white)
                    .rectTransform.also(rt => UIFactory.Anchor(rt, new Vector2(0f, 1f), new Vector2(0f, 1f),
                        new Vector2(0f, 1f), new Vector2(40f, -30f), new Vector2(500f, 60f)));

                string stats = $"HP {cfg.maxHealth:0}   DMG {cfg.attackDamage:0}   SPD {cfg.moveSpeed:0.0}";
                UIFactory.Label("Stats", btn.transform, stats, 34, TextAnchor.MiddleLeft, new Color(0.75f, 0.8f, 0.95f))
                    .rectTransform.also(rt => UIFactory.Anchor(rt, new Vector2(0f, 0f), new Vector2(0f, 0f),
                        new Vector2(0f, 0f), new Vector2(40f, 40f), new Vector2(760f, 50f)));

                // Color swatch
                UIFactory.Image("Swatch", btn.transform, cfg.bodyColor, UIFactory.Circle)
                    .rectTransform.also(rt => UIFactory.Anchor(rt, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f),
                        new Vector2(1f, 0.5f), new Vector2(-50f, 0f), new Vector2(90f, 90f)));

                btn.transition = Selectable.Transition.None; // we drive the selection colour manually
                btn.onClick.AddListener(() => SelectCard(idx));
                _cardButtons[i] = btn;
            }

            var fight = UIFactory.Button("Fight", _selectPanel.transform, "FIGHT!", new Color(0.9f, 0.35f, 0.25f), Color.white, 60);
            UIFactory.Anchor(fight.image.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0f, 140f), new Vector2(700f, 150f));
            fight.onClick.AddListener(() =>
            {
                var cfg = CharacterConfig.Roster[_selectedIndex];
                Destroy(_selectPanel);
                _selectPanel = null;
                onPick?.Invoke(cfg);
            });

            SelectCard(0);
        }

        void SelectCard(int i)
        {
            _selectedIndex = i;
            for (int k = 0; k < _cardButtons.Length; k++)
            {
                if (_cardButtons[k] == null) continue;
                _cardButtons[k].image.color = (k == i)
                    ? new Color(0.25f, 0.4f, 0.7f)
                    : new Color(0.16f, 0.18f, 0.24f);
            }
        }

        // ==================== HUD ====================
        public void ShowHUD(GameManager gm, Unit player)
        {
            _gm = gm;
            _player = player;

            _hudPanel = NewPanel("HUD", new Color(0, 0, 0, 0));
            _hudPanel.GetComponent<Image>().raycastTarget = false;

            // Health-bar layer (world-projected). Behind the controls.
            var barGo = UIFactory.Node("HealthBarLayer", _hudPanel.transform);
            _barLayer = UIFactory.Rect(barGo);
            UIFactory.Stretch(_barLayer);
            _healthBars = barGo.AddComponent<ScreenHealthBars>();
            _healthBars.Init(_cam, _barLayer, player);

            // Controls
            VirtualJoystick.Create(_hudPanel.transform, 340f);
            AttackButton.Create(_hudPanel.transform, 260f, () => _player != null ? _player.AttackCooldownFraction : 1f);

            // Top status bar
            var top = UIFactory.Image("TopBar", _hudPanel.transform, new Color(0f, 0f, 0f, 0.35f));
            UIFactory.Anchor(top.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                new Vector2(0f, -20f), new Vector2(1000f, 150f));
            top.raycastTarget = false;

            _scoreText = UIFactory.Label("Score", top.transform, "", 52, TextAnchor.MiddleCenter, Color.white);
            UIFactory.Anchor(_scoreText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                new Vector2(0f, -35f), new Vector2(980f, 60f));
            _towerText = UIFactory.Label("Towers", top.transform, "", 34, TextAnchor.MiddleCenter, new Color(0.85f, 0.9f, 1f));
            UIFactory.Anchor(_towerText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0.5f, 1f),
                new Vector2(0f, -100f), new Vector2(980f, 50f));

            // Player health bar (bottom-centre above thumbs)
            var hpBg = UIFactory.Image("PlayerHPBg", _hudPanel.transform, new Color(0f, 0f, 0f, 0.55f));
            UIFactory.Anchor(hpBg.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(0f, 470f), new Vector2(620f, 54f));
            hpBg.raycastTarget = false;
            _playerHpFill = UIFactory.Image("PlayerHPFill", hpBg.transform, new Color(0.3f, 0.85f, 0.35f), UIFactory.Square);
            UIFactory.Stretch(_playerHpFill.rectTransform, 5f);
            _playerHpFill.type = Image.Type.Filled;
            _playerHpFill.fillMethod = Image.FillMethod.Horizontal;
            _playerHpFill.fillOrigin = (int)Image.OriginHorizontal.Left;
            _playerHpText = UIFactory.Label("PlayerHPText", hpBg.transform, "", 32, TextAnchor.MiddleCenter, Color.white);
            UIFactory.Stretch(_playerHpText.rectTransform);

            // Respawn overlay (hidden)
            _respawnPanel = UIFactory.Image("Respawn", _hudPanel.transform, new Color(0f, 0f, 0f, 0.65f)).gameObject;
            UIFactory.Stretch(UIFactory.Rect(_respawnPanel));
            _respawnText = UIFactory.Label("RespawnText", _respawnPanel.transform, "", 70, TextAnchor.MiddleCenter, Color.white);
            UIFactory.Stretch(_respawnText.rectTransform);
            _respawnPanel.SetActive(false);
        }

        public void ShowRespawnCountdown(float seconds)
        {
            _respawnEndTime = Time.time + seconds;
            if (_respawnPanel != null) _respawnPanel.SetActive(true);
        }

        public void HideRespawnCountdown()
        {
            if (_respawnPanel != null) _respawnPanel.SetActive(false);
        }

        // ==================== GAME OVER ====================
        public void ShowGameOver(bool playerWon, Action onRematch)
        {
            _gameOverPanel = NewPanel("GameOver", new Color(0f, 0f, 0f, 0.8f));

            UIFactory.Label("Result", _gameOverPanel.transform, playerWon ? "VICTORY!" : "DEFEAT", 110,
                TextAnchor.MiddleCenter, playerWon ? new Color(0.4f, 1f, 0.5f) : new Color(1f, 0.4f, 0.4f))
                .rectTransform.also(rt => UIFactory.Anchor(rt, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                    new Vector2(0.5f, 0.5f), new Vector2(0f, 300f), new Vector2(900f, 160f)));

            string summary = _gm != null ? $"Kills — Blue {_gm.BlueScore}   Red {_gm.RedScore}" : "";
            UIFactory.Label("Summary", _gameOverPanel.transform, summary, 44, TextAnchor.MiddleCenter, Color.white)
                .rectTransform.also(rt => UIFactory.Anchor(rt, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                    new Vector2(0.5f, 0.5f), new Vector2(0f, 150f), new Vector2(900f, 80f)));

            var again = UIFactory.Button("Rematch", _gameOverPanel.transform, "PLAY AGAIN", new Color(0.3f, 0.55f, 0.9f), Color.white, 56);
            UIFactory.Anchor(again.image.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                new Vector2(0f, -120f), new Vector2(680f, 150f));
            again.onClick.AddListener(() =>
            {
                Destroy(_gameOverPanel);
                _gameOverPanel = null;
                onRematch?.Invoke();
            });
        }

        public void ClearGameplayUI()
        {
            if (_hudPanel != null) Destroy(_hudPanel);
            _hudPanel = null;
            _healthBars = null;
            _player = null;
        }

        // ==================== UPDATE ====================
        void Update()
        {
            if (_hudPanel == null || _gm == null) return;

            if (_player != null && _playerHpFill != null)
            {
                float f = _player.IsAlive ? _player.Health.Fraction : 0f;
                _playerHpFill.fillAmount = f;
                _playerHpFill.color = Color.Lerp(new Color(0.9f, 0.25f, 0.2f), new Color(0.3f, 0.85f, 0.35f), f);
                if (_player.IsAlive)
                    _playerHpText.text = $"{_player.Health.Current:0} / {_player.Health.Max:0}";
                else
                    _playerHpText.text = "ELIMINATED";
            }

            if (_scoreText != null)
                _scoreText.text = $"<b>BLUE {_gm.BlueScore}</b>   :   <b>{_gm.RedScore} RED</b>";
            if (_towerText != null)
                _towerText.text = $"Towers  {_gm.TowersLeft(Team.Blue)}  vs  {_gm.TowersLeft(Team.Red)}   —   destroy the enemy King!";

            if (_respawnPanel != null && _respawnPanel.activeSelf)
            {
                float remain = Mathf.Max(0f, _respawnEndTime - Time.time);
                _respawnText.text = $"ELIMINATED\n\nRespawning in {Mathf.CeilToInt(remain)}";
            }
        }

        // ==================== helpers ====================
        GameObject NewPanel(string name, Color bg)
        {
            var img = UIFactory.Image(name, _root, bg);
            UIFactory.Stretch(img.rectTransform);
            return img.gameObject;
        }
    }
}
