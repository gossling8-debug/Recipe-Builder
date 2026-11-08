import { describe, expect, it } from "vitest";
import { englishVoices, pickVoice } from "./voices";

const V = (name: string, voiceURI: string, lang = "en-US") => ({ name, voiceURI, lang, localService: true, default: false }) as SpeechSynthesisVoice;

describe("voices", () => {
  it("drops novelty and non-English voices", () => {
    const list = englishVoices([V("Bubbles", "b"), V("Fred", "f"), V("Samantha", "s"), V("Thomas", "t", "fr-FR")]);
    expect(list.map((x) => x.name)).toEqual(["Samantha"]);
  });
  it("always uses Samantha's newer voice, never the old robotic one", () => {
    const iphone = [
      V("Samantha", "com.apple.eloquence.en-US.Samantha"),
      V("Samantha", "com.apple.voice.compact.en-US.Samantha"),
      V("Daniel", "com.apple.voice.compact.en-GB.Daniel", "en-GB"),
      V("Karen", "com.apple.voice.compact.en-AU.Karen", "en-AU"),
    ];
    expect(pickVoice(iphone)?.voiceURI).toBe("com.apple.voice.compact.en-US.Samantha");
  });
  it("prefers an enhanced Samantha if there is one", () => {
    const v = pickVoice([V("Samantha", "com.apple.voice.compact.en-US.Samantha"), V("Samantha", "com.apple.voice.enhanced.en-US.Samantha")]);
    expect(v?.voiceURI).toContain("enhanced");
  });
  it("falls back to the best non-robotic voice without Samantha", () => {
    const v = pickVoice([V("Daniel", "com.apple.eloquence.en-GB.Daniel", "en-GB"), V("Karen", "com.apple.voice.compact.en-AU.Karen", "en-AU")]);
    expect(v?.name).toBe("Karen");
  });
});
