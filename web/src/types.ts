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

/** Authenticated player's own progression, joined with the wallet. */
export interface Me {
  id: string;
  displayName: string;
  level: number;
  xp: number;
  rating: number;
  wallet: { gold: number; gems: number };
}

export type MatchResult = "win" | "loss" | "draw";

export interface MatchOpponent {
  playerId: string;
  displayName: string;
  result: MatchResult;
}

/** One row of the authed player's match history (newest first from the API). */
export interface MatchHistoryEntry {
  matchId: string;
  mode: string;
  region: string;
  endedAt: string | null;
  result: MatchResult;
  trophiesDelta: number;
  deckId: string;
  opponents: MatchOpponent[];
}

export interface StatusResponse {
  status: string;
}
