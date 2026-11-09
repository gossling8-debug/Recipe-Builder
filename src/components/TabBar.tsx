import { useEffect, useState } from "react";
import { feature } from "../lib/features";
import Icon, { type IconName } from "./Icon";
import { href, type Route } from "../lib/route";

const TABS: { route: Route; label: string; icon: IconName; main?: boolean }[] = [
  { route: { name: "budget" }, label: "Budget", icon: "receipt" },
  { route: { name: "scan" }, label: "Add", icon: "plus", main: true },
  { route: { name: "tonight" }, label: "Tonight", icon: "plate" },
];

/** The bar along the bottom of the main screens (the back arrow at the top goes to the recipe list). */
export default function TabBar({ current }: { current: Route["name"] }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const on = () => refresh((n) => n + 1);
    window.addEventListener("features-changed", on);
    return () => window.removeEventListener("features-changed", on);
  }, []);
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.filter((t) => t.route.name !== "budget" || feature("budget")).map((t) => {
        const on = t.route.name === current;
        return (
          <a key={t.label} href={href(t.route)} className={["tab", on && "on", t.main && "main"].filter(Boolean).join(" ")} aria-current={on ? "page" : undefined}>
            <span className="tab-icon">
              <Icon name={t.icon} size={t.main ? 24 : 22} />
            </span>
            <span className="tab-label">{t.main ? "Add Recipe" : t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
