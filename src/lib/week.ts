/**
 * The week's meal plan: which recipes on which days, each at a chosen size.
 * Saved on this phone. The last 14 days are kept (so "Fill my week" can avoid
 * repeats); the screens only show today onwards.
 */
export interface PlannedMeal {
  id: string; // recipe id
  scale: number;
  /** Picked by "Fill my week" (so "Shuffle again" can replace it). */
  auto?: boolean;
  /** A leftovers night from this recipe — nothing new to cook or buy. */
  leftover?: boolean;
}
export interface WeekState {
  days: Record<string, PlannedMeal[]>; // "2026-11-08" → meals
}

const KEY = "recipe-builder.week";
let memory: WeekState = { days: {} };

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const HISTORY_DAYS = 14;

/** Everything saved: the past 14 days and the days ahead. */
function loadAll(now = new Date()): WeekState {
  let s = memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { days: {}, ...(JSON.parse(raw) as Partial<WeekState>) };
  } catch {
    /* blocked */
  }
  const oldest = new Date(now);
  oldest.setDate(oldest.getDate() - HISTORY_DAYS);
  const from = dayKey(oldest);
  return { days: Object.fromEntries(Object.entries(s.days).filter(([k, v]) => k >= from && v.length)) };
}

/** Today onwards. */
export function loadWeek(now = new Date()): WeekState {
  const today = dayKey(now);
  return { days: Object.fromEntries(Object.entries(loadAll(now).days).filter(([k]) => k >= today)) };
}

/** Days before today (up to 14), for avoiding repeats. */
export function pastPlans(now = new Date()): WeekState["days"] {
  const today = dayKey(now);
  return Object.fromEntries(Object.entries(loadAll(now).days).filter(([k]) => k < today));
}

/** Saves the days from today onwards; the past days already saved are kept. */
export function saveWeek(s: WeekState): void {
  const today = dayKey(new Date());
  const all = { days: { ...pastPlans(), ...Object.fromEntries(Object.entries(s.days).filter(([k]) => k >= today)) } };
  memory = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* session only */
  }
  if (typeof window !== "undefined") queueMicrotask(() => window.dispatchEvent(new Event("week-changed")));
}

export function addMeal(day: string, meal: PlannedMeal): WeekState {
  const s = loadWeek();
  const next = { days: { ...s.days, [day]: [...(s.days[day] ?? []), meal] } };
  saveWeek(next);
  return next;
}

export function removeMeal(day: string, index: number): WeekState {
  const s = loadWeek();
  const next = { days: { ...s.days, [day]: (s.days[day] ?? []).filter((_, i) => i !== index) } };
  saveWeek(next);
  return next;
}

/** The next `n` days starting today: key plus "Today", "Tomorrow", "Wednesday", and "Nov 11". */
export function upcomingDays(n = 7, now = new Date()): { key: string; name: string; date: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return {
      key: dayKey(d),
      name: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long" }),
      date: d.toLocaleDateString([], { month: "short", day: "numeric" }),
    };
  });
}

/**
 * One shopping entry per recipe for the given days. A recipe planned twice
 * is bought for twice (sizes add up).
 */
export function mealsToShop(s: WeekState, days: string[]): PlannedMeal[] {
  const total = new Map<string, number>();
  for (const d of days) for (const m of (s.days[d] ?? []).filter((x) => !x.leftover)) total.set(m.id, (total.get(m.id) ?? 0) + m.scale);
  return [...total].map(([id, scale]) => ({ id, scale }));
}

export const countMeals = (s: WeekState) => Object.values(s.days).reduce((n, v) => n + v.length, 0);
