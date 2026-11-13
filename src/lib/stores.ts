/**
 * Grocery stores: where the shopping list's buttons search, and the names
 * prices are kept under so they can be compared store by store.
 *
 * Search links only send the ingredient's name; the cook picks brand and size.
 * Most open the store's app when it's installed (in DuckDuckGo: Settings →
 * General → Open Links in Associated Apps). H-E-B's app doesn't open search
 * links, so "H-E-B app" opens the app and copies the name to paste.
 */
export interface StoreInfo {
  id: string;
  /** In the store menu. */
  label: string;
  /** On each item's button. */
  button: string;
  /** The store's name for prices ("H-E-B app" and "H-E-B website" are both H-E-B). */
  name: string;
  /** The search page for an item, or a page to open (with the name copied) for apps that can't search by link. */
  url: (q: string) => string;
  /** Opens the app without a search: the name is copied to paste. */
  copyName?: boolean;
}

const e = encodeURIComponent;
export const STORE_LIST: StoreInfo[] = [
  { id: "walmart", label: "Walmart", button: "Walmart", name: "Walmart", url: (q) => `https://www.walmart.com/search?q=${e(q)}` },
  { id: "heb", label: "H-E-B app", button: "H-E-B", name: "H-E-B", url: () => "https://www.heb.com/", copyName: true },
  { id: "hebWeb", label: "H-E-B website", button: "H-E-B", name: "H-E-B", url: (q) => `https://www.heb.com/search?q=${e(q)}` },
  { id: "target", label: "Target", button: "Target", name: "Target", url: (q) => `https://www.target.com/s?searchTerm=${e(q)}` },
  { id: "kroger", label: "Kroger", button: "Kroger", name: "Kroger", url: (q) => `https://www.kroger.com/search?query=${e(q)}` },
  { id: "costco", label: "Costco", button: "Costco", name: "Costco", url: (q) => `https://www.costco.com/CatalogSearch?keyword=${e(q)}` },
  { id: "samsclub", label: "Sam's Club", button: "Sam's", name: "Sam's Club", url: (q) => `https://www.samsclub.com/s/${e(q)}` },
  { id: "aldi", label: "Aldi", button: "Aldi", name: "Aldi", url: (q) => `https://www.aldi.us/results?q=${e(q)}` },
  { id: "publix", label: "Publix", button: "Publix", name: "Publix", url: (q) => `https://www.publix.com/search?searchTerm=${e(q)}` },
  { id: "wholefoods", label: "Whole Foods", button: "Whole Foods", name: "Whole Foods", url: (q) => `https://www.wholefoodsmarket.com/search?text=${e(q)}` },
  { id: "amazon", label: "Amazon Fresh", button: "Amazon", name: "Amazon", url: (q) => `https://www.amazon.com/s?k=${e(q)}&i=amazonfresh` },
  { id: "instacart", label: "Instacart", button: "Instacart", name: "Instacart", url: (q) => `https://www.instacart.com/store/s?k=${e(q)}` },
];
export const storeInfo = (id: string): StoreInfo => STORE_LIST.find((s) => s.id === id) ?? STORE_LIST[0];

/** The ingredient's name as a store search: notes like "(for topping)" or "to taste" left out. */
export function searchQuery(name: string): string {
  return name
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(for (serving|topping|garnish)|to taste|optional|divided)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export const storeSearchUrl = (id: string, name: string) => storeInfo(id).url(searchQuery(name));

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* this visit only */
  }
};

const STORE_KEY = "recipe-builder.store";
/** The store the shopping list's buttons search (synced). */
export const getStore = (): string => (STORE_LIST.some((s) => s.id === get(STORE_KEY)) ? get(STORE_KEY)! : "walmart");
export const setStore = (id: string) => set(STORE_KEY, id);

/** Up to three pinned stores, shown first in the menu (synced). */
export const MAX_FAVORITES = 3;
const FAV_KEY = "recipe-builder.storeFavorites";
export function favoriteStores(): string[] {
  try {
    const v = JSON.parse(get(FAV_KEY) ?? "null") as string[] | null;
    if (Array.isArray(v)) return v.filter((id) => STORE_LIST.some((s) => s.id === id)).slice(0, MAX_FAVORITES);
  } catch {
    /* default */
  }
  return ["walmart", "heb"];
}
export function setFavoriteStores(ids: string[]): void {
  set(FAV_KEY, JSON.stringify(ids.slice(0, MAX_FAVORITES)));
}

/** Store names prices can be kept under: the known ones, plus any others already used. */
export const STORE_NAMES = [...new Set(STORE_LIST.map((s) => s.name))];

/**
 * A receipt's store as a plain name: "WAL-MART SUPERCENTER #123" → "Walmart",
 * "H-E-B plus!" → "H-E-B". Unknown stores keep their own name, tidied.
 */
export function normalizeStore(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const k = t.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const known: [RegExp, string][] = [
    [/\bwal ?mart\b/, "Walmart"],
    [/\bh ?e ?b\b/, "H-E-B"],
    [/\btarget\b/, "Target"],
    [/\bkroger\b/, "Kroger"],
    [/\bcostco\b/, "Costco"],
    [/\bsam s club\b|\bsams club\b/, "Sam's Club"],
    [/\baldi\b/, "Aldi"],
    [/\bpublix\b/, "Publix"],
    [/\bwhole foods\b/, "Whole Foods"],
    [/\bamazon\b/, "Amazon"],
    [/\binstacart\b/, "Instacart"],
  ];
  for (const [re, name] of known) if (re.test(k)) return name;
  return t
    .replace(/\s*#\s*\d+.*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}
