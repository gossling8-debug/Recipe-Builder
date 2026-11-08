import { useEffect, useState } from "react";

export type Route =
  | { name: "library" }
  | { name: "scan" }
  | { name: "settings" }
  | { name: "shopping" }
  | { name: "pantry" }
  | { name: "week" }
  | { name: "family"; book?: string; recipe?: string }
  | { name: "join"; id: string }
  | { name: "import"; data: string }
  | { name: "recipe"; id: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path === "scan") return { name: "scan" };
  if (path === "settings") return { name: "settings" };
  if (path === "shopping") return { name: "shopping" };
  if (path === "pantry") return { name: "pantry" };
  if (path === "week") return { name: "week" };
  const fam = path.match(/^family(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (fam) return { name: "family", book: fam[1] && decodeURIComponent(fam[1]), recipe: fam[2] && decodeURIComponent(fam[2]) };
  const join = path.match(/^join\/([^/]+)$/);
  if (join) return { name: "join", id: decodeURIComponent(join[1]) };
  const imp = path.match(/^import\/(.+)$/);
  if (imp) return { name: "import", data: imp[1] };
  const m = path.match(/^recipe\/(.+)$/);
  if (m) return { name: "recipe", id: decodeURIComponent(m[1]) };
  return { name: "library" };
}

export function href(route: Route): string {
  if (route.name === "import") return `#/import/${route.data}`;
  if (route.name === "join") return `#/join/${encodeURIComponent(route.id)}`;
  if (route.name === "family")
    return ["#/family", route.book, route.recipe].filter(Boolean).map((p, i) => (i ? encodeURIComponent(p!) : p)).join("/");
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
