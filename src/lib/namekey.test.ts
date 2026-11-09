import { describe, expect, it } from "vitest";
import { nameKey } from "./shopping";

const same = (a: string, b: string) => expect(nameKey(a)).toBe(nameKey(b));
const differ = (a: string, b: string) => expect(nameKey(a)).not.toBe(nameKey(b));

describe("nameKey matches the same ingredient", () => {
  it.each([
    ["all-purpose flour", "flour"],
    ["2% milk", "milk"],
    ["2% reduced fat milk", "milk"],
    ["80/20 ground beef", "ground beef"],
    ["93% lean ground turkey", "ground turkey"],
    ["fat free sour cream", "sour cream"],
    ["Flour", "plain flour"],
    ["large eggs", "egg"],
    ["eggs", "Egg"],
    ["scallions", "green onions"],
    ["green onions, thinly sliced", "green onion"],
    ["confectioners sugar", "powdered sugar"],
    ["granulated sugar", "sugar"],
    ["sharp cheddar cheese", "cheddar"],
    ["shredded cheddar", "cheddar cheese"],
    ["boneless, skinless chicken breasts", "chicken breast"],
    ["boneless skinless chicken breasts", "chicken breasts"],
    ["unsalted butter, softened", "butter"],
    ["kosher salt", "salt"],
    ["extra-virgin olive oil", "olive oil"],
    ["tomatoes", "tomato"],
    ["fresh cilantro leaves", "cilantro"],
    ["low-sodium chicken broth", "chicken broth"],
    ["cream cheese, at room temperature", "cream cheese"],
    ["berries", "berry"],
  ])("%s = %s", same);
});

describe("nameKey keeps real differences", () => {
  it.each([
    ["brown sugar", "sugar"],
    ["bacon fat", "bacon"],
    ["powdered sugar", "sugar"],
    ["dried dill", "dill"],
    ["ground beef", "beef"],
    ["almond flour", "flour"],
    ["cream cheese", "heavy cream"],
    ["garlic powder", "garlic"],
    ["chicken broth", "chicken"],
  ])("%s ≠ %s", differ);
  it("leaves words like 'molasses' and 'hummus' alone", () => {
    expect(nameKey("molasses")).toBe("molasses");
    expect(nameKey("hummus")).toBe("hummus");
  });
});
