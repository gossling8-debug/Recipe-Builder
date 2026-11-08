/**
 * The week's meal plan: which recipes on which days, each at a chosen size.
 * Saved on this phone. Days before today are dropped.
 */
export interface PlannedMeal {
  id: string; // recipe id
  scale: number;
}
export interface WeekState {
  days: Record<string, PlannedMeal[]>; // "2026-11-08" → meals
}

const KEY = "recipe-builder.week";
let memory: WeekState = { days: {} };

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function loadWeek(now = new Date()): WeekState {
  let s = memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { days: {}, ...(JSON.parse(raw) as Partial<WeekState>) };
  } catch {
    /* blocked */
  }
  const today = dayKey(now);
  return { days: Object.fromEntries(Object.entries(s.days).filter(([k, v]) => k >= today && v.length)) };
}

export function saveWeek(s: WeekState): void {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* session only */
  }
  queueMicrotask(() => window.dispatchEvent(new Event("week-changed")));
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
  for (const d of days) for (const m of s.days[d] ?? []) total.set(m.id, (total.get(m.id) ?? 0) + m.scale);
  return [...total].map(([id, scale]) => ({ id, scale }));
}

export const countMeals = (s: WeekState) => Object.values(s.days).reduce((n, v) => n + v.length, 0);
