import type { Ingredient } from "./schema";

/**
 * The cook's allergies and ingredients to avoid. Common allergens are groups
 * of words; anything else the cook types ("butter", "cilantro") is matched as
 * its own word. Matching is a helpful flag, not a guarantee: packaged foods
 * can hide allergens the card doesn't mention.
 */
export interface AvoidList {
  groups: string[]; // keys of ALLERGEN_GROUPS
  custom: string[]; // free words, e.g. "butter"
}

interface Group {
  label: string;
  words: string[];
  /** Phrases that contain a word above but aren't this allergen. */
  except: string[];
}

/** Words that make a whole ingredient safe for a group ("dairy-free cream cheese"). */
const FREE_OF: Record<string, RegExp> = {
  dairy: /\b(dairy[- ]free|non-?dairy|vegan|plant[- ]based)\b/i,
  eggs: /\b(egg[- ]free|eggless|vegan)\b/i,
  gluten: /\bgluten[- ]free\b/i,
  treenuts: /\bnut[- ]free\b/i,
  peanuts: /\bpeanut[- ]free\b/i,
  soy: /\bsoy[- ]free\b/i,
};

export const ALLERGEN_GROUPS: Record<string, Group> = {
  dairy: {
    label: "Dairy",
    words: ["milk", "butter", "cream", "cheese", "cheddar", "mozzarella", "parmesan", "ricotta", "yogurt", "yoghurt", "buttermilk", "ghee", "whey", "casein", "half-and-half", "half and half", "sour cream", "cream cheese", "mascarpone", "feta", "brie", "provolone", "gouda", "swiss cheese", "velveeta"],
    except: ["peanut butter", "almond butter", "cashew butter", "nut butter", "sunflower butter", "seed butter", "apple butter", "cocoa butter", "coconut milk", "coconut cream", "almond milk", "oat milk", "soy milk", "rice milk", "cashew milk", "cream of tartar", "vegan", "dairy-free", "dairy free", "non-dairy", "nondairy", "plant-based", "plant based", "cream of coconut", "butternut", "butterscotch chips"],
  },
  eggs: {
    label: "Eggs",
    words: ["egg", "eggs", "egg yolk", "egg yolks", "egg white", "egg whites", "mayonnaise", "mayo", "meringue"],
    except: ["egg-free", "egg free", "vegan mayo", "eggless"],
  },
  gluten: {
    label: "Gluten",
    words: ["flour", "wheat", "bread", "breadcrumbs", "bread crumbs", "panko", "pasta", "noodles", "spaghetti", "macaroni", "couscous", "barley", "rye", "semolina", "soy sauce", "crackers", "cracker", "tortilla", "tortillas", "beer", "croutons", "biscuit", "pie crust", "graham"],
    except: ["almond flour", "coconut flour", "rice flour", "gluten-free", "gluten free", "corn tortilla", "corn tortillas", "rice noodles", "cornstarch", "tamari", "oat flour (certified gluten-free)", "cassava flour", "tapioca flour", "chickpea flour"],
  },
  peanuts: { label: "Peanuts", words: ["peanut", "peanuts", "peanut butter"], except: [] },
  treenuts: {
    label: "Tree nuts",
    words: ["almond", "almonds", "walnut", "walnuts", "pecan", "pecans", "cashew", "cashews", "pistachio", "pistachios", "hazelnut", "hazelnuts", "macadamia", "pine nuts", "brazil nuts", "nut", "nuts", "praline", "marzipan", "nutella"],
    except: ["nutmeg", "butternut", "coconut", "doughnut", "donut", "water chestnut", "nut-free"],
  },
  soy: { label: "Soy", words: ["soy", "soya", "soy sauce", "tofu", "edamame", "miso", "tamari", "tempeh", "soybean"], except: [] },
  fish: {
    label: "Fish",
    words: ["fish", "salmon", "tuna", "cod", "tilapia", "halibut", "trout", "anchovy", "anchovies", "sardines", "fish sauce", "worcestershire", "mahi"],
    except: ["swedish fish"],
  },
  shellfish: {
    label: "Shellfish",
    words: ["shrimp", "prawn", "prawns", "crab", "lobster", "scallop", "scallops", "clam", "clams", "mussel", "mussels", "oyster", "oysters", "crawfish", "crayfish", "oyster sauce"],
    except: [],
  },
  sesame: { label: "Sesame", words: ["sesame", "tahini", "sesame oil", "sesame seeds"], except: [] },
};

const KEY = "recipe-builder.avoid";
let memory: AvoidList = { groups: [], custom: [] };

export function loadAvoid(): AvoidList {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { groups: [], custom: [], ...(JSON.parse(raw) as Partial<AvoidList>) };
  } catch {
    /* blocked */
  }
  return memory;
}

export function saveAvoid(a: AvoidList): void {
  memory = a;
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* kept for this session */
  }
}

export const isActive = (a: AvoidList) => a.groups.length + a.custom.length > 0;

/** A stable text key for the list, used to tell when saved suggestions are out of date. */
export const avoidKey = (a: AvoidList) => [...a.groups].sort().join(",") + "|" + [...a.custom].map((c) => c.toLowerCase()).sort().join(",");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word match that also accepts a plural "s"/"es". */
const wordRe = (w: string) => new RegExp(`(^|[^a-z])${escape(w.toLowerCase())}(e?s)?(?![a-z])`, "i");

export interface Match {
  index: number; // ingredient index
  reasons: string[]; // e.g. ["Dairy"] or ["butter"]
}

/** Which ingredients hit the avoid list, and why. */
export function findAvoided(ingredients: Ingredient[], a: AvoidList, skip: Set<number> = new Set()): Match[] {
  const out: Match[] = [];
  ingredients.forEach((ing, index) => {
    if (skip.has(index)) return; // already swapped for a substitute
    const text = `${ing.name} ${ing.preparation ?? ""}`.toLowerCase();
    const reasons: string[] = [];
    for (const key of a.groups) {
      const g = ALLERGEN_GROUPS[key];
      if (!g || FREE_OF[key]?.test(text)) continue;
      // Remove the "safe" phrases first, then look for the allergen words.
      let rest = text;
      for (const e of g.except) rest = rest.replace(new RegExp(escape(e), "gi"), " ");
      if (g.words.some((w) => wordRe(w).test(rest))) reasons.push(g.label);
    }
    for (const word of a.custom) {
      if (word.trim() && wordRe(word.trim()).test(text)) reasons.push(word.trim());
    }
    if (reasons.length) out.push({ index, reasons });
  });
  return out;
}
