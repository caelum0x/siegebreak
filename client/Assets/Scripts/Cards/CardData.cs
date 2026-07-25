using UnityEngine;

namespace Siegebreak.Cards
{
    public enum CardType { Troop, Spell, Building, Hero }

    /// <summary>
    /// Design-facing card definition — one asset per card under
    /// Assets/ScriptableObjects/Cards/. The backend `cards` module holds
    /// the source-of-truth copy (services/src/modules/cards); both should
    /// validate against shared/card-schema.json in CI to prevent drift.
    /// </summary>
    [CreateAssetMenu(fileName = "NewCard", menuName = "Siegebreak/Card")]
    public class CardData : ScriptableObject
    {
        public string cardId;
        public string displayName;
        public CardType type;
        public int elixirCost;
        public GameObject prefab;
    }
}
