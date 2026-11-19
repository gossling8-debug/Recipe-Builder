import { useEffect, useState } from "react";
import Header from "./Header";
import Icon from "./Icon";
import { cloudState } from "../lib/cloud";
import { myCookbooks } from "../lib/family";
import { href, navigate } from "../lib/route";
import { shareText } from "../lib/share";
import { getSharedList, inviteLink, joinSharedList, leaveSharedList, sharedListId, startSharing, type SharedList } from "../lib/sharedShopping";
import { Loading } from "./LogoLoader";
import { PasteInvite } from "./PasteInvite";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The name you go by in your cookbooks, to fill in. */
async function myUsualName(): Promise<string> {
  const uid = cloudState().uid;
  const books = await myCookbooks().catch(() => []);
  return (uid && books.map((b) => b.names[uid]).find(Boolean)) || "";
}

async function sendInvite(id: string, toast: (m: string) => void) {
  const r = await shareText("Our shopping list", `Shop together on Cardamix — open this to join our shopping list:\n${inviteLink(id)}`);
  if (r === "copied") toast("Invite link copied — send it to them");
  if (r === "failed") toast("Sharing isn't available here — copy the link from the address bar instead");
}

/**
 * On the shopping list: "Shop together" — share it live (an invite link), see
 * who it's shared with, invite more, or stop sharing.
 */
export function SharedListCard({ list, toast }: { list: SharedList | null; toast: (m: string) => void }) {
  const id = sharedListId();
  const uid = cloudState().uid;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open && !name) void myUsualName().then((n) => n && setName(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!uid) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  };

  if (id) {
    const others = (list?.members ?? []).filter((m) => m !== uid).map((m) => list?.names[m] ?? "someone");
    return (
      <div className="plan-card shared-list-card">
        <p className="small">
          <Icon name="share" size={16} />{" "}
          {others.length ? (
            <>
              <strong>Shared with {others.join(", ")}</strong> — you both see the same list, live. What you tick goes into your own
              pantry and budget.
            </>
          ) : (
            <>
              <strong>Shared list</strong> — nobody has joined yet. Send them the invite link.
            </>
          )}
        </p>
        <div className="button-row">
          <button className="btn" disabled={busy} onClick={() => void sendInvite(id, toast)}>
            Invite someone
          </button>
          <button
            className="link-btn small"
            disabled={busy}
            onClick={() =>
              confirm("Stop sharing this list? You'll keep a copy of everything on it; the others keep theirs.") &&
              void run(async () => {
                await leaveSharedList();
                toast("Stopped sharing — the list is yours alone again");
              })
            }
          >
            Stop sharing
          </button>
        </div>
        {error && <div className="callout error small">{error}</div>}
      </div>
    );
  }

  return (
    <div className="plan-card shared-list-card">
      {!open ? (
        <>
          <button className="link-btn small" onClick={() => setOpen(true)}>
            <Icon name="share" size={16} /> Shop together — share this list live
          </button>
          <PasteInvite what="a shopping list" />
        </>
      ) : (
        <>
          <p className="small">
            <strong>Shop together.</strong> Share this list with someone you shop with: you both see the same list, and what either of
            you adds or ticks off shows up for the other right away. You each keep your own account, recipes, pantry and budget.
          </p>
          <label className="field">
            <span>Your name, as they'll see it</span>
            <input className="text-input" value={name} maxLength={40} placeholder="e.g. Sam" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="button-row">
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await startSharing(name);
                  const nowId = sharedListId();
                  if (nowId) await sendInvite(nowId, toast);
                })
              }
            >
              {busy ? "Starting…" : "Share & send invite"}
            </button>
            <button className="link-btn small" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <p className="muted small">They'll see the ingredients on this list and your name — nothing else from your recipes.</p>
        </>
      )}
      {error && <div className="callout error small">{error}</div>}
    </div>
  );
}

/** Opening an invite link: join someone's shopping list. */
export function ShopJoinPage({ id }: { id: string }) {
  const uid = cloudState().uid;
  const [list, setList] = useState<SharedList | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = sharedListId();

  useEffect(() => {
    getSharedList(id).then(setList, () => setList(null));
    void myUsualName().then((n) => n && setName(n));
  }, [id]);
  useEffect(() => {
    if (list && uid && list.members.includes(uid) && current === id) navigate({ name: "shopping" }, true);
  }, [list, uid, current, id]);

  async function join() {
    if (!list) return;
    setBusy(true);
    setError("");
    try {
      if (current && current !== id) await leaveSharedList();
      await joinSharedList(list, name);
      navigate({ name: "shopping" }, true);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  const names = list ? list.members.map((m) => list.names[m] ?? "someone") : [];
  return (
    <>
      <Header title="Shop together" back={href({ name: "shopping" })} />
      <main className="page">
        {list === undefined && <Loading text="Opening invite…" />}
        {list === null && <div className="callout error">This invite link doesn't work — the list may have been stopped. Ask for a new link.</div>}
        {list && (
          <div className="plan-card">
            <p>
              <strong>{names.join(" and ")}</strong> {names.length === 1 ? "invited" : "invite"} you to share a shopping list.
            </p>
            <p className="muted small">
              You'll both see the same list, live. Your recipes on your list now join it too. You keep your own account, recipes, pantry and
              budget — what you tick off goes into yours.
            </p>
            {current && current !== id && <div className="callout small">You're already sharing another list. Joining this one stops that (you keep a copy).</div>}
            <label className="field">
              <span>Your name, as they'll see it</span>
              <input className="text-input" value={name} maxLength={40} placeholder="e.g. Alex" onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="button-row">
              <button className="btn primary" disabled={busy} onClick={join}>
                {busy ? "Joining…" : "Join shopping list"}
              </button>
            </div>
          </div>
        )}
        {error && <div className="callout error">{error}</div>}
      </main>
    </>
  );
}
