import { describe, expect, it } from "vitest";
import { parseCommand, speakable, stepChunks } from "./speech";

describe("speakable", () => {
  it.each([
    ["1½ teaspoons", "1 and a half teaspoons"],
    ["½ cup", "a half cup"],
    ["1 tsp", "1 teaspoon"],
    ["2 tbsp", "2 tablespoons"],
    ["2 lbs (910 g)", "2 pounds"],
    ["2 (8 oz/227 g) blocks", "2 blocks, 8 ounces each"],
    ["Bake at 350°F for 8-10 min.", "Bake at 350 degrees for 8 to 10 minutes."],
    ["1 1/2 cups", "1 and a half cups"],
  ])("%s → %s", (a, b) => expect(speakable(a)).toBe(b));
});

describe("stepChunks", () => {
  const seg = (text: string, ingredient_index: number | null = null, amount: string | null = null) => ({ text, ingredient_index, amount });
  const step = {
    segments: [
      seg("Turn the pot on and wait 2 minutes. Add "), seg("the chicken", 0, "2 lbs"), seg(", "),
      seg("cream cheese", 1, "2 (8 oz) blocks"), seg(" and "), seg("garlic powder", 2, "1½ tsp"),
      seg(" to the pot. Cook 15 minutes. Then release."),
    ],
  };
  const chunks = stepChunks(step, 1);
  it("pauses after each ingredient", () =>
    expect(chunks.map((c) => [c.text, c.afterIngredient])).toEqual([
      ["Turn the pot on and wait 2 minutes.", false],
      ["Add the chicken, 2 pounds", true],
      [", cream cheese, 2 blocks, 8 ounces each", true],
      ["and garlic powder, 1 and a half teaspoons", true],
      ["to the pot.", false],
      ["Cook 15 minutes.", false],
      ["Then release.", false],
    ]));
  it("uses the chosen size", () => expect(stepChunks(step, 2)[1].text).toBe("Add the chicken, 4 pounds"));
});

describe("parseCommand", () => {
  it.each([
    ["pause", "pause"], ["stop", "pause"], ["hold on", "pause"], ["okay continue", "resume"],
    ["next step", "next"], ["go back", "back"], ["repeat that", "repeat"], ["hello", null],
  ])("%s → %s", (h, c) => expect(parseCommand(h)).toBe(c));
  it("ignores the word the phone is saying", () => expect(parseCommand("and wait 2 minutes", "Turn the pot on and wait 2 minutes.")).toBeNull());
  it("still hears 'stop' while the phone says 'wait'", () => expect(parseCommand("wait stop", "and wait 2 minutes")).toBe("pause"));
  it("last command wins", () => expect(parseCommand("pause no continue")).toBe("resume"));
});
