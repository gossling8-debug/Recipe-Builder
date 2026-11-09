import { useEffect, useState } from "react";
import Icon from "./Icon";
import { listRecipes } from "../lib/db";
import { cleanTags } from "../lib/schema";

export const COMMON_TAGS = ["Breakfast", "Lunch", "Dinner", "Dessert", "Baking", "Side", "Appetizer", "Soup", "Holiday"];

/** Tap labels on or off, or type a new one. Offers labels already used on other recipes plus common ones. */
export default function TagPicker({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [known, setKnown] = useState<string[]>(COMMON_TAGS);
  const [newTag, setNewTag] = useState("");
  useEffect(() => {
    listRecipes().then((all) => setKnown(cleanTags([...all.flatMap((r) => r.tags ?? []), ...COMMON_TAGS])), () => {});
  }, []);
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t.toLowerCase());
  const toggle = (t: string) => onChange(has(t) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]);
  const add = () => {
    if (newTag.trim()) onChange(cleanTags([...tags, newTag]));
    setNewTag("");
  };
  return (
    <>
      <div className="tag-picker">
        {cleanTags([...tags, ...known]).map((t) => (
          <button key={t} type="button" className={has(t) ? "tag on" : "tag"} aria-pressed={has(t)} onClick={() => toggle(t)}>
            {has(t) && <Icon name="check" size={14} />} {t}
          </button>
        ))}
      </div>
      <div className="new-tag">
        <input
          className="text-input"
          placeholder="New label, e.g. Keto"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        />
        <button type="button" className="btn" onClick={add} disabled={!newTag.trim()}>
          Add
        </button>
      </div>
    </>
  );
}
