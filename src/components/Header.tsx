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
  brand = false,
}: {
  title: string;
  back?: string;
  actions?: ReactNode;
  returnToPrevious?: boolean;
  /** The home screen: the Cardamix logo and name on the left. */
  brand?: boolean;
}) {
  return (
    <header className={back && back !== "#/" ? "topbar with-home" : "topbar"}>
      {brand ? (
        <a className="brand" href="#/" aria-label="Cardamix home">
          <img src="./logo.svg" alt="" width="32" height="32" />
          <span>Cardamix</span>
        </a>
      ) : back ? (
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
      {title ? <h1>{title}</h1> : <span className="topbar-title-spacer" />}
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

// Count in-app screen changes, so "back" only goes back within the app (not to another site).
let screensVisited = 0;
window.addEventListener("hashchange", () => screensVisited++);
const cameFromApp = () => screensVisited > 0 && history.length > 1;
