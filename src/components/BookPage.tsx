import { useEffect, useMemo, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { Loading } from "./LogoLoader";
import { useToast } from "./Toast";
import {
  BOOK_PRICE,
  confirmOrder,
  deleteBook,
  loadBook,
  loadBooks,
  MAX_PAGES,
  myOrders,
  newBook,
  orderBook,
  orderStatus,
  previewUrl,
  quoteBook,
  saveBook,
  SHIPPING_OPTIONS,
  STATUS_TEXT,
  type Address,
  type BookOrder,
  type BookSpec,
} from "../lib/book";
import { listRecipes, saveRecipe } from "../lib/db";
import { compressPhoto } from "../lib/image";
import { href, navigate } from "../lib/route";
import type { SavedRecipe } from "../lib/schema";

const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/ \[\d+\]$/, "") : String(e));
const money = (n: number) => `$${n.toFixed(2)}`;
const ADDRESS_KEY = "recipe-builder.bookAddress";
const emptyAddress: Address = { name: "", street1: "", street2: "", city: "", state: "", postcode: "", phone: "" };

/** Opens a PDF in a new tab — opened first, filled in once the link is ready (phones block late pop-ups). */
async function openPdf(get: () => Promise<string>) {
  const w = window.open("", "_blank");
  try {
    const url = await get();
    if (w) w.location.href = url;
    else location.assign(url);
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** #/book: your printed cookbooks and orders. #/book/{id}: make one. */
export default function BookPage({ id, order }: { id?: string; order?: string }) {
  return id ? <BookEditor id={id} order={order} /> : <BookList />;
}

function OrderRow({ o }: { o: BookOrder }) {
  const [s, setS] = useState(o);
  const [busy, setBusy] = useState(false);
  return (
    <li>
      <span>
        <strong>{s.title}</strong>
        <span className="muted small">
          {" "}
          · {s.pages} pages · {new Date(s.createdAt).toLocaleDateString()}
        </span>
        <br />
        <span className="small">{STATUS_TEXT[s.status]}</span>
        {s.tracking?.map((t) => (
          <a key={t} className="small" href={t} target="_blank" rel="noreferrer">
            {" "}
            Track it
          </a>
        ))}
      </span>
      {(s.status === "printing" || s.status === "awaiting_payment" || s.status === "sending") && (
        <button
          className="link-btn small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await (s.status === "awaiting_payment" ? confirmOrder(s.id) : orderStatus(s.id)).catch(() => null);
            if (r) setS({ ...s, ...r });
            setBusy(false);
          }}
        >
          {busy ? "Checking…" : "Check"}
        </button>
      )}
    </li>
  );
}

