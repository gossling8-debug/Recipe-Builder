/**
 * The database security rules (firestore.rules) are what keep one person's data
 * from another's, and keep anyone from giving themselves a paid plan or admin rights.
 * Each test is one rule that must hold; see docs/INVARIANTS.md.
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, query, setDoc, updateDoc, where, writeBatch, Timestamp } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const alice = () => env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).firestore();
const bob = () => env.authenticatedContext("bob", { email: "bob@example.com", email_verified: true }).firestore();
const nobody = () => env.unauthenticatedContext().firestore();
/** Writes as the server would (rules don't apply). */
const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data));

describe("your own recipes", () => {
  it("only you can read and write them", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/recipes/r1"), { title: "Chili" }));
    await assertSucceeds(getDoc(doc(alice(), "users/alice/recipes/r1")));
    await assertFails(getDoc(doc(bob(), "users/alice/recipes/r1")));
    await assertFails(setDoc(doc(bob(), "users/alice/recipes/r2"), { title: "Planted" }));
    await assertFails(getDoc(doc(nobody(), "users/alice/recipes/r1")));
  });
});

describe("plans, payments and admin rights: written only by the server", () => {
  it("nobody can give themselves a paid plan", async () => {
    await assertFails(setDoc(doc(alice(), "plans/alice"), { plan: "family", source: "stripe" }));
    await seed("plans/alice", { plan: "free", source: "none" });
    await assertFails(updateDoc(doc(alice(), "plans/alice"), { plan: "plus" }));
    await assertSucceeds(getDoc(doc(alice(), "plans/alice")));
    await assertFails(getDoc(doc(bob(), "plans/alice")));
  });
  it("nobody can make themselves an admin", async () => {
    await assertFails(setDoc(doc(alice(), "admins/alice"), {}));
    await seed("admins/alice", {});
    await assertSucceeds(getDoc(doc(alice(), "admins/alice")));
    await assertFails(getDoc(doc(bob(), "admins/alice")));
  });
  it("Stripe customer records can't be read or written at all", async () => {
    await seed("customers/alice", { stripeId: "cus_1" });
    await assertFails(getDoc(doc(alice(), "customers/alice")));
    await assertFails(setDoc(doc(alice(), "customers/alice"), { stripeId: "cus_other" }));
  });
  it("nobody can raise their own AI allowance; only you (or your household) can see yours", async () => {
    await seed("aiUsage/alice", { month: "2026-11", spent: 1 });
    await assertFails(updateDoc(doc(alice(), "aiUsage/alice"), { spent: 0 }));
    await assertSucceeds(getDoc(doc(alice(), "aiUsage/alice")));
    await assertFails(getDoc(doc(bob(), "aiUsage/alice")));
    await seed("households/alice", { owner: "alice", members: ["alice", "bob"] });
    await seed("aiUsage/household_alice", { month: "2026-11", spent: 2 });
    await assertSucceeds(getDoc(doc(bob(), "aiUsage/household_alice")));
    await assertFails(getDoc(doc(env.authenticatedContext("carol").firestore(), "aiUsage/household_alice")));
  });
  it("households: members read theirs; nobody can add themselves", async () => {
    await seed("households/alice", { owner: "alice", members: ["alice"] });
    await assertFails(updateDoc(doc(bob(), "households/alice"), { members: ["alice", "bob"] }));
    await assertFails(getDoc(doc(bob(), "households/alice")));
    await assertSucceeds(getDoc(doc(alice(), "households/alice")));
  });
  it("printed-book orders: only yours, and only the server writes them", async () => {
    await seed("bookOrders/o1", { uid: "alice", status: "paid" });
    await assertSucceeds(getDoc(doc(alice(), "bookOrders/o1")));
    await assertFails(getDoc(doc(bob(), "bookOrders/o1")));
    await assertFails(updateDoc(doc(alice(), "bookOrders/o1"), { status: "shipped" }));
  });
  it("app settings: everyone reads config/app; other config (e.g. Lulu keys) stays hidden", async () => {
    await seed("config/app", { animatedLogo: true });
    await seed("config/lulu", { key: "secret" });
    await assertSucceeds(getDoc(doc(nobody(), "config/app")));
    await assertFails(getDoc(doc(alice(), "config/lulu")));
    await assertFails(setDoc(doc(alice(), "config/app"), { animatedLogo: false }));
  });
});

