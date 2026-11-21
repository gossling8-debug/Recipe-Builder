import { useEffect, useState } from "react";
import Icon from "./Icon";
import { href } from "../lib/route";
import { resumeStack, stackBusy, stackCards, stackPaused } from "../lib/stackScan";

/** On the home screen while a stack of cards is being read (and to pick reading up again after the app was closed). */
export default function StackNote() {
  const [, refresh] = useState(0);
  useEffect(() => {
    const on = () => refresh((n) => n + 1);
    window.addEventListener("stack-changed", on);
    void resumeStack();
    return () => window.removeEventListener("stack-changed", on);
  }, []);
  const cards = stackCards();
  const paused = stackPaused();
  if (!stackBusy() && !cards.some((c) => c.status === "failed")) return null;
  const done = cards.filter((c) => c.status === "done").length;
  const failed = cards.filter((c) => c.status === "failed").length;
  return (
    <a className={paused || (failed && !stackBusy()) ? "plan-strip use-soon-strip" : "plan-strip"} href={href({ name: "stack" })}>
      <Icon name="camera" size={18} />
      <span>
        <strong>{stackBusy() ? (paused ? "Reading your cards has stopped" : "Reading your cards") : "Some cards couldn't be read"}</strong>
        <span className="muted small">
          {" "}
          · {done} of {cards.length} added{failed ? ` · ${failed} to check` : ""}
        </span>
      </span>
    </a>
  );
}
