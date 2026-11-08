import { describe, expect, it } from "vitest";
import { englishVoices } from "./voices";

const v = (name: string, lang = "en-US", localService = true) => ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

describe("voices", () => {
  it("prefers Premium, then Enhanced, and drops novelty voices", () => {
    const list = englishVoices([v("Bubbles"), v("Fred"), v("Samantha"), v("Ava (Enhanced)"), v("Zoe (Premium)"), v("Thomas", "fr-FR"), v("Daniel", "en-GB")]);
    expect(list.map((x) => x.name)).toEqual(["Zoe (Premium)", "Ava (Enhanced)", "Samantha", "Daniel"]);
  });
});
