import { useEffect, useState } from "react";

export type Route =
  | { name: "library" }
  | { name: "scan" }
  | { name: "settings" }
  | { name: "shopping" }
  | { name: "import"; data: string }
  | { name: "recipe"; id: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path === "scan") return { name: "scan" };
  if (path === "settings") return { name: "settings" };
  if (path === "shopping") return { name: "shopping" };
  const imp = path.match(/^import\/(.+)$/);
  if (imp) return { name: "import", data: imp[1] };
  const m = path.match(/^recipe\/(.+)$/);
  if (m) return { name: "recipe", id: decodeURIComponent(m[1]) };
  return { name: "library" };
}

export function href(route: Route): string {
  if (route.name === "import") return `#/import/${route.data}`;
  return route.name === "recipe" ? `#/recipe/${encodeURIComponent(route.id)}` : route.name === "library" ? "#/" : `#/${route.name}`;
}

export function navigate(route: Route, replace = false): void {
  if (replace) location.replace(href(route));
  else location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
