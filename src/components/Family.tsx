import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import RecipeView from "./RecipeView";
import { useToast } from "./Toast";
import { cloudState, subscribeCloud, type CloudState } from "../lib/cloud";
import { listRecipes, newId, saveRecipe } from "../lib/db";
import { duplicatesOf } from "../lib/duplicates";
import { CookbookCover, CookbookMemories } from "./CookbookExtras";
import AddToCookbook from "./AddToCookbook";
import RecipeEditor from "./RecipeEditor";
import CookMode, { clearCookStart, cookStart } from "./CookMode";
import PlanMeal from "./PlanMeal";
import MyNotes from "./MyNotes";
import AddToWeek from "./AddToWeek";
import Substitutes from "./Substitutes";
import NutritionSection from "./NutritionSection";
import { TimerBar, useTimers } from "./Timers";
import { loadProgress, saveProgress } from "../lib/progress";
import { recipeLink } from "../lib/link";
import { recipeToText } from "../lib/share";
import { addToShopping, loadShopping } from "../lib/shopping";
import { feature } from "../lib/features";
import SearchBox from "./SearchBox";
import { CookbookRating, RatingBadge } from "./CookbookRating";
import { searchRecipe, type SearchScope } from "../lib/search";
import { BookRecipeActions, HoldLink } from "./RecipeActions";
import {
  bookRecipes,
  createCookbook,
  getCookbook,
  inviteLink,
  joinCookbook,
  leaveCookbook,
  myCookbooks,
  removeFromCookbook,
  bookRatings,
  ratingSummary,
  type Rating,
  editInCookbook,
  shareToCookbook,
  whereShared,
  type Cookbook,
  type SharedRecipe,
} from "../lib/family";
import { href, navigate } from "../lib/route";
import { shareText } from "../lib/share";
import { applySwaps } from "../lib/swaps";
import type { SavedRecipe } from "../lib/schema";

function useCloud(): CloudState {
  const [s, setS] = useState(cloudState());
  useEffect(() => subscribeCloud(setS), []);
  return s;
}
const signedIn = (s: CloudState) => s.status !== "off" && s.status !== "signed-out";
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Shown instead of the page when cloud isn't set up or the cook isn't signed in. */
function NeedsSignIn({ s }: { s: CloudState }) {
  return (
    <div className="callout">
      {s.status === "off" ? (
        <>Cookbooks need cloud backup, which isn't set up in this app yet.</>
      ) : (
        <>
          Cookbooks use your cloud account. <a href={href({ name: "settings" })}>Sign in in Settings</a>, then come back.
        </>
      )}
    </div>
  );
}

async function invite(book: Cookbook, toast: (m: string) => void) {
  const r = await shareText(
    `Join “${book.name}”`,
    `Join our cookbook “${book.name}” in Cardamix. Open this link (you'll need a free account):`,
    inviteLink(book),
  );
  if (r === "copied") toast("Invite link copied — paste it in a message");
  if (r === "failed") toast("Sharing isn't available in this browser");
}

