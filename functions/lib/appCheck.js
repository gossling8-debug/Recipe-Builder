/**
 * App Check, watch-only for now: each request is noted as "verified" (it came with a valid
 * App Check token, i.e. from the real Cardamix app), "missing" (no token) or "invalid"
 * (a token that didn't check out). Nothing is turned away. Once the counts show that
 * real use is all "verified", enforcement can be switched on (docs/DECISIONS.md).
 */

/** For a callable: firebase-functions has already checked the token and set req.app if it was valid. */
export function callStatus(req) {
  if (req.app) return "verified";
  return req.rawRequest?.get?.("x-firebase-appcheck") ? "invalid" : "missing";
}

/** For a plain HTTP function: checks the token itself with verify (Admin SDK verifyToken). */
export async function requestStatus(req, verify) {
  const token = req.get("x-firebase-appcheck");
  if (!token) return "missing";
  try {
    await verify(token);
    return "verified";
  } catch {
    return "invalid";
  }
}

/** The day's counter document id, e.g. "2026-11-22" (UTC). */
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** Totals over the given daily counter documents: { ai: {verified, missing, invalid}, call: {...} }. */
export function totals(days) {
  const out = {};
  for (const d of days) {
    for (const kind of ["ai", "call"]) {
      const t = (out[kind] ??= { verified: 0, missing: 0, invalid: 0 });
      for (const s of ["verified", "missing", "invalid"]) t[s] += Number(d?.[kind]?.[s]) || 0;
    }
  }
  return out;
}
