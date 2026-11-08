import { describe, expect, it } from "vitest";
import { href, parseRoute, type Route } from "./route";

describe("routes", () => {
  it.each<Route>([
    { name: "week" },
    { name: "family" },
    { name: "family", book: "abc123" },
    { name: "family", book: "abc123", recipe: "uid_r1" },
    { name: "join", id: "abc123" },
    { name: "recipe", id: "r 1" },
  ])("%j round-trips", (r) => {
    const back = parseRoute(href(r));
    expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(r)));
  });
});
