using UnityEngine;

namespace Siegebreak.Cards
{
    public enum CardType { Troop, Spell, Building, Hero }

    /// <summary>
    /// Mirrors the backend seed's "targets" string (services/src/db/seed.ts)
    /// so the host simulator can decide what a spawned troop is allowed to
    /// engage. No flying units exist yet, so Ground and GroundAndAir behave
    /// identically for now — kept distinct so adding air troops later only
    /// touches targeting, not every card asset.
    /// </summary>
    public enum TargetMode { Ground, GroundAndAir, BuildingsOnly }

    /// <summary>
    /// Design-facing card definition — one asset per card under
    /// Assets/ScriptableObjects/Cards/. The backend `cards` module holds
    /// the source-of-truth copy (services/src/modules/cards, baseStats in
    /// services/src/db/seed.ts); both should validate against
    /// shared/card-schema.json in CI to prevent drift.
    /// </summary>
    [CreateAssetMenu(fileName = "NewCard", menuName = "Siegebreak/Card")]
    public class CardData : ScriptableObject
    {
        public string cardId;
        public string displayName;
        public CardType type;
        public int elixirCost;
        public GameObject prefab;

        [Header("Combat stats (troop/building only; mirrors backend baseStats)")]
        public int hp = 100;
        public int dps = 10;
        public float attackRange = 1.5f;

        // Siege Ram-style "count 4" cards (e.g. Swarm) spawn this many
        // instances per deploy, each an independent unit.
        public int spawnCount = 1;
        public TargetMode targets = TargetMode.Ground;
    }
}
