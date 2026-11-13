import { formatQty, parseQty, type Qty } from "./qty";

/**
 * Package sizes from barcodes. Many receipts (Walmart and others) print the
 * item's barcode number (UPC/EAN) next to it; Open Food Facts — a free, open
 * product database — knows the package size for most branded foods. Only the
 * number is sent. Warehouse stores print their own short item numbers
 * (Costco, Sam's Club), which mean nothing outside the store: those aren't
 * looked up.
 */

/** UPC-A check digit for 11 digits (receipts often leave it off). */
function upcCheckDigit(d11: string): string {
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(d11[i]) * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

/** A barcode worth looking up (8, 12 or 13 digits; 11 gets its check digit), or null for store-only numbers. */
export function normalizeBarcode(code: string | null | undefined): string | null {
  const d = (code ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11) return d + upcCheckDigit(d);
  if (d.length === 8 || d.length === 12 || d.length === 13) return d;
  if (d.length === 14 && d.startsWith("0")) return d.slice(1);
  return null;
}

const CACHE_KEY = "recipe-builder.barcodeSizes";
function cache(): Record<string, string | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, string | null>;
  } catch {
    return {};
  }
}
function remember(code: string, quantity: string | null) {
  try {
    const c = cache();
    c[code] = quantity;
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* fine */
  }
}

/** The package size printed for a barcode ("14.5 oz (411 g)"), or null if unknown. Remembers answers. */
export async function barcodeQuantity(code: string): Promise<string | null> {
  const c = cache();
  if (code in c) return c[code];
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=quantity,product_quantity,product_quantity_unit`, {
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      if (res.status === 404) remember(code, null);
      return null;
    }
    const j = (await res.json()) as { status?: number; product?: { quantity?: string; product_quantity?: number | string; product_quantity_unit?: string } };
    const p = j.product;
    const q = p?.quantity?.trim() || (p?.product_quantity ? `${p.product_quantity} ${p.product_quantity_unit ?? "g"}` : "");
    remember(code, q || null);
    return q || null;
  } catch {
    return null; // offline or blocked: try again next time
  }
}

/** A size without rounding away what matters for price per oz: "14.5 oz", "1.25 lb", "33.8 fl oz". */
function exactSize(q: Qty): string {
  const trim = (n: number) => String(Math.round(n * 100) / 100);
  if (q.kind === "weight") {
    const oz = q.g / 28.3495;
    return oz >= 48 ? `${trim(oz / 16)} lb` : `${trim(oz)} oz`; // packaged goods read in oz up to 3 lb
  }
  if (q.kind === "volume") return `${trim(q.tsp / 6)} fl oz`;
  return formatQty(q);
}

/** The size for a receipt line from the barcode's package size × how many were bought: "29 oz (2 × 14.5 oz)". */
export function sizeFromPackage(packageQty: string, count: number, name = ""): string | null {
  const one = parseQty(packageQty, name);
  if (!one) return null;
  const n = count > 1 ? Math.round(count) : 1;
  if (n === 1) return exactSize(one);
  const total: Qty =
    one.kind === "weight" ? { kind: "weight", g: one.g * n }
    : one.kind === "volume" ? { kind: "volume", tsp: one.tsp * n }
    : { ...one, n: one.n * n };
  return `${exactSize(total)} (${n} × ${exactSize(one)})`;
}
