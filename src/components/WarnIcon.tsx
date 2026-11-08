import Icon from "./Icon";

/** Red-outlined warning triangle with a red exclamation mark, for food past its date. */
export default function WarnIcon({ size = 18, label = "Past its date" }: { size?: number; label?: string }) {
  return (
    <span className="warn-icon" role="img" aria-label={label}>
      <Icon name="warning" size={size} />
    </span>
  );
}
