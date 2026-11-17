/**
 * The label chips and "N recipes · Sort" bar from your own recipe list, for
 * other lists of recipes (a cookbook, The Mix). Labels are matched ignoring
 * capital letters, so "dinner" and "Dinner" from different cooks are one label.
 */
export const labelKey = (t: string) => t.trim().toLowerCase();

/** Every label on these recipes, once each (the first spelling seen), A–Z. */
export function allLabels(tagLists: (string[] | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const tags of tagLists) for (const t of tags ?? []) if (t.trim() && !seen.has(labelKey(t))) seen.set(labelKey(t), t.trim());
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Whether a recipe's labels include the chosen one ("all" matches everything). */
export const hasLabel = (tags: string[] | undefined, label: string) => label === "all" || (tags ?? []).some((t) => labelKey(t) === labelKey(label));

export function LabelFilters({ labels, value, onChange }: { labels: string[]; value: string; onChange: (v: string) => void }) {
  if (labels.length === 0) return null;
  return (
    <div className="filters" role="group" aria-label="Show">
      {[["all", "All"], ...labels.map((t) => [t, t])].map(([v, label]) => {
        const on = v === "all" ? value === "all" : value !== "all" && labelKey(value) === labelKey(v);
        return (
          <button key={v} className={on ? "tag on" : "tag"} aria-pressed={on} onClick={() => onChange(v)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ListToolbar<T extends string>({
  count,
  sort,
  options,
  onSort,
}: {
  count: number;
  sort: T;
  options: readonly (readonly [T, string])[];
  onSort: (v: T) => void;
}) {
  return (
    <div className="list-toolbar">
      <span className="muted small">
        {count} {count === 1 ? "recipe" : "recipes"}
      </span>
      <label className="sort">
        <span className="muted small">Sort</span>
        <select value={sort} onChange={(e) => onSort(e.target.value as T)}>
          {options.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
