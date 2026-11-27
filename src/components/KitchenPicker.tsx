import { DEVICES, type DeviceId } from "../lib/kitchen";
import Icon from "./Icon";

/** Tap the kitchen devices you have (setup and Settings). */
export default function KitchenPicker({ value, onChange }: { value: DeviceId[]; onChange: (ids: DeviceId[]) => void }) {
  return (
    <div className="tag-picker" role="group" aria-label="Kitchen devices">
      {DEVICES.map((d) => {
        const on = value.includes(d.id);
        return (
          <button
            key={d.id}
            className={on ? "tag on" : "tag"}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== d.id) : [...value, d.id])}
          >
            {on && <Icon name="check" size={14} />} {d.label}
          </button>
        );
      })}
    </div>
  );
}
