using System.Collections.Generic;
using UnityEngine;
using Siegebreak.Cards;
using Siegebreak.Networking;
using Siegebreak.Units;

namespace Siegebreak.Core
{
    /// <summary>
    /// The authoritative match simulation. Only ever runs on whichever
    /// client NetworkBootstrap.IsHost reports true for that match — see
    /// Core/MatchSimulationController, which owns the IsHost branch and
    /// drives this class's Tick every frame. Not a MonoBehaviour itself so
    /// it stays easy to reason about and (eventually) unit-test without a
    /// scene.
    ///
    /// Responsibilities: validate + spawn deploys from either player,
    /// tick elixir regen for both sides, run every spawned unit's
    /// AutoUnitAI against a real nearest-enemy target, resolve attack
    /// damage (unit-vs-unit, unit-vs-tower, tower-vs-unit), drive
    /// MatchStateController's win-condition clock, and broadcast a
    /// state_snapshot to the guest on a fixed cadence.
    /// </summary>
    internal class MatchHostSimulator
    {
        private const float SnapshotIntervalSeconds = 0.1f; // 10Hz
        private const float TowerAttackIntervalSeconds = 1f;

        private readonly NetworkBootstrap _network;
        private readonly MatchStateController _matchState;
        private readonly ElixirManager _hostElixir;
        private readonly ElixirManager _guestElixir;
        private readonly CardCatalog _catalog;
        private readonly List<TowerController> _hostTowers;
        private readonly List<TowerController> _guestTowers;
        private readonly Transform _unitsParent;

        private readonly Dictionary<string, SpawnedUnit> _units = new Dictionary<string, SpawnedUnit>();
        private readonly Dictionary<TowerController, float> _towerAttackTimers = new Dictionary<TowerController, float>();
        private float _snapshotTimer;
        private int _nextUnitSequence;

        public MatchHostSimulator(
            NetworkBootstrap network,
            MatchStateController matchState,
            ElixirManager hostElixir,
            ElixirManager guestElixir,
            CardCatalog catalog,
            List<TowerController> hostTowers,
            List<TowerController> guestTowers,
            Transform unitsParent)
        {
            _network = network;
            _matchState = matchState;
            _hostElixir = hostElixir;
            _guestElixir = guestElixir;
            _catalog = catalog;
            _hostTowers = hostTowers ?? new List<TowerController>();
            _guestTowers = guestTowers ?? new List<TowerController>();
            _unitsParent = unitsParent;
        }

        /// <summary>
        /// Validates and (if valid) spawns a deploy for either player. The
        /// host's own plays and the guest's relayed deploy_input frames
        /// both funnel through here — this is the single point where
        /// elixir is actually spent, so there's no way for a client-side
        /// bug to spawn something it didn't pay for.
        /// </summary>
        public bool HandleDeployRequest(bool isHostOwned, string cardId, Vector3 position)
        {
            if (_catalog == null || !_catalog.TryGetCard(cardId, out var card) || card.prefab == null)
            {
                Debug.LogWarning($"[MatchHostSimulator] Unknown or unspawnable cardId '{cardId}'.");
                return false;
            }

            if (card.type != CardType.Troop && card.type != CardType.Building)
            {
                // Spells/heroes resolve differently (instant effect /
                // already-on-field hero) and aren't modeled by this
                // deploy-and-spawn path yet — deliberately out of scope
                // this round, see BUILD-LOG.md.
                Debug.LogWarning($"[MatchHostSimulator] Card type {card.type} isn't deployable via this path yet.");
                return false;
            }

            var elixir = isHostOwned ? _hostElixir : _guestElixir;
            if (elixir == null || !elixir.TrySpend(card.elixirCost))
            {
                return false;
            }

            var count = Mathf.Max(1, card.spawnCount);
            for (var i = 0; i < count; i++)
            {
                SpawnUnit(card, isHostOwned, position + SpawnOffset(i, count));
            }

            return true;
        }

        private static Vector3 SpawnOffset(int index, int count)
        {
            if (count <= 1) return Vector3.zero;
            // Fan multi-count cards (Swarm's 4) out slightly so they don't
            // spawn stacked on top of each other.
            var angle = (360f / count) * index;
            var rad = angle * Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(rad), 0f, Mathf.Sin(rad)) * 0.75f;
        }

        private void SpawnUnit(CardData card, bool isHostOwned, Vector3 position)
        {
            var go = Object.Instantiate(card.prefab, position, Quaternion.identity, _unitsParent);
            var spawned = go.GetComponent<SpawnedUnit>();
            if (spawned == null) spawned = go.AddComponent<SpawnedUnit>();

            var unitId = $"u{_nextUnitSequence++}_{(isHostOwned ? "h" : "g")}";
            spawned.Initialize(unitId, card, isHostOwned);
            spawned.Ai?.Configure(card.attackRange, 1f);

            // Captures `spawned` directly so attack resolution always knows
            // exactly which unit's dps/ownership to apply — no need to
            // re-derive the attacker from position matching afterwards.
            if (spawned.Ai != null)
            {
                spawned.Ai.OnAttackTick += target => HandleUnitAttack(spawned, target);
            }

            _units[unitId] = spawned;
        }

