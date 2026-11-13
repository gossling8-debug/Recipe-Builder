import type { SearchScope } from "../lib/search";

/** The recipe search box with its Everything / Name / Ingredient switch (your recipes and cookbooks). */
export default function SearchBox(props: {
  query: string;
  scope: SearchScope;
  onQuery: (q: string) => void;
  onScope: (s: SearchScope) => void;
  /** What "Everything" and "Name" search, for the placeholder. */
  what?: string;
}) {
  const { scope } = props;
  const what = props.what ?? "recipes";
  return (
    <div className="search-box">
      <input
        className="search"
        type="search"
        placeholder={scope === "ingredient" ? "Search by ingredient, e.g. garlic" : scope === "name" ? `Search ${what} names` : `Search ${what} or ingredients`}
        value={props.query}
        onChange={(e) => props.onQuery(e.target.value)}
        aria-label="Search"
      />
      <div className="search-scope" role="radiogroup" aria-label="Search in">
        {(
          [
            ["all", "Everything"],
            ["name", "Name"],
            ["ingredient", "Ingredient"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} role="radio" aria-checked={scope === v} className={scope === v ? "chip active" : "chip"} onClick={() => props.onScope(v)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
