/**
 * Picking the most natural voice the phone has. iPhones ship robotic basic
 * voices; Apple's free "Enhanced" and "Premium" voices (downloaded in
 * Settings → Accessibility → Spoken Content → Voices) sound far more human —
 * but iPhones may not share downloaded voices with websites. Voices often
 * come in pairs with the same name (basic + better quality); the system's
 * voice ID tells them apart.
 */

// Novelty and old "Eloquence" voices that sound robotic — never chosen automatically.
const ROBOTIC = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|hysterical|deranged|pipe organ)\b/i;
// Voices that generally sound natural.
const GOOD = /\b(ava|zoe|evan|nathan|noelle|samantha|allison|susan|tom|karen|daniel|serena|joelle|nicky|aaron|siri|google us english|microsoft (aria|jenny|guy))\b/i;

type V = Pick<SpeechSynthesisVoice, "name" | "lang" | "localService"> & { voiceURI?: string };

/** "premium" | "enhanced" | "basic" | null, from the name or the system voice ID. */
export function quality(v: V): "premium" | "enhanced" | "basic" | "older" | null {
  const id = `${v.voiceURI ?? ""} ${v.name}`.toLowerCase();
  if (/premium/.test(id)) return "premium";
  if (/enhanced|neural|natural/.test(id)) return "enhanced";
  if (/eloquence/.test(id)) return "older"; // the old, very robotic engine
  if (/compact|basic/.test(id)) return "basic";
  return null;
}

export function score(v: V): number {
  if (!/^en/i.test(v.lang)) return -100;
  if (ROBOTIC.test(v.name)) return -50;
  let s = 0;
  const q = quality(v);
  if (q === "premium") s += 30;
  else if (q === "enhanced") s += 20;
  else if (q === "basic") s -= 2;
  else if (q === "older") s -= 15;
  if (GOOD.test(v.name)) s += 8;
  if (/en[-_]US/i.test(v.lang)) s += 3;
  if (v.localService) s += 1;
  return s;
}

/** Best guess at "sounds natural": an Enhanced/Premium voice is installed. */
export function englishVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const seen = new Set<string>();
  const id = (v: SpeechSynthesisVoice) => v.voiceURI || `${v.name}|${v.lang}`;
  return all
    .filter((v) => score(v) > -50 && !seen.has(id(v)) && seen.add(id(v)))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/**
 * The read-aloud voice: always Samantha's newer voice (never the old robotic
 * engine). Phones without Samantha get the most natural English voice they have.
 */
export function pickVoice(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = englishVoices(all);
  const samantha = english.filter((v) => /^samantha\b/i.test(v.name) && quality(v) !== "older");
  return samantha[0] ?? english.find((v) => quality(v) !== "older") ?? english[0] ?? null;
}
