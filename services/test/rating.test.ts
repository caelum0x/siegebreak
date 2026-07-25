import { describe, it, expect } from "vitest";
import { resultToScore, computeElo, matchRewards, levelForXp } from "../src/lib/rating";

describe("resultToScore", () => {
  it("maps outcomes to Elo scores", () => {
    expect(resultToScore("win")).toBe(1);
    expect(resultToScore("draw")).toBe(0.5);
    expect(resultToScore("loss")).toBe(0);
  });
});

describe("computeElo", () => {
  it("moves equal-rated players by half K on a decisive result", () => {
    // Equal ratings: expected = 0.5, so K*(1-0.5)=16 to the winner, -16 loser.
    const { a, b } = computeElo(1000, 1000, 1);
    expect(a).toBe(1016);
    expect(b).toBe(984);
  });

  it("leaves equal-rated players unchanged on a draw", () => {
    expect(computeElo(1000, 1000, 0.5)).toEqual({ a: 1000, b: 1000 });
  });

  it("awards fewer points when a favorite beats an underdog", () => {
    const { a } = computeElo(1400, 1000, 1); // heavy favorite wins
    expect(a - 1400).toBeGreaterThan(0);
    expect(a - 1400).toBeLessThan(16); // less than the equal-rating gain
  });

  it("is zero-sum: points the winner gains, the loser loses", () => {
    const ra = 1200;
    const rb = 1050;
    const { a, b } = computeElo(ra, rb, 1);
    expect(a - ra).toBe(rb - b);
  });
});

describe("matchRewards", () => {
  it("pays out most for a win, least for a loss, and always something", () => {
    expect(matchRewards("win")).toEqual({ xp: 30, gold: 10 });
    expect(matchRewards("draw")).toEqual({ xp: 15, gold: 5 });
    expect(matchRewards("loss")).toEqual({ xp: 10, gold: 2 });
  });
});

describe("levelForXp", () => {
  it("derives a 1-based level per 1000 XP", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(999)).toBe(1);
    expect(levelForXp(1000)).toBe(2);
    expect(levelForXp(2500)).toBe(3);
  });

  it("never returns a level below 1", () => {
    expect(levelForXp(-50)).toBe(1);
  });
});
