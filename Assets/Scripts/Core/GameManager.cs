using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace FPClash
{
    public enum MatchState { Selecting, Playing, Ended }

    /// <summary>
    /// Orchestrates a single 5v5 deathmatch: builds the arena, spawns the player
    /// and 9 bots + towers, tracks kills, handles respawns, and decides the winner
    /// (destroy the enemy King tower).
    /// </summary>
    public class GameManager : MonoBehaviour
    {
        public const int TeamSize = 5;
        public float respawnDelay = 4f;

        public MatchState State { get; private set; } = MatchState.Selecting;
        public Unit Player { get; private set; }
        public int BlueScore { get; private set; }
        public int RedScore { get; private set; }

        Camera _cam;
        UIManager _ui;
        ArenaBuilder _arena;

        readonly List<Unit> _units = new List<Unit>();
        readonly List<Tower> _towers = new List<Tower>();
        readonly Dictionary<Team, int> _spawnCounter = new Dictionary<Team, int> { { Team.Blue, 0 }, { Team.Red, 0 } };

        public int TowersLeft(Team t)
        {
            int n = 0;
            foreach (var tw in _towers) if (tw != null && tw.Team == t && tw.IsAlive) n++;
            return n;
        }

        public void Init(Camera cam, UIManager ui)
        {
            _cam = cam;
            _ui = ui;
        }

        public void BeginSelection()
        {
            State = MatchState.Selecting;
            _ui.ShowCharacterSelect(OnCharacterChosen);
        }

        void OnCharacterChosen(CharacterConfig chosen)
        {
            StartMatch(chosen);
        }

        public void StartMatch(CharacterConfig playerConfig)
        {
            State = MatchState.Playing;
            BlueScore = RedScore = 0;

            var arenaGo = new GameObject("Arena");
            _arena = arenaGo.AddComponent<ArenaBuilder>();
            _arena.Build();

            SpawnTowers();
            SpawnTeams(playerConfig);

            _ui.ShowHUD(this, Player);
        }

        void SpawnTowers()
        {
            foreach (var spot in _arena.Towers)
            {
                var go = new GameObject("Tower");
                go.transform.position = spot.pos;
                var tower = go.AddComponent<Tower>();
                tower.Setup(spot.kind, spot.team);
                tower.Destroyed += OnTowerDestroyed;
                _towers.Add(tower);
            }
        }

        void SpawnTeams(CharacterConfig playerConfig)
        {
            // Blue: player + 4 bots. Red: 5 bots.
            Player = SpawnUnit(playerConfig, Team.Blue, isPlayer: true);

            for (int i = 0; i < TeamSize - 1; i++)
                SpawnUnit(RandomConfig(), Team.Blue, false);

            for (int i = 0; i < TeamSize; i++)
                SpawnUnit(RandomConfig(), Team.Red, false);
        }

        CharacterConfig RandomConfig() =>
            CharacterConfig.Roster[Random.Range(0, CharacterConfig.Roster.Count)];

        Unit SpawnUnit(CharacterConfig config, Team team, bool isPlayer)
        {
            var go = new GameObject(isPlayer ? "Player" : "Bot");
            go.AddComponent<CharacterController>();
            var unit = go.AddComponent<Unit>();

            _arena.RandomSpawn(team, NextSpawnIndex(team), out var pos, out var rot);
            go.transform.SetPositionAndRotation(pos, rot);

            unit.Setup(config, team, (isPlayer ? "Player_" : "Bot_") + config.displayName);
            unit.IsPlayer = isPlayer;
            unit.Killed += OnUnitKilled;
            _units.Add(unit);

            if (isPlayer)
            {
                var pc = go.AddComponent<PlayerController>();
                pc.Init(_cam);
            }
            else
            {
                var bc = go.AddComponent<BotController>();
                bc.Init();
            }
            return unit;
        }

        int NextSpawnIndex(Team team)
        {
            int idx = _spawnCounter[team];
            _spawnCounter[team] = idx + 1;
            return idx;
        }

        void OnUnitKilled(Unit victim, object source)
        {
            if (State != MatchState.Playing) return;

            // Score to the killer's team.
            if (source is IDamageable dmg && dmg.Team != victim.Team)
            {
                if (dmg.Team == Team.Blue) BlueScore++; else RedScore++;
            }

            if (victim.IsPlayer)
                _ui.ShowRespawnCountdown(respawnDelay);

            StartCoroutine(RespawnRoutine(victim));
        }

        IEnumerator RespawnRoutine(Unit unit)
        {
            yield return new WaitForSeconds(respawnDelay);
            if (State != MatchState.Playing || unit == null) yield break;

            _arena.RandomSpawn(unit.Team, NextSpawnIndex(unit.Team), out var pos, out var rot);
            unit.Respawn(pos, rot);
            if (unit.IsPlayer) _ui.HideRespawnCountdown();
        }

        void OnTowerDestroyed(Tower tower)
        {
            if (State != MatchState.Playing) return;
            if (tower.Kind == TowerKind.King)
                EndMatch(winner: tower.Team.Opponent());
        }

        void EndMatch(Team winner)
        {
            State = MatchState.Ended;
            StopAllCoroutines();
            bool playerWon = winner == Team.Blue;
            _ui.ShowGameOver(playerWon, Rematch);
        }

        void Rematch()
        {
            // Tear the match down and rebuild fresh.
            foreach (var u in _units) if (u != null) Destroy(u.gameObject);
            foreach (var t in _towers) if (t != null) Destroy(t.gameObject);
            _units.Clear();
            _towers.Clear();
            Combatants.All.Clear();
            _spawnCounter[Team.Blue] = 0;
            _spawnCounter[Team.Red] = 0;
            if (_arena != null) Destroy(_arena.gameObject);
            InputHub.Clear();

            _ui.ClearGameplayUI();
            BeginSelection();
        }
    }
}
