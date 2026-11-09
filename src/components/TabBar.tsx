import Icon, { type IconName } from "./Icon";
import { href, type Route } from "../lib/route";

const TABS: { route: Route; label: string; icon: IconName; main?: boolean }[] = [
  // Most used on the right, where the thumb reaches.
  { route: { name: "budget" }, label: "Budget", icon: "wallet" },
  { route: { name: "tonight" }, label: "Tonight", icon: "plate" },
  { route: { name: "scan" }, label: "Add", icon: "plus", main: true },
];

/** The bar along the bottom of the main screens (the back arrow at the top goes to the recipe list). */
export default function TabBar({ current }: { current: Route["name"] }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => {
        const on = t.route.name === current;
        return (
          <a key={t.label} href={href(t.route)} className={["tab", on && "on", t.main && "main"].filter(Boolean).join(" ")} aria-current={on ? "page" : undefined}>
            <span className="tab-icon">
              <Icon name={t.icon} size={t.main ? 24 : 22} />
            </span>
            <span className="tab-label">{t.main ? "Add recipe" : t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
