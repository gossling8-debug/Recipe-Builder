import { useState } from "react";
import { joinSize, packTotal, splitSize, type SizeParts } from "../lib/prices";

const NOUNS = ["cans", "bottles", "jars", "boxes", "bags", "cartons", "pouches", "packs", "items"];

/**
 * A size box with an optional pack row: 12 × 14.5 oz cans. Filling the pack
 * works out the total ("10 lb 14 oz") and gives a price per can.
 * Reports one size text: "10 lb 14 oz (12 × 14.5 oz cans)".
 */
export function SizeField(props: {
  value: string;
  onChange: (size: string) => void;
  /** What a pack is usually of here ("cans" for canned food). */
  defaultNoun?: string;
  /** Hide the pack row behind "+ Pack" until it's wanted (receipt lines). */
  compact?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const [parts, setParts] = useState<SizeParts>(() => {
    const p = splitSize(props.value);
    return { ...p, noun: p.noun || (p.count ? "" : props.defaultNoun ?? "items") };
  });
  const [open, setOpen] = useState(!props.compact || !!parts.count);
  const computed = Number(parts.count) > 1 ? packTotal(parts.count, parts.each) : null;
  const update = (patch: Partial<SizeParts>) => {
    const next = { ...parts, ...patch };
    setParts(next);
    props.onChange(joinSize(next));
  };
  const nouns = parts.noun && !NOUNS.includes(parts.noun) ? [parts.noun, ...NOUNS] : NOUNS;
  return (
    <div className="size-field">
      <div className="size-total">
        <input
          className="text-input"
          aria-label={props.label ?? "Size"}
          value={computed ?? parts.total}
          readOnly={!!computed}
          placeholder={props.placeholder ?? "e.g. 2 lb, 10 lb 14 oz, 1 gal"}
          onChange={(e) => update({ total: e.target.value })}
        />
        {props.compact && !open && (
          <button type="button" className="link-btn small" onClick={() => setOpen(true)}>
            + Pack
          </button>
        )}
      </div>
      {open && (
        <div className="pack-row" role="group" aria-label="Pack (optional)">
          <span className="pack-label">{props.compact ? "Pack of" : "Pack"}</span>
          <input
            className="text-input pack-count"
            inputMode="numeric"
            aria-label="How many in the pack"
            placeholder="12"
            value={parts.count}
            onChange={(e) => update({ count: e.target.value.replace(/[^\d]/g, "") })}
          />
          <span aria-hidden="true">×</span>
          <input
            className="text-input pack-each"
            aria-label="Size of each"
            placeholder="14.5 oz"
            value={parts.each}
            onChange={(e) => update({ each: e.target.value })}
          />
          <select className="text-input pack-noun" aria-label="Pack of" value={parts.noun || "items"} onChange={(e) => update({ noun: e.target.value })}>
            {nouns.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
      {computed && <span className="size-note">Total worked out from the pack</span>}
    </div>
  );
}
