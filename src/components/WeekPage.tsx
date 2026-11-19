import ThawList, { useThawReminders } from "./ThawList";
import BudgetPlan from "./BudgetPlan";
import { feature } from "../lib/features";
import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { useToast } from "./Toast";
import { listRecipes } from "../lib/db";
import { href } from "../lib/route";
import { addToShopping } from "../lib/shopping";
import {
  addMeal,
  countMeals,
  getLeftoverDays,
  leftoverChoices,
  leftoverDayName,
  loadWeek,
  mealsToShop,
  moveMeal,
  pastPlans,
  removeMeal,
  saveWeek,
  setLeftoverDays,
  upcomingDays,
  weekdayOf,
  type WeekState,
} from "../lib/week";
import {
  fillWeek,
  getPeople,
  isDinner,
  NO_REPEAT_DAYS,
  realServings,
  setPeople,
} from "../lib/autoPlan";
import { loadLeftovers } from "../lib/leftovers";
import type { SavedRecipe } from "../lib/schema";

const sizeLabel = (s: number) =>
  s === 1 ? "" : ` · ×${s === 0.5 ? "½" : s === 1.5 ? "1½" : s}`;

/** Plan the next 7 days, then put the whole week on the shopping list at once. */
export default function WeekPage() {
  const [week, setWeek] = useState<WeekState>(() => loadWeek());
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // day key with the picker open
  const [toast, showToast] = useToast();
  const days = upcomingDays(7);
  // Weekdays that are always a leftovers night.
  const [leftoverDays, setLeftoverDaysState] = useState(getLeftoverDays);
  const toggleLeftoverDay = (wd: number) => {
    const next = leftoverDays.includes(wd)
      ? leftoverDays.filter((x) => x !== wd)
      : [...leftoverDays, wd];
    setLeftoverDays(next);
    setLeftoverDaysState(getLeftoverDays());
  };

  // Dragging a meal to another day (or tapping its handle to pick the day).
  const [drag, setDrag] = useState<{
    from: string;
    index: number;
    title: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [moving, setMoving] = useState<{
    from: string;
    index: number;
    title: string;
  } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const overRef = useRef(overDay);
  overRef.current = overDay;
  const dayLabel = (key: string) =>
    days.find((d) => d.key === key)?.name ?? key;
  function move(from: string, index: number, to: string, title: string) {
    if (from === to) return;
    // A day that already has meals swaps with the one moved there.
    const there = (week.days[to] ?? []).map((m) => (m.leftover ? `leftover ${byId.get(m.id)?.title ?? "meal"}` : (byId.get(m.id)?.title ?? "meal")));
    setWeek(moveMeal(from, index, to));
    showToast(there.length ? `Swapped: ${title} → ${dayLabel(to)}, ${there.join(" and ")} → ${dayLabel(from)}` : `Moved ${title} to ${dayLabel(to)}`);
  }
  // A recipe already planned on a night you've made a leftovers night: keep it there (remembered) or move it.
  const KEEP_KEY = "recipe-builder.keepOnLeftoversNight";
  const [kept, setKept] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEEP_KEY) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const keep = (k: string) => {
    const next = [...kept, k].slice(-50);
    setKept(next);
    try {
      localStorage.setItem(KEEP_KEY, JSON.stringify(next));
    } catch {
      /* this visit only */
    }
  };
  function startDrag(
    e: React.PointerEvent,
    from: string,
    index: number,
    title: string,
  ) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    setDrag({ from, index, title, x: e.clientX, y: e.clientY, moved: false });
    let raf = 0;
    // Near the top or bottom of the screen: keep scrolling while held there.
    const scroll = () => {
      const d = dragRef.current;
      if (!d) return;
      if (d.moved && d.y < 90) window.scrollBy(0, -10);
      else if (d.moved && d.y > window.innerHeight - 150)
        window.scrollBy(0, 10);
      raf = requestAnimationFrame(scroll);
    };
    raf = requestAnimationFrame(scroll);
    const onMove = (ev: PointerEvent) => {
      const moved =
        (dragRef.current?.moved ?? false) ||
        Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 6;
      setDrag((d) => d && { ...d, x: ev.clientX, y: ev.clientY, moved });
      const el = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-day]");
      setOverDay(moved ? (el?.dataset.day ?? null) : null);
    };
    const onUp = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const d = dragRef.current;
      const to = overRef.current;
      setDrag(null);
      setOverDay(null);
      if (!d) return;
      if (!d.moved)
        setMoving((m) =>
          m && m.from === d.from && m.index === d.index
            ? null
            : { from: d.from, index: d.index, title: d.title },
        );
      else if (to) move(d.from, d.index, to, d.title);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  useEffect(() => {
    listRecipes().then(
      (rs) =>
        setRecipes([...rs].sort((a, b) => a.title.localeCompare(b.title))),
      () => setRecipes([]),
    );
  }, []);

  const byId = new Map((recipes ?? []).map((r) => [r.id, r]));
  const planned = countMeals(week);
  const thaw = useThawReminders(recipes);
  const [people, setPeopleState] = useState(getPeople);
  const [result, setResult] = useState("");
  const hasAuto = Object.values(week.days).some((v) => v.some((m) => m.auto));

  function fill() {
    if (!recipes) return;
    const r = fillWeek({
      week,
      past: pastPlans(),
      recipes,
      fridge: loadLeftovers(),
      people,
      days: days.map((d) => d.key),
      leftoverDays,
    });
    saveWeek(r.week);
    setWeek(loadWeek());
    const parts = [
      `${r.cooked} ${r.cooked === 1 ? "dinner" : "dinners"} picked`,
    ];
    if (r.leftovers)
      parts.push(
        `${r.leftovers} leftovers ${r.leftovers === 1 ? "night" : "nights"}`,
      );
    setResult(
      parts.join(", ") +
        "." +
        (r.short
          ? ` ${r.short} ${r.short === 1 ? "day is" : "days are"} still open — you don't have enough different dinner recipes to avoid repeating one within ${NO_REPEAT_DAYS} days.`
          : "") +
        (r.emptyLeftoverNights
          ? ` ${r.emptyLeftoverNights === 1 ? "A leftovers night has" : `${r.emptyLeftoverNights} leftovers nights have`} nothing cooked in the 3 days before it.`
          : ""),
    );
  }

  function clearPicks() {
    saveWeek({
      days: Object.fromEntries(
        Object.entries(week.days).map(([k, v]) => [
          k,
          v.filter((m) => !m.auto),
        ]),
      ),
    });
    setWeek(loadWeek());
    setResult("");
  }

  function shopWeek() {
    const meals = mealsToShop(
      week,
      days.map((d) => d.key),
    ).filter((m) => byId.has(m.id));
    meals.forEach((m) => addToShopping(m.id, m.scale));
    showToast(
      `${meals.length} ${meals.length === 1 ? "recipe" : "recipes"} on your shopping list`,
    );
  }

  return (
    <>
      <Header
        title="This week"
        back={href({ name: "library" })}
        actions={
          <a
            className="icon-btn"
            href={href({ name: "shopping" })}
            aria-label="Shopping list"
          >
            <Icon name="bag" />
          </a>
        }
      />
      <main className="page">
        <p className="muted small">
          Pick what you'll cook each day. When you're done, put the whole week
          on your shopping list in one tap.
        </p>
        {recipes?.length === 0 && (
          <p className="muted">Add some recipes first — then plan them here.</p>
        )}
        {thaw.length > 0 && (
          <section className="thaw-section">
            <h3>Thaw ahead</h3>
            <ThawList reminders={thaw} calendar />
          </section>
        )}
        {recipes && recipes.some(isDinner) && (
          <div className="plan-card auto-plan">
            <div className="people-row">
              <span>Cooking for</span>
              <button
                className="icon-btn small-btn"
                aria-label="Fewer people"
                disabled={people <= 1}
                onClick={() => (
                  setPeople(people - 1),
                  setPeopleState(people - 1)
                )}
              >
                −
              </button>
              <strong aria-live="polite">{people}</strong>
              <button
                className="icon-btn small-btn"
                aria-label="More people"
                disabled={people >= 20}
                onClick={() => (
                  setPeople(people + 1),
                  setPeopleState(people + 1)
                )}
              >
                +
              </button>
              <span>{people === 1 ? "person" : "people"}</span>
            </div>

            <div className="button-row">
              <button className="btn primary" onClick={fill}>
                <Icon name="reset" size={18} />{" "}
                {hasAuto ? "Shuffle again" : "Fill my week for me"}
              </button>
              {hasAuto && (
                <button className="link-btn small" onClick={clearPicks}>
                  Clear the picks
                </button>
              )}
            </div>
            {result && <p className="small">{result}</p>}
            <BudgetPlan
              recipes={recipes}
              week={week}
              days={days.map((d) => d.key)}
              people={people}
              leftoverDays={leftoverDays}
              onPlanned={() => (setWeek(loadWeek()), setResult(""))}
            />
            <p className="muted small">
              Fills the empty days with dinners you haven't had in the last{" "}
              {NO_REPEAT_DAYS} days, leaves leftovers nights after big meals and
              on the nights you picked above, and uses up leftovers in your
              fridge first. Days you picked yourself stay as they are. When a
              recipe doesn't say how many it serves, 4 is assumed (“servings
              guessed”) — after you make it, you'll be asked.
            </p>
          </div>
        )}
        {feature("history") && (
          <p className="small">
            <a href={href({ name: "history" })}>What we've cooked</a>
            <span className="muted"> — your meal history</span>
          </p>
        )}
        {recipes && recipes.length > 1 && (
          <a className="btn plan-open" href={href({ name: "meal" })}>
            <Icon name="timer" size={18} /> Plan a big meal (several dishes at
            once)
          </a>
        )}
        <div
          className="leftover-days"
          role="group"
          aria-label="Leftovers night every week"
        >
          <span className="small">Leftovers night every week:</span>
          <span className="leftover-day-chips">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (label, wd) => (
                <button
                  key={label}
                  className={leftoverDays.includes(wd) ? "chip active" : "chip"}
                  aria-pressed={leftoverDays.includes(wd)}
                  onClick={() => toggleLeftoverDay(wd)}
                >
                  {label}
                </button>
              ),
            )}
          </span>
        </div>
        <ol className="week">
          {days.map((d) => {
            const meals = week.days[d.key] ?? [];
            return (
              <li
                key={d.key}
                className={
                  overDay === d.key && drag?.from !== d.key
                    ? "week-day drop-target"
                    : "week-day"
                }
                data-day={d.key}
              >
                <div className="week-day-head">
                  <strong>{d.name}</strong>{" "}
                  <span className="muted small">{d.date}</span>
                  {leftoverDays.includes(weekdayOf(d.key)) && (
                    <span className="muted small"> · leftovers night</span>
                  )}
                </div>
                {meals.length > 0 && (
                  <ul className="week-meals">
                    {meals.map((m, i) => {
                      const r = byId.get(m.id);
                      return (
                        <li
                          key={i}
                          className={
                            drag &&
                            drag.moved &&
                            drag.from === d.key &&
                            drag.index === i
                              ? "dragging"
                              : ""
                          }
                        >
                          <button
                            className="drag-handle"
                            aria-label={`Move ${r?.title ?? "meal"} to another day`}
                            onPointerDown={(e) =>
                              startDrag(e, d.key, i, r?.title ?? "meal")
                            }
                            onKeyDown={(e) =>
                              (e.key === "Enter" || e.key === " ") &&
                              (e.preventDefault(),
                              setMoving({
                                from: d.key,
                                index: i,
                                title: r?.title ?? "meal",
                              }))
                            }
                          >
                            <Icon name="grip" size={16} />
                          </button>
                          {r ? (
                            m.leftover ? (
                              <span className="leftover-night">
                                Leftovers:{" "}
                                <a href={href({ name: "recipe", id: m.id })}>
                                  {r.title}
                                </a>
                              </span>
                            ) : (
                              <a href={href({ name: "recipe", id: m.id })}>
                                {r.title}
                              </a>
                            )
                          ) : (
                            <span className="muted">
                              {recipes ? "(deleted recipe)" : "…"}
                            </span>
                          )}
                          {m.auto && !m.leftover && (
                            <span className="muted small">
                              {" "}
                              · picked for you
                            </span>
                          )}
                          {m.auto &&
                            !m.leftover &&
                            r &&
                            realServings(r) === null && (
                              <span className="muted small">
                                {" "}
                                · servings guessed
                              </span>
                            )}
                          <span className="muted small">
                            {sizeLabel(m.scale)}
                          </span>
                          <button
                            className="icon-btn small-btn"
                            aria-label={`Remove ${r?.title ?? "meal"} from ${d.name}`}
                            onClick={() => setWeek(removeMeal(d.key, i))}
                          >
                            <Icon name="close" size={18} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {leftoverDays.includes(weekdayOf(d.key)) &&
                  (() => {
                    const i = meals.findIndex((m) => !m.leftover && !kept.includes(`${d.key}|${m.id}`));
                    const r = i >= 0 ? byId.get(meals[i].id) : undefined;
                    if (!r || moving) return null;
                    return (
                      <div className="callout small pinned-clash" role="status">
                        <strong>{d.name} is your leftovers night</strong>, but {r.title} is planned. Keep it, or move it to another day?
                        <div className="button-row">
                          <button className="btn" onClick={() => keep(`${d.key}|${r.id}`)}>
                            Keep it
                          </button>
                          <button className="btn primary" onClick={() => setMoving({ from: d.key, index: i, title: r.title })}>
                            Move it
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                {moving?.from === d.key && (
                  <div
                    className="move-to"
                    role="group"
                    aria-label={`Move ${moving.title} to`}
                  >
                    <span className="small">Move {moving.title} to:</span>
                    <span className="day-chips">
                      {days
                        .filter((x) => x.key !== d.key)
                        .map((x) => (
                          <button
                            key={x.key}
                            className="tag"
                            onClick={() => (
                              move(
                                moving.from,
                                moving.index,
                                x.key,
                                moving.title,
                              ),
                              setMoving(null)
                            )}
                          >
                            {x.name === "Today" || x.name === "Tomorrow"
                              ? x.name
                              : x.name.slice(0, 3)}
                          </button>
                        ))}
                      <button
                        className="link-btn small"
                        onClick={() => setMoving(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                )}
                {meals.filter((m) => !m.leftover).length > 1 && (
                  <a
                    className="link-btn small week-add"
                    href={href({
                      name: "meal",
                      day: d.key,
                      ids: [
                        ...new Set(
                          meals.filter((m) => !m.leftover).map((m) => m.id),
                        ),
                      ],
                    })}
                  >
                    <Icon name="timer" size={16} /> Timeline so these are ready
                    together
                  </a>
                )}
                {adding === d.key ? (
                  <div className="week-pick">
                    <select
                      className="text-input"
                      autoFocus
                      aria-label={`Recipe for ${d.name}`}
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        // "left:<id>" is a leftovers night: nothing new to cook or buy.
                        setWeek(
                          addMeal(
                            d.key,
                            v.startsWith("left:")
                              ? { id: v.slice(5), scale: 1, leftover: true }
                              : { id: v, scale: 1 },
                          ),
                        );
                        setAdding(null);
                      }}
                    >
                      <option value="">Choose a recipe or leftovers…</option>
                      {(() => {
                        const left = leftoverChoices(
                          d.key,
                          { ...pastPlans(), ...week.days },
                          loadLeftovers(),
                          leftoverDayName,
                        ).filter((c) => byId.has(c.id));
                        return (
                          left.length > 0 && (
                            <optgroup label="Leftovers">
                              {left.map((c) => (
                                <option key={c.id} value={`left:${c.id}`}>
                                  Leftovers: {byId.get(c.id)!.title} ({c.from})
                                </option>
                              ))}
                            </optgroup>
                          )
                        );
                      })()}
                      <optgroup label="Cook">
                        {(recipes ?? []).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <button
                      className="link-btn small"
                      onClick={() => setAdding(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  recipes &&
                  recipes.length > 0 && (
                    <button
                      className="link-btn small week-add"
                      onClick={() => setAdding(d.key)}
                    >
                      <Icon name="plus" size={16} /> Add a recipe or leftovers
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ol>
        {drag?.moved && (
          <div
            className="drag-ghost"
            style={{ left: drag.x, top: drag.y }}
            aria-hidden
          >
            {drag.title}
          </div>
        )}
        {planned > 0 && (
          <>
            <div className="button-row">
              <button className="btn primary" onClick={shopWeek}>
                <Icon name="bag" size={18} /> Put this week on my shopping list
              </button>
            </div>
            <p className="muted small">
              A recipe planned twice is bought for twice. Sizes you set here
              replace the size already on the list for that recipe.
            </p>
          </>
        )}
      </main>
      {toast}
    </>
  );
}
