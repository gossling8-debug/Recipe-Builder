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

/** The day, e.g. "2026-11-22" (UTC). Each day's counts are spread over APP_CHECK_SHARDS documents "2026-11-22_0"… */
export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const APP_CHECK_SHARDS = 10;

/** Every counter document of the last `days` days. */
export function appCheckDocIds(now = Date.now(), days = 7) {
  const ids = [];
  for (let d = 0; d < days; d++) for (let s = 0; s < APP_CHECK_SHARDS; s++) ids.push(`${dayKey(now - d * 86_400_000)}_${s}`);
  return ids;
}

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
