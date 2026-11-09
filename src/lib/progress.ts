import { useCallback, useEffect, useRef, useState } from "react";

/** What the cook has done in a recipe so far. Kept until "Start over". */
export interface Progress {
  have: number[]; // ingredient list checkboxes
  done: number[]; // steps marked done
  added: string[]; // ingredient mentions crossed off in steps, "step-segment"
  scale: number;
  /** "Double it and freeze half": after it's made, half goes on the freezer list. */
  freezeHalf?: boolean;
}

const EMPTY: Progress = { have: [], done: [], added: [], scale: 1 };
const key = (id: string) => `recipe-builder.progress.${id}`;
const memory = new Map<string, Progress>(); // used if the browser blocks storage

export function loadProgress(id: string): Progress {
  try {
    const raw = localStorage.getItem(key(id));
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Progress>) };
  } catch {
    /* fall through */
  }
  return memory.get(id) ?? EMPTY;
}

export function saveProgress(id: string, p: Progress): void {
  memory.set(id, p);
  try {
    localStorage.setItem(key(id), JSON.stringify(p));
  } catch {
    /* memory copy is enough for this session */
  }
}

export function clearProgress(id: string): void {
  memory.delete(id);
  try {
    localStorage.removeItem(key(id));
  } catch {
    /* ignore */
  }
}

/** Progress for one recipe, saved on every change. */
export function useProgress(id: string) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress(id));
  const latest = useRef(progress);
  latest.current = progress;
  useEffect(() => setProgress(loadProgress(id)), [id]);

  // Save right away (not inside a React state update), so a change made just
  // before the screen closes — like "Finish" in cooking mode — isn't lost.
  const update = useCallback(
    (fn: (p: Progress) => Progress) => {
      const next = fn(latest.current);
      latest.current = next;
      saveProgress(id, next);
      setProgress(next);
    },
    [id],
  );
  return [progress, update] as const;
}

export function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