        public void Tick(float deltaTime)
        {
            _hostElixir?.Tick(deltaTime);
            _guestElixir?.Tick(deltaTime);

            TickUnits(deltaTime);
            TickTowerAttacks(deltaTime);
            SweepDestroyedUnits();

            _matchState?.ServerTick(deltaTime);

            _snapshotTimer += deltaTime;
            if (_snapshotTimer >= SnapshotIntervalSeconds)
            {
                _snapshotTimer -= SnapshotIntervalSeconds;
                BroadcastSnapshot();
            }
        }

        private void TickUnits(float deltaTime)
        {
            foreach (var unit in _units.Values)
            {
                if (unit == null || unit.Ai == null || unit.Health == null || unit.Health.IsDestroyed) continue;

                var enemyTowers = unit.IsHostOwned ? _guestTowers : _hostTowers;
                var target = TargetingUtil.FindNearestTarget(unit, _units.Values, enemyTowers);
                unit.Ai.ServerTick(target, deltaTime);
            }
        }

        private static void HandleUnitAttack(SpawnedUnit attacker, Transform targetTransform)
        {
            if (targetTransform == null || attacker?.Card == null) return;

            var targetUnit = targetTransform.GetComponent<SpawnedUnit>();
            if (targetUnit != null)
            {
                targetUnit.Health.ApplyDamage(attacker.Card.dps);
                return;
            }

            var targetTower = targetTransform.GetComponent<TowerController>();
            targetTower?.ApplyDamage(attacker.Card.dps);
        }

        private void TickTowerAttacks(float deltaTime)
        {
            TickTowerSideAttacks(_hostTowers, isHostSide: true, deltaTime);
            TickTowerSideAttacks(_guestTowers, isHostSide: false, deltaTime);
        }

        // Towers defend their own side: a host-side tower only engages
        // units owned by the guest, and vice versa.
        private void TickTowerSideAttacks(List<TowerController> towers, bool isHostSide, float deltaTime)
        {
            foreach (var tower in towers)
            {
                if (tower == null || tower.IsDestroyed) continue;

                var target = FindNearestEnemyUnitInRange(tower, isHostSide);
                if (target == null)
                {
                    _towerAttackTimers[tower] = 0f;
                    continue;
                }

                var timer = _towerAttackTimers.TryGetValue(tower, out var t) ? t : 0f;
                timer += deltaTime;
                if (timer >= TowerAttackIntervalSeconds)
                {
                    timer -= TowerAttackIntervalSeconds;
                    target.Health.ApplyDamage(tower.Dps);
                }
                _towerAttackTimers[tower] = timer;
            }
        }

        private SpawnedUnit FindNearestEnemyUnitInRange(TowerController tower, bool isTowerHostSide)
        {
            SpawnedUnit nearest = null;
            var nearestDistSqr = float.MaxValue;

            foreach (var unit in _units.Values)
            {
                if (unit == null || unit.Health == null || unit.Health.IsDestroyed) continue;
                if (unit.IsHostOwned == isTowerHostSide) continue; // same side as the tower, not a target
                if (!tower.IsInRange(unit.transform.position)) continue;

                var distSqr = (unit.transform.position - tower.transform.position).sqrMagnitude;
                if (distSqr < nearestDistSqr)
                {
                    nearestDistSqr = distSqr;
                    nearest = unit;
                }
            }

            return nearest;
        }

        private void SweepDestroyedUnits()
        {
            List<string> toRemove = null;
            foreach (var kvp in _units)
            {
                if (kvp.Value == null || kvp.Value.Health == null || kvp.Value.Health.IsDestroyed)
                {
                    toRemove ??= new List<string>();
                    toRemove.Add(kvp.Key);
                }
            }

            if (toRemove == null) return;

            foreach (var id in toRemove)
            {
                if (_units.TryGetValue(id, out var unit) && unit != null)
                {
                    Object.Destroy(unit.gameObject);
                }
                _units.Remove(id);
            }
        }

        private void BroadcastSnapshot()
        {
            if (_network == null) return;

            var frame = new StateSnapshotWireFrame
            {
                hostElixir = _hostElixir != null ? _hostElixir.Current : 0,
                guestElixir = _guestElixir != null ? _guestElixir.Current : 0,
                matchResult = _matchState != null ? _matchState.Result.ToString() : MatchResult.InProgress.ToString(),
                serverTimeSeconds = Time.realtimeSinceStartup,
            };

            foreach (var unit in _units.Values)
            {
                if (unit == null || unit.Health == null) continue;
                var pos = unit.transform.position;
                frame.units.Add(new UnitSnapshot
                {
                    unitId = unit.UnitId,
                    cardId = unit.Card != null ? unit.Card.cardId : null,
                    isHostOwned = unit.IsHostOwned,
                    x = pos.x,
                    y = pos.y,
                    z = pos.z,
                    currentHp = unit.Health.CurrentHp,
                });
            }

            AddTowerSnapshots(frame, _hostTowers, isHostSide: true);
            AddTowerSnapshots(frame, _guestTowers, isHostSide: false);

            var json = JsonUtility.ToJson(frame);
            _ = _network.SendMatchFrame(json);
        }

        private static void AddTowerSnapshots(StateSnapshotWireFrame frame, List<TowerController> towers, bool isHostSide)
        {
            foreach (var tower in towers)
            {
                if (tower == null) continue;
                frame.towers.Add(new TowerSnapshot
                {
                    towerId = TowerId(isHostSide, tower.Slot),
                    currentHp = tower.CurrentHp,
                });
            }
        }

        public static string TowerId(bool isHostSide, TowerSlot slot) => $"{(isHostSide ? "host" : "guest")}_{slot}";
    }
}
