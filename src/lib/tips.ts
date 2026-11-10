/**
 * Helpful kitchen tips. Food-safety temperatures follow the USDA (FSIS)
 * safe minimum internal temperature chart. Steak doneness and grill heat are
 * common kitchen guidance — sources vary a little, so they're given as ranges,
 * and a thermometer is always the final word.
 */
export interface TipRow {
  what: string;
  value: string; // the main number, e.g. "145°F"
  detail?: string;
}
export interface TipSection {
  id: string;
  title: string;
  intro?: string;
  rows?: TipRow[];
  bullets?: string[];
  note?: string;
  source?: string;
}

/** 145 → "145°F (63°C)" */
export const temp = (f: number) => `${f}°F (${Math.round(((f - 32) * 5) / 9)}°C)`;

export const TIPS: TipSection[] = [
  {
    id: "safe",
    title: "Safe cooking temperatures",
    intro: "Check with a food thermometer in the thickest part, not touching bone, fat or gristle.",
    rows: [
      { what: "Beef, pork, veal & lamb — steaks, chops, roasts", value: temp(145), detail: "then rest at least 3 minutes" },
      { what: "Ground beef, pork, veal & lamb (burgers, meatloaf)", value: temp(160) },
      { what: "Chicken & turkey — whole, pieces or ground", value: temp(165) },
      { what: "Fish & shellfish", value: temp(145), detail: "or until opaque and it flakes with a fork; shrimp turn pink and opaque" },
      { what: "Fresh (raw) ham", value: temp(145), detail: "then rest at least 3 minutes" },
      { what: "Fully cooked ham, reheating", value: temp(140), detail: "165°F if it wasn't packaged in a USDA-inspected plant" },
      { what: "Hot dogs, leftovers & casseroles", value: temp(165), detail: "or steaming hot throughout" },
      { what: "Egg dishes (quiche, casseroles)", value: temp(160) },
    ],
    source: "USDA safe minimum internal temperatures",
  },
  {
    id: "steak",
    title: "Steak doneness",
    intro: "Temperatures after resting. Take the steak off the heat about 5°F early — it keeps cooking while it rests (more for thick cuts).",
    rows: [
      { what: "Rare", value: "120–125°F", detail: "cool red center" },
      { what: "Medium rare", value: "130–135°F", detail: "warm red center" },
      { what: "Medium", value: "140–145°F", detail: "warm pink center" },
      { what: "Medium well", value: "150–155°F", detail: "slightly pink" },
      { what: "Well done", value: "160°F and up", detail: "no pink" },
    ],
    note: "The USDA's safe minimum for whole cuts of beef is 145°F plus a 3-minute rest — rare and medium rare are below that, so they're a personal choice. Burgers and other ground beef always go to 160°F.",
  },
  {
    id: "grill",
    title: "Grilling guide",
    intro: "Grill heat and rough times. Thickness and grills vary, so go by the thermometer, not the clock.",
    rows: [
      { what: "Hamburgers (¾ inch)", value: "400–450°F", detail: "medium-high, direct · 4–5 min per side · done at 160°F" },
      { what: "Hot dogs", value: "325–375°F", detail: "medium, direct · 5–7 min, turning · 165°F or steaming (already cooked)" },
      { what: "Bratwurst & raw sausages", value: "300–350°F", detail: "medium-low, turning often · 15–20 min · 160°F (165°F for chicken or turkey sausage)" },
      { what: "Chicken breasts, boneless", value: "400–450°F", detail: "medium-high, direct · 5–7 min per side · 165°F" },
      { what: "Chicken thighs & legs, bone-in", value: "350–400°F", detail: "indirect, lid closed · 35–45 min · 165°F (175°F+ is more tender)" },
      { what: "Steaks (1 inch)", value: "450–500°F", detail: "high, direct · 4–6 min per side · see steak doneness" },
      { what: "Pork chops (1 inch)", value: "400–450°F", detail: "medium-high · 4–5 min per side · 145°F, rest 3 min" },
      { what: "Pork ribs", value: "225–275°F", detail: "low, indirect · 3–5 hours · until tender (about 195–203°F)" },
      { what: "Salmon fillets", value: "350–400°F", detail: "medium, oiled grates · 4–6 min per side · 145°F or flakes" },
      { what: "Shrimp", value: "400–450°F", detail: "medium-high · 2–3 min per side · pink and opaque" },
      { what: "Corn & vegetables", value: "350–450°F", detail: "medium to medium-high · until tender and lightly charred" },
    ],
    bullets: [
      "No grill thermometer? Hold your palm about 5 inches above the grate: 2 seconds = high, 3–4 = medium-high, 5–7 = medium, 8–10 = low.",
      "Direct heat (right over the flames) is for thin, quick foods; indirect heat (to the side, lid closed) is for bone-in and big cuts.",
      "Use a clean plate for cooked food — not the one that held the raw meat.",
    ],
  },
  {
    id: "safety",
    title: "Food safety basics",
    bullets: [
      "The danger zone is 40–140°F, where bacteria grow fastest.",
      "Refrigerate within 2 hours of cooking — within 1 hour when it's above 90°F outside.",
      "Keep the fridge at 40°F or below and the freezer at 0°F.",
      "Eat leftovers within 3–4 days; reheat them to 165°F.",
      "Thaw in the fridge, in cold water (sealed, water changed every 30 minutes, about 30 minutes per pound), or in the microwave — never on the counter. Cook right away after cold-water or microwave thawing.",
      "Let meat rest before cutting: steaks and chops 3–5 minutes, roasts 10–20 minutes, a whole turkey 20–30 minutes.",
      "Don't wash raw chicken — it splashes germs around the sink. Cooking to 165°F is what makes it safe.",
    ],
    source: "USDA food safety guidance",
  },
  {
    id: "measures",
    title: "Kitchen math",
    rows: [
      { what: "1 tablespoon", value: "3 teaspoons" },
      { what: "¼ cup", value: "4 tablespoons" },
      { what: "1 cup", value: "16 tablespoons", detail: "8 fluid ounces" },
      { what: "1 stick of butter", value: "½ cup", detail: "8 tablespoons · 4 oz" },
      { what: "1 pint", value: "2 cups" },
      { what: "1 quart", value: "4 cups", detail: "2 pints" },
      { what: "1 gallon", value: "4 quarts", detail: "16 cups" },
      { what: "1 pound", value: "16 ounces", detail: "about 454 g" },
    ],
  },
  {
    id: "swaps",
    title: "Handy swaps",
    rows: [
      { what: "1 cup buttermilk", value: "1 tbsp lemon juice or vinegar", detail: "plus milk to make 1 cup; let it sit 5 minutes" },
      { what: "1 cup self-rising flour", value: "1 cup all-purpose flour", detail: "+ 1½ tsp baking powder + ¼ tsp salt" },
      { what: "1 cup cake flour", value: "1 cup minus 2 tbsp all-purpose", detail: "+ 2 tbsp cornstarch" },
      { what: "1 cup brown sugar", value: "1 cup white sugar", detail: "+ 1 tbsp molasses" },
      { what: "1 egg (in baking)", value: "1 tbsp ground flaxseed", detail: "+ 3 tbsp water; let it thicken 5 minutes" },
      { what: "1 tbsp fresh herbs", value: "1 tsp dried" },
    ],
  },
  {
    id: "basics",
    title: "Quick cooking guides",
    rows: [
      { what: "Soft-boiled eggs", value: "6 minutes", detail: "eggs lowered into boiling water, then an ice bath" },
      { what: "Jammy eggs", value: "7–8 minutes" },
      { what: "Hard-boiled eggs", value: "11–12 minutes" },
      { what: "White rice", value: "1 cup rice : 2 cups water", detail: "simmer covered about 18 min, rest 5" },
      { what: "Brown rice", value: "1 cup rice : 2½ cups water", detail: "simmer covered 40–45 min" },
      { what: "Pasta", value: "plenty of boiling, salted water", detail: "about 1 tbsp salt per 4 quarts; taste 2 min before the package time" },
      { what: "Oven: low / moderate / hot", value: "300–325 / 350–375 / 400–450°F" },
    ],
  },
];

