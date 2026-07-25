using System.Collections.Generic;
using UnityEngine;

namespace Siegebreak.Cards
{
    /// <summary>
    /// Clash-Royale-style hand rotation: 8-card deck, 4 visible in hand at
    /// once, playing a card draws the next one from the shuffled remainder.
    /// Server-authoritative — the client's copy is predictive display only,
    /// same pattern as ElixirManager.
    /// </summary>
    public class DeckManager : MonoBehaviour
    {
        private const int HandSize = 4;

        private List<CardData> _drawPile = new();
        private List<CardData> _hand = new();

        public IReadOnlyList<CardData> Hand => _hand;

        public void Initialize(List<CardData> deck)
        {
            if (deck.Count != 8)
            {
                Debug.LogError($"Deck must have exactly 8 cards, got {deck.Count}");
                return;
            }

            _drawPile = new List<CardData>(deck);
            Shuffle(_drawPile);

            _hand.Clear();
            for (var i = 0; i < HandSize; i++)
            {
                _hand.Add(_drawPile[0]);
                _drawPile.RemoveAt(0);
            }
        }

        // Called after the server confirms a deploy (see
        // CardDeploymentManager) — never remove from hand optimistically
        // before that confirmation, or a rejected deploy leaves the
        // client's hand out of sync with the server's.
        public bool TryPlay(CardData card, out CardData nextCard)
        {
            nextCard = null;
            var index = _hand.IndexOf(card);
            if (index < 0) return false;

            _hand.RemoveAt(index);

            if (_drawPile.Count == 0)
            {
                // Discard pile → draw pile reshuffle would go here once a
                // full deck-cycling implementation is needed; 8 cards
                // cycling through a 4-card hand means this triggers often
                // in a real match, so don't leave this TODO for later.
                Debug.LogWarning("Draw pile empty — reshuffle not yet implemented");
                return true;
            }

            nextCard = _drawPile[0];
            _drawPile.RemoveAt(0);
            _hand.Add(nextCard);
            return true;
        }

        private static void Shuffle(List<CardData> list)
        {
            for (var i = list.Count - 1; i > 0; i--)
            {
                var j = Random.Range(0, i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }
    }
}
