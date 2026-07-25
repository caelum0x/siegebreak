// Shared domain types mirroring the backend contract (services/).

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type CardType = "hero" | "troop" | "spell" | "building";

export interface Card {
  id: string;
  name: string;
  type: CardType;
  elixirCost: number;
  baseStats: Record<string, unknown>;
}

export interface Deck {
  id: string;
  playerId: string;
  name: string;
  slots: string[];
}

export interface CreateDeckInput {
  name: string;
  /** Exactly 8 card ids; slot 0 must reference a hero card. */
  slots: string[];
}

export interface Wallet {
  playerId: string;
  gold: number;
  gems: number;
}

export interface MatchTicket {
  status?: "queued" | "matched";
  sessionId?: string;
  deckId?: string;
}

export interface LeaderboardEntry {
  playerId: string;
  trophies: number;
  rank: number;
}

export interface StatusResponse {
  status: string;
}
