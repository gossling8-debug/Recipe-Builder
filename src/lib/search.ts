/**
 * Recipe search. Every word you type must match something (in any order),
 * singular or plural, and a word can be the start of a longer one
 * ("ban" → banana). Search by name (title and labels), by ingredient, or both.
 */
export type SearchScope = "all" | "name" | "ingredient";

interface Searchable {
  title: string;
  tags?: string[];
  ingredients: { quantity: string; unit: string; name: string; preparation: string | null }[];
}

const stem = (w: string) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 ? w.replace(/(es|s)$/, "") : w);
const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
const queryWords = (q: string) => words(q).filter((w) => !["the", "a", "an", "and", "with", "of"].includes(w)).map(stem);
/** Same ingredient, different word: searching one finds the other. */
const SAME: string[][] = [
  ["oatmeal", "oat"],
  ["cilantro", "coriander"],
  ["chickpea", "garbanzo"],
  ["shrimp", "prawn"],
  ["scallion", "green onion"],
  ["zucchini", "courgette"],
];
const alsoMeans = (w: string) => [w, ...SAME.filter((g) => g.some((x) => stem(x) === w)).flat().map(stem)];
/** Does `word` (from the query), or a word meaning the same, match these words of text? */
const hit = (word: string, textWords: string[]) =>
  alsoMeans(word).some((w) =>
    w.includes(" ") ? textWords.join(" ").includes(w) : textWords.some((t) => stem(t).startsWith(w) || t.startsWith(w)),
  );

export interface SearchResult {
  match: boolean;
  /** Ingredient lines that matched, to show under the result. */
  ingredientHits: string[];
}

export function searchRecipe(r: Searchable, query: string, scope: SearchScope = "all"): SearchResult {
  const qw = queryWords(query);
  if (qw.length === 0) return { match: true, ingredientHits: [] };
  const nameWords = words([r.title, ...(r.tags ?? [])].join(" "));
  const ingWords = r.ingredients.map((i) => words(`${i.name} ${i.preparation ?? ""}`));
  const allIngWords = ingWords.flat();
  const ok = qw.every((w) =>
    scope === "name" ? hit(w, nameWords) : scope === "ingredient" ? hit(w, allIngWords) : hit(w, nameWords) || hit(w, allIngWords),
  );
  if (!ok) return { match: false, ingredientHits: [] };
  const ingredientHits =
    scope === "name"
      ? []
      : r.ingredients
          .filter((_, i) => qw.some((w) => hit(w, ingWords[i])))
          .map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" ") + (i.preparation ? `, ${i.preparation}` : ""));
  return { match: true, ingredientHits };
}
