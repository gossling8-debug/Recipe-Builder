import { describe, expect, it } from "vitest";
import { englishVoices } from "./voices";

const v = (name: string, lang = "en-US", localService = true) => ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe("voices", () => {
  it("prefers Premium, then Enhanced, and drops novelty voices", () => {
    const list = englishVoices([v("Bubbles"), v("Fred"), v("Samantha"), v("Ava (Enhanced)"), v("Zoe (Premium)"), v("Thomas", "fr-FR"), v("Daniel", "en-GB")]);
    expect(list.map((x) => x.name)).toEqual(["Zoe (Premium)", "Ava (Enhanced)", "Samantha", "Daniel"]);
  });
});

import { voiceLabel } from "./voices";
describe("voice labels", () => {
  const V = (name: string, voiceURI: string, lang = "en-US") => ({ name, voiceURI, lang, localService: true, default: false }) as SpeechSynthesisVoice;
  const all = [
    V("Samantha", "com.apple.voice.compact.en-US.Samantha"),
    V("Samantha", "com.apple.voice.enhanced.en-US.Samantha"),
    V("Daniel", "com.apple.voice.compact.en-GB.Daniel", "en-GB"),
    V("Daniel", "com.apple.eloquence.en-US.Daniel"),
    V("Karen", "com.apple.voice.compact.en-AU.Karen", "en-AU"),
  ];
  it("tells twins apart by quality or accent", () => {
    const list = englishVoices(all);
    expect(list[0].voiceURI).toContain("enhanced.en-US.Samantha");
    expect(list.map((v) => voiceLabel(v, list))).toEqual(
      expect.arrayContaining(["Samantha — Enhanced", "Samantha — Standard", "Karen"]),
    );
    expect(voiceLabel(all[2], list)).toMatch(/^Daniel — .*UK/);
  });
});
