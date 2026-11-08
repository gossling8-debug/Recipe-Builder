/**
 * Picking the most natural voice the phone has. iPhones ship robotic basic
 * voices; Apple's free "Enhanced" and "Premium" voices (downloaded in
 * Settings → Accessibility → Spoken Content → Voices) sound far more human,
 * and the browser can use them once installed.
 */

// Novelty and old "Eloquence" voices that sound robotic — never chosen automatically.
const ROBOTIC = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|hysterical|deranged|pipe organ)\b/i;
// Voices that generally sound natural.
const GOOD = /\b(ava|zoe|evan|nathan|noelle|samantha|allison|susan|tom|karen|daniel|serena|joelle|nicky|aaron|siri|google us english|microsoft (aria|jenny|guy))\b/i;

export function score(v: Pick<SpeechSynthesisVoice, "name" | "lang" | "localService">): number {
  if (!/^en/i.test(v.lang)) return -100;
  if (ROBOTIC.test(v.name)) return -50;
  let s = 0;
  if (/premium/i.test(v.name)) s += 30;
  else if (/enhanced|neural|natural/i.test(v.name)) s += 20;
  if (GOOD.test(v.name)) s += 8;
  if (/en[-_]US/i.test(v.lang)) s += 3;
  if (v.localService) s += 1;
  return s;
}

/** Best guess at "sounds natural": an Enhanced/Premium voice is installed. */
export const isNatural = (v: Pick<SpeechSynthesisVoice, "name">) => /premium|enhanced|neural|natural/i.test(v.name);

export function englishVoices(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return all.filter((v) => score(v) > -50).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

const KEY = "recipe-builder.voice";
export function savedVoiceName(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function saveVoiceName(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* session only */
  }
}

/** The saved choice if it's still installed, otherwise the best available. */
export function chooseVoice(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const list = englishVoices(all);
  const saved = savedVoiceName();
  return list.find((v) => v.name === saved) ?? list[0] ?? null;
}
