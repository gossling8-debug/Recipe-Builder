import { deleteRecipe, saveRecipe } from "./db";
import type { Ingredient, SavedRecipe, Step } from "./schema";

/**
 * Three sample recipes for a new, empty recipe box, so the app can be tried
 * before adding your own (cooking mode, scaling, the shopping list…). Written
 * for Cardamix. Fixed ids, so adding them on two phones doesn't make copies.
 */
export const SAMPLE_PREFIX = "sample-";

/** Sample recipes are offered only to new accounts — never added to an existing one. */
export const SAMPLE_OFFER_DAYS = 14;
export const isNewAccount = (createdAt: number | null | undefined, now = Date.now()) =>
  typeof createdAt === "number" && Number.isFinite(createdAt) && now - createdAt < SAMPLE_OFFER_DAYS * 86_400_000;
export const isSample = (r: { id: string }) => r.id.startsWith(SAMPLE_PREFIX);

const ing = (quantity: string, unit: string, name: string, preparation: string | null = null): Ingredient => ({
  quantity,
  unit,
  name,
  preparation,
  section: null,
});
/** A step: plain text, or [ingredient index, amount used, text]. */
const step = (...parts: (string | [number, string, string])[]): Step => ({
  segments: parts.map((p) =>
    typeof p === "string" ? { text: p, ingredient_index: null, amount: null } : { text: p[2], ingredient_index: p[0], amount: p[1] },
  ),
});

const SAMPLES: Omit<SavedRecipe, "createdAt" | "photos">[] = [
  {
    id: `${SAMPLE_PREFIX}sheet-pan-chicken`,
    title: "Sheet-Pan Lemon Chicken & Potatoes",
    servings: "Serves 4",
    time: "45 min · 425°F",
    tags: ["Dinner", "Sample"],
    ingredients: [
      ing("1 1/2", "lb", "boneless chicken thighs"),
      ing("1 1/2", "lb", "baby potatoes", "halved"),
      ing("1", "", "lemon"),
      ing("3", "tbsp", "olive oil", "divided"),
      ing("3", "cloves", "garlic", "minced"),
      ing("1", "tsp", "dried oregano"),
      ing("1", "tsp", "salt"),
      ing("1/2", "tsp", "black pepper"),
      ing("2", "cups", "green beans", "trimmed"),
    ],
    steps: [
      step("Heat the oven to 425°F."),
      step("Toss the ", [1, "1 1/2 lb", "potatoes"], " with ", [3, "1 tbsp", "olive oil"], " and half the ", [6, "1/2 tsp", "salt"], ". Spread on a sheet pan and roast 15 minutes."),
      step("Mix the remaining ", [3, "2 tbsp", "olive oil"], ", ", [4, "3 cloves", "garlic"], ", ", [5, "1 tsp", "oregano"], ", ", [7, "1/2 tsp", "pepper"], ", the rest of the ", [6, "1/2 tsp", "salt"], " and the juice of the ", [2, "1", "lemon"], ". Coat the ", [0, "1 1/2 lb", "chicken"], " in it."),
      step("Push the potatoes to the sides. Add the chicken and ", [8, "2 cups", "green beans"], " to the pan and roast 20–25 minutes, until the chicken reaches 165°F."),
    ],
    notes: "A sample recipe — delete it any time.",
    warnings: [],
  },
  {
    id: `${SAMPLE_PREFIX}beef-tacos`,
    title: "Weeknight Beef Tacos",
    servings: "Serves 4",
    time: "25 min",
    tags: ["Dinner", "Sample"],
    ingredients: [
      ing("1", "lb", "ground beef"),
      ing("1", "", "onion", "diced"),
      ing("1", "tbsp", "chili powder"),
      ing("1", "tsp", "ground cumin"),
      ing("1/2", "tsp", "salt"),
      ing("1/2", "cup", "tomato sauce"),
      ing("8", "", "corn tortillas"),
      ing("1", "cup", "shredded cheddar"),
      ing("2", "cups", "shredded lettuce"),
    ],
    steps: [
      step("Brown the ", [0, "1 lb", "ground beef"], " with the ", [1, "1", "onion"], " in a large skillet over medium-high heat, about 8 minutes. Drain the fat."),
      step("Stir in the ", [2, "1 tbsp", "chili powder"], ", ", [3, "1 tsp", "cumin"], ", ", [4, "1/2 tsp", "salt"], " and ", [5, "1/2 cup", "tomato sauce"], ". Simmer 5 minutes."),
      step("Warm the ", [6, "8", "tortillas"], " in a dry pan. Fill with the beef, ", [7, "1 cup", "cheddar"], " and ", [8, "2 cups", "lettuce"], "."),
    ],
    notes: "A sample recipe — delete it any time.",
    warnings: [],
  },
  {
    id: `${SAMPLE_PREFIX}banana-oat-pancakes`,
    title: "Banana Oat Pancakes",
    servings: "Makes 8 pancakes",
    time: "20 min",
    tags: ["Breakfast", "Sample"],
    ingredients: [
      ing("2", "", "ripe bananas"),
      ing("2", "", "eggs"),
      ing("1", "cup", "rolled oats"),
      ing("1/2", "cup", "milk"),
      ing("1", "tsp", "baking powder"),
      ing("1/2", "tsp", "cinnamon"),
      ing("1", "pinch", "salt"),
      ing("1", "tbsp", "butter", "for the pan"),
    ],
    steps: [
      step("Blend the ", [0, "2", "bananas"], ", ", [1, "2", "eggs"], ", ", [2, "1 cup", "oats"], ", ", [3, "1/2 cup", "milk"], ", ", [4, "1 tsp", "baking powder"], ", ", [5, "1/2 tsp", "cinnamon"], " and ", [6, "1 pinch", "salt"], " until smooth. Let it rest 5 minutes."),
      step("Melt a little of the ", [7, "1 tbsp", "butter"], " in a skillet over medium heat. Pour in 1/4 cup of batter per pancake."),
      step("Cook until bubbles form on top, about 2 minutes, then flip and cook 1 minute more."),
    ],
    notes: "A sample recipe — delete it any time.",
    warnings: [],
  },
];

export async function addSamples(): Promise<void> {
  const now = Date.now();
  // Newest first in the list: the dinner shows at the top.
  for (const [i, s] of [...SAMPLES].reverse().entries()) await saveRecipe({ ...s, photos: [], createdAt: now + i });
}

export async function removeSamples(recipes: SavedRecipe[]): Promise<void> {
  for (const r of recipes.filter(isSample)) await deleteRecipe(r.id);
}