/** Sections and rows matching a search ("chicken", "steak"); everything when empty. */
export function searchTips(q: string): TipSection[] {
  const t = q.trim().toLowerCase();
  if (!t) return TIPS;
  const has = (s?: string) => !!s && s.toLowerCase().includes(t);
  return TIPS.flatMap((sec) => {
    if (has(sec.title)) return [sec];
    const rows = sec.rows?.filter((r) => has(r.what) || has(r.value) || has(r.detail));
    const bullets = sec.bullets?.filter(has);
    return rows?.length || bullets?.length ? [{ ...sec, rows, bullets, intro: undefined, note: undefined }] : [];
  });
}

// ---------- tips for one recipe ----------
const NOT_MEAT = /\b(broth|stock|bouillon|powder|gravy|seasoning|bits|base|flavou?r)\b/;
const row = (section: string, startsWith: string): TipRow | undefined =>
  TIPS.find((s) => s.id === section)?.rows?.find((r) => r.what.startsWith(startsWith));

const RULES: { match: RegExp; safe?: string[]; steak?: boolean; grill?: string[] }[] = [
  { match: /\b(ground (beef|pork|lamb|veal)|hamburgers?|burgers?|meatloaf|meatballs?)\b/, safe: ["Ground beef"], grill: ["Hamburgers"] },
  { match: /\b(chicken|turkey)\b/, safe: ["Chicken & turkey"] },
  { match: /\bchicken breasts?\b/, grill: ["Chicken breasts"] },
  { match: /\b(chicken|turkey) (thighs?|legs?|drumsticks?|wings?|quarters?)\b|\b(drumsticks?|wings?)\b/, grill: ["Chicken thighs"] },
  { match: /\b(steaks?|ribeye|rib eye|sirloin|strip|filet mignon|t-bone|porterhouse|flank|skirt|tri-tip)\b/, safe: ["Beef, pork"], steak: true, grill: ["Steaks"] },
  { match: /\b(pork chops?|pork loin|pork tenderloin|pork roast|pork shoulder|beef roast|chuck roast|pot roast|brisket|prime rib|lamb|veal)\b/, safe: ["Beef, pork"] },
  { match: /\bpork chops?\b/, grill: ["Pork chops"] },
  { match: /\b(ribs|baby back|spare ribs)\b/, safe: ["Beef, pork"], grill: ["Pork ribs"] },
  { match: /\b(fish|salmon|tilapia|cod|halibut|trout|tuna steak|mahi|catfish|shrimp|prawns?|scallops?|crab|lobster|mussels?|clams?)\b/, safe: ["Fish & shellfish"] },
  { match: /\bsalmon\b/, grill: ["Salmon"] },
  { match: /\b(shrimp|prawns?)\b/, grill: ["Shrimp"] },
  { match: /\bham\b/, safe: ["Fresh (raw) ham", "Fully cooked ham"] },
  { match: /\bhot dogs?\b|\bfranks?\b/, safe: ["Hot dogs"], grill: ["Hot dogs"] },
  { match: /\b(bratwurst|brats?|sausages?|kielbasa)\b/, safe: ["Ground beef"], grill: ["Bratwurst"] },
];

