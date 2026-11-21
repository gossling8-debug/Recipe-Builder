import { noteStep } from "../lib/funnel";
import { getPeople } from "../lib/autoPlan";
import { hasPlus } from "../lib/features";
import {
  FREE_LIMITS,
  freeLeft,
  loadAiUsage,
  type AiUsage,
} from "../lib/subscription";
import { ownKey } from "../lib/settings";
import VerifyEmail from "./VerifyEmail";
import Tour from "./Tour";
import { ADD_TOUR_STEPS, addTourQueued, finishAddTour } from "../lib/tour";
import { ALLERGEN_GROUPS, isActive, loadAvoid } from "../lib/avoid";
import { useEffect, useRef, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import {
  compressPhoto,
  prepareCrop,
  stripDataUrl,
  type CropSource,
} from "../lib/image";
import type { Quad } from "../lib/docscan";
import CropEditor from "./CropEditor";
import DocumentScanner, { type ScannedPage } from "./DocumentScanner";
import { listRecipes, newId, saveRecipe, storageErrorMessage } from "../lib/db";
import TagPicker from "./TagPicker";
import { cleanTags } from "../lib/schema";
import { href, navigate } from "../lib/route";
import { getApiKey, aiReady } from "../lib/settings";
import { getModel } from "../lib/models";
import type { RecipeSource } from "../lib/claude";
import type { SavedRecipe } from "../lib/schema";
import {
  bookRecipes,
  getCookbook,
  shareToCookbook,
  type Cookbook,
} from "../lib/family";
import { duplicatesOf } from "../lib/duplicates";
import { cloudState, subscribeCloud, user } from "../lib/cloud";
import {
  AddToBooksPrompt,
  DuplicatePrompt,
  SaveToMinePrompt,
  type DuplicateMatch,
} from "./AfterAdd";
import LogoLoader from "./LogoLoader";

const MAX_PHOTOS = 4;
type Mode = "photo" | "url" | "text" | "create";

const MODES: { value: Mode; label: string }[] = [
  { value: "photo", label: "Photo" },
  { value: "url", label: "Website" },
  { value: "text", label: "Paste text" },
  { value: "create", label: "Create" },
];

/** Ideas to start from on the Create tab. */
const CREATE_IDEAS = [
  "Red wine short ribs",
  "Olive Garden Zuppa Toscana",
  "Cheesecake Factory brown bread",
  "Anniversary dinner for 2",
  "Bakery-style cookies",
];

/** Add a recipe from card photos, a web page, or pasted/typed text. */
export default function Scanner({ book: bookId }: { book?: string } = {}) {
  // Opened from a family cookbook's "Add recipes": the new recipe goes into that cookbook.
  const [book, setBook] = useState<Cookbook | null>(null);
  useEffect(() => {
    if (bookId) getCookbook(bookId).then(setBook, () => {});
  }, [bookId]);
  // The recipe just read: ask whether it also goes to your recipes / your cookbooks.
  const [added, setAdded] = useState<{
    recipe: SavedRecipe;
    into: Cookbook | null;
    mineTwin?: string;
  } | null>(null);
  // Looks like one that's already there: ask before adding it.
  const [twins, setTwins] = useState<{
    recipe: SavedRecipe;
    into: Cookbook | null;
    matches: DuplicateMatch[];
    mineTwin?: string;
  } | null>(null);

  /** Recipes this one looks like: in the cookbook it's going into, or else in your recipes. */
  async function findTwins(
    r: SavedRecipe,
    into: Cookbook | null,
  ): Promise<{ matches: DuplicateMatch[]; mineTwin?: string }> {
    const mine = await listRecipes().catch(() => [] as SavedRecipe[]);
    const mineTwin = duplicatesOf(r, mine)[0]?.recipe.title;
    if (!into)
      return {
        matches: duplicatesOf(r, mine).map((d) => ({
          title: d.recipe.title,
          where: "in your recipes",
        })),
        mineTwin,
      };
    const uid = (await user().catch(() => null))?.uid;
    const inBook = await bookRecipes(into.id).catch(() => []);
    const matches = duplicatesOf(
      r,
      inBook.map((s) => ({
        ...s.recipe,
        id: s.id,
        by: s.sharedBy === uid ? "you" : s.sharedByName,
      })),
    ).map((d) => ({
      title: d.recipe.title,
      where: `in ${into.name}, shared by ${d.recipe.by}`,
    }));
    return { matches, mineTwin };
  }

  async function commit(
    r: SavedRecipe,
    into: Cookbook | null,
    mineTwin?: string,
  ) {
    if (into) await shareToCookbook(into, r, r);
    else await saveRecipe(r);
    setTwins(null);
    setAdded({ recipe: r, into, mineTwin });
  }
  const [mode, setMode] = useState<Mode>("photo");
  // Straight after the home screen tour: a short tour of adding a recipe (on the Photo tab).
  const [addTour, setAddTour] = useState(() => !bookId && addTourQueued());
  const [photos, setPhotos] = useState<string[]>([]);
  // Each photo's original and chosen corners, so it can be re-cropped; and photos waiting to be cropped.
  const [originals, setOriginals] = useState<
    ({ source: CropSource; quad: Quad | null } | null)[]
  >([]);
  const [cropQueue, setCropQueue] = useState<
    { source: CropSource; quad?: Quad; index?: number }[]
  >([]);
  const [preparing, setPreparing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [noCamera, setNoCamera] = useState("");
  function addScans(pages: ScannedPage[]) {
    setScanning(false);
    setPhotos((p) => [...p, ...pages.map((x) => x.photo)].slice(0, MAX_PHOTOS));
    setOriginals((o) =>
      [...o, ...pages.map((x) => ({ source: x.source, quad: x.quad }))].slice(
        0,
        MAX_PHOTOS,
      ),
    );
  }
  // Labels picked before reading; if none, Claude's suggestions are used.
  const [tags, setTags] = useState<string[]>([]);
  const [showTags, setShowTags] = useState(false);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [wish, setWish] = useState("");
  // Free plan: how many recipe adds and created recipes are left this month.
  const counted = !ownKey() && !hasPlus();
  const [usage, setUsage] = useState<AiUsage | null | undefined>(
    counted ? undefined : null,
  );
  useEffect(() => {
    if (counted) loadAiUsage().then(setUsage, () => setUsage(null));
  }, [counted]);
  const kindNow = mode === "create" ? "create" : "scan";
  const left = counted && usage !== undefined ? freeLeft(kindNow, usage) : null;
  const outOfFree = left === 0;
  useEffect(() => {
    if (outOfFree) void noteStep("limitHit");
  }, [outOfFree]);
  // Free plan: AI needs a confirmed email address.
  const [cloud, setCloud] = useState(cloudState());
  useEffect(() => subscribeCloud(setCloud), []);
  const needsVerify = counted && cloud.emailVerified === false;
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const apiKey = getApiKey();
  const model = getModel();

  useEffect(() => {
    if (!busy) return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  /**
   * scan: "Scan a card" — always shows the crop screen.
   * Otherwise ("Choose from photos"): crop only photos where a card was found;
   * screenshots and other pictures are added as they are.
   */
  async function addFiles(files: FileList | null, scan = false) {
    if (!files?.length) return;
    setError("");
    setPreparing(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const sources = await Promise.all(
        Array.from(files)
          .slice(0, Math.max(0, room))
          .map((f) => prepareCrop(f)),
      );
      const toCrop = sources.filter((src) => scan || src.found);
      const asIs = sources.filter((src) => !(scan || src.found));
      if (asIs.length) {
        const plain = await Promise.all(
          asIs.map(async (src) =>
            compressPhoto(await (await fetch(src.url)).blob()),
          ),
        );
        setPhotos((p) => [...p, ...plain].slice(0, MAX_PHOTOS));
        setOriginals((o) =>
          [...o, ...asIs.map((source) => ({ source, quad: null }))].slice(
            0,
            MAX_PHOTOS,
          ),
        );
      }
      setCropQueue((q) => [...q, ...toCrop.map((source) => ({ source }))]);
    } catch (e) {
      // Fall back to the plain photo if this browser can't crop.
      try {
        const added = await Promise.all(
          Array.from(files).map((f) => compressPhoto(f)),
        );
        setPhotos((p) => [...p, ...added].slice(0, MAX_PHOTOS));
        setOriginals((o) =>
          [...o, ...added.map(() => null)].slice(0, MAX_PHOTOS),
        );
      } catch {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setPreparing(false);
  }

  function cropDone(photo: string, quad: Quad | null) {
    const job = cropQueue[0];
    setCropQueue((q) => q.slice(1));
    if (!job) return;
    if (job.index !== undefined) {
      setPhotos((p) => p.map((x, i) => (i === job.index ? photo : x)));
      setOriginals((o) =>
        o.map((x, i) => (i === job.index ? { source: job.source, quad } : x)),
      );
    } else {
      setPhotos((p) => [...p, photo].slice(0, MAX_PHOTOS));
      setOriginals((o) =>
        [...o, { source: job.source, quad }].slice(0, MAX_PHOTOS),
      );
    }
  }

  const cleanUrl = (() => {
    const u = url.trim();
    if (!u) return "";
    const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    try {
      const parsed = new URL(withScheme);
      return parsed.hostname.includes(".") ? parsed.href : "";
    } catch {
      return "";
    }
  })();

  const ready =
    mode === "photo"
      ? photos.length > 0
      : mode === "url"
        ? !!cleanUrl
        : mode === "create"
          ? wish.trim().length >= 3
          : text.trim().length > 20;

  async function read() {
    setBusy(true);
    setError("");
    try {
      if (mode === "create") return await create();
      const source: RecipeSource =
        mode === "photo"
          ? { kind: "photos", photos: photos.map(stripDataUrl) }
          : mode === "url"
            ? { kind: "url", url: cleanUrl }
            : { kind: "text", text: text.trim() };
      // The Claude SDK is loaded only when needed, so the library opens fast.
      const { importRecipe } = await import("../lib/claude");
      const { recipe, usage } = await importRecipe(apiKey, source);
      if (recipe.steps.length === 0 && recipe.ingredients.length === 0) {
        throw new Error(recipe.warnings[0] ?? "No recipe was found there.");
      }
      const id = newId();
      // Smaller copies for the library so storage doesn't fill up.
      const thumbs =
        mode === "photo"
          ? await Promise.all(
              photos.map((p) =>
                fetch(p)
                  .then((r) => r.blob())
                  .then((b) => compressPhoto(b, 1200, 0.7)),
              ),
            )
          : [];
      const saved: SavedRecipe = {
        ...recipe,
        tags: tags.length ? cleanTags(tags) : recipe.tags,
        id,
        createdAt: Date.now(),
        photos: thumbs,
        source: mode === "url" ? cleanUrl : undefined,
        importCost: usage.cost,
      };
      const into = book ?? (bookId ? await getCookbook(bookId) : null);
      if (bookId && !into)
        throw new Error(
          "Couldn't open that cookbook. Check your connection and try again.",
        );
      // Check for duplicates now that the recipe is read, before anything is saved.
      const { matches, mineTwin } = await findTwins(saved, into);
      if (matches.length) {
        setTwins({ recipe: saved, into, matches, mineTwin });
        return;
      }
      await commit(saved, into, mineTwin);
    } catch (e) {
      setError(
        e instanceof DOMException
          ? storageErrorMessage(e)
          : e instanceof Error
            ? e.message
            : String(e),
      );
      setBusy(false);
    }
  }

  /** Create tab: Claude writes a new recipe from the request, then it's added like any other. */
  async function create() {
    const avoid = loadAvoid();
    const labels = isActive(avoid)
      ? [
          ...avoid.groups.map((g) => ALLERGEN_GROUPS[g]?.label ?? g),
          ...avoid.custom,
        ]
      : [];
    const existing = await listRecipes().catch(() => [] as SavedRecipe[]);
    const { createRecipe, createdNotes } = await import("../lib/createRecipe");
    const r = await createRecipe(apiKey, {
      request: wish,
      people: getPeople(),
      avoid: labels,
      existingTitles: existing.map((x) => x.title),
    });
    const saved: SavedRecipe = {
      ...r.recipe,
      notes: createdNotes(r),
      tags: tags.length ? cleanTags(tags) : r.recipe.tags,
      id: newId(),
      createdAt: Date.now(),
      photos: [],
      importCost: r.usage.cost,
    };
    const into = book ?? (bookId ? await getCookbook(bookId) : null);
    if (bookId && !into)
      throw new Error(
        "Couldn't open that cookbook. Check your connection and try again.",
      );
    const { matches, mineTwin } = await findTwins(saved, into);
    if (matches.length) {
      setTwins({ recipe: saved, into, matches, mineTwin });
      return;
    }
    await commit(saved, into, mineTwin);
  }

  const back = bookId
    ? href({ name: "family", book: bookId })
    : href({ name: "library" });
  if (twins) {
    return (
      <>
        <Header title="Add a recipe" />
        <main className="page" />
        <DuplicatePrompt
          title={twins.recipe.title}
          matches={twins.matches}
          onAddAnyway={() => commit(twins.recipe, twins.into, twins.mineTwin)}
          onSkip={() =>
            navigate(
              twins.into
                ? { name: "family", book: twins.into.id }
                : { name: "library" },
              true,
            )
          }
        />
      </>
    );
  }
  if (added) {
    const { recipe, into } = added;
    return (
      <>
        <Header title="Add a recipe" />
        <main className="page" />
        {into ? (
          <SaveToMinePrompt
            title={recipe.title}
            bookName={into.name}
            alreadyMine={added.mineTwin}
            onAnswer={async (save) => {
              if (save) await saveRecipe(recipe);
              navigate({ name: "family", book: into.id }, true);
            }}
          />
        ) : (
          <AddToBooksPrompt
            recipe={recipe}
            onDone={() => navigate({ name: "recipe", id: recipe.id }, true)}
          />
        )}
      </>
    );
  }

  if (!aiReady()) {
    return (
      <>
        <Header title="Add a recipe" back={back} />
        <main className="page">
          <div className="callout">
            Reading recipes uses Claude, which needs your Anthropic API key.{" "}
            <a href={href({ name: "settings" })}>Add it in Settings</a>.
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {addTour && !busy && mode === "photo" && (
        <Tour
          steps={ADD_TOUR_STEPS}
          onDone={() => {
            finishAddTour();
            setAddTour(false);
          }}
        />
      )}
      <Header
        title={book ? `Add to ${book.name}` : "Add a recipe"}
        back={busy ? undefined : back}
      />
      <main className="page">
        {busy ? (
          <div className="working" role="status">
            <div className="working-center">
              <LogoLoader size={88} />
              <div className="working-text">
                <p>
                  <strong>
                    {mode === "create"
                      ? "Creating your recipe…"
                      : mode === "url"
                        ? "Reading the web page…"
                        : "Reading your recipe…"}
                  </strong>
                </p>
                <p className="muted">
                  {mode === "create"
                    ? "Cardamix is developing it like a chef would, then checking its ratios, times and temperatures. This usually takes 30–90 seconds."
                    : "Cardamix is reading it and matching each ingredient to the step where it's used. This usually takes 20–60 seconds."}{" "}
                  ({seconds}s)
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              className="segmented mode-switch"
              role="tablist"
              aria-label="Add from"
            >
              {MODES.map((m) => (
                <button
                  key={m.value}
                  role="tab"
                  aria-selected={mode === m.value}
                  className={mode === m.value ? "chip active" : "chip"}
                  onClick={() => {
                    setMode(m.value);
                    setError("");
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === "photo" && (
              <>
                <p className="muted">
                  Lay the card flat in good light and fill the frame. If the
                  recipe continues on the back, add a second photo.
                </p>
                {!bookId && photos.length === 0 && (
                  <a className="plan-strip stack-link" href={href({ name: "stack" })}>
                    <Icon name="camera" size={18} />
                    <span>
                      <strong>Have a stack of cards?</strong>
                      <span className="muted small"> Scan them one after another — each is read in the background.</span>
                    </span>
                  </a>
                )}
                {photos.length > 0 && (
                  <ul className="photo-grid">
                    {photos.map((p, i) => (
                      <li key={i}>
                        <img
                          src={p}
                          alt={`Photo ${i + 1}`}
                          onClick={() => {
                            const o = originals[i];
                            if (o)
                              setCropQueue((q) => [
                                ...q,
                                {
                                  source: o.source,
                                  quad: o.quad ?? undefined,
                                  index: i,
                                },
                              ]);
                          }}
                        />
                        <button
                          className="remove"
                          aria-label={`Remove photo ${i + 1}`}
                          onClick={() => {
                            setPhotos((all) => all.filter((_, j) => j !== i));
                            setOriginals((all) =>
                              all.filter((_, j) => j !== i),
                            );
                          }}
                        >
                          <Icon name="close" size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {photos.length > 0 && originals.some(Boolean) && (
                  <p className="muted small">Tap a photo to adjust its crop.</p>
                )}
                {preparing && <p className="muted small">Finding the card…</p>}
                {noCamera && (
                  <div className="callout small">
                    {noCamera}{" "}
                    <button
                      className="link-btn small"
                      onClick={() => cameraInput.current?.click()}
                    >
                      Take a photo instead
                    </button>
                  </div>
                )}
                {photos.length > 0 && photos.length < MAX_PHOTOS && (
                  <div className="button-row">
                    <button
                      className="btn"
                      onClick={() => (setNoCamera(""), setScanning(true))}
                    >
                      <Icon name="camera" /> Scan another card
                    </button>
                    <button
                      className="btn"
                      onClick={() => libraryInput.current?.click()}
                    >
                      <Icon name="image" /> Choose from photos
                    </button>
                  </div>
                )}
              </>
            )}

            {mode === "url" && (
              <>
                <p className="muted">
                  Copy the address of a recipe page (in your browser: Share →
                  Copy) and paste it here. Cardamix skips the story and ads and
                  keeps just the recipe.
                </p>
                <input
                  className="text-input"
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="https://…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                {url.trim() && !cleanUrl && (
                  <p className="small" style={{ color: "var(--error)" }}>
                    That doesn't look like a web address.
                  </p>
                )}
              </>
            )}

            {mode === "create" && (
              <>
                <p className="muted">
                  Describe a dish, an occasion, or a restaurant favorite to
                  recreate. Cardamix develops a recipe the way a competition
                  chef would — built on proven cooking science and written so
                  any home cook can make it — sized for {getPeople()}{" "}
                  {getPeople() === 1 ? "person" : "people"}.
                </p>
                <textarea
                  className="text-input"
                  rows={3}
                  placeholder="e.g. Crispy-skin salmon with lemon butter sauce, or Zuppa Toscana like Olive Garden"
                  value={wish}
                  maxLength={300}
                  onChange={(e) => setWish(e.target.value)}
                />
                <div className="tag-picker">
                  {CREATE_IDEAS.map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className={wish === idea ? "tag on" : "tag"}
                      onClick={() => setWish(wish === idea ? "" : idea)}
                    >
                      {idea}
                    </button>
                  ))}
                </div>
                <p className="muted small">
                  New recipes are untested: rate them after you cook. Copycats
                  are Cardamix's recreation, labeled "inspired by" — not the
                  restaurant's own recipe.
                </p>
              </>
            )}

            {mode === "text" && (
              <>
                <p className="muted">
                  Paste a recipe from a message, email or note — or type one in.
                  The cheapest way to add a recipe.
                </p>
                <textarea
                  className="text-input"
                  rows={12}
                  placeholder={
                    "Grandma's Sugar Cookies\n\n1 cup butter\n1 1/2 cups sugar\n…\n\nCream the butter and 1 cup of the sugar…"
                  }
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </>
            )}

            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              data-testid="scan-card-input"
              onChange={(e) => {
                addFiles(e.target.files, true);
                e.target.value = "";
              }}
            />
            <input
              ref={libraryInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              data-testid="library-input"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <section className="scan-labels">
              {/* Tap to open, tap the same line to close (chosen labels stay chosen). */}
              <button
                className="link-btn small disclosure"
                aria-expanded={showTags}
                onClick={() => setShowTags(!showTags)}
              >
                <Icon name="plus" size={14} />{" "}
                {tags.length
                  ? `Labels: ${tags.join(", ")}`
                  : "Choose labels (optional — Cardamix suggests some if you skip this)"}
              </button>
              {showTags && (
                <>
                  <p className="muted small">
                    Pick labels for this recipe, or leave them all off and
                    Cardamix will suggest some.
                  </p>
                  <TagPicker tags={tags} onChange={setTags} />
                </>
              )}
            </section>
            {error && <div className="callout error">{error}</div>}
            {needsVerify && <VerifyEmail />}
            {!needsVerify &&
              left !== null &&
              (outOfFree ? (
                <div className="callout small free-out">
                  <strong>
                    You've used this month's {FREE_LIMITS[kindNow]} free{" "}
                    {kindNow === "create" ? "created recipes" : "recipe adds"}.
                  </strong>{" "}
                  {kindNow === "create"
                    ? "Plus creates 20+ recipes a month, along with about 50 recipe adds."
                    : "Plus adds about 50 recipes a month, with the Advanced reader for handwriting."}{" "}
                  <a className="btn primary" href={href({ name: "plus" })}>
                    See Plus
                  </a>
                  <span className="muted">
                    {" "}
                    Or wait until the 1st, when your free ones come back.
                  </span>
                </div>
              ) : (
                <p className="small free-left">
                  Free plan: <strong>{left}</strong> of {FREE_LIMITS[kindNow]}{" "}
                  {kindNow === "create" ? "created recipes" : "recipe adds"}{" "}
                  left this month.{" "}
                  <a href={href({ name: "plus" })}>Get more with Plus</a>
                </p>
              ))}
            {mode === "create" ? (
              <p className="muted small">
                Recipes are created with the Advanced reader or better, so each
                uses a bit more of your monthly AI than a scan.
              </p>
            ) : (
              <p className="muted small">
                Using the {model.label} reader. Change it in{" "}
                <a href={href({ name: "settings" })}>Settings</a>.
              </p>
            )}
          </>
        )}
      </main>
      {!busy && mode === "photo" && photos.length === 0 && (
        // Before the first card: the scan buttons sit at the bottom, within thumb reach.
        <div className="fab-bar">
          <div className="fab-stack">
            <button
              className="btn primary big"
              onClick={() => (setNoCamera(""), setScanning(true))}
            >
              <Icon name="camera" /> Scan a card
            </button>
            <button
              className="btn"
              onClick={() => libraryInput.current?.click()}
            >
              <Icon name="image" /> Choose from photos
            </button>
          </div>
        </div>
      )}
      {!busy && ready && !outOfFree && !needsVerify && (
        <div className="fab-bar">
          <button className="btn primary big" onClick={read}>
            {mode === "create" ? "Create recipe" : "Read recipe"}
          </button>
        </div>
      )}
      {scanning && (
        <DocumentScanner
          multiPage
          cleanByDefault
          onDone={addScans}
          onCancel={() => setScanning(false)}
          onNoCamera={(why) => {
            setScanning(false);
            setNoCamera(why);
          }}
        />
      )}
      {cropQueue[0] && (
        <CropEditor
          key={cropQueue.length + (cropQueue[0].index ?? -1)}
          source={cropQueue[0].source}
          quad={cropQueue[0].quad}
          onDone={cropDone}
          onCancel={() => setCropQueue((q) => q.slice(1))}
        />
      )}
    </>
  );
}
