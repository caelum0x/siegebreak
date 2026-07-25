import { useEffect, useMemo, useState } from "react";
import { apiErrorCode, createDeck, getCards, getDecks } from "../api/client";
import { CardTile } from "../components/CardTile";
import type { Card, Deck } from "../types";
import {
  clearSlot,
  emptyDeck,
  HERO_SLOT,
  isComplete,
  nextEmptyIndex,
  placeInSlot,
  validatePlacement,
  type DeckSlots,
} from "../deck/deckSlots";

function slotLabel(index: number): string {
  return index === HERO_SLOT ? "Hero" : `Slot ${index + 1}`;
}

export function Collection() {
  const [cards, setCards] = useState<Card[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [slots, setSlots] = useState<DeckSlots>(() => emptyDeck());
  const [selectedSlot, setSelectedSlot] = useState<number>(HERO_SLOT);
  const [name, setName] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const cardsById = useMemo(() => {
    const map = new Map<string, Card>();
    for (const card of cards) map.set(card.id, card);
    return map;
  }, [cards]);

  useEffect(() => {
    let active = true;
    Promise.all([getCards(), getDecks().catch(() => [] as Deck[])])
      .then(([cardList, deckList]) => {
        if (!active) return;
        setCards(cardList);
        setDecks(deckList);
      })
      .catch(() => {
        if (active) setMessage("Failed to load cards.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const addCard = (card: Card): void => {
    const validation = validatePlacement(selectedSlot, card);
    if (!validation.ok) {
      setMessage(validation.message ?? "Invalid placement.");
      return;
    }
    const next = placeInSlot(slots, selectedSlot, card.id);
    setSlots(next);
    setMessage(null);
    const empty = nextEmptyIndex(next);
    setSelectedSlot(empty === -1 ? selectedSlot : empty);
  };

  const removeCard = (index: number): void => {
    setSlots(clearSlot(slots, index));
    setSelectedSlot(index);
    setMessage(null);
  };

  const heroOk = (() => {
    const heroId = slots[HERO_SLOT];
    if (!heroId) return false;
    return cardsById.get(heroId)?.type === "hero";
  })();

  const canSave = name.trim().length > 0 && isComplete(slots) && heroOk && !saving;

  const onSave = async (): Promise<void> => {
    if (!isComplete(slots)) {
      setMessage("Fill all 8 slots before saving.");
      return;
    }
    if (!heroOk) {
      setMessage("Slot 0 must contain a hero card.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await createDeck({ name: name.trim(), slots: [...slots] });
      setDecks((prev) => [...prev, created]);
      setSlots(emptyDeck());
      setSelectedSlot(HERO_SLOT);
      setName("");
      setMessage(`Saved deck “${created.name}”.`);
    } catch (err) {
      const code = apiErrorCode(err);
      if (code === "slot_0_must_be_hero") {
        setMessage("Server rejected the deck: slot 0 must be a hero card.");
      } else {
        setMessage("Could not save deck. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="page">
        <p>Loading collection…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <h2>Deck Builder</h2>

      <section className="deck">
        <div className="deck__slots">
          {slots.map((cardId, index) => {
            const card = cardId ? cardsById.get(cardId) : undefined;
            const isSelected = index === selectedSlot;
            return (
              <div
                key={index}
                className={`slot ${isSelected ? "slot--selected" : ""} ${
                  index === HERO_SLOT ? "slot--hero" : ""
                }`}
              >
                <button
                  type="button"
                  className="slot__select"
                  aria-pressed={isSelected}
                  aria-label={`Select ${slotLabel(index)} slot`}
                  onClick={() => setSelectedSlot(index)}
                >
                  <span className="slot__label">{slotLabel(index)}</span>
                  <span className="slot__card">{card ? card.name : "empty"}</span>
                </button>
                {card && (
                  <button
                    type="button"
                    className="slot__remove"
                    aria-label={`Remove ${card.name} from ${slotLabel(index)}`}
                    onClick={() => removeCard(index)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="deck__actions">
          <label className="field">
            <span className="field__label">Deck name</span>
            <input
              className="field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Deck"
              maxLength={40}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onSave}
            disabled={!canSave}
          >
            {saving ? "Saving…" : "Save Deck"}
          </button>
        </div>

        {message && (
          <p className="alert" role="alert">
            {message}
          </p>
        )}
        <p className="deck__hint">
          Selected: <strong>{slotLabel(selectedSlot)}</strong>. Click a slot to target it,
          then add a card. Slot 0 only accepts heroes.
        </p>
      </section>

      <section>
        <h3>Cards</h3>
        <div className="card-grid">
          {cards.map((card) => (
            <CardTile key={card.id} card={card} onAdd={addCard} />
          ))}
        </div>
      </section>

      <section>
        <h3>Your Decks</h3>
        {decks.length === 0 ? (
          <p className="muted">No decks yet — build one above.</p>
        ) : (
          <ul className="deck-list">
            {decks.map((deck) => (
              <li key={deck.id} className="deck-list__item">
                <strong>{deck.name}</strong>
                <span className="muted"> — {deck.slots.length} cards</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
