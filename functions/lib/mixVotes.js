/**
 * The Mix's ratings and reports, kept private: each person's vote is a
 * server-only record (mixVotes/{mixId}_{uid}) and a published recipe shows
 * only totals (ratingSum, ratingCount, reportCount). Nobody can see who rated
 * or reported what, except the person themselves and admins.
 */

/** What a request asks for: { stars: 1–5 | null } (rate or clear) or { report: reason }. Throws on anything else. */
export function parseVote(data) {
  if (data && "report" in data) {
    if (typeof data.report !== "string") throw new Error("bad report");
    return { report: data.report.trim().slice(0, 200) };
  }
  if (data && "stars" in data) {
    const s = data.stars;
    if (s === null) return { stars: null };
    if (Number.isInteger(s) && s >= 1 && s <= 5) return { stars: s };
  }
  throw new Error("bad vote");
}

const starsOf = (v) => (v && Number.isInteger(v.stars) ? v.stars : null);
const reported = (v) => !!(v && v.reportedAt);

/** How a recipe's totals change when one person's vote goes from `before` to `after` (either may be null). */
export function voteDelta(before, after) {
  const b = starsOf(before);
  const a = starsOf(after);
  return {
    ratingSum: (a ?? 0) - (b ?? 0),
    ratingCount: (a !== null ? 1 : 0) - (b !== null ? 1 : 0),
    reportCount: (reported(after) ? 1 : 0) - (reported(before) ? 1 : 0),
  };
}

/** A recipe's totals from all its votes. */
export function totalsOf(votes) {
  return votes.reduce(
    (t, v) => {
      const d = voteDelta(null, v);
      return { ratingSum: t.ratingSum + d.ratingSum, ratingCount: t.ratingCount + d.ratingCount, reportCount: t.reportCount + d.reportCount };
    },
    { ratingSum: 0, ratingCount: 0, reportCount: 0 },
  );
}

/** The vote after applying a request to the earlier one (or null when nothing's left of it). `already` when it was reported before. */
export function nextVote(before, change, mixId, uid, now) {
  const v = {
    mixId,
    uid,
    stars: starsOf(before),
    reportedAt: before?.reportedAt ?? null,
    reason: before?.reason ?? null,
    at: now,
  };
  if ("stars" in change) v.stars = change.stars;
  else if (v.reportedAt) return { vote: before, already: true };
  else {
    v.reportedAt = now;
    v.reason = change.report;
  }
  return { vote: v.stars === null && !v.reportedAt ? null : v, already: false };
}

/** The recipe id inside an old Mix id ("{uid}_{recipeId}"). */
export const legacyRecipeId = (mixId, uid) => (mixId.startsWith(uid + "_") ? mixId.slice(uid.length + 1) : mixId);
