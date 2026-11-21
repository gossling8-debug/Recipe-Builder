import { fb, syncNow, user } from "./cloud";
import { FUNCTIONS_URL } from "./firebaseConfig";
import { newId } from "./db";
import { callable } from "./subscription";

/**
 * A printed cookbook (hardcover, printed and shipped by Lulu). Its settings
 * are saved in the account (users/{uid}/books/{id}); the server builds the
 * pages from the recipes backed up there — so recipes are synced first.
 */
export interface BookSpec {
  id: string;
  title: string;
  subtitle: string;
  dedication: string;
  recipeIds: string[];
  coverRecipeId: string | null;
  includePhotos: boolean;
  updatedAt: number;
}
export interface BookOrder {
  id: string;
  bookId: string;
  title: string;
  pages: number;
  status: "awaiting_payment" | "sending" | "printing" | "shipped" | "problem" | "paid_not_sent";
  charge: number;
  tracking?: string[];
  createdAt: number;
}
export interface Address {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postcode: string;
  phone: string;
}
export const SHIPPING_OPTIONS = [
  { id: "MAIL", label: "Standard mail (slowest, cheapest)" },
  { id: "GROUND", label: "Ground" },
  { id: "EXPEDITED", label: "Expedited" },
  { id: "EXPRESS", label: "Express (fastest)" },
] as const;
export const BOOK_PRICE = 49.99;
export const MAX_PAGES = 100;

async function me() {
  const u = await user();
  if (!u) throw new Error("Sign in to make a printed book.");
  return u;
}
export const newBook = (): BookSpec => ({ id: newId(), title: "", subtitle: "", dedication: "", recipeIds: [], coverRecipeId: null, includePhotos: true, updatedAt: Date.now() });

export async function saveBook(b: BookSpec): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  await f.setDoc(f.doc(db, "users", u.uid, "books", b.id), { ...b, updatedAt: Date.now() });
}
export async function loadBooks(): Promise<BookSpec[]> {
  const u = await me();
  const { db, f } = await fb();
  const q = await f.getDocs(f.collection(db, "users", u.uid, "books"));
  return q.docs.map((d) => d.data() as BookSpec).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function loadBook(id: string): Promise<BookSpec | null> {
  const u = await me();
  const { db, f } = await fb();
  const d = await f.getDoc(f.doc(db, "users", u.uid, "books", id));
  return d.exists() ? (d.data() as BookSpec) : null;
}
export async function deleteBook(id: string): Promise<void> {
  const u = await me();
  const { db, f } = await fb();
  await f.deleteDoc(f.doc(db, "users", u.uid, "books", id));
}

/** The preview PDF's address (after saving and making sure the recipes are backed up). */
export async function previewUrl(b: BookSpec, part: "interior" | "cover"): Promise<string> {
  await saveBook(b);
  await syncNow();
  const token = await (await me()).getIdToken();
  return `${FUNCTIONS_URL}/bookFile?book=${encodeURIComponent(b.id)}&part=${part}&token=${encodeURIComponent(token)}`;
}

/** Pages, and (with an address) the delivered price. */
export async function quoteBook(b: BookSpec, address?: Address, shipping?: string): Promise<{ pages: number; total?: number; delivery?: number; book?: number }> {
  await saveBook(b);
  await syncNow();
  return callable("bookQuote", { bookId: b.id, address, shipping });
}

/** Pay (Stripe's page); afterwards the app comes back to the book with the order. */
export async function orderBook(b: BookSpec, address: Address, shipping: string): Promise<void> {
  await saveBook(b);
  await syncNow();
  const { url } = await callable<{ url: string }>("bookCheckout", { bookId: b.id, address, shipping });
  location.assign(url);
}
export const confirmOrder = (orderId: string) => callable<{ status: BookOrder["status"] }>("bookConfirm", { orderId });
export const orderStatus = (orderId: string) => callable<{ status: BookOrder["status"]; tracking?: string[] }>("bookStatus", { orderId });

export async function myOrders(): Promise<BookOrder[]> {
  const u = await me();
  const { db, f } = await fb();
  const q = await f.getDocs(f.query(f.collection(db, "bookOrders"), f.where("uid", "==", u.uid)));
  return q.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookOrder, "id">) })).sort((a, b) => b.createdAt - a.createdAt);
}

export const STATUS_TEXT: Record<BookOrder["status"], string> = {
  awaiting_payment: "Waiting for payment",
  sending: "Sending to the printer…",
  printing: "Being printed",
  shipped: "On its way",
  problem: "The printer had a problem — we'll be in touch",
  paid_not_sent: "Paid — we're sending it to the printer",
};