describe("owner dashboard data", () => {
  it("upgrade steps: you write only your own, only known steps as times, and nobody reads them", async () => {
    await assertSucceeds(setDoc(doc(alice(), "funnel/alice"), { cardSeen: 1 }, { merge: true }));
    await assertFails(setDoc(doc(alice(), "funnel/alice"), { cardSeen: "yesterday" }));
    await assertFails(setDoc(doc(alice(), "funnel/alice"), { email: "alice@example.com" }));
    await assertFails(setDoc(doc(bob(), "funnel/alice"), { cardSeen: 1 }));
    await assertFails(getDoc(doc(alice(), "funnel/alice")));
  });
  it("App Check counts: only the server writes them, and nobody in the app reads them", async () => {
    await assertFails(setDoc(doc(alice(), "appCheckStats/2026-11-22"), { ai: { verified: 999 } }));
    await assertFails(getDoc(doc(alice(), "appCheckStats/2026-11-22")));
    await assertFails(getDoc(doc(nobody(), "appCheckStats/2026-11-22")));
  });
  it("error reports: anyone signed in adds a short one; only admins read them", async () => {
    const report = { message: "x", stack: "", screen: "library", where: null, app: "1", device: "phone", at: 1, expireAt: Timestamp.fromMillis(Date.now() + 86_400_000) };
    await assertSucceeds(setDoc(doc(alice(), "errors/e1"), report));
    await assertFails(setDoc(doc(alice(), "errors/e2"), { ...report, recipe: "private text" }));
    await assertFails(setDoc(doc(alice(), "errors/e3"), { ...report, message: "x".repeat(301) }));
    await assertFails(getDoc(doc(alice(), "errors/e1")));
    await seed("admins/bob", {});
    await assertSucceeds(getDoc(doc(bob(), "errors/e1")));
  });
});

describe("The Mix", () => {
  const recipe = { recipe: { title: "Soup" }, sourceUrl: null, byName: "Alice", anonymous: false, at: 1, updatedAt: 1, ratingSum: 0, ratingCount: 0, reportCount: 0 };
  const publish = (db: ReturnType<typeof alice>, id: string, uid: string, data = recipe) => {
    const b = writeBatch(db);
    b.set(doc(db, `mix/${id}`), data);
    b.set(doc(db, `mixOwners/${id}`), { uid, recipeId: "r1" });
    return b.commit();
  };
  it("publishing claims ownership in the same write; nobody can fake ratings", async () => {
    await assertSucceeds(publish(alice(), "m1", "alice"));
    await assertFails(publish(alice(), "m2", "alice", { ...recipe, ratingSum: 50, ratingCount: 10 }));
    await assertFails(publish(alice(), "m3", "bob")); // claiming it for someone else
  });
  it("only the publisher edits; who published an anonymous recipe stays private", async () => {
    await publish(alice(), "m1", "alice");
    await assertFails(updateDoc(doc(bob(), "mix/m1"), { byName: "Bob" }));
    await assertSucceeds(updateDoc(doc(alice(), "mix/m1"), { byName: "A.", updatedAt: 2 }));
    await assertFails(updateDoc(doc(alice(), "mix/m1"), { ratingSum: 99 }));
    await assertFails(getDoc(doc(bob(), "mixOwners/m1")));
  });
  it("someone blocked after copyright notices can't publish", async () => {
    await seed("mixBlocked/alice", { at: 1 });
    await assertFails(publish(alice(), "m1", "alice"));
  });
  it("votes are private and written only by the server", async () => {
    await seed("mixVotes/m1_alice", { uid: "alice", stars: 5 });
    await assertFails(getDoc(doc(bob(), "mixVotes/m1_alice")));
    await assertFails(setDoc(doc(alice(), "mixVotes/m1_alice"), { uid: "alice", stars: 1 }));
  });
});

