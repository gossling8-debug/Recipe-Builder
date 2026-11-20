/**
 * Lulu's Print API (print-on-demand books). Lulu prints and posts each book.
 *
 * Settings (environment / secrets):
 *   LULU_CLIENT_KEY, LULU_CLIENT_SECRET — from Lulu's developer portal (secrets)
 *   LULU_ENV       — "sandbox" (test orders, nothing printed) or "production"
 *   LULU_BASE_URL  — tests only: a stand-in server
 *
 * POD_PACKAGE: the product (trim, colour, binding, paper, finish). To confirm
 * against Lulu's product list in sandbox before going live.
 */
export const POD_PACKAGE = "0850X1100FCPRECW080CW444GXX"; // 8.5×11 in, premium full colour, casewrap hardcover, 80# coated white, gloss
export const SHIPPING = ["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"];

export function luluBase(env = process.env) {
  if (env.LULU_BASE_URL) return env.LULU_BASE_URL.replace(/\/$/, "");
  return env.LULU_ENV === "production" ? "https://api.lulu.com" : "https://api.sandbox.lulu.com";
}

let token = null; // { value, until }
async function accessToken(key, secret, base) {
  if (token && token.until > Date.now() + 60_000 && token.base === base) return token.value;
  const res = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}` },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Lulu sign-in failed (${res.status})`);
  const j = await res.json();
  token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 300) * 1000, base };
  return token.value;
}

/** A client for Lulu with these credentials. */
export function lulu({ key, secret, base = luluBase() }) {
  const call = async (method, path, body) => {
    const t = await accessToken(key, secret, base);
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json", "cache-control": "no-cache" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const e = new Error(`Lulu ${path} failed (${res.status})`);
      e.status = res.status;
      e.detail = json ?? text.slice(0, 500);
      throw e;
    }
    return json;
  };
  return {
    /** The cover's full size in points (wrap and bleed included) for a page count. */
    coverSize: async (pages) => {
      const d = await call("POST", "/cover-dimensions/", { pod_package_id: POD_PACKAGE, interior_page_count: pages, unit: "pt" });
      return { width: Number(d.width), height: Number(d.height) };
    },
    /** What Lulu charges us to print and post one copy. */
    cost: async (pages, address, shipping) => {
      const d = await call("POST", "/print-job-cost-calculations/", {
        line_items: [{ page_count: pages, pod_package_id: POD_PACKAGE, quantity: 1 }],
        shipping_address: address,
        shipping_option: shipping,
      });
      return {
        print: Number(d.line_item_costs?.[0]?.total_cost_excl_tax ?? 0),
        shipping: Number(d.shipping_cost?.total_cost_excl_tax ?? 0),
        fulfillment: Number(d.fulfillment_cost?.total_cost_excl_tax ?? 0),
        tax: Number(d.total_tax ?? 0),
        total: Number(d.total_cost_incl_tax ?? 0),
        currency: d.currency ?? "USD",
      };
    },
    /** Orders the book; Lulu fetches the two PDFs from these addresses. */
    print: (o) =>
      call("POST", "/print-jobs/", {
        external_id: o.externalId,
        contact_email: o.email,
        shipping_level: o.shipping,
        shipping_address: o.address,
        line_items: [{ external_id: o.externalId, title: o.title.slice(0, 255), quantity: 1, printable_normalization: { pod_package_id: POD_PACKAGE, interior: { source_url: o.interiorUrl }, cover: { source_url: o.coverUrl } } }],
      }),
    status: (id) => call("GET", `/print-jobs/${encodeURIComponent(id)}/`),
  };
}

/** The address Lulu needs, from what the app sends (checked, trimmed). */
export function luluAddress(a) {
  const s = (v, n) => String(v ?? "").trim().slice(0, n);
  const out = {
    name: s(a?.name, 80),
    street1: s(a?.street1, 100),
    street2: s(a?.street2, 100) || undefined,
    city: s(a?.city, 60),
    state_code: s(a?.state, 3).toUpperCase(),
    postcode: s(a?.postcode, 12),
    country_code: "US",
    phone_number: s(a?.phone, 20),
  };
  if (!out.street2) delete out.street2; // no empty fields (the database refuses "undefined")
  const missing = ["name", "street1", "city", "state_code", "postcode", "phone_number"].filter((k) => !out[k]);
  if (missing.length) throw new Error("Fill in the whole delivery address, including a phone number for the carrier.");
  if (!/^[A-Z]{2}$/.test(out.state_code)) throw new Error("Use the 2-letter state code, e.g. TX.");
  if (!/^\d{5}(-\d{4})?$/.test(out.postcode)) throw new Error("That ZIP code doesn't look right.");
  return out;
}

/** What we charge: the book, plus shipping at what Lulu charges (rounded up to the cent). */
export const BOOK_PRICE_CENTS = 4999;
// (Rounded to a hundredth of a cent first, so 6.99 + 1.05 is 804 cents, not 805.)
export const toCentsUp = (dollars) => Math.ceil(Math.round(Math.max(0, dollars) * 10000) / 100);
export const chargeCents = (shippingDollars) => BOOK_PRICE_CENTS + toCentsUp(shippingDollars);