// ---------- the list of cookbooks ----------
export function FamilyPage() {
  const s = useCloud();
  const [books, setBooks] = useState<Cookbook[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [myName, setMyName] = useState("");
  const on = signedIn(s);

  useEffect(() => {
    if (on) myCookbooks().then(setBooks, (e) => setError(errText(e)));
  }, [on]);

  async function create() {
    setError("");
    try {
      const b = await createCookbook(name, myName);
      navigate({ name: "family", book: b.id });
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <>
      <Header title="Cookbooks" back={href({ name: "library" })} returnToPrevious />
      <main className="page">
        <p className="muted small">
          A shared shelf for your family or friends. You choose which recipes to share; everyone can save a copy to their own
          recipes. Your other recipes stay private.
        </p>
        {!on && <NeedsSignIn s={s} />}
        {on && books === null && !error && <p className="muted">Loading…</p>}
        {books && books.length > 0 && (
          <ul className="book-list">
            {books.map((b) => (
              <li key={b.id}>
                <a className="book-card" href={href({ name: "family", book: b.id })}>
                  <Icon name="book" />
                  <span>
                    <strong>{b.name}</strong>
                    <span className="muted small">
                      {" "}
                      · {b.members.length} {b.members.length === 1 ? "member" : "members"}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {on && books && (creating ? (
          <div className="plan-card">
            <label className="field">
              <span>Cookbook name</span>
              <input className="text-input" value={name} placeholder="e.g. Smith Family Recipes" maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Your name, as others will see it</span>
              <input className="text-input" value={myName} placeholder="e.g. Mom" maxLength={40} onChange={(e) => setMyName(e.target.value)} />
            </label>
            <div className="button-row">
              <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn primary" onClick={create} disabled={!name.trim()}>Create cookbook</button>
            </div>
          </div>
        ) : (
          <button className="btn" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} /> New cookbook
          </button>
        ))}
        {books?.length === 0 && !creating && (
          <p className="muted small">To join someone else's cookbook, open the invite link they send you.</p>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
    </>
  );
}

// ---------- one cookbook ----------
export function BookPage({ id }: { id: string }) {
  const s = useCloud();
  const [book, setBook] = useState<Cookbook | null | undefined>(undefined);
  const [recipes, setRecipes] = useState<SharedRecipe[] | null>(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast();
  const on = signedIn(s);

  useEffect(() => {
    if (!on) return;
    getCookbook(id).then(setBook, () => setBook(null));
    bookRecipes(id).then(setRecipes, (e) => setError(errText(e)));
  }, [on, id]);

  const myUid = book && s.uid;
  const owner = !!book && book.owner === s.uid;
  const [tab, setTab] = useState<"recipes" | "memories">("recipes");
  const [adding, setAdding] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  // Duplicates inside the cookbook, and ones already in your own recipes.
  const [mine, setMine] = useState<SavedRecipe[]>([]);
  useEffect(() => {
    listRecipes().then(setMine, () => {});
  }, []);
  const asComparable = (r: SharedRecipe) => ({ ...r.recipe, id: r.id });
  const twinsInBook = (r: SharedRecipe) => duplicatesOf(asComparable(r), (recipes ?? []).filter((x) => x.id !== r.id).map(asComparable));
  const inMine = (r: SharedRecipe) => r.sharedBy === s.uid || duplicatesOf({ ...r.recipe }, mine).length > 0;
  // Your own copy of a cookbook recipe: the one you shared it from, else a matching recipe of yours.
  const myCopyOf = (r: SharedRecipe) =>
    (r.sharedBy === s.uid ? mine.find((m) => m.id === r.sourceId) : undefined) ?? duplicatesOf({ ...r.recipe }, mine)[0]?.recipe ?? null;
  const [menuFor, setMenuFor] = useState<SharedRecipe | null>(null);
  // Search, as in your own recipes. Who shared a recipe counts as part of its name ("Mom" finds Mom's).
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const q = query.trim();
  const found = new Map(
    q ? (recipes ?? []).map((r) => [r.id, searchRecipe({ ...r.recipe, tags: [...(r.recipe.tags ?? []), r.sharedByName] }, q, scope)] as const) : [],
  );
  // Everyone's ratings, and the list's order: A–Z or top rated (unrated last).
  const [ratings, setRatings] = useState<Record<string, Rating[]>>({});
  useEffect(() => {
    if (on) bookRatings(id).then(setRatings, () => {});
  }, [on, id]);
  const [order, setOrder] = useState<"az" | "rating">("az");
  const avg = (r: SharedRecipe) => ratingSummary(ratings[r.id])?.average ?? -1;
  const shownRecipes = (recipes ?? [])
    .filter((r) => !q || found.get(r.id)?.match)
    .sort((a, b) =>
      order === "rating"
        ? avg(b) - avg(a) || (ratings[b.id]?.length ?? 0) - (ratings[a.id]?.length ?? 0) || a.recipe.title.localeCompare(b.recipe.title)
        : a.recipe.title.localeCompare(b.recipe.title),
    );
  async function removeShared(r: SharedRecipe) {
    if (!confirm(`Remove “${r.recipe.title}” from the cookbook? Copies people saved stay.`)) return;
    await removeFromCookbook(id, r.id);
    setRecipes((rs) => rs && rs.filter((x) => x.id !== r.id));
    showToast("Removed from the cookbook");
  }

  // Removing a cookbook only takes it off your list; the others keep it.
  const others = book ? book.members.filter((m) => m !== s.uid) : [];
  const heir = others[0] ? book?.names[others[0]] ?? "another member" : "";
  async function leave() {
    if (!book) return;
    const msg = others.length
      ? `Delete “${book.name}” from your cookbooks? It stays for the ${others.length === 1 ? "other member" : `other ${others.length} members`}, with all its recipes and memories.` +
        (owner ? ` ${heir} will look after it (cover and invites).` : "") +
        " Recipes you saved to your own recipes stay."
      : `Delete “${book.name}”? You're the only member, so it's deleted completely. Recipes you saved to your own recipes stay.`;
    if (!confirm(msg)) return;
    try {
      await leaveCookbook(book);
      navigate({ name: "family" }, true);
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <>
      <Header
        title={book?.name ?? "Cookbook"}
        back={href({ name: "family" })}
        returnToPrevious
        actions={
          book ? (
            <button className="icon-btn" onClick={() => invite(book, showToast)} aria-label="Invite someone">
              <Icon name="share" />
            </button>
          ) : null
        }
      />
      <main className="page">
        {!on && <NeedsSignIn s={s} />}
        {on && book === null && <div className="callout error">This cookbook doesn't exist any more, or you're not a member.</div>}
        {book && (
          <>
            <CookbookCover book={book} isOwner={owner} />
            <p className="muted small book-members">
              {book.members.length} {book.members.length === 1 ? "member" : "members"}: {book.members.map((m) => book.names[m] ?? "someone").join(", ")} ·{" "}
              <button className="link-btn small" onClick={() => invite(book, showToast)}>
                Invite
              </button>
            </p>
            <div className="segmented book-tabs" role="tablist">
              <button role="tab" aria-selected={tab === "recipes"} className={tab === "recipes" ? "chip active" : "chip"} onClick={() => setTab("recipes")}>
                Recipes{recipes ? ` · ${recipes.length}` : ""}
              </button>
              <button role="tab" aria-selected={tab === "memories"} className={tab === "memories" ? "chip active" : "chip"} onClick={() => setTab("memories")}>
                Memories{memoryCount !== null ? ` · ${memoryCount}` : ""}
              </button>
            </div>
            {tab === "recipes" && (
              <section className="book-recipes">
                <div className="button-row">
                  <button className="btn primary" onClick={() => setAdding(true)} disabled={!recipes}>
                    <Icon name="plus" size={18} /> Add recipes
                  </button>
                </div>
                {recipes === null && !error && <p className="muted">Loading…</p>}
                {recipes?.length === 0 && <p className="muted">No recipes yet. Tap Add recipes to scan a new one or share some of yours.</p>}
                {recipes && recipes.length > 0 && (
                  <SearchBox query={query} scope={scope} onQuery={setQuery} onScope={setScope} />
                )}
                {recipes && recipes.length > 1 && (
                  <div className="book-sort" role="radiogroup" aria-label="Order">
                    {(
                      [
                        ["az", "A–Z"],
                        ["rating", "Top rated"],
                      ] as const
                    ).map(([v, label]) => (
                      <button key={v} role="radio" aria-checked={order === v} className={order === v ? "chip active" : "chip"} onClick={() => setOrder(v)}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {q && recipes && recipes.length > 0 && shownRecipes.length === 0 && (
                  <p className="muted">No recipes in this cookbook match “{q}”.</p>
                )}
                {shownRecipes.length > 0 && (
                  <ul className="recipe-list">
                    {shownRecipes.map((r) => (
                      <li key={r.id} className="recipe-row">
                        <HoldLink className="recipe-card" href={href({ name: "family", book: id, recipe: r.id })} onHold={() => setMenuFor(r)}>
                          <div className="thumb-placeholder" />
                          <div>
                            <div className="recipe-card-title">{r.recipe.title}</div>
                            <div className="muted small">Shared by {r.sharedBy === myUid ? "you" : r.sharedByName}</div>
                            <RatingBadge ratings={ratings[r.id]} />
                            {twinsInBook(r).length > 0 && (
                              <div className="small dup-flag">Possible duplicate of “{twinsInBook(r)[0].recipe.title}”</div>
                            )}
                            {r.sharedBy !== myUid && inMine(r) && <div className="muted small">✓ Already in your recipes</div>}
                            {q && (found.get(r.id)?.ingredientHits.length ?? 0) > 0 && (
                              <div className="small search-hit">Has: {found.get(r.id)!.ingredientHits.slice(0, 3).join(" · ")}</div>
                            )}
                          </div>
                        </HoldLink>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {/* Memories stay mounted (hidden) so their count is known on the Recipes tab too. */}
            <div hidden={tab !== "memories"}>
              {recipes && <CookbookMemories book={book} recipes={recipes} myUid={s.uid ?? ""} isOwner={owner} onCount={setMemoryCount} />}
            </div>
            <details className="book-settings">
              <summary>Cookbook settings</summary>
              <p className="muted small">
                {others.length
                  ? "Deleting removes this cookbook from your list only. Everyone else keeps it, with all its recipes and memories."
                  : "You're the only member, so deleting removes the cookbook completely."}
              </p>
              <button className="btn danger" onClick={leave}>
                Delete this cookbook
              </button>
            </details>
          </>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
      {menuFor && (
        <BookRecipeActions
          title={menuFor.recipe.title}
          recipe={menuFor.recipe}
          myCopy={myCopyOf(menuFor)}
          canRemove={menuFor.sharedBy === s.uid || owner}
          onEdit={() => {
            try {
              sessionStorage.setItem(EDIT_SHARED_KEY, menuFor.id);
            } catch {
              /* opens without the editor */
            }
            navigate({ name: "family", book: id, recipe: menuFor.id });
          }}
          onClose={() => setMenuFor(null)}
          onSaved={(r) => setMine((m) => [...m.filter((x) => x.id !== r.id), r])}
          onRemove={() => removeShared(menuFor)}
          onMessage={showToast}
        />
      )}
      {adding && book && recipes && (
        <AddToCookbook
          book={book}
          inBook={recipes}
          myUid={s.uid ?? ""}
          onClose={(added) => {
            setAdding(false);
            if (added) {
              showToast(`Shared ${added} ${added === 1 ? "recipe" : "recipes"}`);
              bookRecipes(id).then(setRecipes, () => {});
            }
          }}
        />
      )}
      {toast}
    </>
  );
}

// ---------- a recipe in a cookbook ----------
export function SharedRecipePage({ bookId, docId }: { bookId: string; docId: string }) {
  const s = useCloud();
  const [item, setItem] = useState<SharedRecipe | null | undefined>(undefined);
  const [book, setBook] = useState<Cookbook | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, showToast] = useToast();
  const timers = useTimers();
  const [cooking, setCooking] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const on = signedIn(s);
  // Your own copy: the one you shared it from, else a matching recipe of yours. Favorites, the shopping list,
  // the week plan, notes, photos and "made it" use it — a cookbook recipe isn't in your recipes until you save it.
  const [myCopy, setMyCopy] = useState<SavedRecipe | null>(null);
  // Opened with "Edit" from the press-and-hold menu.
  const [editing, setEditing] = useState(() => {
    try {
      if (sessionStorage.getItem(EDIT_SHARED_KEY) !== docId) return false;
      sessionStorage.removeItem(EDIT_SHARED_KEY);
      return true;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!item) return;
    listRecipes().then(
      (all) => setMyCopy((item.sharedBy === s.uid ? all.find((r) => r.id === item.sourceId) : undefined) ?? duplicatesOf({ ...item.recipe }, all)[0]?.recipe ?? null),
      () => {},
    );
  }, [item, s.uid]);

  const [ratings, setRatings] = useState<Rating[]>([]);
  useEffect(() => {
    if (on) bookRatings(bookId).then((all) => setRatings(all[docId] ?? []), () => {});
  }, [on, bookId, docId]);
  useEffect(() => {
    if (!on) return;
    getCookbook(bookId).then(setBook, () => {});
    bookRecipes(bookId).then((rs) => setItem(rs.find((r) => r.id === docId) ?? null), (e) => setError(errText(e)));
  }, [on, bookId, docId]);

  // Check-offs and the chosen size: your copy's, or the cookbook recipe's own until you save it.
  const progressId = myCopy?.id ?? `cookbook-${docId}`;
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (item) recipeLink(item.recipe).then(setLink, () => setLink(""));
  }, [item]);

  /** Saves the cookbook recipe to your recipes (keeping your check-offs and size), and returns it. */
  async function saveCopy(extra: Partial<SavedRecipe> = {}): Promise<SavedRecipe> {
    const saved: SavedRecipe = { ...item!.recipe, id: newId(), createdAt: Date.now(), photos: [], ...extra };
    await saveRecipe(saved);
    saveProgress(saved.id, loadProgress(progressId));
    setMyCopy(saved);
    setViewKey((k) => k + 1);
    return saved;
  }
  async function updateCopy(updated: SavedRecipe) {
    setMyCopy(updated);
    await saveRecipe(updated);
  }
  async function save() {
    if (!item) return;
    setSaving(true);
    try {
      const saved = await saveCopy();
      navigate({ name: "recipe", id: saved.id });
    } catch (e) {
      setError(errText(e));
      setSaving(false);
    }
  }
  const run = (fn: () => Promise<void>) => () => fn().catch((e) => setError(errText(e)));
  const toggleFavorite = run(async () => {
    if (myCopy) {
      await updateCopy({ ...myCopy, favorite: !myCopy.favorite });
      showToast(myCopy.favorite ? "Removed from Favorites" : "Added to Favorites");
    } else {
      await saveCopy({ favorite: true });
      showToast("Saved to your recipes and Favorites");
    }
  });
  const share = run(async () => {
    if (!item) return;
    const r = link
      ? await shareText(item.recipe.title, `${item.recipe.title}\nOpen the recipe in Cardamix:`, link)
      : await shareText(item.recipe.title, recipeToText(item.recipe, loadProgress(progressId).scale));
    if (r === "copied") showToast("Link copied — paste it in a message");
    if (r === "failed") showToast("Sharing isn't available in this browser");
  });

  async function remove() {
    if (!item || !confirm(`Remove “${item.recipe.title}” from the cookbook? Copies people saved stay.`)) return;
    try {
      await removeFromCookbook(bookId, docId);
      navigate({ name: "family", book: bookId }, true);
    } catch (e) {
      setError(errText(e));
    }
  }

  const canRemove = item && (item.sharedBy === s.uid || book?.owner === s.uid);
  // The person who shared it and the cookbook's owner can edit the cookbook's copy.
  const canEdit = !!canRemove && !!book;
  if (editing && item && book && canEdit) {
    return (
      <>
        <Header title="Edit cookbook recipe" />
        <main className="page">
          <p className="muted small">
            This changes the recipe in {book.name} for everyone. Copies people saved to their own recipes stay as they are.
          </p>
          <RecipeEditor
            recipe={{ ...item.recipe, id: item.id, createdAt: item.sharedAt, photos: [] }}
            onCancel={() => setEditing(false)}
            onDelete={remove}
            deleteLabel="Remove from cookbook"
            onSave={async (updated) => {
              await editInCookbook(book, item.id, updated);
              setItem({ ...item, recipe: updated, editedBy: s.uid ?? undefined, editedByName: book.names[s.uid ?? ""], editedAt: Date.now() });
              setViewKey((k) => k + 1);
              setEditing(false);
            }}
          />
        </main>
      </>
    );
  }
  const onList = loadShopping().recipes.length;
  return (
    <>
      <Header
        title={book?.name ?? ""}
        back={href({ name: "family", book: bookId })}
        returnToPrevious
        actions={
          item ? (
            <>
              <button
                className={myCopy?.favorite ? "icon-btn starred" : "icon-btn"}
                onClick={toggleFavorite}
                aria-label={myCopy?.favorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={!!myCopy?.favorite}
              >
                <Icon name="star" filled={!!myCopy?.favorite} />
              </button>
              <a className="icon-btn badge-host" href={href({ name: "shopping" })} aria-label={`Shopping list${onList ? `, ${onList} recipes` : ""}`}>
                <Icon name="bag" />
                {onList > 0 && <span className="badge">{onList}</span>}
              </a>
              <button className="icon-btn" onClick={share} aria-label="Share recipe">
                <Icon name="share" />
              </button>
              {canEdit && (
                <button className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit recipe">
                  <Icon name="edit" />
                </button>
              )}
            </>
          ) : null
        }
      />
      <main className="page">
        {!on && <NeedsSignIn s={s} />}
        {item === null && <div className="callout error">This recipe was removed from the cookbook.</div>}
        {item && (
          <>
            <p className="muted small shared-note">
              Shared by {item.sharedBy === s.uid ? "you" : item.sharedByName}
              {item.editedAt && item.editedBy !== item.sharedBy
                ? `, edited by ${item.editedBy === s.uid ? "you" : item.editedByName ?? "the cookbook's owner"}`
                : ""}
              .
            </p>
            {book && s.uid && <CookbookRating book={book} recipeId={item.id} ratings={ratings} myUid={s.uid} onChange={setRatings} />}
            <TimerBar {...timers} />
            <RecipeView
              key={`${progressId}-${viewKey}`}
              recipe={item.recipe}
              recipeId={progressId}
              onStartCooking={feature("cookMode") ? () => (cookStart(progressId), setCooking(true)) : undefined}
              listRow={
                myCopy ? undefined : (
                  <div className="list-row">
                    <button
                      className="btn"
                      onClick={run(async () => {
                        const saved = await saveCopy();
                        const p = loadProgress(saved.id);
                        addToShopping(saved.id, p.scale, p.have.filter((i) => i < saved.ingredients.length));
                        showToast("Saved to your recipes and added to your shopping list");
                      })}
                    >
                      <Icon name="bag" size={18} /> Add to shopping list
                    </button>
                  </div>
                )
              }
              top={
                myCopy ? (
                  <>
                    {feature("mealTime") && <PlanMeal recipe={{ ...item.recipe, cookLog: myCopy.cookLog }} recipeId={myCopy.id} />}
                    {feature("weekPlanner") && <AddToWeek recipeId={myCopy.id} />}
                  </>
                ) : (
                  <div className="callout small make-it-yours">
                    Planning it for the week, your notes and photos, and “made it” use your own copy.{" "}
                    <button className="link-btn small" onClick={save} disabled={saving}>
                      Save to my recipes
                    </button>
                  </div>
                )
              }
              myNotes={
                myCopy && feature("notes") ? (
                  <>
                    <p className="muted small">
                      Your notes and history, kept with your copy:{" "}
                      <a href={href({ name: "recipe", id: myCopy.id })}>“{myCopy.title}”</a>
                    </p>
                    <MyNotes key={myCopy.id} recipe={myCopy} hideRating onSaved={updateCopy} />
                  </>
                ) : undefined
              }
              extra={
                myCopy ? (
                  <>
                    {feature("avoid") && <Substitutes recipe={myCopy} onSaved={updateCopy} />}
                    {feature("nutrition") && <NutritionSection recipe={myCopy} onSaved={updateCopy} />}
                  </>
                ) : undefined
              }
            />
            <div className="button-row print-link">
              {feature("print") && myCopy && (
                <a className="btn" href={href({ name: "print", id: myCopy.id })}>
                  <Icon name="download" size={18} /> Print or save as PDF
                </a>
              )}
              {canRemove && (
                <button className="btn" onClick={remove}>
                  Remove from cookbook
                </button>
              )}
            </div>
          </>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
      {item && !myCopy && item.sharedBy !== s.uid && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save to my recipes"}
          </button>
        </div>
      )}
      {item && cooking && (
        <CookMode
          recipe={item.recipe}
          recipeId={progressId}
          timers={timers}
          onLog={async (minutes) => {
            if (myCopy) {
              await updateCopy({ ...myCopy, cookLog: [...(myCopy.cookLog ?? []), { at: Date.now(), minutes, scale: loadProgress(progressId).scale }] });
            }
            clearCookStart(progressId);
          }}
          onClose={() => {
            setCooking(false);
            setViewKey((k) => k + 1);
          }}
        />
      )}
      {toast}
    </>
  );
}
/** Set by the press-and-hold menu's "Edit" so the recipe opens in the editor. */
export const EDIT_SHARED_KEY = "recipe-builder.editShared";

// ---------- joining from an invite link ----------
export function JoinPage({ id }: { id: string }) {
  const s = useCloud();
  const [book, setBook] = useState<Cookbook | null | undefined>(undefined);
  const [myName, setMyName] = useState("");
  const [error, setError] = useState("");
  const on = signedIn(s);

  useEffect(() => {
    if (on) getCookbook(id).then(setBook, () => setBook(null));
  }, [on, id]);

  useEffect(() => {
    if (book && s.uid && book.members.includes(s.uid)) navigate({ name: "family", book: id }, true);
  }, [book, s.uid, id]);

  async function join() {
    if (!book) return;
    try {
      await joinCookbook(book, myName);
      navigate({ name: "family", book: id }, true);
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <>
      <Header title="Join a cookbook" back={href({ name: "library" })} />
      <main className="page">
        {!on && (
          <>
            <NeedsSignIn s={s} />
            <p className="muted small">After you sign in, open the invite link again.</p>
          </>
        )}
        {on && book === undefined && <p className="muted">Opening invite…</p>}
        {on && book === null && <div className="callout error">This invite link doesn't work — the cookbook may have been deleted. Ask for a new link.</div>}
        {book && !(s.uid && book.members.includes(s.uid)) && (
          <div className="plan-card">
            <p>
              You're invited to <strong>{book.name}</strong>
              <span className="muted"> · {book.members.map((m) => book.names[m] ?? "someone").join(", ")}</span>
            </p>
            <label className="field">
              <span>Your name, as others will see it</span>
              <input className="text-input" value={myName} placeholder="e.g. Aunt Jo" maxLength={40} onChange={(e) => setMyName(e.target.value)} />
            </label>
            <div className="button-row">
              <button className="btn primary" onClick={join}>Join cookbook</button>
            </div>
            <p className="muted small">Members can see the recipes shared in this cookbook and your name. Nothing else from your recipes is shared.</p>
          </div>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
    </>
  );
}

// ---------- on a recipe: share it to a cookbook ----------
export function ShareToFamily({ recipe }: { recipe: SavedRecipe }) {
  const s = useCloud();
  const [books, setBooks] = useState<Cookbook[] | null>(null);
  const [shared, setShared] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const on = signedIn(s);

  useEffect(() => {
    if (!on) return;
    myCookbooks()
      .then(async (bs) => {
        setBooks(bs);
        setShared(await whereShared(bs, recipe.id));
      })
      .catch(() => setBooks([]));
  }, [on, recipe.id]);

  if (!on || !books || books.length === 0) return null;
  const changed = (at: number) => (recipe.updatedAt ?? recipe.createdAt) > at;

  async function run(bookIdValue: string, fn: () => Promise<void>) {
    setBusy(bookIdValue);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    }
    setBusy("");
  }

  return (
    <section className="family-share">
      <h3>Cookbooks</h3>
      {books.map((b) => (
        <p key={b.id} className="small family-row">
          {shared[b.id] ? (
            <>
              <span>
                <Icon name="check" size={16} /> In <a href={href({ name: "family", book: b.id })}>{b.name}</a>
              </span>
              {changed(shared[b.id]) && (
                <button
                  className="btn"
                  disabled={!!busy}
                  onClick={() => run(b.id, async () => {
                    await shareToCookbook(b, recipe, applySwaps(recipe));
                    setShared((x) => ({ ...x, [b.id]: Date.now() }));
                  })}
                >
                  Update with my changes
                </button>
              )}
              <button
                className="link-btn small"
                disabled={!!busy}
                onClick={() => run(b.id, async () => {
                  await removeFromCookbook(b.id, `${s.uid}_${recipe.id}`);
                  setShared((x) => {
                    const n = { ...x };
                    delete n[b.id];
                    return n;
                  });
                })}
              >
                Remove
              </button>
            </>
          ) : (
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => run(b.id, async () => {
                // Someone may have shared the same recipe already.
                const there = (await bookRecipes(b.id)).filter((x) => x.sharedBy !== s.uid);
                const twin = duplicatesOf(recipe, there.map((x) => ({ ...x.recipe, id: x.id, sharedByName: x.sharedByName })))[0]?.recipe;
                if (twin && !confirm(`“${twin.title}” (shared by ${twin.sharedByName}) looks like the same recipe. Share yours to ${b.name} anyway?`)) return;
                await shareToCookbook(b, recipe, applySwaps(recipe));
                setShared((x) => ({ ...x, [b.id]: Date.now() }));
              })}
            >
              <Icon name="book" size={18} /> {busy === b.id ? "Sharing…" : `Share to ${b.name}`}
            </button>
          )}
        </p>
      ))}
      <p className="muted small">Shares the recipe as you cook it (with your swaps). Photos and your notes stay private.</p>
      {error && <div className="callout error">{error}</div>}
    </section>
  );
}
