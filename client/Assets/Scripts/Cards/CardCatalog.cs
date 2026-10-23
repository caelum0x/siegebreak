using System.Collections.Generic;
using UnityEngine;

namespace Siegebreak.Cards
{
    /// <summary>
    /// Every CardData asset the client knows about, keyed by cardId. The
    /// host simulator (Core/MatchHostSimulator) needs this to resolve an
    /// incoming deploy_input's bare cardId string back into a prefab + stat
    /// block, since it has to be able to spawn a card the *other* player
    /// plays, not just the local hand (which DeckManager already covers).
    /// One asset, assigned once in the Inspector — same idea as DeckManager
    /// being handed a resolved List&lt;CardData&gt; rather than loading
    /// anything itself.
    /// </summary>
    [CreateAssetMenu(fileName = "CardCatalog", menuName = "Siegebreak/Card Catalog")]
    public class CardCatalog : ScriptableObject
    {
        [SerializeField] private List<CardData> cards = new();

        private Dictionary<string, CardData> _byId;

        public bool TryGetCard(string cardId, out CardData card)
        {
            EnsureIndexed();
            return _byId.TryGetValue(cardId, out card);
        }

        private void EnsureIndexed()
        {
            if (_byId != null) return;

            _byId = new Dictionary<string, CardData>();
            foreach (var card in cards)
            {
                if (card == null || string.IsNullOrEmpty(card.cardId)) continue;
                if (!_byId.ContainsKey(card.cardId))
                {
                    _byId.Add(card.cardId, card);
                }
                else
                {
                    Debug.LogWarning($"[CardCatalog] Duplicate cardId '{card.cardId}' — keeping the first entry.");
                }
            }
        }

        // Unity re-runs OnEnable whenever this asset is (re)loaded, including
        // after an Inspector edit in the editor — invalidate the cached
        // index so a stale lookup never survives a card being swapped.
        private void OnEnable() => _byId = null;
    }
}
