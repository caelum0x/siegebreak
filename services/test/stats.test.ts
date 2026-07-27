import { describe, it, expect } from "vitest";
import { summarizeRecord } from "../src/lib/stats";

describe("summarizeRecord", () => {
  it("returns an all-zero record with 0 win rate for no games", () => {
    expect(summarizeRecord([])).toEqual({
      wins: 0,
      losses: 0,
      draws: 0,
      played: 0,
      winRate: 0,
    });
  });

  it("sums each outcome and derives played + win rate", () => {
    const record = summarizeRecord([
      { result: "win", count: 3 },
      { result: "loss", count: 1 },
      { result: "draw", count: 0 },
    ]);
    expect(record).toEqual({
      wins: 3,
      losses: 1,
      draws: 0,
      played: 4,
      winRate: 0.75,
    });
  });

  it("rounds the win rate to three decimal places", () => {
    // 1/3 = 0.3333… -> 0.333
    const record = summarizeRecord([
      { result: "win", count: 1 },
      { result: "loss", count: 2 },
    ]);
    expect(record.winRate).toBe(0.333);
  });

  it("counts draws toward played but not toward the win rate", () => {
    const record = summarizeRecord([
      { result: "win", count: 1 },
      { result: "draw", count: 1 },
    ]);
    expect(record.played).toBe(2);
    expect(record.winRate).toBe(0.5);
  });

  it("ignores unknown result strings rather than counting them", () => {
    const record = summarizeRecord([
      { result: "win", count: 2 },
      { result: "forfeit", count: 5 },
    ]);
    expect(record).toEqual({
      wins: 2,
      losses: 0,
      draws: 0,
      played: 2,
      winRate: 1,
    });
  });

  it("is order-independent", () => {
    const a = summarizeRecord([
      { result: "loss", count: 2 },
      { result: "win", count: 2 },
    ]);
    const b = summarizeRecord([
      { result: "win", count: 2 },
      { result: "loss", count: 2 },
    ]);
    expect(a).toEqual(b);
  });
});
