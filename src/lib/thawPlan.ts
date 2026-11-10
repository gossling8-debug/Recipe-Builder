import { loadPlans } from "./plan";
import { applySwaps } from "./swaps";
import { dayKey, loadWeek, upcomingDays } from "./week";
import { thawReminders, type PlannedThawMeal, type ThawReminder } from "./thaw";
import { feature } from "./features";
import type { SavedRecipe } from "./schema";

/**
 * Every planned meal for the next 10 days (week planner days and meal times),
 * turned into thaw reminders. A week-planner dinner without a set time is
 * counted as 6 pm.
 */
export function plannedThawReminders(recipes: SavedRecipe[], now = new Date()): ThawReminder[] {
  if (!feature("thaw")) return [];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const plans = feature("mealTime") ? loadPlans() : {};
  const meals: PlannedThawMeal[] = [];
  const seen = new Set<string>();
  const add = (id: string, scale: number, at: number) => {
    const r = byId.get(id);
    const k = `${id}|${dayKey(new Date(at))}`;
    if (!r || seen.has(k)) return;
    seen.add(k);
    meals.push({ recipeId: id, title: r.title, recipe: applySwaps(r), scale, at });
  };
  for (const p of Object.values(plans)) add(p.recipeId, 1, p.eatAt);
  if (feature("weekPlanner")) {
    const week = loadWeek(now);
    for (const d of upcomingDays(10, now)) {
      for (const m of week.days[d.key] ?? []) {
        if (m.leftover) continue;
        const [y, mo, da] = d.key.split("-").map(Number);
        add(m.id, m.scale, new Date(y, mo - 1, da, 18).getTime());
      }
    }
  }
  return thawReminders(meals, now.getTime());
}
