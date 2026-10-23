using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using Siegebreak.Cards;
using Siegebreak.Units;

namespace Siegebreak.Core
{
    /// <summary>
    /// Guest-only counterpart to MatchHostSimulator: applies the host's
    /// state_snapshot frames to the local scene instead of running any
    /// simulation. Every unit here is pure visual — AutoUnitAI and
    /// NavMeshAgent are disabled the moment a unit is first seen, so there
    /// is never a second, conflicting simulation fighting the host's.
    /// </summary>
    internal class MatchSnapshotRenderer
    {
        private readonly CardCatalog _catalog;
        private readonly ElixirManager _hostElixir;
        private readonly ElixirManager _guestElixir;
        private readonly MatchStateController _matchState;
        private readonly List<TowerController> _hostTowers;
        private readonly List<TowerController> _guestTowers;
        private readonly Transform _unitsParent;

        private readonly Dictionary<string, SpawnedUnit> _renderedUnits = new Dictionary<string, SpawnedUnit>();

        public MatchSnapshotRenderer(
            CardCatalog catalog,
            ElixirManager hostElixir,
            ElixirManager guestElixir,
            MatchStateController matchState,
            List<TowerController> hostTowers,
            List<TowerController> guestTowers,
            Transform unitsParent)
        {
            _catalog = catalog;
            _hostElixir = hostElixir;
            _guestElixir = guestElixir;
            _matchState = matchState;
            _hostTowers = hostTowers ?? new List<TowerController>();
            _guestTowers = guestTowers ?? new List<TowerController>();
            _unitsParent = unitsParent;
        }

        public void Apply(StateSnapshotWireFrame snapshot)
        {
            if (snapshot == null) return;

            _hostElixir?.SyncFromServer(snapshot.hostElixir);
            _guestElixir?.SyncFromServer(snapshot.guestElixir);

            if (_matchState != null && Enum.TryParse(snapshot.matchResult, out MatchResult result))
            {
                _matchState.SyncResultFromServer(result);
            }

            ReconcileUnits(snapshot.units);
            ReconcileTowers(snapshot.towers);
        }

        private void ReconcileUnits(List<UnitSnapshot> units)
        {
            var seen = new HashSet<string>();

            foreach (var unitSnapshot in units)
            {
                if (string.IsNullOrEmpty(unitSnapshot.unitId)) continue;
                seen.Add(unitSnapshot.unitId);

                var position = new Vector3(unitSnapshot.x, unitSnapshot.y, unitSnapshot.z);

                if (_renderedUnits.TryGetValue(unitSnapshot.unitId, out var existing) && existing != null)
                {
                    existing.transform.position = position;
                    existing.Health.SyncFromSnapshot(unitSnapshot.currentHp);
                    continue;
                }

                var spawned = SpawnVisualOnly(unitSnapshot, position);
                if (spawned != null) _renderedUnits[unitSnapshot.unitId] = spawned;
            }

            RemoveUnitsNotIn(seen);
        }

        private SpawnedUnit SpawnVisualOnly(UnitSnapshot unitSnapshot, Vector3 position)
        {
            if (_catalog == null || !_catalog.TryGetCard(unitSnapshot.cardId, out var card) || card.prefab == null)
            {
                Debug.LogWarning($"[MatchSnapshotRenderer] Unknown cardId '{unitSnapshot.cardId}' in snapshot.");
                return null;
            }

            var go = UnityEngine.Object.Instantiate(card.prefab, position, Quaternion.identity, _unitsParent);

            // This client is the guest — never run a second simulation on
            // top of the host's. Only the visuals (mesh/animator/VFX) on
            // this prefab stay live.
            var ai = go.GetComponent<AutoUnitAI>();
            if (ai != null) ai.enabled = false;
            var agent = go.GetComponent<NavMeshAgent>();
            if (agent != null) agent.enabled = false;

            var spawned = go.GetComponent<SpawnedUnit>();
            if (spawned == null) spawned = go.AddComponent<SpawnedUnit>();
            spawned.Initialize(unitSnapshot.unitId, card, unitSnapshot.isHostOwned);
            spawned.Health.SyncFromSnapshot(unitSnapshot.currentHp);

            return spawned;
        }

        private void RemoveUnitsNotIn(HashSet<string> seenUnitIds)
        {
            List<string> toRemove = null;
            foreach (var id in _renderedUnits.Keys)
            {
                if (!seenUnitIds.Contains(id))
                {
                    toRemove ??= new List<string>();
                    toRemove.Add(id);
                }
            }

            if (toRemove == null) return;

            foreach (var id in toRemove)
            {
                if (_renderedUnits.TryGetValue(id, out var unit) && unit != null)
                {
                    UnityEngine.Object.Destroy(unit.gameObject);
                }
                _renderedUnits.Remove(id);
            }
        }

        private void ReconcileTowers(List<TowerSnapshot> towers)
        {
            foreach (var towerSnapshot in towers)
            {
                var tower = FindTowerById(towerSnapshot.towerId);
                tower?.SyncFromSnapshot(towerSnapshot.currentHp);
            }
        }

        private TowerController FindTowerById(string towerId)
        {
            foreach (var tower in _hostTowers)
            {
                if (tower != null && MatchHostSimulator.TowerId(true, tower.Slot) == towerId) return tower;
            }
            foreach (var tower in _guestTowers)
            {
                if (tower != null && MatchHostSimulator.TowerId(false, tower.Slot) == towerId) return tower;
            }
            return null;
        }
    }
}
