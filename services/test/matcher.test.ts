import { describe, it, expect } from "vitest";
import { computePairings, QueuedPlayer } from "../src/modules/matchmaking/matcher";

const p = (id: string, mmr: number): QueuedPlayer => ({ id, mmr });
const ids = (pairs: [QueuedPlayer, QueuedPlayer][]) =>
  pairs.map(([a, b]) => [a.id, b.id]);

describe("computePairings", () => {
  it("returns no pairs for an empty or single-player pool", () => {
    expect(computePairings([], 150)).toEqual([]);
    expect(computePairings([p("a", 1000)], 150)).toEqual([]);
  });

  it("pairs two players whose MMR gap is within the window", () => {
    const pairs = computePairings([p("a", 1000), p("b", 1100)], 150);
    expect(ids(pairs)).toEqual([["a", "b"]]);
  });

  it("does not pair players whose MMR gap exceeds the window", () => {
    expect(computePairings([p("a", 1000), p("b", 1200)], 150)).toEqual([]);
  });

  it("treats a gap exactly equal to the window as matchable", () => {
    const pairs = computePairings([p("a", 1000), p("b", 1150)], 150);
    expect(ids(pairs)).toEqual([["a", "b"]]);
  });

  it("consumes the second player so three-in-a-row yields one pair", () => {
    const pairs = computePairings([p("a", 1000), p("b", 1050), p("c", 1090)], 150);
    expect(ids(pairs)).toEqual([["a", "b"]]);
  });

  it("forms multiple independent pairs across a larger pool", () => {
    const pool = [p("a", 1000), p("b", 1010), p("c", 1500), p("d", 1520)];
    expect(ids(computePairings(pool, 150))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("skips an out-of-window neighbor but still matches the next viable pair", () => {
    // a is stranded (b is >150 away); b–c are within window and pair up.
    const pool = [p("a", 1000), p("b", 1300), p("c", 1320)];
    expect(ids(computePairings(pool, 150))).toEqual([["b", "c"]]);
  });
});
