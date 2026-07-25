import type { Card } from "../types";

interface CardTileProps {
  card: Card;
  onAdd: (card: Card) => void;
  disabled?: boolean;
}

export function CardTile({ card, onAdd, disabled = false }: CardTileProps) {
  return (
    <div className={`card card--${card.type}`}>
      <div className="card__header">
        <span className="card__elixir" title="Elixir cost">
          {card.elixirCost}
        </span>
        <span className={`card__type card__type--${card.type}`}>{card.type}</span>
      </div>
      <div className="card__name">{card.name}</div>
      <button
        type="button"
        className="btn btn--small"
        onClick={() => onAdd(card)}
        disabled={disabled}
      >
        Add {card.name}
      </button>
    </div>
  );
}