describe("cookbooks", () => {
  beforeEach(() => seed("cookbooks/b1", { name: "Family", owner: "alice", members: ["alice"], names: { alice: "Alice" }, createdAt: 1 }));
  it("you can join by adding yourself, never someone else", async () => {
    await assertFails(updateDoc(doc(bob(), "cookbooks/b1"), { members: ["alice", "bob", "carol"], names: { alice: "Alice", bob: "Bob" } }));
    await assertSucceeds(updateDoc(doc(bob(), "cookbooks/b1"), { members: ["alice", "bob"], names: { alice: "Alice", bob: "Bob" } }));
  });
  it("only members read its recipes, and nobody shares under someone else's name", async () => {
    await seed("cookbooks/b1/recipes/alice_r1", { sharedBy: "alice", sharedByName: "Alice", recipe: { title: "Pie" } });
    await assertFails(getDoc(doc(bob(), "cookbooks/b1/recipes/alice_r1")));
    await seed("cookbooks/b1", { name: "Family", owner: "alice", members: ["alice", "bob"], names: { alice: "Alice", bob: "Bob" }, createdAt: 1 });
    await assertSucceeds(getDoc(doc(bob(), "cookbooks/b1/recipes/alice_r1")));
    await assertFails(setDoc(doc(bob(), "cookbooks/b1/recipes/bob_r2"), { sharedBy: "bob", sharedByName: "Alice", recipe: { title: "Fake" } }));
    await assertFails(setDoc(doc(bob(), "cookbooks/b1/recipes/alice_r3"), { sharedBy: "alice", sharedByName: "Alice", recipe: { title: "Fake" } }));
    await assertSucceeds(setDoc(doc(bob(), "cookbooks/b1/recipes/bob_r4"), { sharedBy: "bob", sharedByName: "Bob", recipe: { title: "Bread" } }));
  });
  it("only the owner deletes it", async () => {
    await seed("cookbooks/b1", { name: "Family", owner: "alice", members: ["alice", "bob"], names: { alice: "Alice", bob: "Bob" }, createdAt: 1 });
    await assertFails(deleteDoc(doc(bob(), "cookbooks/b1")));
    await assertSucceeds(deleteDoc(doc(alice(), "cookbooks/b1")));
  });
});

describe("shared shopping lists and invites", () => {
  beforeEach(() => seed("shoppingLists/l1", { owner: "alice", members: ["alice"], names: { alice: "Alice" }, createdAt: 1 }));
  it("only people on the list read or add to it", async () => {
    await assertFails(getDocs(collection(bob(), "shoppingLists/l1/entries")));
    await assertFails(setDoc(doc(bob(), "shoppingLists/l1/entries/bob_e1"), { title: "x", scale: 1, ingredients: [], sourceId: "s", addedBy: "bob", addedByName: "Bob", at: 1 }));
    await assertSucceeds(setDoc(doc(alice(), "shoppingLists/l1/entries/alice_e1"), { title: "x", scale: 1, ingredients: [], sourceId: "s", addedBy: "alice", addedByName: "Alice", at: 1 }));
  });
  it("invites: only a member can invite to a list, and only the sender and the invited person see it", async () => {
    const invite = { kind: "shop", target: "l1", email: "carol@example.com", fromUid: "bob", fromName: "Bob", title: "List", at: 1 };
    await assertFails(setDoc(doc(bob(), "invites/i1"), invite));
    await assertSucceeds(setDoc(doc(alice(), "invites/i2"), { ...invite, fromUid: "alice", fromName: "Alice" }));
    const carol = env.authenticatedContext("carol", { email: "carol@example.com", email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(carol, "invites/i2")));
    await assertFails(getDoc(doc(bob(), "invites/i2")));
    // Someone who hasn't confirmed that email can't pick it up.
    const fake = env.authenticatedContext("mallory", { email: "carol@example.com", email_verified: false }).firestore();
    await assertFails(getDocs(query(collection(fake, "invites"), where("email", "==", "carol@example.com"))));
  });
});

describe("anything not listed is closed", () => {
  it("an unknown collection can't be read or written", async () => {
    await assertFails(setDoc(doc(alice(), "anything/x"), { a: 1 }));
    await assertFails(getDoc(doc(alice(), "anything/x")));
  });
});
