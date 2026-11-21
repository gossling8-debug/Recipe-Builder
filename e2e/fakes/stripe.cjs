// A stand-in for Stripe, for the click-through tests: the API calls the server makes, test
// versions of Stripe's checkout page and billing portal, and signed webhook messages sent to
// the server's stripeWebhook function, as real Stripe does. Nothing here talks to Stripe.
//
//   PORT                (default 43200)
//   STRIPE_WEBHOOK_URL  where to send webhook messages (the functions emulator)
//   STRIPE_WEBHOOK_SECRET  signs them (must match the functions' STRIPE_WEBHOOK_SECRET)
//
// Test controls: GET /test/decline?on=1 (declines the next charge), GET /test/charges (amounts charged, in cents).
const http = require("http");
const crypto = require("crypto");
const qs = require(require.resolve("qs", { paths: [__dirname + "/../../functions"] }));

const PORT = Number(process.env.PORT || 43200);
const BASE = `http://127.0.0.1:${PORT}`;
const HOOK = process.env.STRIPE_WEBHOOK_URL || "http://127.0.0.1:5001/demo-recipe-builder/us-central1/stripeWebhook";
const HOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test";

const S = { customers: {}, prices: {}, sessions: {}, subs: {}, portalConfigs: [], charges: [], decline: false };
let n = 0;
const id = (p) => `${p}_${++n}`;
const now = () => Math.floor(Date.now() / 1000);
const DAY = 86400;
const list = (data) => ({ object: "list", data, has_more: false });
const sub = (s) => ({ ...s, object: "subscription", items: { object: "list", data: [{ id: s.itemId, price: S.prices[s.price], current_period_end: s.current_period_end }] } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Sends a webhook message signed the way Stripe signs them (t=…,v1=HMAC-SHA256). */
async function send(type, object) {
  const payload = JSON.stringify({ id: id("evt"), object: "event", type, created: now(), data: { object } });
  const t = now();
  const v1 = crypto.createHmac("sha256", HOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  try {
    const r = await fetch(HOOK, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${v1}` }, body: payload });
    log("  webhook", type, "→", r.status);
  } catch (e) {
    log("  webhook", type, "failed:", e.message);
  }
}

/** Like Stripe's proration: credit the unused part of the old price, charge the rest of the period at the new one. */
function prorate(s, newPrice, at) {
  const o = S.prices[s.price], nw = S.prices[newPrice];
  const len = (o.recurring.interval === "year" ? 365 : 30) * DAY;
  const left = Math.max(0, s.current_period_end - at) / len;
  if (o.recurring.interval !== nw.recurring.interval) return Math.round(nw.unit_amount - o.unit_amount * left); // a new period starts now
  return Math.round((nw.unit_amount - o.unit_amount) * left);
}

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const u = new URL(req.url, BASE);
      const q = { ...qs.parse(u.search.slice(1)), ...qs.parse(body) };
      const json = (o, code = 200) => (res.writeHead(code, { "content-type": "application/json" }), res.end(JSON.stringify(o)));
      const html = (h) => (res.writeHead(200, { "content-type": "text/html; charset=utf-8" }), res.end(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:20px">${h}`));
      const go = (to) => (res.writeHead(303, { location: to }), res.end());
      const p = u.pathname, m = req.method;
      let mm;
      log(m, p);

      // --- the API the server uses ---
      if (p === "/v1/customers" && m === "POST") { const c = { id: id("cus"), email: q.email }; S.customers[c.id] = c; return json(c); }
      if (p === "/v1/prices" && m === "GET") { const keys = [].concat(q.lookup_keys ?? []); return json(list(Object.values(S.prices).filter((x) => keys.includes(x.lookup_key)))); }
      if (p === "/v1/products" && m === "POST") return json({ id: id("prod"), name: q.name });
      if (p === "/v1/prices" && m === "POST") { const x = { id: id("price"), unit_amount: Number(q.unit_amount), lookup_key: q.lookup_key, recurring: { interval: q.recurring.interval } }; S.prices[x.id] = x; return json(x); }
      if (p === "/v1/checkout/sessions" && m === "POST") { const x = { id: id("cs"), customer: q.customer, price: q.line_items[0].price, success_url: q.success_url, cancel_url: q.cancel_url }; x.url = `${BASE}/pay/${x.id}`; S.sessions[x.id] = x; return json(x); }
      if (p === "/v1/subscriptions" && m === "GET") return json(list(Object.values(S.subs).filter((s) => s.customer === q.customer).map(sub)));
      if (p === "/v1/invoices/create_preview" && m === "POST") {
        const s = S.subs[q.subscription], d = q.subscription_details;
        return json({ object: "invoice", amount_due: Math.max(0, prorate(s, d.items[0].price, Number(d.proration_date))), currency: "usd" });
      }
      if ((mm = p.match(/^\/v1\/subscriptions\/([^/]+)$/))) {
        const s = S.subs[mm[1]];
        if (!s) return json({ error: { message: "No such subscription" } }, 404);
        if (m === "POST" && q.items) {
          const amount = prorate(s, q.items[0].price, Number(q.proration_date ?? now()));
          if (S.decline && q.payment_behavior === "pending_if_incomplete") return json({ ...sub(s), pending_update: { expires_at: now() + 3600 } });
          S.charges.push(amount);
          if (S.prices[s.price].recurring.interval !== S.prices[q.items[0].price].recurring.interval)
            s.current_period_end = now() + (S.prices[q.items[0].price].recurring.interval === "year" ? 365 : 30) * DAY;
          s.price = q.items[0].price;
          void send("customer.subscription.updated", sub(s));
        }
        if (m === "DELETE") { s.status = "canceled"; void send("customer.subscription.deleted", sub(s)); }
        return json(sub(s));
      }
      if (p === "/v1/billing_portal/configurations" && m === "GET") return json(list(S.portalConfigs));
      if (p === "/v1/billing_portal/configurations" && m === "POST") { const c = { id: id("bpc") }; S.portalConfigs.push(c); return json(c); }
      if (p === "/v1/billing_portal/sessions" && m === "POST") return json({ id: id("bps"), url: `${BASE}/portal/${q.customer}?back=${encodeURIComponent(q.return_url)}` });

      // --- test versions of Stripe's own pages ---
      if ((mm = p.match(/^\/pay\/([^/]+)$/))) {
        const x = S.sessions[mm[1]], pr = S.prices[x.price];
        if (m === "GET") return html(`<h1>Test checkout</h1><p id=price>${pr.lookup_key}: $${(pr.unit_amount / 100).toFixed(2)}/${pr.recurring.interval}</p><form method=post><button>Pay</button></form><a href="${x.cancel_url}">Back</a>`);
        // Bought 10 days ago (monthly) or about 4 months ago (yearly), so moving up has a prorated difference.
        const s = { id: id("sub"), itemId: id("si"), customer: x.customer, price: x.price, status: "active", cancel_at_period_end: false, cancel_at: null, current_period_end: now() + (pr.recurring.interval === "year" ? 245 : 20) * DAY };
        S.subs[s.id] = s;
        S.charges.push(pr.unit_amount);
        await send("customer.subscription.created", sub(s));
        return go(x.success_url);
      }
      if ((mm = p.match(/^\/portal\/([^/]+)$/))) {
        const live = Object.values(S.subs).find((s) => s.customer === mm[1] && s.status !== "canceled");
        if (m === "GET")
          return html(`<h1>Test billing portal</h1><p id=state>${live ? `${S.prices[live.price].lookup_key} · ${live.status} · ${live.cancel_at_period_end ? "cancels at period end" : "renews"}` : "no plan"}</p>
            <form method=post><button name=do value=cancel>Cancel plan</button> <button name=do value=end>Period ends now</button> <button name=do value=pastdue>Card fails</button></form>
            <a id=back href="${u.searchParams.get("back")}">Return to Cardamix</a>`);
        if (live && q.do === "cancel") { live.cancel_at_period_end = true; live.cancel_at = live.current_period_end; await send("customer.subscription.updated", sub(live)); }
        if (live && q.do === "pastdue") { live.status = "past_due"; await send("invoice.payment_failed", { object: "invoice", customer: live.customer, subscription: live.id }); }
        if (live && q.do === "end") { live.status = "canceled"; await send("customer.subscription.deleted", sub(live)); }
        return go(req.url);
      }

      // --- test controls ---
      if (p === "/test/decline") { S.decline = u.searchParams.get("on") === "1"; return json({ decline: S.decline }); }
      if (p === "/test/charges") return json(S.charges);
      if (p === "/test/end") {
        // The subscription ends with no one in the app (e.g. the period ran out): only the webhook tells the server.
        const live = Object.values(S.subs).find((s) => s.customer === u.searchParams.get("customer") && s.status !== "canceled");
        if (live) { live.status = "canceled"; await send("customer.subscription.deleted", sub(live)); }
        return json({ ended: !!live });
      }
      json({ error: { message: `test Stripe: no route for ${m} ${p}` } }, 404);
    });
  })
  .listen(PORT, "127.0.0.1", () => log(`test Stripe on ${PORT}`));