export interface RecipeTips {
  safe: TipRow[];
  steak: TipRow[];
  grill: TipRow[];
}

/** The safe temperatures (and steak / grill rows) that apply to this recipe's ingredients. */
export function tipsForRecipe(r: { title: string; ingredients: { name: string; preparation: string | null }[]; steps: { segments: { text: string }[] }[]; time?: string | null }): RecipeTips {
  const ingText = r.ingredients
    .map((i) => `${i.name} ${i.preparation ?? ""}`.toLowerCase())
    .filter((t) => !NOT_MEAT.test(t))
    .join(" | ");
  const text = `${r.title.toLowerCase()} | ${ingText}`;
  const grilling = /\bgrill/i.test([r.title, r.time ?? "", ...r.steps.map((s) => s.segments.map((g) => g.text).join(""))].join(" "));
  const safe = new Map<string, TipRow>();
  const grill = new Map<string, TipRow>();
  let steak = false;
  for (const rule of RULES) {
    if (!rule.match.test(text)) continue;
    for (const s of rule.safe ?? []) {
      const tr = row("safe", s);
      if (tr) safe.set(tr.what, tr);
    }
    if (rule.steak) steak = true;
    if (grilling) for (const g of rule.grill ?? []) {
      const tr = row("grill", g);
      if (tr) grill.set(tr.what, tr);
    }
  }
  return { safe: [...safe.values()], steak: steak ? (TIPS.find((s) => s.id === "steak")?.rows ?? []) : [], grill: [...grill.values()] };
}
