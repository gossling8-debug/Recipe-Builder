/**
 * Test stand-ins: the click-through tests point the server at fake Claude, Stripe and
 * Lulu servers with *_BASE_URL settings. They're honoured only in the local emulator
 * running a demo project (never the real one), so a stray or copied setting in
 * production can't send AI requests, payments or print orders anywhere else.
 * (docs/INVARIANTS.md M6)
 */
export const inEmulator = (env = process.env) =>
  env.FUNCTIONS_EMULATOR === "true" && String(env.GCLOUD_PROJECT ?? "").startsWith("demo-");

/** A test stand-in's address (no trailing slash), or undefined outside a demo emulator. */
export function testUrl(name, env = process.env) {
  if (!inEmulator(env) || !env[name]) return undefined;
  return String(env[name]).replace(/\/+$/, "");
}