function BookList() {
  const [books, setBooks] = useState<BookSpec[] | null>(null);
  const [orders, setOrders] = useState<BookOrder[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    loadBooks().then(setBooks, (e) => (setBooks([]), setError(errText(e))));
    myOrders().then(setOrders, () => {});
  }, []);
  return (
    <>
      <Header title="Printed cookbook" back={href({ name: "family" })} />
      <main className="page book-page">
        <section>
          <h1 className="page-title">A real cookbook</h1>
          <p>
            Turn your recipes into a hardcover book — 8.5 × 11 inches, full color, with your photos, a dedication and a table of contents.
            Printed and shipped to your door. A lovely gift for the family.
          </p>
          <p className="muted small">
            {money(BOOK_PRICE)} for up to {MAX_PAGES} pages, plus delivery. You'll see the exact price before you pay.
          </p>
          <button className="btn primary" onClick={() => navigate({ name: "book", id: newBook().id })}>
            <Icon name="book" size={18} /> Start a book
          </button>
        </section>
        {books === null && <Loading />}
        {books && books.length > 0 && (
          <section>
            <h3>Your books</h3>
            <ul className="book-list">
              {books.map((b) => (
                <li key={b.id}>
                  <a href={href({ name: "book", id: b.id })}>{b.title || "Untitled book"}</a>
                  <span className="muted small"> · {b.recipeIds.length} recipes</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {orders.length > 0 && (
          <section>
            <h3>Orders</h3>
            <ul className="book-list">
              {orders.map((o) => (
                <OrderRow key={o.id} o={o} />
              ))}
            </ul>
          </section>
        )}
        {error && <div className="callout error small">{error}</div>}
      </main>
    </>
  );
}

function BookEditor({ id, order }: { id: string; order?: string }) {
  const [book, setBook] = useState<BookSpec | null>(null);
  const [recipes, setRecipes] = useState<SavedRecipe[] | null>(null);
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [address, setAddress] = useState<Address>(() => {
    try {
      return { ...emptyAddress, ...JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? "{}") };
    } catch {
      return emptyAddress;
    }
  });
  const [shipping, setShipping] = useState("MAIL");
  const [price, setPrice] = useState<{ total: number; delivery: number; book: number } | null>(null);
  const [orderState, setOrderState] = useState<string>("");
  const [toast, showToast] = useToast();

  useEffect(() => {
    loadBook(id).then((b) => setBook(b ?? { ...newBook(), id }), () => setBook({ ...newBook(), id }));
    listRecipes().then((rs) => setRecipes([...rs].sort((a, b) => a.title.localeCompare(b.title))), () => setRecipes([]));
  }, [id]);
  // Back from paying: send it to the printer.
  useEffect(() => {
    if (!order) return;
    setOrderState("Checking your payment…");
    confirmOrder(order).then(
      (r) => setOrderState(STATUS_TEXT[r.status]),
      (e) => setOrderState(errText(e)),
    );
  }, [order]);

  const update = (patch: Partial<BookSpec>) => {
    setBook((b) => (b ? { ...b, ...patch } : b));
    setPages(null);
    setPrice(null);
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    }
    setBusy("");
  };
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (recipes ?? []).filter((r) => !q || r.title.toLowerCase().includes(q) || (r.tags ?? []).some((t) => t.toLowerCase().includes(q)));
  }, [recipes, search]);
  if (!book || !recipes) return <Loading delay={0} />;
  const chosen = new Set(book.recipeIds);
  // Only photos of the food (the dish photo), never the scanned recipe cards.
  const withPhotos = recipes.filter((r) => chosen.has(r.id) && !!r.dishPhoto);
  const pickPhoto = (onFile: (f: File) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => input.files?.[0] && onFile(input.files[0]);
    input.click();
  };
  /** A dish photo for a recipe, picked here: saved on the recipe itself, so it shows everywhere. */
  const addDishPhoto = (r: SavedRecipe) =>
    pickPhoto((file) =>
      void run(`photo-${r.id}`, async () => {
        const updated = { ...r, dishPhoto: await compressPhoto(file, 1600, 0.82), updatedAt: Date.now() };
        await saveRecipe(updated);
        setRecipes((all) => (all ?? []).map((x) => (x.id === r.id ? updated : x)));
        setPages(null);
      }),
    );
  const toggle = (rid: string) =>
    update({ recipeIds: chosen.has(rid) ? book.recipeIds.filter((x) => x !== rid) : [...book.recipeIds, rid], coverRecipeId: book.coverRecipeId === rid && chosen.has(rid) ? null : book.coverRecipeId });
  const addressOk = address.name && address.street1 && address.city && address.state && address.postcode && address.phone;

  return (
    <>
      <Header title={book.title || "New book"} back={href({ name: "book" })} />
      <main className="page book-page">
        {orderState && <div className="callout">{orderState}</div>}
        <section>
          <label className="field">
            <span>Title</span>
            <input className="text-input" value={book.title} maxLength={80} placeholder="e.g. The Johnson Family Kitchen" onChange={(e) => update({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Subtitle (optional)</span>
            <input className="text-input" value={book.subtitle} maxLength={120} placeholder="e.g. Recipes from three generations" onChange={(e) => update({ subtitle: e.target.value })} />
          </label>
          <label className="field">
            <span>Dedication (optional)</span>
            <textarea className="text-input" rows={3} value={book.dedication} maxLength={400} placeholder="e.g. For the grandkids — love, Nana" onChange={(e) => update({ dedication: e.target.value })} />
          </label>
          <label className="toggle-row">
            <span>Include recipe photos</span>
            <input type="checkbox" checked={book.includePhotos} onChange={(e) => update({ includePhotos: e.target.checked })} />
          </label>
        </section>

        <section>
          <h3>
            Recipes <span className="muted small">· {book.recipeIds.length} chosen</span>
          </h3>
          <input className="text-input" type="search" placeholder="Search recipes or labels" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="button-row">
            <button className="link-btn small" onClick={() => update({ recipeIds: [...new Set([...book.recipeIds, ...shown.map((r) => r.id)])] })}>
              Choose all{search ? " shown" : ""}
            </button>
            {book.recipeIds.length > 0 && (
              <button className="link-btn small" onClick={() => update({ recipeIds: [], coverRecipeId: null })}>
                Clear
              </button>
            )}
          </div>
          <ul className="book-recipes">
            {shown.map((r) => (
              <li key={r.id}>
                <label>
                  <input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} />
                  <span>{r.title}</span>
                </label>
                {chosen.has(r.id) && book.includePhotos && (
                  <span className="book-recipe-photo">
                    {r.dishPhoto && <img src={r.dishPhoto} alt="" />}
                    <button className="link-btn small" disabled={!!busy} onClick={() => addDishPhoto(r)}>
                      {busy === `photo-${r.id}` ? "Saving…" : r.dishPhoto ? "Change" : "Add photo"}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">
            {book.includePhotos ? "Each recipe shows a photo of the dish — yours from the recipe page, or add one here. Scanned recipe cards aren't printed. " : ""}
            The book is made from the recipes backed up to your account, as they are when it's printed.
          </p>
        </section>

        <section>
          <h3>Cover photo</h3>
          <div className="book-covers">
            <button
              className={!book.coverRecipeId && !book.coverPhoto ? "book-cover none active" : "book-cover none"}
              onClick={() => update({ coverRecipeId: null, coverPhoto: null })}
            >
              No photo
            </button>
            {book.coverPhoto && (
              <button className="book-cover active" aria-label="Your cover photo">
                <img src={book.coverPhoto} alt="" />
              </button>
            )}
            {withPhotos.map((r) => (
              <button
                key={r.id}
                className={!book.coverPhoto && book.coverRecipeId === r.id ? "book-cover active" : "book-cover"}
                onClick={() => update({ coverRecipeId: r.id, coverPhoto: null })}
                aria-label={r.title}
              >
                <img src={r.dishPhoto} alt="" />
              </button>
            ))}
            <button
              className="book-cover none"
              disabled={!!busy}
              onClick={() => pickPhoto((file) => void run("cover-photo", async () => update({ coverPhoto: await compressPhoto(file, 1600, 0.8), coverRecipeId: null })))}
            >
              {busy === "cover-photo" ? "…" : "Upload a photo"}
            </button>
          </div>
        </section>

        <section>
          <div className="button-row">
            <button className="btn" disabled={!!busy || !book.recipeIds.length} onClick={() => void run("pages", () => openPdf(() => previewUrl(book, "interior")))}>
              {busy === "pages" ? "Making the preview…" : "Preview pages"}
            </button>
            <button className="btn" disabled={!!busy || !book.recipeIds.length} onClick={() => void run("cover", () => openPdf(() => previewUrl(book, "cover")))}>
              {busy === "cover" ? "Making the preview…" : "Preview cover"}
            </button>
          </div>
          <div className="button-row">
            <button
              className="link-btn small"
              disabled={!!busy}
              onClick={() =>
                void run("save", async () => {
                  await saveBook(book);
                  const q = await quoteBook(book);
                  setPages(q.pages);
                  showToast("Saved");
                })
              }
            >
              {busy === "save" ? "Saving…" : "Save and count pages"}
            </button>
            <button
              className="link-btn small"
              disabled={!!busy}
              onClick={() =>
                confirm("Delete this book? (Orders already placed aren't affected.)") &&
                void run("delete", async () => {
                  await deleteBook(book.id);
                  navigate({ name: "book" }, true);
                })
              }
            >
              Delete book
            </button>
          </div>
          {pages !== null && (
            <p className="small">
              {pages} pages{pages > MAX_PAGES ? ` — over the ${MAX_PAGES}-page limit. Take a few recipes out or turn photos off.` : "."} Books have at least 24 pages:
              short ones end with lined pages for notes.
            </p>
          )}
        </section>

        <section>
          {!ordering ? (
            <button className="btn primary" disabled={!book.recipeIds.length || !!busy} onClick={() => setOrdering(true)}>
              <Icon name="bag" size={18} /> Order a printed copy
            </button>
          ) : (
            <div className="book-order">
              <h3>Delivery (US only)</h3>
              {(
                [
                  ["name", "Name"],
                  ["street1", "Street address"],
                  ["street2", "Apartment, suite (optional)"],
                  ["city", "City"],
                  ["state", "State (2 letters)"],
                  ["postcode", "ZIP code"],
                  ["phone", "Phone (for the carrier)"],
                ] as const
              ).map(([k, label]) => (
                <label className="field" key={k}>
                  <span>{label}</span>
                  <input
                    className="text-input"
                    value={address[k]}
                    autoComplete={{ name: "name", street1: "address-line1", street2: "address-line2", city: "address-level2", state: "address-level1", postcode: "postal-code", phone: "tel" }[k]}
                    inputMode={k === "postcode" || k === "phone" ? "tel" : undefined}
                    maxLength={k === "state" ? 2 : 100}
                    onChange={(e) => (setAddress({ ...address, [k]: e.target.value }), setPrice(null))}
                  />
                </label>
              ))}
              <label className="field">
                <span>Delivery speed</span>
                <select className="text-input" value={shipping} onChange={(e) => (setShipping(e.target.value), setPrice(null))}>
                  {SHIPPING_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {price && (
                <div className="callout small">
                  Book {money(price.book)} + delivery and tax {money(price.delivery)} = <strong>{money(price.total)}</strong>
                </div>
              )}
              <div className="button-row">
                {!price ? (
                  <button
                    className="btn primary"
                    disabled={!!busy || !addressOk}
                    onClick={() =>
                      void run("price", async () => {
                        try {
                          localStorage.setItem(ADDRESS_KEY, JSON.stringify(address));
                        } catch {
                          /* this visit only */
                        }
                        const q = await quoteBook(book, address, shipping);
                        setPages(q.pages);
                        if (q.total !== undefined) setPrice({ total: q.total, delivery: q.delivery ?? 0, book: q.book ?? BOOK_PRICE });
                      })
                    }
                  >
                    {busy === "price" ? "Getting the price…" : "Get the price"}
                  </button>
                ) : (
                  <button className="btn primary" disabled={!!busy} onClick={() => void run("pay", () => orderBook(book, address, shipping))}>
                    {busy === "pay" ? "Opening checkout…" : `Pay ${money(price.total)}`}
                  </button>
                )}
                <button className="link-btn small" disabled={!!busy} onClick={() => setOrdering(false)}>
                  Cancel
                </button>
              </div>
              <p className="muted small">
                Printed and shipped by our print partner, Lulu. Delivery time depends on the speed you choose. Your address is used only for this
                order. Secure payment by Stripe.
              </p>
            </div>
          )}
        </section>
        {error && <div className="callout error small">{error}</div>}
        {toast}
      </main>
    </>
  );
}
