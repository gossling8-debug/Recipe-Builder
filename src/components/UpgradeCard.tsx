import { useEffect, useState } from "react";
import { noteStep } from "../lib/funnel";
import Icon from "./Icon";
import { plan } from "../lib/features";
import { href } from "../lib/route";
import { FREE_LIMITS } from "../lib/subscription";

const KEY = "recipe-builder.upgradeCardHidden";
const HIDE_FOR = 14 * 86_400_000;

const hiddenUntil = (): number => {
  try {
    return Number(localStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
};

/**
 * Free plan: what Plus adds, on the home screen (paid features are otherwise
 * simply hidden, so free cooks wouldn't know they exist). "Not now" hides it for two weeks.
 */
export default function UpgradeCard({ show }: { show: boolean }) {
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now());
  const visible = show && !hidden && plan() === "free";
  useEffect(() => {
    if (visible) void noteStep("cardSeen");
  }, [visible]);
  if (!visible) return null;
  const notNow = () => {
    void noteStep("cardDismissed");
    setHidden(true);
    try {
      localStorage.setItem(KEY, String(Date.now() + HIDE_FOR));
    } catch {
      /* this visit only */
    }
  };
  return (
    <section className="upgrade-card" aria-label="Get more with Plus">
      <strong>Get more from Cardamix with Plus</strong>
      <ul>
        <li>
          <Icon name="calendar" size={16} /> Plan your week, with one shopping list for all of it
        </li>
        <li>
          <Icon name="jar" size={16} /> Pantry, budget and “What can I make tonight?”
        </li>
        <li>
          <Icon name="book" size={16} /> Shared cookbooks with family and friends
        </li>
        <li>
          <Icon name="camera" size={16} /> About 50 recipe adds a month (free has {FREE_LIMITS.scan})
        </li>
      </ul>
      <div className="button-row">
        <a className="btn primary" href={href({ name: "plus" })}>
          See plans
        </a>
        <button className="btn" onClick={notNow}>
          Not now
        </button>
      </div>
    </section>
  );
}
