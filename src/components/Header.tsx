import type { ReactNode } from "react";
import Icon from "./Icon";

/**
 * back: where the arrow goes. With returnToPrevious, the arrow goes back to the
 * screen you came from inside the app (e.g. the recipe you opened the shopping
 * list from), falling back to `back` when there's nothing to go back to.
 * Pages deeper than one step from home also get a Home button.
 */
export default function Header({
  title,
  back,
  actions,
  returnToPrevious = false,
}: {
  title: string;
  back?: string;
  actions?: ReactNode;
  returnToPrevious?: boolean;
}) {
  return (
    <header className={back && back !== "#/" ? "topbar with-home" : "topbar"}>
      {back ? (
        <a
          className="icon-btn"
          href={back}
          aria-label="Back"
          onClick={(e) => {
            if (returnToPrevious && cameFromApp()) {
              e.preventDefault();
              history.back();
            }
          }}
        >
          <Icon name="back" />
        </a>
      ) : (
        <span className="icon-btn placeholder" aria-hidden />
      )}
      {back && back !== "#/" && (
        <a className="icon-btn home-btn" href="#/" aria-label="Home">
          <Icon name="home" />
        </a>
      )}
      <h1>{title}</h1>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

// Count in-app screen changes, so "back" only goes back within the app (not to another site).
let screensVisited = 0;
window.addEventListener("hashchange", () => screensVisited++);
const cameFromApp = () => screensVisited > 0 && history.length > 1;
