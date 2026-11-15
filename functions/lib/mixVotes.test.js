import { describe, expect, it } from "vitest";
import { legacyRecipeId, nextVote, parseVote, totalsOf, voteDelta } from "./mixVotes.js";

describe("Mix votes", () => {
  it("accepts only a 1–5 rating, clearing it, or a report", () => {
    expect(parseVote({ stars: 4 })).toEqual({ stars: 4 });
    expect(parseVote({ stars: null })).toEqual({ stars: null });
    expect(parseVote({ report: "  Spam " })).toEqual({ report: "Spam" });
    for (const bad of [{}, null, { stars: 0 }, { stars: 6 }, { stars: 2.5 }, { stars: "5" }, { report: 3 }]) expect(() => parseVote(bad)).toThrow();
  });

  it("keeps totals right as a vote changes", () => {
    const now = 1000;
    let { vote } = nextVote(null, { stars: 4 }, "m", "u", now);
    expect(voteDelta(null, vote)).toEqual({ ratingSum: 4, ratingCount: 1, reportCount: 0 });
    const changed = nextVote(vote, { stars: 2 }, "m", "u", now).vote;
    expect(voteDelta(vote, changed)).toEqual({ ratingSum: -2, ratingCount: 0, reportCount: 0 });
    const withReport = nextVote(changed, { report: "Spam" }, "m", "u", now).vote;
    expect(withReport).toMatchObject({ stars: 2, reason: "Spam", reportedAt: now });
    expect(voteDelta(changed, withReport)).toEqual({ ratingSum: 0, ratingCount: 0, reportCount: 1 });
    // Reporting twice counts once.
    expect(nextVote(withReport, { report: "Again" }, "m", "u", now)).toEqual({ vote: withReport, already: true });
    // Clearing the stars keeps the report; then nothing is left once both are gone.
    const cleared = nextVote(withReport, { stars: null }, "m", "u", now).vote;
    expect(voteDelta(withReport, cleared)).toEqual({ ratingSum: -2, ratingCount: -1, reportCount: 0 });
    expect(nextVote({ stars: 3 }, { stars: null }, "m", "u", now).vote).toBeNull();
    // Removing a vote entirely (account deleted).
    expect(voteDelta(withReport, null)).toEqual({ ratingSum: -2, ratingCount: -1, reportCount: -1 });
  });

  it("adds up a recipe's votes", () => {
    expect(totalsOf([{ stars: 5 }, { stars: 3, reportedAt: 1 }, { stars: null, reportedAt: 2 }])).toEqual({ ratingSum: 8, ratingCount: 2, reportCount: 2 });
    expect(totalsOf([])).toEqual({ ratingSum: 0, ratingCount: 0, reportCount: 0 });
  });

  it("finds the recipe id in an old Mix id", () => {
    expect(legacyRecipeId("abc_r1_x", "abc")).toBe("r1_x");
    expect(legacyRecipeId("zzz", "abc")).toBe("zzz");
  });
});
