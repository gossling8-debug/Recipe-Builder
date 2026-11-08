import { nameKey } from "./shopping";

/**
 * Typical refrigerator (or counter) life after buying, in days. These are
 * rough guidelines for planning — the package date and your own eyes and nose
 * always win. Dry pantry staples (sugar, flour, spices, canned goods) have no
 * entry, so they never get a use-by date.
 */
const SHELF_LIFE: [RegExp, number][] = [
  // Meat, poultry, fish (raw)
  [/\b(ground (beef|turkey|pork|chicken)|ground meat|hamburger)\b/, 2],
  [/\b(chicken|turkey|poultry)\b(?! (broth|stock|bouillon))/, 2],
  [/\b(fish|salmon|tuna steak|cod|tilapia|shrimp|scallop|crab|lobster|mussel|clam)\b/, 2],
  [/\b(sausage)\b/, 2],
  [/\b(beef|steak|pork|lamb|veal|roast|chops?)\b(?! (broth|stock|bouillon|jerky))/, 4],
  [/\bbacon\b/, 7],
  [/\b(ham|deli|lunch meat|salami|pepperoni|hot dog)\b/, 5],
  // Dairy and eggs
  [/\b(heavy cream|whipping cream|half and half|cream)\b(?! cheese| of)/, 7],
  [/\b(milk|buttermilk)\b(?! chocolate)/, 7],
  [/\b(sour cream|yogurt|cottage cheese|ricotta)\b/, 10],
  [/\bcream cheese\b/, 14],
  [/\b(mozzarella|feta|brie|goat cheese)\b/, 7],
  [/\b(cheddar|cheese|parmesan|swiss|provolone|monterey jack|colby)\b/, 21],
  [/\bbutter\b(?! milk)/, 30],
  [/\begg\b/, 28],
  // Produce
  [/\b(berry|strawberry|raspberry|blueberry|blackberry)\b/, 4],
  [/\b(lettuce|spinach|arugula|kale|greens|spring mix|salad)\b/, 5],
  [/\b(fresh )?(cilantro|parsley|basil|dill|mint|chives)\b(?=.*\bfresh\b|$)/, 6],
  [/\b(avocado|banana)\b/, 4],
  [/\b(mushroom|green onion|zucchini|cucumber|tomato|broccoli|cauliflower|green bean|asparagus|corn on the cob)\b/, 6],
  [/\b(bell pepper|jalapeno|pepper)\b(?! flakes| powder|corn)/, 9],
  [/\b(celery|cabbage|lemon|lime|orange|grapes?)\b(?! juice| zest)/, 14],
  [/\b(carrot|apple|beet)\b(?! juice| cider| sauce)/, 21],
  [/\b(potato|sweet potato|onion|squash)\b(?! powder| flakes)/, 30],
  [/\b(garlic|ginger)\b(?! powder| salt| ground)/, 30],
  // Bakery and other fresh items
  [/\b(bread|bun|roll|bagel|tortilla|pita)\b(?! crumbs)/, 5],
  [/\b(fresh pasta|tofu|hummus|salsa|pesto|guacamole)\b/, 7],
];

/** Things that stay good for a long time even if a word above matches. */
const SHELF_STABLE =
  /\b(powder|dried|flakes|canned|can of|jarred|frozen|bouillon|evaporated|condensed|powdered|jerky|chips|crumbs|mix|ground (cinnamon|ginger|nutmeg|cumin|cloves?|black pepper|pepper|mustard|coriander|allspice|cardamom|turmeric|paprika|cayenne))\b/;

const DAY = 86_400_000;

/** Estimated use-by time (ms) for something bought `from`, or null for pantry staples. */
export function estimateUseBy(name: string, from = Date.now()): number | null {
  const raw = name.toLowerCase();
  if (SHELF_STABLE.test(raw)) return null;
  const key = nameKey(name);
  for (const [re, days] of SHELF_LIFE) if (re.test(key) || re.test(raw)) return endOfDay(from + days * DAY);
  return null;
}

const endOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
};

export type Freshness = "past" | "today" | "soon" | "ok";

/** past = after its date; today; soon = within 3 days. */
export function freshness(useBy: number, now = Date.now()): Freshness {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const days = Math.floor((useBy - startToday.getTime()) / DAY);
  if (useBy < now && days < 0) return "past";
  if (days <= 0) return "today";
  if (days <= 3) return "soon";
  return "ok";
}

/** "today", "tomorrow", "in 3 days", "Nov 12", "2 days ago". */
export function useByText(useBy: number, now = Date.now()): string {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const days = Math.floor((useBy - startToday.getTime()) / DAY);
  if (days < -1) return `${-days} days ago`;
  if (days === -1) return "yesterday";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 6) return `in ${days} days`;
  return new Date(useBy).toLocaleDateString([], { month: "short", day: "numeric" });
}

/** yyyy-mm-dd for <input type="date">, and back. */
export const toDateInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fromDateInput = (v: string): number | null => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59).getTime();
};

/** "Use today", "Use by tomorrow", "Use within 3 days", "Use by Nov 22", or "Past its date (yesterday)". */
export function useByLabel(useBy: number, now = Date.now()): string {
  const f = freshness(useBy, now);
  const t = useByText(useBy, now);
  if (f === "past") return `Past its date (${t})`;
  if (t === "today") return "Use today";
  if (t.startsWith("in ")) return `Use within ${t.slice(3)}`;
  return `Use by ${t}`;
}
